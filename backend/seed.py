"""Seed the hierarchy cache from raw bill text.

Run once before the demo (and any time a bill's text or the extraction
prompt changes)::

    python -m backend.seed

For every ``backend/data/bills/*.txt`` this script calls
``backend.llm.extract_hierarchy`` and writes
``backend/data/cache/{bill_id}.json``. The cache is committed to git so
the demo starts instantly and survives Gemini hiccups.

A short per-bill summary (total nodes, tree depth, total dollars across
the tree) is printed so output quality can be spot-checked.
"""

from __future__ import annotations

import sys
import traceback

from dotenv import load_dotenv

# Load .env before importing the LLM module (which reads GEMINI_API_KEY).
# Looks in CWD first, then walks up — so it works whether you run from
# the repo root or from inside backend/.
load_dotenv()

from backend.bills import (  # noqa: E402  (import after load_dotenv)
    BILLS_DIR,
    list_bills,
    load_bill_text,
    save_cached_hierarchy,
)
from backend.llm import extract_hierarchy  # noqa: E402
from backend.models import Node  # noqa: E402


def _stats(node: Node) -> tuple[int, int, float]:
    """Return ``(total_nodes, depth, total_dollars)`` for a subtree."""
    total_nodes = 1
    max_depth = 1
    total_dollars = float(node.amount or 0.0)
    for child in node.children:
        child_nodes, child_depth, child_dollars = _stats(child)
        total_nodes += child_nodes
        max_depth = max(max_depth, child_depth + 1)
        total_dollars += child_dollars
    return total_nodes, max_depth, total_dollars


def main() -> int:
    bills = list_bills()
    if not bills:
        print(
            f"No bills found in {BILLS_DIR}.\n"
            "Drop *.txt or *.pdf files there (filename stem = bill id) "
            "and re-run."
        )
        return 1

    failures: list[str] = []
    for meta in bills:
        bill_id = meta.id
        print(f"Extracting {bill_id} — {meta.title} ...", flush=True)
        try:
            text = load_bill_text(bill_id)
            node = extract_hierarchy(text)
            save_cached_hierarchy(bill_id, node)
        except Exception:
            failures.append(bill_id)
            traceback.print_exc()
            print(f"  !! {bill_id} failed; continuing")
            continue

        total_nodes, depth, total_dollars = _stats(node)
        print(
            f"  {bill_id}: {total_nodes} nodes, depth {depth}, "
            f"total ${total_dollars:,.0f}"
        )

    if failures:
        print(f"\nDone with {len(failures)} failure(s): {', '.join(failures)}")
        return 2
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
