# Ethnos_API - Academic Bibliography API v2.0.0

[![DOI](https://zenodo.org/badge/1049971688.svg)](https://doi.org/10.5281/zenodo.17049435)

Public RESTful API for academic bibliographic research with high-performance search, researcher profiles, institutional analytics, and bibliometric analysis.

## System Status

Production-ready system with 57 documented endpoints (per OpenAPI), Sphinx search integration with MariaDB fallback, Redis caching, and standardized response envelopes.

## Database Schema

Source of truth: `database/data_db.schema.sql`.

## Prerequisites

- Node.js >= 18.0.0
- MariaDB >= 10.5
- Redis >= 6.0
- Sphinx 3.x

### System packages (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install -y mariadb-server redis-server sphinxsearch libmariadb3
sudo systemctl enable --now mariadb redis-server
```

If you use the Sphinx tarball binaries, ensure the MariaDB/MySQL runtime library is available:

```bash
sudo ln -sf /usr/lib/x86_64-linux-gnu/libmysqlclient.so.24 /usr/lib/x86_64-linux-gnu/libmysqlclient.so
sudo ln -sf /usr/lib/x86_64-linux-gnu/libmariadb.so.3 /usr/lib/x86_64-linux-gnu/libmariadb.so
sudo ldconfig
```

## Installation

1. Clone and install dependencies:

```bash
git clone https://github.com/bzuer/ethnos_api
cd api
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

5. Prepare Sphinx runtime folders:

```bash
sudo install -d -m 750 -o "$(whoami)" -g "$(whoami)" /var/lib/ethnos-api/sphinx /var/lib/ethnos-api/sphinx/binlog
sudo install -d -m 750 -o "$(whoami)" -g "$(whoami)" /var/log/ethnos-api /var/run/ethnos-api
```

6. Generate Sphinx config and build indexes:

```bash
scripts/manage.sh index
scripts/manage.sh sphinx start
```

7. Start the API:

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
- Stop API and Sphinx
- Clear caches
- Install dependencies (including dev)
- Generate Swagger artifacts
- Start Sphinx, rebuild indexes
- Repair broken indexes automatically if detected
- Run tests
- Restart API

## API Documentation

- Base URL: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs.json`
- OpenAPI YAML: `http://localhost:3000/docs.yaml`

## Security Headers

- Security headers are enforced by `helmet` in `src/app.js` (CSP, HSTS, frameguard, no-sniff, referrer policy, DNS prefetch control).
- When updating CSP, ensure Swagger UI and fonts remain functional.
- Do not loosen headers in production unless strictly required and documented.

## Internal Access Key Usage

- Protected endpoints require `X-Access-Key` (case-insensitive: `x-access-key`, `x-internal-key`, `x-api-key`).
- Validation is handled by `requireInternalAccessKey` in `src/middleware/accessKey.js`.
- Keys must be provided only via `/etc/node-backend.env` and never logged or exposed in responses.
- If rotating keys, update the env file and restart the service to apply changes.

## Deployment Hygiene

- Use `scripts/manage.sh deploy` as the only deploy pipeline.
- Ensure logs and caches are cleared on deploy/restart as defined in `scripts/manage.sh`.
- Do not commit generated artifacts, logs, backups, or dumps.
- Keep Sphinx runtime data in `/var/lib/ethnos-api/sphinx` only.

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
  /docs
  /scripts
  /tests
  server.sh
```

## Sphinx Configuration

- Template: `config/sphinx-unified.conf`
- Rendered at runtime: `/var/run/ethnos-api/sphinx.conf`
- Rendered from `/etc/node-backend.env` by `scripts/manage.sh`

## Testing

```bash
npm test
npm run test:watch
npm run test:coverage
```

## Quick Checks

```bash
curl -s http://localhost:3000/health/live
curl -s http://localhost:3000/docs
scripts/manage.sh sphinx status
```

## License

MIT License
