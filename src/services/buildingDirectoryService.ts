import {
  CampusBuildingEntry,
  INITIAL_BUILDING_CATALOG,
} from '../data/campusData';
import { CampusGraph } from '../graph/Graph';
import { ExtractedOSMBuilding } from '../graph/osmGraphExtractor';
import { haversineDistanceMeters } from '../graph/geodesic';

export const BUILDING_DIR_STORAGE_KEY = 'resqroute_vfstr_building_directory_gmp_v3';

/**
 * Deterministic mapping from VFSTR Campus Building IDs to primary graph anchor node IDs.
 * When live Google Maps Places API (New) updates a building's coordinates, its anchor node
 * and all incident road edges are automatically updated in place.
 */
export const BUILDING_TO_ANCHOR_NODE_ID: Record<string, string> = {
  BLD_A_BLOCK: 'OSM_N_1002',
  BLD_U_BLOCK: 'OSM_N_1009',
  BLD_H_BLOCK: 'OSM_N_1012',
  BLD_LIBRARY: 'OSM_N_1011',
  BLD_N_BLOCK: 'OSM_N_1014',
  BLD_P_BLOCK: 'OSM_N_1018',
  BLD_CANTEEN: 'OSM_N_1005',
  BLD_BOYS_HOSTEL: 'OSM_N_1015',
  BLD_GIRLS_HOSTEL: 'OSM_N_1017',
  BLD_GUEST_HOUSE: 'OSM_N_1007',
};

export function loadPersistedBuildingDirectory(): CampusBuildingEntry[] {
  if (typeof localStorage === 'undefined') {
    return INITIAL_BUILDING_CATALOG.map((b) => ({ ...b }));
  }
  try {
    const raw = localStorage.getItem(BUILDING_DIR_STORAGE_KEY);
    if (!raw) {
      return INITIAL_BUILDING_CATALOG.map((b) => ({ ...b }));
    }
    const parsed = JSON.parse(raw) as CampusBuildingEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return INITIAL_BUILDING_CATALOG.map((b) => ({ ...b }));
    }
    return parsed;
  } catch {
    return INITIAL_BUILDING_CATALOG.map((b) => ({ ...b }));
  }
}

export function savePersistedBuildingDirectory(
  buildings: CampusBuildingEntry[]
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(BUILDING_DIR_STORAGE_KEY, JSON.stringify(buildings));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Reconciles the VFSTR Campus Building Directory with live Google Places coordinates,
 * OpenStreetMap building footprints, and synchronizes each building's anchor node on the CampusGraph.
 */
export function reconcileBuildingsWithOSM(
  buildings: CampusBuildingEntry[],
  osmBuildings: ExtractedOSMBuilding[],
  graph: CampusGraph
): CampusBuildingEntry[] {
  return buildings.map((b) => {
    let matchedOsm = osmBuildings.find(
      (ob) =>
        (b.osmFeatureId && ob.osmId === b.osmFeatureId) ||
        ob.name.toLowerCase().includes(b.shortName.toLowerCase()) ||
        b.officialName.toLowerCase().includes(ob.name.toLowerCase())
    );

    if (!matchedOsm) {
      let closestDist = Infinity;
      for (const ob of osmBuildings) {
        const d = haversineDistanceMeters(
          b.lat,
          b.lng,
          ob.centroid[0],
          ob.centroid[1]
        );
        if (d < closestDist && d <= 45) {
          closestDist = d;
          matchedOsm = ob;
        }
      }
    }

    const mappedAnchorId = BUILDING_TO_ANCHOR_NODE_ID[b.id];
    let nearestNode = mappedAnchorId ? graph.getNode(mappedAnchorId) : undefined;

    if (nearestNode) {
      // Snap the graph anchor node directly to the building's live Google Maps Place coordinate
      graph.updateNodeCoordinates(
        nearestNode.id,
        b.lat,
        b.lng,
        b.dataSource === 'GOOGLE_MAPS_PLACES' ? 'GOOGLE_MAPS' : 'ADMIN_VERIFIED'
      );
      nearestNode.buildingId = b.id;
      nearestNode.name = b.officialName;
      nearestNode.shortLabel = b.shortName;
    } else {
      const primaryEntrance = b.entrances?.[0] || { lat: b.lat, lng: b.lng };
      nearestNode =
        graph.findNearestNode(primaryEntrance.lat, primaryEntrance.lng, 'WALKING') ||
        graph.findNearestNode(b.lat, b.lng);
      if (nearestNode && !nearestNode.buildingId) {
        nearestNode.buildingId = b.id;
      }
    }

    return {
      ...b,
      osmFeatureId: matchedOsm ? matchedOsm.osmId : b.osmFeatureId,
      verificationStatus:
        b.googlePlaceId || b.verificationStatus === 'GOOGLE_PLACES_VERIFIED'
          ? 'GOOGLE_PLACES_VERIFIED'
          : b.verificationStatus === 'ADMIN_VERIFIED'
          ? 'ADMIN_VERIFIED'
          : matchedOsm
          ? 'OSM_MAPPED'
          : b.verificationStatus,
      nearestNodeId: nearestNode?.id,
    };
  });
}
