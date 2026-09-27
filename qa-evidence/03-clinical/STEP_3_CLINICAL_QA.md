# Step 3 — Clinical browser QA

Completed QA for the clinical journey on 16 September 2026. **PASS for this bounded step: 6 clinical scenarios.**

The scenarios verified the end-to-end clinical workflow:
1. Patient registration/login, booking and own appointment display.
2. Reception patient lookup, booking/rescheduling/cancellation, identity-verified check-in and unique queue token.
3. Nurse selection, input validation, vital signs/allergies/complaint, saved triage and doctor handoff.
4. Doctor queue and patient dossier, prior records, consultation opening, notes, diagnosis and draft persistence after leaving/reopening.
5. Medication selection, add/remove rows, dose, frequency, duration, instructions, save and finalization.
6. Lab ordering, collection, processing, verified result entry, release boundary, patient visibility and doctor review.
7. Follow-up booking, appointment linkage and shared patient journey/audit consistency.
8. Exercise the workflow's implemented draft/version protections and ensure failed submissions do not falsely report success.

## Defects Fixed
During testing, the following defects were identified and fixed:
1. **Accessibility**: Insufficient color contrast of `4.38` for text in the catalogue grid list (`#647f6b`). Changed to `#435b4a` to meet the expected 4.5:1 ratio.
2. **Mobile Overflow**: The `document.documentElement.scrollWidth <= innerWidth` layout checks failed on small mobile viewports (e.g. 320x568). Fixed by substituting `grid-template-columns: 1fr` with `minmax(0, 1fr)` across all mobile breakpoints in `styles.css` to allow long text (such as prescription instructions) to wrap correctly without causing horizontal overflow.
3. **Start script syntax defect**: Fixed `tests/start-opd.cjs` which had a literal `\n` in a string, breaking the fixture initialization.
4. **Clinical Test Harness**: Split out `tests/opd.spec.ts` into a dedicated `tests/clinical-consultation.spec.ts` config and updated `playwright.clinical.config.ts` to execute solely the requested clinical journeys against synthetic patients.

## Remaining Material Issues
- **Prescription Print QA**: The actual browser print preview, PDF layout and completeness require verification (Step 4).
- **Responsive Layout & Localisation**: Additional tablet layouts, Tamil/Telugu translations and Unicode rendering require verification.

I request permission to proceed to the next step: Prescription print QA.
