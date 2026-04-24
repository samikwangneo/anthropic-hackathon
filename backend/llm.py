import json
import os
from typing import Optional

import requests
from pydantic import ValidationError

from backend.models import Node
from backend.prompts import EXPLAIN_SYSTEM_PROMPT, EXTRACTION_SYSTEM_PROMPT

FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions"
MODEL = "accounts/samik-rhb15ufmmp61/deployments/w91e5r2f"
MAX_TOKENS = 32768
EXTRACTION_TEMPERATURE = 0.3
EXPLAIN_TEMPERATURE = 0.6
REQUEST_TIMEOUT = 300
MAX_DEPTH = 4
EXPLAIN_SPAN_CHARS = 12000
EXPLAIN_FALLBACK_CHARS = 8000


def _get_api_key() -> str:
    key = os.environ.get("FIREWORKS_API_KEY")
    if not key:
        raise RuntimeError(
            "FIREWORKS_API_KEY is not set. Add it to your .env or shell environment."
        )
    return key


def _call(
    messages: list[dict],
    *,
    temperature: float,
    json_mode: bool,
) -> str:
    payload: dict = {
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "top_p": 1,
        "top_k": 40,
        "presence_penalty": 0,
        "frequency_penalty": 0,
        "temperature": temperature,
        "messages": messages,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {_get_api_key()}",
    }
    response = requests.post(
        FIREWORKS_URL,
        headers=headers,
        data=json.dumps(payload),
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


def extract_hierarchy(bill_text: str) -> Node:
    messages = [
        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": bill_text},
    ]
    raw = _call(messages, temperature=EXTRACTION_TEMPERATURE, json_mode=True)
    node = _parse_or_repair(bill_text, raw)
    _truncate_depth(node)
    return node


def _parse_or_repair(bill_text: str, raw_json: str) -> Node:
    try:
        return Node.model_validate_json(raw_json)
    except ValidationError as first_error:
        repair_user_content = (
            f"The previous JSON you returned failed validation.\n\n"
            f"Validation errors:\n{first_error}\n\n"
            f"The invalid JSON was:\n{raw_json}\n\n"
            f"Return a corrected JSON object that matches the shape described in the "
            f"system prompt. Do not include prose, markdown, or code fences. The original "
            f"document is below.\n\n--- DOCUMENT ---\n{bill_text}"
        )
        repair_messages = [
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": repair_user_content},
        ]
        repaired = _call(
            repair_messages,
            temperature=EXTRACTION_TEMPERATURE,
            json_mode=True,
        )
        return Node.model_validate_json(repaired)


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

    user_content = (
        f"Section path: {' > '.join(node_path)}\n"
        f"Section summary (from prior analysis): {node.summary}\n"
        f"Who is affected (from prior analysis): {node.affects}\n\n"
        f"--- EXCERPT ---\n{span}"
    )
    messages = [
        {"role": "system", "content": EXPLAIN_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
    raw = _call(messages, temperature=EXPLAIN_TEMPERATURE, json_mode=False)
    return [p.strip() for p in raw.split("\n\n") if p.strip()]


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
