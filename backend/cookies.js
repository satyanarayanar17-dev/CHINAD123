const lockedDeployment =
  process.env.NODE_ENV === 'production' ||
  process.env.APP_ENV === 'restricted_web_pilot';

const REFRESH_COOKIE_NAME = 'cc_refresh_token';

function normaliseSameSite(value) {
  const sameSite = (value || '').toLowerCase();
  if (sameSite === 'strict') return 'strict';
  if (sameSite === 'none') return 'none';
  return 'lax';
}

function getRefreshCookieOptions() {
  const sameSite = normaliseSameSite(
    process.env.COOKIE_SAME_SITE || (lockedDeployment ? 'none' : 'lax')
  );
  const secure =
    process.env.COOKIE_SECURE === 'true' ||
    (process.env.COOKIE_SECURE !== 'false' && (lockedDeployment || sameSite === 'none'));

  if (sameSite === 'none' && !secure) {
    throw new Error('Refresh cookies with SameSite=None must also use Secure=true.');
  }

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/api/v1/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    domain: process.env.COOKIE_DOMAIN || undefined
  };
}

module.exports = {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions
};
