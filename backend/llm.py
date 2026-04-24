import os
import json
import requests

from backend.models import Node
from backend.prompts import EXTRACTION_SYSTEM_PROMPT, EXPLAIN_SYSTEM_PROMPT

_FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions"
_MODEL = "accounts/samik-rhb15ufmmp61/deployments/w91e5r2f"


def _call(system: str, user: str, json_mode: bool = False) -> str:
    payload = {
        "model": _MODEL,
        "max_tokens": 32768,
        "top_p": 1,
        "top_k": 40,
        "presence_penalty": 0,
        "frequency_penalty": 0,
        "temperature": 0.6,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {os.environ['FIREWORKS_API_KEY']}",
    }

    resp = requests.post(_FIREWORKS_URL, headers=headers, data=json.dumps(payload))
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def extract_hierarchy(bill_text: str) -> Node:
    raw = _call(EXTRACTION_SYSTEM_PROMPT, bill_text, json_mode=True)
    try:
        return Node.model_validate_json(raw)
    except Exception as e:
        repair_prompt = (
            f"The previous response failed Pydantic validation with error: {e}\n"
            "Return corrected JSON only, matching the Node schema exactly."
        )
        raw = _call(EXTRACTION_SYSTEM_PROMPT, repair_prompt, json_mode=True)
        return Node.model_validate_json(raw)


def explain_section(bill_text: str, node_path: list[str], node: Node) -> list[str]:
    span = bill_text
    for name in node_path:
        idx = bill_text.lower().find(name.lower())
        if idx != -1:
            span = bill_text[idx : idx + 8000]
            break

    user_msg = f"Section path: {' > '.join(node_path)}\n\nText:\n{span}"
    raw = _call(EXPLAIN_SYSTEM_PROMPT, user_msg, json_mode=False)
    return [p.strip() for p in raw.split("\n\n") if p.strip()]
