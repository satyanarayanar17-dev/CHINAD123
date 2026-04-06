# RESTRICTED WEB PILOT ROLLOUT PLAN
**Target Audience:** Staff Access Only
**Current Date:** 2026-04-06

---

## 1. Objectives
- Establish operational stability over a 2-week testing window with non-critical PHI or explicitly generated clinical dummy data.
- Validate the new Admin Provisioning UI workflow before allowing autonomous institutional routing.

## 2. Infrastructure Footprint
The deployment expects an uncompromised Docker Engine environment.
We run exactly two containers per instance:
- `backend` (Express.js on Node 18 Alpine)
- `frontend` (Nginx Alpine serving static Vite assets with a proxy reverse redirect to the Node cluster)
- `db` (Postgres:15-Alpine isolated image)

## 3. Launch Checklist (Day 0)
1. **Clone & Config:** Pull standard repository onto target host. Connect to the institutional VPN constraint or network gate.
2. **Environment File Generation:**
   `cp .env.compose.example .env.compose`
   Insert highly complex, unique cryptographic strings into `JWT_SECRET` and `POSTGRES_PASSWORD`. Use institutional origin mappings for `CORS_ORIGIN`. Ensure `PILOT_AUTH_BYPASS` is absent.
3. **Container Boot:** Start instances via `docker compose up -d`. All networks and volumes will auto-generate.
4. **Seed Provision (Destructive Execute):** Run the one-time required command: 
   `docker compose exec backend node scripts/deploy-seed.js --confirm-destroy`
5. **Initial Health Probe:** Execute a standard `curl http://[your_domain]/api/health`. Confirm `ok` status.
6. **Administrator Takeover:** Browse to login page, utilize default `admin_qa` credentials, immediately utilize the new "Staff Access & Directory" module to change the administrator password. 

## 4. Immediate Fallback Triggers
Execute the rollback plan (`ROLLBACK_PLAN.md`) if:
- API endpoints report HTML bodies instead of JSON (indicates Nginx proxy failure).
- Users report cross-session collisions or overriding note drafts (indicates OCC headers are dropping at the firewall layer).
- Admin dashboard reports missing modules or fails to fetch active identities.
