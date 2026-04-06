# DB MIGRATION PLAN
**Chettinad Care — SQLite → PostgreSQL Deployable Persistence**
**Date:** 2026-04-06

---

## Current DB State

The system already has a **dual-dialect abstraction** implemented in `backend/database.js`:

```js
const dbDialect = process.env.DB_DIALECT || 'sqlite';
```

Functions `run()`, `get()`, `all()` transparently translate SQLite `?` bindings to PostgreSQL `$1, $2` positional parameters via `transpileQuery()`.

PostgreSQL is already in `docker-compose.yml` with a health check and `pgdata` volume.

The schema for both dialects exists in `resetAndSeedDatabase()`.

**This means: the primary DB migration work is already done architecturally.** The gap is operational and environmental, not structural.

---

## Gap Analysis

### Gaps Remaining

1. **No idempotent schema migration** — `resetAndSeedDatabase()` uses `DROP TABLE IF EXISTS CASCADE`, which means running the seed script on an existing database destroys all data. There is no incremental migration path.

2. **Seed data is static and hardcoded** — The pilot seed in `deploy-seed.js` has hardcoded patient IDs (`pat-1`, `pat-2`, `pat-3`). Any re-seed destroys previous data.

3. **PostgreSQL schema lacks production PG-specific features** — e.g., `TEXT` vs `VARCHAR`, no explicit indexes on foreign keys, no `NOT NULL` constraints beyond the bare minimum.

4. **`audit_logs.id` is `SERIAL` in PG vs `INTEGER AUTOINCREMENT` in SQLite** — This is handled differently by each dialect. The current code works because it never reads back `lastID` for audit_logs.

5. **No connection pool tuning** — `pg.Pool` is created with no explicit pool configuration. Defaults are: `max: 10, idleTimeoutMillis: 30000`. For a small restricted pilot, this is acceptable.

---

## Migration Strategy

### For Restricted Pilot (This Pass)

**Do not implement full incremental migration (e.g., Flyway/Liquibase).** This would be premature architecture for a restricted pilot.

**Instead:**
1. Use `scripts/deploy-seed.js` as the one-time provisioner for the restricted web pilot.
2. Document that re-running this script is destructive (data loss).
3. Add a `--confirm-destroy` flag guard to the script to prevent accidental re-run.
4. Document the backup procedure before any re-seed.

### Schema Enhancements for PostgreSQL (This Pass)

Add indexes on commonly queried foreign keys to prevent full table scans as data grows:

```sql
CREATE INDEX IF NOT EXISTS idx_encounters_patient_id ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_is_discharged ON encounters(is_discharged);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_encounter_id ON clinical_notes(encounter_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_encounter_id ON prescriptions(encounter_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_patient_id ON audit_logs(patient_id);
```

These are added to the PostgreSQL branch of `resetAndSeedDatabase()`.

### OCC Preservation

The current `__v` integer column OCC exists in both SQLite and PostgreSQL schemas identically. The `AND __v = ?` atomic update guard works the same way in both dialects. **No OCC changes required.**

### Data Type Alignment

| Column          | SQLite Type   | PostgreSQL Type | Notes |
|-----------------|---------------|-----------------|-------|
| id (all tables) | TEXT          | TEXT            | OK    |
| __v             | INTEGER       | INTEGER         | OK    |
| is_discharged   | INTEGER (0/1) | INTEGER (0/1)   | PG lacks BOOLEAN but INTEGER works |
| timestamp       | DATETIME      | TIMESTAMP       | Different default behavior — PG uses UTC |
| password_hash   | TEXT          | TEXT            | OK    |

The `DATETIME DEFAULT CURRENT_TIMESTAMP` in SQLite vs `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` in PG produce the same result (UTC wall time). No code changes needed.

---

## Deployment Switch

To switch from SQLite to PostgreSQL:

1. Set `DB_DIALECT=postgres` in environment
2. Set `DATABASE_URL=postgres://user:pass@host:5432/dbname`
3. Run `node scripts/deploy-seed.js` once (DESTRUCTIVE — backs up first)
4. Start `node server.js`

The existing docker-compose already wires this correctly via:
```yaml
DB_DIALECT=postgres
DATABASE_URL=postgres://chettinad:...@db:5432/chettinad_pilot
```

---

## Backup Notes

Before any pilot deployment:
```bash
pg_dump -U chettinad -d chettinad_pilot > backup_$(date +%Y%m%d_%H%M%S).sql
```

To restore:
```bash
psql -U chettinad -d chettinad_pilot < backup_20260406_120000.sql
```

These are documented in OPERATIONAL_RUNBOOK.md.

---

## Data Loss Assumptions

- Any re-run of `deploy-seed.js` destroys all data (DROP TABLE CASCADE)
- The deployer is responsible for backing up before re-seeding
- For the restricted pilot, the seed data is static test data only — no real PHI
- Real PHI MUST NOT be entered into the pilot database until this limitation is formally resolved

---

## Verdict

DB migration state: **PostgreSQL-ready architecture already in place**

Outstanding work:
- Add `--confirm-destroy` guard to deploy-seed.js
- Add PostgreSQL-specific indexes to schema
- Write backup/restore procedure (OPERATIONAL_RUNBOOK.md)
- Remove SQLite from production boot path (env validator)

No structural DB migration needed — the abstraction layer is functional.
