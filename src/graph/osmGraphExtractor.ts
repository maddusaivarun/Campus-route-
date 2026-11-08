import {
  CampusGraph,
  GraphEdge,
  GraphNode,
  OSMHighwayType,
} from './Graph';
import {
  calculatePolylineLengthMeters,
  computePolygonCentroid,
  haversineDistanceMeters,
} from './geodesic';
import { AdminCustomPathway } from '../data/campusData';

export interface RawOverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
}

export interface RawOverpassResponse {
  version?: number;
  generator?: string;
  elements: RawOverpassElement[];
}

export interface ExtractedOSMBuilding {
  osmId: string;
  name: string;
  buildingTag: string;
  amenityTag?: string;
  polygon: [number, number][];
  centroid: [number, number];
  tags: Record<string, string>;
}

export interface OSMGraphExtractionResult {
  graph: CampusGraph;
  osmBuildings: ExtractedOSMBuilding[];
  stats: {
    rawElementsCount: number;
    intersectionNodesCount: number;
    directedEdgesCount: number;
    buildingsExtractedCount: number;
  };
}

const VALID_HIGHWAY_TYPES = new Set<string>([
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'service',
  'footway',
  'pedestrian',
  'path',
  'steps',
  'cycleway',
  'unclassified',
]);

function inferHighwayAccessAndSpeed(
  highway: string,
  tags: Record<string, string>
): {
  highwayType: OSMHighwayType;
  maxSpeedKmh: number;
  allowWalking: boolean;
  allowBicycle: boolean;
  allowVehicle: boolean;
  oneWay: boolean;
} {
  const normalized: OSMHighwayType = VALID_HIGHWAY_TYPES.has(highway)
    ? (highway as OSMHighwayType)
    : 'service';

  const parsedSpeed = tags.maxspeed ? parseInt(tags.maxspeed, 10) : NaN;
  const oneWay =
    tags.oneway === 'yes' || tags.oneway === '1' || tags.oneway === 'true';

  const motorVehicleDenied =
    tags.motor_vehicle === 'no' ||
    tags.vehicle === 'no' ||
    tags.access === 'no' ||
    tags.access === 'foot';

  switch (normalized) {
    case 'primary':
    case 'secondary':
      return {
        highwayType: normalized,
        maxSpeedKmh: !Number.isNaN(parsedSpeed) ? parsedSpeed : 50,
        allowWalking: true,
        allowBicycle: true,
        allowVehicle: !motorVehicleDenied,
        oneWay,
      };
    case 'tertiary':
    case 'residential':
    case 'unclassified':
      return {
        highwayType: normalized,
        maxSpeedKmh: !Number.isNaN(parsedSpeed) ? parsedSpeed : 30,
        allowWalking: true,
        allowBicycle: true,
        allowVehicle: !motorVehicleDenied,
        oneWay,
      };
    case 'service':
      return {
        highwayType: 'service',
        maxSpeedKmh: !Number.isNaN(parsedSpeed) ? parsedSpeed : 20,
        allowWalking: true,
        allowBicycle: true,
        allowVehicle: !motorVehicleDenied,
        oneWay,
      };
    case 'pedestrian':
      return {
        highwayType: 'pedestrian',
        maxSpeedKmh: 10,
        allowWalking: true,
        allowBicycle: true,
        allowVehicle: false,
        oneWay,
      };
    case 'cycleway':
      return {
        highwayType: 'cycleway',
        maxSpeedKmh: 18,
        allowWalking: true,
        allowBicycle: true,
        allowVehicle: false,
        oneWay,
      };
    case 'steps':
      return {
        highwayType: 'steps',
        maxSpeedKmh: 4,
        allowWalking: true,
        allowBicycle: false,
        allowVehicle: false,
        oneWay: false,
      };
    case 'footway':
    case 'path':
    default:
      return {
        highwayType: normalized === 'path' ? 'path' : 'footway',
        maxSpeedKmh: 6,
        allowWalking: true,
        allowBicycle: tags.bicycle === 'yes',
        allowVehicle: false,
        oneWay: false,
      };
  }
}

/**
 * Converts raw OpenStreetMap Overpass elements + Admin-verified pathways into a topological CampusGraph
 * and a list of mapped OSM building polygons.
 */
export function extractGraphFromOverpassData(
  overpassData: RawOverpassResponse,
  adminPathways: AdminCustomPathway[] = []
): OSMGraphExtractionResult {
  const graph = new CampusGraph();
  const osmNodesById = new Map<number, { lat: number; lng: number; tags?: Record<string, string> }>();
  const highwayWays: RawOverpassElement[] = [];
  const buildingWays: RawOverpassElement[] = [];

  for (const el of overpassData.elements || []) {
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      osmNodesById.set(el.id, { lat: el.lat, lng: el.lon, tags: el.tags });
    } else if (el.type === 'way' && Array.isArray(el.nodes) && el.nodes.length >= 2) {
      const tags = el.tags || {};
      if (tags.highway) {
        highwayWays.push(el);
      }
      if (tags.building || tags.amenity === 'university' || tags.amenity === 'library') {
        if (tags.building) {
          buildingWays.push(el);
        }
      }
    }
  }

  // Extract OSM Building Footprints & Centroids
  const osmBuildings: ExtractedOSMBuilding[] = [];
  for (const bWay of buildingWays) {
    const coords: [number, number][] = [];
    for (const nid of bWay.nodes || []) {
      const pt = osmNodesById.get(nid);
      if (pt) coords.push([pt.lat, pt.lng]);
    }
    if (coords.length < 3) continue;

    const tags = bWay.tags || {};
    const centroid = computePolygonCentroid(coords);
    osmBuildings.push({
      osmId: `way/${bWay.id}`,
      name: tags.name || tags['name:en'] || `OSM Building #${bWay.id}`,
      buildingTag: tags.building || 'yes',
      amenityTag: tags.amenity,
      polygon: coords,
      centroid,
      tags,
    });
  }

  // Count how many highway ways reference each OSM node so we split ways at true intersections and named entrances
  const nodeUsageCount = new Map<number, number>();
  for (const way of highwayWays) {
    const wayNodes = way.nodes || [];
    wayNodes.forEach((nid, idx) => {
      const prev = nodeUsageCount.get(nid) || 0;
      const pt = osmNodesById.get(nid);
      const hasImportantTag =
        pt?.tags &&
        (pt.tags.name || pt.tags.short_name || pt.tags.barrier || pt.tags.entrance);
      const bump = idx === 0 || idx === wayNodes.length - 1 || hasImportantTag ? 2 : 1;
      nodeUsageCount.set(nid, prev + bump);
    });
  }

  const ensureGraphNodeForOsmId = (nid: number): string | null => {
    const pt = osmNodesById.get(nid);
    if (!pt) return null;
    const graphNodeId = `OSM_N_${nid}`;
    if (!graph.getNode(graphNodeId)) {
      const nTags = pt.tags || {};
      const isGate = nTags.barrier === 'gate' || nTags.entrance !== undefined;
      const nodeName =
        nTags.name ||
        (isGate ? `Campus Gate (${nid})` : `Campus Intersection #${nid}`);
      const shortLabel = nTags.short_name || nTags.ref || `N-${String(nid).slice(-3)}`;

      const newNode: GraphNode = {
        id: graphNodeId,
        name: nodeName,
        shortLabel,
        category: isGate ? 'GATE' : 'INTERSECTION',
        lat: pt.lat,
        lng: pt.lng,
        osmId: `node/${nid}`,
        provenance: 'OPENSTREETMAP',
        isEntrance: isGate,
      };
      graph.addNode(newNode);
    }
    return graphNodeId;
  };

  let edgeSequence = 1;

  for (const way of highwayWays) {
    const wayNodes = way.nodes || [];
    if (wayNodes.length < 2) continue;

    const tags = way.tags || {};
    const accessInfo = inferHighwayAccessAndSpeed(tags.highway || 'service', tags);
    const roadName =
      tags.name ||
      (accessInfo.highwayType === 'footway'
        ? 'Campus Pedestrian Footpath'
        : accessInfo.highwayType === 'steps'
        ? 'Campus Stairway Connector'
        : accessInfo.highwayType === 'service'
        ? 'Campus Internal Road'
        : `VFSTR ${accessInfo.highwayType} Road`);

    let segmentStartIdx = 0;
    for (let i = 1; i < wayNodes.length; i++) {
      const nid = wayNodes[i];
      const isIntersectionOrEnd =
        i === wayNodes.length - 1 || (nodeUsageCount.get(nid) || 0) >= 2;

      if (isIntersectionOrEnd) {
        const startOsmId = wayNodes[segmentStartIdx];
        const endOsmId = wayNodes[i];

        const srcId = ensureGraphNodeForOsmId(startOsmId);
        const tgtId = ensureGraphNodeForOsmId(endOsmId);

        if (srcId && tgtId && srcId !== tgtId) {
          const polyCoords: [number, number][] = [];
          for (let k = segmentStartIdx; k <= i; k++) {
            const c = osmNodesById.get(wayNodes[k]);
            if (c) polyCoords.push([c.lat, c.lng]);
          }

          if (polyCoords.length >= 2) {
            const distMeters = calculatePolylineLengthMeters(polyCoords);
            const speedMps = Math.max(1.4, (accessInfo.maxSpeedKmh * 1000) / 3600);
            const baseTimeSeconds = Math.max(1, Math.round(distMeters / speedMps));

            const forwardEdgeId = `OSM_E_${way.id}_${edgeSequence++}`;
            const forwardEdge: GraphEdge = {
              id: forwardEdgeId,
              source: srcId,
              target: tgtId,
              roadName,
              osmWayId: `way/${way.id}`,
              distanceMeters: distMeters,
              baseTimeSeconds,
              maxSpeedKmh: accessInfo.maxSpeedKmh,
              highwayType: accessInfo.highwayType,
              allowWalking: accessInfo.allowWalking,
              allowBicycle: accessInfo.allowBicycle,
              allowVehicle: accessInfo.allowVehicle,
              oneWay: accessInfo.oneWay,
              congestionFactor: 1.0,
              status: 'OPEN',
              geometry: polyCoords,
              provenance: 'OPENSTREETMAP',
            };
            graph.addEdge(forwardEdge);

            if (!accessInfo.oneWay) {
              const reverseEdgeId = `${forwardEdgeId}_REV`;
              const reverseEdge: GraphEdge = {
                ...forwardEdge,
                id: reverseEdgeId,
                source: tgtId,
                target: srcId,
                geometry: [...polyCoords].reverse(),
              };
              graph.addEdge(reverseEdge);
            }
          }
        }
        segmentStartIdx = i;
      }
    }
  }

  // Integrate Admin-Verified Custom Pathways & Snap Endpoints to Nearest Existing Intersections (within 28m)
  for (const custom of adminPathways) {
    if (!custom.geometry || custom.geometry.length < 2) continue;
    const startCoord = custom.geometry[0];
    const endCoord = custom.geometry[custom.geometry.length - 1];

    const findOrCreateSnapNode = (coord: [number, number], suffix: string): string => {
      let closestId: string | null = null;
      let closestDist = Infinity;
      for (const existing of graph.getAllNodes()) {
        const d = haversineDistanceMeters(coord[0], coord[1], existing.lat, existing.lng);
        if (d < closestDist) {
          closestDist = d;
          closestId = existing.id;
        }
      }
      if (closestId && closestDist <= 28) {
        return closestId;
      }
      const newId = `ADMIN_N_${custom.id}_${suffix}`;
      if (!graph.getNode(newId)) {
        graph.addNode({
          id: newId,
          name: `${custom.name} (${suffix})`,
          shortLabel: `ADM-${suffix}`,
          category: 'INTERSECTION',
          lat: coord[0],
          lng: coord[1],
          provenance: 'ADMIN_VERIFIED',
        });
      }
      return newId;
    };

    const srcId = findOrCreateSnapNode(startCoord, 'A');
    const tgtId = findOrCreateSnapNode(endCoord, 'B');
    if (srcId === tgtId) continue;

    const distMeters = calculatePolylineLengthMeters(custom.geometry);
    const maxSpeedKmh = custom.allowVehicle ? 20 : 6;
    const baseTimeSeconds = Math.max(
      1,
      Math.round(distMeters / ((maxSpeedKmh * 1000) / 3600))
    );

    const fEdge: GraphEdge = {
      id: `ADMIN_E_${custom.id}`,
      source: srcId,
      target: tgtId,
      roadName: custom.name,
      distanceMeters: distMeters,
      baseTimeSeconds,
      maxSpeedKmh,
      highwayType: custom.highwayType,
      allowWalking: custom.allowWalking,
      allowBicycle: custom.allowBicycle,
      allowVehicle: custom.allowVehicle,
      oneWay: custom.oneWay,
      congestionFactor: 1.0,
      status: 'OPEN',
      geometry: custom.geometry,
      provenance: 'ADMIN_VERIFIED',
    };
    graph.addEdge(fEdge);

    if (!custom.oneWay) {
      graph.addEdge({
        ...fEdge,
        id: `ADMIN_E_${custom.id}_REV`,
        source: tgtId,
        target: srcId,
        geometry: [...custom.geometry].reverse(),
      });
    }
  }

  return {
    graph,
    osmBuildings,
    stats: {
      rawElementsCount: (overpassData.elements || []).length,
      intersectionNodesCount: graph.getAllNodes().length,
      directedEdgesCount: graph.getAllEdges().length,
      buildingsExtractedCount: osmBuildings.length,
    },
  };
}
