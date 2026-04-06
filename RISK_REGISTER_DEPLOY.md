# RISK REGISTER — DEPLOYMENT HARDENING
**Chettinad Care — Restricted Web Pilot**
**Date:** 2026-04-06

---

| Risk ID | Category        | Description                                             | Likelihood | Impact | Mitigation                                       | Residual Risk |
|---------|-----------------|---------------------------------------------------------|------------|--------|--------------------------------------------------|---------------|
| R-001   | Auth            | JWT default fallback key used in staging/pilot          | Medium     | High   | Startup validator rejects default key in prod mode | Low (if validator present) |
| R-002   | Auth            | PILOT_AUTH_BYPASS accidentally enabled in web pilot     | Low        | Critical | Boot guard + env validator blocks start          | Very Low      |
| R-003   | Data Integrity  | seed-reset endpoint called on live pilot DB             | Medium     | Critical | Require auth + block in production               | Low (after BL-002 fix) |
| R-004   | Data Integrity  | In-memory drafts lost on container restart              | High       | Medium | Documented known gap; clinical note finalize must be the save point | Medium |
| R-005   | Confidentiality | Patient portal scope leak: patient sees all records     | High       | High   | Fix portal.js to scope to own patient_id         | Low (after BL-006 fix) |
| R-006   | Availability    | Nginx missing /api proxy; all API calls fail in Docker  | Confirmed  | Critical | Fix nginx config in Dockerfile                   | None (after BL-001 fix) |
| R-007   | Secrets         | DB credentials and JWT in docker-compose VCS            | Medium     | High   | Use .env file excluded from git                  | Low           |
| R-008   | Audit           | Audit logs not cryptographically immutable              | N/A        | Medium | Accepted for pilot; PG append semantics at app layer | Medium (accepted) |
| R-009   | Concurrency     | Queue OCC not browser-proven multi-actor               | Low        | Medium | Single-actor browser proven; backend proven; document gap | Medium |
| R-010   | Ops             | No mechanism to add/remove staff without server access  | High       | High   | Build minimal user management API               | Low (after BL-005 fix) |
| R-011   | Network         | CORS wildcard in production allows cross-origin API abuse | Low       | High   | Env validator requires explicit CORS_ORIGIN     | Low           |
| R-012   | Data Loss       | PostgreSQL volume not backed up                        | Medium     | High   | Document backup procedure in runbook            | Medium (operational) |
| R-013   | Auth            | No token expiry feedback to user (12h sessions)        | Low        | Low    | 12h JWT; /auth/me validates on bootstrap        | Low           |
| R-014   | Identity        | Staff and patient identity domains share same `users` table | Low   | Medium | PATIENT role has no login accounts in this phase | Low           |
| R-015   | Compliance      | Break-glass audit logs can be read/modified by DB admin | Low        | Medium | Accepted limitation; document in known gaps     | Medium (accepted) |
| R-016   | Ops             | No alerting or monitoring on backend health            | High       | Medium | Health endpoint exists; monitoring out of scope for pilot | High (accepted) |

---

## Risk Rating Key
- **Likelihood:** Very Low / Low / Medium / High / Confirmed
- **Impact:** Low / Medium / High / Critical
- **Residual Risk:** Risk level after mitigation is applied

---

## Accepted Risks for Restricted Pilot

The following risks are explicitly accepted for the restricted web pilot phase and are documented in KNOWN_GAPS_DEPLOY.md:

- **R-004** — In-memory drafts: Staff must finalize notes before server restart windows.
- **R-008** — Non-immutable audit: Acceptable for pilot; would require row-level security or WORM storage for production.
- **R-009** — Queue OCC browser multiactor: Proven at backend layer; browser multi-tab concurrent test not run.
- **R-012** — DB backup: Operational responsibility; documented in OPERATIONAL_RUNBOOK.md.
- **R-015** — Break-glass auditability: DB admin could theoretically mutate; acceptable for restricted pilot.
- **R-016** — No monitoring: Accepted; pilot operators should manually check health endpoint.
