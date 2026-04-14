# Database change requests

This file is a **request log** for changes that need to be applied to the `data`
database. The Ethnos_API project is a strict **consumer-only** of the database
(see `CLAUDE.md` → `## Database`): it never creates, executes, or alters
procedures, events, triggers, indexes, table structures, or row data. Every
DDL/DML change must be applied via the operator's separate pipeline.

This document captures requests in priority order. Each entry has:

- **Why it matters to the API** — the user-visible effect today and after the
  change.
- **Current state** — what production looks like before the change.
- **Proposed change** — exact SQL the operator can review and run.
- **Verification** — read-only assertions the operator (or `manage.sh test
  --data`) can use to confirm the change landed.
- **Rollback** — how to undo it if needed.

---

## Request 1 — Populate `has_files`, `files_json`, `publication_download_count` in `summary_publications`

### Why it matters to the API

`src/dto/publication.dto.js::formatPublicationDetails` and
`formatPublicationEntry` (Phase 2) read `files_json` directly from the
`summary_publications` row and emit `publications[].files[]` on every
`/publications/{id}` and `/works/{id}` response. The path is wired and tested
end-to-end. The only reason files do not appear in the live responses is that
**`sp_build_summary_publications` never populates the three file-related
columns** — they default to `0` / `NULL` for every row.

After this request lands and a full rebuild (`CALL sp_orchestrate_all_summaries(50000)`)
runs, the API immediately surfaces:

- `data.publications[].files[]` populated on `/works/{id}` (Phase 6 contract).
- `data.files[]` populated on `/publications/{id}` (Phase 5 contract).
- `data.has_files` and `data.download_count` populated on
  `/publications/{id}` and `/publications` listing entries.
- `has_files=true|false` filter on `/publications` becomes meaningful.

No code change is required — the consumer side is already shipped.

### Current state

```sql
-- Live DB confirms the gap:
SELECT
  COUNT(*) AS total_rows,
  SUM(CASE WHEN has_files = 1 THEN 1 ELSE 0 END) AS rows_with_has_files,
  SUM(CASE WHEN files_json IS NOT NULL THEN 1 ELSE 0 END) AS rows_with_files_json,
  SUM(publication_download_count) AS total_download_count
FROM summary_publications;
-- Today: rows_with_has_files = 0, rows_with_files_json = 0, total_download_count = 0
```

The `files` base table has ~4.4 M rows, all keyed on `publication_id` with the
`idx_files_publication_id` index. The data is there; the build proc just
ignores it.

### Proposed change

Drop and recreate `sp_build_summary_publications` adding a third per-batch temp
table (`tmp_batch_files`), mirroring the existing `tmp_batch_authors` /
`tmp_batch_subjects` pattern so the runtime profile and batch granularity
stay identical.

```sql
DROP PROCEDURE IF EXISTS sp_build_summary_publications;

DELIMITER $$

CREATE PROCEDURE sp_build_summary_publications(IN p_batch_size INT)
BEGIN
    DECLARE v_min_id INT;
    DECLARE v_max_id INT;
    DECLARE v_current_id INT;

    IF p_batch_size IS NULL OR p_batch_size <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'p_batch_size must be a positive integer';
    END IF;

    SET SESSION group_concat_max_len = 1000000;

    SELECT MIN(id), MAX(id) INTO v_min_id, v_max_id FROM works;
    SET v_current_id = COALESCE(v_min_id, 0);

    TRUNCATE TABLE summary_publications;

    DROP TEMPORARY TABLE IF EXISTS tmp_batch_authors;
    CREATE TEMPORARY TABLE tmp_batch_authors (
        work_id INT PRIMARY KEY,
        authors_search MEDIUMTEXT,
        authors_json LONGTEXT
    ) ENGINE=InnoDB;

    DROP TEMPORARY TABLE IF EXISTS tmp_batch_subjects;
    CREATE TEMPORARY TABLE tmp_batch_subjects (
        work_id INT PRIMARY KEY,
        subjects_search MEDIUMTEXT,
        subjects_json LONGTEXT
    ) ENGINE=InnoDB;

    DROP TEMPORARY TABLE IF EXISTS tmp_batch_files;
    CREATE TEMPORARY TABLE tmp_batch_files (
        publication_id INT PRIMARY KEY,
        files_json LONGTEXT,
        publication_download_count INT
    ) ENGINE=InnoDB;

    WHILE v_current_id <= v_max_id DO

        TRUNCATE TABLE tmp_batch_authors;
        TRUNCATE TABLE tmp_batch_subjects;
        TRUNCATE TABLE tmp_batch_files;

        START TRANSACTION;

        INSERT INTO tmp_batch_authors (work_id, authors_search, authors_json)
        SELECT
            a.work_id,
            GROUP_CONCAT(p.preferred_name SEPARATOR ' '),
            JSON_ARRAYAGG(JSON_OBJECT('id', p.id, 'name', p.preferred_name, 'role', a.role))
        FROM authorships a
        JOIN persons p ON a.person_id = p.id
        WHERE a.work_id >= v_current_id AND a.work_id < v_current_id + p_batch_size
        GROUP BY a.work_id;

        INSERT INTO tmp_batch_subjects (work_id, subjects_search, subjects_json)
        SELECT
            ws.work_id,
            GROUP_CONCAT(s.term SEPARATOR ' '),
            JSON_ARRAYAGG(JSON_OBJECT('id', s.id, 'term', s.term))
        FROM work_subjects ws
        JOIN subjects s ON ws.subject_id = s.id
        WHERE ws.work_id >= v_current_id AND ws.work_id < v_current_id + p_batch_size
        GROUP BY ws.work_id;

        INSERT INTO tmp_batch_files (publication_id, files_json, publication_download_count)
        SELECT
            f.publication_id,
            JSON_ARRAYAGG(JSON_OBJECT(
                'id', f.id,
                'format', f.file_format,
                'size', f.file_size,
                'role', f.file_role,
                'md5', f.md5
            )),
            COALESCE(SUM(f.download_count), 0)
        FROM files f
        JOIN publications pub ON pub.id = f.publication_id
        WHERE pub.work_id >= v_current_id AND pub.work_id < v_current_id + p_batch_size
        GROUP BY f.publication_id;

        INSERT INTO summary_publications (
            publication_id, work_id, venue_id, publisher_id,
            title_search, abstract_search, authors_search, venue_search, subjects_search,
            doi, work_type, publication_year, language, open_access, peer_reviewed,
            has_files, work_citation_count, work_reference_count, publication_download_count,
            authors_json, subjects_json, files_json
        )
        SELECT
            pub.id, w.id, pub.venue_id, pub.publisher_id,
            w.title, w.abstract, tpa.authors_search, v.name, tps.subjects_search,
            pub.doi, w.work_type, pub.year, w.language, pub.open_access, pub.peer_reviewed,
            CASE WHEN tpf.publication_id IS NULL THEN 0 ELSE 1 END,
            w.citation_count, w.reference_count,
            COALESCE(tpf.publication_download_count, 0),
            tpa.authors_json, tps.subjects_json, tpf.files_json
        FROM works w
        JOIN publications pub ON pub.work_id = w.id
        LEFT JOIN venues v ON pub.venue_id = v.id
        LEFT JOIN tmp_batch_authors tpa ON w.id = tpa.work_id
        LEFT JOIN tmp_batch_subjects tps ON w.id = tps.work_id
        LEFT JOIN tmp_batch_files tpf ON pub.id = tpf.publication_id
        WHERE w.id >= v_current_id AND w.id < v_current_id + p_batch_size;

        COMMIT;

        SET v_current_id = v_current_id + p_batch_size;
    END WHILE;

    DROP TEMPORARY TABLE IF EXISTS tmp_batch_authors;
    DROP TEMPORARY TABLE IF EXISTS tmp_batch_subjects;
    DROP TEMPORARY TABLE IF EXISTS tmp_batch_files;
END$$

DELIMITER ;
```

After applying the patch, run the full rebuild via `sp_orchestrate_all_summaries`
so every existing row is repopulated with the new columns.

```sql
CALL sp_orchestrate_all_summaries(50000);
```

Expected duration: hours (the same as the original full build).

### Verification

```sql
-- Should return > 0 after the rebuild:
SELECT COUNT(*) AS rows_with_files_json
FROM summary_publications
WHERE files_json IS NOT NULL;

-- Should return roughly the same number as the count of publications that
-- have at least one file in the base files table:
SELECT
  (SELECT COUNT(*) FROM summary_publications WHERE has_files = 1) AS sp_with_files,
  (SELECT COUNT(DISTINCT publication_id) FROM files) AS files_distinct_pubs;

-- Spot-check a publication payload via the API:
-- curl -s 'http://localhost:1211/publications/<id-with-files>' | jq '.data.files | length'
```

### Rollback

The previous body of `sp_build_summary_publications` is preserved in the git
history of `database/data.schema.sql` (any commit at or before `f115177` —
the consumer-side revert that restored the original). To rollback:

```sql
DROP PROCEDURE IF EXISTS sp_build_summary_publications;
-- Re-create from the body in git: `git show f115177:database/data.schema.sql`
-- and copy the original sp_build_summary_publications definition.
```

---

## Request 2 — Incremental refresh procedure for one work

### Why it matters to the API

`summary_publications` is the source of truth for `/publications`,
`/publications/{id}`, `/works`, `/works/{id}`, and the listing flows. It is
populated by a full rebuild (`sp_orchestrate_all_summaries`) that takes hours.
**There is no incremental path today**: any mutation to `publications`,
`works`, `authorships`, `work_subjects`, or `files` invalidates the summary
until the next operator-triggered full rebuild — a multi-hour drift window.

A `sp_refresh_summary_publications_for_work(p_work_id)` procedure that the
operator pipeline can call after any mutation collapses the drift to
sub-second.

The Ethnos_API project will **never** call this procedure directly (per the
consumer-only rule). The expected callers live in the operator's ingestion /
mutation pipeline:

- After a publication INSERT/UPDATE/DELETE, the operator pipeline calls
  `CALL sp_refresh_summary_publications_for_work(<work_id>)` to refresh the
  affected work's rows.
- After a work-level edit (title, abstract, work_type, language), the
  operator pipeline calls the same proc — every sibling publication of the
  work is refreshed because they all inherit the parent's text corpus.
- The operator pipeline can optionally hit a follow-up project-side endpoint
  (a future `POST /internal/sphinx/refresh-work` protected by `X-Access-Key`,
  not yet built) to re-index the refreshed rows into `publications_rt`. That
  endpoint, when added, will only **read** from `summary_publications` — it
  will not call this proc itself.

### Current state

```sql
-- No incremental refresh procedure exists:
SELECT ROUTINE_NAME
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
  AND ROUTINE_NAME LIKE '%refresh%';
-- (empty)
```

### Proposed change

```sql
DROP PROCEDURE IF EXISTS sp_refresh_summary_publications_for_work;

DELIMITER $$

CREATE PROCEDURE sp_refresh_summary_publications_for_work(IN p_work_id INT)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_work_id IS NULL OR p_work_id <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'p_work_id must be a positive integer';
    END IF;

    SET SESSION group_concat_max_len = 1000000;

    START TRANSACTION;

    DELETE FROM summary_publications WHERE work_id = p_work_id;

    INSERT INTO summary_publications (
        publication_id, work_id, venue_id, publisher_id,
        title_search, abstract_search, authors_search, venue_search, subjects_search,
        doi, work_type, publication_year, language, open_access, peer_reviewed,
        has_files, work_citation_count, work_reference_count, publication_download_count,
        authors_json, subjects_json, files_json
    )
    SELECT
        pub.id,
        w.id,
        pub.venue_id,
        pub.publisher_id,
        w.title,
        w.abstract,
        (SELECT GROUP_CONCAT(p.preferred_name SEPARATOR ' ')
           FROM authorships a
           JOIN persons p ON p.id = a.person_id
           WHERE a.work_id = w.id),
        v.name,
        (SELECT GROUP_CONCAT(s.term SEPARATOR ' ')
           FROM work_subjects ws
           JOIN subjects s ON s.id = ws.subject_id
           WHERE ws.work_id = w.id),
        pub.doi,
        w.work_type,
        pub.year,
        w.language,
        pub.open_access,
        pub.peer_reviewed,
        (SELECT COUNT(*) > 0 FROM files WHERE publication_id = pub.id),
        w.citation_count,
        w.reference_count,
        (SELECT COALESCE(SUM(download_count), 0) FROM files WHERE publication_id = pub.id),
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', p.id, 'name', p.preferred_name, 'role', a.role))
           FROM authorships a
           JOIN persons p ON p.id = a.person_id
           WHERE a.work_id = w.id),
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', s.id, 'term', s.term))
           FROM work_subjects ws
           JOIN subjects s ON s.id = ws.subject_id
           WHERE ws.work_id = w.id),
        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                  'id', f.id,
                  'format', f.file_format,
                  'size', f.file_size,
                  'role', f.file_role,
                  'md5', f.md5
                ))
           FROM files f
           WHERE f.publication_id = pub.id)
    FROM works w
    JOIN publications pub ON pub.work_id = w.id
    LEFT JOIN venues v ON v.id = pub.venue_id
    WHERE w.id = p_work_id;

    COMMIT;
END$$

DELIMITER ;
```

The single-work version uses correlated subqueries instead of temp tables
because the typical work has 1.02 publications on average (max ~850 per the
Phase 0 baseline), so the per-row overhead is negligible and the proc body
stays self-contained.

### Verification

```sql
-- Pick a known work_id with files and verify the round-trip:
CALL sp_refresh_summary_publications_for_work(<known_work_id>);

SELECT publication_id, has_files, JSON_LENGTH(files_json) AS files_count, publication_download_count
FROM summary_publications
WHERE work_id = <known_work_id>;
-- Expected: has_files = 1, files_count > 0 if the work has any file
```

### Rollback

```sql
DROP PROCEDURE IF EXISTS sp_refresh_summary_publications_for_work;
```

This procedure is purely additive — it does not modify the build proc — so the
rollback is a single statement.

---

## Request 3 — Drop `files.work_id` (last irreversible step)

### Why it matters to the API

`files.work_id` is a nullable, redundant column whose authoritative value is
`files.publication_id`. The API never reads `files.work_id` — Phase 4 already
migrated every consumer to `publication_id`. The column is also actively
misleading: any code (or future contributor) that groups files by `work_id`
silently returns wrong results when a file lives on a non-latest publication
of a work with multiple publications.

After the drop, the schema becomes:

```
files.publication_id  → publications.id (FK, NOT NULL)
```

with no parallel work-level path.

### Current state

```sql
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'files'
  AND COLUMN_NAME = 'work_id';
-- Today: work_id, int(11), YES, MUL (idx_files_work_id, fk_files_work)
```

```sql
SELECT COUNT(*) FROM files WHERE work_id IS NOT NULL;
-- Today: should be roughly the full 4.4 M (every file row carries it)
```

### Proposed change

Drop the FK, the index, and the column in three statements (online DDL on a
4.4 M-row table is slow but feasible; run during off-hours):

```sql
ALTER TABLE files DROP FOREIGN KEY fk_files_work;
ALTER TABLE files DROP INDEX idx_files_work_id;
ALTER TABLE files DROP COLUMN work_id;
```

### Verification

```sql
-- Should return zero rows:
SELECT COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'files'
  AND COLUMN_NAME = 'work_id';

-- Row count of files unchanged:
SELECT COUNT(*) FROM files;
-- (compare against the pre-change baseline)

-- API spot-check:
-- curl -s 'http://localhost:1211/publications/<id-with-files>' | jq '.data.files | length'
-- (should still return > 0)
```

### Rollback

This is **the only irreversible request in this document** — recovering the
column requires re-derivation from `publications`:

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

The re-derivation is correct because `publications.work_id` is the
authoritative source. Cost: another full-table scan + index build.

Recommend taking a `SHOW CREATE TABLE files` snapshot immediately before the
drop and archiving it in the operations log.

---

## Open data quality alert (separate from any request above)

`./scripts/manage.sh test --data` currently reports
`resolved_without_cited_work = 6483` (was 0 in the Phase 0 baseline). This
counts `work_references` rows where `status = 'RESOLVED'` but
`cited_work_id IS NULL` — i.e. references marked as resolved but with no
target work attached.

The drift was introduced by an external operator routine between sessions
(none of this project's commits touch `work_references`). Recommended
investigation:

```sql
SELECT id, citing_work_id, cited_doi, status, created_at, resolved_at
FROM work_references
WHERE status = 'RESOLVED' AND cited_work_id IS NULL
ORDER BY id DESC
LIMIT 20;

SELECT MIN(created_at), MAX(created_at), MIN(resolved_at), MAX(resolved_at)
FROM work_references
WHERE status = 'RESOLVED' AND cited_work_id IS NULL;
```

If the orphans came from a half-completed `sp_resolve_pending_references`
run, either re-run the resolution proc against them or revert the rows to
`PENDING`:

```sql
-- Option A: re-run the resolver
CALL sp_resolve_pending_references(10000);

-- Option B: revert the orphans to PENDING so the next resolution attempt
-- picks them up again.
UPDATE work_references
SET status = 'PENDING', resolved_at = NULL
WHERE status = 'RESOLVED' AND cited_work_id IS NULL;
```

This is an operator-side investigation; the Ethnos_API project itself does
nothing to `work_references`.
