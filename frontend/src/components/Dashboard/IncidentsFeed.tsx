import React, { useState } from 'react';
import { Incident } from '../../types';
import { 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Mic, 
  FileText, 
  ExternalLink, 
  Search, 
  Filter, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

interface Props {
  incidents: Incident[];
  onSelectIncident: (id: string) => void;
  onOpenLab: (id: string) => void;
}

export const IncidentsFeed: React.FC<Props> = ({ incidents, onSelectIncident, onOpenLab }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filtered = incidents.filter((inc) => {
    const matchesCat = selectedCategory === 'all' || inc.incident_type === selectedCategory;
    const matchesSearch =
      inc._id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inc.extracted_text || inc.raw_content || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inc.location || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />;
      case 'video': return <VideoIcon className="w-3.5 h-3.5 text-blue-400" />;
      case 'voice': return <Mic className="w-3.5 h-3.5 text-emerald-400" />;
      default: return <FileText className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'critical': return 'bg-rose-950/60 text-rose-300 border-rose-800/40';
      case 'high': return 'bg-amber-950/60 text-amber-300 border-amber-800/40';
      case 'medium': return 'bg-cyan-950/60 text-cyan-300 border-cyan-800/40';
      default: return 'bg-slate-900 text-slate-400 border-slate-800';
    }
  };

  return (
    <div className="panel-glass rounded-2xl border border-white/[0.08] p-5 shadow-xl space-y-4">
      {/* Feed Filter Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
        <div>
          <h3 className="text-sm font-bold text-white font-heading tracking-tight flex items-center gap-2">
            <span>Live Civic Signal Stream</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/40">
              {filtered.length} Records
            </span>
          </h3>
          <p className="text-[11px] text-slate-400">Observing active mutations across MongoDB Compass</p>
        </div>

        {/* Search & Category Filter */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter incidents..."
              className="bg-[#090b12] border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 w-36 sm:w-48 font-mono"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-[#090b12] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none font-mono cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="pothole">Potholes</option>
            <option value="garbage">Solid Waste</option>
            <option value="street_light">Lighting</option>
            <option value="drainage">Drainage</option>
          </select>
        </div>
      </div>

      {/* Incident List */}
      <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500 font-mono text-xs">
            No incidents found matching your query.
          </div>
        ) : (
          filtered.map((inc) => (
            <div
              key={inc._id}
              className="p-3.5 rounded-xl bg-[#080910] border border-white/[0.05] hover:border-cyan-500/40 transition-all hover:bg-[#0c0e18] group text-left"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-white/5 border border-white/5">
                    {getIcon(inc.input_type)}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-cyan-300">{inc._id}</span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border uppercase font-semibold ${getSeverityBadge(inc.severity)}`}>
                        {inc.severity}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-slate-400 uppercase">
                        v{inc.version}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-sans">{inc.location || 'Ward 4'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>{inc.processing_status}</span>
                  </span>

                  <button
                    onClick={() => onOpenLab(inc._id)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/30 text-xs font-mono transition-all cursor-pointer"
                    title="Open in Evidence Comparison Lab"
                  >
                    <span>Lab</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Text Snippet */}
              <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed font-sans pl-8">
                {inc.extracted_text || inc.raw_content || 'Analyzing evidence...'}
              </p>

              {/* Memory Recommendation callout */}
              {inc.recommendation && (
                <div className="mt-2.5 ml-8 p-2 rounded-lg bg-cyan-950/20 border border-cyan-800/20 flex items-center justify-between text-[11px] text-cyan-300/90 font-mono">
                  <span className="line-clamp-1">💡 {inc.recommendation}</span>
                  {inc.related_memory_ids?.length > 0 && (
                    <span className="text-[9px] text-slate-400 shrink-0 ml-2">
                      Linked: {inc.related_memory_ids[0]}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
