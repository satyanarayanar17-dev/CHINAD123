# Implementation Changelog — Phase 3

**Date:** 2026-04-09  
**Author:** Claude Sonnet 4.6 (via Claude Code)  
**Branch:** claude/youthful-kapitsa  
**Base:** commit 5935641 (clean lint pass)

---

## Audit Findings (pre-implementation)

### Phase 1 — confirmed working
- JWT auth with bcrypt, `requireAuth` / `requireRole` middleware
- Production boot validator (JWT_SECRET strength, CORS_ORIGIN, DB_DIALECT)
- Admin user lifecycle API (create/disable/enable/reset-password)
- Break-glass protocol with immutable audit log
- OCC on notes, prescriptions, encounters (version integer + 409 CONFLICT)
- `backend/verify.js` — 8 sections, 25+ assertions, all passing against seeded data

### Phase 2 — gap between changelog and code
The following items were referenced in Phase 2 planning docs but **not implemented** in actual code:
- `clinical_drafts` table: **missing** from `database.js` — `drafts.js` route used in-memory store
- `notifications` DB table: **missing** — `notifications.js` used a hardcoded in-memory array
- `writeNotification()`: **not exported** from `notifications.js`
- `deploy-seed.js`: no `patient_qa` or `pat-2` OTP seed (activation route exists and works, just not pre-seeded)

These gaps were addressed as prerequisites to Phase 3 work.

---

## Changes Implemented

### P3-A — PatientDossier Break-Glass Validation (`src/pages/PatientDossier.tsx`)
**Why:** Minimum 10 characters was insufficient for a meaningful clinical justification; raised to 50 per spec.

| Location | Before | After |
|---|---|---|
| `handleGrantAccess` guard | `justification.length < 10` | `justification.length < 50` |
| Textarea placeholder | `"...minimum 10 chars"` | `"...minimum 50 characters"` |
| Toast error message | `"(min 10 chars)"` | `"(at least 50 characters)"` |

---

### P3-B — Server-Sent Events for Real-Time Notifications

#### `backend/routes/sse.js` (new file)
- `GET /api/sse?token=<jwt>` — auth via query param (EventSource cannot set headers)
- JWT validated with the same `JWT_SECRET` from `middleware/auth.js`
- `Map<userId, res>` in-process client registry; newer connection for same userId replaces old
- Sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`
- Sends `connected` event on connect with `{ userId, role }`
- Sends `ping` heartbeat every 25 seconds to prevent proxy timeouts
- Exports `broadcastNotification(notification)` — fan-out to all connected clients with error cleanup
- Cleans up on `req.close` event

#### `backend/routes/notifications.js` (rewritten)
- **Removed** in-memory array — notifications now read/written to the `notifications` DB table
- Added `writeNotification({ id, type, title, body, time, read, target_patient_id, actor_id, target_role })` async function
  - Persists to DB
  - Lazy-requires `broadcastNotification` from `./sse` to call after INSERT (avoids circular-dep at load time)
  - Exported as `module.exports.writeNotification`
- `GET /` now queries DB (last 50, ordered by `created_at DESC`)
- `PUT /` now bulk-updates `read` flag in DB instead of replacing the in-memory array
- Both routes still require auth

#### `backend/server.js`
- Added `const { router: sseRouter } = require('./routes/sse')`
- Mounted: `app.use('/api/sse', sseRouter)`

#### `src/hooks/queries/useNotifications.ts` (rewritten)
- Opens `EventSource` to `/api/v1/sse?token=<cc_token>` on mount (Vite proxy rewrites to `/api/sse`)
- `connected` event → sets `isLive = true`
- `notification` event → patches TanStack Query cache directly via `queryClient.setQueryData` (deduplicates by `id`)
- `error` event → sets `isLive = false`, closes EventSource; polling takes over
- Polling interval: 30 s when `isLive`, 10 s when SSE is down (fallback)
- Returns `isLive: boolean` from hook
- Removed all `any` types — fully typed with `Notification` interface

#### `src/components/layout/BaseLayout.tsx`
- Destructures `isLive` from `useNotifications()`
- Renders `● Live` badge in `text-green-500` next to the bell icon when `isLive` is true
- Badge is inside a flex wrapper with the bell button; does not conflict with unread count badge

#### `src/store/mockData.ts`
- Added `targetPatientId?: string` to `Notification` interface (backwards-compatible additive change, matches backend shape)

---

### P3-C — Token Revocation on User Disable

#### `backend/database.js`
Added to both PostgreSQL and SQLite branches of `resetAndSeedDatabase()`:
```sql
CREATE TABLE revoked_tokens (
  user_id TEXT PRIMARY KEY,
  revoked_at TIMESTAMP/DATETIME DEFAULT CURRENT_TIMESTAMP
)
```
Drop order updated: `revoked_tokens` dropped before `audit_logs` (no FK dependency).

Also added (Phase 2 prerequisite backfill):
```sql
CREATE TABLE clinical_drafts (draft_key, draft_json, etag, updated_at)
CREATE TABLE notifications (id, type, title, body, time, read, target_patient_id, actor_id, target_role, created_at)
```

#### `backend/middleware/auth.js` (rewritten)
- Now `async` — adds DB-backed revocation check after JWT verification
- In-process `revocationCache: Map<userId, {revokedAt, cachedAt}>` with 60-second TTL
- Cache hit: use cached `revokedAt` (avoids DB on every request)
- Cache miss: `SELECT revoked_at FROM revoked_tokens WHERE user_id = ?`, result cached
- If `revokedAt` exists AND `new Date(revokedAt) > new Date(decoded.iat * 1000)` → 401 `TOKEN_REVOKED`
- Fail-open on DB error (logs loudly, does not block auth — availability over strict revocation)
- Exports new `clearRevocationCache(userId)` function

#### `backend/routes/admin.js`
- **Disable handler** (`PATCH /users/:userId/disable`): after setting `is_active = 0`, does `DELETE + INSERT INTO revoked_tokens` to stamp the revocation timestamp. Imported `clearRevocationCache`.
- **Enable handler** (`PATCH /users/:userId/enable`): after setting `is_active = 1`, does `DELETE FROM revoked_tokens` and calls `clearRevocationCache(userId)` to immediately allow fresh tokens.

---

### P3-D — Draft Cleanup Job (`backend/server.js`)
After the global error envelope (section 6), added section 7:
```js
setInterval(async () => {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { run } = require('./database');
  await run(`DELETE FROM clinical_drafts WHERE updated_at < ?`, [cutoff]);
}, 6 * 60 * 60 * 1000);
```
- Runs every 6 hours
- Deletes drafts with `updated_at` older than 48 hours
- No-op until `drafts.js` is migrated to use DB (Phase 4 item)
- Errors logged but do not crash the process

---

### P3-E — Rate Limit Middleware (`backend/middleware/rateLimit.js`) (new file)
Generic sliding-window in-process rate limiter factory:
```js
createRateLimiter({ max, windowMs, keyFn, message }) → Express middleware
```
- Stores per-key timestamp arrays in a `Map`
- Prunes old timestamps on each request (no background timer needed)
- Returns `429` with `Retry-After` header and `retry_after` seconds in body

Applied to:
- `backend/routes/auth.js` — `loginLimiter`: 10 attempts / 15 min / IP on `POST /login`
- `backend/routes/activation.js` — `generateLimiter`: 5 / 10 min / staff user on `POST /generate`; `claimLimiter`: 5 / 10 min / `patient_id` on `POST /claim`

---

### P3-F — Verify Suite Expansion (`backend/verify.js`)

#### Section 12 — SSE endpoint
- `[12.1]` GET /sse without token → expect 401
- `[12.2]` GET /sse with invalid token → expect 401
- `[12.3]` GET /sse with valid doctor token → expect 200 + `Content-Type: text/event-stream`  
  (Uses raw `http.get` to inspect headers without blocking on the streaming body)

#### Section 13 — Token revocation
- `[13.1]` Create disposable test user (`test_revoke_verify`)
- `[13.2]` Login as test user → capture token
- `[13.3]` Confirm token works on `/auth/me` before disable
- `[13.4]` Admin disables the user via `PATCH /admin/users/.../disable`
- `[13.5]` Use old token immediately → expect 401 `TOKEN_REVOKED` (cache is cold for new user)

#### Section 14 — Draft cleanup
- `[14.1]` Insert draft with 49-hour-old timestamp directly via `require('./database')`
- `[14.2]` Run the same `DELETE FROM clinical_drafts WHERE updated_at < ?` query
- `[14.3]` Verify expired draft is gone
- `[14.4]` Insert recent draft, re-run cleanup, verify it survives
- Cleans up test rows after assertions

---

## Files Modified

| File | Change Type | Reason |
|---|---|---|
| `src/pages/PatientDossier.tsx` | Edit | P3-A: raise break-glass min chars to 50 |
| `backend/routes/sse.js` | **New** | P3-B: SSE endpoint + broadcastNotification |
| `backend/routes/notifications.js` | Rewrite | P3-B: DB-backed notifications + writeNotification() |
| `backend/database.js` | Edit | P3-B/C/D: add notifications, revoked_tokens, clinical_drafts tables |
| `backend/middleware/auth.js` | Rewrite | P3-C: async + token revocation check + cache |
| `backend/routes/admin.js` | Edit | P3-C: insert/delete revoked_tokens on disable/enable |
| `backend/server.js` | Edit | P3-B: mount SSE router; P3-D: cleanup setInterval |
| `backend/middleware/rateLimit.js` | **New** | P3-E: generic rate limiter factory |
| `backend/routes/auth.js` | Edit | P3-E: apply loginLimiter to POST /login |
| `backend/routes/activation.js` | Edit | P3-E: apply generateLimiter + claimLimiter |
| `src/hooks/queries/useNotifications.ts` | Rewrite | P3-B: SSE + isLive + typed Notification |
| `src/components/layout/BaseLayout.tsx` | Edit | P3-B: show ● Live badge when isLive |
| `src/store/mockData.ts` | Edit | P3-B: add targetPatientId? to Notification interface |
| `backend/verify.js` | Edit | P3-F: add sections 12, 13, 14 |
| `IMPLEMENTATION_CHANGELOG_PHASE3.md` | **New** | This document |

---

## Known Gaps (carrying forward to Phase 4)

1. **`drafts.js` not DB-backed**: The `clinical_drafts` table exists and the cleanup job runs, but `backend/routes/drafts.js` still uses an in-memory store. Migrating it to the DB is a Phase 4 item.

2. **`writeNotification` not wired to clinical routes**: `notes.js`, `prescriptions.js`, `encounters.js`, `patients.js` do not call `writeNotification()`. The notification pipeline (SSE + DB) is fully plumbed, but only fires when explicitly called. Clinical event notifications are a Phase 4 item.

3. **SSE: one connection per user**: Multiple browser tabs for the same user will cause the previous tab's SSE connection to be silently terminated. Phase 4 should switch to a `Map<userId, Set<res>>` fan-out if multi-tab is required.

4. **Rate limiter is in-memory only**: State is lost on restart and not shared across instances. Acceptable for single-instance pilot; Phase 4 would need Redis-backed rate limiting for multi-pod deployments.

5. **`deploy-seed.js` not updated**: The deploy-seed script still provisions test accounts without passwords (relying on PILOT_AUTH_BYPASS). It should be updated to hash passwords and seed `patient_qa` + OTP. Currently `verify.js` requires the server to have been seeded with `Password123!` via the existing seed path.

6. **Patient portal notifications**: The PATIENT role has no SSE or notification delivery path. Phase 4 should scope notification delivery by `target_role` so patients only see their own events.
