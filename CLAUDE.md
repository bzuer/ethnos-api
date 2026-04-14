# Ethnos_API — Project Instructions

Academic bibliographic system API built with Node.js/Express, backed by MariaDB and Sphinx full-text search.

## Database
- Database name: `data`. Direct access: `mariadb data` or `mariadb data -e "..."`.
- 23 base tables, 0 views, 36 stored procedures, 1 function, 5 triggers.
- Schema files:
  - `database/data.schema.sql` — current production schema dump (tables, routines, triggers). Regenerated via `./scripts/maintenance/publications/regenerate_schema_dump.sh data database/data.schema.sql`.
  - `database/schema.sql` — reference schema (kept for historical diff; not regenerated).
  - `data_dev.schema.sql` (root level) — development snapshot with data; not versioned.
- Summary architecture: three denormalized tables are built by `sp_orchestrate_all_summaries(batch_size)`:
  - `summary_publications` — one row per publication, joined to `works`/`publications` by PK. Carries text corpus (`title_search`, `abstract_search`, `authors_search`, `venue_search`, `subjects_search`), unique key `uq_summary_pubs_doi`, fulltext indexes `ft_summary_pubs_content` and `ft_summary_pubs_metadata`, and embedded JSON columns `authors_json`, `subjects_json`, `files_json`.
  - `summary_venues` — one row per venue with text corpus (`name_search`, `abbrev_search`, `publisher_search`), fulltext `ft_summary_venues_text`, and embedded `top_subjects_json`, `top_publications_json`.
  - `summary_persons` — one row per person with text corpus (`preferred_name_search`, `name_variations_search`, `affiliations_search`), fulltext `ft_summary_persons_text`, and embedded `current_affiliations_json`, `top_collaborators_json`, `research_subjects_json`.
- Summary builds: `sp_build_summary_publications(batch)`, `sp_build_summary_venues()`, `sp_build_summary_persons(batch)`. Each build truncates and reloads in work-id batches. The `publications` build also populates `has_files`, `files_json` and `publication_download_count` via a per-batch `tmp_batch_files` temp table.
- Incremental refresh: `sp_refresh_summary_publications_for_work(work_id)` deletes and re-inserts the `summary_publications` rows for one work, including the file-related columns. Called by `realTimeIndexing.service.js` after every publication mutation; safe to invoke ad-hoc.
- Legacy artefacts explicitly absent (do not reintroduce): `sphinx_works_summary`, `sphinx_venues_summary`, `sphinx_persons_summary`, `work_author_summary`, `work_subjects_summary`, `sphinx_queue`, `processing_log`, `person_match_log`, `staging_*`, `temp_*`, and the four dormant `v_*` views.

## Project Structure
- Runtime: Node.js (>= 18), Framework: Express
- Entry point: `src/app.js` (HTTP), `src/https-app.js` (HTTPS)
- Source layout:
  - `src/routes/` — 18 route modules (includes `publications`)
  - `src/controllers/` — 14 controllers (includes `publications`)
  - `src/services/` — 22 services (includes `publications`, Sphinx, cache, real-time indexing)
  - `src/dto/` — 14 DTOs + `helpers.js` (work, publication, person, organization, venue, bibliography, citations, collaborations, course, dashboard, instructor, metrics, signatures, subjects)
  - `src/middleware/` — 9 middleware modules (accessKey, errorHandler, monitoring, pagination, rateLimiting, responseFormatter, sanitization, timeout, validation)
  - `src/utils/` — responseBuilder.js, pagination.js, db.js
  - `src/models/` — Sequelize model definitions
  - `src/config/` — database.js, redis.js
- Config: `config/swagger.config.js`, `config/sphinx-unified.conf`
- Scripts: `scripts/manage.sh`, `scripts/process.sh`, `scripts/generate-swagger.js`, `scripts/clean_ram.sh`
  - `scripts/maintenance/publications/` — migration SQL + `RUN_ORDER.md` + `regenerate_schema_dump.sh` helper.
  - `scripts/systemd/` — systemd service definition
- Tests: `tests/` with `helpers/` and `disabled/` subdirectories
- Documentation: `docs/swagger.json`, `docs/swagger.yaml`
- Database: `database/data.schema.sql` (production schema), `database/schema.sql` (reference schema)
- Root: `server.sh` (fallback process manager; systemd is preferred), `data_dev.schema.sql` (dev snapshot, not versioned)

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
- Summary column contracts (read path): `summary_publications.publication_year`, `summary_publications.work_citation_count`, `summary_publications.work_reference_count`, `summary_venues.name_search` / `abbrev_search`, `summary_persons.preferred_name_search`. Denormalized lists (`authors_json`, `subjects_json`, `files_json`, `top_subjects_json`, `top_publications_json`) are parsed on the service side, not re-joined per row.

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
- Production: systemd user service (`ethnos-api.service`) via `systemctl --user`. `server.sh` is the legacy fallback (PM2/nohup).
- Systemd setup: `scripts/manage.sh systemd:install` installs the user unit to `~/.config/systemd/user/`. No sudo required.
- API runtime port: `1211`. Use `3000` only for test context (`NODE_ENV=test`).

## Important Scripts
- `scripts/manage.sh` — unified control script with automatic infrastructure verification.
  - `restart`: stops API → cleans logs/caches → installs deps → generates docs → verifies and fixes MariaDB, Redis, Sphinx, API → validates all.
  - `deploy`: full deploy with Sphinx reindex + test suite. Stops all → clean → deps → docs → reindex → repair NOT SERVING → tests → start + validate.
  - `start`: verifies all infrastructure (MariaDB, Redis, Sphinx, API), starts/fixes anything missing, validates.
  - `stop`: stops API service and kills rogue processes on port 1211.
  - `status`: validates all infrastructure and reports (non-destructive).
  - `systemd:install`: installs user unit to `~/.config/systemd/user/` via `systemctl --user`. No sudo.
  - `sphinx start|stop|status`: Sphinx lifecycle management.
  - `index [names...]` / `index:fast`: Sphinx indexing.
  - `test --endpoints` / `test --data`: test suites.
  - Infrastructure checks: MariaDB connectivity, Redis PING (auto-start if down), Sphinx searchd (auto-start if down), API systemd service (auto-install if missing, auto-start if stopped), rogue process cleanup on port 1211.
  - `NOT SERVING` repair: evaluates only entries after the latest `ETHNOS_MARKER`; targeted rebuild first, full rebuild as fallback.
  - **Agent rule:** never execute heavy indexing commands automatically (`deploy`, `index`, `index:fast`); always ask the user to run them manually.
- `scripts/process.sh` — CI/CD pipeline orchestrator (build/dev/deploy).
- `server.sh` — legacy server management (PM2 or nohup fallback).
- `scripts/generate-swagger.js` — generates `docs/swagger.json` and `docs/swagger.yaml`.
## Sphinx
- Template: `config/sphinx-unified.conf` (no secrets).
- Runtime config: `/var/run/ethnos-api/sphinx.conf` (generated by `manage.sh` from `/etc/node-backend.env`).
- Runtime data: `/var/lib/ethnos-api/sphinx`, logs: `/var/log/ethnos-api`, PID: `/var/run/ethnos-api/sphinx.pid`.

## Repository Hygiene
- Ignored: `logs/`, `coverage/`, `venv/`, `backup/`, `database/*.sql` (except `database/schema.sql` and `database/data.schema.sql`), `node_modules/`, `.env*`.
- Valid folders: `src/`, `config/`, `tests/`, `docs/`, `scripts/`, `database/`.
- `ssl/` is a runtime-only directory for TLS certificates (not tracked; referenced by `src/config/database.js`).
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
- 81 operations across 81 paths in `docs/swagger.json`.
- Disabled endpoints: `/signatures`, `/subjects` (root). Nested endpoints remain active.

## Route Standards
- Use plural collections: `/bibliographies`, `/institutions`, `/publications`.
- Venue payloads must expose `abbreviated_name` when available.
- Any endpoint exposing venue naming must include both `name` and `abbreviated_name` (or `venue_name` and `venue_abbreviated_name`) together.
- Health probes: `/health/liveness`, `/health/readiness`, `/health/metrics`.
- Works listing: `/works`, `/works/showcase`. Filters apply with `meta.match_mode = "any_publication"` semantics — a work appears if **any of its publications** matches the filter set, and the displayed publication is the latest matching one.
- Works detail: `/works/{id}` embeds `publications[]` (full per-publication entries with their own `identifiers`, `venue`, `publisher`, `files`, `_links.self`), `publications_total`, `publications_has_more`. The legacy single `publication`/`venue`/`publisher`/`files`/`licenses` blocks were removed in Phase 6. Aggregated `identifiers` (union over every publication) remains. Cache key: `work:v2:{id}:c{0|1}:r{0|1}`.
- Publications: `/publications` and `/publications/{id}` are backed by `summary_publications` (free-text via `q` routes through Sphinx; filter-only paths hit MariaDB). Detail responses embed `work`, `siblings[]`, optional `citations` / `references` blocks.
- Bibliography relationships: `/works/{id}/bibliographies`, `/courses/{id}/bibliographies`, `/instructors/{id}/bibliographies`.
- DOI resolution: `/{doi}`, `/doi.org/{doi}`, `/https://doi.org/{doi}` — resolves DOI to a publication via `summary_publications.uq_summary_pubs_doi` (with `publications.doi` as a fallback) and returns the publication-shaped payload (with the parent `work` block embedded). Regex route in `src/app.js`, handled by `publicationsController.getPublicationByDoi`.
- Sphinx endpoints: `/metrics/sphinx`, `/metrics/sphinx/detailed`, `/metrics/sphinx/search`, `/metrics/sphinx/status`, `/metrics/sphinx/compare`.
- Search endpoints (`/search/works`, `/search/advanced`): `q` is optional; filter-only queries (e.g. `venue=mana`) are supported.
- All optional query params must use `optional({ values: 'falsy' })` so empty strings (`param=`) are treated as absent.
- Controller must normalize empty-string params to `undefined` before passing to services (avoid treating `""` as `false` for booleans).

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
