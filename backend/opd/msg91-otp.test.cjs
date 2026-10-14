const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_ENV: 'local_dev',
  OPD_DEMO_OTP: 'false',
  OTP_DELIVERY_PROVIDER: 'msg91',
  MSG91_AUTH_KEY: 'synthetic-route-msg91-key',
  MSG91_TEMPLATE_ID: 'synthetic-route-template-id',
  MSG91_OTP_VARIABLE: 'OTP',
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  DB_DIALECT: 'sqlite',
  SQLITE_PATH: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-msg91-')), 'test.db')
});

const { Msg91OtpProvider, createOtpDeliveryProvider, msg91PhoneNumber } = require('./otp.ts');
const express = require('express');
const request = require('supertest');
const db = require('../database');
const app = express();
app.use(express.json());
app.use('/otp', require('./auth.ts').authRouter);
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.code || 'INTERNAL' }));
after(() => new Promise((resolve, reject) => db.db.close(error => error ? reject(error) : resolve())));
const authKey = 'synthetic-msg91-key-never-log';
const otp = '604219';
const input = { phoneNumber: '+919000000099', otp, purpose: 'PATIENT_LOGIN', challengeId: 'challenge-synthetic' };
const config = overrides => ({
  otpDeliveryProvider: 'msg91',
  opdDemoOtp: false,
  msg91AuthKey: authKey,
  msg91TemplateId: 'synthetic-template-id',
  msg91OtpVariable: 'OTP',
  ...overrides
});
const response = (status, body) => new Response(body, { status, headers: { 'content-type': 'application/json' } });
const failure = promise => assert.rejects(promise, error => error?.code === 'SMS_DELIVERY_FAILED');

test('MSG91 accepts a Chettinad OTP using the V5 Flow contract and international number format', async () => {
  let request;
  const provider = new Msg91OtpProvider(config(), async (url, options) => {
    request = { url: String(url), options, body: JSON.parse(options.body) };
    return response(200, JSON.stringify({ type: 'success', message: 'synthetic-request-id' }));
  });
  await provider.sendOtp(input);
  assert.equal(request.url, 'https://control.msg91.com/api/v5/flow');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers.authkey, authKey);
  assert.deepEqual(request.body, {
    template_id: 'synthetic-template-id',
    short_url: '0',
    recipients: [{ mobiles: '919000000099', OTP: otp }]
  });
  assert.ok(request.options.signal instanceof AbortSignal);
});

test('MSG91 rejects provider 4xx and 5xx responses without exposing response details', async () => {
  for (const status of [400, 503]) {
    const provider = new Msg91OtpProvider(config(), async () => response(status, JSON.stringify({ type: 'error', message: `sensitive-${status}` })));
    await failure(provider.sendOtp(input));
  }
});

test('MSG91 rejects timeout and malformed responses', async () => {
  const timeout = new Msg91OtpProvider(config(), async () => { throw new DOMException('timed out', 'AbortError'); });
  await failure(timeout.sendOtp(input));
  const malformed = new Msg91OtpProvider(config(), async () => response(200, 'not-json'));
  await failure(malformed.sendOtp(input));
  const falseSuccess = new Msg91OtpProvider(config(), async () => response(200, JSON.stringify({ type: 'error', message: 'not accepted' })));
  await failure(falseSuccess.sendOtp(input));
});

test('MSG91 requires auth key and template ID', async () => {
  for (const overrides of [{ msg91AuthKey: '' }, { msg91TemplateId: '' }]) {
    let called = false;
    const provider = new Msg91OtpProvider(config(overrides), async () => { called = true; return response(200, '{}'); });
    await assert.rejects(provider.sendOtp(input), error => error?.code === 'SMS_NOT_CONFIGURED');
    assert.equal(called, false);
  }
});

test('MSG91 rejects malformed canonical phones and strips only the leading plus', async () => {
  for (const phone of ['9503344617', '+19503344617', '+915503344617', '+91950334461']) {
    assert.throws(() => msg91PhoneNumber(phone), error => error?.code === 'SMS_DELIVERY_FAILED');
  }
  assert.equal(msg91PhoneNumber('+919000000099'), '919000000099');
});

test('MSG91 structured logs omit OTP and auth key', async () => {
  const lines = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = console.error = (...args) => lines.push(args.join(' '));
  try {
    const accepted = new Msg91OtpProvider(config(), async () => response(200, JSON.stringify({ type: 'success', message: 'synthetic-request-id' })));
    await accepted.sendOtp(input);
    const rejected = new Msg91OtpProvider(config(), async () => response(401, JSON.stringify({ type: 'error', message: authKey + otp })));
    await failure(rejected.sendOtp(input));
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  const logs = lines.join('\n');
  assert.ok(logs.includes('OTP_DELIVERY_REQUESTED'));
  assert.ok(logs.includes('OTP_DELIVERY_ACCEPTED'));
  assert.ok(logs.includes('OTP_DELIVERY_FAILED'));
  assert.ok(logs.includes('******0099'));
  assert.ok(!logs.includes(otp));
  assert.ok(!logs.includes(authKey));
  assert.ok(!logs.includes('+919000000099'));
});

test('selecting MSG91 never falls back to the development provider', async () => {
  let called = false;
  const provider = createOtpDeliveryProvider(config({ opdDemoOtp: true, msg91AuthKey: '' }), async () => { called = true; return response(200, '{}'); });
  assert.equal(provider.name, 'msg91');
  await assert.rejects(provider.sendOtp(input), error => error?.code === 'SMS_NOT_CONFIGURED');
  assert.equal(called, false);
});

test('MSG91 route accepts delivery without exposing OTP and invalidates a failed challenge', async () => {
  await db.migrateDatabase();
  const originalFetch = global.fetch;
  let sentOtp;
  try {
    global.fetch = async (_url, options) => {
      sentOtp = JSON.parse(options.body).recipients[0].OTP;
      return response(200, JSON.stringify({ type: 'success', message: 'synthetic-request-id' }));
    };
    const accepted = await request(app).post('/otp/otp/request').send({ phone: '+919000000091' });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.development_code, undefined);
    assert.ok(!JSON.stringify(accepted.body).includes(sentOtp));
    const audit = await db.all('SELECT * FROM audit_logs');
    assert.ok(!JSON.stringify(audit).includes(sentOtp));

    global.fetch = async () => response(500, JSON.stringify({ type: 'error', message: 'synthetic failure' }));
    const failed = await request(app).post('/otp/otp/request').send({ phone: '+919000000092' });
    assert.equal(failed.status, 503);
    assert.equal((await db.get("SELECT consumed FROM patient_otps WHERE phone='+919000000092'")).consumed, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
