# ResQRoute 2.0 — Real VFSTR Campus Navigation & Emergency Route Intelligence

> **Every Second Matters. Every Route Counts.**  
> **Primary Campus Location**: Vignan's Foundation for Science, Technology and Research (VFSTR), Vadlamudi, Guntur District, Andhra Pradesh 522213, India (`16.23155°N, 80.55127°E`).

---

## 1. Overview

**ResQRoute 2.0** is a real-world campus GIS navigation, road incident management, emergency dispatch simulation, and interactive Data Structures & Algorithms (DSA) visualization platform built specifically for the **actual VFSTR campus at Vadlamudi, Guntur**.

Unlike mock dashboards that use decorative grids or fabricated coordinates, ResQRoute 2.0:
1. **Renders the Real VFSTR Campus Map** using **Leaflet** and **OpenStreetMap standard tiles** (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`) centered at `16.23155°N, 80.55127°E` with full `© OpenStreetMap contributors` attribution.
2. **Acquires Real OpenStreetMap Data via Overpass API** (`src/services/osmOverpassService.ts`) around VFSTR Vadlamudi (`16.2255°N–16.2360°N, 80.5455°E–80.5565°E`), extracting actual road ways, pedestrian footways, building footprints, and access tags—backed by local caching and a verified VFSTR OSM snapshot when offline or rate-limited.
3. **Cross-References Official VFSTR Architectural Blueprints** (`/assets/aistudio/Building_Plan_260f9f66.pdf`), mapping **A-Block**, **U-Block**, **H-Block**, **N-Block (Nagarjuna Bhavan)**, **P-Block (Vignan's Pharmacy College)**, **N.T.R. Vignan Library**, **Main Canteen / Dining Block**, **Vignan Vihar Boys Hostel**, **Priyadarshini Girls Hostel**, and **Guest House** with explicit verification statuses (`ADMIN_VERIFIED`, `OSM_MAPPED`, `AWAITING_VERIFICATION`).
4. **Constructs a Real Geodesic Weighted Graph** (`src/graph/osmGraphExtractor.ts` & `src/graph/Graph.ts`) where road lengths are computed from multi-point polyline coordinates using the **Haversine great-circle formula** (`src/graph/geodesic.ts`) and turn-by-turn instructions are derived from true compass bearing changes.
5. **Executes Genuine In-House DSA Routing Algorithms** (`Dijkstra`, `A* Geodesic Search`, `BFS`, `DFS`, and `Yen's K-Shortest Paths`) backed by custom `BinaryMinHeap` and `PriorityQueue` implementations—without relying on external black-box routing APIs.

---

## 2. Core Features

- **Real Interactive VFSTR Leaflet Map**: Zoom, pan, toggle OSM road/footpath overlays and building footprints, inspect OSM feature IDs, and click any building or intersection to route.
- **Multi-Modal Campus Routing (`WALKING`, `BICYCLE`, `VEHICLE`)**: Pedestrian walking (`1.4 m/s`) is supported as the primary campus mode alongside bicycle (`4.2 m/s`) and motor vehicle routing, respecting `oneway`, `footway`, and `steps` access tags.
- **Browser Geolocation API Integration**: On explicit user action (*"Use My Current Location"*), requests browser GPS permission, displays live coordinates and accuracy radius in meters, snaps to the nearest campus walkway, and cleanly handles permission denial or off-campus positions.
- **Honest Traffic & Incident Management**: Strictly separates:
  - **(A) Verified Mapped Road Information** (from OpenStreetMap & Admin pathways)
  - **(B) Unverified User-Reported Incidents**
  - **(C) Administrator-Confirmed Incidents & Closures**
  - **(D) Clearly Labelled Traffic Simulations**
- **Emergency Response Simulation**: Simulates Ambulance, Fire Truck, and Police priority routing while enforcing physical access constraints (emergency vehicles cannot illegally cross pedestrian stairs or narrow footpaths).
- **Campus Administration & GeoJSON Console**: Allows administrators to verify/edit building coordinates, add new campus landmarks, draw missing pedestrian footpaths directly on the map, review incident reports, and export/import RFC 7946 **Campus GeoJSON**.

---

## 3. Running & Testing Locally

```bash
# 1. Install dependencies
npm install

# 2. Start the development server on port 3000
npm run dev

# 3. Run the automated 11-part GIS & DSA verification test suite
npx tsx src/__tests__/algorithms.test.ts

# 4. Build for production
npm run build
```
