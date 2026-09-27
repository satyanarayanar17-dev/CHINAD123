const { validateRuntimeConfig, APP_ENVS } = require('./backend/config');
const config = {
  dbDialect: 'postgres',
  isProduction: true,
  isPilot: false,
  isStaging: true,
  isLocalDev: false,
  opdDemoOtp: true,
  jwtSecret: '12345678901234567890123456789012',
  corsOrigins: ['https://test.com'],
  cookieSecure: 'true',
  smsWebhookUrl: '',
  smsWebhookToken: '',
  bootstrapAdmin: { id: 'admin', name: 'admin', password: 'admin' },
  appEnv: 'staging',
  nodeEnv: 'production',
  enableLegacyApi: false,
  pilotAuthBypass: false,
  allowSeedReset: false
};
console.log(validateRuntimeConfig(config));
