const express = require('express');
const router = express.Router();
const { param, validationResult } = require('express-validator');
const validator = require('validator');
const { getViolationStats, getBlockedIPs, unblockIP } = require('../middleware/rateLimiting');
const { createAccessKeyGuard } = require('../middleware/accessKey');
const { logger } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/responseBuilder');

const requireAccessKey = createAccessKeyGuard({
  envVars: [
    'API_KEY',
    'SECURITY_ACCESS_KEY',
    'INTERNAL_ACCESS_KEY',
    'API_ACCESS_KEY',
    'ETHNOS_API_KEY',
    'ETHNOS_API_ACCESS_KEY',
    'API_SECRET_KEY',
  ],
  context: 'security API',
});

const validateIpParam = [
  param('ip')
    .notEmpty()
    .withMessage('IP is required')
    .isIP()
    .withMessage('IP must be a valid IPv4 or IPv6 address')
];

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.fail('Validation failed', {
      statusCode: 400,
      code: ERROR_CODES.VALIDATION,
      errors: errors.array()
    });
  }
  return null;
};

/**
 * @swagger
 * /security/headers:
 *   get:
 *     summary: Inspect active security headers and CORS configuration
 *     description: Returns the currently active HTTP security headers (helmet) and the effective CORS configuration, plus the list of expected headers that are absent. Requires internal access key.
 *     tags: [Security]
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         description: Security headers and CORS snapshot
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SecurityHeaders'
 *                     meta:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/headers', requireAccessKey, (req, res) => {
  const headers = {
    'content-security-policy': res.get('Content-Security-Policy') || null,
    'strict-transport-security': res.get('Strict-Transport-Security') || null,
    'x-frame-options': res.get('X-Frame-Options') || null,
    'x-content-type-options': res.get('X-Content-Type-Options') || null,
    'referrer-policy': res.get('Referrer-Policy') || null,
    'x-dns-prefetch-control': res.get('X-DNS-Prefetch-Control') || null,
    'x-permitted-cross-domain-policies': res.get('X-Permitted-Cross-Domain-Policies') || null,
    'x-download-options': res.get('X-Download-Options') || null,
    'x-powered-by': res.get('X-Powered-By') || null
  };

  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : [
      ...(((process.env.NODE_ENV || '').toLowerCase() === 'test') ? ['http://localhost:3000'] : []),
      'http://localhost:1211',
      'http://localhost:3001',
      'https://ethnos.app'
    ];

  const cors = {
    allowed_origins: allowedOrigins,
    allowed_methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowed_headers: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-access-key', 'x-internal-key', 'x-api-key'],
    credentials: true
  };

  const missing = Object.keys(headers).filter(k => headers[k] === null && k !== 'x-powered-by');

  return res.success({ headers, cors, missing_headers: missing }, {
    meta: { inspected_at: new Date().toISOString() }
  });
});

/**
 * @swagger
 * /security/audit:
 *   get:
 *     summary: Audit protected routes for access key enforcement
 *     description: Quick static sweep of the dashboard, health, and security route groups to verify the internal access-key guard is mounted. Requires internal access key.
 *     tags: [Security]
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         description: Access-key enforcement audit results
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SecurityAudit'
 *                     meta:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/audit', requireAccessKey, (req, res) => {
  const audit = {};
  try {
    const dashboardRouter = require('../routes/dashboard');
    const healthRouter = require('../routes/health');

    const isGuard = (fn) => Boolean(fn) && (fn.isAccessKeyGuard === true || fn.name === 'requireInternalAccessKey');
    const hasGuardInStack = (targetRouter) => Array.isArray(targetRouter.stack) && targetRouter.stack.some(layer => {
      if (!layer) return false;
      if (isGuard(layer) || isGuard(layer.handle)) return true;
      if (layer.route && Array.isArray(layer.route.stack)) {
        return layer.route.stack.some(l2 => l2 && (isGuard(l2) || isGuard(l2.handle)));
      }
      return false;
    });

    audit.dashboard_protected = hasGuardInStack(dashboardRouter);
    audit.health_protected = hasGuardInStack(healthRouter);
    audit.security_protected = hasGuardInStack(router);

    const missing = Object.keys(audit).filter(k => audit[k] === false);

    return res.success({ audit, missing }, { meta: { inspected_at: new Date().toISOString() } });
  } catch (error) {
    return res.error(error, { code: 'SECURITY_AUDIT_ERROR' });
  }
});

/**
 * @swagger
 * /security/stats:
 *   get:
 *     summary: Get rate-limit configuration and block statistics
 *     description: Returns the effective rate-limiter configuration, the (always-empty) in-memory blocked-IP list, and block/violation counters. Rate limiting uses in-memory rolling windows, so no per-IP violation or block tracking is persisted. Requires internal access key.
 *     tags: [Security]
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         description: Rate-limit configuration and block statistics
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SecurityStats'
 *                     meta:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/stats', requireAccessKey, (req, res) => {
  try {
    const t0 = Date.now();
    const rateLimitConfig = getViolationStats();
    const blockedIPs = getBlockedIPs();

    return res.success({
      rate_limit_config: rateLimitConfig,
      blocked_ips: blockedIPs,
      stats: {
        total_blocked: blockedIPs.length,
        total_violations: 0,
        block_tracking_persisted: false
      }
    }, {
      meta: {
        generated_at: new Date().toISOString(),
        note: 'Rate limiting uses in-memory rolling windows; per-IP violation and block tracking is not persisted.',
        performance: { controller_time_ms: Date.now() - t0 }
      }
    });
  } catch (error) {
    logger.error('Error getting security stats:', error);
    return res.error(error, { code: 'SECURITY_STATS_ERROR' });
  }
});

/**
 * @swagger
 * /security/unblock/{ip}:
 *   post:
 *     summary: Unblock an IP address (admin function)
 *     description: Removes an IP from the in-memory blocked list. Because rate limiting uses in-memory rolling windows with no persistent block list, no IP is ever actually blocked, so a valid IP always returns 200 with unblocked=false. Requires internal access key.
 *     tags: [Security]
 *     security:
 *       - XAccessKey: []
 *     parameters:
 *       - in: path
 *         name: ip
 *         required: true
 *         schema:
 *           type: string
 *         description: IPv4 or IPv6 address to unblock (validated with isIP).
 *     responses:
 *       200:
 *         description: Unblock result (no-op unless the IP was in the in-memory block list)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/UnblockResult'
 *                     meta:
 *                       type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/unblock/:ip', requireAccessKey, validateIpParam, (req, res) => {
  try {
    const validationError = handleValidation(req, res);
    if (validationError) {
      return validationError;
    }

    const { ip } = req.params;
    if (!validator.isIP(ip)) {
      return res.fail('Invalid IP address format', {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION
      });
    }
    
    const blockedIPs = getBlockedIPs();
    const wasBlocked = blockedIPs.includes(ip);
    if (wasBlocked) {
      unblockIP(ip);
      logger.info('IP unblocked via API', {
        ip,
        requestor_ip: req.ip,
        timestamp: new Date().toISOString()
      });
    }

    return res.success({
      ip,
      unblocked: wasBlocked
    }, {
      meta: {
        generated_at: new Date().toISOString(),
        note: wasBlocked
          ? 'IP removed from the block list.'
          : 'Rate limiting uses in-memory rolling windows; there is no persistent block list, so no IP is currently blocked.'
      }
    });
    
  } catch (error) {
    logger.error('Error unblocking IP:', error);
    return res.error(error, { code: 'UNBLOCK_ERROR' });
  }
});

module.exports = router;
