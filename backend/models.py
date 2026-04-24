from typing import Literal, Optional

from pydantic import BaseModel, Field

NodeType = Literal["increase", "cut", "new", "repeal", "neutral"]


class Node(BaseModel):
    name: str
    amount: Optional[float] = None
    type: NodeType
    summary: str
    affects: str
    children: list["Node"] = Field(default_factory=list)


class BillMeta(BaseModel):
    id: str
    title: str
    description: str


class ExplainRequest(BaseModel):
    bill_id: str
    node_path: list[str]
    node: Node


class ExplainResponse(BaseModel):
    paragraphs: list[str]


Node.model_rebuild()
