import { BillMeta, Node, ExplainRequest, ExplainResponse } from './types';

// Empty base means we go through Vite's dev proxy (`/api → :8000`).
// Set VITE_API_URL in `.env.local` to point at a different backend.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => resp.statusText);
    throw new Error(`${resp.status} ${resp.statusText}: ${detail}`);
  }
  return resp.json() as Promise<T>;
}

export const api = {
  getBills: (): Promise<BillMeta[]> => jsonFetch('/api/bills'),

  getHierarchy: (bill_id: string): Promise<Node> =>
    jsonFetch(`/api/bills/${encodeURIComponent(bill_id)}/hierarchy`),

  explain: (req: ExplainRequest): Promise<ExplainResponse> =>
    jsonFetch('/api/explain', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  uploadBill: async (file: File, title?: string, description?: string): Promise<BillMeta> => {
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    if (description) form.append('description', description);
    const resp = await fetch(`${API_BASE}/api/bills/upload`, { method: 'POST', body: form });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => resp.statusText);
      throw new Error(`${resp.status} ${resp.statusText}: ${detail}`);
    }
    return resp.json() as Promise<BillMeta>;
  },
};
