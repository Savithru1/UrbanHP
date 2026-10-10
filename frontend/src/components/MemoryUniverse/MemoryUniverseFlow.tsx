import React, { useEffect, useState, useMemo } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  Node, 
  Edge,
  useNodesState,
  useEdgesState,
  BackgroundVariant
} from '@xyflow/react';
import { IncidentNode, MemoryNode, ActionNode, OutcomeNode } from './CustomNodes';
import { api } from '../../services/api';
import { GitFork, RefreshCw, Info, ExternalLink, X, FileCode } from 'lucide-react';

export const MemoryUniverseFlow: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNodeData, setSelectedNodeData] = useState<any | null>(null);

  const nodeTypes = useMemo(
    () => ({
      incidentNode: IncidentNode,
      memoryNode: MemoryNode,
      actionNode: ActionNode,
      outcomeNode: OutcomeNode,
    }),
    []
  );

  const fetchGraph = async () => {
    setLoading(true);
    try {
      const data = await api.getMemoryUniverseGraph();
      setNodes(data.nodes);
      setEdges(data.edges);
    } catch (err) {
      console.error('Error fetching universe graph:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraph();
  }, []);

  const onNodeClick = (_: any, node: Node) => {
    setSelectedNodeData(node.data);
  };

  return (
    <div className="h-[760px] w-full panel-glass rounded-3xl border border-white/10 flex flex-col overflow-hidden relative shadow-2xl">
      {/* Graph Toolbar */}
      <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-black/40 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <GitFork className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-white font-heading tracking-tight">
                City Memory Universe
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40">
                Interactive xyflow Knowledge Graph
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Tracing signal flow: Incident → Vector Similarity → Validated Memory → Historical Action → Recorded Outcome
            </p>
          </div>
        </div>

        {/* Legend & Refresh */}
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span> Incident
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> Memory
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Action
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span> Outcome
            </span>
          </div>

          <button
            onClick={fetchGraph}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer border border-white/10"
            title="Reload Knowledge Graph"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 w-full h-full relative bg-[#07080c]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={1.5}
          >
            <Background color="#1f293d" gap={24} size={1} variant={BackgroundVariant.Dots} />
            <Controls />
          </ReactFlow>
        )}

        {/* Slide-over Node Inspector Drawer */}
        {selectedNodeData && (
          <div className="absolute right-4 top-4 bottom-4 w-96 bg-[#0c0e18]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-5 z-20 flex flex-col justify-between animate-in slide-in-from-right duration-200 text-left">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                    Node Record Inspector
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNodeData(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Record Identifier</span>
                  <span className="text-cyan-300 font-bold select-all">{selectedNodeData.id}</span>
                </div>

                {selectedNodeData.title && (
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Title</span>
                    <span className="text-slate-200 font-sans font-medium">{selectedNodeData.title}</span>
                  </div>
                )}

                {selectedNodeData.lesson && (
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 font-sans">
                    <span className="text-[10px] text-emerald-400 uppercase font-mono block mb-1">
                      Learned Civic Lesson:
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed">{selectedNodeData.lesson}</p>
                  </div>
                )}

                {selectedNodeData.protocol && (
                  <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-800/30 font-sans">
                    <span className="text-[10px] text-cyan-400 uppercase font-mono block mb-1">
                      Recommended Protocol:
                    </span>
                    <p className="text-xs text-cyan-200 leading-relaxed">{selectedNodeData.protocol}</p>
                  </div>
                )}

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block mb-1">Complete Document</span>
                  <pre className="p-3 rounded-xl bg-black/60 border border-white/10 text-[10px] text-slate-300 overflow-x-auto max-h-48 leading-tight select-all">
                    {JSON.stringify(selectedNodeData.doc || selectedNodeData, null, 2)}
                  </pre>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 text-[10px] font-mono text-slate-500 flex items-center justify-between">
              <span>Collection: urbanhp</span>
              <button
                onClick={() => setSelectedNodeData(null)}
                className="text-cyan-400 hover:underline cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
