import React from 'react';
import { CampusGraph } from '../graph/Graph';
import { CampusBuildingEntry, IncidentRecord } from '../data/campusData';
import { ExtractedOSMBuilding } from '../graph/osmGraphExtractor';
import { CampusMapCanvas } from '../components/CampusMapCanvas';
import { NavigationTabId } from '../components/Sidebar';
import { AlgorithmExecutionResult } from '../algorithms/dijkstra';
import { AnalyticsService } from '../services/analyticsService';
import { OverpassFetchMeta } from '../services/osmOverpassService';
import { GpsPositionState } from '../services/gpsService';
import {
  TrafficEngine,
  LiveTrafficTickEvent,
  SimulationIntensity,
} from '../services/trafficEngine';
import { GooglePlaceDiscoveryResult } from '../services/googleMapsRealtimeService';
import {
  Navigation,
  AlertTriangle,
  Activity,
  Cpu,
  ArrowUpRight,
  ShieldCheck,
  MapPin,
  FileText,
  Radio,
  Play,
  Pause,
  Zap,
  GitCompare,
} from 'lucide-react';

interface OverviewViewProps {
  graph: CampusGraph;
  buildings: CampusBuildingEntry[];
  osmBuildings: ExtractedOSMBuilding[];
  incidents: IncidentRecord[];
  gpsState: GpsPositionState;
  osmMeta: OverpassFetchMeta;
  activeRoute: AlgorithmExecutionResult;
  sourceBuilding: CampusBuildingEntry;
  targetBuilding: CampusBuildingEntry;
  emergencyMode: boolean;
  liveSimActive: boolean;
  liveSimIntensity: SimulationIntensity;
  liveTrafficEvents: LiveTrafficTickEvent[];
  onToggleLiveSim: () => void;
  onStepLiveSim: () => void;
  onChangeSimIntensity: (intensity: SimulationIntensity) => void;
  onSelectBuildingForRoute: (building: CampusBuildingEntry) => void;
  onSnapBuildingToPlace?: (buildingId: string, place: GooglePlaceDiscoveryResult) => void;
  onNavigateTab: (tab: NavigationTabId) => void;
  onTriggerScenario: (
    scenario: 'CLEAR' | 'PEAK_CONVOCATION' | 'SPINE_CLOSURE' | 'HOSTEL_MEDICAL_ALERT'
  ) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  graph,
  buildings,
  osmBuildings,
  incidents,
  gpsState,
  osmMeta,
  activeRoute,
  sourceBuilding,
  targetBuilding,
  emergencyMode,
  liveSimActive,
  liveSimIntensity,
  liveTrafficEvents,
  onToggleLiveSim,
  onStepLiveSim,
  onChangeSimIntensity,
  onSelectBuildingForRoute,
  onSnapBuildingToPlace,
  onNavigateTab,
  onTriggerScenario,
}) => {
  const summary = AnalyticsService.getNetworkSummary(graph, buildings, incidents);
  const corridorLinks = TrafficEngine.getCampusCorridorLinks(graph);
  const activeIncidents = incidents.filter(
    (i) => i.verificationStatus !== 'RESOLVED' && i.verificationStatus !== 'REJECTED'
  );

  return (
    <div className="space-y-6">
      {/* Top 4 Command KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="uppercase tracking-wider font-semibold">Live Traffic Health</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white tabular-nums">
              {summary.networkHealthScore}%
            </span>
            <span className="text-xs font-mono text-amber-400 tabular-nums">
              Avg {summary.averageCongestionMultiplier}x Flow
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {summary.openSegmentsCount} clear • {summary.congestedSegmentsCount} slow/incident •{' '}
            {summary.closedSegmentsCount} closed
          </p>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="uppercase tracking-wider font-semibold">Active Campus Route</span>
            <Navigation className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white tabular-nums">
              {activeRoute.found ? `${activeRoute.totalTimeSeconds}s` : 'Blocked'}
            </span>
            <span className="text-xs font-mono text-cyan-400 tabular-nums">
              {activeRoute.totalDistanceMeters} m (Google Live)
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400 truncate">
            {sourceBuilding.shortName} → {targetBuilding.shortName} ({activeRoute.routingProfile})
          </p>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="uppercase tracking-wider font-semibold">VFSTR Google Places Sync</span>
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white tabular-nums">
              {buildings.length} Blocks
            </span>
            <span className="text-xs font-mono text-emerald-400 tabular-nums">
              {summary.totalNetworkLengthKm} km • {summary.totalUniqueSegments} edges
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400 truncate">
            Google Places + Routes API ({osmMeta.wayCount} ways)
          </p>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="uppercase tracking-wider font-semibold">Active Traffic Events</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white tabular-nums">
              {activeIncidents.length} Alerts
            </span>
            <span className="text-xs font-mono text-cyan-400 tabular-nums">
              {liveTrafficEvents.length} Live Ticks
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Stream: {liveSimActive ? `Running (${liveSimIntensity})` : 'Paused'}
          </p>
        </div>
      </div>

      {/* Main Split: Real VFSTR Google Map (Left 8 cols) + Live Traffic Overview & Event Stream (Right 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 flex flex-col bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>Google Maps Live VFSTR Campus & Real-Time Traffic Layer (16.2330°N, 80.5509°E)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Live Google Maps Hybrid satellite + road imagery, Google TrafficLayer, Places API block pins, and Routes API polylines
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigateTab('comparison')}
                className="px-2.5 py-1.5 rounded text-xs font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition-colors flex items-center gap-1"
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>Compare Routes</span>
              </button>
              <button
                onClick={() => onNavigateTab('navigation')}
                className="px-2.5 py-1.5 rounded text-xs font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition-colors flex items-center gap-1"
              >
                <span>Live Navigation</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onNavigateTab('visualizer')}
                className="px-2.5 py-1.5 rounded text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-1"
              >
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>DSA Lab</span>
              </button>
            </div>
          </div>

          <div className="h-[460px] w-full">
            <CampusMapCanvas
              graph={graph}
              buildings={buildings}
              osmBuildings={osmBuildings}
              incidents={incidents}
              gpsState={gpsState}
              selectedSourceId={sourceBuilding.nearestNodeId}
              selectedTargetId={targetBuilding.nearestNodeId}
              highlightedNodePath={activeRoute.nodePath}
              highlightedEdgePath={activeRoute.edgePath}
              routeGeometry={activeRoute.routeGeometry}
              visitedNodes={activeRoute.visitedOrder}
              emergencyMode={emergencyMode}
              onSelectBuilding={onSelectBuildingForRoute}
              onSnapBuildingToPlace={onSnapBuildingToPlace}
            />
          </div>

          {/* Bottom Simulation & Real-Time Generator Strip */}
          <div className="p-3 bg-slate-950/90 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Radio
                className={`w-4 h-4 ${
                  liveSimActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'
                }`}
              />
              <span className="text-slate-300 font-medium">Real-Time Traffic Generator:</span>
              <button
                type="button"
                onClick={onToggleLiveSim}
                className={`px-2.5 py-1 rounded font-semibold flex items-center gap-1 border ${
                  liveSimActive
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                {liveSimActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span>{liveSimActive ? 'Auto-Updating' : 'Paused'}</span>
              </button>
              <button
                type="button"
                onClick={onStepLiveSim}
                className="px-2.5 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 flex items-center gap-1"
              >
                <Zap className="w-3 h-3" />
                <span>Simulate Flow Change Now</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => onTriggerScenario('PEAK_CONVOCATION')}
                className="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors"
              >
                Peak Shift
              </button>
              <button
                onClick={() => onTriggerScenario('SPINE_CLOSURE')}
                className="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors"
              >
                Spine Closure
              </button>
              <button
                onClick={() => onTriggerScenario('HOSTEL_MEDICAL_ALERT')}
                className="px-2.5 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 transition-colors"
              >
                Hostel Alert
              </button>
              <button
                onClick={() => onTriggerScenario('CLEAR')}
                className="px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live 9-Building Traffic Overview & Real-Time Event Feed */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Live Traffic Overview Between the 9 VFSTR Campus Locations */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Radio
                    className={`w-4 h-4 ${
                      liveSimActive ? 'text-emerald-400 animate-pulse' : 'text-cyan-400'
                    }`}
                  />
                  <span>Live Traffic Overview (VFSTR Corridors)</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Dynamic traffic flow between Academic Block, Library, Hostels, Canteen, U, H, P & N Blocks
                </p>
              </div>
              <select
                value={liveSimIntensity}
                onChange={(e) => onChangeSimIntensity(e.target.value as SimulationIntensity)}
                className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] font-mono text-cyan-300"
                title="Traffic Simulation Intensity"
              >
                <option value="NORMAL">NORMAL</option>
                <option value="PEAK_HOUR">PEAK HOUR</option>
                <option value="HIGH_INCIDENT">HIGH INCIDENT</option>
              </select>
            </div>

            <div className="mt-3 space-y-2 flex-1 overflow-y-auto max-h-[290px] pr-1">
              {corridorLinks.map((cor) => {
                const isSlow = cor.status === 'CONGESTED' || cor.congestionFactor > 1.3;
                const isHazard = cor.status === 'ACCIDENT' || cor.status === 'CLOSED';
                const barWidth = Math.min(100, Math.round((cor.congestionFactor / 3.8) * 100));

                return (
                  <div
                    key={cor.id}
                    className={`p-2.5 rounded-md border transition-colors ${
                      isHazard
                        ? 'bg-rose-950/25 border-rose-500/40'
                        : isSlow
                        ? 'bg-amber-950/20 border-amber-500/35'
                        : 'bg-slate-900/70 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-white truncate">
                        {cor.fromLocation} ↔ {cor.toLocation}
                      </span>
                      <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums shrink-0">
                        <span className="text-slate-400">{cor.effectiveSpeedKmh} km/h</span>
                        <span
                          className={
                            isHazard
                              ? 'text-rose-400 font-bold'
                              : isSlow
                              ? 'text-amber-400 font-semibold'
                              : 'text-emerald-400'
                          }
                        >
                          {cor.congestionFactor.toFixed(1)}x ({cor.status})
                        </span>
                      </div>
                    </div>

                    <div className="mt-1.5 w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isHazard
                            ? 'bg-rose-500'
                            : isSlow
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    {cor.incidentNote && (
                      <div className="mt-1 text-[10px] text-amber-300 truncate">
                        {cor.incidentNote}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Scrolling Traffic Event Stream */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Real-Time Traffic Feed</span>
              </h3>
              <button
                onClick={() => onNavigateTab('traffic')}
                className="text-xs text-cyan-400 hover:text-cyan-300"
              >
                Traffic Control →
              </button>
            </div>

            <div className="mt-3 space-y-2 max-h-[195px] overflow-y-auto pr-1">
              {liveTrafficEvents.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">
                  Waiting for next real-time traffic tick or click &quot;Simulate Flow Change Now&quot;...
                </p>
              ) : (
                liveTrafficEvents.slice(0, 6).map((evt) => (
                  <div
                    key={evt.id}
                    className="p-2 rounded bg-slate-900/90 border border-slate-800/90 text-[11px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span
                        className={
                          evt.eventType === 'ACCIDENT'
                            ? 'text-rose-400 font-bold'
                            : evt.eventType === 'FLOW_CLEARED'
                            ? 'text-emerald-400 font-semibold'
                            : 'text-amber-400 font-semibold'
                        }
                      >
                        [{evt.eventType}] {evt.fromLocation} ↔ {evt.toLocation}
                      </span>
                      <span className="text-slate-500">{evt.timestamp}</span>
                    </div>
                    <p className="text-slate-300 leading-snug">{evt.summary}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Directory Strip: All VFSTR Campus Locations */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">
              Verified VFSTR Campus Locations (Click to Set Route Destination)
            </h3>
          </div>
          <a
            href="/assets/aistudio/Building_Plan_260f9f66.pdf"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Official VFSTR Building Plan PDF</span>
          </a>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {buildings.map((b) => {
            const isOrigin = b.id === sourceBuilding.id;
            const isDest = b.id === targetBuilding.id;
            return (
              <div
                key={b.id}
                onClick={() => onSelectBuildingForRoute(b)}
                className={`p-2.5 rounded-md border transition-colors cursor-pointer ${
                  isOrigin
                    ? 'bg-emerald-950/30 border-emerald-500/50'
                    : isDest
                    ? 'bg-rose-950/30 border-rose-500/50'
                    : 'bg-slate-900/70 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-white truncate">{b.shortName}</span>
                  <span className="text-[10px] font-mono text-cyan-400">
                    {b.dataSource === 'GOOGLE_MAPS_PLACES' || b.verificationStatus === 'GOOGLE_PLACES_VERIFIED'
                      ? 'GOOGLE PLACES'
                      : b.verificationStatus === 'ADMIN_VERIFIED'
                      ? 'VERIFIED'
                      : 'OSM'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">{b.officialName}</div>
                <div className="text-[10px] font-mono text-slate-500 mt-1">
                  {b.lat.toFixed(4)}°N, {b.lng.toFixed(4)}°E
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
