import { AlgorithmExecutionResult, RouteSegmentStep } from '../algorithms/dijkstra';
import { calculateBearingDegrees, haversineDistanceMeters } from '../graph/geodesic';
import { projectPointOntoSegment } from './gpsService';

export type LiveWalkNavigationStatus =
  | 'IDLE'
  | 'ACTIVE'
  | 'PAUSED'
  | 'REROUTING'
  | 'ARRIVED'
  | 'OFF_ROUTE_WARNING';

export interface LiveWalkNavigationTelemetry {
  status: LiveWalkNavigationStatus;
  snappedPosition: [number, number];
  traveledGeometry: [number, number][];
  remainingGeometry: [number, number][];
  traveledDistanceMeters: number;
  remainingDistanceMeters: number;
  totalDistanceMeters: number;
  progressPercent: number;
  headingDegrees: number;
  remainingTimeSeconds: number;
  estimatedArrivalTimeFormatted: string;
  currentStepIndex: number;
  currentRoadName: string;
  nextInstruction: string;
  distanceToNextTurnMeters: number;
  crossTrackDistanceMeters: number;
  offRouteThresholdMeters: number;
  isOffRoute: boolean;
  hasArrived: boolean;
}

export interface OffRouteEvaluationState {
  consecutiveOffRouteReadings: number;
  lastRerouteTimestampMs: number;
  rerouteCount: number;
}

export interface OffRouteDecision {
  isCurrentlyOffRoute: boolean;
  shouldTriggerReroute: boolean;
  crossTrackDistanceMeters: number;
  thresholdMeters: number;
  nextState: OffRouteEvaluationState;
  reason:
    | 'ON_ROUTE'
    | 'POOR_GPS_ACCURACY_IGNORED'
    | 'AWAITING_CONSECUTIVE_CONFIRMATION'
    | 'DEBOUNCE_COOLDOWN_ACTIVE'
    | 'TRIGGER_REROUTE';
}

export const INITIAL_OFF_ROUTE_STATE: OffRouteEvaluationState = {
  consecutiveOffRouteReadings: 0,
  lastRerouteTimestampMs: 0,
  rerouteCount: 0,
};

/**
 * Interpolates a precise [lat, lng] position and compass bearing along a polyline
 * given a traveled distance in meters (`targetDistanceMeters`).
 * Used for real-time continuous turn-by-turn motion along the Google Maps route.
 */
export function getPointAlongPolylineAtDistance(
  poly: [number, number][],
  targetDistanceMeters: number
): {
  lat: number;
  lng: number;
  headingDegrees: number;
  traveledMeters: number;
  totalMeters: number;
  hasReachedEnd: boolean;
} {
  if (!poly || poly.length === 0) {
    return {
      lat: 16.23285,
      lng: 80.55095,
      headingDegrees: 0,
      traveledMeters: 0,
      totalMeters: 0,
      hasReachedEnd: true,
    };
  }
  if (poly.length === 1) {
    return {
      lat: poly[0][0],
      lng: poly[0][1],
      headingDegrees: 0,
      traveledMeters: 0,
      totalMeters: 0,
      hasReachedEnd: true,
    };
  }

  const segLengths: number[] = [];
  let totalMeters = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const d = haversineDistanceMeters(
      poly[i][0],
      poly[i][1],
      poly[i + 1][0],
      poly[i + 1][1]
    );
    segLengths.push(d);
    totalMeters += d;
  }

  const clampedDist = Math.max(0, Math.min(totalMeters, targetDistanceMeters));
  if (clampedDist >= totalMeters - 0.5 || totalMeters <= 0.1) {
    const last = poly[poly.length - 1];
    const prev = poly[Math.max(0, poly.length - 2)];
    const heading = calculateBearingDegrees(prev[0], prev[1], last[0], last[1]);
    return {
      lat: last[0],
      lng: last[1],
      headingDegrees: heading,
      traveledMeters: totalMeters,
      totalMeters,
      hasReachedEnd: true,
    };
  }

  let acc = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i];
    if (acc + segLen >= clampedDist && segLen > 0.01) {
      const ratio = (clampedDist - acc) / segLen;
      const pA = poly[i];
      const pB = poly[i + 1];
      const lat = pA[0] + (pB[0] - pA[0]) * ratio;
      const lng = pA[1] + (pB[1] - pA[1]) * ratio;
      const heading = calculateBearingDegrees(pA[0], pA[1], pB[0], pB[1]);
      return {
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        headingDegrees: heading,
        traveledMeters: clampedDist,
        totalMeters,
        hasReachedEnd: false,
      };
    }
    acc += segLen;
  }

  const endPt = poly[poly.length - 1];
  return {
    lat: endPt[0],
    lng: endPt[1],
    headingDegrees: 0,
    traveledMeters: totalMeters,
    totalMeters,
    hasReachedEnd: true,
  };
}

/**
 * Evaluates a live coordinate (from real-time route navigator or browser GPS) against the active route geometry
 * to compute:
 * - Traveled polyline geometry behind the user
 * - Remaining polyline geometry ahead of the user
 * - Remaining distance (m), traveled distance (m), and progress percentage (0..100%)
 * - Live heading (compass bearing 0°–360°) for the directional Google Maps navigation arrow
 * - Next turn maneuver instruction and distance to the next turn (meters)
 * - Cross-track distance from the planned route
 */
export function computeLiveNavigationProgress(
  route: AlgorithmExecutionResult,
  gpsLat: number,
  gpsLng: number,
  accuracyMeters: number | null = 15,
  walkingSpeedMps: number = 1.4,
  currentStatus: LiveWalkNavigationStatus = 'ACTIVE'
): LiveWalkNavigationTelemetry {
  const safeSpeed = Math.max(0.5, Math.min(25, walkingSpeedMps || 1.4));
  const poly = route.routeGeometry;

  if (!route.found || poly.length === 0) {
    return {
      status: currentStatus,
      snappedPosition: [gpsLat, gpsLng],
      traveledGeometry: [],
      remainingGeometry: [],
      traveledDistanceMeters: 0,
      remainingDistanceMeters: 0,
      totalDistanceMeters: 0,
      progressPercent: 0,
      headingDegrees: 0,
      remainingTimeSeconds: 0,
      estimatedArrivalTimeFormatted: '--:--',
      currentStepIndex: 0,
      currentRoadName: 'No Active Route',
      nextInstruction: 'Select a valid destination to begin live navigation.',
      distanceToNextTurnMeters: 0,
      crossTrackDistanceMeters: 0,
      offRouteThresholdMeters: 30,
      isOffRoute: false,
      hasArrived: false,
    };
  }

  if (poly.length === 1) {
    const dist = Math.round(haversineDistanceMeters(gpsLat, gpsLng, poly[0][0], poly[0][1]));
    const hasArrived = dist <= 12;
    return {
      status: hasArrived ? 'ARRIVED' : currentStatus,
      snappedPosition: poly[0],
      traveledGeometry: [poly[0]],
      remainingGeometry: [[gpsLat, gpsLng], poly[0]],
      traveledDistanceMeters: 0,
      remainingDistanceMeters: dist,
      totalDistanceMeters: dist,
      progressPercent: hasArrived ? 100 : 0,
      headingDegrees: 0,
      remainingTimeSeconds: Math.round(dist / safeSpeed),
      estimatedArrivalTimeFormatted: new Date(
        Date.now() + Math.round(dist / safeSpeed) * 1000
      ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      currentStepIndex: 0,
      currentRoadName: 'Destination Reached',
      nextInstruction: 'You have arrived at your destination.',
      distanceToNextTurnMeters: 0,
      crossTrackDistanceMeters: dist,
      offRouteThresholdMeters: 30,
      isOffRoute: false,
      hasArrived,
    };
  }

  // 1. Find closest polyline segment [poly[i] -> poly[i+1]]
  let bestSegIdx = 0;
  let bestProjectedLat = poly[0][0];
  let bestProjectedLng = poly[0][1];
  let minCrossTrackDist = Infinity;

  for (let i = 0; i < poly.length - 1; i++) {
    const proj = projectPointOntoSegment(
      gpsLat,
      gpsLng,
      poly[i][0],
      poly[i][1],
      poly[i + 1][0],
      poly[i + 1][1]
    );
    if (proj.distanceMeters < minCrossTrackDist) {
      minCrossTrackDist = proj.distanceMeters;
      bestSegIdx = i;
      bestProjectedLat = proj.projectedLat;
      bestProjectedLng = proj.projectedLng;
    }
  }

  // 2. Build traveled and remaining route polylines
  const traveledGeometry: [number, number][] = [
    ...poly.slice(0, bestSegIdx + 1),
    [bestProjectedLat, bestProjectedLng],
  ];
  const remainingGeometry: [number, number][] = [
    [bestProjectedLat, bestProjectedLng],
    ...poly.slice(bestSegIdx + 1),
  ];

  // 3. Calculate exact traveled and remaining distances
  let traveledDist = 0;
  for (let i = 0; i < traveledGeometry.length - 1; i++) {
    traveledDist += haversineDistanceMeters(
      traveledGeometry[i][0],
      traveledGeometry[i][1],
      traveledGeometry[i + 1][0],
      traveledGeometry[i + 1][1]
    );
  }

  let remainingDist = 0;
  for (let i = 0; i < remainingGeometry.length - 1; i++) {
    remainingDist += haversineDistanceMeters(
      remainingGeometry[i][0],
      remainingGeometry[i][1],
      remainingGeometry[i + 1][0],
      remainingGeometry[i + 1][1]
    );
  }

  const traveledDistanceMeters = Math.round(traveledDist);
  const remainingDistanceMeters = Math.round(remainingDist);
  const totalDistanceMeters = Math.max(1, traveledDistanceMeters + remainingDistanceMeters);

  // Calculate live compass bearing along the current segment
  const segStart = poly[bestSegIdx];
  const segEnd = poly[Math.min(poly.length - 1, bestSegIdx + 1)];
  const headingDegrees = calculateBearingDegrees(
    segStart[0],
    segStart[1],
    segEnd[0],
    segEnd[1]
  );

  const remainingTimeSeconds = Math.max(0, Math.round(remainingDistanceMeters / safeSpeed));
  const etaDate = new Date(Date.now() + remainingTimeSeconds * 1000);
  const estimatedArrivalTimeFormatted = etaDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // 4. Match current step in route.segmentSteps and compute distance to next turn
  let currentStepIdx = 0;
  let minStepDist = Infinity;

  route.segmentSteps.forEach((step: RouteSegmentStep, idx: number) => {
    const sPoly = step.geometry;
    for (let j = 0; j < sPoly.length - 1; j++) {
      const p = projectPointOntoSegment(
        bestProjectedLat,
        bestProjectedLng,
        sPoly[j][0],
        sPoly[j][1],
        sPoly[j + 1][0],
        sPoly[j + 1][1]
      );
      if (p.distanceMeters < minStepDist) {
        minStepDist = p.distanceMeters;
        currentStepIdx = idx;
      }
    }
  });

  const currentStep = route.segmentSteps[currentStepIdx];
  const nextStep = route.segmentSteps[currentStepIdx + 1];

  let distanceToNextTurnMeters = remainingDistanceMeters;
  if (currentStep && currentStep.geometry.length > 0) {
    const stepEndPt = currentStep.geometry[currentStep.geometry.length - 1];
    distanceToNextTurnMeters = Math.round(
      haversineDistanceMeters(bestProjectedLat, bestProjectedLng, stepEndPt[0], stepEndPt[1])
    );
  }

  const destPt = poly[poly.length - 1];
  const directDistToDest = haversineDistanceMeters(
    bestProjectedLat,
    bestProjectedLng,
    destPt[0],
    destPt[1]
  );
  const hasArrived =
    (remainingDistanceMeters <= 8 && bestSegIdx >= poly.length - 2) ||
    (directDistToDest <= 8 && traveledDistanceMeters >= totalDistanceMeters * 0.5);

  const progressPercent = hasArrived
    ? 100
    : Math.min(99, Math.max(0, Math.round((traveledDistanceMeters / totalDistanceMeters) * 100)));

  const nextInstruction = hasArrived
    ? 'You have arrived at your destination.'
    : nextStep
    ? `In ${distanceToNextTurnMeters}m: ${nextStep.instruction}`
    : currentStep
    ? `${currentStep.instruction} (${remainingDistanceMeters}m remaining)`
    : 'Continue along route to destination.';

  const acc = Math.max(10, accuracyMeters ?? 15);
  const offRouteThresholdMeters = Math.round(Math.max(25, Math.min(65, acc * 1.25)));
  const isOffRoute = !hasArrived && minCrossTrackDist > offRouteThresholdMeters;

  return {
    status: hasArrived
      ? 'ARRIVED'
      : isOffRoute && currentStatus === 'ACTIVE'
      ? 'OFF_ROUTE_WARNING'
      : currentStatus,
    snappedPosition: [bestProjectedLat, bestProjectedLng],
    traveledGeometry,
    remainingGeometry,
    traveledDistanceMeters: hasArrived ? totalDistanceMeters : traveledDistanceMeters,
    remainingDistanceMeters: hasArrived ? 0 : remainingDistanceMeters,
    totalDistanceMeters,
    progressPercent,
    headingDegrees,
    remainingTimeSeconds: hasArrived ? 0 : remainingTimeSeconds,
    estimatedArrivalTimeFormatted,
    currentStepIndex: currentStepIdx,
    currentRoadName: currentStep?.roadName || 'Active Route Corridor',
    nextInstruction,
    distanceToNextTurnMeters: hasArrived ? 0 : distanceToNextTurnMeters,
    crossTrackDistanceMeters: Math.round(minCrossTrackDist),
    offRouteThresholdMeters,
    isOffRoute,
    hasArrived,
  };
}

/**
 * Evaluates whether the walker/driver is genuinely off-route and whether automatic route recalculation
 * should be triggered.
 */
export function evaluateOffRouteAndDebounce(
  route: AlgorithmExecutionResult,
  gpsLat: number,
  gpsLng: number,
  accuracyMeters: number | null,
  prevState: OffRouteEvaluationState,
  nowMs: number = Date.now(),
  debounceCooldownMs: number = 8000,
  requiredConsecutiveReadings: number = 2
): OffRouteDecision {
  const acc = Math.max(5, accuracyMeters ?? 15);
  const thresholdMeters = Math.round(Math.max(25, Math.min(65, acc * 1.25)));

  const progress = computeLiveNavigationProgress(route, gpsLat, gpsLng, acc, 1.4, 'ACTIVE');
  const crossTrack = progress.crossTrackDistanceMeters;

  if (acc > 85) {
    return {
      isCurrentlyOffRoute: false,
      shouldTriggerReroute: false,
      crossTrackDistanceMeters: crossTrack,
      thresholdMeters,
      nextState: prevState,
      reason: 'POOR_GPS_ACCURACY_IGNORED',
    };
  }

  if (crossTrack <= thresholdMeters || progress.hasArrived) {
    return {
      isCurrentlyOffRoute: false,
      shouldTriggerReroute: false,
      crossTrackDistanceMeters: crossTrack,
      thresholdMeters,
      nextState: {
        ...prevState,
        consecutiveOffRouteReadings: 0,
      },
      reason: 'ON_ROUTE',
    };
  }

  const nextConsecutive = prevState.consecutiveOffRouteReadings + 1;

  if (nextConsecutive < requiredConsecutiveReadings) {
    return {
      isCurrentlyOffRoute: true,
      shouldTriggerReroute: false,
      crossTrackDistanceMeters: crossTrack,
      thresholdMeters,
      nextState: {
        ...prevState,
        consecutiveOffRouteReadings: nextConsecutive,
      },
      reason: 'AWAITING_CONSECUTIVE_CONFIRMATION',
    };
  }

  if (
    prevState.lastRerouteTimestampMs > 0 &&
    nowMs - prevState.lastRerouteTimestampMs < debounceCooldownMs
  ) {
    return {
      isCurrentlyOffRoute: true,
      shouldTriggerReroute: false,
      crossTrackDistanceMeters: crossTrack,
      thresholdMeters,
      nextState: {
        ...prevState,
        consecutiveOffRouteReadings: nextConsecutive,
      },
      reason: 'DEBOUNCE_COOLDOWN_ACTIVE',
    };
  }

  return {
    isCurrentlyOffRoute: true,
    shouldTriggerReroute: true,
    crossTrackDistanceMeters: crossTrack,
    thresholdMeters,
    nextState: {
      consecutiveOffRouteReadings: 0,
      lastRerouteTimestampMs: nowMs,
      rerouteCount: prevState.rerouteCount + 1,
    },
    reason: 'TRIGGER_REROUTE',
  };
}
