const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
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
const maxGeneral = parseIntSafe(process.env.RATE_LIMIT_GENERAL, parseIntSafe(process.env.RATE_LIMIT_MAX_REQUESTS, 0) || 120);

const delayAfter = parseIntSafe(process.env.SLOW_DOWN_AFTER, 1000);
const delayMs = parseIntSafe(process.env.SLOW_DOWN_DELAY, 50);
const maxDelayMs = parseIntSafe(process.env.SLOW_DOWN_MAX, 1000);
const MAX_TRACKED_LIMITED_CLIENTS = 1000;

const disableRateLimiting = (process.env.RATE_LIMIT_DISABLED || 'false').toLowerCase() === 'true';
const noopLimiter = (_req, _res, next) => next();
const shouldSkipRateLimit = (req) => (
  disableRateLimiting
  || req?.accessKeyAuthenticated === true
  || hasValidAccessKey(req)
  || isLocalRequest(req)
);

const FORWARDING_HEADERS = ['x-forwarded-for', 'cf-connecting-ip', 'true-client-ip', 'x-real-ip', 'forwarded'];

const isLocalRequest = (req) => {
  for (const header of FORWARDING_HEADERS) {
    if (req.headers[header]) return false;
  }
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

const limitedClients = new Map();

const pruneLimitedClients = () => {
  const now = Date.now();
  for (const [ip, entry] of limitedClients.entries()) {
    if (entry.resetAt <= now) limitedClients.delete(ip);
  }
};

const handler = (req, res) => {
  const remaining = (res.getHeader('RateLimit-Remaining') || '').toString();
  const limit = (res.getHeader('RateLimit-Limit') || '').toString();
  const reset = (res.getHeader('RateLimit-Reset') || '').toString();
  const meta = { ip: req.ip, path: req.path, remaining, limit, reset };

  pruneLimitedClients();
  if (limitedClients.has(req.ip) || limitedClients.size < MAX_TRACKED_LIMITED_CLIENTS) {
    const resetAt = Date.now() + (parseIntSafe(reset, Math.ceil(windowMs / 1000)) * 1000);
    if (!limitedClients.has(req.ip)) {
      logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path, limit });
    }
    limitedClients.set(req.ip, { since: limitedClients.get(req.ip)?.since || new Date().toISOString(), resetAt });
  }

  if (typeof res.fail === 'function') {
    return res.fail('Too many requests', {
      statusCode: 429,
      code: ERROR_CODES.RATE_LIMIT,
      meta
    });
  }

  return res.status(429).json(buildErrorResponse({
    status: 'error',
    message: 'Too many requests',
    code: ERROR_CODES.RATE_LIMIT,
    meta
  }));
};

const generalLimiter = disableRateLimiting
  ? noopLimiter
  : rateLimit({
      windowMs,
      limit: maxGeneral,
      skip: shouldSkipRateLimit,
      standardHeaders: true,
      legacyHeaders: false,
      handler,
    });

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
  slowDown: { delayAfter, delayMs, maxDelayMs },
});

const getBlockedIPs = () => {
  pruneLimitedClients();
  return Array.from(limitedClients.entries()).map(([ip, entry]) => ({
    ip,
    limited_since: entry.since,
    resets_at: new Date(entry.resetAt).toISOString()
  }));
};

const unblockIP = async (ip) => {
  const key = ipKeyGenerator(ip);
  const wasLimited = limitedClients.delete(ip);
  if (!disableRateLimiting) {
    await Promise.all([generalLimiter.resetKey(key), speedLimiter.resetKey(key)]);
  }
  return wasLimited;
};

module.exports = {
  generalLimiter,
  speedLimiter,
  honeypotMiddleware,
  getViolationStats,
  getBlockedIPs,
  unblockIP,
};
