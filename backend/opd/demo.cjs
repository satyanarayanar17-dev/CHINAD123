// Local synthetic fixture builder. All clinical writes pass through the real API.
const path = require('node:path');
if (process.env.NODE_ENV === 'production' || (process.env.APP_ENV && process.env.APP_ENV !== 'local_dev')) {
  throw new Error('The Connected OPD demo seeder is available only in local_dev.');
}
const demoPath = path.resolve(__dirname, '..', process.env.OPD_DEMO_DB || 'connected-opd-demo.db');
const PASSWORD = 'ChettinadDemo2026!';
const INITIAL_PASSWORD = 'ChettinadInitial2026!';
Object.assign(process.env, {
  NODE_ENV: 'development', APP_ENV: 'local_dev',
  DB_DIALECT: process.env.DB_DIALECT || 'sqlite',
  SQLITE_PATH: process.env.DB_DIALECT === 'postgres' ? undefined : demoPath,
  OPD_DEMO_OTP: 'true', BOOTSTRAP_ADMIN_ID: 'demo_admin',
  BOOTSTRAP_ADMIN_NAME: 'Demo Reception Administrator', BOOTSTRAP_ADMIN_PASSWORD: PASSWORD,
});
const request = require('supertest');
const app = require('../server');
const database = require('../database');
const { ensureBootstrapAdmin } = require('../bootstrapAdmin');
const { day } = require('./core.ts');
const tokens = new Map();
const deferred = new Set();
const departments = [
  { name: 'General Medicine', prefix: 'GM', doctor: 'demo_doctor', doctorName: 'Dr. Priya Raman (Demo)', nurse: 'demo_nurse', nurseName: 'Nurse Kavitha (Demo)', room: 'OPD 12' },
  { name: 'Cardiology', prefix: 'CARD', doctor: 'demo_cardiologist', doctorName: 'Dr. Arjun Menon (Demo)', nurse: 'demo_cardio_nurse', nurseName: 'Nurse Shalini (Demo)', room: 'OPD 21' },
  { name: 'Paediatrics', prefix: 'PAED', doctor: 'demo_paediatrician', doctorName: 'Dr. Divya Kumar (Demo)', nurse: 'demo_paeds_nurse', nurseName: 'Nurse Revathi (Demo)', room: 'OPD 08' },
];
const scenarios = [
  { key: 'general', name: 'Ananya Raman (Demo)', phone: '+919000000001', dob: '1991-04-12', gender: 'Female', department: 'GM', complaint: 'General medicine review', target: 'WAITING', diagnosis: 'General medical review (Demo)' },
  { key: 'diabetes', name: 'Karthik Srinivasan (Demo)', phone: '+919000000002', dob: '1978-08-24', gender: 'Male', department: 'GM', complaint: 'Diabetes follow-up and medication review', target: 'CONSULTATION', diagnosis: 'Type 2 diabetes follow-up (Demo)', baseline: true, result: 'REVIEWED', allergies: 'Penicillin — synthetic example', glucose: 146, weight: 78, height: 171 },
  { key: 'cardiology', name: 'Vikram Rajan (Demo)', phone: '+919000000003', dob: '1969-02-18', gender: 'Male', department: 'CARD', complaint: 'Scheduled blood-pressure review', target: 'WAITING_DOCTOR', diagnosis: 'Blood pressure review (Demo)', systolic: 136, diastolic: 84, weight: 75, height: 172 },
  { key: 'paediatrics', name: 'Nila Senthil (Demo)', phone: '+919000000004', dob: '2018-11-05', gender: 'Female', department: 'PAED', complaint: 'Routine paediatric review with parent', target: 'TRIAGE', diagnosis: 'Paediatric review (Demo)', weight: 23, height: 122 },
  { key: 'elderly', name: 'Lakshmi Subramanian (Demo)', phone: '+919000000005', dob: '1947-06-30', gender: 'Female', department: 'GM', complaint: 'Mobility and routine medication review', target: 'DOCTOR_READY', diagnosis: 'Older adult review (Demo)', priority: 1, weight: 58, height: 154 },
  { key: 'followup', name: 'Meenakshi Sundaram (Demo)', phone: '+919000000006', dob: '1986-09-09', gender: 'Female', department: 'GM', complaint: 'Review of recent tiredness', target: null, diagnosis: 'Follow-up assessment (Demo)', baseline: true, result: 'AVAILABLE', followUp: true },
];

async function call(token, method, url, data, expected = 200) {
  const response = await request(app)[method](url).set('Authorization', token ? `Bearer ${token}` : '').send(data);
  if (response.status !== expected) {
    const code = response.body?.error?.code || response.body?.code || 'REQUEST_FAILED';
    const detail = response.body?.error?.message || response.body?.message || '';
    throw new Error(`${method.toUpperCase()} ${url}: HTTP ${response.status} ${code} ${detail}`);
  }
  return response.body;
}
const api = (who, method, url, data, expected) => call(tokens.get(who), method, `/api/v1/opd${url}`, data, expected);
async function loginStaff(id, initial = false) {
  const password = initial ? INITIAL_PASSWORD : PASSWORD;
  const login = await call('', 'post', '/api/v1/auth/login/staff', { username: id, password });
  tokens.set(id, login.access_token);
  if (login.must_change_password) {
    if (!initial) throw new Error(`${id} requires a password change; its existing credential was not modified.`);
    await call(login.access_token, 'post', '/api/v1/auth/change-password', { currentPassword: password, newPassword: PASSWORD });
  }
}
async function configure() {
  await database.migrateDatabase();
  await ensureBootstrapAdmin(database);
  await loginStaff('demo_admin');
  let directory = await api('demo_admin', 'get', '/directory');
  let staff = await api('demo_admin', 'get', '/staff');
  for (const department of departments) {
    if (!directory.departments.some(d => d.name === department.name)) {
      await api('demo_admin', 'post', '/catalogues/departments', { name: department.name, prefix: department.prefix }, 201);
    }
    for (const person of [{ id: department.doctor, name: department.doctorName, role: 'DOCTOR' }, { id: department.nurse, name: department.nurseName, role: 'NURSE' }]) {
      const existing = staff.find(s => s.id === person.id);
      if (existing && (existing.role !== person.role || existing.department !== department.name || !existing.is_active)) {
        throw new Error(`Existing ${person.id} differs from the demo configuration; no existing staff permissions were changed.`);
      }
      if (!existing) await api('demo_admin', 'post', '/staff', { ...person, department: department.name, password: INITIAL_PASSWORD }, 201);
      await loginStaff(person.id, !existing || Boolean(existing.must_change_password));
    }
  }
  directory = await api('demo_admin', 'get', '/directory');
  for (const department of departments) {
    department.id = directory.departments.find(d => d.name === department.name).id;
    const doctor = directory.doctors.find(d => d.id === department.doctor);
    for (let weekday = 0; weekday < 7; weekday++) {
      if (doctor.schedules.some(s => s.weekday === weekday)) continue;
      // Extended local-demo hours allow genuine same-day bookings when demonstrated after work.
      await api('demo_admin', 'post', '/schedules', { doctor_id: department.doctor, department_id: department.id, weekday, start_time: '00:00', end_time: '23:59', slot_minutes: 5, break_start: '12:00', break_end: '12:30', room: department.room });
    }
  }
  let catalogue = await api('demo_admin', 'get', '/catalogues');
  for (const scenario of scenarios) {
    if (!catalogue.diagnoses.some(d => d.name === scenario.diagnosis)) await api('demo_admin', 'post', '/catalogues/diagnoses', { name: scenario.diagnosis }, 201);
  }
  for (const drug of [{ name: 'Metformin (Demo)', strength: '500 mg', form: 'Tablet', route: 'Oral' }, { name: 'Paracetamol (Demo)', strength: '500 mg', form: 'Tablet', route: 'Oral' }]) {
    if (!catalogue.drugs.some(d => d.name === drug.name)) await api('demo_admin', 'post', '/catalogues/drugs', drug, 201);
  }
  for (const test of [{ name: 'HbA1c (Demo)', code: 'DEMO-HBA1C', department: 'Laboratory', unit: '%', reference_range: '4.0–5.6 (synthetic demonstration interval)' }, { name: 'Haemoglobin (Demo)', code: 'DEMO-HB', department: 'Laboratory', unit: 'g/dL', reference_range: '12.0–15.5 (synthetic demonstration interval)' }]) {
    if (!catalogue.tests.some(t => t.code === test.code)) await api('demo_admin', 'post', '/catalogues/tests', test, 201);
  }
  return api('demo_admin', 'get', '/catalogues');
}
async function ensurePatient(scenario) {
  const existing = (await api('demo_admin', 'get', `/patients?search=${encodeURIComponent(scenario.phone)}`)).find(p => p.phone === scenario.phone);
  if (existing) {
    if (existing.name !== scenario.name) throw new Error(`Phone for ${scenario.key} belongs to a different existing patient. No patient details were changed.`);
    return existing;
  }
  // Register through OTP so the patient account and notification recipient genuinely exist.
  const otp = await call('', 'post', '/api/v1/auth/opd/otp/request', { phone: scenario.phone });
  if (!otp.development_code) throw new Error('Local demo OTP is unavailable; no SMS is sent by this seeder.');
  const profile = { name: scenario.name, phone: scenario.phone, dob: scenario.dob, gender: scenario.gender, email: '', address: 'Synthetic Demonstration Address, Kelambakkam', city: 'Chennai', state: 'Tamil Nadu', pin_code: '603103', emergency_contact: '+919000000099', preferred_language: scenario.key === 'elderly' ? 'ta' : 'en', existing_mrn: '', allergies: scenario.allergies || 'No known allergies — synthetic example' };
  const login = await call('', 'post', '/api/v1/auth/opd/otp/verify', { phone: scenario.phone, code: otp.development_code, profile });
  return call(login.access_token, 'get', '/api/v1/opd/profile');
}
const departmentFor = s => departments.find(d => d.prefix === s.department);
const marker = (scenario, kind) => `Synthetic demo / ${scenario.key} / ${kind}`;
async function availableSlot(doctor, date, patientId) {
  const slots = await api('demo_admin', 'get', `/slots?doctor_id=${doctor}&date=${date}`);
  const appointments = (await api('demo_admin', 'get', '/appointments')).filter(a => a.patient_id === patientId && !['CANCELLED', 'NO_SHOW'].includes(a.status));
  return slots.find(s => new Date(s.scheduled_at).getTime() > Date.now() + 10000 && !appointments.some(a => a.scheduled_at < s.ends_at && a.ends_at > s.scheduled_at));
}
async function appointmentFor(scenario, kind) {
  const reason = marker(scenario, kind);
  const existing = (await api('demo_admin', 'get', '/appointments')).find(a => a.patient_id === scenario.patient.id && a.reason === reason);
  if (existing) return existing;
  const department = departmentFor(scenario);
  let slot = await availableSlot(department.doctor, day(), scenario.patient.id);
  // Late-night setup stays usable without inventing past visits or bypassing check-in.
  for (let offset = 1; !slot && offset <= 7; offset++) {
    slot = await availableSlot(department.doctor, day(new Date(Date.now() + offset * 86400000)), scenario.patient.id);
  }
  if (!slot) throw new Error('No genuine appointment slots are available within seven days. Existing records are preserved.');
  return api('demo_admin', 'post', '/appointments', { patient_id: scenario.patient.id, doctor_id: department.doctor, scheduled_at: slot.scheduled_at, reason }, 201);
}
async function queueEntry(encounterId) {
  return (await api('demo_admin', 'get', '/queue')).find(q => q.encounter_id === encounterId);
}
async function advance(scenario, appointment, target) {
  if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appointment.status)) return null;
  if (!appointment.encounter_id && day(new Date(appointment.scheduled_at)) !== day()) {
    deferred.add(scenario.name + ' — appointment ' + day(new Date(appointment.scheduled_at)));
    return null;
  }
  const department = departmentFor(scenario);
  let q = appointment.encounter_id ? await queueEntry(appointment.encounter_id) : await api('demo_admin', 'post', `/appointments/${appointment.id}/check-in`, { identity_verified: true });
  if (!q) return null;
  const order = ['WAITING', 'TRIAGE', 'WAITING_DOCTOR', 'DOCTOR_READY', 'CONSULTATION'];
  while (order.indexOf(q.status) < order.indexOf(target)) {
    if (q.status === 'WAITING') await api(department.nurse, 'post', `/encounters/${q.encounter_id}/start-triage`, { __v: q.__v });
    else if (q.status === 'TRIAGE') await api(department.nurse, 'post', `/encounters/${q.encounter_id}/triage`, { __v: q.__v, data: { temperature: 36.7, systolic: scenario.systolic || 124, diastolic: scenario.diastolic || 78, pulse: scenario.key === 'paediatrics' ? 90 : 76, spo2: 98, weight: scenario.weight || 64, height: scenario.height || 162, glucose: scenario.glucose ?? null, complaint: scenario.complaint, allergies: scenario.patient.allergies, pain: 1, notes: 'Synthetic intake recorded through the nurse workflow for product demonstration.', priority: scenario.priority || 0 } });
    else if (q.status === 'WAITING_DOCTOR') await api(department.doctor, 'post', `/encounters/${q.encounter_id}/call`, { __v: q.__v });
    else if (q.status === 'DOCTOR_READY') await api(department.doctor, 'post', `/encounters/${q.encounter_id}/start`, { __v: q.__v });
    else throw new Error(`Cannot advance unexpected queue state ${q.status}.`);
    q = await queueEntry(q.encounter_id);
  }
  return q;
}
function consultationFor(scenario, catalogue) {
  const drug = catalogue.drugs.find(d => d.name === (scenario.key === 'diabetes' ? 'Metformin (Demo)' : 'Paracetamol (Demo)'));
  return { complaint: scenario.complaint, history: `Synthetic ${scenario.key} case recorded for workflow demonstration. Patient reports a scheduled review; no real clinical history.`, previous_history: scenario.key === 'diabetes' ? 'Synthetic record of diabetes monitoring.' : 'Synthetic previous history reviewed.', examination: 'Synthetic examination: patient alert, comfortable and attending a planned review.', assessment: 'Synthetic assessment for product demonstration only.', diagnosis_ids: [catalogue.diagnoses.find(d => d.name === scenario.diagnosis).id], treatment: 'Demonstration care plan recorded by the assigned demo doctor.', advice: 'This is a synthetic demonstration record, not medical advice or an actual prescription.', medications: [{ drug_id: drug.id, dose: '1 tablet (demo)', frequency: 'Once daily (demo)', duration: '7 days (demo)', instructions: 'Synthetic example only. Do not use this record for treatment.' }], follow_up: null };
}
async function ensureLab(scenario, encounterId, catalogue, desired) {
  const department = departmentFor(scenario);
  const test = catalogue.tests.find(t => t.code === (scenario.key === 'diabetes' ? 'DEMO-HBA1C' : 'DEMO-HB'));
  let lab = (await api('demo_admin', 'get', '/labs')).find(l => l.encounter_id === encounterId && l.test_id === test.id);
  if (!lab) {
    const created = await api(department.doctor, 'post', `/encounters/${encounterId}/labs`, { test_id: test.id }, 201);
    lab = (await api('demo_admin', 'get', '/labs')).find(l => l.id === created.id);
  }
  for (const [state, action] of [['ORDERED', 'collect'], ['COLLECTED', 'process']]) {
    if (desired !== 'ORDERED' && lab.status === state) {
      await api('demo_admin', 'post', `/labs/${lab.id}/${action}`, { __v: lab.__v });
      lab = (await api('demo_admin', 'get', '/labs')).find(l => l.id === lab.id);
    }
  }
  if (desired !== 'ORDERED' && lab.status === 'PROCESSING') {
    await api('demo_admin', 'post', `/labs/${lab.id}/result`, { __v: lab.__v, data: { value: scenario.key === 'diabetes' ? '6.8' : '12.6', unit: test.unit, reference_range: test.reference_range, flag: scenario.key === 'diabetes' ? 'HIGH' : 'NORMAL', verified: true, released: true, reason: 'Verified and released synthetic demonstration result; not a real laboratory measurement.' } });
    lab = (await api('demo_admin', 'get', '/labs')).find(l => l.id === lab.id);
  }
  if (desired === 'REVIEWED' && lab.status === 'AVAILABLE') await api(department.doctor, 'post', `/labs/${lab.id}/review`, { __v: lab.__v });
}
async function baseline(scenario, catalogue) {
  const department = departmentFor(scenario);
  const appointment = await appointmentFor(scenario, 'completed visit');
  if (['CANCELLED', 'NO_SHOW'].includes(appointment.status)) return;
  if (appointment.status === 'COMPLETED') {
    await ensureLab(scenario, appointment.encounter_id, catalogue, scenario.result);
    return;
  }
  const q = await advance(scenario, appointment, 'CONSULTATION');
  if (!q) return;
  const record = await api(department.doctor, 'get', `/patients/${scenario.patient.id}/record`);
  const existing = record.notes.find(n => n.encounter_id === q.encounter_id);
  const consultation = consultationFor(scenario, catalogue);
  if (scenario.followUp) {
    const followDay = day(new Date(Date.now() + 7 * 86400000));
    const slot = await availableSlot(department.doctor, followDay, scenario.patient.id);
    if (!slot) throw new Error('No available follow-up slot; existing demo records were preserved.');
    consultation.follow_up = { doctor_id: department.doctor, scheduled_at: slot.scheduled_at, reason: marker(scenario, 'follow-up') };
  }
  // Order while the encounter is open; the same order continues after signing.
  await ensureLab(scenario, q.encounter_id, catalogue, 'ORDERED');
  await api(department.doctor, 'post', `/encounters/${q.encounter_id}/complete`, { __v: existing?.__v || 0, data: consultation });
  await ensureLab(scenario, q.encounter_id, catalogue, scenario.result);
}
async function run() {
  console.log(`Preparing additive local synthetic demo: ${demoPath}`);
  const catalogue = await configure();
  for (const scenario of scenarios) scenario.patient = await ensurePatient(scenario);
  // Finish sample histories before opening a current consultation for the same doctor.
  for (const scenario of scenarios.filter(s => s.baseline)) await baseline(scenario, catalogue);
  for (const scenario of scenarios.filter(s => s.target)) {
    const appointment = await appointmentFor(scenario, 'current visit');
    const q = await advance(scenario, appointment, scenario.target);
    if (q?.status === 'CONSULTATION' && scenario.target === 'CONSULTATION') {
      const department = departmentFor(scenario);
      const record = await api(department.doctor, 'get', `/patients/${scenario.patient.id}/record`);
      if (!record.notes.some(n => n.encounter_id === q.encounter_id)) await api(department.doctor, 'put', `/encounters/${q.encounter_id}/consultation`, { __v: 0, data: consultationFor(scenario, catalogue) });
      await ensureLab(scenario, q.encounter_id, catalogue, 'ORDERED');
    }
  }
  const dashboard = await api('demo_admin', 'get', '/dashboard');
  if (deferred.size) console.log('\nLimited same-day capacity: these appointments remain scheduled, without check-in. Rerun on their appointment date to build the remaining clinical scenarios.\n' + [...deferred].join('\n'));
  console.log(`\nReady: ${scenarios.length} synthetic patients; ${dashboard.checked_in} checked in today; ${dashboard.completed} completed visits today.`);
  console.log(`\nStaff password: ${PASSWORD}\nReception/Admin: demo_admin\nGeneral medicine doctor: demo_doctor\nGeneral medicine nurse: demo_nurse\nCardiology: demo_cardiologist / demo_cardio_nurse\nPaediatrics: demo_paediatrician / demo_paeds_nurse`);
  console.log('\nPatient sign-in: select a phone below and request an OTP. The local login screen displays the freshly generated development code.');
  for (const scenario of scenarios) console.log(`${scenario.phone}  ${scenario.name}`);
  console.log('\nStart against this same database from the project root:');
  console.log(`OPD_DEMO_OTP=true DB_DIALECT=sqlite SQLITE_PATH=${JSON.stringify(demoPath)} npm run dev`);
  console.log('\nExisting patients, schedules, signed records and progressed visits are preserved on rerun. Clinical timestamps are the actual time of the API actions.');
}
run().then(() => process.exit(0)).catch(error => {
  console.error(`Demo setup stopped: ${error.message}\nNo reset was performed. Fix the cause and rerun to resume missing fixtures.`);
  process.exit(1);
});
