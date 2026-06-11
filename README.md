# Ethnos_API - Academic Bibliography API v2.0.0

[![DOI](https://zenodo.org/badge/1049971688.svg)](https://doi.org/10.5281/zenodo.17049435)

Public RESTful API for academic bibliographic research with high-performance search, researcher profiles, institutional analytics, and bibliometric analysis.

## System Status

Production-ready system with 79 documented endpoints (per OpenAPI), MariaDB FULLTEXT search against the base tables (`works.ft_works_content`, `works.ft_works_metadata`, `venues.ft_venues_search`, `persons.ft_persons_names`), Redis caching, and standardized response envelopes. The legacy `summary_*` denormalized layer was dissolved in 2026-05-23.

## Database Schema

Source of truth: `database/schema.sql`.

## Prerequisites

- Node.js >= 18.0.0
- MariaDB >= 10.5
- Redis >= 6.0

### System packages (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install -y mariadb-server redis-server libmariadb3
sudo systemctl enable --now mariadb redis-server
```

## Installation

1. Clone and install dependencies:

```bash
git clone https://github.com/bzuer/ethnos_api
mv ethnos_api api && cd api
npm install --include=dev
```

2. Create the runtime environment file (single source of truth):

```bash
sudo cp node-backend.env.example /etc/node-backend.env
sudo chown $(whoami) /etc/node-backend.env
```

3. Edit `/etc/node-backend.env` with your real credentials and settings.

4. Create the database and user:

```bash
set -a
source /etc/node-backend.env
set +a
sudo mysql -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';"
sudo mysql -e "GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost'; FLUSH PRIVILEGES;"
```

5. Start the API:

```bash
./server.sh start
```

## Systemd (recommended)

```bash
sudo cp scripts/systemd/ethnos-api.service /etc/systemd/system/ethnos-api.service
sudo sed -i "s/^User=.*/User=$(whoami)/" /etc/systemd/system/ethnos-api.service
sudo sed -i "s/^Group=.*/Group=$(whoami)/" /etc/systemd/system/ethnos-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now ethnos-api
```

## Deployment

```bash
scripts/manage.sh deploy
```

Deploy sequence:
- Stop API
- Clear caches
- Install dependencies (including dev)
- Generate Swagger artifacts
- Run tests
- Restart API

## API Documentation

- Base URL: `http://localhost:1211`
- Swagger UI: `http://localhost:1211/docs`
- OpenAPI JSON: `http://localhost:1211/docs.json`
- OpenAPI YAML: `http://localhost:1211/docs.yaml`
- Test-only fallback port: `3000` (`NODE_ENV=test` without explicit `PORT`)
- Regenerate docs: `npm run docs:generate` (JSON + YAML) or `npm run docs:generate:yaml` (YAML only)

## Security Headers

- Security headers are enforced by `helmet` in `src/app.js` (CSP, HSTS, frameguard, no-sniff, referrer policy, DNS prefetch control).
- When updating CSP, ensure Swagger UI and fonts remain functional.
- Do not loosen headers in production unless strictly required and documented.

## Access Control and Rate Limiting

- Data and metrics endpoints are public: no key is required. Unauthenticated traffic is capped at 120 requests/min per IP (`RATE_LIMIT_GENERAL`, window `RATE_LIMIT_WINDOW_MS`, default 60s); requests over the cap get `429`.
- A valid `X-Access-Key` (case-insensitive aliases: `x-access-key`, `x-internal-key`, `x-api-key`) removes the rate limit and is **required** for `/dashboard`, `/security/*`, `/health/readiness`, and `/health/metrics`.
- Key validation is handled by `requireInternalAccessKey` / `createAccessKeyGuard` in `src/middleware/accessKey.js`; the rate-limit bypass for keyed and localhost traffic lives in `shouldSkipRateLimit` in `src/middleware/rateLimiting.js`.
- Keys must be provided only via `/etc/node-backend.env` and never logged or exposed in responses.
- If rotating keys, update the env file and restart the service to apply changes.
- The whole limiter can be turned off with `RATE_LIMIT_DISABLED=true` (default: enabled).

## Deployment Hygiene

- Use `scripts/manage.sh deploy` as the only deploy pipeline.
- Ensure logs and caches are cleared on deploy/restart as defined in `scripts/manage.sh`.
- Do not commit generated artifacts, logs, backups, or dumps.

## Response Format

- Success envelope: `{ status: 'success', data, pagination?, meta? }`
- Error envelope: `{ status: 'error', message, code, timestamp, meta? }`
- Pagination is mandatory for list endpoints and supports `page/limit` or `offset/limit`.

## Environment Management

- Runtime: `/etc/node-backend.env` only
- Tests: `.env.test`
- Example: `node-backend.env.example`

## Project Structure

```
/api
  /src
    /controllers
    /routes
    /services
    /dto
    /middleware
    /utils
  /config
  /database
  /docs
  /scripts
  /tests
  server.sh
```

## Search Engine

All full-text search runs against MariaDB FULLTEXT indexes pinned on the base tables:
- `works.ft_works_content` over `full_title_normalized` + `subjects_search` for the free-text `q`.
- `works.ft_works_metadata` over `authors_search` + `subjects_search` for `author` / `subject` filters (AND-scoped via `+token` BOOLEAN MODE).
- `venues.ft_venues_search` over `name` + `abbreviated_name` for the `venue_name` filter and venue search.
- `persons.ft_persons_names` over `preferred_name` + `given_names` + `family_name` for person searches.

There is no Sphinx daemon, RT index, external indexer process, or `summary_*` denormalized layer. Every listing reports `meta.engine = "MariaDB"`.

## Testing

```bash
npm test
npm run test:watch
npm run test:coverage
```

## Quick Checks

```bash
curl -s http://localhost:1211/health/liveness
curl -s http://localhost:1211/docs
```

## License

MIT License
