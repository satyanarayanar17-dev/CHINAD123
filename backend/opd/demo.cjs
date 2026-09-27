// Local synthetic fixture builder for OBST pilot. All clinical writes pass through the real API.
const path = require('node:path');
if (process.env.NODE_ENV === 'production' || (process.env.APP_ENV && process.env.APP_ENV !== 'local_dev')) {
  throw new Error('The Connected OPD demo seeder is available only in local_dev.');
}
const demoPath = process.env.SQLITE_PATH || path.resolve(__dirname, '..', process.env.OPD_DEMO_DB || 'connected-opd-demo.db');
const PASSWORD = 'ChettinadDemo2026!';
const INITIAL_PASSWORD = 'ChettinadInitial2026!';
Object.assign(process.env, {
  NODE_ENV: 'development', APP_ENV: 'local_dev',
  DB_DIALECT: process.env.DB_DIALECT || 'sqlite',
  SQLITE_PATH: process.env.DB_DIALECT === 'postgres' ? undefined : demoPath,
  OPD_DEMO_OTP: 'true', BOOTSTRAP_ADMIN_ID: 'admin',
  BOOTSTRAP_ADMIN_NAME: 'Hospital Administrator', BOOTSTRAP_ADMIN_PASSWORD: PASSWORD,
});
const request = require('supertest');
const app = require('../server');
const database = require('../database');
const { ensureBootstrapAdmin } = require('../bootstrapAdmin');
const { randomUUID } = require('crypto');
const { day } = require('./core.ts');
const tokens = new Map();

const departments = [
  { name: 'Obstetrics & Gynaecology', prefix: 'OBST', doctor: 'dr_prabha', doctorName: 'Dr. Prabha S.', nurse: 'demo_nurse', nurseName: 'Demo Nurse', room: 'OPD 15' },
];

const extraDoctors = [
  { id: 'dr_sailatha', name: 'Dr. Sailatha Ramanujam', department: 'Obstetrics & Gynaecology' },
];

const scenarios = [
  { 
    key: 'obst_demo', 
    name: 'Ananya Demo', 
    phone: '+919000000001', 
    dob: '1995-06-15', 
    gender: 'Female', 
    department: 'OBST', 
    complaint: 'Routine OBST review', 
    target: 'PENDING_CONFIRMATION' 
  }
];

async function call(token, method, url, data, expected = 200) {
  const response = await request(app)[method](url).set('Authorization', token ? `Bearer ${token}` : '').send(data);
  if (response.status !== expected && response.status !== 201) {
    const code = response.body?.error?.code || response.body?.code || 'REQUEST_FAILED';
    const detail = response.body?.error?.message || response.body?.message || '';
    throw new Error(`${method.toUpperCase()} ${url}: HTTP ${response.status} ${code} ${detail}`);
  }
  console.log("RESPONSE BODY:", response.body); return response.body;
}
const api = (who, method, url, data) => call(tokens.get(who), method, `/api/v1/opd${url}`, data);

async function loginStaff(id, initial = false) {
  let password = initial ? INITIAL_PASSWORD : PASSWORD;
  const auth = await call(null, 'post', '/api/v1/auth/login/staff', { username: id, password });
  tokens.set(id, auth.access_token);
  if (initial) {
    await call(auth.access_token, 'post', '/api/v1/auth/change-password', { currentPassword: password, newPassword: PASSWORD });
    const fresh = await call(null, 'post', '/api/v1/auth/login/staff', { username: id, password: PASSWORD });
    tokens.set(id, fresh.access_token);
  }
}

async function ensurePatient(scenario) {
  const otp = await call('', 'post', '/api/v1/auth/opd/otp/request', { phone: scenario.phone });
  const profile = { name: scenario.name, phone: scenario.phone, dob: scenario.dob, gender: scenario.gender, email: '', address: '123 Demo Street', city: 'Chennai', state: 'Tamil Nadu', pin_code: '600001', emergency_contact: '+919000000002', preferred_language: 'en', existing_mrn: '', allergies: 'No known allergies' };
  const login = await call('', 'post', '/api/v1/auth/opd/otp/verify', { phone: scenario.phone, code: otp.development_code, profile });
  tokens.set(scenario.phone, login.access_token);
  
  const patients = await api('admin', 'get', '/patients');
  const patient = patients.find(p => p.name === scenario.name);
  console.log("PATIENTS:", patients); return patient;
}

function departmentFor(scenario) {
  return departments.find(d => d.prefix === scenario.department);
}

async function configure() {
  await ensureBootstrapAdmin(database);
  await loginStaff('admin');
  
  let directory = await api('admin', 'get', '/directory');
  let staff = await api('admin', 'get', '/staff');
  
  for (const department of departments) {
    if (!directory.departments.some(d => d.name === department.name)) {
      await api('admin', 'post', '/catalogues/departments', { name: department.name, prefix: department.prefix });
    }
    for (const person of [{ id: department.doctor, name: department.doctorName, role: 'DOCTOR' }, { id: department.nurse, name: department.nurseName, role: 'NURSE' }]) {
      const existing = staff.find(s => s.id === person.id);
      if (!existing) await api('admin', 'post', '/staff', { ...person, department: department.name, password: INITIAL_PASSWORD });
      await loginStaff(person.id, !existing);
    }
  }

  directory = await api("admin", "get", "/directory");
  for (const doc of extraDoctors) {
    if (!directory.departments.some(d => d.name === doc.department)) {
      await api('admin', 'post', '/catalogues/departments', { name: doc.department, prefix: doc.department.substring(0, 4).toUpperCase() });
      directory = await api('admin', 'get', '/directory');
    }
    const existing = staff.find(s => s.id === doc.id);
    if (!existing) {
      await api('admin', 'post', '/staff', { id: doc.id, name: doc.name, role: 'DOCTOR', department: doc.department, password: INITIAL_PASSWORD });
      await loginStaff(doc.id, true);
    }
  }

  for (const department of departments) {
    const deptId = directory.departments.find(d => d.name === department.name).id;
    for (let weekday = 0; weekday <= 6; weekday++) {
      await api('admin', 'post', '/schedules', { doctor_id: department.doctor, department_id: deptId, weekday, start_time: '00:00', end_time: '23:59', slot_minutes: 15, break_start: '13:00', break_end: '14:00', room: department.room });
    }
  }

  const catalogue = await api('admin', 'get', '/catalogues');
  return catalogue;
}

async function run() {
  console.log(`Preparing OBST-only synthetic demo: ${demoPath}`);
  
  const { resetAndSeedDatabase } = require('../database');
  await resetAndSeedDatabase();
  console.log('Database reset to pristine schema.');
  
  const catalogue = await configure();
  
  for (const scenario of scenarios) {
    scenario.patient = await ensurePatient(scenario); console.log("SCENARIO PATIENT IS:", scenario.patient);
    const department = departmentFor(scenario);
    
    // Create Demo Appointment
    const slots = await api('admin', 'get', `/slots?doctor_id=${department.doctor}&date=${day(new Date())}`);
    const slot = slots[0];
    if (!slot) throw new Error('No slots available for demo appointment');
    
    let appointment = await api(scenario.phone, 'post', '/appointments', {
      doctor_id: department.doctor,
      scheduled_at: slot.scheduled_at,
      reason: scenario.complaint
    });
    
    // Auto-confirm and check-in the appointment so it appears in the doctor's live queue today
    await api('admin', 'post', `/appointments/${appointment.id}/confirm`, {});
    appointment = await api('admin', 'post', `/appointments/${appointment.id}/check-in`, { identity_verified: true });
    
    const db = database;
    
    const docs = [
      { id: randomUUID(), patient_id: scenario.patient.id, appointment_id: appointment.id, document_type: 'LAB_REPORT', title: 'Previous Lab Report', original_filename: 'demo_lab.pdf', mime_type: 'application/pdf', size_bytes: 1024, storage_provider: 'local', uploaded_by: scenario.patient.id, clinical_date: '2026-09-20', storage_key: 'demo_lab.pdf', created_at: new Date().toISOString() },
      { id: randomUUID(), patient_id: scenario.patient.id, appointment_id: appointment.id, document_type: 'SCAN', title: 'Ultrasound Report', original_filename: 'demo_usg.pdf', mime_type: 'application/pdf', size_bytes: 1024, storage_provider: 'local', uploaded_by: scenario.patient.id, clinical_date: '2026-09-15', storage_key: 'demo_usg.pdf', created_at: new Date().toISOString() },
      { id: randomUUID(), patient_id: scenario.patient.id, appointment_id: appointment.id, document_type: 'PRESCRIPTION', title: 'Previous Prescription', original_filename: 'demo_rx.pdf', mime_type: 'application/pdf', size_bytes: 1024, storage_provider: 'local', uploaded_by: scenario.patient.id, clinical_date: '2026-09-04', storage_key: 'demo_rx.pdf', created_at: new Date().toISOString() }
    ];
    for (const d of docs) {
      // Find user id for the patient
      const u = await db.get("SELECT id FROM users WHERE patient_id = ? LIMIT 1", [scenario.patient.id]); console.log("SCENARIO PATIENT ID:", scenario.patient.id, "USER IS:", u);
      await db.run('INSERT INTO patient_documents (id, patient_id, appointment_id, document_type, title, original_filename, mime_type, size_bytes, storage_provider, storage_key, uploaded_by, clinical_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [d.id, d.patient_id, d.appointment_id, d.document_type, d.title, d.original_filename, d.mime_type, d.size_bytes, d.storage_provider, d.storage_key, u.id, d.clinical_date, d.created_at, d.created_at]);
    }
    
    const planId = `plan-${randomUUID()}`;
    const deptId = (await db.get('SELECT id FROM departments WHERE prefix="OBST"')).id;
    await db.run(`INSERT INTO care_plans (id, patient_id, department_id, status, start_date, created_by, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`, [planId, scenario.patient.id, deptId, day(new Date(Date.now() - 5*86400000)), department.doctor, new Date().toISOString(), new Date().toISOString()]);
    
    const taskIdG1 = `task-${randomUUID()}`;
    await db.run(`INSERT INTO care_plan_tasks (id, series_id, revision, plan_id, task_type, title, instruction, observation_type, timing_relation, target_unit, frequency_type, scheduled_time, start_date, created_by, created_at, updated_at) VALUES (?, ?, 1, ?, 'MEASUREMENT', 'Fasting glucose', 'Check before breakfast', 'fasting_blood_sugar', 'fasting', 'mg/dL', 'DAILY', '07:00', ?, ?, ?, ?)`, [taskIdG1, `series-${randomUUID()}`, planId, day(new Date(Date.now() - 5*86400000)), department.doctor, new Date().toISOString(), new Date().toISOString()]);
    
    const taskIdG2 = `task-${randomUUID()}`;
    await db.run(`INSERT INTO care_plan_tasks (id, series_id, revision, plan_id, task_type, title, instruction, observation_type, timing_relation, target_unit, frequency_type, scheduled_time, start_date, created_by, created_at, updated_at) VALUES (?, ?, 1, ?, 'MEASUREMENT', 'Post-dinner glucose', 'Check 2 hours after dinner', 'post_prandial_blood_sugar', 'post_meal', 'mg/dL', 'DAILY', '21:00', ?, ?, ?, ?)`, [taskIdG2, `series-${randomUUID()}`, planId, day(new Date(Date.now() - 5*86400000)), department.doctor, new Date().toISOString(), new Date().toISOString()]);

    const taskIdW = `task-${randomUUID()}`;
    await db.run(`INSERT INTO care_plan_tasks (id, series_id, revision, plan_id, task_type, title, instruction, expected_duration_minutes, frequency_type, scheduled_time, start_date, created_by, created_at, updated_at) VALUES (?, ?, 1, ?, 'ACTIVITY', 'Daily Walking', 'Walk for 30 minutes', 30, 'DAILY', '18:00', ?, ?, ?, ?)`, [taskIdW, `series-${randomUUID()}`, planId, day(new Date(Date.now() - 5*86400000)), department.doctor, new Date().toISOString(), new Date().toISOString()]);
    
    for(let i=4; i>=1; i--) {
      const pastDate = new Date(Date.now() - i*86400000);
      const pastDay = day(pastDate);
      
      const adhIdG1 = `adh-${randomUUID()}`;
      await db.run(`INSERT INTO care_plan_adherence (id, task_id, patient_id, occurrence_date, scheduled_for, status, recorded_at) VALUES (?, ?, ?, ?, ?, 'RECORDED', ?)`, [adhIdG1, taskIdG1, scenario.patient.id, pastDay, `${pastDay}T07:00:00`, pastDate.toISOString()]);
      const obsId1 = `obs-${randomUUID()}`;
      await db.run(`INSERT INTO patient_observations (id, adherence_id, observation_type, timing_relation, observed_at, recorded_at) VALUES (?, ?, 'fasting_blood_sugar', 'fasting', ?, ?)`, [obsId1, adhIdG1, pastDate.toISOString(), pastDate.toISOString()]);
      await db.run(`INSERT INTO patient_observation_components (observation_id, component_code, numeric_value, unit) VALUES (?, 'glucose', ?, 'mg/dL')`, [obsId1, 95 + Math.floor(Math.random() * 15)]);

      const adhIdG2 = `adh-${randomUUID()}`;
      await db.run(`INSERT INTO care_plan_adherence (id, task_id, patient_id, occurrence_date, scheduled_for, status, recorded_at) VALUES (?, ?, ?, ?, ?, 'RECORDED', ?)`, [adhIdG2, taskIdG2, scenario.patient.id, pastDay, `${pastDay}T21:00:00`, pastDate.toISOString()]);
      const obsId2 = `obs-${randomUUID()}`;
      await db.run(`INSERT INTO patient_observations (id, adherence_id, observation_type, timing_relation, observed_at, recorded_at) VALUES (?, ?, 'post_prandial_blood_sugar', 'post_meal', ?, ?)`, [obsId2, adhIdG2, pastDate.toISOString(), pastDate.toISOString()]);
      await db.run(`INSERT INTO patient_observation_components (observation_id, component_code, numeric_value, unit) VALUES (?, 'glucose', ?, 'mg/dL')`, [obsId2, 130 + Math.floor(Math.random() * 20)]);
      
      const adhIdW = `adh-${randomUUID()}`;
      await db.run(`INSERT INTO care_plan_adherence (id, task_id, patient_id, occurrence_date, scheduled_for, status, recorded_at) VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?)`, [adhIdW, taskIdW, scenario.patient.id, pastDay, `${pastDay}T18:00:00`, pastDate.toISOString()]);
    }
  }
  
  console.log(`\nDemo Data Provisioned Successfully!`);
  console.log(`\nStaff password: ${PASSWORD}\nReception/Admin: admin`);
  departments.forEach(d => {
    console.log(`${d.name} Doctor: ${d.doctor}`);
    console.log(`${d.name} Nurse: ${d.nurse}`);
  });
  console.log('\nOther Doctors:');
  extraDoctors.forEach(d => console.log(`${d.department}: ${d.id} (${d.name})`));
  console.log('\nPatient sign-in:');
  for (const scenario of scenarios) console.log(`${scenario.phone}  ${scenario.name}`);
}

run().then(() => process.exit(0)).catch(error => {
  console.error(error);
  process.exit(1);
});
