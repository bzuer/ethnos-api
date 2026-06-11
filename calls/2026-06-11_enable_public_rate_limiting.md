# Enable per-IP rate limiting for the now keyless public API

**Filed:** 2026-06-11
**Status:** APPLIED to `/etc/node-backend.env` on 2026-06-11 (operator chowned the file to `ubuntu`
and authorized the edit; `RATE_LIMIT_DISABLED=false`, `RATE_LIMIT_GENERAL=120` are set). **Restart
pending** — the running service still holds the old env and the old code; restart
`ethnos-api.service` to activate. Kept as the audit record + rollback. Runtime config only
(`/etc/node-backend.env`); no DB, no secrets touched.

## Why
The application code dropped the blanket `X-Access-Key` requirement: data and metrics endpoints
are now public, governed by a per-IP rate limit instead of a key check (`/dashboard`, `/security/*`,
`/health/readiness`, `/health/metrics` stay key-gated). The code default now **enables** the limiter
(`RATE_LIMIT_DISABLED` defaults to `false`) at 120 req/min per IP. The production env file overrides
both knobs and currently **disables** rate limiting entirely, so without this change the public API
would have no cap at all.

## Current state
`/etc/node-backend.env` (owner `ubuntu`, dir `/etc` not writable by the service user, so the app
cannot edit it):
```
RATE_LIMIT_DISABLED=true
RATE_LIMIT_GENERAL=6000
```

## Proposed change
```
RATE_LIMIT_DISABLED=false
RATE_LIMIT_GENERAL=120
```
One-liner (run with elevated rights if needed):
```
sudo sed -i \
  -e 's/^RATE_LIMIT_DISABLED=true$/RATE_LIMIT_DISABLED=false/' \
  -e 's/^RATE_LIMIT_GENERAL=6000$/RATE_LIMIT_GENERAL=120/' \
  /etc/node-backend.env
```
Then restart the service so the new env is read:
```
systemctl --user restart ethnos-api.service
```
Notes:
- The global `generalLimiter` (mounted on `/`) is the binding cap, so `RATE_LIMIT_GENERAL=120`
  yields 120 total requests/min per IP across every endpoint. The per-bucket caps
  (`RATE_LIMIT_SEARCH=1200`, `RATE_LIMIT_METRICS=3000`, `RATE_LIMIT_RELATIONAL=240`) are higher and
  remain as defense-in-depth; leave them as-is.
- A valid `X-Access-Key` and localhost traffic bypass the limiter (`shouldSkipRateLimit`).

## Verification
After restart, from a non-local IP (or via `X-Forwarded-For` behind the trusted proxy):
```
for i in $(seq 1 130); do curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'X-Forwarded-For: 8.8.8.8' http://localhost:1211/works?limit=1; done | sort | uniq -c
# expect ~120x 200 then 429 with {"code":"RATE_LIMITED"}
curl -s http://localhost:1211/works?limit=1            # 200 (public, no key)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:1211/dashboard/overview   # 401 (still gated)
```

## Rollback
```
sudo sed -i \
  -e 's/^RATE_LIMIT_DISABLED=false$/RATE_LIMIT_DISABLED=true/' \
  -e 's/^RATE_LIMIT_GENERAL=120$/RATE_LIMIT_GENERAL=6000/' \
  /etc/node-backend.env
systemctl --user restart ethnos-api.service
```
