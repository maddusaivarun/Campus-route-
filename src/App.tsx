import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  OptimizationMetric,
  EmergencyVehicleType,
  RoadStatus,
  RoutingProfile,
  CampusGraph,
} from './graph/Graph';
import {
  BASELINE_VFSTR_OVERPASS_SNAPSHOT,
  CampusBuildingEntry,
  IncidentRecord,
  IncidentVerificationStatus,
  AdminCustomPathway,
} from './data/campusData';
import { extractGraphFromOverpassData, RawOverpassResponse } from './graph/osmGraphExtractor';
import {
  fetchVFSTROverpassData,
  OverpassFetchMeta,
  clearOverpassCache,
} from './services/osmOverpassService';
import {
  loadPersistedBuildingDirectory,
  savePersistedBuildingDirectory,
  reconcileBuildingsWithOSM,
  BUILDING_DIR_STORAGE_KEY,
} from './services/buildingDirectoryService';
import {
  getGoogleMapsApiKey,
  discoverAndSyncVFSTRBlocksViaGooglePlaces,
  computeLiveGoogleRoutesBetweenLocations,
  syncGoogleRouteIntoCampusGraph,
  GooglePlaceDiscoveryResult,
  GoogleComputedRouteResult,
} from './services/googleMapsRealtimeService';
import {
  GpsPositionState,
  INITIAL_GPS_STATE,
  evaluateGpsPosition,
  mapGeolocationError,
  snapGpsToWalkableSegment,
} from './services/gpsService';
import {
  LiveWalkNavigationStatus,
  INITIAL_OFF_ROUTE_STATE,
  OffRouteEvaluationState,
  computeLiveNavigationProgress,
  evaluateOffRouteAndDebounce,
} from './services/liveTurnByTurnNavigator';
import {
  AuthSessionState,
  subscribeToAuthChanges,
  subscribeToCampusFirestoreData,
  signInWithGooglePopup,
  signOutUser,
  saveCampusBuildingToFirestore,
  saveCampusPathwayToFirestore,
  createCampusIncidentInFirestore,
  updateIncidentStatusInFirestore,
  saveUserPreferencesToFirestore,
} from './services/firebaseService';
import { Sidebar, NavigationTabId } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { OverviewView } from './views/OverviewView';
import { LiveNavigationView } from './views/LiveNavigationView';
import { TrafficControlView } from './views/TrafficControlView';
import { EmergencyResponseView } from './views/EmergencyResponseView';
import { RouteComparisonView } from './views/RouteComparisonView';
import { DSAVisualizerView } from './views/DSAVisualizerView';
import { AnalyticsView } from './views/AnalyticsView';
import { SettingsView } from './views/SettingsView';
import { RoutingEngine, RoutingAlgorithmType } from './services/routingEngine';
import {
  TrafficEngine,
  LiveTrafficTickEvent,
  SimulationIntensity,
} from './services/trafficEngine';
import {
  StorageService,
  RouteHistoryEntry,
  EmergencyDispatchLog,
} from './services/storageService';
import { AnalyticsService } from './services/analyticsService';

interface GoogleMapsRealtimeSyncBridgeProps {
  graph: CampusGraph;
  rawBuildings: CampusBuildingEntry[];
  sourceBuilding: CampusBuildingEntry;
  targetBuilding: CampusBuildingEntry;
  sourceId: string;
  targetId: string;
  routingProfile: RoutingProfile;
  emergencyMode: boolean;
  syncTrigger: number;
  forceSyncRef: React.MutableRefObject<boolean>;
  onPlacesSynced: (updatedBuildings: CampusBuildingEntry[], syncedCount: number) => void;
  onSyncStateChange: (isSyncing: boolean) => void;
  onGoogleRoutesComputed: (routes: GoogleComputedRouteResult[]) => void;
}

const GoogleMapsRealtimeSyncBridge: React.FC<GoogleMapsRealtimeSyncBridgeProps> = ({
  graph,
  rawBuildings,
  sourceBuilding,
  targetBuilding,
  sourceId,
  targetId,
  routingProfile,
  emergencyMode,
  syncTrigger,
  forceSyncRef,
  onPlacesSynced,
  onSyncStateChange,
  onGoogleRoutesComputed,
}) => {
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');
  const hasInitialPlacesSyncedRef = useRef(false);

  // 1. Live Google Places API (New) Discovery & Sync for all VFSTR Campus Blocks
  useEffect(() => {
    if (!placesLib) return;
    if (hasInitialPlacesSyncedRef.current && syncTrigger === 0) return;

    let cancelled = false;
    const isForce = forceSyncRef.current;
    forceSyncRef.current = false;
    hasInitialPlacesSyncedRef.current = true;

    onSyncStateChange(true);
    discoverAndSyncVFSTRBlocksViaGooglePlaces(placesLib, rawBuildings, isForce)
      .then(({ updatedBuildings, syncedCount }) => {
        if (cancelled) return;
        onPlacesSynced(updatedBuildings, syncedCount);
      })
      .finally(() => {
        if (!cancelled) onSyncStateChange(false);
      });

    return () => {
      cancelled = true;
    };
  }, [placesLib, syncTrigger]);

  // 2. Live Google Routes API (Route.computeRoutes) between selected Origin and Destination Blocks
  useEffect(() => {
    if (!routesLib || !sourceBuilding || !targetBuilding || sourceId === targetId) return;

    let cancelled = false;
    computeLiveGoogleRoutesBetweenLocations(
      routesLib,
      {
        lat: sourceBuilding.lat,
        lng: sourceBuilding.lng,
      },
      {
        lat: targetBuilding.lat,
        lng: targetBuilding.lng,
      },
      routingProfile,
      emergencyMode
    ).then((routes) => {
      if (cancelled || routes.length === 0) return;
      syncGoogleRouteIntoCampusGraph(graph, sourceId, targetId, routes[0]);
      onGoogleRoutesComputed(routes);
    });

    return () => {
      cancelled = true;
    };
  }, [
    routesLib,
    graph,
    sourceBuilding?.id,
    sourceBuilding?.lat,
    sourceBuilding?.lng,
    targetBuilding?.id,
    targetBuilding?.lat,
    targetBuilding?.lng,
    sourceId,
    targetId,
    routingProfile,
    emergencyMode,
  ]);

  return null;
};

export default function App() {
  const initialPersisted = useMemo(() => StorageService.loadState(), []);
  const googleMapsApiKey = useMemo(() => getGoogleMapsApiKey(), []);

  // Quota Exceeded State (Section 8 Case A Demo Key Quota Handling)
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  useEffect(() => {
    const handler = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Firebase Auth Session State
  const [authSession, setAuthSession] = useState<AuthSessionState>({
    isReady: false,
    user: null,
    isAdmin: false,
    error: null,
  });

  useEffect(() => {
    const unsub = subscribeToAuthChanges((session) => {
      setAuthSession(session);
      if (session.isAdmin) {
        setAdminMode(true);
      }
    });
    return () => unsub();
  }, []);

  // Navigation & Admin State
  const [activeTab, setActiveTab] = useState<NavigationTabId>('navigation');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [adminMode, setAdminMode] = useState<boolean>(false);

  // Overpass OSM Raw Data & Metadata State
  const [overpassRaw, setOverpassRaw] = useState<RawOverpassResponse>(
    BASELINE_VFSTR_OVERPASS_SNAPSHOT as RawOverpassResponse
  );
  const [osmMeta, setOsmMeta] = useState<OverpassFetchMeta>({
    source: 'VERIFIED_BASELINE_SNAPSHOT',
    fetchedAt: new Date().toISOString(),
    endpointUsed: 'Google Maps Platform Live Places & Routes + VFSTR Baseline',
    elementCount: BASELINE_VFSTR_OVERPASS_SNAPSHOT.elements.length,
    nodeCount: BASELINE_VFSTR_OVERPASS_SNAPSHOT.elements.filter((e) => e.type === 'node').length,
    wayCount: BASELINE_VFSTR_OVERPASS_SNAPSHOT.elements.filter((e) => e.type === 'way').length,
  });
  const [isRefreshingOSM, setIsRefreshingOSM] = useState<boolean>(false);

  // Google Maps Places & Routes Live Sync State
  const [isSyncingGoogleData, setIsSyncingGoogleData] = useState<boolean>(false);
  const [googlePlacesSyncTrigger, setGooglePlacesSyncTrigger] = useState<number>(0);
  const forceGoogleSyncRef = useRef<boolean>(false);
  const [liveGoogleRoutes, setLiveGoogleRoutes] = useState<GoogleComputedRouteResult[]>([]);

  // Buildings, Custom Pathways, and Incidents State
  const [rawBuildings, setRawBuildings] = useState<CampusBuildingEntry[]>(() =>
    loadPersistedBuildingDirectory()
  );
  const [adminPathways, setAdminPathways] = useState<AdminCustomPathway[]>(
    initialPersisted.adminPathways
  );
  const [incidents, setIncidents] = useState<IncidentRecord[]>(initialPersisted.incidents);
  const [graphVersion, setGraphVersion] = useState<number>(0);

  // Walking Speed & Routing State
  const [walkingSpeedMps, setWalkingSpeedMps] = useState<number>(1.4);

  // Optional Traffic Stress Testing State (OFF by default so real routing is never faked)
  const [liveSimActive, setLiveSimActive] = useState<boolean>(false);
  const [liveSimIntervalMs, setLiveSimIntervalMs] = useState<number>(5000);
  const [liveSimIntensity, setLiveSimIntensity] = useState<SimulationIntensity>('NORMAL');
  const [liveTrafficEvents, setLiveTrafficEvents] = useState<LiveTrafficTickEvent[]>([]);
  const [liveSimTickCount, setLiveSimTickCount] = useState<number>(0);
  const [dynamicRerouteBanner, setDynamicRerouteBanner] = useState<string | null>(null);

  // Extract Real Geographic Graph & OSM Building Polygons
  const extractedResult = useMemo(() => {
    const res = extractGraphFromOverpassData(overpassRaw, adminPathways);
    res.graph.setWalkingSpeedMps(walkingSpeedMps);
    TrafficEngine.syncIncidentsToGraph(res.graph, initialPersisted.incidents);
    return res;
  }, [overpassRaw, adminPathways, initialPersisted.incidents]);

  const graph = extractedResult.graph;
  const osmBuildings = extractedResult.osmBuildings;

  // Keep graph walking speed in sync when slider changes
  useEffect(() => {
    graph.setWalkingSpeedMps(walkingSpeedMps);
    setGraphVersion((v) => v + 1);
  }, [graph, walkingSpeedMps]);

  // Reconcile Building Directory with Google Places Coordinates & Graph Anchor Nodes
  const buildings = useMemo(
    () => reconcileBuildingsWithOSM(rawBuildings, osmBuildings, graph),
    [rawBuildings, osmBuildings, graph, graphVersion]
  );

  // Routing State (Default: Academic Block (A-Block) -> Girls Hostel)
  const [sourceId, setSourceId] = useState<string>(() => {
    const aBlock = buildings.find((b) => b.id === 'BLD_A_BLOCK') || buildings[0];
    return aBlock?.nearestNodeId || graph.getAllNodes()[0]?.id || 'OSM_N_1002';
  });
  const [targetId, setTargetId] = useState<string>(() => {
    const girlsHostel =
      buildings.find((b) => b.id === 'BLD_GIRLS_HOSTEL') ||
      buildings.find((b) => b.id === 'BLD_LIBRARY') ||
      buildings[3];
    return girlsHostel?.nearestNodeId || graph.getAllNodes()[3]?.id || 'OSM_N_1017';
  });

  const [algorithm, setAlgorithm] = useState<RoutingAlgorithmType>(
    initialPersisted.defaultAlgorithm
  );
  const [metric, setMetric] = useState<OptimizationMetric>(initialPersisted.defaultMetric);
  const [routingProfile, setRoutingProfile] = useState<RoutingProfile>(
    initialPersisted.defaultRoutingProfile
  );
  const [emergencyMode, setEmergencyMode] = useState<boolean>(false);
  const [emergencyVehicle, setEmergencyVehicle] = useState<EmergencyVehicleType>('AMBULANCE');

  // Browser Geolocation State
  const [gpsState, setGpsState] = useState<GpsPositionState>(INITIAL_GPS_STATE);
  const gpsWatchIdRef = useRef<number | null>(null);

  // Real-Time Walking Turn-by-Turn Navigation State
  const [liveNavStatus, setLiveNavStatus] = useState<LiveWalkNavigationStatus>('IDLE');
  const offRouteEvalRef = useRef<OffRouteEvaluationState>(INITIAL_OFF_ROUTE_STATE);
  const [autoRerouteCount, setAutoRerouteCount] = useState<number>(0);

  // Route & Emergency History Logs
  const [routeHistory, setRouteHistory] = useState<RouteHistoryEntry[]>(
    initialPersisted.routeHistory
  );
  const [dispatchLogs, setDispatchLogs] = useState<EmergencyDispatchLog[]>(
    initialPersisted.dispatchLogs
  );

  const prevRouteSignatureRef = useRef<string>('');
  const prevRouteTimeRef = useRef<number>(0);

  // Subscribe to Firestore Real-Time Collections when User is Authenticated
  useEffect(() => {
    if (!authSession.isReady || !authSession.user) return;
    const unsub = subscribeToCampusFirestoreData(authSession.user, {
      onBuildings: (cloudBuildings) => {
        setRawBuildings((prev) => {
          const mapById = new Map(prev.map((b) => [b.id, b]));
          for (const cb of cloudBuildings) {
            if (!cb.id) continue;
            const existing = mapById.get(cb.id);
            if (existing) {
              mapById.set(cb.id, {
                ...existing,
                ...cb,
                entrances: cb.entrances || existing.entrances,
              } as CampusBuildingEntry);
            } else {
              mapById.set(cb.id, cb as CampusBuildingEntry);
            }
          }
          const merged = Array.from(mapById.values());
          savePersistedBuildingDirectory(merged);
          return merged;
        });
        setGraphVersion((v) => v + 1);
      },
      onPathways: (cloudPathways) => {
        setAdminPathways(cloudPathways);
        StorageService.saveState({ adminPathways: cloudPathways });
        setGraphVersion((v) => v + 1);
      },
      onIncidents: (cloudIncidents) => {
        setIncidents(cloudIncidents);
        StorageService.saveState({ incidents: cloudIncidents });
        TrafficEngine.syncIncidentsToGraph(graph, cloudIncidents);
        setGraphVersion((v) => v + 1);
      },
      onUserPreferences: (prefs) => {
        setAlgorithm(prefs.defaultAlgorithm);
        setMetric(prefs.defaultMetric);
        setRoutingProfile(prefs.defaultRoutingProfile);
        setWalkingSpeedMps(prefs.walkingSpeedMps);
      },
    });
    return () => unsub();
  }, [authSession.isReady, authSession.user, graph]);

  // Query Overpass API on initial client mount
  const handleRefreshOSM = useCallback(async (forceRefresh: boolean = false) => {
    setIsRefreshingOSM(true);
    try {
      const { data, meta } = await fetchVFSTROverpassData(forceRefresh);
      setOverpassRaw(data);
      setOsmMeta(meta);
    } finally {
      setIsRefreshingOSM(false);
    }
  }, []);

  useEffect(() => {
    handleRefreshOSM(false);
  }, [handleRefreshOSM]);

  // Trigger Live Google Maps Places & Routes Re-Sync
  const handleSyncGoogleData = useCallback(() => {
    forceGoogleSyncRef.current = true;
    setGooglePlacesSyncTrigger((c) => c + 1);
  }, []);

  const handlePlacesSynced = useCallback(
    (updatedBuildings: CampusBuildingEntry[], syncedCount: number) => {
      if (syncedCount > 0) {
        setRawBuildings(updatedBuildings);
        savePersistedBuildingDirectory(updatedBuildings);
        setGraphVersion((v) => v + 1);
      }
    },
    []
  );

  const handleGoogleRoutesComputed = useCallback((routes: GoogleComputedRouteResult[]) => {
    setLiveGoogleRoutes(routes);
    setGraphVersion((v) => v + 1);
  }, []);

  // Snap any VFSTR Building to a Live Google Place
  const handleSnapBuildingToPlace = useCallback(
    (buildingId: string, place: GooglePlaceDiscoveryResult) => {
      setRawBuildings((prev) => {
        const updatedList = prev.map((b) => {
          if (b.id !== buildingId) return b;
          const updated: CampusBuildingEntry = {
            ...b,
            lat: place.lat,
            lng: place.lng,
            googlePlaceId: place.placeId,
            googleFormattedAddress: place.formattedAddress,
            googleRating: place.rating,
            googleUserRatingCount: place.userRatingCount,
            googleAttributions: place.attributions,
            dataSource: 'GOOGLE_MAPS_PLACES',
            verificationStatus: 'GOOGLE_PLACES_VERIFIED',
            lastVerifiedAt: new Date().toISOString().slice(0, 10),
            entrances: [{ label: `${b.shortName} Main Entrance`, lat: place.lat, lng: place.lng }],
          };
          if (authSession.isAdmin) {
            saveCampusBuildingToFirestore(updated).catch(() => {});
          }
          return updated;
        });
        savePersistedBuildingDirectory(updatedList);
        return updatedList;
      });
      setGraphVersion((v) => v + 1);
    },
    [authSession.isAdmin]
  );

  // Ensure sourceId and targetId always point to valid graph nodes when graph updates
  useEffect(() => {
    const allNodes = graph.getAllNodes();
    if (allNodes.length === 0) return;
    if (!graph.getNode(sourceId)) {
      const firstBuildingNode = buildings[0]?.nearestNodeId || allNodes[0].id;
      setSourceId(firstBuildingNode);
    }
    if (!graph.getNode(targetId)) {
      const targetBuildingNode =
        buildings[8]?.nearestNodeId ||
        buildings[3]?.nearestNodeId ||
        allNodes[Math.min(1, allNodes.length - 1)].id;
      setTargetId(targetBuildingNode);
    }
  }, [graph, buildings, sourceId, targetId]);

  // Execute one step of the Optional Traffic Simulation
  const handleStepLiveTraffic = useCallback(() => {
    const tickResult = TrafficEngine.simulateDynamicTrafficTick(graph, liveSimIntensity);
    if (tickResult.events.length > 0) {
      setLiveTrafficEvents((prev) => [...tickResult.events, ...prev].slice(0, 35));
    }
    if (tickResult.newIncident) {
      setIncidents((prev) => [tickResult.newIncident!, ...prev].slice(0, 25));
    }
    setLiveSimTickCount((c) => c + 1);
    setGraphVersion((v) => v + 1);
  }, [graph, liveSimIntensity]);

  // Run the automatic interval timer only when liveSimActive is explicitly enabled
  useEffect(() => {
    if (!liveSimActive) return;
    const timer = setInterval(() => {
      handleStepLiveTraffic();
    }, liveSimIntervalMs);

    return () => clearInterval(timer);
  }, [liveSimActive, liveSimIntervalMs, handleStepLiveTraffic]);

  // Compute Active Shortest-Path Route
  const activeRoute = useMemo(() => {
    void graphVersion;
    void walkingSpeedMps;
    return RoutingEngine.computeRoute(graph, {
      sourceNodeId: sourceId,
      targetNodeId: targetId,
      algorithm,
      metric,
      routingProfile,
      emergencyMode,
      emergencyVehicle: emergencyMode ? emergencyVehicle : 'NONE',
    });
  }, [
    graph,
    sourceId,
    targetId,
    algorithm,
    metric,
    routingProfile,
    walkingSpeedMps,
    emergencyMode,
    emergencyVehicle,
    graphVersion,
    liveGoogleRoutes,
  ]);

  // Compute Live Turn-by-Turn Walking Navigation Telemetry
  const liveNavTelemetry = useMemo(() => {
    if (liveNavStatus === 'IDLE' || !activeRoute.found) return null;
    if (gpsState.lat !== null && gpsState.lng !== null) {
      return computeLiveNavigationProgress(
        activeRoute,
        gpsState.lat,
        gpsState.lng,
        gpsState.accuracyMeters,
        walkingSpeedMps,
        liveNavStatus
      );
    }
    // If waiting for first GPS fix, show full planned route metrics from origin
    const originPt = activeRoute.routeGeometry[0] || [16.23305, 80.55085];
    return computeLiveNavigationProgress(
      activeRoute,
      originPt[0],
      originPt[1],
      15,
      walkingSpeedMps,
      liveNavStatus
    );
  }, [
    liveNavStatus,
    activeRoute,
    gpsState.lat,
    gpsState.lng,
    gpsState.accuracyMeters,
    walkingSpeedMps,
  ]);

  // Continuous Off-Route Detection & Debounced Automatic Route Recalculation While Walking
  useEffect(() => {
    if (liveNavStatus !== 'ACTIVE' || !activeRoute.found) return;
    if (gpsState.lat === null || gpsState.lng === null) return;

    const decision = evaluateOffRouteAndDebounce(
      activeRoute,
      gpsState.lat,
      gpsState.lng,
      gpsState.accuracyMeters,
      offRouteEvalRef.current,
      Date.now()
    );
    offRouteEvalRef.current = decision.nextState;

    if (decision.shouldTriggerReroute) {
      const snap = snapGpsToWalkableSegment(
        graph,
        gpsState.lat,
        gpsState.lng,
        gpsState.accuracyMeters,
        routingProfile
      );
      if (snap && snap.snappedNodeId && snap.snappedNodeId !== sourceId) {
        setSourceId(snap.snappedNodeId);
        setAutoRerouteCount((c) => c + 1);
        setDynamicRerouteBanner(
          `Off-Route Detected (${decision.crossTrackDistanceMeters}m from planned path > ${decision.thresholdMeters}m threshold) — Automatically recalculated shortest route from ${snap.snappedRoadName || snap.snappedNodeId}.`
        );
      }
    }
  }, [
    liveNavStatus,
    activeRoute,
    gpsState.lat,
    gpsState.lng,
    gpsState.accuracyMeters,
    gpsState.timestamp,
    graph,
    routingProfile,
    sourceId,
  ]);

  // Detect Dynamic Rerouting when road conditions alter the optimal path
  useEffect(() => {
    if (!activeRoute.found) return;
    const newSig = activeRoute.nodePath.join('->');
    const prevSig = prevRouteSignatureRef.current;
    const prevTime = prevRouteTimeRef.current;

    if (
      prevSig &&
      prevSig !== newSig &&
      prevSig.split('->')[0] === activeRoute.nodePath[0] &&
      prevSig.split('->').slice(-1)[0] === activeRoute.nodePath.slice(-1)[0]
    ) {
      setDynamicRerouteBanner(
        `Dynamic Reroute Triggered: Corridor condition changed — switched to faster connected path (New ETA: ${activeRoute.totalTimeSeconds}s vs previous ${prevTime}s).`
      );
    }
    prevRouteSignatureRef.current = newSig;
    prevRouteTimeRef.current = activeRoute.totalTimeSeconds;
  }, [activeRoute]);

  // Persist Route Calculation History
  useEffect(() => {
    if (!activeRoute.found || sourceId === targetId) return;
    const srcBld = buildings.find((b) => b.nearestNodeId === sourceId);
    const tgtBld = buildings.find((b) => b.nearestNodeId === targetId);
    const srcName = srcBld?.shortName || graph.getNode(sourceId)?.name || sourceId;
    const tgtName = tgtBld?.shortName || graph.getNode(targetId)?.name || targetId;

    setRouteHistory((prev) => {
      const latest = prev[0];
      if (
        latest &&
        latest.sourceId === sourceId &&
        latest.targetId === targetId &&
        latest.algorithm === algorithm &&
        latest.routingProfile === routingProfile &&
        latest.timeSeconds === activeRoute.totalTimeSeconds
      ) {
        return prev;
      }

      const newEntry: RouteHistoryEntry = {
        id: `RT-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        sourceId,
        sourceName: srcName,
        targetId,
        targetName: tgtName,
        algorithm,
        metric,
        routingProfile,
        emergencyMode,
        emergencyVehicle: emergencyMode ? emergencyVehicle : 'NONE',
        distanceMeters: activeRoute.totalDistanceMeters,
        timeSeconds: activeRoute.totalTimeSeconds,
        visitedCount: activeRoute.visitedOrder.length,
      };

      const updated = [newEntry, ...prev].slice(0, 20);
      StorageService.saveState({ routeHistory: updated });
      return updated;
    });
  }, [
    activeRoute,
    sourceId,
    targetId,
    algorithm,
    metric,
    routingProfile,
    emergencyMode,
    emergencyVehicle,
    buildings,
    graph,
  ]);

  // Browser Geolocation Handlers (Continuous watchPosition with Walkable Segment Snapping)
  const handleStartGpsTracking = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsState({
        ...INITIAL_GPS_STATE,
        status: 'UNSUPPORTED',
        message: 'Browser Geolocation API is not supported in this browser.',
      });
      return;
    }

    setGpsState((prev) => ({
      ...prev,
      status: 'REQUESTING',
      message: 'Requesting live GPS location permission from browser...',
    }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const evaluated = evaluateGpsPosition(pos, true);
        setGpsState(evaluated);
        if (evaluated.lat !== null && evaluated.lng !== null) {
          const snapped = snapGpsToWalkableSegment(
            graph,
            evaluated.lat,
            evaluated.lng,
            evaluated.accuracyMeters,
            routingProfile
          );
          if (snapped && snapped.snappedNodeId) {
            setSourceId(snapped.snappedNodeId);
          }
        }
      },
      (err) => {
        setGpsState(mapGeolocationError(err));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    );

    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsState(evaluateGpsPosition(pos, true));
      },
      (err) => {
        setGpsState(mapGeolocationError(err));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 2000 }
    );
    gpsWatchIdRef.current = watchId;
  }, [graph, routingProfile]);

  const handleStopGpsTracking = useCallback(() => {
    if (
      gpsWatchIdRef.current !== null &&
      typeof navigator !== 'undefined' &&
      'geolocation' in navigator
    ) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    setGpsState((prev) => ({
      ...prev,
      status: 'IDLE',
      isTracking: false,
      message: 'Live GPS location tracking stopped.',
    }));
  }, []);

  useEffect(() => {
    return () => {
      if (
        gpsWatchIdRef.current !== null &&
        typeof navigator !== 'undefined' &&
        'geolocation' in navigator
      ) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
    };
  }, []);

  const handleUseGpsAsOrigin = useCallback(() => {
    if (gpsState.lat !== null && gpsState.lng !== null) {
      const snapped = snapGpsToWalkableSegment(
        graph,
        gpsState.lat,
        gpsState.lng,
        gpsState.accuracyMeters,
        routingProfile
      );
      if (snapped && snapped.snappedNodeId) {
        setSourceId(snapped.snappedNodeId);
      }
    }
  }, [gpsState.lat, gpsState.lng, gpsState.accuracyMeters, graph, routingProfile]);

  // Real-Time Walking Navigation Session Controls
  const handleStartLiveWalkNavigation = useCallback(() => {
    offRouteEvalRef.current = INITIAL_OFF_ROUTE_STATE;
    setAutoRerouteCount(0);
    setLiveNavStatus('ACTIVE');
    if (!gpsState.isTracking) {
      handleStartGpsTracking();
    } else if (gpsState.lat !== null && gpsState.lng !== null) {
      handleUseGpsAsOrigin();
    }
  }, [gpsState.isTracking, gpsState.lat, gpsState.lng, handleStartGpsTracking, handleUseGpsAsOrigin]);

  const handlePauseLiveWalkNavigation = useCallback(() => {
    setLiveNavStatus('PAUSED');
  }, []);

  const handleResumeLiveWalkNavigation = useCallback(() => {
    setLiveNavStatus('ACTIVE');
  }, []);

  const handleEndLiveWalkNavigation = useCallback(() => {
    setLiveNavStatus('IDLE');
    offRouteEvalRef.current = INITIAL_OFF_ROUTE_STATE;
    handleStopGpsTracking();
  }, [handleStopGpsTracking]);

  // Building Selection Handlers
  const handleSelectBuildingForRoute = (
    building: CampusBuildingEntry,
    role?: 'ORIGIN' | 'DESTINATION'
  ) => {
    const nodeId =
      building.nearestNodeId ||
      graph.findNearestNode(building.lat, building.lng)?.id ||
      sourceId;
    if (role === 'ORIGIN') {
      setSourceId(nodeId);
    } else if (role === 'DESTINATION') {
      setTargetId(nodeId);
    } else {
      if (nodeId === sourceId) return;
      setTargetId(nodeId);
    }
  };

  const handleSelectNodeFromMap = (nodeId: string, role: 'ORIGIN' | 'DESTINATION') => {
    if (role === 'ORIGIN') setSourceId(nodeId);
    else setTargetId(nodeId);
  };

  const handleSwapNodes = () => {
    setSourceId(targetId);
    setTargetId(sourceId);
  };

  // Traffic & Incident Handlers
  const handleUpdateEdgeCondition = (
    edgeId: string,
    updates: { congestionFactor?: number; status?: RoadStatus; incidentReport?: string }
  ) => {
    TrafficEngine.updateRoadEdge(graph, edgeId, updates);
    setGraphVersion((v) => v + 1);
  };

  const handleReportIncident = (params: {
    edgeId: string;
    type: IncidentRecord['type'];
    severity: IncidentRecord['severity'];
    title: string;
    description: string;
    reportedByRole: 'USER' | 'ADMIN';
    expiryMinutes: number;
  }) => {
    const newInc = TrafficEngine.createIncidentRecord({
      graph,
      ...params,
    });
    const updated = [newInc, ...incidents];
    setIncidents(updated);
    StorageService.saveState({ incidents: updated });
    TrafficEngine.syncIncidentsToGraph(graph, updated);
    setGraphVersion((v) => v + 1);

    if (authSession.user) {
      createCampusIncidentInFirestore(newInc, authSession.isAdmin).catch(() => {});
    }
  };

  const handleUpdateIncidentVerification = (
    incidentId: string,
    status: IncidentVerificationStatus
  ) => {
    const updated = incidents.map((inc) =>
      inc.id === incidentId
        ? {
            ...inc,
            verificationStatus: status,
            category:
              status === 'ADMIN_CONFIRMED' ? ('ADMIN_CONFIRMED' as const) : inc.category,
          }
        : inc
    );
    setIncidents(updated);
    StorageService.saveState({ incidents: updated });
    TrafficEngine.syncIncidentsToGraph(graph, updated);
    setGraphVersion((v) => v + 1);

    if (authSession.user) {
      updateIncidentStatusInFirestore(incidentId, status).catch(() => {});
    }
  };

  const handleTriggerScenario = (
    scenario:
      | 'CLEAR'
      | 'PEAK_CONVOCATION'
      | 'SPINE_CLOSURE'
      | 'HOSTEL_MEDICAL_ALERT'
      | 'RANDOM_STRESS'
  ) => {
    const result = TrafficEngine.applySimulationScenario(graph, scenario);
    if (scenario === 'CLEAR') {
      const nonSimulated = incidents.filter((i) => i.category !== 'SIMULATED_TRAFFIC');
      setIncidents(nonSimulated);
      setLiveTrafficEvents([]);
      setDynamicRerouteBanner(null);
      StorageService.saveState({ incidents: nonSimulated });
      TrafficEngine.syncIncidentsToGraph(graph, nonSimulated);
    } else if (result.createdIncidents.length > 0) {
      const updated = [...result.createdIncidents, ...incidents];
      setIncidents(updated);
      StorageService.saveState({ incidents: updated });
    }
    setGraphVersion((v) => v + 1);
  };

  const handleLogEmergencyDispatch = (
    logData: Omit<EmergencyDispatchLog, 'id' | 'timestamp'>
  ) => {
    const newLog: EmergencyDispatchLog = {
      ...logData,
      id: `DISP-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };
    const updated = [newLog, ...dispatchLogs].slice(0, 20);
    setDispatchLogs(updated);
    StorageService.saveState({ dispatchLogs: updated });
  };

  // Admin & Settings Handlers (Backed by Cloud Firestore when authenticated)
  const handleVerifyOrUpdateBuilding = (updatedBuilding: CampusBuildingEntry) => {
    const updatedList = rawBuildings.map((b) =>
      b.id === updatedBuilding.id ? updatedBuilding : b
    );
    setRawBuildings(updatedList);
    savePersistedBuildingDirectory(updatedList);
    setGraphVersion((v) => v + 1);

    if (authSession.isAdmin) {
      saveCampusBuildingToFirestore(updatedBuilding).catch(() => {});
    }
  };

  const handleAddCustomBuilding = (newBuilding: CampusBuildingEntry) => {
    const updatedList = [...rawBuildings, newBuilding];
    setRawBuildings(updatedList);
    savePersistedBuildingDirectory(updatedList);
    setGraphVersion((v) => v + 1);

    if (authSession.isAdmin) {
      saveCampusBuildingToFirestore(newBuilding).catch(() => {});
    }
  };

  const handleAddAdminPathway = (pathway: AdminCustomPathway) => {
    const updated = [...adminPathways, pathway];
    setAdminPathways(updated);
    StorageService.saveState({ adminPathways: updated });
    setGraphVersion((v) => v + 1);

    if (authSession.isAdmin) {
      saveCampusPathwayToFirestore(pathway).catch(() => {});
    }
  };

  const handleImportGeoJSON = (rawJson: string): { success: boolean; message: string } => {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
        return { success: false, message: 'Invalid GeoJSON: Expected a FeatureCollection.' };
      }

      let importedBuildings = 0;
      let importedPathways = 0;
      let skippedInvalid = 0;
      const nextBuildings = [...rawBuildings];
      const nextPathways = [...adminPathways];

      for (const feat of parsed.features) {
        const props = feat.properties || {};
        if (
          feat.geometry?.type === 'Point' &&
          Array.isArray(feat.geometry.coordinates) &&
          props.featureCategory === 'CAMPUS_BUILDING'
        ) {
          const [rawLng, rawLat] = feat.geometry.coordinates;
          const lat = Number(rawLat);
          const lng = Number(rawLng);
          if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            lat < -90 ||
            lat > 90 ||
            lng < -180 ||
            lng > 180
          ) {
            skippedInvalid++;
            continue;
          }
          const existingIdx = nextBuildings.findIndex((b) => b.id === props.id);
          const entry: CampusBuildingEntry = {
            id: props.id || `BLD_IMP_${Date.now()}_${importedBuildings}`,
            name: props.name || 'Imported Campus Building',
            shortName: props.shortName || props.name || 'Building',
            officialName: props.officialName || props.name || 'Imported Building',
            category: props.category || 'ACADEMIC',
            lat,
            lng,
            osmFeatureId: props.osmFeatureId || null,
            dataSource: 'ADMIN_VERIFIED',
            verificationStatus: 'ADMIN_VERIFIED',
            lastVerifiedAt: new Date().toISOString().slice(0, 10),
            surveyNumber: props.surveyNumber,
            description: props.description || 'Imported from Campus GeoJSON.',
            entrances: [{ label: 'Main Entrance', lat, lng }],
          };
          if (existingIdx >= 0) nextBuildings[existingIdx] = entry;
          else nextBuildings.push(entry);
          importedBuildings++;

          if (authSession.isAdmin) {
            saveCampusBuildingToFirestore(entry).catch(() => {});
          }
        } else if (
          feat.geometry?.type === 'LineString' &&
          Array.isArray(feat.geometry.coordinates) &&
          props.featureCategory === 'ADMIN_PATHWAY'
        ) {
          const coords: [number, number][] = [];
          for (const c of feat.geometry.coordinates) {
            const lng = Number(c[0]);
            const lat = Number(c[1]);
            if (
              Number.isFinite(lat) &&
              Number.isFinite(lng) &&
              lat >= -90 &&
              lat <= 90 &&
              lng >= -180 &&
              lng <= 180
            ) {
              coords.push([lat, lng]);
            }
          }
          if (coords.length >= 2) {
            const newPathway: AdminCustomPathway = {
              id: props.id || `ADM_IMP_${Date.now()}_${importedPathways}`,
              name: props.name || 'Imported Footpath',
              geometry: coords,
              highwayType: props.highwayType || 'footway',
              allowWalking: props.allowWalking ?? true,
              allowBicycle: props.allowBicycle ?? true,
              allowVehicle: props.allowVehicle ?? false,
              oneWay: props.oneWay ?? false,
              verifiedBy: props.verifiedBy || 'GeoJSON Import',
              createdAt: new Date().toISOString().slice(0, 10),
            };
            nextPathways.push(newPathway);
            importedPathways++;

            if (authSession.isAdmin) {
              saveCampusPathwayToFirestore(newPathway).catch(() => {});
            }
          } else {
            skippedInvalid++;
          }
        }
      }

      setRawBuildings(nextBuildings);
      savePersistedBuildingDirectory(nextBuildings);
      setAdminPathways(nextPathways);
      StorageService.saveState({ adminPathways: nextPathways });
      setGraphVersion((v) => v + 1);

      return {
        success: importedBuildings > 0 || importedPathways > 0,
        message: `Imported ${importedBuildings} buildings and ${importedPathways} custom pathways from GeoJSON${
          skippedInvalid > 0 ? ` (${skippedInvalid} invalid features rejected)` : ''
        }.`,
      };
    } catch (err) {
      return {
        success: false,
        message: `GeoJSON parse error: ${err instanceof Error ? err.message : 'Invalid JSON'}`,
      };
    }
  };

  const handleSavePreferences = (
    alg: RoutingAlgorithmType,
    met: OptimizationMetric,
    prof: RoutingProfile,
    speedMps: number = walkingSpeedMps
  ) => {
    const safeSpeed = Math.max(0.5, Math.min(3.5, speedMps));
    setAlgorithm(alg);
    setMetric(met);
    setRoutingProfile(prof);
    setWalkingSpeedMps(safeSpeed);
    StorageService.saveState({
      defaultAlgorithm: alg,
      defaultMetric: met,
      defaultRoutingProfile: prof,
    });
    if (authSession.user) {
      saveUserPreferencesToFirestore({
        defaultAlgorithm: alg,
        defaultMetric: met,
        defaultRoutingProfile: prof,
        walkingSpeedMps: safeSpeed,
      }).catch(() => {});
    }
  };

  const handleResetAllData = () => {
    clearOverpassCache();
    try {
      localStorage.removeItem(BUILDING_DIR_STORAGE_KEY);
      localStorage.removeItem('resqroute_vfstr_building_directory_v2');
      sessionStorage.removeItem('resqroute_gmp_live_places_cache_v1');
      sessionStorage.removeItem('resqroute_gmp_live_routes_cache_v1');
    } catch {
      // ignore
    }
    const defaults = StorageService.resetToDefaults();
    const freshBuildings = loadPersistedBuildingDirectory();
    setRawBuildings(freshBuildings);
    setAdminPathways(defaults.adminPathways);
    setIncidents(defaults.incidents);
    setLiveTrafficEvents([]);
    setDynamicRerouteBanner(null);
    setRouteHistory([]);
    setDispatchLogs([]);
    setEmergencyMode(false);
    setLiveNavStatus('IDLE');
    setWalkingSpeedMps(1.4);
    setAlgorithm(defaults.defaultAlgorithm);
    setMetric(defaults.defaultMetric);
    setRoutingProfile(defaults.defaultRoutingProfile);
    graph.resetAllConditions();
    setGraphVersion((v) => v + 1);
  };

  const networkSummary = useMemo(() => {
    void graphVersion;
    return AnalyticsService.getNetworkSummary(graph, buildings, incidents);
  }, [graph, buildings, incidents, graphVersion]);

  const sourceBuilding =
    buildings.find((b) => b.nearestNodeId === sourceId || b.id === sourceId) || buildings[0];
  const targetBuilding =
    buildings.find((b) => b.nearestNodeId === targetId || b.id === targetId) ||
    buildings[8] ||
    buildings[3];

  const activeIncidentsCount = incidents.filter(
    (i) => i.verificationStatus !== 'RESOLVED' && i.verificationStatus !== 'REJECTED'
  ).length;

  const googlePlacesSyncedCount = buildings.filter(
    (b) => b.dataSource === 'GOOGLE_MAPS_PLACES' || b.verificationStatus === 'GOOGLE_PLACES_VERIFIED'
  ).length;

  return (
    <APIProvider
      apiKey={googleMapsApiKey}
      libraries={['places', 'routes', 'marker', 'geometry']}
      language="en"
      region="IN"
    >
      <GoogleMapsRealtimeSyncBridge
        graph={graph}
        rawBuildings={rawBuildings}
        sourceBuilding={sourceBuilding}
        targetBuilding={targetBuilding}
        sourceId={sourceId}
        targetId={targetId}
        routingProfile={routingProfile}
        emergencyMode={emergencyMode}
        syncTrigger={googlePlacesSyncTrigger}
        forceSyncRef={forceGoogleSyncRef}
        onPlacesSynced={handlePlacesSynced}
        onSyncStateChange={setIsSyncingGoogleData}
        onGoogleRoutesComputed={handleGoogleRoutesComputed}
      />

      {/* Section 8 Case A Mandatory Demo Key Quota Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <div className="min-h-screen bg-[#070B14] text-slate-100 flex overflow-x-hidden font-sans">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          activeIncidentCount={activeIncidentsCount}
          emergencyActive={emergencyMode}
          adminMode={authSession.isAdmin || adminMode}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <TopNav
            activeTab={activeTab}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            emergencyMode={emergencyMode}
            onToggleEmergencyMode={() => setEmergencyMode((e) => !e)}
            onResetCampusNetwork={() => handleTriggerScenario('CLEAR')}
            networkHealthScore={networkSummary.networkHealthScore}
            activeIncidentsCount={activeIncidentsCount}
            onQuickNavigate={setActiveTab}
            osmMeta={osmMeta}
            onRefreshOSM={() => {
              handleRefreshOSM(true);
              handleSyncGoogleData();
            }}
            isRefreshingOSM={isRefreshingOSM || isSyncingGoogleData}
            gpsState={gpsState}
            onRequestGps={() => {
              handleStartGpsTracking();
              setActiveTab('navigation');
            }}
            adminMode={authSession.isAdmin || adminMode}
            onToggleAdminMode={() => setAdminMode((a) => !a)}
            liveSimActive={liveSimActive}
            onToggleLiveSim={() => setLiveSimActive((s) => !s)}
            onStepLiveSim={handleStepLiveTraffic}
            liveSimTickCount={liveSimTickCount}
            googleSyncedCount={googlePlacesSyncedCount || buildings.length}
            onSyncGoogleData={handleSyncGoogleData}
            isSyncingGoogle={isSyncingGoogleData}
          />

          <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
            {activeTab === 'overview' && (
              <OverviewView
                graph={graph}
                buildings={buildings}
                osmBuildings={osmBuildings}
                incidents={incidents}
                gpsState={gpsState}
                osmMeta={osmMeta}
                activeRoute={activeRoute}
                sourceBuilding={sourceBuilding}
                targetBuilding={targetBuilding}
                emergencyMode={emergencyMode}
                liveSimActive={liveSimActive}
                liveSimIntensity={liveSimIntensity}
                liveTrafficEvents={liveTrafficEvents}
                onToggleLiveSim={() => setLiveSimActive((s) => !s)}
                onStepLiveSim={handleStepLiveTraffic}
                onChangeSimIntensity={setLiveSimIntensity}
                onSelectBuildingForRoute={(b) => handleSelectBuildingForRoute(b)}
                onSnapBuildingToPlace={handleSnapBuildingToPlace}
                onNavigateTab={setActiveTab}
                onTriggerScenario={handleTriggerScenario}
              />
            )}

            {activeTab === 'navigation' && (
              <LiveNavigationView
                graph={graph}
                buildings={buildings}
                osmBuildings={osmBuildings}
                incidents={incidents}
                gpsState={gpsState}
                onStartGpsTracking={handleStartGpsTracking}
                onStopGpsTracking={handleStopGpsTracking}
                onUseGpsAsOrigin={handleUseGpsAsOrigin}
                sourceId={sourceId}
                targetId={targetId}
                algorithm={algorithm}
                metric={metric}
                routingProfile={routingProfile}
                walkingSpeedMps={walkingSpeedMps}
                onChangeWalkingSpeed={(s) =>
                  handleSavePreferences(algorithm, metric, routingProfile, s)
                }
                emergencyMode={emergencyMode}
                emergencyVehicle={emergencyVehicle}
                activeRoute={activeRoute}
                routeHistory={routeHistory}
                liveNavStatus={liveNavStatus}
                liveNavTelemetry={liveNavTelemetry}
                autoRerouteCount={autoRerouteCount}
                onStartLiveWalkNavigation={handleStartLiveWalkNavigation}
                onPauseLiveWalkNavigation={handlePauseLiveWalkNavigation}
                onResumeLiveWalkNavigation={handleResumeLiveWalkNavigation}
                onEndLiveWalkNavigation={handleEndLiveWalkNavigation}
                liveSimActive={liveSimActive}
                liveTrafficEvents={liveTrafficEvents}
                dynamicRerouteBanner={dynamicRerouteBanner}
                onToggleLiveSim={() => setLiveSimActive((s) => !s)}
                onStepLiveSim={handleStepLiveTraffic}
                onChangeSource={setSourceId}
                onChangeTarget={setTargetId}
                onSwapNodes={handleSwapNodes}
                onChangeAlgorithm={setAlgorithm}
                onChangeMetric={setMetric}
                onChangeRoutingProfile={setRoutingProfile}
                onSelectBuildingFromMap={handleSelectBuildingForRoute}
                onSelectNodeFromMap={handleSelectNodeFromMap}
                onSnapBuildingToPlace={handleSnapBuildingToPlace}
              />
            )}

            {activeTab === 'traffic' && (
              <TrafficControlView
                graph={graph}
                buildings={buildings}
                osmBuildings={osmBuildings}
                incidents={incidents}
                adminMode={authSession.isAdmin || adminMode}
                liveSimActive={liveSimActive}
                liveSimIntervalMs={liveSimIntervalMs}
                liveSimIntensity={liveSimIntensity}
                liveTrafficEvents={liveTrafficEvents}
                onToggleLiveSim={() => setLiveSimActive((s) => !s)}
                onStepLiveSim={handleStepLiveTraffic}
                onChangeSimInterval={setLiveSimIntervalMs}
                onChangeSimIntensity={setLiveSimIntensity}
                onUpdateEdgeCondition={handleUpdateEdgeCondition}
                onReportIncident={handleReportIncident}
                onUpdateIncidentVerification={handleUpdateIncidentVerification}
                onTriggerScenario={handleTriggerScenario}
              />
            )}

            {activeTab === 'emergency' && (
              <EmergencyResponseView
                graph={graph}
                buildings={buildings}
                osmBuildings={osmBuildings}
                incidents={incidents}
                sourceId={sourceId}
                targetId={targetId}
                emergencyMode={emergencyMode}
                emergencyVehicle={emergencyVehicle}
                dispatchLogs={dispatchLogs}
                onChangeSource={setSourceId}
                onChangeTarget={setTargetId}
                onToggleEmergencyMode={setEmergencyMode}
                onChangeVehicle={setEmergencyVehicle}
                onLogEmergencyDispatch={handleLogEmergencyDispatch}
              />
            )}

            {activeTab === 'comparison' && (
              <RouteComparisonView
                graph={graph}
                buildings={buildings}
                osmBuildings={osmBuildings}
                incidents={incidents}
                sourceId={sourceId}
                targetId={targetId}
                metric={metric}
                routingProfile={routingProfile}
                emergencyMode={emergencyMode}
                emergencyVehicle={emergencyVehicle}
                liveSimActive={liveSimActive}
                onToggleLiveSim={() => setLiveSimActive((s) => !s)}
                onStepLiveSim={handleStepLiveTraffic}
                onChangeSource={setSourceId}
                onChangeTarget={setTargetId}
                onChangeMetric={setMetric}
                onChangeRoutingProfile={setRoutingProfile}
              />
            )}

            {activeTab === 'visualizer' && (
              <DSAVisualizerView
                graph={graph}
                buildings={buildings}
                osmBuildings={osmBuildings}
                incidents={incidents}
                sourceId={sourceId}
                targetId={targetId}
                algorithm={algorithm}
                metric={metric}
                routingProfile={routingProfile}
                emergencyMode={emergencyMode}
                emergencyVehicle={emergencyVehicle}
                onChangeSource={setSourceId}
                onChangeTarget={setTargetId}
                onChangeAlgorithm={setAlgorithm}
                onChangeRoutingProfile={setRoutingProfile}
              />
            )}

            {activeTab === 'analytics' && (
              <AnalyticsView
                graph={graph}
                buildings={buildings}
                incidents={incidents}
                sourceId={sourceId}
                targetId={targetId}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                graph={graph}
                buildings={buildings}
                osmBuildings={osmBuildings}
                adminPathways={adminPathways}
                incidents={incidents}
                osmMeta={osmMeta}
                authSession={authSession}
                onSignInGoogle={() => {
                  signInWithGooglePopup().catch(() => {});
                }}
                onSignOutGoogle={() => {
                  signOutUser().catch(() => {});
                }}
                adminMode={adminMode}
                onToggleAdminMode={() => setAdminMode((a) => !a)}
                onRefreshOSM={() => {
                  handleRefreshOSM(true);
                  handleSyncGoogleData();
                }}
                isRefreshingOSM={isRefreshingOSM || isSyncingGoogleData}
                defaultAlgorithm={algorithm}
                defaultMetric={metric}
                defaultRoutingProfile={routingProfile}
                walkingSpeedMps={walkingSpeedMps}
                onSavePreferences={handleSavePreferences}
                onVerifyOrUpdateBuilding={handleVerifyOrUpdateBuilding}
                onAddCustomBuilding={handleAddCustomBuilding}
                onAddAdminPathway={handleAddAdminPathway}
                onToggleEdgeAccessibility={(edgeId, status) =>
                  handleUpdateEdgeCondition(edgeId, { status })
                }
                onImportGeoJSON={handleImportGeoJSON}
                onResetAllData={handleResetAllData}
              />
            )}
          </main>
        </div>
      </div>
    </APIProvider>
  );
}
