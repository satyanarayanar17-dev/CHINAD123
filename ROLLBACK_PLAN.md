# SYSTEM ROLLBACK PLAN
**Condition:** Reverting the Restricted Pilot to baseline local prototyping constraints safely.

**Purpose:** Provide immediate instructions if the pilot fails structurally during the trial.

### Procedure 1: Container Abandonment
If the Docker architecture fails to parse local variables or reverse proxying creates infinite loops:
1. `docker compose down -v` (Eliminates the stack entirely and destroys the volume).
2. Resume utilizing `npm run dev` and `npm start` natively through the developer's node.js installation.

### Procedure 2: Auth Requirement Abandonment
If staff cannot reliably maintain passwords or access limits prevent clinical operations:
1. Access `backend/.env`.
2. Switch `APP_ENV` to `local_dev`.
3. Set `PILOT_AUTH_BYPASS=true`.
4. This explicitly bypasses bcrypt verifications matching users lacking password hashes, reverting identity validation strictly to user selection.

### Procedure 3: Reverting from Postgres to SQLite
1. Access `.env.compose` or `.env`.
2. Overwrite `DB_DIALECT=sqlite`.
3. Strip away `DATABASE_URL` references.
4. Execute restart. The SQLite abstraction logic reëngages identically, executing raw file storage over a TCP port connection.
