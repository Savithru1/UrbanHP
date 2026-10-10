import React, { useState } from 'react';
import { Incident } from '../../types';
import { BrainCircuit, Sparkles, Check, Database, ArrowRight } from 'lucide-react';
import { api } from '../../services/api';

interface Props {
  incident: Incident;
  onMemoryCommitted?: () => void;
}

export const RecommendationMemoryCard: React.FC<Props> = ({ incident, onMemoryCommitted }) => {
  const [isCommitting, setIsCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);

  const handleCommitMemory = async () => {
    setIsCommitting(true);
    try {
      // Commit as a persistent civic memory lesson
      const memId = incident.related_memory_ids?.[0] || 'mem_pothole_001';
      await api.updateMemory(memId, {
        recommended_protocol: incident.recommendation || 'Mandatory permanent hot-mix mastic asphalt with sub-base geotextile compaction.',
        update_reason: `Learned from verified recurring incident ${incident._id} at ${incident.location || 'Sector 4'}`
      });
      setCommitted(true);
      if (onMemoryCommitted) onMemoryCommitted();
    } catch (err) {
      alert('Error committing memory: ' + err);
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="rounded-2xl p-4.5 bg-gradient-to-br from-[#0c1424] to-[#080d18] border border-cyan-500/40 shadow-2xl shadow-cyan-500/10 text-left space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <BrainCircuit className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Memory-Informed AI Recommendation
            </h3>
            <span className="text-[10px] text-slate-400">Decision grounded in historical outcomes</span>
          </div>
        </div>

        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40 font-semibold">
          Proactive Civic Decision
        </span>
      </div>

      {/* Grounded Recommendation Box */}
      <div className="p-3.5 rounded-xl bg-[#060910] border border-cyan-500/30 space-y-2">
        <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold block">
          Prescribed Operational Action:
        </span>
        <p className="text-sm font-sans text-cyan-100 font-semibold leading-relaxed">
          {incident.recommendation || (
            "MANDATORY: Do not apply temporary cold-mix patch. Clear adjacent stormwater culvert first, excavate loose gravel, and apply hot-mix PMB asphalt with mechanical compaction."
          )}
        </p>
      </div>

      {/* Transparent AI Reasoning Trace */}
      {incident.reasoning_trace && (
        <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-xs text-slate-300 font-sans leading-relaxed">
          <span className="text-[10px] font-mono text-slate-400 uppercase block font-semibold mb-1">
            Why this decision was formulated:
          </span>
          <p className="text-slate-400 text-[11px]">
            {incident.reasoning_trace}
          </p>
        </div>
      )}

      {/* Requirement 4: Commit Lesson into MongoDB City Memory */}
      <div className="pt-2 flex items-center justify-between gap-3">
        <div className="text-[10px] font-mono text-slate-400">
          {committed ? (
            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
              <Check className="w-3.5 h-3.5" />
              <span>Persisted to MongoDB Compass (`urbanhp.memories`)</span>
            </span>
          ) : (
            <span>Store verified lesson so future complaints benefit from this</span>
          )}
        </div>

        <button
          onClick={handleCommitMemory}
          disabled={isCommitting || committed}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer shadow-lg ${
            committed
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50'
              : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-500/20'
          }`}
        >
          {committed ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Committed to City Memory</span>
            </>
          ) : (
            <>
              <Database className="w-3.5 h-3.5" />
              <span>{isCommitting ? 'Committing...' : 'Commit to City Memory'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
