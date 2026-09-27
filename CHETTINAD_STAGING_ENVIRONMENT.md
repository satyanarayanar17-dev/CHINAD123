# Chettinad Care Staging Environment

## API Base URL
The backend is currently running successfully on `localhost:3001`.
For Android deployment, host this backend via Google Cloud Run, Render, or an equivalent Node.js hosting platform and use its provided stable `https://api-staging.<domain>.com/api/v1` URL. (Public tunneling via free ngrok/cloudflare was attempted but proved unstable due to anti-phishing blocks).

## Environment
`APP_ENV=staging`
`NODE_ENV=staging`

## Health Endpoint
`GET /api/v1/health`

## API Prefix
`/api/v1` and `/api/v1/opd`

## Authentication Flow
Same as production web client: Login yields an `access_token` and an `HttpOnly` refresh cookie. Use `POST /api/v1/auth/refresh` upon 401s.

## Database Type
PostgreSQL (`DB_DIALECT=postgres`). The database was seeded successfully with synthetic data.

## Required Network Access
The Android app must be able to reach the deployed staging hostname over HTTPS.

## Web Staging URL
Use the deployed frontend domain and ensure it is included in the staging backend's `CORS_ORIGIN` environment variable.

## Android Configuration Variable
`STAGING_API_URL` should map to the deployed HTTPS backend base URL (e.g., `https://my-chettinad-staging-backend.onrender.com/api/v1`).

## Known Limitations
- `LIMIT 100` constraints were removed across patients, notifications, labs, and appointments. The API now properly handles cursor offset pagination.
- `OPD_DEMO_OTP=true` remains active in the `.env.staging` configuration to allow UAT automated tests to sign in easily.
