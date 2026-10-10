import React from 'react';
import { Incident } from '../../types';
import { ArrowRight, Cpu, FileText, CheckCircle2, Sparkles } from 'lucide-react';

interface Props {
  incident: Incident;
}

export const SignalToTextConverter: React.FC<Props> = ({ incident }) => {
  const confidence = Math.round((incident.confidence_score || 0.88) * 100);

  return (
    <div className="rounded-2xl bg-[#090b14] border border-white/10 p-4 shadow-xl space-y-3 text-left">
      {/* Transformation Pipeline Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
            Signal-to-Text Transformation Engine
          </span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40">
          {confidence}% Extraction Confidence
        </span>
      </div>

      {/* Visual Pipeline Flow Step Pills */}
      <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
        <div className="p-2 rounded-lg bg-black/40 border border-white/5 text-slate-400">
          <span className="block text-slate-500 text-[9px]">STEP 1</span>
          <span className="text-slate-200 uppercase">{incident.input_type} Ingested</span>
        </div>
        <div className="p-2 rounded-lg bg-cyan-950/40 border border-cyan-800/30 text-cyan-300">
          <span className="block text-cyan-400 text-[9px]">STEP 2</span>
          <span>Fault Extracted</span>
        </div>
        <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/30 text-emerald-300">
          <span className="block text-emerald-400 text-[9px]">STEP 3</span>
          <span>Normalized Text</span>
        </div>
      </div>

      {/* Extracted Text Box */}
      <div className="p-3.5 rounded-xl bg-[#050609] border border-white/10 font-sans text-xs text-slate-200 leading-relaxed relative group shadow-inner">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1.5">
          <span>Final Structured Narrative:</span>
          <span className="text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Ready for MongoDB Storing</span>
          </span>
        </div>
        <p className="text-slate-100 font-medium font-sans">
          "{incident.extracted_text || incident.raw_content || 'Extracting features...'}"
        </p>
      </div>
    </div>
  );
};
