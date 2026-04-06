# Chettinad Care Platform
*A Hardened Enterprise Clinical Environment*

## 1. Project Overview
The Chettinad Care platform is a hospital-grade frontend user interface crafted specifically for Chettinad Hospital & Research Institute operations. The platform transitions clinical and administrative staff away from legacy monolithic systems into a highly resilient, offline-aware, modern clinical workspace.

## 2. Product Purpose
This system serves as the operational conduit between Patient Intake (Nurse Triage), Medical Diagnosis (Doctor Command Center), Healthcare Logistics (clinical signing, prescriptions), and Post-care Support (Patient Portal). It is explicitly **not** a generic consumer health-tech product, but a secure interface for staff-centric institutional logistics.

## 3. Canonical Modules
*   **Authentication Engine:** JWT-based robust RBAC system enforcing isolated paths via an immutable `AuthStatus` state engine.
*   **Live Clinical Queue:** Atomic, conflict-free state resolution using `PATCH /queue/{id}` endpoints.
*   **Patient Dossier:** Unified temporal viewing space for historical medical records, allergies, and interactions.
*   **Clinical Note & Prescription Builders:** Highly resilient draft-enabled authoring workflows integrating standard medical codes across the EMR ledger. 
*   **Nurse Triage Gateway:** Optimized biometric ingestion tool to triage and categorize patient urgency via automated EWS scoring systems.
*   **Patient Portal:** Forward-facing dashboard designed for secure patient-record access.

## 4. Tech Stack
*   **Framework:** React 18 / TypeScript
*   **Networking:** Axios (with integrated HTTP interception routines)
*   **State & Concurrency Layer:** TanStack React Query (Optimistic UIs & rollback protection)
*   **Styling:** TailwindCSS
*   **Tooling:** Vite, Lucide React

## 5. Route Map
*   `/login`: Primary entryway handling authentication tokens.
*   `/clinical/command-center`: Main dispatch terminal for attending physicians.
*   `/operations/nurse-triage`: Intake terminal for general triage mapping.
*   `/admin/dashboard`: Supervisory interface tracing hospital load states.
*   `/clinical/patient/:patientId/dossier`: Protected patient record viewer.
*   `/clinical/patient/:patientId/note/:consultationId`: SOAP note drafting core.
*   `/clinical/patient/:patientId/prescription/:prescriptionId`: Rx engine.
*   `/patient/dashboard`: Authenticated patient entryway.

## 6. Role Model
The system explicitly restricts navigation depending on backend-authenticated roles:
- `doctor`: Access to the command center, write-privileges for notes/prescriptions.
- `nurse`: Confined to Queue ingestion and Triage capabilities.
- `admin`: Given read/reporting capacities over system load variables without medical write properties.
- `patient`: Compartmentalized completely inside the `/patient/*` hierarchy.

## 7. Implemented Backend-Backed Features
*   Strict JWT Authorization.
*   Atomic Queue Adjustments (Optimistic Rollback capable).
*   Live Patient Ledger fetching and mapping.
*   ETag-controlled Draft Concurrency system (Blocking simultaneous doctor edits using `HTTP 412 Precondition Failed` interception).
*   Note transmission & Prescription finalization workflows.

## 8. Explicitly Locked & Unprovisioned Features
*In order to preserve operational truthfulness, the following buttons display explicit Offline warnings instead of deceiving staff into thinking modules are finalized:*
*   **PDF Export Module:** Offline in Doctor Command Center.
*   **Legacy Billing/Invoicing Gateways:** Offline in Admin Dashboard.
*   **Optical Character Recognition (OCR):** Document parsing blocked in Admin Dashboard.
*   **Automated Bookings:** Scheduling logic blocked within the Patient Portal.
*   **Break-Glass Compliance Bypass:** Explicitly blocked in Dossiers due to audit risks.
*   **LIS Data Imports:** Automated laboratory data streaming into the Soap notes is disabled.

## 9. Local Setup Instructions
1. Clone the repository natively.
2. Ensure you run `npm install` exclusively without altering legacy `package-lock.json` unless necessary.
3. Start the dev server using `npm run dev`.
4. Ensure the corresponding FastAPI application exists and runs concurrently on port mapping standard `http://localhost:8000` via `.env.local` configs. 

## 10. Environment / Config Assumptions
The application assumes direct connection to an operational REST backend. If backend resolution fails, the application correctly defaults into an un-bypassable `System Offline` hardware screen protecting against false state rendering. It relies completely on the backend for single-source-of-truth authorization.

## 11. Known Limitations
1.  **Partial Caching:** Currently caching relies inherently on React Query defaults. Aggressive browser offline modes are not definitively supported out-of-the-box (Service Workers aren't fully deployed for index caching).
2.  **Notification Relay:** Staff notifications remain locally tracked context providers rather than integrating with an operational WebSocket stream.

## 12. Next Engineering Priorities
*   Implementation of real WebSocket channels for instantaneous push-notifications replacing interval polling arrays.
*   Integrate actual OCR parsers inside the Admin ecosystem.
*   Wire the remaining Institutional configuration profiles to backend API states.
