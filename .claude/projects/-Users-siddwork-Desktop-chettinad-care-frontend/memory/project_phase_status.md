---
name: Chettinad Care Phase Status
description: Phase 1/2/3 implementation status and outstanding gaps for the Chettinad Care hospital platform
type: project
---

Phase 3 implemented on 2026-04-09 in worktree claude/youthful-kapitsa.

**Phase 1:** Complete — JWT auth, bcrypt, admin lifecycle API, break-glass, OCC, production boot validator, verify.js 8-section harness.

**Phase 2:** Partially claimed in changelogs but NOT fully implemented in code. Gaps filled as Phase 3 prerequisites: clinical_drafts table, notifications DB table, writeNotification() function, patient_activation_tokens (this one did exist).

**Phase 3:** Complete — P3-A break-glass 50-char, P3-B SSE real-time notifications (backend/routes/sse.js + useNotifications.ts + Live badge in BaseLayout), P3-C token revocation (revoked_tokens table + requireAuth async check + admin disable/enable wires), P3-D draft cleanup setInterval in server.js, P3-E rateLimit.js factory applied to auth login + activation generate/claim, P3-F verify.js sections 12-14.

**Why:** Stack is Node/Express + SQLite↔PostgreSQL dual-dialect + React 18/TS/TailwindCSS/TanStack Query. Vite proxy rewrites /api/v1 → /api on localhost:3001.

**How to apply:** Phase 4 work should focus on: DB-backing drafts.js, wiring writeNotification to clinical routes (notes/prescriptions/encounters/patients), multi-tab SSE fan-out (Map<userId, Set<res>>), deploy-seed.js password seeding, patient-scoped notification delivery.
