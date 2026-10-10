import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { AlertCircle, Brain, Wrench, CheckCircle2, ShieldAlert } from 'lucide-react';

export const IncidentNode = ({ data }: any) => {
  return (
    <div className="p-3.5 rounded-xl bg-[#090c16] border-2 border-cyan-500/60 shadow-xl shadow-cyan-500/10 min-w-[220px] max-w-[260px] text-left">
      <Handle type="source" position={Position.Right} className="!bg-cyan-400 !w-2.5 !h-2.5" />
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40 uppercase font-bold">
          {data.label}
        </span>
        <span className="text-[9px] font-mono text-slate-400 uppercase">{data.type}</span>
      </div>
      <div className="text-xs font-mono font-bold text-white mb-1 truncate">{data.id}</div>
      <div className="text-[11px] text-slate-300 line-clamp-2 leading-tight font-sans mb-1.5">
        {data.extracted}
      </div>
      <div className="text-[9px] font-mono text-slate-500">📍 {data.location}</div>
    </div>
  );
};

export const MemoryNode = ({ data }: any) => {
  return (
    <div className="p-3.5 rounded-xl bg-[#0a101a] border-2 border-emerald-500/60 shadow-xl shadow-emerald-500/10 min-w-[240px] max-w-[280px] text-left">
      <Handle type="target" position={Position.Left} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1 text-emerald-400 text-[10px] font-mono font-bold uppercase">
          <Brain className="w-3 h-3" />
          <span>City Memory</span>
        </div>
        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 uppercase">
          {data.risk} risk
        </span>
      </div>
      <div className="text-xs font-heading font-bold text-white mb-1 leading-snug">{data.title}</div>
      <div className="text-[11px] text-emerald-200/80 line-clamp-2 leading-tight font-sans mb-1.5">
        {data.lesson}
      </div>
      <div className="text-[9px] font-mono text-cyan-300 line-clamp-1">
        Protocol: {data.protocol}
      </div>
    </div>
  );
};

export const ActionNode = ({ data }: any) => {
  return (
    <div className="p-3 rounded-xl bg-[#120f08] border border-amber-500/50 shadow-lg min-w-[190px] text-left">
      <Handle type="target" position={Position.Left} className="!bg-amber-400 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Right} className="!bg-amber-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-1.5 text-amber-400 text-[10px] font-mono font-semibold mb-1">
        <Wrench className="w-3 h-3" />
        <span className="uppercase">{data.action}</span>
      </div>
      <div className="text-xs font-bold text-slate-200 truncate">{data.dept}</div>
      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{data.contractor || 'Municipal Crew'}</div>
    </div>
  );
};

export const OutcomeNode = ({ data }: any) => {
  return (
    <div className="p-3 rounded-xl bg-[#14080b] border border-rose-500/50 shadow-lg min-w-[190px] text-left">
      <Handle type="target" position={Position.Left} className="!bg-rose-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-1.5 text-rose-400 text-[10px] font-mono font-semibold mb-1">
        <ShieldAlert className="w-3 h-3" />
        <span>Recorded Outcome</span>
      </div>
      <div className="text-[11px] text-slate-200 line-clamp-2 font-sans mb-1 leading-tight">
        {data.observation}
      </div>
      <div className="text-[9px] font-mono text-rose-300">
        {data.recurrence ? '⚠️ Recurrence Confirmed' : '✅ Stable'}
      </div>
    </div>
  );
};
