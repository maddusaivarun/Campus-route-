# Data Structures & Algorithms Specification (`DSA_EXPLANATION.md`)

## 1. Core Data Structures Implemented

### 1.1 Geodesic Weighted Directed Graph (`src/graph/Graph.ts`)
- **Representation**: Adjacency List stored in `Map<string, GraphEdge[]>`, with vertices in `Map<string, GraphNode>` and edges in `Map<string, GraphEdge>`.
- **Geographic Edge Attributes**:
  - `distanceMeters`: Computed from actual OpenStreetMap polyline coordinates using the Haversine formula:
    $$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)}\right)$$
  - `allowWalking`, `allowBicycle`, `allowVehicle`: Enforces physical travel mode constraints (`WALKING`, `BICYCLE`, `VEHICLE`).
- **Space Complexity**: $\mathcal{O}(V + E)$.

### 1.2 Binary Min-Heap & Priority Queue (`src/algorithms/minHeap.ts`, `src/algorithms/priorityQueue.ts`)
- **Representation**: Contiguous 0-indexed binary tree array `HeapEntry<T>[]` paired with an $\mathcal{O}(1)$ lookup table `Map<string, number>` mapping each node key to its current heap index.
- **Complexity**:
  - `peek()`: $\mathcal{O}(1)$
  - `insert(item, priority)`: $\mathcal{O}(\log V)$
  - `extractMin()`: $\mathcal{O}(\log V)$
  - `decreaseKey(item, newPriority)`: $\mathcal{O}(\log V)$ via direct index lookup and `bubbleUp`.

---

## 2. Pathfinding Algorithms Implemented

### 2.1 Dijkstra's Algorithm (`src/algorithms/dijkstra.ts`)
- **Mechanism**: Greedily extracts the unvisited intersection $u$ with minimum cumulative cost $g(u)$ from the `PriorityQueue` and relaxes all traversable outgoing edges $(u, v)$ permitted for the active `RoutingProfile` (`WALKING`, `BICYCLE`, or `VEHICLE`).
- **Turn-by-Turn Generation**: Reconstructs the optimal edge sequence and computes initial/final compass bearings $\theta \in [0^\circ, 360^\circ)$ along each polyline to classify maneuvers (`STRAIGHT`, `SLIGHT_RIGHT`, `TURN_RIGHT`, `SHARP_RIGHT`, `SLIGHT_LEFT`, `TURN_LEFT`, `SHARP_LEFT`, `UTURN`).
- **Time Complexity**: $\mathcal{O}((V + E) \log V)$
- **Space Complexity**: $\mathcal{O}(V)$

### 2.2 A* Geodesic Search (`src/algorithms/astar.ts`)
- **Mechanism**: Prioritizes frontier vertices by $f(n) = g(n) + h(n)$, where $h(n)$ is an **admissible geographic heuristic** computed from the Haversine great-circle distance between node $n$ and the destination $t$:
  - For `DISTANCE` optimization: $h_{\text{dist}}(n) = \text{Haversine}(n, t) \times 0.98$.
  - For `TIME` optimization: $h_{\text{time}}(n) = \frac{\text{Haversine}(n, t)}{v_{\max}}$, where $v_{\max}$ is the maximum physical velocity for the active travel mode (`1.45 m/s` walking, `4.5 m/s` cycling, or `22.2 m/s` emergency vehicle).
- **Admissibility Proof**: Because no road path can be shorter than the great-circle geodesic distance and no unit can exceed $v_{\max}$, $h(n) \le h^*(n)$ holds everywhere, guaranteeing 100% optimal paths while pruning unnecessary node expansions.
- **Time Complexity**: $\mathcal{O}((V + E) \log V)$

### 2.3 Breadth-First Search (`src/algorithms/bfs.ts`) & Depth-First Search (`src/algorithms/dfs.ts`)
- **BFS**: Explores the campus network layer-by-layer using a FIFO queue, finding the path with the minimum number of road intersections (hops) in $\mathcal{O}(V + E)$ time.
- **DFS & Connected Components**: Explores deeply along each branch using a LIFO stack in $\mathcal{O}(V + E)$ time, and includes `findConnectedComponents` to verify campus network reachability when road closures occur.

### 2.4 Yen's K-Shortest Loop-Free Paths (`src/algorithms/yenKShortest.ts`)
- Computes the top $K = 3$ distinct, loop-free campus routes by finding the optimal path $A_1$ via Dijkstra and iteratively suppressing shared root edges at each spur node along $A_{k-1}$.
- **Time Complexity**: $\mathcal{O}(K \cdot V \cdot (V + E) \log V)$.
