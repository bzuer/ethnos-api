const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { logger } = require('./errorHandler');
const { ERROR_CODES, buildErrorResponse } = require('../utils/responseBuilder');
const { hasValidAccessKey } = require('./accessKey');

try { require('dotenv').config({ path: '/etc/node-backend.env' }); } catch (_) {}

const parseIntSafe = (val, def) => {
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : def;
};

const windowMs = parseIntSafe(process.env.RATE_LIMIT_WINDOW_MS, 60000);
const maxGlobal = parseIntSafe(process.env.RATE_LIMIT_MAX_REQUESTS, 0);
const maxGeneral = parseIntSafe(process.env.RATE_LIMIT_GENERAL, maxGlobal || 120);
const maxSearch = parseIntSafe(process.env.RATE_LIMIT_SEARCH, maxGeneral);
const maxMetrics = parseIntSafe(process.env.RATE_LIMIT_METRICS, maxGeneral);
const maxRelational = parseIntSafe(process.env.RATE_LIMIT_RELATIONAL, maxGeneral);

const delayAfter = parseIntSafe(process.env.SLOW_DOWN_AFTER, 1000);
const delayMs = parseIntSafe(process.env.SLOW_DOWN_DELAY, 50);
const maxDelayMs = parseIntSafe(process.env.SLOW_DOWN_MAX, 1000);

const disableRateLimiting = (process.env.RATE_LIMIT_DISABLED || 'false').toLowerCase() === 'true';
const noopLimiter = (_req, _res, next) => next();
const shouldSkipRateLimit = (req) => (
  disableRateLimiting
  || req?.accessKeyAuthenticated === true
  || hasValidAccessKey(req)
  || isLocalRequest(req)
);

const isLocalRequest = (req) => {
  if (req.headers['x-forwarded-for']) return false;
  const ip = (req.socket && req.socket.remoteAddress)
    || (req.connection && req.connection.remoteAddress)
    || '';
  if (!ip) return false;
  if (ip === '::1' || ip === '127.0.0.1') return true;
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.replace('::ffff:', '');
    return mapped.startsWith('127.');
  }
  return ip.startsWith('127.');
};

const handler = (req, res) => {
  const remaining = (res.getHeader('RateLimit-Remaining') || '').toString();
  const limit = (res.getHeader('RateLimit-Limit') || '').toString();
  const reset = (res.getHeader('RateLimit-Reset') || '').toString();
  const meta = { ip: req.ip, path: req.path, remaining, limit, reset };

  if (typeof res.fail === 'function') {
    return res.fail('Too many requests', {
      statusCode: 429,
      code: ERROR_CODES.RATE_LIMIT,
      meta
    });
  }

  logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path, limit });
  return res.status(429).json(buildErrorResponse({
    status: 'error',
    message: 'Too many requests',
    code: ERROR_CODES.RATE_LIMIT,
    meta
  }));
};

const buildLimiter = (max) => {
  if (disableRateLimiting) return noopLimiter;
  return rateLimit({
    windowMs,
    max,
    skip: shouldSkipRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    handler,
  });
};

const generalLimiter = buildLimiter(maxGeneral);
const searchLimiter = buildLimiter(maxSearch);
const relationalLimiter = buildLimiter(maxRelational);

const metricsLimiter = buildLimiter(maxMetrics);

const speedLimiter = disableRateLimiting
  ? noopLimiter
  : slowDown({
      windowMs,
      delayAfter,
      delayMs: () => delayMs,
      maxDelayMs,
      validate: { delayMs: false },
      skip: shouldSkipRateLimit
    });

const honeypotMiddleware = (req, res, next) => {
  const honeypotPaths = ['/admin', '/user', '/config', '/internal'];
  const isHoneypot = honeypotPaths.some(path => req.path.startsWith(path));
  if (isHoneypot) {
    logger.warn('Honeypot triggered', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      timestamp: new Date().toISOString()
    });
    if (typeof res.fail === 'function') {
      return res.fail('Not found', {
        statusCode: 404,
        code: ERROR_CODES.NOT_FOUND
      });
    }
    return res.status(404).json({
      status: 'error',
      message: 'Not found',
      code: ERROR_CODES.NOT_FOUND,
      timestamp: new Date().toISOString()
    });
  }
  next();
};

const getViolationStats = () => ({
  disabled: disableRateLimiting,
  windowMs,
  general: maxGeneral,
  search: maxSearch,
  metrics: maxMetrics,
  relational: maxRelational,
  slowDown: { delayAfter, delayMs, maxDelayMs },
});

const getBlockedIPs = () => [];
const unblockIP = (_ip) => true;

module.exports = {
  generalLimiter,
  searchLimiter,
  speedLimiter,
  metricsLimiter,
  relationalLimiter,
  honeypotMiddleware,
  getViolationStats,
  getBlockedIPs,
  unblockIP,
};
