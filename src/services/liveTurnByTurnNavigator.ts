import { AlgorithmExecutionResult, RouteSegmentStep } from '../algorithms/dijkstra';
import { haversineDistanceMeters } from '../graph/geodesic';
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
  remainingGeometry: [number, number][];
  remainingDistanceMeters: number;
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
 * Evaluates a live GPS coordinate against the planned route geometry to compute:
 * - Remaining polyline geometry ahead of the walker
 * - Remaining walking distance (meters)
 * - Estimated remaining walking time (seconds) and arrival clock time
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
  const safeSpeed = Math.max(0.5, Math.min(3.5, walkingSpeedMps || 1.4));
  const poly = route.routeGeometry;

  if (!route.found || poly.length === 0) {
    return {
      status: currentStatus,
      snappedPosition: [gpsLat, gpsLng],
      remainingGeometry: [],
      remainingDistanceMeters: 0,
      remainingTimeSeconds: 0,
      estimatedArrivalTimeFormatted: '--:--',
      currentStepIndex: 0,
      currentRoadName: 'No Active Route',
      nextInstruction: 'Select a valid connected campus destination.',
      distanceToNextTurnMeters: 0,
      crossTrackDistanceMeters: 0,
      offRouteThresholdMeters: 30,
      isOffRoute: false,
      hasArrived: false,
    };
  }

  if (poly.length === 1) {
    const dist = Math.round(haversineDistanceMeters(gpsLat, gpsLng, poly[0][0], poly[0][1]));
    const hasArrived = dist <= 15;
    return {
      status: hasArrived ? 'ARRIVED' : currentStatus,
      snappedPosition: poly[0],
      remainingGeometry: [[gpsLat, gpsLng], poly[0]],
      remainingDistanceMeters: dist,
      remainingTimeSeconds: Math.round(dist / safeSpeed),
      estimatedArrivalTimeFormatted: new Date(
        Date.now() + Math.round(dist / safeSpeed) * 1000
      ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      currentStepIndex: 0,
      currentRoadName: 'Destination Reached',
      nextInstruction: 'You have arrived at your campus destination.',
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

  // 2. Build remaining route polyline from projected point to destination
  const remainingGeometry: [number, number][] = [
    [bestProjectedLat, bestProjectedLng],
    ...poly.slice(bestSegIdx + 1),
  ];

  // 3. Calculate exact remaining distance along the remaining polyline
  let remainingDist = 0;
  for (let i = 0; i < remainingGeometry.length - 1; i++) {
    remainingDist += haversineDistanceMeters(
      remainingGeometry[i][0],
      remainingGeometry[i][1],
      remainingGeometry[i + 1][0],
      remainingGeometry[i + 1][1]
    );
  }
  const remainingDistanceMeters = Math.round(remainingDist);
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
        gpsLat,
        gpsLng,
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
  const directDistToDest = haversineDistanceMeters(gpsLat, gpsLng, destPt[0], destPt[1]);
  const hasArrived = remainingDistanceMeters <= 15 || directDistToDest <= 15;

  const nextInstruction = hasArrived
    ? 'You have arrived at your destination.'
    : nextStep
    ? `In ${distanceToNextTurnMeters}m: ${nextStep.instruction}`
    : currentStep
    ? `${currentStep.instruction} (${remainingDistanceMeters}m remaining to destination)`
    : 'Continue along campus path to destination.';

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
    remainingGeometry,
    remainingDistanceMeters: hasArrived ? 0 : remainingDistanceMeters,
    remainingTimeSeconds: hasArrived ? 0 : remainingTimeSeconds,
    estimatedArrivalTimeFormatted,
    currentStepIndex: currentStepIdx,
    currentRoadName: currentStep?.roadName || 'Campus Walkable Path',
    nextInstruction,
    distanceToNextTurnMeters: hasArrived ? 0 : distanceToNextTurnMeters,
    crossTrackDistanceMeters: Math.round(minCrossTrackDist),
    offRouteThresholdMeters,
    isOffRoute,
    hasArrived,
  };
}

/**
 * Evaluates whether the walker is genuinely off-route and whether automatic route recalculation
 * should be triggered, enforcing:
 * 1. GPS accuracy check (ignores readings with accuracy > 85m to prevent GPS jitter false positives)
 * 2. Distance threshold check (`max(25m, min(65m, accuracy * 1.25))`)
 * 3. Consecutive off-route reading confirmation (>= 2 consecutive off-route fixes)
 * 4. Debounce cooldown (`>= 8000ms` since last automatic reroute)
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

  // Guard 1: If GPS accuracy is too poor (> 85m), do not trigger off-route rerouting
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

  // Guard 2: Within normal route corridor threshold
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

  // User is beyond thresholdMeters from planned route
  const nextConsecutive = prevState.consecutiveOffRouteReadings + 1;

  // Guard 3: Require consecutive off-route fixes to avoid single-spike GPS fluctuation
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

  // Guard 4: Debounce cooldown between automatic reroutes
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
