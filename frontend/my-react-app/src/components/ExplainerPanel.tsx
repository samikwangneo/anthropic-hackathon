import React, { useEffect, useState } from 'react';
import { Node, ExplainRequest, ExplainResponse } from '../types';
import { api } from '../api';
import { X, Loader2, ArrowUpRight, ArrowDownRight, Sparkles, Trash2, MinusCircle, Users, DollarSign, GitBranch } from 'lucide-react';

interface ExplainerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  node: Node | null;
  nodePath: string[];
  billId: string | null;
}

const TYPE_META: Record<string, { label: string; color: string; bg: string; ring: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  increase: { label: 'Increase',  color: 'text-teal-300',   bg: 'bg-teal-500/15',   ring: 'ring-teal-500/40',   icon: ArrowUpRight },
  cut:      { label: 'Cut',       color: 'text-red-300',    bg: 'bg-red-500/15',    ring: 'ring-red-500/40',    icon: ArrowDownRight },
  new:      { label: 'New',       color: 'text-purple-300', bg: 'bg-purple-500/15', ring: 'ring-purple-500/40', icon: Sparkles },
  repeal:   { label: 'Repeal',    color: 'text-orange-300', bg: 'bg-orange-500/15', ring: 'ring-orange-500/40', icon: Trash2 },
  neutral:  { label: 'Neutral',   color: 'text-zinc-300',   bg: 'bg-zinc-500/15',   ring: 'ring-zinc-500/40',   icon: MinusCircle },
};

function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  if (Math.abs(amount) >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(amount) >= 1_000_000)     return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 1_000)         return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

export const ExplainerPanel: React.FC<ExplainerPanelProps> = ({
  isOpen, onClose, node, nodePath, billId
}) => {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && node && billId) {
      setLoading(true);
      setError(null);
      setResponse(null);

      const req: ExplainRequest = {
        bill_id: billId,
        node_path: nodePath,
        node,
      };

      api.explain(req)
        .then(res => {
          setResponse(res);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message || 'Failed to generate explanation');
          setLoading(false);
        });
    }
  }, [isOpen, node, billId, nodePath]);

  const typeMeta = TYPE_META[node?.type ?? 'neutral'] ?? TYPE_META.neutral;
  const TypeIcon = typeMeta.icon;
  const childCount = node?.children?.length ?? 0;

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-30 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[450px] md:w-[520px] z-40 bg-zinc-950/85 backdrop-blur-xl border-l border-white/10 shadow-2xl transform transition-transform duration-500 cubic-bezier(0.19, 1, 0.22, 1) flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between p-6 border-b border-white/10 gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${typeMeta.bg} ring-1 ${typeMeta.ring}`}>
                <TypeIcon size={12} className={typeMeta.color} />
                <span className={`text-[10px] uppercase tracking-widest font-bold ${typeMeta.color}`}>
                  {typeMeta.label}
                </span>
              </div>
              <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Section Analysis</div>
            </div>
            <h2 className="text-2xl font-primary text-zinc-100 leading-tight break-words">
              {node?.name || 'Loading…'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors flex-shrink-0"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide space-y-6">
          {/* Breadcrumb path — always visible */}
          {nodePath.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs font-secondary text-zinc-500">
              {nodePath.map((p, i) => (
                <React.Fragment key={`${p}-${i}`}>
                  <span className={`px-2 py-1 rounded border ${
                    i === nodePath.length - 1
                      ? 'bg-white/10 border-white/20 text-zinc-200'
                      : 'bg-white/5 border-white/10'
                  }`}>{p}</span>
                  {i < nodePath.length - 1 && <span className="pt-1 text-white/20">→</span>}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Metadata grid — always visible, no LLM dependency */}
          {node && (
            <div className="grid grid-cols-3 gap-3">
              <MetricCard
                icon={<DollarSign size={14} />}
                label="Amount"
                value={formatAmount(node.amount)}
              />
              <MetricCard
                icon={<GitBranch size={14} />}
                label="Sub-items"
                value={childCount > 0 ? String(childCount) : '—'}
              />
              <MetricCard
                icon={<TypeIcon size={14} className={typeMeta.color} />}
                label="Effect"
                value={typeMeta.label}
                valueClass={typeMeta.color}
              />
            </div>
          )}

          {/* Quick summary + affects — always visible */}
          {node && (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Summary</div>
                <p className="text-zinc-200 font-secondary leading-relaxed">{node.summary}</p>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                <Users size={16} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Who is affected</div>
                  <div className="text-zinc-200 font-secondary text-sm leading-snug">{node.affects}</div>
                </div>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* AI explanation — loads async */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3 flex items-center gap-2">
              <Sparkles size={12} className="text-teal-400" />
              Plain-language explanation
            </div>
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-4">
                <Loader2 className="w-10 h-10 text-teal-400 animate-spin" />
                <div className="text-zinc-400 font-secondary animate-pulse tracking-wide uppercase text-xs">
                  Gemini 2.5 Flash analyzing text…
                </div>
              </div>
            ) : error ? (
              <div className="bg-red-500/10 border border-red-500/20 text-red-300 p-4 rounded-lg font-secondary">
                <div className="font-bold mb-1">Analysis failed</div>
                <div className="text-sm break-words">{error}</div>
              </div>
            ) : response ? (
              <div className="space-y-4">
                {response.paragraphs.map((para, i) => (
                  <p key={i} className="text-zinc-300 font-secondary leading-relaxed">
                    {para}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
};

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ icon, label, value, valueClass }) => (
  <div className="bg-white/5 border border-white/10 rounded-lg p-3">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1.5">
      {icon}
      {label}
    </div>
    <div className={`font-primary text-lg font-bold tracking-tight truncate ${valueClass ?? 'text-zinc-100'}`}>
      {value}
    </div>
  </div>
);
