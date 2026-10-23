# Approved interface rollout — 24 October 2026

The approved Design Craft direction uses Manrope, deep teal, white surfaces, generous form spacing and green completion states. The web patient directory uses readable cards and a separate selected-patient panel; progress comes from the authenticated adherence API. Clinical actions, account boundaries and revision checks use the existing endpoints. Dynamic patient names are rendered literally rather than through translation fallback.

Doctor sign-in opens Patients. The native layouts use four primary patient/doctor destinations, full-width task actions and the same completion rules. Visits and administrative functions remain reachable through the appropriate secondary navigation. No clinical values, completion counts or doctor identities are fabricated by the production interface.

The existing demo API remains the shared endpoint. This web release has no backend changes and must be deployed to the current static site alone to avoid replacing temporary demo storage. No new hosting resources, data migration, seed or reset is part of the design release.

Validation: frontend production build and targeted lint (zero errors); Android patient/staff builds and unit/UI workflow suite; iOS patient/staff device builds and simulator regression checks. Native build 1.5 (6) targets the current demo service. Physical installation and launch results are recorded in the local release evidence, separately from simulator results.

The doctor identity and patient cohort are server data. The hospital trial is scoped to Dr. Goluguri Prajwala Priyanka Reddy, Obstetrics & Gynaecology, once her actual account is provisioned through hospital administration. The design does not rename historical clinicians or reassign records.
