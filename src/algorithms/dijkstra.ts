import {
  CampusGraph,
  OptimizationMetric,
  EmergencyVehicleType,
  RoutingProfile,
  RoadStatus,
  OSMHighwayType,
  isEdgeTraversableForProfile,
} from '../graph/Graph';
import {
  bearingToCompassDirection,
  calculateBearingDegrees,
  deriveTurnManeuver,
  TurnManeuver,
} from '../graph/geodesic';
import { PriorityQueue } from './priorityQueue';

export interface AlgorithmStepSnapshot {
  stepNumber: number;
  action: 'INIT' | 'DEQUEUE' | 'RELAX' | 'SKIP_CLOSED' | 'TARGET_REACHED' | 'COMPLETE';
  currentNodeId: string | null;
  currentEdgeId: string | null;
  visitedNodes: string[];
  frontier: Array<{
    nodeId: string;
    priority: number;
    gScore?: number;
    hScore?: number;
    fScore?: number;
  }>;
  distances: Record<string, number | 'INF'>;
  previous: Record<string, string | null>;
  description: string;
}

export interface RouteSegmentStep {
  stepIndex: number;
  edgeId: string;
  roadName: string;
  highwayType: OSMHighwayType;
  fromNodeId: string;
  fromNodeName: string;
  toNodeId: string;
  toNodeName: string;
  distanceMeters: number;
  timeSeconds: number;
  congestionFactor: number;
  status: RoadStatus;
  maneuver: TurnManeuver;
  bearingDegrees: number;
  compassDirection: string;
  instruction: string;
  geometry: [number, number][];
}

export interface AlgorithmExecutionResult {
  algorithmName: string;
  timeComplexity: string;
  spaceComplexity: string;
  routingProfile: RoutingProfile;
  found: boolean;
  sourceId: string;
  targetId: string;
  nodePath: string[];
  edgePath: string[];
  routeGeometry: [number, number][];
  segmentSteps: RouteSegmentStep[];
  totalDistanceMeters: number;
  totalTimeSeconds: number;
  totalCost: number;
  visitedOrder: string[];
  restrictedRoadsSkipped: number;
  executionTimeMs: number;
  steps: AlgorithmStepSnapshot[];
}

interface QueueNode {
  nodeId: string;
}

/**
 * Reconstructs the path, full geographic polyline geometry, and geometry-derived turn-by-turn directions.
 */
export function buildGeographicRouteDetails(
  graph: CampusGraph,
  nodePath: string[],
  edgePath: string[],
  routingProfile: RoutingProfile,
  emergencyMode: boolean,
  emergencyVehicle: EmergencyVehicleType
): {
  segmentSteps: RouteSegmentStep[];
  routeGeometry: [number, number][];
  totalDistanceMeters: number;
  totalTimeSeconds: number;
} {
  const segmentSteps: RouteSegmentStep[] = [];
  const routeGeometry: [number, number][] = [];
  let totalDistanceMeters = 0;
  let totalTimeSeconds = 0;
  let prevBearing: number | null = null;
  let prevRoadName: string | null = null;

  for (let i = 0; i < edgePath.length; i++) {
    const edge = graph.getEdge(edgePath[i]);
    if (!edge) continue;

    const fromNode = graph.getNode(edge.source);
    const toNode = graph.getNode(edge.target);
    const segTime = graph.getEffectiveEdgeWeight(
      edge,
      'TIME',
      emergencyMode,
      emergencyVehicle,
      routingProfile
    );

    totalDistanceMeters += edge.distanceMeters;
    totalTimeSeconds += Number.isFinite(segTime) ? segTime : edge.baseTimeSeconds;

    const poly =
      edge.geometry && edge.geometry.length >= 2
        ? edge.geometry
        : fromNode && toNode
        ? ([
            [fromNode.lat, fromNode.lng],
            [toNode.lat, toNode.lng],
          ] as [number, number][])
        : [];

    for (const pt of poly) {
      if (
        routeGeometry.length === 0 ||
        routeGeometry[routeGeometry.length - 1][0] !== pt[0] ||
        routeGeometry[routeGeometry.length - 1][1] !== pt[1]
      ) {
        routeGeometry.push(pt);
      }
    }

    const startPt = poly[0] || [fromNode?.lat || 16.23155, fromNode?.lng || 80.55127];
    const secondPt = poly[1] || [toNode?.lat || 16.23155, toNode?.lng || 80.55127];
    const initialBearing = calculateBearingDegrees(
      startPt[0],
      startPt[1],
      secondPt[0],
      secondPt[1]
    );

    const { maneuver, instruction } = deriveTurnManeuver(
      prevBearing,
      initialBearing,
      prevRoadName,
      edge.roadName
    );

    const endPtA = poly.length >= 2 ? poly[poly.length - 2] : startPt;
    const endPtB = poly.length >= 2 ? poly[poly.length - 1] : secondPt;
    prevBearing = calculateBearingDegrees(endPtA[0], endPtA[1], endPtB[0], endPtB[1]);
    prevRoadName = edge.roadName;

    segmentSteps.push({
      stepIndex: i + 1,
      edgeId: edge.id,
      roadName: edge.roadName,
      highwayType: edge.highwayType,
      fromNodeId: edge.source,
      fromNodeName: fromNode ? fromNode.name : edge.source,
      toNodeId: edge.target,
      toNodeName: toNode ? toNode.name : edge.target,
      distanceMeters: edge.distanceMeters,
      timeSeconds: Number.isFinite(segTime) ? Math.round(segTime) : edge.baseTimeSeconds,
      congestionFactor: edge.congestionFactor,
      status: edge.status,
      maneuver,
      bearingDegrees: initialBearing,
      compassDirection: bearingToCompassDirection(initialBearing),
      instruction: `${instruction} (${edge.distanceMeters}m)`,
      geometry: poly,
    });
  }

  if (routeGeometry.length === 0 && nodePath.length === 1) {
    const single = graph.getNode(nodePath[0]);
    if (single) routeGeometry.push([single.lat, single.lng]);
  }

  return {
    segmentSteps,
    routeGeometry,
    totalDistanceMeters: Math.round(totalDistanceMeters),
    totalTimeSeconds: Math.round(totalTimeSeconds),
  };
}

/**
 * Genuine Dijkstra's Shortest Path Algorithm using a Binary Min-Heap Priority Queue.
 * Time Complexity: O((V + E) log V)
 * Space Complexity: O(V)
 */
export function runDijkstra(
  graph: CampusGraph,
  sourceId: string,
  targetId: string,
  metric: OptimizationMetric = 'TIME',
  emergencyMode: boolean = false,
  emergencyVehicle: EmergencyVehicleType = 'NONE',
  routingProfile: RoutingProfile = 'WALKING'
): AlgorithmExecutionResult {
  const startTimePerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const nodes = graph.getAllNodes();
  const distances = new Map<string, number>();
  const previousNode = new Map<string, string | null>();
  const previousEdge = new Map<string, string | null>();
  const visited = new Set<string>();
  const visitedOrder: string[] = [];
  const steps: AlgorithmStepSnapshot[] = [];
  let restrictedRoadsSkipped = 0;

  const pq = new PriorityQueue<QueueNode>((item) => item.nodeId);

  for (const node of nodes) {
    distances.set(node.id, Infinity);
    previousNode.set(node.id, null);
    previousEdge.set(node.id, null);
  }

  if (!graph.getNode(sourceId) || !graph.getNode(targetId)) {
    return {
      algorithmName: "Dijkstra's Shortest Path",
      timeComplexity: 'O((V + E) log V)',
      spaceComplexity: 'O(V)',
      routingProfile,
      found: false,
      sourceId,
      targetId,
      nodePath: [],
      edgePath: [],
      routeGeometry: [],
      segmentSteps: [],
      totalDistanceMeters: 0,
      totalTimeSeconds: 0,
      totalCost: Infinity,
      visitedOrder: [],
      restrictedRoadsSkipped: 0,
      executionTimeMs: 0,
      steps: [],
    };
  }

  distances.set(sourceId, 0);
  pq.enqueue({ nodeId: sourceId }, 0);

  let stepCount = 1;

  const serializeDistances = (): Record<string, number | 'INF'> => {
    const out: Record<string, number | 'INF'> = {};
    for (const [k, v] of distances.entries()) {
      out[k] = Number.isFinite(v) ? Number(v.toFixed(1)) : 'INF';
    }
    return out;
  };

  const serializePrevious = (): Record<string, string | null> => {
    const out: Record<string, string | null> = {};
    for (const [k, v] of previousNode.entries()) {
      out[k] = v;
    }
    return out;
  };

  const serializeFrontier = () =>
    pq.getSnapshot().map((s) => ({
      nodeId: s.item.nodeId,
      priority: s.priority,
      gScore: s.priority,
    }));

  steps.push({
    stepNumber: stepCount++,
    action: 'INIT',
    currentNodeId: sourceId,
    currentEdgeId: null,
    visitedNodes: [],
    frontier: serializeFrontier(),
    distances: serializeDistances(),
    previous: serializePrevious(),
    description: `Initialized Dijkstra (${routingProfile} mode) at ${
      graph.getNode(sourceId)?.name || sourceId
    } with cost 0.`,
  });

  while (!pq.isEmpty()) {
    const dequeued = pq.dequeue()!;
    const u = dequeued.item.nodeId;

    if (visited.has(u)) {
      continue;
    }

    visited.add(u);
    visitedOrder.push(u);

    const uNode = graph.getNode(u);
    const currentDist = distances.get(u) ?? Infinity;

    steps.push({
      stepNumber: stepCount++,
      action: u === targetId ? 'TARGET_REACHED' : 'DEQUEUE',
      currentNodeId: u,
      currentEdgeId: previousEdge.get(u) || null,
      visitedNodes: [...visitedOrder],
      frontier: serializeFrontier(),
      distances: serializeDistances(),
      previous: serializePrevious(),
      description:
        u === targetId
          ? `Extracted destination ${uNode?.name || u} from Min-Heap with optimal cost ${currentDist.toFixed(
              1
            )}.`
          : `Extracted ${uNode?.name || u} from Min-Heap (cost = ${currentDist.toFixed(
              1
            )}). Exploring incident road segments.`,
    });

    if (u === targetId) {
      break;
    }

    const outgoingEdges = graph.getOutgoingEdges(u);
    for (const edge of outgoingEdges) {
      const v = edge.target;
      if (visited.has(v)) continue;

      if (
        !isEdgeTraversableForProfile(
          edge,
          routingProfile,
          emergencyMode,
          emergencyVehicle
        )
      ) {
        restrictedRoadsSkipped++;
        steps.push({
          stepNumber: stepCount++,
          action: 'SKIP_CLOSED',
          currentNodeId: u,
          currentEdgeId: edge.id,
          visitedNodes: [...visitedOrder],
          frontier: serializeFrontier(),
          distances: serializeDistances(),
          previous: serializePrevious(),
          description:
            edge.status === 'CLOSED'
              ? `Skipped closed road "${edge.roadName}".`
              : `Skipped restricted segment "${edge.roadName}" (${edge.highwayType} not accessible for ${
                  emergencyMode ? emergencyVehicle : routingProfile
                }).`,
        });
        continue;
      }

      const weight = graph.getEffectiveEdgeWeight(
        edge,
        metric,
        emergencyMode,
        emergencyVehicle,
        routingProfile
      );

      if (!Number.isFinite(weight)) continue;

      const candidateDist = currentDist + weight;
      const existingDist = distances.get(v) ?? Infinity;

      if (candidateDist < existingDist) {
        distances.set(v, candidateDist);
        previousNode.set(v, u);
        previousEdge.set(v, edge.id);

        if (pq.containsKey(v)) {
          pq.updatePriority({ nodeId: v }, candidateDist);
        } else {
          pq.enqueue({ nodeId: v }, candidateDist);
        }

        const vNode = graph.getNode(v);
        steps.push({
          stepNumber: stepCount++,
          action: 'RELAX',
          currentNodeId: u,
          currentEdgeId: edge.id,
          visitedNodes: [...visitedOrder],
          frontier: serializeFrontier(),
          distances: serializeDistances(),
          previous: serializePrevious(),
          description: `Relaxed "${edge.roadName}" (${edge.distanceMeters}m) to ${
            vNode?.name || v
          }: updated cost from ${
            Number.isFinite(existingDist) ? existingDist.toFixed(1) : '∞'
          } to ${candidateDist.toFixed(1)}.`,
        });
      }
    }
  }

  const nodePath: string[] = [];
  const edgePath: string[] = [];
  let curr: string | null = targetId;

  if (previousNode.get(curr) !== null || curr === sourceId) {
    while (curr !== null) {
      nodePath.unshift(curr);
      const eId = previousEdge.get(curr);
      if (eId) {
        edgePath.unshift(eId);
      }
      curr = previousNode.get(curr) ?? null;
    }
  }

  const found =
    nodePath.length > 0 &&
    nodePath[0] === sourceId &&
    nodePath[nodePath.length - 1] === targetId;

  const details = found
    ? buildGeographicRouteDetails(
        graph,
        nodePath,
        edgePath,
        routingProfile,
        emergencyMode,
        emergencyVehicle
      )
    : {
        segmentSteps: [],
        routeGeometry: [],
        totalDistanceMeters: 0,
        totalTimeSeconds: 0,
      };

  const endTimePerf = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    algorithmName: "Dijkstra's Shortest Path",
    timeComplexity: 'O((V + E) log V)',
    spaceComplexity: 'O(V)',
    routingProfile,
    found,
    sourceId,
    targetId,
    nodePath: found ? nodePath : [],
    edgePath: found ? edgePath : [],
    routeGeometry: details.routeGeometry,
    segmentSteps: details.segmentSteps,
    totalDistanceMeters: details.totalDistanceMeters,
    totalTimeSeconds: details.totalTimeSeconds,
    totalCost: found ? Number((distances.get(targetId) ?? Infinity).toFixed(1)) : Infinity,
    visitedOrder,
    restrictedRoadsSkipped,
    executionTimeMs: Number(Math.max(0.05, endTimePerf - startTimePerf).toFixed(2)),
    steps,
  };
}
