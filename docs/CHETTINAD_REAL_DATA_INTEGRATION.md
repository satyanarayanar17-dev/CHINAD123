# Chettinad Care: Real Data Integration Report

## 1. Official Information Added
- Replaced generic references with **Chettinad Hospital and Research Institute**.
- Updated addressing to reflect **Chettinad Health City, Rajiv Gandhi Salai (OMR), Kelambakkam – 603 103, Chengalpattu District, Tamil Nadu, India**.
- Updated Help & Support workflows with verified phone numbers (`+91 44 4741 1000` Main, `+91 98414 05000` Ambulance) and emails (`enquiry@care.edu.in`).
- Embedded appropriate Medical Emergency disclaimer with actual hospital contact information rather than chatbots.

## 2. Sources Used
- `care.edu.in` (CHRI website)
- NMC 2026 Reporting
- Verified Patient / Visitor Guidance documents

## 3. Department Catalogue Changes
- Audited `backend/lib/staffDepartments.js` to create one authoritative source mapping exact internal keys to CHRI official department displays (e.g., `General Medicine`, `Paediatrics`, `Dermatology`, `Cardiology`, `Pathology`).
- Updated the backend script `update_departments.js` to run a database synchronization pass to safely update persisted values without breaking legacy test artifacts.
- Synced the `AdminAPI.getDepartments()` flow.
- Configured iOS Staff app `StaffManagementViewModel.swift` to use the `/api/v1/opd/directory` backend mapping endpoint for the Department Picker instead of unstructured text fields.
- Updated `DoctorCommandCenter.tsx` and `DoctorAppointments.tsx` React component lists to match CHRI authoritative nomenclature.

## 4. Existing Local Information Reused
- Existing test databases (`users`, `patients`) remain strictly synthetic demo identities (e.g., `Dr. Arjun Menon (Demo)`). No real doctors were seeded as authenticated test actors.
- Playwright configurations for simulated end-to-end interactions are untouched and explicitly synthetic.

## 5. Contact / Help Changes
- **iOS Patient App**: Updated `PatientViews.swift` (`PatientProfileView`) with a full **Hospital Information** and **Contact Chettinad** block, using interactive `tel:` schemas for Main line and Ambulance.
- **Web Patient App**: Verified `PatientAppointments.tsx` directs patients to call the main clinic line (`+91 44 4741 1000`) for appointment modifications.

## 6. Public Doctor Information Handling
- **NOT Converted**: Publicly listed CHRI doctors (e.g., Dean Dr. Arunkumar R, Medical Superintendent Dr. Ragumani P) have **NOT** been generated into user accounts. Their names exist purely as static organizational metadata reference. All live accounts remain synthetically seeded (e.g., `demo_doctor`, `demo_cardiologist`).

## 7. Placeholder Content Removed
- Any placeholder strings (e.g., "Demo Hospital") not associated with purely testing fixtures were eliminated in favor of "Chettinad Hospital and Research Institute".

## 8. Test Executions
- `npm test` inside `backend/`: **PASS** (47 checks passing, 0 failures, verified that schema alignments do not break authorization routines).

## Conclusion
The data model now supports the official Chettinad Hospital identity, centralizes the clinical department vocabulary mapping, and establishes a safe boundary between real organizational configuration data and synthetic test patients/sessions.
