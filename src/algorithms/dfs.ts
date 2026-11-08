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
 * Genuine Depth-First Search (DFS) using an explicit LIFO Stack.
 * Explores campus connectivity and reachability across open corridors.
 * Time Complexity: O(V + E)
 * Space Complexity: O(V)
 */
export function runDFS(
  graph: CampusGraph,
  sourceId: string,
  targetId: string,
  emergencyMode: boolean = false,
  routingProfile: RoutingProfile = 'WALKING',
  emergencyVehicle: EmergencyVehicleType = 'NONE'
): AlgorithmExecutionResult {
  const startTimePerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const nodes = graph.getAllNodes();
  const depthMap = new Map<string, number>();
  const previousNode = new Map<string, string | null>();
  const previousEdge = new Map<string, string | null>();
  const visited = new Set<string>();
  const visitedOrder: string[] = [];
  const stack: Array<{
    nodeId: string;
    parentId: string | null;
    edgeId: string | null;
    depth: number;
  }> = [];
  const steps: AlgorithmStepSnapshot[] = [];
  let restrictedRoadsSkipped = 0;

  for (const node of nodes) {
    depthMap.set(node.id, Infinity);
    previousNode.set(node.id, null);
    previousEdge.set(node.id, null);
  }

  if (!graph.getNode(sourceId) || !graph.getNode(targetId)) {
    return {
      algorithmName: 'Depth-First Search (DFS)',
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

  stack.push({ nodeId: sourceId, parentId: null, edgeId: null, depth: 0 });
  let stepCount = 1;

  const serializeDistances = (): Record<string, number | 'INF'> => {
    const out: Record<string, number | 'INF'> = {};
    for (const [k, v] of depthMap.entries()) {
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

  const serializeStack = () =>
    [...stack].reverse().map((s) => ({
      nodeId: s.nodeId,
      priority: s.depth,
    }));

  steps.push({
    stepNumber: stepCount++,
    action: 'INIT',
    currentNodeId: sourceId,
    currentEdgeId: null,
    visitedNodes: [],
    frontier: serializeStack(),
    distances: serializeDistances(),
    previous: serializePrevious(),
    description: `Pushed start node ${
      graph.getNode(sourceId)?.name || sourceId
    } onto LIFO Stack.`,
  });

  while (stack.length > 0) {
    const popped = stack.pop()!;
    const u = popped.nodeId;

    if (visited.has(u)) {
      continue;
    }

    visited.add(u);
    visitedOrder.push(u);
    depthMap.set(u, popped.depth);
    previousNode.set(u, popped.parentId);
    previousEdge.set(u, popped.edgeId);

    const uNode = graph.getNode(u);

    steps.push({
      stepNumber: stepCount++,
      action: u === targetId ? 'TARGET_REACHED' : 'DEQUEUE',
      currentNodeId: u,
      currentEdgeId: popped.edgeId,
      visitedNodes: [...visitedOrder],
      frontier: serializeStack(),
      distances: serializeDistances(),
      previous: serializePrevious(),
      description:
        u === targetId
          ? `Target ${uNode?.name || u} reached via deep branch traversal at depth ${
              popped.depth
            }.`
          : `Popped ${uNode?.name || u} from LIFO Stack (depth = ${popped.depth}).`,
    });

    if (u === targetId) {
      break;
    }

    const outgoingEdges = [...graph.getOutgoingEdges(u)].reverse();
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
        stack.push({
          nodeId: v,
          parentId: u,
          edgeId: edge.id,
          depth: popped.depth + 1,
        });
      }
    }
  }

  const nodePath: string[] = [];
  const edgePath: string[] = [];
  let curr: string | null = targetId;

  if (visited.has(targetId)) {
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
    algorithmName: 'Depth-First Search (DFS)',
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

/**
 * Uses DFS to identify all connected components in the campus road network.
 */
export function findConnectedComponents(
  graph: CampusGraph,
  emergencyMode: boolean = false,
  routingProfile: RoutingProfile = 'WALKING'
): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of graph.getAllNodes()) {
    if (visited.has(node.id)) continue;

    const component: string[] = [];
    const stack: string[] = [node.id];

    while (stack.length > 0) {
      const u = stack.pop()!;
      if (visited.has(u)) continue;
      visited.add(u);
      component.push(u);

      for (const edge of graph.getOutgoingEdges(u)) {
        if (!isEdgeTraversableForProfile(edge, routingProfile, emergencyMode, 'NONE')) {
          continue;
        }
        if (!visited.has(edge.target)) {
          stack.push(edge.target);
        }
      }
    }

    components.push(component);
  }

  return components;
}
