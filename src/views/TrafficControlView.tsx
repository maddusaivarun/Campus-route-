import React, { useState } from 'react';
import { CampusGraph, RoadStatus, GraphEdge } from '../graph/Graph';
import {
  CampusBuildingEntry,
  IncidentRecord,
  IncidentVerificationStatus,
} from '../data/campusData';
import { ExtractedOSMBuilding } from '../graph/osmGraphExtractor';
import { CampusMapCanvas } from '../components/CampusMapCanvas';
import {
  TrafficEngine,
  LiveTrafficTickEvent,
  SimulationIntensity,
} from '../services/trafficEngine';
import {
  AlertTriangle,
  PlusCircle,
  RotateCcw,
  Sliders,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Radio,
  Play,
  Pause,
  Zap,
} from 'lucide-react';

interface TrafficControlViewProps {
  graph: CampusGraph;
  buildings: CampusBuildingEntry[];
  osmBuildings: ExtractedOSMBuilding[];
  incidents: IncidentRecord[];
  adminMode: boolean;
  liveSimActive: boolean;
  liveSimIntervalMs: number;
  liveSimIntensity: SimulationIntensity;
  liveTrafficEvents: LiveTrafficTickEvent[];
  onToggleLiveSim: () => void;
  onStepLiveSim: () => void;
  onChangeSimInterval: (ms: number) => void;
  onChangeSimIntensity: (intensity: SimulationIntensity) => void;
  onUpdateEdgeCondition: (
    edgeId: string,
    updates: { congestionFactor?: number; status?: RoadStatus; incidentReport?: string }
  ) => void;
  onReportIncident: (params: {
    edgeId: string;
    type: IncidentRecord['type'];
    severity: IncidentRecord['severity'];
    title: string;
    description: string;
    reportedByRole: 'USER' | 'ADMIN';
    expiryMinutes: number;
  }) => void;
  onUpdateIncidentVerification: (
    incidentId: string,
    status: IncidentVerificationStatus
  ) => void;
  onTriggerScenario: (
    scenario:
      | 'CLEAR'
      | 'PEAK_CONVOCATION'
      | 'SPINE_CLOSURE'
      | 'HOSTEL_MEDICAL_ALERT'
      | 'RANDOM_STRESS'
  ) => void;
}

export const TrafficControlView: React.FC<TrafficControlViewProps> = ({
  graph,
  buildings,
  osmBuildings,
  incidents,
  adminMode,
  liveSimActive,
  liveSimIntervalMs,
  liveSimIntensity,
  liveTrafficEvents,
  onToggleLiveSim,
  onStepLiveSim,
  onChangeSimInterval,
  onChangeSimIntensity,
  onUpdateEdgeCondition,
  onReportIncident,
  onUpdateIncidentVerification,
  onTriggerScenario,
}) => {
  const uniqueEdges = graph.getUniqueUndirectedEdges();
  const corridorLinks = TrafficEngine.getCampusCorridorLinks(graph);

  const [selectedEdgeId, setSelectedEdgeId] = useState<string>(uniqueEdges[0]?.id || 'E01');
  const [incidentType, setIncidentType] = useState<IncidentRecord['type']>('CLOSURE');
  const [incidentSeverity, setIncidentSeverity] = useState<IncidentRecord['severity']>('HIGH');
  const [incidentTitle, setIncidentTitle] = useState<string>('');
  const [incidentDesc, setIncidentDesc] = useState<string>('');
  const [expiryMinutes, setExpiryMinutes] = useState<number>(120);
  const [categoryFilter, setCategoryFilter] = useState<
    'ALL' | 'USER_REPORTED' | 'ADMIN_CONFIRMED' | 'SIMULATED_TRAFFIC'
  >('ALL');

  const handleSelectEdgeFromMap = (edge: GraphEdge) => {
    setSelectedEdgeId(edge.id);
  };

  const handleSubmitIncident = (e: React.FormEvent) => {
    e.preventDefault();
    const edge = graph.getEdge(selectedEdgeId) || uniqueEdges[0];
    if (!edge) return;

    const finalTitle =
      incidentTitle.trim() || `${incidentType} reported on ${edge.roadName}`;
    const finalDesc =
      incidentDesc.trim() ||
      `Reported on ${edge.roadName} (${edge.distanceMeters}m segment). Dynamic route weights updated.`;

    onReportIncident({
      edgeId: edge.id,
      type: incidentType,
      severity: incidentSeverity,
      title: finalTitle,
      description: finalDesc,
      reportedByRole: adminMode ? 'ADMIN' : 'USER',
      expiryMinutes,
    });

    setIncidentTitle('');
    setIncidentDesc('');
  };

  const filteredIncidents = incidents.filter((inc) =>
    categoryFilter === 'ALL' ? true : inc.category === categoryFilter
  );

  return (
    <div className="space-y-6">
      {/* Real-Time Dynamic Traffic Simulation Controller Bar */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
              liveSimActive
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <Radio className={`w-5 h-5 ${liveSimActive ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">
                Real-Time Dynamic Traffic Simulation Engine (9 VFSTR Locations)
              </h2>
              <span
                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                  liveSimActive
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : 'bg-slate-900 text-slate-400 border-slate-700'
                }`}
              >
                {liveSimActive ? 'LIVE STREAM ACTIVE' : 'PAUSED'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Randomly generates realistic traffic flow changes, slow-downs, and accidents between Academic Block, Library, Boys Hostel, Girls Hostel, Canteen, U Block, H Block, P Block, and N Block.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0 text-xs">
          <button
            type="button"
            onClick={onToggleLiveSim}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 border transition-colors ${
              liveSimActive
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            {liveSimActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{liveSimActive ? 'Pause Stream' : 'Start Stream'}</span>
          </button>

          <button
            type="button"
            onClick={onStepLiveSim}
            className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Trigger Random Traffic Event</span>
          </button>

          <select
            value={liveSimIntervalMs}
            onChange={(e) => onChangeSimInterval(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono"
            title="Simulation Tick Interval"
          >
            <option value={3000}>Tick: 3s (Fast)</option>
            <option value={5000}>Tick: 5s (Standard)</option>
            <option value={8000}>Tick: 8s (Relaxed)</option>
          </select>

          <select
            value={liveSimIntensity}
            onChange={(e) => onChangeSimIntensity(e.target.value as SimulationIntensity)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-cyan-300 font-mono"
            title="Traffic Simulation Intensity"
          >
            <option value="NORMAL">Intensity: Normal</option>
            <option value="PEAK_HOUR">Intensity: Peak Shift</option>
            <option value="HIGH_INCIDENT">Intensity: High Incident</option>
          </select>

          <button
            onClick={() => onTriggerScenario('CLEAR')}
            className="px-3 py-1.5 rounded-lg font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All</span>
          </button>
        </div>
      </div>

      {/* 9-Building Corridor Flow Overview Cards */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Live Traffic Overview Across VFSTR Campus Corridors
            </h3>
            <p className="text-xs text-slate-400">
              Real-time simulated traffic levels connecting Academic Block, Library, Hostels, Canteen, U, H, P & N Blocks
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => onTriggerScenario('PEAK_CONVOCATION')}
              className="px-2.5 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
            >
              Sim Peak Shift
            </button>
            <button
              onClick={() => onTriggerScenario('SPINE_CLOSURE')}
              className="px-2.5 py-1 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25"
            >
              Sim Spine Closure
            </button>
            <button
              onClick={() => onTriggerScenario('HOSTEL_MEDICAL_ALERT')}
              className="px-2.5 py-1 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25"
            >
              Sim Hostel Cordon
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {corridorLinks.map((cor) => {
            const isHazard = cor.status === 'ACCIDENT' || cor.status === 'CLOSED';
            const isSlow = cor.status === 'CONGESTED' || cor.congestionFactor > 1.3;
            return (
              <div
                key={cor.id}
                className={`p-3 rounded-lg border transition-colors ${
                  isHazard
                    ? 'bg-rose-950/25 border-rose-500/40'
                    : isSlow
                    ? 'bg-amber-950/20 border-amber-500/35'
                    : 'bg-slate-900/70 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-white truncate">
                    {cor.fromLocation} ↔ {cor.toLocation}
                  </span>
                  <span
                    className={`font-mono text-[10px] font-bold uppercase ${
                      isHazard
                        ? 'text-rose-400'
                        : isSlow
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {cor.status}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">{cor.roadName}</div>
                <div className="mt-2 flex items-center justify-between font-mono text-xs tabular-nums">
                  <span className="text-slate-300">{cor.effectiveSpeedKmh} km/h</span>
                  <span className="text-cyan-300">{cor.congestionFactor.toFixed(1)}x delay</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Road Segment Matrix & Manual Congestion Controls (7 cols) */}
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800/90 rounded-lg p-4 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span>VFSTR OpenStreetMap Road & Footpath Matrix ({uniqueEdges.length} Segments)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Adjust individual road segment congestion sliders or force road closures
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3 max-h-[560px] overflow-y-auto pr-1">
            {uniqueEdges.map((edge) => {
              const effectiveTime =
                edge.status === 'CLOSED'
                  ? null
                  : Math.round(edge.baseTimeSeconds * edge.congestionFactor);

              return (
                <div
                  key={edge.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    edge.status === 'CLOSED'
                      ? 'bg-rose-950/20 border-rose-500/40'
                      : edge.status === 'ACCIDENT'
                      ? 'bg-rose-950/15 border-rose-500/30'
                      : edge.status === 'CONGESTED'
                      ? 'bg-amber-950/15 border-amber-500/30'
                      : 'bg-slate-900/70 border-slate-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">{edge.roadName}</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          [{edge.highwayType} • {edge.distanceMeters}m]
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Access: {edge.allowVehicle ? 'Motor Vehicle + Walk' : 'Pedestrian Only'} •{' '}
                        {edge.incidentReport ? (
                          <span className="text-amber-300">{edge.incidentReport}</span>
                        ) : (
                          'Base Speed: ' + edge.maxSpeedKmh + ' km/h'
                        )}
                      </div>
                    </div>

                    {/* Status Buttons */}
                    <div className="flex items-center gap-1">
                      {(['OPEN', 'CONGESTED', 'ACCIDENT', 'CLOSED'] as RoadStatus[]).map((st) => (
                        <button
                          key={st}
                          onClick={() =>
                            onUpdateEdgeCondition(edge.id, {
                              status: st,
                              congestionFactor:
                                st === 'OPEN'
                                  ? 1.0
                                  : st === 'CONGESTED'
                                  ? Math.max(1.8, edge.congestionFactor)
                                  : st === 'ACCIDENT'
                                  ? 3.2
                                  : 9.9,
                            })
                          }
                          className={`px-2 py-1 rounded text-[10px] font-mono font-semibold transition-colors border ${
                            edge.status === st
                              ? st === 'OPEN'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : st === 'CONGESTED'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-rose-500/25 text-rose-300 border-rose-500/50'
                              : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Congestion Factor Slider */}
                  <div className="mt-3 flex items-center gap-4">
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 w-24 shrink-0">
                        Delay Factor:
                      </span>
                      <input
                        type="range"
                        min={1.0}
                        max={4.5}
                        step={0.1}
                        disabled={edge.status === 'CLOSED'}
                        value={edge.congestionFactor}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          onUpdateEdgeCondition(edge.id, {
                            congestionFactor: val,
                            status: val > 1.5 ? 'CONGESTED' : 'OPEN',
                          });
                        }}
                        className="w-full accent-cyan-400 cursor-pointer disabled:opacity-40"
                      />
                    </div>
                    <div className="w-32 text-right font-mono text-xs tabular-nums">
                      <span className="text-cyan-400 font-semibold">
                        {edge.congestionFactor.toFixed(1)}x
                      </span>
                      <span className="text-slate-500 ml-1.5">
                        ({effectiveTime !== null ? `${effectiveTime}s` : 'BLOCKED'})
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Map Preview + Live Traffic Stream Log + Incident Reporting (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Interactive Map Preview */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-white">
                Click any road polyline on map to select segment
              </span>
              <span className="font-mono text-cyan-400">Selected: {selectedEdgeId}</span>
            </div>
            <div className="h-[240px]">
              <CampusMapCanvas
                graph={graph}
                buildings={buildings}
                osmBuildings={osmBuildings}
                incidents={incidents}
                compact
                showLegend={false}
                onSelectEdge={handleSelectEdgeFromMap}
              />
            </div>
          </div>

          {/* Live Dynamic Traffic Event Log */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>Live Simulated Traffic Stream ({liveTrafficEvents.length})</span>
              </h3>
              <span className="text-[10px] font-mono text-emerald-400">
                {liveSimActive ? 'Auto-Updating' : 'Manual Mode'}
              </span>
            </div>
            <div className="mt-2.5 space-y-2 max-h-[160px] overflow-y-auto pr-1">
              {liveTrafficEvents.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">
                  Click &quot;Trigger Random Traffic Event&quot; or enable the stream above.
                </p>
              ) : (
                liveTrafficEvents.slice(0, 8).map((evt) => (
                  <div
                    key={evt.id}
                    className="p-2 rounded bg-slate-900/90 border border-slate-800 text-xs flex flex-col gap-0.5"
                  >
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span
                        className={
                          evt.eventType === 'ACCIDENT'
                            ? 'text-rose-400 font-bold'
                            : evt.eventType === 'FLOW_CLEARED'
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }
                      >
                        [{evt.eventType}] {evt.fromLocation} ↔ {evt.toLocation}
                      </span>
                      <span className="text-slate-500">{evt.timestamp}</span>
                    </div>
                    <span className="text-[11px] text-slate-300">{evt.summary}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Submit Incident Form */}
          <form
            onSubmit={handleSubmitIncident}
            className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-amber-400" />
                <span>Report Campus Road Incident / Closure</span>
              </h3>
              <span className="text-[11px] font-mono text-cyan-400">
                Role: {adminMode ? 'ADMIN (Verified)' : 'USER'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Target Road Segment</label>
                <select
                  value={selectedEdgeId}
                  onChange={(e) => setSelectedEdgeId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  {uniqueEdges.map((edge) => (
                    <option key={edge.id} value={edge.id}>
                      {edge.roadName} ({edge.distanceMeters}m)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Incident Type</label>
                <select
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value as IncidentRecord['type'])}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  <option value="CLOSURE">Road Closure / Barricade</option>
                  <option value="CONSTRUCTION">Construction / Crane Work</option>
                  <option value="ACCIDENT">Vehicle / Pedestrian Accident</option>
                  <option value="CONGESTION">Heavy Crowd / Convocation Flow</option>
                  <option value="MEDICAL">Medical Emergency Cordon</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Severity Level</label>
                <select
                  value={incidentSeverity}
                  onChange={(e) =>
                    setIncidentSeverity(e.target.value as IncidentRecord['severity'])
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  <option value="MODERATE">MODERATE</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Auto-Expiry Duration</label>
                <select
                  value={expiryMinutes}
                  onChange={(e) => setExpiryMinutes(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  <option value={30}>30 Minutes</option>
                  <option value={120}>2 Hours</option>
                  <option value={480}>8 Hours</option>
                  <option value={1440}>24 Hours</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Incident Headline</label>
              <input
                type="text"
                placeholder="e.g., Crane maintenance blocking Central Library Spine"
                value={incidentTitle}
                onChange={(e) => setIncidentTitle(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors"
            >
              Submit Incident & Recalculate Active Routes
            </button>
          </form>

          {/* Active Incident Feed & Admin Review Controls */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Incident Verification Queue ({filteredIncidents.length})</span>
              </h3>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
                className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-300"
              >
                <option value="ALL">All Categories</option>
                <option value="ADMIN_CONFIRMED">Admin Confirmed</option>
                <option value="USER_REPORTED">User Reported</option>
                <option value="SIMULATED_TRAFFIC">Simulated Traffic</option>
              </select>
            </div>

            <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
              {filteredIncidents.map((inc) => (
                <div
                  key={inc.id}
                  className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{inc.title}</span>
                    <span
                      className={`font-mono text-[10px] uppercase ${
                        inc.verificationStatus === 'ADMIN_CONFIRMED'
                          ? 'text-cyan-400'
                          : inc.verificationStatus === 'UNVERIFIED_USER_REPORT'
                          ? 'text-amber-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {inc.verificationStatus}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px]">{inc.description}</p>

                  {inc.verificationStatus !== 'RESOLVED' &&
                    inc.verificationStatus !== 'REJECTED' && (
                      <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-end gap-2">
                        {inc.verificationStatus === 'UNVERIFIED_USER_REPORT' && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateIncidentVerification(inc.id, 'ADMIN_CONFIRMED')
                            }
                            className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] flex items-center gap-1"
                          >
                            <ShieldCheck className="w-3 h-3" /> Confirm
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onUpdateIncidentVerification(inc.id, 'RESOLVED')}
                          className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] flex items-center gap-1"
                        >
                          <CheckCircle className="w-3 h-3" /> Resolve
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateIncidentVerification(inc.id, 'REJECTED')}
                          className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] flex items-center gap-1"
                        >
                          <XCircle className="w-3 h-3" /> Reject
                        </button>
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
