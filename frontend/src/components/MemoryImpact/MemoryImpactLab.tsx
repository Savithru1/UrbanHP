import React, { useEffect, useState } from 'react';
import { Incident, Memory } from '../../types';
import { api } from '../../services/api';
import { 
  BrainCircuit, 
  Sparkles, 
  ArrowRight, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  GitCompare,
  ExternalLink
} from 'lucide-react';

export const MemoryImpactLab: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);

  // Editable memory field
  const [editProtocol, setEditProtocol] = useState('');
  const [updateReason, setUpdateReason] = useState('Field inspection confirmed cold-mix washed away; geotextile reinforcement required');
  const [isUpdatingMemory, setIsUpdatingMemory] = useState(false);
  const [isReevaluating, setIsReevaluating] = useState(false);

  // Before & After comparison states
  const [previousRecommendation, setPreviousRecommendation] = useState<string | null>(null);
  const [newRecommendation, setNewRecommendation] = useState<string | null>(null);
  const [reasoningTrace, setReasoningTrace] = useState<string | null>(null);
  const [hasReevaluated, setHasReevaluated] = useState(false);

  const fetchData = async () => {
    try {
      const [incs, mems] = await Promise.all([api.getIncidents(), api.getMemories()]);
      setIncidents(incs);
      setMemories(mems);

      if (incs.length > 0) {
        setSelectedIncident(incs[0]);
        setPreviousRecommendation(incs[0].recommendation || null);
      }
      if (mems.length > 0) {
        setSelectedMemory(mems[0]);
        setEditProtocol(mems[0].recommended_protocol);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectMemory = (mem: Memory) => {
    setSelectedMemory(mem);
    setEditProtocol(mem.recommended_protocol);
  };

  const handleSaveMemoryUpdate = async () => {
    if (!selectedMemory) return;
    setIsUpdatingMemory(true);
    try {
      const res = await api.updateMemory(selectedMemory._id, {
        recommended_protocol: editProtocol,
        update_reason: updateReason,
      });
      setSelectedMemory(res.memory);
      setMemories((prev) => prev.map((m) => (m._id === res.memory._id ? res.memory : m)));
      alert(`City Memory '${res.memory._id}' updated in MongoDB Compass! Now click 'Re-Evaluate Incident' below.`);
    } catch (err) {
      alert('Error updating memory: ' + err);
    } finally {
      setIsUpdatingMemory(false);
    }
  };

  const handleTriggerReevaluation = async () => {
    if (!selectedIncident) return;
    setIsReevaluating(true);
    try {
      const beforeRec = selectedIncident.recommendation;
      setPreviousRecommendation(beforeRec || 'Standard pavement cold-patch maintenance.');

      const res = await api.reEvaluateIncident(selectedIncident._id);
      setSelectedIncident(res.incident);
      setNewRecommendation(res.incident.recommendation || null);
      setReasoningTrace(res.incident.reasoning_trace || null);
      setHasReevaluated(true);
    } catch (err) {
      alert('Error triggering re-evaluation: ' + err);
    } finally {
      setIsReevaluating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300 text-left">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/60 border border-purple-800/40 text-purple-300 text-xs font-mono">
          <BrainCircuit className="w-3.5 h-3.5" />
          <span>Act 4 & 5 Demonstration Studio</span>
        </div>
        <h2 className="text-2xl font-extrabold text-white font-heading tracking-tight">
          Memory Impact & Re-evaluation Lab
        </h2>
        <p className="text-sm text-slate-400 max-w-xl mx-auto">
          Prove that UrbanHP has evolving persistent memory: Update a lesson learned in MongoDB, re-evaluate the incident, and observe the recommendation adapt.
        </p>
      </div>

      {/* Step Workflow Guide */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-[#090b12] border border-white/5 space-y-1">
          <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase block">Act 3: Historical Retrieval</span>
          <p className="text-xs text-slate-300">System links current pothole report to past failure record in Sector 4.</p>
        </div>
        <div className="p-3.5 rounded-xl bg-[#090b12] border border-purple-500/30 space-y-1">
          <span className="text-[10px] font-mono text-purple-300 font-bold uppercase block">Act 4: Update Memory</span>
          <p className="text-xs text-slate-300">Update memory in MongoDB Compass or the form below with new diagnostic findings.</p>
        </div>
        <div className="p-3.5 rounded-xl bg-[#090b12] border border-emerald-500/30 space-y-1">
          <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase block">Act 5 & 6: Re-evaluate & Compare</span>
          <p className="text-xs text-slate-300">Click Re-evaluate to see the updated recommendation with transparent reasoning.</p>
        </div>
      </div>

      {/* Control Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Card: Select Incident */}
        <div className="panel-glass rounded-2xl p-5 border border-white/10 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
            <span className="text-xs font-mono text-slate-400 uppercase font-semibold">
              Target Incident to Re-Evaluate
            </span>
            <span className="text-xs font-mono text-cyan-400">
              v{selectedIncident?.version || 1}
            </span>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1.5">
              Select Incident Record:
            </label>
            <select
              value={selectedIncident?._id}
              onChange={(e) => {
                const found = incidents.find((i) => i._id === e.target.value);
                if (found) {
                  setSelectedIncident(found);
                  setPreviousRecommendation(found.recommendation || null);
                  setHasReevaluated(false);
                }
              }}
              className="w-full bg-[#07090e] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none"
            >
              {incidents.map((inc) => (
                <option key={inc._id} value={inc._id}>
                  {inc._id} - {inc.incident_type.toUpperCase()} ({inc.location})
                </option>
              ))}
            </select>
          </div>

          {selectedIncident && (
            <div className="p-3.5 rounded-xl bg-[#07090e] border border-white/5 space-y-2 text-xs">
              <div className="text-slate-400 font-mono text-[11px]">Current Extracted Evidence:</div>
              <p className="text-slate-200 font-sans leading-relaxed">
                {selectedIncident.extracted_text || selectedIncident.raw_content}
              </p>
              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Input: {selectedIncident.input_type}</span>
                <span className="text-amber-400 uppercase">Severity: {selectedIncident.severity}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Card: Memory Editor (Act 4) */}
        <div className="panel-glass rounded-2xl p-5 border border-white/10 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
            <span className="text-xs font-mono text-purple-300 uppercase font-semibold flex items-center gap-1.5">
              <BrainCircuit className="w-3.5 h-3.5 text-purple-400" />
              <span>City Memory Record: {selectedMemory?._id}</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40">
              Persistent Knowledge
            </span>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1.5">
              Select Memory to Modify:
            </label>
            <select
              value={selectedMemory?._id}
              onChange={(e) => {
                const found = memories.find((m) => m._id === e.target.value);
                if (found) handleSelectMemory(found);
              }}
              className="w-full bg-[#07090e] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none"
            >
              {memories.map((m) => (
                <option key={m._id} value={m._id}>
                  {m._id} - {m.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1.5">
              Recommended Protocol (Edit to trigger changed recommendation):
            </label>
            <textarea
              rows={3}
              value={editProtocol}
              onChange={(e) => setEditProtocol(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#07090e] border border-white/10 text-xs font-sans text-cyan-200 focus:outline-none focus:border-cyan-500/50 leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] font-mono text-slate-500">
              Audit event recorded in `urbanhp.memory_events`
            </span>
            <button
              onClick={handleSaveMemoryUpdate}
              disabled={isUpdatingMemory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isUpdatingMemory ? 'Saving...' : 'Update Memory in Compass'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Central Re-evaluation Trigger Button */}
      <div className="text-center py-2">
        <button
          onClick={handleTriggerReevaluation}
          disabled={isReevaluating}
          className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-cyan-600 to-blue-600 hover:opacity-90 text-white font-extrabold text-sm shadow-xl shadow-cyan-500/20 transition-all cursor-pointer disabled:opacity-50"
        >
          <Sparkles className={`w-4 h-4 ${isReevaluating ? 'animate-spin' : ''}`} />
          <span>{isReevaluating ? 'Executing Vector RAG Re-Evaluation...' : 'Re-Evaluate Incident with Updated Memory'}</span>
        </button>
      </div>

      {/* Act 6: Side-by-Side Comparison of Recommendations */}
      <div className="panel-glass rounded-3xl p-6 border border-white/10 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white font-heading">
              Act 6: Recommendation Impact Analysis
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {hasReevaluated ? '✅ Memory Update Reflected' : 'Awaiting re-evaluation'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Before */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-2">
            <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider font-semibold">
              Original Recommendation (Before Update)
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              {previousRecommendation || 'Sub-base saturation detected: Clear adjacent stormwater culvert before deploying hot-mix PMB asphalt compaction.'}
            </p>
          </div>

          {/* After */}
          <div className={`p-4 rounded-2xl border transition-all space-y-2 ${
            hasReevaluated ? 'bg-cyan-950/20 border-cyan-500/40 glow-cyan' : 'bg-black/20 border-white/5'
          }`}>
            <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider font-semibold flex items-center justify-between">
              <span>Updated Recommendation (After Memory Update)</span>
              {hasReevaluated && <span className="text-[9px] bg-cyan-900 px-1.5 py-0.2 rounded font-bold">LIVE</span>}
            </div>
            <p className="text-xs text-cyan-100 leading-relaxed font-sans font-medium">
              {newRecommendation || 'Click "Re-Evaluate Incident with Updated Memory" to observe the new recommendation.'}
            </p>
          </div>
        </div>

        {/* Reasoning Trace Explanation */}
        {reasoningTrace && (
          <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-800/30 text-xs text-purple-200/90 leading-relaxed font-sans">
            <div className="font-mono text-[10px] uppercase text-purple-400 font-bold mb-1">
              Transparent AI Reasoning Trace:
            </div>
            {reasoningTrace}
          </div>
        )}
      </div>
    </div>
  );
};
