PolicyMap — v1 Plan (4-person split)

 Context

 PolicyMap turns a bill into a zoomable D3 sunburst where arc size encodes dollar magnitude and color
  encodes sentiment (increase / cut / new / repeal / neutral). Two LLM jobs power it: hierarchy
 extraction on load, plain-language section explanation on click. v1 scope: React + FastAPI + Gemini
 2.5 Flash, localhost only, seeded with 3–5 pre-parsed bills (no live URL fetch or PDF upload in v1).

 Four-person hackathon split: 1 frontend, 3 backend, partitioned so no two people edit the same file.
  The backend splits cleanly along three import boundaries — LLM, Data, API — with models.py as the
 only shared contract.

 The repo is currently empty (greenfield).

 Stack

 - Frontend: Vite + React + TypeScript, D3 v7 (d3-hierarchy, d3-shape, d3-selection).
 - Backend: FastAPI + Pydantic v2, Uvicorn, google-genai SDK (Gemini 2.5 Flash), python-dotenv.
 - LLM: Gemini 2.5 Flash. 1M-token context fits any bill in a single extraction call; Flash is ~5–10×
  cheaper and ~2–3× faster than Pro, which matters for live explain calls during the demo.
 - Deployment: localhost only. Backend :8000, Vite dev :5173, CORS → localhost:5173.

 Shared contract — freeze this first (Day 1, ~30 min)

 Everyone imports from backend/models.py. Owner: Backend-A. Everyone else treats it read-only.
 # backend/models.py
 from typing import Literal, Optional
 from pydantic import BaseModel

 NodeType = Literal["increase","cut","new","repeal","neutral"]

 class Node(BaseModel):
     name: str
     amount: Optional[float] = None   # dollars if budget-like, else None
     type: NodeType
     summary: str                     # 1–2 sentences plain language
     affects: str                     # one-line "who this affects"
     children: list["Node"] = []

 class BillMeta(BaseModel):
     id: str
     title: str
     description: str

 class ExplainRequest(BaseModel):
     bill_id: str
     node_path: list[str]             # root→clicked, by name
     node: Node

 class ExplainResponse(BaseModel):
     paragraphs: list[str]
 Frontend types.ts mirrors this by hand — keep it a tiny file.

 API contract (owned by Backend-C, locked Day 1 so Frontend can mock against it):

 ┌────────┬───────────────────────────┬────────────────┬─────────────────┐
 │ Method │           Path            │    Request     │    Response     │
 ├────────┼───────────────────────────┼────────────────┼─────────────────┤
 │ GET    │ /api/bills                │ —              │ BillMeta[]      │
 ├────────┼───────────────────────────┼────────────────┼─────────────────┤
 │ GET    │ /api/bills/{id}/hierarchy │ —              │ Node            │
 ├────────┼───────────────────────────┼────────────────┼─────────────────┤
 │ POST   │ /api/explain              │ ExplainRequest │ ExplainResponse │
 └────────┴───────────────────────────┴────────────────┴─────────────────┘

 ---
 Repo layout (by owner)

 anthropic-hackathon/
 ├── backend/
 │   ├── models.py         # Backend-A (shared — everyone imports)
 │   ├── prompts.py        # Backend-A
 │   ├── llm.py            # Backend-A
 │   ├── bills.py          # Backend-B
 │   ├── seed.py           # Backend-B
 │   ├── data/
 │   │   ├── bills/        # Backend-B (raw .txt)
 │   │   └── cache/        # Backend-B (seeded JSON, committed)
 │   ├── main.py           # Backend-C
 │   ├── requirements.txt  # Backend-C
 │   └── .env.example      # Backend-C
 └── frontend/             # Frontend (entire dir)
     ├── src/
     │   ├── App.tsx
     │   ├── api.ts
     │   ├── types.ts
     │   ├── components/
     │   │   ├── BillPicker.tsx
     │   │   ├── Sunburst.tsx
     │   │   ├── Tooltip.tsx
     │   │   └── ExplainerPanel.tsx
     │   ├── styles.css
     │   └── main.tsx
     ├── index.html
     ├── package.json
     ├── tsconfig.json
     └── vite.config.ts

 ---
 Backend-A — LLM layer (no file overlap with B or C)

 Owns: backend/models.py, backend/prompts.py, backend/llm.py.

 prompts.py

 Two module-level strings kept separate from client code for easy iteration:
 - EXTRACTION_SYSTEM_PROMPT — "Parse this legislation. Return a hierarchy, max 4 levels deep. Each
 node: name, dollar amount if present else null, type ∈ {increase, cut, new, repeal, neutral},
 2-sentence plain-language summary, one-line 'who is affected'. Do not invent facts."
 - EXPLAIN_SYSTEM_PROMPT — "Write 3–4 short paragraphs in plain language. No jargon. Concrete
 examples where natural. Do not invent facts outside the provided text."

 llm.py

 Two functions — these are the only public surface area Backend-C calls:
 def extract_hierarchy(bill_text: str) -> Node: ...
 def explain_section(bill_text: str, node_path: list[str], node: Node) -> list[str]: ...
 - Use Gemini 2.5 Flash via google-genai with structured output (response_schema=Node / JSON mode)
 for extraction — this is why the parse step is reliable.
 - extract_hierarchy: validate result against Pydantic; on validation failure, retry once with a
 repair prompt that includes the validator error.
 - explain_section: locate the relevant span in bill_text by matching node_path names against section
  headings / substrings; pass only that span + the path as context (keeps prompts small, explanations
  grounded). Return paragraphs as a list (split on blank lines).

 Smoke test (Backend-A runs solo, no API/frontend needed)

 python -c "from backend.llm import extract_hierarchy; import json;
 print(json.dumps(extract_hierarchy(open('backend/data/bills/sample.txt').read()).model_dump(),
 indent=2))"

 ---
 Backend-B — Data layer (no file overlap with A or C)

 Owns: backend/bills.py, backend/seed.py, backend/data/bills/*.txt, backend/data/cache/*.json.

 Source bill selection (do this first — unblocks everything else)

 Grab plain text from congress.gov / whitehouse.gov / GPO and drop into data/bills/{id}.txt. Target
 3–5 bills:
 - A recent appropriations bill (high dollar density, great sunburst)
 - An education bill (matches the spec example)
 - A recent executive order (non-budget — exercises clause-count sizing)
 - A state-level budget (smaller, fast to extract)
 - One short bill (narration-friendly demo)

 bills.py

 Public surface Backend-C imports:
 def list_bills() -> list[BillMeta]: ...
 def load_bill_text(bill_id: str) -> str: ...
 def load_cached_hierarchy(bill_id: str) -> Node | None: ...
 def save_cached_hierarchy(bill_id: str, node: Node) -> None: ...
 - BillMeta catalog lives inline in bills.py as a dict[str, BillMeta] (id, title, description —
 hand-authored, a few sentences each).
 - Cache is data/cache/{bill_id}.json. Serialize via node.model_dump_json(indent=2).

 seed.py

 python -m backend.seed
 Iterates every data/bills/*.txt, imports backend.llm.extract_hierarchy, writes data/cache/{id}.json.
  Run once before the demo; commit the cache so the demo is instant and survives Gemini hiccups.
 Print a quick summary per bill (total nodes, depth, total dollar amount) to spot-check output
 quality.

 Done when

 - list_bills() returns 3–5 entries.
 - Every data/bills/*.txt has a matching data/cache/*.json with a sensible-looking tree.
 - Load / save round-trips cleanly against Backend-A's Node.

 ---
 Backend-C — API layer (no file overlap with A or B)

 Owns: backend/main.py, backend/requirements.txt, backend/.env.example.

 main.py

 - FastAPI app, CORS middleware → http://localhost:5173.
 - Loads .env on import; Backend-A reads GEMINI_API_KEY via os.environ.
 - Routes wire Backend-B's data functions to Backend-A's LLM functions — no business logic beyond
 orchestration:

 @app.get("/api/bills", response_model=list[BillMeta])
 def get_bills(): return list_bills()

 @app.get("/api/bills/{bill_id}/hierarchy", response_model=Node)
 def get_hierarchy(bill_id: str):
     cached = load_cached_hierarchy(bill_id)
     if cached: return cached
     text = load_bill_text(bill_id)
     node = extract_hierarchy(text)      # live fallback
     save_cached_hierarchy(bill_id, node)
     return node

 @app.post("/api/explain", response_model=ExplainResponse)
 def explain(req: ExplainRequest):
     text = load_bill_text(req.bill_id)
     paragraphs = explain_section(text, req.node_path, req.node)
     return ExplainResponse(paragraphs=paragraphs)

 requirements.txt

 fastapi, uvicorn[standard], pydantic>=2, google-genai, python-dotenv.

 .env.example

 GEMINI_API_KEY=

 Done when

 - uvicorn backend.main:app --reload --port 8000 runs clean.
 - All three routes return valid shapes against a cached bill (no Gemini call needed for the first
 two routes once seeded).
 - 404 for an unknown bill_id; request-body validation errors return 422.

 ---
 Frontend — React + D3 (single owner, entire frontend/ dir)

 Owns: everything under frontend/.

 Day 1 unblock: mock the API

 Before Backend-C is ready, stub api.ts with static JSON matching the contract above so Sunburst and
 ExplainerPanel can be built in parallel. Flip to real fetch once /api/bills returns.

 Sunburst.tsx — the core viz

 - Port D3's https://observablehq.com/@d3/zoomable-sunburst example into React:
   - useRef for the SVG; all D3 ops inside a useEffect keyed on the hierarchy prop.
   - d3.hierarchy(data).sum(d => d.amount ?? 0); if subtree total is 0, re-sum with () => 1 for
 clause-count sizing (handles executive orders and non-budget bills).
   - d3.partition().size([2π, radius]), d3.arc() for paths.
   - Click arc → tween (x0, x1, y0, y1) on all arcs so the clicked arc becomes the new center; click
 center → zoom out one level.
 - Color scale, keyed on node.type:
   - increase → teal #14b8a6
   - cut → coral #f87171
   - new → purple #a855f7
   - repeal → orange #f97316
   - neutral → gray #9ca3af

 Tooltip.tsx

 Hover shows: name, formatted amount ($1.2B / $820M / —), 1-line summary, affects.

 ExplainerPanel.tsx

 Right-side drawer. On open, POSTs /api/explain with { bill_id, node_path, node }, renders returned
 paragraphs. Close button clears selection.

 App.tsx flow

 mount → GET /api/bills → <BillPicker>
 pick bill → GET /api/bills/{id}/hierarchy → <Sunburst data={hierarchy} />
 click arc → setSelectedNode({node, path}) → <ExplainerPanel> fires /api/explain
 Local state in App.tsx — no Redux/Zustand.

 Done when

 - All 3–5 library bills render sunbursts within ~200ms (cache hit path).
 - Zoom-in / zoom-out animate smoothly at 60fps on a laptop.
 - Explainer panel returns text under ~5s for a mid-tree node.
 - Clause-count fallback visibly works on the executive-order bill.

 ---
 Day-1 parallelization order

 1. All 4 together (~30 min): lock models.py fields + API contract in this file. Nothing else blocks
 until this is frozen.
 2. Backend-A + B + Frontend in parallel:
   - A builds llm.py against a single bill text and a hand-typed Node.
   - B assembles data/bills/ and writes bills.py.
   - Frontend wires Sunburst against a static JSON mock of Node.
 3. Backend-C lands once A's extract_hierarchy + explain_section and B's
 list_bills/load_bill_text/cache I/O exist as importable functions.
 4. B runs seed.py once A is stable → commits data/cache/*.json.
 5. Frontend flips api.ts to real fetch. Full end-to-end dry run.

 Verification (end-to-end)

 1. cd backend && pip install -r requirements.txt && cp .env.example .env — paste GEMINI_API_KEY.
 2. python -m backend.seed — confirm JSON files in data/cache/, spot-check one tree.
 3. uvicorn backend.main:app --reload --port 8000 — hit /api/bills and one /hierarchy in a browser.
 4. cd frontend && npm install && npm run dev → http://localhost:5173.
 5. Manual demo pass:
   - Each library bill renders in ~200ms.
   - Click an outer arc → zooms smoothly; click center → zooms out.
   - Hover → tooltip with name/amount/summary.
   - "Explain this section" → panel renders paragraphs in < ~5s.
   - Delete one data/cache/{id}.json, re-pick the bill → live extraction path still works.
 6. Edge cases: non-budget bill uses clause-count sizing; repeal renders orange; no branch exceeds 4
 rings.

 Out of scope for v1 (roadmap, do not build)

 - URL fetching (congress.gov scraping)
 - PDF upload / OCR
 - "Who does this affect?" demographic targeting
 - Shareable zoom-state URLs / embed iframes
 - Comparison / personal-impact / classroom modes
 - Auth / persistence / user accounts
 - Deployment




Here's everything the **Frontend person** owns:

---

**Files owned (entire `frontend/` dir):**

```
frontend/
├── src/
│   ├── App.tsx
│   ├── api.ts
│   ├── types.ts
│   ├── components/
│   │   ├── BillPicker.tsx
│   │   ├── Sunburst.tsx
│   │   ├── Tooltip.tsx
│   │   └── ExplainerPanel.tsx
│   ├── styles.css
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

**Stack:** Vite + React + TypeScript, D3 v7

---

**Day 1 — unblock yourself immediately**

Stub `api.ts` with static JSON matching the contract so you don't wait on Backend-C. Flip to real fetch once `/api/bills` is live.

---

**Sunburst.tsx** (core)

- Port the [D3 zoomable sunburst](https://observablehq.com/@d3/zoomable-sunburst) into React using `useRef` for the SVG and `useEffect` keyed on the hierarchy prop
- Sum by `amount ?? 0`; if subtree total is 0, re-sum with `() => 1` for clause-count sizing (handles exec orders)
- Click arc → tween zoom in; click center → zoom out one level
- Color scale by `node.type`: increase=`#14b8a6`, cut=`#f87171`, new=`#a855f7`, repeal=`#f97316`, neutral=`#9ca3af`

**Tooltip.tsx** — hover shows: name, formatted amount (`$1.2B` / `—`), 1-line summary, affects

**ExplainerPanel.tsx** — right drawer; on open POSTs `/api/explain`, renders returned paragraphs; close clears selection

**App.tsx flow:**
```
mount → GET /api/bills → <BillPicker>
pick bill → GET /api/bills/{id}/hierarchy → <Sunburst data={hierarchy} />
click arc → setSelectedNode({node, path}) → <ExplainerPanel> fires /api/explain
```
Local state only — no Redux/Zustand.

---

**Done when:**
- All 3–5 bills render sunbursts in ~200ms (cache hit)
- Zoom animates at 60fps
- Explainer panel returns text under ~5s
- Clause-count fallback visibly works on the exec order bill