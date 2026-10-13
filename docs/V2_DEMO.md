# Connected OPD local demonstration

From the project root with Node.js 24 and dependencies installed:

```sh
node backend/opd/demo.cjs
OPD_DEMO_OTP=true DB_DIALECT=sqlite SQLITE_PATH=connected-opd-demo.db npm run dev
```

The first command creates a separate `backend/connected-opd-demo.db`. It ignores inherited `SQLITE_PATH` and database-driver settings to keep the regular development database untouched. Set `OPD_DEMO_DB=/absolute/path/to/another-demo.db` to choose another demo database, then start the application with that exact path as `SQLITE_PATH`.

This seeder refuses production and nonlocal deployment profiles. It creates all patients, appointments, queue transitions, clinical records, prescriptions, laboratory results and audit events through the real API; only initial admin provisioning uses the normal bootstrap helper. There is no destructive reset or direct clinical database write. Demo records are synthetic, with actual creation timestamps. Completed example visits become prior encounters in the shared record; the seeder does not backdate visits or manufacture wait times.

## Sign in

All demo staff share the local demonstration password **`ChettinadDemo2026!`**. Newly provisioned staff complete the required password-change workflow during setup.

| Role | Username | Department |
| --- | --- | --- |
| Reception / Admin | `demo_admin` | All operational queues |
| Doctor | `demo_doctor` | General Medicine |
| Nurse | `demo_nurse` | General Medicine |
| Doctor | `demo_cardiologist` | Cardiology |
| Nurse | `demo_cardio_nurse` | Cardiology |
| Doctor | `demo_paediatrician` | Paediatrics |
| Nurse | `demo_paeds_nurse` | Paediatrics |

Use patient login with one of these mobile numbers. Request an OTP and use the freshly generated development code displayed by the local login screen. There is no fixed OTP, and no SMS is sent in demo mode. OTP requests retain the normal rate limits and 60-second resend interval.

| Patient | Mobile | Initial demo state |
| --- | --- | --- |
| Ananya Raman (Demo) | `9000000001` | General medicine, waiting for triage |
| Karthik Srinivasan (Demo) | `9000000002` | Diabetes, active consultation and saved draft; completed prior visit, prescription and reviewed HbA1c result |
| Vikram Rajan (Demo) | `9000000003` | Cardiology, triaged and waiting for doctor |
| Nila Senthil (Demo) | `9000000004` | Paediatrics, triage in progress; synthetic parent contact |
| Lakshmi Subramanian (Demo) | `9000000005` | Older adult, prioritised and called by doctor |
| Meenakshi Sundaram (Demo) | `9000000006` | Completed consultation, prescription, released haemoglobin result awaiting review and booked follow-up in seven days |

All addresses and contact numbers are demonstration fixtures. Medication instructions and results are examples for product testing, not treatment instructions. The minor's fixture demonstrates the patient workflow; family/dependent account management remains outside MVP scope.

## Suggested walkthrough

1. Sign in as `demo_admin` to see real metrics, bookings and department queues.
2. Use `demo_nurse` to triage Ananya; use `demo_paeds_nurse` to finish Nila's intake.
3. Use `demo_doctor` to complete Karthik's open consultation before starting another General Medicine consultation. His record includes the completed sample visit and reviewed result.
4. Use `demo_cardiologist` to call and consult Vikram.
5. As the administrator, advance the current diabetes laboratory order through collection, processing and verified result release.
6. Use Meenakshi's patient login to inspect her prescription, released result, follow-up appointment and journey timeline. Her result appears in the doctor's pending review work.

Schedules run every day, `00:00–23:59`, in five-minute slots with a `12:00–12:30` break, solely to support local demonstrations at different hours. Slots, conflicts and check-in use the real Asia/Kolkata date rules. In the final minutes of a day there may be too few future slots; setup stops with an explanation and preserves completed work.

Rerunning adds only missing fixtures and resumes incomplete setup. It preserves existing profiles, schedules, progressed queue stages, drafts and signed clinical records. It does not restart visits already completed or cancelled by a tester, renew old visits to today's date, or reset a password changed by a tester. For a fresh walkthrough on a later day, select a new `OPD_DEMO_DB` file. Keep the default demo database local and do not use these credentials in a deployed environment.

Late-night setup: when today has no free slots, the seeder books the next available day. It reports deferred scenarios and does not check in future appointments or fabricate clinical history. Rerun on that appointment date to populate the remaining visits; use a fresh demo database during working hours when a complete live-queue walkthrough is needed.
