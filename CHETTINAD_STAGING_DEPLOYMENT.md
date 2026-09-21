# Chettinad Care v2 Staging Deployment Guide

This document outlines the procedure to deploy the staging environment to any managed HTTPS Node host (e.g., Google Cloud Run, Render, Railway).

## Runtime Requirements
- **Node.js**: v24+
- **Database**: PostgreSQL 15+

## Environment Variable Checklist
### Required for Staging
- `APP_ENV=staging`
- `NODE_ENV=production`
- `DB_DIALECT=postgres`
- `DATABASE_URL=postgres://...`
- `JWT_SECRET` (Must be at least 32 chars)
- `CORS_ORIGIN` (The HTTPS URL of the staging web app)
- `OPD_DEMO_OTP=true` (Allowed in staging for testing purposes)
- `SMS_WEBHOOK_URL` / `SMS_WEBHOOK_TOKEN` (Optional when DEMO OTP is enabled)
- `PORT=3001` (Or injected by host)

## Database Provisioning & Migration Procedure
To prevent multiple container replicas from running schema migrations concurrently at startup, perform migrations using a deliberate release step:

1. Deploy the managed PostgreSQL instance.
2. Run the migration command once (usually configured as a release phase in Render/Railway or via a one-off task):
   ```bash
   npm run migrate
   ```
3. Optionally, seed the database with synthetic testing data:
   ```bash
   npm run demo:seed
   ```
4. Start the service.

## Build and Start Commands
- **Build**: `docker build -t chettinad-backend .`
- **Start**: `npm start` (Runs `server.js`)

## Health Check Path
- `GET /api/v1/health` (Used by managed hosts to verify HTTP availability)
- `GET /api/v1/ready` (Used internally to check DB/Migration readiness)

## CORS and Cookie Configuration
CORS is restricted strictly to the origins defined in `CORS_ORIGIN`. Secure cookies are enforced (`COOKIE_SECURE=true`) since the staging environment requires HTTPS.

## Android and Web Handoff Requirements
- The **Android** client must set its `STAGING_API_URL` to the HTTPS backend URL.
- The **React** client must set its `API_BASE_URL` to the HTTPS backend URL, and its own frontend URL must be in the backend's `CORS_ORIGIN`.

## Offset Pagination Caveats
Note: The list endpoints (Patients, Appointments, Labs, Notifications, Audit) now use query-based offset pagination (`?limit=X&offset=Y`) ordered deterministically. Because it is offset-based, if new records are inserted while a user pages through the data, elements might shift between pages. 

## Validation Procedure
After deployment, verify the deployment via:
```bash
./scripts/staging-smoke-test.sh
```
