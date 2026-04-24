import json
import os
from typing import Any, Iterator, Optional

from google import genai
from google.genai import types
from pydantic import ValidationError

from backend.models import Node
from backend.prompts import EXPLAIN_SYSTEM_PROMPT, EXTRACTION_SYSTEM_PROMPT

MODEL = "gemini-2.5-flash"
MAX_DEPTH = 4
EXPLAIN_SPAN_CHARS = 12000
EXPLAIN_FALLBACK_CHARS = 8000

_client: Optional[genai.Client] = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. Add it to your .env or shell environment."
            )
        _client = genai.Client(api_key=api_key)
    return _client


def extract_hierarchy(bill_text: str) -> Node:
    client = _get_client()
    # NOTE: We intentionally do NOT pass ``response_schema=Node`` here.
    # Gemini's structured-output mode mishandles recursive Pydantic
    # schemas at depth (it serializes deeply-nested children as JSON-
    # fragment strings), which both crashes validation and forces the
    # salvage layer to drop subtrees. Plain JSON mode + the explicit
    # shape in EXTRACTION_SYSTEM_PROMPT yields richer, well-formed
    # trees for recursive types.
    config = types.GenerateContentConfig(
        system_instruction=EXTRACTION_SYSTEM_PROMPT,
        response_mime_type="application/json",
    )
    response = client.models.generate_content(
        model=MODEL,
        contents=bill_text,
        config=config,
    )
    node = _parse_or_repair(client, config, bill_text, response.text or "")
    _truncate_depth(node)
    return node


def _parse_or_repair(
    client: genai.Client,
    config: types.GenerateContentConfig,
    bill_text: str,
    raw_json: str,
) -> Node:
    """Validate Gemini's JSON, salvaging recoverable cases before retrying.

    Gemini's recursive ``response_schema`` mode occasionally serializes
    deeply-nested ``children`` entries as JSON-fragment strings instead of
    objects (missing braces, sometimes missing the opening quote on the
    first key). We try three rescues in order:

    1. Validate as-is.
    2. Salvage: parse the JSON, coerce string-children to objects where
       possible, drop anything irrecoverable.
    3. One repair call to Gemini — *without* the recursive schema (which
       is what tripped it up) and *without* the full document (which just
       re-triggers the same bug). JSON-only repair instructions.
    """
    try:
        return Node.model_validate_json(raw_json)
    except ValidationError as first_error:
        salvaged = _salvage_node(raw_json)
        if salvaged is not None:
            return salvaged

        repair_config = types.GenerateContentConfig(
            system_instruction=EXTRACTION_SYSTEM_PROMPT,
            response_mime_type="application/json",
        )
        repair_contents = (
            "The JSON you previously returned failed validation. Return a "
            "corrected JSON object that conforms to the same Node schema "
            "described in the system prompt. Every entry inside any "
            "'children' array MUST be a JSON OBJECT with keys (name, "
            "amount, type, summary, affects, children) — never a string, "
            "never a fragment. Do not include prose, markdown, or code "
            "fences.\n\n"
            f"Validation errors:\n{first_error}\n\n"
            f"Invalid JSON:\n{raw_json}"
        )
        repair = client.models.generate_content(
            model=MODEL,
            contents=repair_contents,
            config=repair_config,
        )
        repair_text = repair.text or ""
        try:
            return Node.model_validate_json(repair_text)
        except ValidationError:
            salvaged = _salvage_node(repair_text)
            if salvaged is not None:
                return salvaged
            raise


def _salvage_node(raw_json: str) -> Optional[Node]:
    """Best-effort recovery from common Gemini structured-output mistakes."""
    if not raw_json:
        return None
    try:
        data = json.loads(raw_json)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    cleaned = _clean_tree(data)
    if cleaned is None:
        return None
    try:
        return Node.model_validate(cleaned)
    except ValidationError:
        return None


def _clean_tree(node: Any) -> Optional[dict]:
    if not isinstance(node, dict):
        return None
    raw_kids = node.get("children")
    new_kids: list[dict] = []
    if isinstance(raw_kids, list):
        for kid in raw_kids:
            recovered = _coerce_child(kid)
            if recovered is None:
                continue
            cleaned = _clean_tree(recovered)
            if cleaned is not None:
                new_kids.append(cleaned)
    node["children"] = new_kids
    return node


def _coerce_child(value: Any) -> Optional[dict]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        for candidate in _object_candidates(value):
            try:
                obj = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):
                return obj
    return None


def _object_candidates(s: str) -> Iterator[str]:
    """Yield string variants likely to parse as a JSON object.

    Covers the three patterns we've seen Gemini emit when it stringifies
    a recursive child:
        '{"name": ..., "children": []}'   → as-is
        '"name": ..., "children": []'     → wrap in {}
        'name": ..., "children": []'      → leading `"` eaten, prepend `{"`
    """
    s = s.strip().rstrip(",")
    yield s
    yield "{" + s + "}"
    yield '{"' + s + "}"
    yield '{"' + s


def _truncate_depth(node: Node, depth: int = 1) -> None:
    if depth >= MAX_DEPTH:
        node.children = []
        return
    for child in node.children:
        _truncate_depth(child, depth + 1)


def explain_section(
    bill_text: str, node_path: list[str], node: Node
) -> list[str]:
    span = _locate_span(bill_text, node_path) or _fallback_span(bill_text, node)

    contents = (
        f"Section path: {' > '.join(node_path)}\n"
        f"Section summary (from prior analysis): {node.summary}\n"
        f"Who is affected (from prior analysis): {node.affects}\n\n"
        f"--- EXCERPT ---\n{span}"
    )

    client = _get_client()
    response = client.models.generate_content(
        model=MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=EXPLAIN_SYSTEM_PROMPT,
        ),
    )

    paragraphs = [p.strip() for p in response.text.split("\n\n") if p.strip()]
    return paragraphs


def _locate_span(bill_text: str, node_path: list[str]) -> Optional[str]:
    if len(node_path) <= 1:
        return None

    lower = bill_text.lower()
    cursor = 0
    for name in node_path[1:]:
        idx = lower.find(name.lower(), cursor)
        if idx == -1:
            return None
        cursor = idx

    end = min(len(bill_text), cursor + EXPLAIN_SPAN_CHARS)
    return bill_text[cursor:end]


def _fallback_span(bill_text: str, node: Node) -> str:
    lower = bill_text.lower()
    idx = lower.find(node.name.lower())
    if idx == -1:
        return bill_text[:EXPLAIN_FALLBACK_CHARS]
    start = max(0, idx - EXPLAIN_FALLBACK_CHARS // 4)
    end = min(len(bill_text), start + EXPLAIN_FALLBACK_CHARS)
    return bill_text[start:end]
