import React from 'react';
import { CampusGraph } from '../graph/Graph';
import { CampusBuildingEntry, IncidentRecord } from '../data/campusData';
import { AnalyticsService } from '../services/analyticsService';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { BarChart3, Cpu, Activity, ShieldAlert } from 'lucide-react';

interface AnalyticsViewProps {
  graph: CampusGraph;
  buildings: CampusBuildingEntry[];
  incidents: IncidentRecord[];
  sourceId: string;
  targetId: string;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  graph,
  buildings,
  incidents,
  sourceId,
  targetId,
}) => {
  const summary = AnalyticsService.getNetworkSummary(graph, buildings, incidents);
  const roadBreakdown = AnalyticsService.getRoadHealthBreakdown(graph);
  const algBenchmark = AnalyticsService.getAlgorithmBenchmarkTable(
    graph,
    sourceId,
    targetId,
    'WALKING'
  );

  const chartRoadData = roadBreakdown.slice(0, 8).map((r) => ({
    name: r.roadName.length > 18 ? r.roadName.slice(0, 16) + '…' : r.roadName,
    BaseTime: r.baseTimeSeconds,
    EffectiveTime: r.effectiveTimeSeconds,
    DistanceMeters: r.distanceMeters,
  }));

  const chartAlgData = algBenchmark.map((a) => ({
    name: a.algorithm.split(' ')[0],
    VisitedNodes: a.visitedNodes,
    TravelTimeSec: a.travelTimeSeconds,
  }));

  return (
    <div className="space-y-6">
      {/* Top Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Network Health Index</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white tabular-nums">
            {summary.networkHealthScore} / 100
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Avg Congestion Multiplier: {summary.averageCongestionMultiplier}x
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>OSM Graph Complexity</span>
            <BarChart3 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white tabular-nums">
            |V| = {summary.totalIntersections}, |E| = {summary.totalUniqueSegments * 2}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Total Mapped Length: {summary.totalNetworkLengthKm} km
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Access Mode Breakdown</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-400 tabular-nums">
            {summary.walkableSegmentsCount} Walk / {summary.vehicleSegmentsCount} Drive
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {summary.closedSegmentsCount} closed • {summary.congestedSegmentsCount} congested
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>A* Search Pruning Efficiency</span>
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-cyan-300 tabular-nums">
            {algBenchmark[1]?.visitedNodes || 0} vs {algBenchmark[0]?.visitedNodes || 0} nodes
          </div>
          <div className="mt-1 text-xs text-slate-500">
            A* vs Dijkstra explored node count
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Base vs Effective Travel Time Bar Chart */}
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-1">
            Campus Corridor Base vs. Effective Traversal Time (Seconds)
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Impact of active road closures and congestion multipliers across real VFSTR OSM corridors
          </p>
          <div className="h-[290px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRoadData} margin={{ top: 10, right: 15, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={10}
                  angle={-15}
                  textAnchor="end"
                />
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
                <Bar dataKey="BaseTime" name="Base Time (s)" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                <Bar
                  dataKey="EffectiveTime"
                  name="Effective Time (s)"
                  fill="#f59e0b"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Algorithm Node Exploration & Travel Time Chart */}
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-1">
            Algorithm Search Effort (Visited Nodes) & Resulting Route Time
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Empirical comparison on the current active origin-destination pair
          </p>
          <div className="h-[290px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartAlgData} margin={{ top: 10, right: 15, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
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
                  dataKey="VisitedNodes"
                  name="Visited Nodes Count"
                  fill="#a855f7"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="TravelTimeSec"
                  name="Route ETA (s)"
                  fill="#10b981"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Full Algorithm Complexity & Performance Table */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          Data Structures & Algorithms Complexity Verification Matrix
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <th className="py-2.5 pr-4">Algorithm</th>
                <th className="py-2.5 px-4">Backing Data Structure</th>
                <th className="py-2.5 px-4">Time Complexity</th>
                <th className="py-2.5 px-4 text-right">Nodes Explored</th>
                <th className="py-2.5 px-4 text-right">Route Distance</th>
                <th className="py-2.5 px-4 text-right">Compute Time</th>
                <th className="py-2.5 pl-4">Optimality Guarantee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {algBenchmark.map((row, idx) => (
                <tr key={row.algorithm} className="hover:bg-slate-900/50">
                  <td className="py-2.5 pr-4 font-semibold text-white">{row.algorithm}</td>
                  <td className="py-2.5 px-4 font-mono text-cyan-400">
                    {idx === 0 || idx === 1
                      ? 'Binary Min-Heap Priority Queue + HashMap'
                      : idx === 2
                      ? 'FIFO Queue + Visited Set'
                      : 'LIFO Stack + Visited Set'}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-300">
                    {idx === 0 || idx === 1 ? 'O((V + E) log V)' : 'O(V + E)'}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-right tabular-nums text-amber-300">
                    {row.visitedNodes}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-right tabular-nums text-slate-200">
                    {row.distanceMeters} m
                  </td>
                  <td className="py-2.5 px-4 font-mono text-right tabular-nums text-cyan-300">
                    {row.executionTimeMs} ms
                  </td>
                  <td className="py-2.5 pl-4 text-emerald-400">{row.optimalityGuaranteed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
