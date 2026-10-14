


const formatDashboardOverview = (data) => {
  if (!data) return null;

  return {
    timestamp: new Date().toISOString(),
    search_performance: {
      engine_status: data.search_performance?.engine
        ? `${data.search_performance.engine} (${data.search_performance.engine_reachable ? 'reachable' : 'unreachable'})`
        : 'unknown',
      current_metrics: {
        queries_per_second: parseFloat(data.search_performance?.queries_per_second) || 0,
        avg_response_time: parseFloat(data.search_performance?.avg_response_time) || 0,
        p95_response_time: parseFloat(data.search_performance?.p95_response_time) || 0,
        error_rate: parseFloat(data.search_performance?.error_rate) || 0
      },
      performance_distribution: data.search_performance?.performance_distribution || null
    },
    system_health: {
      uptime_seconds: parseInt(data.system_health?.uptime_seconds) || 0,
      memory_usage: data.system_health?.memory_usage || null,
      dependencies: data.system_health?.dependencies || {},
      health_status: determineHealthStatus(data.system_health?.dependencies)
    },
    recent_activity: {
      requests_last_10_minutes: parseInt(data.recent_activity?.requests_last_10_minutes) || 0,
      search_analytics: data.recent_activity?.search_analytics || {},
      activity_level: determineActivityLevel(data.recent_activity)
    },
    alerts: formatSystemAlerts(data.alerts || [])
  };
};


const formatPerformanceChart = (chartData) => {
  if (!Array.isArray(chartData)) return [];

  return chartData.map(point => ({
    timestamp: new Date(point.timestamp).toISOString(),
    metrics: {
      query_count: parseInt(point.query_count) || 0,
      avg_response_time: parseFloat(point.avg_response_time) || 0,
      error_count: parseInt(point.error_count) || 0,
      error_rate: parseFloat(point.error_rate) || 0
    },
    health_indicators: {
      performance_score: calculatePerformanceScore(point),
      status: point.avg_response_time > 50 ? 'slow' : point.error_rate > 5 ? 'degraded' : 'healthy'
    }
  })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};


const formatSearchTrends = (trendsData) => {
  if (!trendsData) return null;

  return {
    trends: {
      search_volume: formatTrendIndicator(trendsData.trends?.search_volume),
      unique_queries: formatTrendIndicator(trendsData.trends?.unique_queries),
      avg_results: formatTrendIndicator(trendsData.trends?.avg_results)
    },
    popular_terms: (trendsData.popular_terms || []).map(term => ({
      term: term.term || term,
      frequency: parseInt(term.frequency) || parseInt(term.count) || 0,
      trend: term.trend || 'stable'
    })),
    daily_data: (trendsData.trends?.daily_data || []).map(day => ({
      date: day.date,
      total_searches: parseInt(day.total_searches) || 0,
      unique_queries: parseInt(day.unique_queries) || 0,
      avg_results: parseFloat(day.avg_results) || 0,
      top_terms: (day.top_queries || []).map((entry) => ({ term: entry.query, count: parseInt(entry.count, 10) || 0 }))
    })),
    analytics_period: trendsData.analytics_period || '7 days',
    generated_at: new Date().toISOString()
  };
};


const formatSystemAlerts = (alerts) => {
  if (!Array.isArray(alerts)) return [];

  return alerts.map(alert => ({
    type: alert.type || 'unknown',
    severity: alert.severity || 'low',
    message: alert.message || 'No message provided',
    threshold: alert.threshold || null,
    current_value: alert.current_value || null,
    timestamp: alert.timestamp || new Date().toISOString(),
    requires_action: ['high', 'critical'].includes(alert.severity),
    alert_id: alert.alert_id || generateAlertId(alert)
  })).sort((a, b) => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return (severityOrder[b.severity] || 1) - (severityOrder[a.severity] || 1);
  });
};




const determineHealthStatus = (dependencies) => {
  if (!dependencies || Object.keys(dependencies).length === 0) return 'unknown';
  if (dependencies.database === false) return 'unhealthy';
  if (Object.values(dependencies).some((state) => state === false)) return 'degraded';
  return 'healthy';
};

const determineActivityLevel = (activityData) => {
  if (!activityData) return 'unknown';

  const recentRequests = parseInt(activityData.requests_last_10_minutes) || 0;
  if (recentRequests > 170) return 'very_high';
  if (recentRequests > 85) return 'high';
  if (recentRequests > 17) return 'moderate';
  if (recentRequests > 2) return 'low';
  return 'minimal';
};

const calculatePerformanceScore = (point) => {
  let score = 100;
  
  const responseTime = parseFloat(point.avg_response_time) || 0;
  if (responseTime > 100) score -= 40;
  else if (responseTime > 50) score -= 20;
  else if (responseTime > 25) score -= 10;
  
  const errorRate = parseFloat(point.error_rate) || 0;
  if (errorRate > 5) score -= 50;
  else if (errorRate > 1) score -= 25;
  else if (errorRate > 0.1) score -= 10;
  
  return Math.max(0, Math.min(100, Math.round(score)));
};

const formatTrendIndicator = (trend) => {
  if (!trend) return { trend: 'unknown', change_percent: null };

  return {
    trend: trend.trend || 'stable',
    change_percent: trend.change_percent === null || trend.change_percent === undefined ? null : parseFloat(trend.change_percent),
    recent_average: parseFloat(trend.recent_average) || 0,
    historical_average: parseFloat(trend.historical_average) || 0,
    is_significant: Math.abs(parseFloat(trend.change_percent) || 0) > 10
  };
};

const generateAlertId = (alert) => {
  const hash = require('crypto')
    .createHash('md5')
    .update(`${alert.type}-${alert.severity}-${alert.message}`)
    .digest('hex')
    .substring(0, 8);
  return `alert_${hash}`;
};

module.exports = {
  formatDashboardOverview,
  formatPerformanceChart,
  formatSearchTrends,
  formatSystemAlerts,
  determineHealthStatus,
  determineActivityLevel,
  calculatePerformanceScore,
  formatTrendIndicator
};
