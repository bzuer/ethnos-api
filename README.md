# Ethnos_API - Academic Bibliography API v2.0.0

[![DOI](https://zenodo.org/badge/1049971688.svg)](https://doi.org/10.5281/zenodo.17049435)

Public RESTful API for academic bibliographic research: works and their publications, researchers, venues, institutions, subjects, course bibliographies, citations, collaborations and bibliometric rankings.

## System Status

78 documented operations (OpenAPI). Full-text search for `works` and `persons` runs on a Manticore Search daemon; institution search uses a MariaDB FULLTEXT index, `/venues` search a substring match, and the `/publications` venue filter the `ft_venues_search` FULLTEXT index. Redis caching and standardized response envelopes throughout. Corpus on 2026-10-14: 7,657,142 works, 7,744,534 publications, 4,903,220 persons, 359,932 venues, 1,086,287 organizations.

The frontend-facing reference is [`documentation/`](documentation/README.md): shared conventions, one chapter per domain with live examples, and the audit log [`documentation/API_ISSUES.md`](documentation/API_ISSUES.md).

## Database Schema

The API is a strict read-only consumer of the MariaDB database `data`: it issues `SELECT` statements only and never changes structure or rows. Source of truth: the latest dated snapshot under `backups/` (`backups/data.schema.YYYY-MM-DD.sql`), regenerated with `scripts/maintenance/publications/regenerate_schema_dump.sh`. Operator-side DDL the API depends on is tracked in `database/required_objects.sql`.

## Prerequisites

- Node.js >= 24
- MariaDB >= 10.6 with the `data` database
- Redis >= 6
- Manticore Search (SphinxQL on `127.0.0.1:9306`) with the `works` and `persons` tables built from `config/manticore.conf`
- nginx (the API is only ever published through it)

```bash
sudo apt-get update
sudo apt-get install -y mariadb-server redis-server nginx libmariadb3
sudo systemctl enable --now mariadb redis-server nginx
```

Install Manticore Search from its official repository, then build the index once (about 30-80 minutes on the full corpus):

```bash
sudo scripts/manticore/render-config.sh
sudo scripts/manticore/reindex.sh init
```

## Installation

1. Clone and install dependencies:

```bash
git clone https://github.com/bzuer/ethnos_api api && cd api
npm install --include=dev
```

2. Create the runtime environment file `/etc/node-backend.env` (the single source of truth; never commit it). It holds the database connection (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`), Redis (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`), Manticore (`MANTICORE_HOST`, `MANTICORE_PORT`), the listeners (`PORT`, default `1201`; `API_BIND_HOST`, default `127.0.0.1`; `NGINX_PUBLIC_PORT`, default `1211`; `NGINX_LISTEN_ADDRESS`), `CORS_ORIGINS`, and at least one access key (`API_KEY`). Keep it readable only by its owner and group:

```bash
sudo chmod 640 /etc/node-backend.env
```

3. Give the API a read-only database account:

```bash
set -a; source /etc/node-backend.env; set +a
sudo mariadb -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';"
sudo mariadb -e "GRANT SELECT ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';"
```

4. Install the system unit and the nginx vhost, then start:

```bash
scripts/manage.sh systemd:install
scripts/manage.sh nginx
scripts/manage.sh start
```

## Operations

`scripts/manage.sh` verifies and repairs the infrastructure (MariaDB, Redis, nginx, the API unit) on every command:

- `start` / `stop` / `restart` / `status`
- `deploy`: stop, clean, install dependencies, generate the OpenAPI documents, run the unit tests (a failure aborts), install the vhost, start and validate
- `nginx` (or `nginx --print` to review the rendered vhost without root)
- `systemd:install`
- `test --endpoints` (unit suite) / `test --data` (read-only structural precheck)

Manticore is not checked by `manage.sh`; verify it with `systemctl status manticore` and `GET /search/health`, and rebuild the index operator-side with `scripts/manticore/reindex.sh` (`delta` within 48 hours of any data change, `all` for a full rebuild).

Logs: `journalctl -u ethnos-api` and the daily files under `logs/`.

## API Documentation

- Base URL: `http://localhost:1211` (served by nginx, which proxies to the API on `127.0.0.1:1201`)
- Swagger UI: `http://localhost:1211/docs`
- OpenAPI JSON: `http://localhost:1211/docs.json`
- OpenAPI YAML: `http://localhost:1211/docs.yaml`
- Regenerate the documents: `npm run docs:generate` (JSON + YAML) or `npm run docs:generate:yaml`

## Access Control and Rate Limiting

- Data and metrics endpoints are public: no key is required. Unauthenticated traffic shares one bucket of 120 requests/min per client IP (`RATE_LIMIT_GENERAL`, window `RATE_LIMIT_WINDOW_MS`); requests over the cap get `429`.
- A valid access key (header `X-Access-Key`, aliases `x-internal-key` / `x-api-key`) lifts the limit and is **required** for `/dashboard/*`, `/security/*`, `/health/readiness` and `/health/metrics`.
- The client IP is read past the loopback proxies (nginx, a local tunnel) from `X-Forwarded-For`; the vhost must keep setting that header.
- Keys live only in `/etc/node-backend.env`; restart the service after rotating them.

## Security Headers

Security headers are set by `helmet` in `src/app.js` (CSP, HSTS, frameguard, no-sniff, referrer policy, DNS prefetch control). When updating the CSP, keep Swagger UI and its fonts working. TLS terminates at nginx, never in Node.

## Response Format

- Success envelope: `{ status: 'success', data, pagination?, meta? }`
- Error envelope: `{ status: 'error', message, code, timestamp, meta? }`
- Listings accept `page`/`limit` or `offset`/`limit` (default 10, maximum 100). A query that exceeds its time budget answers `503 REQUEST_TIMEOUT`.

## Project Structure

```
/api
  /src            controllers, routes, services, dto, middleware, utils, config
  /config         swagger.config.js, openapi.schemas.js, manticore.conf, nginx.conf
  /scripts        manage.sh, process.sh, manticore/, nginx/, systemd/, maintenance/
  /tests          unit suite and integration smoke
  /documentation  frontend-facing reference
  /database       required_objects.sql (operator DDL contract)
  /backups        dated schema snapshots
```

## Testing

```bash
npm test                    # unit suite, mocks the service layer
npm run test:integration    # smoke suite against a running instance (INTEGRATION_BASE_URL, an access key)
```

## Quick Checks

```bash
curl -s http://localhost:1211/health/liveness
curl -s http://localhost:1211/search/health
```

## License

MIT License
