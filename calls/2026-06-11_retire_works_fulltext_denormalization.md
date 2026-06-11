# Retire the works FULLTEXT denormalization (columns + indexes + refresh procs)

**Filed:** 2026-06-11
**Status:** PENDING (operator) — **destructive**. Execute ONLY after
`calls/2026-06-11_manticore_deploy_and_index.md` is complete and Manticore search is
validated and stable on the live API (`SEARCH_BACKEND=manticore`).

## Why
Manticore now owns `works` full-text search, indexing author and subject text directly
from `authorships`/`persons` and `work_subjects`/`subjects` at index time. The MariaDB
denormalized columns `works.authors_search` and `works.subjects_search`, the three
overlapping FULLTEXT indexes over them, and the two procedures that maintained them are
the exact "multiplication of repeated data" this migration set out to remove. Measured
cost: ~1.6 GB of duplicated text in the two `mediumtext` columns plus ~1.9 GB of
overlapping FULLTEXT index on `works` (the `works` table is 9.8 GB total today).

## Current state
- `works.authors_search` (`mediumtext`) — GROUP_CONCAT of `persons.preferred_name` per work.
- `works.subjects_search` (`mediumtext`) — GROUP_CONCAT of `subjects.term` per work.
- `FULLTEXT ft_works_content (full_title_normalized, subjects_search)`
- `FULLTEXT ft_works_metadata (authors_search, subjects_search)`
- `FULLTEXT ft_works_authors_content (full_title_normalized, authors_search, subjects_search)`
- `PROCEDURE sp_refresh_works_search` (bulk refresh of the two columns)
- `PROCEDURE sp_refresh_work_search_fields(p_work_id)` (single-work refresh)
- Generated columns `title_normalized` / `full_title_normalized` and
  `idx_works_full_title_normalized` are **retained** (cheap generated columns, used outside
  the dropped FULLTEXT path).

## Proposed change
```sql
ALTER TABLE works
  DROP INDEX ft_works_authors_content,
  DROP INDEX ft_works_metadata,
  DROP INDEX ft_works_content,
  DROP COLUMN authors_search,
  DROP COLUMN subjects_search;

DROP PROCEDURE IF EXISTS sp_refresh_works_search;
DROP PROCEDURE IF EXISTS sp_refresh_work_search_fields;

OPTIMIZE TABLE works;
```
Then regenerate the schema dump:
```
./scripts/maintenance/publications/regenerate_schema_dump.sh data database/data.schema.sql
```

After this runs, `SEARCH_BACKEND` must stay `manticore` (the MariaDB FULLTEXT fallback
branches in `works`/`publications`/`autocomplete` services depend on these columns and will
error if reached). A follow-up API commit removes those now-dead fallback branches.

## Verification
- Pre-drop: confirm `GET /search/works`, `/works?author=…`, `/publications?q=…`,
  `/search/autocomplete` all serve via Manticore (`meta.performance.engine = "Manticore"`).
- Post-drop: same endpoints still green on port 1210; `npm run test:integration` 21/21.
- `information_schema`: `works` loses the two columns and three FULLTEXT indexes; routine
  count drops by 2; `data_length`+`index_length` of `works` drops by ~3.5 GB after OPTIMIZE.
- `SELECT COUNT(*) FROM works` unchanged.

## Rollback
- Take a `mariadb-dump --no-data data works` schema snapshot and a routine dump
  (`mariadb-dump --no-data --routines`) **before** running this, retained 30 days.
- There is no flip-back via `SEARCH_BACKEND` once the columns are gone. To restore: re-add
  the two columns + three FULLTEXT indexes + two procedures from the snapshot, then re-run
  the bulk refresh to repopulate (heavy, ~full-table). Treat this drop as one-way; only run
  it once Manticore has been stable in production.
