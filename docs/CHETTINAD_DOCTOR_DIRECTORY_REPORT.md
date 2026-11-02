# CHRI Doctor Directory Mapping Report

This report cross-references the currently seeded authentication records against the publicly verified Chettinad Hospital and Research Institute (CHRI) faculty lists retrieved from `care.edu.in`. 

**SECURITY NOTE:** As per clinical configuration rules (Rule #11 and #26), public faculty information has **not** been used to silently provision authenticated hospital accounts. The application database remains cleanly separated: using synthetic doctors for runtime testing while recognizing the actual CHRI clinical faculty.

## 1. Currently Provisioned Accounts (Database)

All currently provisioned system doctors are safely isolated as synthetic development seeds.

| Current System Record | Internal Department | Status | Verified CHRI Counterpart Exists? |
| :--- | :--- | :--- | :--- |
| **Dr. Priya Raman (Demo)** | General Medicine | Synthetic Seed | No (Intentionally Fictional) |
| **Dr. Arjun Menon (Demo)** | Cardiology | Synthetic Seed | No (Intentionally Fictional) |
| **Dr. Divya Kumar (Demo)** | Paediatrics | Synthetic Seed | No (Intentionally Fictional) |

## 2. Verified Public CHRI Faculty (Read-Only Source Mapping)

The following real CHRI faculty members have been verified against the official university/hospital portal (retrieved Sept 2026). If the hospital wishes to provision these doctors for actual clinical pilot use, the Hospital Admin must generate their accounts securely via the `Chettinad Care Clinical` staff interface.

### General Medicine
*   **Prof. V.R. Mohan Rao** (Head of Department)
*   **Dr. K. Mayilananthi** (Professor)
*   **Dr. Durga Krishnan** (Professor)
*   **Dr. Vigneshwaran J.** (Professor)
*   **Dr. C. Ramakrishnan** (Professor)

### Cardiology
*   **Dr. C. Arumugam** (Professor / Consultant)
*   **Dr. Ganesh Sethuraman** (Professor / Consultant)

### Paediatrics & Neonatology
*   **Dr. Uma Devi L.** (Professor & HOD)
*   **Dr. Antony Jenifer J.** (Consultant)
*   **Dr. Kathir Subramanian T.** (Consultant)
*   **Dr. Sujatha Sridharan** (Consultant)

### Orthopaedics & Trauma
*   **Dr. Venkatachalam K.** (Professor & HOD)
*   **Dr. Victor Moirangthem** (Professor)

### Dermatology
*   **Dr. M.S. Srinivasan** (Professor & HOD)
*   **Dr. P. Elangovan** (Professor)
*   **Dr. G. Srinivasan** (Professor)

### Obstetrics & Gynaecology
*   **Dr. Prabha S.** (Professor)
*   **Dr. Sailatha Ramanujam** (Professor)
*   **Dr. Ranoji Vijaysing Shinde** (Professor)

---
*Reference sources: care.edu.in teaching faculty public disclosures.*
