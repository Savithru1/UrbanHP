import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Mic, 
  FileText, 
  ArrowRight, 
  CheckCircle2, 
  MapPin, 
  Radio, 
  Square, 
  Play,
  Sparkles
} from 'lucide-react';
import { api } from '../../services/api';
import { Incident } from '../../types';

interface Props {
  onIncidentCreated: (incident: Incident) => void;
}

export const IngestionHub: React.FC<Props> = ({ onIncidentCreated }) => {
  const [activeTab, setActiveTab] = useState<'image' | 'video' | 'voice' | 'text'>('image');
  const [location, setLocation] = useState('Ward 4, Sector 7 Junction');
  const [textContent, setTextContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
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
        setAudioBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        // Also wrap as File
        const audioFile = new File([blob], 'citizen_voice_recording.wav', { type: 'audio/wav' });
        setSelectedFile(audioFile);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert('Microphone access denied or unavailable. You can also upload a recorded voice audio file or use the Demo Pre-fill button.');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // Stop all audio tracks
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
  };

  // Demo pre-fill presets for 1-click testing
  const loadDemoPreset = async (type: 'image' | 'voice' | 'video' | 'text') => {
    setActiveTab(type);
    if (type === 'image') {
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
    } else if (type === 'voice') {
      try {
        const response = await fetch('/sample_evidence/voice_sample.wav');
        const blob = await response.blob();
        const file = new File([blob], 'citizen_audio_complaint.wav', { type: 'audio/wav' });
        setSelectedFile(file);
        setAudioBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        setLocation('Ward 4, Sector 7 Main Entrance');
      } catch (e) {
        console.error(e);
      }
    } else if (type === 'video') {
      // Simulate video file from sample or placeholder
      const dummyBlob = new Blob(['sample-video-content'], { type: 'video/mp4' });
      const file = new File([dummyBlob], 'road_walkthrough_pothole_sweep.mp4', { type: 'video/mp4' });
      setSelectedFile(file);
      setPreviewUrl('/sample_evidence/pothole_sample.jpg'); // visual representation
      setLocation('Ward 4, Sector 7 Arterial Road');
    } else if (type === 'text') {
      setTextContent(
        'A large 14cm pothole has appeared again near Sector 4 junction after recent heavy rainfall. Vehicles and two-wheelers are swerving abruptly to avoid damage. Water from the clogged roadside drain is washing across the asphalt.'
      );
      setLocation('Ward 4, Sector 7 Junction');
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setStatusMessage('Transmitting evidence to MongoDB and initializing pipeline...');

    try {
      let createdIncident: Incident;
      if (activeTab === 'text') {
        if (!textContent.trim()) {
          alert('Please enter your civic complaint text');
          setIsSubmitting(false);
          return;
        }
        createdIncident = await api.submitText(textContent, location);
      } else {
        if (!selectedFile) {
          alert(`Please select or record a ${activeTab} file first`);
          setIsSubmitting(false);
          return;
        }
        createdIncident = await api.uploadMedia(selectedFile, activeTab, location);
      }

      setStatusMessage('Evidence processed! Synchronizing with MongoDB Compass...');
      setTimeout(() => {
        onIncidentCreated(createdIncident);
      }, 700);
    } catch (err) {
      alert('Submission error: ' + err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-300 text-xs font-mono">
          <UploadCloud className="w-3.5 h-3.5" />
          <span>Multimodal Civic Evidence Ingestion</span>
        </div>
        <h2 className="text-2xl font-extrabold text-white font-heading tracking-tight">
          Ingest Real-World Civic Signals
        </h2>
        <p className="text-sm text-slate-400 max-w-lg mx-auto">
          Convert citizen images, videos, voice recordings, and text into persistent digital memory in MongoDB Compass.
        </p>
      </div>

      {/* One-click Demo Pre-fill Presets */}
      <div className="p-3.5 rounded-2xl bg-[#0d0f17] border border-white/[0.08] flex flex-wrap items-center justify-between gap-3 shadow-md">
        <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Quick Demo Test Presets:</span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => loadDemoPreset('image')}
            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 text-xs font-mono border border-white/10 transition-colors cursor-pointer"
          >
            📸 Test Image (Pothole)
          </button>
          <button
            onClick={() => loadDemoPreset('voice')}
            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 text-xs font-mono border border-white/10 transition-colors cursor-pointer"
          >
            🎙️ Test Voice Note
          </button>
          <button
            onClick={() => loadDemoPreset('video')}
            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 text-xs font-mono border border-white/10 transition-colors cursor-pointer"
          >
            🎥 Test Video Survey
          </button>
          <button
            onClick={() => loadDemoPreset('text')}
            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 text-xs font-mono border border-white/10 transition-colors cursor-pointer"
          >
            ✍️ Test Written Complaint
          </button>
        </div>
      </div>

      {/* Ingestion Panel */}
      <div className="panel-glass rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl space-y-6">
        {/* 4 Large Input Selectors */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { id: 'image', label: 'Image Input', icon: ImageIcon, desc: 'OCR & Cavity Analysis' },
            { id: 'video', label: 'Video Input', icon: VideoIcon, desc: 'Keyframes & Audio' },
            { id: 'voice', label: 'Voice Audio', icon: Mic, desc: 'Speech Recognition' },
            { id: 'text', label: 'Text Report', icon: FileText, desc: 'Semantic NLP' },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as any);
                  setSelectedFile(null);
                  setPreviewUrl(null);
                }}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-b from-[#181d2e] to-[#121626] border-cyan-500/60 shadow-lg shadow-cyan-500/10'
                    : 'bg-[#090b12] border-white/5 hover:border-white/15 hover:bg-white/[0.02]'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${
                    isSelected ? 'bg-cyan-500 text-black font-bold' : 'bg-white/5 text-slate-400'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className={`text-sm font-bold font-heading ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                  {item.label}
                </div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">{item.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Input Details Form */}
        <div className="space-y-4 pt-2">
          {/* Location Bar */}
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              <span>Location / Ward Reference:</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Ward 4, Sector 7 Junction / Main Road"
              className="w-full px-4 py-2.5 rounded-xl bg-[#07090e] border border-white/10 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 font-mono"
            />
          </div>

          {/* Dynamic Content based on active channel */}
          {activeTab === 'text' ? (
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5">
                Civic Complaint Narrative:
              </label>
              <textarea
                rows={5}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Describe the civic issue in detail (e.g. pothole depth, water stagnation, recurring repairs, public hazard)..."
                className="w-full px-4 py-3 rounded-xl bg-[#07090e] border border-white/10 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 leading-relaxed"
              />
            </div>
          ) : activeTab === 'voice' ? (
            <div className="space-y-4">
              <div className="p-6 rounded-2xl bg-[#07090e] border border-white/10 text-center space-y-4">
                <div className="flex items-center justify-center gap-4">
                  {!isRecording ? (
                    <button
                      onClick={startVoiceRecording}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
                    >
                      <Radio className="w-4 h-4" />
                      <span>Start Live Recording</span>
                    </button>
                  ) : (
                    <button
                      onClick={stopVoiceRecording}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs shadow-lg animate-pulse transition-all cursor-pointer"
                    >
                      <Square className="w-4 h-4 fill-white" />
                      <span>Stop Recording</span>
                    </button>
                  )}

                  <span className="text-xs text-slate-500 font-mono">or</span>

                  <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-medium text-xs border border-white/10 transition-colors cursor-pointer">
                    <UploadCloud className="w-4 h-4" />
                    <span>Upload Audio File</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {previewUrl && (
                  <div className="pt-2 max-w-sm mx-auto">
                    <audio controls src={previewUrl} className="w-full h-10" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Image or Video Upload Zone */
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-8 rounded-2xl bg-[#07090e] border-2 border-dashed border-white/10 hover:border-cyan-500/50 transition-all text-center cursor-pointer group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={activeTab === 'image' ? 'image/*' : 'video/*'}
                  onChange={handleFileChange}
                  className="hidden"
                />

                {previewUrl ? (
                  <div className="max-w-md mx-auto space-y-2">
                    {activeTab === 'image' ? (
                      <img
                        src={previewUrl}
                        alt="Selected evidence"
                        className="max-h-48 rounded-xl mx-auto object-cover border border-white/10 shadow-lg"
                      />
                    ) : (
                      <video
                        controls
                        src={previewUrl}
                        className="max-h-48 rounded-xl mx-auto border border-white/10 shadow-lg"
                      />
                    )}
                    <p className="text-xs font-mono text-cyan-300">
                      {selectedFile?.name || 'File ready for processing'}
                    </p>
                    <span className="text-[11px] text-slate-500">Click to change file</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                      {activeTab === 'image' ? <ImageIcon className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}
                    </div>
                    <div className="text-sm font-semibold text-slate-200">
                      Click to upload {activeTab} evidence
                    </div>
                    <p className="text-xs text-slate-500 font-mono">
                      {activeTab === 'image' ? 'Supports JPG, PNG, WEBP' : 'Supports MP4, WEBM, MOV'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Submit Action */}
        <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between">
          <div className="text-xs text-slate-400 font-mono">
            {statusMessage ? (
              <span className="text-cyan-300 animate-pulse">{statusMessage}</span>
            ) : (
              <span>Ready for MongoDB Compass registration</span>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-sm shadow-xl shadow-cyan-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <span>{isSubmitting ? 'Registering Signal...' : 'Transmit Evidence to Lab'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
