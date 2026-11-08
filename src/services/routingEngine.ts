import { CampusGraph, OptimizationMetric, EmergencyVehicleType, RoutingProfile } from '../graph/Graph';
import { runDijkstra, AlgorithmExecutionResult } from '../algorithms/dijkstra';
import { runAStar } from '../algorithms/astar';
import { runBFS } from '../algorithms/bfs';
import { runDFS } from '../algorithms/dfs';
import { runYenKShortestPaths, AlternativeRouteCandidate } from '../algorithms/yenKShortest';

export type RoutingAlgorithmType = 'DIJKSTRA' | 'ASTAR' | 'BFS' | 'DFS';

export interface RouteRequestOptions {
  sourceNodeId: string;
  targetNodeId: string;
  algorithm: RoutingAlgorithmType;
  metric: OptimizationMetric;
  routingProfile?: RoutingProfile;
  emergencyMode?: boolean;
  emergencyVehicle?: EmergencyVehicleType;
}

export interface MultiAlgorithmBenchmark {
  dijkstra: AlgorithmExecutionResult;
  astar: AlgorithmExecutionResult;
  bfs: AlgorithmExecutionResult;
  dfs: AlgorithmExecutionResult;
  kShortestAlternatives: AlternativeRouteCandidate[];
}

export class RoutingEngine {
  /**
   * Executes the selected graph search algorithm on the real geographic VFSTR CampusGraph.
   */
  static computeRoute(graph: CampusGraph, options: RouteRequestOptions): AlgorithmExecutionResult {
    const {
      sourceNodeId,
      targetNodeId,
      algorithm,
      metric,
      routingProfile = 'WALKING',
      emergencyMode = false,
      emergencyVehicle = 'NONE',
    } = options;

    switch (algorithm) {
      case 'DIJKSTRA':
        return runDijkstra(
          graph,
          sourceNodeId,
          targetNodeId,
          metric,
          emergencyMode,
          emergencyVehicle,
          routingProfile
        );
      case 'ASTAR':
        return runAStar(
          graph,
          sourceNodeId,
          targetNodeId,
          metric,
          emergencyMode,
          emergencyVehicle,
          routingProfile
        );
      case 'BFS':
        return runBFS(graph, sourceNodeId, targetNodeId, emergencyMode, routingProfile, emergencyVehicle);
      case 'DFS':
        return runDFS(graph, sourceNodeId, targetNodeId, emergencyMode, routingProfile, emergencyVehicle);
      default:
        return runDijkstra(
          graph,
          sourceNodeId,
          targetNodeId,
          metric,
          emergencyMode,
          emergencyVehicle,
          routingProfile
        );
    }
  }

  /**
   * Runs all 4 core DSA algorithms + Yen's K-Shortest Paths side-by-side on the same real campus network
   * for empirical comparison and algorithm complexity verification.
   */
  static compareAllAlgorithms(
    graph: CampusGraph,
    sourceNodeId: string,
    targetNodeId: string,
    metric: OptimizationMetric = 'TIME',
    emergencyMode: boolean = false,
    emergencyVehicle: EmergencyVehicleType = 'NONE',
    routingProfile: RoutingProfile = 'WALKING'
  ): MultiAlgorithmBenchmark {
    const dijkstra = runDijkstra(
      graph,
      sourceNodeId,
      targetNodeId,
      metric,
      emergencyMode,
      emergencyVehicle,
      routingProfile
    );
    const astar = runAStar(
      graph,
      sourceNodeId,
      targetNodeId,
      metric,
      emergencyMode,
      emergencyVehicle,
      routingProfile
    );
    const bfs = runBFS(graph, sourceNodeId, targetNodeId, emergencyMode, routingProfile, emergencyVehicle);
    const dfs = runDFS(graph, sourceNodeId, targetNodeId, emergencyMode, routingProfile, emergencyVehicle);

    const kShortestAlternatives = runYenKShortestPaths(
      graph,
      sourceNodeId,
      targetNodeId,
      3,
      metric,
      emergencyMode,
      emergencyVehicle,
      routingProfile
    );

    return {
      dijkstra,
      astar,
      bfs,
      dfs,
      kShortestAlternatives,
    };
  }
}
