import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  CampusBuildingEntry,
  AdminCustomPathway,
  IncidentRecord,
  IncidentVerificationStatus,
} from '../data/campusData';
import { OptimizationMetric, RoutingProfile, OSMHighwayType } from '../graph/Graph';
import { RoutingAlgorithmType } from './routingEngine';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Boot-time connection check to Firestore as required by the Firebase Integration specification.
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    // Permission denied on /test/connection is expected and confirms live server reachability
    return true;
  }
}

// Execute boot-time connection check
if (typeof window !== 'undefined') {
  testFirestoreConnection();
}

export interface AuthSessionState {
  isReady: boolean;
  user: User | null;
  isAdmin: boolean;
  error: string | null;
}

const BOOTSTRAPPED_ADMIN_EMAIL = 'madduvarun5@gmail.com';

function sanitizeId(rawId: string): string {
  return rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'DOC_1';
}

function clampLat(lat: number): number {
  if (!Number.isFinite(lat)) return 16.23305;
  return Number(Math.max(16.2, Math.min(16.26, lat)).toFixed(6));
}

function clampLng(lng: number): number {
  if (!Number.isFinite(lng)) return 80.55085;
  return Number(Math.max(80.52, Math.min(80.58, lng)).toFixed(6));
}

export async function signInWithGooglePopup(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

export async function checkUserIsAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (user.email === BOOTSTRAPPED_ADMIN_EMAIL) return true;
  const adminPath = `admins/${sanitizeId(user.uid)}`;
  try {
    const snap = await getDoc(doc(db, 'admins', sanitizeId(user.uid)));
    return snap.exists() && snap.data()?.role === 'CAMPUS_GIS_ADMIN';
  } catch (err) {
    // Non-admins or missing doc
    void adminPath;
    void err;
    return false;
  }
}

export function subscribeToAuthChanges(
  onChange: (state: AuthSessionState) => void
): Unsubscribe {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      onChange({ isReady: true, user: null, isAdmin: false, error: null });
      return;
    }
    const isAdmin = await checkUserIsAdmin(user);
    onChange({ isReady: true, user, isAdmin, error: null });
  });
}

/**
 * Saves or updates a verified campus building in Firestore (`/campusBuildings/{buildingId}`).
 */
export async function saveCampusBuildingToFirestore(
  building: CampusBuildingEntry
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const id = sanitizeId(building.id);
  const path = `campusBuildings/${id}`;
  const docRef = doc(db, 'campusBuildings', id);

  try {
    const existingSnap = await getDoc(docRef);
    const payload = {
      id,
      name: (building.name || 'VFSTR Building').slice(0, 160),
      shortName: (building.shortName || 'Block').slice(0, 60),
      officialName: (building.officialName || building.name || 'VFSTR Building').slice(0, 200),
      category: building.category,
      lat: clampLat(building.lat),
      lng: clampLng(building.lng),
      dataSource: building.dataSource,
      verificationStatus: building.verificationStatus,
      description: (building.description || 'Verified VFSTR campus facility.').slice(0, 600),
      updatedByUid: sanitizeId(user.uid),
      updatedAt: serverTimestamp(),
    };

    if (existingSnap.exists()) {
      await updateDoc(docRef, payload);
    } else {
      await setDoc(docRef, {
        ...payload,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Saves an admin-verified custom pathway or accessibility override to Firestore (`/campusPathways/{pathwayId}`).
 */
export async function saveCampusPathwayToFirestore(
  pathway: AdminCustomPathway & { isAccessible?: boolean }
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const id = sanitizeId(pathway.id);
  const path = `campusPathways/${id}`;
  const docRef = doc(db, 'campusPathways', id);

  const lats = pathway.geometry.map((pt) => clampLat(pt[0]).toFixed(6)).join(',').slice(0, 2000);
  const lngs = pathway.geometry.map((pt) => clampLng(pt[1]).toFixed(6)).join(',').slice(0, 2000);

  try {
    const existingSnap = await getDoc(docRef);
    const basePayload = {
      name: (pathway.name || 'Campus Pathway').slice(0, 160),
      highwayType: pathway.highwayType,
      allowWalking: Boolean(pathway.allowWalking),
      allowBicycle: Boolean(pathway.allowBicycle),
      allowVehicle: Boolean(pathway.allowVehicle),
      oneWay: Boolean(pathway.oneWay),
      isAccessible: pathway.isAccessible !== false,
      coordinatesLat: lats || '16.233050,16.233150',
      coordinatesLng: lngs || '80.550850,80.550950',
      updatedAt: serverTimestamp(),
    };

    if (existingSnap.exists()) {
      await updateDoc(docRef, basePayload);
    } else {
      await setDoc(docRef, {
        id,
        ...basePayload,
        createdByUid: sanitizeId(user.uid),
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCampusPathwayFromFirestore(pathwayId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const id = sanitizeId(pathwayId);
  const path = `campusPathways/${id}`;
  try {
    await deleteDoc(doc(db, 'campusPathways', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Creates a campus incident report in Firestore (`/campusIncidents/{incidentId}`).
 */
export async function createCampusIncidentInFirestore(
  incident: IncidentRecord,
  isAdminUser: boolean
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const id = sanitizeId(incident.id);
  const path = `campusIncidents/${id}`;

  try {
    await setDoc(doc(db, 'campusIncidents', id), {
      id,
      edgeId: (incident.edgeId || 'EDGE_UNKNOWN').slice(0, 128),
      roadName: (incident.roadName || 'Campus Corridor').slice(0, 160),
      type: incident.type,
      severity: incident.severity,
      verificationStatus: isAdminUser ? incident.verificationStatus : 'UNVERIFIED',
      title: (incident.title || 'Campus Hazard').slice(0, 160),
      description: (incident.description || 'Reported via ResQRoute.').slice(0, 600),
      lat: clampLat(incident.lat),
      lng: clampLng(incident.lng),
      reporterUid: sanitizeId(user.uid),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Updates an incident's verification status in Firestore (`/campusIncidents/{incidentId}`).
 */
export async function updateIncidentStatusInFirestore(
  incidentId: string,
  status: IncidentVerificationStatus
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const id = sanitizeId(incidentId);
  const path = `campusIncidents/${id}`;

  try {
    await updateDoc(doc(db, 'campusIncidents', id), {
      verificationStatus: status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Saves per-user navigation preferences including configurable walking speed (m/s).
 */
export async function saveUserPreferencesToFirestore(prefs: {
  defaultAlgorithm: RoutingAlgorithmType;
  defaultMetric: OptimizationMetric;
  defaultRoutingProfile: RoutingProfile;
  walkingSpeedMps: number;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = sanitizeId(user.uid);
  const path = `userPreferences/${uid}`;
  const docRef = doc(db, 'userPreferences', uid);

  const safeSpeed = Number(Math.max(0.5, Math.min(3.5, prefs.walkingSpeedMps || 1.4)).toFixed(2));

  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      await updateDoc(docRef, {
        defaultAlgorithm: prefs.defaultAlgorithm,
        defaultMetric: prefs.defaultMetric,
        defaultRoutingProfile: prefs.defaultRoutingProfile,
        walkingSpeedMps: safeSpeed,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        userId: uid,
        defaultAlgorithm: prefs.defaultAlgorithm,
        defaultMetric: prefs.defaultMetric,
        defaultRoutingProfile: prefs.defaultRoutingProfile,
        walkingSpeedMps: safeSpeed,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Subscribes to live Firestore collections once a user is authenticated.
 */
export function subscribeToCampusFirestoreData(
  user: User,
  callbacks: {
    onBuildings: (buildings: Partial<CampusBuildingEntry>[]) => void;
    onPathways: (pathways: (AdminCustomPathway & { isAccessible?: boolean })[]) => void;
    onIncidents: (incidents: IncidentRecord[]) => void;
    onUserPreferences: (prefs: {
      defaultAlgorithm: RoutingAlgorithmType;
      defaultMetric: OptimizationMetric;
      defaultRoutingProfile: RoutingProfile;
      walkingSpeedMps: number;
    }) => void;
  }
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];

  // 1. Campus Buildings query matching security rule allow list
  const buildingsQ = query(
    collection(db, 'campusBuildings'),
    where('verificationStatus', 'in', [
      'OSM_EXTRACTED',
      'ADMIN_VERIFIED',
      'UNVERIFIED_NEEDS_PIN',
      'GOOGLE_PLACES_VERIFIED',
    ])
  );
  unsubs.push(
    onSnapshot(
      buildingsQ,
      (snap) => {
        const items: Partial<CampusBuildingEntry>[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          items.push({
            id: d.id,
            name: d.name,
            shortName: d.shortName,
            officialName: d.officialName,
            category: d.category,
            lat: Number(d.lat),
            lng: Number(d.lng),
            dataSource: d.dataSource,
            verificationStatus: d.verificationStatus,
            description: d.description,
            entrances: [{ label: `${d.shortName} Main Entrance`, lat: Number(d.lat), lng: Number(d.lng) }],
          });
        });
        if (items.length > 0) callbacks.onBuildings(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'campusBuildings');
      }
    )
  );

  // 2. Campus Pathways query matching security rule allow list
  const pathwaysQ = query(
    collection(db, 'campusPathways'),
    where('allowWalking', 'in', [true, false])
  );
  unsubs.push(
    onSnapshot(
      pathwaysQ,
      (snap) => {
        const items: (AdminCustomPathway & { isAccessible?: boolean })[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const latParts = String(d.coordinatesLat || '').split(',').map(Number);
          const lngParts = String(d.coordinatesLng || '').split(',').map(Number);
          const geometry: [number, number][] = [];
          const len = Math.min(latParts.length, lngParts.length);
          for (let i = 0; i < len; i++) {
            if (Number.isFinite(latParts[i]) && Number.isFinite(lngParts[i])) {
              geometry.push([latParts[i], lngParts[i]]);
            }
          }
          if (geometry.length >= 2) {
            items.push({
              id: d.id,
              name: d.name,
              highwayType: d.highwayType as OSMHighwayType,
              allowWalking: Boolean(d.allowWalking),
              allowBicycle: Boolean(d.allowBicycle),
              allowVehicle: Boolean(d.allowVehicle),
              oneWay: Boolean(d.oneWay),
              isAccessible: d.isAccessible !== false,
              geometry,
              verifiedBy: 'Firestore Admin Sync',
              createdAt: new Date().toISOString().slice(0, 10),
            });
          }
        });
        if (items.length > 0) callbacks.onPathways(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'campusPathways');
      }
    )
  );

  // 3. Campus Incidents query matching security rule allow list
  const incidentsQ = query(
    collection(db, 'campusIncidents'),
    where('verificationStatus', 'in', ['UNVERIFIED', 'ADMIN_CONFIRMED', 'RESOLVED', 'REJECTED'])
  );
  unsubs.push(
    onSnapshot(
      incidentsQ,
      (snap) => {
        const items: IncidentRecord[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          items.push({
            id: d.id,
            edgeId: d.edgeId,
            roadName: d.roadName,
            type: d.type,
            severity: d.severity,
            category: d.verificationStatus === 'ADMIN_CONFIRMED' ? 'ADMIN_CONFIRMED' : 'USER_REPORTED',
            verificationStatus:
              d.verificationStatus === 'UNVERIFIED' ? 'UNVERIFIED_USER_REPORT' : d.verificationStatus,
            title: d.title,
            description: d.description,
            reportedBy: d.reporterUid,
            reportedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            createdAtIso: new Date().toISOString(),
            expiresAtIso: null,
            impactSummary: `${d.type} (${d.severity}) on ${d.roadName}`,
            lat: Number(d.lat),
            lng: Number(d.lng),
          });
        });
        if (items.length > 0) callbacks.onIncidents(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'campusIncidents');
      }
    )
  );

  // 4. User Preferences document
  const uid = sanitizeId(user.uid);
  unsubs.push(
    onSnapshot(
      doc(db, 'userPreferences', uid),
      (docSnap) => {
        if (docSnap.exists()) {
          const d = docSnap.data();
          callbacks.onUserPreferences({
            defaultAlgorithm: d.defaultAlgorithm,
            defaultMetric: d.defaultMetric,
            defaultRoutingProfile: d.defaultRoutingProfile,
            walkingSpeedMps: Number(d.walkingSpeedMps || 1.4),
          });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `userPreferences/${uid}`);
      }
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}
