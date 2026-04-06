# TEST ACCOUNT POLICY 
**Restricted Pilot Phase 1**

Test accounts are hard-coded deliberately in the restricted seed script.

## The Canonical Four

1. **nurse_qa**: Default Triaging identity. Restricted to queuing state overrides.
2. **doc1_qa**: Primary Physician. Granted OCC-locking notes authorization.
3. **doc2_qa**: Secondary Physician. Useful for confirming concurrent OCC locking and validating encounter discharge requirements.
4. **admin_qa**: Sole authoritative identity with backend privileges required to execute User Account provisioning via the newly established directory API.

**Universal Default Password Setup (Prior to Staff Modification):**
`Password123!`

All deployed internal pilots MUST have administrators execute manual resets via the UI immediately upon first startup.
