# Step 2 — Authentication and role-access QA

Completed 16 September 2026. **PASS for this bounded step: 17 Chromium browser scenarios, zero failed, skipped or flaky tests.** The final browser run took 38.0 seconds. Tests used the running React application and real API against disposable synthetic SQLite fixtures. Screenshots below come from those runs.

This is not a release approval. Overall release verification remains incomplete: clinical browser journeys, prescription print preview, responsive layouts, Tamil/Telugu coverage and additional browser engines still require their subsequent approved steps. No hospital deployment was performed.

## Environment and reproduction

| Item | Tested value |
| --- | --- |
| Runtime | Node 24.15.0; npm 11.12.1 |
| Frontend | React 19.2.4; Vite 8.3.0 |
| API | Express 5.2.1 |
| Browser | Playwright 1.63.0; Chromium 153.0.8010.12; headless, 1440 × 900 |
| Frontend / API | `http://127.0.0.1:5175` / `http://127.0.0.1:3003` |
| Data | A new temporary SQLite fixture per suite run, seeded through API calls; no saved demo or hospital database changed |
| Authentication environment | Local development, legacy APIs disabled, development OTP enabled, a synthetic signing key used only by the fixture |
| Final browser run | Started 2026-09-16 06:25:34 UTC / 11:55:34 IST |

From the repository root after installing root and backend dependencies:

```sh
npx playwright install chromium
npm run test:security-browser
npm run test:v2
npm run test:auth-boundary
npm run check:backend
npm run build
npx eslint src/api/client.ts src/opd/App.tsx src/opd/i18n.tsx src/opd/ui.tsx tests/security-browser.spec.ts
```

The browser command starts and stops its own servers. Ports 3003 and 5175 must be free. Each scenario has an isolated browser context and a synthetic client address behind the configured single trusted proxy hop, so scenarios do not consume one another's login limits. Separate tests deliberately exhaust those limits; protections are not disabled for testing.

## Browser results

| # | Scenario | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Unauthenticated protected/invalid URLs, empty required inputs and incorrect staff credentials | PASS | [Direct URL](protected-direct-url-login-pass.png), [invalid credentials](../11-errors/invalid-staff-credentials-pass.png) |
| 2 | Doctor cannot use admin routes/mutations or read another doctor's actual patient; URL becomes the allowed home route | PASS | [Doctor boundary](doctor-direct-admin-route-denied-pass.png) |
| 3 | Nurse queue is department-scoped; real other-department records/triage and doctor-only completion are denied | PASS | [Nurse boundary](nurse-permission-boundary-pass.png) |
| 4 | Patient OTP registration through UI, own record allowed, actual other-patient records/journey denied, admin route denied | PASS | [Patient registration](patient-registration-role-boundary-pass.png) |
| 5 | Reload restores an authorized session; expired access token refreshes and rotates the HttpOnly secret; public device IDs cannot refresh without the cookie | PASS | [Refresh recovery](expired-access-refresh-recovery-pass.png) |
| 6 | Device revocation immediately invalidates access; successful logout clears the refresh cookie and survives reload | PASS | [Revocation](revoked-session-login-pass.png), [logout](logout-reload-pass.png) |
| 7 | Failed bootstrap network request presents an error and a working retry | PASS | [Failure](../11-errors/backend-unavailable-visible-retry-pass.png), [recovery](../11-errors/backend-recovery-after-retry-pass.png) |
| 8 | Failed offline logout does not silently restore the session on reload | PASS | [After fix](../11-errors/after-fix-offline-logout-stays-signed-out.png) |
| 9 | Admin can access operations but not clinical record/completion; bearer/refresh secrets absent from rendered DOM and browser storage; login audit actor and IST timestamp match API data | PASS | [Audit](admin-clinical-restriction-and-audit-pass.png) |
| 10 | Logout clears another tab and rejects an in-flight expired-token refresh response | PASS | [Concurrent tabs](multitab-and-inflight-refresh-logout-pass.png) |
| 11 | Server logout 503 is visible, stays signed out after reload, and successful cleanup permits an explicit new login | PASS | [Pending logout](../11-errors/server-logout-failure-visible-pass.png), [new login](explicit-login-after-logout-retry-pass.png) |
| 12 | Missing refresh cookie returns to login with one refresh attempt, without a reload loop | PASS | [Expired session](expired-refresh-login-pass.png) |
| 13 | OTP resend cooldown, incorrect-code message and five-attempt lockout | PASS | [Invalid OTP](../11-errors/invalid-otp-visible-pass.png) |
| 14 | Staff login attempts produce bounded HTTP 429 and a visible error | PASS | [Login limit](../11-errors/staff-login-rate-limit-pass.png) |
| 15 | Varying untrusted leftmost forwarded addresses and usernames cannot evade the proxy-resolved client-IP limit | PASS | [Forwarded-address limit](../11-errors/forwarded-address-rate-limit-pass.png) |
| 16 | New staff cannot access protected work until password change; weak/overlong passwords rejected; valid change unlocks access; old password fails; admin deactivation revokes access and prevents login | PASS | [Password gate](first-login-password-gate-pass.png), [weak password](../11-errors/weak-password-rejected-pass.png), [deactivated staff](deactivated-staff-login-denied-pass.png) |
| 17 | A successful bootstrap `/opd/session` response delayed until after another tab's sign-out cannot reopen the workspace | PASS | [Late response rejected](delayed-bootstrap-after-other-tab-logout-pass.png) |

The browser assertions include no unhandled page JavaScript exceptions. HTTP 400/401/403/404/429 and injected network/503 failures are expected negative-test stimuli. They are retained in the logs rather than concealed. The tests do not claim an exhaustive console/network audit of all application workflows.

Authoritative machine-readable result: [security-browser-results.json](security-browser-results.json). Complete final run: [browser-final.log](browser-final.log). Source: `tests/security-browser.spec.ts`, `playwright.security.config.ts`, `tests/start-security.cjs`.

## Defects fixed and retested

| ID / severity | Finding and correction | Changed files | Retest evidence |
| --- | --- | --- | --- |
| AUTH-01 / High | Failed network logout cleared memory but left a cookie that silently restored access. Persist a non-secret sign-out marker, clear other tabs, and retry server cleanup before new login. Late refresh results cannot restore access. | `src/api/client.ts`, `src/opd/App.tsx`, `src/opd/ui.tsx`, `src/opd/i18n.tsx` | [Before](../11-errors/before-fix-offline-logout-restores-session.png), [after](../11-errors/after-fix-offline-logout-stays-signed-out.png); scenarios 8, 10, 11 |
| AUTH-02 / High | Server logout returned success when database revocation failed. Return 503 and retain the HttpOnly credential for retry; successful retry revokes both token types. | `backend/routes/auth.js` | [Before regression](step2-backend/logout-regression-before.log), [final regression](v2-regressions-final.log), scenario 11 |
| AUTH-03 / High | A cancelled/no-show booking alone authorized doctor record reads. Require a confirmed/checked-in appointment or an attributed encounter, preserving legitimate historical care access. | `backend/opd/core.ts` | [Before regression](step2-backend/rbac-regression-before.log), [final regression](v2-regressions-final.log) |
| AUTH-04 / Medium | Wrong-role and unknown URLs rendered a fallback without correcting the URL. Canonicalize to login or the role's allowed home. | `src/opd/App.tsx` | Scenarios 1–4 |
| AUTH-05 / Medium | Bootstrap refresh failures could force a reload instead of showing a recoverable error. Keep the failure in the UI with a tested retry. Ordinary role denial no longer discards an otherwise valid session. | `src/api/client.ts`, `src/opd/App.tsx` | Scenarios 2, 3, 7, 12 |
| AUTH-06 / High | Login IP selection manually trusted the leftmost forwarded address. Use Express's configured trusted-hop resolution. | `backend/routes/auth.js`, `docs/V2_ARCHITECTURE.md` | Scenario 15; final log shows one resolved client address across changing untrusted values |
| AUTH-07 / Medium | SQLite audit UTC timestamps without a timezone suffix were interpreted as local time. Normalize legacy SQL UTC timestamps before displaying IST. | `src/opd/i18n.tsx` | Scenario 9 compares the rendered audit timestamp to the actual API event |
| AUTH-08 / High | A delayed session response reopened a signed-out workspace. Guard bootstrap, sign-in and password-gate session updates with a session generation and sign-out state. | `src/api/client.ts`, `src/opd/App.tsx` | [Before screenshot](../11-errors/before-fix-delayed-bootstrap-tab-2.png), [failing run](before-bootstrap-race-fix.txt), [after](delayed-bootstrap-after-other-tab-logout-pass.png); scenario 17 |
| AUTH-09 / High | Password-change API accepted `weakpass` although the UI and API contract required 12–72 characters and mixed character types. Enforce the stated policy and display a useful validation message. | `backend/routes/auth.js`, `src/opd/i18n.tsx`, `backend/opd/openapi.json` | [Before screenshot](../11-errors/before-fix-weak-password-bypasses-gate.png), [failing run](before-password-policy-fix.txt), [after](../11-errors/weak-password-rejected-pass.png); scenario 16 |

Regression scripts are exposed in both package manifests; `test:v2` now includes the auth/session regressions. README documents the browser test setup. QA logs are retained under version control, while transient Playwright output is ignored.

## Final verification

| Check | Result | Evidence |
| --- | --- | --- |
| Browser auth/RBAC | PASS — 17 scenarios | [JSON](security-browser-results.json), [log](browser-final.log) |
| Configuration safeguards | PASS — 9 tests | [v2 log](v2-regressions-final.log) |
| SQLite API acceptance | PASS — 9 groups, including session rotation, OTP single use, scope and revocation | [v2 log](v2-regressions-final.log) |
| Notification regression | PASS — 3 groups with injected transport and no real SMS | [v2 log](v2-regressions-final.log) |
| Logout/RBAC backend regressions | PASS — 3 tests | [v2 log](v2-regressions-final.log) |
| Auth-boundary unit tests | PASS — 8 tests | [log](auth-boundary-final.log) |
| Backend TypeScript | PASS | [log](backend-types-final.log) |
| Frontend TypeScript and production build | PASS; main JS bundle size warning remains | [log](build-final.log) |
| Scoped ESLint | PASS — zero errors; 9 existing export/unused-variable warnings | [log](lint-final.log) |

Screenshot inspection included the password gate, visible logout failure, weak-password rejection, and before/after delayed-session state. Browser screenshot generation is not a substitute for the pending full visual/accessibility review. The audit screenshot is full-page and requires zooming to read its long table.

## Boundaries and remaining work

- **BLOCKED — EXTERNAL CONFIGURATION REQUIRED:** real hospital SMS/OTP delivery and production hospital hosting, HTTPS/domain, infrastructure secrets and operating controls were unavailable. Development OTP and local HTTP do not establish production readiness.
- This step exercised Chromium at 1440 × 900 with SQLite. Safari/WebKit, other viewports, production cookies/TLS and a fresh PostgreSQL run are not claimed here.
- Password visibility toggle and a break-glass workflow are not implemented in the v2 UI; they are not marked as passed.
- The single trusted proxy hop must match deployment topology and direct API access must be restricted. Rate limits remain per process; distributed deployment requires shared abuse controls.
- English password-error behavior was browser-tested. Added Tamil/Telugu error strings still require the dedicated localization review.
- The build-size warning and existing lint warnings remain recorded for the later release/performance pass.
- **Next proposed step, awaiting user confirmation:** the complete browser clinical journey from booking and check-in through nurse triage, doctor consultation, prescription and laboratory handoff. Actual print preview, responsive/browser compatibility, localization and final release/hospital handoff documents follow in separately approved steps.

Step 2 is complete. No Step 3 work has been started as part of this continuation.
