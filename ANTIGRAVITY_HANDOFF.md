# Antigravity handoff — Chettinad Care v2

Prepared 16 September 2026. Continue the existing project and its final QA work. The application is implemented, but **hospital release verification is incomplete**. This document records engineering state; it is not the final QA release report or hospital deployment handoff.

## 1. Exact project location

Open this folder as the workspace:

```text
/Users/siddwork/Desktop/chettinad-care-frontend
```

Despite its name, this is the active **full-stack repository**, containing both the frontend and backend. All recent v2 implementation and QA work is here.

The separately mentioned folder `/Users/siddwork/Desktop/chittnad` exists, but it is not the workspace in which this implementation was completed. Continue in `chettinad-care-frontend`.

Current Git branch:

```text
fix/pre-pilot-blockers-v2
```

There are extensive **uncommitted changes and untracked source files**. Preserve them. A checkout of the existing commit alone will not contain the current implementation. Do not reset, clean, overwrite or discard the working tree. If transferring to another machine, carry the current working files, including untracked `src/opd`, `backend/opd`, `tests`, `docs` and `qa-evidence`. Keep actual environment secrets and local databases private.

## 2. User's request and approval boundary

The user wants the completed hospital platform, actual browser testing, fixes, screenshots and a truthful deployment assessment.

The user's latest workflow instruction is: **complete one step and ask for confirmation before starting the next step**. This supersedes the older instruction in the original QA request to continue through everything autonomously.

Completed earlier steps were clean setup and authentication/role-access QA. The user then approved **the complete clinical browser workflow** as step 1 of the remaining-work list. That clinical step has only been inspected/planned; its new browser run was not completed before this handoff request. Continue that already-approved step without asking for the same approval again. When it is finished, present results and ask before the next step, prescription printing.

Requirements were copied into the repository so this handoff does not depend on Codex's attachment directory:

- [Original product requirements](docs/handoff/ORIGINAL_PRODUCT_REQUIREMENTS.md)
- [Full final-QA request](docs/handoff/FINAL_QA_REQUEST.md)

Read those as the original user-provided requirements, with the latest one-step-at-a-time instruction taking precedence.

## 3. Architecture and files

| Location relative to workspace | Purpose |
| --- | --- |
| `README.md` | Current setup and verification commands |
| `docs/V2_DEMO.md` | Synthetic accounts, scenario states and demo walkthrough |
| `docs/V2_ARCHITECTURE.md` | Data model, permissions, deployment configuration and operational limits |
| `src/App.tsx` | Entry point exporting the v2 app |
| `src/opd/App.tsx` | Login/session bootstrap, role workspaces, navigation, logout and unsaved-change guards |
| `src/api/client.ts` | Memory access token, refresh rotation, sign-out state and stale-response protection |
| `src/opd/booking.tsx` | Registration, patient editing, slots and booking |
| `src/opd/operations.tsx` | Dashboards, appointments, patient directory, queues and lab workflows |
| `src/opd/workspace.tsx` | Nurse triage and doctor consultation/prescription editor |
| `src/opd/records.tsx` | Shared patient record, journey, versions, results and prescription display |
| `src/opd/admin.tsx` | Staff, catalogues, schedules, audit and account settings |
| `src/opd/i18n.tsx` / `styles.css` | English/Tamil/Telugu UI text and layout styles |
| `backend/server.js`, `config.js`, `database.js` | Express startup, environment guards and database adapter |
| `backend/routes/auth.js`, `backend/middleware/auth.js` | Staff authentication, password changes, session enforcement and logout |
| `backend/opd/` | v2 router, patient OTP, scheduling, clinical services, notification worker and tests |
| `backend/migrations/012_connected_opd.js` | v2 workflow schema |
| `backend/migrations/013_session_and_encounter_integrity.js` | Device/session credential separation and encounter integrity |
| `backend/opd/openapi.json` | Implemented API contract |
| `tests/` and `playwright*.config.ts` | Browser test fixtures and suites |
| `qa-evidence/` | Actual screenshots, before/after defect evidence and test logs |

Stack: React 19, TypeScript, React Query, React Hook Form, Vite and Express. Node 24 loads backend TypeScript directly. SQLite supports isolated local testing; PostgreSQL is required for locked/production deployments. The API prefix is `/api/v1`, with v2 workflow routes under `/api/v1/opd`.

Older application modules remain in the repository. The active UI is `src/opd`; legacy API routes are disabled by default and may only be enabled explicitly in local development. Avoid fixing an unused legacy screen when the actual issue is in the v2 UI.

## 4. Run locally

Last tested runtime: Node `24.15.0`, npm `11.12.1`. Installed React `19.2.4`, Vite `8.3.0`, Express `5.2.1`, Playwright `1.63.0`.

```sh
cd /Users/siddwork/Desktop/chettinad-care-frontend
npm ci
npm --prefix backend ci
npm run demo:seed
npm run dev:demo
```

Default frontend: `http://localhost:5173`

Default API: `http://localhost:3001/api/v1`

Health endpoint: `http://localhost:3001/api/v1/health`

The default demo database is `backend/connected-opd-demo.db`. The seeder is additive, uses the real API, and does not reset the ordinary development database. `npm run dev` alone uses the configured/default development database and may not contain the demo accounts. Use `dev:demo` for the credentials below.

For a fresh demonstration on a later day, choose a new database explicitly and start the API against that same path:

```sh
OPD_DEMO_DB=/absolute/path/to/new-synthetic-demo.db npm run demo:seed
OPD_DEMO_OTP=true DB_DIALECT=sqlite SQLITE_PATH=/absolute/path/to/new-synthetic-demo.db npm run dev
```

Never point tests or synthetic seeding at a hospital database. Demo appointments use the real India date. When too few slots remain today, the seeder books a later day and reports deferred clinical scenarios. It does not check in future visits or fabricate clinical history.

Existing development/test processes may still be listening on local ports. Inspect their command and configured database before reusing or stopping them. The open browser URL is not evidence that the backend has reloaded recent changes. Backend `dev` is a normal Node process, not an automatic file watcher.

The backend reads process environment variables; copying `backend/.env.example` to `.env` does not automatically load them. Frontend proxy defaults to port 3001. `VITE_DEV_API_PROXY_TARGET` changes the local proxy; an explicit `VITE_API_BASE_URL` uses the specified API base instead.

## 5. Local demonstration logins

Select **Hospital staff** for staff accounts. Shared synthetic password:

```text
ChettinadDemo2026!
```

| Role | Staff ID |
| --- | --- |
| Reception/Admin | `demo_admin` |
| General Medicine doctor | `demo_doctor` |
| General Medicine nurse | `demo_nurse` |
| Cardiology doctor | `demo_cardiologist` |
| Cardiology nurse | `demo_cardio_nurse` |
| Paediatrics doctor | `demo_paediatrician` |
| Paediatrics nurse | `demo_paeds_nurse` |

Patient login uses mobile numbers `9000000001` through `9000000006`. Request a new OTP and use the code displayed by local development mode. There is no fixed OTP and no real SMS is sent. Respect the 60-second resend cooldown.

Useful synthetic scenarios:

- Ananya Raman: waiting for General Medicine triage.
- Karthik Srinivasan: active General Medicine consultation and existing draft, with prior signed records and reviewed results. The doctor may need to finish this consultation before starting another one.
- Vikram Rajan: Cardiology triaged and waiting for doctor.
- Nila Senthil: Paediatrics triage in progress.
- Lakshmi Subramanian: prioritised/called older-adult visit.
- Meenakshi Sundaram: completed encounter, prescription, released result awaiting doctor review and a follow-up.

These accounts and all clinical example values are synthetic fixtures, not production identities or treatment instructions.

## 6. Completed and verified work

### Clean setup

Clean installation, frontend build, backend typecheck, seeding and startup were exercised in a separate copied workspace. A late-night seeding defect was fixed. Evidence:

`qa-evidence/12-final/setup/STEP_1_SETUP_QA.md`

### Authentication and role access

The last completed auth browser run passed **17 of 17 scenarios**, with zero failures, skips or flaky results, in Chromium `153.0.8010.12` at 1440 × 900, using disposable SQLite fixtures.

Read the detailed report before changing authentication:

`qa-evidence/01-auth/STEP_2_AUTH_RBAC_QA.md`

Authoritative result: `qa-evidence/01-auth/security-browser-results.json`.

Verified behavior includes role-based direct URLs and API denial, actual cross-patient/department IDs, patient OTP registration, refresh rotation, session revocation, staff deactivation, password-change gate, invalid/empty credentials, OTP/login limits, protected reload, offline/server-failure logout recovery and cross-tab/session-response races.

Important fixes to preserve:

1. Offline sign-out keeps a non-secret local sign-out marker and does not silently restore a session on reload.
2. Failed server revocation returns 503 instead of falsely reporting logout success; the HttpOnly cookie remains available for retry.
3. Cancelled/no-show appointments alone no longer grant doctor access to clinical records; attributed historical encounters retain legitimate access.
4. Wrong-role URLs canonicalize to an allowed page.
5. Bootstrap network failure shows a retry instead of forcing a reload loop.
6. Login rate limiting uses Express's trusted-hop client IP, not the untrusted leftmost forwarded address.
7. Legacy SQLite UTC audit timestamps display correctly in IST.
8. Late refresh/bootstrap/sign-in responses cannot reopen a signed-out or superseded session.
9. Password changes enforce the UI/contract's 12–72 characters and uppercase, lowercase, number and symbol requirements.

At the end of that step the following passed: configuration tests (9), SQLite API acceptance groups (9), notification groups using fake transport (3), auth/session regression tests (3), auth-boundary unit tests (8), backend TypeScript and frontend production build. Scoped ESLint had zero errors and 9 existing warnings. The Vite main-bundle size warning remains.

These are recorded results from that checkpoint; rerun relevant checks after new changes. Backend API acceptance success does not establish that every corresponding browser workflow is correct.

## 7. Immediate next task: clinical browser QA

The user approved this step. Run the application, operate it through the browser, capture evidence, fix defects and retest:

1. Patient registration/login, booking and own appointment display.
2. Reception patient lookup, booking/rescheduling/cancellation, identity-verified check-in and unique queue token.
3. Nurse selection, input validation, vital signs/allergies/complaint, saved triage and doctor handoff.
4. Doctor queue and patient dossier, prior records, consultation opening, notes, diagnosis and draft persistence after leaving/reopening.
5. Medication selection, add/remove rows, dose, frequency, duration, instructions, save and finalization. Verify saved prescription content through the record and patient portal.
6. Lab ordering, collection, processing, verified result entry, release boundary, patient visibility and doctor review.
7. Follow-up booking, appointment linkage and shared patient journey/audit consistency.
8. Exercise the workflow's implemented draft/version protections and ensure failed submissions do not falsely report success.

Use freshly created, clearly synthetic QA records for new journeys and do the clinical transitions through the UI. API reads can corroborate persistence, identifiers and versions; do not replace all browser work with API tests. Preserve useful before/after screenshots and record exact failures.

### Known unfinished browser harness

- `playwright.config.ts` currently runs `tests/opd.spec.ts`, with API port 3002 and frontend port 5174.
- **`tests/start-opd.cjs` currently has a syntax defect:** a literal `\n` appears between the `writeFileSync` statement and `console.log`. Replace it with a real newline before attempting that fixture.
- `tests/opd.spec.ts` is unfinished and mixes clinical scenarios with printing, responsive, accessibility and localization checks. Split/narrow the current run to the approved clinical step. Its old failing screenshots are not final pass evidence.
- There is currently **no** `playwright.clinical.config.ts` or `tests/clinical-consultation.spec.ts`. Those names were considered during planning but the files were not created. No new complete clinical suite was run in the latest continuation.
- Avoid rate-limit contamination between unrelated scenarios. The existing security suite models distinct clients with per-context test addresses behind the trusted local proxy, while testing the actual limits separately. Do not disable production protections to get a green test.
- Actual print preview is a subsequent step. A `page.pdf()` or print-media emulation result alone does not satisfy that later requirement.

## 8. Remaining steps after clinical QA

Ask the user before starting each next step:

1. Prescription print QA: actual browser print preview, A4, saved PDF where possible, single/multiple medications, long text, multiple pages, no clipped or missing fields.
2. Desktop/mobile/tablet layouts and additional browser engines. The original QA request lists required viewports, including 320-pixel mobile widths.
3. Tamil and Telugu coverage, Unicode rendering, switching/persistence, translated errors and long-text layout through real workflows.
4. Full accessibility and error/edge-case review: keyboard, focus, names/labels, contrast, duplicate actions, interrupted requests, unsaved changes and concurrent edits.
5. Final regression/build/PostgreSQL/setup/documentation checks and remaining repository defect fixes.
6. Final release assessment and the two required deliverables: `FINAL_QA_RELEASE_REPORT.md` and `HOSPITAL_DEPLOYMENT_HANDOFF.md`. Neither exists yet.
7. Hospital infrastructure configuration, deployment and production smoke/acceptance verification when those services are available and deployment is authorized.

There are existing Tamil/Telugu screenshots and partial test artifacts. They **do not mean localization passed**. The recorded `qa-evidence/localization-results.json` currently reports 4 expected outcomes and 6 unexpected outcomes from the earlier run. Review `tests/localization.spec.ts`, the error contexts and observation files, then reproduce/fix/retest during the approved localization step.

Some earlier UI fixes already exist, including prescription modal rendering through a document-body portal, unsaved-clinical-change guards and contrast adjustments. Verify them in context instead of assuming their presence proves completion.

## 9. Commands and test ports

```sh
npm run build
npm run check:backend
npm run test:v2
npm run test:auth-boundary
npm run test:security-browser
```

`test:v2` includes config, API acceptance, notification and auth/session regression suites. Their default fixtures are disposable SQLite. The security browser command requires `npx playwright install chromium` and automatically manages its API on 3003 and frontend on 5175. It saves screenshots and a JSON report under `qa-evidence`.

The unfinished OPD browser config uses 3002/5174. The separate localization config uses 3004/5176. The clean-setup run previously used 3010/5180. Check which processes still exist instead of assuming they are running or stopped.

For PostgreSQL acceptance, read the README and use only a dedicated disposable database with `OPD_TEST_POSTGRES=true DB_DIALECT=postgres DATABASE_URL=...`. Do not use the saved demo or hospital database. No fresh PostgreSQL result is claimed by the completed authentication report.

Keep generated evidence in `qa-evidence`; generic transient `test-results/` and `playwright-report/` are ignored. QA `.log` files under `qa-evidence` are intentionally retained.

## 10. External deployment dependencies

Real hospital SMS and production hosting have not been configured or verified. Mark these **BLOCKED — EXTERNAL CONFIGURATION REQUIRED**, separately from repository defects.

Hospital deployment needs the actual hosting environment, domain/subdomain and TLS, PostgreSQL connection/TLS, secure environment secrets, approved SMS adapter/provider and OTP templates, backup destination and restore process, monitoring/logging, network restrictions and support ownership. Details and environment names are in `docs/V2_ARCHITECTURE.md` and `backend/.env.example`.

Relevant configuration includes `NODE_ENV`, `APP_ENV`, `DB_DIALECT`, `DATABASE_URL`, database TLS settings, `JWT_SECRET`, `CORS_ORIGIN`, secure cookie settings, `SMS_WEBHOOK_URL`, `SMS_WEBHOOK_TOKEN` and first-admin bootstrap credentials. Locked deployment requires demo/bypass helpers disabled. Never put backend secrets in `VITE_` variables.

The included Compose/Nginx files are scaffolding. They do not provision TLS certificates, SMS service, encrypted storage or backups. Express trusts exactly one proxy hop; the topology and direct API restriction must match that assumption. Rate limiting is process-local and needs shared controls before horizontal scaling.

Before hospital go-live, perform a production smoke test across login, roles, database access, clinical workflow, prescription/printing, real OTP, both languages, logout and audit logging, plus backup recovery and hospital acceptance.

## 11. Reporting standard

Report only behavior actually exercised. Keep evidence for failures and fixes. Distinguish implementation from verification, local synthetic behavior from production integrations, and expected negative-test errors from unexplained failures. Do not call the platform release ready while mandatory steps remain incomplete.

At the end of the clinical step, provide a concise summary, a clinical QA report with screenshot links, material remaining issues, and ask permission to start prescription printing.
