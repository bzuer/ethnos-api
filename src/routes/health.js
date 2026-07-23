const express = require('express');
const { testConnection } = require('../config/database');
const { catchAsync } = require('../middleware/errorHandler');
const { getMetrics } = require('../middleware/monitoring');
const { requireInternalAccessKey } = require('../middleware/accessKey');
const { ERROR_CODES } = require('../utils/responseBuilder');

const router = express.Router();

/**
 * @swagger
 * /health/readiness:
 *   get:
 *     summary: Readiness probe (requires access key)
 *     description: Check if the service is ready to accept requests. Validates database connectivity via testConnection(). Returns 200 when the database is reachable, 503 when it is not. Requires a valid X-Access-Key.
 *     tags: [Health]
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         description: Service is ready (database reachable)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/HealthReadiness'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       503:
 *         $ref: '#/components/responses/ServiceUnavailable'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/readiness', requireInternalAccessKey, catchAsync(async (req, res) => {
  const dbStatus = await testConnection().catch(() => false);
  
  if (dbStatus) {
    return res.success({
      ready: true,
      message: 'Service is ready to accept requests'
    });
  }

  return res.fail('Service dependencies are not available', {
    statusCode: 503,
    code: ERROR_CODES.INTERNAL
  });
}));

/**
 * @swagger
 * /health/liveness:
 *   get:
 *     summary: Liveness probe (public)
 *     description: Basic health check to verify the process is running and responsive. No database access; always returns 200 while the process serves. Public endpoint - no access key required.
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Process is alive
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/HealthLiveness'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/liveness', (req, res) => {
  return res.success({
    alive: true,
    timestamp: new Date().toISOString()
  });
});

/**
 * @swagger
 * /health/metrics:
 *   get:
 *     summary: Get detailed monitoring metrics
 *     tags: [Health]
 *     description: Returns comprehensive performance and system metrics for monitoring
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       200:
 *         $ref: '#/components/responses/HealthMetricsSuccess'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/metrics', requireInternalAccessKey, catchAsync(async (req, res) => {
  const metrics = getMetrics();
  return res.success(metrics);
}));

module.exports = router;
