# PATIENT_SIDE_PLAN.md — Phase 2 Patient Foundation

Per CTO requirements, the staff-side deployment hardening is frozen. We transition strictly into building the foundational architecture mapping Patients into end-users.

## Proposed Changes

### Database Layer
- #### `backend/database.js`
  - Append `patient_id TEXT REFERENCES patients(id)` to the `users` table generation script.
  - Create table `patient_activation_tokens` to facilitate one-shot OTP bindings mapped to an expiry date.

### Auth / Portal Data Scoping
- #### `backend/routes/portal.js`
  - Replace the `return null` inside `resolveOwnPatientId()` with the execution: `SELECT patient_id FROM users WHERE id = ?`.

### Activation API Pipeline
- #### `backend/routes/patient-activation.js`
  - Scaffold 2 endpoints:
    - `/api/activation/generate`: Executed by Staff/Admin post-triage to bind a 6-digit OTP to a UHID (`patient_id`). Prints the OTP to `stdout` mock SMS.
    - `/api/activation/claim`: Executed by the unauth patient. Accepts UHID, OTP, and New Password. Generates the corresponding `.bcrypt` hash and `users` insertion binding for `role="PATIENT"`.

### Frontend Enablement
- #### `src/pages/patient/PatientActivation.tsx`
  - Unauthenticated form handling the OTP-to-Password bridging capability.
- #### `src/pages/Login.tsx`
  - Re-enable the interactive `PATIENT` module and route them post-activation directly towards authentication.

## Verdict on Readiness:
**Patient foundation ready for controlled implementation.**
