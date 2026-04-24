import os
from typing import Optional

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
    config = types.GenerateContentConfig(
        system_instruction=EXTRACTION_SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=Node,
    )
    response = client.models.generate_content(
        model=MODEL,
        contents=bill_text,
        config=config,
    )
    node = _parse_or_repair(client, config, bill_text, response.text)
    _truncate_depth(node)
    return node


def _parse_or_repair(
    client: genai.Client,
    config: types.GenerateContentConfig,
    bill_text: str,
    raw_json: str,
) -> Node:
    try:
        return Node.model_validate_json(raw_json)
    except ValidationError as first_error:
        repair_contents = (
            f"The previous JSON you returned failed validation.\n\n"
            f"Validation errors:\n{first_error}\n\n"
            f"The invalid JSON was:\n{raw_json}\n\n"
            f"The original document is below. Return a corrected JSON object that conforms "
            f"to the schema. Do not include prose, markdown, or code fences.\n\n"
            f"--- DOCUMENT ---\n{bill_text}"
        )
        repair = client.models.generate_content(
            model=MODEL,
            contents=repair_contents,
            config=config,
        )
        return Node.model_validate_json(repair.text)


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
