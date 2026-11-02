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
  OTP_DELIVERY_PROVIDER: 'webhook',
  SMS_WEBHOOK_URL: 'https://sms.invalid/dispatch',
  SMS_WEBHOOK_TOKEN: 'synthetic-sms-adapter-credential',
  BACKUP_ENCRYPTION_KEY: 'a'.repeat(64), PERSISTENT_DATA_ROOT: '/var/data',
  PATIENT_DOCUMENT_STORAGE_PATH: '/var/data/patient-documents',
  ...overrides
});
const check = env => validateRuntimeConfig(loadRuntimeConfig(env));

test('local v2 development works without SMS or legacy activation configuration', () => {
  assert.deepEqual(check({}).errors, []);
  assert.deepEqual(check({ ACTIVATION_OTP_DELIVERY: 'obsolete-unused-value' }).errors, []);
});

test('custom clinical rules default off and need an explicit approved protocol identifier',()=>{
  assert.equal(loadRuntimeConfig({}).clinicalRulesApproved,false);
  assert.ok(check({CLINICAL_RULES_APPROVED:'true'}).errors.some(e=>e.includes('CLINICAL_PROTOCOL_VERSION')));
  assert.deepEqual(check({CLINICAL_RULES_APPROVED:'true',CLINICAL_PROTOCOL_VERSION:'hospital-review-2026-v1'}).errors,[]);
});

test('production and restricted deployments require PostgreSQL, JWT, explicit origins and an explicit OTP provider', () => {
  for (const env of [{ NODE_ENV: 'production' }, { APP_ENV: 'restricted_web_pilot' }]) {
    const errors = check(env).errors.join('\n');
    for (const required of ['DB_DIALECT', 'JWT_SECRET', 'CORS_ORIGIN', 'OTP_DELIVERY_PROVIDER']) assert.ok(errors.includes(required), required);
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

test('MSG91 selection requires credentials, template and exact variable mapping', () => {
  const msg91 = overrides => lockedEnv({
    OTP_DELIVERY_PROVIDER: 'msg91',
    SMS_WEBHOOK_URL: '', SMS_WEBHOOK_TOKEN: '',
    MSG91_AUTH_KEY: 'synthetic-msg91-auth-key',
    MSG91_TEMPLATE_ID: 'synthetic-template-id',
    MSG91_OTP_VARIABLE: 'OTP',
    ...overrides
  });
  assert.deepEqual(check(msg91({})).errors, []);
  for (const [name, expected] of [
    ['MSG91_AUTH_KEY', 'MSG91_AUTH_KEY'],
    ['MSG91_TEMPLATE_ID', 'MSG91_TEMPLATE_ID'],
    ['MSG91_OTP_VARIABLE', 'MSG91_OTP_VARIABLE']
  ]) assert.ok(check(msg91({ [name]: '' })).errors.some(e => e.includes(expected)), name);
  assert.ok(check(msg91({ MSG91_OTP_VARIABLE: 'template_id' })).errors.some(e => e.includes('conflicts')));
  assert.ok(check(msg91({ OPD_DEMO_OTP: 'true' })).errors.some(e => e.includes('never fall back')));
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
    MSG91_AUTH_KEY: 'synthetic-unused-msg91-credential',
    BOOTSTRAP_ADMIN_ID: 'admin', BOOTSTRAP_ADMIN_NAME: 'Synthetic Admin', BOOTSTRAP_ADMIN_PASSWORD: 'synthetic-bootstrap-credential'
  });
  const config = loadRuntimeConfig(env);
  const diagnostics = JSON.stringify({ config: describeRuntimeConfig(config), validation: validateRuntimeConfig(config) });
  for (const hidden of [env.JWT_SECRET, env.DATABASE_URL, env.SMS_WEBHOOK_URL, env.SMS_WEBHOOK_TOKEN, env.MSG91_AUTH_KEY, env.BOOTSTRAP_ADMIN_PASSWORD, 'synthetic-origin-credential']) assert.ok(!diagnostics.includes(hidden));
  assert.equal(describeRuntimeConfig(config).sms_adapter_configured, true);
});

test('locked deployments reject missing, temporary or escaping document storage',()=>{
 for(const root of ['', '/', '/tmp/cc', '/var/tmp/cc', 'relative'])assert.ok(check(lockedEnv({PERSISTENT_DATA_ROOT:root})).errors.some(e=>e.includes('PERSISTENT_DATA_ROOT')));
 for(const documents of ['', '/tmp/documents', '/var/data/../outside', '/var/data', 'relative'])assert.ok(check(lockedEnv({PATIENT_DOCUMENT_STORAGE_PATH:documents})).errors.some(e=>e.includes('PATIENT_DOCUMENT_STORAGE_PATH')));
 assert.deepEqual(check(lockedEnv({PERSISTENT_DATA_ROOT:'/var/data',PATIENT_DOCUMENT_STORAGE_PATH:'/var/data/private-documents'})).errors,[]);
});


test('Render private TLS is explicit and cannot disable verification for an internet hostname',()=>{
 for(const overrides of [{RENDER:'false'}, {DATABASE_SSL:'false'}, {DATABASE_URL:'postgres://u:p@dpg-synthetic.evil.invalid/database'}])assert.ok(check(lockedEnv({DATABASE_TLS_MODE:'render_private',RENDER:'true',DATABASE_SSL:'true',DATABASE_URL:'postgres://u:p@dpg-synthetic-a/database',...overrides})).errors.some(e=>e.includes('render_private')));
 assert.deepEqual(check(lockedEnv({DATABASE_TLS_MODE:'render_private',RENDER:'true',DATABASE_SSL:'true',DATABASE_URL:'postgres://u:p@dpg-synthetic-a/database'})).errors,[]);
 assert.equal(loadRuntimeConfig({}).databaseTlsMode,'verify');
});
