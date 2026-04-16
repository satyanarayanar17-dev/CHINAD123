const path = require('path');

const APP_ENVS = {
  LOCAL: 'local_dev',
  PILOT: 'restricted_web_pilot'
};

const SAFE_LOCAL_ONLY_DEFAULTS = {
  NODE_ENV: 'development',
  APP_ENV: APP_ENVS.LOCAL,
  PORT: '3001',
  DB_DIALECT: 'sqlite',
  SQLITE_PATH: 'verification.db',
  DATABASE_SSL: 'false',
  PGPOOL_MAX: '10',
  PG_CONNECT_TIMEOUT_MS: '10000',
  COOKIE_SAME_SITE: 'lax',
  COOKIE_SECURE: 'false',
  ACTIVATION_OTP_DELIVERY: 'api_response',
  PILOT_AUTH_BYPASS: 'false',
  ALLOW_SEED_RESET: 'false'
};

const ENVIRONMENT_RULES = [
  {
    name: 'NODE_ENV',
    required: false,
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.NODE_ENV,
    description: 'Node runtime mode. Use development locally and production for built deployments.'
  },
  {
    name: 'APP_ENV',
    required: false,
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.APP_ENV,
    description: 'Deployment profile. local_dev enables local-only helpers; restricted_web_pilot enables pilot safeguards.'
  },
  {
    name: 'PORT',
    required: false,
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.PORT,
    description: 'Backend listen port.'
  },
  {
    name: 'DB_DIALECT',
    required: false,
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.DB_DIALECT,
    description: 'Database driver. Current pilot uses sqlite; postgres remains supported.'
  },
  {
    name: 'SQLITE_PATH',
    requiredWhen: ['sqlite'],
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.SQLITE_PATH,
    description: 'SQLite file path relative to backend/, unless already absolute. Must be explicit for pilot sqlite deploys.'
  },
  {
    name: 'DATABASE_URL',
    requiredWhen: ['postgres'],
    description: 'PostgreSQL connection string when DB_DIALECT=postgres.'
  },
  {
    name: 'DATABASE_SSL',
    required: false,
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.DATABASE_SSL,
    description: 'Enable SSL for postgres connections when required by the provider.'
  },
  {
    name: 'PGPOOL_MAX',
    required: false,
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.PGPOOL_MAX,
    description: 'Maximum postgres pool size.'
  },
  {
    name: 'PG_CONNECT_TIMEOUT_MS',
    required: false,
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.PG_CONNECT_TIMEOUT_MS,
    description: 'Postgres connection timeout in milliseconds.'
  },
  {
    name: 'JWT_SECRET',
    requiredInPilot: true,
    description: 'JWT signing key. Required for pilot/prod and must be at least 32 characters.'
  },
  {
    name: 'CORS_ORIGIN',
    requiredInPilot: true,
    description: 'Comma-separated frontend origins allowed to call the backend in pilot/prod.'
  },
  {
    name: 'COOKIE_SAME_SITE',
    required: false,
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.COOKIE_SAME_SITE,
    description: 'Refresh cookie SameSite mode.'
  },
  {
    name: 'COOKIE_SECURE',
    required: false,
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.COOKIE_SECURE,
    description: 'Refresh cookie Secure flag.'
  },
  {
    name: 'COOKIE_DOMAIN',
    required: false,
    description: 'Optional cookie domain override.'
  },
  {
    name: 'ACTIVATION_OTP_DELIVERY',
    requiredInPilot: true,
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.ACTIVATION_OTP_DELIVERY,
    description: 'Activation code delivery mode. One of api_response or console.'
  },
  {
    name: 'BOOTSTRAP_ADMIN_ID',
    required: false,
    description: 'Bootstrap admin login ID for first deploy or disaster recovery.'
  },
  {
    name: 'BOOTSTRAP_ADMIN_NAME',
    required: false,
    description: 'Bootstrap admin display name. Must be set together with the other bootstrap fields.'
  },
  {
    name: 'BOOTSTRAP_ADMIN_PASSWORD',
    required: false,
    description: 'Bootstrap admin password. Must be set together with the other bootstrap fields.'
  },
  {
    name: 'PILOT_AUTH_BYPASS',
    required: false,
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.PILOT_AUTH_BYPASS,
    localOnly: true,
    description: 'Local-only auth bypass. Must remain false in pilot/prod.'
  },
  {
    name: 'ALLOW_SEED_RESET',
    required: false,
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.ALLOW_SEED_RESET,
    localOnly: true,
    description: 'Local-only destructive seed reset switch.'
  }
];

const ALLOWED_DB_DIALECTS = new Set(['sqlite', 'postgres']);
const ALLOWED_ACTIVATION_DELIVERY_MODES = new Set(['console', 'api_response']);

function readString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function readBoolean(value, fallback = false) {
  if (typeof value !== 'string' || value.trim() === '') {
    return fallback;
  }

  return value.trim().toLowerCase() === 'true';
}

function readInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isWeakJwtSecret(secret) {
  const KNOWN_BAD = new Set([
    'pilot-beta-secure-secret-key',
    'super_secure_crypto_secret_32_characters_long_for_test',
    'changeme',
    'secret',
    'your-secret-here',
    'jwt-secret',
    'mysecret'
  ]);

  if (KNOWN_BAD.has(secret)) return true;

  const lower = secret.toLowerCase();
  const weakSubstrings = ['test', 'dev', 'secret', 'secure', 'placeholder', 'example', 'change_me', 'your_', 'sample', 'default'];
  if (weakSubstrings.some((substring) => lower.includes(substring))) return true;
  if (/\s/.test(secret)) return true;

  return false;
}

function isValidCorsOrigin(origin) {
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.pathname.replace('/', '') &&
      !url.search &&
      !url.hash;
  } catch {
    return false;
  }
}

function loadRuntimeConfig(env = process.env) {
  const nodeEnv = readString(env.NODE_ENV, SAFE_LOCAL_ONLY_DEFAULTS.NODE_ENV) || SAFE_LOCAL_ONLY_DEFAULTS.NODE_ENV;
  const appEnv = readString(env.APP_ENV, SAFE_LOCAL_ONLY_DEFAULTS.APP_ENV) || SAFE_LOCAL_ONLY_DEFAULTS.APP_ENV;
  const dbDialect = readString(env.DB_DIALECT, SAFE_LOCAL_ONLY_DEFAULTS.DB_DIALECT).toLowerCase();
  const activationDelivery = readString(env.ACTIVATION_OTP_DELIVERY, appEnv === APP_ENVS.LOCAL ? SAFE_LOCAL_ONLY_DEFAULTS.ACTIVATION_OTP_DELIVERY : '');
  const corsOrigins = readString(env.CORS_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const jwtSecret = readString(env.JWT_SECRET);

  return {
    nodeEnv,
    appEnv,
    isProduction: nodeEnv === 'production',
    isPilot: appEnv === APP_ENVS.PILOT,
    isLocalDev: appEnv === APP_ENVS.LOCAL,
    port: readInteger(env.PORT, Number(SAFE_LOCAL_ONLY_DEFAULTS.PORT)),
    dbDialect,
    sqlitePath: readString(env.SQLITE_PATH, SAFE_LOCAL_ONLY_DEFAULTS.SQLITE_PATH),
    sqliteAbsolutePath: path.resolve(__dirname, readString(env.SQLITE_PATH, SAFE_LOCAL_ONLY_DEFAULTS.SQLITE_PATH)),
    databaseUrl: readString(env.DATABASE_URL),
    databaseSsl: readBoolean(env.DATABASE_SSL, false),
    pgPoolMax: readInteger(env.PGPOOL_MAX, Number(SAFE_LOCAL_ONLY_DEFAULTS.PGPOOL_MAX)),
    pgConnectTimeoutMs: readInteger(env.PG_CONNECT_TIMEOUT_MS, Number(SAFE_LOCAL_ONLY_DEFAULTS.PG_CONNECT_TIMEOUT_MS)),
    jwtSecret,
    corsOrigins,
    cookieSameSite: readString(env.COOKIE_SAME_SITE, SAFE_LOCAL_ONLY_DEFAULTS.COOKIE_SAME_SITE),
    cookieSecure: readString(env.COOKIE_SECURE, SAFE_LOCAL_ONLY_DEFAULTS.COOKIE_SECURE),
    cookieDomain: readString(env.COOKIE_DOMAIN),
    activationOtpDelivery: activationDelivery,
    bootstrapAdmin: {
      id: readString(env.BOOTSTRAP_ADMIN_ID),
      name: readString(env.BOOTSTRAP_ADMIN_NAME),
      password: readString(env.BOOTSTRAP_ADMIN_PASSWORD)
    },
    pilotAuthBypass: readBoolean(env.PILOT_AUTH_BYPASS, false),
    allowSeedReset: readBoolean(env.ALLOW_SEED_RESET, false)
  };
}

function validateRuntimeConfig(config) {
  const errors = [];
  const warnings = [];

  if (!ALLOWED_DB_DIALECTS.has(config.dbDialect)) {
    errors.push(`DB_DIALECT must be one of: ${Array.from(ALLOWED_DB_DIALECTS).join(', ')}`);
  }

  if (config.isPilot || config.isProduction) {
    if (config.pilotAuthBypass) {
      errors.push('PILOT_AUTH_BYPASS must be false outside local_dev.');
    }
    if (config.allowSeedReset) {
      errors.push('ALLOW_SEED_RESET must be false outside local_dev.');
    }
    if (!config.jwtSecret) {
      errors.push('JWT_SECRET is required for pilot/prod deployments.');
    }
    if (!config.corsOrigins.length) {
      errors.push('CORS_ORIGIN must be set explicitly for pilot/prod deployments.');
    }
    if (!config.activationOtpDelivery) {
      errors.push('ACTIVATION_OTP_DELIVERY must be set explicitly for pilot/prod deployments.');
    }
    if (config.dbDialect === 'sqlite' && !readString(process.env.SQLITE_PATH)) {
      errors.push('SQLITE_PATH must be explicitly set for sqlite pilot deployments.');
    }
  } else if (!config.jwtSecret) {
    warnings.push('JWT_SECRET is not set. Local dev will fall back to an insecure default. Never use that outside local_dev.');
  }

  if (config.jwtSecret) {
    if (config.jwtSecret.length < 32) {
      errors.push(`JWT_SECRET must be at least 32 characters. Received ${config.jwtSecret.length}.`);
    } else if ((config.isPilot || config.isProduction) && isWeakJwtSecret(config.jwtSecret)) {
      errors.push('JWT_SECRET appears to be a placeholder or weak value. Generate a new secret with: openssl rand -hex 32');
    }
  }

  if (config.dbDialect === 'postgres' && !config.databaseUrl) {
    errors.push('DATABASE_URL is required when DB_DIALECT=postgres.');
  }

  if (config.dbDialect === 'sqlite' && !config.sqlitePath) {
    errors.push('SQLITE_PATH is required when DB_DIALECT=sqlite.');
  }

  if (config.activationOtpDelivery && !ALLOWED_ACTIVATION_DELIVERY_MODES.has(config.activationOtpDelivery)) {
    errors.push(`ACTIVATION_OTP_DELIVERY must be one of: ${Array.from(ALLOWED_ACTIVATION_DELIVERY_MODES).join(', ')}`);
  }

  if (config.corsOrigins.some((origin) => !isValidCorsOrigin(origin))) {
    errors.push('Each CORS_ORIGIN entry must be a valid bare http(s) origin without a path or query string.');
  }

  const bootstrapFields = Object.values(config.bootstrapAdmin).filter(Boolean).length;
  if (bootstrapFields > 0 && bootstrapFields < 3) {
    errors.push('BOOTSTRAP_ADMIN_ID, BOOTSTRAP_ADMIN_NAME, and BOOTSTRAP_ADMIN_PASSWORD must be set together.');
  }

  return { errors, warnings };
}

function describeRuntimeConfig(config) {
  return {
    node_env: config.nodeEnv,
    app_env: config.appEnv,
    db_dialect: config.dbDialect,
    sqlite_path: config.dbDialect === 'sqlite' ? config.sqliteAbsolutePath : null,
    cors_origins: config.corsOrigins,
    activation_otp_delivery: config.activationOtpDelivery || null,
    has_jwt_secret: Boolean(config.jwtSecret),
    bootstrap_admin_configured: Boolean(
      config.bootstrapAdmin.id &&
      config.bootstrapAdmin.name &&
      config.bootstrapAdmin.password
    ),
    allow_seed_reset: config.allowSeedReset,
    pilot_auth_bypass: config.pilotAuthBypass
  };
}

const runtimeConfig = loadRuntimeConfig();

module.exports = {
  APP_ENVS,
  ENVIRONMENT_RULES,
  SAFE_LOCAL_ONLY_DEFAULTS,
  runtimeConfig,
  loadRuntimeConfig,
  validateRuntimeConfig,
  describeRuntimeConfig
};
