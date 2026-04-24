import React from 'react';
import { Node } from '../types';

interface TooltipProps {
  node: Node | null;
  x: number;
  y: number;
}

export const Tooltip: React.FC<TooltipProps> = ({ node, x, y }) => {
  if (!node) return null;

  const formatAmount = (amount: number | null) => {
    if (amount === null) return '—';
    if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(1)}B`;
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    return `$${amount.toLocaleString()}`;
  };

  const typeColors: Record<string, string> = {
    increase: 'bg-teal-500',
    cut: 'bg-red-400',
    new: 'bg-purple-500',
    repeal: 'bg-orange-500',
    neutral: 'bg-gray-400'
  };

  return (
    <div 
      className="fixed pointer-events-none z-50 transform -translate-x-1/2 -translate-y-full"
      style={{ left: x, top: y - 15 }}
    >
      <div className="bg-white/90 backdrop-blur-md border border-white/20 shadow-xl rounded-xl p-4 w-72 text-sm text-gray-800">
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200">
          <h3 className="font-bold font-primary text-gray-900 truncate pr-2">{node.name}</h3>
          <div className={`px-2 py-0.5 rounded-full text-xs text-white font-medium ${typeColors[node.type] || 'bg-gray-400'} uppercase tracking-wider`}>
            {node.type}
          </div>
        </div>
        
        <div className="space-y-2 font-secondary">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 uppercase text-xs font-bold tracking-wider w-16">Amount</span>
            <span className="font-semibold text-gray-900">{formatAmount(node.amount)}</span>
          </div>
          
          <div className="flex items-start gap-2">
            <span className="text-gray-500 uppercase text-xs font-bold tracking-wider w-16 pt-0.5">Affects</span>
            <span className="leading-tight text-gray-700">{node.affects}</span>
          </div>
          
          <div className="pt-2 mt-2 border-t border-gray-100 text-gray-600 italic leading-snug">
            "{node.summary}"
          </div>
        </div>
      </div>
    </div>
  );
};
