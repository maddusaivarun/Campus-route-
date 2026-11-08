/**
 * ResQRoute 2.0 — Automated Verification & Unit Test Suite
 * Run via: npx tsx src/__tests__/algorithms.test.ts
 */

import { BinaryMinHeap } from '../algorithms/minHeap';
import { PriorityQueue } from '../algorithms/priorityQueue';
import {
  haversineDistanceMeters,
  calculatePolylineLengthMeters,
  deriveTurnManeuver,
} from '../graph/geodesic';
import { CampusGraph } from '../graph/Graph';
import { extractGraphFromOverpassData } from '../graph/osmGraphExtractor';
import {
  BASELINE_VFSTR_OVERPASS_SNAPSHOT,
  INITIAL_ADMIN_PATHWAYS,
  INITIAL_BUILDING_CATALOG,
  VFSTR_CAMPUS_CENTER,
} from '../data/campusData';
import { reconcileBuildingsWithOSM } from '../services/buildingDirectoryService';
import { runDijkstra } from '../algorithms/dijkstra';
import { runAStar, computeAdmissibleGeographicHeuristic } from '../algorithms/astar';
import { runBFS } from '../algorithms/bfs';
import { runDFS, findConnectedComponents } from '../algorithms/dfs';
import { runYenKShortestPaths } from '../algorithms/yenKShortest';
import { TrafficEngine } from '../services/trafficEngine';
import {
  evaluateGpsPosition,
  mapGeolocationError,
  snapGpsToWalkableSegment,
} from '../services/gpsService';
import {
  INITIAL_OFF_ROUTE_STATE,
  computeLiveNavigationProgress,
  evaluateOffRouteAndDebounce,
} from '../services/liveTurnByTurnNavigator';
import { StorageService } from '../services/storageService';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

export function runAllVerificationTests(): {
  passed: number;
  results: string[];
} {
  const results: string[] = [];
  let passed = 0;

  // 1. Haversine Distance & Turn-by-Turn Geometry Calculation
  {
    const dZero = haversineDistanceMeters(
      VFSTR_CAMPUS_CENTER.lat,
      VFSTR_CAMPUS_CENTER.lng,
      VFSTR_CAMPUS_CENTER.lat,
      VFSTR_CAMPUS_CENTER.lng
    );
    assert(dZero === 0, 'Haversine distance between identical coordinates must be 0m');

    const distGateToCenter = haversineDistanceMeters(16.23338, 80.54882, 16.23155, 80.55127);
    assert(
      distGateToCenter > 250 && distGateToCenter < 400,
      `Expected Gate-to-Center distance ~330m, got ${distGateToCenter}m`
    );

    const polyLen = calculatePolylineLengthMeters([
      [16.23338, 80.54882],
      [16.2325, 80.5499],
      [16.23155, 80.55127],
    ]);
    assert(
      polyLen >= distGateToCenter,
      'Multi-segment polyline length must be >= straight-line Haversine distance'
    );

    const turnRight = deriveTurnManeuver(90, 180, 'VFSTR Main Spine', 'Library Connector');
    assert(
      turnRight.maneuver === 'TURN_RIGHT',
      `Expected TURN_RIGHT for 90->180 deg bearing change, got ${turnRight.maneuver}`
    );

    passed++;
    results.push('PASS [1/15]: Haversine Geodesic Distance & Turn-by-Turn Geometry Derivation');
  }

  // 2. Binary Min-Heap & Priority Queue Operations
  {
    const heap = new BinaryMinHeap<string>((id) => id);
    heap.insert('N_C', 45);
    heap.insert('N_A', 12);
    heap.insert('N_B', 28);
    heap.decreaseKey('N_C', 5);

    const first = heap.extractMin();
    assert(first?.item === 'N_C' && first.priority === 5, 'DecreaseKey should bubble N_C to root');
    const second = heap.extractMin();
    assert(second?.item === 'N_A' && second.priority === 12, 'Second extracted item must be N_A');

    const pq = new PriorityQueue<{ id: string }>((x) => x.id);
    pq.enqueue({ id: 'X' }, 20);
    pq.enqueue({ id: 'Y' }, 10);
    assert(pq.dequeue()?.item.id === 'Y', 'PriorityQueue must dequeue lowest priority first');

    passed++;
    results.push('PASS [2/15]: Binary Min-Heap & Priority Queue O(log V) Operations');
  }

  // 3. OpenStreetMap Overpass Response Parsing & Road Geometry Graph Extraction
  const extracted = extractGraphFromOverpassData(
    BASELINE_VFSTR_OVERPASS_SNAPSHOT,
    INITIAL_ADMIN_PATHWAYS
  );
  const graph = extracted.graph;
  {
    assert(
      extracted.stats.intersectionNodesCount >= 18,
      `Expected >= 18 extracted OSM intersection nodes, got ${extracted.stats.intersectionNodesCount}`
    );
    assert(
      extracted.stats.directedEdgesCount >= 40,
      `Expected >= 40 directed road/footpath edges, got ${extracted.stats.directedEdgesCount}`
    );
    assert(
      extracted.osmBuildings.length >= 10,
      `Expected >= 10 extracted OSM building polygons, got ${extracted.osmBuildings.length}`
    );

    const buildings = reconcileBuildingsWithOSM(
      INITIAL_BUILDING_CATALOG,
      extracted.osmBuildings,
      graph
    );
    assert(buildings.length === 10, 'All 10 core VFSTR campus buildings must be reconciled');
    for (const b of buildings) {
      assert(Boolean(b.nearestNodeId), `Building ${b.name} must snap to a valid graph node`);
    }

    passed++;
    results.push('PASS [3/15]: OSM Overpass Parsing, Building Polygon Centroids & Graph Extraction');
  }

  // 4. Dijkstra Optimal Weighted Pathfinding (WALKING & Configurable Walking Speed)
  {
    graph.setWalkingSpeedMps(1.0);
    const slowWalk = runDijkstra(
      graph,
      'OSM_N_1001',
      'OSM_N_1015',
      'TIME',
      false,
      'NONE',
      'WALKING'
    );
    assert(slowWalk.found, 'Dijkstra must find a valid walking route from Main Gate to Boys Hostel');
    assert(slowWalk.totalDistanceMeters > 0, 'Total distance in meters must be positive');
    assert(slowWalk.routeGeometry.length >= 2, 'Route polyline geometry must be populated');
    assert(slowWalk.segmentSteps.length >= 1, 'Turn-by-turn steps must be generated');

    graph.setWalkingSpeedMps(2.0);
    const fastWalk = runDijkstra(
      graph,
      'OSM_N_1001',
      'OSM_N_1015',
      'TIME',
      false,
      'NONE',
      'WALKING'
    );
    assert(
      fastWalk.totalTimeSeconds < slowWalk.totalTimeSeconds,
      `Faster walking speed (2.0 m/s -> ${fastWalk.totalTimeSeconds}s) must yield shorter ETA than 1.0 m/s (${slowWalk.totalTimeSeconds}s)`
    );
    graph.setWalkingSpeedMps(1.4);

    passed++;
    results.push('PASS [4/15]: Dijkstra Shortest Path & Configurable Walking Speed ETA');
  }

  // 5. A* Geodesic Heuristic Admissibility & Optimality Parity with Dijkstra
  {
    const dRes = runDijkstra(
      graph,
      'OSM_N_1002',
      'OSM_N_1017',
      'TIME',
      false,
      'NONE',
      'WALKING'
    );
    const aRes = runAStar(
      graph,
      'OSM_N_1002',
      'OSM_N_1017',
      'TIME',
      false,
      'NONE',
      'WALKING'
    );

    assert(aRes.found, 'A* must find a path between A-Block and Girls Hostel');
    assert(
      aRes.totalTimeSeconds === dRes.totalTimeSeconds,
      `A* travel time (${aRes.totalTimeSeconds}s) must equal optimal Dijkstra travel time (${dRes.totalTimeSeconds}s)`
    );

    for (const n of graph.getAllNodes()) {
      const hTime = computeAdmissibleGeographicHeuristic(
        graph,
        n.id,
        'OSM_N_1017',
        'TIME',
        'WALKING'
      );
      const exactFromNode = runDijkstra(
        graph,
        n.id,
        'OSM_N_1017',
        'TIME',
        false,
        'NONE',
        'WALKING'
      );
      if (exactFromNode.found) {
        assert(
          hTime <= exactFromNode.totalTimeSeconds + 1,
          `A* Haversine heuristic (${hTime}) must be admissible vs true cost (${exactFromNode.totalTimeSeconds})`
        );
      }
    }

    passed++;
    results.push('PASS [5/15]: A* Geodesic Heuristic Admissibility & Optimal Parity with Dijkstra');
  }

  // 6. Breadth-First Search (BFS) Minimum Hop Count
  {
    const bfsRes = runBFS(graph, 'OSM_N_1001', 'OSM_N_1012', false, 'WALKING');
    assert(bfsRes.found, 'BFS must find an unweighted path from Main Gate to H-Block');
    assert(bfsRes.nodePath.length >= 2, 'BFS nodePath must have at least 2 nodes');

    passed++;
    results.push('PASS [6/15]: Breadth-First Search (BFS) Minimum-Hop Pathfinding');
  }

  // 7. Depth-First Search (DFS) & Connected Components Verification
  {
    const dfsRes = runDFS(graph, 'OSM_N_1001', 'OSM_N_1012', false, 'WALKING');
    assert(dfsRes.found, 'DFS must reach H-Block from Main Gate');

    const components = findConnectedComponents(graph, false, 'WALKING');
    assert(
      components.length === 1,
      `VFSTR walking network should form 1 connected component, got ${components.length}`
    );

    passed++;
    results.push('PASS [7/15]: Depth-First Search (DFS) & Graph Connectivity Verification');
  }

  // 8. Pedestrian vs. Emergency Vehicle Access Restrictions
  {
    const walkViaStairs = runDijkstra(
      graph,
      'OSM_N_1009',
      'OSM_N_1007',
      'DISTANCE',
      false,
      'NONE',
      'WALKING'
    );
    assert(walkViaStairs.found, 'Pedestrians (WALKING) must be able to traverse campus stairs/footways');

    const ambulanceRoute = runDijkstra(
      graph,
      'OSM_N_1001',
      'OSM_N_1015',
      'TIME',
      true,
      'AMBULANCE',
      'VEHICLE'
    );
    assert(ambulanceRoute.found, 'Emergency Ambulance must find a drivable route to Boys Hostel');
    assert(
      ambulanceRoute.restrictedRoadsSkipped > 0,
      'Emergency Ambulance must skip pedestrian-only footways and stairs'
    );

    for (const edgeId of ambulanceRoute.edgePath) {
      const edge = graph.getEdge(edgeId);
      assert(
        Boolean(edge && edge.allowVehicle && edge.highwayType !== 'steps'),
        `Emergency vehicle illegally traversed pedestrian-only edge ${edgeId}`
      );
    }

    passed++;
    results.push('PASS [8/15]: Pedestrian vs. Emergency Vehicle Access Restrictions Enforced');
  }

  // 9. Road Closures & Dynamic Rerouting
  {
    const baseline = runDijkstra(
      graph,
      'OSM_N_1002',
      'OSM_N_1005',
      'TIME',
      false,
      'NONE',
      'WALKING'
    );
    assert(baseline.found && baseline.edgePath.length > 0, 'Baseline path must exist');

    const primaryEdgeId = baseline.edgePath[0];
    TrafficEngine.updateRoadEdge(graph, primaryEdgeId, {
      status: 'CLOSED',
      congestionFactor: 9.9,
      incidentReport: 'Unit Test Road Closure',
    });

    const rerouted = runDijkstra(
      graph,
      'OSM_N_1002',
      'OSM_N_1005',
      'TIME',
      false,
      'NONE',
      'WALKING'
    );
    assert(rerouted.found, 'Dynamic rerouting must find an alternate path around closed segment');
    assert(
      !rerouted.edgePath.includes(primaryEdgeId),
      `Rerouted path must not include closed edge ${primaryEdgeId}`
    );

    graph.resetAllConditions();
    passed++;
    results.push('PASS [9/15]: Road Closure Handling & Automatic Detour Computation');
  }

  // 10. Yen's K-Shortest Loop-Free Alternative Routes
  {
    const kPaths = runYenKShortestPaths(
      graph,
      'OSM_N_1002',
      'OSM_N_1015',
      3,
      'TIME',
      false,
      'NONE',
      'WALKING'
    );
    assert(kPaths.length >= 2, `Expected at least 2 distinct routes from Yen's algorithm, got ${kPaths.length}`);
    assert(
      kPaths[0].result.totalTimeSeconds <= kPaths[1].result.totalTimeSeconds,
      'Candidate #1 must have travel time <= Candidate #2'
    );

    passed++;
    results.push("PASS [10/15]: Yen's K-Shortest Loop-Free Alternative Paths");
  }

  // 11. GPS-to-Walkable-Road-Segment Snapping with Accuracy Tolerance
  {
    const snapNearSpine = snapGpsToWalkableSegment(graph, 16.2329, 80.5494, 12, 'WALKING');
    assert(snapNearSpine !== null, 'Valid on-campus GPS coordinate must snap to a walkable segment');
    assert(
      snapNearSpine!.isWithinSnapTolerance === true,
      `Expected on-campus snap (${snapNearSpine!.distanceToSegmentMeters}m) to be within tolerance`
    );
    assert(Boolean(snapNearSpine!.snappedNodeId), 'Snapped result must resolve a valid graph node ID');

    const snapFarAway = snapGpsToWalkableSegment(graph, 16.35, 80.65, 10, 'WALKING');
    assert(
      snapFarAway !== null && snapFarAway.isWithinSnapTolerance === false,
      'Far-away GPS coordinate must report isWithinSnapTolerance === false'
    );

    passed++;
    results.push('PASS [11/15]: GPS-to-Walkable-Road-Segment Snapping & Accuracy Tolerance');
  }

  // 12. Real-Time Walking Progress, Off-Route Detection & Debounced Automatic Rerouting
  {
    const activeRoute = runDijkstra(
      graph,
      'OSM_N_1002',
      'OSM_N_1017',
      'DISTANCE',
      false,
      'NONE',
      'WALKING'
    );
    assert(activeRoute.found && activeRoute.routeGeometry.length >= 2, 'Active route must exist');

    const startPt = activeRoute.routeGeometry[0];
    const progressOnRoute = computeLiveNavigationProgress(
      activeRoute,
      startPt[0],
      startPt[1],
      10,
      1.4,
      'ACTIVE'
    );
    assert(progressOnRoute.isOffRoute === false, 'Walker at route start must not be flagged off-route');
    assert(
      progressOnRoute.remainingDistanceMeters > 0,
      'Remaining walking distance at start must be > 0m'
    );

    // Normal GPS jitter (8m away) must NOT trigger off-route
    const jitterEval = evaluateOffRouteAndDebounce(
      activeRoute,
      startPt[0] + 0.00005,
      startPt[1] + 0.00005,
      15,
      INITIAL_OFF_ROUTE_STATE,
      10000
    );
    assert(
      jitterEval.isCurrentlyOffRoute === false && jitterEval.shouldTriggerReroute === false,
      'Small 8m GPS fluctuation must be ignored as normal on-route jitter'
    );

    // Poor GPS accuracy (120m) even far away must be ignored to prevent false rerouting
    const poorAccEval = evaluateOffRouteAndDebounce(
      activeRoute,
      startPt[0] + 0.001,
      startPt[1] + 0.001,
      120,
      INITIAL_OFF_ROUTE_STATE,
      10000
    );
    assert(
      poorAccEval.shouldTriggerReroute === false &&
        poorAccEval.reason === 'POOR_GPS_ACCURACY_IGNORED',
      'Poor GPS accuracy (>85m) must suppress automatic rerouting'
    );

    // Genuine off-route deviation (100m away with 10m accuracy):
    // 1st reading -> awaits consecutive confirmation
    const off1 = evaluateOffRouteAndDebounce(
      activeRoute,
      startPt[0] + 0.0012,
      startPt[1] - 0.0012,
      10,
      INITIAL_OFF_ROUTE_STATE,
      20000
    );
    assert(
      off1.isCurrentlyOffRoute === true &&
        off1.shouldTriggerReroute === false &&
        off1.reason === 'AWAITING_CONSECUTIVE_CONFIRMATION',
      'First off-route reading must wait for consecutive confirmation'
    );

    // 2nd consecutive reading -> triggers automatic reroute!
    const off2 = evaluateOffRouteAndDebounce(
      activeRoute,
      startPt[0] + 0.0013,
      startPt[1] - 0.0013,
      10,
      off1.nextState,
      23000
    );
    assert(
      off2.shouldTriggerReroute === true && off2.reason === 'TRIGGER_REROUTE',
      'Second consecutive off-route reading must trigger automatic rerouting'
    );

    // Immediate subsequent off-route reading within 8s cooldown -> suppressed by debounce
    const offDebounce1 = evaluateOffRouteAndDebounce(
      activeRoute,
      startPt[0] + 0.0014,
      startPt[1] - 0.0014,
      10,
      off2.nextState,
      24000
    );
    const offDebounce2 = evaluateOffRouteAndDebounce(
      activeRoute,
      startPt[0] + 0.0015,
      startPt[1] - 0.0015,
      10,
      offDebounce1.nextState,
      25000
    );
    assert(
      offDebounce2.shouldTriggerReroute === false &&
        offDebounce2.reason === 'DEBOUNCE_COOLDOWN_ACTIVE',
      'Debounce cooldown must prevent repeated rerouting within 8 seconds'
    );

    passed++;
    results.push('PASS [12/15]: Real-Time Walking Progress, Off-Route Detection & Debounced Rerouting');
  }

  // 13. Disconnected Destinations & Network Connectivity Inspector
  {
    // Isolate node OSM_N_1018 (Guest House) by closing all incident edges
    for (const edge of graph.getAllEdges()) {
      if (edge.source === 'OSM_N_1018' || edge.target === 'OSM_N_1018') {
        graph.updateEdgeCondition(edge.id, { status: 'CLOSED' });
      }
    }

    const unreachable = runDijkstra(
      graph,
      'OSM_N_1002',
      'OSM_N_1018',
      'DISTANCE',
      false,
      'NONE',
      'WALKING'
    );
    assert(
      unreachable.found === false && unreachable.routeGeometry.length === 0,
      'Disconnected/closed destination must return found: false with empty routeGeometry (never a fake straight line)'
    );

    const connReport = graph.analyzeNetworkConnectivity('WALKING');
    assert(
      connReport.isFullyConnected === false &&
        connReport.disconnectedNodeIds.includes('OSM_N_1018'),
      'NetworkConnectivityReport must identify isolated node OSM_N_1018'
    );

    graph.resetAllConditions();
    passed++;
    results.push('PASS [13/15]: Disconnected Destination Handling & Graph Connectivity Inspector');
  }

  // 14. Invalid Geographic Data Rejection
  {
    const testG = new CampusGraph();
    testG.addNode({
      id: 'N1',
      name: 'Node 1',
      shortLabel: 'N1',
      category: 'INTERSECTION',
      lat: 16.233,
      lng: 80.551,
      provenance: 'ADMIN_VERIFIED',
    });

    let threwOnMissingTarget = false;
    try {
      testG.addEdge({
        id: 'E_INVALID',
        source: 'N1',
        target: 'NON_EXISTENT_NODE',
        roadName: 'Broken Edge',
        distanceMeters: 50,
        baseTimeSeconds: 35,
        maxSpeedKmh: 15,
        highwayType: 'footway',
        allowWalking: true,
        allowBicycle: true,
        allowVehicle: false,
        oneWay: false,
        congestionFactor: 1.0,
        status: 'OPEN',
        geometry: [
          [16.233, 80.551],
          [16.234, 80.552],
        ],
        provenance: 'ADMIN_VERIFIED',
      });
    } catch {
      threwOnMissingTarget = true;
    }
    assert(threwOnMissingTarget, 'CampusGraph.addEdge must reject edges referencing missing nodes');

    const nanSnap = snapGpsToWalkableSegment(graph, Number.NaN, Number.NaN, 15, 'WALKING');
    assert(nanSnap === null, 'snapGpsToWalkableSegment must return null for NaN coordinates');

    passed++;
    results.push('PASS [14/15]: Invalid Geographic Data & Missing Endpoint Rejection');
  }

  // 15. Browser Geolocation Evaluation, Permission Errors & GeoJSON Export
  {
    const onCampusPos = evaluateGpsPosition(
      {
        coords: {
          latitude: 16.23155,
          longitude: 80.55127,
          accuracy: 12,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        } as GeolocationCoordinates,
        timestamp: Date.now(),
      } as GeolocationPosition,
      true
    );
    assert(onCampusPos.isWithinCampus === true, 'Coordinates 16.23155, 80.55127 must be recognized as on-campus');

    const deniedState = mapGeolocationError({ code: 1 });
    const unavailState = mapGeolocationError({ code: 2 });
    const timeoutState = mapGeolocationError({ code: 3 });
    assert(
      deniedState.status === 'PERMISSION_DENIED' &&
        deniedState.lat === null &&
        unavailState.status === 'POSITION_UNAVAILABLE' &&
        unavailState.lat === null &&
        timeoutState.status === 'TIMEOUT' &&
        timeoutState.lat === null,
      'Geolocation errors must map accurately and never fabricate fallback coordinates'
    );

    const geojsonStr = StorageService.exportCampusGeoJSON(
      INITIAL_BUILDING_CATALOG,
      INITIAL_ADMIN_PATHWAYS,
      graph,
      []
    );
    const parsedGeo = JSON.parse(geojsonStr);
    assert(
      parsedGeo.type === 'FeatureCollection' && parsedGeo.features.length > 25,
      'Exported GeoJSON must be a valid FeatureCollection with buildings, pathways, and roads'
    );

    passed++;
    results.push('PASS [15/15]: Browser Geolocation Evaluation, Error Handling & GeoJSON Export');
  }

  return { passed, results };
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.includes('algorithms.test');

if (isDirectExecution) {
  const summary = runAllVerificationTests();
  console.log('==========================================================');
  console.log('ResQRoute 2.0 — VFSTR Campus GIS & DSA Verification Suite');
  console.log('==========================================================');
  for (const line of summary.results) {
    console.log(line);
  }
  console.log('----------------------------------------------------------');
  console.log(`TOTAL PASSED: ${summary.passed} / ${summary.results.length}`);
  console.log('==========================================================');
}
