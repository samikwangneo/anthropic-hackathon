from dotenv import load_dotenv
load_dotenv()

import shutil
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from backend.models import BillMeta, ExplainRequest, ExplainResponse, Node
from backend.bills import (
    BILLS_DIR,
    list_bills,
    load_bill_text,
    load_cached_hierarchy,
    register_bill,
    save_cached_hierarchy,
)
from backend.llm import extract_hierarchy, explain_section

app = FastAPI(title="PolicyMap API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/bills", response_model=list[BillMeta])
def get_bills():
    return list_bills()


@app.get("/api/bills/{bill_id}/hierarchy", response_model=Node)
def get_hierarchy(bill_id: str):
    cached = load_cached_hierarchy(bill_id)
    if cached:
        return cached
    try:
        text = load_bill_text(bill_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Bill '{bill_id}' not found")
    node = extract_hierarchy(text)
    save_cached_hierarchy(bill_id, node)
    return node


@app.post("/api/explain", response_model=ExplainResponse)
def explain(req: ExplainRequest):
    try:
        text = load_bill_text(req.bill_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Bill '{req.bill_id}' not found")
    paragraphs = explain_section(text, req.node_path, req.node)
    return ExplainResponse(paragraphs=paragraphs)


@app.post("/api/bills/upload", response_model=BillMeta)
def upload_bill(
    file: UploadFile = File(...),
    title: str = Form(""),
    description: str = Form(""),
):
    filename = file.filename or "upload"
    suffix = Path(filename).suffix.lower()
    if suffix not in (".pdf", ".txt"):
        raise HTTPException(status_code=400, detail="Only .pdf and .txt files are supported")

    bill_id = Path(filename).stem
    dest = BILLS_DIR / f"{bill_id}{suffix}"
    BILLS_DIR.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f_out:
        shutil.copyfileobj(file.file, f_out)

    effective_title = title.strip() or bill_id.replace("_", " ").replace("-", " ").strip().title()
    effective_description = description.strip() or "Uploaded document."
    meta = BillMeta(id=bill_id, title=effective_title, description=effective_description)
    register_bill(bill_id, meta)

    try:
        text = load_bill_text(bill_id)
        node = extract_hierarchy(text)
        save_cached_hierarchy(bill_id, node)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Hierarchy extraction failed: {exc}")

    return meta
