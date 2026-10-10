import React, { useState, useEffect } from 'react';
import { Incident } from '../../types';
import { api } from '../../services/api';
import { UnifiedIngestion } from './UnifiedIngestion';
import { DefectHighlighter } from './DefectHighlighter';
import { SignalToTextConverter } from './SignalToTextConverter';
import { IncidentMatcherCard } from './IncidentMatcherCard';
import { MongoCompassLiveView } from './MongoCompassLiveView';
import { RecommendationMemoryCard } from './RecommendationMemoryCard';
import { MemoryUniverseModal } from './MemoryUniverseModal';
import { GitFork, Database, Radio, Sparkles, ExternalLink, RefreshCw } from 'lucide-react';
import { useStream } from '../../context/StreamContext';

export const PresentationConsole: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [currentIncident, setCurrentIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUniverseModal, setShowUniverseModal] = useState(false);

  const { isConnected, refreshCount } = useStream();

  const fetchIncidents = async () => {
    try {
      const data = await api.getIncidents();
      setIncidents(data);
      if (data.length > 0) {
        // Select latest or retain current
        setCurrentIncident((prev) => {
          if (!prev) return data[0];
          const matched = data.find((d) => d._id === prev._id);
          return matched || data[0];
        });
      }
    } catch (err) {
      console.error('Error fetching incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [refreshCount]);

  const handleIncidentProcessed = (newInc: Incident) => {
    setIncidents((prev) => [newInc, ...prev]);
    setCurrentIncident(newInc);
  };

  if (loading && !currentIncident) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-4">
        <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-mono text-slate-400">Booting UrbanHP Intelligence Console...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left max-w-7xl mx-auto pb-12">
      {/* Top Presentation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#090b14] border border-white/[0.08] shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-extrabold text-xs font-heading shadow-md shadow-cyan-500/20">
            UHP
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-extrabold text-white tracking-tight font-heading">
                URBANHP CONSOLE
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40 font-bold">
                5-Min Presentation Studio
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Multimodal Ingestion $\rightarrow$ Fault Localization $\rightarrow$ Recurrence Match $\rightarrow$ MongoDB Compass Live $\rightarrow$ City Memory
            </p>
          </div>
        </div>

        {/* Action Buttons: MongoDB Link & xyflow Graph Modal */}
        <div className="flex items-center gap-2">
          <a
            href="mongodb://127.0.0.1:27017/urbanhp"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800/40 text-[11px] font-mono text-emerald-300 transition-all cursor-pointer shadow-md"
            title="Launch MongoDB Compass directly via desktop protocol"
          >
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Open Compass</span>
            <ExternalLink className="w-3 h-3 text-emerald-400 opacity-70" />
          </a>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-800/30 text-[11px] font-mono text-emerald-300">
            <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
            <span>Connected</span>
          </div>

          <button
            onClick={() => setShowUniverseModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-800/40 text-purple-300 text-xs font-mono font-medium transition-all cursor-pointer shadow-md"
            title="Inspect xyflow City Memory Universe Knowledge Graph"
          >
            <GitFork className="w-3.5 h-3.5" />
            <span>Memory Graph (xyflow)</span>
          </button>
        </div>
      </div>

      {/* Requirement 1: Single Minimal Upload Area with 1-Click Presets */}
      <UnifiedIngestion onIncidentProcessed={handleIncidentProcessed} />

      {/* Main 2-Column Split Stage (Requirements 2, 3, 4, 5) */}
      {currentIncident ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Column: Visual Fault Scanning & Recurrence Matching */}
          <div className="space-y-5">
            {/* Window A: Defect Highlighting */}
            <DefectHighlighter incident={currentIncident} />

            {/* Signal-to-Text Conversion */}
            <SignalToTextConverter incident={currentIncident} />

            {/* Window B: Historical Recurrence Matcher */}
            <IncidentMatcherCard incident={currentIncident} />
          </div>

          {/* Right Column: Live MongoDB Compass Mirror & Memory Recommendation */}
          <div className="space-y-5">
            {/* Window C: Live MongoDB Compass Inspector (Before vs After) */}
            <MongoCompassLiveView
              incident={currentIncident}
              onRefresh={async () => {
                const updated = await api.getIncident(currentIncident._id);
                setCurrentIncident(updated);
              }}
            />

            {/* Window D: Memory-Informed AI Recommendation & Commit */}
            <RecommendationMemoryCard
              incident={currentIncident}
              onMemoryCommitted={() => {
                fetchIncidents();
              }}
            />
          </div>
        </div>
      ) : (
        <div className="p-12 text-center text-slate-500 font-mono text-xs">
          Click Preset 1 above to load the first recurring pothole demonstration.
        </div>
      )}

      {/* Architecture Modal: Full xyflow React Flow graph */}
      <MemoryUniverseModal
        isOpen={showUniverseModal}
        onClose={() => setShowUniverseModal(false)}
      />
    </div>
  );
};
