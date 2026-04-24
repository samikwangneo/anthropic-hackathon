from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.models import BillMeta, ExplainRequest, ExplainResponse, Node
from backend.bills import list_bills, load_bill_text, load_cached_hierarchy, save_cached_hierarchy
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
