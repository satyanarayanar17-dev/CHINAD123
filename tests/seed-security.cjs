const path = require('node:path');
const demoPath = process.env.SQLITE_PATH;
const PASSWORD = 'ChettinadDemo2026!';
const request = require('supertest');
const app = require('../backend/server');
const database = require('../backend/database');
const { ensureBootstrapAdmin } = require('../backend/bootstrapAdmin');
const { randomUUID } = require('crypto');
const { day } = require('../backend/opd/core.ts');
const tokens = new Map();

async function call(token, method, url, data, expected = 200) {
  const response = await request(app)[method](url).set('Authorization', token ? `Bearer ${token}` : '').send(data);
  if (response.status !== expected && response.status !== 201) {
    const code = response.body?.error?.code || response.body?.code || 'REQUEST_FAILED';
    const detail = response.body?.error?.message || response.body?.message || '';
    throw new Error(`${method.toUpperCase()} ${url}: HTTP ${response.status} ${code} ${detail}`);
  }
  return response.body;
}
const api = (who, method, url, data) => call(tokens.get(who), method, `/api/v1/opd${url}`, data);

async function loginStaff(id) {
  const auth = await call(null, 'post', '/api/v1/auth/login/staff', { username: id, password: PASSWORD });
  tokens.set(id, auth.access_token);
}

async function ensurePatient(scenario) {
  const otp = await call('', 'post', '/api/v1/auth/opd/otp/request', { phone: scenario.phone });
  const profile = { name: scenario.name, phone: scenario.phone, dob: scenario.dob, gender: scenario.gender, email: '', address: '123 Demo Street', city: 'Chennai', state: 'Tamil Nadu', pin_code: '600001', emergency_contact: '+919000000002', preferred_language: 'en', existing_mrn: '', allergies: 'No known allergies' };
  const existing = await api('ADMIN_A', 'get', '/patients?search='+encodeURIComponent(scenario.phone));
  if (!existing.some(p=>p.phone===scenario.phone)) await api('ADMIN_A','post','/patients',profile);
  const login = await call('', 'post', '/api/v1/auth/opd/otp/verify', { phone: scenario.phone, code: otp.development_code, profile });
  tokens.set(scenario.phone, login.access_token);
  const patients = await api('ADMIN_A', 'get', '/patients');
  return patients.find(p => p.name === scenario.name);
}

async function run() {
  const { resetAndSeedDatabase } = require('../backend/database');
  await resetAndSeedDatabase();
  await ensureBootstrapAdmin(database);

  // We need to change admin password because we don't have loginStaff('admin') handling bootstrap password easily here.
  // Wait, ensureBootstrapAdmin sets it to BOOTSTRAP_ADMIN_PASSWORD which we set in start-security.cjs.
  const auth = await call(null, 'post', '/api/v1/auth/login/staff', { username: 'admin', password: PASSWORD });
  tokens.set('admin', auth.access_token);

  // 1. Create ADMIN_A
  await api('admin', 'post', '/staff', { id: 'ADMIN_A', name: 'Admin A', role: 'ADMIN', department: '', password: PASSWORD });
  // Since new staff must change password, we login and change it
  const loginAdmin = await call(null, 'post', '/api/v1/auth/login/staff', { username: 'ADMIN_A', password: PASSWORD });
  await call(loginAdmin.access_token, 'post', '/api/v1/auth/change-password', { currentPassword: PASSWORD, newPassword: PASSWORD + '1' });
  await call(null, 'post', '/api/v1/auth/login/staff', { username: 'ADMIN_A', password: PASSWORD + '1' }).then(res => tokens.set('ADMIN_A', res.access_token));
  // Wait! It's easier if we just use BOOTSTRAP admin for seeding, and then set their password in the DB manually to avoid change-password requirements?
  // Let's just use the API.

  // Actually, I can use the same logic as demo.cjs.
}

run().catch(console.error);
