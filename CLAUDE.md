# Ethnos_API — Project Instructions

Academic bibliographic system API built with Node.js/Express, backed by MariaDB and Sphinx full-text search.

## Runtime and Execution
- Runtime: Node.js (>= 18). Framework: Express. Entry points: `src/app.js` (HTTP), `src/https-app.js` (HTTPS).
- Runtime env: `/etc/node-backend.env` is the single source of truth. Never version secrets or credentials.
- API runtime port: `1211` (production and development).
- Test ports: `3000` is the in-process default when `NODE_ENV=test`; integration tests target `1210` via `INTEGRATION_BASE_URL`, so a temporary instance on `PORT=1210` is the expected target. Never touch the live `1211` when validating changes.
- Development: `npm run dev`. Build: `npm run build`. Production: systemd user service `ethnos-api.service` via `systemctl --user`; `server.sh` is the legacy fallback (PM2/nohup).
- Systemd setup: `scripts/manage.sh systemd:install` installs the user unit to `~/.config/systemd/user/`. No sudo required.

## Database
- **Strict consumer-only.** This project NEVER creates, executes, or alters database procedures, events, triggers, indexes, table structures, or row data. It only issues read-side `SELECT` / `EXISTS` queries. Any structural change (DDL, `CREATE`/`ALTER`/`DROP PROCEDURE`/`EVENT`/`TRIGGER`/`TABLE`/`INDEX`, `INSERT`/`UPDATE`/`DELETE`, `CALL`, `TRUNCATE`) must be **requested from the user** and applied via a separate operations pipeline. Read-only utilities (`mariadb-dump --no-data`, `SELECT … FROM information_schema.*`, baseline asserts) are allowed.
- **Where to file requests.** Every change the application needs from the operator goes into `calls/` as **its own dated file** (`calls/YYYY-MM-DD_<slug>.md` or `.sql`), one request per file, dated with the day the request was filed. Do **not** append to an older file — a request filed in May does not belong inside an April log. Use the Status / Why / Current state / Proposed change / Verification / Rollback template. `calls/2026-04-13_database-change-requests.md` is kept only as the historical request log and template reference; new requests must go into new files. `calls/` is also the right place for any other operator-side runbook, SQL draft, or follow-up ask the application generates.
- Database name: `data`. Direct access: `mariadb data` or `mariadb data -e "..."`.
- Topology: 23 base tables, 0 views, 37 stored procedures, 1 function, 5 triggers.
- Schema files:
  - `database/data.schema.sql` — current production schema dump (tables, routines, triggers). Regenerated via `./scripts/maintenance/publications/regenerate_schema_dump.sh data database/data.schema.sql`.
  - `database/schema.sql` — reference schema (kept for historical diff; not regenerated).
  - `data_dev.schema.sql` (root level) — development snapshot with data; not versioned.

### Summary architecture
Three denormalized tables are built by `sp_orchestrate_all_summaries(batch_size)`:
- `summary_publications` — one row per publication, joined to `works` / `publications` by PK. Carries the text corpus (`title_search`, `abstract_search`, `authors_search`, `venue_search`, `subjects_search`), unique key `uq_summary_pubs_doi`, fulltext indexes `ft_summary_pubs_content` and `ft_summary_pubs_metadata`, embedded JSON columns `authors_json`, `subjects_json`, `files_json`, plus additive columns `publication_date`, `volume`, `issue`, `pages_text`, `source`, `license_url`, `license_version`, `identifiers_json`, `has_scimag_file`, `has_libgen_file`. `files_json` entries carry `{id, format, size, role, md5, libgen_id, scimag_id, openacess_id, best_oa_url, pages, language, version, verification, downloads}`.
- `summary_venues` — one row per venue with text corpus (`name_search`, `abbrev_search`, `publisher_search`), fulltext `ft_summary_venues_text`, embedded `top_subjects_json`, `top_publications_json`, full ranking surface (`global_ranking_score`, `score_breakdown_json` with `total` / `subject` / `snip` / `oa` / `authorship` / `affiliation` / `citation` / `llm` / `llm_relevance` / `llm_justification`), supporting bibliometrics (`impact_factor`, `citescore`, `sjr`, `snip`, `h_index`, `i10_index`, `two_yr_mean_citedness`) and quality flags (`is_in_doaj`, `is_in_scielo`, `is_indexed_in_scopus`, `homepage_url`, `validation_status`).
- `summary_persons` — one row per person with text corpus (`preferred_name_search`, `name_variations_search`, `affiliations_search`), fulltext `ft_summary_persons_text`, embedded `current_affiliations_json`, `top_collaborators_json`, `research_subjects_json`, plus denormalised name fields (`signature_id`, `signature_text`, `family_name`, `given_names`, `normalized_name`).

### Summary lifecycle
- Batch builds: `sp_build_summary_publications(batch)`, `sp_build_summary_venues()`, `sp_build_summary_persons(batch)`. Each build truncates and reloads in work-id batches. `sp_build_summary_publications` populates `has_files` / `has_scimag_file` / `has_libgen_file` / `files_json` from the base `files` table during the build; `publication_download_count` is intended to be summed from `files.download_count` but is currently 0 across the corpus (build-procedure bug, see `calls/2026-05-18_summary_tables_diagnostic.md`). The procedure also leaves `publication_date`, `volume`, `issue`, `pages_text`, `source`, `license_url`, `license_version`, `identifiers_json` permanently NULL (declared on the table but never set by the INSERT); `summary_persons.name_variations_search`, `top_collaborators_json`, `research_subjects_json` are likewise empty across the corpus. Read paths that need those fields JOIN the base `publications` row instead of trusting the summary.
- Incremental refresh: `sp_refresh_summary_publications_for_work(p_work_id)` deletes and reinserts every `summary_publications` row for a single work, including the file aggregates. The API never calls this procedure (consumer-only rule); it is invoked by the operator's mutation pipeline after `publications` / `works` / `authorships` / `work_subjects` / `files` writes.
- **Real-time Sphinx indexing is operator-owned.** `src/services/realTimeIndexing.service.js` and the `indexWork` / `updateWork` / `deleteWork` methods on `sphinx.service.js` are deliberate no-ops (they return `{ skipped: true, reason: 'operator_pipeline_owned' }`). Mutations to `publications` / `works` propagate into `publications_rt` only after the operator pipeline calls `sp_refresh_summary_publications_for_work` and re-indexes. The API read path always queries `publications_poc` (batch-built on orchestrate) plus `publications_rt` (operator-maintained delta) together.
- Legacy artefacts explicitly absent (do not reintroduce): `sphinx_works_summary`, `sphinx_venues_summary`, `sphinx_persons_summary`, `work_author_summary`, `work_subjects_summary`, `sphinx_queue`, `processing_log`, `person_match_log`, `staging_*`, `temp_*`, and the four dormant `v_*` views.

### Schema contracts on the read path
- Use the unified table `work_references` (`status`: `PENDING|RESOLVED|FAILED`) for citation/reference logic; never rely on legacy `citations` or `unresolved_citations`. `RESOLVED` means the cited work exists in DB; `PENDING` means it does not yet (expected state, not an error).
- Person-signature relation: direct via `persons.signature_id`. Do not use legacy `persons_signatures`.
- Publication-file relation: direct in `files` via `publication_id` (`file_role` distinguishes roles). The legacy `files.work_id` column was dropped — never reintroduce a parallel work-level path; always join through `publications.work_id` when a work-scoped query is needed. Legacy `publication_files` is also gone.
- Summary column contracts: `summary_publications.publication_year`, `summary_publications.work_citation_count`, `summary_publications.work_reference_count`, `summary_venues.name_search` / `abbrev_search`, `summary_persons.preferred_name_search`. Denormalized lists (`authors_json`, `subjects_json`, `files_json`, `top_subjects_json`, `top_publications_json`) are parsed on the service side, not re-joined per row.

## Project Structure
- `src/routes/` — 18 route modules (includes `publications`).
- `src/controllers/` — 14 controllers (includes `publications`).
- `src/services/` — 22 services (includes `publications`, Sphinx, cache, real-time indexing).
- `src/dto/` — 14 DTOs + `helpers.js` (work, publication, person, organization, venue, bibliography, citations, collaborations, course, dashboard, instructor, metrics, signatures, subjects).
- `src/middleware/` — 9 middleware modules (accessKey, errorHandler, monitoring, pagination, rateLimiting, responseFormatter, sanitization, timeout, validation).
- `src/utils/` — `responseBuilder.js`, `pagination.js`, `db.js`.
- `src/models/` — Sequelize model definitions.
- `src/config/` — `database.js`, `redis.js`.
- `config/` — `swagger.config.js`, `sphinx-unified.conf` (no other files; no `.bak`).
- `scripts/` — `manage.sh`, `process.sh`, `generate-swagger.js`, `clean_ram.sh`, `maintenance/publications/` (migration SQL + `RUN_ORDER.md` + `regenerate_schema_dump.sh`), `systemd/ethnos-api.service`.
- `tests/` — see [Tests](#tests).
- `docs/` — `swagger.json`, `swagger.yaml`.
- `database/` — `data.schema.sql` (production), `schema.sql` (reference).
- Root: `server.sh` (legacy fallback), `data_dev.schema.sql` (dev snapshot, not versioned).

## Response Conventions
- All responses flow through `responseFormatter` (global in `src/app.js`) and `src/utils/responseBuilder.js`.
- Success envelope: `{ status: 'success', data, pagination?, meta? }`.
- Error envelope: `{ status: 'error', message, code, timestamp, meta? }`.
- Errors are raised via `res.fail(...)` and `res.error(err, ...)` with `ERROR_CODES`.
- Pagination is mandatory for listings. Use `createPagination` / `normalizePagination` from `src/utils/pagination.js`. Both `page/limit` and `offset/limit` are accepted simultaneously.
- On `summary_publications`-backed listings (`/works`, `/search/works`, `/publications`), `pagination.total` is best-effort: the count is bounded by a 20 000-row sample with a 2 s server-side budget (`SET STATEMENT max_statement_time`). When the sample is hit or the budget fires, the response falls back to an estimate and sets `meta.pagination_total_exact = false`. Clients that need an exact count must detect that flag (and/or rely on the `data.length < limit` terminator on the last page).

## Security and Internal Access
- **Every endpoint requires the `X-Access-Key` header.** Aliases (case-insensitive): `x-access-key`, `x-internal-key`, `x-api-key`. Query-string aliases: `access_key`, `accessKey`, `api_key`. Mounted globally in `src/app.js` as `globalAccessKeyGuard` (delegates to `requireInternalAccessKey`).
- **Public exceptions** (no key needed): `/health/liveness`, `/docs`, `/docs.json`, `/docs.yaml`, `/openapi.yaml`, `/openapi.yml`. Everything else — including `/`, `/health/readiness`, `/health/metrics`, every domain listing (`/works`, `/publications`, `/persons`, `/venues`, `/institutions`, `/search/*`, `/metrics/*`, `/dashboard/*`, `/bibliographies`, `/courses`, `/instructors`, `/signatures`, `/subjects`, `/security/*`, citations, collaborations) and the DOI resolver regex — rejects with 401 when the key is missing or invalid.
- **Multiple keys are accepted.** `requireInternalAccessKey` collects values from every configured env var and accepts any match: `API_KEY`, `INTERNAL_ACCESS_KEY`, `SECURITY_ACCESS_KEY`, `API_ACCESS_KEY`, `ETHNOS_API_KEY`, `ETHNOS_API_ACCESS_KEY`, `API_SECRET_KEY`, `ETHNOS_API_KEY_2`. Add more keys by setting additional env vars on the same list. The middleware no longer prefers a single env var; any configured value works.
- **Authenticated requests bypass rate limiting.** `shouldSkipRateLimit` in `src/middleware/rateLimiting.js` calls `hasValidAccessKey(req)` so any request carrying a valid key is exempt from `generalLimiter`, `searchLimiter`, `metricsLimiter`, `relationalLimiter`, and `speedLimiter` regardless of `RATE_LIMIT_DISABLED`. Per-route limiters (e.g. `searchLimiter` on `/search`) are kept in place as defense-in-depth for unauthenticated traffic, but unauthenticated traffic is rejected before reaching them.
- Middleware: `src/middleware/accessKey.js` exports `requireInternalAccessKey`, `createAccessKeyGuard`, `hasValidAccessKey`, and `DEFAULT_ACCEPTED_ENV_VARS`.
- OpenAPI declares `securitySchemes.XAccessKey` and applies it globally via the top-level `security: [{ XAccessKey: [] }]`. Public exceptions opt out per-operation with `security: []` (currently only `/health/liveness`).
- Do not expose keys or sensitive data in responses, logs, or error payloads.

## Route Standards
- Plural collections: `/bibliographies`, `/institutions`, `/publications`, `/works`, `/persons`, `/venues`, `/courses`, `/instructors`, `/subjects`, `/signatures`.
- Health probes: `/health/liveness`, `/health/readiness`, `/health/metrics`.
- Venue payloads expose `abbreviated_name` alongside `name` (or `venue_abbreviated_name` alongside `venue_name`). Both must appear together when either is exposed.
- All optional query params use `optional({ values: 'falsy' })` so empty strings (`param=`) are treated as absent. Controllers normalize empty-string params to `undefined` before passing to services (avoid treating `""` as `false` for booleans).

### Citation filters on work/publication listings
- Every listing that surfaces works or publications accepts `cited_by_min`, `cited_by_max`, `sort_by`, and `sort_order` on top of the endpoint-specific filters. The legacy aliases `citation_count_min` / `citation_count_max` (and the `sortBy` / `sortOrder` casings) are also honoured.
- `cited_by_min` / `cited_by_max` are inclusive bounds against `summary_publications.work_citation_count` (the incoming citation count at the work level). Empty or invalid values are ignored.
- `sort_by` accepts `cited_by_count` (surfaces the most cited works first), `references_count`, `publication_year`, `id`, and — where applicable — `relevance`. `sort_order` is `DESC` by default (numeric fields) and accepts `ASC` / `DESC`. When `sort_by` is omitted, the previous defaults stand: `publication_year DESC, id DESC` on DB-backed listings and relevance on Sphinx full-text paths.
- Endpoints wired: `/works`, `/works/showcase`, `/publications`, `/search/works`, `/search/advanced`, `/persons/{id}/works`, `/venues/{id}/works`. Sphinx paths push the citation bounds as `citation_count_min` / `citation_count_max` attribute filters against `publications_poc`; MariaDB paths translate them to `sp.work_citation_count >= ?` / `sp.work_citation_count <= ?` clauses.
- List items expose `cited_by_count` and `references_count` directly (work listings) or `citation_count` / `reference_count` (publication listings); `/persons/{id}/works` and `/venues/{id}/works` now join `summary_publications` to surface the same `cited_by_count` on every row.

### Works endpoints
- Listings: `/works`, `/works/showcase`, `/search/works`, `/search/advanced`. Filters apply with `meta.match_mode = "any_publication"` — a work appears if **any of its publications** matches, and the displayed publication is the latest matching one. List items expose the latest `publication_id` and total `publications_count` for direct navigation to `/publications/{publication_id}` without a detail fetch.
- Fulltext (`q`) and metadata filters (`venue_name`, `author`, `subject`) route through Sphinx first (`publications_poc`). Multi-word metadata values are AND-scoped to the target field via `@authors_search (token1 token2 …)` / `@venue_search (…)` / `@subjects_search (…)` so every token must appear in that field — never an OR-bloat across other fields and never the implicit AND-anywhere that strict phrase matching imposes (the latter would miss the common middle-name / honorific variants in `authors_search`). When Sphinx is unavailable, the MariaDB fallback (`worksService._getWorksSearchFallback`) uses `MATCH(sp.title_search, sp.abstract_search) AGAINST (? IN BOOLEAN MODE)` against `ft_summary_pubs_content` for `q`, and `MATCH(sp.authors_search, sp.venue_search, sp.subjects_search) AGAINST (? IN BOOLEAN MODE)` against `ft_summary_pubs_metadata` for the metadata terms with every token of every filter forced to required (`+token1 +token2 …`). Joining the filter values with a plain space in BOOLEAN MODE (the previous behaviour) treated them as OR and returned tens of thousands of false positives (`author=Pedro Luiz Cortés` once bloated to 29 468 unrelated rows); the per-token `+` prefix collapses that to the actual matches and keeps `subject=social anthropology` under the count budget (the strict-phrase form `+"…"` ran past the 6 s statement timeout on `ft_summary_pubs_metadata`). `/search/advanced` uses the same fallback when Sphinx throws `no enabled local indexes`, so it never returns HTTP 500 for a missing index.
- Detail: `/works/{id}` embeds `publications[]` (full per-publication entries with their own `identifiers`, `venue`, `publisher`, `files`, `_links.self`, plus an `is_primary` boolean flagging the work's primary publication), `publications_total`, `publications_has_more`. The legacy single `publication` / `publisher` / `licenses` blocks remain removed (Phase 6). Aggregated `identifiers` (union over every publication) remains.
  - Live `files` JOIN (defensive workaround, no longer compensating for missing data). As of 2026-05-18 the denormalised `summary_publications.has_files` / `has_scimag_file` / `has_libgen_file` / `files_json` are populated correctly: 5,118,370 rows carry `has_files = 1`, matching `SELECT COUNT(DISTINCT publication_id) FROM files` exactly (Request 6 in `calls/2026-05-11_repopulate_summary_publications_files.md` was executed). Both `/works/{id}` and `/publications/{id}` still read the `files` table directly as a defense-in-depth path: `_getCompleteWorkData` runs a bounded `SELECT … FROM files WHERE publication_id IN (…) LIMIT 500` (aliased so the row shape matches `mapFiles`' JSON keys — `file_format AS format`, `file_size AS size`, `file_role AS role`, `verification_status AS verification`, `download_count AS downloads`), groups by `publication_id`, and overrides `row.files_json` / `row.has_files` / `row.has_scimag_file` / `row.has_libgen_file` before the DTO runs. `/publications/{id}` does the same with `LIMIT 200`. If the live JOIN throws the service logs and falls back to `files_json` (graceful degradation). The remaining gap: `summary_publications.publication_download_count` is still 0 across all 5.1 M file-bearing rows even though `files.download_count` is summed by the build procedure — likely a build-procedure bug, see `calls/2026-05-18_summary_tables_diagnostic.md`.
  - Work-level aggregations surfaced at the top level: `primary_publication_id`, a compact `primary_publication` block (id / doi / publication_year / publication_date / volume / issue / pages / venue / publisher / source / license / has_files / open_access / peer_reviewed / `_links.self`), convenience flags `publication_year` / `doi` / `open_access` / `peer_reviewed` / `has_files` / `venue` (all derived from the primary), a `year_range` block (`earliest` / `latest`), a `languages[]` distinct list, and `summary_updated_at` (latest `summary_publications.summary_updated_at` across siblings). Primary picker: latest `publication_year` DESC → `has_files` DESC → `publication_id` DESC.
  - `files[]` is a flat work-level aggregation of every publication's `files_json`, capped at 50, sorted by role priority (MAIN > SUPPLEMENT > COVER > PREVIEW) then verification (VERIFIED first) then `publication_id` DESC. Each entry carries the parent `publication_id` along with `file_id` / `md5` / `format` / `size` / `pages` / `language` / `role` / `version` / `libgen_id` / `scimag_id` / `openacess_id` / `best_oa_url` / `verification` / `download_count`.
  - `file_summary` reports `files_returned`, `files_total`, `files_truncated`, `publications_with_files`, `total_download_count`, `best_oa_url`, `by_format`, `by_role`, plus `has_scimag` / `has_libgen` / `has_open_access` rollups.
  - `venues[]` is a distinct-venue roll-up (one entry per `venue_id`) carrying `publication_count` and `latest_year`, ordered by publication_count DESC, latest_year DESC.
  - `metrics` is extended with `publications_count`, `publications_with_files_count`, `publications_open_access_count`, `publications_peer_reviewed_count`, `distinct_venues_count`, `total_files_count`, `total_files_download_count`, and `metrics_last_updated`.
  - Cache key bumped to `work:v4:{id}:c{0|1}:r{0|1}` (was `work:v3:*`) so the live-files patch invalidates stale payloads. `/publications/{id}` cache key bumped to `publication:{id}:v2:*` for the same reason.

### Publications endpoints
- `/publications` and `/publications/{id}` are backed by `summary_publications`. Free-text queries (`q`) and `venue` / `author` / `subject` LIKE-style filters route through Sphinx (`publications_poc`); filter-only paths (`language`, `year_from`/`year_to`, `type`, `open_access`, `peer_reviewed`, `has_files`, `venue_id`, `publisher_id`, `work_id`, `doi`) hit MariaDB directly. When the Sphinx index is unavailable the service falls back to MariaDB: `q` is executed as `MATCH(sp.title_search, sp.abstract_search) AGAINST (? IN BOOLEAN MODE)` against the `ft_summary_pubs_content` fulltext index and `venue` / `author` / `subject` degrade to `LIKE '%…%'` on the corresponding `*_search` columns (slower, but keeps results correct). The response surfaces the active path via `meta.engine` (`Sphinx+MariaDB`, `MariaDB`, or `MariaDB-fallback`). List rows join `venues v` and `organizations publisher` so `venue` (type / issn / eissn / scopus_id / wikidata_id / openalex_id) and `publisher` hydrate; `source`, `license_url`, `license_version` are surfaced on every list row. Detail responses embed `work`, `siblings[]`, `files[]`, optional `citations` / `references`.
- DOI resolution: `/{doi}`, `/doi.org/{doi}`, `/https://doi.org/{doi}` resolve a DOI to a publication via `summary_publications.uq_summary_pubs_doi` (`publications.doi` fallback) and return the publication-shaped payload with the parent `work` block embedded. Regex route is wired in `src/app.js` and handled by `publicationsController.getPublicationByDoi`.

### Venues endpoints
- `/venues`, `/venues/{id}`, `/venues/{id}/works`, `/venues/search`, `/venues/statistics` are backed by `summary_venues` (joined with `venues` + `organizations` for base columns and publisher). Subjects come from the embedded `top_subjects_json` (pre-sorted top 10). `/venues/search` routes free-text through Sphinx with a `summary_venues` MariaDB fallback.
- List `sortBy` accepts `id|name|type|impact_factor|works_count|h_index|cited_by_count|score|ranking|coverage_start_year|coverage_end_year|oldest|newest`. Default is `score` (global ranking score) in `DESC` order so the most important venues surface first; numeric/ranking fields default to `DESC`, while `id`, `name`, `type`, `coverage_start_year`, and `oldest` default to `ASC`; `coverage_end_year` and `newest` default to `DESC`. `oldest` / `newest` are aliases for `coverage_start_year` / `coverage_end_year`. Rows with NULL coverage years are always pushed to the tail regardless of direction. `global_ranking_score` is always applied as the tiebreaker after the primary sort.
- Coverage year filters on `/venues`: `coverage_from` / `coverage_to` bound the range (`coverage_start_year >= coverage_from` and `coverage_end_year <= coverage_to`), `coverage_start_from` / `coverage_start_to` / `coverage_end_from` / `coverage_end_to` apply inclusive bounds to the individual endpoints, and `active_in_year` keeps only venues whose coverage range encloses the supplied year (`coverage_start_year <= year <= coverage_end_year`).
- Payload surfaces are grouped into four dedicated blocks to keep the shape scannable:
  - `identifiers`: `issn`, `eissn`, `scopus_id`, `wikidata_id`, `openalex_id`, `scielo_id`. These fields are NOT repeated at the top level (the former top-level aliases were removed).
  - `indexing`: `is_in_doaj`, `is_in_scielo`, `is_indexed_in_scopus`, `validation_status`.
  - `metrics`: `impact_factor`, `citescore`, `sjr`, `snip`, `h_index`, `i10_index`, `two_yr_mean_citedness`.
  - `ranking`: `score` (= the former `global_ranking_score`), `components.{subject|snip|oa|authorship|affiliation|citation|llm}`, `llm.{relevance|justification}`. The legacy top-level `global_ranking_score` and `score_breakdown` envelopes were removed.
- A single `subjects[]` array carries the top subjects (already capped at the top 10 on detail, `{subject_id, term, score, vocabulary, lang}`). The redundant `terms[]`, `keywords[]`, `top_subjects[]` and `legacy_metrics` blocks were removed — they were pure restatements of `subjects` / `metrics`.
- Core surface also includes `publisher`, `coverage_start_year` / `coverage_end_year`, `works_count`, `cited_by_count`, `open_access`, `open_access_percentage`, `aggregation_type`, `country_code`, `homepage_url`. Detail additionally embeds `publication_summary.publication_trend`, `yearly_stats`, `top_authors`, `top_publications`, `recent_works` and the timestamp fields (`created_at`, `updated_at`, `last_validated_at`, `summary_updated_at`).
- Include flags on the detail endpoint: `include_subjects`, `include_yearly`, `include_top_authors`, `include_recent_works` (all default `true`). The legacy `include_legacy` flag was removed.
- Cache keys: list `venues:list:v4:...`, detail `venue:v3:{id}:{include_flags}`, search `venues:search:v2:...`. `mag_id` is never exposed — OpenAlex IDs already encode the same identifier.

### Search endpoints
- `/search/works`, `/search/advanced`: `q` is optional; filter-only queries (e.g. `venue=mana`) are supported. The metadata-filter AND semantics described under [Works endpoints](#works-endpoints) apply on both the Sphinx path (`@field (token1 token2 …)`) and the MariaDB fallback (`+token1 +token2 …`). The `search:works:v2:*` cache key was bumped to `search:works:v3:*` when this contract changed so stale OR-mode payloads no longer get served from Redis.
- `/search/global`, `/search/persons`, `/search/autocomplete`, `/search/popular`, `/search/health`.
- `/search/autocomplete` honours the `{ suggestions, type, count, query, generated_at }` envelope. When Sphinx is down the service falls back to `MATCH(title_search, abstract_search)` against `ft_summary_pubs_content` (without `ORDER BY` so it terminates early) and returns an empty suggestions list if that path also fails — it never surfaces `{ error: … }` inside a `status: success` payload.

### Metrics and dashboard
- Bibliometric metrics: `/metrics/annual`, `/metrics/venues`, `/metrics/institutions`, `/metrics/persons`, `/metrics/collaborations`.
- Sphinx metrics: `/metrics/sphinx`, `/metrics/sphinx/detailed`, `/metrics/sphinx/search`, `/metrics/sphinx/status`, `/metrics/sphinx/compare`.
- Dashboard (access key required): `/dashboard/overview`, `/dashboard/performance`, `/dashboard/search-trends`, `/dashboard/alerts`.

### Bibliography relationships
- `/works/{id}/bibliographies`, `/courses/{id}/bibliographies`, `/instructors/{id}/bibliographies`.

### Endpoint inventory
- 81 operations across 81 paths in `docs/swagger.json`.
- Disabled at the collection root: `/signatures` (root listing) and `/subjects` (root listing). Nested endpoints remain active.

## Documentation (OpenAPI)
- UI: `/docs` (Swagger UI) sourced from `/docs.json`.
- JSON: `GET /docs.json`. YAML: `GET /docs.yaml` (aliases: `/openapi.yaml`, `/openapi.yml`).
- Single source of truth: `config/swagger.config.js` (global `info`, `servers`, `securitySchemes`, reusable `schemas`, `parameters`, `responses`, and `tags`). Route modules contribute only the operation definitions via `@swagger` JSDoc blocks.
- Do not redefine tags inside route files — the canonical tag list lives in `config/swagger.config.js`.
- Generation: `npm run docs:generate` (JSON + YAML) or `npm run docs:generate:yaml`. Regenerate after any JSDoc change; `docs/swagger.json` and `docs/swagger.yaml` are committed and must stay in sync with the config.
- Every operation should: declare `tags`, use `$ref: '#/components/parameters/*'` for pagination params, use `$ref: '#/components/responses/*'` for standard responses, and reference `SuccessEnvelope` / `Error` from `components.schemas`.

## Development Standards
- Validation: `express-validator`. DTOs per domain in `src/dto/`.
- Raw SQL via `sequelize.query`. Models in `src/models/` (Sequelize).
- Production schema: `database/data.schema.sql`. Reference schema: `database/schema.sql`. Dev snapshot: `data_dev.schema.sql`.

## Tests
- Framework: Node test runner (`node --test`).
- Active suites:
  - `npm test` — fast unit suite (`tests/api.endpoints.test.js`). Mocks the service layer via `stubResolved` / `stubMethod`, validates route wiring and DTO shape. 31 tests, runs in <1 s.
  - `npm run test:integration` — integration smoke (`tests/integration.smoke.test.js`). Hits the running API at `INTEGRATION_BASE_URL` (default `http://localhost:1210`) through the full HTTP stack, real MariaDB, and Sphinx. Requires the API to be up. Metrics endpoints are covered only when `INTEGRATION_ACCESS_KEY` is set (skipped otherwise). Catches SQL regressions that the mock-only unit suite cannot see.
  - `npm run test:watch`, `npm run test:coverage` — variants of the unit suite.
- Test helpers in `tests/helpers/` (auth, expectations, http-client, mock-express, router-invoke, test-app).
- `tests/disabled/` holds signatures and subjects suites that stay off the runner.
- The per-domain `tests/*.test.js` files (bibliography, citations, collaborations, courses, health, instructors, organizations, persons, search, venues, works) are reference fixtures authored in Jest style; they are not executed by the current Node-runner scripts. Do not treat them as a live safety net.
- When changing behavior, prefer updating `tests/api.endpoints.test.js`. SQL contract changes should land with at least one smoke assertion in `tests/integration.smoke.test.js`.

## Sphinx
- Template: `config/sphinx-unified.conf` (no secrets).
- Runtime config: `/var/run/ethnos-api/sphinx.conf` (generated by `manage.sh` from `/etc/node-backend.env`).
- Runtime data: `/var/lib/ethnos-api/sphinx`. Logs: `/var/log/ethnos-api`. PID: `/var/run/ethnos-api/sphinx.pid`.

## Scripts
- `scripts/manage.sh` — unified control script with automatic infrastructure verification.
  - `restart`: stops API → cleans logs/caches → installs deps → generates docs → verifies and fixes MariaDB, Redis, Sphinx, API → validates all.
  - `deploy`: full deploy with Sphinx reindex + test suite. Stops all → clean → deps → docs → reindex → repair NOT SERVING → tests → start + validate.
  - `start`: verifies all infrastructure (MariaDB, Redis, Sphinx, API), starts/fixes anything missing, validates.
  - `stop`: stops the API service and kills rogue processes on port 1211.
  - `status`: validates all infrastructure and reports (non-destructive).
  - `systemd:install`: installs the user unit to `~/.config/systemd/user/` via `systemctl --user`. No sudo.
  - `sphinx start|stop|status`: Sphinx lifecycle management.
  - `index [names...]` / `index:fast`: Sphinx indexing.
  - `test --endpoints` / `test --data`: test suites.
  - Infrastructure checks: MariaDB connectivity, Redis PING (auto-start), Sphinx searchd (auto-start), API systemd service (auto-install if missing, auto-start if stopped), rogue process cleanup on port 1211.
  - `NOT SERVING` repair: evaluates only entries after the latest `ETHNOS_MARKER`; targeted rebuild first, full rebuild as fallback.
  - **Agent rule.** Never execute heavy indexing commands automatically (`deploy`, `index`, `index:fast`); always ask the user to run them manually.
- `scripts/process.sh` — CI/CD pipeline orchestrator (build / dev / deploy).
- `server.sh` — legacy server management (PM2 or nohup fallback).
- `scripts/generate-swagger.js` — regenerates `docs/swagger.json` and `docs/swagger.yaml`.

## Repository Hygiene
- Ignored: `logs/`, `coverage/`, `venv/`, `backup/`, `database/*.sql` (except `database/schema.sql` and `database/data.schema.sql`), `node_modules/`, `.env*`.
- Tracked folders: `src/`, `config/`, `tests/`, `docs/`, `scripts/`, `database/`, `calls/`.
- `calls/` holds operator-side requests the application has filed (see [Database → Where to file requests](#database)). Its contents are tracked in git.
- `ssl/` is a runtime-only directory for TLS certificates (not tracked; referenced by `src/config/database.js`).
- `runtime/` must not contain Sphinx indexes — only `/var/lib/ethnos-api/sphinx`.
- Repo logs are cleared at the start of `deploy` and `restart`.

## Code Style
- Comments forbidden in code except Swagger JSDoc and strictly necessary annotations. Forbidden tokens: TODO, FIXME, HACK, NOTE, BUG, XXX, commented-out code.
- Technical English for variable names, functions, files, tests, and system messages.
- No inline CSS/JS in API documentation examples or responses.
- Never version secrets or credentials; use `/etc/node-backend.env`.

## Quick References
- Envelopes: `src/utils/responseBuilder.js`
- Pagination: `src/utils/pagination.js`
- Internal access: `src/middleware/accessKey.js`
- Monitoring: `src/middleware/monitoring.js`
- OpenAPI spec: `config/swagger.config.js`
