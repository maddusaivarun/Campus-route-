import {
  CampusGraph,
  OptimizationMetric,
  EmergencyVehicleType,
  RoutingProfile,
  isEdgeTraversableForProfile,
} from '../graph/Graph';
import { haversineDistanceMeters } from '../graph/geodesic';
import { PriorityQueue } from './priorityQueue';
import {
  AlgorithmExecutionResult,
  AlgorithmStepSnapshot,
  buildGeographicRouteDetails,
} from './dijkstra';

interface AStarQueueNode {
  nodeId: string;
}

/**
 * Admissible Geographic Geodesic Heuristic h(n) using exact Haversine distance on the WGS84 sphere:
 * - For DISTANCE metric: Straight-line Haversine distance in meters * 0.98 (never overestimates road distance).
 * - For TIME metric: Straight-line Haversine distance divided by maximum physical velocity for the active profile.
 */
export function computeAdmissibleGeographicHeuristic(
  graph: CampusGraph,
  currentId: string,
  targetId: string,
  metric: OptimizationMetric,
  routingProfile: RoutingProfile = 'WALKING',
  emergencyMode: boolean = false
): number {
  const curr = graph.getNode(currentId);
  const target = graph.getNode(targetId);
  if (!curr || !target) return 0;

  const straightLineMeters = haversineDistanceMeters(
    curr.lat,
    curr.lng,
    target.lat,
    target.lng
  );

  if (metric === 'DISTANCE') {
    return Number((straightLineMeters * 0.98).toFixed(1));
  }

  const maxVelocityMps = emergencyMode
    ? 22.2
    : routingProfile === 'WALKING'
    ? 1.45
    : routingProfile === 'BICYCLE'
    ? 4.5
    : 14.0;

  return Number((straightLineMeters / maxVelocityMps).toFixed(1));
}

/**
 * Genuine A* (A-Star) Geodesic Heuristic Search Algorithm using a Binary Min-Heap Priority Queue.
 * Evaluates f(n) = g(n) + h(n) where h(n) is the admissible Haversine great-circle lower bound.
 */
export function runAStar(
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
  const gScore = new Map<string, number>();
  const hScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const previousNode = new Map<string, string | null>();
  const previousEdge = new Map<string, string | null>();
  const closedSet = new Set<string>();
  const visitedOrder: string[] = [];
  const steps: AlgorithmStepSnapshot[] = [];
  let restrictedRoadsSkipped = 0;

  const openSet = new PriorityQueue<AStarQueueNode>((item) => item.nodeId);

  for (const node of nodes) {
    gScore.set(node.id, Infinity);
    const h = computeAdmissibleGeographicHeuristic(
      graph,
      node.id,
      targetId,
      metric,
      routingProfile,
      emergencyMode
    );
    hScore.set(node.id, h);
    fScore.set(node.id, Infinity);
    previousNode.set(node.id, null);
    previousEdge.set(node.id, null);
  }

  if (!graph.getNode(sourceId) || !graph.getNode(targetId)) {
    return {
      algorithmName: 'A* Geodesic Search',
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

  const startH = hScore.get(sourceId) ?? 0;
  gScore.set(sourceId, 0);
  fScore.set(sourceId, startH);
  openSet.enqueue({ nodeId: sourceId }, startH);

  let stepCount = 1;

  const serializeDistances = (): Record<string, number | 'INF'> => {
    const out: Record<string, number | 'INF'> = {};
    for (const [k, v] of gScore.entries()) {
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
    openSet.getSnapshot().map((s) => {
      const id = s.item.nodeId;
      return {
        nodeId: id,
        priority: s.priority,
        gScore: Number((gScore.get(id) ?? 0).toFixed(1)),
        hScore: Number((hScore.get(id) ?? 0).toFixed(1)),
        fScore: s.priority,
      };
    });

  steps.push({
    stepNumber: stepCount++,
    action: 'INIT',
    currentNodeId: sourceId,
    currentEdgeId: null,
    visitedNodes: [],
    frontier: serializeFrontier(),
    distances: serializeDistances(),
    previous: serializePrevious(),
    description: `Initialized A* (${routingProfile}) at ${
      graph.getNode(sourceId)?.name || sourceId
    }: g=0, Haversine h=${startH.toFixed(1)}, f=${startH.toFixed(1)}.`,
  });

  while (!openSet.isEmpty()) {
    const dequeued = openSet.dequeue()!;
    const u = dequeued.item.nodeId;

    if (closedSet.has(u)) {
      continue;
    }

    closedSet.add(u);
    visitedOrder.push(u);

    const uNode = graph.getNode(u);
    const currentG = gScore.get(u) ?? Infinity;
    const currentH = hScore.get(u) ?? 0;
    const currentF = fScore.get(u) ?? Infinity;

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
          ? `Goal ${uNode?.name || u} reached with optimal cost g=${currentG.toFixed(1)}.`
          : `Expanded ${uNode?.name || u} with lowest f=${currentF.toFixed(
              1
            )} (g=${currentG.toFixed(1)} + h=${currentH.toFixed(1)}).`,
    });

    if (u === targetId) {
      break;
    }

    const outgoingEdges = graph.getOutgoingEdges(u);
    for (const edge of outgoingEdges) {
      const v = edge.target;
      if (closedSet.has(v)) continue;

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
              : `Skipped restricted segment "${edge.roadName}" (${edge.highwayType}).`,
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

      const tentativeG = currentG + weight;
      const existingG = gScore.get(v) ?? Infinity;

      if (tentativeG < existingG) {
        const vH = hScore.get(v) ?? 0;
        const newF = tentativeG + vH;

        gScore.set(v, tentativeG);
        fScore.set(v, newF);
        previousNode.set(v, u);
        previousEdge.set(v, edge.id);

        if (openSet.containsKey(v)) {
          openSet.updatePriority({ nodeId: v }, newF);
        } else {
          openSet.enqueue({ nodeId: v }, newF);
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
          description: `Updated ${vNode?.name || v} via "${edge.roadName}": g=${tentativeG.toFixed(
            1
          )}, h=${vH.toFixed(1)} => f=${newF.toFixed(1)}.`,
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
    algorithmName: 'A* Geodesic Search',
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
    totalCost: found ? Number((gScore.get(targetId) ?? Infinity).toFixed(1)) : Infinity,
    visitedOrder,
    restrictedRoadsSkipped,
    executionTimeMs: Number(Math.max(0.05, endTimePerf - startTimePerf).toFixed(2)),
    steps,
  };
}
