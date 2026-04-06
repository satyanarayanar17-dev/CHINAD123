# IMPLEMENTATION CHANGELOG — DEPLOYMENT HARDENING
**Date:** 2026-04-06

---

## Summary of Changes

The Chettinad Care deployment footprint has been shifted from a local mockup to a secure, container-ready pilot stack. Key achievements include the removal of insecure auth defaults, locking down the CLI-based database seeder, building an Admin portal for identity management, and securing the Docker deployment stack.

### 1. Identity & Auth Hardening
- **REMOVED:** Weak fallback `JWT_SECRET` in production modes. It now produces a fatal crash lock on boot.
- **REMOVED:** `PILOT_AUTH_BYPASS` in production modes. Password-less login is no longer possible outside of explicit `local_dev`.
- **ADDED:** `backend/routes/admin.js` — fully functional RBAC-gated Admin API for staff lifecycle operations (`generate`, `disable`, `enable`, `reset-password`).
- **ADDED:** React `UserManagement.tsx` component inside `AdminDashboard.tsx` to handle frontend staff provisioning.
- **ADDED:** Bcrypt cost 10 implementation standardized across seed script and Admin API.
- **ADDED:** Login UI patient bypass guard. The patient login button now honestly reports that Patient web portal is deferred.
- **FIXED:** `backend/routes/portal.js` — Removed the massive scope leak where `resolvePatientIds()` allowed PATIENT tokens to view all database records. Scoped explicitly to own `patient_id`.

### 2. Configuration & Startup 
- **ADDED:** Strict boot validator in `server.js` matching the matrix defined in `ENVIRONMENT_MATRIX.md`. Validates `CORS_ORIGIN`, database definitions, and key length.
- **ADDED:** `.env.compose.example` and `backend/.env.example` templates with explicit WONT-COMMIT guard rails.

### 3. Docker Platform Modifications
- **FIXED:** Nginx `Dockerfile` now includes a `rewrite` rule that properly maps React's Vite proxy path `/api/v1/` standard to the internal backend namespace `/api/`, resolving the `API_MISHAP 404` errors in containerized environments.
- **FIXED:** `docker-compose.yml` was using insecure inline variables for DB Passwords. It now uses `env_file`.
- **FIXED:** Postgres healthchecks incorporated.

### 4. Database & Infrastructure
- **ADDED:** PostgreSQL performance indexes (`idx_encounters_patient_id`, etc.) executed during schema boot if `DB_DIALECT=postgres`.
- **ADDED:** `deploy-seed.js` safety mechanism. Added a strict `--confirm-destroy` process argument to prevent devastating DB drops if the script is accidentally executed on a live database.

### 5. Verification 
- **REWRITTEN:** `backend/verify.js` from a mock script to a massive API regression harness. Now fully simulates 8 distinct domains (Auth, RBAC, Admin Lifecycle, Breakglass, and OCC variations) achieving 100% pass verification over 25 assertions.
