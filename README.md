# Chettinad Care Pilot App

Chettinad Care is a split frontend/backend clinical pilot app designed for a small remote pilot:

- up to 10 patients
- up to 10 nurses
- up to 10 doctors

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
- Register the patient demographic record
- The backend ensures an active encounter exists
- The backend issues an activation code
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
- normalizes repairable note/prescription statuses to canonical uppercase values
- quarantines orphaned encounters, orphaned notes, and unusable prescriptions into `data_integrity_quarantine`

Remaining legacy-data risks:

- invalid or missing DOB values cannot be inferred safely and stay flagged for manual review
- ambiguous active encounters with unknown lifecycle phase remain in manual review and are excluded from queue reads until corrected

## Verification

Checks run successfully during this update:

- `cd backend && npm run migrate`
- `cd backend && npm run seed:reset`
- `cd backend && npm run diagnose:data`
- `cd backend && npm run repair:data`
- `cd backend && npm test`
- `npm run test:auth-boundary`
- `npm run build`

An additional restricted-pilot boot check was also run locally against a temporary PostgreSQL container:

- PostgreSQL migration succeeded with `DB_DIALECT=postgres`
- backend booted in `restricted_web_pilot` mode
- `/api/v1/health` returned `{"status":"ok","db":"postgres","db_status":"ok"}`

## Pilot Limitations

- Access tokens are no longer stored in `localStorage`, but this is still not a full cookie-only CSRF-protected session architecture.
- Existing pre-deploy in-memory access tokens without the new `account_type` claim may require one refresh cycle or a fresh login after deployment.
- SSE uses a short-lived purpose-limited query token rather than a bearer header because `EventSource` cannot send custom auth headers.
- Rate limiting is in-process only, which is acceptable for a very small pilot but not for a larger horizontally scaled system.
