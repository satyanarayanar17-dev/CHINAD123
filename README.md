# Chettinad Care v2 — Connected OPD

A working outpatient application for **Patient → Reception/Admin → Nurse → Doctor**, with one shared patient record and journey timeline:

**Appointment → Check-in → Queue → Triage → Consultation → Investigation → Prescription → Result → Follow-up.**

Patients register and sign in with a mobile OTP, book offered slots, track their visit, and view signed prescriptions and released laboratory results. Reception manages appointments, identity verification and tokens. Nurses perform department-scoped triage. Doctors consult their assigned patients, order tests, sign prescriptions, book follow-ups, and review results. Administration configures staff, departments, schedules and catalogues.

The implementation runs locally with synthetic data. A real deployment requires the hospital's SMS adapter, HTTPS endpoint, PostgreSQL and encrypted storage; these external services are not provisioned by the repository.

## Run the complete local demo

Use **Node.js 24 or newer**. From the repository root:

```sh
npm ci
npm --prefix backend ci
npm run demo:seed
npm run dev:demo
```

Open [the app](http://localhost:5173). The seeder creates a separate `backend/connected-opd-demo.db` through the real API, including six synthetic patients, three departments, active queues, prior visits, prescriptions, laboratory results and a follow-up. It preserves existing demo records on rerun. It does not reset the regular development database.

| Role | Login |
| --- | --- |
| Reception/Admin | `demo_admin` |
| General Medicine doctor | `demo_doctor` |
| General Medicine nurse | `demo_nurse` |
| Patient | Mobile `9000000001` through `9000000006` |

Demo staff password: **`ChettinadDemo2026!`**. Patient sign-in displays a fresh development OTP after requesting it; no SMS is sent in demo mode. See [the complete demonstration guide](docs/V2_DEMO.md) for all accounts, scenarios and a walkthrough. Demo appointments use the actual India date; use a new `OPD_DEMO_DB` file for a fresh walkthrough on a later day.

## Develop and verify

```sh
npm run dev                 # Vite + API against your configured database
npm run build               # Frontend TypeScript and production assets
npm run check:backend       # Strict backend TypeScript check
npm run test:v2             # Isolated configuration, API, notification and auth regressions
npm run test:security-browser # Chromium authentication and role-access browser tests
npm run lint
```

The Vite development proxy sends `/api/v1` to `http://localhost:3001`. Set `VITE_API_BASE_URL` for a separate API host, or `VITE_DEV_API_PROXY_TARGET` to change the local proxy. The backend reads environment variables supplied by your shell or host; it does not automatically load `backend/.env`.

The API acceptance suite uses a fresh temporary SQLite database by default. To test PostgreSQL, point `DATABASE_URL` at a dedicated disposable test database and set `OPD_TEST_POSTGRES=true DB_DIALECT=postgres` when running `npm run test:opd`. Never point acceptance tests at a hospital or demonstration database. Notification tests always use isolated SQLite and an injected fake transport.

The authentication browser suite requires `npx playwright install chromium`. It creates a fresh synthetic SQLite fixture, starts its own API on port 3003 and frontend on port 5175, and records screenshots and JSON results under `qa-evidence/01-auth/` and `qa-evidence/11-errors/`. Keep those ports free. It tests development OTP handling; it does not send hospital SMS or verify production HTTPS.

## Code and API contract

| Location | Purpose |
| --- | --- |
| `src/opd/` | React/TypeScript application, role workspaces, localization and shared types |
| `backend/opd/` | TypeScript authentication, scheduling, clinical workflow, notification worker and tests |
| `backend/migrations/` | Additive SQLite/PostgreSQL migrations, including the v2 schema and session integrity |
| `backend/database.js` | Transactional database adapter and PostgreSQL TLS configuration |
| `backend/opd/openapi.json` | OpenAPI 3.1 contract for implemented v2 workflow routes |
| `docs/V2_ARCHITECTURE.md` | Data model, access boundaries, deployment and operational limits |

The API retains the `/api/v1` prefix; the v2 workflow routes are under `/api/v1/opd` and patient OTP routes under `/api/v1/auth/opd`. Staff authentication remains under `/api/v1/auth`. The [OpenAPI document](backend/opd/openapi.json) is also served at [the local API contract endpoint](http://localhost:3001/api/v1/openapi.json).

Legacy clinical routes remain in the source for reference and are disabled by default. `ENABLE_LEGACY_API=true` only enables them in local development. They are not the v2 application contract.

## Deployment

Build the frontend with `npm run build` and serve `dist/` through an HTTPS reverse proxy with SPA fallback. Run the API with Node.js 24+ and `npm --prefix backend start`, or use its Node 24 container. Configure PostgreSQL with `DB_DIALECT=postgres`, `DATABASE_URL`, and verified database TLS for remote connections. Use a secret manager for `JWT_SECRET`, bootstrap credentials and `SMS_WEBHOOK_TOKEN`.

Locked deployments (`NODE_ENV=production` or `APP_ENV=restricted_web_pilot`) require PostgreSQL, secure cookies, an explicit HTTPS frontend origin, disabled demo helpers, and a configured HTTPS SMS adapter. First startup uses `BOOTSTRAP_ADMIN_ID`, `BOOTSTRAP_ADMIN_NAME` and `BOOTSTRAP_ADMIN_PASSWORD` only when no administrator exists. Create the hospital's departments, catalogues, staff and schedules through the administration workspace.

The included Compose/Nginx files are infrastructure scaffolding. They do not provision a public TLS certificate, SMS service, encrypted volumes or backups. Read [the v2 deployment and operational requirements](docs/V2_ARCHITECTURE.md) before using patient data. Older pilot documents describe earlier workflows and should not override this v2 guide.

Late-night setup: when today has no free slots, the seeder books the next available day. It reports deferred scenarios and does not check in future appointments or fabricate clinical history. Rerun on that appointment date to populate the remaining visits; use a fresh demo database during working hours when a complete live-queue walkthrough is needed.
