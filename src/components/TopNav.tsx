import React from 'react';
import {
  Menu,
  Siren,
  RotateCcw,
  Navigation,
  Activity,
  LocateFixed,
  RefreshCw,
  ShieldCheck,
  Radio,
  Play,
  Pause,
  Zap,
} from 'lucide-react';
import { NavigationTabId } from './Sidebar';
import { OverpassFetchMeta } from '../services/osmOverpassService';
import { GpsPositionState } from '../services/gpsService';

interface TopNavProps {
  activeTab: NavigationTabId;
  onOpenMobileMenu: () => void;
  emergencyMode: boolean;
  onToggleEmergencyMode: () => void;
  onResetCampusNetwork: () => void;
  networkHealthScore: number;
  activeIncidentsCount: number;
  onQuickNavigate: (tab: NavigationTabId) => void;
  osmMeta?: OverpassFetchMeta;
  onRefreshOSM?: () => void;
  isRefreshingOSM?: boolean;
  googleSyncedCount?: number;
  isSyncingGoogle?: boolean;
  onSyncGoogleData?: () => void;
  gpsState?: GpsPositionState;
  onRequestGps?: () => void;
  adminMode?: boolean;
  onToggleAdminMode?: () => void;
  liveSimActive?: boolean;
  onToggleLiveSim?: () => void;
  onStepLiveSim?: () => void;
  liveSimTickCount?: number;
}

const TAB_TITLES: Record<NavigationTabId, { title: string; subtitle: string }> = {
  overview: {
    title: 'VFSTR Campus Command & Live Google Traffic Overview',
    subtitle: 'Real-time Google Maps Places API (New), Routes API & live traffic telemetry at Vadlamudi',
  },
  navigation: {
    title: 'Live Google Maps Campus Navigation & Dynamic Rerouting',
    subtitle: 'Real-time Google Routes API geometry with automatic traffic detour calculation & turn-by-turn steps',
  },
  traffic: {
    title: 'Real-Time Traffic Control & Incident Simulation',
    subtitle: 'Dynamic traffic flow generator, Google TrafficLayer & administrator road closures',
  },
  emergency: {
    title: 'Emergency Dispatch & Priority Vehicle Simulation',
    subtitle: 'Ambulance, Fire Truck & Police routing enforcing pedestrian-only & stair access restrictions',
  },
  comparison: {
    title: 'Multi-Route Comparison & Google Routes Analytics',
    subtitle: 'Compare 2+ Google Maps & campus routes side-by-side with Recharts travel time, distance & traffic charts',
  },
  visualizer: {
    title: 'Interactive DSA Step-by-Step Execution Lab',
    subtitle: 'Inspect Binary Min-Heap Priority Queue state, frontier expansion & Haversine relaxation',
  },
  analytics: {
    title: 'Campus GIS Topology & Algorithm Analytics',
    subtitle: 'Google Places & campus highway composition, pedestrian vs. vehicle reachability & complexity benchmarks',
  },
  settings: {
    title: 'Campus Administration, Google Places Sync & GeoJSON',
    subtitle: 'Verify VFSTR building positions on Google Satellite, add custom pathways & export RFC 7946 GeoJSON',
  },
};

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onOpenMobileMenu,
  emergencyMode,
  onToggleEmergencyMode,
  onResetCampusNetwork,
  networkHealthScore,
  activeIncidentsCount,
  onQuickNavigate,
  osmMeta,
  onRefreshOSM,
  isRefreshingOSM = false,
  googleSyncedCount = 0,
  isSyncingGoogle = false,
  onSyncGoogleData,
  gpsState,
  onRequestGps,
  adminMode = false,
  onToggleAdminMode,
  liveSimActive = false,
  onToggleLiveSim,
  onStepLiveSim,
  liveSimTickCount = 0,
}) => {
  const currentMeta = TAB_TITLES[activeTab];

  return (
    <header className="h-16 px-4 lg:px-6 bg-[#0B1120]/95 border-b border-slate-800/80 flex items-center justify-between gap-3 sticky top-0 z-30 backdrop-blur-md">
      {/* Left: Mobile Menu + Active View Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-semibold text-white tracking-tight truncate">
            {currentMeta.title}
          </h1>
          <p className="text-xs text-slate-400 truncate hidden sm:block">{currentMeta.subtitle}</p>
        </div>
      </div>

      {/* Right: Live Traffic Sim Controls + Google Maps Sync + Telemetry Readouts + GPS + Emergency */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Real-Time Traffic Simulation Stream Control */}
        {onToggleLiveSim && (
          <div className="flex items-center gap-1 bg-slate-900/95 border border-slate-800 rounded-lg p-1">
            <button
              type="button"
              onClick={onToggleLiveSim}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                liveSimActive
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Toggle Real-Time Campus Traffic Simulation Stream"
            >
              <Radio
                className={`w-3.5 h-3.5 ${
                  liveSimActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'
                }`}
              />
              <span className="hidden md:inline">
                {liveSimActive ? `LIVE TRAFFIC (${liveSimTickCount})` : 'Traffic Sim Paused'}
              </span>
              {liveSimActive ? (
                <Pause className="w-3 h-3 ml-0.5" />
              ) : (
                <Play className="w-3 h-3 ml-0.5" />
              )}
            </button>

            {onStepLiveSim && (
              <button
                type="button"
                onClick={onStepLiveSim}
                className="px-2 py-1 rounded text-[11px] font-mono bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 flex items-center gap-1"
                title="Generate an immediate random traffic flow change or incident between VFSTR buildings"
              >
                <Zap className="w-3 h-3" />
                <span className="hidden lg:inline">Pulse</span>
              </button>
            )}
          </div>
        )}

        {/* Google Maps Live Data Provenance Status */}
        <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900/90 border border-cyan-500/30 text-[11px]">
          <span
            className={`w-2 h-2 rounded-full ${
              isSyncingGoogle
                ? 'bg-amber-400 animate-ping'
                : 'bg-emerald-400'
            }`}
          />
          <span className="font-mono text-cyan-300 font-semibold">
            {isSyncingGoogle
              ? 'SYNCING GOOGLE...'
              : `GOOGLE LIVE (${googleSyncedCount || 10} BLOCKS)`}
          </span>
          {(onSyncGoogleData || onRefreshOSM) && (
            <button
              type="button"
              onClick={onSyncGoogleData || onRefreshOSM}
              disabled={isSyncingGoogle || isRefreshingOSM}
              className="text-slate-300 hover:text-cyan-300 disabled:opacity-50 cursor-pointer"
              title="Re-query live Google Maps Places API (New) & Routes API for VFSTR campus blocks and corridors"
            >
              <RefreshCw
                className={`w-3 h-3 ${
                  isSyncingGoogle || isRefreshingOSM ? 'animate-spin text-cyan-400' : ''
                }`}
              />
            </button>
          )}
        </div>
        {osmMeta ? null : null}

        {/* Network Health */}
        <div className="hidden md:flex items-center gap-3 px-2.5 py-1 rounded bg-slate-900/80 border border-slate-800 text-xs">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Health:</span>
            <span
              className={`font-mono font-semibold tabular-nums ${
                networkHealthScore >= 80
                  ? 'text-emerald-400'
                  : networkHealthScore >= 55
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {networkHealthScore}%
            </span>
          </div>
          <span className="text-slate-700">|</span>
          <button
            onClick={() => onQuickNavigate('traffic')}
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <span className="text-slate-400">Incidents:</span>
            <span
              className={`font-mono font-semibold tabular-nums ${
                activeIncidentsCount > 0 ? 'text-amber-400' : 'text-slate-300'
              }`}
            >
              {activeIncidentsCount}
            </span>
          </button>
        </div>

        {/* Live GPS Button */}
        {onRequestGps && (
          <button
            type="button"
            onClick={onRequestGps}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              gpsState?.status === 'ACTIVE'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700/80'
            }`}
            title="Use Browser Geolocation API to find your current position"
          >
            <LocateFixed className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden xl:inline">
              {gpsState?.status === 'ACTIVE'
                ? gpsState.isWithinCampus
                  ? 'GPS On-Campus'
                  : 'GPS Off-Campus'
                : 'My GPS'}
            </span>
          </button>
        )}

        {/* Admin Mode Toggle */}
        {onToggleAdminMode && (
          <button
            type="button"
            onClick={onToggleAdminMode}
            className={`hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              adminMode
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-700/80'
            }`}
            title="Toggle Campus Administrator Verification Mode"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{adminMode ? 'Admin' : 'Admin'}</span>
          </button>
        )}

        {/* Reset Road Network Conditions */}
        <button
          onClick={onResetCampusNetwork}
          className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/80 transition-colors"
          title="Clear simulated traffic and restore baseline OpenStreetMap road state"
        >
          <RotateCcw className="w-3.5 h-3.5 sm:inline sm:mr-1" />
          <span className="hidden lg:inline">Reset</span>
        </button>

        {/* Emergency Mode Toggle */}
        <button
          onClick={onToggleEmergencyMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all border ${
            emergencyMode
              ? 'bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-950/60'
              : 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
          }`}
        >
          <Siren className={`w-3.5 h-3.5 ${emergencyMode ? 'animate-bounce' : ''}`} />
          <span className="hidden sm:inline">{emergencyMode ? 'EMERGENCY ON' : 'Emergency'}</span>
        </button>

        {activeTab !== 'navigation' && (
          <button
            onClick={() => onQuickNavigate('navigation')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Route</span>
          </button>
        )}
      </div>
    </header>
  );
};
