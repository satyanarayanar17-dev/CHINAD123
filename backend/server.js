const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const crypto = require('crypto');
const {
  dbDialect,
  migrateDatabase,
  pingDatabase,
  run,
  get,
  all
} = require('./database');
const {
  runtimeConfig,
  validateRuntimeConfig,
  describeRuntimeConfig
} = require('./config');
const {
  ensureBootstrapAdmin,
  ensureAdminAccessProvisioned
} = require('./bootstrapAdmin');
const { getRefreshCookieOptions } = require('./cookies');
const { migrations } = require('./migrations');
const { scanDataIntegrity } = require('./lib/dataIntegrityAudit');
const { logEvent } = require('./lib/logger');

const app = express();
const bootState = {
  started_at: new Date().toISOString(),
  ready: false,
  last_successful_boot_at: null,
  boot_error: null,
  config: describeRuntimeConfig(runtimeConfig),
  checks: {
    database: 'unknown',
    migrations: 'unknown',
    admin_access: 'unknown',
    pilot_department: 'unknown'
  }
};

// ===========================================================================
// 1. STARTUP ENVIRONMENT VALIDATOR — fail-fast on misconfiguration
// ===========================================================================
const isLockedDeployment = runtimeConfig.isPilot || runtimeConfig.isProduction || runtimeConfig.isStaging;
const configValidation = validateRuntimeConfig(runtimeConfig);

if (configValidation.warnings.length > 0) {
  for (const warning of configValidation.warnings) {
    logEvent('warn', 'boot_config_warning', { warning });
  }
}

try {
  getRefreshCookieOptions();
} catch (err) {
  configValidation.errors.push(err.message);
}

if (configValidation.errors.length > 0) {
  logEvent('error', 'boot_config_invalid', {
    errors: configValidation.errors,
    config: describeRuntimeConfig(runtimeConfig)
  });
  process.exit(1);
}

// ===========================================================================
// 2. CORS — restricted in production, open in dev
// ===========================================================================
app.set('trust proxy', 1);

const allowedOrigins = runtimeConfig.corsOrigins;

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
  const requestStartedAt = Date.now();
  const correlationId =
    req.headers['x-correlation-id'] ||
    req.headers['x-request-id'] ||
    `SERVER-${crypto.randomUUID()}`;
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  res.setHeader('x-request-id', correlationId);
  logEvent('info', 'request_received', {
    correlationId,
    method: req.method,
    path: req.originalUrl?.split('?')[0] || req.path,
    remote_ip: req.ip
  });
  res.on('finish', () => {
    logEvent('info', 'request_completed', {
      correlationId,
      method: req.method,
      path: req.originalUrl?.split('?')[0] || req.path,
      status: res.statusCode,
      duration_ms: Date.now() - requestStartedAt,
      actorId: req.user?.id || null
    });
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
const carePlansRouter = require('./routes/care_plans');
const adherenceRouter = require('./routes/adherence');
const patientDocumentsRouter = require('./routes/patient_documents');
const patientSelfRecordsRouter = require('./routes/patient_self_records');

app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/debug', require('./routes/debug'));
app.use('/api/v1/auth/opd', require('./opd/auth.ts').authRouter);
app.use('/api/v1/opd', require('./opd/router.ts').router);
// Care Plan is part of the canonical v2 OPD API and must remain available when
// legacy routes are disabled in pilot/staging/production.
app.use('/api/v1/opd/care-plans', carePlansRouter);
app.use('/api/v1/opd/adherence', adherenceRouter);
app.use('/api/v1/opd/patient-documents', patientDocumentsRouter);
app.use('/api/v1/opd/patient-self-records', patientSelfRecordsRouter);
app.get('/api/v1/openapi.json', (_req, res) => res.sendFile(require('node:path').join(__dirname, 'opd/openapi.json')));
// Legacy write paths are isolated so they cannot bypass the v2 journey state machine.
if (process.env.ENABLE_LEGACY_API === 'true' && !isLockedDeployment) {
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
}

// ===========================================================================
// 5. HEALTH CHECK
// ===========================================================================
async function assessReadiness() {
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
    const adminState = await get(`SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND is_active = 1`);
    const pilotDepartmentState = runtimeConfig.ogPilotOnly
      ? await get('SELECT COUNT(*) AS count FROM departments WHERE name=? AND prefix=?', ['Obstetrics & Gynaecology', runtimeConfig.pilotDepartmentPrefix])
      : { count: 1 };
    const appliedMigrations = Number(migrationState?.count || 0);
    const activeAdmins = Number(adminState?.count || 0);
    const pilotDepartments = Number(pilotDepartmentState?.count || 0);
    const upToDate = appliedMigrations >= migrations.length;

    bootState.checks = {
      database: 'ok',
      migrations: upToDate ? 'ok' : 'out_of_date',
      admin_access: activeAdmins > 0 ? 'ok' : 'missing',
      pilot_department: pilotDepartments === 1 ? 'ok' : 'missing_or_ambiguous'
    };
    bootState.ready = upToDate && activeAdmins > 0 && pilotDepartments === 1;

    return {
      healthy: true,
      status: bootState.ready ? 'ok' : 'degraded',
      db_status: 'ok',
      migrations: {
        applied: appliedMigrations,
        expected: migrations.length,
        latest: latestMigration?.id || null,
        up_to_date: upToDate
      },
      admin_access: {
        active_admins: activeAdmins,
        status: activeAdmins > 0 ? 'ok' : 'missing'
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
      }
    };
  } catch (err) {
    bootState.checks = {
      database: 'unavailable',
      migrations: 'unknown',
      admin_access: 'unknown'
    };
    bootState.ready = false;

    return {
      healthy: false,
      status: 'degraded',
      db_status: 'unavailable',
      error: err.message
    };
  }
}

app.get('/api/v1/health', async (req, res) => {
  const readiness = await assessReadiness();
  const payload = {
    status: readiness.status,
    env: runtimeConfig.nodeEnv,
    app_env: runtimeConfig.appEnv,
    db: dbDialect,
    db_status: readiness.db_status,
    migrations: readiness.migrations || {
      applied: 0,
      expected: migrations.length,
      latest: null,
      up_to_date: false
    },
    admin_access: readiness.admin_access || {
      active_admins: 0,
      status: 'unknown'
    },
    integrity: readiness.integrity || {
      status: 'unknown',
      counts: null
    },
    boot: {
      ready: bootState.ready,
      started_at: bootState.started_at,
      last_successful_boot_at: bootState.last_successful_boot_at,
      checks: bootState.checks
    },
    correlation_id: req.correlationId
  };

  if (!readiness.healthy) {
    payload.error = readiness.error;
    return res.status(503).json(payload);
  }

  return res.json(payload);
});

app.get('/api/v1/ready', async (req, res) => {
  const readiness = await assessReadiness();
  const payload = {
    status: readiness.status,
    ready: readiness.healthy && bootState.ready,
    db_status: readiness.db_status,
    migrations_up_to_date: readiness.migrations?.up_to_date || false,
    correlation_id: req.correlationId
  };

  if (!payload.ready) {
    return res.status(503).json(payload);
  }

  return res.json(payload);
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
    const result = await run(`DELETE FROM clinical_drafts WHERE updated_at < ?`, [cutoff]);
    logEvent('info', 'draft_cleanup_ran', { pruned: result.changes ?? 0, cutoff });
  } catch (err) {
    logEvent('error', 'draft_cleanup_failed', { error: err.message });
  }
}, 6 * 60 * 60 * 1000).unref();

module.exports = app;

if (require.main === module) {
  let httpServer;

  async function startServer() {
    await migrateDatabase();
    await pingDatabase();
    await ensureBootstrapAdmin({ get, run });

    if (isLockedDeployment) {
      await ensureAdminAccessProvisioned({ get });
    }

    require('./opd/notifications.ts').startNotificationWorker();

    const PORT = process.env.PORT || 3001;
    const HOST = '0.0.0.0';
    httpServer = app.listen(PORT, HOST, () => {
      logEvent('info', 'server_listening', {
        port: PORT,
        host: HOST,
        node_env: process.env.NODE_ENV || 'development',
        app_env: process.env.APP_ENV || 'local_dev',
        db_dialect: dbDialect
      });
    });
  }

  // Graceful shutdown: drain HTTP connections and close database pool.
  function gracefulShutdown(signal) {
    logEvent('info', 'shutdown_signal', { signal });
    if (httpServer) {
      httpServer.close(() => {
        logEvent('info', 'http_server_closed');
        if (require('./database').pgPool) {
          require('./database').pgPool.end().then(() => {
            logEvent('info', 'pg_pool_closed');
            process.exit(0);
          }).catch(() => process.exit(1));
        } else {
          process.exit(0);
        }
      });
      // Force exit after 10 seconds if connections don't drain.
      setTimeout(() => {
        logEvent('warn', 'shutdown_forced');
        process.exit(1);
      }, 10000).unref();
    } else {
      process.exit(0);
    }
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  startServer().catch((err) => {
    logEvent('error', 'server_start_fatal', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}
