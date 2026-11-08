import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { CampusGraph, GraphEdge } from '../graph/Graph';
import { CampusBuildingEntry, IncidentRecord, VFSTR_CAMPUS_CENTER } from '../data/campusData';
import { ExtractedOSMBuilding } from '../graph/osmGraphExtractor';
import { GpsPositionState } from '../services/gpsService';
import {
  GoogleLivePlaceResult,
  searchPlacesOnVFSTRCampus,
} from '../services/googleMapsRealtimeService';
import {
  Navigation,
  Compass,
  Crosshair,
  Layers,
  ShieldCheck,
  AlertTriangle,
  Search,
  MapPin,
  Radio,
  ExternalLink,
} from 'lucide-react';

export interface CampusMapCanvasProps {
  graph: CampusGraph;
  buildings?: CampusBuildingEntry[];
  osmBuildings?: ExtractedOSMBuilding[];
  incidents?: IncidentRecord[];
  gpsState?: GpsPositionState;
  selectedSourceId?: string;
  selectedTargetId?: string;
  highlightedNodePath?: string[];
  highlightedEdgePath?: string[];
  routeGeometry?: [number, number][];
  remainingRouteGeometry?: [number, number][];
  secondaryNodePath?: string[];
  secondaryEdgePath?: string[];
  visitedNodes?: string[];
  frontierNodes?: string[];
  activeCurrentNode?: string | null;
  activeCurrentEdge?: string | null;
  emergencyMode?: boolean;
  onSelectNode?: (nodeId: string) => void;
  onSelectBuilding?: (building: CampusBuildingEntry, role?: 'ORIGIN' | 'DESTINATION') => void;
  onSelectEdge?: (edge: GraphEdge) => void;
  onMapCoordinateClick?: (lat: number, lng: number) => void;
  onSnapBuildingToPlace?: (buildingId: string, place: GoogleLivePlaceResult) => void;
  interactive?: boolean;
  compact?: boolean;
  showLegend?: boolean;
  fitRouteTrigger?: number;
  recenterGpsTrigger?: number;
}

/**
 * Imperative Google Maps overlay manager for Polylines (Active Google Route, Campus Corridors,
 * Secondary Comparison Routes), Building Footprints, GPS Accuracy Circle, and Live Google TrafficLayer.
 */
const GoogleMapImperativeOverlays: React.FC<{
  graph: CampusGraph;
  osmBuildings: ExtractedOSMBuilding[];
  gpsState?: GpsPositionState;
  highlightedEdgePath: string[];
  secondaryEdgePath: string[];
  routeGeometry: [number, number][];
  remainingRouteGeometry: [number, number][];
  activeCurrentEdge: string | null;
  emergencyMode: boolean;
  showRoadNetworkLayer: boolean;
  showBuildingFootprints: boolean;
  showGoogleTrafficLayer: boolean;
  compact: boolean;
  fitRouteTrigger: number;
  recenterGpsTrigger: number;
  onSelectEdge?: (edge: GraphEdge) => void;
}> = ({
  graph,
  osmBuildings,
  gpsState,
  highlightedEdgePath,
  secondaryEdgePath,
  routeGeometry,
  remainingRouteGeometry,
  activeCurrentEdge,
  emergencyMode,
  showRoadNetworkLayer,
  showBuildingFootprints,
  showGoogleTrafficLayer,
  compact,
  fitRouteTrigger,
  recenterGpsTrigger,
  onSelectEdge,
}) => {
  const map = useMap();
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);

  // Manage Live Google Maps TrafficLayer
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.TrafficLayer) return;

    if (showGoogleTrafficLayer) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = new google.maps.TrafficLayer();
      }
      trafficLayerRef.current.setMap(map);
    } else if (trafficLayerRef.current) {
      trafficLayerRef.current.setMap(null);
    }

    return () => {
      if (trafficLayerRef.current) {
        trafficLayerRef.current.setMap(null);
      }
    };
  }, [map, showGoogleTrafficLayer]);

  // Fit bounds when requested
  useEffect(() => {
    if (!map || fitRouteTrigger === 0 || typeof google === 'undefined') return;
    if (routeGeometry && routeGeometry.length >= 2) {
      const bounds = new google.maps.LatLngBounds();
      routeGeometry.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
      map.fitBounds(bounds, 48);
    }
  }, [map, fitRouteTrigger, routeGeometry]);

  // Recenter on live GPS position when requested
  useEffect(() => {
    if (!map || recenterGpsTrigger === 0) return;
    if (gpsState && gpsState.lat !== null && gpsState.lng !== null) {
      map.panTo({ lat: gpsState.lat, lng: gpsState.lng });
      map.setZoom(18);
    }
  }, [map, recenterGpsTrigger, gpsState]);

  // Render Polylines, Footprints, and GPS Circle on Google Map
  useEffect(() => {
    if (!map || typeof google === 'undefined') return;

    // Clean up previous overlays
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current = [];
    circlesRef.current.forEach((c) => c.setMap(null));
    circlesRef.current = [];

    const primarySet = new Set(highlightedEdgePath);
    const secondarySet = new Set(secondaryEdgePath);

    // 1. Optional Building Polygons
    if (showBuildingFootprints && osmBuildings.length > 0) {
      for (const bPoly of osmBuildings) {
        if (!bPoly.polygon || bPoly.polygon.length < 3) continue;
        const paths = bPoly.polygon.map(([lat, lng]) => ({ lat, lng }));
        const poly = new google.maps.Polygon({
          paths,
          strokeColor: '#0284c7',
          strokeOpacity: 0.75,
          strokeWeight: 1.5,
          fillColor: '#0ea5e9',
          fillOpacity: 0.16,
          map,
        });
        polygonsRef.current.push(poly);
      }
    }

    // 2. Campus Road & Corridor Graph Edges
    if (showRoadNetworkLayer) {
      const uniqueEdges = graph.getUniqueUndirectedEdges();
      for (const edge of uniqueEdges) {
        const reverseEdge = graph
          .getAllEdges()
          .find(
            (e) =>
              e.source === edge.target &&
              e.target === edge.source &&
              e.roadName === edge.roadName
          );

        const isPrimary =
          primarySet.has(edge.id) || (reverseEdge ? primarySet.has(reverseEdge.id) : false);
        const isSecondary =
          secondarySet.has(edge.id) || (reverseEdge ? secondarySet.has(reverseEdge.id) : false);
        const isActiveStep =
          activeCurrentEdge === edge.id ||
          (reverseEdge ? activeCurrentEdge === reverseEdge.id : false);

        const coords: [number, number][] =
          edge.geometry && edge.geometry.length >= 2
            ? edge.geometry
            : (() => {
                const s = graph.getNode(edge.source);
                const t = graph.getNode(edge.target);
                return s && t
                  ? [
                      [s.lat, s.lng],
                      [t.lat, t.lng],
                    ]
                  : [];
              })();

        if (coords.length < 2) continue;

        let strokeColor = '#475569';
        let strokeWeight = compact ? 3 : 4;
        let strokeOpacity = 0.72;
        let zIndex = 10;

        if (!edge.allowVehicle && edge.allowWalking) {
          strokeColor = '#0d9488';
          strokeWeight = 3;
        }

        if (edge.status === 'CLOSED') {
          strokeColor = '#f43f5e';
          strokeWeight = 5;
          strokeOpacity = 0.95;
          zIndex = 20;
        } else if (edge.status === 'ACCIDENT') {
          strokeColor = '#ef4444';
          strokeWeight = 5;
          strokeOpacity = 0.95;
          zIndex = 20;
        } else if (edge.status === 'CONGESTED' || edge.congestionFactor > 1.4) {
          strokeColor = '#f59e0b';
          strokeWeight = 4.5;
          strokeOpacity = 0.92;
          zIndex = 18;
        }

        if (isSecondary && !isPrimary) {
          strokeColor = '#a855f7';
          strokeWeight = 5.5;
          strokeOpacity = 0.95;
          zIndex = 30;
        }

        if (isPrimary) {
          strokeColor = emergencyMode ? '#ef4444' : '#06b6d4';
          strokeWeight = 6.5;
          strokeOpacity = 1.0;
          zIndex = 40;
        }

        if (isActiveStep) {
          strokeColor = '#10b981';
          strokeWeight = 7.5;
          strokeOpacity = 1.0;
          zIndex = 45;
        }

        const polyline = new google.maps.Polyline({
          path: coords.map(([lat, lng]) => ({ lat, lng })),
          geodesic: true,
          strokeColor,
          strokeOpacity,
          strokeWeight,
          zIndex,
          map,
        });

        if (onSelectEdge) {
          polyline.addListener('click', () => {
            onSelectEdge(edge);
          });
        }

        polylinesRef.current.push(polyline);
      }
    }

    // 3. Active Real-Time Google Route Polyline (High-contrast casing + bright core)
    if (routeGeometry && routeGeometry.length >= 2) {
      const pathLiteral = routeGeometry.map(([lat, lng]) => ({ lat, lng }));
      const routeColor = emergencyMode ? '#ef4444' : '#06b6d4';

      const casingLine = new google.maps.Polyline({
        path: pathLiteral,
        geodesic: true,
        strokeColor: '#020617',
        strokeOpacity: 0.85,
        strokeWeight: 10,
        zIndex: 50,
        map,
      });

      const mainLine = new google.maps.Polyline({
        path: pathLiteral,
        geodesic: true,
        strokeColor: routeColor,
        strokeOpacity: 1.0,
        strokeWeight: 5.5,
        zIndex: 55,
        map,
      });

      polylinesRef.current.push(casingLine, mainLine);
    }

    // 3b. Active Walking Navigation Remaining Route Highlight
    if (remainingRouteGeometry && remainingRouteGeometry.length >= 2) {
      const remLiteral = remainingRouteGeometry.map(([lat, lng]) => ({ lat, lng }));
      const remLine = new google.maps.Polyline({
        path: remLiteral,
        geodesic: true,
        strokeColor: '#10b981',
        strokeOpacity: 1.0,
        strokeWeight: 7,
        zIndex: 60,
        map,
      });
      polylinesRef.current.push(remLine);
    }

    // 4. Live GPS Accuracy Circle
    if (gpsState && gpsState.lat !== null && gpsState.lng !== null && gpsState.accuracyMeters) {
      const circle = new google.maps.Circle({
        center: { lat: gpsState.lat, lng: gpsState.lng },
        radius: gpsState.accuracyMeters,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.8,
        strokeWeight: 1.5,
        fillColor: '#60a5fa',
        fillOpacity: 0.18,
        map,
      });
      circlesRef.current.push(circle);
    }

    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      polygonsRef.current.forEach((p) => p.setMap(null));
      polygonsRef.current = [];
      circlesRef.current.forEach((c) => c.setMap(null));
      circlesRef.current = [];
    };
  }, [
    map,
    graph,
    osmBuildings,
    gpsState,
    highlightedEdgePath,
    secondaryEdgePath,
    routeGeometry,
    remainingRouteGeometry,
    activeCurrentEdge,
    emergencyMode,
    showRoadNetworkLayer,
    showBuildingFootprints,
    compact,
    onSelectEdge,
  ]);

  return null;
};

/**
 * Helper sub-component for imperative camera recentering, route fitting, and live Google Places search.
 */
const MapHeaderControls: React.FC<{
  cursorCoords: { lat: number; lng: number };
  mapTypeId: 'hybrid' | 'roadmap' | 'satellite' | 'terrain';
  setMapTypeId: React.Dispatch<React.SetStateAction<'hybrid' | 'roadmap' | 'satellite' | 'terrain'>>;
  showGoogleTrafficLayer: boolean;
  setShowGoogleTrafficLayer: React.Dispatch<React.SetStateAction<boolean>>;
  showRoadNetworkLayer: boolean;
  setShowRoadNetworkLayer: React.Dispatch<React.SetStateAction<boolean>>;
  routeGeometry: [number, number][];
  buildings: CampusBuildingEntry[];
  gpsState?: GpsPositionState;
  onSnapBuildingToPlace?: (buildingId: string, place: GoogleLivePlaceResult) => void;
  onSelectPlaceMarker: (place: GoogleLivePlaceResult | null) => void;
  compact: boolean;
}> = ({
  cursorCoords,
  mapTypeId,
  setMapTypeId,
  showGoogleTrafficLayer,
  setShowGoogleTrafficLayer,
  showRoadNetworkLayer,
  setShowRoadNetworkLayer,
  routeGeometry,
  buildings,
  gpsState,
  onSnapBuildingToPlace,
  onSelectPlaceMarker,
  compact,
}) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [placeResults, setPlaceResults] = useState<GoogleLivePlaceResult[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [snapTargetBuildingId, setSnapTargetBuildingId] = useState<string>(
    buildings[0]?.id || 'BLD_A_BLOCK'
  );

  const handleRecenterVFSTR = () => {
    if (!map) return;
    map.panTo({ lat: VFSTR_CAMPUS_CENTER.lat, lng: VFSTR_CAMPUS_CENTER.lng });
    map.setZoom(17);
  };

  const handleZoomToRoute = () => {
    if (!map || typeof google === 'undefined') return;
    if (routeGeometry.length >= 2) {
      const bounds = new google.maps.LatLngBounds();
      routeGeometry.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
      map.fitBounds(bounds, 48);
    } else {
      handleRecenterVFSTR();
    }
  };

  const handleSearchGooglePlaces = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placesLib || !searchQuery.trim()) return;
    setIsSearchingPlaces(true);
    try {
      const found = await searchPlacesOnVFSTRCampus(placesLib, searchQuery, 6);
      setPlaceResults(found);
      setShowSearchDropdown(true);
      if (found[0] && map) {
        map.panTo({ lat: found[0].lat, lng: found[0].lng });
        map.setZoom(18);
        onSelectPlaceMarker(found[0]);
      }
    } finally {
      setIsSearchingPlaces(false);
    }
  };

  return (
    <div className="z-20 flex flex-col bg-slate-950/95 border-b border-slate-800/90 text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <Compass className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="font-mono uppercase tracking-wider text-slate-200 font-semibold tabular-nums">
            GOOGLE MAPS LIVE • VFSTR ({cursorCoords.lat.toFixed(5)}°N, {cursorCoords.lng.toFixed(5)}°E)
          </span>
          <span className="hidden md:inline-block text-slate-600">•</span>
          <span className="hidden md:inline-flex items-center gap-1 text-emerald-400 font-mono text-[10px]">
            <ShieldCheck className="w-3 h-3" /> Places API (New) + Routes API + Live Traffic
          </span>
        </div>

        {/* Map Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowGoogleTrafficLayer((v) => !v)}
            className={`px-2 py-1 rounded text-[10px] font-mono border transition-colors ${
              showGoogleTrafficLayer
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
            title="Toggle Real-Time Google Maps Traffic Layer"
          >
            <Radio className="w-3 h-3 inline mr-1" />
            GOOGLE TRAFFIC
          </button>

          <button
            type="button"
            onClick={() => setShowRoadNetworkLayer((v) => !v)}
            className={`px-2 py-1 rounded text-[10px] font-mono border transition-colors ${
              showRoadNetworkLayer
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
            title="Toggle Campus Graph Corridors"
          >
            <Layers className="w-3 h-3 inline mr-1" />
            CORRIDORS
          </button>

          <button
            type="button"
            onClick={() =>
              setMapTypeId((prev) =>
                prev === 'hybrid'
                  ? 'roadmap'
                  : prev === 'roadmap'
                  ? 'satellite'
                  : 'hybrid'
              )
            }
            className="px-2 py-1 rounded text-[10px] font-mono bg-slate-900 border border-slate-800 text-slate-200 hover:text-white uppercase"
            title="Switch Google Maps Base Layer (Hybrid Satellite / Roadmap / Satellite)"
          >
            MAP: {mapTypeId}
          </button>

          {routeGeometry.length >= 2 && (
            <button
              type="button"
              onClick={handleZoomToRoute}
              className="px-2 py-1 rounded text-[10px] font-mono bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30"
              title="Zoom to Active Google Route"
            >
              <Navigation className="w-3 h-3 inline mr-1" />
              FIT ROUTE
            </button>
          )}

          <button
            type="button"
            onClick={handleRecenterVFSTR}
            className="px-2 py-1 rounded text-[10px] font-mono bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            title="Recenter on VFSTR Campus"
          >
            <Crosshair className="w-3 h-3 inline mr-1" />
            VFSTR
          </button>

          {gpsState && gpsState.lat !== null && gpsState.lng !== null && (
            <button
              type="button"
              onClick={() => {
                if (!map || gpsState.lat === null || gpsState.lng === null) return;
                map.panTo({ lat: gpsState.lat, lng: gpsState.lng });
                map.setZoom(18);
              }}
              className="px-2 py-1 rounded text-[10px] font-mono bg-blue-500/20 border border-blue-500/40 text-blue-300 hover:bg-blue-500/30"
              title="Recenter Map on Your Current GPS Position"
            >
              <MapPin className="w-3 h-3 inline mr-1" />
              MY GPS
            </button>
          )}
        </div>
      </div>

      {/* Live Google Places Search & Block Placement Bar */}
      {!compact && (
        <div className="relative px-3 py-1.5 bg-slate-900/90 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <form onSubmit={handleSearchGooglePlaces} className="flex items-center gap-1.5 flex-1 min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search live Google Places (e.g. 'U Block Vignan', 'NTR Vignan Library', 'Vignan Pharmacy')..."
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={isSearchingPlaces}
              className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-[11px] shrink-0 transition-colors cursor-pointer"
            >
              {isSearchingPlaces ? 'Querying...' : 'Google Search'}
            </button>
            {placeResults.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSearchDropdown((s) => !s)}
                className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[10px] font-mono shrink-0"
              >
                {showSearchDropdown ? 'Hide' : `Results (${placeResults.length})`}
              </button>
            )}
          </form>

          {showSearchDropdown && placeResults.length > 0 && (
            <div className="w-full mt-1.5 p-2 rounded bg-slate-950 border border-slate-800 shadow-xl space-y-1.5 max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between text-[10px] text-slate-400 pb-1 border-b border-slate-800">
                <span>LIVE GOOGLE PLACES API (NEW) RESULTS — CLICK TO VIEW OR SNAP BLOCK</span>
                {onSnapBuildingToPlace && (
                  <div className="flex items-center gap-1.5">
                    <span>Snap target:</span>
                    <select
                      value={snapTargetBuildingId}
                      onChange={(e) => setSnapTargetBuildingId(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-white"
                    >
                      {buildings.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.shortName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {placeResults.map((pl) => (
                <div
                  key={pl.placeId}
                  className="flex flex-wrap items-center justify-between gap-2 p-1.5 rounded bg-slate-900/90 hover:bg-slate-800/80 border border-slate-800/80"
                >
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => {
                      if (map) {
                        map.panTo({ lat: pl.lat, lng: pl.lng });
                        map.setZoom(18);
                      }
                      onSelectPlaceMarker(pl);
                    }}
                  >
                    <div className="text-xs font-semibold text-cyan-300 truncate">
                      {pl.displayName}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {pl.formattedAddress} •{' '}
                      <span className="font-mono text-slate-300">
                        {pl.lat.toFixed(5)}°N, {pl.lng.toFixed(5)}°E
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (map) {
                          map.panTo({ lat: pl.lat, lng: pl.lng });
                          map.setZoom(18);
                        }
                        onSelectPlaceMarker(pl);
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]"
                    >
                      Locate
                    </button>
                    {onSnapBuildingToPlace && (
                      <button
                        type="button"
                        onClick={() => {
                          onSnapBuildingToPlace(snapTargetBuildingId, pl);
                          setShowSearchDropdown(false);
                        }}
                        className="px-2 py-0.5 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white text-[10px] font-semibold"
                      >
                        Snap Block Here
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const CampusMapCanvas: React.FC<CampusMapCanvasProps> = ({
  graph,
  buildings = [],
  osmBuildings = [],
  incidents = [],
  gpsState,
  selectedSourceId,
  selectedTargetId,
  highlightedNodePath = [],
  highlightedEdgePath = [],
  routeGeometry = [],
  remainingRouteGeometry = [],
  secondaryEdgePath = [],
  visitedNodes = [],
  frontierNodes = [],
  activeCurrentNode = null,
  activeCurrentEdge = null,
  emergencyMode = false,
  onSelectNode,
  onSelectBuilding,
  onSelectEdge,
  onMapCoordinateClick,
  onSnapBuildingToPlace,
  compact = false,
  showLegend = true,
  fitRouteTrigger = 0,
  recenterGpsTrigger = 0,
}) => {
  const [mapTypeId, setMapTypeId] = useState<'hybrid' | 'roadmap' | 'satellite' | 'terrain'>('hybrid');
  const [showRoadNetworkLayer, setShowRoadNetworkLayer] = useState<boolean>(true);
  const [showBuildingFootprints] = useState<boolean>(false);
  const [showGoogleTrafficLayer, setShowGoogleTrafficLayer] = useState<boolean>(true);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number }>({
    lat: VFSTR_CAMPUS_CENTER.lat,
    lng: VFSTR_CAMPUS_CENTER.lng,
  });

  const [selectedBuildingInfo, setSelectedBuildingInfo] = useState<CampusBuildingEntry | null>(null);
  const [searchedPlaceMarker, setSearchedPlaceMarker] = useState<GoogleLivePlaceResult | null>(null);

  const visitedSet = new Set(visitedNodes);
  const frontierSet = new Set(frontierNodes);
  const nodePathSet = new Set(highlightedNodePath);

  const handleMapClick = useCallback(
    (ev: any) => {
      const latLng = ev?.detail?.latLng;
      if (!latLng) return;
      const lat = Number(latLng.lat.toFixed(6));
      const lng = Number(latLng.lng.toFixed(6));
      setCursorCoords({ lat, lng });

      if (onMapCoordinateClick) {
        onMapCoordinateClick(lat, lng);
      } else if (onSelectNode) {
        const nearest = graph.findNearestNode(lat, lng);
        if (nearest) {
          onSelectNode(nearest.id);
        }
      }
    },
    [graph, onMapCoordinateClick, onSelectNode]
  );

  return (
    <div className="relative w-full h-full bg-[#070B14] rounded-lg border border-slate-800/80 overflow-hidden select-none flex flex-col">
      <MapHeaderControls
        cursorCoords={cursorCoords}
        mapTypeId={mapTypeId}
        setMapTypeId={setMapTypeId}
        showGoogleTrafficLayer={showGoogleTrafficLayer}
        setShowGoogleTrafficLayer={setShowGoogleTrafficLayer}
        showRoadNetworkLayer={showRoadNetworkLayer}
        setShowRoadNetworkLayer={setShowRoadNetworkLayer}
        routeGeometry={routeGeometry}
        buildings={buildings}
        gpsState={gpsState}
        onSnapBuildingToPlace={onSnapBuildingToPlace}
        onSelectPlaceMarker={setSearchedPlaceMarker}
        compact={compact}
      />

      {/* Main Interactive Google Map Container */}
      <div className="relative flex-1 w-full min-h-[280px]">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={{ lat: VFSTR_CAMPUS_CENTER.lat, lng: VFSTR_CAMPUS_CENTER.lng }}
          defaultZoom={compact ? 16 : 17}
          mapTypeId={mapTypeId}
          gestureHandling="greedy"
          disableDefaultUI={false}
          streetViewControl={!compact}
          fullscreenControl={!compact}
          mapTypeControl={false}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          onClick={handleMapClick}
          style={{ width: '100%', height: '100%' }}
        >
          <GoogleMapImperativeOverlays
            graph={graph}
            osmBuildings={osmBuildings}
            gpsState={gpsState}
            highlightedEdgePath={highlightedEdgePath}
            secondaryEdgePath={secondaryEdgePath}
            routeGeometry={routeGeometry}
            remainingRouteGeometry={remainingRouteGeometry}
            activeCurrentEdge={activeCurrentEdge}
            emergencyMode={emergencyMode}
            showRoadNetworkLayer={showRoadNetworkLayer}
            showBuildingFootprints={showBuildingFootprints}
            showGoogleTrafficLayer={showGoogleTrafficLayer}
            compact={compact}
            fitRouteTrigger={fitRouteTrigger}
            recenterGpsTrigger={recenterGpsTrigger}
            onSelectEdge={onSelectEdge}
          />

          {/* Render DSA Algorithm Exploration Nodes when Visualizer or Path is Active */}
          {graph.getAllNodes().map((node) => {
            const isVisited = visitedSet.has(node.id);
            const isFrontier = frontierSet.has(node.id);
            const isCurrent = activeCurrentNode === node.id;
            const isInPath = nodePathSet.has(node.id);

            // Skip nodes that already have a building marker unless DSA visualizer is actively highlighting them
            if (node.buildingId && !isVisited && !isFrontier && !isCurrent) {
              return null;
            }
            if (!isVisited && !isFrontier && !isCurrent && !isInPath) {
              return null;
            }

            const dotColor = isCurrent
              ? '#22c55e'
              : isFrontier
              ? '#f59e0b'
              : isVisited
              ? '#38bdf8'
              : '#06b6d4';

            return (
              <AdvancedMarker
                key={`node-${node.id}`}
                position={{ lat: node.lat, lng: node.lng }}
                title={`${node.name} (${node.lat.toFixed(5)}, ${node.lng.toFixed(5)})`}
                onClick={() => {
                  if (onSelectNode) onSelectNode(node.id);
                }}
              >
                <div
                  style={{
                    width: isCurrent ? 16 : 11,
                    height: isCurrent ? 16 : 11,
                    borderRadius: '50%',
                    background: dotColor,
                    border: '2px solid #ffffff',
                    boxShadow: '0 0 8px rgba(0,0,0,0.7)',
                  }}
                />
              </AdvancedMarker>
            );
          })}

          {/* Render VFSTR Campus Building AdvancedMarkers */}
          {buildings.map((b) => {
            const nearestNode = b.nearestNodeId
              ? graph.getNode(b.nearestNodeId)
              : graph.findNearestNode(b.lat, b.lng);
            const isSource =
              (nearestNode && nearestNode.id === selectedSourceId) || b.id === selectedSourceId;
            const isTarget =
              (nearestNode && nearestNode.id === selectedTargetId) || b.id === selectedTargetId;

            const borderCol = isSource
              ? '#10b981'
              : isTarget
              ? '#f43f5e'
              : b.googlePlaceId
              ? '#06b6d4'
              : '#3b82f6';

            const bgCol = isSource
              ? '#064e3b'
              : isTarget
              ? '#881337'
              : '#0f172a';

            return (
              <AdvancedMarker
                key={b.id}
                position={{ lat: b.lat, lng: b.lng }}
                title={`${b.officialName} (${b.lat.toFixed(5)}°N, ${b.lng.toFixed(5)}°E)`}
                onClick={() => {
                  setSelectedBuildingInfo(b);
                  if (onSelectBuilding) {
                    onSelectBuilding(b);
                  } else if (onSelectNode && nearestNode) {
                    onSelectNode(nearestNode.id);
                  }
                }}
              >
                <div
                  className="flex flex-col items-center cursor-pointer group"
                  style={{ transform: 'translateY(-4px)' }}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: bgCol,
                      border: `2px solid ${borderCol}`,
                      color: '#f8fafc',
                      fontSize: '11px',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.65)',
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: borderCol,
                        display: 'inline-block',
                      }}
                    />
                    <span>{b.shortName}</span>
                    {isSource && (
                      <span className="ml-1 px-1 py-0.2 rounded bg-emerald-500/30 text-emerald-200 text-[9px] font-mono">
                        START
                      </span>
                    )}
                    {isTarget && (
                      <span className="ml-1 px-1 py-0.2 rounded bg-rose-500/30 text-rose-200 text-[9px] font-mono">
                        END
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderTop: `6px solid ${borderCol}`,
                    }}
                  />
                </div>
              </AdvancedMarker>
            );
          })}

          {/* Render Active Incident Markers */}
          {incidents
            .filter(
              (inc) =>
                inc.verificationStatus !== 'RESOLVED' && inc.verificationStatus !== 'REJECTED'
            )
            .map((inc) => {
              const badgeColor =
                inc.type === 'CLOSURE' || inc.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b';
              return (
                <AdvancedMarker
                  key={inc.id}
                  position={{ lat: inc.lat, lng: inc.lng }}
                  title={`${inc.title} — ${inc.roadName}`}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: badgeColor,
                      border: '2px solid #ffffff',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.65)',
                    }}
                  >
                    !
                  </div>
                </AdvancedMarker>
              );
            })}

          {/* Render Live GPS User Marker */}
          {gpsState && gpsState.lat !== null && gpsState.lng !== null && (
            <AdvancedMarker
              position={{ lat: gpsState.lat, lng: gpsState.lng }}
              title={`Your Live GPS Position (${gpsState.lat.toFixed(6)}, ${gpsState.lng.toFixed(6)})`}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#2563eb',
                  border: '3px solid #ffffff',
                  boxShadow: '0 0 12px rgba(37,99,235,0.9)',
                }}
              />
            </AdvancedMarker>
          )}

          {/* Render Searched Google Place Marker & InfoWindow */}
          {searchedPlaceMarker && (
            <>
              <AdvancedMarker
                position={{ lat: searchedPlaceMarker.lat, lng: searchedPlaceMarker.lng }}
                title={searchedPlaceMarker.displayName}
              >
                <div className="px-2 py-1 rounded bg-amber-500 text-slate-950 font-bold text-xs shadow-lg border border-white flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{searchedPlaceMarker.displayName}</span>
                </div>
              </AdvancedMarker>
              <InfoWindow
                position={{ lat: searchedPlaceMarker.lat, lng: searchedPlaceMarker.lng }}
                onCloseClick={() => setSearchedPlaceMarker(null)}
              >
                <div className="text-slate-900 text-xs max-w-[240px] space-y-1 p-1">
                  <div className="font-bold text-sm">{searchedPlaceMarker.displayName}</div>
                  <div className="text-slate-600 text-[11px]">
                    {searchedPlaceMarker.formattedAddress}
                  </div>
                  <div className="font-mono text-[10px] text-slate-500">
                    {searchedPlaceMarker.lat.toFixed(6)}°N, {searchedPlaceMarker.lng.toFixed(6)}°E
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Google Place ID: <code>{searchedPlaceMarker.placeId}</code>
                  </div>
                </div>
              </InfoWindow>
            </>
          )}

          {/* Render Selected Building Google InfoWindow */}
          {selectedBuildingInfo && (
            <InfoWindow
              position={{ lat: selectedBuildingInfo.lat, lng: selectedBuildingInfo.lng }}
              onCloseClick={() => setSelectedBuildingInfo(null)}
            >
              <div className="text-slate-900 text-xs max-w-[260px] space-y-1.5 p-1 font-sans">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-slate-950">
                    {selectedBuildingInfo.officialName}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600">
                  {selectedBuildingInfo.googleFormattedAddress || selectedBuildingInfo.description}
                </div>
                <div className="font-mono text-[10px] text-slate-700 bg-slate-100 px-1.5 py-1 rounded">
                  WGS84: {selectedBuildingInfo.lat.toFixed(6)}°N,{' '}
                  {selectedBuildingInfo.lng.toFixed(6)}°E
                </div>
                {selectedBuildingInfo.googlePlaceId && (
                  <div className="text-[10px] text-emerald-700 font-medium">
                    Google Place ID: <code>{selectedBuildingInfo.googlePlaceId}</code>
                  </div>
                )}
                {selectedBuildingInfo.googleRating && (
                  <div className="text-[10px] text-amber-700 font-semibold">
                    Google Rating: ★ {selectedBuildingInfo.googleRating} (
                    {selectedBuildingInfo.googleUserRatingCount || 0} reviews)
                  </div>
                )}
                {selectedBuildingInfo.surveyNumber && (
                  <div className="text-[10px] text-slate-500">
                    Blueprint Ref: {selectedBuildingInfo.surveyNumber}
                  </div>
                )}
                {selectedBuildingInfo.googleAttributions &&
                  selectedBuildingInfo.googleAttributions.length > 0 && (
                    <div className="text-[9px] text-slate-400">
                      Attributions: {selectedBuildingInfo.googleAttributions.join(', ')}
                    </div>
                  )}
                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200">
                  {onSelectBuilding && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectBuilding(selectedBuildingInfo, 'ORIGIN');
                          setSelectedBuildingInfo(null);
                        }}
                        className="flex-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] cursor-pointer"
                      >
                        Set Origin
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectBuilding(selectedBuildingInfo, 'DESTINATION');
                          setSelectedBuildingInfo(null);
                        }}
                        className="flex-1 px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[10px] cursor-pointer"
                      >
                        Set Destination
                      </button>
                    </>
                  )}
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedBuildingInfo.lat},${selectedBuildingInfo.lng}${
                      selectedBuildingInfo.googlePlaceId
                        ? `&query_place_id=${selectedBuildingInfo.googlePlaceId}`
                        : ''
                    }`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-[10px] inline-flex items-center gap-0.5"
                    title="View on Google Maps"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>

        {/* Legend Overlay */}
        {showLegend && !compact && (
          <div className="absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-3 px-3 py-2 rounded-md bg-slate-950/90 border border-slate-800/90 backdrop-blur-md text-[11px] text-slate-300 pointer-events-none shadow-lg">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <span>Origin Block</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
              <span>Destination Block</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-1 rounded bg-cyan-400 inline-block" />
              <span>Google Route</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block" />
              <span>Google Places Verified</span>
            </div>
            {visitedNodes.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
                <span>DSA Explored ({visitedNodes.length})</span>
              </div>
            )}
          </div>
        )}

        {/* Emergency Priority Banner */}
        {emergencyMode && (
          <div className="absolute top-3 left-3 z-20 flex items-center gap-2 px-3 py-1.5 rounded bg-rose-950/95 border border-rose-500/60 text-rose-200 text-xs font-medium shadow-lg pointer-events-none">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
            <span>EMERGENCY ROUTE MODE — GOOGLE DRIVING CORRIDORS PRIORITIZED</span>
          </div>
        )}
      </div>
    </div>
  );
};
