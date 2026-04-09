/**
 * Generic in-process rate limiter factory.
 *
 * Usage:
 *   const { createRateLimiter } = require('./rateLimit');
 *
 *   const loginLimiter = createRateLimiter({
 *     max:      10,               // max requests per window
 *     windowMs: 15 * 60 * 1000,  // 15-minute sliding window
 *     keyFn:    (req) => req.ip, // key to bucket requests by
 *     message:  'Too many login attempts. Please try again later.'
 *   });
 *
 *   router.post('/login', loginLimiter, handler);
 *
 * The limiter uses a sliding-window algorithm backed by an in-process Map.
 * All state is lost on process restart — this is intentional for stateless
 * horizontal scaling where each pod enforces its own limit.
 */

/**
 * @param {object}   opts
 * @param {number}   opts.max       Maximum number of requests allowed per window per key
 * @param {number}   opts.windowMs  Duration of the sliding window in milliseconds
 * @param {Function} opts.keyFn     (req) => string — derives the rate-limit key from the request
 * @param {string}   [opts.message] Custom error message
 * @returns {Function} Express middleware
 */
function createRateLimiter({ max, windowMs, keyFn, message }) {
  // Map<key, number[]> — stores timestamps of recent requests per key
  const store = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const key = keyFn(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    // Retrieve and prune timestamps outside the current window
    const timestamps = (store.get(key) || []).filter(ts => ts > windowStart);

    if (timestamps.length >= max) {
      const oldestInWindow = timestamps[0];
      const retryAfterSec = Math.ceil((oldestInWindow + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: message || 'Too many requests. Please try again later.',
        retry_after: retryAfterSec
      });
    }

    timestamps.push(now);
    store.set(key, timestamps);
    next();
  };
}

module.exports = { createRateLimiter };
