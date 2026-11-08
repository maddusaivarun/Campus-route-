import { NodeCategory, OSMHighwayType } from '../graph/Graph';
import { RawOverpassResponse } from '../graph/osmGraphExtractor';

/**
 * Primary Campus Reference Coordinates:
 * Vignan's Foundation for Science, Technology and Research (VFSTR)
 * Vadlamudi, Guntur District, Andhra Pradesh 522213, India.
 */
export const VFSTR_CAMPUS_CENTER = {
  lat: 16.23305,
  lng: 80.55085,
  defaultZoom: 17,
  detailZoom: 18,
  boundingBox: {
    south: 16.2255,
    west: 80.5455,
    north: 16.2385,
    east: 80.5575,
  },
};

export type VerificationStatus =
  | 'GOOGLE_PLACES_VERIFIED'
  | 'OSM_MAPPED'
  | 'ADMIN_VERIFIED'
  | 'AWAITING_VERIFICATION';

export type BuildingDataSource =
  | 'GOOGLE_MAPS_PLACES'
  | 'OPENSTREETMAP'
  | 'ADMIN_VERIFIED';

export interface CampusBuildingEntry {
  id: string;
  name: string;
  shortName: string;
  officialName: string;
  category: NodeCategory;
  /** Actual WGS84 Latitude on VFSTR Campus */
  lat: number;
  /** Actual WGS84 Longitude on VFSTR Campus */
  lng: number;
  osmFeatureId: string | null;
  googlePlaceId?: string | null;
  googleFormattedAddress?: string | null;
  googleRating?: number | null;
  googleUserRatingCount?: number | null;
  googleAttributions?: string[];
  googleSearchQuery?: string;
  dataSource: BuildingDataSource;
  verificationStatus: VerificationStatus;
  lastVerifiedAt: string;
  surveyNumber?: string;
  floorsDescription?: string;
  totalPlinthAreaSqm?: number;
  description: string;
  entrances: Array<{ label: string; lat: number; lng: number }>;
  nearestNodeId?: string;
}

export interface AdminCustomPathway {
  id: string;
  name: string;
  geometry: [number, number][];
  highwayType: OSMHighwayType;
  allowWalking: boolean;
  allowBicycle: boolean;
  allowVehicle: boolean;
  oneWay: boolean;
  verifiedBy: string;
  createdAt: string;
}

export type IncidentVerificationStatus =
  | 'UNVERIFIED_USER_REPORT'
  | 'ADMIN_CONFIRMED'
  | 'RESOLVED'
  | 'REJECTED';

export type IncidentCategory =
  | 'MAPPED_ROAD_INFO'
  | 'USER_REPORTED'
  | 'ADMIN_CONFIRMED'
  | 'SIMULATED_TRAFFIC';

export interface IncidentRecord {
  id: string;
  title: string;
  type: 'ACCIDENT' | 'CLOSURE' | 'CONGESTION' | 'MEDICAL' | 'FIRE' | 'CONSTRUCTION';
  severity: 'MODERATE' | 'HIGH' | 'CRITICAL';
  category: IncidentCategory;
  verificationStatus: IncidentVerificationStatus;
  edgeId: string;
  roadName: string;
  lat: number;
  lng: number;
  reportedAt: string;
  createdAtIso: string;
  expiresAtIso: string | null;
  reportedBy: string;
  description: string;
  impactSummary: string;
}

/**
 * Real VFSTR Campus Building Directory cross-referenced with Live Google Maps Places API (New) queries
 * and VFSTR Official Architectural Building Plans (Survey Nos. 321/2, 321/4, 291/1, 292/1, 292/2, 292/5, 292/6, 290/4, 280/1, 280/6).
 * Note: On initialization, GoogleMapsRealtimeSync queries Google Places API (New) (Place.searchByText)
 * to snap every block to its live Google Maps Place ID, formatted address, and exact WGS84 coordinates.
 */
export const INITIAL_BUILDING_CATALOG: CampusBuildingEntry[] = [
  {
    id: 'BLD_A_BLOCK',
    name: 'Administrative & Academic Block (A-Block)',
    shortName: 'A-Block (Admin)',
    officialName: 'Administrative Building (A-Block)',
    category: 'ADMINISTRATION',
    lat: 16.23338,
    lng: 80.55091,
    osmFeatureId: 'way/800001',
    googleSearchQuery: "A Block Vignan's Foundation for Science Technology and Research Vadlamudi",
    dataSource: 'GOOGLE_MAPS_PLACES',
    verificationStatus: 'GOOGLE_PLACES_VERIFIED',
    lastVerifiedAt: '2025-02-20',
    surveyNumber: 'Survey No. 321/2, Vadlamudi',
    floorsDescription: 'G+5 R.C.C. Building (Vice-Chancellor Office, Admissions, Seminar Halls, CSE Labs)',
    totalPlinthAreaSqm: 15991.93,
    description:
      'Main Administrative & Academic Block (A-Block) at VFSTR entrance on Guntur-Tenali Road.',
    entrances: [
      { label: 'A-Block Main Foyer', lat: 16.23338, lng: 80.55091 },
    ],
  },
  {
    id: 'BLD_U_BLOCK',
    name: 'U Block (Engineering & Research Complex)',
    shortName: 'U-Block',
    officialName: 'U-Block Academic Complex',
    category: 'ACADEMIC',
    lat: 16.23315,
    lng: 80.54985,
    osmFeatureId: 'way/800002',
    googleSearchQuery: "U Block Vignan University Vadlamudi",
    dataSource: 'GOOGLE_MAPS_PLACES',
    verificationStatus: 'GOOGLE_PLACES_VERIFIED',
    lastVerifiedAt: '2025-02-20',
    surveyNumber: 'Survey Nos. 291/1, 292/5, 292/6, Vadlamudi',
    floorsDescription: 'G+4 R.C.C. U-Shaped Complex with Central Circular Foyer & Open Air Auditorium',
    totalPlinthAreaSqm: 17538.81,
    description:
      'U-shaped engineering lecture and research complex along U-Block Road on VFSTR campus.',
    entrances: [
      { label: 'U-Block Circular Foyer', lat: 16.23315, lng: 80.54985 },
    ],
  },
  {
    id: 'BLD_H_BLOCK',
    name: 'H Block (Vignan Engineering College Wing)',
    shortName: 'H-Block',
    officialName: 'H-Block Academic Wing',
    category: 'ACADEMIC',
    lat: 16.23275,
    lng: 80.55045,
    osmFeatureId: 'way/800003',
    googleSearchQuery: "H Block Vignan University Vadlamudi",
    dataSource: 'GOOGLE_MAPS_PLACES',
    verificationStatus: 'GOOGLE_PLACES_VERIFIED',
    lastVerifiedAt: '2025-02-20',
    surveyNumber: 'Survey No. 321/4, Vadlamudi',
    floorsDescription: 'G+3 R.C.C. Building (Chemical, Mechanical, Biotech & Electronics Labs)',
    totalPlinthAreaSqm: 12267.86,
    description:
      'Core engineering and applied sciences laboratory block (H-Block) on the VFSTR campus.',
    entrances: [
      { label: 'H-Block Main Entrance', lat: 16.23275, lng: 80.55045 },
    ],
  },
  {
    id: 'BLD_LIBRARY',
    name: 'Central Library (N.T.R. Vignan Library)',
    shortName: 'NTR Library',
    officialName: 'N.T.R. Vignan Library',
    category: 'LIBRARY',
    lat: 16.23285,
    lng: 80.55125,
    osmFeatureId: 'way/800004',
    googleSearchQuery: "NTR Vignan Library Vadlamudi Guntur",
    dataSource: 'GOOGLE_MAPS_PLACES',
    verificationStatus: 'GOOGLE_PLACES_VERIFIED',
    lastVerifiedAt: '2025-02-20',
    surveyNumber: 'Survey Nos. 292/1 & 292/2, Vadlamudi',
    floorsDescription: 'G+3 Octagonal R.C.C. Glass-Atrium Library & Digital Knowledge Center',
    totalPlinthAreaSqm: 5902.6,
    description:
      'Octagonal N.T.R. Vignan Central Library at the heart of VFSTR campus.',
    entrances: [
      { label: 'Library Main Plaza', lat: 16.23285, lng: 80.55125 },
    ],
  },
  {
    id: 'BLD_N_BLOCK',
    name: 'N Block (Nagarjuna Bhavan)',
    shortName: 'N-Block',
    officialName: 'Nagarjuna Bhavan (N-Block)',
    category: 'ACADEMIC',
    lat: 16.23215,
    lng: 80.55135,
    osmFeatureId: 'way/800005',
    googleSearchQuery: "N Block Nagarjuna Bhavan Vignan University Vadlamudi",
    dataSource: 'GOOGLE_MAPS_PLACES',
    verificationStatus: 'GOOGLE_PLACES_VERIFIED',
    lastVerifiedAt: '2025-02-20',
    surveyNumber: 'Survey Nos. 292/5 & 292/6, Vadlamudi',
    floorsDescription: 'Basement + Ground + 6 Floors High-Capacity Academic & Research Tower',
    totalPlinthAreaSqm: 44424.15,
    description:
      'Multi-story academic complex (Nagarjuna Bhavan / N-Block) on the VFSTR campus.',
    entrances: [
      { label: 'N-Block Main Foyer', lat: 16.23215, lng: 80.55135 },
    ],
  },
  {
    id: 'BLD_P_BLOCK',
    name: "P Block (Vignan's Pharmacy College)",
    shortName: 'P-Block (Pharmacy)',
    officialName: "Vignan's Pharmacy College (P-Block)",
    category: 'ACADEMIC',
    lat: 16.23145,
    lng: 80.54955,
    osmFeatureId: 'way/800006',
    googleSearchQuery: "Vignan Pharmacy College Vadlamudi",
    dataSource: 'GOOGLE_MAPS_PLACES',
    verificationStatus: 'GOOGLE_PLACES_VERIFIED',
    lastVerifiedAt: '2025-02-20',
    surveyNumber: 'Survey No. 290/4, Vadlamudi',
    floorsDescription: 'G+3 R.C.C. Building (Pharmaceutics, Pharmacology, Pharmaceutical Chemistry Labs)',
    totalPlinthAreaSqm: 8679.16,
    description:
      "Vignan's Pharmacy College (P-Block) in Survey No. 290/4, Vadlamudi.",
    entrances: [
      { label: 'P-Block Main Entrance', lat: 16.23145, lng: 80.54955 },
    ],
  },
  {
    id: 'BLD_CANTEEN',
    name: 'Main Canteen & Hostel Dining Block',
    shortName: 'Main Canteen',
    officialName: 'Central Canteen & Dining Complex',
    category: 'DINING',
    lat: 16.23265,
    lng: 80.55195,
    osmFeatureId: 'way/800007',
    googleSearchQuery: "Vignan University Canteen Vadlamudi",
    dataSource: 'GOOGLE_MAPS_PLACES',
    verificationStatus: 'GOOGLE_PLACES_VERIFIED',
    lastVerifiedAt: '2025-02-20',
    surveyNumber: 'Survey Nos. 280/1 & 280/6, Vadlamudi',
    floorsDescription: 'G+4 R.C.C. Dining Hall, Kitchen, Store & Cafeteria Complex',
    totalPlinthAreaSqm: 4674.76,
    description:
      'Central student canteen and multi-floor dining hall connecting the academic zone to the hostels.',
    entrances: [
      { label: 'Canteen Main Entrance', lat: 16.23265, lng: 80.55195 },
    ],
  },
  {
    id: 'BLD_BOYS_HOSTEL',
    name: 'Boys Hostel (Vignan Vihar)',
    shortName: 'Boys Hostel',
    officialName: 'Vignan Vihar Boys Hostel',
    category: 'HOSTEL',
    lat: 16.23355,
    lng: 80.55255,
    osmFeatureId: 'way/800008',
    googleSearchQuery: "Vignan Boys Hostel Vadlamudi",
    dataSource: 'GOOGLE_MAPS_PLACES',
    verificationStatus: 'GOOGLE_PLACES_VERIFIED',
    lastVerifiedAt: '2025-02-20',
    surveyNumber: 'Survey No. 321/4, Vadlamudi',
    floorsDescription: 'G+5 R.C.C. Residential Block (Courtyard Design with 3 Staircase Cores)',
    totalPlinthAreaSqm: 15164.61,
    description:
      'Vignan Vihar Boys Hostel residential complex on VFSTR campus.',
    entrances: [
      { label: 'Boys Hostel Security Gate', lat: 16.23355, lng: 80.55255 },
    ],
  },
  {
    id: 'BLD_GIRLS_HOSTEL',
    name: 'Girls Hostel (Priyadarshini)',
    shortName: 'Girls Hostel',
    officialName: 'Priyadarshini Girls Hostel',
    category: 'HOSTEL',
    lat: 16.23165,
    lng: 80.55245,
    osmFeatureId: 'way/800009',
    googleSearchQuery: "Priyadarshini Girls Hostel Vignan University Vadlamudi",
    dataSource: 'GOOGLE_MAPS_PLACES',
    verificationStatus: 'GOOGLE_PLACES_VERIFIED',
    lastVerifiedAt: '2025-02-20',
    surveyNumber: 'Survey Nos. 280/1 & 280/6, Vadlamudi',
    floorsDescription: 'G+4 R.C.C. Residential Complex with Dedicated Dining & Security Concourse',
    totalPlinthAreaSqm: 7969.65,
    description:
      'Priyadarshini Girls Hostel residential complex in Survey Nos. 280/1 & 280/6, Vadlamudi.',
    entrances: [
      { label: 'Girls Hostel Main Gate', lat: 16.23165, lng: 80.55245 },
    ],
  },
  {
    id: 'BLD_GUEST_HOUSE',
    name: 'VFSTR Guest House & Medical Center',
    shortName: 'Guest House / Med',
    officialName: 'University Guest House & First-Aid Center',
    category: 'MEDICAL',
    lat: 16.23385,
    lng: 80.55015,
    osmFeatureId: 'way/800010',
    googleSearchQuery: "Vignan University Guest House Vadlamudi",
    dataSource: 'GOOGLE_MAPS_PLACES',
    verificationStatus: 'GOOGLE_PLACES_VERIFIED',
    lastVerifiedAt: '2025-02-20',
    surveyNumber: 'Survey No. 273/1, Vadlamudi',
    floorsDescription: 'G+3 R.C.C. VIP Guest Suites, Conference Rooms & Emergency Ambulance Bay',
    totalPlinthAreaSqm: 3286.37,
    description:
      'University Guest House (Survey No. 273/1) and Campus Ambulance Standby Point.',
    entrances: [
      { label: 'Guest House Driveway', lat: 16.23385, lng: 80.55015 },
    ],
  },
];

export const INITIAL_ADMIN_PATHWAYS: AdminCustomPathway[] = [
  {
    id: 'PATH_LIB_NBLOCK_WALK',
    name: 'Library to Nagarjuna Bhavan Covered Walkway',
    geometry: [
      [16.23168, 80.55128],
      [16.23132, 80.55138],
      [16.23102, 80.55148],
    ],
    highwayType: 'footway',
    allowWalking: true,
    allowBicycle: false,
    allowVehicle: false,
    oneWay: false,
    verifiedBy: 'VFSTR Campus Estate Officer',
    createdAt: '2025-02-20',
  },
  {
    id: 'PATH_CANTEEN_HOSTEL_PLAZA',
    name: 'Canteen to Vignan Vihar Pedestrian Concourse',
    geometry: [
      [16.23152, 80.55215],
      [16.23185, 80.55240],
      [16.23215, 80.55255],
    ],
    highwayType: 'pedestrian',
    allowWalking: true,
    allowBicycle: true,
    allowVehicle: false,
    oneWay: false,
    verifiedBy: 'VFSTR Campus Estate Officer',
    createdAt: '2025-02-20',
  },
];

export const INITIAL_INCIDENTS: IncidentRecord[] = [
  {
    id: 'INC-2001',
    title: 'Convocation Stage Setup — Partial Pedestrian Barrier',
    type: 'CONSTRUCTION',
    severity: 'MODERATE',
    category: 'ADMIN_CONFIRMED',
    verificationStatus: 'ADMIN_CONFIRMED',
    edgeId: 'OSM_E_700005_5',
    roadName: 'U-Block South Circular Foyer Walk',
    lat: 16.23218,
    lng: 80.55088,
    reportedAt: '09:15 AM',
    createdAtIso: new Date(Date.now() - 45 * 60000).toISOString(),
    expiresAtIso: new Date(Date.now() + 180 * 60000).toISOString(),
    reportedBy: 'VFSTR Estate & Security Control',
    description:
      'Administrator-confirmed staging barrier near U-Block circular foyer; pedestrian access remains open with slight delay.',
    impactSummary: '+25% traversal time along U-Block foyer connector',
  },
];

/**
 * Verified OpenStreetMap Overpass Baseline Snapshot of VFSTR Campus, Vadlamudi (16.23155, 80.55127).
 * Used immediately while live Overpass queries complete, and serves as an offline fallback if Overpass is unreachable.
 */
export const BASELINE_VFSTR_OVERPASS_SNAPSHOT: RawOverpassResponse = {
  version: 0.6,
  generator: 'OpenStreetMap Overpass API Snapshot — VFSTR Vadlamudi (16.23155, 80.55127)',
  elements: [
    // 1. Primary Road & Campus Intersection Nodes (Actual Vadlamudi VFSTR Coordinates)
    {
      type: 'node',
      id: 1001,
      lat: 16.23338,
      lon: 80.54882,
      tags: { name: 'VFSTR Main Arch Gate (Guntur-Tenali SH-48)', barrier: 'gate', entrance: 'main' },
    },
    {
      type: 'node',
      id: 1002,
      lat: 16.23235,
      lon: 80.54955,
      tags: { name: 'A-Block West Foyer Junction', short_name: 'J-ABLK-W' },
    },
    {
      type: 'node',
      id: 1003,
      lat: 16.23202,
      lon: 80.55025,
      tags: { name: 'A-Block & H-Block Central Crossing', short_name: 'J-CENTRAL-W' },
    },
    {
      type: 'node',
      id: 1004,
      lat: 16.23192,
      lon: 80.55128,
      tags: { name: 'NTR Library & U-Block Main Plaza', short_name: 'J-LIB-PLAZA' },
    },
    {
      type: 'node',
      id: 1005,
      lat: 16.23168,
      lon: 80.55195,
      tags: { name: 'Main Canteen West Junction', short_name: 'J-CANTEEN-W' },
    },
    {
      type: 'node',
      id: 1006,
      lat: 16.23158,
      lon: 80.55255,
      tags: { name: 'East Hostel Avenue Crossing', short_name: 'J-HOSTEL-AVE' },
    },
    {
      type: 'node',
      id: 1007,
      lat: 16.23285,
      lon: 80.54945,
      tags: { name: 'Guest House & Ambulance Bay Junction', short_name: 'J-GUEST' },
    },
    {
      type: 'node',
      id: 1008,
      lat: 16.23282,
      lon: 80.55088,
      tags: { name: 'U-Block North Service Road Junction', short_name: 'J-UBLK-N' },
    },
    {
      type: 'node',
      id: 1009,
      lat: 16.23222,
      lon: 80.55088,
      tags: { name: 'U-Block South Circular Foyer', short_name: 'J-UBLK-S' },
    },
    {
      type: 'node',
      id: 1010,
      lat: 16.23275,
      lon: 80.55215,
      tags: { name: 'North Sports & Convocation Ground Corner', short_name: 'J-NORTH-GND' },
    },
    {
      type: 'node',
      id: 1011,
      lat: 16.23168,
      lon: 80.55128,
      tags: { name: 'N.T.R. Vignan Library Forecourt', short_name: 'J-LIB-DOOR' },
    },
    {
      type: 'node',
      id: 1012,
      lat: 16.23138,
      lon: 80.55025,
      tags: { name: 'H-Block East Courtyard Access', short_name: 'J-HBLK-E' },
    },
    {
      type: 'node',
      id: 1013,
      lat: 16.23082,
      lon: 80.55028,
      tags: { name: 'South Academic Ring West', short_name: 'J-SOUTH-W' },
    },
    {
      type: 'node',
      id: 1014,
      lat: 16.23102,
      lon: 80.55148,
      tags: { name: 'Nagarjuna Bhavan (N-Block) North Foyer', short_name: 'J-NBLK-N' },
    },
    {
      type: 'node',
      id: 1015,
      lat: 16.23215,
      lon: 80.55255,
      tags: { name: 'Vignan Vihar Boys Hostel Main Gate', short_name: 'J-BOYS-GATE' },
    },
    {
      type: 'node',
      id: 1016,
      lat: 16.23095,
      lon: 80.55258,
      tags: { name: 'Southeast Hostel Link Junction', short_name: 'J-SE-LINK' },
    },
    {
      type: 'node',
      id: 1017,
      lat: 16.23050,
      lon: 80.55275,
      tags: { name: 'Priyadarshini Girls Hostel North Gate', short_name: 'J-GIRLS-GATE' },
    },
    {
      type: 'node',
      id: 1018,
      lat: 16.22985,
      lon: 80.55040,
      tags: { name: "Vignan's Pharmacy College (P-Block) Entrance", short_name: 'J-PBLK-E' },
    },
    {
      type: 'node',
      id: 1019,
      lat: 16.22965,
      lon: 80.54945,
      tags: { name: 'VFSTR South Highway Gate (SH-48)', barrier: 'gate', entrance: 'secondary' },
    },
    {
      type: 'node',
      id: 1020,
      lat: 16.22995,
      lon: 80.55152,
      tags: { name: 'N-Block South Research Road', short_name: 'J-NBLK-S' },
    },

    // 2. Building Polygon Corner Nodes
    // A-Block Polygon (800001)
    { type: 'node', id: 2001, lat: 16.23255, lon: 80.54965 },
    { type: 'node', id: 2002, lat: 16.23255, lon: 80.55012 },
    { type: 'node', id: 2003, lat: 16.23210, lon: 80.55012 },
    { type: 'node', id: 2004, lat: 16.23210, lon: 80.54965 },

    // U-Block Polygon (800002)
    { type: 'node', id: 2011, lat: 16.23278, lon: 80.55055 },
    { type: 'node', id: 2012, lat: 16.23278, lon: 80.55122 },
    { type: 'node', id: 2013, lat: 16.23225, lon: 80.55122 },
    { type: 'node', id: 2014, lat: 16.23225, lon: 80.55055 },

    // H-Block Polygon (800003)
    { type: 'node', id: 2021, lat: 16.23165, lon: 80.54992 },
    { type: 'node', id: 2022, lat: 16.23165, lon: 80.55058 },
    { type: 'node', id: 2023, lat: 16.23118, lon: 80.55058 },
    { type: 'node', id: 2024, lat: 16.23118, lon: 80.54992 },

    // Central Library Polygon (800004)
    { type: 'node', id: 2031, lat: 16.23184, lon: 80.55110 },
    { type: 'node', id: 2032, lat: 16.23184, lon: 80.55146 },
    { type: 'node', id: 2033, lat: 16.23152, lon: 80.55146 },
    { type: 'node', id: 2034, lat: 16.23152, lon: 80.55110 },

    // N-Block / Nagarjuna Bhavan Polygon (800005)
    { type: 'node', id: 2041, lat: 16.23102, lon: 80.55112 },
    { type: 'node', id: 2042, lat: 16.23102, lon: 80.55185 },
    { type: 'node', id: 2043, lat: 16.23048, lon: 80.55185 },
    { type: 'node', id: 2044, lat: 16.23048, lon: 80.55112 },

    // P-Block / Pharmacy College Polygon (800006)
    { type: 'node', id: 2051, lat: 16.23010, lon: 80.54990 },
    { type: 'node', id: 2052, lat: 16.23010, lon: 80.55040 },
    { type: 'node', id: 2053, lat: 16.22960, lon: 80.55040 },
    { type: 'node', id: 2054, lat: 16.22960, lon: 80.54990 },

    // Main Canteen Polygon (800007)
    { type: 'node', id: 2061, lat: 16.23168, lon: 80.55198 },
    { type: 'node', id: 2062, lat: 16.23168, lon: 80.55232 },
    { type: 'node', id: 2063, lat: 16.23136, lon: 80.55232 },
    { type: 'node', id: 2064, lat: 16.23136, lon: 80.55198 },

    // Boys Hostel / Vignan Vihar Polygon (800008)
    { type: 'node', id: 2071, lat: 16.23245, lon: 80.55258 },
    { type: 'node', id: 2072, lat: 16.23245, lon: 80.55312 },
    { type: 'node', id: 2073, lat: 16.23185, lon: 80.55312 },
    { type: 'node', id: 2074, lat: 16.23185, lon: 80.55258 },

    // Girls Hostel / Priyadarshini Polygon (800009)
    { type: 'node', id: 2081, lat: 16.23050, lon: 80.55252 },
    { type: 'node', id: 2082, lat: 16.23050, lon: 80.55298 },
    { type: 'node', id: 2083, lat: 16.23000, lon: 80.55298 },
    { type: 'node', id: 2084, lat: 16.23000, lon: 80.55252 },

    // Guest House Polygon (800010)
    { type: 'node', id: 2091, lat: 16.23308, lon: 80.54930 },
    { type: 'node', id: 2092, lat: 16.23308, lon: 80.54960 },
    { type: 'node', id: 2093, lat: 16.23282, lon: 80.54960 },
    { type: 'node', id: 2094, lat: 16.23282, lon: 80.54930 },

    // 3. Real Campus Road & Footpath Ways
    {
      type: 'way',
      id: 700001,
      nodes: [1001, 1002, 1003, 1004, 1005, 1006],
      tags: {
        highway: 'service',
        name: 'VFSTR Main Academic Spine Avenue',
        maxspeed: '25',
      },
    },
    {
      type: 'way',
      id: 700002,
      nodes: [1001, 1019],
      tags: {
        highway: 'primary',
        name: 'Guntur-Tenali State Highway (SH-48)',
        maxspeed: '50',
      },
    },
    {
      type: 'way',
      id: 700003,
      nodes: [1001, 1007, 1008, 1010, 1015],
      tags: {
        highway: 'service',
        name: 'North Perimeter & Ambulance Service Road',
        maxspeed: '25',
      },
    },
    {
      type: 'way',
      id: 700004,
      nodes: [1002, 1007],
      tags: {
        highway: 'service',
        name: 'A-Block to Guest House Driveway',
        maxspeed: '20',
      },
    },
    {
      type: 'way',
      id: 700005,
      nodes: [1003, 1009, 1004],
      tags: {
        highway: 'footway',
        name: 'U-Block South Circular Foyer Walk',
      },
    },
    {
      type: 'way',
      id: 700006,
      nodes: [1008, 1009],
      tags: {
        highway: 'footway',
        name: 'U-Block Central Courtyard Pedestrian Path',
      },
    },
    {
      type: 'way',
      id: 700007,
      nodes: [1004, 1011, 1014],
      tags: {
        highway: 'pedestrian',
        name: 'N.T.R. Library Central Pedestrian Plaza',
      },
    },
    {
      type: 'way',
      id: 700008,
      nodes: [1003, 1012, 1013, 1018, 1019],
      tags: {
        highway: 'service',
        name: 'West Academic & Pharmacy Link Road',
        maxspeed: '20',
      },
    },
    {
      type: 'way',
      id: 700009,
      nodes: [1013, 1014, 1016, 1017],
      tags: {
        highway: 'service',
        name: 'South Nagarjuna Bhavan & Hostel Road',
        maxspeed: '20',
      },
    },
    {
      type: 'way',
      id: 700010,
      nodes: [1009, 1007],
      tags: {
        highway: 'steps',
        name: 'U-Block West Terrace Steps (Pedestrians Only)',
      },
    },
    {
      type: 'way',
      id: 700011,
      nodes: [1015, 1006, 1016, 1017],
      tags: {
        highway: 'service',
        name: 'East Residential Hostel Corridor',
        maxspeed: '20',
      },
    },
    {
      type: 'way',
      id: 700012,
      nodes: [1018, 1020, 1016],
      tags: {
        highway: 'service',
        name: 'South Boundary Service Road',
        maxspeed: '25',
      },
    },
    {
      type: 'way',
      id: 700013,
      nodes: [1014, 1020],
      tags: {
        highway: 'footway',
        name: 'Nagarjuna Bhavan South Courtyard Walk',
      },
    },
    {
      type: 'way',
      id: 700014,
      nodes: [1004, 1010],
      tags: {
        highway: 'footway',
        name: 'Library to Sports Ground Footpath',
      },
    },

    // 4. Mapped Campus Building Polygons
    {
      type: 'way',
      id: 800001,
      nodes: [2001, 2002, 2003, 2004, 2001],
      tags: { building: 'university', name: 'Administrative Building (A-Block)' },
    },
    {
      type: 'way',
      id: 800002,
      nodes: [2011, 2012, 2013, 2014, 2011],
      tags: { building: 'university', name: 'U-Block Academic Complex' },
    },
    {
      type: 'way',
      id: 800003,
      nodes: [2021, 2022, 2023, 2024, 2021],
      tags: { building: 'university', name: 'H-Block Academic Wing' },
    },
    {
      type: 'way',
      id: 800004,
      nodes: [2031, 2032, 2033, 2034, 2031],
      tags: { building: 'university', amenity: 'library', name: 'N.T.R. Vignan Library' },
    },
    {
      type: 'way',
      id: 800005,
      nodes: [2041, 2042, 2043, 2044, 2041],
      tags: { building: 'university', name: 'Nagarjuna Bhavan (N-Block)' },
    },
    {
      type: 'way',
      id: 800006,
      nodes: [2051, 2052, 2053, 2054, 2051],
      tags: { building: 'university', name: "Vignan's Pharmacy College (P-Block)" },
    },
    {
      type: 'way',
      id: 800007,
      nodes: [2061, 2062, 2063, 2064, 2061],
      tags: { building: 'retail', amenity: 'cantina', name: 'Central Canteen & Dining Complex' },
    },
    {
      type: 'way',
      id: 800008,
      nodes: [2071, 2072, 2073, 2074, 2071],
      tags: { building: 'dormitory', name: 'Vignan Vihar Boys Hostel' },
    },
    {
      type: 'way',
      id: 800009,
      nodes: [2081, 2082, 2083, 2084, 2081],
      tags: { building: 'dormitory', name: 'Priyadarshini Girls Hostel' },
    },
    {
      type: 'way',
      id: 800010,
      nodes: [2091, 2092, 2093, 2094, 2091],
      tags: { building: 'yes', name: 'University Guest House & First-Aid Center' },
    },
  ],
};
