import React from 'react';
import { MemoryUniverseFlow } from '../MemoryUniverse/MemoryUniverseFlow';
import { X, GitFork } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const MemoryUniverseModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#090b14] border border-white/15 rounded-3xl w-full max-w-6xl h-[85vh] flex flex-col shadow-2xl overflow-hidden relative text-left">
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <GitFork className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white font-heading">
                UrbanHP City Memory Universe (Powered by xyflow)
              </h2>
              <p className="text-[11px] text-slate-400">
                Interactive relationship graph: Incident $\rightarrow$ Vector Match $\rightarrow$ Validated Memory $\rightarrow$ Historical Action $\rightarrow$ Recorded Outcome
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Graph Body */}
        <div className="flex-1 w-full h-full p-2">
          <MemoryUniverseFlow />
        </div>
      </div>
    </div>
  );
};
