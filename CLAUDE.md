# Ethnos_API — Project Instructions

Academic bibliographic system API built with Node.js/Express, backed by MariaDB and Sphinx full-text search.

## Database
- Database name: `data`. Direct access: `mariadb data` or `mariadb data -e "..."`.
- 37 base tables, 11 views, 60 stored procedures, 1 function.
- Schema files:
  - `database/data.schema.sql` — current production schema dump (tables, views, routines, triggers).
  - `database/schema.sql` — reference schema.
  - `data_dev.schema.sql` (root level) — development snapshot with data; not versioned.

## Project Structure
- Runtime: Node.js (>= 18), Framework: Express
- Entry point: `src/app.js` (HTTP), `src/https-app.js` (HTTPS)
- Source layout:
  - `src/routes/` — 17 route modules
  - `src/controllers/` — 13 controllers
  - `src/services/` — 21 services (includes Sphinx, cache, real-time indexing)
  - `src/dto/` — 13 DTOs (work, person, organization, venue, bibliography, citations, collaborations, course, dashboard, instructor, metrics, signatures, subjects)
  - `src/middleware/` — 9 middleware modules (accessKey, errorHandler, monitoring, pagination, rateLimiting, responseFormatter, sanitization, timeout, validation)
  - `src/utils/` — responseBuilder.js, pagination.js, db.js
  - `src/models/` — Sequelize model definitions
  - `src/config/` — database.js, redis.js
- Config: `config/swagger.config.js`, `config/sphinx-unified.conf`
- Scripts: `scripts/manage.sh`, `scripts/process.sh`, `scripts/generate-swagger.js`, `scripts/clean_ram.sh`
  - `scripts/maintenance/` — SQL maintenance routines with RUN_ORDER.md
  - `scripts/systemd/` — systemd service definition
- Tests: `tests/` with `helpers/` and `disabled/` subdirectories
- Documentation: `docs/swagger.json`, `docs/swagger.yaml`
- Database: `database/data.schema.sql` (production schema), `database/schema.sql` (reference schema)
- Root: `server.sh` (production), `rsync.sh` (sync to remote), `data_dev.schema.sql` (dev snapshot, not versioned)

## Response Conventions
- All responses via `responseFormatter` (global in `src/app.js`).
- Envelopes (`src/utils/responseBuilder.js`):
  - Success: `{ status: 'success', data, pagination?, meta? }`
  - Error: `{ status: 'error', message, code, timestamp, meta? }`
- Pagination mandatory for listings: `createPagination/normalizePagination` from `src/utils/pagination.js`.
  - Support both `page/limit` and `offset/limit` simultaneously.

## Security and Internal Access
- Protected endpoints require `X-Access-Key` header (case-insensitive: `x-access-key`, `x-internal-key`, `x-api-key`).
- Middleware: `src/middleware/accessKey.js`.
  - `requireInternalAccessKey` checks env vars in order: `API_KEY`, `INTERNAL_ACCESS_KEY`, `SECURITY_ACCESS_KEY`, `API_ACCESS_KEY`, `ETHNOS_API_KEY`, `ETHNOS_API_ACCESS_KEY`, `API_SECRET_KEY`.
  - `createAccessKeyGuard` for specific contexts.
- OpenAPI defines `securitySchemes.XAccessKey`.

## Development Standards
- Validation: `express-validator`.
- DTOs per domain in `src/dto/`.
- Errors: `res.fail(...)` and `res.error(err, ...)` with `ERROR_CODES`.
- Raw SQL via `sequelize.query`.
- Production schema: `database/data.schema.sql`. Reference schema: `database/schema.sql`.
- Dev snapshot: `data_dev.schema.sql` (root level; not versioned).
- For citation/reference logic, use the unified table `work_references` (`status`: `PENDING|RESOLVED|FAILED`); never rely on legacy `citations` or `unresolved_citations`.
- `work_references` status semantics: `RESOLVED` = cited work exists in DB; `PENDING` = does not exist yet (expected state, not an error).
- Person-signature relation: direct via `persons.signature_id`; do not use legacy `persons_signatures`.
- Publication-file relation: direct in `files` (`publication_id`, `work_id`, `file_role`); do not use legacy `publication_files`.
- Sphinx summaries must stay aligned with DB routines: `sphinx_works_summary.venue_abbrev` and `sphinx_venues_summary.abbreviated_name` are part of current query contracts.

## Documentation (OpenAPI)
- UI: `/docs` (Swagger UI) sourced from `/docs.json`.
- JSON: `GET /docs.json`. YAML: `GET /docs.yaml` (aliases: `/openapi.yaml`, `/openapi.yml`).
- Generation: `npm run docs:generate`, `npm run docs:generate:yaml`.
- Update Swagger JSDoc in routes when creating or modifying endpoints.
- Document `page`, `limit`, `offset` and use `$ref` for envelopes and pagination.

## Execution and Environments
- Runtime env: `/etc/node-backend.env` as single source of truth.
- Development: `npm run dev`.
- Build: `npm run build`.
- Production: `./server.sh start`.
- API runtime port: `1211`. Use `3000` only for test context (`NODE_ENV=test`).

## Important Scripts
- `scripts/manage.sh` — deploy, tests, Sphinx, Swagger.
  - Deploy: stop API and Sphinx, clear caches, install deps, generate docs, index Sphinx, start Sphinx, repair broken indexes, run tests, restart API.
  - `NOT SERVING` repair must evaluate only log entries after the latest `ETHNOS_MARKER` emitted by the current run; ignore historical daemon warnings.
  - When `NOT SERVING` is detected, attempt targeted rebuild first; full rebuild only as fallback.
  - Indexing: `scripts/manage.sh index` and `scripts/manage.sh index:fast`.
  - Sphinx: `scripts/manage.sh sphinx start|stop|status`.
  - **Agent rule:** never execute heavy indexing commands automatically (`deploy`, `index`, `index:fast`); always ask the user to run them manually.
- `scripts/process.sh` — build/dev/deploy flow (clears caches/runtime/logs, refreshes deps, warms docs cache, runs tests or delegates deploy).
- `scripts/generate-swagger.js` — generates `docs/swagger.json` and `docs/swagger.yaml`.
- `rsync.sh` — syncs repo to remote server and sends Sphinx indexes.

## Sphinx
- Template: `config/sphinx-unified.conf` (no secrets).
- Runtime config: `/var/run/ethnos-api/sphinx.conf` (generated by `manage.sh` from `/etc/node-backend.env`).
- Runtime data: `/var/lib/ethnos-api/sphinx`, logs: `/var/log/ethnos-api`, PID: `/var/run/ethnos-api/sphinx.pid`.

## Repository Hygiene
- Ignored: `logs/`, `coverage/`, `venv/`, `backup/`, `database/*.sql` (except `database/schema.sql` and `database/data.schema.sql`), `node_modules/`, `.env*`.
- Valid folders: `src/`, `config/`, `tests/`, `docs/`, `scripts/`, `ssl/`, `database/`.
- `config/` must contain only `swagger.config.js` and `sphinx-unified.conf` (remove `.bak` and stale files).
- `runtime/` must not contain Sphinx indexes (use only `/var/lib/ethnos-api/sphinx`).
- Repo logs must be cleared at the start of `deploy` and `restart`.

## Code Style
- Comments forbidden in code, except Swagger JSDoc and strictly necessary annotations.
- Forbidden: TODO, FIXME, HACK, NOTE, BUG, XXX, commented-out code.
- Use technical English for variable names, functions, files, tests, and system messages.
- Do not add inline CSS/JS in API documentation examples or responses.
- Never version secrets or credentials; use `/etc/node-backend.env`.
- Do not expose keys or sensitive data in responses, logs, or error payloads.

## Endpoints State
- 78 operations across 78 paths in `docs/swagger.json`.
- Disabled endpoints: `/signatures`, `/subjects` (root). Nested endpoints remain active.

## Route Standards
- Use plural collections: `/bibliographies`, `/institutions`.
- Venue payloads must expose `abbreviated_name` when available.
- Any endpoint exposing venue naming must include both `name` and `abbreviated_name` (or `venue_name` and `venue_abbreviated_name`) together.
- Health probes: `/health/liveness`, `/health/readiness`, `/health/metrics`.
- Works listing: `/works/showcase`.
- Bibliography relationships: `/works/{id}/bibliographies`, `/courses/{id}/bibliographies`, `/instructors/{id}/bibliographies`.
- Sphinx endpoints: `/metrics/sphinx`, `/metrics/sphinx/detailed`, `/metrics/sphinx/search`, `/metrics/sphinx/status`, `/metrics/sphinx/compare`.

## Tests
- Framework: Node test runner (`node --test`) + Supertest.
- Commands: `npm test`, `npm run test:watch`, `npm run test:coverage`.
- Test helpers in `tests/helpers/` (auth, expectations, http-client, mock-express, router-invoke, test-app).
- Disabled tests in `tests/disabled/` (signatures, subjects).
- When changing behavior, prefer adding or updating tests in `tests/`.

## Quick References
- Envelopes: `src/utils/responseBuilder.js`
- Pagination: `src/utils/pagination.js`
- Internal access: `src/middleware/accessKey.js`
- Monitoring: `src/middleware/monitoring.js`
