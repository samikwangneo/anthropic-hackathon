"""PolicyMap dev-server launcher.

Run from the repo root:

    python run.py

Equivalent to ``uvicorn backend.main:app --reload --port 8000`` but easier
to remember and lets you pass overrides via env vars:

    PORT=8001 RELOAD=0 python run.py
"""

from __future__ import annotations

import os

import uvicorn


def main() -> None:
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    reload = os.environ.get("RELOAD", "1") not in {"0", "false", "False", ""}

    uvicorn.run(
        "backend.main:app",
        host=host,
        port=port,
        reload=reload,
        reload_dirs=["backend"] if reload else None,
    )


if __name__ == "__main__":
    main()
