# Hospital Deployment Handoff

## Overview
Chettinad Care v2 is functionally ready for deployment. This document outlines the mandatory infrastructure configuration, environment setup, and verification steps that the hospital IT/operations team must complete before initiating the production pilot.

## Pre-Requisites
1. **Hosting Environment**: A secure server running Node.js 24 and Nginx/TLS termination, or a corresponding container orchestration platform.
2. **Database**: A production-grade PostgreSQL instance with automated backups and encrypted storage.
3. **SMS Service**: An active SMS gateway account capable of sending OTPs.

## Environment Variables
The following environment variables **must** be securely configured in production:

### Application & Environment
- `NODE_ENV=production`
- `APP_ENV=production`
- `CORS_ORIGIN=https://your-hospital-domain.com` (Explicit HTTPS origin)

### Database
- `DB_DIALECT=postgres`
- `DATABASE_URL=postgres://user:password@host:port/database`
- (Configure DB TLS settings as required by the host)

### Security
- `JWT_SECRET`: A high-entropy, secret cryptographic key. **Do not use the local default.**
- `SESSION_SECURE=true`

### SMS Provider
- `SMS_WEBHOOK_URL`: The URL of the hospital's approved SMS gateway.
- `SMS_WEBHOOK_TOKEN`: The authorization token for the SMS gateway.

## Production Initialization Steps
1. **Provision Infrastructure**: Set up TLS/SSL certificates and DNS routing.
2. **Database Migration**: Ensure the application executes all pending migrations on startup against the PostgreSQL instance.
3. **Bootstrap Admin**: Use the bootstrap admin credentials to perform the initial login. Change the password immediately upon first login.
4. **Staff Provisioning**: Create the required staff accounts (doctors, nurses, administrators) via the Admin dashboard. Do not use synthetic or demo users in production.

## Acceptance & Smoke Tests (Post-Deployment)
Once deployed, the IT team must verify the following in the live environment:
1. Staff login and password-change enforcement.
2. Patient OTP delivery via the actual SMS gateway.
3. Role segregation (ensure a Nurse cannot access Doctor workspaces).
4. Secure connectivity (verify HTTPS and TLS termination).

**Support & Maintenance:** Routine PostgreSQL backups and application logs must be monitored actively to ensure encounter lifecycle integrity.
