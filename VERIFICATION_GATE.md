# VERIFICATION GATE: CHETTINAD CARE
**TARGET PHASE:** Backend-Verified, Role-Tested, Audit-Aware Internal Pilot Candidate

## 1. PURPOSE
The purpose of this document is to define the exact criteria required to transition the Chettinad Care platform from an integrated prototype to a medically safe, auditable, and concurrency-aware internal pilot application. It assumes zero trust between the frontend and backend.

## 2. FROZEN SCOPE
- **Included:** Role/Session Authentication, Nurse Triage, Doctor Command Center, Patient Dossier, Clinical Note Draft/Finalize, Prescription Draft/Authorize, Admin Operations Dashboard, Patient Portal (Reads).
- **Excluded:** No new interactions, integrations (LIS/OCR, Billing), WebSocket notifications, or offline caching logic.

## 3. LIVE ROUTES
- `/auth/login`
- `/operations/nurse-triage`
- `/clinical/command-center`
- `/clinical/patient/:id/dossier`
- `/clinical/patient/:id/note/:consultationId`
- `/clinical/patient/:id/prescription/:prescriptionId`
- `/admin/dashboard`
- `/patient/dashboard`
- `/patient/records`

## 4. BACKEND-BACKED MODULES
- Auth Sessions (`useAuth`)
- Live Queue Operations (`useLiveQueue` - polling/HTTP)
- Clinical Notes (`useDrafts`, Note Finalization)
- Prescriptions (Prescription Authorization)
- Dossier (Timeline Fetch)
- Queue Discharge (Encounter patch transitions)

## 5. LOCKED / UNAVAILABLE MODULES
- Real-time Notifications (Disabled)
- User Profile / Settings Mutations (Blocked)
- Advanced Patient Write Flows (Booking) (Blocked)
- Break-glass overrides (Unavailable)

## 6. VERIFICATION ENVIRONMENT REQUIREMENTS
- **Environment:** Dedicated `staging` / `pilot-test` isolated environment.
- **Data Condition:** ZERO REAL PHI. Must be completely seeded with fake data.
- **Reset Capability:** Deterministic `POST /internal/seed-reset` must exist.
- **Seeded State:** 20 test patients, 5 active triage cases, 5 active doctor cases.

## 7. CONTRACT VERIFICATION CHECKLIST
- [ ] Every POST/PUT/PATCH has an explicit REST request schema validated by the backend.
- [ ] Correlation IDs (`X-Correlation-ID`) are enforced across all boundaries.
- [ ] Every mutation endpoint explicitly implements Optimistic Concurrency Control (OCC) and can return HTTP `409 Conflict`.
- [ ] All secure routes validate standard JWT expiry and throw hard `401 Unauthorized`.

## 8. QA MATRIX SUMMARY
- Tests MUST execute outside happy paths.
- Requires concurrent dual-browser edit attempts to force 409 collisions.
- Requires role-smashing (e.g., Nurse calling Doctor endpoints via cURL).
- Requires execution against an expired JWT token to prove silent failure doesn't happen.

## 9. AUTHORIZATION REQUIREMENTS
- The backend MUST NOT rely on the frontend route payload to determine identity or privilege.
- Every endpoint MUST verify the actor role against an explicit Access Control List matrix.
- The backend MUST verify the actor has appropriate encounter-claim privilege for the target `patient_id`.

## 10. AUDIT LOGGING REQUIREMENTS
- Required event trail: `USER_LOGIN`, `QUEUE_TRANSFERRED`, `NOTE_FINALIZED`, `PRESCRIPTION_AUTHORIZED`, `DISCHARGE`.
- Immutable append-only log detailing: `timestamp`, `correlation_id`, `actor_id`, `patient_id`, `action`, `prior_state`, `new_state`.

## 11. KNOWN UNKNOWNS
- Backend retry / idempotency expectations on unstable network connections.
- Token refresh failure behavior and boundary recovery in the React tree.

## 12. OPEN RISKS
- Last-write-wins collisions on note drafting if two users access the same workspace.
- Forged role attributes being accepted if the backend lacks strict scope parsing.

## 13. PASS/FAIL EXIT CRITERIA
- **FAIL:** Evidence of clinical data overwrite via concurrency testing.
- **FAIL:** Unauthorized role operations succeed via direct API request.
- **PASS:** 100% of mutation events generate standard audit logs with matching correlation IDs.
- **PASS:** Role boundaries are explicitly enforced serverside (403).
- **PASS:** Concurrency conflicts are deterministically rejected serverside (409).
