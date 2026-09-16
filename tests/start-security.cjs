// Disposable synthetic security-browser fixture; never opens the saved demo DB.
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fixture = path.join(mkdtempSync(path.join(tmpdir(), 'cc-opd-security-browser-')), 'fixture.db');
Object.assign(process.env, {
  NODE_ENV: 'development', APP_ENV: 'local_dev', OPD_DEMO_OTP: 'true',
  ENABLE_LEGACY_API: 'false', DB_DIALECT: 'sqlite', SQLITE_PATH: fixture,
  OPD_DEMO_DB: fixture, PORT: '3003', CORS_ORIGIN: 'http://127.0.0.1:5175',
  JWT_SECRET: '9087a416cd21b1b746a211731b4a7099ecb073d9a16a4a44',
});
const seeded = spawnSync(process.execPath, ['backend/opd/demo.cjs'], { env: process.env, encoding: 'utf8' });
if (seeded.status !== 0) { console.error(seeded.stderr, seeded.stdout.slice(-5000)); process.exit(1); }
console.log('Isolated security browser fixture seeded through API.');
const app = require('../backend/server');
app.listen(3003, '127.0.0.1', () => console.log('Security browser fixture listening on 3003'));
