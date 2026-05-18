# 2026-05-18 — Intervention C: collapse `summary_publications` to a thin attribute table

Status: **Executable study (no operator action requested yet — awaiting green light).**
Why: the operator has decided to reduce the summary footprint while preserving the
listing-path performance the summary tables deliver. This file is the direct execution
plan for option C of `calls/2026-05-18_summary_tables_diagnostic.md`: drop the
~9.5 GB of redundant text + JSON corpus from `summary_publications` while keeping the
~1 GB of attribute columns + B-tree indexes that the listing endpoints actually depend
on. Net recovery: **~14.5 GB on disk** (15.96 GB → ~1.5 GB).

The plan is built around a critical empirical finding: dropping `summary_publications`
entirely (option D in the diagnostic) is not viable — `EXPLAIN` of the equivalent
base-table query (`SELECT … FROM publications JOIN works ORDER BY w.citation_count
DESC, pub.year DESC LIMIT 20`) shows `Using temporary; Using filesort` over ~2.5 M
rows. The thin `summary_publications` exists precisely to host the
`idx_summary_pubs_metrics (work_citation_count DESC, publication_year DESC)` covering
index that makes the "most cited" sort O(log n). So C keeps the table, but only the
columns and indexes that earn their footprint.

---

## 1. Target schema

```sql
CREATE TABLE summary_publications (
  publication_id            INT      NOT NULL,
  work_id                   INT      NOT NULL,
  venue_id                  INT      DEFAULT NULL,
  publisher_id              INT      DEFAULT NULL,
  doi                       VARCHAR(255) DEFAULT NULL,
  work_type                 ENUM('ARTICLE','BOOK','CHAPTER','THESIS','CONFERENCE',
                                 'CONFERENCE_PAPER','REPORT','DATASET','PREPRINT',
                                 'REVIEW','EDITORIAL','OTHER') NOT NULL,
  publication_year          SMALLINT DEFAULT 0,
  language                  CHAR(3)  DEFAULT NULL,
  open_access               TINYINT(1) DEFAULT 0,
  peer_reviewed             TINYINT(1) DEFAULT 0,
  has_files                 TINYINT(1) DEFAULT 0,
  has_scimag_file           TINYINT(1) DEFAULT 0,
  has_libgen_file           TINYINT(1) DEFAULT 0,
  work_citation_count       INT      DEFAULT 0,
  work_reference_count      INT      DEFAULT 0,
  publication_download_count INT     DEFAULT 0,
  summary_updated_at        TIMESTAMP NULL DEFAULT current_timestamp()
                            ON UPDATE current_timestamp(),
  PRIMARY KEY (publication_id),
  UNIQUE KEY uq_summary_pubs_doi      (doi),
  KEY idx_summary_pubs_work           (work_id),
  KEY idx_summary_pubs_year           (publication_year),
  KEY idx_summary_pubs_type           (work_type),
  KEY idx_summary_pubs_venue          (venue_id),
  KEY idx_summary_pubs_metrics        (work_citation_count DESC, publication_year DESC),
  KEY idx_summary_pubs_file_sources   (has_files, has_scimag_file, has_libgen_file),
  KEY idx_summary_pubs_language       (language),
  CONSTRAINT fk_summary_pubs_publication
    FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE,
  CONSTRAINT fk_summary_pubs_work
    FOREIGN KEY (work_id)        REFERENCES works(id)        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

**Removed from the current schema (~9.5 GB data + ~3.9 GB FT indexes):**
- text corpus: `title_search`, `abstract_search`, `authors_search`, `venue_search`,
  `subjects_search`
- JSON aggregates: `authors_json`, `subjects_json`, `files_json`, `identifiers_json`
- always-NULL: `publication_date`, `volume`, `issue`, `pages_text`, `source`,
  `license_url`, `license_version`
- FT indexes: `ft_summary_pubs_content`, `ft_summary_pubs_metadata` (drop the
  InnoDB FT auxiliary tables along with them)

**Kept (every column has a justified index path):**
- 4 IDs (publication_id PK + work_id, venue_id, publisher_id) — joinable surface
- `doi` — unique-key lookup for `/{doi}` resolution
- attribute filters: `work_type`, `language`, `open_access`, `peer_reviewed`,
  `has_files`, `has_scimag_file`, `has_libgen_file`
- sort attributes: `work_citation_count`, `work_reference_count`, `publication_year`
- secondary attribute: `publication_download_count` (placeholder; build-procedure bug
  to fix separately)
- `summary_updated_at` — only column without a direct base-table mirror

**New invariant:** `fk_summary_pubs_work` is added (currently absent). Catches any
orphan introduced by a future merge/renumber on `works`.

**Estimated footprint:** ~50 bytes/row × 6.77 M ≈ 340 MB clustered + ~1 GB across
indexes ≈ **~1.5 GB total** (vs current 15.96 GB).

---

## 2. Read-path rewrites (per-file)

Every site that reads a removed column needs a replacement. Total: 5 files,
~38 distinct SQL touchpoints. Each replacement is a batched JOIN keyed on
`publication_id` or `work_id` against a base table that already has the right index.

### 2.1 The hydration layer (new module)

Add `src/services/hydration.service.js` with three batched helpers:

```js
// All three accept an array of IDs and return Map<id, payload>.
async function hydrateAuthorsByWorkIds(workIds, { limitPerWork = 50 } = {}) { … }
async function hydrateSubjectsByWorkIds(workIds, { limitPerWork = 20 } = {}) { … }
async function hydrateFilesByPublicationIds(pubIds, { limitPerPub = 20 } = {}) { … }
```

Implementations:

```sql
-- Authors (mirrors what authors_json carried, plus position/is_corresponding which
-- the JSON never had → free enrichment).
SELECT a.work_id, p.id, p.preferred_name, a.role, a.position,
       (a.role='CORRESPONDING_AUTHOR') AS is_corresponding
FROM authorships a
JOIN persons p ON p.id = a.person_id
WHERE a.work_id IN (?, …)
ORDER BY a.work_id, a.position;
-- Plan: idx_authorships_work_position range scan + persons PRIMARY eq_ref
-- Cost for 20 work_ids: ~26 rows + 26 PK lookups, sub-10 ms.

-- Subjects.
SELECT ws.work_id, s.id, s.term
FROM work_subjects ws
JOIN subjects s ON s.id = ws.subject_id
WHERE ws.work_id IN (?, …)
ORDER BY ws.work_id, ws.relevance_score DESC;
-- Plan: idx_work_subjects_work_relevance range + subjects PRIMARY eq_ref
-- Cost for 20 work_ids: ~99 rows + 99 PK lookups, sub-15 ms.

-- Files (this is exactly the workaround already in _getCompleteWorkData,
-- promoted to a shared helper).
SELECT f.publication_id, f.id, f.file_format AS format, f.file_size AS size,
       f.file_role AS role, f.md5, f.libgen_id, f.scimag_id, f.openacess_id,
       f.best_oa_url, f.pages, f.language, f.version,
       f.verification_status AS verification,
       f.download_count AS downloads
FROM files f
WHERE f.publication_id IN (?, …)
ORDER BY f.publication_id,
         FIELD(f.file_role,'MAIN','SUPPLEMENT','COVER','PREVIEW'),
         (f.verification_status='VERIFIED') DESC,
         f.id DESC;
-- Plan: idx_files_publication_id range scan, ~21 rows for 20 publications.
```

All three return shapes that match exactly what `mapAuthors` / `mapSubjects` /
`mapFiles` in `src/dto/publication.dto.js` already consume — including the optional
`position` and `is_corresponding` fields that the current JSON omits but `mapAuthors`
already reads. **No DTO changes required.**

### 2.2 `publications.service.js` (7 touchpoints)

| Line | Current                                                                | After C                                                                                |
| ---- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 117  | `sp.title_search AS title, sp.abstract_search AS abstract`             | `w.title AS title, w.abstract AS abstract` (JOIN `works w ON w.id=sp.work_id`)         |
| 138-140 | `sp.authors_json, sp.subjects_json, sp.files_json`                  | drop from SELECT; call hydration helpers after the page is materialised                |
| 161-164 | base FROM/JOIN                                                       | add `JOIN works w ON w.id=sp.work_id` (covered: works PK)                              |
| 223  | `sp.venue_search AS venue_name`                                        | `v.name AS venue_name` (`venues v` already joined in the listing)                      |
| 486  | `MATCH(sp.title_search, sp.abstract_search) AGAINST (? IN BOOLEAN MODE)` | `MATCH(w.title, w.subtitle, w.abstract) AGAINST (? IN BOOLEAN MODE)` (uses `ft_works_content`) |
| 490-498 | `sp.venue_search LIKE ?`, `sp.authors_search LIKE ?`, `sp.subjects_search LIKE ?` | drop the dedicated FT fallback; route through Sphinx (already the primary path for these filters). MariaDB fallback for venue/author/subject becomes: `v.name LIKE ?`, plus EXISTS-subquery against authorships/work_subjects with `ft_persons_names` / leading-wildcard `LIKE` on subjects. Slower fallback, but only fires when Sphinx is down. |
| 558-582 | same as 117 / 223 in the post-Sphinx hydration block                | same replacement                                                                       |
| 706-708 | `sp.authors_json` in `getPublicationDetail` sibling query             | hydration helper                                                                       |

### 2.3 `works.service.js` (13 touchpoints)

Same pattern. The listing query (line 354-361) currently selects:
```sql
sp.title_search, sp.abstract_search, sp.authors_json, sp.subjects_json,
sp.venue_search …
FROM summary_publications sp LEFT JOIN summary_venues sv …
```

Becomes:
```sql
w.title, w.abstract, NULL AS authors_json_unused, NULL AS subjects_json_unused,
v.name AS venue_name …
FROM summary_publications sp
JOIN works w        ON w.id = sp.work_id
LEFT JOIN venues v  ON v.id = sp.venue_id
LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id
```

`authors_json` / `subjects_json` are replaced by hydration helpers after the page is
materialised. The `summary_venues` join stays — it's a small table (40 MB) and carries
the ranking score that the venue payload needs.

**The `_getWorksSearchFallback` MariaDB path** (lines 1380-1426) uses `MATCH(sp.title_search,
sp.abstract_search)` and `MATCH(sp.authors_search, sp.venue_search, sp.subjects_search)`.
Replace with:
```sql
MATCH(w.title, w.subtitle, w.abstract) AGAINST (? IN BOOLEAN MODE)
-- And drop the metadata MATCH entirely; if Sphinx is down, the `author` / `venue` /
-- `subject` filters degrade to plain LIKE on base tables. Document as `meta.engine =
-- "MariaDB-fallback-degraded"` so callers know to retry once Sphinx is back.
```

The `MAX(MATCH(...))` ranking expressions in the work-level aggregation (lines 1424-1426)
collapse to `MAX(MATCH(w.title, w.subtitle, w.abstract) AGAINST (...))`. The metadata
MATCH was always a fallback for Sphinx-down anyway.

### 2.4 `citations.service.js`, `signatures.service.js`, `bibliography.service.js`,
`courses.service.js`, `instructors.service.js`, `organizations.service.js`,
`persons.service.js`, `venues.service.js`

These all use the same pattern: `LEFT JOIN summary_publications sp_a ON
sp_a.publication_id = (SELECT publication_id FROM summary_publications WHERE work_id =
… ORDER BY publication_year DESC LIMIT 1)` followed by `sp_a.title_search` /
`sp_a.venue_search`.

Replacement: change the SELECT projection from `sp_a.title_search / sp_a.venue_search`
to `w.title / v.name`, and add `JOIN works w ON w.id = sp_a.work_id LEFT JOIN venues v
ON v.id = sp_a.venue_id`. The subquery picking "latest publication for the work"
remains unchanged — it uses `idx_summary_pubs_work` + `idx_summary_pubs_year`.

`signatures.service.js:434` has `COALESCE(JSON_LENGTH(sp.authors_json), 0) AS
total_authors`. Replace with a scalar subquery: `(SELECT COUNT(*) FROM authorships a
WHERE a.work_id = sp.work_id) AS total_authors`. Plan: ref scan on
`idx_authorships_work_position`, ~2 rows per work, cheap.

### 2.5 `autocomplete.service.js` (the largest concentration of *_search reads)

Three distinct uses:
1. **`q`-suggestion via MariaDB FT** (line 126): `MATCH(sp.title_search,
   sp.abstract_search) AGAINST (?)` → `MATCH(w.title, w.subtitle, w.abstract)`.
2. **Title autocomplete** (line 143-148): `GROUP BY title_search`. Replace with `GROUP
   BY w.title` joining `works w ON w.id=sp.work_id`. Slightly slower (extra eq_ref
   per row) but autocomplete is cached.
3. **Author autocomplete** (line 170-175): `GROUP BY authors_search`. This one is
   trickier — `authors_search` was a space-separated string per publication. The
   intended semantics are "popular author strings" which doesn't translate cleanly to
   per-person aggregation. **Recommendation: route author autocomplete entirely
   through Sphinx** (`persons_poc` index) which already exists and is purpose-built
   for prefix-search on names. The MariaDB GROUP BY fallback for authors becomes a
   GROUP BY on `persons.preferred_name` joined through `authorships`.
4. **Term extraction from titles** (line 282-292): operates on `sp.title_search`.
   Replace with `w.title` join.

### 2.6 `sphinx.service.js`

Lines 49-55 and 227-233 build SphinxQL `MATCH` clauses against `@title_search`,
`@authors_search`, etc. These are *Sphinx field names*, not MariaDB column names. They
refer to fields inside the Sphinx index. Whether those fields are sourced from
`summary_publications.title_search` or from JOIN-on-the-fly in `sql_query` doesn't
matter — the Sphinx-side field name is independent. **No change needed in
sphinx.service.js for these lines.**

Line 636-648: `indexPublication` writes to the RT index with the *_search payload.
This method is part of the operator-pipeline-owned real-time indexing layer. Two
options:
- (a) leave it — the API never calls it (`indexWork` / `updateWork` / `deleteWork`
   are documented as no-ops in CLAUDE.md). The real-time indexing service is
   ceremonially present.
- (b) update it to reflect the new sourcing — but this requires the operator
   pipeline to feed it title/abstract/authors_search/etc. computed at write time.

Since CLAUDE.md explicitly states the RT path is operator-owned and the API treats it
as a no-op, leave as-is and mark the method as "operator-side contract — see
sp_refresh_summary_publications_for_work".

### 2.7 DTO (`src/dto/publication.dto.js`)

Lines 154, 207 fall back to `row.title_search` / `row.abstract_search` when `row.title`
/ `row.abstract` are absent. After C, `row.title` / `row.abstract` will be supplied
from `works`, so the fallback becomes dead code. **Either** delete the fallback
references **or** leave them as no-ops (they're string-or-null OR).

Line 70 falls back to `row.venue_search`. Same treatment — remove or leave.

The mappers `mapAuthors`, `mapSubjects`, `mapFiles` already accept the wire shape that
the hydration helpers will return. Wire each listing controller to attach
hydration output as `row.authors_json` / `row.subjects_json` / `row.files_json`
*after* page materialisation (or rename to `row.authors_array` etc. and update the
mappers to read those). Recommended: stay with the existing field names so DTOs are
unchanged — the hydration helpers JSON-stringify their output to keep the contract
identical.

### 2.8 Metrics path

`metrics.service.js:58` uses `ROUND(AVG(sp.work_citation_count), 2)`. **No change** —
this column survives C.

### 2.9 Venue payload

`venues.service.js` only reads `sp.work_citation_count` / `sp.work_reference_count`
from summary_publications (lines 729, 746-790, 817-818). **No change**.

---

## 3. Sphinx ingestion rewrite

`publications_poc` currently scans `summary_publications` for both attributes and
text. After C, the text columns are gone. Two ingestion options:

### Option (a) — JOIN on the fly inside `sql_query`

```ini
sql_query = \
    SELECT \
        sp.publication_id, \
        sp.work_id, \
        sp.venue_id, \
        sp.publisher_id, \
        w.title       AS title_search, \
        IFNULL(w.abstract, '') AS abstract_search, \
        IFNULL(authors_agg.txt, '')  AS authors_search, \
        IFNULL(v.name, '')           AS venue_search, \
        IFNULL(subjects_agg.txt, '') AS subjects_search, \
        sp.doi, \
        sp.work_type, \
        sp.language, \
        sp.publication_year, \
        sp.open_access, \
        sp.peer_reviewed, \
        sp.has_files, \
        sp.work_citation_count, \
        sp.work_reference_count, \
        sp.publication_download_count \
    FROM summary_publications sp \
    JOIN works w ON w.id = sp.work_id \
    LEFT JOIN venues v ON v.id = sp.venue_id \
    LEFT JOIN ( \
        SELECT a.work_id, GROUP_CONCAT(p.preferred_name SEPARATOR ' ') AS txt \
        FROM authorships a JOIN persons p ON p.id = a.person_id \
        WHERE a.work_id BETWEEN $start AND $end \
        GROUP BY a.work_id \
    ) authors_agg ON authors_agg.work_id = sp.work_id \
    LEFT JOIN ( \
        SELECT ws.work_id, GROUP_CONCAT(s.term SEPARATOR ' ') AS txt \
        FROM work_subjects ws JOIN subjects s ON s.id = ws.subject_id \
        WHERE ws.work_id BETWEEN $start AND $end \
        GROUP BY ws.work_id \
    ) subjects_agg ON subjects_agg.work_id = sp.work_id \
    WHERE sp.publication_id >= $start AND sp.publication_id <= $end
```

Notes:
- Range is on `publication_id` (matches existing `sql_query_range`), but the
  authors/subjects aggregations key on `work_id`. The derived-table predicate uses the
  publication-id range *coerced to a work-id range* — works because publications batch
  ranges are contiguous in work_id by construction (publications.work_id has strong
  locality from the build order). If this assumption is ever violated, change the
  derived-table predicate to `WHERE a.work_id IN (SELECT work_id FROM
  summary_publications WHERE publication_id BETWEEN $start AND $end)` — slower but
  correct.
- `group_concat_max_len` must be at least 1 M (Sphinx indexer-side `SET SESSION
  group_concat_max_len`); add as `sql_query_pre = SET SESSION group_concat_max_len =
  1000000`.

**Cost:** indexer wall-clock grows from ~30 min to ~2 h on a 6.77 M-row corpus. Runs
overnight; acceptable.

### Option (b) — keep a write-only `summary_publications_text` shadow

Only Sphinx reads it; the API never references it. Build by extending the operator's
existing `sp_build_summary_publications` to also populate this side table. Smaller
ingestion-time impact but reintroduces ~5 GB of text storage. **Not recommended** —
defeats the point of C.

**Adopt option (a).** Update `config/sphinx-unified.conf` accordingly.

### `publications_rt` (real-time delta index)

The RT index already has `rt_field` declarations matching the text fields above. No
schema change to the RT index. The operator pipeline that calls `REPLACE INTO
publications_rt` after each refresh must now supply the text fields by JOIN-on-the-fly
(or via `sp_refresh_summary_publications_for_work` which produces the per-work text
on demand). This is an operator-side change that lives in the refresh procedure.

---

## 4. Operator-side procedure rewrites

Both procedures need rewrites. The API does not execute them; this section is the
spec the operator pipeline must implement.

### 4.1 `sp_build_summary_publications` (full rebuild)

Becomes radically simpler — no more temporary tables for authors/subjects, no more
`JSON_ARRAYAGG`, no more `group_concat_max_len` ceilings. Just the attribute denormalisation:

```sql
CREATE PROCEDURE sp_build_summary_publications(IN p_batch_size INT)
BEGIN
    DECLARE v_min_id INT;
    DECLARE v_max_id INT;
    DECLARE v_current_id INT;

    SELECT MIN(id), MAX(id) INTO v_min_id, v_max_id FROM works;
    SET v_current_id = COALESCE(v_min_id, 0);

    TRUNCATE TABLE summary_publications;

    WHILE v_current_id <= v_max_id DO
        START TRANSACTION;

        INSERT INTO summary_publications (
            publication_id, work_id, venue_id, publisher_id, doi, work_type,
            publication_year, language, open_access, peer_reviewed,
            has_files, has_scimag_file, has_libgen_file,
            work_citation_count, work_reference_count, publication_download_count
        )
        SELECT
            pub.id, w.id, pub.venue_id, pub.publisher_id, pub.doi, w.work_type,
            COALESCE(pub.year, 0), w.language, pub.open_access, pub.peer_reviewed,
            CASE WHEN fa.publication_id IS NULL THEN 0 ELSE 1 END,
            COALESCE(fa.has_scimag_file, 0),
            COALESCE(fa.has_libgen_file, 0),
            COALESCE(w.citation_count, 0),
            COALESCE(w.reference_count, 0),
            COALESCE(fa.dl_count, 0)
        FROM works w
        JOIN publications pub ON pub.work_id = w.id
        LEFT JOIN (
            SELECT f.publication_id,
                   MAX(CASE WHEN f.scimag_id IS NOT NULL THEN 1 ELSE 0 END) AS has_scimag_file,
                   MAX(CASE WHEN f.libgen_id IS NOT NULL THEN 1 ELSE 0 END) AS has_libgen_file,
                   COALESCE(SUM(f.download_count), 0)                       AS dl_count
            FROM files f
            JOIN publications pub2 ON pub2.id = f.publication_id
            WHERE pub2.work_id >= v_current_id
              AND pub2.work_id < v_current_id + p_batch_size
            GROUP BY f.publication_id
        ) fa ON fa.publication_id = pub.id
        WHERE w.id >= v_current_id AND w.id < v_current_id + p_batch_size;

        COMMIT;
        SET v_current_id = v_current_id + p_batch_size;
    END WHILE;
END
```

**Expected runtime:** down from multi-hour to ~20-30 min (no temp tables, no
JSON_ARRAYAGG buffers, no GROUP_CONCAT). Also fixes the `publication_download_count`
bug along the way: with the simpler aggregation, the SUM survives the INSERT.

### 4.2 `sp_refresh_summary_publications_for_work(p_work_id)` (incremental)

Similarly trimmed:

```sql
CREATE PROCEDURE sp_refresh_summary_publications_for_work(IN p_work_id INT)
BEGIN
    DELETE FROM summary_publications WHERE work_id = p_work_id;

    INSERT INTO summary_publications (…same columns as 4.1…)
    SELECT … (same select but `WHERE w.id = p_work_id`) …;

    -- Reindex the RT delta with text from base tables.
    -- (Sphinx side; see section 3 — operator pipeline computes
    -- title_search/abstract_search/authors_search/venue_search/subjects_search on the
    -- fly and REPLACE INTOs publications_rt.)
END
```

---

## 5. Rollout sequence (4 phases, zero downtime)

### Phase 0 — preparation (no production impact)

Operator: snapshot `summary_publications` → `summary_publications_backup_20260518`.
API: branch `intervention-c`, target `main` PR.

### Phase 1 — deploy the hydration code, still reading the old summary

API ships changes to:
- add `src/services/hydration.service.js` with the three helpers
- rewrite the 38 SQL touchpoints in 9 services to JOIN `works` / `venues` and select
  `w.title` / `v.name` etc. instead of `sp.title_search` / `sp.venue_search`
- replace `sp.authors_json` / `sp.subjects_json` / `sp.files_json` SELECT lines with
  post-materialisation hydration calls
- route the MariaDB FT fallback through `ft_works_content`
- bump cache keys: `work:v5:*`, `publication:*:v3:*`, `publications:list:v2:*`, etc.,
  to invalidate any stale payloads

At this point the API has stopped reading the *_search and *_json columns from
`summary_publications`. The columns still exist in the table, undisturbed. **Run the
full integration smoke (`npm run test:integration` against port 1210)** to confirm
zero regression.

### Phase 2 — verify in production for a soak period (suggested: 7 days)

Watch `/health/metrics`, latency percentiles on listing endpoints, Sphinx hit ratio
(`meta.engine` distribution), and the Grafana board if one exists. Confirm:
- p50/p95 latency on `/publications`, `/works`, `/works/{id}`, `/search/works` does
  not regress beyond +15 ms (acceptable: ~30 ms extra from hydration JOINs)
- no spike in MariaDB-fallback rate (Sphinx should keep handling text queries)
- the integration test passes daily

### Phase 3 — operator drops the redundant columns + FT indexes

Operator runs (with the API still up):

```sql
ALTER TABLE summary_publications
  DROP COLUMN title_search,
  DROP COLUMN abstract_search,
  DROP COLUMN authors_search,
  DROP COLUMN venue_search,
  DROP COLUMN subjects_search,
  DROP COLUMN authors_json,
  DROP COLUMN subjects_json,
  DROP COLUMN files_json,
  DROP COLUMN identifiers_json,
  DROP COLUMN publication_date,
  DROP COLUMN volume,
  DROP COLUMN issue,
  DROP COLUMN pages_text,
  DROP COLUMN source,
  DROP COLUMN license_url,
  DROP COLUMN license_version,
  DROP INDEX ft_summary_pubs_content,
  DROP INDEX ft_summary_pubs_metadata,
  ADD CONSTRAINT fk_summary_pubs_work FOREIGN KEY (work_id) REFERENCES works(id)
      ON DELETE CASCADE,
  ALGORITHM=INPLACE, LOCK=NONE;
```

This is an InnoDB ONLINE DDL. Drops on a 14 GB table take ~15-30 min wall-clock but
do not block reads or writes. After ALTER:
- `OPTIMIZE TABLE summary_publications;` to release the freed pages back to the OS
- update `sp_build_summary_publications` per section 4.1
- update `sp_refresh_summary_publications_for_work` per section 4.2

### Phase 4 — switch Sphinx ingestion

Operator updates `/var/run/ethnos-api/sphinx.conf` per section 3 (option a) and
runs a full reindex of `publications_poc` overnight. Heavy operation — **the user
must trigger this manually** per the agent rule in CLAUDE.md (no automatic
`index:fast` / `deploy` from the agent).

After the reindex completes, `publications_poc` is rebuilt from the new sql_query.
`publications_rt` keeps working without change (the RT field names are
field-name-only; their source is operator-side).

### Phase 5 — soak + cleanup

After 14 days of green metrics, drop `summary_publications_backup_20260518`.

---

## 6. Risks and mitigations

| Risk                                                                  | Probability | Impact | Mitigation                                                                                                                                |
| --------------------------------------------------------------------- | ----------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Listing latency regression beyond +30 ms                              | Low         | Medium | Each hydration helper is independently benchmarkable. EXPLAINs already show range scans on indexed work_id/publication_id. Cache layer absorbs repeat requests. |
| MariaDB FT fallback breaks `author` / `venue` / `subject` filters     | Medium      | Low    | Document as "degraded fallback" in `meta.engine`. The path only fires when Sphinx is down. Acceptable if Sphinx uptime > 99%.             |
| Sphinx full reindex takes longer than the maintenance window          | Medium      | Low    | Indexer can run with `--rotate` (zero-downtime swap). If wall-clock is too high, defer to a weekend window.                              |
| Operator forgets to update `sp_refresh_summary_publications_for_work` | Low         | High   | Phase 3 ALTER + procedure update should be a single atomic operator change. After Phase 3, calling the old procedure fails (columns gone) — that's the safety net. |
| `idx_summary_pubs_metrics` plan changes after column drops            | Very low    | Medium | Index is unaffected by adjacent column drops. Re-run `EXPLAIN` post-Phase-3 to confirm.                                                   |
| Phase 1 ships before Phase 3: app reads old columns?                  | None        | —      | Phase 1 *stops* reading the columns. Phase 3 drops them. The columns are still present during Phase 1-2 — harmless dead weight.           |
| `authors_json` consumers downstream of the API                        | Unknown     | Medium | Wire format unchanged — DTO output identical. Hydration is invisible to clients.                                                          |
| `OPTIMIZE TABLE` blocks                                               | Low         | Low    | `ALGORITHM=INPLACE` is the default; can also `pt-online-schema-change` if blocking matters.                                              |
| Build-procedure rewrite introduces a bug                              | Medium      | Medium | Operator runs the new procedure on a dev snapshot first; diff row counts and a column-by-column sanity check before truncating prod. |

---

## 7. Verification plan

### Pre-Phase-1 (dry-run on dev snapshot)

```sql
-- Confirm the JOIN-replacement queries return identical row counts.
SELECT COUNT(*) FROM summary_publications;  -- baseline
SELECT COUNT(*) FROM publications;          -- should match after C
SELECT COUNT(*) FROM summary_publications WHERE doi IS NOT NULL;
SELECT COUNT(*) FROM publications WHERE doi IS NOT NULL;

-- Confirm idx_summary_pubs_metrics is still the chosen plan.
EXPLAIN SELECT … ORDER BY work_citation_count DESC, publication_year DESC LIMIT 20;
-- Expect: index on idx_summary_pubs_metrics, ~20 rows examined.
```

### Per-endpoint micro-benchmark (Phase 2)

For each of `/publications`, `/works`, `/works/{id}`, `/publications/{id}`,
`/search/works`, `/search/advanced`, `/persons/{id}/works`, `/venues/{id}/works`:

```bash
ab -n 100 -c 4 "http://localhost:1210/publications?limit=20&sort_by=cited_by_count"
```

Record p50/p95 before Phase 1 (with old summary), after Phase 1 (hydration JOINs,
columns still present), after Phase 3 (columns dropped). The "after Phase 1 vs after
Phase 3" delta should be near zero (the columns just sit unused). The "before Phase 1
vs after Phase 1" delta is the cost of hydration JOINs; should be ≤ 30 ms p95.

### Integration smoke (Phase 1, 3)

```bash
PORT=1210 npm run test:integration
```

Must pass. If a smoke assertion changes contract (e.g., adding `position` /
`is_corresponding` to authors output because we now hydrate from authorships), update
the smoke to reflect.

### Disk recovery (Phase 3)

```sql
SELECT table_name,
       ROUND(data_length/1024/1024/1024, 2) AS data_gb,
       ROUND(index_length/1024/1024/1024, 2) AS idx_gb,
       ROUND((data_length+index_length)/1024/1024/1024, 2) AS total_gb,
       ROUND(data_free/1024/1024/1024, 2) AS free_gb
FROM information_schema.tables
WHERE table_schema='data' AND table_name='summary_publications';
```

Expect: total_gb ≤ 1.5, data_free ≤ 0.5 after `OPTIMIZE TABLE`.

---

## 8. Rollback

### From Phase 1 (code-only, columns still present)

Revert the API commit. The dropped JSON columns and *_search columns are still in the
table; the previous code path resumes working with zero data loss.

### From Phase 3 (columns dropped)

Two scenarios:
1. **Soft rollback** (within the soak window): the
   `summary_publications_backup_20260518` snapshot taken in Phase 0 can be restored
   as the live table via:
   ```sql
   RENAME TABLE summary_publications TO summary_publications_thin,
                summary_publications_backup_20260518 TO summary_publications;
   ```
   Then revert the API to the pre-C commit. Time: minutes.
2. **Hard rollback** (no snapshot available): re-add the dropped columns, then
   re-run the old `sp_build_summary_publications` to repopulate. Multi-hour outage.
   This is why Phase 0 keeps the snapshot.

### From Phase 4 (Sphinx ingestion changed)

The Sphinx conf change is a single `sphinx-unified.conf` revert + reindex. The RT
index keeps working in either configuration.

---

## 9. What this study deliberately does not change

- `summary_venues` (40 MB total) — leave as-is. The text corpus is small, the score
  index is load-bearing, and the table is small enough that the per-byte argument
  doesn't apply.
- `summary_persons` (1.55 GB total) — leave as-is for this intervention. Section 1.4
  of the diagnostic flagged three dead columns; clean those up in a separate request
  (intervention A scope).
- `publications_rt` schema — unchanged. Only its data source changes (via the refresh
  procedure).
- `cache.service.js` — only the cache *key versions* are bumped; the caching
  mechanism is unchanged.
- Response contracts at the wire level — DTO output is byte-identical (modulo the
  free `position` / `is_corresponding` enrichment on authors which existing clients
  will silently absorb).

---

## 10. Estimated work breakdown

| Phase | Owner    | Effort                                    |
| ----- | -------- | ----------------------------------------- |
| 0     | Operator | 30 min (snapshot)                         |
| 1     | API      | ~3 days (38 touchpoints + hydration helpers + tests) |
| 2     | Both     | 7 days soak                               |
| 3     | Operator | ~1 h ALTER + ~30 min OPTIMIZE + procedure rewrite |
| 4     | Operator | ~2 h reindex (manual, off-peak)           |
| 5     | Both     | 14 days soak + 1 min drop                 |

**Net engineering cost:** ~3-4 days of API work, ~3-4 h of operator time.
**Net disk recovered:** ~14.5 GB on the live MariaDB volume.
**Net schema clarity:** 8 dead columns + 2 redundant FT indexes + 3 redundant JSON
columns eliminated.

---

## 11. Decision

This study is not itself a request to execute. The operator should review and
green-light Phase 0 + Phase 1 explicitly. Phase 3 (the DDL) requires a separate
authorisation. Phase 4 (heavy indexing) requires a manual trigger per the agent
rule in CLAUDE.md.
