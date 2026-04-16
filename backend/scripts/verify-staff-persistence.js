const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

const backendDir = path.resolve(__dirname, '..');
const verificationDbPath = path.join(backendDir, 'staff-persistence-verification.db');
const port = Number(process.env.PERSISTENCE_VERIFY_PORT || 3105);
const baseURL = `http://127.0.0.1:${port}/api/v1`;

const TEST_USERS = {
  admin: {
    id: 'persist_admin',
    name: 'Persistence Admin',
    password: 'PersistAdmin2026!'
  },
  doctor: {
    id: 'doctor_persist_suite',
    name: 'Persistence Doctor',
    department: 'Cardiology',
    updatedName: 'Persistence Doctor Updated',
    updatedDepartment: 'Neurology',
    password: 'DoctorPersist2026!'
  },
  nurse: {
    id: 'nurse_persist_suite',
    name: 'Persistence Nurse',
    updatedName: 'Persistence Nurse Updated',
    password: 'NursePersist2026!'
  }
};

function log(step, detail) {
  console.log(`[verify:staff-persistence] ${step}${detail ? `: ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openSqlite(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(db);
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function dbClose(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function waitForServerReady() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const res = await axios.get(`${baseURL}/health`, { timeout: 1000 });
      if (res.status === 200) {
        return;
      }
    } catch {
      await sleep(250);
    }
  }

  throw new Error('Server did not become ready in time.');
}

async function startServer() {
  const child = spawn('node', ['server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(port),
      DB_DIALECT: 'sqlite',
      SQLITE_PATH: path.basename(verificationDbPath),
      JWT_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      NODE_ENV: 'development',
      APP_ENV: 'local_dev',
      BOOTSTRAP_ADMIN_ID: TEST_USERS.admin.id,
      BOOTSTRAP_ADMIN_NAME: TEST_USERS.admin.name,
      BOOTSTRAP_ADMIN_PASSWORD: TEST_USERS.admin.password
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));

  await waitForServerReady();
  return child;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');

  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    sleep(5000).then(() => false)
  ]);

  if (!exited) {
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

function createSessionClient() {
  const client = axios.create({
    baseURL,
    timeout: 10000,
    validateStatus: () => true
  });

  let cookieHeader = '';

  return {
    async request(method, url, options = {}) {
      const headers = { ...(options.headers || {}) };
      if (options.token) {
        headers.Authorization = `Bearer ${options.token}`;
      }
      if (cookieHeader) {
        headers.Cookie = cookieHeader;
      }

      const response = await client.request({
        method,
        url,
        data: options.data,
        headers
      });

      const setCookie = response.headers['set-cookie'];
      if (Array.isArray(setCookie) && setCookie.length > 0) {
        cookieHeader = setCookie.map((entry) => entry.split(';')[0]).join('; ');
      }

      return response;
    }
  };
}

async function verifyPasswordHash() {
  const db = await openSqlite(verificationDbPath);
  try {
    const row = await dbGet(
      db,
      `SELECT id, department, password_hash
       FROM users
       WHERE id = ?`,
      [TEST_USERS.doctor.id]
    );

    assert.ok(row, 'Created doctor row must exist in the database.');
    assert.equal(row.department, TEST_USERS.doctor.updatedDepartment, 'Doctor department must be persisted in the users table.');
    assert.notEqual(row.password_hash, TEST_USERS.doctor.password, 'Password must not be stored in plaintext.');
    assert.equal(await bcrypt.compare(TEST_USERS.doctor.password, row.password_hash), true, 'Stored password hash must validate.');
    log('hash-check', `doctor row persisted with bcrypt hash for ${row.id}`);
  } finally {
    await dbClose(db);
  }
}

async function main() {
  await fs.rm(verificationDbPath, { force: true });

  let server = null;
  try {
    log('start', 'booting backend for first pass');
    server = await startServer();

    const adminSession = createSessionClient();
    const adminLogin = await adminSession.request('post', '/auth/login/staff', {
      data: { username: TEST_USERS.admin.id, password: TEST_USERS.admin.password }
    });
    assert.equal(adminLogin.status, 200, 'Bootstrap admin login must succeed.');
    let adminToken = adminLogin.data.access_token;

    const doctorCreate = await adminSession.request('post', '/admin/users', {
      token: adminToken,
      data: {
        username: TEST_USERS.doctor.id,
        fullName: TEST_USERS.doctor.name,
        role: 'DOCTOR',
        password: TEST_USERS.doctor.password,
        department: TEST_USERS.doctor.department
      }
    });
    assert.equal(doctorCreate.status, 201, 'Doctor creation must succeed.');

    const nurseCreate = await adminSession.request('post', '/admin/users', {
      token: adminToken,
      data: {
        username: TEST_USERS.nurse.id,
        fullName: TEST_USERS.nurse.name,
        role: 'NURSE',
        password: TEST_USERS.nurse.password
      }
    });
    assert.equal(nurseCreate.status, 201, 'Nurse creation must succeed.');

    const duplicateCreate = await adminSession.request('post', '/admin/users', {
      token: adminToken,
      data: {
        username: TEST_USERS.doctor.id,
        fullName: 'Duplicate Persistence Doctor',
        role: 'DOCTOR',
        password: 'DuplicatePersist2026!',
        department: TEST_USERS.doctor.department
      }
    });
    assert.equal(duplicateCreate.status, 409, 'Duplicate usernames must be rejected.');
    assert.equal(duplicateCreate.data.error.code, 'USER_EXISTS', 'Duplicate username errors must stay explicit.');

    const immutableUsernameUpdate = await adminSession.request('patch', `/admin/users/${TEST_USERS.doctor.id}`, {
      token: adminToken,
      data: {
        username: 'doctor_should_not_change',
        fullName: TEST_USERS.doctor.name,
        role: 'DOCTOR',
        department: TEST_USERS.doctor.department
      }
    });
    assert.equal(immutableUsernameUpdate.status, 400, 'Username edits must be blocked.');
    assert.equal(immutableUsernameUpdate.data.error.code, 'USERNAME_IMMUTABLE', 'Username immutability must be explicit.');

    const doctorEdit = await adminSession.request('patch', `/admin/users/${TEST_USERS.doctor.id}`, {
      token: adminToken,
      data: {
        fullName: TEST_USERS.doctor.updatedName,
        role: 'DOCTOR',
        department: TEST_USERS.doctor.updatedDepartment
      }
    });
    assert.equal(doctorEdit.status, 200, 'Doctor edits must succeed.');
    assert.equal(doctorEdit.data.user.name, TEST_USERS.doctor.updatedName, 'Doctor edit response must return updated full name.');
    assert.equal(doctorEdit.data.user.department, TEST_USERS.doctor.updatedDepartment, 'Doctor edit response must return updated department.');

    const nurseEdit = await adminSession.request('patch', `/admin/users/${TEST_USERS.nurse.id}`, {
      token: adminToken,
      data: {
        fullName: TEST_USERS.nurse.updatedName,
        role: 'NURSE',
        department: null
      }
    });
    assert.equal(nurseEdit.status, 200, 'Nurse edits must succeed.');

    const beforeLogout = await adminSession.request('get', '/admin/users', { token: adminToken });
    assert.equal(beforeLogout.status, 200, 'Staff directory must load before logout.');
    assert.ok(beforeLogout.data.some((user) => user.id === TEST_USERS.doctor.id && user.name === TEST_USERS.doctor.updatedName && user.department === TEST_USERS.doctor.updatedDepartment));
    assert.ok(beforeLogout.data.some((user) => user.id === TEST_USERS.nurse.id && user.name === TEST_USERS.nurse.updatedName && user.role === 'NURSE'));
    log('before-restart', JSON.stringify(beforeLogout.data.map((user) => ({
      id: user.id,
      role: user.role,
      department: user.department || null,
      status: user.status
    }))));

    await verifyPasswordHash();

    const logoutRes = await adminSession.request('post', '/auth/logout');
    assert.equal(logoutRes.status, 200, 'Admin logout must succeed.');

    const adminRelogin = await adminSession.request('post', '/auth/login/staff', {
      data: { username: TEST_USERS.admin.id, password: TEST_USERS.admin.password }
    });
    assert.equal(adminRelogin.status, 200, 'Admin re-login must succeed after logout.');
    adminToken = adminRelogin.data.access_token;

    const afterRelogin = await adminSession.request('get', '/admin/users', { token: adminToken });
    assert.equal(afterRelogin.status, 200, 'Staff directory must load after admin re-login.');
    assert.ok(afterRelogin.data.some((user) => user.id === TEST_USERS.doctor.id && user.name === TEST_USERS.doctor.updatedName), 'Doctor must persist after admin logout/login.');
    assert.ok(afterRelogin.data.some((user) => user.id === TEST_USERS.nurse.id && user.name === TEST_USERS.nurse.updatedName), 'Nurse must persist after admin logout/login.');
    log('after-relogin', JSON.stringify(afterRelogin.data.map((user) => ({
      id: user.id,
      role: user.role,
      department: user.department || null,
      status: user.status
    }))));

    await stopServer(server);
    server = null;

    log('restart', 'booting backend for second pass');
    server = await startServer();

    const postRestartAdminSession = createSessionClient();
    const postRestartAdminLogin = await postRestartAdminSession.request('post', '/auth/login/staff', {
      data: { username: TEST_USERS.admin.id, password: TEST_USERS.admin.password }
    });
    assert.equal(postRestartAdminLogin.status, 200, 'Admin login must still succeed after restart.');
    const postRestartAdminToken = postRestartAdminLogin.data.access_token;

    const afterRestart = await postRestartAdminSession.request('get', '/admin/users', { token: postRestartAdminToken });
    assert.equal(afterRestart.status, 200, 'Staff directory must load after restart.');
    assert.ok(afterRestart.data.some((user) => user.id === TEST_USERS.doctor.id && user.name === TEST_USERS.doctor.updatedName && user.department === TEST_USERS.doctor.updatedDepartment));
    assert.ok(afterRestart.data.some((user) => user.id === TEST_USERS.nurse.id && user.name === TEST_USERS.nurse.updatedName && user.role === 'NURSE'));
    log('after-restart', JSON.stringify(afterRestart.data.map((user) => ({
      id: user.id,
      role: user.role,
      department: user.department || null,
      status: user.status
    }))));

    const doctorSession = createSessionClient();
    const doctorLogin = await doctorSession.request('post', '/auth/login/staff', {
      data: { username: TEST_USERS.doctor.id, password: TEST_USERS.doctor.password }
    });
    assert.equal(doctorLogin.status, 200, 'Doctor must log in after restart.');

    const nurseSession = createSessionClient();
    const nurseLogin = await nurseSession.request('post', '/auth/login/staff', {
      data: { username: TEST_USERS.nurse.id, password: TEST_USERS.nurse.password }
    });
    assert.equal(nurseLogin.status, 200, 'Nurse must log in after restart.');
    log('login-proof', `doctor=${doctorLogin.status}, nurse=${nurseLogin.status}`);

    console.log('\nPERSISTENCE VERIFICATION PASSED');
  } finally {
    await stopServer(server);
  }
}

main().catch((err) => {
  console.error('\nPERSISTENCE VERIFICATION FAILED');
  console.error(err);
  process.exit(1);
});
