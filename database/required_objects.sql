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
--          data > backups/data.schema.$(date +%Y-%m-%d).sql
--   3. The API is updated to consult the new snapshot.
--
-- Statements are idempotent. Empty a section once the operator confirms it is
-- applied.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PENDING (2026-07-21): denormalized subject work-count + works.reference_count index
-- -----------------------------------------------------------------------------
-- Rationale: the request-time join subjects -> work_subjects (15.8M rows) cannot
-- compute subject work-linkage statistics within the statement budget (measured
-- 8-30 s). The API now serves /subjects/statistics from subjects-only structural
-- data and marks work-linkage stats unavailable. Add an operator-maintained
-- denormalized count so the API can surface subjects_with_works / top_subjects /
-- per-vocabulary works_count instantly, exactly like organizations.publication_count
-- and venues.works_count.

ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS total_works INT NOT NULL DEFAULT 0;

ALTER TABLE subjects
  ADD INDEX IF NOT EXISTS idx_subjects_total_works (total_works);

-- Maintenance (operator-owned, on the stat-refresh cadence): set
--   subjects.total_works = (SELECT COUNT(DISTINCT ws.work_id)
--                           FROM work_subjects ws WHERE ws.subject_id = subjects.id)
-- Chunk over subjects.id ranges; NULL-safe change guard; no full-table temp table.

-- Backs the indexed ORDER BY works.reference_count on /works?sort_by=references_count
-- (currently a full-table type=ALL filesort over ~4.7M rows). Mirrors the existing
-- idx_works_citation_count that already backs sort_by=cited_by_count.

ALTER TABLE works
  ADD INDEX IF NOT EXISTS idx_works_reference_count (reference_count);

-- Previously applied (recorded in backups/data.schema.<date>.sql): the works
-- publication-year denormalization `works.latest_publication_year` +
-- `idx_works_latest_pub_year`, maintained by `sp_refresh_works_publication_years`.
