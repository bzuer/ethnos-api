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
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 168 })
    .withMessage('Hours must be between 1 and 168')
    .toInt()
];

const validateTrendParams = [
  query('days')
    .optional({ values: 'falsy' })
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

const monitoring = require('../middleware/monitoring');

const liveMetrics = () => {
  const m = monitoring.getMetrics();
  const uptimeSeconds = Math.round((m.uptime_ms || 0) / 1000);
  return {
    queries_per_second: uptimeSeconds > 0 ? Math.round(((m.requests?.total || 0) / uptimeSeconds) * 100) / 100 : 0,
    avg_response_time: m.requests?.performance?.avg_response_time_ms || 0,
    p95_response_time: m.requests?.performance?.p95_response_time_ms || 0,
    error_rate: m.errors?.error_rate || 0,
    index_size_mb: 0,
    uptime_seconds: uptimeSeconds,
    queries_last_hour: m.requests?.performance?.total_samples || 0,
    queries_last_minute: 0,
    connections: 0,
    total_queries: m.requests?.total || 0,
    by_status: m.requests?.by_status || {},
    top_endpoints: m.requests?.top_endpoints || [],
    memory_usage_mb: Math.round(process.memoryUsage().rss / 1024 / 1024)
  };
};

const liveHealthStatus = () => ({
  searchEngine: 'Manticore',
  rollbackActive: false,
  metrics: {
    consecutiveFailures: 0,
    lastSuccessfulCheck: new Date().toISOString()
  }
});

/**
 * @swagger
 * /dashboard/overview:
 *   get:
 *     summary: Complete dashboard snapshot (real in-process telemetry)
 *     description: >-
 *       Returns a live operational snapshot sourced from the in-process monitoring
 *       middleware (same source as /health/metrics), not the database. Numbers are
 *       cumulative since the last process restart and reset on restart. No pagination
 *       and no query parameters. Requires X-Access-Key.
 *     tags: [Dashboard]
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         description: Complete dashboard overview
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/DashboardOverview'
 *                     meta:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/overview', async (req, res) => {
    try {
        const t0 = Date.now();
        const searchAnalytics = await autocompleteService.getSearchAnalytics(7);
        const metrics = liveMetrics();
        const healthStatus = liveHealthStatus();

        const rawOverview = {
            search_performance: {
                engine: healthStatus.searchEngine,
                queries_per_second: metrics.queries_per_second,
                avg_response_time: metrics.avg_response_time,
                p95_response_time: metrics.p95_response_time,
                error_rate: metrics.error_rate,
                index_size_mb: metrics.index_size_mb,
                performance_distribution: {
                    total_queries: metrics.total_queries,
                    by_status: metrics.by_status,
                    top_endpoints: metrics.top_endpoints
                }
            },
            system_health: {
                rollback_active: healthStatus.rollbackActive,
                uptime_seconds: metrics.uptime_seconds,
                consecutive_failures: healthStatus.metrics.consecutiveFailures,
                last_successful_check: healthStatus.metrics.lastSuccessfulCheck,
                memory_usage: `${metrics.memory_usage_mb}MB rss`,
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
 *     summary: Performance summary, status distribution and (empty) chart series
 *     description: >-
 *       Returns live performance telemetry from the in-process monitoring middleware.
 *       data.chart_data is always an empty array (no historical retention). The hours
 *       parameter is validated and echoed to meta.hours_requested but has no functional
 *       effect on the response (the time series stays empty regardless). Requires X-Access-Key.
 *     tags: [Dashboard]
 *     security:
 *       - XAccessKey: []
 *     parameters:
 *       - name: hours
 *         in: query
 *         description: >-
 *           Requested window in hours. Validated (1..168) and echoed to
 *           meta.hours_requested; does not change the empty chart_data series.
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 168
 *           default: 24
 *     responses:
 *       200:
 *         description: Performance metrics for visualization
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/DashboardPerformance'
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
router.get('/performance', validatePerformanceParams, async (req, res) => {
    try {
        const validationError = handleValidation(req, res);
        if (validationError) {
            return validationError;
        }

        const t0 = Date.now();
        const hours = Math.min(req.query.hours || 24, 168);

        const chartData = formatPerformanceChart([]);
        const m = liveMetrics();

        return res.success({
            chart_data: chartData,
            summary: {
                total_queries: m.total_queries,
                avg_response_time: m.avg_response_time,
                p95_response_time: m.p95_response_time,
                error_count: m.error_rate,
                uptime_seconds: m.uptime_seconds
            },
            distribution: {
                total_queries: m.total_queries,
                by_status: m.by_status,
                top_endpoints: m.top_endpoints
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
 *     summary: Search trend indicators, popular terms and per-day analytics
 *     description: >-
 *       Returns trend indicators (search volume, unique queries, avg results),
 *       popular autocomplete terms (corpus frequency, not user searches), and a
 *       per-day search-analytics series. Note data.analytics_period is hardcoded to
 *       the fixed 7-day analytics window and stays "7 days" even when days is larger;
 *       only meta.days_analyzed reflects the days parameter. Requires X-Access-Key.
 *     tags: [Dashboard]
 *     security:
 *       - XAccessKey: []
 *     parameters:
 *       - name: days
 *         in: query
 *         description: >-
 *           Number of days of search analytics to consider. Validated (1..365) and
 *           echoed to meta.days_analyzed; does not change the hardcoded
 *           data.analytics_period label.
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 7
 *     responses:
 *       200:
 *         description: Search trends analysis
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/DashboardSearchTrends'
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
 *     summary: Current threshold-based system alerts with severity rollup
 *     description: >-
 *       Returns live threshold alerts computed from in-process telemetry: an error
 *       alert when error_rate exceeds 5 percent, a performance alert when average
 *       response time exceeds 50ms, and a volume alert when queries per second exceed
 *       100. Includes a severity rollup. Requires X-Access-Key.
 *     tags: [Dashboard]
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         description: Current system alerts
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/DashboardAlerts'
 *                     meta:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/alerts', async (req, res) => {
    try {
        const t0 = Date.now();
        const rawAlerts = await router.checkSystemAlerts(liveMetrics(), liveHealthStatus());
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

    if (metrics.error_rate > 5) {
        alerts.push({
            type: 'error',
            severity: 'high',
            message: `High error rate: ${metrics.error_rate.toFixed(1)}%`,
            threshold: '5%',
            current_value: `${metrics.error_rate.toFixed(1)}%`
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
