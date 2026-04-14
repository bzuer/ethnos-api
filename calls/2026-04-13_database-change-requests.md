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

**Status:** ✅ APPLIED (2026-04-14). 4.5 M rows now carry `has_files = 1` and
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

**Status:** ✅ APPLIED (2026-04-14). `sp_refresh_summary_publications_for_work`
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

**Status:** ✅ APPLIED (2026-04-14). Column gone.
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
