# Patient Activation Flow

## Design Intent
The patient activation path must be secure, self-service, and fundamentally decoupled from default passwords. It bridges a clinical demographic record (`patients`) into an active login context (`users`) without exposing records.

## Activation Lifecycle

### 1. Generation (Admin/System Scope)
- When a patient is registered in the clinic, the backend creates a `patients` row.
- A cryptographically secure, time-bound `activation_token` (e.g., a 6-digit OTP or a 32-char hex string) is generated and associated with that `patient_id` in a transient store or highly-restricted DB column (e.g., `patients.activation_code`).
- A communication service simulates an SMS/WhatsApp dispatch containing the Activation PIN.

### 2. Claim Initiation (Patient Scope)
- The patient arrives at `http://localhost:5173/patient/activate`.
- The patient inputs their core clinical identifier (`UHID`) and the `Activation PIN`.

### 3. Server Verification & Password Establishment
- The backend matches the UHID and PIN. If valid and not expired:
  - The backend prompts the patient to set a permanent `password`.
  - The backend generates a rigorous `$2a$10$` bcrypt hash.
  - The backend INSERTs a new record into `users` (`role = 'PATIENT'`, `patient_id = <UHID>`, `password_hash = <hash>`).
  - The `activation_token` is explicitly invalidated/nulled.

### 4. Post-Activation State
- The patient is routed back to the primary `Login` screen.
- They select the previously disabled "Patient Login" button (to be enabled in Phase 2).
- They authenticate using their UHID and their newly minted custom Password.
