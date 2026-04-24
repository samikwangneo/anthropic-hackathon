import React, { useEffect, useState } from 'react';
import { Node, ExplainRequest, ExplainResponse } from '../types';
import { api } from '../api';
import { X, Loader2 } from 'lucide-react';

interface ExplainerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  node: Node | null;
  nodePath: string[];
  billId: string | null;
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
      
      const req: ExplainRequest = {
        bill_id: billId,
        node_path: nodePath,
        node
      };

      api.explain(req)
        .then(res => {
          setResponse(res);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message || "Failed to generate explanation");
          setLoading(false);
        });
    }
  }, [isOpen, node, billId, nodePath]);

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
        className={`fixed top-0 right-0 h-full w-full sm:w-[450px] md:w-[500px] z-40 bg-zinc-950/80 backdrop-blur-xl border-l border-white/10 shadow-2xl transform transition-transform duration-500 cubic-bezier(0.19, 1, 0.22, 1) flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Section Analysis</div>
            <h2 className="text-2xl font-primary text-zinc-100 leading-tight">
              {node?.name || "Loading..."}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-6">
              <Loader2 className="w-12 h-12 text-teal-400 animate-spin" />
              <div className="text-zinc-400 font-secondary animate-pulse tracking-wide uppercase text-sm">
                Gemini 2.5 Flash analyzing text...
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg font-secondary">
              <div className="font-bold mb-1">Analysis Failed</div>
              <div className="text-sm">{error}</div>
            </div>
          ) : response ? (
            <div className="space-y-6">
              {/* Path context */}
              <div className="flex flex-wrap gap-2 text-xs font-secondary text-zinc-500 mb-6">
                {nodePath.map((p, i) => (
                  <React.Fragment key={p}>
                    <span className="bg-white/5 px-2 py-1 rounded border border-white/10">{p}</span>
                    {i < nodePath.length - 1 && <span className="pt-1 text-white/20">→</span>}
                  </React.Fragment>
                ))}
              </div>
              
              <div className="prose prose-invert prose-zinc max-w-none">
                {response.paragraphs.map((para, i) => (
                  <p key={i} className="text-zinc-300 font-secondary leading-relaxed text-lg tracking-wide">
                    {para}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
};
