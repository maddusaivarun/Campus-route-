/**
 * Geodesic & Spatial Geometry Utilities for ResQRoute 2.0
 * Implements exact Haversine distance on the WGS84 sphere, polyline length integration,
 * polygon centroid calculation, and compass bearing / turn-by-turn maneuver derivation.
 */

const EARTH_RADIUS_METERS = 6371000;

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Computes exact Haversine great-circle distance in meters between two geographic coordinates.
 */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * Computes exact cumulative length in meters along a multi-point geographic polyline.
 */
export function calculatePolylineLengthMeters(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineDistanceMeters(
      coords[i][0],
      coords[i][1],
      coords[i + 1][0],
      coords[i + 1][1]
    );
  }
  return Math.max(1, Math.round(total));
}

/**
 * Computes the geometric centroid [lat, lng] of a closed or open polygon ring.
 */
export function computePolygonCentroid(coords: [number, number][]): [number, number] {
  if (coords.length === 0) return [16.23155, 80.55127];
  const ring =
    coords.length > 2 &&
    coords[0][0] === coords[coords.length - 1][0] &&
    coords[0][1] === coords[coords.length - 1][1]
      ? coords.slice(0, -1)
      : coords;

  let sumLat = 0;
  let sumLng = 0;
  for (const [lat, lng] of ring) {
    sumLat += lat;
    sumLng += lng;
  }
  return [
    Number((sumLat / ring.length).toFixed(6)),
    Number((sumLng / ring.length).toFixed(6)),
  ];
}

/**
 * Computes forward compass bearing in degrees [0, 360) from (lat1, lng1) to (lat2, lng2).
 */
export function calculateBearingDegrees(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLambda = toRadians(lng2 - lng1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = toDegrees(Math.atan2(y, x));
  return Math.round((theta + 360) % 360);
}

export function bearingToCompassDirection(bearing: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((bearing % 360) / 45)) % 8;
  return dirs[idx];
}

export type TurnManeuver =
  | 'DEPART'
  | 'STRAIGHT'
  | 'SLIGHT_RIGHT'
  | 'TURN_RIGHT'
  | 'SHARP_RIGHT'
  | 'SLIGHT_LEFT'
  | 'TURN_LEFT'
  | 'SHARP_LEFT'
  | 'UTURN';

/**
 * Derives a real turn-by-turn maneuver and human-readable instruction from consecutive road bearings.
 */
export function deriveTurnManeuver(
  prevBearing: number | null,
  currentBearing: number,
  prevRoadName: string | null,
  nextRoadName: string
): { maneuver: TurnManeuver; instruction: string } {
  const compass = bearingToCompassDirection(currentBearing);
  if (prevBearing === null) {
    return {
      maneuver: 'DEPART',
      instruction: `Head ${compass} on ${nextRoadName}`,
    };
  }

  let delta = ((currentBearing - prevBearing + 540) % 360) - 180;
  if (Math.abs(delta) < 20) {
    if (prevRoadName && prevRoadName === nextRoadName) {
      return {
        maneuver: 'STRAIGHT',
        instruction: `Continue straight (${compass}) on ${nextRoadName}`,
      };
    }
    return {
      maneuver: 'STRAIGHT',
      instruction: `Continue straight onto ${nextRoadName} (${compass})`,
    };
  }

  if (delta >= 20 && delta < 55) {
    return {
      maneuver: 'SLIGHT_RIGHT',
      instruction: `Bear slight right onto ${nextRoadName} (${compass})`,
    };
  }
  if (delta >= 55 && delta < 125) {
    return {
      maneuver: 'TURN_RIGHT',
      instruction: `Turn right onto ${nextRoadName} (${compass})`,
    };
  }
  if (delta >= 125 && delta <= 165) {
    return {
      maneuver: 'SHARP_RIGHT',
      instruction: `Make a sharp right onto ${nextRoadName}`,
    };
  }
  if (delta <= -20 && delta > -55) {
    return {
      maneuver: 'SLIGHT_LEFT',
      instruction: `Bear slight left onto ${nextRoadName} (${compass})`,
    };
  }
  if (delta <= -55 && delta > -125) {
    return {
      maneuver: 'TURN_LEFT',
      instruction: `Turn left onto ${nextRoadName} (${compass})`,
    };
  }
  if (delta <= -125 && delta >= -165) {
    return {
      maneuver: 'SHARP_LEFT',
      instruction: `Make a sharp left onto ${nextRoadName}`,
    };
  }

  return {
    maneuver: 'UTURN',
    instruction: `Make a U-turn onto ${nextRoadName}`,
  };
}
