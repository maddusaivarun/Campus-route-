# ResQRoute 2.0 — Verification & Testing Guide (`TESTING.md`)

## 1. Automated Unit & Integration Test Suite

Run the complete 11-part automated test suite from the terminal:

```bash
npx tsx src/__tests__/algorithms.test.ts
```

### What the Automated Suite Verifies (`src/__tests__/algorithms.test.ts`):
1. **Haversine Geodesic Distance & Turn-by-Turn Geometry (`src/graph/geodesic.ts`)**:
   - Verifies zero distance for identical coordinates, accurate meter distance between VFSTR Main Gate (`16.23338, 80.54882`) and Central Spine (`16.23155, 80.55127`), polyline summation, and bearing-based turn maneuvers.
2. **Binary Min-Heap & Priority Queue (`src/algorithms/minHeap.ts`)**:
   - Verifies $\mathcal{O}(\log V)$ `insert`, `extractMin`, and `decreaseKey` ordering invariants.
3. **OSM Overpass Response Parsing & Graph Extraction (`src/graph/osmGraphExtractor.ts`)**:
   - Verifies extraction of topological intersection nodes, directed road/footpath edges, and OSM building footprints from Overpass JSON data, plus reconciliation of all 10 VFSTR campus buildings.
4. **Dijkstra Optimal Pathfinding (`src/algorithms/dijkstra.ts`)**:
   - Verifies valid route discovery, positive Haversine distance, polyline geometry generation, and turn-by-turn segment instructions.
5. **A* Admissible Geodesic Heuristic & Optimality Parity (`src/algorithms/astar.ts`)**:
   - Verifies that $h(n) \le h^*(n)$ across all VFSTR nodes and confirms that A* produces the exact same optimal travel time as Dijkstra.
6. **Breadth-First Search (`src/algorithms/bfs.ts`)**:
   - Verifies minimum-hop path discovery.
7. **Depth-First Search & Connected Components (`src/algorithms/dfs.ts`)**:
   - Verifies deep graph traversal and confirms single-component walkability across the VFSTR network.
8. **Pedestrian vs. Emergency Vehicle Access Restrictions**:
   - Confirms that `WALKING` mode can traverse campus stairs (`highway=steps`) and footpaths (`highway=footway`), while `AMBULANCE` / `VEHICLE` mode strictly skips pedestrian-only stairs and narrow footways (`restrictedRoadsSkipped > 0`).
9. **Road Closures & Dynamic Rerouting (`src/services/trafficEngine.ts`)**:
   - Closes an active corridor edge and verifies that Dijkstra/A* automatically diverts around the blocked road.
10. **Yen's K-Shortest Paths (`src/algorithms/yenKShortest.ts`)**:
    - Verifies generation of $K = 3$ distinct, loop-free campus routes ordered by non-decreasing travel cost.
11. **Browser Geolocation & RFC 7946 GeoJSON Export**:
    - Verifies on-campus vs. off-campus coordinate detection, Geolocation error code mapping, and RFC 7946 `FeatureCollection` export.
