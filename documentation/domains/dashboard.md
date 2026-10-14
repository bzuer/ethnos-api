# Dashboard — operational telemetry snapshot (auth required)

The dashboard domain is a live, read-only operational view of the running API process. Numbers come from the in-process monitoring middleware (`src/middleware/monitoring.js` `getMetrics()`, the same source as `/health/metrics`), from dependency probes run on each call, and from the search analytics recorded in Redis. Request counters are **cumulative since the last process restart**; latency figures cover the **last 10 minutes** (up to 1,000 samples). There is no pagination and no historical retention.

Shared definitions:

- **`error_rate`** = 5xx responses / all responses, in **percent** (`2.5` = 2.5 %), since restart.
- **`top_endpoints`** = up to 10 `{ endpoint, count }` entries keyed by **route pattern**, e.g. `"GET /works/:id"`, `"GET /subjects/:id/works"`; requests that matched no route count under `"GET (unmatched)"`.
- **Dependencies** = `database` (`SELECT 1` on MariaDB), `search_engine` (Manticore ping), `cache` (Redis `PING`, or the string `"disabled"` when Redis is switched off by configuration). Each is `true`, `false` or `"disabled"`.
- **Search analytics** = the queries recorded by `/search/works` and `/search/global`, stored per day in the Redis lists `search_analytics:YYYY-MM-DD`. When Redis is unavailable the analytics are empty (`{}`).

**Auth**: every endpoint returns `401 {"status":"error","code":"UNAUTHORIZED","message":"Invalid or missing access key"}` without a valid key. Send it in `X-Access-Key` (aliases `x-internal-key` / `x-api-key`; see [../00-conventions.md](../00-conventions.md)). These endpoints power an internal ops view, not end-user screens.

---

## `GET /dashboard/overview`

One-shot snapshot: request performance, status distribution, dependency health, recent activity with the last 7 days of search analytics, and the current alerts. No query parameters.

### Example response (measured 2026-10-14 on an instance with Redis disabled)

```json
{
  "status": "success",
  "data": {
    "timestamp": "2026-10-14T05:22:02.563Z",
    "search_performance": {
      "engine_status": "Manticore (reachable)",
      "current_metrics": {
        "queries_per_second": 1,
        "avg_response_time": 453,
        "p95_response_time": 2619,
        "error_rate": 0
      },
      "performance_distribution": {
        "total_queries": 289,
        "by_status": { "200": 234, "400": 36, "404": 18 },
        "top_endpoints": [
          { "endpoint": "GET /works", "count": 31 },
          { "endpoint": "GET /search/works", "count": 17 },
          { "endpoint": "GET /subjects/:id/works", "count": 11 }
        ]
      }
    },
    "system_health": {
      "uptime_seconds": 289,
      "memory_usage": "130MB rss",
      "dependencies": { "database": true, "search_engine": true, "cache": "disabled" },
      "health_status": "healthy"
    },
    "recent_activity": {
      "requests_last_10_minutes": 288,
      "search_analytics": {},
      "activity_level": "very_high"
    },
    "alerts": [
      {
        "type": "performance",
        "severity": "medium",
        "message": "Slow average response time: 453ms",
        "threshold": "50ms",
        "current_value": "453ms",
        "timestamp": "2026-10-14T05:22:02.564Z",
        "requires_action": false,
        "alert_id": "alert_a794fbf4"
      }
    ]
  },
  "meta": {
    "generated_at": "2026-10-14T05:22:02.564Z",
    "performance": { "controller_time_ms": 3 },
    "request": { "method": "GET", "path": "/dashboard/overview" }
  }
}
```

### Fields

| field (dot-path) | type | notes |
|---|---|---|
| `data.timestamp` | string (ISO) | Generation time. |
| `search_performance.engine_status` | string | `"Manticore (reachable)"` or `"Manticore (unreachable)"`, from the Manticore ping. |
| `search_performance.current_metrics.queries_per_second` | number | Requests since restart ÷ uptime seconds, 2 dp. |
| `search_performance.current_metrics.avg_response_time` / `p95_response_time` | number (ms) | Mean / 95th percentile latency over the last 10 minutes. |
| `search_performance.current_metrics.error_rate` | number | See shared definitions. |
| `search_performance.performance_distribution.total_queries` | integer | Requests since restart. |
| `search_performance.performance_distribution.by_status` | object | HTTP status (string key) → count. |
| `search_performance.performance_distribution.top_endpoints[]` | array | See shared definitions. |
| `system_health.uptime_seconds` | integer | Process uptime. |
| `system_health.memory_usage` | string | RSS with unit, e.g. `"130MB rss"`. |
| `system_health.dependencies.{database,search_engine,cache}` | boolean \| `"disabled"` | Probe results. |
| `system_health.health_status` | string enum | `unhealthy` when the database is unreachable; `degraded` when another dependency is unreachable; `healthy` otherwise (`"disabled"` does not degrade); `unknown` if no probe ran. |
| `recent_activity.requests_last_10_minutes` | integer | Latency samples in the last 10 minutes (capped at 1,000). |
| `recent_activity.search_analytics` | object | `YYYY-MM-DD` → `{ total_searches, unique_queries, avg_results, top_queries[{query,count}] }` for each of the last 7 days (days without searches carry zeros and `[]`); `{}` when Redis is unavailable. `avg_results` is a raw float. |
| `recent_activity.activity_level` | string enum | From `requests_last_10_minutes`: `> 170` very_high, `> 85` high, `> 17` moderate, `> 2` low, else minimal. |
| `alerts[]` | array | Same items as `GET /dashboard/alerts`. |

---

## `GET /dashboard/performance`

Performance summary and status distribution, plus a chart series that is **always empty** (no historical retention).

### Query parameters

| param | type | default | bounds | effect |
|---|---|---|---|---|
| `hours` | integer | 24 | 1..168 | Validated and echoed to `meta.hours_requested`; no other effect. Out of range → 400 (`"Hours must be between 1 and 168"`). `hours=` is treated as absent. |

### Example response (measured 2026-10-14; endpoints trimmed)

```json
{
  "status": "success",
  "data": {
    "chart_data": [],
    "summary": {
      "total_queries": 290,
      "avg_response_time": 451,
      "p95_response_time": 2619,
      "error_rate": 0,
      "uptime_seconds": 289
    },
    "distribution": {
      "total_queries": 290,
      "by_status": { "200": 235, "400": 36, "404": 18 },
      "top_endpoints": [{ "endpoint": "GET /works", "count": 31 }]
    }
  },
  "meta": {
    "hours_requested": 24,
    "data_points": 0,
    "generated_at": "2026-10-14T05:22:02.574Z",
    "performance": { "controller_time_ms": 1 },
    "request": { "method": "GET", "path": "/dashboard/performance" }
  }
}
```

### Fields

| field (dot-path) | type | notes |
|---|---|---|
| `data.chart_data` | array | Always `[]`. |
| `data.summary.total_queries` | integer | Requests since restart. |
| `data.summary.avg_response_time` / `p95_response_time` | number (ms) | Last 10 minutes. |
| `data.summary.error_rate` | number | See shared definitions. |
| `data.summary.uptime_seconds` | integer | Process uptime. |
| `data.distribution.{total_queries,by_status,top_endpoints}` | mixed | Same as on the overview. |
| `meta.hours_requested` | integer | Echo of `hours`. |
| `meta.data_points` | integer | `chart_data.length`, always `0`. |

---

## `GET /dashboard/search-trends`

Search-usage analytics over a window of `days` days: trend indicators, the most frequent search terms of the last 7 days, and a per-day series with each day's top terms.

### Query parameters

| param | type | default | bounds | effect |
|---|---|---|---|---|
| `days` | integer | 7 | 1..365 | Window size; echoed to `meta.days_analyzed` and `data.analytics_period` (`"30 days"`). Out of range → 400 (`"Days must be between 1 and 365"`). `days=` is treated as absent. |

### Trend indicators

For each series (daily `total_searches`, `unique_queries`, `avg_results`) the API compares the mean of the most recent `w` days with the mean of the oldest `w` days of the window, where `w = min(3, floor(days / 2))`:

- `change_percent` = percent change, 2 dp; **`null` when the older mean is 0**.
- `trend` = `increasing` (> +10 %), `decreasing` (< −10 %), else `stable`; with a zero baseline it is `increasing` when the recent mean is positive, else `stable`.
- `is_significant` = `|change_percent| > 10`.
- With fewer than 2 days of data (`days=1`, or Redis unavailable) every indicator is `{ "trend": "unknown", "change_percent": null }` and `daily_data` is `[]`.

### Example response (`?days=30`, measured 2026-10-14 on an instance with Redis disabled)

```json
{
  "status": "success",
  "data": {
    "trends": {
      "search_volume": { "trend": "unknown", "change_percent": null },
      "unique_queries": { "trend": "unknown", "change_percent": null },
      "avg_results": { "trend": "unknown", "change_percent": null }
    },
    "popular_terms": [],
    "daily_data": [],
    "analytics_period": "30 days",
    "generated_at": "2026-10-14T05:22:02.602Z"
  },
  "meta": {
    "days_analyzed": 30,
    "generated_at": "2026-10-14T05:22:02.602Z",
    "performance": { "controller_time_ms": 0 },
    "request": { "method": "GET", "path": "/dashboard/search-trends?days=30" }
  }
}
```

### Fields

| field | type | notes |
|---|---|---|
| `data.trends.{search_volume,unique_queries,avg_results}` | object | `{ trend, change_percent, recent_average, historical_average, is_significant }`; only `{ trend: "unknown", change_percent: null }` when there is not enough data. |
| `data.popular_terms[]` | array | Up to 20 `{ term, frequency, trend }`: the most frequent **user search queries** of the last 7 days (lower-cased; stopwords and terms under 2 characters dropped). `frequency` = times searched; `trend` is always `"stable"`. |
| `data.daily_data[]` | array | One entry per day of the window, ascending: `{ date, total_searches, unique_queries, avg_results, top_terms }`. `date` is an ISO datetime at midnight UTC. |
| `data.daily_data[].top_terms[]` | array | Up to 10 `{ term, count }` most searched queries of that day. |
| `data.analytics_period` | string | `"<days> days"`. |
| `data.generated_at` | string (ISO) | Generation time. |
| `meta.days_analyzed` | integer | Echo of `days`. |

---

## `GET /dashboard/alerts`

Current alerts with a severity rollup, recomputed on every call (stateless: an alert appears while its condition holds and disappears when it clears). No query parameters.

### Alert rules

| type | fires when | severity | requires_action |
|---|---|---|---|
| `dependency` | a dependency probe returns `false` (message `"<dependency> is unreachable"`) | `critical` for `database`, `high` for `search_engine` / `cache` | `true` |
| `error` | `error_rate > 5` (percent) | `high` | `true` |
| `performance` | `avg_response_time > 50` (ms) | `medium` | `false` |
| `volume` | `queries_per_second > 100` | `medium` | `false` |

A cache reported as `"disabled"` raises no alert. On a live API doing DB joins the `performance` alert is normally present.

### Example response (measured 2026-10-14)

```json
{
  "status": "success",
  "data": {
    "alerts": [
      {
        "type": "performance",
        "severity": "medium",
        "message": "Slow average response time: 444ms",
        "threshold": "50ms",
        "current_value": "444ms",
        "timestamp": "2026-10-14T05:22:02.621Z",
        "requires_action": false,
        "alert_id": "alert_8bdf62e6"
      }
    ],
    "alert_count": 1,
    "last_check": "2026-10-14T05:22:02.621Z",
    "severity_counts": { "medium": 1 }
  },
  "meta": {
    "generated_at": "2026-10-14T05:22:02.621Z",
    "performance": { "controller_time_ms": 1 },
    "request": { "method": "GET", "path": "/dashboard/alerts" }
  }
}
```

### Fields

| field | type | notes |
|---|---|---|
| `data.alerts[].type` | string enum | `dependency \| error \| performance \| volume`. |
| `data.alerts[].severity` | string enum | `critical \| high \| medium \| low`; the array is sorted by descending severity. |
| `data.alerts[].message` | string | Human-readable, includes the current value. |
| `data.alerts[].threshold` / `current_value` | string | Display strings, e.g. `"50ms"` / `"444ms"`, `"5%"`, `"100 QPS"`, `"reachable"` / `"unreachable"`. |
| `data.alerts[].timestamp` | string (ISO) | Call time. |
| `data.alerts[].requires_action` | boolean | `true` for `high` and `critical`. |
| `data.alerts[].alert_id` | string | `alert_<md5[:8]>` of `type-severity-message`; stable for the same content, usable as a de-dupe key. |
| `data.alert_count` | integer | `alerts.length`. |
| `data.last_check` | string (ISO) | Call time. |
| `data.severity_counts` | object | Severity → count, only for severities present (treat a missing key as 0). |
