import React, { useState, useMemo } from 'react';
import {
  CampusGraph,
  OptimizationMetric,
  EmergencyVehicleType,
  RoutingProfile,
} from '../graph/Graph';
import { CampusBuildingEntry, IncidentRecord } from '../data/campusData';
import { ExtractedOSMBuilding } from '../graph/osmGraphExtractor';
import { CampusMapCanvas } from '../components/CampusMapCanvas';
import { RoutingEngine } from '../services/routingEngine';
import { AlgorithmExecutionResult } from '../algorithms/dijkstra';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  GitCompare,
  CheckCircle2,
  Award,
  Layers,
  Clock,
  Route,
  Activity,
  Radio,
  Zap,
  CheckSquare,
  Square,
  ArrowRight,
} from 'lucide-react';

interface RouteComparisonViewProps {
  graph: CampusGraph;
  buildings: CampusBuildingEntry[];
  osmBuildings: ExtractedOSMBuilding[];
  incidents: IncidentRecord[];
  sourceId: string;
  targetId: string;
  metric: OptimizationMetric;
  routingProfile: RoutingProfile;
  emergencyMode: boolean;
  emergencyVehicle: EmergencyVehicleType;
  liveSimActive: boolean;
  onToggleLiveSim: () => void;
  onStepLiveSim: () => void;
  onChangeSource: (id: string) => void;
  onChangeTarget: (id: string) => void;
  onChangeMetric: (m: OptimizationMetric) => void;
  onChangeRoutingProfile: (p: RoutingProfile) => void;
}

interface SelectableRouteOption {
  id: string;
  shortCode: string;
  title: string;
  subtitle: string;
  colorHex: string;
  result: AlgorithmExecutionResult;
  deltaTimeSec: number;
  deltaDistMeters: number;
  avgCongestionMultiplier: number;
  maxCongestionMultiplier: number;
}

const ROUTE_COLORS = ['#06b6d4', '#a855f7', '#f59e0b', '#10b981'];

export const RouteComparisonView: React.FC<RouteComparisonViewProps> = ({
  graph,
  buildings,
  osmBuildings,
  incidents,
  sourceId,
  targetId,
  metric,
  routingProfile,
  emergencyMode,
  emergencyVehicle,
  liveSimActive,
  onToggleLiveSim,
  onStepLiveSim,
  onChangeSource,
  onChangeTarget,
  onChangeMetric,
  onChangeRoutingProfile,
}) => {
  // Compute all candidate routes dynamically (Yen's K-Shortest Paths + distinct algorithmic paths)
  const comparison = RoutingEngine.compareAllAlgorithms(
    graph,
    sourceId,
    targetId,
    metric,
    emergencyMode,
    emergencyVehicle,
    routingProfile
  );

  // Build up to 4 selectable routes between the chosen VFSTR campus locations
  const routeOptions: SelectableRouteOption[] = useMemo(() => {
    const options: SelectableRouteOption[] = [];
    const seenSignatures = new Set<string>();
    const baseBestTime = comparison.kShortestAlternatives[0]?.result.totalTimeSeconds ?? 0;
    const baseBestDist = comparison.kShortestAlternatives[0]?.result.totalDistanceMeters ?? 0;

    const computeCongestionStats = (res: AlgorithmExecutionResult) => {
      if (res.segmentSteps.length === 0) {
        return { avg: 1.0, max: 1.0 };
      }
      let sum = 0;
      let max = 1.0;
      for (const seg of res.segmentSteps) {
        sum += seg.congestionFactor;
        if (seg.congestionFactor > max) max = seg.congestionFactor;
      }
      return {
        avg: Number((sum / res.segmentSteps.length).toFixed(2)),
        max: Number(max.toFixed(2)),
      };
    };

    comparison.kShortestAlternatives.forEach((cand, idx) => {
      const sig = cand.result.nodePath.join('->');
      seenSignatures.add(sig);
      const stats = computeCongestionStats(cand.result);
      options.push({
        id: `ROUTE_${idx + 1}`,
        shortCode: `Route ${idx + 1}`,
        title: `Route ${idx + 1}: ${cand.label}`,
        subtitle: cand.recommendationReason,
        colorHex: ROUTE_COLORS[idx % ROUTE_COLORS.length],
        result: cand.result,
        deltaTimeSec: Math.max(0, cand.result.totalTimeSeconds - baseBestTime),
        deltaDistMeters: cand.result.totalDistanceMeters - baseBestDist,
        avgCongestionMultiplier: stats.avg,
        maxCongestionMultiplier: stats.max,
      });
    });

    // Also include BFS or DFS if it discovered an additional distinct path
    for (const extra of [
      { res: comparison.bfs, label: 'Minimum-Hop BFS Corridor' },
      { res: comparison.dfs, label: 'Deep Traversal Backup Path' },
    ]) {
      if (extra.res.found && options.length < 4) {
        const sig = extra.res.nodePath.join('->');
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          const idx = options.length;
          const stats = computeCongestionStats(extra.res);
          options.push({
            id: `ROUTE_${idx + 1}`,
            shortCode: `Route ${idx + 1}`,
            title: `Route ${idx + 1}: ${extra.label}`,
            subtitle: `Unweighted ${extra.res.algorithmName} path (${extra.res.segmentSteps.length} segments)`,
            colorHex: ROUTE_COLORS[idx % ROUTE_COLORS.length],
            result: extra.res,
            deltaTimeSec: Math.max(0, extra.res.totalTimeSeconds - baseBestTime),
            deltaDistMeters: extra.res.totalDistanceMeters - baseBestDist,
            avgCongestionMultiplier: stats.avg,
            maxCongestionMultiplier: stats.max,
          });
        }
      }
    }

    return options;
  }, [comparison]);

  // Allow user to select 2 or more routes to compare (default: all available up to 3)
  const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([
    'ROUTE_1',
    'ROUTE_2',
    'ROUTE_3',
  ]);

  const toggleSelectRoute = (id: string) => {
    setSelectedRouteIds((prev) => {
      if (prev.includes(id)) {
        // Keep at least 1 route selected
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item !== id);
      }
      return [...prev, id];
    });
  };

  const activeComparedRoutes = useMemo(() => {
    const filtered = routeOptions.filter((r) => selectedRouteIds.includes(r.id));
    return filtered.length > 0 ? filtered : routeOptions.slice(0, 2);
  }, [routeOptions, selectedRouteIds]);

  const primaryMapRoute = activeComparedRoutes[0];
  const secondaryMapRoute = activeComparedRoutes[1] || activeComparedRoutes[0];

  // 1. Recharts Bar Chart Data: Estimated Travel Time (s) & Distance (m) per Selected Route
  const barChartData = useMemo(
    () =>
      activeComparedRoutes.map((r) => ({
        route: r.shortCode,
        fullTitle: r.title,
        TravelTimeSec: r.result.totalTimeSeconds,
        DistanceMeters: r.result.totalDistanceMeters,
        AvgTrafficPercent: Math.round(r.avgCongestionMultiplier * 100),
      })),
    [activeComparedRoutes]
  );

  // 2. Recharts Line Chart Data: Traffic Intensity (%) & Congestion Factor across each segment of the selected routes
  const lineChartData = useMemo(() => {
    const maxSegments = Math.max(
      1,
      ...activeComparedRoutes.map((r) => r.result.segmentSteps.length)
    );
    const rows: Array<Record<string, string | number>> = [];

    for (let sIdx = 0; sIdx < maxSegments; sIdx++) {
      const row: Record<string, string | number> = {
        segmentLabel: `Seg ${sIdx + 1}`,
      };
      for (const routeOpt of activeComparedRoutes) {
        const step = routeOpt.result.segmentSteps[sIdx];
        if (step) {
          // Traffic Intensity Index: 100% = normal flow (1.0x), 240% = 2.4x congestion
          row[`${routeOpt.shortCode}_Traffic`] = Math.round(step.congestionFactor * 100);
          row[`${routeOpt.shortCode}_Road`] = step.roadName;
        }
      }
      rows.push(row);
    }
    return rows;
  }, [activeComparedRoutes]);

  const sourceBuilding = buildings.find((b) => b.nearestNodeId === sourceId || b.id === sourceId);
  const targetBuilding = buildings.find((b) => b.nearestNodeId === targetId || b.id === targetId);

  // Quick Building Pair Presets (including Academic Block -> Girls Hostel)
  const applyPresetPair = (fromBldId: string, toBldId: string) => {
    const fromB = buildings.find((b) => b.id === fromBldId);
    const toB = buildings.find((b) => b.id === toBldId);
    if (fromB?.nearestNodeId) onChangeSource(fromB.nearestNodeId);
    if (toB?.nearestNodeId) onChangeTarget(toB.nearestNodeId);
  };

  return (
    <div className="space-y-6">
      {/* Top Route Comparison Configuration & Live Traffic Header */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Multi-Route Comparison & Live Traffic Intensity Analyzer
              </h2>
              <p className="text-xs text-slate-400">
                Select two or more routes between any VFSTR campus locations to compare travel time, distance, and segment-by-segment traffic levels in real time
              </p>
            </div>
          </div>

          {/* Live Traffic Simulation Trigger */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={onStepLiveSim}
              className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Pulse Live Traffic Change</span>
            </button>
            <button
              type="button"
              onClick={onToggleLiveSim}
              className={`px-3 py-1.5 rounded-lg font-medium border flex items-center gap-1.5 ${
                liveSimActive
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-900 text-slate-300 border-slate-700'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${liveSimActive ? 'animate-pulse' : ''}`} />
              <span>{liveSimActive ? 'Live Sim: ON' : 'Live Sim: OFF'}</span>
            </button>
          </div>
        </div>

        {/* Origin / Destination Selectors & Quick Campus Corridor Presets */}
        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <div>
              <span className="text-slate-400 mr-1.5">Origin:</span>
              <select
                value={sourceBuilding?.id || ''}
                onChange={(e) => {
                  const b = buildings.find((item) => item.id === e.target.value);
                  if (b && b.nearestNodeId) onChangeSource(b.nearestNodeId);
                }}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-medium"
              >
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.officialName} ({b.shortName})
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight className="w-4 h-4 text-cyan-400 hidden sm:inline" />

            <div>
              <span className="text-slate-400 mr-1.5">Destination:</span>
              <select
                value={targetBuilding?.id || ''}
                onChange={(e) => {
                  const b = buildings.find((item) => item.id === e.target.value);
                  if (b && b.nearestNodeId) onChangeTarget(b.nearestNodeId);
                }}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-medium"
              >
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.officialName} ({b.shortName})
                  </option>
                ))}
              </select>
            </div>

            <select
              value={routingProfile}
              onChange={(e) => onChangeRoutingProfile(e.target.value as RoutingProfile)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-cyan-300 font-mono"
            >
              <option value="WALKING">Mode: WALKING</option>
              <option value="BICYCLE">Mode: BICYCLE</option>
              <option value="VEHICLE">Mode: VEHICLE</option>
            </select>

            <select
              value={metric}
              onChange={(e) => onChangeMetric(e.target.value as OptimizationMetric)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-cyan-300 font-mono"
            >
              <option value="TIME">Optimize: Travel Time</option>
              <option value="DISTANCE">Optimize: Distance (m)</option>
            </select>
          </div>

          {/* One-Click VFSTR Campus Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400 text-[11px]">Presets:</span>
            <button
              type="button"
              onClick={() => applyPresetPair('BLD_A_BLOCK', 'BLD_GIRLS_HOSTEL')}
              className="px-2 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[11px]"
            >
              Academic Block → Girls Hostel
            </button>
            <button
              type="button"
              onClick={() => applyPresetPair('BLD_LIBRARY', 'BLD_BOYS_HOSTEL')}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
            >
              Library → Boys Hostel
            </button>
            <button
              type="button"
              onClick={() => applyPresetPair('BLD_U_BLOCK', 'BLD_P_BLOCK')}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
            >
              U Block → P Block
            </button>
            <button
              type="button"
              onClick={() => applyPresetPair('BLD_H_BLOCK', 'BLD_CANTEEN')}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
            >
              H Block → Canteen
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Route Selection Cards (Select 2 or More Routes to Compare) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wider text-slate-300">
            Select Two or More Routes to Compare ({activeComparedRoutes.length} of{' '}
            {routeOptions.length} Selected)
          </span>
          <span className="text-slate-400">
            Click any route card below to toggle inclusion in Recharts & segment comparison
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {routeOptions.map((opt, idx) => {
            const isSelected = activeComparedRoutes.some((r) => r.id === opt.id);
            return (
              <div
                key={opt.id}
                onClick={() => toggleSelectRoute(opt.id)}
                className={`p-4 rounded-lg border cursor-pointer transition-all flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? 'bg-[#111827] border-cyan-500/60 shadow-lg shadow-cyan-950/30'
                    : 'bg-[#111827]/60 border-slate-800/80 opacity-65 hover:opacity-100'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isSelected ? (
                        <CheckSquare
                          className="w-4 h-4 shrink-0"
                          style={{ color: opt.colorHex }}
                        />
                      ) : (
                        <Square className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-white">{opt.title}</span>
                    </div>
                    {idx === 0 && (
                      <span title="Optimal Route" className="shrink-0">
                        <Award className="w-4 h-4 text-emerald-400" />
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{opt.subtitle}</p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-center">
                  <div className="p-2 rounded bg-slate-900/90">
                    <div className="text-[10px] text-slate-400">Travel Time</div>
                    <div className="text-sm font-bold font-mono text-white tabular-nums mt-0.5">
                      {opt.result.totalTimeSeconds}s
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-900/90">
                    <div className="text-[10px] text-slate-400">Distance</div>
                    <div className="text-sm font-bold font-mono text-cyan-300 tabular-nums mt-0.5">
                      {opt.result.totalDistanceMeters}m
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-900/90">
                    <div className="text-[10px] text-slate-400">Avg Traffic</div>
                    <div
                      className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${
                        opt.avgCongestionMultiplier > 1.5
                          ? 'text-rose-400'
                          : opt.avgCongestionMultiplier > 1.15
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {opt.avgCongestionMultiplier}x
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono pt-1">
                  <span className="text-slate-400">
                    {opt.result.segmentSteps.length} road segments
                  </span>
                  {opt.deltaTimeSec === 0 ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Fastest
                    </span>
                  ) : (
                    <span className="text-amber-400">
                      +{opt.deltaTimeSec}s ({opt.deltaDistMeters >= 0 ? '+' : ''}
                      {opt.deltaDistMeters}m)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recharts Visual Comparison Row: Bar Chart (Time & Distance) + Line Chart (Traffic Intensity Over Route) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Bar Chart: Estimated Travel Time & Distance Comparison */}
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Route Travel Time (s) & Distance (m) Comparison</span>
            </h3>
            <span className="text-[11px] font-mono text-cyan-400">Recharts BarChart</span>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Dynamically compares total estimated travel time and Haversine distance across selected routes
          </p>

          <div className="h-[290px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="route" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar
                  dataKey="TravelTimeSec"
                  name="Estimated Travel Time (s)"
                  fill="#06b6d4"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="DistanceMeters"
                  name="Total Distance (m)"
                  fill="#a855f7"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Line Chart: Traffic Intensity Over Progressive Route Segments */}
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <span>Traffic Intensity Over Route Segments (100% = Clear Flow)</span>
            </h3>
            <span className="text-[11px] font-mono text-amber-400">Recharts LineChart</span>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Visualizes real-time traffic intensity (%) across each consecutive road segment from origin to destination
          </p>

          <div className="h-[290px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineChartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="segmentLabel" stroke="#94a3b8" fontSize={11} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  domain={[80, 'auto']}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                {activeComparedRoutes.map((routeOpt) => (
                  <Line
                    key={routeOpt.id}
                    type="monotone"
                    dataKey={`${routeOpt.shortCode}_Traffic`}
                    name={`${routeOpt.shortCode} Traffic Intensity (%)`}
                    stroke={routeOpt.colorHex}
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Segment-by-Segment Traffic Breakdown + Interactive Dual-Corridor Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Detailed Segment-by-Segment Traffic Comparison (6 cols) */}
        <div className="lg:col-span-6 bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>Segment-by-Segment Traffic & ETA Breakdown</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Inspect distance, travel time, and current traffic level for every road segment on each selected route
              </p>
            </div>
          </div>

          <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
            {activeComparedRoutes.map((routeOpt) => (
              <div
                key={routeOpt.id}
                className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full inline-block"
                      style={{ backgroundColor: routeOpt.colorHex }}
                    />
                    <span className="text-xs font-bold text-white">{routeOpt.title}</span>
                  </div>
                  <div className="font-mono text-xs text-cyan-300 tabular-nums">
                    Total: {routeOpt.result.totalTimeSeconds}s •{' '}
                    {routeOpt.result.totalDistanceMeters}m • Avg {routeOpt.avgCongestionMultiplier}x
                  </div>
                </div>

                {/* Segment Rows */}
                <div className="space-y-1.5">
                  {routeOpt.result.segmentSteps.map((seg) => {
                    const isHazard = seg.status === 'ACCIDENT' || seg.status === 'CLOSED';
                    const isSlow = seg.status === 'CONGESTED' || seg.congestionFactor > 1.25;

                    return (
                      <div
                        key={`${routeOpt.id}-${seg.stepIndex}-${seg.edgeId}`}
                        className="px-2.5 py-1.5 rounded bg-slate-950/80 border border-slate-800/80 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[10px] text-slate-500">
                            #{seg.stepIndex}
                          </span>
                          <div className="min-w-0">
                            <div className="text-slate-200 font-medium truncate">
                              {seg.roadName}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {seg.fromNodeName} → {seg.toNodeName}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 font-mono text-[11px] shrink-0 tabular-nums">
                          <span className="text-slate-400">{seg.distanceMeters}m</span>
                          <span className="text-cyan-300 font-semibold">{seg.timeSeconds}s</span>
                          <span
                            className={`w-24 text-right ${
                              isHazard
                                ? 'text-rose-400 font-bold'
                                : isSlow
                                ? 'text-amber-400 font-semibold'
                                : 'text-emerald-400'
                            }`}
                          >
                            {seg.congestionFactor.toFixed(1)}x {seg.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Dual-Corridor Map Overlay (6 cols) */}
        <div className="lg:col-span-6 bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden flex flex-col h-[520px]">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Route className="w-4 h-4 text-cyan-400" />
              <span>
                Cyan Solid: {primaryMapRoute?.shortCode || 'Route 1'} • Purple Dashed:{' '}
                {secondaryMapRoute?.shortCode || 'Route 2'}
              </span>
            </span>
            <span className="font-mono text-cyan-400">
              {sourceBuilding?.shortName} → {targetBuilding?.shortName}
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
              highlightedNodePath={primaryMapRoute?.result.nodePath || []}
              highlightedEdgePath={primaryMapRoute?.result.edgePath || []}
              routeGeometry={primaryMapRoute?.result.routeGeometry || []}
              secondaryNodePath={secondaryMapRoute?.result.nodePath || []}
              secondaryEdgePath={secondaryMapRoute?.result.edgePath || []}
              emergencyMode={emergencyMode}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
