# ResQRoute 2.0 — System & GIS Architecture (`PROJECT_ARCHITECTURE.md`)

## 1. Architectural Philosophy

ResQRoute 2.0 follows a clean, layered architecture separating **Real GIS Data Acquisition**, **Topological Graph Extraction**, **Pure DSA Pathfinding Algorithms**, **Domain Services**, and **Interactive Command Views**:

```text
src/
├── graph/
│   ├── geodesic.ts               # Haversine distance, polyline length, polygon centroids & bearing maneuvers
│   ├── Graph.ts                  # Adjacency-list CampusGraph with lat/lng, OSM tags & access profiles
│   └── osmGraphExtractor.ts      # Converts raw Overpass OSM ways & nodes into topological graph + building polygons
├── algorithms/
│   ├── minHeap.ts                # Generic Binary Min-Heap with O(1) index map & O(log V) decreaseKey
│   ├── priorityQueue.ts          # PriorityQueue<T> wrapper backed by BinaryMinHeap
│   ├── dijkstra.ts               # Dijkstra's shortest path + geometry-derived turn-by-turn steps
│   ├── astar.ts                  # A* search with admissible Haversine great-circle heuristic
│   ├── bfs.ts                    # Breadth-First Search (FIFO queue, minimum hop count)
│   ├── dfs.ts                    # Depth-First Search (LIFO stack + connected components analysis)
│   └── yenKShortest.ts           # Yen's K-Shortest loop-free alternative routes
├── data/
│   └── campusData.ts             # VFSTR center (16.23155, 80.55127), verified building catalog & baseline OSM snapshot
├── services/
│   ├── osmOverpassService.ts     # Overpass QL query builder, timeout/retry handler, LocalStorage cache & fallback
│   ├── buildingDirectoryService.ts # Reconciles VFSTR buildings with extracted OSM polygons & nearest graph nodes
│   ├── gpsService.ts             # Browser Geolocation API evaluation, accuracy radius & off-campus detection
│   ├── routingEngine.ts          # Unified façade for single-algorithm and 4-algorithm + Yen benchmark runs
│   ├── trafficEngine.ts          # 4-category incident engine, road closures & clearly labelled simulation presets
│   ├── analyticsService.ts       # Real OSM road composition, network health & algorithm complexity metrics
│   └── storageService.ts         # LocalStorage persistence & RFC 7946 Campus GeoJSON export/import
├── components/
│   ├── CampusMapCanvas.tsx       # Real Leaflet + OpenStreetMap map with footprints, polylines, GPS & click handlers
│   ├── Sidebar.tsx               # Command navigation sidebar with VFSTR reference telemetry
│   └── TopNav.tsx                # Header with live Overpass status, Browser GPS trigger, Admin toggle & Emergency Sim
├── views/
│   ├── OverviewView.tsx          # Real VFSTR map command overview & verified building directory
│   ├── LiveNavigationView.tsx    # Multi-modal route planner (WALKING/BICYCLE/VEHICLE), GPS & turn-by-turn steps
│   ├── TrafficControlView.tsx    # Incident reporting, admin verification queue & road segment matrix
│   ├── EmergencyResponseView.tsx # Ambulance/Fire/Police simulation enforcing physical access restrictions
│   ├── RouteComparisonView.tsx   # Side-by-side Dijkstra, A*, BFS, DFS & Yen's K-Shortest comparison
│   ├── DSAVisualizerView.tsx     # Step-by-step Min-Heap Priority Queue & frontier expansion player
│   ├── AnalyticsView.tsx         # Recharts road health & algorithm search effort analytics
│   └── SettingsView.tsx          # Campus Administration console, blueprint verification & GeoJSON import/export
└── __tests__/
    └── algorithms.test.ts        # 11-part automated unit test suite
```

---

## 2. Real OSM Overpass Acquisition & Graph Extraction Pipeline

1. **Overpass API Query (`src/services/osmOverpassService.ts`)**:
   - Queries `[out:json][timeout:18]` within the bounding box `(16.2255, 80.5455, 16.2360, 80.5565)` covering VFSTR Vadlamudi and the Guntur–Tenali Highway (SH-48) frontage.
   - Retries across multiple public Overpass instances (`overpass-api.de`, `overpass.kumi.systems`, `maps.mail.ru`) with `AbortController` timeouts.
   - Caches valid responses in `LocalStorage` and merges with `BASELINE_VFSTR_OVERPASS_SNAPSHOT` so the campus road network and building polygons remain 100% functional even offline.
2. **Topological Graph Extraction (`src/graph/osmGraphExtractor.ts`)**:
   - Parses OSM `node` and `way` elements.
   - Identifies shared road vertices and endpoints to split OSM ways into topological graph edges while preserving intermediate geometry coordinates (`geometry: [lat, lng][]`).
   - Computes exact segment lengths in meters via `calculatePolylineLengthMeters` using the Haversine formula.
   - Infers access permissions (`allowWalking`, `allowBicycle`, `allowVehicle`, `oneWay`) from OSM tags (`highway`, `access`, `foot`, `motor_vehicle`, `oneway`).
   - Snaps administrator-verified custom pathways (`AdminCustomPathway[]`) into the nearest existing graph intersections within 28 meters so new footpaths seamlessly integrate into routing.
