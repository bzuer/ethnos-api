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
const { sequelize } = require('../config/database');
const manticore = require('../config/manticore');
const redis = require('../config/redis');

const liveMetrics = () => {
  const m = monitoring.getMetrics();
  const uptimeSeconds = Math.round((m.uptime_ms || 0) / 1000);
  return {
    queries_per_second: uptimeSeconds > 0 ? Math.round(((m.requests?.total || 0) / uptimeSeconds) * 100) / 100 : 0,
    avg_response_time: m.requests?.performance?.avg_response_time_ms || 0,
    p95_response_time: m.requests?.performance?.p95_response_time_ms || 0,
    error_rate: m.errors?.error_rate || 0,
    uptime_seconds: uptimeSeconds,
    requests_last_10_minutes: m.requests?.performance?.total_samples || 0,
    total_queries: m.requests?.total || 0,
    by_status: m.requests?.by_status || {},
    top_endpoints: m.requests?.top_endpoints || [],
    memory_usage_mb: Math.round(process.memoryUsage().rss / 1024 / 1024)
  };
};

const probe = async (check) => {
  try {
    return Boolean(await check());
  } catch (_) {
    return false;
  }
};

const liveHealthStatus = async () => {
  const [database, searchEngine, cache] = await Promise.all([
    probe(() => sequelize.query('SELECT 1', { type: sequelize.QueryTypes.SELECT })),
    probe(() => manticore.ping()),
    redis.isRedisDisabled()
      ? Promise.resolve('disabled')
      : probe(async () => {
          const client = await redis.getActiveRedisClient();
          return client ? (await client.ping()) === 'PONG' : false;
        })
  ]);
  return { database, search_engine: searchEngine, cache };
};

/**
 * @swagger
 * /dashboard/overview:
 *   get:
 *     summary: Operational snapshot (in-process telemetry plus dependency probes)
 *     description: >-
 *       Live snapshot of the running API process: request telemetry from the in-process
 *       monitoring middleware (same source as /health/metrics), dependency probes (MariaDB
 *       `SELECT 1`, Manticore ping, Redis PING or `"disabled"`), the last 7 days of recorded
 *       search analytics and the current alerts. Request counters are cumulative since the last
 *       restart; latency figures and requests_last_10_minutes cover the last 10 minutes (up to
 *       1,000 samples). error_rate is 5xx responses / all responses in percent. top_endpoints
 *       are keyed by route pattern (e.g. `GET /works/:id`). No pagination and no query
 *       parameters. Requires X-Access-Key.
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
        const [searchAnalytics, healthStatus] = await Promise.all([
            autocompleteService.getSearchAnalytics(7),
            liveHealthStatus()
        ]);
        const metrics = liveMetrics();

        const rawOverview = {
            search_performance: {
                engine: 'Manticore',
                engine_reachable: healthStatus.search_engine,
                queries_per_second: metrics.queries_per_second,
                avg_response_time: metrics.avg_response_time,
                p95_response_time: metrics.p95_response_time,
                error_rate: metrics.error_rate,
                performance_distribution: {
                    total_queries: metrics.total_queries,
                    by_status: metrics.by_status,
                    top_endpoints: metrics.top_endpoints
                }
            },
            system_health: {
                uptime_seconds: metrics.uptime_seconds,
                memory_usage: `${metrics.memory_usage_mb}MB rss`,
                dependencies: healthStatus
            },
            recent_activity: {
                requests_last_10_minutes: metrics.requests_last_10_minutes,
                search_analytics: searchAnalytics
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
 *       Live performance telemetry from the in-process monitoring middleware: summary
 *       (total requests, average and p95 latency over the last 10 minutes, error_rate = 5xx
 *       responses / all responses in percent, uptime) and the status/endpoint distribution.
 *       data.chart_data is always an empty array (no historical retention). The hours
 *       parameter is validated and echoed to meta.hours_requested but has no other effect.
 *       Requires X-Access-Key.
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
                error_rate: m.error_rate,
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
 *       Search-usage analytics built from the queries recorded by /search/works and
 *       /search/global (Redis lists search_analytics:YYYY-MM-DD): trend indicators (search
 *       volume, unique queries, average results) comparing the most recent days of the window
 *       with the oldest ones, the most frequent search terms of the last 7 days
 *       (popular_terms, user-search counts) and a per-day series over the requested window
 *       with each day's top terms. change_percent is null when the baseline average is 0.
 *       When Redis is unavailable the series and popular_terms are empty and the indicators
 *       are "unknown". data.analytics_period reflects the days parameter. Requires X-Access-Key.
 *     tags: [Dashboard]
 *     security:
 *       - XAccessKey: []
 *     parameters:
 *       - name: days
 *         in: query
 *         description: >-
 *           Number of days in the analytics window (1..365). Echoed to meta.days_analyzed
 *           and data.analytics_period; fewer than 2 days yields "unknown" indicators.
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
 *       Live alerts recomputed on every call: a dependency alert for each unreachable
 *       dependency (critical for the database, high for Manticore or Redis), an error alert
 *       when error_rate (5xx share, percent) exceeds 5, a performance alert when the average
 *       response time exceeds 50 ms, and a volume alert when requests per second exceed 100.
 *       Includes a severity rollup. Requires X-Access-Key.
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
        const rawAlerts = await router.checkSystemAlerts(liveMetrics(), await liveHealthStatus());
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

    for (const [dependency, reachable] of Object.entries(healthStatus || {})) {
        if (reachable === false) {
            alerts.push({
                type: 'dependency',
                severity: dependency === 'database' ? 'critical' : 'high',
                message: `${dependency} is unreachable`,
                threshold: 'reachable',
                current_value: 'unreachable'
            });
        }
    }

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

    const window = Math.min(3, Math.floor(values.length / 2));
    const mean = (list) => list.reduce((sum, v) => sum + v, 0) / list.length;
    const recent = mean(values.slice(-window));
    const older = mean(values.slice(0, window));
    const change = older === 0 ? null : ((recent - older) / older) * 100;
    const trend = change === null
        ? (recent > 0 ? 'increasing' : 'stable')
        : change > 10 ? 'increasing' : change < -10 ? 'decreasing' : 'stable';

    return {
        trend,
        change_percent: change === null ? null : Math.round(change * 100) / 100,
        recent_average: Math.round(recent * 100) / 100,
        historical_average: Math.round(older * 100) / 100
    };
};

module.exports = router;
