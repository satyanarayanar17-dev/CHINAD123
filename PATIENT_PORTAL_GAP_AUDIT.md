# Patient Portal Gap Audit

## Current Patient-Side Assets
Our inspection of `src/pages/patient` reveals that the frontend UI is structurally built and visually coherent:
- `PatientDashboard.tsx`: Displays summary data and status widgets perfectly styled.
- `usePatientPortal.ts`: Correct hooks executing calls to `/my/appointments`, `/my/records`, etc.
- `patientPortal.ts`: Non-intercepted native API connectors to backend `express`.

## Current Disconnects
The backend does possess a `portal.js` routing schema, however:
1. **Mock Data Leakage**: The endpoints (like `/api/my/appointments`) currently iterate a hard-coded mapping array relying solely on dynamic iteration rather than physical DB `SELECT` bindings where relations might be missing.
2. **Missing JWT Resolver**: `resolveOwnPatientId()` hard-returns `null`. It is physically unable to resolve an active session ID because the `users` table lacks a linkage mechanism to `patients`.
3. **No Auth Ingestion Pipeline**: There is no capacity to create a user with a `PATIENT` role aside from manually injecting via `sqlite3`.
4. **Login Roadblock**: `Login.tsx` completely suspends the `selectedRole === 'patient'` rendering path, disabling frontend interactivity entirely.

## What is Honest
The current patient endpoints in `portal.js` gracefully fallback to `[]` when `patient_id` matches `null`, establishing a default-closed security posture which is optimal. When linkage is restored, it will transparently populate the portal.
