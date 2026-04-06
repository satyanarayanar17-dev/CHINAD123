# MIGRATION COMMANDS
**Chettinad Care Pilot Provisioning**

The following explicit system commands are approved for restricted pilot modification:

---

## The Seed Provisioner
### Destructive Override
This command entirely drops all schema constructs, recreates them, and pushes base QA accounts necessary to test the interface without a UI workflow.
**ONLY run on initial environment spin-up.**
`docker compose exec backend node scripts/deploy-seed.js --confirm-destroy`

---

## DB Reset Without Server Restart
For Staging only (requires active ADMIN token over API request):
`curl -X POST http://localhost:3001/api/internal/seed-reset -H "Authorization: Bearer <ADMIN_TOKEN>"`

*(Note: Production container flags inherently block this endpoint with `403 FORBIDDEN_ENV` regardless of standard token hierarchy, proving its utility only in sandbox validation layers).*
