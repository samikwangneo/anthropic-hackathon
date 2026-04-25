import React, { useEffect, useState } from 'react';
import { api } from './api';
import { BillMeta, Node } from './types';
import { Sunburst } from './components/Sunburst';
import { ExplainerPanel } from './components/ExplainerPanel';
import { BillPicker } from './components/BillPicker';
import { LayoutGrid, Layers, UploadCloud } from 'lucide-react';

function App() {
  const [bills, setBills] = useState<BillMeta[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [hierarchy, setHierarchy] = useState<Node | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [selectedNode, setSelectedNode] = useState<{ node: Node, path: string[] } | null>(null);
  const [uploadFlash, setUploadFlash] = useState(false);

  useEffect(() => {
    api.getBills()
      .then(b => {
        setBills(b);
        setFetchError(null);
      })
      .catch(err => {
        console.error(err);
        setFetchError(`Could not load bills: ${err.message ?? err}`);
      });
  }, []);

  useEffect(() => {
    if (selectedBillId) {
      setHierarchy(null);
      setFetchError(null);
      api.getHierarchy(selectedBillId)
        .then(setHierarchy)
        .catch(err => {
          console.error(err);
          setFetchError(`Could not load hierarchy: ${err.message ?? err}`);
        });
    }
  }, [selectedBillId]);

  const selectedBill = bills.find(b => b.id === selectedBillId) ?? null;

  return (
    <div className="min-h-screen bg-[#090a0f] text-zinc-100 overflow-hidden flex flex-col font-primary selection:bg-teal-500/30 selection:text-teal-200 relative">
      {/* Background aesthetics */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-teal-900/20 blur-[150px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-900/20 blur-[150px] rounded-full mix-blend-screen" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />
      </div>

      {/* Header */}
      <header className="relative z-10 px-8 py-6 flex items-center justify-between border-b border-white/5 bg-black/20 backdrop-blur-lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Layers className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500">
              PoliSight
            </h1>
            <p className="text-zinc-500 font-secondary text-xs uppercase tracking-widest font-bold">
              AI Legislation Intelligence
            </p>
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-[#14b8a6] shadow-[0_0_10px_#14b8a6]" />
            <span className="text-xs uppercase tracking-widest text-zinc-400">Increase</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-[#f87171] shadow-[0_0_10px_#f87171]" />
            <span className="text-xs uppercase tracking-widest text-zinc-400">Cut</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-[#a855f7] shadow-[0_0_10px_#a855f7]" />
            <span className="text-xs uppercase tracking-widest text-zinc-400">New</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-[#f97316] shadow-[0_0_10px_#f97316]" />
            <span className="text-xs uppercase tracking-widest text-zinc-400">Repeal</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-[#9ca3af] shadow-[0_0_10px_#9ca3af]" />
            <span className="text-xs uppercase tracking-widest text-zinc-400">Neutral</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-10 flex flex-col">
        {/* Top Controls */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 w-full flex justify-center px-4">
          <div className="flex items-center gap-3">
            <BillPicker
              bills={bills}
              selectedId={selectedBillId}
              onSelect={setSelectedBillId}
            />
            <button
              type="button"
              onClick={() => {
                setUploadFlash(true);
                window.setTimeout(() => setUploadFlash(false), 1400);
              }}
              title="Upload a new bill (demo only)"
              className={`group relative h-12 px-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md flex items-center gap-2 text-zinc-200 text-sm font-secondary uppercase tracking-widest font-bold transition-all hover:bg-white/10 hover:border-teal-400/40 hover:text-teal-200 hover:shadow-[0_0_24px_rgba(20,184,166,0.25)] ${uploadFlash ? 'border-teal-400/60 text-teal-200 shadow-[0_0_24px_rgba(20,184,166,0.35)]' : ''}`}
            >
              <UploadCloud size={16} className="opacity-80 group-hover:opacity-100" />
              <span>Upload</span>
              {uploadFlash && (
                <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] tracking-widest text-teal-300/90 normal-case">
                  demo only — connect intake API to enable
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Visualization Canvas */}
        <div className="flex-1 relative flex items-center justify-center p-8 mt-20">
          {fetchError ? (
            <div className="max-w-lg text-center bg-red-500/10 border border-red-500/30 text-red-300 px-6 py-5 rounded-xl font-secondary">
              <div className="text-xs uppercase tracking-widest font-bold mb-2 text-red-400">Backend unreachable</div>
              <div className="text-sm break-words mb-3">{fetchError}</div>
              <div className="text-xs text-red-400/70">
                Is the backend running? Try <code className="bg-black/30 px-1 py-0.5 rounded">python run.py</code> at the repo root.
              </div>
            </div>
          ) : !selectedBillId ? (
            <div className="flex flex-col items-center justify-center text-center opacity-50 animation-fade-in">
              <LayoutGrid size={64} strokeWidth={1} className="mb-6 text-teal-500/50" />
              <h2 className="text-3xl font-light mb-2">Select a bill to map its impact</h2>
              <p className="text-zinc-400 font-secondary max-w-md">
                PoliSight transforms raw legislative text into an interactive, zoomable sunburst detailing policy shifts and budget allocations.
              </p>
              {bills.length > 0 && (
                <div className="mt-6 text-xs text-zinc-500 font-secondary uppercase tracking-widest">
                  {bills.length} {bills.length === 1 ? 'bill' : 'bills'} loaded from backend
                </div>
              )}
            </div>
          ) : !hierarchy ? (
            <div className="flex items-center gap-4 text-teal-400 animate-pulse font-secondary uppercase tracking-widest text-sm font-bold">
              <div className="w-4 h-4 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
              Parsing Legal Hierarchy...
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center gap-4">
              {selectedBill && (
                <div className="text-center max-w-2xl px-4">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">
                    Now mapping
                  </div>
                  <div className="text-zinc-300 font-secondary text-sm leading-snug">
                    {selectedBill.description}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500 font-secondary">
                    Click any arc to zoom · Click center to zoom out · Hover for details
                  </div>
                </div>
              )}
              <div className="w-full max-h-[700px] max-w-[700px] flex-1 animation-zoom-in">
                <Sunburst
                  data={hierarchy}
                  onClick={(node, path) => setSelectedNode({ node, path })}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Overlays */}
      <ExplainerPanel 
        isOpen={!!selectedNode} 
        onClose={() => setSelectedNode(null)}
        node={selectedNode?.node || null}
        nodePath={selectedNode?.path || []}
        billId={selectedBillId}
      />
    </div>
  );
}

export default App;
