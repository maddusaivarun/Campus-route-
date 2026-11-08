import React from 'react';
import {
  LayoutDashboard,
  Navigation,
  TrafficCone,
  Siren,
  GitCompare,
  Cpu,
  BarChart3,
  ShieldCheck,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from 'lucide-react';

export type NavigationTabId =
  | 'overview'
  | 'navigation'
  | 'traffic'
  | 'emergency'
  | 'comparison'
  | 'visualizer'
  | 'analytics'
  | 'settings';

interface SidebarProps {
  activeTab: NavigationTabId;
  onSelectTab: (tab: NavigationTabId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeIncidentCount: number;
  emergencyActive: boolean;
  adminMode?: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: NavigationTabId;
  label: string;
  shortDesc: string;
  icon: React.FC<{ className?: string }>;
}> = [
  {
    id: 'overview',
    label: 'Overview Command',
    shortDesc: 'Real VFSTR Map & Telemetry',
    icon: LayoutDashboard,
  },
  {
    id: 'navigation',
    label: 'Live Navigation',
    shortDesc: 'OSM Routing & Live GPS',
    icon: Navigation,
  },
  {
    id: 'traffic',
    label: 'Traffic & Incidents',
    shortDesc: 'Reports, Closures & Sim',
    icon: TrafficCone,
  },
  {
    id: 'emergency',
    label: 'Emergency Dispatch',
    shortDesc: 'Priority Vehicle Sim',
    icon: Siren,
  },
  {
    id: 'comparison',
    label: 'Route Comparison',
    shortDesc: 'Dijkstra vs A* vs BFS/DFS',
    icon: GitCompare,
  },
  {
    id: 'visualizer',
    label: 'DSA Visualizer',
    shortDesc: 'Min-Heap & Frontier Step',
    icon: Cpu,
  },
  {
    id: 'analytics',
    label: 'Network Analytics',
    shortDesc: 'OSM Graph & Road Health',
    icon: BarChart3,
  },
  {
    id: 'settings',
    label: 'Campus Admin & GIS',
    shortDesc: 'Verify Buildings & GeoJSON',
    icon: ShieldCheck,
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  activeIncidentCount,
  emergencyActive,
  adminMode = false,
  mobileOpen,
  onCloseMobile,
}) => {
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-40 lg:hidden backdrop-blur-xs"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 flex flex-col bg-[#0B1120] border-r border-slate-800/80 transition-all duration-200 select-none ${
          collapsed ? 'w-20' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Brand Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80">
          <div className="flex items-center gap-3 overflow-hidden">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                emergencyActive
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                  : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold tracking-tight text-white text-base">
                    ResQ<span className="text-cyan-400">Route</span>
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                    2.0 GIS
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate">
                  VFSTR Vadlamudi, Guntur
                </p>
              </div>
            )}
          </div>

          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex w-7 h-7 rounded-md items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-4 px-2.5 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isEmergencyItem = item.id === 'emergency';
            const isTrafficItem = item.id === 'traffic';
            const isAdminItem = item.id === 'settings';

            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all relative ${
                  isActive
                    ? isEmergencyItem && emergencyActive
                      ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                      : 'bg-cyan-500/12 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 transition-colors ${
                    isActive
                      ? isEmergencyItem && emergencyActive
                        ? 'text-rose-400'
                        : 'text-cyan-400'
                      : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />

                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{item.label}</span>
                      {isTrafficItem && activeIncidentCount > 0 && (
                        <span className="ml-1.5 text-[11px] font-mono font-semibold text-amber-400 tabular-nums">
                          {activeIncidentCount}
                        </span>
                      )}
                      {isEmergencyItem && emergencyActive && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                      )}
                      {isAdminItem && adminMode && (
                        <span className="text-[10px] font-mono text-emerald-400">ADMIN</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{item.shortDesc}</p>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Campus GIS Footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/60">
          {!collapsed ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-cyan-400" /> VFSTR Reference
                </span>
                <span className="font-mono text-cyan-400 text-[10px]">16.23155, 80.55127</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Vignan&apos;s Foundation for Science, Technology &amp; Research, Vadlamudi, AP 522213.
              </p>
            </div>
          ) : (
            <div className="flex justify-center" title="VFSTR Vadlamudi: 16.23155°N, 80.55127°E">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
