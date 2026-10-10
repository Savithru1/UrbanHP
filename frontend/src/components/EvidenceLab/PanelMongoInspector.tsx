import React, { useState } from 'react';
import { Incident } from '../../types';
import { Database, Check, Copy, RefreshCw, FileCode, ArrowRight } from 'lucide-react';

interface Props {
  incident: Incident;
  onRefresh: () => void;
}

export const PanelMongoInspector: React.FC<Props> = ({ incident, onRefresh }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'timeline' | 'json'>('timeline');

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(incident, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    <div className="panel-glass rounded-2xl flex flex-col h-full border border-white/10 overflow-hidden shadow-xl">
      {/* Panel Header */}
      <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between bg-black/30">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wider uppercase font-mono">
              Panel 3: Live MongoDB Record
            </h3>
            <p className="text-[10px] text-slate-400">Synchronized with MongoDB Compass</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <div className="flex bg-[#07090e] p-0.5 rounded-lg border border-white/10 text-[10px] font-mono">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-2 py-0.5 rounded transition-colors ${
                activeTab === 'timeline' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400'
              }`}
            >
              Stages
            </button>
            <button
              onClick={() => setActiveTab('json')}
              className={`px-2 py-0.5 rounded transition-colors ${
                activeTab === 'json' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400'
              }`}
            >
              JSON
            </button>
          </div>
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Refresh record from MongoDB"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex-1 flex flex-col justify-between overflow-y-auto space-y-4">
        {/* Document Header Metrics */}
        <div className="p-3.5 rounded-xl bg-[#07090e] border border-white/10 space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[11px]">_id:</span>
            <span className="text-cyan-300 font-bold select-all">{incident._id}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Collection:</span>
            <span className="text-emerald-400 font-medium">urbanhp.incidents</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Document Version:</span>
            <span className="px-1.5 py-0.2 rounded bg-purple-950/80 text-purple-300 border border-purple-800/40 font-bold">
              v{incident.version}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Last Database Mutation:</span>
            <span className="text-slate-300">
              {new Date(incident.updated_at).toLocaleTimeString()}
            </span>
          </div>
        </div>

        {/* Tab 1: Progressive Pipeline Stages Timeline */}
        {activeTab === 'timeline' ? (
          <div className="space-y-3">
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Pipeline Stage Progression:</span>
              <span className="text-emerald-400 text-[10px] font-bold">
                {incident.processing_status.toUpperCase()}
              </span>
            </div>

            <div className="space-y-2">
              {stages.map((st, idx) => {
                const isPassed = currentStageIndex >= idx || incident.processing_status === 'completed';
                const isCurrent = incident.processing_status === st.key;
                const matchedLog = incident.processing_stages?.find((ps) => ps.stage === st.key);

                return (
                  <div
                    key={st.key}
                    className={`p-2.5 rounded-xl border text-xs transition-all ${
                      isCurrent
                        ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-200'
                        : isPassed
                        ? 'bg-white/[0.02] border-white/10 text-slate-300'
                        : 'bg-black/20 border-white/5 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            isCurrent
                              ? 'bg-cyan-400 animate-ping'
                              : isPassed
                              ? 'bg-emerald-400'
                              : 'bg-slate-700'
                          }`}
                        ></div>
                        <span className="font-semibold">{st.label}</span>
                      </div>
                      {matchedLog && (
                        <span className="text-[10px] text-slate-500">
                          {new Date(matchedLog.timestamp).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    {matchedLog?.detail && (
                      <p className="text-[11px] text-slate-400 mt-1 pl-4 font-sans">
                        {matchedLog.detail}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Tab 2: Raw MongoDB Compass JSON View */
          <div className="space-y-2 flex-1 flex flex-col">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                Raw BSON / JSON Document:
              </span>
              <button
                onClick={handleCopyJson}
                className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-[#050609] border border-white/10 font-mono text-[11px] text-cyan-300/90 overflow-x-auto max-h-[260px] leading-relaxed select-all">
              {JSON.stringify(incident, null, 2)}
            </pre>
          </div>
        )}

        {/* MongoDB Compass Inspection Guidance Callout */}
        <div className="pt-3 border-t border-white/[0.08] text-[11px] font-mono text-slate-400 bg-white/[0.01] p-3 rounded-xl border border-white/[0.05]">
          <div className="flex items-center gap-1.5 text-cyan-300 font-semibold mb-1">
            <Database className="w-3.5 h-3.5" />
            <span>MongoDB Compass Query Filter:</span>
          </div>
          <div className="p-1.5 rounded bg-black/60 text-slate-300 select-all border border-white/5">
            {`{ "_id": "${incident._id}" }`}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5 font-sans leading-tight">
            Paste this query into Compass filter bar to inspect the exact live document.
          </p>
        </div>
      </div>
    </div>
  );
};
