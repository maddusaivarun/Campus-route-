# ResQRoute Firestore Security Specification (Phase 0 Security TDD)

## 1. Data Invariants & Master Source of Truth

1. **Global Default Deny**: Any path not explicitly matched in `firestore.rules` is unconditionally denied (`allow read, write: if false;`).
2. **Admin Authorization Invariant**: Administrative privileges (`isAdmin()`) are granted ONLY if the user is authenticated (`request.auth != null`), has a verified email (`request.auth.token.email_verified == true`), and either matches the bootstrapped primary administrator (`madduvarun5@gmail.com`) or has an existing document at `/databases/$(database)/documents/admins/$(request.auth.uid)`.
3. **Campus Buildings (`/campusBuildings/{buildingId}`) & Pathways (`/campusPathways/{pathwayId}`)**:
   - Read (`get`, `list`) is allowed for authenticated users when `resource.data.verificationStatus in ['OSM_EXTRACTED', 'ADMIN_VERIFIED', 'UNVERIFIED_NEEDS_PIN', 'GOOGLE_PLACES_VERIFIED']` (for buildings) or `resource.data.allowWalking is bool` (for pathways).
   - Write (`create`, `update`, `delete`) is strictly restricted to `isAdmin()` with strict key allowlists (`hasAll` + `hasOnly`), coordinate bounds checking (`lat >= 16.20 && lat <= 16.26`, `lng >= 80.52 && lng <= 80.58`), `updatedByUid == request.auth.uid`, and server timestamps (`request.time`).
4. **Campus Incidents (`/campusIncidents/{incidentId}`)**:
   - Creation requires a verified authenticated user (`isVerifiedUser()`), `incoming().reporterUid == request.auth.uid`, `incoming().createdAt == request.time`, and valid schema bounds.
   - Updates follow the **Action-Based Update Pattern** with **Terminal State Locking**: once `existing().verificationStatus in ['RESOLVED', 'REJECTED']`, non-admins cannot modify the incident. Reporters may only transition their own incident to `RESOLVED` while preserving immutable fields (`id`, `reporterUid`, `createdAt`). Admins may update `verificationStatus`, `severity`, `description`, and `updatedAt`.
5. **User Preferences (`/userPreferences/{userId}`)**:
   - Strictly isolated to the owner (`request.auth.uid == userId && resource.data.userId == request.auth.uid`). No other user can `get`, `list`, `create`, `update`, or `delete` another user's preferences.
6. **Admins Registry (`/admins/{adminUid}`)**:
   - Only existing admins (`isAdmin()`) can read or write `/admins/{adminUid}`. Self-assigned admin elevation is impossible.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Shadow Field Injection on Building)**: Authenticated admin sends `CampusBuilding` with extra field `{"isSuperAdmin": true}` -> Rejected by `data.keys().hasOnly(...)`.
2. **Payload 2 (Unverified Email Admin Spoof)**: Attacker with `email: "madduvarun5@gmail.com"` and `email_verified: false` attempts to update `/campusBuildings/BLD_A_BLOCK` -> Rejected by `request.auth.token.email_verified == true`.
3. **Payload 3 (Self-Assigned Admin Privilege Escalation)**: Standard user writes `/admins/{theirUid}` with `{"uid": theirUid, "role": "CAMPUS_GIS_ADMIN"}` -> Rejected because `allow create` on `/admins/{adminUid}` requires `isAdmin()`.
4. **Payload 4 (Identity Spoofing on Incident Creation)**: Authenticated user creates `/campusIncidents/INC_1` with `reporterUid: "other-user-uid"` -> Rejected by `data.reporterUid == request.auth.uid`.
5. **Payload 5 (Client Timestamp Forgery)**: User creates `/campusIncidents/INC_2` with past timestamp `createdAt: Timestamp(2020, 1, 1)` -> Rejected by `incoming().createdAt == request.time`.
6. **Payload 6 (Terminal State Bypass on Incident)**: Reporter attempts to update `/campusIncidents/INC_3` after `verificationStatus == 'REJECTED'` -> Rejected by Terminal State Lock `!(existing().verificationStatus in ['RESOLVED', 'REJECTED'])`.
7. **Payload 7 (Immortal Field Mutation)**: Reporter updates `/campusIncidents/INC_4` and changes `createdAt` or `reporterUid` -> Rejected by `incoming().createdAt == existing().createdAt && incoming().reporterUid == existing().reporterUid`.
8. **Payload 8 (Value Poisoning on Update)**: User updates `/userPreferences/{uid}` setting `walkingSpeedMps: "fast"` (string instead of number) or `walkingSpeedMps: 999` -> Rejected by `isValidUserPreference(incoming())` which enforces `data.walkingSpeedMps is number && data.walkingSpeedMps >= 0.5 && data.walkingSpeedMps <= 3.5`.
9. **Payload 9 (ID Poisoning / 1MB String DoS)**: Attacker sends 2,000-character document ID or `description` of 50,000 chars -> Rejected by `isValidId()` (`size() <= 128`) and `data.description.size() <= 600`.
10. **Payload 10 (Cross-User Preference Snooping)**: Authenticated User A attempts `get` on `/userPreferences/USER_B` -> Rejected by `isOwner(userId)`.
11. **Payload 11 (Out-of-Bounds Coordinate Injection)**: Admin or script attempts to create a VFSTR building at `lat: 95.0, lng: 200.0` -> Rejected by `data.lat >= 16.20 && data.lat <= 16.26 && data.lng >= 80.52 && data.lng <= 80.58`.
12. **Payload 12 (Unauthorized Pathway Deletion)**: Non-admin user attempts `delete` on `/campusPathways/ADM_PATH_1` -> Rejected by `allow delete: if isValidId(pathwayId) && isAdmin();`.
