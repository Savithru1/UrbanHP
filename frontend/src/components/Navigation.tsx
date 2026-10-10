import React from 'react';
import { 
  Sparkles,
  Microscope, 
  LayoutDashboard, 
  GitFork, 
  BrainCircuit, 
  Radio
} from 'lucide-react';
import { CompassStatusBadge } from './CompassStatusBadge';

export type NavScreen = 'presentation' | 'evidence-lab' | 'dashboard' | 'universe' | 'impact-lab';

interface Props {
  currentScreen: NavScreen;
  onSelectScreen: (screen: NavScreen) => void;
  isStreamConnected: boolean;
}

export const Navigation: React.FC<Props> = ({ currentScreen, onSelectScreen, isStreamConnected }) => {
  const navItems = [
    { id: 'presentation', label: '5-Min Presentation Studio', icon: Sparkles, badge: 'Main Flow' },
    { id: 'evidence-lab', label: '3-Panel Evidence Lab', icon: Microscope, badge: 'Forensic' },
    { id: 'dashboard', label: 'Command Center', icon: LayoutDashboard, badge: null },
    { id: 'universe', label: 'City Memory Universe', icon: GitFork, badge: 'xyflow' },
    { id: 'impact-lab', label: 'Memory Impact Lab', icon: BrainCircuit, badge: 'Act 4 & 5' },
  ] as const;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#07080c]/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20 text-white font-black text-sm tracking-wider">
              UHP
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#07080c]"></div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-extrabold text-base tracking-tight text-white">URBANHP</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-cyan-300 font-mono font-medium">v1.0</span>
              </div>
              <p className="text-[10px] text-slate-400 tracking-wide font-sans">The City That Never Forgets</p>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className="flex items-center gap-1 bg-[#0d0f17] p-1 rounded-xl border border-white/[0.06]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectScreen(item.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#181c2d] text-white shadow-sm border border-cyan-500/30 text-cyan-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                      isActive ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/5 text-slate-500'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right side Compass & Stream Indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
              <Radio className={`w-3.5 h-3.5 ${isStreamConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
              <span className="hidden sm:inline">{isStreamConnected ? 'SSE Live' : 'Reconnecting'}</span>
            </div>
            <CompassStatusBadge isConnected={isStreamConnected} />
          </div>
        </div>
      </div>
    </header>
  );
};
