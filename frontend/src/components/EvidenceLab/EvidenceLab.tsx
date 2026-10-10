import React, { useEffect, useState } from 'react';
import { Incident } from '../../types';
import { PanelOriginalEvidence } from './PanelOriginalEvidence';
import { PanelAIExtraction } from './PanelAIExtraction';
import { PanelMongoInspector } from './PanelMongoInspector';
import { api } from '../../services/api';
import { Microscope, RefreshCw, Sparkles, AlertCircle, ChevronDown } from 'lucide-react';

interface Props {
  selectedIncidentId?: string | null;
  onSelectIncidentId: (id: string) => void;
}

export const EvidenceLab: React.FC<Props> = ({ selectedIncidentId, onSelectIncidentId }) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [currentIncident, setCurrentIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReevaluating, setIsReevaluating] = useState(false);

  const fetchIncidents = async () => {
    try {
      const data = await api.getIncidents();
      setIncidents(data);
      if (data.length > 0) {
        const target = selectedIncidentId
          ? data.find((inc) => inc._id === selectedIncidentId) || data[0]
          : data[0];
        setCurrentIncident(target);
        onSelectIncidentId(target._id);
      }
    } catch (err) {
      console.error('Error fetching incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [selectedIncidentId]);

  const handleIncidentSelect = async (id: string) => {
    onSelectIncidentId(id);
    const found = incidents.find((i) => i._id === id);
    if (found) {
      setCurrentIncident(found);
    } else {
      try {
        const full = await api.getIncident(id);
        setCurrentIncident(full);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleReevaluate = async () => {
    if (!currentIncident) return;
    setIsReevaluating(true);
    try {
      const res = await api.reEvaluateIncident(currentIncident._id);
      setCurrentIncident(res.incident);
      // Update in local incidents list
      setIncidents((prev) =>
        prev.map((i) => (i._id === res.incident._id ? res.incident : i))
      );
    } catch (err) {
      alert('Re-evaluation error: ' + err);
    } finally {
      setIsReevaluating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-mono text-slate-400">Loading UrbanHP Evidence Lab...</p>
      </div>
    );
  }

  if (!currentIncident) {
    return (
      <div className="p-12 text-center max-w-md mx-auto space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-400 mx-auto" />
        <h3 className="text-base font-bold text-white font-heading">No Incidents Recorded Yet</h3>
        <p className="text-xs text-slate-400">
          Upload an image, video, voice clip, or text complaint in the Evidence Ingestion hub to begin forensic analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Evidence Lab Control Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 rounded-2xl bg-[#0d0f17] border border-white/[0.08] shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Microscope className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white font-heading tracking-tight">
                UrbanHP Evidence Comparison Lab
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 font-bold">
                Centerpiece Forensic Studio
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Live side-by-side verification: Original Evidence vs AI Extraction vs MongoDB Compass Record
            </p>
          </div>
        </div>

        {/* Incident Switcher & Re-evaluation action */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={currentIncident._id}
              onChange={(e) => handleIncidentSelect(e.target.value)}
              className="appearance-none bg-[#121522] border border-white/10 hover:border-cyan-500/40 rounded-xl pl-3 pr-8 py-2 text-xs font-mono text-slate-200 cursor-pointer transition-colors shadow-sm focus:outline-none"
            >
              {incidents.map((inc) => (
                <option key={inc._id} value={inc._id}>
                  {inc._id} ({inc.incident_type.toUpperCase()} - {inc.input_type})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={handleReevaluate}
            disabled={isReevaluating}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
            title="Act 5 demo: Re-evaluate incident against updated city memory"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isReevaluating ? 'animate-spin' : ''}`} />
            <span>{isReevaluating ? 'Re-evaluating...' : 'Re-Evaluate Memory'}</span>
          </button>
        </div>
      </div>

      {/* The 3 Connected Panels Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch min-h-[640px]">
        {/* Panel 1 */}
        <PanelOriginalEvidence incident={currentIncident} />

        {/* Panel 2 */}
        <PanelAIExtraction
          incident={currentIncident}
          onIncidentUpdated={(updated) => {
            setCurrentIncident(updated);
            setIncidents((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
          }}
        />

        {/* Panel 3 */}
        <PanelMongoInspector
          incident={currentIncident}
          onRefresh={async () => {
            const refreshed = await api.getIncident(currentIncident._id);
            setCurrentIncident(refreshed);
          }}
        />
      </div>
    </div>
  );
};
