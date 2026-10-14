const { logger } = require('./errorHandler');
const os = require('os');

const MAX_TRACKED_ENDPOINTS = 500;
const MAX_TRACKED_IPS = 10000;
const RESPONSE_SAMPLE_SIZE = 1000;
const RAPID_REQUESTS_PER_MINUTE = 100;
const SLOW_REQUEST_MS = 1000;

const metrics = {
  requests: {
    total: 0,
    by_endpoint: new Map(),
    by_status: {},
    response_times: []
  },
  system: {
    start_time: Date.now(),
    memory_alert_level: 'normal'
  },
  errors: {
    total: 0,
    by_type: {},
    recent: []
  },
  security: {
    sequential_scans: new Map(),
    rapid_requests: new Map()
  }
};

const endpointKey = (req) => {
  if (req.route && req.route.path !== undefined) {
    const routePath = typeof req.route.path === 'string' ? req.route.path : '/{doi}';
    return `${req.method} ${req.baseUrl || ''}${routePath === '/' && req.baseUrl ? '' : routePath}`;
  }
  return `${req.method} (unmatched)`;
};

const trackIp = (map, ip, initial) => {
  if (!map.has(ip) && map.size >= MAX_TRACKED_IPS) return null;
  if (!map.has(ip)) map.set(ip, initial());
  return map.get(ip);
};

const detectSuspiciousPatterns = (req) => {
  const ip = req.ip;
  const now = Date.now();
  const idMatch = req.path.match(/\/(\d+)(?:\/|$)/);

  if (idMatch) {
    const baseEndpoint = req.path.replace(/\/(\d+)(?:\/|$)/, '/:id/');
    const ipScans = trackIp(metrics.security.sequential_scans, ip, () => ({}));
    if (ipScans) {
      const scans = (ipScans[baseEndpoint] || []).filter(scan => now - scan.timestamp < 5 * 60 * 1000);
      scans.push({ id: parseInt(idMatch[1], 10), timestamp: now });
      ipScans[baseEndpoint] = scans.slice(-50);

      if (scans.length === 10) {
        const ids = scans.map(s => s.id).sort((a, b) => a - b);
        let sequential = 0;
        for (let i = 1; i < ids.length; i++) {
          if (ids[i] === ids[i - 1] + 1) sequential++;
        }
        if (sequential >= 5) {
          logger.warn('Sequential ID scanning detected', { ip, endpoint: baseEndpoint, sequential_count: sequential });
        }
      }
    }
  }

  const recent = trackIp(metrics.security.rapid_requests, ip, () => []);
  if (recent) {
    const window = recent.filter(timestamp => now - timestamp < 60 * 1000);
    window.push(now);
    metrics.security.rapid_requests.set(ip, window.slice(-(RAPID_REQUESTS_PER_MINUTE + 1)));
    if (window.length === RAPID_REQUESTS_PER_MINUTE + 1) {
      logger.warn('Rapid fire requests detected', { ip, requests_per_minute: window.length, current_path: req.path });
    }
  }
};

const recordEndpoint = (key) => {
  const counts = metrics.requests.by_endpoint;
  if (counts.has(key)) {
    counts.set(key, counts.get(key) + 1);
  } else if (counts.size < MAX_TRACKED_ENDPOINTS) {
    counts.set(key, 1);
  }
};

const performanceMonitoring = (req, res, next) => {
  const startTime = Date.now();
  detectSuspiciousPatterns(req);
  metrics.requests.total++;

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode;
    const endpoint = endpointKey(req);

    recordEndpoint(endpoint);
    metrics.requests.by_status[statusCode] = (metrics.requests.by_status[statusCode] || 0) + 1;
    if (statusCode >= 500) metrics.errors.total++;

    metrics.requests.response_times.push({ time: responseTime, timestamp: Date.now() });
    if (metrics.requests.response_times.length > RESPONSE_SAMPLE_SIZE) {
      metrics.requests.response_times.splice(0, metrics.requests.response_times.length - RESPONSE_SAMPLE_SIZE);
    }

    if (responseTime > SLOW_REQUEST_MS) {
      logger.warn('Slow request detected', {
        endpoint,
        url: req.originalUrl,
        response_time_ms: responseTime,
        status_code: statusCode,
        severity: responseTime > 5000 ? 'CRITICAL' : responseTime > 3000 ? 'HIGH' : 'MEDIUM'
      });
    }
  });

  next();
};

const collectSystemMetrics = () => {
  const memUsage = process.memoryUsage();
  const warningMB = parseInt(process.env.MEMORY_ALERT_THRESHOLD_MB, 10) || 512;
  const criticalMB = parseInt(process.env.MEMORY_CRITICAL_THRESHOLD_MB, 10) || 1024;
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const level = heapUsedMB > criticalMB ? 'critical' : heapUsedMB > warningMB ? 'warning' : 'normal';

  if (level !== metrics.system.memory_alert_level) {
    const details = {
      heap_used_mb: heapUsedMB,
      rss_mb: Math.round(memUsage.rss / 1024 / 1024),
      warning_threshold_mb: warningMB,
      critical_threshold_mb: criticalMB,
      alert_level: level
    };
    if (level === 'critical') logger.error('Memory usage exceeds the critical threshold', details);
    else if (level === 'warning') logger.warn('Memory usage exceeds the warning threshold', details);
    else logger.info('Memory usage back to normal', details);
    metrics.system.memory_alert_level = level;
  }
};

const errorMonitoring = (error, req, res, next) => {
  const errorType = error.constructor.name;
  metrics.errors.by_type[errorType] = (metrics.errors.by_type[errorType] || 0) + 1;
  metrics.errors.recent.push({
    timestamp: Date.now(),
    type: errorType,
    message: error.message,
    endpoint: endpointKey(req)
  });
  if (metrics.errors.recent.length > 50) {
    metrics.errors.recent.splice(0, metrics.errors.recent.length - 50);
  }
  next(error);
};

const formatUptime = (uptimeMs) => {
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

const getMetrics = () => {
  const now = Date.now();
  const uptime = now - metrics.system.start_time;

  const recentResponseTimes = metrics.requests.response_times
    .filter(rt => (now - rt.timestamp) < 10 * 60 * 1000)
    .map(rt => rt.time)
    .sort((a, b) => a - b);

  const avgResponseTime = recentResponseTimes.length > 0
    ? Math.round(recentResponseTimes.reduce((a, b) => a + b, 0) / recentResponseTimes.length)
    : 0;
  const p95ResponseTime = recentResponseTimes.length > 0
    ? recentResponseTimes[Math.min(recentResponseTimes.length - 1, Math.floor(recentResponseTimes.length * 0.95))]
    : 0;

  return {
    uptime_ms: uptime,
    uptime_human: formatUptime(uptime),
    requests: {
      total: metrics.requests.total,
      by_status: metrics.requests.by_status,
      top_endpoints: Array.from(metrics.requests.by_endpoint.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([endpoint, count]) => ({ endpoint, count })),
      performance: {
        avg_response_time_ms: avgResponseTime,
        p95_response_time_ms: p95ResponseTime,
        total_samples: recentResponseTimes.length
      }
    },
    errors: {
      total: metrics.errors.total,
      by_type: metrics.errors.by_type,
      recent_count: metrics.errors.recent.length,
      error_rate: metrics.requests.total > 0
        ? Math.round((metrics.errors.total / metrics.requests.total) * 100 * 100) / 100
        : 0
    },
    system: {
      memory: process.memoryUsage(),
      cpu_cores: os.cpus().length,
      load_average: os.loadavg(),
      free_memory_mb: Math.round(os.freemem() / 1024 / 1024),
      total_memory_mb: Math.round(os.totalmem() / 1024 / 1024)
    }
  };
};

const cleanupSecurityMaps = () => {
  const now = Date.now();
  const ttlMs = parseInt(process.env.SECURITY_MAPS_TTL_MS, 10) || 300000;

  for (const [ip, scans] of metrics.security.sequential_scans.entries()) {
    for (const endpoint of Object.keys(scans)) {
      scans[endpoint] = scans[endpoint].filter(scan => now - scan.timestamp < ttlMs);
      if (scans[endpoint].length === 0) delete scans[endpoint];
    }
    if (Object.keys(scans).length === 0) metrics.security.sequential_scans.delete(ip);
  }

  for (const [ip, requests] of metrics.security.rapid_requests.entries()) {
    const recentRequests = requests.filter(timestamp => now - timestamp < ttlMs);
    if (recentRequests.length === 0) metrics.security.rapid_requests.delete(ip);
    else metrics.security.rapid_requests.set(ip, recentRequests);
  }
};

if (process.env.NODE_ENV !== 'test') {
  const metricsInterval = parseInt(process.env.METRICS_COLLECT_INTERVAL_MS, 10) || 6000;
  const cleanupInterval = parseInt(process.env.SECURITY_CLEANUP_INTERVAL_MS, 10) || 60000;
  setInterval(collectSystemMetrics, metricsInterval).unref();
  setInterval(cleanupSecurityMaps, cleanupInterval).unref();
}

module.exports = {
  performanceMonitoring,
  errorMonitoring,
  getMetrics
};
