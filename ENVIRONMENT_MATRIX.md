# ENVIRONMENT MATRIX
**Chettinad Care — Deployment Environment Definitions**
**Version:** 1.0 — Restricted Web Pilot Pass

---

## Environment Definitions

| Variable / Flag        | `local_dev`            | `local_pilot`          | `restricted_web_pilot`       |
|------------------------|------------------------|------------------------|-------------------------------|
| **NODE_ENV**           | `development`          | `development`          | `production`                  |
| **APP_ENV**            | `local_dev`            | `local_pilot`          | `restricted_web_pilot`        |
| **DB_DIALECT**         | `sqlite`               | `sqlite` or `postgres` | `postgres` (REQUIRED)         |
| **DATABASE_URL**       | not required           | optional               | REQUIRED — postgres:// URL    |
| **JWT_SECRET**         | any (fallback allowed) | MUST be set            | REQUIRED — no fallback, 32+ chars |
| **CORS_ORIGIN**        | `*` (open)             | specific host          | REQUIRED — specific host only |
| **PILOT_AUTH_BYPASS**  | `true` allowed         | `false` REQUIRED       | MUST NOT be set               |
| **AUTH_MODE**          | bypass or password     | password REQUIRED      | password ONLY                 |
| **SEED_ON_BOOT**       | yes (auto)             | explicit only          | NEVER (separate script)       |
| **PORT**               | 3001                   | 3001                   | 3001 or container-assigned    |

---

## Required Variables Per Environment

### local_dev
No strict requirements. Server runs with SQLite and optional bypass.
```env
# No required variables — permissive local dev mode
PILOT_AUTH_BYPASS=true
NODE_ENV=development
DB_DIALECT=sqlite
```

### local_pilot
Password auth enforced. Seed must be run manually.
```env
NODE_ENV=development
APP_ENV=local_pilot
DB_DIALECT=sqlite
JWT_SECRET=<set-a-unique-value-here>
PILOT_AUTH_BYPASS=false   # MUST be false
CORS_ORIGIN=http://localhost:5173
PORT=3001
```

### restricted_web_pilot
Strict mode. Missing vars = boot failure.
```env
NODE_ENV=production
APP_ENV=restricted_web_pilot
DB_DIALECT=postgres
DATABASE_URL=postgres://<user>:<password>@<host>:5432/<dbname>
JWT_SECRET=<cryptographically-random-32+-character-string>
CORS_ORIGIN=https://<your-pilot-domain.example.com>
PILOT_AUTH_BYPASS=   # Must be absent or empty — NOT "true"
PORT=3001
```

---

## Forbidden Flags in restricted_web_pilot

| Flag / Variable        | Forbidden Value | Risk If Present                           |
|------------------------|-----------------|-------------------------------------------|
| `PILOT_AUTH_BYPASS`    | `true`          | Auth bypass, session forgery possible     |
| `JWT_SECRET`           | (unset)         | Token verification disabled               |
| `JWT_SECRET`           | `pilot-beta-secure-secret-key` | Known public weak key        |
| `NODE_ENV`             | `development`   | Boot guards bypassed                      |
| `DB_DIALECT`           | `sqlite`        | File-based DB, no multi-user safety       |
| `DATABASE_URL`         | (unset)         | PG dialect will crash on first DB call    |
| `CORS_ORIGIN`          | `*`             | Any origin can call API                   |

---

## Auth Mode by Environment

| Environment            | Auth Mode              | Password Hashing | Bypass Allowed |
|------------------------|------------------------|-----------------|----------------|
| local_dev              | Bypass OR password     | Optional (bcrypt if hash exists) | YES |
| local_pilot            | Password ONLY          | bcrypt (cost 10) | NO             |
| restricted_web_pilot   | Password ONLY          | bcrypt (cost 10) | NO — boot fail |

---

## DB Backend by Environment

| Environment            | DB Backend             | Seed Behavior                          |
|------------------------|------------------------|-----------------------------------------|
| local_dev              | SQLite (file)          | Auto-seeded on `resetAndSeedDatabase()` |
| local_pilot            | SQLite or PostgreSQL   | Manual via `node scripts/deploy-seed.js` |
| restricted_web_pilot   | PostgreSQL (REQUIRED)  | Manual via `node scripts/deploy-seed.js` (ONCE, before go-live) |

---

## CORS Policy

| Environment            | CORS Policy                              |
|------------------------|------------------------------------------|
| local_dev              | Open (`*`)                               |
| local_pilot            | Specific host (e.g. `http://localhost:5173`) |
| restricted_web_pilot   | Specific HTTPS host (e.g. `https://pilot.chettinad.internal`) |

---

## Seed Behavior by Environment

| Environment            | Seed Behavior                            | Who Can Trigger                         |
|------------------------|------------------------------------------|-----------------------------------------|
| local_dev              | Auto on `POST /api/internal/seed-reset` (dev only, but requires any auth in this pass) | Dev engineer with auth |
| local_pilot            | Manual: `node scripts/deploy-seed.js`    | Engineer with server access             |
| restricted_web_pilot   | Manual once: `node scripts/deploy-seed.js` before first boot | Infra team ONLY — BLOCKED via API |

---

## Required Variables Checklist (restricted_web_pilot)

On startup in `NODE_ENV=production`, server MUST validate:
- [ ] `JWT_SECRET` is set and not the default value
- [ ] `JWT_SECRET` length >= 32 characters
- [ ] `DATABASE_URL` is set (if `DB_DIALECT=postgres`)
- [ ] `CORS_ORIGIN` is set (no wildcard)
- [ ] `PILOT_AUTH_BYPASS` is not `true`

Server MUST `process.exit(1)` if any of the above fail.
