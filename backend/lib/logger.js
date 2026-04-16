const REDACTED = '[REDACTED]';
const REDACTED_KEYS = new Set([
  'password',
  'password_hash',
  'currentpassword',
  'current_password',
  'newpassword',
  'new_password',
  'temporarypassword',
  'temporary_password',
  'jwt_secret',
  'authorization',
  'cookie',
  'set-cookie',
  'access_token',
  'refresh_token',
  'refresh_token_id',
  'otp',
  'otp_hash',
  'activation_code',
  'secret'
]);

function shouldRedactKey(key) {
  const normalized = String(key || '').trim().toLowerCase();
  return REDACTED_KEYS.has(normalized);
}

function sanitizeContext(value, depth = 0, parentKey = '') {
  if (depth > 4) {
    return '[TRUNCATED]';
  }

  if (shouldRedactKey(parentKey)) {
    return REDACTED;
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeContext(entry, depth + 1, parentKey));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeContext(entry, depth + 1, key)])
    );
  }

  if (typeof value === 'string' && /^bearer\s+/i.test(value)) {
    return REDACTED;
  }

  return value;
}

function logEvent(level, event, context = {}) {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...sanitizeContext(context)
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

module.exports = {
  logEvent
};
