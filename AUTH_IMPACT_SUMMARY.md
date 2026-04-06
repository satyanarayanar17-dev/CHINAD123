# AUTHENTICATION IMPACT SUMMARY
**Chettinad Care Hardening Phase**

## For Frontend Engineers:
1. **No More Bypass Mode:** The local API interceptor trick `PILOT_AUTH_BYPASS=true` is formally removed and disabled from generating any valid JWT tokens in production modes. Attempts to manipulate JWT state to mock users will return standard `401 Unauthorized`.
2. **Role Enforcements:** Component visibility must align with backend scope constraints (e.g., Doctors cannot access `adminApi.ts` endpoints). The frontend will crash if you attempt to use Axios to hit restricted components.
3. **Password Reality:** Any UI e2e testing suites that hit `/api/auth/login` must be updated to pass a literal password variable instead of omitting the field entirely.

## For Hospital Network Admins:
1. **Account Registration:** You can no longer provision users via SQL direct inserts effectively unless you hash the password manually using bcrypt (cost factor 10). You MUST use the newly provided "Staff Directory & Access" UI inside the `AdminDashboard`.
2. **Patient Connectivity Block:** Patient authentication routes were forcefully scoped down. Even if a URL trick exposes the web page to a patient, they cannot create an account, nor log into an account, nor view active institutional data. 

## For Database Operations:
1. **Password Columns:** The `users.password_hash` column is now mandatory for login success unless explicitly bypassed in localized SQLite dev instances. 
