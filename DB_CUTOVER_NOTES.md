# DATABASE CUTOVER NOTES
**SQLite to Postgres Migration Path**

## 1. Abstract Abstraction
The `backend/database.js` has successfully achieved architectural parity for pilot constraints between SQLite defaults and PostgreSQL active targets.
By wrapping all raw query injections inside a `transpileQuery()` interceptor, simple `?` node-sqlite bindings are mapped over to the PostgreSQL standard `$1, $2, $3`.

## 2. Postgres Constraints 
When utilizing the PostgreSQL container:
- The `id` primary keys in `audit_logs` behave sequentially (`SERIAL`), whereas SQLite historically handled this as `AUTOINCREMENT`. Both act the same as we abstract retrieval. 
- Boolean abstractions (`is_discharged`, `is_active`) were kept entirely as `INTEGER` mapped `0` or `1` natively to ensure full consistency regardless of the underlying driver.

## 3. Scale-Up Requirements (Post-Pilot)
While functional for the phase, this is NOT a massive-scale architecture.
Before extending to over 100 concurrently active staff members:
- `database.js` currently leverages `pg.Pool` without an explicit size binding constraint. It relies on the Postgres driver default. A complex `max: 20` or higher parameter configuration will be necessary.
- We execute table migrations as raw string execution (`CREATE TABLE IF NOT EXISTS`). Future updates require an incremental step sequencer like Flyway or Prisma for safe evolution constraints.
- We have applied 6 primary structural `CREATE INDEX` modifiers on the Postgres side specifically targeting foreign keys to handle short-term join lag.

## 4. Deployment Trigger
Set `DB_DIALECT=postgres` and `DATABASE_URL=....` to engage Postgres exclusively.
