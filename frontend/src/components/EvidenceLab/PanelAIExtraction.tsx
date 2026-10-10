import React, { useState } from 'react';
import { Incident, IncidentCategory } from '../../types';
import { Cpu, ShieldCheck, AlertTriangle, CheckCircle, Edit3, Sparkles } from 'lucide-react';
import { api } from '../../services/api';

interface Props {
  incident: Incident;
  onIncidentUpdated: (updated: Incident) => void;
}

export const PanelAIExtraction: React.FC<Props> = ({ incident, onIncidentUpdated }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedCat, setSelectedCat] = useState<IncidentCategory>(incident.incident_type);
  const [isVerifying, setIsVerifying] = useState(false);

  const confidencePct = Math.round((incident.confidence_score || 0.85) * 100);

  const handleVerify = async (status: 'verified' | 'rejected') => {
    setIsVerifying(true);
    try {
      const res = await api.verifyIncident(incident._id, {
        verification_status: status,
        corrected_category: selectedCat !== incident.incident_type ? selectedCat : undefined,
      });
      onIncidentUpdated(res);
      setIsEditing(false);
    } catch (err) {
      alert('Failed to update verification status');
    } finally {
      setIsVerifying(false);
    }
  };

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'critical': return 'text-rose-400 bg-rose-950/60 border-rose-800/40';
      case 'high': return 'text-amber-400 bg-amber-950/60 border-amber-800/40';
      case 'medium': return 'text-cyan-400 bg-cyan-950/60 border-cyan-800/40';
      default: return 'text-slate-400 bg-slate-900 border-slate-800';
    }
  };

  return (
    <div className="panel-glass rounded-2xl flex flex-col h-full border border-white/10 overflow-hidden shadow-xl">
      {/* Panel Header */}
      <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between bg-black/30">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wider uppercase font-mono">
              Panel 2: AI Extraction Engine
            </h3>
            <p className="text-[10px] text-slate-400">Structured interpretation of evidence</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-semibold ${getSeverityColor(incident.severity)}`}>
            {incident.severity}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex-1 flex flex-col justify-between overflow-y-auto space-y-4">
        {/* Core Extracted Narrative */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Extracted Description:
            </span>
            <span className="text-xs font-mono text-cyan-400">{confidencePct}% Confidence</span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#07090e] border border-white/10 text-sm text-slate-200 leading-relaxed font-sans shadow-inner">
            {incident.extracted_text || incident.raw_content || 'Extracting evidence features...'}
          </div>

          {/* Confidence Progress Bar */}
          <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-1.5 transition-all duration-500"
              style={{ width: `${confidencePct}%` }}
            ></div>
          </div>
        </div>

        {/* Feature Extraction Breakdown */}
        <div className="rounded-xl p-3.5 bg-white/[0.02] border border-white/[0.06] space-y-2.5">
          <div className="text-[11px] font-mono uppercase text-slate-400 tracking-wider">
            Forensic Signal Telemetry:
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2 rounded bg-black/40 border border-white/5">
              <span className="text-slate-500 text-[10px] block">Detected Defect</span>
              <span className="text-cyan-300 font-semibold uppercase">{incident.incident_type}</span>
            </div>
            <div className="p-2 rounded bg-black/40 border border-white/5">
              <span className="text-slate-500 text-[10px] block">Verification Status</span>
              <span className={incident.verification_status === 'verified' ? 'text-emerald-400' : 'text-amber-400'}>
                {incident.verification_status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          </div>

          {incident.evidence_summary?.key_observations && (
            <div className="text-xs text-slate-300 space-y-1 pt-1 font-sans">
              <span className="text-[10px] text-slate-500 font-mono uppercase block">Visual Observations:</span>
              <ul className="list-disc list-inside space-y-0.5 text-slate-400 text-[11px]">
                {incident.evidence_summary.key_observations.map((obs: string, idx: number) => (
                  <li key={idx}>{obs}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Grounded Recommendation Output */}
        {incident.recommendation && (
          <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-800/30 space-y-1.5 text-left">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider font-bold">
                City Memory Recommendation:
              </span>
              {incident.related_memory_ids?.length > 0 && (
                <span className="text-[10px] font-mono text-slate-400">
                  Linked: {incident.related_memory_ids[0]}
                </span>
              )}
            </div>
            <p className="text-xs text-cyan-200 leading-relaxed font-sans">
              {incident.recommendation}
            </p>
          </div>
        )}

        {/* Verification Controls (Step 6 of spec) */}
        <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between gap-2">
          {isEditing ? (
            <div className="flex items-center gap-2 w-full">
              <select
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value as IncidentCategory)}
                className="bg-[#0e121e] border border-white/20 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono flex-1"
              >
                <option value="pothole">Pothole</option>
                <option value="garbage">Solid Waste</option>
                <option value="street_light">Street Light</option>
                <option value="drainage">Drainage</option>
                <option value="road_crack">Road Crack</option>
              </select>
              <button
                disabled={isVerifying}
                onClick={() => handleVerify('verified')}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors cursor-pointer"
              >
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Forensic Human Verification</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Correct</span>
                </button>
                <button
                  disabled={isVerifying || incident.verification_status === 'verified'}
                  onClick={() => handleVerify('verified')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    incident.verification_status === 'verified'
                      ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/30'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{incident.verification_status === 'verified' ? 'Verified' : 'Verify'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
