"""Data layer for PolicyMap.

Owns the on-disk layout under ``backend/data``:

    backend/data/bills/{bill_id}.{txt,pdf}   # raw source text
    backend/data/cache/{bill_id}.json        # serialized Node from backend.llm

Public surface (imported by ``backend.main`` and ``backend.seed``):

    list_bills()               -> list[BillMeta]
    load_bill_text(bill_id)    -> str
    load_cached_hierarchy(id)  -> Node | None
    save_cached_hierarchy(...) -> None
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Iterator, Optional

from backend.models import BillMeta, Node


BACKEND_DIR = Path(__file__).resolve().parent
BILLS_DIR = BACKEND_DIR / "data" / "bills"
CACHE_DIR = BACKEND_DIR / "data" / "cache"

SUPPORTED_BILL_SUFFIXES = (".txt", ".pdf")


# Hand-authored metadata. Key must equal the source-file stem:
# ``22-174_k536`` is paired with ``backend/data/bills/22-174_k536.pdf``.
#
# Any source file that lacks a catalog entry still shows up in
# ``list_bills()`` with a placeholder title/description, so dropping a
# new bill into the bills directory is always non-breaking.
_BILL_CATALOG: dict[str, BillMeta] = {
    "2026-06286": BillMeta(
        id="2026-06286",
        title="Executive Order 14398 — Addressing DEI Discrimination by Federal Contractors",
        description=(
            "Presidential executive order restricting 'diversity, equity, and "
            "inclusion' activities by federal contractors under the Federal "
            "Property and Administrative Services Act. Non-budget directive — "
            "exercises the clause-count sizing path because most provisions "
            "lack dollar amounts."
        ),
    ),
    "BILLS-119s3971enr": BillMeta(
        id="BILLS-119s3971enr",
        title="S. 3971 — Small Business Innovation and Economic Security Act (119th Congress)",
        description=(
            "Enrolled Senate bill reauthorizing and reforming the SBIR and "
            "STTR programs, with new research-security diligence requirements "
            "targeting foreign-adversary ties. Mixed regulatory and "
            "program-funding text — shows both budget and clause-count nodes "
            "in the same sunburst."
        ),
    ),
}


def list_bills() -> list[BillMeta]:
    """Every bill with a source file on disk, catalog entries first."""
    bills: list[BillMeta] = []
    seen: set[str] = set()

    for bill_id, meta in _BILL_CATALOG.items():
        if _find_bill_file(bill_id) is not None:
            bills.append(meta)
            seen.add(bill_id)

    for path in _iter_bill_files():
        bill_id = path.stem
        if bill_id in seen:
            continue
        bills.append(
            BillMeta(
                id=bill_id,
                title=_fallback_title(bill_id),
                description=(
                    "Placeholder metadata — add an entry to _BILL_CATALOG "
                    "in backend/bills.py for a proper title and description."
                ),
            )
        )
        seen.add(bill_id)

    return bills


def load_bill_text(bill_id: str) -> str:
    """Raw text for a bill, extracted from .txt or .pdf on demand.

    Raises ``FileNotFoundError`` for unknown ids.
    """
    path = _find_bill_file(bill_id)
    if path is None:
        raise FileNotFoundError(
            f"No bill file for {bill_id!r} in {BILLS_DIR} "
            f"(looked for {SUPPORTED_BILL_SUFFIXES})"
        )
    return _extract_text(path)


def load_cached_hierarchy(bill_id: str) -> Optional[Node]:
    """Cached hierarchy if one is on disk, else ``None``."""
    path = _cache_path(bill_id)
    if not path.exists():
        return None
    return Node.model_validate_json(path.read_text(encoding="utf-8"))


def save_cached_hierarchy(bill_id: str, node: Node) -> None:
    """Write a hierarchy to ``data/cache/{bill_id}.json``, pretty-printed."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _cache_path(bill_id).write_text(
        node.model_dump_json(indent=2), encoding="utf-8"
    )


def _find_bill_file(bill_id: str) -> Optional[Path]:
    for suffix in SUPPORTED_BILL_SUFFIXES:
        path = BILLS_DIR / f"{bill_id}{suffix}"
        if path.exists():
            return path
    return None


def _iter_bill_files() -> Iterator[Path]:
    seen_stems: set[str] = set()
    for suffix in SUPPORTED_BILL_SUFFIXES:
        for path in sorted(BILLS_DIR.glob(f"*{suffix}")):
            if path.stem in seen_stems:
                # Prefer .txt over .pdf if both exist for the same id.
                continue
            seen_stems.add(path.stem)
            yield path


@lru_cache(maxsize=32)
def _extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".txt":
        return path.read_text(encoding="utf-8")
    if suffix == ".pdf":
        # Local import so environments without pypdf still work for .txt-only.
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n\n".join(pages)
    raise ValueError(f"Unsupported bill file type: {path.suffix}")


def _cache_path(bill_id: str) -> Path:
    return CACHE_DIR / f"{bill_id}.json"


def _fallback_title(bill_id: str) -> str:
    return bill_id.replace("_", " ").replace("-", " ").strip().title()
