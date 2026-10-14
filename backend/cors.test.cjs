const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

Object.assign(process.env, {
  NODE_ENV: 'development',
  APP_ENV: 'staging',
  DB_DIALECT: 'postgres',
  DATABASE_URL: 'postgres://synthetic:synthetic@127.0.0.1:1/synthetic',
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  CORS_ORIGIN: 'https://hospital.invalid',
  COOKIE_SECURE: 'true',
  COOKIE_SAME_SITE: 'none',
  OPD_DEMO_OTP: 'true',
  ENABLE_LEGACY_API: 'false'
  ,BACKUP_ENCRYPTION_KEY: 'a'.repeat(64), PERSISTENT_DATA_ROOT: '/var/data', PATIENT_DOCUMENT_STORAGE_PATH: '/var/data/patient-documents'
});

const request = require('supertest');
const app = require('./server');
const db = require('./database');
const { getRefreshCookieOptions } = require('./cookies');

after(async () => {
  await db.pgPool.end();
});

test('locked refresh-cookie defaults are HttpOnly, Secure, SameSite=None and auth-scoped', () => {
  const options = getRefreshCookieOptions();
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, 'none');
  assert.equal(options.path, '/api/v1/auth');
  assert.equal(options.maxAge, 30 * 24 * 60 * 60 * 1000);
  assert.equal(options.domain, undefined);
});

test('locked CORS allows only the configured credentialed browser origin', async () => {
  const allowed = await request(app)
    .options('/api/v1/auth/opd/config')
    .set('Origin', 'https://hospital.invalid')
    .set('Access-Control-Request-Method', 'GET');
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://hospital.invalid');
  assert.equal(allowed.headers['access-control-allow-credentials'], 'true');

  const denied = await request(app)
    .options('/api/v1/auth/opd/config')
    .set('Origin', 'https://unapproved.invalid')
    .set('Access-Control-Request-Method', 'GET');
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'CORS_ORIGIN_DENIED');
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});

test('locked auth routes accept native no-Origin traffic but reject browser cross-site omission', async () => {
  const native = await request(app).get('/api/v1/auth/opd/config');
  assert.equal(native.status, 200);

  const browser = await request(app)
    .post('/api/v1/auth/logout')
    .set('Sec-Fetch-Site', 'cross-site')
    .send({});
  assert.equal(browser.status, 403);
  assert.equal(browser.body.error.code, 'CSRF_REJECTED');
});
