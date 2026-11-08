import {
  CampusGraph,
  EmergencyVehicleType,
  RoutingProfile,
  isEdgeTraversableForProfile,
} from '../graph/Graph';
import {
  AlgorithmExecutionResult,
  AlgorithmStepSnapshot,
  buildGeographicRouteDetails,
} from './dijkstra';

/**
 * Genuine Breadth-First Search (BFS) using a FIFO Queue.
 * Finds the path with the minimum number of road intersections (unweighted hops).
 * Time Complexity: O(V + E)
 * Space Complexity: O(V)
 */
export function runBFS(
  graph: CampusGraph,
  sourceId: string,
  targetId: string,
  emergencyMode: boolean = false,
  routingProfile: RoutingProfile = 'WALKING',
  emergencyVehicle: EmergencyVehicleType = 'NONE'
): AlgorithmExecutionResult {
  const startTimePerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const nodes = graph.getAllNodes();
  const hopCount = new Map<string, number>();
  const previousNode = new Map<string, string | null>();
  const previousEdge = new Map<string, string | null>();
  const visited = new Set<string>();
  const visitedOrder: string[] = [];
  const queue: string[] = [];
  const steps: AlgorithmStepSnapshot[] = [];
  let restrictedRoadsSkipped = 0;

  for (const node of nodes) {
    hopCount.set(node.id, Infinity);
    previousNode.set(node.id, null);
    previousEdge.set(node.id, null);
  }

  if (!graph.getNode(sourceId) || !graph.getNode(targetId)) {
    return {
      algorithmName: 'Breadth-First Search (BFS)',
      timeComplexity: 'O(V + E)',
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

  hopCount.set(sourceId, 0);
  visited.add(sourceId);
  queue.push(sourceId);

  let stepCount = 1;

  const serializeDistances = (): Record<string, number | 'INF'> => {
    const out: Record<string, number | 'INF'> = {};
    for (const [k, v] of hopCount.entries()) {
      out[k] = Number.isFinite(v) ? v : 'INF';
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

  const serializeQueue = () =>
    queue.map((id) => ({
      nodeId: id,
      priority: hopCount.get(id) ?? 0,
    }));

  steps.push({
    stepNumber: stepCount++,
    action: 'INIT',
    currentNodeId: sourceId,
    currentEdgeId: null,
    visitedNodes: [],
    frontier: serializeQueue(),
    distances: serializeDistances(),
    previous: serializePrevious(),
    description: `Enqueued start node ${
      graph.getNode(sourceId)?.name || sourceId
    } into FIFO Queue (hop depth = 0).`,
  });

  while (queue.length > 0) {
    const u = queue.shift()!;
    visitedOrder.push(u);

    const uNode = graph.getNode(u);
    const currentHops = hopCount.get(u) ?? 0;

    steps.push({
      stepNumber: stepCount++,
      action: u === targetId ? 'TARGET_REACHED' : 'DEQUEUE',
      currentNodeId: u,
      currentEdgeId: previousEdge.get(u) || null,
      visitedNodes: [...visitedOrder],
      frontier: serializeQueue(),
      distances: serializeDistances(),
      previous: serializePrevious(),
      description:
        u === targetId
          ? `Reached ${uNode?.name || u} in ${currentHops} road segments (minimum hops).`
          : `Dequeued ${uNode?.name || u} at hop layer ${currentHops}.`,
    });

    if (u === targetId) {
      break;
    }

    const outgoingEdges = graph.getOutgoingEdges(u);
    for (const edge of outgoingEdges) {
      if (
        !isEdgeTraversableForProfile(
          edge,
          routingProfile,
          emergencyMode,
          emergencyVehicle
        )
      ) {
        restrictedRoadsSkipped++;
        continue;
      }

      const v = edge.target;
      if (!visited.has(v)) {
        visited.add(v);
        hopCount.set(v, currentHops + 1);
        previousNode.set(v, u);
        previousEdge.set(v, edge.id);
        queue.push(v);

        const vNode = graph.getNode(v);
        steps.push({
          stepNumber: stepCount++,
          action: 'RELAX',
          currentNodeId: u,
          currentEdgeId: edge.id,
          visitedNodes: [...visitedOrder],
          frontier: serializeQueue(),
          distances: serializeDistances(),
          previous: serializePrevious(),
          description: `Discovered ${vNode?.name || v} via "${edge.roadName}" (hop = ${
            currentHops + 1
          }).`,
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
    algorithmName: 'Breadth-First Search (BFS)',
    timeComplexity: 'O(V + E)',
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
    totalCost: found ? edgePath.length : Infinity,
    visitedOrder,
    restrictedRoadsSkipped,
    executionTimeMs: Number(Math.max(0.05, endTimePerf - startTimePerf).toFixed(2)),
    steps,
  };
}
