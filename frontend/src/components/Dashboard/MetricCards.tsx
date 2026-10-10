import React from 'react';
import { SystemStats } from '../../types';
import { Database, AlertTriangle, ShieldCheck, BrainCircuit, Activity, HardHat } from 'lucide-react';

interface Props {
  stats: SystemStats | null;
}

export const MetricCards: React.FC<Props> = ({ stats }) => {
  const metrics = stats?.metrics || {
    total_incidents: 4,
    completed_rate: 100,
    verified_count: 2,
    total_memories: 4,
    historical_actions: 2,
    recorded_outcomes: 2,
  };

  const cards = [
    {
      title: 'Total Civic Signals',
      value: metrics.total_incidents,
      sub: 'Stored in Compass `incidents`',
      icon: Activity,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
    },
    {
      title: 'City Memory Lessons',
      value: metrics.total_memories,
      sub: 'Reusable civic experience',
      icon: BrainCircuit,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
    },
    {
      title: 'Forensic Verification',
      value: `${metrics.verified_count} / ${metrics.total_incidents}`,
      sub: 'Verified before deployment',
      icon: ShieldCheck,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
    {
      title: 'Actions & Outcomes Log',
      value: metrics.recorded_outcomes,
      sub: 'Historical feedback loops',
      icon: HardHat,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div
            key={i}
            className="p-4 rounded-2xl bg-[#0d0f17] border border-white/[0.07] hover:border-white/15 transition-all shadow-md relative overflow-hidden group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-slate-400 tracking-wide uppercase">{c.title}</span>
              <div className={`p-2 rounded-xl ${c.bg} ${c.color} border ${c.border}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-white font-heading tracking-tight mb-1">
              {c.value}
            </div>
            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
              <span>{c.sub}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
