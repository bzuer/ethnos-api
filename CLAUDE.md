# Ethnos_API — Project Instructions

Academic bibliographic system API built with Node.js/Express, backed by MariaDB. Full-text search for `works` and `persons` runs against a **Manticore Search** daemon (SphinxQL on `127.0.0.1:9306`) that indexes straight from the base tables; `venues`, `subjects`, and `organizations` keep their single-column MariaDB FULLTEXT indexes. There is no `summary_*` denormalized layer. The search backend is chosen by `SEARCH_BACKEND` (`manticore` | `mariadb`, default `mariadb`); the MariaDB FULLTEXT path for works/persons is retained as a flag-gated fallback during the transition. Manticore is not a separate endpoint — it powers `/works`, `/publications`, `/search/*`, `/persons`, and autocomplete.

## Runtime and Execution
- Runtime: Node.js (>= 18). Framework: Express. Entry points: `src/app.js` (HTTP), `src/https-app.js` (HTTPS).
- Runtime env: `/etc/node-backend.env` is the single source of truth. Never version secrets or credentials.
- API runtime port: `1211` (production and development).
- Test ports: `3000` is the in-process default when `NODE_ENV=test`; integration tests target `1210` via `INTEGRATION_BASE_URL`, so a temporary instance on `PORT=1210` is the expected target. Never touch the live `1211` when validating changes.
- Development: `npm run dev`. Build: `npm run build`. Production: systemd user service `ethnos-api.service` via `systemctl --user`; `server.sh` is the legacy fallback (PM2/nohup).
- Systemd setup: `scripts/manage.sh systemd:install` installs the user unit to `~/.config/systemd/user/`. No sudo required.

## Database
- **Strict consumer-only.** This project NEVER creates, executes, or alters database procedures, events, triggers, indexes, table structures, or row data. It only issues read-side `SELECT` / `EXISTS` queries. Any structural change (DDL, `CREATE`/`ALTER`/`DROP PROCEDURE`/`EVENT`/`TRIGGER`/`TABLE`/`INDEX`, `INSERT`/`UPDATE`/`DELETE`, `CALL`, `TRUNCATE`) must be **requested from the user** and applied via a separate operations pipeline. Read-only utilities (`mariadb-dump --no-data`, `SELECT … FROM information_schema.*`, baseline asserts) are allowed.
- **Where to file requests.** Every change the application needs from the operator goes into `calls/` as **its own dated file** (`calls/YYYY-MM-DD_<slug>.md` or `.sql`), one request per file, dated with the day the request was filed. Do **not** append to an older file — a request filed in May does not belong inside an April log. Use the Status / Why / Current state / Proposed change / Verification / Rollback template.
- Database name: `data`. Direct access: `mariadb data` or `mariadb data -e "..."`.
- Topology: 22 base tables, 0 views, 2 functions, 42 stored procedures, 5 triggers. Three procedures are slated for removal once Manticore is permanent: `sp_build_summary_venues` (broken leftover — `calls/2026-06-11_drop_broken_sp_build_summary_venues.md`), `sp_refresh_works_search` and `sp_refresh_work_search_fields` (`calls/2026-06-11_retire_works_fulltext_denormalization.md`). **No `summary_*` table exists**: `summary_publications`, `summary_persons`, `summary_venues` were dissolved in `calls/2026-05-23_dissolve_all_summaries.md`. Works/persons full-text now lives in Manticore; the MariaDB `works.authors_search` / `works.subjects_search` columns and the three `works` FULLTEXT indexes are the transitional fallback and are slated for removal. `venues` keeps `ft_venues_search`; `subjects`/`organizations` keep `ft_subjects_term`/`ft_organizations_name`.
- Schema files:
  - `database/data.schema.sql` — current production schema dump (tables, routines, triggers). Regenerated via `./scripts/maintenance/publications/regenerate_schema_dump.sh data database/data.schema.sql`.
  - `database/schema.sql` — reference schema (kept for historical diff; not regenerated).
  - `data_dev.schema.sql` (root level) — development snapshot with data; not versioned.

### Base-table architecture
The read path consults six core tables directly:
- `works` — the parent of search. Carries `title`, `subtitle`, `abstract`, `work_type`, `language`, `citation_count`, `reference_count`, `download_count`, `view_count`, `altmetric_score`, `social_media_mentions`, `news_mentions`, `metrics_last_updated`, plus the two generated columns `title_normalized` and `full_title_normalized` (lower-cased title + subtitle capped at 255 chars) and the two operator-maintained text columns `authors_search` (GROUP_CONCAT of `persons.preferred_name` per work) and `subjects_search` (GROUP_CONCAT of `subjects.term` per work). Three FULLTEXT indexes are pinned on `works`:
  - `ft_works_content (full_title_normalized, subjects_search)` — drives free-text `q` lookups.
  - `ft_works_metadata (authors_search, subjects_search)` — drives `author` and `subject` filter matches.
  - `ft_works_authors_content (full_title_normalized, authors_search, subjects_search)` — combined index reserved for paths that want title+author+subject relevance in a single MATCH.
- `publications` — one row per published instance of a work. Carries `work_id`, `venue_id`, `publisher_id`, `doi (UQ)`, `publication_date`, `volume`, `issue`, `pages`, `open_access`, `peer_reviewed`, `source`, `license_url`, `license_version`, the generated `year` column, and 17 identifier columns (`isbn`, `arxiv`, `pmid`, `pmcid`, `wos_id`, `handle`, `wikidata_id`, `openalex_id`, `scielo_pid`, `openlibrary_id`, `asin`, `google_book_id`, `mag_id`, `ddc`, `lcc`, `udc`, `lbc`). The supporting indexes (`idx_publications_work_year`, `idx_publications_venue_year_oa`, `idx_publications_work_year_id`, `idx_publications_publisher_year`, `idx_publications_year`) cover every listing predicate the API issues.
- `venues` — the venue-level entity. Owns `name`, `abbreviated_name`, `type`, `publisher_id`, `country_code`, `lang`, `issn`, `eissn`, `homepage_url`, `aggregation_type`, `open_access`, `is_in_doaj`, `is_in_scielo`, `is_indexed_in_scopus`, `cited_by_count`, `impact_factor`, `citescore`, `sjr`, `snip`, `h_index`, `i10_index`, `2yr_mean_citedness`, `coverage_start_year`, `coverage_end_year`, the identifier surface (`scopus_id`, `wikidata_id`, `openalex_id`, `scielo_id`), the ranking columns (`total_score`, `subject_score`, `oa_score`, `authorship_score`, `affiliation_score`, `citation_score`, `llm_score`, `llm_relevance`, `llm_justification`), and the `validation_status`/`last_validated_at` audit pair. `FULLTEXT ft_venues_search (name, abbreviated_name)` covers venue lookups.
- `persons` — the researcher entity. Owns `preferred_name`, `family_name`, `given_names`, `signature_id`, `orcid`, `scopus_id`, `lattes_id`, the metric block (`total_works`, `total_citations`, `h_index`, `first_publication_year`, `latest_publication_year`, `corresponding_author_count`, `is_verified`), plus `FULLTEXT ft_persons_names (preferred_name, given_names, family_name)`.
- `subjects` — controlled-vocabulary terms. `FULLTEXT ft_subjects_term (term)` available for free-text term search.
- `organizations` — institutions, publishers, funders. `FULLTEXT ft_organizations_name (name)` available for institution lookups.

### Operator-side maintenance
- The application is consumer-only; the operator pipeline owns every write. After mutations to `authorships` / `work_subjects` / `persons` / `subjects`, the operator calls `sp_refresh_work_search_fields(p_work_id)` to recompute `works.authors_search` and `works.subjects_search` for the affected work. The FULLTEXT indexes (`ft_works_content`, `ft_works_metadata`, `ft_works_authors_content`, `ft_venues_search`) update in-place with the row — no rebuild step is required on the API side.
- `sp_refresh_persons_stats`, `sp_update_person_stats`, `sp_update_person_h_index`, `sp_update_venue_stats`, `sp_update_organization_stats`, `sp_update_core_statistics`, `sp_compute_publication_relevance`, `sp_calculate_venue_ranking`, `sp_resolve_pending_references`, and the references-consistency procedures remain on the operator side and keep the metric columns on `works` / `persons` / `venues` / `organizations` current. The API never calls these.
- Legacy artefacts explicitly absent (do not reintroduce): `summary_publications`, `summary_persons`, `summary_venues`, `sp_build_summary_*`, `sp_append_summary_*`, `sp_orchestrate_*`, `sp_refresh_summary_publications_for_work`, `sp_sync_summary_publication_files`, `ft_summary_pubs_content`, `ft_summary_pubs_metadata`, `ft_summary_venues_text`, `ft_summary_persons_text`, `sphinx_works_summary`, `sphinx_venues_summary`, `sphinx_persons_summary`, `work_author_summary`, `work_subjects_summary`, `sphinx_queue`, `processing_log`, `person_match_log`, `staging_*`, `temp_*`, the four dormant `v_*` views, and any Sphinx runtime artefact (`publications_poc`, `publications_rt`, `persons_poc`, `venues_poc`, the `searchd` daemon, `sphinx-unified.conf`, `/var/lib/ethnos-api/sphinx`, `realTimeIndexing.service`, `sphinx*.service`).

### Schema contracts on the read path
- Citations / references: use the unified `work_references` table (`status`: `PENDING|RESOLVED|FAILED`). `RESOLVED` means the cited work exists in DB; `PENDING` means it does not yet (expected state, not an error). Never rely on legacy `citations` or `unresolved_citations`.
- Person-signature relation: direct via `persons.signature_id`. Do not use legacy `persons_signatures`.
- Publication-file relation: direct in `files` via `publication_id` (`file_role` distinguishes roles). The legacy `files.work_id` column was dropped — never reintroduce a parallel work-level path; always join through `publications.work_id` when a work-scoped query is needed. Legacy `publication_files` is also gone.
- Work-level metric columns: `works.citation_count` (incoming citations), `works.reference_count` (outgoing references), `works.download_count`, `works.view_count`, `works.altmetric_score`, `works.social_media_mentions`, `works.news_mentions`. These supersede the dissolved `summary_publications.work_citation_count` / `work_reference_count` aliases.
- Per-publication hydration: every endpoint that needs a list of authors / subjects / files derives them with a follow-up JOIN — authors via `authorships INNER JOIN persons`, subjects via `work_subjects INNER JOIN subjects`, files via the `files` base table keyed by `publication_id`. No `authors_json` / `subjects_json` / `files_json` cache column exists.

## Project Structure
- `src/routes/` — 18 route modules (includes `publications`).
- `src/controllers/` — 14 controllers (includes `publications`).
- `src/services/` — 18 services (adds `searchEngine`; includes `publications`, `search`, `autocomplete`, `cache`, `homepageStats`).
- `src/dto/` — 14 DTOs + `helpers.js` (work, publication, person, organization, venue, bibliography, citations, collaborations, course, dashboard, instructor, metrics, signatures, subjects).
- `src/middleware/` — 9 middleware modules (accessKey, errorHandler, monitoring, pagination, rateLimiting, responseFormatter, sanitization, timeout, validation).
- `src/utils/` — `responseBuilder.js`, `pagination.js`, `db.js`.
- `src/models/` — Sequelize model definitions.
- `src/config/` — `database.js`, `redis.js`, `manticore.js`.
- `config/` — `swagger.config.js`, `manticore.conf` (secret-free Manticore index template; deployed via `scripts/manticore/render-config.sh`).
- `scripts/` — `manage.sh`, `process.sh`, `generate-swagger.js`, `clean_ram.sh`, `maintenance/publications/` (migration SQL + `RUN_ORDER.md` + `regenerate_schema_dump.sh`), `manticore/` (`render-config.sh` + `reindex.sh`), `systemd/ethnos-api.service`.
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
- On JOIN-heavy listings (`/works`, `/search/works`, `/publications`), `pagination.total` is best-effort: the count uses a 2 s server-side budget (`SET STATEMENT max_statement_time`). When the budget fires, the response falls back to an estimate and sets `meta.pagination_total_exact = false`. Clients that need an exact count must detect that flag (and/or rely on the `data.length < limit` terminator on the last page).

## Security and Internal Access
- **The API is open by default — no key required.** The blanket `globalAccessKeyGuard` was removed from `src/app.js`; every data and metrics endpoint (`/`, `/works`, `/publications`, `/persons`, `/venues`, `/institutions`, `/search/*`, `/subjects`, `/signatures`, `/courses`, `/instructors`, `/bibliographies`, `/metrics/*`, citations, collaborations, the DOI resolver regex) is reachable without any header. Unauthenticated traffic is governed by the rate limiter, not by a key check.
- **Endpoints that still require `X-Access-Key`** keep their own per-route guard: `/dashboard/*` and the internal health probes `/health/readiness` + `/health/metrics` use `requireInternalAccessKey`; `/security/*` uses a dedicated `createAccessKeyGuard`. These reject with 401 when the key is missing or invalid. `/health/liveness`, `/docs*`, and the OpenAPI documents stay public.
- **The key is an optional rate-limit bypass on the open endpoints.** Header aliases (case-insensitive): `x-access-key`, `x-internal-key`, `x-api-key`. Query-string aliases: `access_key`, `accessKey`, `api_key`. Supplying any accepted value lifts the per-minute cap for that request.
- **Rate limiting is enabled by default** (`RATE_LIMIT_DISABLED` defaults to `false`; set it to `true` to disable). Unauthenticated requests are capped at `RATE_LIMIT_GENERAL` (default **120/min per IP**, window `RATE_LIMIT_WINDOW_MS`, default 60s) across `generalLimiter` / `searchLimiter` / `metricsLimiter` / `relationalLimiter` / `speedLimiter`; requests over the cap get 429. `shouldSkipRateLimit` in `src/middleware/rateLimiting.js` exempts localhost (`isLocalRequest`) and any request carrying a valid key (`hasValidAccessKey`), so keyed traffic is effectively unlimited.
- **Multiple keys are accepted.** `requireInternalAccessKey` / `hasValidAccessKey` collect values from every configured env var and accept any match: `API_KEY`, `INTERNAL_ACCESS_KEY`, `SECURITY_ACCESS_KEY`, `API_ACCESS_KEY`, `ETHNOS_API_KEY`, `ETHNOS_API_ACCESS_KEY`, `API_SECRET_KEY`, `ETHNOS_API_KEY_2`. Add more keys by setting additional env vars on the same list.
- Middleware: `src/middleware/accessKey.js` exports `requireInternalAccessKey`, `createAccessKeyGuard`, `hasValidAccessKey`, and `DEFAULT_ACCEPTED_ENV_VARS`.
- OpenAPI declares `securitySchemes.XAccessKey` and applies it globally as **optional** via the top-level `security: [{}, { XAccessKey: [] }]`. The still-gated operations (`/dashboard/*`, `/security/*`, `/health/readiness`, `/health/metrics`) override per-operation with `security: [{ XAccessKey: [] }]` to mark the key required; `/health/liveness` opts fully out with `security: []`.
- Do not expose keys or sensitive data in responses, logs, or error payloads.

## Route Standards
- Plural collections: `/bibliographies`, `/institutions`, `/publications`, `/works`, `/persons`, `/venues`, `/courses`, `/instructors`, `/subjects`, `/signatures`.
- Health probes: `/health/liveness`, `/health/readiness`, `/health/metrics`.
- Venue payloads expose `abbreviated_name` alongside `name` (or `venue_abbreviated_name` alongside `venue_name`). Both must appear together when either is exposed.
- All optional query params use `optional({ values: 'falsy' })` so empty strings (`param=`) are treated as absent. Controllers normalize empty-string params to `undefined` before passing to services (avoid treating `""` as `false` for booleans).

### Citation filters on work/publication listings
- Every listing that surfaces works or publications accepts `cited_by_min`, `cited_by_max`, `sort_by`, and `sort_order` on top of the endpoint-specific filters. The legacy aliases `citation_count_min` / `citation_count_max` (and the `sortBy` / `sortOrder` casings) are also honoured.
- `cited_by_min` / `cited_by_max` are inclusive bounds against `works.citation_count` (the incoming citation count at the work level). Empty or invalid values are ignored.
- `sort_by` accepts `cited_by_count` (surfaces the most cited works first), `references_count`, `publication_year`, `id`, and — where applicable — `relevance`. `sort_order` is `DESC` by default (numeric fields) and accepts `ASC` / `DESC`. When `sort_by` is omitted, the previous defaults stand: `publication_year DESC, id DESC` on DB-backed listings and relevance on FULLTEXT paths.
- Endpoints wired: `/works`, `/works/showcase`, `/publications`, `/search/works`, `/search/advanced`, `/persons/{id}/works`, `/venues/{id}/works`. All paths translate the citation bounds to `w.citation_count >= ?` / `w.citation_count <= ?` clauses against `works`.
- List items expose `cited_by_count` and `references_count` directly (work listings) or `citation_count` / `reference_count` (publication listings); `/persons/{id}/works` and `/venues/{id}/works` join `works` so the same `cited_by_count` surfaces on every row.

### Works endpoints
- Listings: `/works`, `/works/showcase`, `/search/works`, `/search/advanced`. Filters apply with `meta.match_mode = "any_publication"` — a work appears if **any of its publications** matches, and the displayed publication is the latest matching one. List items expose the latest `publication_id` and total `publications_count` for direct navigation to `/publications/{publication_id}` without a detail fetch.
- Free-text `q` uses `MATCH(w.full_title_normalized, w.subjects_search) AGAINST (? IN BOOLEAN MODE)` against `ft_works_content`. The `author` and `subject` filters use `MATCH(w.authors_search, w.subjects_search) AGAINST (? IN BOOLEAN MODE)` against `ft_works_metadata` with every token of every filter forced to required (`+token1 +token2 …`). Joining the filter values with a plain space in BOOLEAN MODE would treat them as OR and return tens of thousands of false positives; the per-token `+` prefix collapses that to the actual matches. The `venue_name` filter switches the venue JOIN to `INNER JOIN venues v` and adds `MATCH(v.name, v.abbreviated_name) AGAINST (? IN BOOLEAN MODE)` against `ft_venues_search`.
- Detail: `/works/{id}` embeds `publications[]` (full per-publication entries with their own `identifiers`, `venue`, `publisher`, `files`, `_links.self`, plus an `is_primary` boolean flagging the work's primary publication), `publications_total`, `publications_has_more`. The legacy single `publication` / `publisher` / `licenses` blocks remain removed. Aggregated `identifiers` (union over every publication) remains.
  - Live `files` JOIN. `/works/{id}` and `/publications/{id}` always read the `files` base table directly: `_getCompleteWorkData` runs a bounded `SELECT … FROM files WHERE publication_id IN (…) LIMIT 500` (aliased so the row shape matches `mapFiles` — `file_format AS format`, `file_size AS size`, `file_role AS role`, `verification_status AS verification`, `download_count AS downloads`), groups by `publication_id`, and feeds `files_json` / `has_files` / `has_scimag_file` / `has_libgen_file` into the DTO. `/publications/{id}` does the same with `LIMIT 200`. If the live JOIN throws the service logs and continues with an empty file list (graceful degradation).
  - Work-level aggregations surfaced at the top level: `primary_publication_id`, a compact `primary_publication` block (id / doi / publication_year / publication_date / volume / issue / pages / venue / publisher / source / license / has_files / open_access / peer_reviewed / `_links.self`), convenience flags `publication_year` / `doi` / `open_access` / `peer_reviewed` / `has_files` / `venue` (all derived from the primary), a `year_range` block (`earliest` / `latest`), a `languages[]` distinct list, and `summary_updated_at` (ISO of `works.metrics_last_updated`). Primary picker: latest `publication_year` DESC → `has_files` DESC → `publication_id` DESC.
  - `files[]` is a flat work-level aggregation of every publication's live files, capped at 50, sorted by role priority (MAIN > SUPPLEMENT > COVER > PREVIEW) then verification (VERIFIED first) then `publication_id` DESC. Each entry carries the parent `publication_id` along with `file_id` / `md5` / `format` / `size` / `pages` / `language` / `role` / `version` / `libgen_id` / `scimag_id` / `openacess_id` / `best_oa_url` / `verification` / `download_count`.
  - `file_summary` reports `files_returned`, `files_total`, `files_truncated`, `publications_with_files`, `total_download_count`, `best_oa_url`, `by_format`, `by_role`, plus `has_scimag` / `has_libgen` / `has_open_access` rollups.
  - `venues[]` is a distinct-venue roll-up (one entry per `venue_id`) carrying `publication_count` and `latest_year`, ordered by publication_count DESC, latest_year DESC.
  - `metrics` is extended with `publications_count`, `publications_with_files_count`, `publications_open_access_count`, `publications_peer_reviewed_count`, `distinct_venues_count`, `total_files_count`, `total_files_download_count`, and `metrics_last_updated`.
  - Cache key: `work:v5:{id}:c{0|1}:r{0|1}` (was `work:v4:*`) — bumped when the dissolve switch landed so stale summary-shaped payloads no longer get served from Redis. `/publications/{id}` cache key bumped to `publication:{id}:v3:*` for the same reason.

### Publications endpoints
- `/publications` and `/publications/{id}` are backed by `publications p INNER JOIN works w` + `LEFT JOIN venues v` + `LEFT JOIN organizations publisher`. Free-text queries (`q`) use `MATCH(w.full_title_normalized, w.subjects_search) AGAINST (? IN BOOLEAN MODE)` against `ft_works_content`; metadata filters (`venue` / `author` / `subject`) use `MATCH(w.authors_search, w.subjects_search) AGAINST (? IN BOOLEAN MODE)` against `ft_works_metadata` for the author/subject AND semantics, and `MATCH(v.name, v.abbreviated_name) AGAINST (? IN BOOLEAN MODE)` against `ft_venues_search` for the venue filter (which also flips the venue join to `INNER JOIN`). Filter-only paths (`language`, `year_from`/`year_to`, `type`, `open_access`, `peer_reviewed`, `has_files`, `venue_id`, `publisher_id`, `work_id`, `doi`) hit MariaDB B-tree indexes directly. `has_files` is enforced with `EXISTS (SELECT 1 FROM files f WHERE f.publication_id = p.id)`. The response always surfaces `meta.engine = "MariaDB"`. List rows expose `source`, `license_url`, `license_version` on every entry; `venue` carries `type / issn / eissn / scopus_id / wikidata_id / openalex_id` and `publisher` hydrates from `organizations`. Detail responses embed `work`, `siblings[]`, `files[]`, optional `citations` / `references`.
- DOI resolution: `/{doi}`, `/doi.org/{doi}`, `/https://doi.org/{doi}` resolve a DOI to a publication via `publications.doi (UNIQUE)` and return the publication-shaped payload with the parent `work` block embedded. Regex route is wired in `src/app.js` and handled by `publicationsController.getPublicationByDoi`.

### Venues endpoints
- `/venues`, `/venues/{id}`, `/venues/{id}/works`, `/venues/search`, `/venues/statistics` are backed by `venues v LEFT JOIN organizations pub ON pub.id = v.publisher_id`. Top subjects come from `venue_subjects + subjects` (ordered by `vs.score DESC, s.term ASC`, capped at 5 in list responses / 10 on detail). `/venues/search` runs a LIKE-based search across `v.name`, `v.abbreviated_name`, `v.issn`, `v.eissn`, and `pub.name`, ordered by `total_score DESC`.
- List `sortBy` accepts `id|name|type|impact_factor|works_count|h_index|cited_by_count|score|ranking|coverage_start_year|coverage_end_year|oldest|newest`. Default is `score` (`venues.total_score`) in `DESC` order so the most important venues surface first; numeric/ranking fields default to `DESC`, while `id`, `name`, `type`, `coverage_start_year`, and `oldest` default to `ASC`; `coverage_end_year` and `newest` default to `DESC`. `oldest` / `newest` are aliases for `coverage_start_year` / `coverage_end_year`. Rows with NULL coverage years are always pushed to the tail regardless of direction. When the primary sort is not `score`/`ranking`, `COALESCE(v.total_score, 0) DESC` is appended as the tiebreaker so total_score still governs ordering whenever the primary key ties; `v.name ASC` is the final tiebreaker. `/venues/search` orders by `COALESCE(v.total_score, 0) DESC, v.name ASC` on every call so the most important matches surface first. The `meta.sort` block on the listing response always reports the effective `{ by, order }` pair so clients can verify the contract.
- Coverage year filters on `/venues`: `coverage_from` / `coverage_to` bound the range (`coverage_start_year >= coverage_from` and `coverage_end_year <= coverage_to`), `coverage_start_from` / `coverage_start_to` / `coverage_end_from` / `coverage_end_to` apply inclusive bounds to the individual endpoints, and `active_in_year` keeps only venues whose coverage range encloses the supplied year (`coverage_start_year <= year <= coverage_end_year`).
- Payload surfaces are grouped into four dedicated blocks to keep the shape scannable:
  - `identifiers`: `issn`, `eissn`, `scopus_id`, `wikidata_id`, `openalex_id`, `scielo_id`. These fields are NOT repeated at the top level.
  - `indexing`: `is_in_doaj`, `is_in_scielo`, `is_indexed_in_scopus`, `validation_status`.
  - `metrics`: `impact_factor`, `citescore`, `sjr`, `snip`, `h_index`, `i10_index`, `two_yr_mean_citedness`.
  - `ranking`: `score` (= `venues.total_score`), `components.{subject|snip|oa|authorship|affiliation|citation|llm}`, `llm.{relevance|justification}`. The legacy top-level `global_ranking_score` and `score_breakdown` envelopes remain removed.
- A single `subjects[]` array carries the top subjects (capped at the top 10 on detail, `{subject_id, term, score, vocabulary, lang}`). The redundant `terms[]`, `keywords[]`, `top_subjects[]` and `legacy_metrics` blocks remain removed.
- Core surface also includes `publisher`, `coverage_start_year` / `coverage_end_year`, `works_count`, `cited_by_count`, `open_access`, `aggregation_type`, `country_code`, `homepage_url`. Detail additionally embeds `publication_summary.publication_trend`, `yearly_stats`, `top_authors`, `top_publications`, `recent_works` and the timestamp fields (`created_at`, `updated_at`, `last_validated_at`, `summary_updated_at`).
- Include flags on the detail endpoint: `include_subjects`, `include_yearly`, `include_top_authors`, `include_recent_works` (all default `true`).
- Cache keys: list `venues:list:v5:...`, detail `venue:v4:{id}:{include_flags}`, search `venues:search:v3:...`. `mag_id` is never exposed — OpenAlex IDs already encode the same identifier.
- The listing `meta.source` reports `"venues"` (was `"summary_venues"` before the dissolve).

### Search endpoints
- `/search/works`, `/search/advanced`: `q` is optional; filter-only queries (e.g. `venue=mana`) are supported. The metadata-filter AND semantics described under [Works endpoints](#works-endpoints) apply (`+token1 +token2 …` BOOLEAN MODE against `ft_works_metadata`).
- `/search/global`, `/search/persons`, `/search/autocomplete`, `/search/popular`, `/search/health`.
- `/search/autocomplete` honours the `{ suggestions, type, count, query, generated_at }` envelope. The service runs `MATCH(w.full_title_normalized, w.subjects_search) AGAINST (:q IN BOOLEAN MODE)` against `ft_works_content` to discover candidate work ids, then derives title / author / venue suggestions via `works` / `authorships+persons` / `publications+venues` lookups. It returns an empty suggestions list if the FT path fails — it never surfaces `{ error: … }` inside a `status: success` payload.

### Metrics and dashboard
- Bibliometric metrics: `/metrics/annual` (publications + works rolled up by year), `/metrics/venues` (ordered by `venues.works_count`), `/metrics/institutions` (authorships + organizations), `/metrics/persons` (persons base table directly, ordered by `total_works DESC, total_citations DESC`), `/metrics/collaborations` (authorships self-join over the top 2000 persons by `total_works`).
- Dashboard (access key required): `/dashboard/overview`, `/dashboard/performance`, `/dashboard/search-trends`, `/dashboard/alerts`. The dashboard reports MariaDB-side activity only; the legacy `sphinx*` runtime counters are gone.

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
  - `npm test` — fast unit suite (`tests/api.endpoints.test.js`). Mocks the service layer via `stubResolved` / `stubMethod`, validates route wiring and DTO shape. Runs in <1 s.
  - `npm run test:integration` — integration smoke (`tests/integration.smoke.test.js`). Hits the running API at `INTEGRATION_BASE_URL` (default `http://localhost:1210`) through the full HTTP stack and real MariaDB. Requires the API to be up. Metrics endpoints are covered only when `INTEGRATION_ACCESS_KEY` is set (skipped otherwise). Catches SQL regressions that the mock-only unit suite cannot see.
  - `npm run test:watch`, `npm run test:coverage` — variants of the unit suite.
- Test helpers in `tests/helpers/` (auth, expectations, http-client, mock-express, router-invoke, test-app).
- `tests/disabled/` holds signatures and subjects suites that stay off the runner.
- The per-domain `tests/*.test.js` files (bibliography, citations, collaborations, courses, health, instructors, organizations, persons, search, venues, works) are reference fixtures authored in Jest style; they are not executed by the current Node-runner scripts. Do not treat them as a live safety net.
- When changing behavior, prefer updating `tests/api.endpoints.test.js`. SQL contract changes should land with at least one smoke assertion in `tests/integration.smoke.test.js`.

## Search Engine
- **Manticore Search** (25.0.0, SphinxQL on `127.0.0.1:9306`, accessed via `mysql2` with `database: 'Manticore'`, `ssl: false`) powers full-text search for `works` and `persons`. Selected by `SEARCH_BACKEND` (`manticore` | `mariadb`; default `mariadb`). When `manticore`, `works`/`publications`/`autocomplete`/`persons` services resolve matches + relevance via Manticore (`src/services/searchEngine.service.js` over `src/config/manticore.js`), then hydrate rows from MariaDB by id. The venue filter on works/publications still resolves through MariaDB `ft_venues_search`.
- **Index design** (`config/manticore.conf`): path mode (no `data_dir`), plain `works_main`/`works_delta` + distributed `works`, and `persons_main`/`persons_delta` + distributed `persons`. The `works` table holds full-text fields title, subtitle, abstract, authors, subjects, venue — authors/subjects/venue concatenated at index time via `sql_joined_field` over `authorships`+`persons`, `work_subjects`+`subjects`, `publications`+`venues` (**no denormalized MariaDB columns**) — plus attributes `work_type`, `language`, `citation_count`, `reference_count`, `min_year`/`max_year`, and MVAs `years`/`oa_flags`/`pr_flags`. Field-restricted MATCH: free-text `q` spans **every text field** `@(title,subtitle,abstract,authors,subjects,venue)` so a bare query also matches author and venue names (a name typed in the main box resolves); the explicit filters stay scoped — `author` → `@authors`, `subject` → `@subjects`, `venue_name` → `@venue`. `/publications` free-text resolves matching work ids from Manticore capped at `MANTICORE_PUBLICATIONS_WORK_CAP` (default 5000; `meta.fulltext_truncated` flags a hit).
- **Relevance ranking** (`src/services/searchEngine.service.js`): when the sort is relevance (the default, i.e. no explicit `sort_by`), works use the blended expression ranker `expr('sum(lcs*user_weight)*1000 + bm25 + min(citation_count,1000)*50')` with `field_weights=(title=10, subtitle=4, abstract=2, authors=6, subjects=4, venue=4)`, so canonical highly-cited works surface ahead of arbitrary recent matches; persons use `expr('sum(lcs*user_weight)*1000 + bm25 + min(total_works,500)*20')` with `field_weights=(preferred_name=10, family_name=6, given_names=4)`. Explicit attribute sorts (`cited_by_count` / `references_count` / `publication_year` / `id`) skip the expression ranker and order by the attribute directly. `COUNT(*)` totals are exact and not bounded by `max_matches`.
- **Morphology** is enabled on the `works` content fields only: `morphology = libstemmer_pt, libstemmer_en` with `morphology_skip_fields = authors, venue`, so `title`/`subtitle`/`abstract`/`subjects` collapse inflected variants (movimento ~ movimentos, ethnography ~ ethnographic) while author and venue names stay verbatim. `persons_*` is unstemmed (names are never stemmed). Morphology is applied at index time, so toggling it requires an operator rebuild of `works_main`/`works_delta` (`calls/2026-06-19_manticore_morphology_reindex.md`).
- **Build/refresh is operator-side** (the API never writes the index): `scripts/manticore/render-config.sh` deploys the config with the DB password from `/etc/node-backend.env`; `scripts/manticore/reindex.sh {init|delta|main}` builds/rotates via `indexer`. Delta = works/persons with `updated_at` in the last 48h (killlist dedups against main); cron rebuilds delta every few minutes and main nightly. The `indexer` `dlopen`s `libmysqlclient.so.21` — it must be symlinked to `libmysqlclient.so.24` (the MariaDB connector `libmariadb.so.3` crashes in joined-field collection). See `calls/2026-06-11_manticore_deploy_and_index.md`.
- **MariaDB FULLTEXT fallback (transitional).** While `SEARCH_BACKEND=mariadb`, works/persons full-text uses `MATCH(...) AGAINST (... IN BOOLEAN MODE)` against `ft_works_content` (title + subjects), `ft_works_metadata` (authors + subjects), `ft_works_authors_content` (title + authors + subjects), and the `works.authors_search`/`subjects_search` columns kept current by `sp_refresh_work_search_fields(p_work_id)` / `sp_refresh_works_search`. These columns, the three `works` FULLTEXT indexes, and the two procedures are slated for removal once Manticore is permanent (`calls/2026-06-11_retire_works_fulltext_denormalization.md`); after that drop, `SEARCH_BACKEND` must stay `manticore`. `ft_persons_names`, `ft_venues_search`, `ft_subjects_term`, `ft_organizations_name` remain on their base tables.
- Sphinx 2.2.11 was displaced by the Manticore package (the `sphinxsearch` engine package, `/etc/sphinxsearch`, and its init scripts are gone). The legacy `/var/lib/ethnos-api/sphinx` directory (≈7.4 GB of orphaned POC indexes) still exists on disk and should be removed manually: `rm -rf /var/lib/ethnos-api/sphinx`.

## Scripts
- `scripts/manage.sh` — unified control script with automatic infrastructure verification.
  - `restart`: stops API → cleans logs/caches → installs deps → generates docs → verifies and fixes MariaDB, Redis, API → validates all.
  - `deploy`: full deploy with test suite. Stops API → clean → deps → docs → tests → start + validate.
  - `start`: verifies all infrastructure (MariaDB, Redis, API), starts/fixes anything missing, validates.
  - `stop`: stops the API service and kills rogue processes on port 1211.
  - `status`: validates all infrastructure and reports (non-destructive).
  - `systemd:install`: installs the user unit to `~/.config/systemd/user/` via `systemctl --user`. No sudo.
  - `test --endpoints` / `test --data`: test suites.
  - Infrastructure checks: MariaDB connectivity, Redis PING (auto-start), API systemd service (auto-install if missing, auto-start if stopped), rogue process cleanup on port 1211.
  - **Agent rule.** Never execute `deploy` automatically; always ask the user.
- `scripts/process.sh` — CI/CD pipeline orchestrator (build / dev / deploy).
- `server.sh` — legacy server management (PM2 or nohup fallback).
- `scripts/generate-swagger.js` — regenerates `docs/swagger.json` and `docs/swagger.yaml`.

## Repository Hygiene
- Ignored: `logs/`, `coverage/`, `venv/`, `backup/`, `database/*.sql` (except `database/schema.sql` and `database/data.schema.sql`), `node_modules/`, `.env*`.
- Tracked folders: `src/`, `config/`, `tests/`, `docs/`, `scripts/`, `database/`, `calls/`.
- `calls/` holds operator-side requests the application has filed (see [Database → Where to file requests](#database)). Its contents are tracked in git.
- `ssl/` is a runtime-only directory for TLS certificates (not tracked; referenced by `src/config/database.js`).
- `runtime/` is reserved for ephemeral process data; it must never carry Sphinx artefacts, RT indexes, or any indexer state (the legacy `searchd` runtime is gone for good).
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
