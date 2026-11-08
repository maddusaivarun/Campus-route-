import { CampusGraph, RoadStatus, GraphEdge } from '../graph/Graph';
import { IncidentRecord, IncidentVerificationStatus, IncidentCategory } from '../data/campusData';

export interface SimulationPresetResult {
  presetId: string;
  presetName: string;
  updatedEdgesCount: number;
  createdIncidents: IncidentRecord[];
  summary: string;
}

export type SimulationIntensity = 'NORMAL' | 'PEAK_HOUR' | 'HIGH_INCIDENT';

export interface CampusCorridorLink {
  id: string;
  fromLocation: string;
  toLocation: string;
  edgeId: string;
  roadName: string;
  distanceMeters: number;
  status: RoadStatus;
  congestionFactor: number;
  effectiveSpeedKmh: number;
  incidentNote?: string;
}

export interface LiveTrafficTickEvent {
  id: string;
  timestamp: string;
  fromLocation: string;
  toLocation: string;
  roadName: string;
  edgeId: string;
  eventType: 'SLOWDOWN' | 'ACCIDENT' | 'CONGESTION_SURGE' | 'FLOW_CLEARED' | 'CLOSURE';
  previousStatus: RoadStatus;
  newStatus: RoadStatus;
  previousCongestion: number;
  newCongestion: number;
  summary: string;
}

/**
 * Canonical corridor definitions connecting the 9 core VFSTR campus locations:
 * Academic Block, Library, Boys Hostel, Girls Hostel, Canteen, U Block, H Block, P Block, and N Block.
 */
const VFSTR_BUILDING_CORRIDOR_DEFS: Array<{
  id: string;
  fromLocation: string;
  toLocation: string;
  sourceNodeId: string;
  targetNodeId: string;
  fallbackRoadKeywords: string[];
}> = [
  {
    id: 'COR_ACAD_UBLK',
    fromLocation: 'Academic Block',
    toLocation: 'U Block',
    sourceNodeId: 'OSM_N_1002',
    targetNodeId: 'OSM_N_1003',
    fallbackRoadKeywords: ['Main Academic Spine', 'A-Block'],
  },
  {
    id: 'COR_UBLK_LIB',
    fromLocation: 'U Block',
    toLocation: 'Library',
    sourceNodeId: 'OSM_N_1009',
    targetNodeId: 'OSM_N_1004',
    fallbackRoadKeywords: ['U-Block South Circular Foyer', 'Main Academic Spine'],
  },
  {
    id: 'COR_ACAD_HBLK',
    fromLocation: 'Academic Block',
    toLocation: 'H Block',
    sourceNodeId: 'OSM_N_1003',
    targetNodeId: 'OSM_N_1012',
    fallbackRoadKeywords: ['West Academic & Pharmacy Link', 'H-Block'],
  },
  {
    id: 'COR_LIB_CANT',
    fromLocation: 'Library',
    toLocation: 'Canteen',
    sourceNodeId: 'OSM_N_1004',
    targetNodeId: 'OSM_N_1005',
    fallbackRoadKeywords: ['Main Academic Spine', 'Canteen'],
  },
  {
    id: 'COR_LIB_NBLK',
    fromLocation: 'Library',
    toLocation: 'N Block',
    sourceNodeId: 'OSM_N_1011',
    targetNodeId: 'OSM_N_1014',
    fallbackRoadKeywords: ['Library Central Pedestrian Plaza', 'Library to Nagarjuna'],
  },
  {
    id: 'COR_CANT_BOYS',
    fromLocation: 'Canteen',
    toLocation: 'Boys Hostel',
    sourceNodeId: 'OSM_N_1005',
    targetNodeId: 'OSM_N_1006',
    fallbackRoadKeywords: ['Canteen to Vignan Vihar', 'East Hostel'],
  },
  {
    id: 'COR_CANT_GIRLS',
    fromLocation: 'Canteen',
    toLocation: 'Girls Hostel',
    sourceNodeId: 'OSM_N_1006',
    targetNodeId: 'OSM_N_1016',
    fallbackRoadKeywords: ['East Residential Hostel Corridor'],
  },
  {
    id: 'COR_HBLK_PBLK',
    fromLocation: 'H Block',
    toLocation: 'P Block',
    sourceNodeId: 'OSM_N_1013',
    targetNodeId: 'OSM_N_1018',
    fallbackRoadKeywords: ['West Academic & Pharmacy Link'],
  },
  {
    id: 'COR_NBLK_PBLK',
    fromLocation: 'N Block',
    toLocation: 'P Block',
    sourceNodeId: 'OSM_N_1018',
    targetNodeId: 'OSM_N_1020',
    fallbackRoadKeywords: ['South Boundary Service Road', 'South Nagarjuna'],
  },
  {
    id: 'COR_NBLK_GIRLS',
    fromLocation: 'N Block',
    toLocation: 'Girls Hostel',
    sourceNodeId: 'OSM_N_1014',
    targetNodeId: 'OSM_N_1016',
    fallbackRoadKeywords: ['South Nagarjuna Bhavan & Hostel Road'],
  },
  {
    id: 'COR_UBLK_BOYS',
    fromLocation: 'U Block',
    toLocation: 'Boys Hostel',
    sourceNodeId: 'OSM_N_1008',
    targetNodeId: 'OSM_N_1010',
    fallbackRoadKeywords: ['North Perimeter & Ambulance Service Road'],
  },
];

const EVENT_REASONS: Record<
  'SLOWDOWN' | 'ACCIDENT' | 'CONGESTION_SURGE',
  string[]
> = {
  SLOWDOWN: [
    'Lecture shift transition pedestrian surge',
    'Campus shuttle bus boarding slow-down',
    'Slow-moving laboratory supply vehicle',
    'High student footfall & cycle crossing bottleneck',
    'Faculty parking queue spillover',
  ],
  CONGESTION_SURGE: [
    'Peak academic hour bottleneck',
    'Dense student movement between blocks',
    'Security checkpoint verification slow-down',
    'Convocation & seminar hall dispersal wave',
  ],
  ACCIDENT: [
    'Minor two-wheeler & cycle collision blocking lane',
    'Stalled service vehicle obstructing right-of-way',
    'Medical first-responder cordon active on corridor',
    'Fallen tree branch & maintenance hazard on roadway',
  ],
};

export class TrafficEngine {
  /**
   * Applies an incident or road status update to a specific road edge (and its reverse edge if bidirectional).
   */
  static updateRoadEdge(
    graph: CampusGraph,
    edgeId: string,
    updates: {
      congestionFactor?: number;
      status?: RoadStatus;
      incidentReport?: string;
    }
  ): void {
    const edge = graph.getEdge(edgeId);
    if (!edge) return;

    graph.updateEdgeCondition(edgeId, updates);

    const allEdges = graph.getAllEdges();
    const reverseEdge = allEdges.find(
      (e) => e.source === edge.target && e.target === edge.source && e.roadName === edge.roadName
    );
    if (reverseEdge) {
      graph.updateEdgeCondition(reverseEdge.id, updates);
    }
  }

  /**
   * Resolves the 9-building campus corridor links against the live CampusGraph so the UI can display
   * real-time telemetry between Academic Block, Library, Boys Hostel, Girls Hostel, Canteen, U Block, H Block, P Block, and N Block.
   */
  static getCampusCorridorLinks(graph: CampusGraph): CampusCorridorLink[] {
    const uniqueEdges = graph.getUniqueUndirectedEdges();
    const allEdges = graph.getAllEdges();

    return VFSTR_BUILDING_CORRIDOR_DEFS.map((def, idx) => {
      let matched = allEdges.find(
        (e) =>
          (e.source === def.sourceNodeId && e.target === def.targetNodeId) ||
          (e.source === def.targetNodeId && e.target === def.sourceNodeId)
      );

      if (!matched) {
        matched = uniqueEdges.find((e) =>
          def.fallbackRoadKeywords.some((kw) =>
            e.roadName.toLowerCase().includes(kw.toLowerCase())
          )
        );
      }

      if (!matched) {
        matched = uniqueEdges[idx % Math.max(1, uniqueEdges.length)];
      }

      const baseSpeed = matched ? matched.maxSpeedKmh : 20;
      const factor = matched ? matched.congestionFactor : 1.0;
      const status = matched ? matched.status : 'OPEN';
      const effectiveSpeedKmh =
        status === 'CLOSED'
          ? 0
          : Number(Math.max(2.0, baseSpeed / Math.max(1.0, factor)).toFixed(1));

      return {
        id: def.id,
        fromLocation: def.fromLocation,
        toLocation: def.toLocation,
        edgeId: matched ? matched.id : `E_${idx}`,
        roadName: matched ? matched.roadName : `${def.fromLocation} – ${def.toLocation} Corridor`,
        distanceMeters: matched ? matched.distanceMeters : 120,
        status,
        congestionFactor: Number(factor.toFixed(2)),
        effectiveSpeedKmh,
        incidentNote: matched?.incidentReport,
      };
    });
  }

  /**
   * Executes one dynamic real-time traffic simulation tick across the 9 VFSTR campus locations.
   * Randomly generates realistic traffic flow changes (slow-downs, congestion surges, accidents, or clearances)
   * and updates the graph weights so active routes dynamically recalculate.
   */
  static simulateDynamicTrafficTick(
    graph: CampusGraph,
    intensity: SimulationIntensity = 'NORMAL'
  ): {
    events: LiveTrafficTickEvent[];
    newIncident?: IncidentRecord;
    resolvedEdgeIds: string[];
  } {
    const corridorLinks = this.getCampusCorridorLinks(graph);
    if (corridorLinks.length === 0) {
      return { events: [], resolvedEdgeIds: [] };
    }

    const nowStr = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const events: LiveTrafficTickEvent[] = [];
    const resolvedEdgeIds: string[] = [];
    let newIncident: IncidentRecord | undefined;

    // Pick 1 or 2 random corridors between the 9 VFSTR locations to update this tick
    const numUpdates = intensity === 'NORMAL' ? 1 : 2;
    const shuffled = [...corridorLinks].sort(() => Math.random() - 0.5);
    const chosenCorridors = shuffled.slice(0, numUpdates);

    for (const corridor of chosenCorridors) {
      const edge = graph.getEdge(corridor.edgeId);
      if (!edge) continue;

      const prevStatus = edge.status;
      const prevCongestion = Number(edge.congestionFactor.toFixed(1));
      const roll = Math.random();

      // If this corridor was already congested or had an accident, give it a ~45% chance to clear/recover
      if (prevStatus !== 'OPEN' && roll < 0.45) {
        this.updateRoadEdge(graph, edge.id, {
          status: 'OPEN',
          congestionFactor: 1.0,
          incidentReport: undefined,
        });
        resolvedEdgeIds.push(edge.id);

        events.push({
          id: `EVT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: nowStr,
          fromLocation: corridor.fromLocation,
          toLocation: corridor.toLocation,
          roadName: corridor.roadName,
          edgeId: edge.id,
          eventType: 'FLOW_CLEARED',
          previousStatus: prevStatus,
          newStatus: 'OPEN',
          previousCongestion: prevCongestion,
          newCongestion: 1.0,
          summary: `Traffic cleared between ${corridor.fromLocation} & ${corridor.toLocation} (${corridor.roadName} restored to 1.0x normal flow).`,
        });
        continue;
      }

      // Determine probability thresholds based on simulation intensity
      const accidentThreshold =
        intensity === 'HIGH_INCIDENT' ? 0.34 : intensity === 'PEAK_HOUR' ? 0.22 : 0.16;
      const surgeThreshold =
        intensity === 'HIGH_INCIDENT' ? 0.68 : intensity === 'PEAK_HOUR' ? 0.65 : 0.52;

      if (roll < accidentThreshold) {
        // Generate an ACCIDENT or severe bottleneck between two VFSTR buildings
        const newFactor = Number((2.7 + Math.random() * 1.1).toFixed(1));
        const reasonList = EVENT_REASONS.ACCIDENT;
        const reason = reasonList[Math.floor(Math.random() * reasonList.length)];
        const reportText = `[LIVE SIM] ${reason} (${corridor.fromLocation} ↔ ${corridor.toLocation})`;

        this.updateRoadEdge(graph, edge.id, {
          status: 'ACCIDENT',
          congestionFactor: newFactor,
          incidentReport: reportText,
        });

        events.push({
          id: `EVT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: nowStr,
          fromLocation: corridor.fromLocation,
          toLocation: corridor.toLocation,
          roadName: corridor.roadName,
          edgeId: edge.id,
          eventType: 'ACCIDENT',
          previousStatus: prevStatus,
          newStatus: 'ACCIDENT',
          previousCongestion: prevCongestion,
          newCongestion: newFactor,
          summary: `Accident / Hazard detected between ${corridor.fromLocation} & ${corridor.toLocation}: ${reason} (${newFactor}x delay).`,
        });

        if (!newIncident) {
          newIncident = this.createIncidentRecord({
            graph,
            edgeId: edge.id,
            type: 'ACCIDENT',
            severity: newFactor >= 3.3 ? 'CRITICAL' : 'HIGH',
            title: `[LIVE SIM] Hazard: ${corridor.fromLocation} ↔ ${corridor.toLocation}`,
            description: `${reason} along ${corridor.roadName}. Dynamic routing updated with ${newFactor}x weight penalty.`,
            reportedByRole: 'SIMULATION',
            expiryMinutes: 15,
          });
        }
      } else if (roll < surgeThreshold) {
        // Generate a traffic CONGESTION_SURGE between two VFSTR buildings
        const newFactor = Number((1.9 + Math.random() * 0.9).toFixed(1));
        const reasonList = EVENT_REASONS.CONGESTION_SURGE;
        const reason = reasonList[Math.floor(Math.random() * reasonList.length)];
        const reportText = `[LIVE SIM] ${reason} (${corridor.fromLocation} ↔ ${corridor.toLocation})`;

        this.updateRoadEdge(graph, edge.id, {
          status: 'CONGESTED',
          congestionFactor: newFactor,
          incidentReport: reportText,
        });

        events.push({
          id: `EVT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: nowStr,
          fromLocation: corridor.fromLocation,
          toLocation: corridor.toLocation,
          roadName: corridor.roadName,
          edgeId: edge.id,
          eventType: 'CONGESTION_SURGE',
          previousStatus: prevStatus,
          newStatus: 'CONGESTED',
          previousCongestion: prevCongestion,
          newCongestion: newFactor,
          summary: `Congestion surge between ${corridor.fromLocation} & ${corridor.toLocation}: ${reason} (${newFactor}x slow-down).`,
        });
      } else {
        // Generate a moderate SLOWDOWN between two VFSTR buildings
        const newFactor = Number((1.3 + Math.random() * 0.5).toFixed(1));
        const reasonList = EVENT_REASONS.SLOWDOWN;
        const reason = reasonList[Math.floor(Math.random() * reasonList.length)];
        const newStatus: RoadStatus = newFactor >= 1.5 ? 'CONGESTED' : 'OPEN';
        const reportText = `[LIVE SIM] ${reason} (${corridor.fromLocation} ↔ ${corridor.toLocation})`;

        this.updateRoadEdge(graph, edge.id, {
          status: newStatus,
          congestionFactor: newFactor,
          incidentReport: reportText,
        });

        events.push({
          id: `EVT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: nowStr,
          fromLocation: corridor.fromLocation,
          toLocation: corridor.toLocation,
          roadName: corridor.roadName,
          edgeId: edge.id,
          eventType: 'SLOWDOWN',
          previousStatus: prevStatus,
          newStatus,
          previousCongestion: prevCongestion,
          newCongestion: newFactor,
          summary: `Flow slow-down between ${corridor.fromLocation} & ${corridor.toLocation}: ${reason} (${newFactor}x multiplier).`,
        });
      }
    }

    return { events, newIncident, resolvedEdgeIds };
  }

  /**
   * Synchronizes active incidents onto the graph edges so routing respects closures and hazards.
   */
  static syncIncidentsToGraph(graph: CampusGraph, incidents: IncidentRecord[]): void {
    const now = Date.now();
    for (const edge of graph.getAllEdges()) {
      graph.updateEdgeCondition(edge.id, {
        status: 'OPEN',
        congestionFactor: 1.0,
        incidentReport: undefined,
      });
    }

    for (const inc of incidents) {
      if (inc.verificationStatus === 'RESOLVED' || inc.verificationStatus === 'REJECTED') {
        continue;
      }
      if (inc.expiresAtIso && new Date(inc.expiresAtIso).getTime() < now) {
        continue;
      }

      const targetEdge = this.findMatchingEdgeForIncident(graph, inc);
      if (!targetEdge) continue;

      if (inc.type === 'CLOSURE' || inc.type === 'CONSTRUCTION') {
        this.updateRoadEdge(graph, targetEdge.id, {
          status: 'CLOSED',
          congestionFactor: 9.9,
          incidentReport: `[${inc.verificationStatus}] ${inc.title}`,
        });
      } else if (inc.type === 'ACCIDENT' || inc.type === 'MEDICAL' || inc.type === 'FIRE') {
        this.updateRoadEdge(graph, targetEdge.id, {
          status: 'ACCIDENT',
          congestionFactor: inc.severity === 'CRITICAL' ? 3.8 : 2.8,
          incidentReport: `[${inc.verificationStatus}] ${inc.title}`,
        });
      } else if (inc.type === 'CONGESTION') {
        this.updateRoadEdge(graph, targetEdge.id, {
          status: 'CONGESTED',
          congestionFactor: inc.severity === 'HIGH' ? 2.5 : 1.8,
          incidentReport: `[${inc.verificationStatus}] ${inc.title}`,
        });
      }
    }
  }

  static findMatchingEdgeForIncident(graph: CampusGraph, inc: IncidentRecord): GraphEdge | undefined {
    const edges = graph.getAllEdges();
    if (inc.edgeId) {
      const exact = graph.getEdge(inc.edgeId);
      if (exact) return exact;
    }
    if (inc.roadName) {
      const byName = edges.find((e) => e.roadName.toLowerCase() === inc.roadName.toLowerCase());
      if (byName) return byName;
    }
    let bestEdge: GraphEdge | undefined;
    let bestDistSq = Infinity;
    for (const edge of edges) {
      const src = graph.getNode(edge.source);
      const tgt = graph.getNode(edge.target);
      if (!src || !tgt) continue;
      const midLat = (src.lat + tgt.lat) / 2;
      const midLng = (src.lng + tgt.lng) / 2;
      const dSq = Math.pow(midLat - inc.lat, 2) + Math.pow(midLng - inc.lng, 2);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestEdge = edge;
      }
    }
    return bestEdge;
  }

  /**
   * Creates a new user-reported, administrator-confirmed, or simulated incident record.
   */
  static createIncidentRecord(params: {
    graph: CampusGraph;
    edgeId: string;
    type: IncidentRecord['type'];
    severity: IncidentRecord['severity'];
    title: string;
    description: string;
    reportedByRole: 'USER' | 'ADMIN' | 'SIMULATION';
    expiryMinutes?: number;
  }): IncidentRecord {
    const edge = params.graph.getEdge(params.edgeId) || params.graph.getUniqueUndirectedEdges()[0];
    const src = edge ? params.graph.getNode(edge.source) : undefined;
    const tgt = edge ? params.graph.getNode(edge.target) : undefined;

    const lat = src && tgt ? Number(((src.lat + tgt.lat) / 2).toFixed(6)) : 16.23155;
    const lng = src && tgt ? Number(((src.lng + tgt.lng) / 2).toFixed(6)) : 80.55127;

    const now = new Date();
    const expiresAt = params.expiryMinutes
      ? new Date(now.getTime() + params.expiryMinutes * 60000).toISOString()
      : null;

    const category: IncidentCategory =
      params.reportedByRole === 'ADMIN'
        ? 'ADMIN_CONFIRMED'
        : params.reportedByRole === 'SIMULATION'
        ? 'SIMULATED_TRAFFIC'
        : 'USER_REPORTED';

    const verificationStatus: IncidentVerificationStatus =
      params.reportedByRole === 'ADMIN' ? 'ADMIN_CONFIRMED' : 'UNVERIFIED_USER_REPORT';

    return {
      id: `INC-${Math.floor(1000 + Math.random() * 9000)}`,
      title: params.title,
      type: params.type,
      severity: params.severity,
      category,
      verificationStatus,
      edgeId: edge ? edge.id : params.edgeId,
      roadName: edge ? edge.roadName : 'VFSTR Campus Corridor',
      lat,
      lng,
      reportedAt: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      createdAtIso: now.toISOString(),
      expiresAtIso: expiresAt,
      reportedBy:
        params.reportedByRole === 'ADMIN'
          ? 'VFSTR Campus Security Admin'
          : params.reportedByRole === 'SIMULATION'
          ? 'Real-Time Traffic Simulator'
          : 'Campus Field User Report',
      description: params.description,
      impactSummary:
        params.type === 'CLOSURE' || params.type === 'CONSTRUCTION'
          ? 'Corridor blocked — automatic rerouting active'
          : 'Elevated traversal cost — dynamic weight penalty applied',
    };
  }

  /**
   * Clearly labelled Traffic Simulation scenarios for testing dynamic rerouting.
   */
  static applySimulationScenario(
    graph: CampusGraph,
    scenarioId: 'CLEAR' | 'PEAK_CONVOCATION' | 'SPINE_CLOSURE' | 'HOSTEL_MEDICAL_ALERT' | 'RANDOM_STRESS'
  ): SimulationPresetResult {
    graph.resetAllConditions();
    const uniqueEdges = graph.getUniqueUndirectedEdges();
    const createdIncidents: IncidentRecord[] = [];
    let updatedCount = 0;

    if (scenarioId === 'CLEAR') {
      return {
        presetId: scenarioId,
        presetName: 'Reset Simulated Conditions (Verified OSM Base Network)',
        updatedEdgesCount: uniqueEdges.length,
        createdIncidents: [],
        summary: 'Cleared all simulated traffic and unverified road blocks. Restored baseline OpenStreetMap speeds.',
      };
    }

    if (scenarioId === 'PEAK_CONVOCATION') {
      for (const edge of uniqueEdges) {
        if (edge.roadName.includes('Main') || edge.roadName.includes('A-Block') || edge.roadName.includes('Library')) {
          this.updateRoadEdge(graph, edge.id, {
            status: 'CONGESTED',
            congestionFactor: 2.4,
            incidentReport: '[SIMULATED] Convocation & Shift Change Peak Flow',
          });
          updatedCount++;
        }
      }
      if (uniqueEdges[0]) {
        createdIncidents.push(
          this.createIncidentRecord({
            graph,
            edgeId: uniqueEdges[0].id,
            type: 'CONGESTION',
            severity: 'HIGH',
            title: '[SIMULATED] Peak Convocation & Academic Shift Traffic',
            description: 'Simulated high pedestrian and vehicle density between Academic Block, U Block & Library.',
            reportedByRole: 'SIMULATION',
            expiryMinutes: 60,
          })
        );
      }
      return {
        presetId: scenarioId,
        presetName: 'Simulated Peak Academic Shift Traffic',
        updatedEdgesCount: updatedCount,
        createdIncidents,
        summary: `Applied simulated congestion (2.4x multiplier) across ${updatedCount} primary campus corridors.`,
      };
    }

    if (scenarioId === 'SPINE_CLOSURE') {
      const spineEdge =
        uniqueEdges.find((e) => e.roadName.includes('Main Academic Spine') && e.allowVehicle) || uniqueEdges[1] || uniqueEdges[0];
      if (spineEdge) {
        this.updateRoadEdge(graph, spineEdge.id, {
          status: 'CLOSED',
          congestionFactor: 9.9,
          incidentReport: '[SIMULATED] Central Spine Crane & Maintenance Blockade',
        });
        updatedCount = 1;
        createdIncidents.push(
          this.createIncidentRecord({
            graph,
            edgeId: spineEdge.id,
            type: 'CLOSURE',
            severity: 'CRITICAL',
            title: `[SIMULATED] Road Closure on ${spineEdge.roadName}`,
            description: 'Simulated full road closure between Academic Block and Library to test automatic Dijkstra/A* diversion.',
            reportedByRole: 'SIMULATION',
            expiryMinutes: 120,
          })
        );
      }
      return {
        presetId: scenarioId,
        presetName: 'Simulated Central Spine Road Closure',
        updatedEdgesCount: updatedCount,
        createdIncidents,
        summary: `Blocked ${spineEdge?.roadName || 'Central Spine'} to demonstrate automatic detour computation.`,
      };
    }

    if (scenarioId === 'HOSTEL_MEDICAL_ALERT') {
      const hostelEdge =
        uniqueEdges.find((e) => e.roadName.includes('Hostel') || e.roadName.includes('East') || e.roadName.includes('Canteen')) ||
        uniqueEdges[Math.min(2, uniqueEdges.length - 1)];
      if (hostelEdge) {
        this.updateRoadEdge(graph, hostelEdge.id, {
          status: 'ACCIDENT',
          congestionFactor: 3.5,
          incidentReport: '[SIMULATED] Emergency Medical Cordon between Canteen & Hostels',
        });
        updatedCount = 1;
        createdIncidents.push(
          this.createIncidentRecord({
            graph,
            edgeId: hostelEdge.id,
            type: 'MEDICAL',
            severity: 'CRITICAL',
            title: `[SIMULATED] Medical Cordon on ${hostelEdge.roadName}`,
            description: 'Simulated medical incident between Canteen, Boys Hostel & Girls Hostel restricting civilian flow.',
            reportedByRole: 'SIMULATION',
            expiryMinutes: 90,
          })
        );
      }
      return {
        presetId: scenarioId,
        presetName: 'Simulated Hostel Medical Emergency Cordon',
        updatedEdgesCount: updatedCount,
        createdIncidents,
        summary: `Activated simulated medical cordon on ${hostelEdge?.roadName || 'Hostel Corridor'}.`,
      };
    }

    // RANDOM_STRESS
    uniqueEdges.forEach((edge, idx) => {
      if (idx % 3 === 1) {
        this.updateRoadEdge(graph, edge.id, {
          status: 'CONGESTED',
          congestionFactor: 2.1,
          incidentReport: '[SIMULATED] Stress Test Congestion',
        });
        updatedCount++;
      }
    });

    return {
      presetId: scenarioId,
      presetName: 'Simulated Multi-Corridor Stress Test',
      updatedEdgesCount: updatedCount,
      createdIncidents,
      summary: `Applied simulated congestion to ${updatedCount} campus road segments.`,
    };
  }
}
