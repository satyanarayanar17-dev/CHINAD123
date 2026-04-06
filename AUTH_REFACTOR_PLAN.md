# AUTH REFACTOR PLAN
**Chettinad Care — Restricted Web Pilot**
**Date:** 2026-04-06

---

## Current Auth State (Baseline)

### What exists:
- `bcryptjs` installed and used in `routes/auth.js` for password comparison
- `scripts/deploy-seed.js` hashes passwords at cost 10 before inserting
- JWT signed with `process.env.JWT_SECRET || 'pilot-beta-secure-secret-key'` (fallback exists)
- `PILOT_AUTH_BYPASS=true` permits login without password hash in local mode
- `NODE_ENV=production` boot guard in `server.js` blocks bypass + weak secret (lines 7-17)
- `requireAuth` and `requireRole` middleware correctly validates JWT and role
- Login audit events: `SYS_AUTH_LOGIN:ROLE` and `SYS_AUTH_DENIAL` written

### What is missing:
- No user management API (create/disable/reset)
- `JWT_SECRET` fallback string is a known public literal
- The fallback only blocks boot in `production` mode — not in `local_pilot`
- No account lockout after repeated failures
- No password complexity enforcement at creation time
- No audit for account lifecycle events

---

## Auth Mode Definitions

### local_dev
- `PILOT_AUTH_BYPASS=true` allowed
- No password required if `!userRow.password_hash`
- JWT_SECRET can be any value (fallback allowed with warning)
- Purpose: engineer rapid iteration without seed scripts

### local_pilot
- `PILOT_AUTH_BYPASS=false` required
- Passwords must be set (via deploy-seed.js or admin API)
- JWT_SECRET must be explicitly set (no fallback)
- Purpose: internal QA on real auth flow before web exposure

### restricted_web_pilot
- `NODE_ENV=production`
- `PILOT_AUTH_BYPASS` must be absent or empty — not `true`
- JWT_SECRET must be 32+ chars, no defaults
- Passwords enforced via bcrypt
- Purpose: named staff web access

---

## Changes Required

### 1. Remove Anonymous Fallback from middleware/auth.js

**Before:**
```js
const JWT_SECRET = process.env.JWT_SECRET || 'pilot-beta-secure-secret-key';
```

**After:**
```js
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] JWT_SECRET is not set. Cannot start in production mode.');
    process.exit(1);
  }
  console.warn('[WARN] JWT_SECRET not set — using development fallback. DO NOT use in pilot.');
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'dev-only-insecure-fallback';
```

### 2. Extend server.js Startup Validator

Add checks for:
- `DB_DIALECT === 'postgres'` requires `DATABASE_URL` to be set
- `CORS_ORIGIN` must be set in production (no wildcard)
- `JWT_SECRET` must be >= 32 characters in production
- `PILOT_AUTH_BYPASS` must not be `true` in production

### 3. Create staff User Management API

Endpoints (all require ADMIN role):

**POST /api/admin/users**
```json
Request: { "id": "staff_id", "role": "NURSE|DOCTOR|ADMIN", "name": "...", "password": "..." }
Response: { "userId": "...", "created": true }
```

**PATCH /api/admin/users/:userId/disable**
```json
Response: { "userId": "...", "disabled": true }
```

**PATCH /api/admin/users/:userId/enable**
```json
Response: { "userId": "...", "enabled": true }
```

**POST /api/admin/users/:userId/reset-password**
```json
Request: { "newPassword": "..." }
Response: { "userId": "...", "reset": true }
```

**GET /api/admin/users**
```json
Response: [{ "id": "...", "role": "...", "name": "...", "is_active": 1 }]
```

All operations write audit events:
- `ADMIN_USER_CREATE:userId`
- `ADMIN_USER_DISABLE:userId`
- `ADMIN_USER_ENABLE:userId`
- `ADMIN_PASS_RESET:userId:by:adminId`

### 4. Validate bcrypt Cost Factor

Current: cost 10 in deploy-seed.js
Recommended: cost 10 is acceptable for restricted pilot
The admin API must also use cost 10 consistently.

### 5. Account Lockout (Deferred)

Account lockout (after N failed attempts) is NOT implemented in this pass.
This is documented in KNOWN_GAPS_DEPLOY.md.
Mitigation: rate limiting at reverse proxy level is the recommended approach.

### 6. Password Complexity Policy

For admin-created accounts in this pass:
- Minimum 8 characters
- Must not be empty
- SERVER-SIDE validation applied in the admin API

More complex rules deferred to a later pass.

---

## Patient Auth Status

Patient login is explicitly NOT ready for restricted web pilot because:
- `portal.js` has a scope leak (all patients visible)
- No patient_id linkage in users table
- No patient account provisioning mechanism

**Decision:** Disable patient login UI for this pilot phase. Backend PATIENT route endpoints will remain but will return 503 with explicit "deferred" message pattern. The Login page will show "Staff access only in current pilot phase" on the patient button.

---

## Token Management

- JWT expiry: 12 hours (current)
- Token storage: localStorage under `cc_token`
- No refresh token issued (refresh endpoint returns 401 by design)
- Token revocation: not implemented — account disable does NOT actively revoke in-flight tokens
  - **Gap:** A disabled user's token remains valid for up to 12h. The `/auth/me` check mitigates this because it validates `is_active` on every session bootstrap. However, between bootstraps the token remains usable.
  - **Mitigation for pilot:** Acceptable risk given 12h expiry and admin ability to force password reset.
  - **Document:** In KNOWN_GAPS_DEPLOY.md.

---

## Verdict

Auth state after this pass: **Conditionally ready for restricted staff pilot**

Remaining gaps (acceptable for restricted pilot):
- No account lockout
- No token revocation on disable (mitigated by 12h expiry + /auth/me check)
- No password complexity beyond minimum length
- Patient auth explicitly deferred
