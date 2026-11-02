const fs = require('fs');
let code = fs.readFileSync('backend/opd/demo.cjs', 'utf-8');

// Replace departments array completely
const oldDepartmentsStr = `const departments = [
  { name: 'General Medicine', prefix: 'GM', doctor: 'demo_doctor', doctorName: 'Dr. Priya Raman (Demo)', nurse: 'demo_nurse', nurseName: 'Nurse Kavitha (Demo)', room: 'OPD 12' },
  { name: 'Cardiology', prefix: 'CARD', doctor: 'demo_cardiologist', doctorName: 'Dr. Arjun Menon (Demo)', nurse: 'demo_cardio_nurse', nurseName: 'Nurse Shalini (Demo)', room: 'OPD 21' },
  { name: 'Paediatrics', prefix: 'PAED', doctor: 'demo_paediatrician', doctorName: 'Dr. Divya Kumar (Demo)', nurse: 'demo_paeds_nurse', nurseName: 'Nurse Revathi (Demo)', room: 'OPD 08' },
];`;

const newDepartmentsStr = `const departments = [
  { name: 'General Medicine', prefix: 'GM', doctor: 'dr_mohan_rao', doctorName: 'Prof. V.R. Mohan Rao', nurse: 'nurse_kavitha', nurseName: 'Nurse Kavitha', room: 'OPD 12' },
  { name: 'Cardiology', prefix: 'CARD', doctor: 'dr_arumugam', doctorName: 'Dr. C. Arumugam', nurse: 'nurse_shalini', nurseName: 'Nurse Shalini', room: 'OPD 21' },
  { name: 'Paediatrics', prefix: 'PAED', doctor: 'dr_umadevi', doctorName: 'Dr. Uma Devi L.', nurse: 'nurse_revathi', nurseName: 'Nurse Revathi', room: 'OPD 08' },
  { name: 'Orthopaedics', prefix: 'ORTH', doctor: 'dr_venkatachalam', doctorName: 'Dr. Venkatachalam K.', nurse: 'nurse_meena', nurseName: 'Nurse Meena', room: 'OPD 05' },
  { name: 'Dermatology', prefix: 'DERM', doctor: 'dr_srinivasan', doctorName: 'Dr. M.S. Srinivasan', nurse: 'nurse_priya', nurseName: 'Nurse Priya', room: 'OPD 03' },
  { name: 'Obstetrics & Gynaecology', prefix: 'OBST', doctor: 'dr_prabha', doctorName: 'Dr. Prabha S.', nurse: 'nurse_saranya', nurseName: 'Nurse Saranya', room: 'OPD 15' },
  { name: 'Neurology', prefix: 'NEUR', doctor: 'dr_b_shankar', doctorName: 'Dr. B. Shankar', nurse: 'nurse_rekha', nurseName: 'Nurse Rekha', room: 'OPD 18' },
  { name: 'General Surgery', prefix: 'GSUR', doctor: 'dr_anantharamakrishnan', doctorName: 'Dr. R. Anantharamakrishnan', nurse: 'nurse_lakshmi', nurseName: 'Nurse Lakshmi', room: 'OPD 10' },
  { name: 'Psychiatry', prefix: 'PSYC', doctor: 'dr_jayanthini', doctorName: 'Dr. Jayanthini', nurse: 'nurse_rani', nurseName: 'Nurse Rani', room: 'OPD 25' },
  { name: 'Urology', prefix: 'UROL', doctor: 'dr_periasamy', doctorName: 'Prof. Dr. Periasamy P.', nurse: 'nurse_anitha', nurseName: 'Nurse Anitha', room: 'OPD 07' },
];

const extraDoctors = [
  { id: 'dr_durga', name: 'Dr. Durga Krishnan', department: 'General Medicine' },
  { id: 'dr_vigneshwaran', name: 'Dr. Vigneshwaran J.', department: 'General Medicine' },
  { id: 'dr_ganesh', name: 'Dr. Ganesh Sethuraman', department: 'Cardiology' },
  { id: 'dr_kathir', name: 'Dr. Kathir Subramanian T.', department: 'Paediatrics' },
  { id: 'dr_victor', name: 'Dr. Victor Moirangthem', department: 'Orthopaedics' },
  { id: 'dr_elangovan', name: 'Dr. P. Elangovan', department: 'Dermatology' },
  { id: 'dr_sailatha', name: 'Dr. Sailatha Ramanujam', department: 'Obstetrics & Gynaecology' },
  { id: 'dr_srinivasan_s', name: 'Dr. S. Srinivasan', department: 'General Surgery' },
  { id: 'dr_muralidharan', name: 'Dr. Muralidharan Kamalakannan', department: 'Neurology' },
  { id: 'dr_sabari', name: 'Dr. Sabari Sridhar O.T.', department: 'Psychiatry' },
];
`;

code = code.replace(oldDepartmentsStr, newDepartmentsStr);

// Replace (Demo) strings in scenarios array
code = code.replace(/ \(Demo\)/g, '');
code = code.replace(/ — synthetic example/g, '');

// Fix BOOTSTRAP_ADMIN
code = code.replace("BOOTSTRAP_ADMIN_ID: 'demo_admin'", "BOOTSTRAP_ADMIN_ID: 'admin'");
code = code.replace("BOOTSTRAP_ADMIN_NAME: 'Demo Reception Administrator'", "BOOTSTRAP_ADMIN_NAME: 'Hospital Administrator'");

// Fix all references to demo_admin in the file
code = code.replace(/'demo_admin'/g, "'admin'");

// Inject seeding for extra doctors right after departments loop in configure()
const insertPos = code.indexOf(`  directory = await api('admin', 'get', '/directory');`);
const injectCode = `
  for (const doc of extraDoctors) {
    if (!directory.departments.some(d => d.name === doc.department)) {
      await api('admin', 'post', '/catalogues/departments', { name: doc.department, prefix: doc.department.substring(0, 4).toUpperCase() }, 201);
      directory = await api('admin', 'get', '/directory');
    }
    const existing = staff.find(s => s.id === doc.id);
    if (!existing) {
      await api('admin', 'post', '/staff', { id: doc.id, name: doc.name, role: 'DOCTOR', department: doc.department, password: INITIAL_PASSWORD }, 201);
      await loginStaff(doc.id, true);
    }
  }
`;

code = code.slice(0, insertPos) + injectCode + '\n' + code.slice(insertPos);

// Fix the console logs
code = code.replace(
  "console.log(`\\nStaff password: ${PASSWORD}\\nReception/Admin: demo_admin\\nGeneral medicine doctor: demo_doctor\\nGeneral medicine nurse: demo_nurse\\nCardiology: demo_cardiologist / demo_cardio_nurse\\nPaediatrics: demo_paediatrician / demo_paeds_nurse`);",
  `
    console.log(\`\\nStaff password: \${PASSWORD}\\nReception/Admin: admin\`);
    departments.forEach(d => {
      console.log(\`\${d.name} Doctor: \${d.doctor}\`);
      console.log(\`\${d.name} Nurse: \${d.nurse}\`);
    });
    console.log('\\nOther Doctors:');
    extraDoctors.forEach(d => console.log(\`\${d.department}: \${d.id} (\${d.name})\`));
  `
);

fs.writeFileSync('backend/opd/demo.cjs', code);
