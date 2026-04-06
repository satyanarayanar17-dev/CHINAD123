# OPERATIONAL RUNBOOK
**Chettinad Care — Restricted Web Pilot**

## 1. Routine Backups
Execute via the container orchestrator prior to any maintenance window:
`docker compose exec db pg_dump -U chettinad chettinad_pilot > pilot_backup_$(date +%F).sql`

## 2. Emergency Recovery
**Database Corruption / Accidental Seed Trigger:**
```bash
docker compose exec -T db psql -U chettinad -d chettinad_pilot < pilot_backup_YYYY-MM-DD.sql
```

## 3. Logs Review
To observe all correlated internal traces and verify if API endpoints are capturing mutations cleanly:
`docker compose logs -f backend`
**Grep Strategy:** The logs output `[REQ] GET /api/... | CID: <uuid>`. Tracing concurrency errors involves searching the `<uuid>`.

## 4. Environment Check
Execute a probe to guarantee the server environment validator hasn't stalled out from a faulty JWT secret on restart:
`curl -I http://localhost:3001/api/health`

## 5. Security Incident - Key Compromise
If the `JWT_SECRET` is suspected capable of unauthorized exposure:
1. Revoke the environment variable and replace it via `openssl rand -hex 32`.
2. Cycle the containers `docker compose up -d --force-recreate backend`.
3. Inform all staff that they must actively log back in, as previous JWT tokens are now globally invalid.
