import React, { useState, useEffect } from 'react';
import {
  CampusGraph,
  OptimizationMetric,
  EmergencyVehicleType,
  RoutingProfile,
} from '../graph/Graph';
import { CampusBuildingEntry, IncidentRecord } from '../data/campusData';
import { ExtractedOSMBuilding } from '../graph/osmGraphExtractor';
import { CampusMapCanvas } from '../components/CampusMapCanvas';
import { RoutingEngine, RoutingAlgorithmType } from '../services/routingEngine';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Cpu,
  ListOrdered,
  Layers,
} from 'lucide-react';

interface DSAVisualizerViewProps {
  graph: CampusGraph;
  buildings: CampusBuildingEntry[];
  osmBuildings: ExtractedOSMBuilding[];
  incidents: IncidentRecord[];
  sourceId: string;
  targetId: string;
  algorithm: RoutingAlgorithmType;
  metric: OptimizationMetric;
  routingProfile: RoutingProfile;
  emergencyMode: boolean;
  emergencyVehicle: EmergencyVehicleType;
  onChangeSource: (id: string) => void;
  onChangeTarget: (id: string) => void;
  onChangeAlgorithm: (alg: RoutingAlgorithmType) => void;
  onChangeRoutingProfile: (p: RoutingProfile) => void;
}

export const DSAVisualizerView: React.FC<DSAVisualizerViewProps> = ({
  graph,
  buildings,
  osmBuildings,
  incidents,
  sourceId,
  targetId,
  algorithm,
  metric,
  routingProfile,
  emergencyMode,
  emergencyVehicle,
  onChangeSource,
  onChangeTarget,
  onChangeAlgorithm,
  onChangeRoutingProfile,
}) => {
  const execution = RoutingEngine.computeRoute(graph, {
    sourceNodeId: sourceId,
    targetNodeId: targetId,
    algorithm,
    metric,
    routingProfile,
    emergencyMode,
    emergencyVehicle,
  });

  const steps = execution.steps;
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeedMs, setPlaybackSpeedMs] = useState<number>(650);

  useEffect(() => {
    setStepIndex(0);
    setIsPlaying(false);
  }, [sourceId, targetId, algorithm, metric, routingProfile, emergencyMode]);

  useEffect(() => {
    if (!isPlaying) return;
    if (stepIndex >= steps.length - 1) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
    }, playbackSpeedMs);

    return () => clearTimeout(timer);
  }, [isPlaying, stepIndex, steps.length, playbackSpeedMs]);

  const currentStep = steps[stepIndex] || steps[0];
  const isFinalStep = stepIndex === steps.length - 1;

  const sourceBuilding = buildings.find((b) => b.nearestNodeId === sourceId || b.id === sourceId);
  const targetBuilding = buildings.find((b) => b.nearestNodeId === targetId || b.id === targetId);

  return (
    <div className="space-y-6">
      {/* Top Playback & Algorithm Control Bar */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center gap-2 mr-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-white">Algorithm:</span>
          </div>

          {(['ASTAR', 'DIJKSTRA', 'BFS', 'DFS'] as RoutingAlgorithmType[]).map((alg) => (
            <button
              key={alg}
              onClick={() => onChangeAlgorithm(alg)}
              className={`px-3 py-1.5 rounded-lg font-mono font-semibold transition-colors border ${
                algorithm === alg
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              {alg}
            </button>
          ))}

          <select
            value={routingProfile}
            onChange={(e) => onChangeRoutingProfile(e.target.value as RoutingProfile)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-cyan-300 font-mono"
          >
            <option value="WALKING">WALKING</option>
            <option value="BICYCLE">BICYCLE</option>
            <option value="VEHICLE">VEHICLE</option>
          </select>

          <select
            value={sourceBuilding?.id || ''}
            onChange={(e) => {
              const b = buildings.find((item) => item.id === e.target.value);
              if (b && b.nearestNodeId) onChangeSource(b.nearestNodeId);
            }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                Start: {b.shortName}
              </option>
            ))}
          </select>

          <select
            value={targetBuilding?.id || ''}
            onChange={(e) => {
              const b = buildings.find((item) => item.id === e.target.value);
              if (b && b.nearestNodeId) onChangeTarget(b.nearestNodeId);
            }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                Goal: {b.shortName}
              </option>
            ))}
          </select>
        </div>

        {/* Step Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsPlaying(false);
              setStepIndex(0);
            }}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
            title="Reset to Step 1"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setIsPlaying(false);
              setStepIndex((p) => Math.max(0, p - 1));
            }}
            disabled={stepIndex === 0}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 disabled:opacity-40"
            title="Previous Step"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              if (stepIndex >= steps.length - 1) {
                setStepIndex(0);
                setIsPlaying(true);
              } else {
                setIsPlaying((p) => !p);
              }
            }}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isPlaying ? 'Pause' : 'Play Steps'}</span>
          </button>

          <button
            onClick={() => {
              setIsPlaying(false);
              setStepIndex((p) => Math.min(steps.length - 1, p + 1));
            }}
            disabled={stepIndex >= steps.length - 1}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 disabled:opacity-40"
            title="Next Step"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <select
            value={playbackSpeedMs}
            onChange={(e) => setPlaybackSpeedMs(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 font-mono"
          >
            <option value={1100}>0.5x Speed</option>
            <option value={650}>1.0x Speed</option>
            <option value={300}>2.0x Speed</option>
          </select>
        </div>
      </div>

      {/* Main Split: Real VFSTR Graph Expansion Map (7 cols) + Min-Heap / Frontier Inspector (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden flex flex-col h-[560px]">
          <div className="p-3.5 border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono text-cyan-400 font-bold">
                STEP {stepIndex + 1} / {steps.length}
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-white font-medium truncate max-w-md">
                {currentStep?.description}
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-400">
              {execution.timeComplexity} • {execution.executionTimeMs} ms
            </span>
          </div>

          <div className="flex-1">
            <CampusMapCanvas
              graph={graph}
              buildings={buildings}
              osmBuildings={osmBuildings}
              incidents={incidents}
              selectedSourceId={sourceId}
              selectedTargetId={targetId}
              visitedNodes={currentStep?.visitedNodes || []}
              frontierNodes={currentStep?.frontier.map((f) => f.nodeId) || []}
              activeCurrentNode={currentStep?.currentNodeId || null}
              activeCurrentEdge={currentStep?.currentEdgeId || null}
              highlightedNodePath={isFinalStep ? execution.nodePath : []}
              highlightedEdgePath={isFinalStep ? execution.edgePath : []}
              routeGeometry={isFinalStep ? execution.routeGeometry : []}
              emergencyMode={emergencyMode}
            />
          </div>

          {/* Step Scrubber Bar */}
          <div className="p-3 bg-slate-950/90 border-t border-slate-800 flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-400 shrink-0">Timeline:</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, steps.length - 1)}
              value={stepIndex}
              onChange={(e) => {
                setIsPlaying(false);
                setStepIndex(Number(e.target.value));
              }}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Right: Data Structures State Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Active Step Explanation Card */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono uppercase text-cyan-400 font-semibold">
                {execution.algorithmName}
              </span>
              <span className="font-mono text-slate-400">
                Space: {execution.spaceComplexity}
              </span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed bg-slate-900/90 p-3 rounded-lg border border-slate-800">
              {currentStep?.description}
            </p>
          </div>

          {/* Priority Queue / Binary Min-Heap / Frontier Inspector */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-amber-400" />
                <span>
                  {algorithm === 'BFS'
                    ? 'FIFO Queue Frontier'
                    : algorithm === 'DFS'
                    ? 'LIFO Stack Frontier'
                    : 'Binary Min-Heap Priority Queue State'}
                </span>
              </h3>
              <span className="font-mono text-xs text-amber-400">
                Size: {currentStep?.frontier.length || 0}
              </span>
            </div>

            <div className="mt-3 space-y-1.5 max-h-[190px] overflow-y-auto pr-1">
              {!currentStep || currentStep.frontier.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">
                  Frontier queue is currently empty.
                </p>
              ) : (
                currentStep.frontier.map((entry, idx) => {
                  const node = graph.getNode(entry.nodeId);
                  return (
                    <div
                      key={`${entry.nodeId}-${idx}`}
                      className="px-3 py-2 rounded bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-amber-400 font-bold">#{idx}</span>
                        <span className="text-white font-sans font-medium truncate">
                          {node?.name || entry.nodeId}
                        </span>
                      </div>
                      <div className="text-right text-[11px] tabular-nums shrink-0">
                        {algorithm === 'ASTAR' && entry.fScore !== undefined ? (
                          <span className="text-cyan-300">
                            f={entry.fScore} (g={entry.gScore}, h={entry.hScore})
                          </span>
                        ) : (
                          <span className="text-cyan-300">cost={entry.priority}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Distance / Cost Table (gScore & Parent Pointers) */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>HashMap Distance & Predecessor Table</span>
              </h3>
              <span className="font-mono text-xs text-cyan-400">
                Visited: {currentStep?.visitedNodes.length || 0} / {graph.getAllNodes().length}
              </span>
            </div>

            <div className="mt-2.5 max-h-[190px] overflow-y-auto pr-1">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[10px]">
                    <th className="py-1.5">Intersection / Node</th>
                    <th className="py-1.5 text-right">Best Cost</th>
                    <th className="py-1.5 text-right">Parent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {graph.getAllNodes().map((node) => {
                    const distVal = currentStep?.distances[node.id];
                    const parentId = currentStep?.previous[node.id];
                    const isVisited = currentStep?.visitedNodes.includes(node.id);
                    return (
                      <tr
                        key={node.id}
                        className={isVisited ? 'text-slate-200' : 'text-slate-500'}
                      >
                        <td className="py-1.5 font-sans font-medium truncate max-w-[160px]">
                          {node.name}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-cyan-300">
                          {distVal === undefined || distVal === 'INF' ? '∞' : distVal}
                        </td>
                        <td className="py-1.5 text-right text-slate-400">
                          {parentId ? graph.getNode(parentId)?.id || parentId : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
