# Chettinad Care v2 Actual API Specification

```yaml
openapi: 3.1.0
info:
  title: Chettinad Care v2 — Connected OPD API
  version: 2.0.0
  description: >-
    Implemented Connected OPD REST contract. API URL retains /api/v1 for
    compatibility; v2 workflows live under /opd. All /opd routes require a
    role-bound bearer token and active account. Patient access is limited to
    self, doctors to linked care, nurses to their department. Mutable resources
    use __v; conflicts return HTTP 409 and require refetch. Timestamps are UTC
    ISO 8601; schedule dates and times use Asia/Kolkata. See
    docs/V2_ARCHITECTURE.md for adapter and deployment requirements.
servers:
  - url: /api/v1
    description: Same-origin deployment or Vite development proxy
security:
  - bearerAuth: []
tags:
  - name: Authentication
  - name: Patients
  - name: Scheduling
  - name: Queue
  - name: Clinical
  - name: Laboratory
  - name: Notifications
  - name: Administration
  - name: Operations
paths:
  /auth/login/staff:
    post:
      summary: Authenticate hospital staff
      operationId: post_auth_login_staff
      tags:
        - Authentication
      description: >-
        Staff-only password login; sets the HttpOnly refresh cookie. A
        first-login password change can be required before OPD access.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Login'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                username:
                  type: string
                password:
                  type: string
                  writeOnly: true
              required:
                - username
                - password
      security: []
  /auth/refresh:
    post:
      summary: Rotate the refresh credential
      operationId: post_auth_refresh
      tags:
        - Authentication
      description: >-
        Requires a refresh credential in the HttpOnly cc_refresh_token cookie
        (or refresh_token body). Browser origins must be allowed. Rotates the
        secret while preserving a stable device/session ID.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/RefreshResponse'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      security: []
  /auth/logout:
    post:
      summary: Revoke the current refresh session
      operationId: post_auth_logout
      tags:
        - Authentication
      description: Revokes the cookie session and clears the refresh cookie.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                required:
                  - message
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      security: []
  /auth/change-password:
    post:
      summary: Change staff password
      operationId: post_auth_change_password
      tags:
        - Authentication
      description: >-
        Required at first login for newly created staff. Uses the authenticated
        user and current password.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                currentPassword:
                  type: string
                  writeOnly: true
                newPassword:
                  type: string
                  writeOnly: true
                  minLength: 12
                  maxLength: 72
                  pattern: >-
                    ^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9])[\s\S]{12,72}$
              required:
                - currentPassword
                - newPassword
  /auth/opd/config:
    get:
      summary: Read OTP delivery mode
      operationId: get_auth_opd_config
      tags:
        - Authentication
      description: Read OTP delivery mode
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  demo_otp:
                    type: boolean
                  sms_available:
                    type: boolean
                required:
                  - demo_otp
                  - sms_available
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      security: []
  /auth/opd/otp/request:
    post:
      summary: Request a patient login OTP
      operationId: post_auth_opd_otp_request
      tags:
        - Authentication
      description: >-
        Five-minute OTP; minimum 60 seconds between requests for a phone. Rate
        limited by phone and IP. development_code exists only when
        OPD_DEMO_OTP=true in local development.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  sent:
                    type: boolean
                  expires_in:
                    type: integer
                  development_code:
                    type: string
                required:
                  - sent
                  - expires_in
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                phone:
                  type: string
              required:
                - phone
      security: []
  /auth/opd/otp/verify:
    post:
      summary: Verify OTP and register if needed
      operationId: post_auth_opd_otp_verify
      tags:
        - Authentication
      description: >-
        OTP is single use with five failed attempts allowed. New patient
        requires profile or receives PROFILE_REQUIRED (422). The verified mobile
        is authoritative. Sets refresh cookie; creates demographics and a
        patient account, not an encounter.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Login'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                phone:
                  type: string
                code:
                  type: string
                  pattern: ^[0-9]{6}$
                profile:
                  $ref: '#/components/schemas/PatientProfile'
              required:
                - phone
                - code
      security: []
  /auth/opd/sessions:
    get:
      summary: List own active devices
      operationId: get_auth_opd_sessions
      tags:
        - Authentication
      description: >-
        Returns non-secret stable session IDs; refresh credentials are never
        exposed.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/SessionDevice'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - PATIENT
        - ADMIN
        - NURSE
        - DOCTOR
  /auth/opd/sessions/{id}:
    delete:
      summary: Revoke an owned device session
      operationId: delete_auth_opd_sessions_id
      tags:
        - Authentication
      description: Revoke an owned device session
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - PATIENT
        - ADMIN
        - NURSE
        - DOCTOR
  /opd/session:
    get:
      summary: Read current role and profile link
      operationId: get_opd_session
      tags:
        - Authentication
      description: Read current role and profile link
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Session'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - PATIENT
        - ADMIN
        - NURSE
        - DOCTOR
  /opd/directory:
    get:
      summary: List departments, doctors and schedules
      operationId: get_opd_directory
      tags:
        - Scheduling
      description: List departments, doctors and schedules
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Directory'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - PATIENT
        - ADMIN
        - NURSE
        - DOCTOR
  /opd/slots:
    get:
      summary: List available appointment slots
      operationId: get_opd_slots
      tags:
        - Scheduling
      description: >-
        Asia/Kolkata date, up to 181 days ahead. Excludes past slots, breaks,
        unavailable doctors and overlapping bookings.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Slot'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: query
          name: doctor_id
          required: true
          schema:
            type: string
            minLength: 1
        - in: query
          name: date
          required: true
          schema:
            type: string
            format: date
      x-roles:
        - PATIENT
        - ADMIN
        - NURSE
        - DOCTOR
  /opd/schedules:
    post:
      summary: Create or update a doctor weekday schedule
      operationId: post_opd_schedules
      tags:
        - Scheduling
      description: Create or update a doctor weekday schedule
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - ADMIN
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ScheduleInput'
  /opd/unavailability:
    get:
      summary: List upcoming doctor leave
      operationId: get_opd_unavailability
      tags:
        - Scheduling
      description: List upcoming doctor leave
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Unavailability'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - ADMIN
    post:
      summary: Block a doctor date
      operationId: post_opd_unavailability
      tags:
        - Scheduling
      description: >-
        Existing confirmed/checked-in appointments on the date must be
        rescheduled first.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - ADMIN
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UnavailabilityInput'
  /opd/unavailability/{id}:
    delete:
      summary: Restore doctor availability
      operationId: delete_opd_unavailability_id
      tags:
        - Scheduling
      description: Restore doctor availability
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - ADMIN
  /opd/patients:
    get:
      summary: Search patient demographics
      operationId: get_opd_patients
      tags:
        - Patients
      description: >-
        Matches name, mobile or MRN, maximum 100 results. Reception cannot
        access the clinical record endpoint.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Patient'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: query
          name: search
          required: false
          schema:
            type: string
            maxLength: 100
      x-roles:
        - ADMIN
    post:
      summary: Register a demographic record
      operationId: post_opd_patients
      tags:
        - Patients
      description: >-
        Issues a unique MRN and prevents duplicate phone registration. Does not
        create an encounter.
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Patient'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - ADMIN
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PatientProfile'
  /opd/profile:
    get:
      summary: Read own patient profile
      operationId: get_opd_profile
      tags:
        - Patients
      description: Read own patient profile
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Patient'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - PATIENT
  /opd/patients/{id}:
    patch:
      summary: Update authorized patient demographics
      operationId: patch_opd_patients_id
      tags:
        - Patients
      description: >-
        Requires current patient __v. Mobile cannot change through this
        endpoint; it is the verified login identity.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - ADMIN
        - PATIENT
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PatientUpdate'
  /opd/appointments:
    get:
      summary: List role-scoped appointments
      operationId: get_opd_appointments
      tags:
        - Scheduling
      description: >-
        Optional Asia/Kolkata date filter. Patients see own appointments;
        doctors their bookings; nurses their department. Maximum 500.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Appointment'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: query
          name: date
          required: false
          schema:
            type: string
            format: date
      x-roles:
        - PATIENT
        - ADMIN
        - NURSE
        - DOCTOR
    post:
      summary: Book an offered slot
      operationId: post_opd_appointments
      tags:
        - Scheduling
      description: >-
        Transactions and doctor/patient locking prevent overlapping bookings.
        409 indicates a slot conflict; refetch slots.
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Appointment'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - ADMIN
        - PATIENT
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Booking'
  /opd/appointments/{id}/check-in:
    post:
      summary: Verify identity and issue a queue token
      operationId: post_opd_appointments_id_check_in
      tags:
        - Queue
      description: >-
        Only on appointment date in Asia/Kolkata. Creates one active encounter
        and department/day token. Repeating check-in returns the existing queue
        entry.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/QueueEntry'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - ADMIN
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                identity_verified:
                  type: boolean
                  const: true
              required:
                - identity_verified
  /opd/appointments/{id}/{action}:
    post:
      summary: Reschedule, cancel or record no-show
      operationId: post_opd_appointments_id_action
      tags:
        - Scheduling
      description: Reschedule, cancel or record no-show
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
        - in: path
          name: action
          required: true
          schema:
            type: string
            enum:
              - reschedule
              - cancel
              - no-show
      x-roles:
        - ADMIN
        - PATIENT
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/AppointmentAction'
  /opd/queue:
    get:
      summary: Read role-scoped live queue
      operationId: get_opd_queue
      tags:
        - Queue
      description: >-
        Excludes completed entries. Patient position is calculated against the
        doctor queue before removing other patients. Estimated waits are
        estimates in minutes.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/QueueEntry'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - PATIENT
        - ADMIN
        - NURSE
        - DOCTOR
  /opd/encounters/{id}/start-triage:
    post:
      summary: Begin triage
      operationId: post_opd_encounters_id_start_triage
      tags:
        - Queue
      description: >-
        Begin triage. Uses the current queue __v and enforced lifecycle
        transition. Doctors must own the encounter; nurses must belong to its
        department.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - NURSE
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Version'
  /opd/encounters/{id}/call:
    post:
      summary: Notify that the doctor is ready
      operationId: post_opd_encounters_id_call
      tags:
        - Queue
      description: >-
        Notify that the doctor is ready. Uses the current queue __v and enforced
        lifecycle transition. Doctors must own the encounter; nurses must belong
        to its department.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - DOCTOR
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Version'
  /opd/encounters/{id}/start:
    post:
      summary: Begin consultation
      operationId: post_opd_encounters_id_start
      tags:
        - Queue
      description: >-
        Begin consultation. Uses the current queue __v and enforced lifecycle
        transition. Doctors must own the encounter; nurses must belong to its
        department.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - DOCTOR
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Version'
  /opd/encounters/{id}/triage:
    post:
      summary: Save or amend triage
      operationId: post_opd_encounters_id_triage
      tags:
        - Clinical
      description: >-
        Appends an attributed triage version, updates allergies and queue
        priority, and advances the queue to WAITING_DOCTOR.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - NURSE
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TriageWrite'
  /opd/encounters/{id}/consultation:
    put:
      summary: Save consultation draft
      operationId: put_opd_encounters_id_consultation
      tags:
        - Clinical
      description: >-
        Assigned doctor, active consultation only. __v is the note version, or 0
        for the first draft.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/NoteVersion'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - DOCTOR
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ConsultationWrite'
  /opd/encounters/{id}/complete:
    post:
      summary: Sign consultation and issue prescription
      operationId: post_opd_encounters_id_complete
      tags:
        - Clinical
      description: >-
        Atomically validates mandatory clinical fields, creates prescription and
        optional follow-up, appends history and completes
        encounter/queue/appointment. Requires note __v (0 if no draft).
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/NoteVersion'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - DOCTOR
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ConsultationWrite'
  /opd/encounters/{id}/amend:
    post:
      summary: Append an attributed signed-record amendment
      operationId: post_opd_encounters_id_amend
      tags:
        - Clinical
      description: >-
        Assigned doctor and completed encounter only. Preserves signed source
        content and adds new note/prescription versions. Requires reason and
        current note __v.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - DOCTOR
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ConsultationAmendment'
  /opd/encounters/{id}/labs:
    post:
      summary: Order a catalogue laboratory test
      operationId: post_opd_encounters_id_labs
      tags:
        - Laboratory
      description: >-
        Assigned doctor during active consultation. Duplicate test on the same
        encounter is rejected.
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Id'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - DOCTOR
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                test_id:
                  type: string
                  minLength: 1
              required:
                - test_id
  /opd/patients/{id}/record:
    get:
      summary: Read the authorized shared clinical record
      operationId: get_opd_patients_id_record
      tags:
        - Clinical
      description: >-
        Patient sees own finalized records and released results. Doctors require
        a linked appointment/encounter; nurses require an active department
        queue entry. Admin clinical access is denied. Access is audited.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PatientRecord'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - PATIENT
        - DOCTOR
        - NURSE
  /opd/patients/{id}/journey:
    get:
      summary: Read patient journey events
      operationId: get_opd_patients_id_journey
      tags:
        - Patients
      description: >-
        Requires patient access; patient identities and clinical context are
        role scoped. Events are newest first.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/JourneyEvent'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - PATIENT
        - ADMIN
        - NURSE
        - DOCTOR
  /opd/labs:
    get:
      summary: List authorized laboratory orders and latest results
      operationId: get_opd_labs
      tags:
        - Laboratory
      description: >-
        Patient sees own released results; doctor sees assigned orders;
        administrator operates the lab workflow. Maximum 500 orders.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/LabOrder'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - PATIENT
        - DOCTOR
        - ADMIN
  /opd/labs/{id}/{action}:
    post:
      summary: Advance laboratory workflow or review results
      operationId: post_opd_labs_id_action
      tags:
        - Laboratory
      description: >-
        collect/process/result require ADMIN. review requires assigned DOCTOR.
        All require current order __v. Results append versions; release controls
        patient visibility.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
        - in: path
          name: action
          required: true
          schema:
            type: string
            enum:
              - collect
              - process
              - result
              - review
      x-roles:
        - ADMIN
        - DOCTOR
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LabAction'
  /opd/catalogues:
    get:
      summary: List active clinical catalogues
      operationId: get_opd_catalogues
      tags:
        - Administration
      description: List active clinical catalogues
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Catalogues'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - ADMIN
        - DOCTOR
  /opd/catalogues/{kind}:
    post:
      summary: Create a hospital catalogue entry
      operationId: post_opd_catalogues_kind
      tags:
        - Administration
      description: >-
        Request schema depends on kind: departments → DepartmentInput, drugs →
        DrugInput, diagnoses → DiagnosisInput, tests → LabTestInput.
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: kind
          required: true
          schema:
            type: string
            enum:
              - departments
              - drugs
              - diagnoses
              - tests
      x-roles:
        - ADMIN
      requestBody:
        required: true
        content:
          application/json:
            schema:
              anyOf:
                - $ref: '#/components/schemas/DepartmentInput'
                - $ref: '#/components/schemas/DrugInput'
                - $ref: '#/components/schemas/DiagnosisInput'
                - $ref: '#/components/schemas/LabTestInput'
  /opd/staff:
    get:
      summary: List hospital staff access
      operationId: get_opd_staff
      tags:
        - Administration
      description: List hospital staff access
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Staff'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - ADMIN
    post:
      summary: Provision a staff account
      operationId: post_opd_staff
      tags:
        - Administration
      description: >-
        Hashes the temporary password; first login requires password change.
        Password hashes are never returned.
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - ADMIN
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/StaffInput'
  /opd/staff/{id}:
    patch:
      summary: Enable or disable staff access
      operationId: patch_opd_staff_id
      tags:
        - Administration
      description: Disabling revokes sessions. Caller cannot disable their own account.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            minLength: 1
      x-roles:
        - ADMIN
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                active:
                  type: boolean
              required:
                - active
  /opd/notifications:
    get:
      summary: List own latest notifications
      operationId: get_opd_notifications
      tags:
        - Notifications
      description: Latest 100 events for the authenticated user only.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Notification'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - PATIENT
        - ADMIN
        - NURSE
        - DOCTOR
  /opd/notifications/read:
    post:
      summary: Mark own notifications read
      operationId: post_opd_notifications_read
      tags:
        - Notifications
      description: Mark own notifications read
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - PATIENT
        - ADMIN
        - NURSE
        - DOCTOR
  /opd/audit:
    get:
      summary: Inspect latest audit entries
      operationId: get_opd_audit
      tags:
        - Administration
      description: Latest 200 audit entries; no refresh secrets, OTPs or passwords.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/AuditEvent'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - ADMIN
  /opd/dashboard:
    get:
      summary: Read real operational metrics
      operationId: get_opd_dashboard
      tags:
        - Operations
      description: >-
        Today uses Asia/Kolkata. Doctors see their own workload. Timing metrics
        are computed from recorded consultation/check-in/completion timestamps;
        absent observations return null.
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Dashboard'
        default:
          description: >-
            Structured validation, authorization, conflict or internal error.
            Common statuses: 401, 403, 404, 409, 422, 429, 503.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      x-roles:
        - ADMIN
        - DOCTOR
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    Error:
      type: object
      properties:
        error:
          type: object
          properties:
            code:
              type: string
            message:
              type: string
            details: {}
          required:
            - code
            - message
            - details
        meta:
          type: object
          properties:
            correlation_id:
              type: string
      required:
        - error
        - meta
    Success:
      type: object
      properties:
        success:
          type: boolean
          const: true
      required:
        - success
    Id:
      type: object
      properties:
        id:
          type: string
          minLength: 1
      required:
        - id
    Version:
      type: object
      properties:
        __v:
          type: integer
          minimum: 1
      required:
        - __v
    PatientProfile:
      type: object
      properties:
        name:
          type: string
          minLength: 1
          maxLength: 120
        phone:
          type: string
          description: >-
            Indian mobile; accepts 10 digits, +91 or 91 prefix and normalizes to
            +91XXXXXXXXXX.
        dob:
          type: string
          format: date
        gender:
          type: string
          enum:
            - Female
            - Male
            - Other
            - Not specified
        email:
          type: string
          default: ''
        address:
          type: string
          minLength: 1
          maxLength: 500
        city:
          type: string
          minLength: 1
          maxLength: 80
        state:
          type: string
          minLength: 1
          maxLength: 80
        pin_code:
          type: string
          pattern: ^[1-9][0-9]{5}$
        emergency_contact:
          type: string
          description: Indian mobile normalized to E.164.
        preferred_language:
          type: string
          enum:
            - en
            - ta
            - te
        existing_mrn:
          type: string
          maxLength: 3000
          default: ''
        allergies:
          type: string
          maxLength: 3000
          default: ''
      required:
        - name
        - phone
        - dob
        - gender
        - address
        - city
        - state
        - pin_code
        - emergency_contact
      description: >-
        DOB must be a real calendar date between 1900-01-01 and today in
        Asia/Kolkata. Registration does not create an encounter.
    Patient:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        mrn:
          type: string
        __v:
          type: integer
          minimum: 1
        name:
          type: string
          minLength: 1
          maxLength: 120
        phone:
          type: string
          description: >-
            Indian mobile; accepts 10 digits, +91 or 91 prefix and normalizes to
            +91XXXXXXXXXX.
        dob:
          type: string
          format: date
        gender:
          type: string
          enum:
            - Female
            - Male
            - Other
            - Not specified
        email:
          type: string
          default: ''
        address:
          type: string
          minLength: 1
          maxLength: 500
        city:
          type: string
          minLength: 1
          maxLength: 80
        state:
          type: string
          minLength: 1
          maxLength: 80
        pin_code:
          type: string
          pattern: ^[1-9][0-9]{5}$
        emergency_contact:
          type: string
          description: Indian mobile normalized to E.164.
        preferred_language:
          type: string
          enum:
            - en
            - ta
            - te
        existing_mrn:
          type: string
          maxLength: 3000
          default: ''
        allergies:
          type: string
          maxLength: 3000
          default: ''
      required:
        - id
        - mrn
        - name
        - phone
        - dob
        - gender
        - __v
    PatientUpdate:
      type: object
      properties:
        __v:
          type: integer
          minimum: 1
        data:
          $ref: '#/components/schemas/PatientProfile'
      required:
        - __v
        - data
    Staff:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        name:
          type: string
        role:
          type: string
          enum:
            - PATIENT
            - ADMIN
            - NURSE
            - DOCTOR
        department:
          type: string
        is_active:
          type: integer
          enum:
            - 0
            - 1
        must_change_password:
          type: integer
          enum:
            - 0
            - 1
      required:
        - id
        - name
        - role
    Session:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        name:
          type: string
        role:
          type: string
          enum:
            - PATIENT
            - ADMIN
            - NURSE
            - DOCTOR
        department:
          anyOf:
            - type: string
            - type: 'null'
        patient_id:
          anyOf:
            - type: string
              minLength: 1
            - type: 'null'
        must_change_password:
          oneOf:
            - type: boolean
            - type: integer
              enum:
                - 0
                - 1
    Login:
      type: object
      properties:
        access_token:
          type: string
        role:
          type: string
          enum:
            - patient
            - admin
            - nurse
            - doctor
        account_type:
          type: string
          enum:
            - patient
            - staff
        userId:
          type: string
          minLength: 1
        name:
          type: string
        must_change_password:
          type: boolean
        token_type:
          type: string
          enum:
            - bearer
      required:
        - access_token
        - role
        - account_type
        - userId
    SessionDevice:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        device_name:
          anyOf:
            - type: string
            - type: 'null'
        created_at:
          anyOf:
            - type: string
              format: date-time
            - type: 'null'
        expires_at:
          type: string
          format: date-time
        current:
          type: boolean
      required:
        - id
        - device_name
        - created_at
        - expires_at
        - current
    Department:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        name:
          type: string
        prefix:
          type: string
      required:
        - id
        - name
        - prefix
    DepartmentInput:
      type: object
      properties:
        name:
          type: string
          minLength: 1
          maxLength: 500
        prefix:
          type: string
          pattern: ^[A-Z]{2,6}$
      required:
        - name
        - prefix
    ScheduleInput:
      type: object
      properties:
        doctor_id:
          type: string
          minLength: 1
        department_id:
          type: string
          minLength: 1
        weekday:
          type: integer
          minimum: 0
          maximum: 6
        start_time:
          type: string
          pattern: ^([01][0-9]|2[0-3]):[0-5][0-9]$
        end_time:
          type: string
          pattern: ^([01][0-9]|2[0-3]):[0-5][0-9]$
        slot_minutes:
          type: integer
          minimum: 5
          maximum: 120
        room:
          type: string
          minLength: 1
          maxLength: 60
        break_start:
          anyOf:
            - type: string
            - type: 'null'
        break_end:
          anyOf:
            - type: string
            - type: 'null'
        __v:
          type: integer
          minimum: 1
      required:
        - doctor_id
        - department_id
        - weekday
        - start_time
        - end_time
        - slot_minutes
        - room
      description: >-
        Sunday=0. Times use Asia/Kolkata. End follows start. Both break times
        must fall inside the schedule. Existing schedules require their current
        __v.
    Schedule:
      allOf:
        - $ref: '#/components/schemas/ScheduleInput'
        - type: object
          properties:
            id:
              type: string
              minLength: 1
            __v:
              type: integer
              minimum: 1
          required:
            - id
            - __v
    Doctor:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        name:
          type: string
        role:
          const: DOCTOR
          type: string
        department:
          type: string
        schedules:
          type: array
          items:
            $ref: '#/components/schemas/Schedule'
      required:
        - id
        - name
        - schedules
    Directory:
      type: object
      properties:
        departments:
          type: array
          items:
            $ref: '#/components/schemas/Department'
        doctors:
          type: array
          items:
            $ref: '#/components/schemas/Doctor'
      required:
        - departments
        - doctors
    Slot:
      type: object
      properties:
        scheduled_at:
          type: string
          format: date-time
        ends_at:
          type: string
          format: date-time
        room:
          type: string
        department_id:
          type: string
          minLength: 1
      required:
        - scheduled_at
        - ends_at
        - room
        - department_id
    UnavailabilityInput:
      type: object
      properties:
        doctor_id:
          type: string
          minLength: 1
        date:
          type: string
          format: date
        reason:
          type: string
          minLength: 1
          maxLength: 500
      required:
        - doctor_id
        - date
        - reason
    Unavailability:
      allOf:
        - $ref: '#/components/schemas/UnavailabilityInput'
        - $ref: '#/components/schemas/Id'
    Booking:
      type: object
      properties:
        patient_id:
          type: string
          minLength: 1
        doctor_id:
          type: string
          minLength: 1
        scheduled_at:
          type: string
          format: date-time
        reason:
          type: string
          minLength: 1
          maxLength: 1000
      required:
        - doctor_id
        - scheduled_at
        - reason
      description: >-
        Use a scheduled_at returned by slots. Admin supplies patient_id; patient
        account uses its own identity regardless of supplied patient_id.
    Appointment:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        patient_id:
          type: string
          minLength: 1
        doctor_id:
          type: string
          minLength: 1
        department_id:
          type: string
          minLength: 1
        scheduled_at:
          type: string
          format: date-time
        ends_at:
          type: string
          format: date-time
        room:
          type: string
        status:
          type: string
          enum:
            - CONFIRMED
            - CHECKED_IN
            - COMPLETED
            - CANCELLED
            - NO_SHOW
        reason:
          type: string
        encounter_id:
          anyOf:
            - type: string
              minLength: 1
            - type: 'null'
        follow_up_of:
          anyOf:
            - type: string
              minLength: 1
            - type: 'null'
        created_at:
          type: string
          format: date-time
        __v:
          type: integer
          minimum: 1
        patient_name:
          type: string
        mrn:
          type: string
        dob:
          type: string
          format: date
        gender:
          type: string
        doctor_name:
          type: string
        department_name:
          type: string
        token:
          anyOf:
            - type: string
            - type: 'null'
        queue_status:
          anyOf:
            - type: string
              enum:
                - WAITING
                - TRIAGE
                - WAITING_DOCTOR
                - DOCTOR_READY
                - CONSULTATION
                - COMPLETED
            - type: 'null'
      required:
        - id
        - patient_id
        - doctor_id
        - scheduled_at
        - ends_at
        - status
        - __v
    AppointmentAction:
      type: object
      properties:
        __v:
          type: integer
          minimum: 1
        scheduled_at:
          type: string
          format: date-time
      required:
        - __v
      description: >-
        scheduled_at is required for reschedule. no-show is admin-only after the
        appointment ends. Actions require CONFIRMED state.
    QueueEntry:
      type: object
      properties:
        encounter_id:
          type: string
          minLength: 1
        appointment_id:
          type: string
          minLength: 1
        department_id:
          type: string
          minLength: 1
        token:
          type: string
        date:
          type: string
          format: date
        status:
          type: string
          enum:
            - WAITING
            - TRIAGE
            - WAITING_DOCTOR
            - DOCTOR_READY
            - CONSULTATION
            - COMPLETED
        priority:
          type: integer
          enum:
            - 0
            - 1
            - 2
        checked_in_at:
          type: string
          format: date-time
        checked_in_by:
          type: string
          minLength: 1
        identity_verified:
          type: integer
          enum:
            - 1
        triage_started_at:
          anyOf:
            - type: string
              format: date-time
            - type: 'null'
        consultation_started_at:
          anyOf:
            - type: string
              format: date-time
            - type: 'null'
        __v:
          type: integer
          minimum: 1
        patient_id:
          type: string
          minLength: 1
        patient_name:
          type: string
        mrn:
          type: string
        dob:
          type: string
          format: date
        gender:
          type: string
        doctor_id:
          type: string
          minLength: 1
        doctor_name:
          type: string
        department_name:
          type: string
        room:
          type: string
        scheduled_at:
          type: string
          format: date-time
        chief_complaint:
          anyOf:
            - type: string
            - type: 'null'
        patients_ahead:
          type: integer
          minimum: 0
        estimated_wait:
          type: number
          minimum: 0
        wait_minutes:
          type: number
          minimum: 0
      required:
        - encounter_id
        - appointment_id
        - token
        - status
        - __v
      description: >-
        Check-in returns persisted queue fields. Queue listing adds role-scoped
        patient details, position and wait estimates in minutes.
    TriageData:
      type: object
      properties:
        temperature:
          type: number
          minimum: 25
          maximum: 45
        systolic:
          type: integer
          minimum: 40
          maximum: 300
        diastolic:
          type: integer
          minimum: 20
          maximum: 200
        pulse:
          type: integer
          minimum: 20
          maximum: 250
        spo2:
          type: number
          minimum: 1
          maximum: 100
        weight:
          type: number
          minimum: 0.5
          maximum: 500
        height:
          type: number
          minimum: 20
          maximum: 250
        glucose:
          anyOf:
            - type: number
              exclusiveMinimum: 0
              maximum: 1500
            - type: 'null'
        complaint:
          type: string
          minLength: 1
          maxLength: 2000
        allergies:
          type: string
          maxLength: 3000
          default: ''
        pain:
          type: integer
          minimum: 0
          maximum: 10
        notes:
          type: string
          maxLength: 3000
          default: ''
        priority:
          type: integer
          minimum: 0
          maximum: 2
        bmi:
          type: number
          readOnly: true
      required:
        - temperature
        - systolic
        - diastolic
        - pulse
        - spo2
        - weight
        - height
        - complaint
        - pain
        - priority
      description: >-
        Temperature °C, weight kg, height cm. Systolic must exceed diastolic.
        BMI is computed by the server.
    TriageWrite:
      type: object
      properties:
        __v:
          type: integer
          minimum: 1
        data:
          $ref: '#/components/schemas/TriageData'
        reason:
          type: string
          minLength: 1
          maxLength: 500
      required:
        - __v
        - data
      description: Uses queue __v. A reason is required when amending existing triage.
    TriageRecord:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        encounter_id:
          type: string
          minLength: 1
        version:
          type: integer
          minimum: 1
        data:
          $ref: '#/components/schemas/TriageData'
        nurse_id:
          type: string
          minLength: 1
        nurse_name:
          type: string
        created_at:
          type: string
          format: date-time
        amendment_reason:
          anyOf:
            - type: string
            - type: 'null'
      required:
        - id
        - encounter_id
        - version
        - data
        - nurse_id
        - nurse_name
        - created_at
        - amendment_reason
    DrugInput:
      type: object
      properties:
        name:
          type: string
          minLength: 1
          maxLength: 500
        strength:
          type: string
          minLength: 1
          maxLength: 500
        form:
          type: string
          minLength: 1
          maxLength: 500
        route:
          type: string
          minLength: 1
          maxLength: 500
      required:
        - name
        - strength
        - form
        - route
    Drug:
      allOf:
        - $ref: '#/components/schemas/DrugInput'
        - $ref: '#/components/schemas/Id'
    DiagnosisInput:
      type: object
      properties:
        name:
          type: string
          minLength: 1
          maxLength: 500
      required:
        - name
    Diagnosis:
      allOf:
        - $ref: '#/components/schemas/DiagnosisInput'
        - $ref: '#/components/schemas/Id'
    Medication:
      type: object
      properties:
        drug_id:
          type: string
          minLength: 1
        dose:
          type: string
          minLength: 1
          maxLength: 100
        frequency:
          type: string
          minLength: 1
          maxLength: 100
        duration:
          type: string
          minLength: 1
          maxLength: 100
        instructions:
          type: string
          maxLength: 3000
          default: ''
        name:
          type: string
          readOnly: true
        strength:
          type: string
          readOnly: true
        form:
          type: string
          readOnly: true
        route:
          type: string
          readOnly: true
      required:
        - drug_id
        - dose
        - frequency
        - duration
    FollowUp:
      type: object
      properties:
        doctor_id:
          type: string
          minLength: 1
        scheduled_at:
          type: string
          format: date-time
        reason:
          type: string
          minLength: 1
          maxLength: 500
      required:
        - doctor_id
        - scheduled_at
        - reason
    ConsultationData:
      type: object
      properties:
        complaint:
          type: string
          maxLength: 3000
          default: ''
        history:
          type: string
          maxLength: 3000
          default: ''
        previous_history:
          type: string
          maxLength: 3000
          default: ''
        examination:
          type: string
          maxLength: 3000
          default: ''
        assessment:
          type: string
          maxLength: 3000
          default: ''
        diagnosis_ids:
          type: array
          items:
            type: string
            minLength: 1
          maxItems: 20
        diagnoses:
          type: array
          items:
            $ref: '#/components/schemas/Diagnosis'
        treatment:
          type: string
          maxLength: 3000
          default: ''
        advice:
          type: string
          maxLength: 3000
          default: ''
        medications:
          type: array
          items:
            $ref: '#/components/schemas/Medication'
          maxItems: 30
        follow_up:
          anyOf:
            - $ref: '#/components/schemas/FollowUp'
            - type: 'null'
      required:
        - diagnosis_ids
        - medications
      description: >-
        Finalization/amendment require history, examination, assessment, at
        least one diagnosis and advice. Catalog IDs are checked. Finalization
        atomically books any supplied follow-up.
    ConsultationWrite:
      type: object
      properties:
        __v:
          type: integer
          minimum: 0
        data:
          $ref: '#/components/schemas/ConsultationData'
      required:
        - __v
        - data
    ConsultationAmendment:
      type: object
      properties:
        __v:
          type: integer
          minimum: 1
        data:
          $ref: '#/components/schemas/ConsultationData'
        reason:
          type: string
          minLength: 1
          maxLength: 500
      required:
        - __v
        - data
        - reason
    NoteVersion:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        __v:
          type: integer
          minimum: 1
      required:
        - id
        - __v
    Encounter:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        patient_id:
          type: string
          minLength: 1
        assigned_doctor_id:
          type: string
          minLength: 1
        phase:
          type: string
        is_discharged:
          type: integer
          enum:
            - 0
            - 1
        created_at:
          type: string
          format: date-time
        completed_at:
          anyOf:
            - type: string
              format: date-time
            - type: 'null'
        __v:
          type: integer
          minimum: 1
        doctor_name:
          anyOf:
            - type: string
            - type: 'null'
        queue_status:
          anyOf:
            - type: string
              enum:
                - WAITING
                - TRIAGE
                - WAITING_DOCTOR
                - DOCTOR_READY
                - CONSULTATION
                - COMPLETED
            - type: 'null'
    Note:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        encounter_id:
          type: string
          minLength: 1
        draft_content:
          $ref: '#/components/schemas/ConsultationData'
        status:
          type: string
          enum:
            - DRAFT
            - FINALIZED
        author_id:
          type: string
          minLength: 1
        author_name:
          type: string
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time
        __v:
          type: integer
          minimum: 1
    Prescription:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        encounter_id:
          type: string
          minLength: 1
        rx_content:
          type: object
          properties:
            medications:
              type: array
              items:
                $ref: '#/components/schemas/Medication'
            diagnoses:
              type: array
              items:
                $ref: '#/components/schemas/Diagnosis'
            advice:
              type: string
            follow_up: {}
            validation:
              type: object
              properties:
                issued_at:
                  type: string
                  format: date-time
                signed_by:
                  type: string
                  minLength: 1
                sha256:
                  type: string
              required:
                - issued_at
                - signed_by
                - sha256
          required:
            - medications
            - diagnoses
            - advice
            - follow_up
            - validation
        status:
          type: string
        authorizing_user_id:
          type: string
          minLength: 1
        doctor_name:
          type: string
        created_at:
          type: string
          format: date-time
        __v:
          type: integer
          minimum: 1
      description: >-
        Validation metadata records author, time and SHA-256 digest. It is not a
        certificate-backed digital signature.
    LabTestInput:
      type: object
      properties:
        name:
          type: string
          minLength: 1
          maxLength: 500
        code:
          type: string
          minLength: 1
          maxLength: 500
        department:
          type: string
          minLength: 1
          maxLength: 500
        unit:
          type: string
          maxLength: 60
        reference_range:
          type: string
          minLength: 1
          maxLength: 500
      required:
        - name
        - code
        - department
        - unit
        - reference_range
    LabTest:
      allOf:
        - $ref: '#/components/schemas/LabTestInput'
        - $ref: '#/components/schemas/Id'
    LabResultInput:
      type: object
      properties:
        value:
          type: string
          minLength: 1
          maxLength: 500
        unit:
          type: string
          maxLength: 60
        reference_range:
          type: string
          minLength: 1
          maxLength: 500
        flag:
          type: string
          enum:
            - NORMAL
            - HIGH
            - LOW
            - CRITICAL
        verified:
          type: boolean
          const: true
        released:
          type: boolean
        reason:
          type: string
          minLength: 1
          maxLength: 500
      required:
        - value
        - unit
        - reference_range
        - flag
        - verified
        - released
        - reason
    LabAction:
      type: object
      properties:
        __v:
          type: integer
          minimum: 1
        data:
          $ref: '#/components/schemas/LabResultInput'
      required:
        - __v
      description: >-
        result requires data, verification and a reason. collect:
        ORDERED→COLLECTED; process: COLLECTED→PROCESSING; result:
        PROCESSING/AVAILABLE/REVIEWED→AVAILABLE; review: AVAILABLE→REVIEWED.
    LabResult:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        order_id:
          type: string
          minLength: 1
        version:
          type: integer
          minimum: 1
        value:
          type: string
        unit:
          type: string
        reference_range:
          type: string
        flag:
          type: string
          enum:
            - NORMAL
            - HIGH
            - LOW
            - CRITICAL
        entered_by:
          type: string
          minLength: 1
        entered_name:
          type: string
        verified_by:
          type: string
          minLength: 1
        verified_name:
          type: string
        resulted_at:
          type: string
          format: date-time
        released:
          type: integer
          enum:
            - 0
            - 1
        reason:
          type: string
        reviewed_by:
          anyOf:
            - type: string
              minLength: 1
            - type: 'null'
        reviewed_at:
          anyOf:
            - type: string
              format: date-time
            - type: 'null'
    LabOrder:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        encounter_id:
          type: string
          minLength: 1
        test_id:
          type: string
          minLength: 1
        ordered_by:
          type: string
          minLength: 1
        ordered_at:
          type: string
          format: date-time
        status:
          type: string
          enum:
            - ORDERED
            - COLLECTED
            - PROCESSING
            - AVAILABLE
            - REVIEWED
        __v:
          type: integer
          minimum: 1
        patient_id:
          type: string
          minLength: 1
        patient_name:
          type: string
        name:
          type: string
        code:
          type: string
        unit:
          type: string
        reference_range:
          type: string
        result:
          anyOf:
            - $ref: '#/components/schemas/LabResult'
            - type: 'null'
    ClinicalVersion:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        resource_type:
          type: string
          enum:
            - NOTE
            - PRESCRIPTION
        resource_id:
          type: string
          minLength: 1
        encounter_id:
          type: string
          minLength: 1
        version:
          type: integer
          minimum: 1
        data: {}
        actor_id:
          type: string
          minLength: 1
        reason:
          type: string
        created_at:
          type: string
          format: date-time
    JourneyEvent:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        patient_id:
          type: string
          minLength: 1
        encounter_id:
          anyOf:
            - type: string
              minLength: 1
            - type: 'null'
        appointment_id:
          anyOf:
            - type: string
              minLength: 1
            - type: 'null'
        code:
          type: string
        actor_id:
          type: string
          minLength: 1
        actor_name:
          type: string
        occurred_at:
          type: string
          format: date-time
        context:
          type: object
          properties: {}
    PatientRecord:
      type: object
      properties:
        patient:
          $ref: '#/components/schemas/Patient'
        encounters:
          type: array
          items:
            $ref: '#/components/schemas/Encounter'
        triage:
          type: array
          items:
            $ref: '#/components/schemas/TriageRecord'
        notes:
          type: array
          items:
            $ref: '#/components/schemas/Note'
        prescriptions:
          type: array
          items:
            $ref: '#/components/schemas/Prescription'
        labs:
          type: array
          items:
            $ref: '#/components/schemas/LabOrder'
        journey:
          type: array
          items:
            $ref: '#/components/schemas/JourneyEvent'
        versions:
          type: array
          items:
            $ref: '#/components/schemas/ClinicalVersion'
      required:
        - patient
        - encounters
        - triage
        - notes
        - prescriptions
        - labs
        - journey
        - versions
    Catalogues:
      type: object
      properties:
        drugs:
          type: array
          items:
            $ref: '#/components/schemas/Drug'
        diagnoses:
          type: array
          items:
            $ref: '#/components/schemas/Diagnosis'
        tests:
          type: array
          items:
            $ref: '#/components/schemas/LabTest'
      required:
        - drugs
        - diagnoses
        - tests
    StaffInput:
      type: object
      properties:
        id:
          type: string
          pattern: ^[a-zA-Z0-9_.-]{3,60}$
        name:
          type: string
          minLength: 1
          maxLength: 500
        role:
          type: string
          enum:
            - ADMIN
            - NURSE
            - DOCTOR
        department:
          type: string
          minLength: 1
          maxLength: 500
        password:
          type: string
          minLength: 12
          maxLength: 72
          writeOnly: true
          description: >-
            Requires lower/uppercase letters, digit and nonalphanumeric
            character. Department must already exist.
      required:
        - id
        - name
        - role
        - department
        - password
    Notification:
      type: object
      properties:
        id:
          type: string
          minLength: 1
        user_id:
          type: string
          minLength: 1
        patient_id:
          anyOf:
            - type: string
              minLength: 1
            - type: 'null'
        code:
          type: string
        context:
          type: object
          properties: {}
        created_at:
          type: string
          format: date-time
        read_at:
          anyOf:
            - type: string
              format: date-time
            - type: 'null'
        dedupe_key:
          anyOf:
            - type: string
            - type: 'null'
    AuditEvent:
      type: object
      properties:
        id:
          type: integer
        timestamp:
          type: string
          format: date-time
        actor_id:
          anyOf:
            - type: string
              minLength: 1
            - type: 'null'
        patient_id:
          anyOf:
            - type: string
              minLength: 1
            - type: 'null'
        action:
          type: string
        new_state:
          anyOf:
            - type: string
              description: JSON string describing outcome and context.
            - type: 'null'
    Dashboard:
      type: object
      properties:
        date:
          type: string
          format: date
        appointments:
          type: integer
        checked_in:
          type: integer
        waiting:
          type: integer
        triage:
          type: integer
        consultation:
          type: integer
        completed:
          type: integer
        no_shows:
          type: integer
        average_wait:
          anyOf:
            - type: number
            - type: 'null'
        results_pending:
          type: integer
        departments:
          type: array
          items:
            type: object
            properties:
              name:
                type: string
              patients:
                type: integer
              waiting:
                type: integer
              average_wait:
                anyOf:
                  - type: number
                  - type: 'null'
              longest_wait:
                anyOf:
                  - type: number
                  - type: 'null'
            required:
              - name
              - patients
              - waiting
              - average_wait
              - longest_wait
        doctors:
          type: array
          items:
            type: object
            properties:
              name:
                type: string
              appointments:
                type: integer
              waiting:
                type: integer
              completed:
                type: integer
              average_consultation:
                anyOf:
                  - type: number
                  - type: 'null'
            required:
              - name
              - appointments
              - waiting
              - completed
              - average_consultation
      required:
        - date
        - appointments
        - checked_in
        - waiting
        - triage
        - consultation
        - completed
        - no_shows
        - average_wait
        - results_pending
        - departments
        - doctors
    RefreshResponse:
      type: object
      properties:
        access_token:
          type: string
        role:
          type: string
          enum:
            - patient
            - admin
            - nurse
            - doctor
        account_type:
          type: string
          enum:
            - patient
            - staff
        must_change_password:
          type: boolean
        token_type:
          type: string
          enum:
            - bearer
      required:
        - access_token
        - token_type
        - role
        - account_type
        - must_change_password
```
