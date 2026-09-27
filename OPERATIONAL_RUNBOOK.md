# OPERATIONAL RUNBOOK
**Chettinad Care — Restricted Web Pilot**
**Backing store: SQLite (single-file) — pilot path**

This runbook covers day-to-day operation, admin bootstrap, staff onboarding, patient activation, password reset, backup/restore, and incident recovery for the controlled pilot. Keep this document open during any deployment or maintenance window.

---

## Contents

1. [Health checks](#1-health-checks)
2. [Logs and observability](#2-logs-and-observability)
3. [How to bootstrap the first admin](#3-how-to-bootstrap-the-first-admin)
4. [How to create staff users](#4-how-to-create-staff-users)
5. [How patient activation works](#5-how-patient-activation-works)
6. [How password reset works](#6-how-password-reset-works)
7. [SQLite backup procedure](#7-sqlite-backup-procedure)
8. [SQLite restore procedure](#8-sqlite-restore-procedure)
9. [Safe migration / upgrade sequence](#9-safe-migration--upgrade-sequence)
10. [Recovery from lockout or broken deployment](#10-recovery-from-lockout-or-broken-deployment)
11. [Security incident — JWT secret compromise](#11-security-incident--jwt-secret-compromise)
12. [Env/config reference](#12-envconfig-reference)

---

## 1. Health checks

**Detailed health (use for diagnostics):**
```
GET /api/v1/health
```
Returns: status, db reachability, migration alignment, admin count, data-integrity summary.
HTTP 200 = healthy. HTTP 503 = degraded or boot failure.

**Lightweight readiness probe (use for orchestrators / load-balancer checks):**
```
GET /api/v1/ready
```
Returns: ready boolean, db_status, migration state.
HTTP 200 = ready to serve. HTTP 503 = not ready.

**Quick smoke test from host machine:**
```bash
# Local docker-compose
curl -s http://localhost/api/v1/health | python3 -m json.tool

# Direct backend port (bypass nginx)
curl -s http://localhost:3001/api/v1/health | python3 -m json.tool

# Railway / Render deployment
curl -s https://YOUR-BACKEND-DOMAIN/api/v1/health | python3 -m json.tool
```

Expected `status` values:
- `"ok"` — all checks passed
- `"degraded"` — DB reachable but migrations out of date or no admin exists
- `503` response body — DB unavailable or fatal boot error

---

## 2. Logs and observability

All logs are single-line JSON written to stdout. Every event has:
```json
{ "level": "info|warn|error", "event": "event_name", "timestamp": "...", ...context }
```

Sensitive fields (passwords, OTPs, tokens, JWT secrets) are automatically redacted to `[REDACTED]`.

Every HTTP request and response carries a `x-correlation-id` header. Log entries include `correlationId` so you can trace a full request thread:

```bash
# Follow live backend logs (docker-compose)
docker compose logs -f backend

# Follow live backend logs (Railway)
railway logs --tail

# Trace a specific correlation ID
docker compose logs backend 2>&1 | grep "CORRELATION-ID-HERE"

# Show only warnings and errors
docker compose logs backend 2>&1 | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        obj = json.loads(line)
        if obj.get('level') in ('warn', 'error'):
            print(line.rstrip())
    except: pass
"
```

**Key events to watch for in logs:**

| event | meaning |
|---|---|
| `boot_config_warning` | Non-fatal config issue on startup |
| `boot_config_invalid` | Fatal — server refused to start |
| `server_listening` | Server started successfully |
| `request_failed` | An API request returned 4xx/5xx |
| `auth_failed_password` | Login attempt with wrong password |
| `auth_unknown_user` | Login attempt for nonexistent user |
| `auth_boundary_violation` | Staff credential used on patient path or vice versa |
| `route_role_violation` | Authenticated user tried a forbidden route |
| `revocation_check_degraded` | DB was unavailable during token revocation check |
| `audit_write_failed` | Audit log could not be written — investigate immediately |
| `db_rollback_failed` | Transaction rollback failed — may indicate DB corruption |
| `draft_cleanup_failed` | Background cleanup job failed |

---

## 3. How to bootstrap the first admin

**First-time deploy only.** If an ADMIN user already exists in the database, the bootstrap is silently skipped.

### Step 1 — Set env vars before starting the server

```bash
BOOTSTRAP_ADMIN_ID=pilot_admin
BOOTSTRAP_ADMIN_NAME="Pilot Admin"
BOOTSTRAP_ADMIN_PASSWORD=SomeStrongPassword123!
```

Rules:
- All three vars must be set together or none at all.
- `BOOTSTRAP_ADMIN_PASSWORD` must be at least 12 characters.
- The server creates the account on boot, then the env vars can be removed.

### Step 2 — Start the server

```bash
# docker-compose
docker compose up -d

# direct
cd backend && npm start
```

The boot log will contain:
```json
{"level":"info","event":"bootstrap_admin_created","userId":"pilot_admin","timestamp":"..."}
```

### Step 3 — Verify and change password

1. Sign in at `/login` with the bootstrap credentials.
2. Navigate to **Admin → Staff Directory** to create real staff users.
3. Disable or delete the bootstrap account once a real admin is provisioned.

### Disaster recovery (no admin exists, vars not set)

If the server refuses to start with `No ADMIN account exists`, set the `BOOTSTRAP_ADMIN_*` vars and restart. The account is created if and only if the `id` does not already exist.

---

## 4. How to create staff users

Staff users (doctors, nurses, admins) are created through the application, not via scripts.

1. Sign in as an ADMIN user.
2. Navigate to **Admin Dashboard → Staff Directory & Access**.
3. Click **Add Staff Member**.
4. Fill in: full name, login ID, role (DOCTOR / NURSE / ADMIN), department, and an initial password.
5. The user receives a `must_change_password = true` flag — they are required to change the password on first login.
6. Share the initial credentials securely (phone call or in-person — not email or messaging apps).

**Password rules:**
- Minimum 8 characters.
- Staff must change their initial password before accessing any other screen.

**To deactivate a staff user:**
1. Admin Dashboard → Staff Directory → find the user.
2. Click **Deactivate**. Their sessions are immediately invalidated (token revocation record written).

**To re-enable a staff user:**
1. Admin Dashboard → Staff Directory → find the inactive user.
2. Click **Re-activate**.

---

## 5. How patient activation works

Patient activation is a two-step flow:

### Step 1 — Staff generates an activation code

Prerequisites:
- Patient record exists with a validated phone number.
- Patient has an active encounter (created via Patient Onboarding).

Trigger: Admin or Nurse navigates to the patient record and clicks **Generate Activation Code**. This calls `POST /api/v1/activation/generate` and returns a 6-digit OTP.

The OTP is:
- Valid for **30 minutes** (hardcoded).
- Single-use — it is consumed on first successful claim.
- Hashed in the database (the plaintext is never stored).
- Rate-limited: 5 generations per staff user per 10 minutes.

Delivery: Staff shares the code with the patient over the phone or in person.

### Step 2 — Patient claims the account

1. Patient opens `/patient/activate` in a browser.
2. Enters their registered mobile number and the 6-digit OTP.
3. Sets a new password (minimum 8 characters).
4. On success, a PATIENT-role user account is created linked to the patient record.
5. Patient can now log in at `/login` using their mobile number and new password.

**Error states and responses:**

| code | meaning | action |
|---|---|---|
| `ACTIVATION_CODE_USED` | Token already consumed | Check if account already exists; generate a new code if not |
| `INVALID_TOKEN` | Wrong OTP | Up to 5 attempts before the token is locked |
| `EXPIRED_TOKEN` | OTP expired (>30 min) | Generate a new activation code |
| `ACTIVATION_ATTEMPTS_EXCEEDED` | 5 wrong attempts | Token is locked until expiry; generate a new code |
| `ACCOUNT_EXISTS` | Portal account already activated | Patient should log in normally |
| `PHONE_REQUIRED` | No phone on patient record | Admin must add a phone number first |

**Rate limiting:** 12 claim attempts per phone/IP per 20-minute window.

---

## 6. How password reset works

### Staff password reset (admin-initiated)

Only an ADMIN can reset another staff user's password. There is no self-service staff password reset.

1. Admin Dashboard → Staff Directory → find the user.
2. Click **Reset Password**.
3. A new temporary password is shown **once** — copy it immediately and share it with the user.
4. The user's `must_change_password` flag is set to `true`.
5. The user must change the password on their next login before accessing any screen.

Rate limit: 3 resets per admin per target user per 15 minutes.

### Staff self-service password change

Any authenticated staff user can change their own password at:
- Account menu → **Change Password**
- Or directly at `/change-password`

They must provide their current password and a new password (minimum 8 characters).

### Patient password reset

There is no self-service patient password reset in this pilot. If a patient forgets their password:

1. Admin generates a new activation code for the patient.
   - This requires the patient to have an active encounter.
   - If the patient already has a user account but needs a password reset: the admin must delete the existing PATIENT user from the database, then generate a new activation code.
2. Patient claims the new code and sets a new password.

**To delete a patient user account for re-activation (database operation — use with caution):**
```bash
# Stop the backend first for SQLite safety
cd backend
node -e "
const { get, run } = require('./database');
(async () => {
  const user = await get('SELECT id FROM users WHERE patient_id = ? AND role = ?', ['PATIENT_ID_HERE', 'PATIENT']);
  if (user) {
    await run('DELETE FROM users WHERE id = ?', [user.id]);
    await run('DELETE FROM patient_activation_tokens WHERE patient_id = ?', ['PATIENT_ID_HERE']);
    console.log('Deleted user and token for patient');
  } else {
    console.log('No patient user found');
  }
})();
"
```

Replace `PATIENT_ID_HERE` with the patient's UHID.

---

## 7. SQLite backup procedure

**IMPORTANT:** Take a backup before every deployment, migration, or maintenance window.

### Automated backup (recommended)

```bash
# From the repo root or backend directory:
cd backend && npm run backup:db
```

This runs `backend/scripts/backup-sqlite.js`, which:
1. Opens the live SQLite file read-only.
2. Uses `VACUUM INTO` to write a defragmented, consistent snapshot.
3. Names the file `backend/backups/backup-YYYY-MM-DDTHH-MM-SS.db`.
4. Keeps the last 30 backups (configurable via `BACKUP_KEEP_COUNT`).

**From inside a container (docker-compose):**
```bash
docker compose exec backend npm run backup:db
```

The backup lands at `backend/backups/` inside the container. Copy it out:
```bash
docker compose cp backend:/app/backups/backup-LATEST.db ./backups/
```

Or mount a volume for the backups directory so they persist on the host.

### Manual backup (online, server running)

```bash
# Using sqlite3 CLI (installed separately or via Homebrew)
sqlite3 backend/verification.db ".backup backend/backups/manual-$(date +%Y%m%d-%H%M%S).db"
```

### Manual backup (offline, server stopped — most conservative)

```bash
# Stop the backend
# Then copy the file:
cp backend/verification.db backend/backups/offline-$(date +%Y%m%d-%H%M%S).db
# Also copy WAL file if it exists:
[ -f backend/verification.db-wal ] && cp backend/verification.db-wal backend/backups/offline-$(date +%Y%m%d-%H%M%S).db-wal
```

### Scheduled backups (cron example)

```cron
# Every 6 hours, retain 30 backups
0 */6 * * * cd /path/to/repo && SQLITE_PATH=backend/verification.db node backend/scripts/backup-sqlite.js >> /var/log/chettinad-backup.log 2>&1
```

---

## 8. SQLite restore procedure

**Use this only during a recovery incident. Stop the backend first.**

### Full restore from backup

```bash
# 1. Stop the backend
docker compose stop backend
# or: kill the node process

# 2. Identify the backup to restore
ls -lht backend/backups/

# 3. Replace the live database file
cp backend/backups/backup-YYYY-MM-DDTHH-MM-SS.db backend/verification.db

# 4. Remove any stale WAL/SHM files (they are inconsistent with the restored snapshot)
rm -f backend/verification.db-wal backend/verification.db-shm

# 5. Restart the backend
docker compose start backend
# or: cd backend && npm start

# 6. Verify health
curl -s http://localhost:3001/api/v1/health | python3 -m json.tool
```

Verify the `migrations` section in the health response shows `up_to_date: true` and `admin_access.status: "ok"`.

### Partial restore / data recovery

If you need to recover specific records from a backup without overwriting the live DB:

```bash
# Open the backup as a separate SQLite file and query it
sqlite3 backend/backups/backup-YYYY-MM-DDTHH-MM-SS.db \
  "SELECT * FROM patients WHERE id = 'TARGET_UHID';"
```

---

## 9. Safe migration / upgrade sequence

SQLite migrations in this system are append-only and tracked in the `schema_migrations` table. They run automatically on server start via `npm start` (which calls `npm run migrate` first).

### Standard upgrade procedure

```bash
# 1. Take a backup
cd backend && npm run backup:db

# 2. Stop the server
docker compose stop backend

# 3. Deploy the new code (git pull / docker build / etc.)
git pull origin main

# 4. Start the server (migrations run automatically)
docker compose start backend

# 5. Verify health — check that migrations.up_to_date = true
curl -s http://localhost:3001/api/v1/health | python3 -m json.tool
```

### Check migration status without starting the server

```bash
cd backend && node -e "
const { get, all } = require('./database');
(async () => {
  const applied = await all('SELECT id, applied_at FROM schema_migrations ORDER BY applied_at');
  console.log('Applied migrations:');
  applied.forEach(m => console.log(' -', m.id, m.applied_at));
})();
"
```

### Rollback (migrations are not reversible)

SQLite migrations in this system are not reversible by design. The rollback path is to restore from a backup taken before the migration ran:

1. Restore from the pre-upgrade backup (see §8).
2. Redeploy the previous version of the code.
3. Verify health.

---

## 10. Recovery from lockout or broken deployment state

### Server refuses to start — config error

The server logs the config validation errors to stderr and exits with code 1.

```bash
# View startup errors
docker compose logs backend --tail 50
```

Common causes and fixes:

| error | fix |
|---|---|
| `JWT_SECRET is required` | Add `JWT_SECRET` to env (generate with `openssl rand -hex 32`) |
| `JWT_SECRET must be at least 32 characters` | Regenerate: `openssl rand -hex 32` |
| `JWT_SECRET appears to be a placeholder` | Value contains "secret", "test", "dev", etc. — use a random hex string |
| `CORS_ORIGIN must be set explicitly` | Set `CORS_ORIGIN` to the exact frontend origin (e.g. `http://localhost`) |
| `PILOT_AUTH_BYPASS must be false` | Set `PILOT_AUTH_BYPASS=false` in env |
| `SQLITE_PATH must be explicitly set` | Set `SQLITE_PATH` to the DB file path |
| `ACTIVATION_OTP_DELIVERY must be set` | Set to `api_response` or `console` |

### No admin user exists

If the health endpoint reports `admin_access.status: "missing"` and you cannot log in:

1. Set the `BOOTSTRAP_ADMIN_*` env vars (see §3).
2. Restart the server — the account is created on boot.

### Admin account locked

Accounts lock after 5 consecutive failed login attempts (15-minute lockout). To unlock manually:

```bash
cd backend && node -e "
const { run } = require('./database');
(async () => {
  await run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', ['ADMIN_USER_ID']);
  console.log('Account unlocked.');
})();
"
```

Replace `ADMIN_USER_ID` with the actual user ID.

### Database file missing or corrupted

1. Stop the backend.
2. Restore from the most recent backup (see §8).
3. Restart and verify health.

If no backup exists, the system must be re-initialized:

```bash
# DESTRUCTIVE — only do this if all backups are gone and data loss is accepted
cd backend
SQLITE_PATH=verification.db BOOTSTRAP_ADMIN_ID=pilot_admin \
  BOOTSTRAP_ADMIN_NAME="Pilot Admin" BOOTSTRAP_ADMIN_PASSWORD="NewPassword123!" \
  npm run migrate
# Then start the server — bootstrap admin will be created on boot
npm start
```

### Backend crashes in a loop

```bash
# Check for repeated fatal errors
docker compose logs backend --tail 100 | grep '"level":"error"'

# Check for port conflicts
lsof -i :3001

# Check disk space (SQLite writes fail if disk is full)
df -h
```

### Frontend shows "API_MISHAP: Received HTML instead of JSON"

The Nginx proxy is not forwarding `/api/v1/*` requests to the backend. Verify:
1. Backend container is running: `docker compose ps`
2. Nginx config proxies `/api/v1/` to `http://backend:3001`: `cat nginx.conf`
3. No DNS/network issue between nginx and backend containers: `docker compose exec frontend ping backend`

---

## 11. Security incident — JWT secret compromise

If the `JWT_SECRET` is known or suspected to have been exposed:

1. **Generate a new secret:**
   ```bash
   openssl rand -hex 32
   ```

2. **Update the env var** in your deployment platform (Railway / Render / docker-compose `.env.compose`).

3. **Redeploy / restart the backend:**
   ```bash
   docker compose up -d --force-recreate backend
   ```
   All existing JWT access tokens are immediately invalid (they were signed with the old key). Refresh tokens in the database are unaffected but the new access tokens they generate will be signed with the new key.

4. **Inform all staff** that they will be logged out on their next API call and must log in again.

5. **Audit the logs** for suspicious activity in the period the secret was potentially compromised:
   ```bash
   docker compose logs backend 2>&1 | grep -E '"level":"warn"|"level":"error"' | \
     python3 -c "import sys, json; [print(json.loads(l).get('event'), json.loads(l).get('timestamp')) for l in sys.stdin if l.strip()]"
   ```

---

## 12. Env/config reference

See `backend/.env.example` for all variables with descriptions. Required variables for pilot:

| Variable | Required in pilot | Notes |
|---|---|---|
| `NODE_ENV` | Yes | `production` |
| `APP_ENV` | Yes | `restricted_web_pilot` |
| `DB_DIALECT` | Yes | `sqlite` (current pilot) |
| `SQLITE_PATH` | Yes | Absolute path or relative to `backend/` |
| `JWT_SECRET` | Yes | Min 32 chars, generated with `openssl rand -hex 32` |
| `CORS_ORIGIN` | Yes | Exact frontend origin, no trailing slash |
| `ACTIVATION_OTP_DELIVERY` | Yes | `api_response` for staff-mediated pilot |
| `COOKIE_SAME_SITE` | Yes | `lax` (same domain) or `none` (cross-domain + `COOKIE_SECURE=true`) |
| `COOKIE_SECURE` | Conditional | `true` when `COOKIE_SAME_SITE=none` |
| `BOOTSTRAP_ADMIN_*` | First deploy only | All three must be set together |
| `PILOT_AUTH_BYPASS` | No | Must be `false` or absent |
| `ALLOW_SEED_RESET` | No | Must be `false` or absent |

**Config validation runs at startup.** Missing or invalid required vars will print the specific error and exit with code 1. Check `docker compose logs backend --tail 20` for the validation failure details.
