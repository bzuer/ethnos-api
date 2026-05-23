const express = require('express');
const router = express.Router();
const { query, validationResult } = require('express-validator');
const autocompleteService = require('../services/autocomplete.service');
const { requireInternalAccessKey } = require('../middleware/accessKey');
const { ERROR_CODES } = require('../utils/responseBuilder');
const {
  formatDashboardOverview,
  formatPerformanceChart,
  formatSearchTrends,
  formatSystemAlerts
} = require('../dto/dashboard.dto');

router.use(requireInternalAccessKey);

const validatePerformanceParams = [
  query('hours')
    .optional()
    .isInt({ min: 1, max: 168 })
    .withMessage('Hours must be between 1 and 168')
    .toInt()
];

const validateTrendParams = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Days must be between 1 and 365')
    .toInt()
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

const emptyMetrics = () => ({
  queries_per_second: 0,
  avg_response_time: 0,
  error_rate: 0,
  index_size_mb: 0,
  uptime_seconds: 0,
  queries_last_hour: 0,
  queries_last_minute: 0,
  connections: 0
});

const emptyHealthStatus = () => ({
  searchEngine: 'MariaDB',
  rollbackActive: false,
  metrics: {
    consecutiveFailures: 0,
    lastSuccessfulCheck: null
  }
});

/**
 * @swagger
 * /dashboard/overview:
 *   get:
 *     summary: Get complete system overview for dashboard
 *     tags: [Dashboard]
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         description: Complete dashboard overview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     search_performance:
 *                       type: object
 *                     system_health:
 *                       type: object
 *                     recent_activity:
 *                       type: object
 */
router.get('/overview', async (req, res) => {
    try {
        const t0 = Date.now();
        const searchAnalytics = await autocompleteService.getSearchAnalytics(7);
        const metrics = emptyMetrics();
        const healthStatus = emptyHealthStatus();

        const rawOverview = {
            search_performance: {
                engine: healthStatus.searchEngine,
                queries_per_second: metrics.queries_per_second,
                avg_response_time: metrics.avg_response_time,
                error_rate: metrics.error_rate,
                index_size_mb: metrics.index_size_mb,
                performance_distribution: {
                    total_queries: 0,
                    distribution: {},
                    percentiles: {}
                }
            },
            system_health: {
                rollback_active: healthStatus.rollbackActive,
                uptime_seconds: metrics.uptime_seconds,
                consecutive_failures: healthStatus.metrics.consecutiveFailures,
                last_successful_check: healthStatus.metrics.lastSuccessfulCheck,
                memory_usage: '0MB indexes',
                connections: metrics.connections
            },
            recent_activity: {
                queries_last_hour: metrics.queries_last_hour,
                queries_last_minute: metrics.queries_last_minute,
                recent_queries: [],
                search_analytics: Object.keys(searchAnalytics).length > 0 ?
                    searchAnalytics : { message: 'No analytics data available' }
            },
            alerts: await router.checkSystemAlerts(metrics, healthStatus)
        };

        const formattedOverview = formatDashboardOverview(rawOverview);

        return res.success(formattedOverview, {
            meta: {
                generated_at: new Date().toISOString(),
                performance: { controller_time_ms: Date.now() - t0 }
            }
        });

    } catch (error) {
        return res.error(error, {
            code: ERROR_CODES.DASHBOARD_OVERVIEW_FAILED
        });
    }
});

/**
 * @swagger
 * /dashboard/performance:
 *   get:
 *     summary: Get detailed performance metrics for charts
 *     tags: [Dashboard]
 *     security:
 *       - XAccessKey: []
 *     parameters:
 *       - name: hours
 *         in: query
 *         description: Number of hours of data to return
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 168
 *           default: 24
 *     responses:
 *       200:
 *         description: Performance metrics for visualization
 */
router.get('/performance', validatePerformanceParams, async (req, res) => {
    try {
        const validationError = handleValidation(req, res);
        if (validationError) {
            return validationError;
        }

        const t0 = Date.now();
        const hours = Math.min(req.query.hours || 24, 168);

        const chartData = formatPerformanceChart([]);

        return res.success({
            chart_data: chartData,
            summary: {
                total_queries: 0,
                avg_response_time: 0,
                p95_response_time: 0,
                error_count: 0
            },
            distribution: {
                total_queries: 0,
                distribution: {},
                percentiles: {}
            }
        }, {
            meta: {
                hours_requested: hours,
                data_points: chartData.length,
                generated_at: new Date().toISOString(),
                performance: { controller_time_ms: Date.now() - t0 }
            }
        });

    } catch (error) {
        return res.error(error, {
            code: ERROR_CODES.DASHBOARD_PERFORMANCE_FAILED
        });
    }
});

/**
 * @swagger
 * /dashboard/search-trends:
 *   get:
 *     summary: Get search trends and popular queries
 *     tags: [Dashboard]
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         description: Search trends analysis
 */
router.get('/search-trends', validateTrendParams, async (req, res) => {
    try {
        const validationError = handleValidation(req, res);
        if (validationError) {
            return validationError;
        }

        const t0 = Date.now();
        const days = req.query.days || 7;

        const [searchAnalytics, popularTerms] = await Promise.all([
            autocompleteService.getSearchAnalytics(days),
            autocompleteService.getPopularTerms(20)
        ]);

        const rawTrends = router.analyzeTrends(searchAnalytics, days);

        const formattedTrends = formatSearchTrends({
            trends: rawTrends,
            popular_terms: popularTerms,
            analytics_period: `${days} days`
        });

        return res.success(formattedTrends, {
            meta: {
                days_analyzed: days,
                generated_at: new Date().toISOString(),
                performance: { controller_time_ms: Date.now() - t0 }
            }
        });

    } catch (error) {
        return res.error(error, {
            code: ERROR_CODES.DASHBOARD_TRENDS_FAILED
        });
    }
});

/**
 * @swagger
 * /dashboard/alerts:
 *   get:
 *     summary: Get current system alerts and warnings
 *     tags: [Dashboard]
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         description: Current system alerts
 */
router.get('/alerts', async (req, res) => {
    try {
        const t0 = Date.now();
        const rawAlerts = await router.checkSystemAlerts(emptyMetrics(), emptyHealthStatus());
        const formattedAlerts = formatSystemAlerts(rawAlerts);

        return res.success({
            alerts: formattedAlerts,
            alert_count: formattedAlerts.length,
            last_check: new Date().toISOString(),
            severity_counts: formattedAlerts.reduce((counts, alert) => {
                counts[alert.severity] = (counts[alert.severity] || 0) + 1;
                return counts;
            }, {})
        }, {
            meta: {
                generated_at: new Date().toISOString(),
                performance: { controller_time_ms: Date.now() - t0 }
            }
        });

    } catch (error) {
        return res.error(error, {
            code: ERROR_CODES.DASHBOARD_ALERTS_FAILED
        });
    }
});

router.checkSystemAlerts = async function(metrics, healthStatus) {
    const alerts = [];

    if (metrics.error_rate > 0.05) {
        alerts.push({
            type: 'error',
            severity: 'high',
            message: `High error rate: ${(metrics.error_rate * 100).toFixed(1)}%`,
            threshold: '5%',
            current_value: `${(metrics.error_rate * 100).toFixed(1)}%`
        });
    }

    if (metrics.avg_response_time > 50) {
        alerts.push({
            type: 'performance',
            severity: 'medium',
            message: `Slow average response time: ${metrics.avg_response_time}ms`,
            threshold: '50ms',
            current_value: `${metrics.avg_response_time}ms`
        });
    }

    if (metrics.queries_per_second > 100) {
        alerts.push({
            type: 'volume',
            severity: 'medium',
            message: `High query volume: ${metrics.queries_per_second} QPS`,
            threshold: '100 QPS',
            current_value: `${metrics.queries_per_second} QPS`
        });
    }

    return alerts;
};

router.analyzeTrends = function(searchAnalytics, days) {
    const dates = Object.keys(searchAnalytics).sort();
    if (dates.length < 2) return { message: 'Insufficient data for trend analysis' };

    const trends = {
        search_volume: router.calculateTrend(dates.map(d => searchAnalytics[d].total_searches)),
        unique_queries: router.calculateTrend(dates.map(d => searchAnalytics[d].unique_queries)),
        avg_results: router.calculateTrend(dates.map(d => searchAnalytics[d].avg_results)),
        daily_data: dates.map(date => ({
            date,
            ...searchAnalytics[date]
        }))
    };

    return trends;
};

router.calculateTrend = function(values) {
    if (values.length < 2) return { trend: 'insufficient_data' };

    const recent = values.slice(-3).reduce((sum, v) => sum + v, 0) / 3;
    const older = values.slice(0, 3).reduce((sum, v) => sum + v, 0) / 3;

    const change = older === 0 ? 0 : ((recent - older) / older) * 100;

    return {
        trend: change > 10 ? 'increasing' : change < -10 ? 'decreasing' : 'stable',
        change_percent: Math.round(change * 100) / 100,
        recent_average: Math.round(recent * 100) / 100,
        historical_average: Math.round(older * 100) / 100
    };
};

module.exports = router;
