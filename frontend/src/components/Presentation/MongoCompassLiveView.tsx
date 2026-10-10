import React, { useState } from 'react';
import { Incident } from '../../types';
import { Database, Copy, Check, ExternalLink, ArrowRight, GitCompare, RefreshCw } from 'lucide-react';

interface Props {
  incident: Incident;
  onRefresh?: () => void;
}

export const MongoCompassLiveView: React.FC<Props> = ({ incident, onRefresh }) => {
  const [viewMode, setViewMode] = useState<'after' | 'before' | 'diff'>('after');
  const [copiedQuery, setCopiedQuery] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);

  const filterQuery = `{ "_id": "${incident._id}" }`;
  const compassUri = "mongodb://127.0.0.1:27017/urbanhp";

  const handleCopyQuery = () => {
    navigator.clipboard.writeText(filterQuery);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 2000);
  };

  const handleCopyUri = () => {
    navigator.clipboard.writeText(compassUri);
    setCopiedUri(true);
    setTimeout(() => setCopiedUri(false), 2000);
  };

  const beforeDoc = incident.before_snapshot || {
    _id: incident._id,
    input_type: incident.input_type,
    processing_status: 'received',
    extracted_text: null,
    recommendation: null,
    version: 1,
    created_at: incident.created_at,
  };

  const stages = [
    { key: 'received', label: '1. Received' },
    { key: 'processing', label: '2. Processing' },
    { key: 'extracted', label: '3. Extracted' },
    { key: 'memory_linked', label: '4. Memory Link' },
    { key: 'completed', label: '5. Completed' },
  ];

  const currentStageIndex = stages.findIndex((s) => s.key === incident.processing_status);

  return (
    <div className="rounded-2xl bg-[#090b14] border border-white/10 p-4.5 shadow-2xl space-y-4 text-left">
      {/* Compass Live Connection Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                MongoDB Compass Live Synchronizer
              </h3>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </div>
            <span className="text-[10px] text-slate-400">Target: urbanhp.incidents</span>
          </div>
        </div>

        {/* Compass Connection URI pill & Direct Protocol Link */}
        <div className="flex items-center gap-1.5">
          <a
            href={compassUri}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800/50 text-[11px] font-mono text-emerald-300 transition-colors cursor-pointer"
            title="Launch MongoDB Compass directly via desktop protocol"
          >
            <ExternalLink className="w-3 h-3 text-emerald-400" />
            <span>Open Compass</span>
          </a>
          <button
            onClick={handleCopyUri}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#050609] border border-white/10 hover:border-cyan-500/40 text-[11px] font-mono text-cyan-300 transition-colors cursor-pointer"
            title="Copy MongoDB Compass URI"
          >
            {copiedUri ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span className="select-all">{compassUri}</span>
          </button>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Refresh MongoDB Document"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Progressive Stages Pipeline */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span>Active Pipeline Stages:</span>
          <span className="text-emerald-400 font-bold uppercase">v{incident.version} Stored</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {stages.map((st, i) => {
            const isDone = currentStageIndex >= i || incident.processing_status === 'completed';
            const isCurrent = incident.processing_status === st.key;
            return (
              <div
                key={st.key}
                className={`py-1.5 px-1 rounded-lg text-center font-mono text-[9px] border transition-all ${
                  isCurrent
                    ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200 font-bold shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                    : isDone
                    ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300 font-medium'
                    : 'bg-black/40 border-white/5 text-slate-600'
                }`}
              >
                {st.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Compass Query Filter Box for Pitching */}
      <div className="p-2.5 rounded-xl bg-[#050609] border border-white/5 flex items-center justify-between text-xs font-mono">
        <div>
          <span className="text-[10px] text-slate-500 block">Compass Filter Query (Press F5 in Compass):</span>
          <span className="text-cyan-300 font-semibold select-all text-[11px]">{filterQuery}</span>
        </div>
        <button
          onClick={handleCopyQuery}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[10px] transition-colors cursor-pointer"
        >
          {copiedQuery ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copiedQuery ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Before vs After View Switcher (Requirement 3) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <GitCompare className="w-3.5 h-3.5 text-cyan-400" />
            <span>Document State Inspection:</span>
          </span>

          <div className="flex bg-[#050609] p-0.5 rounded-lg border border-white/10 text-[10px] font-mono">
            <button
              onClick={() => setViewMode('before')}
              className={`px-2.5 py-0.5 rounded transition-colors ${
                viewMode === 'before' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400'
              }`}
            >
              Before (v1)
            </button>
            <button
              onClick={() => setViewMode('after')}
              className={`px-2.5 py-0.5 rounded transition-colors ${
                viewMode === 'after' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-400'
              }`}
            >
              After (v{incident.version})
            </button>
            <button
              onClick={() => setViewMode('diff')}
              className={`px-2.5 py-0.5 rounded transition-colors ${
                viewMode === 'diff' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400'
              }`}
            >
              Compare
            </button>
          </div>
        </div>

        {/* JSON Display */}
        {viewMode === 'diff' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] font-mono">
            <div className="p-3 rounded-xl bg-black/60 border border-white/5 max-h-44 overflow-y-auto">
              <span className="text-amber-400 block mb-1 font-bold">STATE AT INGESTION (v1):</span>
              <pre className="text-slate-400 leading-tight select-all">
                {JSON.stringify(beforeDoc, null, 2)}
              </pre>
            </div>
            <div className="p-3 rounded-xl bg-black/60 border border-emerald-500/30 max-h-44 overflow-y-auto">
              <span className="text-emerald-400 block mb-1 font-bold">STATE AT FINALIZATION (v{incident.version}):</span>
              <pre className="text-cyan-200/90 leading-tight select-all">
                {JSON.stringify(
                  {
                    _id: incident._id,
                    status: incident.processing_status,
                    extracted_text: incident.extracted_text,
                    matched_incident: incident.matched_incident?.status,
                    recommendation: incident.recommendation,
                    version: incident.version,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        ) : (
          <pre className="p-3 rounded-xl bg-[#050609] border border-white/10 text-[10px] font-mono text-cyan-300/90 max-h-44 overflow-y-auto select-all leading-tight">
            {JSON.stringify(viewMode === 'before' ? beforeDoc : incident, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};
