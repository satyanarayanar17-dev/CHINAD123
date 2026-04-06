# DEPLOYMENT HARDENING PLAN
**Chettinad Care — Restricted Web Pilot Pass**
**Date:** 2026-04-06

---

## Objective

Move Chettinad Care from "controlled local pilot" to "conditionally ready for restricted staff web pilot" by fixing all CRITICAL and HIGH blockers identified in CURRENT_DEPLOYMENT_BLOCKERS.md, hardening auth, config, and deployment packaging, and generating the full required artifact set.

---

## Scope

**In scope:**
- Fixing BL-001 through BL-009 (all CRITICAL and HIGH blockers)
- Partial fix of BL-010, BL-016 (MEDIUM/LOW — env guard + UI honesty)
- Staff account lifecycle API (create, disable, reset password)
- Patient portal scope correction
- Env/config hardening and startup validator
- Docker deployment fix (nginx proxy)
- .env.example files
- Backend/runtime verification
- Browser verification of auth and clinical flows
- All required final artifacts

**Out of scope:**
- Patient login (deferred)
- SSO / OAuth2
- Analytics
- WhatsApp/Twilio
- Billing integration
- Enterprise monitoring
- HIPAA compliance certification

---

## Implementation Sequence

### Step 1: Fix Critical Auth & Config

1. **server.js** — Extend startup validator:
   - Add `APP_ENV` check
   - Validate `JWT_SECRET` length >= 32 characters
   - Validate `DATABASE_URL` is set when `DB_DIALECT=postgres`
   - Validate `CORS_ORIGIN` is set in production
   - Remove or eliminate code-level JWT fallback path

2. **middleware/auth.js** — Remove default fallback:
   - Change `|| 'pilot-beta-secure-secret-key'` to startup failure if not set in prod
   - Keep fallback for local_dev ONLY with explicit warning log

3. **routes/internal.js** — Secure seed-reset:
   - Add `requireAuth` + `requireRole(['ADMIN'])` middleware
   - Ensure it cannot run in production regardless of auth

### Step 2: Fix Patient Portal Scope

4. **routes/portal.js** — Fix resolvePatientIds:
   - Scope patient portal to the logged-in user's `patient_id` from the users table
   - OR: disable patient portal entirely for this pilot phase with honest 503

### Step 3: Add User Management API

5. **routes/admin.js** (NEW) — Staff lifecycle endpoints:
   - `POST /api/admin/users` — Create staff account (ADMIN only)
   - `PATCH /api/admin/users/:userId/disable` — Deactivate account
   - `POST /api/admin/users/:userId/reset-password` — Admin-driven reset
   - Each operation writes to audit log
   - Mount in server.js

6. **pages/AdminDashboard.tsx** — Wire User Management UI tab

### Step 4: Fix Docker Deployment

7. **Dockerfile (frontend)** — Fix nginx config:
   - Add `location /api { proxy_pass http://backend:3001; proxy_set_header ... }`

8. **docker-compose.yml** — External secrets:
   - Replace inline env secrets with `env_file: .env.compose`
   - Create `.env.compose.example`
   - Add backend health check

9. **.env.example** — Create env reference files

### Step 5: Fix verify.js and Test Accounts

10. **backend/verify.js** — Update test to use passwords

### Step 6: Login UI Honesty for Patients

11. **pages/Login.tsx** — Disable patient login button with "Staff access only in current pilot phase" messaging

### Step 7: Verification

12. Run backend verification suite
13. Run browser verification on all critical flows

---

## Files to Modify

| File | Type | Change |
|------|------|--------|
| `backend/server.js` | MODIFY | Extended startup validator |
| `backend/middleware/auth.js` | MODIFY | Remove anonymous default fallback |
| `backend/routes/internal.js` | MODIFY | Add requireAuth + requireRole(['ADMIN']) |
| `backend/routes/portal.js` | MODIFY | Fix patient scope leak |
| `backend/routes/admin.js` | NEW | Staff lifecycle API |
| `backend/server.js` | MODIFY | Mount admin router |
| `Dockerfile` (root) | MODIFY | Nginx /api proxy pass |
| `docker-compose.yml` | MODIFY | env_file, health checks |
| `.env.compose.example` | NEW | Reference env file |
| `backend/.env.example` | NEW | Backend env reference |
| `backend/verify.js` | MODIFY | Password-aware tests |
| `src/pages/Login.tsx` | MODIFY | Patient login disable messaging |
| `src/pages/AdminDashboard.tsx` | MODIFY | User management UI tab |

## Files to Create (Documentation)

- `DEPLOYMENT_HARDENING_PLAN.md` (this file)
- `AUTH_REFACTOR_PLAN.md`
- `DB_MIGRATION_PLAN.md`
- `ENVIRONMENT_MATRIX.md`
- `RISK_REGISTER_DEPLOY.md`
- `CURRENT_DEPLOYMENT_BLOCKERS.md`
- `VERIFICATION_REPORT_DEPLOY.md`
- `IMPLEMENTATION_CHANGELOG_DEPLOY.md`
- `KNOWN_GAPS_DEPLOY.md`
- `RESTRICTED_PILOT_ROLLOUT.md`
- `AUTH_IMPACT_SUMMARY.md`
- `DB_CUTOVER_NOTES.md`
- `OPERATIONAL_RUNBOOK.md`
- `MIGRATION_COMMANDS.md`
- `ROLLBACK_PLAN.md`
- `TEST_ACCOUNT_POLICY.md`
