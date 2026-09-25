# Care Plan Backend Acceptance Report

Date: 2026-09-21  
Scope: backend reconciliation and read-only Web inspection. iOS and Android were not modified.

## Required acceptance status

ANTIGRAVITY DIFF REVIEW: PASS

The initial working tree was clean. The implementation was already committed at local `HEAD` `79d0b1e`, one commit ahead of `origin/fix/pre-pilot-blockers-v2`. Its Care Plan surface was:

- `backend/migrations/014_care_plans.js`
- `backend/routes/care_plans.js`
- `backend/routes/adherence.js`
- `backend/routes/prescriptions.js`
- `backend/server.js`
- `backend/lib/staffDepartments.js`, `backend/opd/demo.cjs`, and the existing admin department filter for OG-related behavior
- `src/pages/patient/CarePlanWidget.tsx`
- `src/api/patientPortal.ts`
- `src/hooks/queries/usePatientPortal.ts`

The original migration and routes did not meet the audited contract: migration 014 had no migration `id`, created only four underspecified tables, generated occurrence rows on read, allowed broad staff access, lacked immutable task revisions and plan concurrency, and copied medication instructions from JSON without stable prescription item linkage. The backend defects were reconciled in place. The Web files were inspected and left unchanged.

MIGRATION 014: PASS

Migration 014 was not present on the upstream branch and was only in the unpushed local commit, so it was corrected in place rather than creating migration 015. It now has the canonical ID `014_care_plans`, recognizes an empty partially-created prototype, refuses to discard a populated prototype, provisions the canonical OG identity safely, backfills authorized prescription revisions, and creates six new tables:

1. `prescription_items`
2. `care_plans`
3. `care_plan_tasks`
4. `care_plan_adherence`
5. `patient_observations`
6. `patient_observation_components`

FRESH POSTGRESQL MIGRATION: PASS

A newly created disposable local PostgreSQL database was migrated from 001 through 014 and then dropped. The final Care Plan run also returned HTTP 200 from `/api/v1/ready` with `ready=true` and `migrations_up_to_date=true`. A separate 001-013 fixture containing an authorized prescription was advanced to 014 successfully; it generated an environment-specific OBST department ID and backfilled the current authorized prescription items.

14/14 MIGRATIONS: PASS

The final `schema_migrations` count was 14 and the latest row was `014_care_plans`.

OG/OBST RESOLUTION: PASS

The canonical pilot department is resolved by `name='Obstetrics & Gynaecology'` and `prefix='OBST'`. Migration 014 creates it with an environment-specific `dept-<uuid>` ID only when absent and fails on name/prefix identity conflicts. No demo UUID is embedded in PostgreSQL logic. Restricted-pilot acceptance covers directory, staff creation, schedules, appointments, queue, dashboard, department catalogue, and Care Plan creation.

MULTI-DEPARTMENT FOUNDATION: PASS

The `departments` table and department foreign keys remain intact. Non-OBST data can continue to exist, while `APP_ENV=restricted_web_pilot` filters the active surface to OBST and rejects writes targeting other departments.

CARE PLAN MODEL: PASS

`care_plans` is the patient/department aggregate. `care_plan_tasks` supports `MEASUREMENT`, `ACTIVITY`, `MEDICATION`, and `INSULIN`, schedule rules, explicit windows, lifecycle status, and immutable instruction revisions. Medication and insulin title/instruction text is derived by the server from the linked current prescription item; callers cannot set a different dose through the Care Plan API.

The canonical API is mounted at `/api/v1/opd`:

- `GET /care-plans/:patientId`
- `POST /care-plans/:patientId`
- `POST /care-plans/:patientId/tasks`
- `PATCH /care-plans/tasks/:taskId`
- `PATCH /care-plans/:patientId`
- `POST /care-plans/:patientId/review`
- `GET /adherence/:patientId/today`
- `GET /adherence/:patientId/timeline`
- `POST /adherence/:taskOrResponseId/record`

TASK REVISION MODEL: PASS

Each logical task has a stable `series_id`; each replacement inserts a new row with an incremented `revision` and `supersedes_task_id`. The prior row is retained with an end date and `SUPERSEDED` status. Existing responses keep their original `task_id`, so historical meaning does not change.

OCCURRENCE MODEL: PASS

Expected occurrences are derived from the task schedule for the requested date. Reads do not insert occurrence rows. `care_plan_adherence` is written only for a Patient response; reminder materialization uses the existing deduplicated `opd_notifications` table.

- `UPCOMING`: no response and current time is before the due window.
- `DUE`: no response and current time is within the inclusive due window.
- `COMPLETED`: a persisted response exists with `RECORDED`, `COMPLETED`, or `TAKEN`.
- `MISSED`: no response and current time is after the due window.
- `SKIPPED`: a persisted `SKIPPED` response exists.

Schedules support `DAILY`, `SELECTED_DAYS`, `EVERY_N_DAYS`, and `ONCE`, plus start date and optional end date. Dates and due instants use `Asia/Kolkata`; that zone has no daylight-saving transition, and local-midnight/date boundaries are converted deterministically. Replacements split old/new effective ranges. Task and plan deactivation preserve valid ranges and exclude inactive instructions without generating future rows.

PATIENT RBAC: PASS

Patients can read their own plan/today/timeline and record only their own due responses. Cross-patient plan, today, timeline, and write attempts return the canonical anti-enumeration 404. Patients cannot modify clinician instructions, plan state, medication identity, dose, frequency, or insulin dose.

DOCTOR RBAC: PASS

Only Doctors can create/deactivate a plan and create/replace/deactivate clinical tasks. Existing `patientAccess` must link the Doctor to the patient; sharing a department is insufficient. The current Care Plan pilot additionally requires the Doctor's resolved department to be canonical OBST.

NURSE RBAC: PASS

Nurses can read plans, adherence, and readings and can record a review audit event only while existing `patientAccess` succeeds. The tested policy requires a matching department and a non-completed queue entry. Nurses cannot create, replace, or deactivate a plan or task. Other-department and completed-queue access returns 404.

ADMIN RBAC: PASS

Admin has no general clinical Care Plan read or mutation authority. Server-side clinical access denies the role.

GLUCOSE: PASS

Synthetic `FASTING_GLUCOSE`, `BEFORE_DINNER_GLUCOSE`, and `POST_DINNER_GLUCOSE` tasks persisted the numeric value, unit, timing relation, scheduled occurrence, Patient-observed timestamp, server-recorded timestamp, and optional note. Doctor and authorized Nurse retrieved the exact persisted data. No diagnosis, interpretation, insulin adjustment, or treatment recommendation is stored.

ACTIVITY: PASS

The Doctor-created daily `Morning Walk` task retained its 30-minute duration, Patient completion timestamp/note, patient, plan, task ID, series, revision, and scheduled context. Doctor and authorized Nurse retrieved the same persisted response.

MEDICATION: PASS

Medication adherence accepts `TAKEN` or `SKIPPED`; `MISSED` is derived when no response exists after the window. The task source is an immutable structured prescription item, and non-measurement payloads carrying measurement values are rejected.

INSULIN: PASS

Insulin adherence is tested separately with the same `TAKEN`/`SKIPPED` contract. The backend neither calculates nor adjusts an insulin dose. It displays the dose from the Doctor-authorized prescription item.

PRESCRIPTION ITEMS: PASS

`prescription_items` supplies stable item IDs scoped by `(prescription_id, prescription_version, ordinal)`. The only writer is the canonical consultation prescription transaction; there is no independent item-editing API. New medication/insulin tasks may reference only the current authorized prescription revision.

PRESCRIPTION AMENDMENT: PASS

Issue and amendment use one transaction to write the signed/versioned `prescriptions.rx_content` snapshot and the matching immutable `prescription_items` revision. Row content is compared with the validated input before commit. An injected item-write failure rolled back both representations. The existing clinical version snapshot remains historical evidence.

MEDICATION SOURCE INTEGRITY: PASS

A task created from prescription v1 stays linked to its v1 item after amendment. Reads mark it `medication_source_outdated=true` while retaining the v1 dose. A Doctor must explicitly replace it with a current v2 item. Attempts to create a new task from the old v1 item return 409; no silent dose mutation occurs.

OPTIMISTIC LOCKING: PASS

`care_plans.__v` is the single aggregate concurrency guard for Doctor-authored plan/task mutations. Immutable task `revision` records clinical history and does not compete with `__v`. `care_plan_adherence.__v` guards Patient corrections independently; recording adherence does not increment the plan version. No ETag, `If-Match`, or idempotency-key mechanism was added.

409 STALE_STATE: PASS

Two concurrent Doctor task mutations sent with the same plan version produced one success and one HTTP 409 `STALE_STATE`. Stale Patient response corrections also return the same canonical conflict.

EFFECTIVE-DATE CONFLICT: PASS

A same-day replacement after the Patient has responded returns HTTP 409 `EFFECTIVE_DATE_CONFLICT`. Prospective replacement retains revision 1 and creates revision 2. Deactivation also rejects unsafe effective ranges or persisted responses on/after the requested effective date.

TIMELINE: PASS

`GET /adherence/:patientId/timeline` returns persisted glucose observations, activity completion, medication adherence, and insulin adherence from PostgreSQL. The final acceptance compares the authorized Nurse timeline response IDs with the Doctor's response IDs. No client-fabricated timeline events are required.

AUDIT HISTORY: PASS

Clinician mutations and Patient responses write `audit_logs` with timestamp, correlation ID, actor, patient, action, and context. Replacement/deactivation context points to the prior task/revision and new task/revision/effective date; the referenced immutable task rows retain the full prior and new instructions. Journey events are also written for clinician plan changes.

REMINDER GENERATION: PASS

The worker derives reminders from active scheduled tasks inside the next 24 hours, skips completed occurrences, writes `CARE_TASK_REMINDER` to `opd_notifications`, and deduplicates by task and scheduled instant. Glucose, activity, medication, and insulin reminders were all tested. It does not create large future occurrence sets.

PUSH DELIVERY: NOT TESTED

Care task reminders are persisted for in-app consumption. No Care Plan push/SMS transport is connected or claimed as passing in this phase.

WEB CARE PLAN: PARTIAL

The widget uses the canonical API and has loading, empty, submission, persistence, and toast behavior; it does not use mock task data. It is not contract-complete: it checks `READING` instead of backend `MEASUREMENT`, sends `COMPLETED` for medication/insulin instead of `TAKEN`, does not count `TAKEN`/`SKIPPED` correctly, has no explicit query error state or skip action, and does not render the existing timeline hook. Per scope, no React code was changed.

OLD BACKEND REGRESSION: PASS

Final green runs:

- `npm --prefix backend test`
- root `npm run test:v2`
- isolated PostgreSQL `opd/acceptance.cjs`: 8 acceptance groups
- backend `npm run typecheck`
- root `npm run build` (bundle-size warning only)

These cover OTP/profile activation, staff auth, refresh/logout/session invalidation, RBAC, appointments, queue, triage, consultation, prescriptions/amendments, labs, notifications, admin behavior, and existing stale-state handling.

NEW CARE PLAN TESTS: PASS

`backend/opd/care-plan.test.cjs` passes on SQLite and a fresh disposable PostgreSQL database. `backend/opd/og-pilot.test.cjs` passes through its disposable PostgreSQL runner. Coverage includes creation, all task types, task replacement/deactivation, plan deactivation, stale versions, effective-date conflicts, all derived occurrence states, Patient isolation, Doctor linkage/authority, Nurse access boundaries, Admin denial, timeline equality, audit evidence, reminders, prescription linkage/amendment/rollback, outdated-source rejection, OG restrictions, and PostgreSQL readiness.

SAME POSTGRESQL PROOF: PASS

The final disposable PostgreSQL acceptance followed this path:

```text
Doctor creates Care Plan and tasks
        ↓
Patient retrieves the same tasks
        ↓
Patient records glucose/activity/medication/insulin responses
        ↓
Doctor and authorized Nurse retrieve the same persisted results
        ↓
same PostgreSQL patient/task/response/observation/prescription rows
```

Final synthetic identifiers:

```text
patient_id:                patient-a
care_plan_id:              care-plan-846cfa89-5a37-467f-ac91-96b00a1d39a0
task_series_id:            care-task-series-03ec7405-2f08-4680-8621-7bd4f13532f4
task_revision:             2
occurrence/response_id:    care-response-7a9adedb-21bd-4863-9acc-b40ca5a7fc76
observation_id:            observation-a9b2a718-30a1-41a5-995a-b9a802524bc6
prescription_id:           rx-a
prescription_item_id:      rxitem-8b300cee-cd6e-48e3-b8dc-a64d825d790a
```

Schema relationship:

```text
departments
   └── care_plans
patients
   └── care_plans
          └── care_plan_tasks
                 └── care_plan_adherence
                        └── patient_observations
                               └── patient_observation_components

prescriptions
   └── prescription_items
          └── MEDICATION / INSULIN care_plan_tasks
```

FILES MODIFIED BY CODEX: PASS

- `backend/config.js`
- `backend/database.js`
- `backend/migrations/014_care_plans.js`
- `backend/lib/carePlanSchedule.js`
- `backend/lib/prescriptionItems.js`
- `backend/opd/acceptance.cjs`
- `backend/opd/care-plan.test.cjs`
- `backend/opd/clinical.ts`
- `backend/opd/core.ts`
- `backend/opd/notifications.ts`
- `backend/opd/og-pilot.test.cjs`
- `backend/opd/router.ts`
- `backend/opd/scheduling.ts`
- `backend/package.json`
- `backend/routes/adherence.js`
- `backend/routes/care_plans.js`
- `backend/routes/prescriptions.js`
- `backend/server.js`
- `CARE_PLAN_BACKEND_ACCEPTANCE_REPORT.md`

No iOS, Android, or React file was modified by Codex.

FAILED TESTS: PASS

No final test failure remains. During reconciliation, PostgreSQL exposed an invalid end date when deactivating a plan containing a future task; that transaction was corrected and the regression now passes on both SQLite and PostgreSQL. The OG test package command initially bypassed its required isolated-PostgreSQL wrapper; the script was corrected and its final run passes.

REMAINING BACKEND BLOCKERS: PASS

No backend blocker remains for native iOS contract integration. The Web widget gaps above remain a separate frontend follow-up.

CARE PLAN BACKEND READY FOR IOS: YES
