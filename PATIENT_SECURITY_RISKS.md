# Phase 2 Patient Security Risks

**Mission Rule**: *No patient-side feature may weaken staff-side hardening.*

## Critical Risk Vectors

### 1. The IDOR Vulnerability (Insecure Direct Object Reference)
**Risk:** If `resolveOwnPatientId()` is bypassed or implicitly trusts client headers, patients could iterate across `patient_id` parameters to fetch other users' records.
**Mitigation:** `PATIENT` queries NEVER accept an ID from the URL (`req.params.id` or `req.query.id`). All `SELECT` scoping strictly relies on pulling the user's encoded `id` from the secure JWT, and mapping it natively against `users.patient_id` within the server execution frame.

### 2. Privilege Escalation (Role Bleed)
**Risk:** A `PATIENT` role attempts to hit `/api/notes/:id` (Staff route).
**Mitigation:** Maintain strict reliance on `requireRole(['DOCTOR', 'NURSE'])`. Admin and Staff layers must blanket-block the `PATIENT` constraint globally outside the closed `/my/` ecosystem.

### 3. Patient Impersonation
**Risk:** Re-using `PILOT_AUTH_BYPASS` trickery to emulate a patient.
**Mitigation:** Patient endpoints intrinsically ignore Pilot Bypass mechanics globally because token signature matching requires the cryptographic JWT boundary to establish linking headers.

### 4. Activation Token Extraction
**Risk:** Malicious actor guesses activation OTP tokens over the activation route.
**Mitigation:** Enforce aggressive rate-limiting on the `/api/patient/activate` endpoint (max 3 failed tries) and structure OTPs bound to an arbitrary time-to-live logic (TTL 20 mins). If communication providers are absent in Pilot Phase, simulate secure delivery natively strictly to `stdout` logs.
