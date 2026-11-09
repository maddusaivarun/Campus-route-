import {
  CampusBuildingEntry,
  INITIAL_BUILDING_CATALOG,
} from '../data/campusData';
import { CampusGraph } from '../graph/Graph';
import { ExtractedOSMBuilding } from '../graph/osmGraphExtractor';
import { haversineDistanceMeters } from '../graph/geodesic';

export const BUILDING_DIR_STORAGE_KEY = 'resqroute_vfstr_building_directory_gmp_v4';

/**
 * Deterministic mapping from VFSTR Campus Building IDs to primary road-aligned graph anchor node IDs.
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
 * Reconciles the VFSTR Campus Building Directory with OpenStreetMap building footprints
 * and binds each building to its nearest road-aligned graph anchor node WITHOUT distorting
 * the underlying road intersection geometry.
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
      nearestNode.buildingId = b.id;
      nearestNode.name = b.officialName;
      nearestNode.shortLabel = b.shortName;
      // Only move the anchor node if the building was moved within 60m (e.g. entrance adjustment),
      // preventing cross-campus diagonal road distortions.
      const distFromAnchor = haversineDistanceMeters(
        b.lat,
        b.lng,
        nearestNode.lat,
        nearestNode.lng
      );
      if (distFromAnchor > 2 && distFromAnchor <= 35) {
        const entrancePt = b.entrances?.[0] || { lat: b.lat, lng: b.lng };
        graph.updateNodeCoordinates(
          nearestNode.id,
          entrancePt.lat,
          entrancePt.lng,
          b.dataSource === 'GOOGLE_MAPS_PLACES' ? 'GOOGLE_MAPS' : 'ADMIN_VERIFIED'
        );
      }
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
