# Synthetic OBST demonstration

The deployed demo and Debug iOS apps use synthetic details only. Free Render storage is ephemeral. Do not enter real patient data.

To seed a separate local database, choose explicit isolated paths:

```sh
APP_ENV=local_dev NODE_ENV=development DB_DIALECT=sqlite SQLITE_PATH=/absolute/demo/demo.db PATIENT_DOCUMENT_STORAGE_PATH=/absolute/demo/documents node backend/opd/demo.cjs
APP_ENV=local_dev NODE_ENV=development DB_DIALECT=sqlite SQLITE_PATH=/absolute/demo/demo.db PATIENT_DOCUMENT_STORAGE_PATH=/absolute/demo/documents OPD_DEMO_OTP=true OTP_DELIVERY_PROVIDER=development npm run dev
```

The seeder honors SQLITE_PATH, refuses locked environments and preserves any populated database. It uses the real APIs for staff password change, booking, confirmation, check-in and valid private PDF upload. It does not fabricate signed consultations or lab results. Browser and native acceptance suites use richer separate fixtures.

## Sign-in

All synthetic staff use `ChettinadDemo2026!`:

| Role | Username |
| --- | --- |
| Reception/admin | admin |
| OBST doctor | dr_prabha |
| OBST doctor | dr_sailatha |
| OBST nurse | demo_nurse |

Patient mobile `9000000001` opens Ananya Demo (DOB 1995-06-15). Request a challenge and enter the development code shown by the demo login. Production never returns a code. The record contains a real private synthetic PDF. Schedules use five-minute daily slots solely for testing. After-hours seeding may book the following day.

Reception can inspect the overview and checked-in visit; the nurse can record synthetic intake and explicitly review allergies; the assigned doctor can start, save, recover and complete a synthetic consultation. The patient then sees the finalized prescription. Configure and exercise synthetic lab results only through the lab workflow. No demo catalogue or medication instruction constitutes treatment advice.

See CONTROLLED_PILOT_RUNBOOK.md before preparing a real hospital pilot.
