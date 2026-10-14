# Security — rate-limit config, HTTP-header inspection, access-key audit, IP unblock

This domain exposes an operator/administrative surface for inspecting the API's own protective posture. It is **not backed by any database table**: every response is computed at request time from in-process state — the rate-limiter configuration and the in-memory list of clients currently over the limit from `src/middleware/rateLimiting.js`, the live HTTP response headers set by `helmet`, the CORS config from env, and a static reflection over the Express router stacks. There is no Manticore or MariaDB involvement. All four operations are **guarded by `X-Access-Key`** (unlike most of the API, which is open — see [00-conventions.md](../00-conventions.md)). Related administrative surfaces: the internal telemetry under [dashboard.md](./dashboard.md) and the health probes under [system.md](./system.md), which share the same access-key guard.

## Authentication (applies to all four endpoints)

Every `/security/*` route requires a valid internal access key. Supply it as a header (aliases, case-insensitive): `x-access-key`, `x-internal-key`, `x-api-key`; or as a query-string parameter: `access_key`, `accessKey`, `api_key`. The guard accepts a value matching any of these env vars: `API_KEY`, `SECURITY_ACCESS_KEY`, `INTERNAL_ACCESS_KEY`, `API_ACCESS_KEY`, `ETHNOS_API_KEY`, `ETHNOS_API_ACCESS_KEY`, `API_SECRET_KEY`, `ETHNOS_API_KEY_2`.

| Condition | Status | Body |
|---|---|---|
| Missing or wrong key | `401` | `{ status:"error", message:"Invalid or missing access key", code:"UNAUTHORIZED", timestamp }` |
| No key env var configured at all (misconfigured server) | `503` | `code:"ACCESS_KEY_MISSING"` (not reachable in normal operation) |
| Over rate limit | `429` | standard rate-limit envelope (see 00-conventions) |

In examples below the key is masked as `$KEY`. All success responses use the standard envelope (`status`, `data`, `meta`) and carry `meta.request = { method, path }` injected globally by `responseFormatter`.

---

## `GET /security/stats`

Return the effective rate-limiter configuration and the clients currently over the per-IP limit. Auth required. No backing table — reads the live limiter config via `getViolationStats()` and the in-process list of limited clients via `getBlockedIPs()`.

There are **no query parameters**.

### Example requests

```
GET /security/stats            (header: X-Access-Key: $KEY)
GET /security/stats?access_key=$KEY   (key via query-string alias)
```

### Example response

```json
{
  "status": "success",
  "data": {
    "rate_limit_config": {
      "disabled": false,
      "windowMs": 60000,
      "general": 120,
      "slowDown": { "delayAfter": 5000, "delayMs": 50, "maxDelayMs": 1000 }
    },
    "blocked_ips": [
      { "ip": "198.51.100.23", "limited_since": "2026-10-14T05:31:12.408Z", "resets_at": "2026-10-14T05:32:04.000Z" }
    ],
    "stats": {
      "total_blocked": 1,
      "block_tracking_persisted": false
    }
  },
  "meta": {
    "generated_at": "2026-10-14T05:31:40.141Z",
    "note": "blocked_ips lists the clients currently over the per-IP limit in this process; the rolling windows are in memory and reset on restart.",
    "performance": { "controller_time_ms": 0 },
    "request": { "method": "GET", "path": "/security/stats" }
  }
}
```

### Fields

| field (dot-path) | type | notes |
|---|---|---|
| status | string | Always `"success"`. |
| data.rate_limit_config.disabled | boolean | `RATE_LIMIT_DISABLED`. `false` in production (limiting active). |
| data.rate_limit_config.windowMs | number | Rolling-window length in milliseconds. Default `60000` (1 min). |
| data.rate_limit_config.general | number | Requests per IP per window (`RATE_LIMIT_GENERAL`, default `120`). This is the single bucket every open endpoint draws from — there are no separate search/metrics/relational limits. |
| data.rate_limit_config.slowDown.delayAfter | number | Number of requests in the window after which the speed-limiter starts adding delay. Observed `5000`. |
| data.rate_limit_config.slowDown.delayMs | number | Milliseconds of delay added per request past the threshold. Observed `50`. |
| data.rate_limit_config.slowDown.maxDelayMs | number | Ceiling on total added delay (ms). Observed `1000`. |
| data.blocked_ips | object[] | Clients currently over the per-IP limit in this process. `[]` when nobody is limited (the usual state). An entry disappears once its window resets. |
| data.blocked_ips[].ip | string | Client address as the API sees it — the first non-loopback hop in `X-Forwarded-For`. |
| data.blocked_ips[].limited_since | string (ISO 8601) | When the client first exceeded the limit in the current window. |
| data.blocked_ips[].resets_at | string (ISO 8601) | When the client's window resets and requests are accepted again. |
| data.stats.total_blocked | number | `blocked_ips.length`. |
| data.stats.block_tracking_persisted | boolean | Always `false`: the limiter state lives in memory. |
| meta.generated_at | string (ISO 8601) | Response timestamp. |
| meta.note | string | Explains what `blocked_ips` holds. |
| meta.performance.controller_time_ms | number | Handler wall-time in ms (typically `0`). |
| meta.request | object | `{ method, path }`, injected globally. |

### Notes / caveats

- `blocked_ips` is live but **per process and in memory**: it lists who is over the limit right now, empties as windows reset, and is lost on restart. It is not a ban list and nothing is blocked beyond the current window (60 s by default).
- A client is limited per address, not per proxy: the API trusts only loopback hops, so traffic arriving through nginx or a local tunnel is counted by the real client address.
- Until 2026-10-14 this endpoint reported separate `search` / `metrics` / `relational` limits and a hard-coded `total_violations: 0`, while `blocked_ips` was always empty. The class limiters were never effective (the general limit bound first) and were removed; `blocked_ips` now reflects real state. See [../API_ISSUES.md](../API_ISSUES.md).

---

## `GET /security/headers`

Snapshot of the active HTTP security headers (as set by `helmet` on this very response), the effective CORS configuration, and the list of expected headers that are absent. Auth required. No backing table.

There are **no query parameters**.

### Example request

```
GET /security/headers           (header: X-Access-Key: $KEY)
```

### Example response

```json
{
  "status": "success",
  "data": {
    "headers": {
      "content-security-policy": "default-src 'self';script-src 'self' 'unsafe-inline' cdnjs.cloudflare.com;style-src 'self' 'unsafe-inline' fonts.googleapis.com;font-src 'self' fonts.gstatic.com;img-src 'self' data: *.gravatar.com;connect-src 'self';object-src 'none';media-src 'self';frame-src 'none';base-uri 'self';form-action 'self';frame-ancestors 'self';script-src-attr 'none';upgrade-insecure-requests",
      "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-dns-prefetch-control": "off",
      "x-permitted-cross-domain-policies": null,
      "x-download-options": "noopen",
      "x-powered-by": null
    },
    "cors": {
      "allowed_origins": ["http://localhost:3000", "http://localhost:3001"],
      "allowed_methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      "allowed_headers": ["Content-Type", "Authorization", "X-Requested-With", "x-access-key", "x-internal-key", "x-api-key"],
      "credentials": true
    },
    "missing_headers": ["x-permitted-cross-domain-policies"]
  },
  "meta": {
    "inspected_at": "2026-10-14T05:27:15.188Z",
    "request": { "method": "GET", "path": "/security/headers" }
  }
}
```

### Fields

**`data.headers`** — each value is the live header string, or `null` if that header is not set on the response.

| field (dot-path) | type | notes |
|---|---|---|
| data.headers.content-security-policy | string \| null | Full CSP directive string. |
| data.headers.strict-transport-security | string \| null | HSTS policy. `max-age=31536000; includeSubDomains; preload`. |
| data.headers.x-frame-options | string \| null | `DENY`. |
| data.headers.x-content-type-options | string \| null | `nosniff`. |
| data.headers.referrer-policy | string \| null | `strict-origin-when-cross-origin`. |
| data.headers.x-dns-prefetch-control | string \| null | `off`. |
| data.headers.x-permitted-cross-domain-policies | string \| null | `null` here — hence it appears in `missing_headers`. |
| data.headers.x-download-options | string \| null | `noopen`. |
| data.headers.x-powered-by | string \| null | `null` (deliberately disabled). Excluded from `missing_headers` by design. |

**`data.cors`** — effective CORS policy.

| field (dot-path) | type | notes |
|---|---|---|
| data.cors.allowed_origins | string[] | From env `CORS_ORIGINS` (comma-split) when set, else a built-in default. Observed `["http://localhost:3000","http://localhost:3001"]`. Server-dependent. |
| data.cors.allowed_methods | string[] | Fixed: `GET, POST, PUT, DELETE, PATCH, OPTIONS`. |
| data.cors.allowed_headers | string[] | Fixed: `Content-Type, Authorization, X-Requested-With, x-access-key, x-internal-key, x-api-key`. |
| data.cors.credentials | boolean | `true` — credentialed CORS allowed. |

**Top-level `data` / `meta`**

| field (dot-path) | type | notes |
|---|---|---|
| data.missing_headers | string[] | Keys within `data.headers` whose value is `null`, **excluding** `x-powered-by`. Empty array when all expected headers present. |
| meta.inspected_at | string (ISO 8601) | Timestamp of the inspection. |
| meta.request | object | `{ method, path }`. |

### Notes / caveats

- `data.headers` reflects the headers on *this* response, so it is an accurate live picture of what helmet emits. A `null` value = header not present.
- `x-powered-by` is intentionally `null` (Express fingerprint suppressed) and is never counted as "missing".
- `allowed_origins` varies by deployment (driven by `CORS_ORIGINS`); do not hard-code the observed localhost values into UI copy.

---

## `GET /security/audit`

Static sweep that verifies the internal access-key guard is actually mounted on the protected route groups (dashboard, health, security). Auth required. No backing table — it reflects over the Express router `stack` of each module.

There are **no query parameters**.

### Example request

```
GET /security/audit             (header: X-Access-Key: $KEY)
```

### Example response

```json
{
  "status": "success",
  "data": {
    "audit": {
      "dashboard_protected": true,
      "health_protected": true,
      "security_protected": true
    },
    "missing": []
  },
  "meta": {
    "inspected_at": "2026-10-14T05:27:15.194Z",
    "request": { "method": "GET", "path": "/security/audit" }
  }
}
```

### Fields

| field (dot-path) | type | notes |
|---|---|---|
| data.audit.dashboard_protected | boolean | `true` if the access-key guard is present in the `/dashboard` router stack. |
| data.audit.health_protected | boolean | `true` if the guard is present in the `/health` router stack (protects readiness + metrics probes). |
| data.audit.security_protected | boolean | `true` if the guard is present in this `/security` router stack. |
| data.missing | string[] | Keys from `data.audit` whose value is `false`. `[]` when everything is protected (the healthy state). |
| meta.inspected_at | string (ISO 8601) | Timestamp. |
| meta.request | object | `{ method, path }`. |

### Notes / caveats

- Healthy state is all three flags `true` and `missing: []`. A non-empty `missing` array indicates a routing regression where a guard was dropped — a natural candidate for a red/alert badge in an admin UI.
- On an internal reflection error the handler returns the standard error envelope with `code:"SECURITY_AUDIT_ERROR"` (HTTP 500).

---

## `POST /security/unblock/{ip}`

Reset a client's rate-limit and slow-down counters, lifting a current limit immediately. The counters are reset whether or not the client was limited; `data.unblocked` says whether it was. A valid IP always returns `200`, never `404`. Auth required. No backing table.

### Path parameters

| param | type | required | validation | effect |
|---|---|---|---|---|
| ip | string | yes | Must be a valid IPv4 or IPv6 address (`express-validator` `isIP()`). | The address whose counters are reset; echoed back in `data.ip`. Invalid values return `400 VALIDATION_ERROR`. |

There are **no query parameters** and **no request body**.

### Example requests

```
POST /security/unblock/203.0.113.1        (IPv4, header: X-Access-Key: $KEY)
POST /security/unblock/2001:db8::1         (IPv6)
POST /security/unblock/not-an-ip           (invalid → 400)
```

### Example response (200 — valid IP, not currently limited)

```json
{
  "status": "success",
  "data": { "ip": "203.0.113.1", "unblocked": false },
  "meta": {
    "generated_at": "2026-10-14T05:31:52.158Z",
    "note": "The client was not over the limit; its rate-limit and slow-down counters were reset anyway.",
    "request": { "method": "POST", "path": "/security/unblock/203.0.113.1" }
  }
}
```

### Example response (400 — invalid IP)

```json
{
  "status": "error",
  "message": "Validation failed",
  "timestamp": "2026-10-14T05:31:52.163Z",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "type": "field",
      "value": "not-an-ip",
      "msg": "IP must be a valid IPv4 or IPv6 address",
      "path": "ip",
      "location": "params"
    }
  ],
  "meta": { "request": { "method": "POST", "path": "/security/unblock/not-an-ip" } }
}
```

### Fields (200 success)

| field (dot-path) | type | notes |
|---|---|---|
| data.ip | string | The IP echoed back from the path (e.g. `203.0.113.1`, `2001:db8::1`). |
| data.unblocked | boolean | `true` when the client was over the per-IP limit at call time (it was listed in `/security/stats` `blocked_ips`). |
| meta.generated_at | string (ISO 8601) | Timestamp. |
| meta.note | string | `"The client was over the limit; its rate-limit and slow-down counters were reset."` when `unblocked:true`, else the text shown above. |
| meta.request | object | `{ method, path }`. |

### Fields (400 validation error)

| field (dot-path) | type | notes |
|---|---|---|
| status | string | `"error"`. |
| message | string | `"Validation failed"`. |
| timestamp | string (ISO 8601) | Error time. |
| code | string | `"VALIDATION_ERROR"`. |
| errors[].type | string | `"field"`. |
| errors[].value | string | The rejected input. |
| errors[].msg | string | `"IP must be a valid IPv4 or IPv6 address"` (or `"IP is required"` when empty). |
| errors[].path | string | `"ip"`. |
| errors[].location | string | `"params"`. |
| meta.request | object | `{ method, path }`. |

### Notes / caveats

- **No 404 path exists.** A valid IP that was not limited returns `200` with `unblocked:false`; UI should treat that as "the client was not limited" (a benign outcome), not as an error. The counters were still reset.
- The reset is per process and immediate; the client's next request starts a fresh window.
- Both IPv4 and IPv6 are accepted. Only malformed strings hit the `400`.
- On an unexpected internal error the handler returns the error envelope with `code:"UNBLOCK_ERROR"` (HTTP 500).
- Use the address exactly as `/security/stats` lists it: `unblocked` is computed against that exact string. For IPv6 the limiter counts per /56 prefix, so any address inside the prefix resets the same counters.
