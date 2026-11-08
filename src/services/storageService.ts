import {
  IncidentRecord,
  AdminCustomPathway,
  CampusBuildingEntry,
  INITIAL_INCIDENTS,
  INITIAL_ADMIN_PATHWAYS,
} from '../data/campusData';
import { EmergencyVehicleType, OptimizationMetric, RoutingProfile, CampusGraph } from '../graph/Graph';
import { RoutingAlgorithmType } from './routingEngine';

export interface RouteHistoryEntry {
  id: string;
  timestamp: string;
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  algorithm: RoutingAlgorithmType;
  metric: OptimizationMetric;
  routingProfile: RoutingProfile;
  emergencyMode: boolean;
  emergencyVehicle: EmergencyVehicleType;
  distanceMeters: number;
  timeSeconds: number;
  visitedCount: number;
}

export interface EmergencyDispatchLog {
  id: string;
  timestamp: string;
  vehicleType: EmergencyVehicleType;
  originName: string;
  destinationName: string;
  standardTimeSeconds: number;
  emergencyTimeSeconds: number;
  timeSavedSeconds: number;
  distanceMeters: number;
  restrictedFootpathsAvoided: number;
  routeSummary: string;
}

export interface PersistedAppState {
  incidents: IncidentRecord[];
  adminPathways: AdminCustomPathway[];
  routeHistory: RouteHistoryEntry[];
  dispatchLogs: EmergencyDispatchLog[];
  defaultAlgorithm: RoutingAlgorithmType;
  defaultMetric: OptimizationMetric;
  defaultRoutingProfile: RoutingProfile;
}

const STORAGE_KEY = 'resqroute_v2_vfstr_state';

export class StorageService {
  static loadState(): PersistedAppState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return this.getDefaultState();
      }
      const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
      return {
        incidents: Array.isArray(parsed.incidents) ? parsed.incidents : INITIAL_INCIDENTS,
        adminPathways: Array.isArray(parsed.adminPathways) ? parsed.adminPathways : INITIAL_ADMIN_PATHWAYS,
        routeHistory: Array.isArray(parsed.routeHistory) ? parsed.routeHistory : [],
        dispatchLogs: Array.isArray(parsed.dispatchLogs) ? parsed.dispatchLogs : [],
        defaultAlgorithm: parsed.defaultAlgorithm || 'ASTAR',
        defaultMetric: parsed.defaultMetric || 'TIME',
        defaultRoutingProfile: parsed.defaultRoutingProfile || 'WALKING',
      };
    } catch {
      return this.getDefaultState();
    }
  }

  static saveState(state: Partial<PersistedAppState>): void {
    try {
      const current = this.loadState();
      const merged: PersistedAppState = {
        ...current,
        ...state,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Ignore storage quota errors
    }
  }

  static resetToDefaults(): PersistedAppState {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    return this.getDefaultState();
  }

  static getDefaultState(): PersistedAppState {
    return {
      incidents: [...INITIAL_INCIDENTS],
      adminPathways: [...INITIAL_ADMIN_PATHWAYS],
      routeHistory: [],
      dispatchLogs: [],
      defaultAlgorithm: 'ASTAR',
      defaultMetric: 'TIME',
      defaultRoutingProfile: 'WALKING',
    };
  }

  /**
   * Exports verified campus buildings, administrator pathways, and active road network as standard RFC 7946 GeoJSON.
   */
  static exportCampusGeoJSON(
    buildings: CampusBuildingEntry[],
    adminPathways: AdminCustomPathway[],
    graph: CampusGraph,
    incidents: IncidentRecord[]
  ): string {
    const features: Array<Record<string, unknown>> = [];

    for (const b of buildings) {
      features.push({
        type: 'Feature',
        id: b.id,
        geometry: {
          type: 'Point',
          coordinates: [b.lng, b.lat],
        },
        properties: {
          featureCategory: 'CAMPUS_BUILDING',
          id: b.id,
          name: b.name,
          shortName: b.shortName,
          officialName: b.officialName,
          category: b.category,
          dataSource: b.dataSource,
          verificationStatus: b.verificationStatus,
          osmFeatureId: b.osmFeatureId,
          surveyNumber: b.surveyNumber,
          description: b.description,
        },
      });
    }

    for (const p of adminPathways) {
      features.push({
        type: 'Feature',
        id: p.id,
        geometry: {
          type: 'LineString',
          coordinates: p.geometry.map(([lat, lng]) => [lng, lat]),
        },
        properties: {
          featureCategory: 'ADMIN_PATHWAY',
          id: p.id,
          name: p.name,
          highwayType: p.highwayType,
          allowWalking: p.allowWalking,
          allowBicycle: p.allowBicycle,
          allowVehicle: p.allowVehicle,
          oneWay: p.oneWay,
          verifiedBy: p.verifiedBy,
          createdAt: p.createdAt,
        },
      });
    }

    for (const edge of graph.getUniqueUndirectedEdges()) {
      features.push({
        type: 'Feature',
        id: edge.id,
        geometry: {
          type: 'LineString',
          coordinates: edge.geometry.map(([lat, lng]) => [lng, lat]),
        },
        properties: {
          featureCategory: 'CAMPUS_ROAD_SEGMENT',
          id: edge.id,
          roadName: edge.roadName,
          osmWayId: edge.osmWayId,
          highwayType: edge.highwayType,
          distanceMeters: edge.distanceMeters,
          status: edge.status,
          allowWalking: edge.allowWalking,
          allowBicycle: edge.allowBicycle,
          allowVehicle: edge.allowVehicle,
          provenance: edge.provenance,
        },
      });
    }

    const geojson = {
      type: 'FeatureCollection',
      metadata: {
        system: 'ResQRoute 2.0 — Real VFSTR Campus Navigation',
        campus: "Vignan's Foundation for Science, Technology and Research (VFSTR), Vadlamudi, Guntur, AP 522213",
        exportedAt: new Date().toISOString(),
        incidentCount: incidents.length,
      },
      features,
    };

    return JSON.stringify(geojson, null, 2);
  }
}
