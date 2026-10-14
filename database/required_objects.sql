-- =============================================================================
-- Ethnos_API — required database objects (operator-side DDL contract)
-- =============================================================================
-- The API is strict consumer-only: it NEVER executes this file. This is the
-- single, canonical record of the schema changes the API needs from the
-- operator pipeline. It replaces the former per-request `calls/` log.
--
-- Workflow:
--   1. Operator reviews and applies the statements below against `data`.
--   2. Operator regenerates the schema snapshot:
--        mysqldump -d --routines --events --order-by-primary --single-transaction \
--          --compact --skip-comments --skip-tz-utc --default-character-set=utf8mb4 \
--          data > backups/data.schema.$(date +%Y-%m-%d).sql   (a same-day re-dump may
--          carry a _HH-MM suffix, e.g. data.schema.2026-10-14_00-40.sql)
--   3. The API is updated to consult the new snapshot.
--
-- Statements are idempotent. Empty a section once the operator confirms it is
-- applied.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PENDING (2026-07-22, P3): optional denormalization for expensive metric fields.
-- OPTIONAL — the API serves 0 for these without them. Apply only if wanted.
-- -----------------------------------------------------------------------------

-- (metrics) /metrics/venues.unique_authors and open_access_works are served as 0
--     (per-venue distinct-author / OA-publication counts are unbounded at request
--     time). These need operator-maintained denormalized venue-level columns
--     (unique_authors_count / open_access_works_count) refreshed on the stats
--     cadence. Left as 0 until provided; not blocking.

-- -----------------------------------------------------------------------------
-- PENDING (2026-10-14, full API review): optional redundant-index cleanup.
-- OPTIONAL — no API query depends on any of these indexes. Each one duplicates
-- an index that serves every lookup it could serve, and only costs a second
-- B-tree maintained on every write. No routine in the 2026-10-14 snapshot
-- names them; drop one only if no pipeline query outside the database names it
-- in an index hint (FORCE/USE INDEX). Dropping a secondary index is in place.
-- -----------------------------------------------------------------------------

-- (venues) idx_eissn (eissn) duplicates UNIQUE KEY `eissn` (eissn).
ALTER TABLE venues DROP INDEX IF EXISTS idx_eissn;

-- (persons) idx_persons_preferred_name duplicates UNIQUE uq_preferred_name;
--     idx_family_name (family_name) is the prefix of idx_persons_family_given.
ALTER TABLE persons DROP INDEX IF EXISTS idx_persons_preferred_name;
ALTER TABLE persons DROP INDEX IF EXISTS idx_family_name;

-- (signatures) idx_signatures_signature (signature) and idx_signature_search
--     (signature(20)) both duplicate UNIQUE uq_signature (signature).
ALTER TABLE signatures DROP INDEX IF EXISTS idx_signatures_signature;
ALTER TABLE signatures DROP INDEX IF EXISTS idx_signature_search;

-- (work_subjects) idx_subject (subject_id) is the prefix of
--     idx_work_subjects_subject_work (subject_id, work_id), which also backs the
--     subject_id foreign key. Beyond being redundant it is harmful: with both
--     present MariaDB picks an index_merge intersection of the two for any
--     subject query that reads a non-indexed column (3.7 s on subject 341907).
ALTER TABLE work_subjects DROP INDEX IF EXISTS idx_subject;

-- -----------------------------------------------------------------------------
-- PENDING (2026-10-14, full API review): read-only database account.
-- RECOMMENDED. The API connects as `dev`, which holds GRANT ALL PRIVILEGES ON
-- *.* WITH GRANT OPTION on the replication master; the consumer-only contract is
-- enforced by convention alone. The operator should create a SELECT-only account
-- for the API (and the Manticore indexer source), set its password in
-- /etc/node-backend.env (DB_USER / DB_PASSWORD) and render the Manticore config
-- again. The statements need a secret, so they are described rather than listed:
--   CREATE USER 'ethnos_api_ro'@'localhost' IDENTIFIED BY '<secret>';
--   GRANT SELECT ON data.* TO 'ethnos_api_ro'@'localhost';
-- /etc/node-backend.env should also be chmod 640 (it is 0655 today, readable by
-- every local account, and holds the database password and eight API keys).

-- Audit result recorded for the next reader: no API endpoint needs a new index.
-- Every slow path found in the 2026-10-14 review (venue detail 4.9 s, works and
-- publications filter+sort 503s, collaboration rankings, signature search,
-- subject works) was a query-shape defect fixed API-side. A (total_score DESC,
-- name) index on venues would make the default /venues sort index-ordered, but
-- the narrow id-selection already answers in ~0.2 s uncached on a cached
-- listing, so it is not requested.

-- Previously applied (recorded in backups/data.schema.<date>.sql):
--   * metrics_annual_summary (PK year; total_publications, unique_works,
--     open_access_count, articles, books, avg_citations, unique_organizations,
--     refreshed_at), refreshed on the stats cadence over publications. Applied
--     2026-07-23: 273 year rows populated with real unique_organizations and
--     avg_citations. /metrics/annual now reads it directly (single indexed read,
--     sub-second) with a transparent fallback to the live publications aggregation
--     when absent, and applies its own 1000..YEAR(CURDATE())+1 year clamp on read.
--     Note: works.download_count is universally unpopulated, so total_downloads is
--     NOT computed anywhere and was removed from the /metrics/annual response
--     (rather than served as a misleading 0).
--   * works.latest_publication_year + idx_works_latest_pub_year, maintained by
--     sp_refresh_works_publication_years.
--   * subjects.total_works (INT, denormalized COUNT(DISTINCT ws.work_id) per
--     subject) + idx_subjects_total_works, maintained by
--     sp_refresh_subjects_total_works_simple. Applied 2026-07-21: 168,815 of
--     169,159 subjects populated. Backs /subjects/statistics work-linkage stats
--     and the works_count on /subjects/{id}, /subjects/{id}/children,
--     /subjects/{id}/hierarchy without the 15.8M-row work_subjects join.
--   * idx_works_reference_count (works.reference_count), backing the indexed
--     ORDER BY on /works?sort_by=references_count. Applied 2026-07-21.
--   * publications.citation_count + publications.reference_count (INT, mirror of
--     the parent work's works.citation_count / reference_count) + idx_citation /
--     idx_reference, populated by sp_populate_references_counts. Applied 2026-07-22
--     (1.85M rows). Backs the index-friendly ORDER BY p.citation_count /
--     p.reference_count and the p.citation_count cited_by_min/max filter on
--     /publications, so those sorts/filters no longer join works or degrade.
