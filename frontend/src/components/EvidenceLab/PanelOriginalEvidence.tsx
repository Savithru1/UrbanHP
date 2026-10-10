import React from 'react';
import { Incident } from '../../types';
import { Image as ImageIcon, Video as VideoIcon, Mic, FileText, Clock, ExternalLink } from 'lucide-react';

interface Props {
  incident: Incident;
}

export const PanelOriginalEvidence: React.FC<Props> = ({ incident }) => {
  const isImage = incident.input_type === 'image';
  const isVideo = incident.input_type === 'video';
  const isVoice = incident.input_type === 'voice';
  const isText = incident.input_type === 'text';

  const keyframes = incident.evidence_summary?.keyframes || [];

  return (
    <div className="panel-glass rounded-2xl flex flex-col h-full border border-white/10 overflow-hidden shadow-xl">
      {/* Panel Header */}
      <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between bg-black/30">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            {isImage && <ImageIcon className="w-4 h-4" />}
            {isVideo && <VideoIcon className="w-4 h-4" />}
            {isVoice && <Mic className="w-4 h-4" />}
            {isText && <FileText className="w-4 h-4" />}
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wider uppercase font-mono">
              Panel 1: Original Evidence
            </h3>
            <p className="text-[10px] text-slate-400">Raw unmodified civic input as submitted</p>
          </div>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10 uppercase">
          {incident.input_type}
        </span>
      </div>

      {/* Evidence Viewer Body */}
      <div className="p-5 flex-1 flex flex-col justify-between overflow-y-auto space-y-4">
        {/* Visual / Media Container */}
        <div className="rounded-xl overflow-hidden bg-[#07090e] border border-white/10 relative min-h-[220px] flex items-center justify-center">
          {isImage && (
            <div className="w-full h-full flex flex-col items-center justify-center p-2">
              <img
                src={incident.file_url || '/sample_evidence/pothole_sample.jpg'}
                alt="Civic evidence"
                className="max-h-[280px] w-full object-contain rounded-lg"
              />
            </div>
          )}

          {isVideo && (
            <div className="w-full flex flex-col items-center">
              <video
                controls
                src={incident.file_url}
                className="w-full max-h-[260px] object-contain rounded-lg bg-black"
              >
                Your browser does not support the video tag.
              </video>
            </div>
          )}

          {isVoice && (
            <div className="w-full p-6 flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 animate-pulse">
                <Mic className="w-8 h-8" />
              </div>
              <div className="w-full">
                <audio
                  controls
                  src={incident.file_url || '/sample_evidence/voice_sample.wav'}
                  className="w-full h-10"
                />
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Duration: {incident.evidence_summary?.audio_duration_seconds || '4.2'}s • Indian Urban Accent
              </p>
            </div>
          )}

          {isText && (
            <div className="w-full p-5 text-left font-sans">
              <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-2">Original Written Text:</div>
              <blockquote className="p-4 rounded-xl bg-white/[0.02] border-l-2 border-cyan-500 text-sm text-slate-200 italic leading-relaxed">
                "{incident.raw_content || 'No text submitted'}"
              </blockquote>
            </div>
          )}
        </div>

        {/* Video Keyframes Timeline (if video input) */}
        {isVideo && keyframes.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Extracted Video Keyframe Samples:</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {keyframes.map((kf: any, i: number) => (
                <div key={i} className="group relative rounded-lg overflow-hidden border border-white/10 bg-black/40">
                  <img src={kf.thumbnail_url} alt={`Keyframe ${kf.timestamp}`} className="w-full h-14 object-cover" />
                  <div className="absolute bottom-0 inset-x-0 bg-black/80 px-1 py-0.5 text-[9px] font-mono text-cyan-300 text-center">
                    {kf.timestamp}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Evidence Metadata Tags */}
        <div className="pt-3 border-t border-white/[0.08] text-xs text-slate-400 space-y-1.5 font-mono">
          <div className="flex justify-between">
            <span>Location:</span>
            <span className="text-slate-200 font-sans">{incident.location || 'Ward 4, Sector 7'}</span>
          </div>
          <div className="flex justify-between">
            <span>Evidence Registered:</span>
            <span className="text-slate-200">{new Date(incident.created_at).toLocaleTimeString()}</span>
          </div>
          {incident.evidence_summary?.image_dimensions && (
            <div className="flex justify-between">
              <span>Resolution:</span>
              <span className="text-slate-300">{incident.evidence_summary.image_dimensions}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
