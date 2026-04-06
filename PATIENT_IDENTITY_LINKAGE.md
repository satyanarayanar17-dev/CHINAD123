# Patient Identity Linkage Strategy

## The Problem
Currently, Chettinad Care enforces a hard boundary between authentication identity (`users` table) and clinical demographic identity (`patients` table).
- `users`: Governs JWT generation, role-based access control, and bcrypt credential hashing.
- `patients`: Governs strictly clinical properties (`dob`, `gender`, `name`) and anchors Encounter lifecycles.

In the current Phase 1 restricted pilot, ONLY clinical staff exist in `users`. Staff do not have associated `patients` records.

## The Solution: Uni-Directional Hard Linkage
To allow Patient Portal access without risking global data leakage or contaminating staff roles, we must implement a strict `patient_id` foreign key inside the authentication schema.

### Schema Migration Rule
```sql
ALTER TABLE users ADD COLUMN patient_id TEXT REFERENCES patients(id);
```

### Constraints
1. **Role Enforcement**: If `users.role = 'PATIENT'`, then `users.patient_id` MUST NOT BE NULL.
2. **Staff Isolation**: If `users.role IN ('DOCTOR', 'NURSE', 'ADMIN')`, then `users.patient_id` MUST BE NULL.
3. **Immutability**: Once a `user` account is linked to a `patient_id`, that linkage is immutable.
4. **Data Scoping Boundary**: The `PATIENT` role JWT will ONLY encode the `user.id`. The backend `requireAuth` middleware + `resolveOwnPatientId()` function will intercept the request, query the `users` table centrally, and strictly scope all database queries (e.g., `SELECT * FROM clinical_notes WHERE patient_id = ?`) to that retrieved exact ID.

### Mitigating Risk
By not relying on raw ID-based login shortcuts (e.g. logging in using the `patient_id` directly without a separate hashed password), we ensure that a leaked patient demographic ID does not equate to a compromised login token.
