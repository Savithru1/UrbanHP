import React, { useState, useEffect } from 'react';
import { StreamProvider, useStream } from './context/StreamContext';
import { Navigation } from './components/Navigation';
import type { NavScreen } from './components/Navigation';
import { MetricCards } from './components/Dashboard/MetricCards';
import { IncidentsFeed } from './components/Dashboard/IncidentsFeed';
import { IngestionHub } from './components/Ingestion/IngestionHub';
import { EvidenceLab } from './components/EvidenceLab/EvidenceLab';
import { MemoryUniverseFlow } from './components/MemoryUniverse/MemoryUniverseFlow';
import { MemoryImpactLab } from './components/MemoryImpact/MemoryImpactLab';
import { api } from './services/api';
import type { Incident, SystemStats } from './types';
import { Database, GitBranch } from 'lucide-react';

function AppContent() {
  const [currentScreen, setCurrentScreen] = useState<NavScreen>('evidence-lab');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);

  const { isConnected, refreshCount } = useStream();

  const loadData = async () => {
    try {
      const [incs, st] = await Promise.all([
        api.getIncidents(),
        api.getSystemStats()
      ]);
      setIncidents(incs);
      setStats(st);
      if (!selectedIncidentId && incs.length > 0) {
        setSelectedIncidentId(incs[0]._id);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [refreshCount]);

  const handleIncidentCreated = (incident: Incident) => {
    setIncidents((prev) => [incident, ...prev]);
    setSelectedIncidentId(incident._id);
    setCurrentScreen('evidence-lab');
  };

  const handleOpenLab = (id: string) => {
    setSelectedIncidentId(id);
    setCurrentScreen('evidence-lab');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#07080c] text-[#e2e8f0] bg-grid-subtle font-sans">
      {/* Top Navigation */}
      <Navigation
        currentScreen={currentScreen}
        onSelectScreen={setCurrentScreen}
        isStreamConnected={isConnected}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentScreen === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <MetricCards stats={stats} />
            <IncidentsFeed
              incidents={incidents}
              onSelectIncident={setSelectedIncidentId}
              onOpenLab={handleOpenLab}
            />
          </div>
        )}

        {currentScreen === 'ingestion' && (
          <IngestionHub onIncidentCreated={handleIncidentCreated} />
        )}

        {currentScreen === 'evidence-lab' && (
          <EvidenceLab
            selectedIncidentId={selectedIncidentId}
            onSelectIncidentId={setSelectedIncidentId}
          />
        )}

        {currentScreen === 'universe' && (
          <MemoryUniverseFlow />
        )}

        {currentScreen === 'impact-lab' && (
          <MemoryImpactLab />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-[#050609] py-5 px-4 text-xs font-mono text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300 font-heading">UrbanHP</span>
            <span>—</span>
            <span>Every Signal Becomes Memory. Every Memory Informs the Next Decision.</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <a
              href="https://github.com/Savithru1/UrbanHP"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-slate-400 hover:text-cyan-300 transition-colors"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Savithru1/UrbanHP</span>
            </a>
            <span>•</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <Database className="w-3 h-3" />
              <span>Compass: 127.0.0.1:27017/urbanhp</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <StreamProvider>
      <AppContent />
    </StreamProvider>
  );
}
