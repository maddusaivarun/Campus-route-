import React, { useState, useMemo } from 'react';
import {
  OptimizationMetric,
  RoutingProfile,
  CampusGraph,
  OSMHighwayType,
  RoadStatus,
} from '../graph/Graph';
import {
  CampusBuildingEntry,
  AdminCustomPathway,
  IncidentRecord,
  VFSTR_CAMPUS_CENTER,
} from '../data/campusData';
import { ExtractedOSMBuilding } from '../graph/osmGraphExtractor';
import { RoutingAlgorithmType } from '../services/routingEngine';
import { OverpassFetchMeta } from '../services/osmOverpassService';
import { StorageService } from '../services/storageService';
import { AuthSessionState } from '../services/firebaseService';
import { CampusMapCanvas } from '../components/CampusMapCanvas';
import {
  ShieldCheck,
  RotateCcw,
  Download,
  Upload,
  Plus,
  MapPin,
  Route,
  FileText,
  RefreshCw,
  CheckCircle2,
  Lock,
  Unlock,
  LogIn,
  LogOut,
  Network,
  AlertTriangle,
  Database,
} from 'lucide-react';

interface SettingsViewProps {
  graph: CampusGraph;
  buildings: CampusBuildingEntry[];
  osmBuildings: ExtractedOSMBuilding[];
  adminPathways: AdminCustomPathway[];
  incidents: IncidentRecord[];
  osmMeta: OverpassFetchMeta;
  authSession: AuthSessionState;
  onSignInGoogle: () => void;
  onSignOutGoogle: () => void;
  adminMode: boolean;
  onToggleAdminMode: () => void;
  onRefreshOSM: () => void;
  isRefreshingOSM: boolean;
  defaultAlgorithm: RoutingAlgorithmType;
  defaultMetric: OptimizationMetric;
  defaultRoutingProfile: RoutingProfile;
  walkingSpeedMps: number;
  onSavePreferences: (
    alg: RoutingAlgorithmType,
    metric: OptimizationMetric,
    profile: RoutingProfile,
    walkingSpeedMps?: number
  ) => void;
  onVerifyOrUpdateBuilding: (updated: CampusBuildingEntry) => void;
  onAddCustomBuilding: (newBuilding: CampusBuildingEntry) => void;
  onAddAdminPathway: (pathway: AdminCustomPathway) => void;
  onToggleEdgeAccessibility?: (edgeId: string, status: RoadStatus) => void;
  onImportGeoJSON: (rawJson: string) => { success: boolean; message: string };
  onResetAllData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  graph,
  buildings,
  osmBuildings,
  adminPathways,
  incidents,
  osmMeta,
  authSession,
  onSignInGoogle,
  onSignOutGoogle,
  adminMode,
  onToggleAdminMode,
  onRefreshOSM,
  isRefreshingOSM,
  defaultAlgorithm,
  defaultMetric,
  defaultRoutingProfile,
  walkingSpeedMps,
  onSavePreferences,
  onVerifyOrUpdateBuilding,
  onAddCustomBuilding,
  onAddAdminPathway,
  onToggleEdgeAccessibility,
  onImportGeoJSON,
  onResetAllData,
}) => {
  const isAuthorizedAdmin = authSession.isAdmin || adminMode;

  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    buildings[0]?.id || 'BLD_A_BLOCK'
  );
  const selectedBuilding =
    buildings.find((b) => b.id === selectedBuildingId) || buildings[0];

  const [editLat, setEditLat] = useState<string>(
    selectedBuilding ? String(selectedBuilding.lat) : String(VFSTR_CAMPUS_CENTER.lat)
  );
  const [editLng, setEditLng] = useState<string>(
    selectedBuilding ? String(selectedBuilding.lng) : String(VFSTR_CAMPUS_CENTER.lng)
  );
  const [editOfficialName, setEditOfficialName] = useState<string>(
    selectedBuilding?.officialName || ''
  );

  // New Landmark State
  const [newLandmarkName, setNewLandmarkName] = useState('');
  const [newLandmarkShort, setNewLandmarkShort] = useState('');
  const [newLandmarkCategory, setNewLandmarkCategory] =
    useState<CampusBuildingEntry['category']>('ACADEMIC');
  const [newLandmarkLat, setNewLandmarkLat] = useState<number>(16.23305);
  const [newLandmarkLng, setNewLandmarkLng] = useState<number>(80.55085);

  // New Admin Pathway State
  const [pathwayName, setPathwayName] = useState('');
  const [pathwayType, setPathwayType] = useState<OSMHighwayType>('footway');
  const [pathwayAllowVehicle, setPathwayAllowVehicle] = useState(false);
  const [pathwayPoints, setPathwayPoints] = useState<[number, number][]>([]);
  const [mapClickMode, setMapClickMode] = useState<
    'EDIT_BUILDING' | 'NEW_LANDMARK' | 'DRAW_PATHWAY'
  >('EDIT_BUILDING');

  // GeoJSON Import/Export State
  const [geoJsonText, setGeoJsonText] = useState<string>('');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Graph Connectivity & Network Coverage Report
  const connectivityReport = useMemo(
    () => graph.analyzeNetworkConnectivity(defaultRoutingProfile),
    [graph, defaultRoutingProfile, adminPathways, incidents]
  );

  const uniqueEdges = useMemo(() => graph.getUniqueUndirectedEdges(), [graph, adminPathways, incidents]);

  const handleSelectBuildingToEdit = (id: string) => {
    setSelectedBuildingId(id);
    const found = buildings.find((b) => b.id === id);
    if (found) {
      setEditLat(String(found.lat));
      setEditLng(String(found.lng));
      setEditOfficialName(found.officialName);
    }
  };

  const handleMapClick = (lat: number, lng: number) => {
    if (!isAuthorizedAdmin) return;
    if (mapClickMode === 'EDIT_BUILDING') {
      setEditLat(String(lat));
      setEditLng(String(lng));
      setStatusBanner(
        `Pinned ${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E for ${selectedBuilding?.shortName}. Click "Save & Sync to Firestore" to commit.`
      );
    } else if (mapClickMode === 'NEW_LANDMARK') {
      setNewLandmarkLat(lat);
      setNewLandmarkLng(lng);
      setStatusBanner(
        `Pinned new landmark coordinate at ${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E.`
      );
    } else if (mapClickMode === 'DRAW_PATHWAY') {
      setPathwayPoints((prev) => [...prev, [lat, lng]]);
    }
  };

  const handleSaveBuildingVerification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBuilding || !isAuthorizedAdmin) return;
    const parsedLat = parseFloat(editLat);
    const parsedLng = parseFloat(editLng);
    if (
      Number.isNaN(parsedLat) ||
      Number.isNaN(parsedLng) ||
      parsedLat < 16.2 ||
      parsedLat > 16.26 ||
      parsedLng < 80.52 ||
      parsedLng > 80.58
    ) {
      setStatusBanner(
        'Invalid coordinates: Latitude must be within 16.20°–16.26°N and Longitude within 80.52°–80.58°E (VFSTR Vadlamudi bounds).'
      );
      return;
    }

    onVerifyOrUpdateBuilding({
      ...selectedBuilding,
      officialName: editOfficialName.trim() || selectedBuilding.officialName,
      lat: parsedLat,
      lng: parsedLng,
      dataSource: 'ADMIN_VERIFIED',
      verificationStatus: 'ADMIN_VERIFIED',
      lastVerifiedAt: new Date().toISOString().slice(0, 10),
    });
    setStatusBanner(
      `Verified and synced ${selectedBuilding.officialName} at (${parsedLat.toFixed(5)}, ${parsedLng.toFixed(5)}).`
    );
  };

  const handleCreateLandmark = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLandmarkName.trim() || !isAuthorizedAdmin) return;
    const id = `BLD_CUSTOM_${Date.now()}`;
    const shortName = newLandmarkShort.trim() || newLandmarkName.trim().slice(0, 14);
    onAddCustomBuilding({
      id,
      name: newLandmarkName.trim(),
      shortName,
      officialName: newLandmarkName.trim(),
      category: newLandmarkCategory,
      lat: newLandmarkLat,
      lng: newLandmarkLng,
      osmFeatureId: null,
      dataSource: 'ADMIN_VERIFIED',
      verificationStatus: 'ADMIN_VERIFIED',
      lastVerifiedAt: new Date().toISOString().slice(0, 10),
      description: 'Administrator-verified VFSTR campus landmark.',
      entrances: [{ label: 'Main Entrance', lat: newLandmarkLat, lng: newLandmarkLng }],
    });
    setNewLandmarkName('');
    setNewLandmarkShort('');
    setStatusBanner(`Added verified campus landmark "${newLandmarkName.trim()}" and synced to Firestore.`);
  };

  const handleSaveAdminPathway = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorizedAdmin) return;
    if (pathwayPoints.length < 2) {
      setStatusBanner(
        'Click at least 2 points on the map in "DRAW_PATHWAY" mode to create a connected walkable pathway.'
      );
      return;
    }
    const newPath: AdminCustomPathway = {
      id: `ADM_PATH_${Date.now()}`,
      name: pathwayName.trim() || 'Verified Campus Connector Pathway',
      geometry: pathwayPoints,
      highwayType: pathwayType,
      allowWalking: true,
      allowBicycle: pathwayType !== 'steps',
      allowVehicle: pathwayAllowVehicle && pathwayType !== 'steps' && pathwayType !== 'footway',
      oneWay: false,
      verifiedBy: authSession.user?.email || 'VFSTR Campus GIS Admin',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    onAddAdminPathway(newPath);
    setPathwayName('');
    setPathwayPoints([]);
    setStatusBanner(
      `Added custom pathway "${newPath.name}", snapped into routing graph, and synced to Firestore.`
    );
  };

  const handleExportGeoJSON = () => {
    const json = StorageService.exportCampusGeoJSON(
      buildings,
      adminPathways,
      graph,
      incidents
    );
    setGeoJsonText(json);
    try {
      const blob = new Blob([json], { type: 'application/geo+json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vfstr_campus_resqroute.geojson';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback to text area copy
    }
    setStatusBanner(
      'Exported RFC 7946 Campus GeoJSON (verified buildings, custom pathways, and road network).'
    );
  };

  const handleRunGeoJSONImport = () => {
    if (!geoJsonText.trim() || !isAuthorizedAdmin) return;
    const res = onImportGeoJSON(geoJsonText);
    setStatusBanner(res.message);
  };

  return (
    <div className="space-y-6">
      {/* Top Firebase Authentication & Admin RBAC Bar */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
              isAuthorizedAdmin
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            {isAuthorizedAdmin ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-white">
                VFSTR Campus GIS Administration & Firebase Cloud Console
              </h2>
              <span
                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                  authSession.isAdmin
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : isAuthorizedAdmin
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                    : 'bg-slate-900 text-slate-400 border-slate-700'
                }`}
              >
                {authSession.isAdmin
                  ? `FIREBASE ADMIN (${authSession.user?.email})`
                  : isAuthorizedAdmin
                  ? 'LOCAL ADMIN SESSION'
                  : 'READ-ONLY VIEWER'}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-400 flex items-center gap-1">
                <Database className="w-3 h-3" />
                Firestore Connected
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Sign in with Google (<code className="text-cyan-300">madduvarun5@gmail.com</code>) to persist verified buildings, custom pathways, and incident verifications directly to Cloud Firestore with Zero-Trust security rules.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {authSession.user ? (
            <button
              type="button"
              onClick={onSignOutGoogle}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              <span>Sign Out ({authSession.user.email?.split('@')[0]})</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignInGoogle}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign in with Google (Firebase Auth)</span>
            </button>
          )}

          <a
            href="/assets/aistudio/Building_Plan_260f9f66.pdf"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>VFSTR Blueprint PDF</span>
          </a>

          <button
            type="button"
            onClick={onToggleAdminMode}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              isAuthorizedAdmin
                ? 'bg-slate-800 text-slate-200 border border-slate-700'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isAuthorizedAdmin ? 'Lock Editor' : 'Unlock Admin Editor'}</span>
          </button>
        </div>
      </div>

      {statusBanner && (
        <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-500/40 text-xs text-cyan-200 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
            {statusBanner}
          </span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-slate-400 hover:text-white text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Network Connectivity & Path Accessibility Inspector (Section 9 Requirement) */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Network className="w-4 h-4 text-cyan-400" />
              <span>Campus Graph Connectivity & Walkable Network Coverage Inspector</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Validates graph connectivity across all {connectivityReport.totalNodes} intersections, identifies disconnected subgraphs, and allows marking segments accessible/inaccessible.
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded text-xs font-mono font-semibold border ${
              connectivityReport.isFullyConnected
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
            }`}
          >
            {connectivityReport.isFullyConnected
              ? `100% CONNECTED (${connectivityReport.totalNodes}/${connectivityReport.totalNodes} NODES)`
              : `${connectivityReport.componentCount} COMPONENTS (${connectivityReport.disconnectedNodeIds.length} DISCONNECTED NODES)`}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded bg-slate-900 border border-slate-800">
            <div className="text-[10px] text-slate-400">Walkable Coverage</div>
            <div className="text-emerald-400 font-bold text-base mt-0.5">
              {connectivityReport.walkableCoverageMeters} m
            </div>
          </div>
          <div className="p-3 rounded bg-slate-900 border border-slate-800">
            <div className="text-[10px] text-slate-400">Drivable Coverage</div>
            <div className="text-cyan-300 font-bold text-base mt-0.5">
              {connectivityReport.vehicleCoverageMeters} m
            </div>
          </div>
          <div className="p-3 rounded bg-slate-900 border border-slate-800">
            <div className="text-[10px] text-slate-400">Closed / Inaccessible Paths</div>
            <div className="text-rose-400 font-bold text-base mt-0.5">
              {connectivityReport.closedEdgeIds.length} closed ({connectivityReport.inaccessibleEdgeIds.length} mode-restricted)
            </div>
          </div>
          <div className="p-3 rounded bg-slate-900 border border-slate-800">
            <div className="text-[10px] text-slate-400">Disconnected Nodes</div>
            <div className="text-amber-300 font-bold text-base mt-0.5">
              {connectivityReport.disconnectedNodeIds.length}
            </div>
          </div>
        </div>

        {connectivityReport.disconnectedNodeIds.length > 0 && (
          <div className="p-2.5 rounded bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Disconnected Nodes Detected:{' '}
              <strong className="font-mono">
                {connectivityReport.disconnectedNodeIds
                  .map((id) => graph.getNode(id)?.shortLabel || id)
                  .join(', ')}
              </strong>{' '}
              — Re-open closed connecting segments below or draw a connector footpath.
            </span>
          </div>
        )}

        {/* Segment Accessibility Toggle Table */}
        <div className="max-h-48 overflow-y-auto rounded border border-slate-800 bg-slate-950">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase bg-slate-900/90 sticky top-0">
                <th className="py-2 px-3">Path / Road Segment</th>
                <th className="py-2 px-3">Type</th>
                <th className="py-2 px-3">Length</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Admin Accessibility Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {uniqueEdges.map((edge) => {
                const isClosed = edge.status === 'CLOSED';
                return (
                  <tr key={edge.id} className="hover:bg-slate-900/60">
                    <td className="py-2 px-3 text-white font-medium">{edge.roadName}</td>
                    <td className="py-2 px-3 font-mono text-slate-400">{edge.highwayType}</td>
                    <td className="py-2 px-3 font-mono text-slate-300">{edge.distanceMeters}m</td>
                    <td className="py-2 px-3 font-mono">
                      <span
                        className={
                          isClosed
                            ? 'text-rose-400 font-bold'
                            : edge.status === 'OPEN'
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }
                      >
                        {edge.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {onToggleEdgeAccessibility && (
                        <button
                          type="button"
                          disabled={!isAuthorizedAdmin}
                          onClick={() =>
                            onToggleEdgeAccessibility(edge.id, isClosed ? 'OPEN' : 'CLOSED')
                          }
                          className={`px-2.5 py-1 rounded text-[10px] font-mono font-semibold border disabled:opacity-40 ${
                            isClosed
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                          }`}
                        >
                          {isClosed ? 'Mark Accessible (OPEN)' : 'Mark Inaccessible (CLOSE)'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Split: Interactive Admin Map + Verification Forms */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 6 Cols: Interactive GIS Pinning Map & OSM Overpass Provenance */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden flex flex-col h-[460px]">
            <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-white">
                Interactive Admin Map Pinning ({isAuthorizedAdmin ? 'Click Map to Pin' : 'Sign In / Unlock Admin Mode'})
              </span>
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'EDIT_BUILDING', label: 'Relocate Building' },
                    { id: 'NEW_LANDMARK', label: 'Pin New Landmark' },
                    { id: 'DRAW_PATHWAY', label: 'Draw Footpath' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMapClickMode(m.id)}
                    className={`px-2 py-1 rounded text-[10px] font-mono border ${
                      mapClickMode === m.id
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1">
              <CampusMapCanvas
                graph={graph}
                buildings={buildings}
                osmBuildings={osmBuildings}
                incidents={incidents}
                routeGeometry={pathwayPoints}
                onMapCoordinateClick={handleMapClick}
                onSelectBuilding={(b) => handleSelectBuildingToEdit(b.id)}
              />
            </div>
          </div>

          {/* OpenStreetMap Overpass API Data Acquisition Status */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Geographic Data Provenance & Overpass Sync
                </h3>
                <p className="text-xs text-slate-400">
                  Bounding Box: 16.2255°N, 80.5455°E to 16.2360°N, 80.5565°E (VFSTR Vadlamudi)
                </p>
              </div>
              <button
                type="button"
                onClick={onRefreshOSM}
                disabled={isRefreshingOSM}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingOSM ? 'animate-spin' : ''}`} />
                <span>Refresh Live GIS</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                <div className="text-[10px] text-slate-400">Source</div>
                <div className="text-cyan-300 font-bold mt-0.5 truncate">{osmMeta.source}</div>
              </div>
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                <div className="text-[10px] text-slate-400">Graph Nodes</div>
                <div className="text-white font-bold mt-0.5">{osmMeta.nodeCount}</div>
              </div>
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                <div className="text-[10px] text-slate-400">Mapped Ways</div>
                <div className="text-white font-bold mt-0.5">{osmMeta.wayCount}</div>
              </div>
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                <div className="text-[10px] text-slate-400">Admin Pathways</div>
                <div className="text-emerald-400 font-bold mt-0.5">{adminPathways.length}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 6 Cols: Building Verification Editor, Custom Pathway Creator, GeoJSON Export */}
        <div className="lg:col-span-6 space-y-6">
          {/* 1. Edit / Verify Campus Building Coordinates */}
          <form
            onSubmit={handleSaveBuildingVerification}
            className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <span>1. Verify / Edit VFSTR Building Position</span>
              </h3>
              <span className="text-[11px] font-mono text-cyan-400">
                {selectedBuilding?.verificationStatus}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Select Campus Building</label>
                <select
                  value={selectedBuildingId}
                  onChange={(e) => handleSelectBuildingToEdit(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.officialName} ({b.shortName}) [{b.verificationStatus}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Official Building Name</label>
                <input
                  type="text"
                  disabled={!isAuthorizedAdmin}
                  value={editOfficialName}
                  onChange={(e) => setEditOfficialName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white disabled:opacity-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Latitude (°N)</label>
                <input
                  type="text"
                  disabled={!isAuthorizedAdmin}
                  value={editLat}
                  onChange={(e) => setEditLat(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Longitude (°E)</label>
                <input
                  type="text"
                  disabled={!isAuthorizedAdmin}
                  value={editLng}
                  onChange={(e) => setEditLng(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white disabled:opacity-50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!isAuthorizedAdmin}
              className="w-full py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-semibold text-xs transition-colors"
            >
              Save Coordinates & Sync ADMIN_VERIFIED to Firestore
            </button>
          </form>

          {/* 2. Add New Verified Campus Landmark */}
          <form
            onSubmit={handleCreateLandmark}
            className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-3"
          >
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-2.5">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>2. Add Verified Campus Landmark</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                disabled={!isAuthorizedAdmin}
                placeholder="Building / Landmark Name"
                value={newLandmarkName}
                onChange={(e) => setNewLandmarkName(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              />
              <input
                type="text"
                disabled={!isAuthorizedAdmin}
                placeholder="Short Label (e.g. Sports Complex)"
                value={newLandmarkShort}
                onChange={(e) => setNewLandmarkShort(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              />
              <select
                disabled={!isAuthorizedAdmin}
                value={newLandmarkCategory}
                onChange={(e) =>
                  setNewLandmarkCategory(e.target.value as CampusBuildingEntry['category'])
                }
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              >
                <option value="ACADEMIC">ACADEMIC</option>
                <option value="ADMINISTRATION">ADMINISTRATION</option>
                <option value="LIBRARY">LIBRARY</option>
                <option value="HOSTEL">HOSTEL</option>
                <option value="DINING">DINING</option>
                <option value="AMENITY">AMENITY</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>
                Coords: {newLandmarkLat.toFixed(5)}°N, {newLandmarkLng.toFixed(5)}°E
              </span>
              <button
                type="submit"
                disabled={!isAuthorizedAdmin}
                className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-sans font-semibold text-xs"
              >
                Add Landmark & Sync
              </button>
            </div>
          </form>

          {/* 3. Add Missing Pedestrian Pathway / Connector */}
          <form
            onSubmit={handleSaveAdminPathway}
            className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Route className="w-4 h-4 text-cyan-400" />
                <span>3. Add Missing Campus Footpath / Connector</span>
              </h3>
              <span className="text-[11px] font-mono text-cyan-400">
                Points: {pathwayPoints.length}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                disabled={!isAuthorizedAdmin}
                placeholder="Pathway Name (e.g., Library North Shortcut)"
                value={pathwayName}
                onChange={(e) => setPathwayName(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              />
              <select
                disabled={!isAuthorizedAdmin}
                value={pathwayType}
                onChange={(e) => setPathwayType(e.target.value as OSMHighwayType)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              >
                <option value="footway">Pedestrian Footway</option>
                <option value="pedestrian">Pedestrian Plaza</option>
                <option value="steps">Stairs / Steps (No Vehicles)</option>
                <option value="service">Campus Service Road (Vehicles Allowed)</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  disabled={!isAuthorizedAdmin}
                  checked={pathwayAllowVehicle}
                  onChange={(e) => setPathwayAllowVehicle(e.target.checked)}
                />
                <span>Allow Motor Vehicles</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPathwayPoints([])}
                  className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-xs"
                >
                  Clear Points
                </button>
                <button
                  type="submit"
                  disabled={!isAuthorizedAdmin}
                  className="px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-semibold text-xs"
                >
                  Save Pathway & Sync
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Bottom Row: GeoJSON Export/Import + Routing Preferences */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">
                Campus GeoJSON Export & Import (RFC 7946)
              </h3>
              <p className="text-xs text-slate-400">
                Export or import verified VFSTR buildings, custom pathways, and road segments
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportGeoJSON}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-xs font-medium flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export GeoJSON</span>
              </button>
              <button
                type="button"
                disabled={!isAuthorizedAdmin}
                onClick={handleRunGeoJSONImport}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-1.5 disabled:opacity-40"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import GeoJSON</span>
              </button>
            </div>
          </div>

          <textarea
            rows={4}
            value={geoJsonText}
            onChange={(e) => setGeoJsonText(e.target.value)}
            placeholder='Click "Export GeoJSON" to inspect RFC 7946 FeatureCollection or paste GeoJSON here to import...'
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="lg:col-span-5 bg-[#111827] border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">
              Default Routing Engine & Walking Speed Preferences
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Algorithm</label>
                <select
                  value={defaultAlgorithm}
                  onChange={(e) =>
                    onSavePreferences(
                      e.target.value as RoutingAlgorithmType,
                      defaultMetric,
                      defaultRoutingProfile,
                      walkingSpeedMps
                    )
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white"
                >
                  <option value="DIJKSTRA">Dijkstra</option>
                  <option value="ASTAR">A* Geodesic</option>
                  <option value="BFS">BFS</option>
                  <option value="DFS">DFS</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Metric</label>
                <select
                  value={defaultMetric}
                  onChange={(e) =>
                    onSavePreferences(
                      defaultAlgorithm,
                      e.target.value as OptimizationMetric,
                      defaultRoutingProfile,
                      walkingSpeedMps
                    )
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white"
                >
                  <option value="DISTANCE">DISTANCE</option>
                  <option value="TIME">TIME</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Travel Mode</label>
                <select
                  value={defaultRoutingProfile}
                  onChange={(e) =>
                    onSavePreferences(
                      defaultAlgorithm,
                      defaultMetric,
                      e.target.value as RoutingProfile,
                      walkingSpeedMps
                    )
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white"
                >
                  <option value="WALKING">WALKING</option>
                  <option value="BICYCLE">BICYCLE</option>
                  <option value="VEHICLE">VEHICLE</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Walk Speed (m/s)</label>
                <input
                  type="number"
                  min={0.6}
                  max={3.0}
                  step={0.1}
                  value={walkingSpeedMps}
                  onChange={(e) =>
                    onSavePreferences(
                      defaultAlgorithm,
                      defaultMetric,
                      defaultRoutingProfile,
                      parseFloat(e.target.value) || 1.4
                    )
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white font-mono"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Reset all local customizations to baseline VFSTR snapshot:
            </span>
            <button
              type="button"
              onClick={onResetAllData}
              className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Factory Reset</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
