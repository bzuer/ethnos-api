# Database change requests

This file is the **request log** for changes that need to be applied to the
`data` database. The Ethnos_API project is a strict **consumer-only** of the
database (see `CLAUDE.md` → `## Database`): it never creates, executes, or
alters procedures, events, triggers, indexes, table structures, or row data.
Every DDL/DML change must be applied via the operator's separate pipeline.

`calls/` is the canonical location for any request the application needs to
send to the operator: change requests, SQL drafts, runbooks, and follow-up
asks. New requests should be appended below in priority order using the same
template (Why / Current state / Proposed change / Verification / Rollback).

---

## Status as of 2026-04-14

All three database change requests previously listed here have been **applied
in production** by the operator pipeline. Verified live state:

```
mariadb data -e "
  SELECT
    (SELECT COUNT(*) FROM summary_publications) AS sp_rows,
    (SELECT SUM(has_files) FROM summary_publications) AS sp_with_files,
    (SELECT SUM(CASE WHEN files_json IS NOT NULL THEN 1 ELSE 0 END)
       FROM summary_publications) AS sp_with_json,
    (SELECT COUNT(*) FROM information_schema.ROUTINES
       WHERE ROUTINE_SCHEMA='data'
         AND ROUTINE_NAME='sp_refresh_summary_publications_for_work') AS refresh_proc,
    (SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA='data' AND TABLE_NAME='files'
         AND COLUMN_NAME='work_id') AS files_work_id_present,
    (SELECT COUNT(*) FROM work_references
       WHERE status='RESOLVED' AND cited_work_id IS NULL) AS resolved_orphans;
"
```

Result:

```
sp_rows  sp_with_files  sp_with_json  refresh_proc  files_work_id_present  resolved_orphans
6567062  4500053        4500053       1             0                      0
```

Database object inventory: 23 base tables, 0 views, **37** stored procedures
(was 36 — `sp_refresh_summary_publications_for_work` added), 1 function, 5
triggers. `database/data.schema.sql` regenerated to match.

API-side wiring of the new state landed in the same change set:

- `/publications/{id}` and `/works/{id}` now surface `files[]` populated from
  `summary_publications.files_json` (Phase 6 contract was already in place;
  before the rebuild the array was always empty because `files_json` was
  NULL).
- `/works` and `/publications` listings route LIKE-style filters
  (`venue` / `venue_name`, `author`, `subject`) through Sphinx instead of
  scanning `summary_publications` with leading-wildcard `LIKE`. The listing
  paths previously fell through to MariaDB and timed out at 6 s on the larger
  6.57 M-row table.
- `_getWorksVitrine` and the inline vitrine path dropped the `authors_search
  IS NOT NULL AND authors_search != ''` filter (now a no-op — every row in
  the rebuilt summary has it populated — and was forcing the optimizer off
  the loose-index-scan plan).

The "Open data quality alert" previously listed below
(`resolved_without_cited_work = 6483`) is also resolved: the count is now 0.

The following sections are kept for historical reference and as a template
for future requests.

---

## Request 1 — Populate `has_files`, `files_json`, `publication_download_count` in `summary_publications`

**Status:** APPLIED (2026-04-14). 4.5 M rows now carry `has_files = 1` and
a populated `files_json`. `publication_download_count` populates from
`SUM(files.download_count)` and is currently 0 across the corpus because the
underlying `files.download_count` column itself is 0; this is an upstream
counter-population concern, not a summary-build gap.

### Why it matters to the API

`src/dto/publication.dto.js::formatPublicationDetails` and
`formatPublicationEntry` (Phase 2) read `files_json` directly from the
`summary_publications` row and emit `publications[].files[]` on every
`/publications/{id}` and `/works/{id}` response. The path is wired and tested
end-to-end. Until this request landed the file arrays were always empty
because `sp_build_summary_publications` never populated the three
file-related columns.

### Applied change (for the record)

`sp_build_summary_publications(p_batch_size)` now allocates a
`tmp_batch_files` per-batch temp table mirroring the existing
`tmp_batch_authors` / `tmp_batch_subjects` pattern, joined into the
`INSERT INTO summary_publications` projection so each publication row
carries:

- `has_files` = `CASE WHEN tpf.publication_id IS NULL THEN 0 ELSE 1 END`
- `files_json` = `JSON_ARRAYAGG(JSON_OBJECT('id', f.id, 'format',
  f.file_format, 'size', f.file_size, 'role', f.file_role, 'md5', f.md5))`
  scoped to the batch via `JOIN publications pub ON pub.id = f.publication_id
  WHERE pub.work_id >= v_current_id AND pub.work_id < v_current_id +
  p_batch_size`.
- `publication_download_count` = `COALESCE(SUM(f.download_count), 0)`

Full body is in the regenerated `database/data.schema.sql`.

### Verification (read-only, can be re-run)

```sql
SELECT
  COUNT(*) AS rows_with_files_json
FROM summary_publications
WHERE files_json IS NOT NULL;
-- Expected: > 0 (currently 4500053)

SELECT
  (SELECT COUNT(*) FROM summary_publications WHERE has_files = 1) AS sp_with_files,
  (SELECT COUNT(DISTINCT publication_id) FROM files) AS files_distinct_pubs;
-- The two should match within a small delta.
```

API spot-check:

```
curl -s http://localhost:1211/publications/5 | jq '.data.files | length'
curl -s http://localhost:1211/works/5 | jq '[.data.publications[].files[]] | length'
```

---

## Request 2 — Incremental refresh procedure for one work

**Status:** APPLIED (2026-04-14). `sp_refresh_summary_publications_for_work`
exists in production. The Ethnos_API project never calls it (consumer-only
rule); the operator pipeline invokes it after publication / work / authorship
/ work_subject / file mutations.

### Why it matters to the API

`summary_publications` is the source of truth for `/publications`,
`/publications/{id}`, `/works`, `/works/{id}`, and the listing flows. Without
an incremental path every mutation invalidated the summary until the next
operator-triggered full rebuild — a multi-hour drift window. Incremental
refresh collapses that window to sub-second.

### Applied procedure (for the record)

`sp_refresh_summary_publications_for_work(IN p_work_id INT)` deletes every
`summary_publications` row matching `work_id = p_work_id` inside a
transaction and reinserts them with the same column projection as
`sp_build_summary_publications`, including the file aggregates added in
Request 1. Correlated subqueries are used instead of temp tables because the
average work has ~1.02 publications, so the per-row overhead is negligible.

Full body is in the regenerated `database/data.schema.sql`.

### Verification

```sql
CALL sp_refresh_summary_publications_for_work(<known_work_id>);

SELECT publication_id, has_files, JSON_LENGTH(files_json) AS files_count
FROM summary_publications
WHERE work_id = <known_work_id>;
```

The Ethnos_API project itself has no direct verification path because it
never calls the procedure; the operator pipeline owns the test.

---

## Request 3 — Drop `files.work_id` (last irreversible step)

**Status:** APPLIED (2026-04-14). Column gone.
`information_schema.COLUMNS` no longer lists `files.work_id`. No code path
references it (Phase 4 already migrated every consumer to
`files.publication_id`).

### Why it matters to the API

`files.work_id` was a nullable, redundant column whose authoritative value
is `files.publication_id`. The API never read it after Phase 4. Keeping it
risked silently wrong results for any future code that grouped files by
`work_id` (because a file can live on a non-latest publication of a
multi-publication work).

### Applied change (for the record)

```sql
ALTER TABLE files DROP FOREIGN KEY fk_files_work;
ALTER TABLE files DROP INDEX idx_files_work_id;
ALTER TABLE files DROP COLUMN work_id;
```

### Verification

```sql
SELECT COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'files'
  AND COLUMN_NAME = 'work_id';
-- Expected: zero rows.

SELECT COUNT(*) FROM files;
-- Expected: unchanged from the pre-drop baseline (~4.4 M).
```

### Rollback (heavy, kept for the record)

```sql
ALTER TABLE files ADD COLUMN work_id INT NULL AFTER publication_id;
UPDATE files f
JOIN publications p ON p.id = f.publication_id
SET f.work_id = p.work_id;
ALTER TABLE files
  ADD CONSTRAINT fk_files_work
    FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE SET NULL;
ALTER TABLE files ADD INDEX idx_files_work_id (work_id);
```

---

## How to file a new request

Append a new `## Request N — <short title>` section using the same template:

```
**Status:** PENDING / IN REVIEW / APPLIED (date).

### Why it matters to the API
<user-visible effect — what is broken or degraded today, what is fixed>

### Current state
<read-only SQL snippet showing the gap>

### Proposed change
<exact SQL the operator can review and run, in a fenced block>

### Verification
<read-only assertions the operator can run after applying>

### Rollback
<how to undo, or "irreversible — kept for record">
```

Always state explicitly whether the project itself will *call* the new
artefact (procedure, function) or only *read* from it. The default is
read-only — the consumer-only rule in `CLAUDE.md` means the project itself
must never call any procedure.

---

## Request 4 — Index `summary_publications.language`

**Status:** PENDING (filed 2026-04-17).

### Why it matters to the API

`/works`, `/search/works`, and `/publications` all accept a `language` filter.
`summary_publications.language` has no index, so the filtered count and the
inner `GROUP BY work_id` scan the full 6.1 M-row table. Before the API-side
workaround landed in this change set the count query ran for 9–19 s per
call; the endpoint timed out at 6 s (`Works showcase query failed: Operation
timeout`). The current mitigation clamps the count sample to 20 000 with a
2 s server-side budget (`SET STATEMENT max_statement_time`) and falls back
to an estimate when the budget is exceeded. Adding the index lets the count
run to completion and makes `pagination.total` exact again.

### Current state

```sql
SHOW INDEX FROM summary_publications WHERE Column_name = 'language';
-- Expected after applying: one row with Key_name = 'idx_summary_pubs_language'.
-- Currently: zero rows.

SELECT COUNT(*) FROM summary_publications WHERE language = 'en';
-- Runtime today: 9-19 seconds (full table scan).
```

### Proposed change

```sql
ALTER TABLE summary_publications
  ADD INDEX idx_summary_pubs_language (language);
```

### Verification

```sql
SHOW INDEX FROM summary_publications
 WHERE Key_name = 'idx_summary_pubs_language';
-- Expected: one row.

EXPLAIN SELECT COUNT(*) FROM summary_publications WHERE language = 'en';
-- Expected: key = 'idx_summary_pubs_language', ref = const.

SELECT COUNT(*) FROM summary_publications WHERE language = 'pt';
-- Expected runtime: sub-second.
```

API spot-check after the index lands:

```
curl -s 'http://localhost:1211/works?language=pt&limit=10' | jq '.pagination.total, .meta.pagination_total_exact'
-- Expected: a small integer (~36 000) and `true`.
```

### Rollback

```sql
ALTER TABLE summary_publications DROP INDEX idx_summary_pubs_language;
```

---

## Request 5 — Restore Sphinx `publications_poc` index

**Status:** PENDING (filed 2026-04-17). Operator-owned (Sphinx indexer
pipeline, not DDL).

### Why it matters to the API

`src/services/sphinx.service.js` uses `publications_poc` as the primary
Sphinx index for every publication search path (`/publications?q=…`,
`/publications?venue=…`, `/publications?author=…`, `/publications?subject=…`,
`/search/works?q=…` fulltext routing). Right now the searchd runtime has
only `persons_poc`, `publications_rt`, and `venues_poc` — `publications_poc`
is **absent**:

```
mysql -h127.0.0.1 -P9306 --ssl=0 -e 'SHOW TABLES'
Index            Type
persons_poc      local
publications_rt  rt
venues_poc       local
```

Every publication search therefore throws `no enabled local indexes to
search`, the service catches it, and the MariaDB fallback runs. Before this
change set the fallback was a bug: `q` / `venue` / `author` / `subject`
filters were dropped entirely, so `COUNT(*)` returned the whole corpus
(6 567 060) and the first page was whatever `publication_id DESC` returned,
completely unrelated to the query term. The fix that landed in this change
set maps those filters to `MATCH ... AGAINST` (for `q`) and `LIKE` (for
`venue` / `author` / `subject`) against the `summary_publications` fulltext
indexes, so the results are now correct — but they are slower and less
precise than Sphinx. Restoring the Sphinx index returns the fast path.

### Current state

```
mysql -h127.0.0.1 -P9306 --ssl=0 -e 'SELECT COUNT(*) FROM publications_poc'
ERROR 1064 (42000): no enabled local indexes to search
```

### Proposed change

Rebuild and load the `publications_poc` index from the unified template
(`config/sphinx-unified.conf` in the repo) following the standard
maintenance runbook:

```
scripts/manage.sh index publications_poc
# or, if a full rebuild is needed:
scripts/manage.sh index:fast
```

Both commands are heavy and must be triggered manually by the operator
(`CLAUDE.md` → `## Scripts → Agent rule`). No DDL changes to the `data`
MariaDB schema are required — this is a Sphinx-side artefact only.

### Verification

```
mysql -h127.0.0.1 -P9306 --ssl=0 -e 'SHOW TABLES'
-- Expected: a `publications_poc` row appears, Type = `local`.

mysql -h127.0.0.1 -P9306 --ssl=0 -e \
  "SELECT COUNT(*) FROM publications_poc WHERE MATCH('amazonia'); SHOW META"
-- Expected: a non-zero count, total_found > 0, time < 100 ms.
```

API spot-check:

```
curl -s 'http://localhost:1211/publications?q=amazonia&limit=1' \
  | jq '.meta.engine, .pagination.total'
-- Expected: `"Sphinx+MariaDB"` and a count in the low thousands
-- (the MariaDB fallback currently reports 6106 for the same query).
```

### Rollback

Stop the `publications_poc` indexer; the API automatically falls back to
the MariaDB path implemented in
`src/services/publications.service.js::getPublications`.

---

## Request 6 — Repopulate `summary_publications.has_files` and `files_json`

**Status:** PENDING (filed 2026-05-11).

### Why it matters to the API

`/works`, `/works/{id}`, `/publications`, `/publications/{id}` and every
showcase / search listing on top of `summary_publications` advertise the
existence of files (`has_files`, `has_scimag_file`, `has_libgen_file`),
the file payload (`files[]` populated from `files_json`), and derived
work-level rollups (`/works/{id}.files`, `/works/{id}.file_summary`,
`/works/{id}.has_files`) by reading these two columns. After the latest
summary rebuild they are empty across the entire 6.77 M-row corpus, even
though the canonical `files` table has 5 032 440 publications with at
least one file attached.

User-visible impact:

- `/works/18101581` returns `has_files = false` and `files = []`, but
  publication 1123200438 has a `MAIN PDF` row in `files` (id 28768510,
  1.73 MB).
- Every listing-level `has_files` filter (`/works?has_files=true`,
  `/publications?has_files=true`) currently returns the empty set.
- The `/works/{id}` work-level `files[]`, `file_summary`, `primary_publication.has_files`,
  and the work-level `has_files` convenience flag are all wrong.

The detail endpoints (`/works/{id}`, `/publications/{id}`) have been
patched to join the live `files` table on `publication_id` so they
return correct data right now; the listing endpoints still depend on the
denormalised columns and stay broken until this request is applied.

### Current state

```sql
SELECT
  (SELECT COUNT(*)       FROM summary_publications)        AS sp_rows,
  (SELECT SUM(has_files) FROM summary_publications)        AS sp_with_has_files_flag,
  (SELECT SUM(CASE WHEN files_json IS NOT NULL
                    AND JSON_LENGTH(files_json) > 0
              THEN 1 ELSE 0 END)
     FROM summary_publications)                            AS sp_with_files_json,
  (SELECT COUNT(DISTINCT publication_id) FROM files)       AS publications_with_files_actual;
-- Observed 2026-05-11:
-- sp_rows = 6 769 074
-- sp_with_has_files_flag = 0
-- sp_with_files_json     = 0
-- publications_with_files_actual = 5 032 440
```

### Proposed change

Re-run the file-aggregation step inside `sp_build_summary_publications`
(or whatever incremental step previously populated these two columns).
The expected payload per row, per the `summary_publications` contract
documented in `CLAUDE.md`:

- `has_files = 1` whenever the publication has at least one row in `files`.
- `has_scimag_file = 1` when any file row has `scimag_id IS NOT NULL`.
- `has_libgen_file = 1` when any file row has `libgen_id IS NOT NULL`.
- `files_json` is a JSON array; each entry carries
  `{id, format, size, role, md5, libgen_id, scimag_id, openacess_id,
   best_oa_url, pages, language, version, verification, downloads}`,
  using `format`/`size`/`role`/`verification`/`downloads` (NOT the raw
  `file_format`/`file_size`/`file_role`/`verification_status`/`download_count`
  column names — the API DTO consumes the JSON keys exactly as listed).
- `publication_download_count = SUM(files.download_count)` for that
  publication.

A reference shape for a single row's `files_json` entry:

```json
{
  "id": 28768510,
  "format": "PDF",
  "size": 1730389,
  "role": "MAIN",
  "md5": "…",
  "libgen_id": null,
  "scimag_id": null,
  "openacess_id": null,
  "best_oa_url": null,
  "pages": null,
  "language": null,
  "version": null,
  "verification": "PENDING",
  "downloads": 0
}
```

If the orchestrator pipeline has the existing builder routine, the
simplest operator-side intervention is to re-run
`sp_orchestrate_all_summaries` (or only the publications phase) after
confirming the file-aggregation block is wired and emits the JSON shape
above. If a one-shot SQL backfill is preferred:

```sql
UPDATE summary_publications sp
LEFT JOIN (
  SELECT
    f.publication_id,
    MAX(CASE WHEN f.scimag_id IS NOT NULL THEN 1 ELSE 0 END) AS has_scimag,
    MAX(CASE WHEN f.libgen_id IS NOT NULL THEN 1 ELSE 0 END) AS has_libgen,
    SUM(COALESCE(f.download_count, 0))                       AS dl_total,
    JSON_ARRAYAGG(JSON_OBJECT(
      'id',           f.id,
      'format',       f.file_format,
      'size',         f.file_size,
      'role',         f.file_role,
      'md5',          f.md5,
      'libgen_id',    f.libgen_id,
      'scimag_id',    f.scimag_id,
      'openacess_id', f.openacess_id,
      'best_oa_url',  f.best_oa_url,
      'pages',        f.pages,
      'language',     f.language,
      'version',      f.version,
      'verification', f.verification_status,
      'downloads',    f.download_count
    )) AS files_payload
  FROM files f
  GROUP BY f.publication_id
) agg ON agg.publication_id = sp.publication_id
SET
  sp.has_files                 = IF(agg.publication_id IS NULL, 0, 1),
  sp.has_scimag_file           = COALESCE(agg.has_scimag, 0),
  sp.has_libgen_file           = COALESCE(agg.has_libgen, 0),
  sp.files_json                = agg.files_payload,
  sp.publication_download_count = COALESCE(agg.dl_total, 0);
```

This is heavy (5 M-row JSON aggregation) and should run during a
maintenance window. Whatever the operator runs, the resulting JSON keys
must match the contract above; the API DTO (`src/dto/publication.dto.js
::mapFiles`) keys on those JSON field names.

### Verification

```sql
SELECT
  SUM(has_files)                                          AS sp_with_has_files_flag,
  SUM(CASE WHEN files_json IS NOT NULL
            AND JSON_LENGTH(files_json) > 0
        THEN 1 ELSE 0 END)                                AS sp_with_files_json,
  (SELECT COUNT(DISTINCT publication_id) FROM files)      AS publications_with_files_actual
FROM summary_publications;
-- Expected: sp_with_has_files_flag = sp_with_files_json =
--           publications_with_files_actual (≈ 5 032 440).
```

API spot-check after the rebuild:

```
curl -s 'http://localhost:1211/works?has_files=true&limit=1' \
  | jq '.pagination.total, .data[0].has_files'
-- Expected: a count well over a million, and `true` on the row.

curl -s 'http://localhost:1211/publications/1123200438' \
  | jq '.data.has_files, (.data.files | length)'
-- Expected: `true` and `>= 1`.
```

### Rollback

Set `sp.has_files = 0`, `sp.files_json = NULL`, `sp.has_scimag_file = 0`,
`sp.has_libgen_file = 0`, `sp.publication_download_count = 0` on every
row — the API will fall back to the live `files`-table join on detail
endpoints (already wired) and the listing endpoints will degrade back to
the broken-empty state seen today.
