import React, { useState } from 'react';
import { Database, CheckCircle2, Copy, Check, ExternalLink } from 'lucide-react';

interface Props {
  isConnected: boolean;
  totalDocs?: number;
}

export const CompassStatusBadge: React.FC<Props> = ({ isConnected, totalDocs = 12 }) => {
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const uri = "mongodb://127.0.0.1:27017/urbanhp";

  const handleCopy = () => {
    navigator.clipboard.writeText(uri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0e121e] border border-white/10 hover:border-cyan-500/40 transition-all text-xs font-mono group cursor-pointer shadow-sm"
        title="Click to view MongoDB Compass connection guide"
      >
        <span className="relative flex h-2 w-2">
          {isConnected && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
        </span>
        <Database className="w-3.5 h-3.5 text-cyan-400 group-hover:rotate-12 transition-transform" />
        <span className="text-slate-300 font-medium">MongoDB Compass</span>
        <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/40 font-bold">
          urbanhp
        </span>
      </button>

      {/* Compass Connection Instructions Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0e111a] border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-left">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">MongoDB Compass Live Connection</h3>
                  <p className="text-xs text-slate-400">Inspect real-time UrbanHP documents on your machine</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-[#07090e] border border-white/5 font-mono">
                <div className="flex items-center justify-between text-slate-400 mb-1 text-[11px]">
                  <span>Compass Connection String:</span>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy URI'}</span>
                  </button>
                </div>
                <div className="text-cyan-300 font-bold select-all">{uri}</div>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  <span>How to observe live updates in Compass during demo:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-slate-400 leading-relaxed">
                  <li>Open <strong className="text-slate-200">MongoDB Compass</strong> on your laptop.</li>
                  <li>Paste the URI <code className="text-cyan-300 bg-white/5 px-1 py-0.5 rounded">mongodb://127.0.0.1:27017</code> and click <strong className="text-emerald-400">Connect</strong>.</li>
                  <li>Click on database <strong className="text-cyan-400">urbanhp</strong> in the left sidebar.</li>
                  <li>Inspect collection <strong className="text-slate-200">incidents</strong> — as you upload evidence, documents appear immediately!</li>
                  <li>Inspect collection <strong className="text-slate-200">memories</strong> — contains the persistent lessons learned and historical repair protocols.</li>
                </ol>
              </div>

              <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-800/30 text-cyan-300/90 leading-relaxed text-[11px]">
                💡 <strong>Tip for Judges:</strong> Click the <em>Refresh</em> button in Compass (or press F5) after submitting evidence to see the <code className="text-white">version</code> field increment from 1 to 5 as stages complete!
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
