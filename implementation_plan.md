# Chettinad Care: Frontend Hardening & Verification Implementation

This implementation plan executes the **Safety Hardening** phase required to promote Chettinad Care from a prototype to a backend-verified internal pilot. It targets the structural vulnerabilities identified in the readiness review: concurrency overwrites, missing correlation traceability, and unhandled session/role violation failures.

## User Review Required
> [!IMPORTANT]
> The backend endpoints **MUST** support the new payload constraints defined below (e.g., ETag/If-Match for 412/409 scenarios, accepting `X-Correlation-ID`). Approving this plan asserts that the frontend logic should establish these strict expectations, even if the backend is updated concurrently.

## Proposed Changes

---

### Core API Client (Observability & Routing Safety)
We must establish zero-trust observability. Every request must be traceable, and severe backend rejections (401, 403, 500) must not result in silent UI failures.

#### [MODIFY] [client.ts](file:///Users/siddwork/.gemini/antigravity/scratch/chettinad-care-frontend/src/api/client.ts)
- **Correlation Tracing:** Add a request interceptor that generates and attaches `X-Correlation-ID: crypto.randomUUID()` to every outbound request.
- **Role Violation Catch (403):** Intercept `403 Forbidden` globally. If a user attempts a banned action, halt the promise and dispatch an event to return them to the dashboard with an explicit warning.
- **Server Error Handling (5xx):** Intercept and standardize 5xx network errors, extracting correlation IDs from the response (if provided) to surface structured errors to the React Error Boundaries instead of crashing silently.

---

### Concurrency Enforcement (Optimistic Concurrency Control)
Clinical state patches (Queue transitions, Notes, Prescriptions) must be protected from "last-write-wins" collisions. The frontend will mandate OCC versioning.

#### [MODIFY] [queue.ts](file:///Users/siddwork/.gemini/antigravity/scratch/chettinad-care-frontend/src/api/queue.ts)
- **Stale Write Prevention:** Modify `patchQueueSlot` to enforce `If-Match` headers or bundle a `previousPhase` / `version` field into the payload. The client will expect a `409 Conflict` (or `412`) if a collision occurs.

#### [MODIFY] [drafts.ts](file:///Users/siddwork/.gemini/antigravity/scratch/chettinad-care-frontend/src/api/drafts.ts)
- **Standardize OCC Status Codes:** Currently, this expects `412 Precondition Failed`. Ensure we support a universal `DraftConflictError` that maps to `412` or `409` consistently across the fetch layer.

---

### Workflow Protection & UI Reflection
When the backend successfully throws safety rejections, the frontend must handle the UX cleanly without catastrophic unmounting.

#### [MODIFY] [useLiveQueue.ts](file:///Users/siddwork/.gemini/antigravity/scratch/chettinad-care-frontend/src/hooks/useLiveQueue.ts) (or equivalent abstraction)
- **Rollback Guarantee:** Ensure any UI-optimistic queue transitions revert locally and render a "Queue state changed by another user" alert if a 409 is caught during the backend execution. 

#### [MODIFY] [useDrafts.ts](file:///Users/siddwork/.gemini/antigravity/scratch/chettinad-care-frontend/src/hooks/useDrafts.ts)
- Currently possesses an imperative `draftApi.saveDraft`. Will enhance the error dialogue to clearly display to the clinician that a concurrent session overrode their access, surfacing the issue cleanly instead of just issuing `console.error` and `alert()`.

## Open Questions
> [!WARNING]
> 1. **Idempotency Standards:** Should we inject explicit `X-Idempotency-Key` headers on actionable POST events (like Queue Triage submit or Rx Authorization), or will the backend rely strictly on payload signature hashing? We will default to omitting it unless the backend contract explicitly requires it.
> 2. **React Routing vs Axios:** When catching a `403 Forbidden` in the global Axios interceptor, React Router isn't easily accessible. The plan uses `window.location.href = '/'` combined with a storage flag. Is this acceptable, or should we pipe interceptor faults into an established Context hook?

## Verification Plan

### Automated Tests
- Validate that `axios` correctly assigns a fresh UUID to `X-Correlation-ID` across successive requests.
- Verify that standard REST requests (like fetching a queue list) operate identically as before.

### Manual Verification
1. **Correlation Check:** Open the DevTools Network Tab and verify `X-Correlation-ID` exists on all outbound API requests.
2. **Concurrency 409 Check:** Temporarily hardcode `queue.ts` to pass an invalid Expected Version. Execute a queue drag-and-drop. Verify the UI rejects the transition, reverts the optimistically dropped card, and warns you.
3. **Audit Readiness Check:** Trigger a draft save collision (via mock 412) to ensure the UI freezes auto-save and protects the local document memory gracefully.
