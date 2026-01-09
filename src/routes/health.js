/**
 * @swagger
 * tags:
 *   name: Health
 *   description: Health monitoring and status endpoints
 */

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
 *     summary: Kubernetes readiness probe
 *     description: Check if the service is ready to accept requests. Validates database connectivity and essential dependencies.
 *     tags: [Health]
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 *       503:
 *         $ref: '#/components/responses/BadRequest'
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
 *     summary: Kubernetes liveness probe
 *     description: Basic health check to verify the service is running and responsive. Always returns success if the service is operational.
 *     tags: [Health]
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
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
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/metrics', requireInternalAccessKey, catchAsync(async (req, res) => {
  const metrics = getMetrics();
  return res.success(metrics);
}));

module.exports = router;
