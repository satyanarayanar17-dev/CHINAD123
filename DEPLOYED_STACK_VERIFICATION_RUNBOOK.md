# DEPLOYED STACK VERIFICATION RUNBOOK
**Objective:** Final gate runtime proof for Chettinad Care restricted pilot.

Since automated CI runners exist in sandboxes without native Docker access, physical verification must be executed by the authorized deployer on their host machine.

### Prerequisites
1. Docker Engine functioning on the active host.
2. The current `chettinad-care-frontend` repository structure intact.

---

### Phase 1: Environment Hardening Triggers
Execute these exact commands from your host to verify boot failsafe mechanisms dynamically. Prove the application terminates cleanly when deployable boundaries are violated.

```bash
# 1. Test missing secrets (Should exit immediately with FATAL)
docker compose --env-file .env.compose run --rm \
  -e NODE_ENV=production \
  -e DB_DIALECT=postgres \
  -e JWT_SECRET="" \
  backend node server.js

# 2. Test insecure default secrets (Should exit immediately with FATAL)
docker compose --env-file .env.compose run --rm \
  -e NODE_ENV=production \
  -e DB_DIALECT=postgres \
  -e JWT_SECRET="pilot-beta-secure-secret-key" \
  backend node server.js

# 3. Test illegal Auth Bypass in Prod (Should exit immediately with FATAL)
docker compose --env-file .env.compose run --rm \
  -e NODE_ENV=production \
  -e DB_DIALECT=postgres \
  -e PILOT_AUTH_BYPASS="true" \
  backend node server.js

# 4. Test missing or wildcard CORS Origin (Should exit immediately with FATAL)
docker compose --env-file .env.compose run --rm \
  -e NODE_ENV=production \
  -e DB_DIALECT=postgres \
  -e CORS_ORIGIN="*" \
  backend node server.js
```

---

### Phase 2: Full Stack Initialization

Prepare the secure environment file for final test harness execution:
```bash
cp .env.compose.example .env.compose
# Modify .env.compose utilizing strict replacements:
# JWT_SECRET=32CharacterCryptographicStringForValidation
# POSTGRES_PASSWORD=SecurePassword123
# CORS_ORIGIN=http://localhost
```

Boot the entire infrastructure graph:
```bash
docker compose --env-file .env.compose up -d --build
```

Verify containers are healthy and log traces prove connections:
```bash
docker compose ps
docker compose logs backend --tail=100
docker compose logs frontend --tail=100
docker compose logs db --tail=100
```
*(Ensure the backend logs strictly report Postgres is the active DB abstraction and no SQLite instances survived).*

---

### Phase 3: Postgres Data Seeding
Execute the database schema setup exclusively on the fresh DB:
```bash
docker compose exec backend node scripts/deploy-seed.js --confirm-destroy
```

*Note on CTO Verdict: While the seed script uses `Password123!` to bootstrap QA targets for convenience, actual pilot rollout will rotate this manually via Admin UI immediately. For evaluation, this is a known limit maintaining the "Conditionally Ready" verdict.*

---

### Phase 4: Runtime Verification via Nginx Proxy
Run the verification suite from the **HOST machine** to successfully cross the proxy boundary, verifying `browser -> Nginx -> backend` connection mapping.

```bash
cd backend
npm install
API_BASE=http://localhost/api/v1 node verify.js
```

*Wait for output verifying 25/25 Tests Passing.*
*This proves Postgres OCC hooks remain perfectly intact via the full reverse proxy resolution.*

---

### Phase 5: Final Security Guard Audit
Attempt to trigger the locked `seed-reset` endpoint remotely via the host Nginx proxy.

```bash
# Fetch an admin token programmatically
ADMIN_JWT=$(curl -s http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"id":"admin_qa","password":"Password123!"}' | jq -r '.token')

# Attempt remote seed-reset override 
# Expected: Blocked by default unless ALLOW_SEED_RESET=true 
# (May surface as 403, 404, or hard refusal, provided it is not executable by default)
curl -i -X POST http://localhost/api/v1/internal/seed-reset \
  -H "Authorization: Bearer $ADMIN_JWT"
```

---

### End-to-End Required Evidence Checklist
Bring the following proofs back from the manual execution:

**Boot Guards (Terminal Output):**
- [ ] `JWT_SECRET` missing/default hard-fails startup.
- [ ] `PILOT_AUTH_BYPASS=true` hard-fails startup.
- [ ] Invalid/wildcard CORS hard-fails or rejects in restricted pilot.

**Runtime Integrity:**
- [ ] `docker compose ps` shows backend, frontend (proxy), and Postgres `UP`.
- [ ] Logs show active connection to Postgres (SQLite inactive).
- [ ] Run `verify.js` *from host through* the Nginx proxy path (`http://localhost/api/v1`), proving the browser → Nginx → backend chain holds.

**Clinical / Admin Boundaries:**
- [ ] Staff login success / disabled staff failure.
- [ ] Admin lifecycle (create/disable/reset) functions, and non-admins are blocked.
- [ ] Clinical OCC conflicts (Notes + Prescriptions) visibly trigger.
- [ ] Break-glass override works, whilst standard patient chart access is denied.
- [ ] Patient login module is disabled.
- [ ] Remote `seed-reset` blocked via proxy path without environment kill-switch.

### Signoff Target Result
If all physical evidence proves the deployed stack functions unconditionally under these gates, the system clears the gate: **Conditionally ready for restricted staff pilot** (given explicit pilot conditions like seed password generation).
