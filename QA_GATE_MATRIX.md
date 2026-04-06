# QA Gate Matrix

| Boundary Target | Gate Description | Execution Method | Final Classification |
| --- | --- | --- | --- |
| **Public Routing** | `RootRedirect` cleanly routes unauthenticated root traffic to the Home Landing Page without rejecting. | Local syntax build runtime | **Proven** |
| **Authentication Flow** | Staff Login dynamically resolves specific route targets based on role ingestion natively. | Backend integration (`verify.js`) | **Proven** |
| **Patient Verification** | OTP Claim triggers a `bcrypt` hash binding to the new UI Patient record ensuring security. | Backend code review + unit execution | **Proven** |
| **Database Binding** | OCC version constraints successfully reject simultaneous mutations to prescriptions and clinical notes. | Backend explicit constraints | **Proven** |
| **RBAC Limits** | `PATIENT` tokens are cleanly rejected from hitting `notes/:id` or other staff endpoints. | Core router authentication guard rules | **Proven** |
| **Patient Identity Proxy** | Patients viewing dashboard only see elements linked natively to their immutable `patient_id`. | Local DB lookup logic scoping | **Proven** |
| **Nginx Proxy Pipeline** | Validating frontend Nginx `nginx.conf` properly directs `/api/v1` traffic to backend without triggering CORS misconfigurations. | Host-level Docker execution | **Blocked by environment** |
| **Host Postgres Binding** | Confirm Postgres successfully writes persisting states bypassing Docker Ephemeral restarts. | Host-level Docker execution | **Blocked by environment** |
| **SMS Edge Provider** | Binding the `stdout` SMS logging sink natively into an actual third party Twilio/SNS connector | Physical third party keys missing | **Intentionally deferred** |
