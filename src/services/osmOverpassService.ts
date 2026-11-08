import {
  BASELINE_VFSTR_OVERPASS_SNAPSHOT,
  VFSTR_CAMPUS_CENTER,
} from '../data/campusData';
import { RawOverpassElement, RawOverpassResponse } from '../graph/osmGraphExtractor';

const OVERPASS_CACHE_KEY = 'resqroute_vfstr_overpass_cache_v2';
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

export type OSMDataSourceMode =
  | 'LIVE_OVERPASS'
  | 'LOCAL_CACHE'
  | 'VERIFIED_BASELINE_SNAPSHOT';

export interface OverpassFetchMeta {
  source: OSMDataSourceMode;
  fetchedAt: string;
  endpointUsed: string;
  elementCount: number;
  nodeCount: number;
  wayCount: number;
  errorMessage?: string;
}

/**
 * Builds a bounded Overpass QL query for VFSTR campus, Vadlamudi, Guntur
 * around 16.23155, 80.55127.
 */
export function buildVFSTROverpassQuery(): string {
  const { south, west, north, east } = VFSTR_CAMPUS_CENTER.boundingBox;
  const bbox = `${south},${west},${north},${east}`;
  return `
[out:json][timeout:18];
(
  way["highway"](${bbox});
  way["building"](${bbox});
  way["amenity"](${bbox});
  way["leisure"](${bbox});
  node["amenity"](${bbox});
  node["barrier"="gate"](${bbox});
  node["entrance"](${bbox});
);
out body;
>;
out skel qt;
`.trim();
}

function mergeOverpassWithBaseline(
  liveData: RawOverpassResponse,
  baseline: RawOverpassResponse
): RawOverpassResponse {
  const seenKeys = new Set<string>();
  const mergedElements: RawOverpassElement[] = [];

  for (const el of liveData.elements || []) {
    const key = `${el.type}/${el.id}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      mergedElements.push(el);
    }
  }

  for (const el of baseline.elements || []) {
    const key = `${el.type}/${el.id}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      mergedElements.push(el);
    }
  }

  return {
    version: liveData.version || 0.6,
    generator: liveData.generator || 'Overpass API + VFSTR Verified Layer',
    elements: mergedElements,
  };
}

function summarizeElements(
  data: RawOverpassResponse,
  source: OSMDataSourceMode,
  endpointUsed: string,
  fetchedAt: string,
  errorMessage?: string
): OverpassFetchMeta {
  let nodeCount = 0;
  let wayCount = 0;
  for (const el of data.elements || []) {
    if (el.type === 'node') nodeCount++;
    else if (el.type === 'way') wayCount++;
  }
  return {
    source,
    fetchedAt,
    endpointUsed,
    elementCount: (data.elements || []).length,
    nodeCount,
    wayCount,
    errorMessage,
  };
}

/**
 * Fetches real OpenStreetMap data for VFSTR campus via Overpass API with timeout,
 * multi-endpoint retry, validation, and LocalStorage caching.
 */
export async function fetchVFSTROverpassData(
  forceRefresh: boolean = false
): Promise<{ data: RawOverpassResponse; meta: OverpassFetchMeta }> {
  if (!forceRefresh && typeof localStorage !== 'undefined') {
    try {
      const cachedRaw = localStorage.getItem(OVERPASS_CACHE_KEY);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw) as {
          timestamp: number;
          fetchedAt: string;
          endpointUsed: string;
          data: RawOverpassResponse;
        };
        if (
          parsed &&
          parsed.data &&
          Array.isArray(parsed.data.elements) &&
          parsed.data.elements.length > 10 &&
          Date.now() - parsed.timestamp < CACHE_TTL_MS
        ) {
          const merged = mergeOverpassWithBaseline(
            parsed.data,
            BASELINE_VFSTR_OVERPASS_SNAPSHOT
          );
          return {
            data: merged,
            meta: summarizeElements(
              merged,
              'LOCAL_CACHE',
              parsed.endpointUsed,
              parsed.fetchedAt
            ),
          };
        }
      }
    } catch {
      // Proceed to live fetch
    }
  }

  const query = buildVFSTROverpassQuery();
  let lastError = 'Overpass API unreachable';

  if (typeof fetch !== 'undefined') {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9500);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          lastError = `HTTP ${response.status} from ${endpoint}`;
          continue;
        }

        const json = (await response.json()) as RawOverpassResponse;
        if (!json || !Array.isArray(json.elements) || json.elements.length === 0) {
          lastError = `Empty Overpass response from ${endpoint}`;
          continue;
        }

        const merged = mergeOverpassWithBaseline(
          json,
          BASELINE_VFSTR_OVERPASS_SNAPSHOT
        );
        const fetchedAt = new Date().toISOString();

        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(
              OVERPASS_CACHE_KEY,
              JSON.stringify({
                timestamp: Date.now(),
                fetchedAt,
                endpointUsed: endpoint,
                data: json,
              })
            );
          } catch {
            // Ignore quota errors
          }
        }

        return {
          data: merged,
          meta: summarizeElements(merged, 'LIVE_OVERPASS', endpoint, fetchedAt),
        };
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  const fallbackTime = new Date().toISOString();
  return {
    data: BASELINE_VFSTR_OVERPASS_SNAPSHOT,
    meta: summarizeElements(
      BASELINE_VFSTR_OVERPASS_SNAPSHOT,
      'VERIFIED_BASELINE_SNAPSHOT',
      'Verified VFSTR Baseline Snapshot (Offline / Rate-Limit Fallback)',
      fallbackTime,
      `Live Overpass query fallback (${lastError}) — using verified VFSTR Vadlamudi OSM snapshot.`
    ),
  };
}

export function clearOverpassCache(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(OVERPASS_CACHE_KEY);
    } catch {
      // Ignore
    }
  }
}
