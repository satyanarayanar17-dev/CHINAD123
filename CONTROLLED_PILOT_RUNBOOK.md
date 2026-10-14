# Chettinad Care controlled OBST pilot release

This release implements a connected patient, reception, nurse, doctor and administrator workflow. The existing public Render services and the Debug iOS builds remain synthetic demonstrations. Real patient use requires the acceptance gates below; a successful demo deployment does not close them.

## Deployment choices

`render-sqlite.yaml` refreshes the existing free demo, using ephemeral SQLite and documents. It is unsuitable for patient retention. Startup only seeds an empty local development database; populated databases are preserved. Demo accounts and phone numbers are synthetic.

`render-pilot.yaml` and the canonical `render.yaml` describe separate paid Singapore resources: PostgreSQL 16, an API with a 5 GB private disk and a static frontend. They do not replace the demo. The estimated infrastructure floor is $14.55/month before tax, SMS, independent backup storage and any additional environments. Provisioning requires an approved spend cap and approved location. Verify the actual allocated hostnames, then update CORS, CSP, VITE_API_BASE_URL and both iOS backend settings together. Auto-deploy is off. No seed or reset runs in the pilot.

Keep real credentials only in provider secret management. Set a unique JWT secret, hospital bootstrap administrator and a separate random 64-character hexadecimal BACKUP_ENCRYPTION_KEY. Store that key separately from archives in a hospital-managed secret vault with a recovery owner. Never commit provider keys, databases, documents or backup archives.

The API refuses locked startup without PostgreSQL, persistent private storage, an encryption key, explicit OTP delivery, HTTPS CORS and secure cookies. Readiness requires migration/schema correctness, a writable private directory and a recent successful encrypted recovery snapshot. `/api/v1/health` and `/api/v1/ready` report the running commit and Node version. Monitor readiness and failed backups; treat failure as an operational incident. Render private PostgreSQL uses encrypted internal TLS with its private self-signed endpoint; internet databases retain certificate and hostname verification. TRUST_PROXY=1 is scoped to Render ingress; elsewhere configure verified proxy CIDRs.

## Connected record contracts

The machine-readable contract is `backend/opd/openapi.json`. All mutable workflows require the correct resource version. Queue `__v`, clinical-note `__v` and root `patient__v` are distinct. A conflict requires refetch and explicit review; do not blindly retry a sign or mutation.

- Patient login requests a PATIENT_LOGIN challenge; verify using its challenge_id, phone, expiry and code. Resend observes the server cooldown. Registration requires confirmed demographics; the app does not assume a date of birth. Production does not return OTP values.
- Patient profile edits use PATCH `/opd/patients/:id` with `{data, __v}`. Cancellation uses POST `/opd/appointments/:id/cancel`. Profile edits merge partial demographics. Phone replacement requires a separate verified process and is blocked here.
- Triage uses queue __v. Omitted allergies preserve existing text. Explicit review requires allergy_review_confirmed=true and current patient__v; changed allergies/status require allergy_change_reason. UNKNOWN and NONE_REPORTED are different. Amendments require a reason and preserve earlier versions.
- Consultation drafts use the current note __v. Complete/amend also send current patient__v. Signing checks the patient record and stores an immutable patient identity/allergy snapshot with the prescription digest. Amendments append attributed versions. The digest is integrity evidence, not a certificate-backed digital signature.
- ADMIN transfer uses POST `/opd/encounters/:id/reassign` with doctor_id, current queue __v and an acceptance/reason. It permits only unstarted visits within the same department and an available doctor. Any note, lab order or started consultation blocks transfer.
- Nurses access department lab orders; doctors access assigned orders; patients see released results only. ADMIN receives workflow status with clinical result content removed. Lab results carry structured values, verification, release and review attribution. Corrections retain prior versions.

Before each clinical action, verify patient name, MRN, DOB and encounter. Native clinical drafts are protected and keyed to the actor, patient and encounter. Recover only while signed into that same account. Review conflicts before choosing the latest server record or keeping local work. A lost signing response is reconciled against the saved server version and content.

## Recovery and rollback

The API creates a compressed AES-256-GCM encrypted snapshot at locked startup and daily, retaining seven local copies under PERSISTENT_DATA_ROOT/backups. Snapshots include a consistent PostgreSQL view, schema fingerprint, referenced private documents and file hashes. Local copies share the API disk failure domain. A hospital-approved independent encrypted copy destination and an accountable daily check are mandatory before real patient use. Retain the encryption key separately.

Create an on-demand snapshot from the backend directory, with provider-managed runtime secrets already loaded:

```sh
node scripts/pilot-backup.cjs create /var/data/backups/manual-unique.ccbackup
```

Restore only to a new, empty isolated database and empty private-file directory, migrated using the exact release schema. Set the target DATABASE_URL and PATIENT_DOCUMENT_STORAGE_PATH, keep outbound messaging disabled, then explicitly set RESTORE_CONFIRM_EMPTY=true:

```sh
node scripts/pilot-backup.cjs restore /secure-recovery/source.ccbackup
```

Restore refuses populated targets, mismatched schema, damaged archives and the wrong key. Do not overwrite the live database. It revokes restored sessions, consumes old OTP challenges and cancels unsent messages to prevent replay. Verify patient IDs/MRNs, versions, signed content, document hashes and counts before switching the application. If commit acknowledgement is uncertain, inspect the isolated target and promoted files before retrying.

For rollback: stop new clinical writes, take an encrypted snapshot, preserve the current private disk and database, and redeploy the previous recorded commit only if it is compatible with the migrated schema. Migrations 017/018 are additive; do not drop tables/columns to undo a release. If compatibility is uncertain, restore the snapshot into a new isolated environment and verify before redirecting users. Never run demo reset or seed commands against a pilot.

## Release verification

Run browser build, backend type checking, lint and both dependency audits. Browser clinical, security, print/mobile and localization suites must run sequentially because they use isolated fixtures and evidence directories. Run backend pilot-safety tests, SQLite/PostgreSQL acceptance, encrypted restore, locked-startup and non-destructive demo-seed tests. The restore test uses throwaway local databases only. Native acceptance uses the actual nurse and doctor view models against an isolated backend, plus version, OTP, account-switch and PDF tests. Physical demo UI smoke tests verify patient login/records and staff admin overview on the named phone.

Staging/Release iOS builds require a matching environment, verified owned HTTPS origin and CC_PILOT_ENDPOINT_APPROVED=YES. Debug builds are visibly labelled Demo. This flag records operator verification; it must not be enabled for a guessed or unprovisioned hostname. Both apps must use the same tested API release.

## Hospital and provider acceptance gates

Before admitting real patients, obtain and record: approved hosting spend/location and access owners; successful restart/persistence proof on the paid deployment; independent encrypted backup copy and restore drill; actual MSG91/DLT template approval and handset OTP receipt; reminder provider/template approval before enabling its worker; clinician approval of catalogues and any scoring protocol; a named nurse/doctor review of allergy and lab amendment workflows; clinical review of English/Tamil/Telugu terminology; a printed multi-page prescription from the actual hospital printer; and physical nurse/doctor handover acceptance. Native localization currently covers 56 shared interface strings, not every clinical screen. Clinician-authored text remains in its original language.

CLINICAL_RULES_APPROVED defaults to false. To enable automated scoring or medication hard blocks, first approve the algorithm and record CLINICAL_PROTOCOL_VERSION. Software tests do not constitute clinical approval. Begin with a small, supervised OBST roster, a documented paper fallback, named support contact and stop criteria for wrong identity, missing documents, signing/version conflicts or failed recovery.
