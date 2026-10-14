const path = require('path');

const APP_ENVS = {
  LOCAL: 'local_dev',
  STAGING: 'staging',
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
  OTP_DELIVERY_PROVIDER: '',
  ACTIVATION_OTP_DELIVERY: 'api_response',
  PILOT_AUTH_BYPASS: 'false',
  ALLOW_SEED_RESET: 'false',
  OPD_OG_PILOT_ONLY: 'true'
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
    description: 'Database driver. SQLite is available locally; PostgreSQL is required for restricted and production deployments.'
  },
  {
    name: 'SQLITE_PATH',
    requiredWhen: ['sqlite'],
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.SQLITE_PATH,
    description: 'Local SQLite file path relative to backend/, unless already absolute.'
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
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.ACTIVATION_OTP_DELIVERY,
    localOnly: true,
    description: 'Legacy local activation delivery. Ignored by the v2 OTP workflow.'
  },
  {
    name: 'OPD_DEMO_OTP',
    localOnly: true,
    description: 'Return development OTPs locally. Must be false for restricted and production deployments.'
  },
  {
    name: 'OTP_DELIVERY_PROVIDER',
    requiredInPilot: true,
    description: 'Explicit patient OTP transport: development, webhook, or msg91.'
  },
  {
    name: 'SMS_WEBHOOK_URL',
    requiredInPilot: true,
    description: 'Authenticated HTTPS SMS adapter endpoint used by v2 patient OTP and notification delivery.'
  },
  {
    name: 'SMS_WEBHOOK_TOKEN',
    requiredInPilot: true,
    description: 'SMS adapter bearer credential. Supply through the deployment secret store.'
  },
  {
    name: 'MSG91_AUTH_KEY',
    description: 'MSG91 server-side authentication key. Supply through the deployment secret store.'
  },
  {
    name: 'MSG91_TEMPLATE_ID',
    description: 'MSG91 Flow SMS template ID mapped to the approved DLT content template.'
  },
  {
    name: 'MSG91_OTP_VARIABLE',
    description: 'Case-sensitive MSG91 Flow variable name that receives the Chettinad-generated OTP.'
  },
  {
    name: 'ENABLE_LEGACY_API',
    localOnly: true,
    description: 'Expose legacy routes for local development only. Must be false for restricted and production deployments.'
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
  },
  {
    name: 'OPD_PILOT_DEPARTMENT_PREFIX',
    required: false,
    safeLocalDefault: 'OBST',
    description: 'Canonical department prefix exposed by the restricted OG pilot.'
  },
  {
    name: 'OPD_OG_PILOT_ONLY',
    required: false,
    safeLocalDefault: SAFE_LOCAL_ONLY_DEFAULTS.OPD_OG_PILOT_ONLY,
    description: 'Restrict current OPD product surfaces to the canonical OBST department while preserving the multi-department schema.'
  }
];

const ALLOWED_DB_DIALECTS = new Set(['sqlite', 'postgres']);
const ALLOWED_ACTIVATION_DELIVERY_MODES = new Set(['console', 'api_response']);
const ALLOWED_OTP_DELIVERY_PROVIDERS = new Set(['development', 'webhook', 'msg91']);

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
      !url.username && !url.password && !url.hostname.includes('*') &&
      !url.pathname.replace('/', '') &&
      !url.search &&
      !url.hash;
  } catch {
    return false;
  }
}

function isValidSmsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) &&
      !url.username && !url.password && !url.hash && !url.hostname.includes('*');
  } catch {
    return false;
  }
}

function loadRuntimeConfig(env = process.env) {
  const nodeEnv = readString(env.NODE_ENV, SAFE_LOCAL_ONLY_DEFAULTS.NODE_ENV) || SAFE_LOCAL_ONLY_DEFAULTS.NODE_ENV;
  const appEnv = readString(env.APP_ENV, SAFE_LOCAL_ONLY_DEFAULTS.APP_ENV) || SAFE_LOCAL_ONLY_DEFAULTS.APP_ENV;
  const locked = nodeEnv === 'production' || appEnv === APP_ENVS.PILOT || appEnv === APP_ENVS.STAGING;
  const dbDialect = readString(env.DB_DIALECT, SAFE_LOCAL_ONLY_DEFAULTS.DB_DIALECT).toLowerCase();
  const activationDelivery = readString(env.ACTIVATION_OTP_DELIVERY, appEnv === APP_ENVS.LOCAL ? SAFE_LOCAL_ONLY_DEFAULTS.ACTIVATION_OTP_DELIVERY : '');
  const corsOrigins = readString(env.CORS_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const jwtSecret = readString(env.JWT_SECRET);
  const cookieSameSite = readString(env.COOKIE_SAME_SITE, locked ? 'none' : SAFE_LOCAL_ONLY_DEFAULTS.COOKIE_SAME_SITE).toLowerCase();
  // Mirror cookies.js: locked deployments and SameSite=None default to Secure.
  const cookieSecure = readString(env.COOKIE_SECURE, locked || cookieSameSite === 'none' ? 'true' : SAFE_LOCAL_ONLY_DEFAULTS.COOKIE_SECURE);
  const opdDemoOtp = readBoolean(env.OPD_DEMO_OTP, false);
  // OPD_DEMO_OTP is retained as the explicit legacy local switch. It selects only
  // the development provider when no provider was named; named providers never fall back.
  const otpDeliveryProvider = readString(env.OTP_DELIVERY_PROVIDER, opdDemoOtp ? 'development' : '').toLowerCase();

  return {
    nodeEnv,
    appEnv,
    isProduction: nodeEnv === 'production',
    isPilot: appEnv === APP_ENVS.PILOT,
    isStaging: appEnv === APP_ENVS.STAGING,
    isLocalDev: appEnv === APP_ENVS.LOCAL,
    port: readInteger(env.PORT, Number(SAFE_LOCAL_ONLY_DEFAULTS.PORT)),
    dbDialect,
    sqlitePath: readString(env.SQLITE_PATH, SAFE_LOCAL_ONLY_DEFAULTS.SQLITE_PATH),
    sqliteAbsolutePath: path.resolve(__dirname, readString(env.SQLITE_PATH, SAFE_LOCAL_ONLY_DEFAULTS.SQLITE_PATH)),
    databaseUrl: readString(env.DATABASE_URL),
    databaseSsl: readBoolean(env.DATABASE_SSL, false),
    databaseTlsMode: readString(env.DATABASE_TLS_MODE, 'verify'),
    isRender: readBoolean(env.RENDER, false),
    pgPoolMax: readInteger(env.PGPOOL_MAX, Number(SAFE_LOCAL_ONLY_DEFAULTS.PGPOOL_MAX)),
    pgConnectTimeoutMs: readInteger(env.PG_CONNECT_TIMEOUT_MS, Number(SAFE_LOCAL_ONLY_DEFAULTS.PG_CONNECT_TIMEOUT_MS)),
    jwtSecret,
    corsOrigins,
    cookieSameSite,
    cookieSecure,
    cookieDomain: readString(env.COOKIE_DOMAIN),
    activationOtpDelivery: activationDelivery,
    opdDemoOtp,
    otpDeliveryProvider,
    smsWebhookUrl: readString(env.SMS_WEBHOOK_URL),
    smsWebhookToken: readString(env.SMS_WEBHOOK_TOKEN),
    msg91AuthKey: readString(env.MSG91_AUTH_KEY),
    msg91TemplateId: readString(env.MSG91_TEMPLATE_ID),
    msg91OtpVariable: readString(env.MSG91_OTP_VARIABLE),
    enableLegacyApi: readBoolean(env.ENABLE_LEGACY_API, false),
    clinicalRulesApproved: readBoolean(env.CLINICAL_RULES_APPROVED, false),
    clinicalProtocolVersion: readString(env.CLINICAL_PROTOCOL_VERSION),
    backupEncryptionKey: readString(env.BACKUP_ENCRYPTION_KEY),
    persistentDataRoot: readString(env.PERSISTENT_DATA_ROOT),
    documentStoragePath: readString(env.PATIENT_DOCUMENT_STORAGE_PATH),
    bootstrapAdmin: {
      id: readString(env.BOOTSTRAP_ADMIN_ID),
      name: readString(env.BOOTSTRAP_ADMIN_NAME),
      password: readString(env.BOOTSTRAP_ADMIN_PASSWORD)
    },
    pilotAuthBypass: readBoolean(env.PILOT_AUTH_BYPASS, false),
    allowSeedReset: readBoolean(env.ALLOW_SEED_RESET, false),
    pilotDepartmentPrefix: readString(env.OPD_PILOT_DEPARTMENT_PREFIX, 'OBST'),
    ogPilotOnly: readBoolean(env.OPD_OG_PILOT_ONLY, appEnv === APP_ENVS.PILOT)
  };
}

function validateRuntimeConfig(config) {
  const errors = [];
  const warnings = [];

  if (config.clinicalRulesApproved && !/^[A-Za-z0-9][A-Za-z0-9_.-]{2,63}$/.test(config.clinicalProtocolVersion)) {
    errors.push('CLINICAL_PROTOCOL_VERSION is required before enabling hospital-approved clinical rules.');
  }

  if (!ALLOWED_DB_DIALECTS.has(config.dbDialect)) {
    errors.push(`DB_DIALECT must be one of: ${Array.from(ALLOWED_DB_DIALECTS).join(', ')}`);
  }

  const isLocked = config.isPilot || config.isProduction || config.isStaging;

  if (config.otpDeliveryProvider && !ALLOWED_OTP_DELIVERY_PROVIDERS.has(config.otpDeliveryProvider)) {
    errors.push(`OTP_DELIVERY_PROVIDER must be one of: ${Array.from(ALLOWED_OTP_DELIVERY_PROVIDERS).join(', ')}`);
  }
  if (config.opdDemoOtp && config.otpDeliveryProvider !== 'development') {
    errors.push('OPD_DEMO_OTP=true requires OTP_DELIVERY_PROVIDER=development; external providers never fall back to demo OTP.');
  }
  if (config.otpDeliveryProvider === 'development' && !config.opdDemoOtp) {
    errors.push('OTP_DELIVERY_PROVIDER=development requires OPD_DEMO_OTP=true.');
  }
  if ((config.isProduction || config.isPilot) && config.otpDeliveryProvider === 'development') {
    errors.push('OTP_DELIVERY_PROVIDER=development is forbidden for restricted and production deployments.');
  }

  if (config.otpDeliveryProvider === 'webhook') {
    if (!isValidSmsUrl(config.smsWebhookUrl)) {
      errors.push('SMS_WEBHOOK_URL must be an HTTPS endpoint without embedded credentials when OTP_DELIVERY_PROVIDER=webhook.');
    }
    if (!config.smsWebhookToken) {
      errors.push('SMS_WEBHOOK_TOKEN is required when OTP_DELIVERY_PROVIDER=webhook.');
    }
  }

  if (config.otpDeliveryProvider === 'msg91') {
    if (!config.msg91AuthKey) errors.push('MSG91_AUTH_KEY is required when OTP_DELIVERY_PROVIDER=msg91.');
    if (!config.msg91TemplateId) errors.push('MSG91_TEMPLATE_ID is required when OTP_DELIVERY_PROVIDER=msg91.');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(config.msg91OtpVariable)) {
      errors.push('MSG91_OTP_VARIABLE must be the exact case-sensitive MSG91 Flow variable name when OTP_DELIVERY_PROVIDER=msg91.');
    }
    if (['mobiles', 'template_id'].includes(config.msg91OtpVariable.toLowerCase())) {
      errors.push('MSG91_OTP_VARIABLE conflicts with an MSG91 request field.');
    }
  }

  if (isLocked) {
    if(!/^[a-f0-9]{64}$/i.test(config.backupEncryptionKey)) errors.push('BACKUP_ENCRYPTION_KEY must be a separately stored 32-byte hexadecimal encryption key for locked deployments.');
    const root = config.persistentDataRoot;
    const documents = config.documentStoragePath;
    if (!root || !path.isAbsolute(root) || root === '/' || /^\/(tmp|var\/tmp|private\/tmp)(\/|$)/.test(root)) {
      errors.push('PERSISTENT_DATA_ROOT must name an absolute durable mounted directory outside temporary storage.');
    }
    const relative = root && documents ? path.relative(root, documents) : '..';
    if (!documents || !path.isAbsolute(documents) || !relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      errors.push('PATIENT_DOCUMENT_STORAGE_PATH must be a private directory inside PERSISTENT_DATA_ROOT.');
    }
    if (config.dbDialect !== 'postgres') {
      errors.push('DB_DIALECT must be postgres for v2 restricted, staging, and production deployments.');
    }
    if (config.pilotAuthBypass) {
      errors.push('PILOT_AUTH_BYPASS must be false outside local_dev.');
    }
    if (config.allowSeedReset) {
      errors.push('ALLOW_SEED_RESET must be false outside local_dev.');
    }
    if (!config.jwtSecret) {
      errors.push('JWT_SECRET is required for locked deployments.');
    }
    if (!config.corsOrigins.length) {
      errors.push('CORS_ORIGIN must be set explicitly for locked deployments.');
    }
    // Staging allows OPD_DEMO_OTP for synthetic testing; pilot/prod do not.
    if (config.opdDemoOtp && (config.isProduction || config.isPilot)) {
      errors.push('OPD_DEMO_OTP must be false for restricted and production deployments.');
    }
    if (config.enableLegacyApi) {
      errors.push('ENABLE_LEGACY_API must be false for restricted, staging, and production deployments.');
    }
    if (config.isPilot && config.pilotDepartmentPrefix !== 'OBST') {
      errors.push('OPD_PILOT_DEPARTMENT_PREFIX must be OBST for the current OG pilot.');
    }
    if (config.isPilot && !config.ogPilotOnly) {
      errors.push('OPD_OG_PILOT_ONLY must be true for the restricted OG pilot.');
    }
    if (config.cookieSecure !== 'true') {
      errors.push('COOKIE_SECURE must be true for restricted, staging, and production deployments.');
    }
    if (config.corsOrigins.some(origin => !isValidCorsOrigin(origin) || !origin.startsWith('https://'))) {
      errors.push('CORS_ORIGIN must contain only explicit HTTPS origins for locked deployments.');
    }
    // Staging may intentionally select the development provider. Production and
    // the restricted pilot must explicitly select a configured external provider.
    if (!config.opdDemoOtp && !config.otpDeliveryProvider) {
      errors.push('OTP_DELIVERY_PROVIDER must explicitly select webhook or msg91 for deployed patient OTP delivery.');
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

  if (!['verify','render_private'].includes(config.databaseTlsMode)) errors.push('DATABASE_TLS_MODE must be verify or render_private.');
  if(config.databaseTlsMode==='render_private') {
    let internal=false;try { internal=/^dpg-[a-z0-9]+(?:-[a-z0-9]+)?$/.test(new URL(config.databaseUrl).hostname); }catch{}
    if(!config.isRender || !internal || !config.databaseSsl) errors.push('render_private TLS is restricted to Render service execution and a dotless internal dpg hostname with DATABASE_SSL=true.');
  }
  if (config.dbDialect === 'postgres' && !config.databaseUrl) {
    errors.push('DATABASE_URL is required when DB_DIALECT=postgres.');
  }

  if (config.dbDialect === 'sqlite' && !config.sqlitePath) {
    errors.push('SQLITE_PATH is required when DB_DIALECT=sqlite.');
  }

  if (config.enableLegacyApi && !config.isPilot && !config.isProduction && config.activationOtpDelivery && !ALLOWED_ACTIVATION_DELIVERY_MODES.has(config.activationOtpDelivery)) {
    errors.push(`ACTIVATION_OTP_DELIVERY must be one of: ${Array.from(ALLOWED_ACTIVATION_DELIVERY_MODES).join(', ')}`);
  }

  if (config.corsOrigins.some((origin) => !isValidCorsOrigin(origin))) {
    errors.push('Each CORS_ORIGIN entry must be a valid bare http(s) origin without a path or query string.');
  }

  if (!['lax', 'strict', 'none'].includes(config.cookieSameSite)) errors.push('COOKIE_SAME_SITE must be lax, strict, or none.');
  if (!['true', 'false'].includes(config.cookieSecure)) errors.push('COOKIE_SECURE must be true or false.');
  if (config.cookieSameSite === 'none' && config.cookieSecure !== 'true') errors.push('SameSite=None refresh cookies require COOKIE_SECURE=true.');

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
    cors_origins: config.corsOrigins.map(origin => isValidCorsOrigin(origin) ? origin : '[invalid origin]'),
    activation_otp_delivery: config.enableLegacyApi && !config.isPilot && !config.isProduction ? config.activationOtpDelivery : null,
    cookie_secure: config.cookieSecure === 'true',
    opd_demo_otp: config.opdDemoOtp,
    otp_delivery_provider: config.otpDeliveryProvider || null,
    sms_adapter_configured: config.otpDeliveryProvider === 'development'
      ? config.opdDemoOtp && !config.isProduction && !config.isPilot
      : config.otpDeliveryProvider === 'webhook'
        ? Boolean(isValidSmsUrl(config.smsWebhookUrl) && config.smsWebhookToken)
        : config.otpDeliveryProvider === 'msg91'
          ? Boolean(config.msg91AuthKey && config.msg91TemplateId && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(config.msg91OtpVariable))
          : false,
    legacy_api_enabled: config.enableLegacyApi,
    pilot_department_prefix: config.pilotDepartmentPrefix,
    og_pilot_only: config.ogPilotOnly,
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
