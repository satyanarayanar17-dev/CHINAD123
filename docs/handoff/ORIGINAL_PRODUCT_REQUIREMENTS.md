# Chettinad Care v2

## India Connected OPD — Product Requirements Document

### 1. Product Objective

Chettinad Care v2 will be a digital OPD and patient-experience platform for Indian hospitals.

The MVP must connect the complete outpatient journey across four users:

**Patient → Reception/Admin → Nurse → Doctor**

The system succeeds only when a patient can complete the entire journey from registration through consultation, investigation, prescription and follow-up without staff maintaining disconnected records.

---

# 2. MVP Scope

The MVP contains exactly seven core capabilities:

1. Patient registration and authentication
2. Appointment booking
3. Hospital check-in and live queue
4. Nurse triage
5. Doctor consultation
6. Digital prescription and longitudinal patient record
7. Basic laboratory ordering and results

A shared **Patient Journey Timeline** connects all seven.

Everything outside this scope is deferred unless required for security, auditability or the core workflow.

---

# 3. User Roles

## Patient

Primary capabilities:

* Register/login
* Manage personal profile
* Find doctors and departments
* Book appointments
* Reschedule/cancel appointments
* Check in
* View token and queue status
* Follow live visit journey
* View prescriptions
* View laboratory orders/results
* View previous visits
* View follow-up appointments

## Reception / Admin

Primary capabilities:

* Search/create patients
* Verify patient identity
* Book appointments
* Modify appointments
* Check patients in
* Generate/manage queue tokens
* View doctor schedules
* View department queues
* View basic OPD dashboard
* Resolve basic patient-flow issues

## Nurse

Primary capabilities:

* View assigned/waiting patients
* Open triage
* Record vitals
* Record chief complaint
* Record allergies
* Record pain score
* Add brief triage notes
* Mark triage complete
* Send patient to doctor queue

## Doctor

Primary capabilities:

* View today's patients
* View waiting patients
* Open patient summary
* Review triage
* View previous encounters
* Conduct consultation
* Record diagnosis
* Create prescriptions
* Order laboratory tests
* Set follow-up
* Complete encounter
* Review returned laboratory results

---

# 4. Core Patient Journey

The primary workflow is:

Patient registers
→ selects department/doctor
→ books appointment
→ arrives at hospital
→ checks in
→ receives queue token
→ waits
→ nurse performs triage
→ doctor receives patient
→ doctor records consultation
→ doctor adds diagnosis
→ doctor creates prescription
→ doctor optionally orders laboratory tests
→ consultation completes
→ patient receives prescription
→ laboratory results become available
→ patient and doctor can view results
→ follow-up can be scheduled.

Every important action creates an event on the Patient Journey Timeline.

---

# 5. Patient Registration

## Required patient information

* Internal patient ID
* MRN
* Full name
* Date of birth
* Gender
* Mobile number
* Email, optional
* Address
* City
* State
* PIN code
* Emergency contact
* Preferred language
* Existing hospital MRN, if applicable

Future-ready fields may include ABHA identifiers but ABDM integration is not required for MVP launch.

## Authentication

MVP:

* Mobile number
* OTP
* Session management
* Secure logout
* Device/session revocation

Staff authentication must be separate from patient authentication.

---

# 6. Appointment System

## Patient experience

Patient selects:

Department
→ Doctor
→ Date
→ Available slot
→ Confirm appointment.

Appointment states:

* Booked
* Confirmed
* Checked in
* In queue
* Triage
* With doctor
* Completed
* Cancelled
* No-show

Patient can:

* View upcoming appointments
* View previous appointments
* Cancel
* Reschedule

## Staff experience

Staff can:

* Search appointment
* Create appointment
* Reschedule
* Cancel
* Mark no-show
* Check patient in

## Doctor scheduling

Each practitioner requires:

* Working days
* Session times
* Slot duration
* Break periods
* Leave/unavailability
* Department
* Consultation room

Double booking must be prevented unless an authorized staff workflow explicitly permits it.

---

# 7. Check-In

Patient can check in through reception initially.

Later versions can add QR/self-check-in.

At check-in:

Appointment is validated
→ patient details confirmed
→ visit created
→ queue token generated
→ patient enters department queue.

Example:

**CARD-042**

The check-in timestamp becomes part of operational analytics.

---

# 8. Queue Management

Queue management is a P0 feature.

Each queue entry contains:

* Patient
* Encounter
* Department
* Doctor
* Token
* Check-in time
* Current status
* Queue position
* Estimated wait
* Priority
* Triage state

## Patient view

Display:

**Token:** CARD-042
**Patients ahead:** 3
**Estimated wait:** 18 minutes
**Doctor:** Dr. X
**Room:** OPD 12

Statuses:

Waiting
→ Triage
→ Waiting for Doctor
→ Doctor Ready
→ Consultation
→ Completed.

## Staff view

Reception sees all queues.

Nurse sees patients requiring triage.

Doctor sees patients ready for consultation.

---

# 9. Nurse Triage

The MVP triage form contains:

### Vitals

* Temperature
* Blood pressure
* Pulse
* SpO₂
* Weight
* Height
* BMI calculated automatically
* Blood glucose, optional

### Clinical information

* Chief complaint
* Allergies
* Pain score
* Brief notes

The system records:

* Nurse
* Timestamp
* Values
* Amendments

When complete:

**Send to Doctor**

The patient's queue state automatically changes.

---

# 10. Doctor Command Center

Doctor dashboard prioritizes today's clinical work.

Display:

* Today's appointments
* Waiting patients
* Patients triaged
* Patients currently in consultation
* Completed encounters
* Results requiring review

Each patient row should show:

Name
Age
Gender
Token
Appointment time
Wait time
Triage status.

---

# 11. Consultation Workspace

A consultation should primarily occur within one screen.

## Patient header

Always visible:

* Name
* Age
* Gender
* MRN
* Allergies
* Important alerts

## Patient summary

Display:

* Chief complaint
* Current vitals
* Previous encounters
* Active medications
* Recent prescriptions
* Recent laboratory results

## Consultation fields

Doctor records:

### History

* Presenting complaint
* Clinical history
* Relevant previous history

### Examination

* Findings
* Notes

### Assessment

* Clinical impression

### Diagnosis

One or more diagnoses.

For MVP, hospital-configured diagnosis search is sufficient. Formal terminology integration can follow.

### Plan

* Treatment
* Advice
* Laboratory tests
* Prescription
* Follow-up

The encounter cannot be silently overwritten after completion.

Amendments require attribution.

---

# 12. Digital Prescription

A prescription contains:

* Doctor
* Patient
* Encounter
* Date/time
* Diagnosis/reference
* Medicines
* Advice
* Follow-up
* Digital validation metadata

Each medication item contains:

* Drug
* Strength
* Form
* Dose
* Frequency
* Duration
* Route
* Instructions

Example:

**Paracetamol — 500 mg**
1 tablet
Twice daily
3 days
Oral
After food

MVP medication selection uses a controlled hospital drug catalogue rather than unrestricted free-text wherever practical.

Patient can:

* View prescription
* Download printable prescription
* View previous prescriptions

---

# 13. Laboratory Orders

Doctor can create laboratory orders from the consultation.

MVP flow:

Ordered
→ Sample Collected
→ Processing
→ Result Available
→ Reviewed.

Laboratory test catalogue contains:

* Test name
* Code
* Department
* Unit where applicable
* Reference-range configuration where applicable

MVP can support manual result entry or structured mock integration before implementing a full LIS interface.

---

# 14. Laboratory Results

Results must retain:

* Test
* Value
* Unit
* Reference range
* Flag
* Result timestamp
* Entered/received by
* Verification status

Possible flags:

Normal
High
Low
Critical.

The UI must never communicate criticality using color alone.

Doctor can mark:

**Reviewed**

Patient can view released results.

---

# 15. Patient Health Record

Patient portal contains:

## Visits

Chronological consultations.

## Prescriptions

Current and previous prescriptions.

## Laboratory

Orders and results.

## Appointments

Past and upcoming.

## Documents

Clinical documents added later.

This becomes the foundation of the longitudinal patient record.

---

# 16. Patient Journey Timeline

Every patient encounter generates timeline events.

Example:

09:51 — Checked in
09:52 — Token CARD-042 issued
10:07 — Triage started
10:11 — Triage completed
10:24 — Consultation started
10:36 — CBC ordered
10:38 — Prescription issued
10:40 — Consultation completed
11:02 — Sample collected
12:14 — CBC result available.

The timeline must derive from actual system events rather than manually entered status text.

---

# 17. Admin Dashboard

MVP dashboard should remain operational rather than becoming a generic BI dashboard.

Display:

### Today

* Appointments
* Checked-in patients
* Waiting
* In triage
* In consultation
* Completed
* No-shows
* Average waiting time

### Department performance

* Patient count
* Current queue
* Average wait
* Longest wait

### Doctor workload

* Appointments
* Waiting
* Completed
* Average consultation time

Real-time operational usefulness takes priority over decorative charts.

---

# 18. Notifications

MVP events:

* Appointment confirmed
* Appointment changed
* Appointment reminder
* Check-in confirmation
* Queue progress
* Doctor ready
* Prescription available
* Lab result available
* Follow-up reminder

First channels:

* In-app
* SMS

WhatsApp can be added when the messaging integration and consent model are ready.

---

# 19. Languages

Initial UI architecture must support localization.

Initial language priorities:

1. English
2. Tamil
3. Telugu

Do not embed English strings directly throughout components.

All user-facing copy should pass through an internationalization layer.

---

# 20. Accessibility

Target:

**WCAG 2.2 AA**

Required from the beginning:

* Keyboard-accessible UI
* Correct form labels
* Semantic headings
* Visible focus
* Accessible validation
* Sufficient contrast
* Touch target sizing
* Screen-reader names
* No color-only statuses
* Accessible dialogs
* Accessible tables
* Zoom/reflow support

Accessibility will be treated as an engineering requirement rather than a later audit exercise.

---

# 21. Security Requirements

MVP must include:

* Secure authentication
* Password/OTP protections
* Role-based authorization
* Least-privilege access
* Secure cookies/tokens
* TLS in production
* Encryption at rest
* Audit logging
* Rate limiting
* Session expiration
* Sensitive-field protection
* Input validation
* Output encoding
* Secrets outside source control

Doctors must not gain administrative privileges merely because they are clinical users.

Nurses should access only workflows relevant to their assigned environment.

---

# 22. Audit Trail

Audit events required for:

* Login
* Patient creation
* Patient record access
* Appointment changes
* Check-in
* Triage changes
* Encounter access
* Encounter completion
* Diagnosis changes
* Prescription creation/amendment
* Lab-order creation
* Result creation/amendment
* Staff permission changes

Audit data must include:

Actor
Action
Resource
Patient where applicable
Timestamp
Outcome
Relevant context.

Clinical records should be versioned instead of destructively overwritten.

---

# 23. Core Database Domains

Initial entities:

users
roles
permissions
staff_profiles
patients
patient_identifiers
departments
practitioners
practitioner_schedules
appointments
check_ins
queue_entries
encounters
triage_records
vitals
diagnoses
prescriptions
prescription_items
lab_test_catalog
lab_orders
lab_results
follow_ups
notifications
audit_events.

Schema implementation details remain an architecture task rather than being finalized inside the product PRD.

---

# 24. Technical Direction

## Frontend

React
TypeScript
Vite
TanStack Query
React Hook Form
Zod
Tailwind
accessible design-system primitives.

## Backend

Node.js
TypeScript
REST API
OpenAPI documentation.

Logical modules:

auth
patients
staff
departments
appointments
queues
triage
encounters
prescriptions
labs
notifications
audit.

## Data

PostgreSQL.

Redis may be introduced for queue/cache/session requirements where justified.

Object storage will be used later for clinical documents.

---

# 25. Environments

At minimum:

Development
Staging
Production.

Production data must never be copied directly into developer machines.

Use synthetic patients for development and demonstrations.

---

# 26. Synthetic Demo Dataset

Create realistic demo patients representing:

* General medicine
* Diabetes
* Cardiology
* Paediatrics
* Elderly patient
* Follow-up patient

Include appointments, historical encounters, vitals, prescriptions and laboratory results.

No real patient data should be required to demonstrate the platform.

---

# 27. P0 Features

The product cannot be considered MVP-complete without:

Patient login
Staff login
RBAC
Patient registration
Doctor/department directory
Doctor schedules
Appointment booking
Check-in
Queue/token management
Triage
Doctor consultation
Diagnosis
Prescription
Lab ordering
Lab results
Patient Journey
Patient records
Admin operational dashboard
Audit trail.

---

# 28. P1 After MVP

Immediately following a stable MVP:

* QR/self-check-in
* Family/dependent accounts
* WhatsApp notifications
* Better medication catalogue
* Appointment waitlist
* Doctor leave management
* Result trends
* Printable clinical summaries
* Advanced search
* ABHA-ready patient identity
* Basic billing/payment
* Doctor result inbox
* Better operational analytics

---

# 29. Explicitly Out of Scope

For this version:

IPD
ICU
Bed management
OT
Blood bank
Pharmacy inventory
Procurement
Payroll
Insurance claims
Full billing/RCM
Ambulance
Telemedicine
Advanced ABDM exchange
AI diagnosis
Clinical decision-making AI
International compliance
Global country packs
Medical-device integration
Research infrastructure.

These features require a separate scope decision.

---

# 30. MVP Acceptance Scenario

The release is accepted only when the following works end-to-end:

A new patient registers.

The patient books an appointment with a configured doctor.

Reception can see the appointment.

The patient arrives.

Reception checks the patient in.

A queue token is generated.

The patient sees their queue status.

The nurse sees the patient.

The nurse records vitals and triage information.

The patient moves to the doctor's queue.

The doctor sees the triage information.

The doctor opens the consultation.

The doctor records history, examination, assessment and diagnosis.

The doctor orders a laboratory test.

The doctor creates a prescription.

The doctor schedules a follow-up.

The encounter is completed.

The patient sees the prescription.

Laboratory staff/result workflow supplies the result.

The patient sees the released result.

The doctor sees the result.

Every significant action appears in the patient's journey and audit trail.

If any part requires manual database modification, fake UI state, hardcoded patient data or disconnected duplicate records, MVP acceptance fails.

---

# 31. Product Quality Standard

The application should feel like a real hospital system rather than a portfolio dashboard.

That means:

* No dead buttons
* No fake metrics
* No placeholder pages
* No hardcoded clinical records
* No inconsistent navigation
* No broken role permissions
* No duplicate data models
* No inaccessible forms
* No unexplained error screens
* No silent failures
* No clinical action without audit attribution

Every visible capability must actually work.

---

# 32. Definition of v2 MVP

**Chettinad Care v2 MVP = a production-oriented Connected OPD platform in which Patient, Reception, Nurse and Doctor operate on one shared patient journey and one consistent clinical record.**

The north-star workflow is:

**Appointment → Check-in → Queue → Triage → Consultation → Investigation → Prescription → Result → Follow-up.**

That workflow is now the scope boundary for the restart.
