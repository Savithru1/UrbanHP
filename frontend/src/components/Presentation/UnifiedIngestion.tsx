import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Mic, 
  FileText, 
  Radio, 
  Square, 
  ArrowRight, 
  Sparkles,
  MapPin
} from 'lucide-react';
import { api } from '../../services/api';
import { Incident } from '../../types';

interface Props {
  onIncidentProcessed: (incident: Incident) => void;
}

export const UnifiedIngestion: React.FC<Props> = ({ onIncidentProcessed }) => {
  const [activeType, setActiveType] = useState<'image' | 'video' | 'voice' | 'text'>('image');
  const [location, setLocation] = useState('Ward 4, Sector 7 Junction');
  const [textContent, setTextContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Audio recording
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setPreviewUrl(URL.createObjectURL(blob));
        const audioFile = new File([blob], 'citizen_voice_recording.wav', { type: 'audio/wav' });
        setSelectedFile(audioFile);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert('Microphone access unavailable. You can click Preset 3 to demo with a sample audio clip!');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
  };

  // 1-Click Demo Presets for 5-Minute Presentation
  const loadDemoPreset = async (preset: 'pothole_image' | 'video_survey' | 'voice_note' | 'fresh_incident') => {
    if (preset === 'pothole_image') {
      setActiveType('image');
      try {
        const response = await fetch('/sample_evidence/pothole_sample.jpg');
        const blob = await response.blob();
        const file = new File([blob], 'sector4_pothole_cavity.jpg', { type: 'image/jpeg' });
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setLocation('Ward 4, Sector 7 Junction / Main Road');
      } catch (e) {
        console.error(e);
      }
    } else if (preset === 'voice_note') {
      setActiveType('voice');
      try {
        const response = await fetch('/sample_evidence/voice_sample.wav');
        const blob = await response.blob();
        const file = new File([blob], 'citizen_audio_complaint.wav', { type: 'audio/wav' });
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setLocation('Ward 4, Sector 7 Main Entrance');
      } catch (e) {
        console.error(e);
      }
    } else if (preset === 'video_survey') {
      setActiveType('video');
      try {
        const response = await fetch('/sample_evidence/pothole_survey.mp4');
        const blob = await response.blob();
        const file = new File([blob], 'road_walkthrough_pothole_sweep.mp4', { type: 'video/mp4' });
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(blob));
        setLocation('Ward 4, Sector 7 Arterial Road');
      } catch (e) {
        console.error(e);
      }
    } else if (preset === 'fresh_incident') {
      setActiveType('text');
      setTextContent(
        'Broken storm drainage grate cover near Sector 11 Community Center. Pedestrians could fall into the open storm line at night.'
      );
      setLocation('Ward 11, Sector 11 Community Center');
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      let doc: Incident;
      if (activeType === 'text') {
        if (!textContent.trim()) {
          alert('Please enter text for the civic complaint.');
          setIsSubmitting(false);
          return;
        }
        doc = await api.submitText(textContent, location);
      } else {
        if (!selectedFile) {
          alert(`Please select or record a ${activeType} file first, or click one of the quick 1-click Demo Presets above!`);
          setIsSubmitting(false);
          return;
        }
        doc = await api.uploadMedia(selectedFile, activeType, location);
      }
      onIncidentProcessed(doc);
    } catch (err) {
      alert('Error submitting evidence: ' + err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl bg-[#0a0d18] border border-white/10 p-5 shadow-2xl space-y-4 text-left">
      {/* 5-Minute Pitch 1-Click Demo Presets Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
        <span className="text-xs font-mono text-slate-300 flex items-center gap-1.5 font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>5-Minute Presentation One-Click Presets:</span>
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => loadDemoPreset('pothole_image')}
            className="px-2.5 py-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800/40 text-cyan-300 text-[11px] font-mono transition-colors cursor-pointer"
          >
            📸 Preset 1: Recurring Pothole
          </button>
          <button
            onClick={() => loadDemoPreset('video_survey')}
            className="px-2.5 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-800/40 text-blue-300 text-[11px] font-mono transition-colors cursor-pointer"
          >
            🎥 Preset 2: Video Walkthrough
          </button>
          <button
            onClick={() => loadDemoPreset('voice_note')}
            className="px-2.5 py-1 rounded-lg bg-purple-950/80 hover:bg-purple-900 border border-purple-800/40 text-purple-300 text-[11px] font-mono transition-colors cursor-pointer"
          >
            🎙️ Preset 3: Audio Note
          </button>
          <button
            onClick={() => loadDemoPreset('fresh_incident')}
            className="px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/40 text-emerald-300 text-[11px] font-mono transition-colors cursor-pointer"
          >
            🆕 Preset 4: Fresh Incident
          </button>
        </div>
      </div>

      {/* Requirement 1: Single Minimal Upload Box with Type Options Inside */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* Media Selector Tabs */}
        <div className="md:col-span-4 space-y-2">
          <label className="text-[11px] font-mono text-slate-400 block">Select Signal Input Format:</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'image', label: 'Image', icon: ImageIcon },
              { id: 'video', label: 'Video', icon: VideoIcon },
              { id: 'voice', label: 'Voice Audio', icon: Mic },
              { id: 'text', label: 'Written Text', icon: FileText },
            ].map((t) => {
              const Icon = t.icon;
              const isSelected = activeType === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveType(t.id as any);
                    setSelectedFile(null);
                    setPreviewUrl(null);
                  }}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-500/15 border-cyan-500/60 text-white font-bold shadow-md shadow-cyan-500/10'
                      : 'bg-black/30 border-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-2">
            <label className="text-[11px] font-mono text-slate-400 mb-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-cyan-400" />
              <span>Location / Ward:</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-[#050609] border border-white/10 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>

        {/* The Single Unified Dropzone Area */}
        <div className="md:col-span-8">
          {activeType === 'text' ? (
            <div className="space-y-2">
              <textarea
                rows={3}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Type or paste citizen complaint details (pothole depth, surface damage, road location)..."
                className="w-full px-3 py-2.5 rounded-xl bg-[#050609] border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/60 leading-relaxed font-sans"
              />
            </div>
          ) : activeType === 'voice' ? (
            <div className="p-4 rounded-xl bg-[#050609] border border-white/10 text-center space-y-2">
              <div className="flex items-center justify-center gap-3">
                {!isRecording ? (
                  <button
                    onClick={startVoiceRecording}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-semibold transition-colors cursor-pointer"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Start Voice Recording</span>
                  </button>
                ) : (
                  <button
                    onClick={stopVoiceRecording}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-mono font-semibold animate-pulse transition-colors cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                    <span>Stop Recording</span>
                  </button>
                )}

                <span className="text-[11px] text-slate-500 font-mono">or</span>

                <label className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 cursor-pointer">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload Audio File</span>
                  <input type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
                </label>
              </div>

              {previewUrl && (
                <div className="max-w-xs mx-auto pt-1">
                  <audio controls src={previewUrl} className="w-full h-8" />
                </div>
              )}
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-5 rounded-xl bg-[#050609] border-2 border-dashed border-white/10 hover:border-cyan-500/50 transition-all text-center cursor-pointer group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={activeType === 'image' ? 'image/*' : 'video/*'}
                onChange={handleFileChange}
                className="hidden"
              />

              {previewUrl ? (
                <div className="flex items-center justify-center gap-3">
                  <img
                    src={previewUrl}
                    alt="Selected evidence preview"
                    className="h-16 w-24 object-cover rounded-lg border border-white/10 shadow-md"
                  />
                  <div className="text-left font-mono">
                    <span className="text-xs text-cyan-300 font-semibold block">{selectedFile?.name || 'Evidence Loaded'}</span>
                    <span className="text-[10px] text-slate-500">Click to change file</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <UploadCloud className="w-6 h-6 text-cyan-400 mx-auto group-hover:scale-110 transition-transform" />
                  <div className="text-xs text-slate-300 font-semibold">
                    Click to browse or drop {activeType} file
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {activeType === 'image' ? 'JPG, PNG, WEBP' : 'MP4, WEBM, MOV'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:opacity-90 text-white font-mono font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Scanning & Registering...' : 'Scan & Ingest Signal into System'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
