import React, { useState, useMemo } from 'react';
import {
  CampusGraph,
  OptimizationMetric,
  EmergencyVehicleType,
  RoutingProfile,
} from '../graph/Graph';
import { CampusBuildingEntry, IncidentRecord } from '../data/campusData';
import { ExtractedOSMBuilding } from '../graph/osmGraphExtractor';
import {
  CampusMapCanvas,
  CustomMapEndpoint,
  LiveMovingNavMarkerProps,
} from '../components/CampusMapCanvas';
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
import {
  GoogleComputedRouteResult,
  GooglePlaceDiscoveryResult,
} from '../services/googleMapsRealtimeService';
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
  Volume2,
  VolumeX,
  RotateCcw,
  Eye,
  MapPin,
} from 'lucide-react';

export type MapClickRole = 'DESTINATION' | 'ORIGIN' | 'LIVE_POSITION';

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
  customOriginPoint: CustomMapEndpoint | null;
  customDestinationPoint: CustomMapEndpoint | null;
  onSetCustomEndpoint: (
    point: CustomMapEndpoint | null,
    role: 'ORIGIN' | 'DESTINATION' | 'LIVE_POSITION'
  ) => void;
  algorithm: RoutingAlgorithmType;
  metric: OptimizationMetric;
  routingProfile: RoutingProfile;
  walkingSpeedMps: number;
  onChangeWalkingSpeed: (speedMps: number) => void;
  emergencyMode: boolean;
  emergencyVehicle: EmergencyVehicleType;
  activeRoute: AlgorithmExecutionResult;
  liveGoogleRoutes: GoogleComputedRouteResult[];
  useGoogleLiveRoutePrimary: boolean;
  onToggleGoogleLiveRoutePrimary: (useGoogle: boolean) => void;
  selectedGoogleRouteIdx: number;
  onSelectGoogleRouteIdx: (idx: number) => void;
  routeHistory: RouteHistoryEntry[];
  liveNavStatus: LiveWalkNavigationStatus;
  liveNavTelemetry: LiveWalkNavigationTelemetry | null;
  liveNavMarker: LiveMovingNavMarkerProps | null;
  navSpeedMultiplier: number;
  onChangeNavSpeedMultiplier: (mult: number) => void;
  followCamera: boolean;
  onToggleFollowCamera: () => void;
  voiceEnabled: boolean;
  onToggleVoiceEnabled: () => void;
  onScrubNavigationProgress: (percent: number) => void;
  autoRerouteCount: number;
  onStartLiveWalkNavigation: () => void;
  onPauseLiveWalkNavigation: () => void;
  onResumeLiveWalkNavigation: () => void;
  onRestartLiveWalkNavigation: () => void;
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
  customOriginPoint,
  customDestinationPoint,
  onSetCustomEndpoint,
  algorithm,
  metric,
  routingProfile,
  walkingSpeedMps,
  onChangeWalkingSpeed,
  emergencyMode,
  emergencyVehicle,
  activeRoute,
  liveGoogleRoutes,
  useGoogleLiveRoutePrimary,
  onToggleGoogleLiveRoutePrimary,
  selectedGoogleRouteIdx,
  onSelectGoogleRouteIdx,
  routeHistory,
  liveNavStatus,
  liveNavTelemetry,
  liveNavMarker,
  navSpeedMultiplier,
  onChangeNavSpeedMultiplier,
  followCamera,
  onToggleFollowCamera,
  voiceEnabled,
  onToggleVoiceEnabled,
  onScrubNavigationProgress,
  autoRerouteCount,
  onStartLiveWalkNavigation,
  onPauseLiveWalkNavigation,
  onResumeLiveWalkNavigation,
  onRestartLiveWalkNavigation,
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
  onSnapBuildingToPlace,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [clickTargetRole, setClickTargetRole] = useState<MapClickRole>('DESTINATION');
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

  const originDisplayName =
    customOriginPoint?.label || sourceBuilding?.shortName || sourceNode?.name || 'Origin';
  const destinationDisplayName =
    customDestinationPoint?.label || targetBuilding?.shortName || targetNode?.name || 'Destination';

  // Compute K-Shortest Valid Alternative Routes on Campus Graph
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
  const secondaryGoogleRoute =
    liveGoogleRoutes.length > 1
      ? liveGoogleRoutes[selectedGoogleRouteIdx === 0 ? 1 : 0]
      : null;

  const handleMapCoordinateClick = (lat: number, lng: number) => {
    const coordLabel = `Map Point (${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E)`;
    onSetCustomEndpoint({ lat, lng, label: coordLabel }, clickTargetRole);
  };

  return (
    <div className="space-y-5">
      {/* Live Turn-by-Turn Google Maps Navigation Command HUD */}
      <div className="bg-[#111827] border border-cyan-500/40 rounded-lg p-4 shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 border ${
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

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-white">
                  Google Maps Real-Time Turn-by-Turn Navigation
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
                  {liveNavStatus === 'ACTIVE' ? 'LIVE MOVING' : liveNavStatus}
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-950/80 border border-blue-500/40 text-blue-300 text-[10px] font-mono">
                  {originDisplayName} → {destinationDisplayName}
                </span>
                {autoRerouteCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-500/40 text-purple-300 text-[10px] font-mono">
                    Live Reroutes: {autoRerouteCount}
                  </span>
                )}
              </div>

              {liveNavStatus !== 'IDLE' && liveNavTelemetry ? (
                <div className="mt-1.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
                    <CornerUpRight className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{liveNavTelemetry.nextInstruction}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-300">
                    <span>
                      Progress: <strong className="text-emerald-300">{liveNavTelemetry.progressPercent}%</strong> ({liveNavTelemetry.traveledDistanceMeters}m / {liveNavTelemetry.totalDistanceMeters}m)
                    </span>
                    <span>•</span>
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
                      Heading: <strong className="text-sky-300">{Math.round(liveNavTelemetry.headingDegrees)}°</strong>
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 mt-1">
                  Press <strong className="text-emerald-300">START LIVE NAVIGATION</strong> to launch real-time turn-by-turn motion along the Google Maps route with rotating directional arrow, live camera follow, voice announcements, and instant off-route recalculation.
                </p>
              )}
            </div>
          </div>

          {/* Navigation Session Controls: Start, Pause, Resume, Speed, Camera Follow, Voice, End */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {liveNavStatus === 'IDLE' ? (
              <button
                type="button"
                disabled={!activeRoute.found}
                onClick={onStartLiveWalkNavigation}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-emerald-950/50"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>START LIVE NAVIGATION</span>
              </button>
            ) : (
              <>
                {liveNavStatus === 'PAUSED' || liveNavStatus === 'ARRIVED' ? (
                  <button
                    type="button"
                    onClick={
                      liveNavStatus === 'ARRIVED'
                        ? onRestartLiveWalkNavigation
                        : onResumeLiveWalkNavigation
                    }
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{liveNavStatus === 'ARRIVED' ? 'Replay Route' : 'Resume'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onPauseLiveWalkNavigation}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onRestartLiveWalkNavigation}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1 cursor-pointer"
                  title="Restart from Origin"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restart</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleFollowCamera}
                  className={`px-2.5 py-1.5 rounded-lg border font-semibold text-xs flex items-center gap-1 cursor-pointer ${
                    followCamera
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                  title="Automatically pan Google Map camera to follow live navigation marker"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{followCamera ? 'Follow: ON' : 'Follow: OFF'}</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleVoiceEnabled}
                  className={`px-2.5 py-1.5 rounded-lg border font-semibold text-xs flex items-center gap-1 cursor-pointer ${
                    voiceEnabled
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                  title="Toggle spoken turn-by-turn voice instructions"
                >
                  {voiceEnabled ? (
                    <Volume2 className="w-3.5 h-3.5" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                  <span>{voiceEnabled ? 'Voice: ON' : 'Muted'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRecenterGpsTrigger((c) => c + 1)}
                  className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 font-semibold text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Center</span>
                </button>

                <button
                  type="button"
                  onClick={onEndLiveWalkNavigation}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Exit</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Interactive Live Route Progress Scrubber & Speed Multiplier Bar */}
        {liveNavStatus !== 'IDLE' && liveNavTelemetry && (
          <div className="pt-2.5 border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-[240px]">
              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                LIVE SCRUBBER:
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={liveNavTelemetry.progressPercent}
                onChange={(e) => onScrubNavigationProgress(Number(e.target.value))}
                className="w-full accent-emerald-400 cursor-pointer"
                title="Drag to move your live position along the Google Maps route"
              />
              <span className="text-xs font-mono font-bold text-emerald-300 w-10 text-right">
                {liveNavTelemetry.progressPercent}%
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[11px] font-mono text-slate-400 mr-1">MOTION SPEED:</span>
              {[1, 2, 5, 10].map((mult) => (
                <button
                  key={mult}
                  type="button"
                  onClick={() => onChangeNavSpeedMultiplier(mult)}
                  className={`px-2 py-0.5 rounded font-mono text-[11px] border cursor-pointer ${
                    navSpeedMultiplier === mult
                      ? 'bg-emerald-500/25 border-emerald-500/60 text-emerald-200 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mult}x
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Live Dynamic Traffic & Rerouting Alert Bar */}
      {(dynamicRerouteBanner || liveTrafficEvents.length > 0) && (
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 text-xs">
            <Radio
              className={`w-4 h-4 shrink-0 ${
                liveSimActive ? 'text-emerald-400 animate-pulse' : 'text-cyan-400'
              }`}
            />
            <span className="text-slate-200 truncate">
              {dynamicRerouteBanner ||
                (liveTrafficEvents[0]
                  ? `Campus Corridor Update: ${liveTrafficEvents[0].summary}`
                  : 'Monitoring live Google Maps route & VFSTR corridors.')}
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
                <span>Google Maps Route Planner</span>
              </h2>
              <button
                type="button"
                onClick={() => onToggleGoogleLiveRoutePrimary(!useGoogleLiveRoutePrimary)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer ${
                  useGoogleLiveRoutePrimary
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                    : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                }`}
                title="Switch between Live Google Maps Routes API v2 and Campus Footpath Graph DSA"
              >
                {useGoogleLiveRoutePrimary ? 'ENGINE: GOOGLE MAPS LIVE' : `ENGINE: ${algorithm}`}
              </button>
            </div>

            {/* Travel Mode Selector: WALKING (Primary), BICYCLE, VEHICLE */}
            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1.5">
                Travel Mode (Google Routes API + Campus Access)
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    {
                      id: 'WALKING',
                      label: 'Walking',
                      speed: `${walkingSpeedMps.toFixed(1)} m/s`,
                      icon: Footprints,
                    },
                    { id: 'BICYCLE', label: 'Bicycle', speed: '4.2 m/s', icon: Bike },
                    { id: 'VEHICLE', label: 'Driving', speed: 'Live Traffic', icon: Car },
                  ] as const
                ).map((mode) => {
                  const Icon = mode.icon;
                  const active = routingProfile === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onChangeRoutingProfile(mode.id)}
                      className={`py-2 px-2 rounded-md border text-xs font-medium flex flex-col items-center gap-1 transition-colors cursor-pointer ${
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
              </div>
            )}

            {/* Real Browser Geolocation Bar with Direct Google Maps GPS Routing */}
            <div className="p-3 rounded-md bg-slate-950/90 border border-slate-800/90 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono uppercase text-slate-300 flex items-center gap-1.5 font-semibold">
                  <LocateFixed className="w-3.5 h-3.5 text-cyan-400" />
                  Physical Device GPS
                </span>
                <div className="flex items-center gap-1.5">
                  {gpsState.lat !== null && (
                    <button
                      type="button"
                      onClick={() => setRecenterGpsTrigger((c) => c + 1)}
                      className="px-2 py-0.5 rounded bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[10px] font-mono"
                    >
                      Center GPS
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
                      className="px-2.5 py-1 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 text-[11px] font-medium cursor-pointer"
                    >
                      Enable Device GPS
                    </button>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-snug">{gpsState.message}</p>

              {gpsState.lat !== null && gpsState.lng !== null && (
                <div className="pt-1.5 border-t border-slate-800/80 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between font-mono text-slate-300">
                    <span>
                      {gpsState.lat.toFixed(5)}°N, {gpsState.lng.toFixed(5)}°E
                    </span>
                    <span className={gpsState.isPoorAccuracy ? 'text-amber-400' : 'text-emerald-400'}>
                      ±{gpsState.accuracyMeters}m • {gpsState.lastUpdatedFormatted || 'Live'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-slate-400 truncate">
                      {gpsSnapResult
                        ? `Snapped: ${gpsSnapResult.snappedRoadName}`
                        : 'External GPS Coordinate Ready'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSetCustomEndpoint(
                          {
                            lat: gpsState.lat!,
                            lng: gpsState.lng!,
                            label: 'My Live GPS Location',
                          },
                          'ORIGIN'
                        );
                        onUseGpsAsOrigin();
                      }}
                      className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 text-[10px] font-semibold shrink-0 cursor-pointer"
                    >
                      Route From My GPS →
                    </button>
                  </div>
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
                  placeholder="Filter VFSTR blocks (Library, U Block, Hostel)..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              {searchQuery.trim().length > 0 && (
                <div className="mt-1.5 max-h-36 overflow-y-auto rounded border border-slate-800 bg-slate-950 divide-y divide-slate-800/70">
                  {filteredBuildings.length === 0 ? (
                    <div className="p-2.5 text-xs text-slate-500">
                      No campus building matches &quot;{searchQuery}&quot;. Use the top Google Maps search bar to find any place!
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
                              onSetCustomEndpoint(null, 'ORIGIN');
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
                              onSetCustomEndpoint(null, 'DESTINATION');
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
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-400">
                    Starting Point (Origin)
                  </label>
                  {customOriginPoint && (
                    <button
                      type="button"
                      onClick={() => onSetCustomEndpoint(null, 'ORIGIN')}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      Reset to Campus Block
                    </button>
                  )}
                </div>
                {customOriginPoint ? (
                  <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-500/50 rounded-lg px-3 py-2 text-xs text-emerald-200">
                    <span className="truncate font-semibold flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      {customOriginPoint.label}
                    </span>
                    <span className="font-mono text-[10px] text-emerald-400 ml-2 shrink-0">
                      {customOriginPoint.lat.toFixed(4)}, {customOriginPoint.lng.toFixed(4)}
                    </span>
                  </div>
                ) : (
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
                        Intersection: {sourceNode.name}
                      </option>
                    )}
                  </select>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <span>Map Click Mode:</span>
                  <select
                    value={clickTargetRole}
                    onChange={(e) => setClickTargetRole(e.target.value as MapClickRole)}
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-cyan-300 font-mono text-[11px]"
                  >
                    <option value="DESTINATION">Set Destination</option>
                    <option value="ORIGIN">Set Origin</option>
                    <option value="LIVE_POSITION">Move My Live Position (Reroute)</option>
                  </select>
                </div>
                <button
                  onClick={onSwapNodes}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-colors cursor-pointer"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Swap</span>
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-400">
                    Destination
                  </label>
                  {customDestinationPoint && (
                    <button
                      type="button"
                      onClick={() => onSetCustomEndpoint(null, 'DESTINATION')}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      Reset to Campus Block
                    </button>
                  )}
                </div>
                {customDestinationPoint ? (
                  <div className="flex items-center justify-between bg-rose-950/40 border border-rose-500/50 rounded-lg px-3 py-2 text-xs text-rose-200">
                    <span className="truncate font-semibold flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      {customDestinationPoint.label}
                    </span>
                    <span className="font-mono text-[10px] text-rose-400 ml-2 shrink-0">
                      {customDestinationPoint.lat.toFixed(4)}, {customDestinationPoint.lng.toFixed(4)}
                    </span>
                  </div>
                ) : (
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
                        Intersection: {targetNode.name}
                      </option>
                    )}
                  </select>
                )}
              </div>
            </div>

            {/* Algorithm & Metric Selectors */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Routing Engine</label>
                <select
                  value={useGoogleLiveRoutePrimary ? 'GOOGLE_LIVE' : algorithm}
                  onChange={(e) => {
                    if (e.target.value === 'GOOGLE_LIVE') {
                      onToggleGoogleLiveRoutePrimary(true);
                    } else {
                      onToggleGoogleLiveRoutePrimary(false);
                      onChangeAlgorithm(e.target.value as RoutingAlgorithmType);
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="GOOGLE_LIVE">Google Maps Live (Routes API v2)</option>
                  <option value="DIJKSTRA">Campus Graph: Dijkstra</option>
                  <option value="ASTAR">Campus Graph: A* Search</option>
                  <option value="BFS">Campus Graph: BFS</option>
                  <option value="DFS">Campus Graph: DFS</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Optimization</label>
                <select
                  value={metric}
                  onChange={(e) => onChangeMetric(e.target.value as OptimizationMetric)}
                  disabled={algorithm === 'BFS' || algorithm === 'DFS'}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                >
                  <option value="TIME">Fastest Time (sec)</option>
                  <option value="DISTANCE">Shortest Distance (m)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Route Telemetry, Live Google Alternatives & Turn-by-Turn Instructions */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Live Route Summary</h3>
              {activeRoute.found ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {activeRoute.algorithmName.includes('Google')
                    ? 'Google Maps Verified Path'
                    : `Connected ${activeRoute.routingProfile} Path`}
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
                  {activeRoute.totalTimeSeconds}s total duration
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
                  {activeRoute.segmentSteps.length} turn-by-turn steps
                </div>
              </div>
            </div>

            {/* Live Google Maps Routes API Alternatives Selector */}
            {liveGoogleRoutes.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="text-[11px] font-mono uppercase text-blue-400 flex items-center justify-between">
                  <span>Live Google Maps Routes ({liveGoogleRoutes.length})</span>
                  <span className="text-[10px] text-slate-500">Routes API v2</span>
                </div>
                {liveGoogleRoutes.map((gRoute, idx) => {
                  const isSelected = useGoogleLiveRoutePrimary && selectedGoogleRouteIdx === idx;
                  return (
                    <div
                      key={gRoute.id}
                      onClick={() => {
                        onToggleGoogleLiveRoutePrimary(true);
                        onSelectGoogleRouteIdx(idx);
                      }}
                      className={`p-2 rounded border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-950/40 border-blue-500/60 text-white'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <span className="font-mono text-[10px] text-blue-400 mr-1.5">
                          G{idx + 1}
                        </span>
                        <span className="font-medium">{gRoute.label}</span>
                      </div>
                      <div className="font-mono text-[11px] shrink-0 text-right">
                        <span className="text-emerald-400">{gRoute.distanceMeters}m</span>
                        <span className="text-slate-500 mx-1">•</span>
                        <span className="text-cyan-300">{gRoute.durationSeconds}s</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Campus Walkable Graph Alternatives */}
            {!customOriginPoint && !customDestinationPoint && alternativeRoutes.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="text-[11px] font-mono uppercase text-slate-400">
                  VFSTR Internal Campus Paths ({alternativeRoutes.length})
                </div>
                {alternativeRoutes.map((alt, idx) => {
                  const isSelected = !useGoogleLiveRoutePrimary && selectedAltIdx === idx;
                  return (
                    <div
                      key={alt.rank}
                      onClick={() => {
                        onToggleGoogleLiveRoutePrimary(false);
                        setSelectedAltIdx(idx);
                      }}
                      className={`p-2 rounded border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
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
                  );
                })}
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
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                >
                  <Maximize2 className="w-3 h-3" /> Fit Route
                </button>
              </div>

              {activeRoute.segmentSteps.length === 0 ? (
                <div className="p-4 rounded-lg bg-rose-950/25 border border-rose-500/40 text-xs text-rose-200">
                  {sourceId === targetId && !customOriginPoint && !customDestinationPoint
                    ? 'Starting point and destination are set to the same campus location.'
                    : 'No connected path exists between these locations (all connecting segments are closed or restricted).'}
                </div>
              ) : (
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                  {activeRoute.segmentSteps.map((seg, idx) => {
                    const isCurrentWalkStep =
                      liveNavStatus !== 'IDLE' && liveNavTelemetry?.currentStepIndex === idx;
                    const isCompletedStep =
                      liveNavStatus !== 'IDLE' &&
                      liveNavTelemetry &&
                      idx < liveNavTelemetry.currentStepIndex;
                    const isSlow = seg.status !== 'OPEN' || seg.congestionFactor > 1.25;
                    return (
                      <div
                        key={`${seg.stepIndex}-${seg.edgeId}`}
                        className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2 transition-colors ${
                          isCurrentWalkStep
                            ? 'bg-emerald-950/50 border-emerald-500/70 shadow-md'
                            : isCompletedStep
                            ? 'bg-slate-950/50 border-slate-800/50 opacity-55'
                            : seg.status === 'ACCIDENT'
                            ? 'bg-rose-950/25 border-rose-500/40'
                            : isSlow
                            ? 'bg-amber-950/20 border-amber-500/35'
                            : 'bg-slate-900/80 border-slate-800/90'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span
                            className={`w-5 h-5 rounded-full font-mono text-[11px] flex items-center justify-center shrink-0 mt-0.5 border ${
                              isCurrentWalkStep
                                ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-bold'
                                : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                            }`}
                          >
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
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden flex flex-col h-[580px]">
            <div className="p-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Navigation className="w-4 h-4 text-cyan-400" />
                <span>
                  Click anywhere on Google Maps to{' '}
                  <strong className="text-cyan-300">
                    {clickTargetRole === 'LIVE_POSITION'
                      ? 'MOVE YOUR LIVE POSITION & REROUTE'
                      : `SET ${clickTargetRole}`}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono">
                <span className="text-slate-300 font-semibold">
                  {originDisplayName} → {destinationDisplayName}
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
                customOriginPoint={customOriginPoint}
                customDestinationPoint={customDestinationPoint}
                highlightedNodePath={activeRoute.nodePath}
                highlightedEdgePath={activeRoute.edgePath}
                routeGeometry={activeRoute.routeGeometry}
                traveledRouteGeometry={
                  liveNavStatus !== 'IDLE' && liveNavTelemetry
                    ? liveNavTelemetry.traveledGeometry
                    : []
                }
                remainingRouteGeometry={
                  liveNavStatus !== 'IDLE' && liveNavTelemetry
                    ? liveNavTelemetry.remainingGeometry
                    : []
                }
                liveNavMarker={liveNavMarker}
                followCamera={liveNavStatus === 'ACTIVE' && followCamera}
                secondaryEdgePath={secondaryAltRoute ? secondaryAltRoute.result.edgePath : []}
                secondaryRouteGeometry={
                  useGoogleLiveRoutePrimary && secondaryGoogleRoute
                    ? secondaryGoogleRoute.path
                    : secondaryAltRoute
                    ? secondaryAltRoute.result.routeGeometry
                    : []
                }
                visitedNodes={[]}
                defaultShowRoadNetworkLayer={false}
                emergencyMode={emergencyMode}
                fitRouteTrigger={fitRouteTrigger}
                recenterGpsTrigger={recenterGpsTrigger}
                onSelectBuilding={(b, explicitRole) => {
                  const role =
                    explicitRole ||
                    (clickTargetRole === 'ORIGIN' ? 'ORIGIN' : 'DESTINATION');
                  onSetCustomEndpoint(null, role);
                  onSelectBuildingFromMap(b, role);
                }}
                onMapCoordinateClick={handleMapCoordinateClick}
                onSetCustomEndpoint={onSetCustomEndpoint}
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
              Recent Campus & Google Maps Route Queries
            </h3>
            {routeHistory.length === 0 ? (
              <p className="text-xs text-slate-500">
                Select different origins or destinations to log route computations.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 px-3">Route</th>
                      <th className="py-2 px-3">Mode</th>
                      <th className="py-2 px-3">Engine</th>
                      <th className="py-2 px-3 text-right">Distance</th>
                      <th className="py-2 pl-3 text-right">ETA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {routeHistory.slice(0, 6).map((h) => (
                      <tr key={h.id} className="hover:bg-slate-900/40">
                        <td className="py-2 pr-3 font-mono text-slate-400">{h.timestamp}</td>
                        <td className="py-2 px-3 text-white font-medium">
                          {h.sourceName} → {h.targetName}
                        </td>
                        <td className="py-2 px-3 font-mono text-cyan-300">{h.routingProfile}</td>
                        <td className="py-2 px-3 font-mono text-slate-300">{h.algorithm}</td>
                        <td className="py-2 px-3 font-mono text-emerald-400 text-right">
                          {h.distanceMeters}m
                        </td>
                        <td className="py-2 pl-3 font-mono text-white text-right">
                          {h.timeSeconds}s
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
