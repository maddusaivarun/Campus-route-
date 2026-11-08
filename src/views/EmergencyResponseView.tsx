import React from 'react';
import { CampusGraph, EmergencyVehicleType } from '../graph/Graph';
import { CampusBuildingEntry, IncidentRecord } from '../data/campusData';
import { ExtractedOSMBuilding } from '../graph/osmGraphExtractor';
import { CampusMapCanvas } from '../components/CampusMapCanvas';
import { RoutingEngine } from '../services/routingEngine';
import { EmergencyDispatchLog } from '../services/storageService';
import {
  Siren,
  ShieldAlert,
  Clock,
  Zap,
  CheckCircle2,
  Flame,
  HeartPulse,
  Shield,
  Lock,
  Info,
} from 'lucide-react';

interface EmergencyResponseViewProps {
  graph: CampusGraph;
  buildings: CampusBuildingEntry[];
  osmBuildings: ExtractedOSMBuilding[];
  incidents: IncidentRecord[];
  sourceId: string;
  targetId: string;
  emergencyMode: boolean;
  emergencyVehicle: EmergencyVehicleType;
  dispatchLogs: EmergencyDispatchLog[];
  onChangeSource: (id: string) => void;
  onChangeTarget: (id: string) => void;
  onToggleEmergencyMode: (enabled: boolean) => void;
  onChangeVehicle: (vehicle: EmergencyVehicleType) => void;
  onLogEmergencyDispatch: (log: Omit<EmergencyDispatchLog, 'id' | 'timestamp'>) => void;
}

const VEHICLE_PROFILES: Array<{
  type: EmergencyVehicleType;
  name: string;
  unitCode: string;
  role: string;
  speedBonus: string;
  accessPolicy: string;
  icon: React.FC<{ className?: string }>;
}> = [
  {
    type: 'AMBULANCE',
    name: 'Campus Medical Ambulance',
    unitCode: 'MED-01',
    role: 'Rapid trauma & hostel medical evacuation',
    speedBonus: '1.35x Velocity + Congestion Override',
    accessPolicy: 'Requires drivable road or wide service lane (No stairs/narrow footways)',
    icon: HeartPulse,
  },
  {
    type: 'FIRE_TRUCK',
    name: 'Heavy Fire & Hazmat Tender',
    unitCode: 'FIRE-04',
    role: 'Laboratory, canteen & electrical fire suppression',
    speedBonus: '1.25x Velocity + Priority Corridor',
    accessPolicy: 'Strict heavy-vehicle clearance — cannot enter pedestrian footpaths or stairs',
    icon: Flame,
  },
  {
    type: 'POLICE',
    name: 'Campus Security Rapid Patrol',
    unitCode: 'SEC-09',
    role: 'Perimeter lockdown & traffic clearance',
    speedBonus: '1.40x Velocity + Signal Preemption',
    accessPolicy: 'Requires drivable campus roads (No pedestrian steps)',
    icon: Shield,
  },
];

export const EmergencyResponseView: React.FC<EmergencyResponseViewProps> = ({
  graph,
  buildings,
  osmBuildings,
  incidents,
  sourceId,
  targetId,
  emergencyMode,
  emergencyVehicle,
  dispatchLogs,
  onChangeSource,
  onChangeTarget,
  onToggleEmergencyMode,
  onChangeVehicle,
  onLogEmergencyDispatch,
}) => {
  const activeVehicle: EmergencyVehicleType =
    emergencyVehicle === 'NONE' ? 'AMBULANCE' : emergencyVehicle;

  // Standard civilian vehicle route (affected by congestion, bound by VEHICLE profile)
  const civilianRoute = RoutingEngine.computeRoute(graph, {
    sourceNodeId: sourceId,
    targetNodeId: targetId,
    algorithm: 'ASTAR',
    metric: 'TIME',
    routingProfile: 'VEHICLE',
    emergencyMode: false,
    emergencyVehicle: 'NONE',
  });

  // Emergency priority route (enforces vehicle physical access restrictions — cannot illegally cross stairs/footways!)
  const priorityRoute = RoutingEngine.computeRoute(graph, {
    sourceNodeId: sourceId,
    targetNodeId: targetId,
    algorithm: 'ASTAR',
    metric: 'TIME',
    routingProfile: 'VEHICLE',
    emergencyMode: true,
    emergencyVehicle: activeVehicle,
  });

  const timeSavedSeconds =
    civilianRoute.found && priorityRoute.found
      ? Math.max(0, civilianRoute.totalTimeSeconds - priorityRoute.totalTimeSeconds)
      : 0;

  const sourceBuilding = buildings.find((b) => b.nearestNodeId === sourceId || b.id === sourceId);
  const targetBuilding = buildings.find((b) => b.nearestNodeId === targetId || b.id === targetId);

  const handleDispatchUnit = () => {
    onToggleEmergencyMode(true);
    if (emergencyVehicle === 'NONE') {
      onChangeVehicle('AMBULANCE');
    }

    if (priorityRoute.found) {
      onLogEmergencyDispatch({
        vehicleType: activeVehicle,
        originName: sourceBuilding?.shortName || graph.getNode(sourceId)?.name || sourceId,
        destinationName: targetBuilding?.shortName || graph.getNode(targetId)?.name || targetId,
        standardTimeSeconds: civilianRoute.found ? civilianRoute.totalTimeSeconds : 999,
        emergencyTimeSeconds: priorityRoute.totalTimeSeconds,
        timeSavedSeconds,
        distanceMeters: priorityRoute.totalDistanceMeters,
        restrictedFootpathsAvoided: priorityRoute.restrictedRoadsSkipped,
        routeSummary: priorityRoute.nodePath
          .map((id) => graph.getNode(id)?.name || id)
          .join(' → '),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Explicit Simulation Disclaimer Banner */}
      <div className="p-4 rounded-lg border bg-rose-950/25 border-rose-500/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-rose-500/20 text-rose-400 border border-rose-500/40">
            <Siren className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">
                EMERGENCY RESPONSE SIMULATION MODULE
              </h2>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-700">
                SIMULATION ONLY — NOT CONNECTED TO 108/112 DISPATCH
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Simulates priority routing for Ambulance, Fire Truck, and Police units across the actual VFSTR road geometry while strictly enforcing physical access constraints (emergency vehicles cannot traverse pedestrian-only stairs or narrow footpaths).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleDispatchUnit}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/50 transition-all flex items-center gap-1.5"
          >
            <Zap className="w-4 h-4" />
            <span>Run Priority Dispatch Simulation</span>
          </button>
          {emergencyMode && (
            <button
              onClick={() => onToggleEmergencyMode(false)}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              Stand Down
            </button>
          )}
        </div>
      </div>

      {/* Verified VFSTR Campus Emergency & Medical Assistance Destinations */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-rose-400" />
              <span>Verified VFSTR Emergency & Assistance Facilities (1-Click Route Target)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Select a confirmed campus medical or security facility to immediately calculate the shortest accessible route from your current origin.
            </p>
          </div>
          <span className="text-[10px] font-mono text-amber-300 bg-amber-950/50 border border-amber-500/30 px-2.5 py-1 rounded">
            Navigation Only — Does Not Auto-Dial 108/112
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              buildingId: 'BLD_GUEST_HOUSE',
              title: 'VFSTR Campus Medical Dispensary & Guest House',
              role: 'Primary First-Aid, Triage & Campus Ambulance Point',
              badge: 'MEDICAL ASSISTANCE',
            },
            {
              buildingId: 'BLD_A_BLOCK',
              title: 'Main Gate Security Control Room (A-Block)',
              role: '24/7 Campus Security Command & Emergency Entry Gate',
              badge: 'SECURITY COMMAND',
            },
            {
              buildingId: 'BLD_P_BLOCK',
              title: 'P-Block (Vignan Pharmacy Emergency Wing)',
              role: 'Emergency Pharmaceutical & Clinical Support',
              badge: 'PHARMACY SUPPORT',
            },
          ].map((fac) => {
            const bld = buildings.find((b) => b.id === fac.buildingId);
            if (!bld) return null;
            const isTarget = targetBuilding?.id === bld.id;
            return (
              <div
                key={fac.buildingId}
                className={`p-3 rounded-lg border flex flex-col justify-between gap-2 ${
                  isTarget
                    ? 'bg-rose-950/30 border-rose-500/50'
                    : 'bg-slate-900/80 border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-rose-400 uppercase font-semibold">
                      {fac.badge}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">
                      <CheckCircle2 className="w-3 h-3 inline mr-0.5" />
                      {bld.verificationStatus}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-white mt-1">{fac.title}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{fac.role}</div>
                  <div className="text-[10px] font-mono text-slate-500 mt-1">
                    {bld.lat.toFixed(5)}°N, {bld.lng.toFixed(5)}°E
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (bld.nearestNodeId) onChangeTarget(bld.nearestNodeId);
                    onToggleEmergencyMode(true);
                  }}
                  className="w-full py-1.5 rounded bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-200 text-xs font-semibold transition-colors"
                >
                  {isTarget ? 'Active Emergency Destination' : 'Route to This Facility →'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Split: Fleet Configuration & Comparison (Left 5 cols) + Map & Dispatch Log (Right 7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-5">
          {/* Vehicle Selector */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              1. Select Emergency Response Vehicle Profile
            </h3>
            <div className="space-y-2.5">
              {VEHICLE_PROFILES.map((v) => {
                const Icon = v.icon;
                const isSelected = activeVehicle === v.type;
                return (
                  <button
                    key={v.type}
                    onClick={() => {
                      onChangeVehicle(v.type);
                      onToggleEmergencyMode(true);
                    }}
                    className={`w-full p-3 rounded-lg border text-left transition-all flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'bg-rose-500/15 border-rose-500/50 text-white'
                        : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-2 rounded-lg mt-0.5 ${
                          isSelected
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold flex items-center gap-2">
                          <span>{v.name}</span>
                          <span className="font-mono text-[10px] text-rose-400">{v.unitCode}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{v.role}</div>
                        <div className="text-[10px] text-amber-300/90 mt-1 flex items-center gap-1">
                          <Lock className="w-3 h-3 shrink-0" />
                          <span>{v.accessPolicy}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Origin & Incident Target Selector */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              2. Dispatch Origin & Emergency Destination
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Dispatch Station / Gate</label>
                <select
                  value={sourceBuilding?.id || ''}
                  onChange={(e) => {
                    const b = buildings.find((item) => item.id === e.target.value);
                    if (b && b.nearestNodeId) onChangeSource(b.nearestNodeId);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.officialName} ({b.shortName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Emergency Target</label>
                <select
                  value={targetBuilding?.id || ''}
                  onChange={(e) => {
                    const b = buildings.find((item) => item.id === e.target.value);
                    if (b && b.nearestNodeId) onChangeTarget(b.nearestNodeId);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.officialName} ({b.shortName})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Standard vs Emergency Priority Comparison */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                Civilian Vehicle vs. Priority Emergency Comparison
              </h3>
              <span className="font-mono text-xs text-emerald-400 font-semibold">
                {timeSavedSeconds > 0 ? `-${timeSavedSeconds}s Saved` : 'Optimal Path'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                <div className="text-[11px] text-slate-400">Standard Civilian Vehicle</div>
                <div className="mt-1 text-lg font-bold font-mono text-slate-200 tabular-nums">
                  {civilianRoute.found ? `${civilianRoute.totalTimeSeconds}s` : 'BLOCKED'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {civilianRoute.found
                    ? `${civilianRoute.totalDistanceMeters}m • Full congestion delay`
                    : 'Blocked by closure'}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-rose-950/25 border border-rose-500/40">
                <div className="text-[11px] text-rose-300 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  <span>Priority {activeVehicle}</span>
                </div>
                <div className="mt-1 text-lg font-bold font-mono text-white tabular-nums">
                  {priorityRoute.found ? `${priorityRoute.totalTimeSeconds}s` : 'UNREACHABLE'}
                </div>
                <div className="text-[11px] text-rose-300/80 mt-0.5">
                  {priorityRoute.found
                    ? `${priorityRoute.totalDistanceMeters}m • Avoided ${priorityRoute.restrictedRoadsSkipped} footways`
                    : 'No drivable corridor'}
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>
                Physical Access Constraint Verification: Priority routing skipped{' '}
                <strong className="text-white">{priorityRoute.restrictedRoadsSkipped}</strong>{' '}
                pedestrian-only segments (`footway` / `steps`) that cannot accommodate a{' '}
                {activeVehicle.toLowerCase()}.
              </span>
            </div>
          </div>
        </div>

        {/* Right: Map & Dispatch History (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden h-[440px] flex flex-col">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">
                Red Line: Emergency Priority Corridor • Purple Dashed: Standard Civilian Route
              </span>
              <span className="font-mono text-rose-400 font-semibold">{activeVehicle}</span>
            </div>
            <div className="flex-1">
              <CampusMapCanvas
                graph={graph}
                buildings={buildings}
                osmBuildings={osmBuildings}
                incidents={incidents}
                selectedSourceId={sourceId}
                selectedTargetId={targetId}
                highlightedNodePath={priorityRoute.nodePath}
                highlightedEdgePath={priorityRoute.edgePath}
                routeGeometry={priorityRoute.routeGeometry}
                secondaryNodePath={civilianRoute.nodePath}
                secondaryEdgePath={civilianRoute.edgePath}
                emergencyMode={true}
              />
            </div>
          </div>

          {/* Emergency Simulation Log */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-rose-400" />
              <span>Simulated Emergency Dispatch Log</span>
            </h3>
            {dispatchLogs.length === 0 ? (
              <p className="text-xs text-slate-500">
                Click &quot;Run Priority Dispatch Simulation&quot; above to record an emergency response test.
              </p>
            ) : (
              <div className="space-y-2 max-h-[190px] overflow-y-auto pr-1">
                {dispatchLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-rose-400 font-semibold">
                          [{log.vehicleType}]
                        </span>
                        <span className="text-white font-medium">
                          {log.originName} → {log.destinationName}
                        </span>
                        <span className="text-slate-500 font-mono text-[11px]">
                          {log.timestamp}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-md">
                        {log.routeSummary}
                      </div>
                    </div>

                    <div className="text-right font-mono text-xs tabular-nums">
                      <span className="text-emerald-400 font-semibold">
                        {log.emergencyTimeSeconds}s ETA
                      </span>
                      <span className="text-slate-500 block text-[10px]">
                        Saved {log.timeSavedSeconds}s • Avoided {log.restrictedFootpathsAvoided} footpaths
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
