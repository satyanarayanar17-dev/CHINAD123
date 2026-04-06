# KNOWN GAPS & ACCEPTED RISKS — DEPLOYMENT
**Chettinad Care — Restricted Web Pilot**
**Date:** 2026-04-06

The following architectural and security limitations are known and explicitly **ACCEPTED** for the scope of the Phase 1 Restricted Web Pilot. They MUST be addressed before any Phase 2 Public/Production rollout.

---

### 1. In-Memory Ephemeral Clinical Drafts (ACCEPTED PILOT LIMITATION)
**Description:** `backend/routes/drafts.js` uses a Node `Map()` instance to store in-progress clinical drafts prior to finalizing.
**Risk:** High Data Loss. If the Docker container restarts, crashes, or scales, all unsaved clinical notes will be securely deleted.
**Status:** Per CTO architectural review, this is explicitly marked as an **ACCEPTED PILOT LIMITATION** for restricted staff testing.
**Pilot Mitigation:** This pilot rollout is constrained strictly to **supervised, continuous workflows**. Staff MUST click "Finalize Note" prior to the end of any shift or maintenance window. Persistent draft storage is deferred to Phase 2.

### 2. Token Invalidation (JWT)
**Description:** There is no stateless blacklist or redis cache. Disabling a user account in the Admin console takes immediate effect for new logins, but any existing, active JWT token issued prior to the disable command remains mathematically valid until its 12-hour expiry threshold is met.
**Risk:** Moderate. A deactivated employee has up to 12 hours of access assuming their token remains in the browser.
**Pilot Mitigation:** The `/auth/me` bootstrap payload catches `!userRow.is_active` state logic and forces a front-end unmount on reload, meaning an active browser refresh cycle will invalidate them.

### 3. Patient Identity Linkage is Non-Existent
**Description:** The Patient role is partially stubbed. We severed the global leak vulnerability (`portal.js`) by defaulting to `null` identity resolution. There is no `patient_id` linkage in the `users` table for new account generation.
**Risk:** None (Currently). Patient login UI is disabled.
**Phase 2 Mitigation:** Build a patient registration module linking a `User` identity strictly to a canonical `Patient` record ID. 

### 4. Audit Table Cryptographic Integrity
**Description:** `writeAuditDirect` builds highly accurate relational event schemas, but they are stored as standard `INSERT` rows. 
**Risk:** A rogue SQL admin or hijacked environment variable could manually `DELETE` or `UPDATE` the audit records.
**Pilot Mitigation:** Acceptable limit for restricted access. Phase 2 needs append-only block storage (WORM) or cryptographic HMAC signatures per row.

### 5. Multi-User Browser WebSocket Sync 
**Description:** Polling mechanisms operate in standard 30s increments. OCC ensures data cannot overlap, but users will not inherently *see* if a Doctor picks up a patient chart simultaneously until they attempt to act upon it, generating a 409. 
**Pilot Mitigation:** The 409 errors elegantly and accurately report back to the user to reload the state.
