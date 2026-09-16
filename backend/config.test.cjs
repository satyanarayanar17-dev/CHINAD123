const assert = require('node:assert/strict');
const test = require('node:test');
const { loadRuntimeConfig, validateRuntimeConfig, describeRuntimeConfig } = require('./config');

const lockedEnv = overrides => ({
  NODE_ENV: 'production',
  APP_ENV: 'restricted_web_pilot',
  DB_DIALECT: 'postgres',
  DATABASE_URL: 'postgres://synthetic:synthetic-database-password@db.invalid/acceptance',
  JWT_SECRET: '1299b38d8bc31aa9483b86083f7e4c9999ab1ef4c74d2f1c',
  CORS_ORIGIN: 'https://hospital.invalid',
  SMS_WEBHOOK_URL: 'https://sms.invalid/dispatch',
  SMS_WEBHOOK_TOKEN: 'synthetic-sms-adapter-credential',
  ...overrides
});
const check = env => validateRuntimeConfig(loadRuntimeConfig(env));

test('local v2 development works without SMS or legacy activation configuration', () => {
  assert.deepEqual(check({}).errors, []);
  assert.deepEqual(check({ ACTIVATION_OTP_DELIVERY: 'obsolete-unused-value' }).errors, []);
});

test('production and restricted deployments require PostgreSQL, JWT, explicit origins and SMS', () => {
  for (const env of [{ NODE_ENV: 'production' }, { APP_ENV: 'restricted_web_pilot' }]) {
    const errors = check(env).errors.join('\n');
    for (const required of ['DB_DIALECT', 'JWT_SECRET', 'CORS_ORIGIN', 'SMS_WEBHOOK_URL', 'SMS_WEBHOOK_TOKEN']) assert.ok(errors.includes(required), required);
    assert.ok(!errors.includes('ACTIVATION_OTP_DELIVERY'));
  }
  assert.ok(check(lockedEnv({ DATABASE_URL: '' })).errors.some(e => e.includes('DATABASE_URL')));
});

test('valid locked v2 configuration defaults to secure cookies and needs no legacy activation', () => {
  for (const mode of [{ NODE_ENV: 'production', APP_ENV: 'local_dev' }, { NODE_ENV: 'development', APP_ENV: 'restricted_web_pilot' }]) {
    const config = loadRuntimeConfig(lockedEnv({ ...mode, ACTIVATION_OTP_DELIVERY: 'obsolete-unused-value' }));
    assert.deepEqual(validateRuntimeConfig(config).errors, []);
    assert.equal(config.cookieSecure, 'true');
    assert.equal(config.cookieSameSite, 'none');
  }
});

test('insecure refresh cookies and malformed cookie options are rejected', () => {
  for (const cookieSameSite of ['lax', 'strict', 'none']) assert.ok(check(lockedEnv({ COOKIE_SECURE: 'false', COOKIE_SAME_SITE: cookieSameSite })).errors.some(e => e.includes('COOKIE_SECURE')));
  assert.ok(check({ COOKIE_SAME_SITE: 'none', COOKIE_SECURE: 'false' }).errors.some(e => e.includes('COOKIE_SECURE')));
  assert.ok(check({ COOKIE_SAME_SITE: 'invalid' }).errors.some(e => e.includes('COOKIE_SAME_SITE')));
  assert.ok(check({ COOKIE_SECURE: 'yes' }).errors.some(e => e.includes('COOKIE_SECURE')));
});

test('locked CORS permits only explicit HTTPS origins', () => {
  for (const origin of ['http://hospital.invalid', 'http://localhost:5173', '*', 'https://*.hospital.invalid', 'https://user:password@hospital.invalid', 'https://hospital.invalid/app', 'https://hospital.invalid?token=value']) {
    assert.ok(check(lockedEnv({ CORS_ORIGIN: origin })).errors.some(e => e.includes('CORS_ORIGIN')), origin);
  }
  assert.deepEqual(check(lockedEnv({ CORS_ORIGIN: 'https://hospital.invalid,https://staff.hospital.invalid:8443' })).errors, []);
});

test('locked patient OTP requires a credentialed HTTPS SMS adapter', () => {
  for (const url of ['', 'http://sms.invalid/dispatch', 'not-a-url', 'https://user:password@sms.invalid/dispatch', 'https://sms.invalid/dispatch#fragment']) assert.ok(check(lockedEnv({ SMS_WEBHOOK_URL: url })).errors.some(e => e.includes('SMS_WEBHOOK_URL')));
  assert.ok(check(lockedEnv({ SMS_WEBHOOK_TOKEN: '' })).errors.some(e => e.includes('SMS_WEBHOOK_TOKEN')));
});

test('development bypass and reset flags cannot enter locked deployments', () => {
  for (const name of ['OPD_DEMO_OTP', 'ENABLE_LEGACY_API', 'PILOT_AUTH_BYPASS', 'ALLOW_SEED_RESET']) assert.ok(check(lockedEnv({ [name]: 'true' })).errors.some(e => e.includes(name)), name);
  assert.deepEqual(check({ OPD_DEMO_OTP: 'true' }).errors, []);
});

test('legacy activation validation applies only to explicitly enabled local legacy APIs', () => {
  assert.ok(check({ ENABLE_LEGACY_API: 'true', ACTIVATION_OTP_DELIVERY: 'invalid' }).errors.some(e => e.includes('ACTIVATION_OTP_DELIVERY')));
  assert.deepEqual(check({ ENABLE_LEGACY_API: 'true', ACTIVATION_OTP_DELIVERY: 'console' }).errors, []);
});

test('startup diagnostics never expose configured credentials or SMS endpoint details', () => {
  const env = lockedEnv({
    CORS_ORIGIN: 'https://user:synthetic-origin-credential@hospital.invalid',
    SMS_WEBHOOK_URL: 'https://sms.invalid/dispatch?key=synthetic-url-credential',
    BOOTSTRAP_ADMIN_ID: 'admin', BOOTSTRAP_ADMIN_NAME: 'Synthetic Admin', BOOTSTRAP_ADMIN_PASSWORD: 'synthetic-bootstrap-credential'
  });
  const config = loadRuntimeConfig(env);
  const diagnostics = JSON.stringify({ config: describeRuntimeConfig(config), validation: validateRuntimeConfig(config) });
  for (const hidden of [env.JWT_SECRET, env.DATABASE_URL, env.SMS_WEBHOOK_URL, env.SMS_WEBHOOK_TOKEN, env.BOOTSTRAP_ADMIN_PASSWORD, 'synthetic-origin-credential']) assert.ok(!diagnostics.includes(hidden));
  assert.equal(describeRuntimeConfig(config).sms_adapter_configured, true);
});
