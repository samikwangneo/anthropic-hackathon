import React from 'react';
import { BillMeta } from '../types';
import { ChevronDown, FileText } from 'lucide-react';

interface BillPickerProps {
  bills: BillMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export const BillPicker: React.FC<BillPickerProps> = ({ bills, selectedId, onSelect }) => {
  return (
    <div className="relative group w-full max-w-md">
      <div className="absolute inset-0 bg-teal-500/20 blur-xl group-hover:bg-teal-500/30 transition-all rounded-full pointer-events-none" />
      <div className="relative flex items-center bg-zinc-900/90 border border-white/10 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden">
        <div className="pl-4 text-teal-400">
          <FileText size={20} />
        </div>
        <select
          value={selectedId || ''}
          onChange={e => onSelect(e.target.value)}
          className="w-full appearance-none bg-transparent border-none py-4 pl-4 pr-12 text-zinc-100 font-primary text-lg focus:outline-none cursor-pointer focus:ring-0"
        >
          <option value="" disabled className="bg-zinc-900 text-zinc-500">
            Select a legislation to analyze...
          </option>
          {bills.map(b => (
            <option key={b.id} value={b.id} className="bg-zinc-900 text-zinc-100">
              {b.title}
            </option>
          ))}
        </select>
        <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-zinc-400">
          <ChevronDown size={20} />
        </div>
      </div>
      
      {selectedId && (
        <div className="absolute top-full mt-4 p-4 bg-zinc-900/50 backdrop-blur-sm border border-white/5 rounded-xl text-sm font-secondary text-zinc-400 max-w-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {bills.find(b => b.id === selectedId)?.description}
        </div>
      )}
    </div>
  );
};
