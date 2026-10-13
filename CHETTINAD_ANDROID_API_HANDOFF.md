# Android Integration API Handoff

## Backend Base Architecture
The Chettinad Care v2 backend is a Node.js/Express application implementing RESTful routes under `/api/v1` and `/api/v1/opd`. It uses a relational database (PostgreSQL for production, SQLite for isolated testing). All dates/times are returned as UTC ISO 8601 strings but the server logic applies schedule offsets for `Asia/Kolkata`.

## Authentication
- **Token Mechanism**: JSON Web Tokens (JWT) bound to roles and accounts.
- **Client Storage**: The web app stores the short-lived `access_token` in memory, not localStorage.
- **Header Format**: `Authorization: Bearer <token>`
- **Refresh Flow**: The backend sends a long-lived refresh token in an `HttpOnly` cookie (`cc_opd_refresh`). When the API returns `401 Unauthorized`, the client makes an unauthenticated `POST /api/v1/auth/refresh` to get a new access token and then retries the failed request.
- **Login Routes**:
  - Staff: `POST /api/v1/auth/login/staff` (Requires `username`, `password`)
  - Patient: `POST /api/v1/auth/login/patient` (Requires `account_type`, legacy password bypass for local tests). Production uses mobile OTP via `/auth/opd/otp/request` and `/auth/opd/otp/verify`.
- **Logout**: `POST /api/v1/auth/logout` invalidates the server-side refresh secret.

## Role Mapping
Roles are strictly enforced via the `requireRole` middleware. Android MUST use these exact string enum values:
- `ADMIN` (Administrative functions, registering staff/patients)
- `DOCTOR` (Consultations, notes, labs, prescribing)
- `NURSE` (Triage queue, capturing patient vitals)
- `PATIENT` (Patient-facing portal access only)

## Environment Configuration
- **API Base URL**: Configured via `API_BASE_URL` (usually `https://your-domain/api/v1`)
- **Headers**: All authenticated requests require `Authorization`. The client should inject `X-Correlation-ID: <uuid>` on every request to assist backend logging.

## Endpoint Inventory & Request/Response DTOs
*For full schemas and examples, reference `CHETTINAD_V2_ACTUAL_API.openapi.yaml`.*

**Key Endpoints:**
- **Current User Context**: `GET /api/v1/opd/session`
- **Patient Queue**: `GET /api/v1/opd/queue` (Nurse/Doctor only. Shows Active Patients in department).
- **Triage**: `POST /api/v1/opd/encounters/{id}/start-triage`, `POST /api/v1/opd/encounters/{id}/triage`
- **Consultation**: `PUT /api/v1/opd/encounters/{id}/consultation` (Save Draft), `POST /api/v1/opd/encounters/{id}/complete` (Finalize & prescribe).
- **History**: `GET /api/v1/opd/patients/{id}/journey`
- **Appointments**: `GET /api/v1/opd/appointments` (Patient's view) and `GET /api/v1/opd/slots` (Available slots).
- **Check-in**: `POST /api/v1/opd/appointments/{id}/check-in`

## IDs
The backend uses a standard prefixed string identifier schema generated via `crypto.randomUUID()`.
- **Patient ID**: `pat-UUID`
- **Appointment ID**: `apt-UUID`
- **Encounter ID**: `enc-UUID`
- **Staff ID**: Plaintext alphanumeric (e.g., `dr_smith` / `nurse_01`) set during admin provisioning.
- **MRN (Medical Record Number)**: String identifier. Backfilled to match Patient ID if missing.

## Errors
Standard Error Envelope:
```json
{
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "Human readable reason.",
    "details": null
  },
  "meta": { "correlation_id": "SERVER-UUID" }
}
```
**Common Codes:**
- `401`: `SESSION_REQUIRED` / `REFRESH_REVOKED` / `INVALID_TOKEN`
- `403`: `FORBIDDEN_ROLE`
- `404`: `NOT_FOUND`
- `409`: `STALE_STATE` (Concurrency Conflict) / `SLOT_UNAVAILABLE`
- `422`: `VALIDATION_ERROR` (Invalid DTO payload)
- `429`: `OTP_WAIT` (Rate limiting)

## Pagination
The backend currently handles list limits natively on SQL queries (`LIMIT 100` / `LIMIT 200` in SQL). Explicit cursor or offset pagination parameters are **NOT IMPLEMENTED** on current `/queue`, `/patients`, or `/appointments` endpoints. Android should handle these lists in memory or local DB caching.

## Clinical Notes & Concurrency
The backend uses strict Optimistic Locking via `__v` (version numbers) for all clinical state mutations (Triage, Consultations, Lab changes, Rescheduling).
- If Android submits an update with a stale `__v`, the server returns `409 STALE_STATE`.
- Android MUST fetch the latest resource and prompt the user to merge or overwrite.

## Prescriptions
- Output: Prescriptions are generated on the frontend using standard React HTML/CSS and triggered via `window.print()` (Browser Print to PDF). The API does not return a binary PDF file.
- Integration: Android must fetch the completed encounter/record data via `/api/v1/opd/patients/{id}/record` and format the PDF payload natively within Kotlin/Compose or a local WebView print wrapper.

## Labs
- Orders: `POST /api/v1/opd/encounters/{id}/labs`
- Results: Admin processes via `/api/v1/opd/labs/{id}/verify`. Patient sees them once `released`.

## Idempotency
Native `Idempotency-Key` headers are **NOT IMPLEMENTED**.
The backend handles duplicate prevention strictly through state-machine transitions and `__v` optimistic locks (e.g., you cannot check-in an appointment that is already checked-in, or finalize a consultation twice because the version will be stale or the state will be wrong).

## Localization
The server responses do NOT contain localized strings. It returns English-only clinical values, enum keys, and backend error codes (e.g., `VALIDATION_ERROR`, `PASSWORD_CHANGE_REQUIRED`).
Android must implement its own i18n map dictionary based on these fixed error codes, mirroring the web frontend's `i18n.tsx`.

## Known Backend Limitations
- Rate Limiting: Strict on Auth/OTP. Bypassing requires `process.env.PILOT_AUTH_BYPASS`.
- Future Slots: Synthetic test environment seeds often run out of slots late at night in IST. Tests must compensate.
- SMS: Sent asynchronously. A `200` on OTP simply means queued.

## Android Integration Notes
- Maintain memory-only access tokens. Handle HTTP 401s centrally using a network interceptor to retry after token refresh.
- Map the error `code` field to Android string resources. Do not use `error.message` for UI alerts as it cannot be localized.
- Do not poll. Only update views via SwipeRefreshLayout or upon receiving SSE events if implemented on mobile.
