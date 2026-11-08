import { VFSTR_CAMPUS_CENTER } from '../data/campusData';
import { haversineDistanceMeters } from '../graph/geodesic';
import {
  CampusGraph,
  RoutingProfile,
  isEdgeTraversableForProfile,
} from '../graph/Graph';

export type GpsTrackingStatus =
  | 'IDLE'
  | 'REQUESTING'
  | 'ACTIVE'
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNSUPPORTED';

export interface GpsPositionState {
  status: GpsTrackingStatus;
  lat: number | null;
  lng: number | null;
  accuracyMeters: number | null;
  headingDegrees: number | null;
  speedMps: number | null;
  timestamp: number | null;
  lastUpdatedFormatted: string | null;
  distanceFromCampusCenterMeters: number | null;
  isWithinCampus: boolean;
  isPoorAccuracy: boolean;
  message: string;
  isTracking: boolean;
}

export interface GpsSegmentSnapResult {
  snappedNodeId: string;
  snappedEdgeId: string | null;
  snappedRoadName: string | null;
  snappedLat: number;
  snappedLng: number;
  distanceToSegmentMeters: number;
  projectionFraction: number;
  isWithinSnapTolerance: boolean;
  accuracyAdjustedToleranceMeters: number;
}

export const INITIAL_GPS_STATE: GpsPositionState = {
  status: 'IDLE',
  lat: null,
  lng: null,
  accuracyMeters: null,
  headingDegrees: null,
  speedMps: null,
  timestamp: null,
  lastUpdatedFormatted: null,
  distanceFromCampusCenterMeters: null,
  isWithinCampus: false,
  isPoorAccuracy: false,
  message:
    'Location permission has not been requested yet. Grant permission to track your live walking position on VFSTR campus.',
  isTracking: false,
};

/**
 * Projects a geographic point P(lat, lng) onto a line segment AB(lat1, lng1 -> lat2, lng2)
 * using equirectangular local tangent plane approximation.
 */
export function projectPointOntoSegment(
  lat: number,
  lng: number,
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): {
  projectedLat: number;
  projectedLng: number;
  fraction: number;
  distanceMeters: number;
} {
  const cosLat = Math.cos(((lat1 + lat2) * 0.5 * Math.PI) / 180);
  const dx = (lng2 - lng1) * cosLat;
  const dy = lat2 - lat1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-14) {
    return {
      projectedLat: lat1,
      projectedLng: lng1,
      fraction: 0,
      distanceMeters: haversineDistanceMeters(lat, lng, lat1, lng1),
    };
  }

  const px = (lng - lng1) * cosLat;
  const py = lat - lat1;
  const rawT = (px * dx + py * dy) / lenSq;
  const fraction = Math.max(0, Math.min(1, rawT));

  const projectedLat = Number((lat1 + fraction * (lat2 - lat1)).toFixed(6));
  const projectedLng = Number((lng1 + fraction * (lng2 - lng1)).toFixed(6));
  const distanceMeters = haversineDistanceMeters(lat, lng, projectedLat, projectedLng);

  return {
    projectedLat,
    projectedLng,
    fraction,
    distanceMeters,
  };
}

/**
 * Snaps a live GPS coordinate to the nearest walkable/traversable graph edge segment,
 * accounting for GPS accuracy.
 */
export function snapGpsToWalkableSegment(
  graph: CampusGraph,
  lat: number,
  lng: number,
  accuracyMeters: number | null = 15,
  profile: RoutingProfile = 'WALKING'
): GpsSegmentSnapResult | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const edges = graph.getAllEdges();
  let bestEdgeId: string | null = null;
  let bestRoadName: string | null = null;
  let bestNodeId: string | null = null;
  let bestLat = lat;
  let bestLng = lng;
  let bestDist = Infinity;
  let bestFraction = 0;

  for (const edge of edges) {
    if (!isEdgeTraversableForProfile(edge, profile, false, 'NONE')) continue;

    const poly =
      edge.geometry && edge.geometry.length >= 2
        ? edge.geometry
        : (() => {
            const s = graph.getNode(edge.source);
            const t = graph.getNode(edge.target);
            return s && t
              ? ([
                  [s.lat, s.lng],
                  [t.lat, t.lng],
                ] as [number, number][])
              : [];
          })();

    for (let i = 0; i < poly.length - 1; i++) {
      const proj = projectPointOntoSegment(
        lat,
        lng,
        poly[i][0],
        poly[i][1],
        poly[i + 1][0],
        poly[i + 1][1]
      );

      if (proj.distanceMeters < bestDist) {
        bestDist = proj.distanceMeters;
        bestEdgeId = edge.id;
        bestRoadName = edge.roadName;
        bestLat = proj.projectedLat;
        bestLng = proj.projectedLng;
        bestFraction = proj.fraction;
        // Choose the closer endpoint of the edge for graph search origin
        const srcNode = graph.getNode(edge.source);
        const tgtNode = graph.getNode(edge.target);
        if (srcNode && tgtNode) {
          const dSrc = haversineDistanceMeters(bestLat, bestLng, srcNode.lat, srcNode.lng);
          const dTgt = haversineDistanceMeters(bestLat, bestLng, tgtNode.lat, tgtNode.lng);
          bestNodeId = dSrc <= dTgt ? srcNode.id : tgtNode.id;
        } else {
          bestNodeId = edge.source;
        }
      }
    }
  }

  if (!bestNodeId) {
    const fallbackNode = graph.findNearestNode(lat, lng, profile);
    if (!fallbackNode) return null;
    const dist = haversineDistanceMeters(lat, lng, fallbackNode.lat, fallbackNode.lng);
    const acc = Math.max(10, accuracyMeters ?? 15);
    const tolerance = Math.round(Math.max(120, acc * 2.5));
    return {
      snappedNodeId: fallbackNode.id,
      snappedEdgeId: null,
      snappedRoadName: fallbackNode.name,
      snappedLat: fallbackNode.lat,
      snappedLng: fallbackNode.lng,
      distanceToSegmentMeters: Math.round(dist),
      projectionFraction: 0,
      isWithinSnapTolerance: dist <= tolerance,
      accuracyAdjustedToleranceMeters: tolerance,
    };
  }

  const acc = Math.max(10, accuracyMeters ?? 15);
  const tolerance = Math.round(Math.max(120, acc * 2.5));

  return {
    snappedNodeId: bestNodeId,
    snappedEdgeId: bestEdgeId,
    snappedRoadName: bestRoadName,
    snappedLat: bestLat,
    snappedLng: bestLng,
    distanceToSegmentMeters: Math.round(bestDist),
    projectionFraction: Number(bestFraction.toFixed(3)),
    isWithinSnapTolerance: bestDist <= tolerance,
    accuracyAdjustedToleranceMeters: tolerance,
  };
}

/**
 * Evaluates a browser GeolocationPosition against the VFSTR campus reference coordinates.
 * Never fabricates or substitutes coordinates when GPS is unavailable.
 */
export function evaluateGpsPosition(
  pos: GeolocationPosition,
  isTracking: boolean
): GpsPositionState {
  const lat = Number(pos.coords.latitude.toFixed(6));
  const lng = Number(pos.coords.longitude.toFixed(6));
  const accuracy = Math.max(1, Math.round(pos.coords.accuracy));
  const distFromCenter = haversineDistanceMeters(
    lat,
    lng,
    VFSTR_CAMPUS_CENTER.lat,
    VFSTR_CAMPUS_CENTER.lng
  );

  const isWithinCampus = distFromCenter <= 1800;
  const isPoorAccuracy = accuracy > 65;
  const lastUpdatedFormatted = new Date(pos.timestamp || Date.now()).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  let message = '';
  if (isWithinCampus) {
    message = isPoorAccuracy
      ? `Live GPS active on VFSTR Campus, but signal accuracy is weak (±${accuracy}m). Move to an open sky area for tighter lock.`
      : `Live GPS locked on VFSTR Campus (±${accuracy}m accuracy, updated ${lastUpdatedFormatted}).`;
  } else {
    message = `Live GPS acquired at (${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E) — ${(
      distFromCenter / 1000
    ).toFixed(1)} km from VFSTR Vadlamudi (±${accuracy}m). Snaps to nearest campus entrance when routing.`;
  }

  return {
    status: 'ACTIVE',
    lat,
    lng,
    accuracyMeters: accuracy,
    headingDegrees: pos.coords.heading,
    speedMps: pos.coords.speed,
    timestamp: pos.timestamp,
    lastUpdatedFormatted,
    distanceFromCampusCenterMeters: Math.round(distFromCenter),
    isWithinCampus,
    isPoorAccuracy,
    isTracking,
    message,
  };
}

export function mapGeolocationError(err: GeolocationPositionError | { code: number; message?: string }): GpsPositionState {
  if (err.code === 1) {
    return {
      ...INITIAL_GPS_STATE,
      status: 'PERMISSION_DENIED',
      message:
        'Location permission denied by browser. Please allow location access in your browser site settings or choose a campus starting point manually.',
    };
  }
  if (err.code === 2) {
    return {
      ...INITIAL_GPS_STATE,
      status: 'POSITION_UNAVAILABLE',
      message:
        'Device GPS signal is unavailable (hardware/network location fix failed). No fake location was substituted — select a starting location manually or retry outdoors.',
    };
  }
  return {
    ...INITIAL_GPS_STATE,
    status: 'TIMEOUT',
    message:
      'Browser GPS fix timed out waiting for satellite lock. Retry in an open area or choose a mapped VFSTR building as your starting point.',
  };
}
