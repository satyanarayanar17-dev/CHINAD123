# Chettinad Care Pilot App

Chettinad Care is a pilot-grade, not production-grade, care continuity system for a restricted clinical pilot.

This repo is focused on one hardened loop:

- admin temporarily acts as the receptionist proxy to create or correct patient identity
- nurse captures intake, triage, and pushes the patient into the doctor queue
- the system guarantees a single valid active encounter
- the patient activates portal access with a one-time code
- the doctor opens the chart, writes the note, authorizes the prescription, and continues the timeline cleanly

The live deployment path is now PostgreSQL-backed. SQLite remains available only as a local development fallback.

## Repo Layout

- `src/`: Vite + React frontend
- `backend/`: Express API, auth, RBAC, audit logging, OCC, seeding, migrations
- `docker-compose.yml`: local all-in-one stack with Nginx + backend + PostgreSQL

## Current Architecture

- Frontend: Vite/React SPA with configurable `VITE_API_BASE_URL`
- Backend: Express API mounted under `/api/v1`
- Database access: raw SQL through `backend/database.js`, with one dialect switch for SQLite vs PostgreSQL
- Persistence for live pilot: PostgreSQL only
- Local development fallback: SQLite file at `backend/verification.db` unless `SQLITE_PATH` overrides it
- Auth/session: in-memory access token + `httpOnly` refresh cookie, bcrypt password hashes, refresh rotation, RBAC middleware, token revocation table
- Auth boundaries: patient and staff login paths are separated, JWTs carry a role-bound `account_type`, refresh rotation preserves that scope, and mismatched sessions are rejected during bootstrap and route entry
- Data integrity: OCC/version checks on queue, notes, prescriptions, and draft ETag protection
- Backend write invariants: SQLite foreign keys enabled, queue transitions limited to active phases, discharge normalized to `DISCHARGED`, canonical patient/note/prescription validation shared across routes
- Legacy-data tooling: `diagnose:data` and `repair:data` scripts for pilot data audits, deterministic fixes, and quarantine of unusable rows
- Health visibility: `/api/v1/health` now reports database reachability, migration alignment, and a basic integrity summary
- Audit logging: sensitive actions continue to write to `audit_logs`
- Upload/storage: no file upload or object storage pipeline is implemented in this repo today

## Local Development

1. Install frontend dependencies:
   `npm install`
2. Install backend dependencies:
   `cd backend && npm install`
3. Seed the local SQLite demo dataset:
   `cd backend && npm run seed:reset`
4. Diagnose local data integrity before testing:
   `cd backend && npm run diagnose:data`
5. Start the backend:
   `cd backend && npm run dev`
6. Start the frontend:
   `npm run dev`

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001/api/v1`

Local demo accounts after `npm run seed:reset`:

- `admin_qa` / `Password123!`
- `nurse_qa` / `Password123!`
- `doc1_qa` / `Password123!`
- `doc2_qa` / `Password123!`
- patient login via UHID `pat-1` / `Password123!`

## Clean Demo State

Use this when you need a deterministic, demo-safe environment from scratch:

`cd backend && npm run seed:reset`

What `seed:reset` guarantees locally:

- 1 admin, 1 nurse, and multiple doctor/staff demo identities
- 3 patients with valid demographics
- active encounters with canonical lifecycle state
- at least one returning patient with prior discharged history, finalized notes, and authorized prescriptions
- no malformed queue rows in the seeded state

This command is for local/demo use only and should not be enabled in the live pilot.

## Pilot Deployment

The recommended deployment split is:

- Backend on Railway or Render
- Managed PostgreSQL on Railway or Render
- Frontend on Vercel

High-level backend deployment settings:

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/v1/health`

High-level frontend deployment settings:

- Root directory: repo root
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_BASE_URL=https://YOUR-BACKEND-DOMAIN/api/v1`

Important:

- Do not deploy the restricted web pilot with `DB_DIALECT=sqlite`
- Do not enable `PILOT_AUTH_BYPASS`
- Do set `BOOTSTRAP_ADMIN_*` for the first live deploy
- Do set cookie envs correctly for your deployment shape:
  `COOKIE_SAME_SITE=none` for different frontend/backend sites
  `COOKIE_SAME_SITE=lax` for same-site custom domains

Detailed instructions are in [DEPLOYMENT.md](/Users/siddwork/Desktop/chettinad-care-frontend/DEPLOYMENT.md).

## Onboarding Flows

Staff onboarding:

- Admin signs in
- Admin dashboard → `Staff Directory & Access`
- Create nurses/doctors/admins with strong passwords

Patient onboarding:

- Admin dashboard → `Patient Onboarding`
- Admin is temporarily acting as the receptionist proxy during this pilot
- Register the patient demographic record in one call
- The backend either creates or reuses the patient safely
- The backend guarantees an active encounter before returning success
- The backend issues the activation code from the same onboarding flow
- Patient opens `/patient/activate`, enters UHID + activation code, sets password
- Patient then logs in with their UHID and password

## Auth Boundary Guarantees

Authentication and routing are now split explicitly by account type:

- patient login uses `POST /api/v1/auth/login/patient`
- staff login uses `POST /api/v1/auth/login/staff`
- the compatibility path `POST /api/v1/auth/login` now requires `account_type=patient|staff`
- access tokens now include both `role` and `account_type`
- refresh tokens persist `account_type` and are rejected if they no longer match the current user role
- `/api/v1/auth/me` rejects sessions whose token scope no longer matches the database role
- patient portal APIs under `/api/v1/my/*` remain `PATIENT`-only
- frontend bootstrap and route guards clear the session if `role` and `account_type` do not form a valid pair

Practical result:

- doctor, nurse, and admin credentials cannot authenticate through the patient login path
- patient credentials cannot authenticate through the staff login path
- a valid token alone is no longer enough to enter the wrong UI shell

## Data Integrity Operations

Integrity guarantees now enforced on new writes:

- patient records require non-empty `id`, `name`, valid `dob`, and allowed `gender`
- encounters require `patient_id`, canonical `phase`, and canonical `lifecycle_status`
- active encounter transitions accept only `AWAITING`, `RECEPTION`, or `IN_CONSULTATION`
- discharged encounters are stored consistently as `phase='DISCHARGED'` with `is_discharged=1`
- note statuses are limited to `DRAFT` or `FINALIZED`
- prescription statuses are limited to `DRAFT` or `AUTHORIZED`
- queue reads exclude orphaned or invalid encounters and log what was skipped

Operational commands:

- diagnose current data:
  `cd backend && npm run diagnose:data`
- dry-run a repair:
  `cd backend && npm run repair:data`
- apply deterministic repairs and quarantine unusable rows:
  `cd backend && npm run repair:data -- --apply`

What the repair script will do:

- fills a deterministic placeholder name for patients whose name is blank
- normalizes invalid patient gender to `Not specified`
- converts legacy closed encounters to `DISCHARGED`
- backfills canonical encounter `lifecycle_status` when the mapping is deterministic
- normalizes repairable note/prescription statuses to canonical uppercase values
- quarantines orphaned encounters, orphaned notes, and unusable prescriptions into `data_integrity_quarantine`

What diagnostics summarize:

- total invalid patients
- invalid encounters
- malformed queue rows
- duplicate active encounters
- legacy schema drift

Remaining legacy-data risks:

- invalid or missing DOB values cannot be inferred safely and stay flagged for manual review
- ambiguous active encounters with unknown lifecycle phase remain in manual review and are excluded from queue reads until corrected

## Verification

Checks run successfully during this update:

- `cd backend && npm test`
- `npm run test:auth-boundary`
- `npm run build`

## Pilot Limitations

- This system is pilot-grade, not production-grade.
- Queue-first consultation is intentional in this pilot; calendar scheduling is not implemented yet by design.
- Access tokens remain browser-memory bearer tokens; this is safer than `localStorage`, but it is not a full server-managed session architecture.
- Rate limiting is still in-process only, so it does not provide strong protection under horizontal scale.
- OTP delivery is still operationally simple and meant for restricted pilot use, not consumer-scale identity recovery.
- Billing, insurance, uploads, and broad patient self-service scheduling are intentionally out of scope.
- Some UI areas outside the core care loop still contain stubbed/offline actions and should not be presented as live integrations.
