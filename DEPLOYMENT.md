# Chettinad Care Pilot Deployment

## Architecture Summary

This repo now supports a restricted web pilot with this shape:

- Frontend: Vite/React SPA deployed separately
- Backend: Express API under `/api/v1`
- Live database: PostgreSQL only
- Local development fallback: SQLite only
- Session model:
  access token kept in browser memory only
  refresh token stored in an `httpOnly` cookie
  refresh rotation enabled
  token revocation preserved
- Notifications/SSE:
  staff-only notifications routes
  short-lived purpose-limited SSE tokens
- Integrity controls: OCC/version checks for queue, notes, prescriptions, and ETag draft protection
- Audit trail: sensitive actions append to `audit_logs`

For the live pilot, deploy:

- Backend on Railway or Render
- PostgreSQL on Railway or Render
- Frontend on Vercel

## Production Requirements

The restricted web pilot must meet these requirements:

- `DB_DIALECT=postgres`
- `DATABASE_URL` points to a persistent managed PostgreSQL instance
- `JWT_SECRET` is set to a random 32+ character secret
- `CORS_ORIGIN` points to the deployed frontend origin
- `PILOT_AUTH_BYPASS` is unset
- `ALLOW_SEED_RESET` is unset
- at least one admin account exists through `BOOTSTRAP_ADMIN_*` or prior data

## Exact Environment Variables

### Backend

- `NODE_ENV=production`
- `APP_ENV=restricted_web_pilot`
- `PORT=3001`
- `DB_DIALECT=postgres`
- `DATABASE_URL=postgres://...`
- `DATABASE_SSL=false`
- `PGPOOL_MAX=10`
- `JWT_SECRET=...`
- `CORS_ORIGIN=https://your-frontend-domain`
- `ACTIVATION_OTP_DELIVERY=api_response`
- `BOOTSTRAP_ADMIN_ID=pilot_admin`
- `BOOTSTRAP_ADMIN_NAME=Pilot Admin`
- `BOOTSTRAP_ADMIN_PASSWORD=strong-password`
- `COOKIE_SAME_SITE=none` or `lax`
- `COOKIE_SECURE=true`
- `COOKIE_DOMAIN=` optional

Recommended cookie settings:

- different frontend/backend sites:
  `COOKIE_SAME_SITE=none`
  `COOKIE_SECURE=true`
- same-site custom domains under one parent domain:
  `COOKIE_SAME_SITE=lax`
  `COOKIE_SECURE=true`

Optional local-only variables that should stay unset in the live pilot:

- `PILOT_AUTH_BYPASS`
- `ALLOW_SEED_RESET`
- `SQLITE_PATH`

### Frontend

- `VITE_API_BASE_URL=https://your-backend-domain/api/v1`

For local frontend development only:

- `VITE_DEV_API_PROXY_TARGET=http://localhost:3001`

## Local Dev Steps

1. Install frontend packages:
   `npm install`
2. Install backend packages:
   `cd backend && npm install`
3. Seed the local SQLite demo database:
   `cd backend && npm run seed:reset`
4. Start the backend:
   `cd backend && npm run dev`
5. Start the frontend:
   `npm run dev`

## Local Seed Instructions

Local-only demo seed commands:

- append demo data safely:
  `cd backend && npm run seed`
- reset and reseed local demo data:
  `cd backend && npm run seed:reset`

Production / restricted pilot behavior:

- demo seeding is intentionally blocked
- destructive reset is intentionally blocked
- first access should come from `BOOTSTRAP_ADMIN_*`

## PostgreSQL Setup Requirements

Use a persistent managed PostgreSQL instance, not an ephemeral dev container, for the live pilot.

Minimum checklist:

- persistent storage enabled
- automatic backups enabled if the provider offers them
- `DATABASE_URL` exposed to the backend service
- restricted network access handled by the platform
- `DB_DIALECT=postgres`

## Backup And Restore

Minimum pilot backup plan:

- enable managed PostgreSQL backups at the platform level if available
- take a logical backup before any risky maintenance
- keep one tested restore command with the same credentials format as production

Example logical backup:

```bash
pg_dump "$DATABASE_URL" > chettinad-care-backup-$(date +%Y%m%d-%H%M%S).sql
```

Example restore into an empty target database:

```bash
psql "$DATABASE_URL" < chettinad-care-backup.sql
```

If you restore into a new database, run the backend once or run:

```bash
cd backend && npm run migrate
```

## Backend Deployment On Railway

Create two services in the same Railway project:

- PostgreSQL service
- backend service from this repo, rooted at `backend/`

Backend settings:

- Build command: `npm install`
- Start command: `npm start`
- Health endpoint: `/api/v1/health`

Environment:

- set the backend variables listed above
- Railway’s PostgreSQL service exposes `DATABASE_URL` directly

## Backend Deployment On Render

Create:

- one PostgreSQL instance
- one web service using the `backend/` directory

Recommended settings:

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/v1/health`

If you deploy the backend from Docker instead, Render can also run the `CMD` from the backend Dockerfile, which already uses `npm start`.

## Frontend Deployment On Vercel

Create a Vercel project from the repo root.

Recommended settings:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable:
  `VITE_API_BASE_URL=https://your-backend-domain/api/v1`

After changing `VITE_API_BASE_URL`, redeploy the frontend so Vite picks up the new value at build time.

## First Production Bootstrap

1. Deploy PostgreSQL.
2. Deploy the backend with `BOOTSTRAP_ADMIN_*` set.
3. Wait for `/api/v1/health` to return `status=ok` and `db=postgres`.
4. Deploy the frontend with `VITE_API_BASE_URL` pointing at the backend.
5. Open the frontend URL and sign in with the bootstrap admin credentials.
6. Rotate the bootstrap admin password after you create permanent admin/staff accounts.

## How To Onboard Test Users

### Nurses and doctors

1. Sign in as admin.
2. Open Admin Dashboard.
3. Use `Staff Directory & Access`.
4. Create each nurse or doctor with a strong password.
5. Share the deployed frontend URL plus their credentials.

### Patients

1. Sign in as admin.
2. Open Admin Dashboard.
3. Use `Patient Onboarding`.
4. Enter UHID, name, DOB, and gender.
5. The app creates or reuses the patient record and ensures an active encounter exists.
6. The app issues an activation code.
7. Share the frontend URL and activation code with the patient.
8. Patient opens `/patient/activate`, sets a password, then logs in using UHID.

## Health, Incidents, And Debugging

Health check:

```bash
curl https://YOUR-BACKEND-DOMAIN/api/v1/health
```

Migration command:

```bash
cd backend && npm run migrate
```

Local seed/bootstrap commands:

```bash
cd backend && npm run seed
cd backend && npm run seed:reset
```

How to inspect logs:

- local Docker:
  `docker compose logs -f backend`
  `docker compose logs -f db`
- Railway:
  inspect service logs in the Railway dashboard
- Render:
  inspect web service logs in the Render dashboard

Useful incident questions:

- does `/api/v1/health` say `db_status=ok`?
- did a migration fail during boot?
- does the backend have a valid `DATABASE_URL`, `JWT_SECRET`, and `CORS_ORIGIN`?
- is the browser allowed to send the refresh cookie with the chosen `COOKIE_SAME_SITE` setting?

## Pilot-Only Limitations

This is pilot-ready, not production-grade.

- Access tokens are no longer persisted in `localStorage`, but they are still exposed to in-page JavaScript while the tab is active because they are kept in memory for bearer-authenticated API calls.
- Refresh tokens are `httpOnly`, but the app is not yet a full cookie-only session architecture with CSRF defense. The next production-grade step would be cookie-authenticated access sessions plus CSRF protection or a stricter BFF pattern.
- SSE no longer receives the main access token in the URL, but it still uses a short-lived signed query token because native `EventSource` cannot set bearer headers.
- Rate limiting is in-process only. A multi-instance deployment would need a shared store to enforce global limits.
- Audit logs are append-only at the application layer, not tamper-evident at the database/storage layer.
- There is no MFA, no formal account recovery flow, and no external OTP/SMS delivery provider yet.

## Useful Commands

Frontend build:

```bash
npm run build
```

Backend migration check:

```bash
cd backend && npm run migrate
```

Backend local verification:

```bash
cd backend && npm test
```
