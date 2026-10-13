const bcrypt = require('bcryptjs');
const { logEvent } = require('./lib/logger');

const BCRYPT_COST = 10;
const MIN_BOOTSTRAP_PASSWORD_LENGTH = 12;

function readBootstrapConfig() {
  const id = process.env.BOOTSTRAP_ADMIN_ID?.trim();
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();

  return { id, name, password };
}

function hasBootstrapConfig(config = readBootstrapConfig()) {
  return Boolean(config.id || config.name || config.password);
}

async function ensureBootstrapAdmin({ get, run }) {
  const config = readBootstrapConfig();

  if (!hasBootstrapConfig(config)) {
    return { created: false, skipped: true, reason: 'not_configured' };
  }

  if (!config.id || !config.name || !config.password) {
    throw new Error('BOOTSTRAP_ADMIN_ID, BOOTSTRAP_ADMIN_NAME, and BOOTSTRAP_ADMIN_PASSWORD must all be set together.');
  }

  if (config.password.length < MIN_BOOTSTRAP_PASSWORD_LENGTH) {
    throw new Error(`BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_BOOTSTRAP_PASSWORD_LENGTH} characters long.`);
  }

  const existing = await get(`SELECT id FROM users WHERE id = ?`, [config.id]);
  if (existing) {
    return { created: false, skipped: true, reason: 'already_exists', userId: config.id };
  }

  const passwordHash = await bcrypt.hash(config.password, BCRYPT_COST);
  await run(
    `INSERT INTO users (id, role, name, password_hash, is_active, failed_attempts, locked_until, created_at, updated_at)
     VALUES (?, 'ADMIN', ?, ?, 1, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [config.id, config.name, passwordHash]
  );

  logEvent('info', 'bootstrap_admin_created', { userId: config.id });

  return { created: true, skipped: false, userId: config.id };
}

async function ensureAdminAccessProvisioned({ get }) {
  const row = await get(`SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN'`);
  const count = Number(row?.count || 0);

  if (count > 0) {
    return;
  }

  if (hasBootstrapConfig()) {
    return;
  }

  throw new Error('No ADMIN account exists. Set BOOTSTRAP_ADMIN_* env vars for the first pilot deploy or restore a database backup with an admin user.');
}

module.exports = {
  ensureBootstrapAdmin,
  ensureAdminAccessProvisioned
};
