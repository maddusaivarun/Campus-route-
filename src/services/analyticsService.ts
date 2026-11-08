import { CampusGraph, RoutingProfile } from '../graph/Graph';
import { CampusBuildingEntry, IncidentRecord } from '../data/campusData';
import { RoutingEngine } from './routingEngine';

export interface RoadHealthDatum {
  roadName: string;
  highwayType: string;
  distanceMeters: number;
  baseTimeSeconds: number;
  effectiveTimeSeconds: number;
  congestionPercent: number;
  status: string;
  allowVehicle: boolean;
  allowWalking: boolean;
  provenance: string;
}

export interface AlgorithmBenchmarkDatum {
  algorithm: string;
  visitedNodes: number;
  distanceMeters: number;
  travelTimeSeconds: number;
  executionTimeMs: number;
  optimalityGuaranteed: string;
}

export interface NetworkSummaryMetrics {
  totalIntersections: number;
  totalUniqueSegments: number;
  totalNetworkLengthKm: number;
  walkableSegmentsCount: number;
  vehicleSegmentsCount: number;
  openSegmentsCount: number;
  congestedSegmentsCount: number;
  closedSegmentsCount: number;
  verifiedBuildingsCount: number;
  osmMappedBuildingsCount: number;
  activeUserIncidentsCount: number;
  adminConfirmedIncidentsCount: number;
  averageCongestionMultiplier: number;
  networkHealthScore: number;
}

export class AnalyticsService {
  static getNetworkSummary(
    graph: CampusGraph,
    buildings: CampusBuildingEntry[],
    incidents: IncidentRecord[]
  ): NetworkSummaryMetrics {
    const nodes = graph.getAllNodes();
    const uniqueEdges = graph.getUniqueUndirectedEdges();

    let totalMeters = 0;
    let walkableCount = 0;
    let vehicleCount = 0;
    let openCount = 0;
    let congestedCount = 0;
    let closedCount = 0;
    let congestionSum = 0;

    for (const edge of uniqueEdges) {
      totalMeters += edge.distanceMeters;
      if (edge.allowWalking) walkableCount++;
      if (edge.allowVehicle) vehicleCount++;
      if (edge.status === 'OPEN') openCount++;
      else if (edge.status === 'CLOSED') closedCount++;
      else congestedCount++;
      congestionSum += edge.congestionFactor;
    }

    const avgCongestion = uniqueEdges.length > 0 ? congestionSum / uniqueEdges.length : 1.0;
    const penalty = closedCount * 12 + congestedCount * 5 + Math.max(0, (avgCongestion - 1) * 15);
    const networkHealthScore = Math.max(15, Math.min(100, Math.round(100 - penalty)));

    const verifiedBuildingsCount = buildings.filter((b) => b.verificationStatus === 'ADMIN_VERIFIED').length;
    const osmMappedBuildingsCount = buildings.filter((b) => b.verificationStatus === 'OSM_MAPPED').length;

    const activeUserIncidentsCount = incidents.filter(
      (i) => i.category === 'USER_REPORTED' && i.verificationStatus !== 'RESOLVED' && i.verificationStatus !== 'REJECTED'
    ).length;
    const adminConfirmedIncidentsCount = incidents.filter(
      (i) => i.verificationStatus === 'ADMIN_CONFIRMED'
    ).length;

    return {
      totalIntersections: nodes.length,
      totalUniqueSegments: uniqueEdges.length,
      totalNetworkLengthKm: Number((totalMeters / 1000).toFixed(2)),
      walkableSegmentsCount: walkableCount,
      vehicleSegmentsCount: vehicleCount,
      openSegmentsCount: openCount,
      congestedSegmentsCount: congestedCount,
      closedSegmentsCount: closedCount,
      verifiedBuildingsCount,
      osmMappedBuildingsCount,
      activeUserIncidentsCount,
      adminConfirmedIncidentsCount,
      averageCongestionMultiplier: Number(avgCongestion.toFixed(2)),
      networkHealthScore,
    };
  }

  static getRoadHealthBreakdown(graph: CampusGraph): RoadHealthDatum[] {
    const uniqueEdges = graph.getUniqueUndirectedEdges();
    return uniqueEdges.map((edge) => {
      const effectiveTime =
        edge.status === 'CLOSED'
          ? edge.baseTimeSeconds * 5
          : Math.round(edge.baseTimeSeconds * edge.congestionFactor);
      const congestionPercent = Math.min(
        100,
        Math.round(((edge.congestionFactor - 1.0) / 2.5) * 100 + (edge.status === 'CLOSED' ? 100 : 22))
      );

      return {
        roadName: edge.roadName,
        highwayType: edge.highwayType,
        distanceMeters: edge.distanceMeters,
        baseTimeSeconds: edge.baseTimeSeconds,
        effectiveTimeSeconds: effectiveTime,
        congestionPercent,
        status: edge.status,
        allowVehicle: edge.allowVehicle,
        allowWalking: edge.allowWalking,
        provenance: edge.provenance,
      };
    });
  }

  static getAlgorithmBenchmarkTable(
    graph: CampusGraph,
    sourceNodeId: string,
    targetNodeId: string,
    routingProfile: RoutingProfile = 'WALKING'
  ): AlgorithmBenchmarkDatum[] {
    const comp = RoutingEngine.compareAllAlgorithms(
      graph,
      sourceNodeId,
      targetNodeId,
      'TIME',
      false,
      'NONE',
      routingProfile
    );

    return [
      {
        algorithm: "Dijkstra's Shortest Path",
        visitedNodes: comp.dijkstra.visitedOrder.length,
        distanceMeters: comp.dijkstra.totalDistanceMeters,
        travelTimeSeconds: comp.dijkstra.totalTimeSeconds,
        executionTimeMs: comp.dijkstra.executionTimeMs,
        optimalityGuaranteed: 'Optimal (Weighted Time/Dist)',
      },
      {
        algorithm: 'A* Geodesic Search',
        visitedNodes: comp.astar.visitedOrder.length,
        distanceMeters: comp.astar.totalDistanceMeters,
        travelTimeSeconds: comp.astar.totalTimeSeconds,
        executionTimeMs: comp.astar.executionTimeMs,
        optimalityGuaranteed: 'Optimal + Haversine Pruning',
      },
      {
        algorithm: 'Breadth-First Search (BFS)',
        visitedNodes: comp.bfs.visitedOrder.length,
        distanceMeters: comp.bfs.totalDistanceMeters,
        travelTimeSeconds: comp.bfs.totalTimeSeconds,
        executionTimeMs: comp.bfs.executionTimeMs,
        optimalityGuaranteed: 'Minimum Hop Count Only',
      },
      {
        algorithm: 'Depth-First Search (DFS)',
        visitedNodes: comp.dfs.visitedOrder.length,
        distanceMeters: comp.dfs.totalDistanceMeters,
        travelTimeSeconds: comp.dfs.totalTimeSeconds,
        executionTimeMs: comp.dfs.executionTimeMs,
        optimalityGuaranteed: 'Non-Optimal (Deep Traversal)',
      },
    ];
  }
}
