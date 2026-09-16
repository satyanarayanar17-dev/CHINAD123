You are acting as the **final QA engineer, senior full-stack engineer, accessibility tester, localization tester, and release engineer** for the **Chettinad Care hospital platform**.

Your job is NOT to merely review the code.

You must **run the application, use it through the browser like a real hospital user, identify problems, fix them, retest them, capture screenshots from the actual test runs, and leave the project in the strongest release-ready state possible.**

Treat this as the **final browser-testing and release-readiness pass before hospital deployment**.

---

# PRIMARY OBJECTIVE

Complete the remaining release work across:

1. Full browser-based end-to-end testing
2. Bug fixing
3. Desktop layout verification
4. Mobile and tablet responsive verification
5. Prescription creation and printing
6. Tamil localization
7. Telugu localization
8. Role-based permissions
9. Clinical workflows
10. Authentication/session handling
11. Error handling
12. Browser compatibility
13. Documentation verification
14. Clean-install/setup verification
15. Screenshot-based QA evidence
16. Final release-readiness assessment

The application should be treated as a real internal hospital platform, not a demo.

---

# IMPORTANT RULE

Do not claim that anything works unless you personally tested it.

For every important workflow:

**RUN → OBSERVE → SCREENSHOT → FIX IF REQUIRED → RETEST → SCREENSHOT FINAL STATE**

Never write things such as:

* "This should work."
* "The code appears correct."
* "Likely functional."
* "Looks responsive from the CSS."

You must actually verify it in the running application.

If something cannot be tested because an external service is unavailable, clearly classify it as:

**BLOCKED — EXTERNAL CONFIGURATION REQUIRED**

Do not fabricate a successful result.

---

# PHASE 1 — START THE PROJECT FROM A CLEAN STATE

Before testing:

1. Read the project README and setup documentation.
2. Inspect the frontend and backend structure.
3. Identify required environment variables.
4. Identify database setup/migrations/seeding.
5. Identify test/demo accounts.
6. Identify all available roles.
7. Check whether any stale processes or databases could contaminate testing.
8. Start the backend.
9. Start the frontend.
10. Verify that both start without unexplained errors.

Also test a reasonably clean setup process where possible.

Record:

* Commands used
* Node/package manager versions if relevant
* Required environment variables
* Database initialization steps
* Frontend URL
* Backend/API URL
* Any warnings/errors
* Any undocumented setup requirements

If documentation is wrong or incomplete, **fix the documentation**.

---

# PHASE 2 — DEFINE THE APPLICATION TEST MATRIX

Identify all major roles and workflows.

At minimum verify:

### Authentication

* Login
* Logout
* Invalid credentials
* Empty inputs
* Password visibility if implemented
* Session persistence
* Expired session behavior
* Refresh token behavior if implemented
* Unauthorized access attempts
* Protected route redirects
* Direct URL access
* Browser refresh on protected pages

### Doctor

Test the complete doctor workflow including:

* Doctor login
* Doctor dashboard / command center
* Patient queue
* Opening patient record
* Patient dossier
* Previous clinical information
* Clinical note editor
* Saving notes
* Editing notes
* Draft behavior
* Concurrent/draft protections where implemented
* Creating prescription
* Editing prescription
* Adding/removing medicines
* Dosage fields
* Frequency
* Duration
* Instructions
* Diagnosis / clinical notes if included
* Finalizing prescription
* Printing prescription
* Logging out

### Nurse

Test:

* Nurse login
* Triage workflow
* Patient queue
* Selecting patient
* Recording vitals
* Validation
* Submitting triage
* Updating triage where allowed
* Permission restrictions
* Hand-off to doctor workflow

### Admin

Test:

* Admin login
* Admin dashboard
* Staff management
* User activation/deactivation
* Role handling
* Patient/staff records where applicable
* Audit-related UI
* Administrative restrictions
* Unauthorized actions
* Persistence after browser refresh

### Patient

Test:

* Patient login
* Patient dashboard/portal
* Viewing own information
* Viewing appointments if implemented
* Viewing prescriptions if implemented
* Viewing clinical information allowed to patients
* Trying to access another patient's information
* Mobile patient experience
* Logout

---

# PHASE 3 — RBAC AND SECURITY TESTING

Verify role-based access control from the browser.

Attempt actions users should NOT be permitted to perform.

Examples:

* Patient opening admin route
* Nurse opening admin route
* Patient attempting doctor routes
* Doctor attempting privileged admin functions
* Changing IDs in URLs
* Changing patient IDs
* Opening protected URLs directly
* Refreshing protected URLs
* Attempting API-backed actions from unauthorized UI state

Confirm that access is denied securely.

Also verify:

* Break-glass workflow if implemented
* Audit logging if implemented
* Session expiry
* Login rate limits if practically testable
* No sensitive token visibly leaking into the UI
* No obvious credentials embedded in frontend output

Do NOT perform destructive or unsafe penetration testing.

---

# PHASE 4 — FULL DESKTOP BROWSER QA

Run the application in the primary supported browser.

Preferably test at least:

* Chrome / Chromium
* Edge or another Chromium browser if available
* Safari/WebKit if available

Test common desktop resolutions such as approximately:

* 1920×1080
* 1440×900
* 1366×768

Check:

* Header
* Sidebar
* Navigation
* Tables
* Forms
* Dialogs
* Modals
* Dropdowns
* Search fields
* Long patient names
* Long medication names
* Empty states
* Error states
* Loading states
* Scroll behavior
* Sticky elements
* Overflow
* Text truncation
* Form alignment
* Button visibility
* Toasts/alerts
* Browser back/forward navigation

Fix issues rather than simply listing them whenever the cause is within this repository.

---

# PHASE 5 — MOBILE AND TABLET TESTING

This is mandatory.

Use browser responsive/device emulation and test representative widths.

At minimum:

### Mobile

* 320×568
* 360×800
* 375×812
* 390×844
* 412×915

### Tablet

* 768×1024
* 820×1180

Also test landscape orientation where useful.

Test every major workflow on mobile, particularly:

* Login
* Navigation
* Patient portal
* Doctor patient view
* Nurse triage
* Forms
* Tables
* Prescription builder
* Modal windows
* Buttons
* Dropdowns
* Alerts
* Long text

Look for:

* Horizontal scrolling
* Content cut off
* Overlapping controls
* Tiny touch targets
* Buttons outside viewport
* Modals larger than screen
* Tables that become unusable
* Text wrapping problems
* Broken navigation
* Hidden actions
* Keyboard/input issues
* Footer/header collisions

**Fix responsive problems and retest them.**

Take screenshots demonstrating the corrected mobile experience.

---

# PHASE 6 — PRESCRIPTION WORKFLOW

This requires a particularly thorough test because prescription printing is clinically important.

Create a realistic test prescription.

Test:

* Patient information
* Doctor information
* Hospital information
* Date
* Diagnosis
* Medication
* Strength
* Dose
* Route if implemented
* Frequency
* Duration
* Instructions
* Multiple medications
* Long medication name
* Long instruction
* Empty/optional fields
* Save
* Edit
* Print

Verify that clinical information remains correct between:

**Prescription Builder → Saved Prescription → Print Preview → Printed/PDF Output**

There must be no accidental truncation or missing fields.

---

# PHASE 7 — PRESCRIPTION PRINTING

Actually trigger browser print preview.

Inspect the print layout.

Verify:

* A4 formatting
* Margins
* Hospital header
* Patient details
* Doctor details
* Prescription date
* Medication table/list
* Instructions
* Signature area if implemented
* Footer
* Page breaks
* No clipped text
* No hidden medicine rows
* No unnecessary navigation/sidebar
* No buttons in print output
* No dark-mode print background
* Legible font size
* Long prescriptions spanning multiple pages
* Print scaling
* Correct alignment

Test at least:

1. One-medication prescription
2. Multi-medication prescription
3. Prescription with long medication/instructions
4. Prescription that extends beyond one printed page if feasible

Fix print CSS where necessary.

Take a screenshot of the **actual browser print preview**.

If possible, also save a test PDF output for internal QA purposes.

Do not include fabricated medical data from real patients. Use clearly fake QA patient data.

---

# PHASE 8 — TAMIL LOCALIZATION

Perform a complete Tamil localization review.

Do not merely confirm that a translation file exists.

Actually switch the application into Tamil and use the interface.

Check all major screens for:

* Missing Tamil translations
* English text accidentally left behind
* Translation keys displayed to the user
* Incorrect fallback behavior
* Incorrect terminology
* Truncated Tamil text
* Button width
* Table headings
* Forms
* Modals
* Validation errors
* Toast notifications
* Navigation
* Empty states
* Error states
* Confirmation dialogs
* Login
* Doctor workflow
* Nurse workflow
* Patient workflow
* Admin workflow
* Prescription workflow

Check that Tamil Unicode renders correctly.

Do not translate:

* Patient-entered clinical data automatically
* Medication names where inappropriate
* Technical IDs
* Codes
* Medical abbreviations that should remain standard

Keep clinical terminology understandable and professional.

Fix missing translation coverage.

Capture screenshots of major Tamil screens.

---

# PHASE 9 — TELUGU LOCALIZATION

Repeat the same full review for Telugu.

Check:

* Complete translation coverage
* Rendering
* Layout expansion
* Buttons
* Tables
* Forms
* Modals
* Alerts
* Validation messages
* Navigation
* Clinical workflows
* Prescription interface
* Mobile layout

Fix missing or broken translations.

Capture screenshots of major Telugu screens.

---

# PHASE 10 — LANGUAGE SWITCHING

Test:

English → Tamil
Tamil → Telugu
Telugu → English

Verify:

* No reload loop
* Current page remains usable
* Layout does not break
* Language choice persists where intended
* Missing keys correctly fall back
* No raw localization keys appear

Test language switching on desktop and mobile.

---

# PHASE 11 — NEGATIVE AND EDGE-CASE TESTING

Attempt realistic failure cases.

Examples:

* Empty required fields
* Invalid values
* Very long patient names
* Long clinical notes
* Long prescription instructions
* Rapid double-click submissions
* Browser refresh while editing
* Browser back button
* Closing modal without saving
* Invalid route
* API temporarily unavailable
* Backend restart
* Session expiry
* Duplicate submissions
* No patients in queue
* No prescriptions
* Empty dashboard data
* Network error if practical

Ensure the UI fails gracefully.

No blank white screen should occur.

---

# PHASE 12 — BROWSER CONSOLE AND NETWORK REVIEW

During testing inspect:

### Browser console

There should be no unexplained:

* React errors
* Unhandled promise rejections
* Missing keys
* 404 asset errors
* CSP problems
* Localization errors
* Runtime exceptions

### Network

Look for:

* Failed API calls
* Repeated calls
* Authentication loops
* 401 loops
* 403 errors where unexpected
* 500 errors
* Incorrect payloads
* Obviously unnecessary duplicate requests

Fix issues within the application's control.

---

# PHASE 13 — PERFORMANCE SANITY CHECK

This is not a full performance audit, but check obvious problems.

Verify:

* Pages do not repeatedly refetch unnecessarily
* Large components are not visibly freezing
* Forms respond quickly
* Navigation feels responsive
* Dashboard loads correctly
* No major memory/runtime errors appear during normal testing

Fix obvious regressions where reasonable.

---

# PHASE 14 — SETUP DOCUMENTATION VERIFICATION

Do not merely proofread the README.

Follow the documented installation process as if you are a new engineer joining the project.

Verify that the documentation correctly explains:

* Requirements
* Repository structure
* Frontend setup
* Backend setup
* Environment variables
* Database initialization
* Seeding
* Test accounts
* How to run frontend
* How to run backend
* Ports
* Development URLs
* Production configuration
* Build command
* Production start process
* Troubleshooting
* Localization
* Prescription printing considerations
* Database backup/migration considerations where relevant

Correct anything inaccurate or incomplete.

The goal is that another engineer can clone/open the project and run it without guessing.

---

# PHASE 15 — EXTERNAL DEPLOYMENT DEPENDENCIES

The live hospital deployment has two important dependencies that may not be available locally.

## A. Hospital SMS service

Identify exactly what configuration will be required for production SMS integration.

Document:

* SMS provider/API dependency
* Required credentials
* Environment variables
* Sender ID/template IDs if applicable
* OTP/message flow
* Error handling
* Development/mock fallback
* How to perform a production smoke test

If hospital SMS credentials are not available:

Mark:

**BLOCKED — HOSPITAL SMS CREDENTIALS / SERVICE CONFIGURATION REQUIRED**

Do not claim SMS is production verified.

Internal code and mocked/local behavior may still be tested.

## B. Hosting / production infrastructure

Identify exactly what production hosting requires.

Document:

* Frontend host requirements
* Backend host requirements
* Database
* Persistent storage
* Domain/subdomain
* SSL/TLS
* CORS
* Reverse proxy
* Environment variables
* Secrets
* Database migrations
* Backups
* Logging
* Monitoring
* Health checks
* Restart policy
* Production build/start commands

If final hospital hosting credentials or infrastructure are unavailable:

Mark:

**BLOCKED — HOSPITAL HOSTING / INFRASTRUCTURE CONFIGURATION REQUIRED**

Do not attempt to pretend that local testing is equivalent to production deployment.

---

# PHASE 16 — SCREENSHOT EVIDENCE

Screenshots are mandatory.

Create a structured QA evidence directory such as:

qa-evidence/
01-auth/
02-doctor/
03-nurse/
04-admin/
05-patient/
06-mobile/
07-prescription/
08-print/
09-tamil/
10-telugu/
11-errors/
12-final/

Capture screenshots from the **actual browser test run**.

At minimum capture:

1. Login
2. Doctor dashboard
3. Doctor patient dossier
4. Clinical note editor
5. Prescription builder
6. Prescription print preview
7. Nurse triage
8. Admin dashboard
9. Patient portal
10. Mobile login
11. Mobile patient view
12. Mobile doctor/prescription screen
13. Tamil interface
14. Telugu interface
15. Representative validation/error state
16. Final clean desktop state
17. Final clean mobile state

Use clear filenames, for example:

`doctor-dashboard-desktop-pass.png`

`prescription-print-preview-a4-pass.png`

`patient-portal-mobile-390px-pass.png`

`tamil-doctor-dashboard-pass.png`

`telugu-patient-portal-pass.png`

For important bugs, capture both:

`before-fix-[issue].png`

and

`after-fix-[issue].png`

where feasible.

Do not use screenshots from source code, Storybook, or static mocks as substitutes for browser QA evidence.

---

# PHASE 17 — FIX DEFECTS AS YOU FIND THEM

Do not create a giant issue list and stop.

For every repository-controlled defect:

1. Reproduce
2. Capture evidence if useful
3. Identify root cause
4. Implement fix
5. Run relevant tests/build
6. Retest in browser
7. Capture final screenshot
8. Record the change

Avoid unnecessary rewrites.

Prefer minimal, reliable fixes.

Do not break previously working functionality while fixing another area.

---

# PHASE 18 — REGRESSION PASS

After completing fixes, run a final regression test across:

* Authentication
* Doctor
* Nurse
* Admin
* Patient
* Prescription
* Print
* English
* Tamil
* Telugu
* Desktop
* Mobile
* RBAC
* Persistence
* Browser refresh
* Error states

Do not rely on earlier screenshots for this final pass.

---

# PHASE 19 — BUILD VERIFICATION

Run the appropriate final checks available in the project, including where applicable:

* Type checking
* Linting
* Unit tests
* Integration tests
* Frontend production build
* Backend tests
* Database checks

Resolve repository-controlled failures.

Do not hide failing tests.

If any failure cannot safely be fixed, document it.

---

# PHASE 20 — CREATE FINAL QA REPORT

Create:

`FINAL_QA_RELEASE_REPORT.md`

The report must include:

## 1. Executive Summary

Give a concise release assessment.

Use exactly one of:

* RELEASE READY
* RELEASE READY WITH EXTERNAL CONFIGURATION
* CONDITIONAL RELEASE
* NOT RELEASE READY

## 2. Environment Tested

Document:

* Browser
* Resolution/device
* Frontend
* Backend
* Database
* Build
* Relevant runtime versions

## 3. Workflow Test Results

Use a table:

| Area | Test | Result | Evidence | Notes |
| ---- | ---- | ------ | -------- | ----- |

Use:

PASS
FAIL
BLOCKED
NOT APPLICABLE

## 4. Bugs Found and Fixed

For each:

* ID
* Severity
* Description
* Root cause
* Files changed
* Fix
* Retest result
* Screenshot evidence

## 5. Desktop Compatibility

Summarize results.

## 6. Mobile Compatibility

Summarize each tested viewport.

## 7. Prescription QA

Explain exactly what was tested.

## 8. Prescription Print QA

Record:

* Browser
* Paper format
* Test cases
* Page-break behavior
* Result
* Screenshot path

## 9. Tamil Coverage

Document:

* Coverage
* Missing items found
* Corrections made
* Remaining limitations

## 10. Telugu Coverage

Same structure.

## 11. Security/RBAC Verification

Document browser-tested permission scenarios.

## 12. Documentation Verification

Record whether clean setup succeeded using the documentation.

## 13. External Deployment Blockers

Explicitly list:

### Hospital SMS integration

State whether production credentials/service were available.

### Hospital hosting configuration

State whether production infrastructure was available.

Do not mix these blockers with repository defects.

## 14. Known Remaining Issues

For each include:

* Severity
* Impact
* Workaround
* Owner/dependency

## 15. Release Checklist

Include a checklist covering:

* Build passes
* Authentication
* Doctor workflow
* Nurse workflow
* Admin workflow
* Patient workflow
* RBAC
* Prescription
* Print
* Desktop
* Mobile
* Tamil
* Telugu
* Setup documentation
* Database
* SMS
* Hosting
* Backups
* SSL
* Domain
* Environment secrets
* Logging
* Monitoring

## 16. Final Recommendation

Clearly state what still needs to happen before the hospital can go live.

---

# PHASE 21 — CREATE A DEPLOYMENT HANDOFF FILE

Create:

`HOSPITAL_DEPLOYMENT_HANDOFF.md`

It should contain only the items required to move from the tested local/release candidate to hospital production.

Include:

### Information required from hospital IT

* Hosting environment
* Domain/subdomain
* SSL
* Database details
* SMS provider details
* SMS credentials
* OTP template configuration
* Production environment variables
* Backup location
* Logging/monitoring requirements
* Network/firewall rules if relevant
* Support contact

### Deployment procedure

Provide exact commands/steps appropriate to this repository.

### Post-deployment smoke test

Define a concise production smoke test covering:

1. Application loads
2. Login
3. Role access
4. Database connectivity
5. Patient lookup
6. Triage
7. Doctor notes
8. Prescription
9. Prescription printing
10. SMS/OTP
11. Tamil
12. Telugu
13. Logout
14. Audit/event logging where applicable

---

# FINAL DELIVERABLES

When finished, I expect:

1. Fully tested application
2. Repository-controlled defects fixed
3. Desktop layouts verified
4. Mobile/tablet layouts verified and fixed
5. Prescription workflow verified
6. Actual browser prescription print preview tested
7. Tamil coverage completed/verified
8. Telugu coverage completed/verified
9. RBAC verified
10. Browser console/network errors addressed
11. Setup documentation corrected and verified
12. Production build verified
13. Screenshots from actual browser runs
14. Before/after screenshots for significant defects where practical
15. `FINAL_QA_RELEASE_REPORT.md`
16. `HOSPITAL_DEPLOYMENT_HANDOFF.md`
17. Clear list of any external deployment blockers

---

# CRITICAL RELEASE STANDARD

Do not optimize for making the report look good.

Optimize for finding problems before hospital staff find them.

Clinical software must fail safely and visibly.

Do not hide defects.

Do not fabricate test results.

Do not mark something PASS without testing it.

If the application is not ready, say so.

If everything internal is ready but hospital SMS credentials and production hosting are the only remaining dependencies, the appropriate status is:

**RELEASE READY WITH EXTERNAL CONFIGURATION**

Clearly distinguish:

### SOFTWARE DEFECTS

from

### HOSPITAL DEPLOYMENT DEPENDENCIES

Continue autonomously through the entire process.

Do not stop after analysis.

**Run → test → screenshot → fix → retest → document → regression-test → report.**
