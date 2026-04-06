# CURRENT DEPLOYMENT BLOCKERS
**Chettinad Care — Restricted Web Pilot Readiness**
**Inspection Date:** 2026-04-06
**Inspected Commit State:** Current HEAD (post-previous hardening pass)

---

## Blocker Inventory — Ranked by Severity

### SEVERITY: CRITICAL (Must fix before any web pilot)

#### BL-001 — Nginx Frontend Docker Has No /api Reverse Proxy
**File:** `Dockerfile` (root — frontend)
**Evidence:**
```dockerfile
RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; ... } }' > /etc/nginx/conf.d/default.conf
```
The nginx config has exactly one `location /` block — no `/api` pass to backend.
The frontend `client.ts` calls `/api/v1/...`. In the Docker deployment stack, all API requests will return 404 HTML from nginx, causing the app to immediately fail with "API_MISHAP: Received HTML instead of JSON."
**Impact:** The entire Docker deployment is broken for API calls. Nothing works.

#### BL-002 — Internal Seed-Reset Endpoint is UNAUTHENTICATED
**File:** `backend/routes/internal.js`
**Evidence:**
```js
router.post('/seed-reset', async (req, res, next) => {
  const environment = process.env.NODE_ENV || 'development';
  if (environment === 'production') {
    return next({ status: 403, ... }); // Guards prod
  }
  await resetAndSeedDatabase(); // DELETES AND RECREATES ALL DATA
```
The guard checks `NODE_ENV === 'production'`. In `local_pilot` or `staging`, this endpoint is wide open to any HTTP client — no authentication required. Any user who discovers the URL can drop and recreate the entire database.
**Impact:** Complete data loss vulnerability in pilot environments.

#### BL-003 — docker-compose.yml Has Hardcoded Insecure Secrets
**File:** `docker-compose.yml`
**Evidence:**
```yaml
- JWT_SECRET=change_this_immediatey_for_real_pilot_deployment!
- POSTGRES_PASSWORD: chettinad_secret
- DATABASE_URL=postgres://chettinad:chettinad_secret@db:5432/chettinad_pilot
```
The docker-compose file has inline secrets with a warning comment that will almost certainly be committed and forgotten. This is not a restricted-pilot-safe configuration.
**Impact:** Token forgery risk if secrets not changed; credentials in VCS history.

#### BL-004 — JWT Default Fallback Exists in Code
**File:** `backend/middleware/auth.js:3`
**Evidence:**
```js
const JWT_SECRET = process.env.JWT_SECRET || 'pilot-beta-secure-secret-key';
```
The fallback string `'pilot-beta-secure-secret-key'` is a known, public literal in the code. The `server.js` boot guard blocks `production` mode startup if this value is used — but `local_pilot` or any environment with `NODE_ENV` not set to `production` will silently use this weak key.
**Impact:** Session forgery possible in non-production pilot environments.

---

### SEVERITY: HIGH (Must fix before named staff access)

#### BL-005 — No Staff User Management API
**Evidence:** There is no API to:
- Create a new staff account
- Disable/deactivate an account
- Reset a password (admin-driven)
The only provisioning path is `scripts/deploy-seed.js`, which requires direct server access. Real pilot requires at minimum an admin-accessible API for these operations.
**Impact:** Cannot add or remove staff for restricted web pilot without server shell access.

#### BL-006 — Patient Portal Has Global Scope Leak
**File:** `backend/routes/portal.js`
**Evidence:**
```js
async function resolvePatientIds(userId) {
  // For pilot: patient_qa sees all patients (simulating their own records)
  const rows = await all(`SELECT DISTINCT patient_id FROM encounters`);
  return rows.map(r => r.patient_id);
}
```
Any user with PATIENT role sees ALL patients' prescriptions, appointments, and records. This is acknowledged as a "for pilot" shortcut but is a trust boundary breach — the PATIENT role must be scoped to their own record only.
**Impact:** Patient A can read Patient B's prescriptions. Unacceptable even in restricted pilot.

#### BL-007 — No .env Files or Startup Env Validator
**Evidence:** No `.env.example`, `.env.pilot`, or `.env.production` files exist. No startup code validates that `DATABASE_URL` is set when `DB_DIALECT=postgres`, or that `CORS_ORIGIN` is set when `NODE_ENV=production`.
**Impact:** Misconfigured deployments will boot silently with wrong DB or open CORS.

#### BL-008 — verify.js Test Script Fails Against Real Auth
**File:** `backend/verify.js`
**Evidence:**
```js
const res = await axios.post(`${API_BASE}/auth/login`, { username: 'doc1_qa' });
// No password provided
```
The verification script sends login requests without a password. After the bcrypt hardening, this will always fail (`isValidPassword` stays false). The test script needs passwords to prove real auth works.
**Impact:** Verification suite produces false negatives — auth "fails" in testing even when correctly implemented.

---

### SEVERITY: MEDIUM (Should fix before broader pilot)

#### BL-009 — Backend Docker Has No Health Check
**File:** `docker-compose.yml`
**Evidence:** The `backend` service has no `healthcheck:` section. Only `db` has a health check. If the Express server starts but the seed fails, the frontend container still comes up.
**Impact:** Deployment may appear healthy while backend is actually broken.

#### BL-010 — PILOT_AUTH_BYPASS Bypass for Unseeded Users (Local Mode)
**File:** `backend/routes/auth.js:35-37`
**Evidence:**
```js
if (isPilotMode && process.env.NODE_ENV !== 'production' && !userRow.password_hash) {
  isValidPassword = true;
}
```
In local dev with `PILOT_AUTH_BYPASS=true`, users without a `password_hash` can log in with any (or no) password. This is correctly blocked in production, but could create confusion during pilot if `PILOT_AUTH_BYPASS` is accidentally left `true` in a staging deployment.
**Impact:** Reduced risk (production is blocked), but staging environments need explicit env validation to prevent accident.

#### BL-011 — No Audit Events for Admin Account Lifecycle Operations
**Evidence:** There are no `writeAuditDirect` calls for account creation, deactivation, or password reset because those endpoints don't exist yet (see BL-005). When BL-005 is fixed, audit coverage must be included.
**Impact:** Incomplete audit trail for restricted pilot regulations.

#### BL-012 — In-Memory Notifications Reset on Server Restart
**File:** `backend/routes/notifications.js`
**Evidence:**
```js
let notifications = [ { id: 'notif-1', ... }, { id: 'notif-2', ... } ];
```
Notifications are hardcoded in-memory. This is correctly acknowledged in the code comment, but the hardcoded content references specific patient IDs (`pat-1`) that must exist in the seed data.
**Impact:** Low clinical risk (notifications are ephemeral), but confusing in pilot. KNOWN_GAPS.

#### BL-013 — Draft Store is In-Memory (Server Restart Loses Drafts)
**File:** `backend/routes/drafts.js`
**Evidence:**
```js
const drafts = new Map(); // key -> { data, etag }
// Drafts are ephemeral by design — they don't survive server restart
```
Clinical draft state is lost on any server restart. In a Docker container deployment, rolling updates, crashes, or restarts silently wipe unsaved drafts.
**Impact:** Data loss risk for unsaved clinical notes. Must be documented in known gaps.

---

### SEVERITY: LOW (Document and accept for this pass)

#### BL-014 — Audit Logs Not Cryptographically Immutable
**Evidence:** Audit logs are INSERT-only at the application layer, but the underlying PostgreSQL table has no row-level security, triggers, or append-only constraint. A compromised DB admin could mutate audit records.
**Impact:** Acknowledged limitation. Acceptable for restricted pilot. Must be documented.

#### BL-015 — Queue Concurrency Not End-to-End Browser Proven
**Evidence:** OCC is implemented in the backend (409 on stale `__v`). Browser-level concurrent tab testing has not been systematically run in this pass.
**Impact:** Single-actor browser proof exists. Multi-actor proven only at backend level.

#### BL-016 — Patient Login Is Not Blocked at Frontend
**Evidence:** The Login page shows a "Patient Login" button. PATIENT role routes exist. However, `portal.js` has the scope leak (BL-006) and patient account provisioning is unclear. The frontend allows patients to attempt login but there are no patient accounts seeded with passwords.
**Impact:** Patients cannot actually log in (no accounts), but the login form is misleading. Should display explicit "Patient access not yet available" notice.

---

## Summary Table

| ID     | Severity | Description                                      | Fix Required Before Pilot |
|--------|----------|--------------------------------------------------|--------------------------|
| BL-001 | CRITICAL | Nginx missing /api proxy in Docker               | YES                      |
| BL-002 | CRITICAL | Unauthenticated seed-reset endpoint              | YES                      |
| BL-003 | CRITICAL | Hardcoded secrets in docker-compose              | YES                      |
| BL-004 | CRITICAL | JWT fallback default in code                     | YES                      |
| BL-005 | HIGH     | No staff user management API                     | YES                      |
| BL-006 | HIGH     | Patient scope leak in portal.js                  | YES                      |
| BL-007 | HIGH     | No env files or startup validator                | YES                      |
| BL-008 | HIGH     | verify.js broken against real auth               | YES                      |
| BL-009 | MEDIUM   | Backend health check missing                     | YES                      |
| BL-010 | MEDIUM   | PILOT_AUTH_BYPASS still possible in staging      | DOC + ENV GUARD          |
| BL-011 | MEDIUM   | No audit for account lifecycle ops               | WITH BL-005              |
| BL-012 | MEDIUM   | In-memory notifications hardcoded                | DOCUMENT                 |
| BL-013 | MEDIUM   | In-memory drafts lost on restart                 | DOCUMENT                 |
| BL-014 | LOW      | Audit not cryptographically immutable            | DOCUMENT                 |
| BL-015 | LOW      | Queue concurrency not browser-proven             | DOCUMENT                 |
| BL-016 | LOW      | Patient Login UI not blocked, no accounts        | PARTIAL FIX              |
