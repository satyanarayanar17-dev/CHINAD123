# Doctor-led patient access

Doctors open **Patients → Add patient**, enter the profile and mobile number, and choose whether to enable mobile access. The patient then signs in with that number and an OTP. OTP verification never creates a new profile. Reception registration remains supported, and existing patient access is preserved by migration 019.

**Start visit** creates or resumes an assigned walk-in visit without a booking or availability slot. Identity verification, ownership checks and current revisions remain enforced. Repeated arrival requests return the existing visit. Cancelled visits cannot be checked in.

The doctor adds medicines in the consultation and signs the prescription to share it with the patient. **Care plan, medications & alerts** provides medication alert times, vitals and activity tasks. Medication alerts reference the current signed prescription and can only be configured by its assigned prescribing doctor. Patients and nurses cannot configure medication alerts.

Patients record vitals and activities from Care plan. Each completed assigned task gets a green check, and a nonempty day's plan gets an overall green check only when every assigned occurrence is completed. Skipped, missed, due and upcoming tasks do not count as completed. Doctors see the same stored responses.

Booking controls and follow-up booking controls are removed from patient and staff interfaces. Doctor availability is removed from doctor navigation. Existing visit history and administrator schedule management remain available. Legacy booking API contracts are retained for compatible clients, but updated interfaces do not offer booking.

## API changes

- `POST /opd/patients`: ADMIN or DOCTOR; doctor creation is assigned to the authenticated doctor. `portal_access_enabled` is boolean and defaults to true.
- `GET /opd/patients`: doctors see their registered or visit-linked patients.
- `POST /opd/patients/:id/check-in`: assigned walk-in start/resume, `identity_verified:true`; returns a complete queue model.
- `PATCH /opd/patients/:id/access`: assigned doctor, boolean `portal_access_enabled` and current patient `__v`; disabling access revokes patient sessions.
- OTP verification returns `PATIENT_NOT_REGISTERED` or `PATIENT_ACCESS_DISABLED` after checking the code when access is unavailable.
- Care-plan reads return current prescription items before the first plan is created.

## Validation and rollout

Regression tests cover doctor assignment, mobile access and revocation, concurrent OTP/access removal, role boundaries, cancelled visits, pending arrivals and safe retries on SQLite and PostgreSQL. Native Android and iOS clients share a disposable backend with the web doctor screen to verify profile, prescription and completed-task consistency.

The current free Render demo uses temporary SQLite storage. A new deployment replaces that storage and needs explicit approval to discard current demo records. Backend and web must be updated before installing version 1.4 mobile apps. Physical Android testing remains pending because no Android phone is connected.
