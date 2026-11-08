import { haversineDistanceMeters } from './geodesic';

export type NodeCategory =
  | 'ACADEMIC'
  | 'ADMINISTRATION'
  | 'HOSTEL'
  | 'DINING'
  | 'LIBRARY'
  | 'GATE'
  | 'INTERSECTION'
  | 'MEDICAL'
  | 'AMENITY';

export type RoadStatus = 'OPEN' | 'CONGESTED' | 'ACCIDENT' | 'CLOSED';

export type OptimizationMetric = 'TIME' | 'DISTANCE';

export type RoutingProfile = 'WALKING' | 'BICYCLE' | 'VEHICLE';

export type EmergencyVehicleType = 'NONE' | 'AMBULANCE' | 'FIRE_TRUCK' | 'POLICE';

export type OSMHighwayType =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'residential'
  | 'service'
  | 'footway'
  | 'pedestrian'
  | 'path'
  | 'steps'
  | 'cycleway'
  | 'unclassified';

export type DataProvenance = 'GOOGLE_MAPS' | 'OPENSTREETMAP' | 'ADMIN_VERIFIED';

export interface GraphNode {
  id: string;
  name: string;
  shortLabel: string;
  category: NodeCategory;
  /** Actual WGS84 Latitude */
  lat: number;
  /** Actual WGS84 Longitude */
  lng: number;
  osmId?: string;
  provenance: DataProvenance;
  buildingId?: string;
  isEntrance?: boolean;
  description?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  roadName: string;
  osmWayId?: string;
  /** Geodesic distance in meters calculated from actual road polyline geometry */
  distanceMeters: number;
  /** Free-flow vehicle or pedestrian baseline traversal time in seconds */
  baseTimeSeconds: number;
  /** Maximum speed in km/h derived from OSM highway classification */
  maxSpeedKmh: number;
  highwayType: OSMHighwayType;
  /** Access permissions based on OSM tags */
  allowWalking: boolean;
  allowBicycle: boolean;
  allowVehicle: boolean;
  oneWay: boolean;
  /** Dynamic traffic/incident multiplier: 1.0 = normal flow */
  congestionFactor: number;
  status: RoadStatus;
  incidentReport?: string;
  /** Actual geographic polyline coordinates [[lat, lng], ...] */
  geometry: [number, number][];
  provenance: DataProvenance;
}

/**
 * Checks whether an edge is physically and legally traversable for the given RoutingProfile and Emergency Mode.
 * Emergency vehicles (Ambulance, Fire Truck, Police) CANNOT illegally traverse stairs ('steps') or narrow footpaths ('footway').
 */
export function isEdgeTraversableForProfile(
  edge: GraphEdge,
  profile: RoutingProfile,
  emergencyMode: boolean = false,
  emergencyVehicle: EmergencyVehicleType = 'NONE'
): boolean {
  if (edge.status === 'CLOSED' && !emergencyMode) {
    return false;
  }

  if (emergencyMode && emergencyVehicle !== 'NONE') {
    if (edge.highwayType === 'steps' || edge.highwayType === 'footway') {
      return false;
    }
    if (edge.highwayType === 'pedestrian') {
      return emergencyVehicle === 'AMBULANCE' || emergencyVehicle === 'POLICE';
    }
    return edge.allowVehicle;
  }

  if (profile === 'WALKING') {
    return edge.allowWalking;
  }
  if (profile === 'BICYCLE') {
    return edge.allowBicycle && edge.highwayType !== 'steps';
  }
  return edge.allowVehicle;
}

export interface NetworkConnectivityReport {
  isFullyConnected: boolean;
  componentCount: number;
  largestComponentSize: number;
  totalNodes: number;
  disconnectedNodeIds: string[];
  inaccessibleEdgeIds: string[];
  closedEdgeIds: string[];
  walkableCoverageMeters: number;
  vehicleCoverageMeters: number;
}

/**
 * Calculates travel time in seconds for a specific routing profile and emergency vehicle configuration.
 */
export function calculateRoadTravelTime(
  edge: GraphEdge,
  profile: RoutingProfile = 'WALKING',
  emergencyMode: boolean = false,
  emergencyVehicle: EmergencyVehicleType = 'NONE',
  customWalkingSpeedMps: number = 1.4
): number {
  if (!isEdgeTraversableForProfile(edge, profile, emergencyMode, emergencyVehicle)) {
    return Infinity;
  }

  if (profile === 'WALKING' && !emergencyMode) {
    const safeWalkSpeed = Math.max(0.5, Math.min(3.5, customWalkingSpeedMps || 1.4));
    const walkSpeedMps = edge.highwayType === 'steps' ? safeWalkSpeed * 0.68 : safeWalkSpeed;
    const walkCongestion = edge.status === 'ACCIDENT' ? 1.35 : 1.0 + Math.max(0, (edge.congestionFactor - 1) * 0.2);
    return Math.max(1, Math.round((edge.distanceMeters / walkSpeedMps) * walkCongestion));
  }

  if (profile === 'BICYCLE' && !emergencyMode) {
    const bikeSpeedMps = 4.2;
    const bikeCongestion = edge.status === 'ACCIDENT' ? 1.6 : 1.0 + Math.max(0, (edge.congestionFactor - 1) * 0.4);
    return Math.max(1, Math.round((edge.distanceMeters / bikeSpeedMps) * bikeCongestion));
  }

  const speedMps = Math.max(2.5, (edge.maxSpeedKmh * 1000) / 3600);
  const rawBaseSeconds = edge.distanceMeters / speedMps;

  if (emergencyMode && emergencyVehicle !== 'NONE') {
    const vehicleBonus =
      emergencyVehicle === 'AMBULANCE'
        ? 0.72
        : emergencyVehicle === 'FIRE_TRUCK'
        ? 0.78
        : 0.7;
    const mitigatedCongestion = 1 + (edge.congestionFactor - 1) * 0.18;
    const closureBypassPenalty = edge.status === 'CLOSED' ? 1.4 : 1.0;
    return Math.max(
      1,
      Math.round(rawBaseSeconds * mitigatedCongestion * vehicleBonus * closureBypassPenalty)
    );
  }

  const accidentPenalty = edge.status === 'ACCIDENT' ? 2.4 : 1.0;
  return Math.max(1, Math.round(rawBaseSeconds * edge.congestionFactor * accidentPenalty));
}

/**
 * Weighted Directed Graph implemented with an Adjacency List (`Map<string, GraphEdge[]>`)
 * and HashMap vertex/edge lookup tables (`Map<string, GraphNode>`, `Map<string, GraphEdge>`).
 */
export class CampusGraph {
  private nodes: Map<string, GraphNode>;
  private adjacencyList: Map<string, GraphEdge[]>;
  private edgesById: Map<string, GraphEdge>;
  private walkingSpeedMps: number;

  constructor(walkingSpeedMps: number = 1.4) {
    this.nodes = new Map<string, GraphNode>();
    this.adjacencyList = new Map<string, GraphEdge[]>();
    this.edgesById = new Map<string, GraphEdge>();
    this.walkingSpeedMps = Math.max(0.5, Math.min(3.5, walkingSpeedMps));
  }

  setWalkingSpeedMps(speedMps: number): void {
    if (Number.isFinite(speedMps)) {
      this.walkingSpeedMps = Math.max(0.5, Math.min(3.5, speedMps));
    }
  }

  getWalkingSpeedMps(): number {
    return this.walkingSpeedMps;
  }

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, { ...node });
    if (!this.adjacencyList.has(node.id)) {
      this.adjacencyList.set(node.id, []);
    }
  }

  addEdge(edge: GraphEdge): void {
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
      throw new Error(
        `Cannot add edge ${edge.id}: missing endpoint (${edge.source} -> ${edge.target})`
      );
    }
    const edgeCopy: GraphEdge = {
      ...edge,
      geometry: edge.geometry.map((pt) => [pt[0], pt[1]] as [number, number]),
    };
    this.edgesById.set(edgeCopy.id, edgeCopy);
    const list = this.adjacencyList.get(edgeCopy.source) || [];
    const existingIndex = list.findIndex((e) => e.id === edgeCopy.id);
    if (existingIndex >= 0) {
      list[existingIndex] = edgeCopy;
    } else {
      list.push(edgeCopy);
    }
    this.adjacencyList.set(edgeCopy.source, list);
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  getOutgoingEdges(nodeId: string): GraphEdge[] {
    return this.adjacencyList.get(nodeId) || [];
  }

  getEdge(edgeId: string): GraphEdge | undefined {
    return this.edgesById.get(edgeId);
  }

  getAllEdges(): GraphEdge[] {
    return Array.from(this.edgesById.values());
  }

  getUniqueUndirectedEdges(): GraphEdge[] {
    const seenPairs = new Set<string>();
    const unique: GraphEdge[] = [];
    for (const edge of this.edgesById.values()) {
      const pairKey = [edge.source, edge.target].sort().join('::') + '::' + edge.roadName;
      if (!seenPairs.has(pairKey)) {
        seenPairs.add(pairKey);
        unique.push(edge);
      }
    }
    return unique;
  }

  updateNodeCoordinates(
    nodeId: string,
    lat: number,
    lng: number,
    provenance: DataProvenance = 'GOOGLE_MAPS'
  ): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.lat = lat;
    node.lng = lng;
    node.provenance = provenance;
    this.nodes.set(nodeId, node);

    for (const edge of this.edgesById.values()) {
      if (edge.source === nodeId || edge.target === nodeId) {
        const s = this.nodes.get(edge.source);
        const t = this.nodes.get(edge.target);
        if (!s || !t) continue;
        const nextGeom: [number, number][] =
          edge.geometry.length > 2
            ? [
                [s.lat, s.lng],
                ...edge.geometry.slice(1, -1),
                [t.lat, t.lng],
              ]
            : [
                [s.lat, s.lng],
                [t.lat, t.lng],
              ];
        let totalDist = 0;
        for (let i = 0; i < nextGeom.length - 1; i++) {
          totalDist += haversineDistanceMeters(
            nextGeom[i][0],
            nextGeom[i][1],
            nextGeom[i + 1][0],
            nextGeom[i + 1][1]
          );
        }
        const distMeters = Math.max(10, Math.round(totalDist));
        const speedMps = Math.max(1.4, (edge.maxSpeedKmh * 1000) / 3600);
        const baseSec = Math.max(2, Math.round(distMeters / speedMps));

        const updatedEdge: GraphEdge = {
          ...edge,
          geometry: nextGeom,
          distanceMeters: distMeters,
          baseTimeSeconds: baseSec,
          provenance,
        };
        this.edgesById.set(edge.id, updatedEdge);
        const srcList = this.adjacencyList.get(edge.source);
        if (srcList) {
          const idx = srcList.findIndex((e) => e.id === edge.id);
          if (idx >= 0) srcList[idx] = updatedEdge;
        }
      }
    }
  }

  updateEdgeGeometry(
    edgeId: string,
    updates: {
      geometry?: [number, number][];
      distanceMeters?: number;
      baseTimeSeconds?: number;
      roadName?: string;
      provenance?: DataProvenance;
    }
  ): void {
    const existing = this.edgesById.get(edgeId);
    if (!existing) return;
    const updated: GraphEdge = {
      ...existing,
      ...updates,
      geometry: updates.geometry
        ? updates.geometry.map((pt) => [pt[0], pt[1]] as [number, number])
        : existing.geometry,
    };
    this.edgesById.set(edgeId, updated);
    const sourceEdges = this.adjacencyList.get(existing.source);
    if (sourceEdges) {
      const idx = sourceEdges.findIndex((e) => e.id === edgeId);
      if (idx >= 0) {
        sourceEdges[idx] = updated;
      }
    }
  }

  updateEdgeCondition(
    edgeId: string,
    updates: Partial<Pick<GraphEdge, 'congestionFactor' | 'status' | 'incidentReport'>>
  ): void {
    const existing = this.edgesById.get(edgeId);
    if (!existing) return;
    const updated: GraphEdge = { ...existing, ...updates };
    this.edgesById.set(edgeId, updated);

    const sourceEdges = this.adjacencyList.get(existing.source);
    if (sourceEdges) {
      const idx = sourceEdges.findIndex((e) => e.id === edgeId);
      if (idx >= 0) {
        sourceEdges[idx] = updated;
      }
    }
  }

  resetAllConditions(): void {
    for (const edge of this.edgesById.values()) {
      this.updateEdgeCondition(edge.id, {
        congestionFactor: 1.0,
        status: 'OPEN',
        incidentReport: undefined,
      });
    }
  }

  getEffectiveEdgeWeight(
    edge: GraphEdge,
    metric: OptimizationMetric,
    emergencyMode: boolean = false,
    emergencyVehicle: EmergencyVehicleType = 'NONE',
    profile: RoutingProfile = 'WALKING'
  ): number {
    if (!isEdgeTraversableForProfile(edge, profile, emergencyMode, emergencyVehicle)) {
      return Infinity;
    }

    if (metric === 'DISTANCE') {
      return edge.distanceMeters;
    }

    return calculateRoadTravelTime(
      edge,
      profile,
      emergencyMode,
      emergencyVehicle,
      this.walkingSpeedMps
    );
  }

  /**
   * Finds the nearest graph node to an arbitrary (lat, lng) coordinate that supports the requested routing profile.
   */
  findNearestNode(
    lat: number,
    lng: number,
    profile?: RoutingProfile
  ): GraphNode | undefined {
    let bestNode: GraphNode | undefined;
    let bestDist = Infinity;

    for (const node of this.nodes.values()) {
      if (profile) {
        const outEdges = this.getOutgoingEdges(node.id);
        const hasValidEdge = outEdges.some((e) =>
          isEdgeTraversableForProfile(e, profile, false, 'NONE')
        );
        if (!hasValidEdge && outEdges.length > 0) continue;
      }
      const d = haversineDistanceMeters(lat, lng, node.lat, node.lng);
      if (d < bestDist) {
        bestDist = d;
        bestNode = node;
      }
    }

    if (!bestNode) {
      for (const node of this.nodes.values()) {
        const d = haversineDistanceMeters(lat, lng, node.lat, node.lng);
        if (d < bestDist) {
          bestDist = d;
          bestNode = node;
        }
      }
    }

    return bestNode;
  }

  /**
   * Inspects road and footpath network coverage, validates graph connectivity via BFS components,
   * and identifies disconnected nodes and closed/inaccessible segments.
   */
  analyzeNetworkConnectivity(profile: RoutingProfile = 'WALKING'): NetworkConnectivityReport {
    const allNodes = this.getAllNodes();
    const uniqueEdges = this.getUniqueUndirectedEdges();
    const visited = new Set<string>();
    const components: string[][] = [];

    for (const startNode of allNodes) {
      if (visited.has(startNode.id)) continue;
      const comp: string[] = [];
      const queue: string[] = [startNode.id];
      visited.add(startNode.id);

      while (queue.length > 0) {
        const u = queue.shift()!;
        comp.push(u);
        const out = this.getOutgoingEdges(u);
        for (const edge of out) {
          if (!isEdgeTraversableForProfile(edge, profile, false, 'NONE')) continue;
          if (!visited.has(edge.target)) {
            visited.add(edge.target);
            queue.push(edge.target);
          }
        }
      }
      components.push(comp);
    }

    components.sort((a, b) => b.length - a.length);
    const largest = components[0] || [];
    const largestSet = new Set(largest);
    const disconnectedNodeIds = allNodes
      .filter((n) => !largestSet.has(n.id))
      .map((n) => n.id);

    const closedEdgeIds: string[] = [];
    const inaccessibleEdgeIds: string[] = [];
    let walkableCoverageMeters = 0;
    let vehicleCoverageMeters = 0;

    for (const edge of uniqueEdges) {
      if (edge.status === 'CLOSED') {
        closedEdgeIds.push(edge.id);
      }
      if (!isEdgeTraversableForProfile(edge, profile, false, 'NONE')) {
        inaccessibleEdgeIds.push(edge.id);
      }
      if (edge.allowWalking && edge.status !== 'CLOSED') {
        walkableCoverageMeters += edge.distanceMeters;
      }
      if (edge.allowVehicle && edge.status !== 'CLOSED') {
        vehicleCoverageMeters += edge.distanceMeters;
      }
    }

    return {
      isFullyConnected: components.length <= 1 && disconnectedNodeIds.length === 0,
      componentCount: components.length,
      largestComponentSize: largest.length,
      totalNodes: allNodes.length,
      disconnectedNodeIds,
      inaccessibleEdgeIds,
      closedEdgeIds,
      walkableCoverageMeters: Math.round(walkableCoverageMeters),
      vehicleCoverageMeters: Math.round(vehicleCoverageMeters),
    };
  }

  cloneWithoutEdges(excludedEdgeIds: Set<string>, excludedNodeIds: Set<string>): CampusGraph {
    const clone = new CampusGraph(this.walkingSpeedMps);
    for (const node of this.nodes.values()) {
      if (!excludedNodeIds.has(node.id)) {
        clone.addNode(node);
      }
    }
    for (const edge of this.edgesById.values()) {
      if (
        !excludedEdgeIds.has(edge.id) &&
        !excludedNodeIds.has(edge.source) &&
        !excludedNodeIds.has(edge.target)
      ) {
        clone.addEdge(edge);
      }
    }
    return clone;
  }
}
