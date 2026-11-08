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
import { RoutingAlgorithmType } from '../services/routingEngine';
import { AlgorithmExecutionResult } from '../algorithms/dijkstra';
import { runYenKShortestPaths } from '../algorithms/yenKShortest';
import { RouteHistoryEntry } from '../services/storageService';
import { GpsPositionState, snapGpsToWalkableSegment } from '../services/gpsService';
import {
  LiveWalkNavigationStatus,
  LiveWalkNavigationTelemetry,
} from '../services/liveTurnByTurnNavigator';
import {
  TrafficEngine,
  LiveTrafficTickEvent,
} from '../services/trafficEngine';
import { GooglePlaceDiscoveryResult } from '../services/googleMapsRealtimeService';
import {
  Navigation,
  ArrowRightLeft,
  Clock,
  Route,
  Compass,
  CheckCircle2,
  AlertOctagon,
  Footprints,
  Bike,
  Car,
  LocateFixed,
  Search,
  Maximize2,
  Square,
  Radio,
  Zap,
  AlertTriangle,
  Play,
  Pause,
  Crosshair,
  Gauge,
  CornerUpRight,
} from 'lucide-react';

interface LiveNavigationViewProps {
  graph: CampusGraph;
  buildings: CampusBuildingEntry[];
  osmBuildings: ExtractedOSMBuilding[];
  incidents: IncidentRecord[];
  gpsState: GpsPositionState;
  onStartGpsTracking: () => void;
  onStopGpsTracking: () => void;
  onUseGpsAsOrigin: () => void;
  sourceId: string;
  targetId: string;
  algorithm: RoutingAlgorithmType;
  metric: OptimizationMetric;
  routingProfile: RoutingProfile;
  walkingSpeedMps: number;
  onChangeWalkingSpeed: (speedMps: number) => void;
  emergencyMode: boolean;
  emergencyVehicle: EmergencyVehicleType;
  activeRoute: AlgorithmExecutionResult;
  routeHistory: RouteHistoryEntry[];
  liveNavStatus: LiveWalkNavigationStatus;
  liveNavTelemetry: LiveWalkNavigationTelemetry | null;
  autoRerouteCount: number;
  onStartLiveWalkNavigation: () => void;
  onPauseLiveWalkNavigation: () => void;
  onResumeLiveWalkNavigation: () => void;
  onEndLiveWalkNavigation: () => void;
  liveSimActive: boolean;
  liveTrafficEvents: LiveTrafficTickEvent[];
  dynamicRerouteBanner: string | null;
  onToggleLiveSim: () => void;
  onStepLiveSim: () => void;
  onChangeSource: (id: string) => void;
  onChangeTarget: (id: string) => void;
  onSwapNodes: () => void;
  onChangeAlgorithm: (alg: RoutingAlgorithmType) => void;
  onChangeMetric: (m: OptimizationMetric) => void;
  onChangeRoutingProfile: (p: RoutingProfile) => void;
  onSelectBuildingFromMap: (building: CampusBuildingEntry, role: 'ORIGIN' | 'DESTINATION') => void;
  onSelectNodeFromMap: (nodeId: string, role: 'ORIGIN' | 'DESTINATION') => void;
  onSnapBuildingToPlace?: (buildingId: string, place: GooglePlaceDiscoveryResult) => void;
}

export const LiveNavigationView: React.FC<LiveNavigationViewProps> = ({
  graph,
  buildings,
  osmBuildings,
  incidents,
  gpsState,
  onStartGpsTracking,
  onStopGpsTracking,
  onUseGpsAsOrigin,
  sourceId,
  targetId,
  algorithm,
  metric,
  routingProfile,
  walkingSpeedMps,
  onChangeWalkingSpeed,
  emergencyMode,
  emergencyVehicle,
  activeRoute,
  routeHistory,
  liveNavStatus,
  liveNavTelemetry,
  autoRerouteCount,
  onStartLiveWalkNavigation,
  onPauseLiveWalkNavigation,
  onResumeLiveWalkNavigation,
  onEndLiveWalkNavigation,
  liveSimActive,
  liveTrafficEvents,
  dynamicRerouteBanner,
  onToggleLiveSim,
  onStepLiveSim,
  onChangeSource,
  onChangeTarget,
  onSwapNodes,
  onChangeAlgorithm,
  onChangeMetric,
  onChangeRoutingProfile,
  onSelectBuildingFromMap,
  onSelectNodeFromMap,
  onSnapBuildingToPlace,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [clickTargetRole, setClickTargetRole] = useState<'ORIGIN' | 'DESTINATION'>('DESTINATION');
  const [fitRouteTrigger, setFitRouteTrigger] = useState(0);
  const [recenterGpsTrigger, setRecenterGpsTrigger] = useState(0);
  const [selectedAltIdx, setSelectedAltIdx] = useState<number>(0);

  const filteredBuildings = buildings.filter(
    (b) =>
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.officialName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.shortName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sourceBuilding = buildings.find((b) => b.nearestNodeId === sourceId || b.id === sourceId);
  const targetBuilding = buildings.find((b) => b.nearestNodeId === targetId || b.id === targetId);
  const sourceNode = graph.getNode(sourceId);
  const targetNode = graph.getNode(targetId);

  // Compute K-Shortest Valid Alternative Routes
  const alternativeRoutes = useMemo(() => {
    if (!sourceId || !targetId || sourceId === targetId) return [];
    return runYenKShortestPaths(
      graph,
      sourceId,
      targetId,
      3,
      metric,
      emergencyMode,
      emergencyMode ? emergencyVehicle : 'NONE',
      routingProfile
    );
  }, [graph, sourceId, targetId, metric, emergencyMode, emergencyVehicle, routingProfile, activeRoute]);

  // Compute live GPS-to-walkable-segment snap preview when GPS is active
  const gpsSnapResult = useMemo(() => {
    if (gpsState.lat === null || gpsState.lng === null) return null;
    return snapGpsToWalkableSegment(
      graph,
      gpsState.lat,
      gpsState.lng,
      gpsState.accuracyMeters,
      routingProfile
    );
  }, [graph, gpsState.lat, gpsState.lng, gpsState.accuracyMeters, routingProfile]);

  const corridorLinks = TrafficEngine.getCampusCorridorLinks(graph);
  const impactedSegmentsOnRoute = activeRoute.segmentSteps.filter(
    (seg) => seg.status !== 'OPEN' || seg.congestionFactor > 1.25
  );

  const secondaryAltRoute = alternativeRoutes[selectedAltIdx > 0 ? selectedAltIdx : 1];

  return (
    <div className="space-y-5">
      {/* Live Walking Turn-by-Turn Navigation Command Banner */}
      <div className="bg-[#111827] border border-cyan-500/40 rounded-lg p-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
                liveNavStatus === 'ACTIVE'
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : liveNavStatus === 'OFF_ROUTE_WARNING' || liveNavStatus === 'REROUTING'
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : liveNavStatus === 'ARRIVED'
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <Navigation
                className={`w-5 h-5 ${liveNavStatus === 'ACTIVE' ? 'animate-pulse' : ''}`}
              />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-white">
                  Real-Time Walking Navigation
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
                    liveNavStatus === 'ACTIVE'
                      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                      : liveNavStatus === 'PAUSED'
                      ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                      : liveNavStatus === 'OFF_ROUTE_WARNING' || liveNavStatus === 'REROUTING'
                      ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                      : liveNavStatus === 'ARRIVED'
                      ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  STATUS: {liveNavStatus}
                </span>
                {autoRerouteCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-500/40 text-purple-300 text-[10px] font-mono">
                    Auto-Reroutes: {autoRerouteCount}
                  </span>
                )}
              </div>

              {liveNavStatus !== 'IDLE' && liveNavTelemetry ? (
                <div className="mt-1.5 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
                    <CornerUpRight className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{liveNavTelemetry.nextInstruction}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-300">
                    <span>
                      Remaining: <strong className="text-white">{liveNavTelemetry.remainingDistanceMeters}m</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Next Turn: <strong className="text-emerald-300">{liveNavTelemetry.distanceToNextTurnMeters}m</strong>
                    </span>
                    <span>•</span>
                    <span>
                      ETA: <strong className="text-cyan-300">{liveNavTelemetry.estimatedArrivalTimeFormatted}</strong> ({Math.floor(liveNavTelemetry.remainingTimeSeconds / 60)}m {liveNavTelemetry.remainingTimeSeconds % 60}s)
                    </span>
                    <span>•</span>
                    <span>
                      Path Deviation: <strong className={liveNavTelemetry.isOffRoute ? 'text-rose-400' : 'text-emerald-400'}>{liveNavTelemetry.crossTrackDistanceMeters}m</strong> (Threshold: {liveNavTelemetry.offRouteThresholdMeters}m)
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 mt-1">
                  Press <strong className="text-emerald-300">START NAVIGATION</strong> to activate continuous browser GPS tracking (<code className="text-cyan-300">watchPosition</code>), live remaining route updates, next-turn distance, and automatic off-route recalculation.
                </p>
              )}
            </div>
          </div>

          {/* Navigation Session Controls: Start, Pause, Resume, Recenter, End */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {liveNavStatus === 'IDLE' || liveNavStatus === 'ARRIVED' ? (
              <button
                type="button"
                disabled={!activeRoute.found}
                onClick={onStartLiveWalkNavigation}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>START NAVIGATION</span>
              </button>
            ) : (
              <>
                {liveNavStatus === 'PAUSED' ? (
                  <button
                    type="button"
                    onClick={onResumeLiveWalkNavigation}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 font-semibold text-xs flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onPauseLiveWalkNavigation}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 font-semibold text-xs flex items-center gap-1.5"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setRecenterGpsTrigger((c) => c + 1)}
                  disabled={gpsState.lat === null}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-40 border border-cyan-500/50 text-cyan-300 font-semibold text-xs flex items-center gap-1.5"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Recenter GPS</span>
                </button>

                <button
                  type="button"
                  onClick={onEndLiveWalkNavigation}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300 font-semibold text-xs flex items-center gap-1.5"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>End Navigation</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Live Dynamic Traffic & Rerouting Alert Bar */}
      {(dynamicRerouteBanner || liveTrafficEvents.length > 0) && (
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 text-xs">
            <Radio className={`w-4 h-4 shrink-0 ${liveSimActive ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
            <span className="text-slate-300 truncate">
              {dynamicRerouteBanner ||
                (liveTrafficEvents[0]
                  ? `Campus Corridor Update: ${liveTrafficEvents[0].summary}`
                  : 'Monitoring VFSTR campus corridors.')}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-xs">
            <button
              type="button"
              onClick={onStepLiveSim}
              className="px-2.5 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 font-medium flex items-center gap-1"
            >
              <Zap className="w-3 h-3" />
              <span>Step Traffic</span>
            </button>
            <button
              type="button"
              onClick={onToggleLiveSim}
              className={`px-2.5 py-1 rounded font-medium border ${
                liveSimActive
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              {liveSimActive ? 'Traffic Sim: ON' : 'Traffic Sim: OFF'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Control & Turn-by-Turn Directions Panel (4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Route Configuration Card */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Compass className="w-4 h-4 text-cyan-400" />
                <span>VFSTR Campus Route Planner</span>
              </h2>
              <span className="text-[11px] font-mono text-cyan-400 uppercase">
                {activeRoute.algorithmName.split(' ')[0]}
              </span>
            </div>

            {/* Travel Mode Selector: WALKING (Primary), BICYCLE, VEHICLE */}
            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1.5">
                Campus Travel Mode (Access Restrictions Enforced)
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'WALKING', label: 'Walking', speed: `${walkingSpeedMps.toFixed(1)} m/s`, icon: Footprints },
                    { id: 'BICYCLE', label: 'Bicycle', speed: '4.2 m/s', icon: Bike },
                    { id: 'VEHICLE', label: 'Vehicle', speed: 'Road Limit', icon: Car },
                  ] as const
                ).map((mode) => {
                  const Icon = mode.icon;
                  const active = routingProfile === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onChangeRoutingProfile(mode.id)}
                      className={`py-2 px-2 rounded-md border text-xs font-medium flex flex-col items-center gap-1 transition-colors ${
                        active
                          ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{mode.label}</span>
                      <span className="text-[10px] font-mono text-slate-500">{mode.speed}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Configurable Walking Speed Slider */}
            {routingProfile === 'WALKING' && (
              <div className="p-2.5 rounded-md bg-slate-900/90 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 flex items-center gap-1.5 font-medium">
                    <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                    Walking Speed
                  </span>
                  <span className="font-mono text-cyan-300">
                    {walkingSpeedMps.toFixed(2)} m/s ({(walkingSpeedMps * 3.6).toFixed(1)} km/h)
                  </span>
                </div>
                <input
                  type="range"
                  min={0.8}
                  max={2.4}
                  step={0.1}
                  value={walkingSpeedMps}
                  onChange={(e) => onChangeWalkingSpeed(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                  <span>0.8 m/s (Slow)</span>
                  <span>1.4 m/s (Standard)</span>
                  <span>2.4 m/s (Brisk)</span>
                </div>
              </div>
            )}

            {/* Real Browser Geolocation Bar with Explicit Explanation & Segment Snapping */}
            <div className="p-3 rounded-md bg-slate-950/90 border border-slate-800/90 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono uppercase text-slate-300 flex items-center gap-1.5 font-semibold">
                  <LocateFixed className="w-3.5 h-3.5 text-cyan-400" />
                  Live Browser GPS Tracking
                </span>
                <div className="flex items-center gap-1.5">
                  {gpsState.lat !== null && (
                    <button
                      type="button"
                      onClick={() => setRecenterGpsTrigger((c) => c + 1)}
                      className="px-2 py-0.5 rounded bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[10px] font-mono"
                      title="Recenter Map on Your GPS Position"
                    >
                      Recenter
                    </button>
                  )}
                  {gpsState.isTracking ? (
                    <button
                      type="button"
                      onClick={onStopGpsTracking}
                      className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[11px] flex items-center gap-1"
                    >
                      <Square className="w-2.5 h-2.5" /> Stop GPS
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onStartGpsTracking}
                      className="px-2.5 py-1 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 text-[11px] font-medium"
                    >
                      Enable Live GPS
                    </button>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-snug">{gpsState.message}</p>

              {gpsState.status === 'IDLE' && (
                <p className="text-[10px] text-slate-500">
                  Why permission is requested: Used strictly in your browser to snap your real-time walking location onto VFSTR footpaths and compute turn-by-turn progress.
                </p>
              )}

              {gpsState.lat !== null && gpsState.lng !== null && (
                <div className="pt-1.5 border-t border-slate-800/80 space-y-1 text-[11px]">
                  <div className="flex items-center justify-between font-mono text-slate-300">
                    <span>
                      {gpsState.lat.toFixed(5)}°N, {gpsState.lng.toFixed(5)}°E
                    </span>
                    <span className={gpsState.isPoorAccuracy ? 'text-amber-400' : 'text-emerald-400'}>
                      ±{gpsState.accuracyMeters}m • {gpsState.lastUpdatedFormatted || 'Live'}
                    </span>
                  </div>
                  {gpsSnapResult && (
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span className="truncate">
                        Snapped: {gpsSnapResult.snappedRoadName} ({gpsSnapResult.distanceToSegmentMeters}m)
                      </span>
                      <button
                        type="button"
                        onClick={onUseGpsAsOrigin}
                        className="text-cyan-400 hover:text-cyan-300 font-semibold shrink-0 ml-2"
                      >
                        Use as Start →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Searchable Campus Destination Filter */}
            <div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search verified VFSTR buildings (Library, U Block, Hostel)..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              {searchQuery.trim().length > 0 && (
                <div className="mt-1.5 max-h-36 overflow-y-auto rounded border border-slate-800 bg-slate-950 divide-y divide-slate-800/70">
                  {filteredBuildings.length === 0 ? (
                    <div className="p-2.5 text-xs text-slate-500">
                      No verified campus building matches &quot;{searchQuery}&quot;.
                    </div>
                  ) : (
                    filteredBuildings.map((b) => (
                      <div
                        key={b.id}
                        className="px-2.5 py-1.5 flex items-center justify-between text-xs hover:bg-slate-900"
                      >
                        <span className="text-slate-200 truncate">{b.officialName}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectBuildingFromMap(b, 'ORIGIN');
                              setSearchQuery('');
                            }}
                            className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px]"
                          >
                            Start
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectBuildingFromMap(b, 'DESTINATION');
                              setSearchQuery('');
                            }}
                            className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 text-[10px]"
                          >
                            Destination
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Origin & Destination Selectors */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Starting Point (GPS / Campus Building / Intersection)
                </label>
                <select
                  value={sourceBuilding?.id || sourceNode?.id || ''}
                  onChange={(e) => {
                    const found = buildings.find((b) => b.id === e.target.value);
                    if (found) onSelectBuildingFromMap(found, 'ORIGIN');
                    else onChangeSource(e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.officialName} ({b.shortName})
                    </option>
                  ))}
                  {!sourceBuilding && sourceNode && (
                    <option value={sourceNode.id}>
                      Snapped Intersection: {sourceNode.name}
                    </option>
                  )}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <span>Map Click Sets:</span>
                  <button
                    type="button"
                    onClick={() =>
                      setClickTargetRole((r) => (r === 'ORIGIN' ? 'DESTINATION' : 'ORIGIN'))
                    }
                    className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono"
                  >
                    {clickTargetRole}
                  </button>
                </div>
                <button
                  onClick={onSwapNodes}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-colors"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Swap</span>
                </button>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Destination (Verified Campus Building / Intersection)
                </label>
                <select
                  value={targetBuilding?.id || targetNode?.id || ''}
                  onChange={(e) => {
                    const found = buildings.find((b) => b.id === e.target.value);
                    if (found) onSelectBuildingFromMap(found, 'DESTINATION');
                    else onChangeTarget(e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.officialName} ({b.shortName})
                    </option>
                  ))}
                  {!targetBuilding && targetNode && (
                    <option value={targetNode.id}>
                      Snapped Intersection: {targetNode.name}
                    </option>
                  )}
                </select>
              </div>
            </div>

            {/* Algorithm & Metric Selectors */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Routing Algorithm</label>
                <select
                  value={algorithm}
                  onChange={(e) => onChangeAlgorithm(e.target.value as RoutingAlgorithmType)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="DIJKSTRA">Dijkstra (Shortest Path)</option>
                  <option value="ASTAR">A* Geodesic (Optimized)</option>
                  <option value="BFS">BFS (Minimum Hops)</option>
                  <option value="DFS">DFS (Traversal)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Cost Metric</label>
                <select
                  value={metric}
                  onChange={(e) => onChangeMetric(e.target.value as OptimizationMetric)}
                  disabled={algorithm === 'BFS' || algorithm === 'DFS'}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                >
                  <option value="DISTANCE">Shortest Distance (m)</option>
                  <option value="TIME">Fastest Time (sec)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Route Telemetry, Alternative Routes & Turn-by-Turn Instructions */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Route Summary & Alternatives</h3>
              {activeRoute.found ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Connected {activeRoute.routingProfile} Path
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-rose-400 font-medium">
                  <AlertOctagon className="w-3.5 h-3.5" />
                  Disconnected / Closed Path
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Estimated Time</span>
                </div>
                <div className="mt-1 text-xl font-bold font-mono text-white tabular-nums">
                  {activeRoute.found
                    ? `${Math.floor(activeRoute.totalTimeSeconds / 60)}m ${
                        activeRoute.totalTimeSeconds % 60
                      }s`
                    : 'Unreachable'}
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  {activeRoute.totalTimeSeconds}s @ {walkingSpeedMps.toFixed(1)} m/s
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Route className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Route Distance</span>
                </div>
                <div className="mt-1 text-xl font-bold font-mono text-white tabular-nums">
                  {activeRoute.found ? `${activeRoute.totalDistanceMeters} m` : 'N/A'}
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  {activeRoute.segmentSteps.length} connected segments
                </div>
              </div>
            </div>

            {/* Alternative Routes List */}
            {alternativeRoutes.length > 1 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="text-[11px] font-mono uppercase text-slate-400">
                  Valid Alternative Campus Paths ({alternativeRoutes.length})
                </div>
                {alternativeRoutes.map((alt, idx) => (
                  <div
                    key={alt.rank}
                    onClick={() => setSelectedAltIdx(idx)}
                    className={`p-2 rounded border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      selectedAltIdx === idx
                        ? 'bg-cyan-950/30 border-cyan-500/50 text-white'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <span className="font-mono text-[10px] text-cyan-400 mr-1.5">
                        #{alt.rank}
                      </span>
                      <span className="font-medium">{alt.label}</span>
                    </div>
                    <div className="font-mono text-[11px] shrink-0 text-right">
                      <span className="text-emerald-400">{alt.result.totalDistanceMeters}m</span>
                      <span className="text-slate-500 mx-1">•</span>
                      <span className="text-cyan-300">{alt.result.totalTimeSeconds}s</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Turn-by-Turn Instructions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Turn-by-Turn Directions ({activeRoute.segmentSteps.length})
                </div>
                <button
                  type="button"
                  onClick={() => setFitRouteTrigger((c) => c + 1)}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <Maximize2 className="w-3 h-3" /> Fit Route
                </button>
              </div>

              {activeRoute.segmentSteps.length === 0 ? (
                <div className="p-4 rounded-lg bg-rose-950/25 border border-rose-500/40 text-xs text-rose-200">
                  {sourceId === targetId
                    ? 'Starting point and destination are set to the same campus location.'
                    : 'No connected walkable path exists between these locations (all connecting segments are closed or restricted).'}
                </div>
              ) : (
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                  {activeRoute.segmentSteps.map((seg, idx) => {
                    const isCurrentWalkStep =
                      liveNavStatus !== 'IDLE' && liveNavTelemetry?.currentStepIndex === idx;
                    const isSlow = seg.status !== 'OPEN' || seg.congestionFactor > 1.25;
                    return (
                      <div
                        key={`${seg.stepIndex}-${seg.edgeId}`}
                        className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2 ${
                          isCurrentWalkStep
                            ? 'bg-emerald-950/40 border-emerald-500/60'
                            : seg.status === 'ACCIDENT'
                            ? 'bg-rose-950/25 border-rose-500/40'
                            : isSlow
                            ? 'bg-amber-950/20 border-amber-500/35'
                            : 'bg-slate-900/80 border-slate-800/90'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-mono text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                            {seg.stepIndex}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium text-white">{seg.instruction}</div>
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">
                              {seg.fromNodeName} → {seg.toNodeName}
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono text-[11px] shrink-0 tabular-nums">
                          <div className="text-cyan-300 font-semibold">{seg.timeSeconds}s</div>
                          <div className="text-slate-500">{seg.distanceMeters}m</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Interactive Google Map & Live Corridor Matrix (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-5">
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden flex flex-col h-[540px]">
            <div className="p-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Navigation className="w-4 h-4 text-cyan-400" />
                <span>
                  Click any VFSTR building marker or intersection to set{' '}
                  <strong className="text-cyan-300">{clickTargetRole}</strong>
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono">
                <span className="text-slate-400">
                  {sourceBuilding?.shortName || sourceNode?.name} →{' '}
                  {targetBuilding?.shortName || targetNode?.name}
                </span>
                {impactedSegmentsOnRoute.length > 0 && (
                  <span className="text-amber-400 text-[11px]">
                    {impactedSegmentsOnRoute.length} segment alert(s)
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1">
              <CampusMapCanvas
                graph={graph}
                buildings={buildings}
                osmBuildings={osmBuildings}
                incidents={incidents}
                gpsState={gpsState}
                selectedSourceId={sourceId}
                selectedTargetId={targetId}
                highlightedNodePath={activeRoute.nodePath}
                highlightedEdgePath={activeRoute.edgePath}
                routeGeometry={activeRoute.routeGeometry}
                remainingRouteGeometry={
                  liveNavStatus !== 'IDLE' && liveNavTelemetry
                    ? liveNavTelemetry.remainingGeometry
                    : []
                }
                secondaryEdgePath={secondaryAltRoute ? secondaryAltRoute.result.edgePath : []}
                visitedNodes={activeRoute.visitedOrder}
                emergencyMode={emergencyMode}
                fitRouteTrigger={fitRouteTrigger}
                recenterGpsTrigger={recenterGpsTrigger}
                onSelectBuilding={(b) => onSelectBuildingFromMap(b, clickTargetRole)}
                onSelectNode={(nodeId) => onSelectNodeFromMap(nodeId, clickTargetRole)}
                onSnapBuildingToPlace={onSnapBuildingToPlace}
              />
            </div>
          </div>

          {/* Live Corridor Traffic Status Matrix */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Campus Walkable & Road Corridor Conditions</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                Connected Graph Segments
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {corridorLinks.slice(0, 9).map((cor) => {
                const isOnActiveRoute = activeRoute.edgePath.includes(cor.edgeId);
                return (
                  <div
                    key={cor.id}
                    className={`p-2.5 rounded border text-xs flex flex-col justify-between ${
                      isOnActiveRoute
                        ? 'bg-cyan-950/25 border-cyan-500/40'
                        : cor.status === 'ACCIDENT' || cor.status === 'CLOSED'
                        ? 'bg-rose-950/20 border-rose-500/35'
                        : cor.status === 'CONGESTED'
                        ? 'bg-amber-950/15 border-amber-500/30'
                        : 'bg-slate-900/70 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-white truncate">
                        {cor.fromLocation} ↔ {cor.toLocation}
                      </span>
                      {isOnActiveRoute && (
                        <span className="text-[9px] font-mono text-cyan-300 uppercase">
                          ON ROUTE
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between font-mono text-[11px]">
                      <span className="text-slate-400">{cor.distanceMeters}m</span>
                      <span
                        className={
                          cor.status === 'ACCIDENT' || cor.status === 'CLOSED'
                            ? 'text-rose-400 font-bold'
                            : cor.status === 'CONGESTED' || cor.congestionFactor > 1.25
                            ? 'text-amber-400 font-semibold'
                            : 'text-emerald-400'
                        }
                      >
                        {cor.congestionFactor.toFixed(1)}x • {cor.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Route Calculations Log */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Recent Campus Route Queries
            </h3>
            {routeHistory.length === 0 ? (
              <p className="text-xs text-slate-500">
                Select different campus origins or destinations to log route computations.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 px-3">Corridor</th>
                      <th className="py-2 px-3">Mode</th>
                      <th className="py-2 px-3">Algorithm</th>
                      <th className="py-2 px-3 text-right">Distance</th>
                      <th className="py-2 pl-3 text-right">ETA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {routeHistory.slice(0, 5).map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-900/50">
                        <td className="py-2 pr-3 font-mono text-slate-400">{entry.timestamp}</td>
                        <td className="py-2 px-3 text-white font-medium">
                          {entry.sourceName} → {entry.targetName}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-300">{entry.routingProfile}</td>
                        <td className="py-2 px-3 font-mono text-cyan-400">{entry.algorithm}</td>
                        <td className="py-2 px-3 font-mono text-right tabular-nums text-slate-300">
                          {entry.distanceMeters} m
                        </td>
                        <td className="py-2 pl-3 font-mono text-right tabular-nums text-emerald-400">
                          {entry.timeSeconds}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
