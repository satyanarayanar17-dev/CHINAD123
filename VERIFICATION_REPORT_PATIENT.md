# Phase 2 Patient Pipeline Verification Target

## The Objective
Prove that a clinical patient record can be safely bridged into a secure UI login context without bleeding the established Staff Pilot security parameters.

## Signoff Gates
- [ ] **Data Modification Free Flow**: Phase 2 implementation completes without triggering a single regression on the existing `verify.js` staff architecture.
- [ ] **Hard Identity Linkage**: `users.patient_id` perfectly associates with `patients.id`.
- [ ] **Token Expungement**: Generated activation tokens vanish/expire flawlessly after claiming the identity.
- [ ] **Authorization Lockout**: The re-enabled Patient Login component effectively throws 401s on malformed passwords or non-existent UHIDs.
- [ ] **Routing Execution**: Patient Login flawlessly redirects to the `PatientDashboard`.
- [ ] **Data Scoping Enforcement**: A logged in PATIENT mathematically cannot fetch `/api/my/records` containing IDs mapped outside their explicit `patient_id`.
