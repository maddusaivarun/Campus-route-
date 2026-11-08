import {
  CampusGraph,
  OptimizationMetric,
  EmergencyVehicleType,
  RoutingProfile,
} from '../graph/Graph';
import {
  runDijkstra,
  AlgorithmExecutionResult,
  buildGeographicRouteDetails,
} from './dijkstra';

export interface AlternativeRouteCandidate {
  rank: number;
  label: string;
  result: AlgorithmExecutionResult;
  deltaTimeSeconds: number;
  deltaDistanceMeters: number;
  recommendationReason: string;
}

/**
 * Yen's K-Shortest Loop-Free Paths Algorithm.
 * Time Complexity: O(K * V * (V + E) log V)
 */
export function runYenKShortestPaths(
  graph: CampusGraph,
  sourceId: string,
  targetId: string,
  K: number = 3,
  metric: OptimizationMetric = 'TIME',
  emergencyMode: boolean = false,
  emergencyVehicle: EmergencyVehicleType = 'NONE',
  routingProfile: RoutingProfile = 'WALKING'
): AlternativeRouteCandidate[] {
  const shortest = runDijkstra(
    graph,
    sourceId,
    targetId,
    metric,
    emergencyMode,
    emergencyVehicle,
    routingProfile
  );
  if (!shortest.found) {
    return [];
  }

  const A: AlgorithmExecutionResult[] = [shortest];
  const B: AlgorithmExecutionResult[] = [];
  const pathSignatures = new Set<string>([shortest.nodePath.join('->')]);

  for (let k = 1; k < K; k++) {
    const prevPath = A[k - 1].nodePath;

    for (let i = 0; i < prevPath.length - 1; i++) {
      const spurNode = prevPath[i];
      const rootNodes = prevPath.slice(0, i + 1);
      const rootEdges = A[k - 1].edgePath.slice(0, i);

      const excludedEdges = new Set<string>();
      const excludedNodes = new Set<string>();

      for (const pathObj of A) {
        const pNodes = pathObj.nodePath;
        if (
          pNodes.length > i &&
          rootNodes.every((nodeId, idx) => pNodes[idx] === nodeId)
        ) {
          const edgeToBlock = pathObj.edgePath[i];
          if (edgeToBlock) {
            excludedEdges.add(edgeToBlock);
          }
        }
      }

      for (let r = 0; r < rootNodes.length - 1; r++) {
        excludedNodes.add(rootNodes[r]);
      }

      const modifiedGraph = graph.cloneWithoutEdges(excludedEdges, excludedNodes);
      const spurResult = runDijkstra(
        modifiedGraph,
        spurNode,
        targetId,
        metric,
        emergencyMode,
        emergencyVehicle,
        routingProfile
      );

      if (spurResult.found) {
        const totalNodePath = [...rootNodes.slice(0, -1), ...spurResult.nodePath];
        const totalEdgePath = [...rootEdges, ...spurResult.edgePath];
        const signature = totalNodePath.join('->');

        if (!pathSignatures.has(signature)) {
          pathSignatures.add(signature);
          const combined = buildCandidateExecutionResult(
            graph,
            sourceId,
            targetId,
            totalNodePath,
            totalEdgePath,
            metric,
            emergencyMode,
            emergencyVehicle,
            routingProfile,
            spurResult.visitedOrder,
            spurResult.executionTimeMs
          );
          B.push(combined);
        }
      }
    }

    if (B.length === 0) {
      break;
    }

    B.sort((a, b) => a.totalCost - b.totalCost);
    const bestNext = B.shift()!;
    A.push(bestNext);
  }

  const primary = A[0];
  return A.map((res, index) => {
    const rank = index + 1;
    const deltaTime = Math.max(0, res.totalTimeSeconds - primary.totalTimeSeconds);
    const deltaDist = res.totalDistanceMeters - primary.totalDistanceMeters;

    let label = 'Primary Optimal Route';
    let reason =
      metric === 'TIME'
        ? 'Fastest campus route with minimum travel time'
        : 'Shortest physical Haversine distance across open pathways';

    if (rank === 2) {
      label = 'First Alternative Corridor';
      reason =
        deltaDist <= 0
          ? 'Compact alternative bypassing primary spine intersections'
          : 'Reliable secondary route if primary avenue experiences congestion';
    } else if (rank === 3) {
      label = 'Perimeter Redundancy Route';
      reason = 'Outer campus loop offering emergency redundancy';
    }

    return {
      rank,
      label,
      result: res,
      deltaTimeSeconds: deltaTime,
      deltaDistanceMeters: deltaDist,
      recommendationReason: reason,
    };
  });
}

function buildCandidateExecutionResult(
  graph: CampusGraph,
  sourceId: string,
  targetId: string,
  nodePath: string[],
  edgePath: string[],
  metric: OptimizationMetric,
  emergencyMode: boolean,
  emergencyVehicle: EmergencyVehicleType,
  routingProfile: RoutingProfile,
  visitedOrder: string[],
  executionTimeMs: number
): AlgorithmExecutionResult {
  const details = buildGeographicRouteDetails(
    graph,
    nodePath,
    edgePath,
    routingProfile,
    emergencyMode,
    emergencyVehicle
  );

  let totalCost = 0;
  for (const edgeId of edgePath) {
    const edge = graph.getEdge(edgeId);
    if (!edge) continue;
    totalCost += graph.getEffectiveEdgeWeight(
      edge,
      metric,
      emergencyMode,
      emergencyVehicle,
      routingProfile
    );
  }

  return {
    algorithmName: "Yen's K-Shortest Path",
    timeComplexity: 'O(K · V · (V + E) log V)',
    spaceComplexity: 'O(K · V)',
    routingProfile,
    found: true,
    sourceId,
    targetId,
    nodePath,
    edgePath,
    routeGeometry: details.routeGeometry,
    segmentSteps: details.segmentSteps,
    totalDistanceMeters: details.totalDistanceMeters,
    totalTimeSeconds: details.totalTimeSeconds,
    totalCost: Number(totalCost.toFixed(1)),
    visitedOrder,
    restrictedRoadsSkipped: 0,
    executionTimeMs,
    steps: [],
  };
}
