const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const {
  dbDialect,
  migrateDatabase,
  pingDatabase,
  run,
  get,
  all
} = require('./database');
const {
  ensureBootstrapAdmin,
  ensureAdminAccessProvisioned
} = require('./bootstrapAdmin');
const { getRefreshCookieOptions } = require('./cookies');
const { migrations } = require('./migrations');
const { scanDataIntegrity } = require('./lib/dataIntegrityAudit');
const { logEvent } = require('./lib/logger');

const app = express();

// ===========================================================================
// 1. STARTUP ENVIRONMENT VALIDATOR — fail-fast on misconfiguration
// ===========================================================================
const isProduction = process.env.NODE_ENV === 'production';
const isRestrictedPilot = process.env.APP_ENV === 'restricted_web_pilot';
const isLockedDeployment = isProduction || isRestrictedPilot;
const allowedOtpDeliveryModes = new Set(['console', 'api_response']);

/**
 * Detect placeholder / weak JWT secrets that would pass a simple length check
 * but are not cryptographically suitable for production.
 *
 * Blocks:
 *   - Known hardcoded bad values (exact match)
 *   - Secrets containing obvious placeholder substrings
 *   - Secrets containing spaces (copy-paste artifacts)
 *
 * A properly generated secret (`openssl rand -hex 32`) is 64 lowercase hex
 * chars and will never trigger any of these checks.
 */
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
  const WEAK_SUBSTRINGS = ['test', 'dev', 'secret', 'secure', 'placeholder', 'example', 'change_me', 'your_', 'sample', 'default'];
  if (WEAK_SUBSTRINGS.some((s) => lower.includes(s))) return true;

  if (/\s/.test(secret)) return true;

  return false;
}

/**
 * Validate that CORS_ORIGIN looks like a real URL origin.
 * Catches obviously malformed values like "https://http://localhost".
 */
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

if (isLockedDeployment) {
  console.log('[BOOT] Initializing in RESTRICTED_WEB_PILOT deployment mode.');

  const fatalErrors = [];
  const configuredDialect = (process.env.DB_DIALECT || 'sqlite').trim().toLowerCase();

  if (process.env.PILOT_AUTH_BYPASS === 'true') {
    fatalErrors.push('PILOT_AUTH_BYPASS cannot be true in production deployment.');
  }

  if (configuredDialect !== 'postgres') {
    fatalErrors.push('Restricted web pilot deployments must use DB_DIALECT=postgres. SQLite is local-dev only.');
  }

  if (!process.env.JWT_SECRET) {
    fatalErrors.push('JWT_SECRET is not set. Generate one with: openssl rand -hex 32');
  } else if (process.env.JWT_SECRET.length < 32) {
    fatalErrors.push(`JWT_SECRET is too short (${process.env.JWT_SECRET.length} chars). Minimum 32 required.`);
  } else if (isWeakJwtSecret(process.env.JWT_SECRET)) {
    fatalErrors.push('JWT_SECRET appears to be a placeholder or weak value. Generate a real secret with: openssl rand -hex 32');
  }

  if (process.env.DB_DIALECT === 'postgres' && !process.env.DATABASE_URL) {
    fatalErrors.push('DB_DIALECT=postgres but DATABASE_URL is not set.');
  }

  if (!process.env.CORS_ORIGIN) {
    fatalErrors.push('CORS_ORIGIN must be explicitly set in production (no wildcard).');
  } else if (!isValidCorsOrigin(process.env.CORS_ORIGIN.split(',')[0].trim())) {
    fatalErrors.push(`CORS_ORIGIN "${process.env.CORS_ORIGIN}" is not a valid URL origin. Use the exact frontend origin, e.g. http://localhost or https://your-domain.com`);
  }

  if (process.env.ACTIVATION_OTP_DELIVERY && !allowedOtpDeliveryModes.has(process.env.ACTIVATION_OTP_DELIVERY)) {
    fatalErrors.push('ACTIVATION_OTP_DELIVERY must be one of: console, api_response.');
  }

  try {
    getRefreshCookieOptions();
  } catch (err) {
    fatalErrors.push(err.message);
  }

  if (fatalErrors.length > 0) {
    console.error('[FATAL] Boot validation failed. The following configuration errors must be resolved:');
    fatalErrors.forEach((e, i) => console.error(`  [${i + 1}] ${e}`));
    process.exit(1);
  }
} else {
  if (!process.env.JWT_SECRET) {
    console.warn('[WARN] JWT_SECRET is not set. Using insecure development fallback. DO NOT use for pilot.');
  }
  if (process.env.PILOT_AUTH_BYPASS === 'true') {
    console.warn('[WARN] PILOT_AUTH_BYPASS is enabled — passwords are not required for passwordless accounts. LOCAL DEV ONLY.');
  }
}

// ===========================================================================
// 2. CORS — restricted in production, open in dev
// ===========================================================================
app.set('trust proxy', 1);

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || !isLockedDeployment) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin not allowed by CORS.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  optionsSuccessStatus: 204
};
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// ===========================================================================
// 3. CORRELATION LOGGING MIDDLEWARE
// ===========================================================================
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || 'SERVER-GENERATED-' + Date.now();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  logEvent('info', 'request_received', {
    correlationId,
    method: req.method,
    path: req.path
  });
  next();
});

// ===========================================================================
// 4. ROUTE MOUNTING
// ===========================================================================
const { auditMutations } = require('./middleware/auditMutations');
app.use(auditMutations);

const authRouter = require('./routes/auth');
const queueRouter = require('./routes/queue');
const notesRouter = require('./routes/notes');
const prescriptionsRouter = require('./routes/prescriptions');
const encountersRouter = require('./routes/encounters');
const patientsRouter = require('./routes/patients');
const notificationsRouter = require('./routes/notifications');
const draftsRouter = require('./routes/drafts');
const internalRouter = require('./routes/internal');
const portalRouter = require('./routes/portal');
const adminRouter = require('./routes/admin');
const activationRouter = require('./routes/activation');
const { router: sseRouter } = require('./routes/sse');

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/queue', queueRouter);
app.use('/api/v1/notes', notesRouter);
app.use('/api/v1/prescriptions', prescriptionsRouter);
app.use('/api/v1/encounters', encountersRouter);
app.use('/api/v1/patients', patientsRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/drafts', draftsRouter);
app.use('/api/v1/internal', internalRouter);
app.use('/api/v1/my', portalRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/activation', activationRouter);
app.use('/api/v1/sse', sseRouter);

// ===========================================================================
// 5. HEALTH CHECK
// ===========================================================================
app.get('/api/v1/health', async (req, res) => {
  try {
    await pingDatabase();
    const migrationState = await get(`SELECT COUNT(*) AS count FROM schema_migrations`);
    const latestMigration = await get(
      `SELECT id, applied_at
       FROM schema_migrations
       ORDER BY applied_at DESC, id DESC
       LIMIT 1`
    );
    const integrity = await scanDataIntegrity({ all }, { includeSnapshots: false });

    res.json({
      status: 'ok',
      env: process.env.NODE_ENV || 'development',
      app_env: process.env.APP_ENV || 'local_dev',
      db: dbDialect,
      db_status: 'ok',
      migrations: {
        applied: Number(migrationState?.count || 0),
        expected: migrations.length,
        latest: latestMigration?.id || null,
        up_to_date: Number(migrationState?.count || 0) >= migrations.length
      },
      integrity: {
        status: integrity.counts.invalidPatients === 0 &&
          integrity.counts.invalidEncounters === 0 &&
          integrity.counts.malformedQueueRows === 0 &&
          integrity.counts.invalidNotes === 0 &&
          integrity.counts.invalidPrescriptions === 0 &&
          integrity.counts.duplicateActiveEncounterPatients === 0
          ? 'clean'
          : 'issues_detected',
        counts: integrity.counts
      },
      correlation_id: req.correlationId
    });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      env: process.env.NODE_ENV || 'development',
      app_env: process.env.APP_ENV || 'local_dev',
      db: dbDialect,
      db_status: 'unavailable',
      correlation_id: req.correlationId,
      error: err.message
    });
  }
});

// ===========================================================================
// 6. GLOBAL ERROR ENVELOPE
// ===========================================================================
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  logEvent(status >= 500 ? 'error' : 'warn', 'request_failed', {
    correlationId: req.correlationId,
    method: req.method,
    path: req.path,
    actorId: req.user?.id || null,
    status,
    code,
    message: err.message || 'An unexpected error occurred.',
    details: err.details || null
  });

  const errorEnvelope = {
    error: {
      code,
      message: err.message || 'An unexpected error occurred.',
      details: err.details || null
    },
    meta: {
      correlation_id: req.correlationId
    }
  };

  res.status(status).json(errorEnvelope);
});

// ===========================================================================
// 7. DRAFT CLEANUP JOB
// Purge clinical_drafts older than 48 hours that were never finalized.
// Runs every 6 hours to prevent orphaned draft accumulation.
// ===========================================================================
setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await run(`DELETE FROM clinical_drafts WHERE updated_at < ?`, [cutoff]);
    console.log('[CLEANUP] Pruned stale clinical drafts older than 48h');
  } catch (err) {
    console.error('[CLEANUP] Draft cleanup failed:', err.message);
  }
}, 6 * 60 * 60 * 1000);

module.exports = app;

if (require.main === module) {
  async function startServer() {
    await migrateDatabase();
    await pingDatabase();
    await ensureBootstrapAdmin({ get, run });

    if (isLockedDeployment) {
      await ensureAdminAccessProvisioned({ get });
    }

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`[BOOT] Chettinad Care Backend listening on port ${PORT}`);
      console.log(`[BOOT] Environment: ${process.env.NODE_ENV || 'development'} / ${process.env.APP_ENV || 'local_dev'}`);
      console.log(`[BOOT] DB Dialect: ${dbDialect}`);
    });
  }

  startServer().catch((err) => {
    console.error('[FATAL] Startup failed:', err);
    process.exit(1);
  });
}
