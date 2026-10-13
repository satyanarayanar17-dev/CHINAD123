# Step 2 backend authentication and role-access verification

Run: 16 September 2026 IST (15 September UTC). Node 24.15.0; npm 11.12.1. Every database was a newly created temporary SQLite fixture. No saved demo, hospital data, or deployment was modified. This document reports backend tests only; browser evidence is recorded separately.

| Command | Result | Evidence |
| --- | --- | --- |
| `node backend/opd/acceptance.cjs` | PASS — 9 groups, rerun after fixes | `sqlite-acceptance.log` |
| `node --test backend/config.test.cjs` | PASS — 9 tests | `config.log` |
| `node --test backend/opd/auth-session.test.cjs` | PASS — 3 regressions | `auth-rbac-regression-after.log` |
| `npx tsc -p backend/tsconfig.json --noEmit` | PASS — exit 0 | `backend-types.log` (no diagnostics) |

Authentication assertions freshly exercised: hashed refresh credentials; public JWT/session IDs cannot be used as refresh secrets; one-time concurrent refresh rotation; stable public session identity; patient OTP single use and password-login separation; absent session binding rejection; SSE purpose restriction; immediate device revocation; refresh-versus-revocation race; mandatory first-login password change with safe session bootstrap.

## Fixed defects

1. **Server logout falsely reported success after revocation failed.** A synthetic database trigger reproduced HTTP 200 despite failed revocation (`logout-regression-before.log`). `backend/routes/auth.js` now returns HTTP 503 `LOGOUT_FAILED`, retains the HttpOnly retry credential, and does not cache the response. The regression verifies a successful retry revokes both access and refresh credentials.
2. **Cancelled/no-show appointments granted continuing clinical access.** A doctor linked only by a cancelled booking could read the patient's record (`rbac-regression-before.log`, HTTP 200 instead of 404). `backend/opd/core.ts` now requires a confirmed/checked-in appointment or an attributed encounter. The regression verifies cancelled/no-show access is denied while confirmed bookings and historical assigned encounters retain legitimate access.

The regression suite also uses actual, existing synthetic patient and encounter IDs in another department: the nurse receives 404 for those records/triage actions, 403 for doctor-only completion, and a queue containing only the nurse's department.

The initial failing logs are intentionally retained as defect evidence. The final regression and acceptance logs pass. PostgreSQL was not rerun in this bounded Step 2 pass; earlier PostgreSQL results are not presented as fresh evidence here.
