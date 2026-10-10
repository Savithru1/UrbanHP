import React, { useState } from 'react';
import { Incident } from '../../types';
import { Scan, AlertTriangle, Eye, ShieldCheck, Sparkles, Clock } from 'lucide-react';

interface Props {
  incident: Incident;
}

export const DefectHighlighter: React.FC<Props> = ({ incident }) => {
  const [showOverlay, setShowOverlay] = useState(true);

  const isImage = incident.input_type === 'image';
  const isVideo = incident.input_type === 'video';
  const isVoice = incident.input_type === 'voice';
  const isText = incident.input_type === 'text';

  // Fallback bounding box if not provided
  const bbox = incident.bounding_box || {
    x: 35.0,
    y: 38.0,
    width: 36.0,
    height: 34.0,
    label: 'POTHOLE FAULT DETECTED (14cm CAVITY)',
    confidence: 0.94,
    severity: 'critical'
  };

  const keyframes = incident.evidence_summary?.keyframes || [];

  return (
    <div className="rounded-2xl bg-[#090b14] border border-white/10 overflow-hidden shadow-2xl relative flex flex-col h-full">
      {/* Window Header */}
      <div className="px-4 py-3 bg-black/40 border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Scan className="w-4 h-4" />
          </div>
          <span className="text-xs font-mono font-bold text-white tracking-wider uppercase">
            AI Visual Fault Localizer
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isImage && (
            <button
              onClick={() => setShowOverlay(!showOverlay)}
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors cursor-pointer"
            >
              {showOverlay ? 'Hide Highlight' : 'Show Highlight'}
            </button>
          )}
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40 uppercase font-semibold">
            {incident.input_type} input
          </span>
        </div>
      </div>

      {/* Main Visual Display */}
      <div className="p-4 flex-1 flex flex-col justify-center items-center relative overflow-hidden bg-[#05060a]">
        {isImage && (
          <div className="relative w-full max-h-[340px] flex items-center justify-center rounded-xl overflow-hidden group">
            {/* Base Image */}
            <img
              src={incident.file_url || '/sample_evidence/pothole_sample.jpg'}
              alt="Uploaded civic evidence"
              className="max-h-[320px] w-auto max-w-full object-contain rounded-lg"
            />

            {/* High-tech Scanning Laser Animation */}
            {showOverlay && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
                <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-75 shadow-[0_0_15px_#22d3ee] animate-[bounce_3s_infinite]"></div>
              </div>
            )}

            {/* Defect Bounding Box & Target Reticle */}
            {showOverlay && (
              <div
                className="absolute border-2 border-cyan-400/90 bg-cyan-500/10 rounded-sm pointer-events-none transition-all duration-300 shadow-[0_0_20px_rgba(34,211,238,0.3)]"
                style={{
                  left: `${bbox.x}%`,
                  top: `${bbox.y}%`,
                  width: `${bbox.width}%`,
                  height: `${bbox.height}%`,
                }}
              >
                {/* Corner Tech Brackets */}
                <div className="absolute -top-1.5 -left-1.5 w-3 h-3 border-t-2 border-l-2 border-cyan-300"></div>
                <div className="absolute -top-1.5 -right-1.5 w-3 h-3 border-t-2 border-r-2 border-cyan-300"></div>
                <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 border-b-2 border-l-2 border-cyan-300"></div>
                <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 border-b-2 border-r-2 border-cyan-300"></div>

                {/* Center Crosshair */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full border border-cyan-400/80 flex items-center justify-center animate-ping">
                    <div className="w-1 h-1 bg-cyan-400 rounded-full"></div>
                  </div>
                </div>

                {/* Defect Tag Badge */}
                <div className="absolute -top-7 left-0 bg-black/90 backdrop-blur-md border border-cyan-500/50 text-cyan-300 px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight whitespace-nowrap shadow-md flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  <span>{bbox.label || 'POTHOLE FAULT DETECTED'}</span>
                  <span className="text-slate-400">({Math.round((bbox.confidence || 0.94) * 100)}%)</span>
                </div>
              </div>
            )}
          </div>
        )}

        {isVideo && (
          <div className="w-full space-y-3">
            <video
              controls
              src={incident.file_url}
              className="w-full max-h-[220px] object-contain rounded-xl bg-black border border-white/10"
            />
            {keyframes.length > 0 && (
              <div className="space-y-1.5 text-left">
                <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-cyan-400" />
                  <span>Keyframes Extracted (Peak defect at {incident.evidence_summary?.peak_hazard_timestamp || '00:04'}):</span>
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {keyframes.map((kf: any, idx: number) => (
                    <div key={idx} className="relative rounded-lg overflow-hidden border border-white/10 bg-black/40">
                      <img src={kf.thumbnail_url} alt="Frame" className="w-full h-12 object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[9px] font-mono text-cyan-300 text-center">
                        {kf.timestamp}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {isVoice && (
          <div className="w-full p-6 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mx-auto animate-pulse">
              <Scan className="w-8 h-8" />
            </div>
            <audio controls src={incident.file_url || '/sample_evidence/voice_sample.wav'} className="w-full max-w-sm mx-auto h-9" />
            <p className="text-xs font-mono text-slate-400">
              Audio Duration: {incident.evidence_summary?.audio_duration_seconds || '4.2'}s • Indian Urban Dialect
            </p>
          </div>
        )}

        {isText && (
          <div className="w-full p-4 text-left">
            <span className="text-[10px] font-mono text-slate-500 uppercase block mb-1">Citizen Raw Statement:</span>
            <p className="text-sm text-slate-200 italic font-sans p-3 rounded-xl bg-white/[0.03] border-l-2 border-cyan-500">
              "{incident.raw_content || 'No text submitted'}"
            </p>
          </div>
        )}
      </div>

      {/* Telemetry Footer */}
      <div className="px-4 py-2.5 bg-black/60 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-slate-400">
        <span className="flex items-center gap-1.5 text-cyan-300">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Fault Status: {incident.severity.toUpperCase()} PRIORITY</span>
        </span>
        <span>Location: {incident.location || 'Ward 4, Sector 7'}</span>
      </div>
    </div>
  );
};
