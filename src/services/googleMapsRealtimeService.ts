import { CampusBuildingEntry, VFSTR_CAMPUS_CENTER } from '../data/campusData';
import { CampusGraph, RoutingProfile } from '../graph/Graph';
import { haversineDistanceMeters } from '../graph/geodesic';

export interface GoogleLivePlaceResult {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  rating: number | null;
  userRatingCount: number | null;
  types: string[];
  attributions: string[];
}

export interface GoogleLiveRouteStep {
  stepNumber: number;
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  path: [number, number][];
}

export interface GoogleLiveRouteOption {
  id: string;
  label: string;
  travelMode: 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TWO_WHEELER';
  distanceMeters: number;
  durationSeconds: number;
  path: [number, number][];
  steps: GoogleLiveRouteStep[];
  viewport?: google.maps.LatLngBounds | null;
  rawRoute?: any;
}

export type GooglePlaceDiscoveryResult = GoogleLivePlaceResult;
export type GoogleComputedRouteResult = GoogleLiveRouteOption;

const PLACES_SESSION_CACHE_KEY = 'resqroute_gmp_live_places_cache_v1';
const ROUTES_SESSION_CACHE_KEY = 'resqroute_gmp_live_routes_cache_v1';

/**
 * Helper to retrieve the provisioned Google Maps Platform API key from environment variables.
 */
export function getGoogleMapsApiKey(): string {
  const metaEnv = (import.meta as any).env || {};
  return (
    metaEnv.VITE_GOOGLE_MAPS_API_KEY ||
    metaEnv.GOOGLE_MAPS_API_KEY ||
    (typeof process !== 'undefined' &&
      (process.env?.VITE_GOOGLE_MAPS_API_KEY ||
        process.env?.GOOGLE_MAPS_API_KEY ||
        process.env?.GOOGLE_MAPS_PLATFORM_KEY)) ||
    (globalThis as any).GOOGLE_MAPS_API_KEY ||
    ''
  );
}

/**
 * Tier-2 Quota Exhaustion Detector for Places API (New) and Routes API promises.
 */
export function checkAndDispatchQuotaError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('OverQuotaMapError') ||
    msg.includes('QuotaExceededError')
  ) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }
}

/**
 * Extracts a clean { lat, lng } literal from a Google Maps LatLng or LatLngLiteral.
 */
function extractLatLng(loc: any): { lat: number; lng: number } | null {
  if (!loc) return null;
  const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat ?? loc.latitude);
  const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng ?? loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

/**
 * Converts a google.maps.places.Place instance into a serializable GoogleLivePlaceResult.
 */
function serializeGooglePlace(place: any): GoogleLivePlaceResult | null {
  const coords = extractLatLng(place?.location);
  if (!coords) return null;

  const attributions: string[] = Array.isArray(place.attributions)
    ? place.attributions
        .map((a: any) => (typeof a === 'string' ? a : a?.provider || ''))
        .filter(Boolean)
    : [];

  return {
    placeId: String(place.id || ''),
    displayName: String(place.displayName || 'VFSTR Campus Location'),
    formattedAddress: String(place.formattedAddress || 'Vadlamudi, Guntur, Andhra Pradesh 522213'),
    lat: coords.lat,
    lng: coords.lng,
    rating: typeof place.rating === 'number' ? place.rating : null,
    userRatingCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    types: Array.isArray(place.types) ? place.types : [],
    attributions,
  };
}

/**
 * Searches Google Maps Places API (New) via Place.searchByText for a user query biased to VFSTR Vadlamudi.
 */
export async function searchPlacesOnVFSTRCampus(
  placesLib: google.maps.PlacesLibrary,
  query: string,
  maxResultCount: number = 8
): Promise<GoogleLivePlaceResult[]> {
  if (!placesLib?.Place || !query.trim()) return [];
  try {
    const request: any = {
      textQuery: query.trim(),
      fields: [
        'id',
        'displayName',
        'location',
        'formattedAddress',
        'types',
        'rating',
        'userRatingCount',
      ],
      locationBias: {
        center: { lat: VFSTR_CAMPUS_CENTER.lat, lng: VFSTR_CAMPUS_CENTER.lng },
        radius: 2500,
      },
      maxResultCount,
      language: 'en',
      region: 'IN',
      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
    };

    const response = await (placesLib.Place as any).searchByText(request);
    const rawPlaces: any[] = response?.places || [];
    const results: GoogleLivePlaceResult[] = [];

    for (const p of rawPlaces) {
      const serialized = serializeGooglePlace(p);
      if (serialized) {
        results.push(serialized);
      }
    }
    return results;
  } catch (err) {
    checkAndDispatchQuotaError(err);
    return [];
  }
}

/**
 * Matches a CampusBuildingEntry against a list of discovered Google Places results.
 */
function findBestMatchingGooglePlace(
  building: CampusBuildingEntry,
  candidates: GoogleLivePlaceResult[]
): GoogleLivePlaceResult | null {
  const keywordsByBuildingId: Record<string, string[]> = {
    BLD_A_BLOCK: ['a block', 'a-block', 'administrative', 'admin', "vignan's foundation"],
    BLD_U_BLOCK: ['u block', 'u-block'],
    BLD_H_BLOCK: ['h block', 'h-block', 'engineering college'],
    BLD_LIBRARY: ['library', 'ntr', 'n.t.r'],
    BLD_N_BLOCK: ['n block', 'n-block', 'nagarjuna'],
    BLD_P_BLOCK: ['pharmacy', 'p block', 'p-block'],
    BLD_CANTEEN: ['canteen', 'cafeteria', 'mess', 'dining'],
    BLD_BOYS_HOSTEL: ['boys hostel', 'vignan vihar', 'mens hostel'],
    BLD_GIRLS_HOSTEL: ['girls hostel', 'priyadarshini', 'womens hostel'],
    BLD_GUEST_HOUSE: ['guest house', 'medical', 'dispensary', 'hospital'],
  };

  const kws = keywordsByBuildingId[building.id] || [
    building.shortName.toLowerCase(),
    building.officialName.toLowerCase(),
  ];

  for (const cand of candidates) {
    const distFromCenter = haversineDistanceMeters(
      VFSTR_CAMPUS_CENTER.lat,
      VFSTR_CAMPUS_CENTER.lng,
      cand.lat,
      cand.lng
    );
    // Keep only places within 2.5km of VFSTR Vadlamudi campus
    if (distFromCenter > 2500) continue;

    const hay = `${cand.displayName} ${cand.formattedAddress}`.toLowerCase();
    if (kws.some((k) => hay.includes(k))) {
      return cand;
    }
  }
  return null;
}

/**
 * Discovers and synchronizes VFSTR campus blocks using real-time Google Maps Places API (New)
 * (`Place.searchByText` & `Place.searchNearby`).
 * Caches resolved Place IDs and coordinates in sessionStorage to protect demo quota across re-renders.
 */
export async function discoverAndSyncVFSTRBlocksViaGooglePlaces(
  placesLib: google.maps.PlacesLibrary,
  currentBuildings: CampusBuildingEntry[],
  forceRefresh: boolean = false
): Promise<{
  updatedBuildings: CampusBuildingEntry[];
  discoveredPlaces: GoogleLivePlaceResult[];
  syncedCount: number;
}> {
  if (!placesLib?.Place) {
    return { updatedBuildings: currentBuildings, discoveredPlaces: [], syncedCount: 0 };
  }

  // Check session cache first unless forceRefresh is requested
  if (!forceRefresh && typeof sessionStorage !== 'undefined') {
    try {
      const cachedRaw = sessionStorage.getItem(PLACES_SESSION_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as {
          byBuildingId: Record<string, GoogleLivePlaceResult>;
          discoveredPlaces: GoogleLivePlaceResult[];
        };
        if (cached && cached.byBuildingId && Object.keys(cached.byBuildingId).length > 0) {
          let syncedCount = 0;
          const updatedBuildings = currentBuildings.map((b) => {
            const match = cached.byBuildingId[b.id];
            if (!match) return b;
            syncedCount++;
            return {
              ...b,
              lat: match.lat,
              lng: match.lng,
              googlePlaceId: match.placeId,
              googleFormattedAddress: match.formattedAddress,
              googleRating: match.rating,
              googleUserRatingCount: match.userRatingCount,
              googleAttributions: match.attributions,
              dataSource: 'GOOGLE_MAPS_PLACES' as const,
              verificationStatus: 'GOOGLE_PLACES_VERIFIED' as const,
              lastVerifiedAt: new Date().toISOString().slice(0, 10),
              entrances: [{ label: `${b.shortName} Main Entrance`, lat: match.lat, lng: match.lng }],
            };
          });
          return {
            updatedBuildings,
            discoveredPlaces: cached.discoveredPlaces || [],
            syncedCount,
          };
        }
      }
    } catch {
      // Proceed with live Google Places queries
    }
  }

  const allDiscovered: GoogleLivePlaceResult[] = [];
  const seenPlaceIds = new Set<string>();

  const addDiscovered = (items: GoogleLivePlaceResult[]) => {
    for (const item of items) {
      if (!seenPlaceIds.has(item.placeId)) {
        seenPlaceIds.add(item.placeId);
        allDiscovered.push(item);
      }
    }
  };

  // 1. Broad Campus Discovery via Place.searchByText
  const broadQueries = [
    "Vignan's Foundation for Science, Technology & Research Vadlamudi buildings",
    'Vignan University Vadlamudi Library Hostel Pharmacy Canteen Block',
  ];

  for (const q of broadQueries) {
    const res = await searchPlacesOnVFSTRCampus(placesLib, q, 20);
    addDiscovered(res);
  }

  // 2. Targeted Place.searchByText for each VFSTR block that has a specific Google search query
  const byBuildingId: Record<string, GoogleLivePlaceResult> = {};

  for (const b of currentBuildings) {
    let matched = findBestMatchingGooglePlace(b, allDiscovered);
    if (!matched && b.googleSearchQuery) {
      const specificResults = await searchPlacesOnVFSTRCampus(placesLib, b.googleSearchQuery, 5);
      addDiscovered(specificResults);
      matched =
        findBestMatchingGooglePlace(b, specificResults) ||
        specificResults.find(
          (cand) =>
            haversineDistanceMeters(
              VFSTR_CAMPUS_CENTER.lat,
              VFSTR_CAMPUS_CENTER.lng,
              cand.lat,
              cand.lng
            ) <= 2000
        ) ||
        null;
    }
    if (matched) {
      byBuildingId[b.id] = matched;
    }
  }

  // Prevent identical overlapping coordinates if multiple blocks matched the general university pin
  const usedCoords = new Set<string>();
  let syncedCount = 0;

  const updatedBuildings = currentBuildings.map((b) => {
    const match = byBuildingId[b.id];
    if (!match) return b;
    const coordKey = `${match.lat.toFixed(4)},${match.lng.toFixed(4)}`;
    // Only snap if this exact coordinate hasn't already been claimed by another block (except A-Block)
    const isDuplicateMainPin = usedCoords.has(coordKey) && b.id !== 'BLD_A_BLOCK';
    usedCoords.add(coordKey);

    syncedCount++;
    const finalLat = isDuplicateMainPin ? b.lat : match.lat;
    const finalLng = isDuplicateMainPin ? b.lng : match.lng;

    return {
      ...b,
      lat: finalLat,
      lng: finalLng,
      googlePlaceId: match.placeId,
      googleFormattedAddress: match.formattedAddress,
      googleRating: match.rating,
      googleUserRatingCount: match.userRatingCount,
      googleAttributions: match.attributions,
      dataSource: 'GOOGLE_MAPS_PLACES' as const,
      verificationStatus: 'GOOGLE_PLACES_VERIFIED' as const,
      lastVerifiedAt: new Date().toISOString().slice(0, 10),
      entrances: [{ label: `${b.shortName} Main Entrance`, lat: finalLat, lng: finalLng }],
    };
  });

  if (typeof sessionStorage !== 'undefined' && Object.keys(byBuildingId).length > 0) {
    try {
      sessionStorage.setItem(
        PLACES_SESSION_CACHE_KEY,
        JSON.stringify({
          byBuildingId,
          discoveredPlaces: allDiscovered,
        })
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  return {
    updatedBuildings,
    discoveredPlaces: allDiscovered,
    syncedCount,
  };
}

/**
 * Extracts an array of [lat, lng] coordinates from a Google Maps Route or RouteStep path.
 */
function extractPathCoordinates(pathArray: any): [number, number][] {
  if (!Array.isArray(pathArray)) return [];
  const coords: [number, number][] = [];
  for (const pt of pathArray) {
    const c = extractLatLng(pt);
    if (c) {
      coords.push([c.lat, c.lng]);
    }
  }
  return coords;
}

/**
 * Computes real-time routes between two VFSTR campus locations using the modern
 * Google Maps Routes API (`Route.computeRoutes` via `useMapsLibrary('routes')`).
 */
export async function computeLiveGoogleRoutesBetweenLocations(
  routesLib: google.maps.RoutesLibrary,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  routingProfile: RoutingProfile,
  emergencyMode: boolean = false
): Promise<GoogleLiveRouteOption[]> {
  if (!routesLib || !(routesLib as any).Route) return [];

  const primaryTravelMode: 'DRIVING' | 'WALKING' | 'BICYCLING' =
    emergencyMode || routingProfile === 'VEHICLE'
      ? 'DRIVING'
      : routingProfile === 'BICYCLE'
      ? 'BICYCLING'
      : 'WALKING';

  const cacheKey = `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}->${destination.lat.toFixed(
    5
  )},${destination.lng.toFixed(5)}::${primaryTravelMode}`;

  if (typeof sessionStorage !== 'undefined') {
    try {
      const rawCache = sessionStorage.getItem(ROUTES_SESSION_CACHE_KEY);
      if (rawCache) {
        const parsed = JSON.parse(rawCache) as Record<string, GoogleLiveRouteOption[]>;
        if (parsed[cacheKey] && parsed[cacheKey].length > 0) {
          return parsed[cacheKey];
        }
      }
    } catch {
      // Ignore cache read error
    }
  }

  const results: GoogleLiveRouteOption[] = [];

  try {
    const request: any = {
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      travelMode: primaryTravelMode,
      computeAlternativeRoutes: true,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
    };

    const response = await (routesLib as any).Route.computeRoutes(request);
    const routes: any[] = response?.routes || [];

    routes.forEach((r: any, idx: number) => {
      const pathCoords = extractPathCoordinates(r.path);
      const legs: any[] = r.legs || [];
      const steps: GoogleLiveRouteStep[] = [];

      if (legs.length > 0 && Array.isArray(legs[0].steps)) {
        legs[0].steps.forEach((st: any, sIdx: number) => {
          const stepPath = extractPathCoordinates(st.path);
          const startC =
            extractLatLng(st.startLocation) ||
            (stepPath.length > 0 ? { lat: stepPath[0][0], lng: stepPath[0][1] } : origin);
          const endC =
            extractLatLng(st.endLocation) ||
            (stepPath.length > 0
              ? { lat: stepPath[stepPath.length - 1][0], lng: stepPath[stepPath.length - 1][1] }
              : destination);

          steps.push({
            stepNumber: sIdx + 1,
            instruction:
              st.instructions ||
              st.navigationInstruction?.instructions ||
              `Proceed along campus route segment ${sIdx + 1}`,
            distanceMeters: Number(st.distanceMeters || 0),
            durationSeconds: Math.max(
              1,
              Math.round(Number(st.staticDurationMillis || st.durationMillis || 10000) / 1000)
            ),
            startLat: startC.lat,
            startLng: startC.lng,
            endLat: endC.lat,
            endLng: endC.lng,
            path:
              stepPath.length >= 2
                ? stepPath
                : [
                    [startC.lat, startC.lng],
                    [endC.lat, endC.lng],
                  ],
          });
        });
      }

      const fallbackDist = Math.round(
        haversineDistanceMeters(origin.lat, origin.lng, destination.lat, destination.lng)
      );
      const distanceMeters = Number(r.distanceMeters || legs[0]?.distanceMeters || fallbackDist);
      const durationMillis = Number(
        r.durationMillis || legs[0]?.durationMillis || (distanceMeters / 1.4) * 1000
      );

      results.push({
        id: `GMP_ROUTE_${primaryTravelMode}_${idx + 1}`,
        label:
          idx === 0
            ? `Google Maps Optimal (${primaryTravelMode})`
            : `Google Maps Alternative #${idx + 1} (${primaryTravelMode})`,
        travelMode: primaryTravelMode,
        distanceMeters,
        durationSeconds: Math.max(1, Math.round(durationMillis / 1000)),
        path:
          pathCoords.length >= 2
            ? pathCoords
            : [
                [origin.lat, origin.lng],
                [destination.lat, destination.lng],
              ],
        steps,
        viewport: r.viewport || null,
        rawRoute: r,
      });
    });

    if (typeof sessionStorage !== 'undefined' && results.length > 0) {
      try {
        const rawCache = sessionStorage.getItem(ROUTES_SESSION_CACHE_KEY);
        const parsed = rawCache ? JSON.parse(rawCache) : {};
        // Store serializable copy without rawRoute
        parsed[cacheKey] = results.map(({ rawRoute, viewport, ...serializable }) => serializable);
        sessionStorage.setItem(ROUTES_SESSION_CACHE_KEY, JSON.stringify(parsed));
      } catch {
        // Ignore storage error
      }
    }
  } catch (err) {
    checkAndDispatchQuotaError(err);
  }

  return results;
}

/**
 * Synchronizes a computed Google Maps Route (`GoogleLiveRouteOption`) into the `CampusGraph`
 * so that graph edges and corridors reflect the real Google Maps road geometry, distance, and duration.
 */
export function syncGoogleRouteIntoCampusGraph(
  graph: CampusGraph,
  sourceNodeId: string,
  targetNodeId: string,
  googleRoute: GoogleLiveRouteOption
): void {
  const srcNode = graph.getNode(sourceNodeId);
  const tgtNode = graph.getNode(targetNodeId);
  if (!srcNode || !tgtNode || googleRoute.path.length < 2) return;

  const forwardEdgeId = `GMP_LIVE_EDGE_${sourceNodeId}_${targetNodeId}`;
  const reverseEdgeId = `GMP_LIVE_EDGE_${targetNodeId}_${sourceNodeId}`;

  const existingForward = graph.getEdge(forwardEdgeId);
  const congestionFactor = existingForward ? existingForward.congestionFactor : 1.0;
  const status = existingForward ? existingForward.status : 'OPEN';

  const maxSpeedKmh =
    googleRoute.travelMode === 'DRIVING'
      ? 30
      : googleRoute.travelMode === 'BICYCLING'
      ? 16
      : 6;

  graph.addEdge({
    id: forwardEdgeId,
    source: sourceNodeId,
    target: targetNodeId,
    roadName: `Google Maps Route (${srcNode.shortLabel} → ${tgtNode.shortLabel})`,
    distanceMeters: Math.max(5, googleRoute.distanceMeters),
    baseTimeSeconds: Math.max(1, googleRoute.durationSeconds),
    maxSpeedKmh,
    highwayType: googleRoute.travelMode === 'WALKING' ? 'pedestrian' : 'service',
    allowWalking: true,
    allowBicycle: true,
    allowVehicle: true,
    oneWay: false,
    congestionFactor,
    status,
    geometry: googleRoute.path,
    provenance: 'GOOGLE_MAPS',
  });

  graph.addEdge({
    id: reverseEdgeId,
    source: targetNodeId,
    target: sourceNodeId,
    roadName: `Google Maps Route (${tgtNode.shortLabel} → ${srcNode.shortLabel})`,
    distanceMeters: Math.max(5, googleRoute.distanceMeters),
    baseTimeSeconds: Math.max(1, googleRoute.durationSeconds),
    maxSpeedKmh,
    highwayType: googleRoute.travelMode === 'WALKING' ? 'pedestrian' : 'service',
    allowWalking: true,
    allowBicycle: true,
    allowVehicle: true,
    oneWay: false,
    congestionFactor,
    status,
    geometry: [...googleRoute.path].reverse(),
    provenance: 'GOOGLE_MAPS',
  });
}
