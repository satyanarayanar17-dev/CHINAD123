const express = require('express');
const cors = require('cors');

const app = express();

// ===========================================================================
// 1. STARTUP ENVIRONMENT VALIDATOR — fail-fast on misconfiguration
// ===========================================================================
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  console.log('[BOOT] Initializing in RESTRICTED_WEB_PILOT deployment mode.');

  const fatalErrors = [];

  if (process.env.PILOT_AUTH_BYPASS === 'true') {
    fatalErrors.push('PILOT_AUTH_BYPASS cannot be true in production deployment.');
  }

  if (!process.env.JWT_SECRET) {
    fatalErrors.push('JWT_SECRET is not set.');
  } else if (process.env.JWT_SECRET === 'pilot-beta-secure-secret-key') {
    fatalErrors.push('JWT_SECRET is using the known insecure default value.');
  } else if (process.env.JWT_SECRET.length < 32) {
    fatalErrors.push(`JWT_SECRET is too short (${process.env.JWT_SECRET.length} chars). Minimum 32 required.`);
  }

  if (process.env.DB_DIALECT === 'postgres' && !process.env.DATABASE_URL) {
    fatalErrors.push('DB_DIALECT=postgres but DATABASE_URL is not set.');
  }

  if (!process.env.CORS_ORIGIN) {
    fatalErrors.push('CORS_ORIGIN must be explicitly set in production (no wildcard).');
  }

  if (fatalErrors.length > 0) {
    console.error('[FATAL] Boot validation failed. The following configuration errors must be resolved:');
    fatalErrors.forEach((e, i) => console.error(`  [${i + 1}] ${e}`));
    process.exit(1);
  }
} else {
  // Non-production warnings
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
const corsOptions = {
  origin: isProduction
    ? (process.env.CORS_ORIGIN || false)  // false = deny all if somehow not set
    : '*'
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===========================================================================
// 3. CORRELATION LOGGING MIDDLEWARE
// ===========================================================================
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || 'SERVER-GENERATED-' + Date.now();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  console.log(`[REQ] ${req.method} ${req.path} | CID: ${correlationId}`);
  next();
});

// ===========================================================================
// 4. ROUTE MOUNTING
// ===========================================================================
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

app.use('/api/auth', authRouter);
app.use('/api/queue', queueRouter);
app.use('/api/notes', notesRouter);
app.use('/api/prescriptions', prescriptionsRouter);
app.use('/api/encounters', encountersRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/drafts', draftsRouter);
app.use('/api/internal', internalRouter);
app.use('/api/my', portalRouter);
app.use('/api/admin', adminRouter);
app.use('/api/activation', activationRouter);
app.use('/api/sse', sseRouter);

// ===========================================================================
// 5. HEALTH CHECK
// ===========================================================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    env: process.env.NODE_ENV || 'development',
    app_env: process.env.APP_ENV || 'local_dev',
    db: process.env.DB_DIALECT || 'sqlite',
    correlation_id: req.correlationId
  });
});

// ===========================================================================
// 6. GLOBAL ERROR ENVELOPE
// ===========================================================================
app.use((err, req, res, next) => {
  console.error(`[ERR] CID: ${req.correlationId} |`, err.message || err);

  const status = err.status || 500;
  const errorEnvelope = {
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
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
    const { run } = require('./database');
    await run(`DELETE FROM clinical_drafts WHERE updated_at < ?`, [cutoff]);
    console.log('[CLEANUP] Pruned stale clinical drafts older than 48h');
  } catch (err) {
    console.error('[CLEANUP] Draft cleanup failed:', err.message);
  }
}, 6 * 60 * 60 * 1000);

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`[BOOT] Chettinad Care Backend listening on port ${PORT}`);
    console.log(`[BOOT] Environment: ${process.env.NODE_ENV || 'development'} / ${process.env.APP_ENV || 'local_dev'}`);
    console.log(`[BOOT] DB Dialect: ${process.env.DB_DIALECT || 'sqlite'}`);
  });
}
