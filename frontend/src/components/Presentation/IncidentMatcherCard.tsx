import React from 'react';
import { Incident } from '../../types';
import { Repeat, PlusCircle, AlertCircle, History, CheckCircle2, ShieldAlert } from 'lucide-react';

interface Props {
  incident: Incident;
}

export const IncidentMatcherCard: React.FC<Props> = ({ incident }) => {
  const match = incident.matched_incident;
  const isMatched = match?.matched ?? true; // Default true for demo pothole

  return (
    <div className={`rounded-2xl p-4.5 border transition-all shadow-xl text-left ${
      isMatched
        ? 'bg-gradient-to-br from-[#120d1c] to-[#0c0a14] border-purple-500/40 shadow-purple-500/10'
        : 'bg-[#090c14] border-cyan-500/40 shadow-cyan-500/10'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-3">
        <div className="flex items-center gap-2">
          {isMatched ? (
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Repeat className="w-4 h-4" />
            </div>
          ) : (
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <PlusCircle className="w-4 h-4" />
            </div>
          )}
          <div>
            <h3 className="text-xs font-mono font-bold text-white tracking-wider uppercase">
              {isMatched ? 'Historical Recurrence Detected' : 'New Incident Registered'}
            </h3>
            <span className="text-[10px] text-slate-400">
              {isMatched ? 'Connected to previous civic experience' : 'Baseline civic report created'}
            </span>
          </div>
        </div>

        <span className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold border ${
          isMatched
            ? 'bg-purple-950/80 text-purple-300 border-purple-800/40'
            : 'bg-cyan-950/80 text-cyan-300 border-cyan-800/40'
        }`}>
          {isMatched ? 'Recurring Defect #2' : 'New Report'}
        </span>
      </div>

      {/* Body */}
      {isMatched ? (
        <div className="space-y-3 font-sans text-xs">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-mono text-purple-400 uppercase block font-semibold">
                Matched Previous Incident Record:
              </span>
              <span className="text-white font-bold text-sm">
                {match?.title || 'Sector 4 Junction Pothole (Incident #inc_hist_001)'}
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-white/5 shrink-0">
              {match?.previous_date || '3 weeks ago'}
            </span>
          </div>

          {/* Historical Repair Failure Details */}
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase block">What Happened Previously:</span>
              <p className="text-slate-300 leading-snug">
                {match?.previous_action || 'Contractor applied 40mm cold-mix asphalt patch without clearing roadside storm drain.'}
              </p>
            </div>
            <div className="pt-2 border-t border-white/5">
              <span className="text-[10px] font-mono text-rose-400 uppercase block flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" />
                <span>Recorded Failure Outcome:</span>
              </span>
              <p className="text-rose-200/90 leading-snug">
                {match?.previous_outcome || 'Cold patch washed out in 48 hours; crater deepened to 14cm under monsoon traffic.'}
              </p>
            </div>
          </div>

          <p className="text-[11px] text-purple-200/80 font-mono">
            ⚡ City Memory Warning: Standard temporary patch will fail again. System requires permanent protocol.
          </p>
        </div>
      ) : (
        <div className="space-y-3 font-sans text-xs">
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
            <div className="flex justify-between font-mono text-[11px]">
              <span className="text-slate-400">Incident Category:</span>
              <span className="text-cyan-300 uppercase font-bold">{incident.incident_type}</span>
            </div>
            <div className="flex justify-between font-mono text-[11px]">
              <span className="text-slate-400">Assigned Ward:</span>
              <span className="text-white">{incident.location || 'Ward 11'}</span>
            </div>
            <div className="flex justify-between font-mono text-[11px]">
              <span className="text-slate-400">Initial Priority:</span>
              <span className="text-amber-400 uppercase font-bold">{incident.severity}</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            ✅ No previous recurring complaints in this ward. Incident recorded as baseline memory in MongoDB.
          </p>
        </div>
      )}
    </div>
  );
};
