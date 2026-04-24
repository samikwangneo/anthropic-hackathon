export type NodeType = "increase" | "cut" | "new" | "repeal" | "neutral";

export interface Node {
  name: string;
  amount: number | null; // dollars if budget-like, else null
  type: NodeType;
  summary: string;       // 1–2 sentences plain language
  affects: string;       // one-line "who this affects"
  children: Node[];
}

export interface BillMeta {
  id: string;
  title: string;
  description: string;
}

export interface ExplainRequest {
  bill_id: string;
  node_path: string[];   // root→clicked, by name
  node: Node;
}

export interface ExplainResponse {
  paragraphs: string[];
}
