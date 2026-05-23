# 2026-05-23 — Dissolve all `summary_*` tables into the base tables

Status: **Operator action requested.** A single, coordinated structural change that
retires `summary_publications` (14.69 GB), `summary_persons` (1.63 GB), and
`summary_venues` (48 MB) by absorbing the columns and FULLTEXT indexes the API
actually needs into the four base tables (`works`, `publications`, `persons`,
`venues`). The API loses its dependency on the summary layer; every read goes
straight to the entity that owns the data.

Why this file replaces the four prior `calls/` requests: the slim/intervention path
files were incremental — each one trimmed a single table while keeping the parallel
summary architecture. The data is conclusive that the parallel architecture itself
is the waste:

- `summary_venues` ≡ `venues` (0 mismatches on `works_count`, `cited_by_count`,
  `total_score` across all 34,090 venues).
- `summary_persons` ≡ `persons` (20,317 mismatches on `total_works` in 4,562,331
  rows, 0.45 % — refresh lag, not schema divergence).
- `summary_publications` is a per-publication denormalised mirror in which the only
  unique payloads are the metadata FULLTEXT corpus (`authors_search`,
  `subjects_search`) and three derived flags — and the metadata corpus is **work-
  level**, not publication-level (110,762 / 110,762 multi-publication works carry
  identical values across their siblings).

The dissolution recovers ~14 GB net and removes the operator-side orchestration
that builds and refreshes the summaries.

---

## 1. Measured redundancy

### 1.1 `summary_venues` vs `venues`

```sql
SELECT
  SUM(v.works_count   <> COALESCE(sv.total_publications_count,0)) AS works_mismatch,
  SUM(v.cited_by_count<> COALESCE(sv.total_cited_by_count,0))     AS cited_mismatch,
  SUM(v.total_score   <> COALESCE(sv.global_ranking_score,0))     AS score_mismatch,
  COUNT(*) AS total
FROM venues v
LEFT JOIN summary_venues sv ON sv.venue_id = v.id;
-- works_mismatch=0  cited_mismatch=0  score_mismatch=0  total=34090
```

Every "ranking / metric" column duplicated in `summary_venues` already lives in
`venues` with the same value. The columns `name_search`, `abbrev_search`,
`publisher_search`, `venue_type`, `country_code`, `issn`, `eissn`, `scopus_id`,
`open_access_status`, `coverage_start_year`, `coverage_end_year`, `impact_factor`,
`citescore`, `sjr`, `snip`, `h_index`, `i10_index`, `two_yr_mean_citedness`,
`is_in_doaj`, `is_in_scielo`, `is_indexed_in_scopus`, `homepage_url`,
`validation_status` are all 1:1 duplicates of their `venues` counterparts (under
slightly different names where the column was renamed).

Net unique payload in `summary_venues`:

- `top_subjects_json` — top-10 subjects (derived from `venue_subjects + subjects`).
- `top_publications_json` — top-N publications by citations (derived from
  `publications + works`).
- `open_access_percentage` — derivable from `publications` aggregates.
- `score_breakdown_json` — composable on demand from the eight ranking columns
  already present on `venues` (`subject_score`, `oa_score`, `authorship_score`,
  `affiliation_score`, `citation_score`, `llm_score`, `llm_relevance`,
  `llm_justification`).
- `ft_summary_venues_text` (FULLTEXT over `name_search + abbrev_search +
  publisher_search`) — `venues` has no FULLTEXT today.

### 1.2 `summary_persons` vs `persons`

```sql
SELECT
  SUM(p.total_works     <> COALESCE(sp.total_publications_count,0)) AS works_mismatch,
  SUM(p.total_citations <> COALESCE(sp.total_citations_count,0))    AS citations_mismatch,
  COUNT(*) AS total
FROM persons p
LEFT JOIN summary_persons sp ON sp.person_id = p.id;
-- works_mismatch=20317  citations_mismatch=1135  total=4562331
```

`persons` already carries `total_works`, `total_citations`, `h_index`,
`first_publication_year`, `latest_publication_year`, `corresponding_author_count`,
`is_verified`, `signature_id`, `normalized_name`, `preferred_name`, `family_name`,
`given_names`, `orcid`, `scopus_id`, `lattes_id`, plus a FULLTEXT
`ft_persons_names (preferred_name, given_names, family_name)`. The 20K-row drift
is refresh lag in the summary build, not data the summary owns. Every column in
`summary_persons` is either a duplicate of one already on `persons` or empty in
the corpus (`signature_text`, `normalized_name`, `name_variations_search`,
`top_collaborators_json`, `research_subjects_json` are 100 % empty;
`affiliations_search` and `current_affiliations_json` are 60 % filled but
unread by the API).

Net unique payload in `summary_persons`: **none** that the API actually consumes.

### 1.3 `summary_publications` vs `publications + works`

`publications` already carries: `work_id`, `venue_id`, `publisher_id`, `doi (UQ)`,
`publication_date`, `volume`, `issue`, `pages`, `open_access`, `peer_reviewed`,
`source`, `license_url`, `license_version`, `year` (generated), and all 17
identifier columns (`isbn`, `arxiv`, `pmid`, `pmcid`, `wos_id`, `handle`,
`wikidata_id`, `openalex_id`, `scielo_pid`, `openlibrary_id`, `asin`,
`google_book_id`, `mag_id`, `ddc`, `lcc`, `udc`, `lbc`).

`works` already carries: `title`, `subtitle`, `abstract`, `work_type`, `language`,
`reference_count`, `citation_count`, `download_count`, `view_count`,
`altmetric_score`, `social_media_mentions`, `news_mentions`, `metrics_last_updated`,
plus FULLTEXT `ft_works_content (title, subtitle, abstract)` and B-tree
`idx_works_citation_count (citation_count DESC)`.

What `summary_publications` adds that base tables don't have:

| Column in `summary_publications`            | Origin / status                        |
| ------------------------------------------- | -------------------------------------- |
| `title_search`, `abstract_search`           | duplicates `works.title` / `works.abstract` — `ft_works_content` already covers them |
| `authors_search`                            | derived `GROUP_CONCAT(persons.preferred_name)` per work — **unique payload, work-level** (110,762/110,762 multi-pub works identical across siblings) |
| `subjects_search`                           | derived `GROUP_CONCAT(subjects.term)` per work — **unique payload, work-level** |
| `venue_search`                              | duplicates `venues.name` — JOIN works fine |
| `work_type`, `language`                     | duplicates `works.work_type` / `works.language` |
| `publication_year`                          | duplicates `publications.year` (generated) |
| `publication_date`, `volume`, `issue`, `pages_text`, `source`, `license_url`, `license_version` | duplicates `publications.publication_date` / `volume` / `issue` / `pages` / `source` / `license_url` / `license_version` — **AND permanently NULL** in the corpus (build procedure never populates them) |
| `open_access`, `peer_reviewed`              | duplicates `publications.open_access` / `peer_reviewed` |
| `work_citation_count`, `work_reference_count` | duplicates `works.citation_count` / `works.reference_count` |
| `has_files`, `has_scimag_file`, `has_libgen_file` | derived flags from `files` |
| `publication_download_count`                | derived `SUM(files.download_count)` — **permanently 0** in the corpus (build bug) |
| `authors_json`                              | derived JSON from `authorships + persons` |
| `subjects_json`                             | derived JSON from `work_subjects + subjects` |
| `files_json`                                | derived JSON from `files` |
| `identifiers_json`                          | **permanently NULL** in the corpus |
| `ft_summary_pubs_content (title_search, abstract_search)` | duplicates `works.ft_works_content` |
| `ft_summary_pubs_metadata (authors_search, venue_search, subjects_search)` | **unique** — no equivalent on base |
| `summary_updated_at`                        | refresh timestamp, only useful if the table exists |

The unique payload reduces to: two work-level text columns (`authors_search`,
`subjects_search`), one FULLTEXT index over those two, and three convenience
flags on files (`has_files`, `has_scimag_file`, `has_libgen_file`).
**Everything else is duplication.**

### 1.4 Footprint snapshot (2026-05-23)

| Table                  | Rows       | Data MB  | Index MB | Total MB | FT aux (innodb_sys_tablespaces) |
| ---------------------- | ---------- | -------- | -------- | -------- | ------------------------------- |
| summary_publications   | 7,634,025  | 13,486.0 | 1,201.5  | 14,687.5 | ~10,696 MB (2 FT indexes)        |
| summary_persons        | 4,562,331  | 1,269.0  | 365.2    | 1,634.2  | ~108 MB                          |
| summary_venues         | 34,090     | 44.6     | 3.9      | 48.5     | (small)                          |
| works                  | 5,546,016  | 6,239.0  | 1,774.0  | 8,013.0  | included in `ft_works_content`   |
| publications           | 6,455,270  | 1,208.0  | 3,359.4  | 4,567.4  | —                                |
| persons                | 4,562,331  | 575.0    | 1,583.7  | 2,158.7  | included in `ft_persons_names`   |
| venues                 | 34,090     | small    | small    | ~40      | —                                |

**Sum of `summary_*`: ~16,370 MB + ~10,800 MB FT auxiliary ≈ 27.2 GB to retire.**

---

## 2. Target shape — what stays where

### 2.1 `works` (the parent of search)

Add the only two columns `summary_publications` carried that didn't already exist
elsewhere, plus a FULLTEXT index on them, plus the operator-maintained metric
columns the existing `idx_works_citation_count` already exposes:

```sql
ALTER TABLE works
  ADD COLUMN authors_search   MEDIUMTEXT DEFAULT NULL,
  ADD COLUMN subjects_search  MEDIUMTEXT DEFAULT NULL,
  ADD FULLTEXT KEY ft_works_metadata (authors_search, subjects_search);
```

Projected size add:
- `authors_search`: 210 MB (work-level, derived from `authorships + persons`)
- `subjects_search`: 1,065 MB (work-level, derived from `work_subjects + subjects`)
- FT aux for `ft_works_metadata`: ~1.0 GB
- Total add to `works`: **~2.3 GB**

No change to existing `works.citation_count`, `reference_count`, `download_count`,
`altmetric_score`, `view_count`, `social_media_mentions`, `news_mentions`,
`metrics_last_updated` — they already carry the metrics `summary_publications`
duplicated.

### 2.2 `publications` (the per-publication record)

Zero schema change. `publications` already owns every per-publication field the
API needs (DOI, year, volume, issue, pages, license, open_access, peer_reviewed,
source, 17 identifier columns). The current `idx_publications_work_year`,
`idx_publications_venue_year_oa`, `idx_publications_work_year_id`,
`idx_publications_publisher_year` cover every listing predicate the API issues.

### 2.3 `persons`

Zero schema change in the minimal plan — `persons` already carries `total_works`,
`total_citations`, `h_index`, `first_publication_year`, `latest_publication_year`,
`corresponding_author_count`, `is_verified`, plus
`ft_persons_names (preferred_name, given_names, family_name)`. The
`/persons/{id}/collaborators` endpoint stays on its current self-join over
`authorships` (no JSON cache added — the data path works without it, and the
proposal scope is "drop, not add").

### 2.4 `venues`

Add only the FULLTEXT that `summary_venues` carried and that `venues` doesn't:

```sql
ALTER TABLE venues
  ADD FULLTEXT KEY ft_venues_search (name, abbreviated_name);
```

Optionally, two JSON caches whose sole purpose is response shaping (not search) —
**recommended to skip in the first pass** and add only if response-time monitoring
shows them necessary:

```sql
-- Optional, defer until measured:
ALTER TABLE venues
  ADD COLUMN top_subjects_json     LONGTEXT DEFAULT NULL
    CHECK (top_subjects_json IS NULL OR JSON_VALID(top_subjects_json)),
  ADD COLUMN top_publications_json LONGTEXT DEFAULT NULL
    CHECK (top_publications_json IS NULL OR JSON_VALID(top_publications_json));
```

Projected size add to `venues`: ~5 MB without the JSON caches; ~15 MB with them.

### 2.5 No new tables, no surviving summary

`summary_publications`, `summary_persons`, `summary_venues` are dropped entirely
in Phase 4. No `summary_*` table exists after this change.

### 2.6 Files stay in `files`

`files.has_files`, `has_scimag_file`, `has_libgen_file`, `files_json`,
`publication_download_count` do **not** migrate anywhere. They are consulted only
by `/works/:id` and `/publications/:id`, both of which already issue a live JOIN
against the `files` base table (the existing "defensive workaround" path becomes
the only path). No new column is needed on `publications`.

---

## 3. Search engine after dissolution

The single search query the API issues today is:

```sql
-- current: free text + author/venue/subject filters, single table
SELECT … FROM summary_publications sp
WHERE MATCH(sp.title_search, sp.abstract_search) AGAINST (? IN BOOLEAN MODE)
  AND MATCH(sp.authors_search, sp.venue_search, sp.subjects_search) AGAINST (? IN BOOLEAN MODE);
```

After dissolution it becomes:

```sql
-- proposed: free text + author/subject on works; venue via JOIN
SELECT … FROM works w
JOIN publications p ON p.work_id = w.id
LEFT JOIN venues v ON v.id = p.venue_id
WHERE MATCH(w.title, w.subtitle, w.abstract) AGAINST (? IN BOOLEAN MODE)
  AND MATCH(w.authors_search, w.subjects_search) AGAINST (? IN BOOLEAN MODE)
  AND (? IS NULL OR MATCH(v.name, v.abbreviated_name) AGAINST (? IN BOOLEAN MODE));
```

Three FULLTEXT contracts:

| Contract                           | FT index                                              | Lives in   |
| ---------------------------------- | ----------------------------------------------------- | ---------- |
| Free-text `q`                      | `ft_works_content (title, subtitle, abstract)`        | `works` (existing) |
| `author` + `subject` filters       | `ft_works_metadata (authors_search, subjects_search)` | `works` (new) |
| `venue` filter                     | `ft_venues_search (name, abbreviated_name)`           | `venues` (new) |

The current `MATCH(authors_search, venue_search, subjects_search)` combined-field
trick disappears — every field lives in its own table, with one FT index per
table. The "AND every token" semantics (`+token1 +token2 …` BOOLEAN MODE) stay
identical and continue to work per-index.

The author / subject corpus is now stored once per work instead of replicated
across every publication of that work — the corpus shrinks by the duplication
factor (~37 % of `summary_publications.subjects_search` is sibling-replication
according to `(7.6M pubs - 5.5M works) / 5.5M`).

---

## 4. DDL — what the operator runs

### Phase 0 — snapshots and baseline

```sql
-- baseline for recovery measurement
SELECT
  ROUND(SUM(DATA_LENGTH+INDEX_LENGTH)/1024/1024,1) AS mb_before
FROM information_schema.TABLES
WHERE TABLE_SCHEMA='data'
  AND TABLE_NAME IN ('summary_publications','summary_persons','summary_venues',
                     'works','publications','persons','venues');

-- snapshots of every summary_* (filesystem snapshot or mariadb-dump per table)
mariadb-dump --single-transaction --no-create-info data summary_publications \
  > /backup/2026-05-23_summary_publications.sql
mariadb-dump --single-transaction --no-create-info data summary_persons     \
  > /backup/2026-05-23_summary_persons.sql
mariadb-dump --single-transaction --no-create-info data summary_venues      \
  > /backup/2026-05-23_summary_venues.sql
```

### Phase 1 — populate the new `works` text columns from the source tables

```sql
ALTER TABLE works
  ADD COLUMN authors_search   MEDIUMTEXT DEFAULT NULL,
  ADD COLUMN subjects_search  MEDIUMTEXT DEFAULT NULL;

-- populate authors_search (work-level)
UPDATE works w
LEFT JOIN (
  SELECT a.work_id,
         GROUP_CONCAT(p.preferred_name ORDER BY a.position SEPARATOR ' ') AS s
  FROM authorships a
  INNER JOIN persons p ON p.id = a.person_id
  GROUP BY a.work_id
) AS src ON src.work_id = w.id
SET w.authors_search = src.s;

-- populate subjects_search (work-level)
UPDATE works w
LEFT JOIN (
  SELECT ws.work_id,
         GROUP_CONCAT(s.term SEPARATOR ' ') AS s
  FROM work_subjects ws
  INNER JOIN subjects s ON s.id = ws.subject_id
  GROUP BY ws.work_id
) AS src ON src.work_id = w.id
SET w.subjects_search = src.s;
```

Notes:
- Both `UPDATE … LEFT JOIN` statements are heavy. Run during low-traffic window;
  expect 10-30 min each on the live volume.
- Both run safely with `READ_COMMITTED` isolation and a single transaction.
- If batching is preferred, the operator can wrap in a procedure that walks
  `works.id` in 50 K-row chunks.

### Phase 2 — add the FULLTEXT indexes

```sql
ALTER TABLE works
  ADD FULLTEXT KEY ft_works_metadata (authors_search, subjects_search);

ALTER TABLE venues
  ADD FULLTEXT KEY ft_venues_search (name, abbreviated_name);
```

InnoDB locks the table SHARED for FULLTEXT creation. Schedule a maintenance
window for `works` (5.5 M rows + ~1 GB corpus) and a much shorter one for
`venues` (34 K rows).

### Phase 3 — refresh `persons` aggregates from the summary (catch the 20 K drift)

```sql
UPDATE persons p
LEFT JOIN summary_persons sp ON sp.person_id = p.id
SET p.total_works              = COALESCE(sp.total_publications_count, p.total_works),
    p.total_citations          = COALESCE(sp.total_citations_count,    p.total_citations),
    p.h_index                  = COALESCE(sp.h_index,                  p.h_index),
    p.first_publication_year   = COALESCE(sp.first_publication_year,   p.first_publication_year),
    p.latest_publication_year  = COALESCE(sp.latest_publication_year,  p.latest_publication_year)
WHERE COALESCE(sp.total_publications_count,0) <> p.total_works
   OR COALESCE(sp.total_citations_count,0)    <> p.total_citations;
```

Affects ~20 K rows.

### Phase 4 — drop the three summary tables

```sql
DROP TABLE summary_publications;
DROP TABLE summary_persons;
DROP TABLE summary_venues;
```

This frees the 27.2 GB (data + index + FT auxiliary). No `OPTIMIZE` needed on the
parent tables since nothing was touched on disk yet for them.

### Phase 5 — `OPTIMIZE` + `ANALYZE` the modified base tables

```sql
OPTIMIZE TABLE works;
ANALYZE TABLE works, publications, persons, venues;
```

### Phase 6 — retire the build procedures

The orchestration that builds the summaries becomes dead code on the operator
side. Drop:

```sql
DROP PROCEDURE sp_build_summary_publications;
DROP PROCEDURE sp_build_summary_persons;
DROP PROCEDURE sp_build_summary_venues;
DROP PROCEDURE sp_append_summary_publications;
DROP PROCEDURE sp_append_summary_persons;
DROP PROCEDURE sp_append_summary_venues;
DROP PROCEDURE sp_orchestrate_all_summaries;
DROP PROCEDURE sp_orchestrate_append_summaries;
DROP PROCEDURE sp_refresh_summary_publications_for_work;
DROP PROCEDURE sp_sync_summary_publication_files;
```

Replace `sp_refresh_summary_publications_for_work(p_work_id)` with a much smaller
`sp_refresh_work_search_fields(p_work_id)` that maintains the two new text
columns on a single work after mutations:

```sql
DELIMITER ;;
CREATE PROCEDURE sp_refresh_work_search_fields(IN p_work_id INT)
BEGIN
  UPDATE works w
  LEFT JOIN (
    SELECT a.work_id,
           GROUP_CONCAT(p.preferred_name ORDER BY a.position SEPARATOR ' ') AS s
    FROM authorships a INNER JOIN persons p ON p.id = a.person_id
    WHERE a.work_id = p_work_id
    GROUP BY a.work_id
  ) AS a_src ON a_src.work_id = w.id
  LEFT JOIN (
    SELECT ws.work_id,
           GROUP_CONCAT(s.term SEPARATOR ' ') AS s
    FROM work_subjects ws INNER JOIN subjects s ON s.id = ws.subject_id
    WHERE ws.work_id = p_work_id
    GROUP BY ws.work_id
  ) AS s_src ON s_src.work_id = w.id
  SET w.authors_search  = a_src.s,
      w.subjects_search = s_src.s
  WHERE w.id = p_work_id;
END;;
DELIMITER ;
```

The operator's mutation pipeline calls this after writes to
`authorships`/`work_subjects`/`persons`/`subjects` instead of the
`summary_publications` rebuild.

### Phase 7 — regenerate the schema dump

```bash
./scripts/maintenance/publications/regenerate_schema_dump.sh data database/data.schema.sql
```

---

## 5. API changes — per-file mapping

15 source files reference `summary_*`. Every one is edited in a single sweep on
the application side (not in this `calls/` file, but listed here for the operator
to know what the API will look like after):

| File                                           | Old (summary_*)                                                                                                                   | New (base tables)                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/works.service.js`                | `FROM summary_publications sp LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id`                                            | `FROM works w INNER JOIN publications p ON p.work_id = w.id LEFT JOIN venues v ON v.id = p.venue_id` |
|                                                | `sp.title_search`, `sp.abstract_search`, `sp.work_type`, `sp.language`, `sp.publication_year`, `sp.work_citation_count`, ...        | `w.title`, `w.abstract`, `w.work_type`, `w.language`, `p.year`, `w.citation_count`, ...                                                                  |
|                                                | `MATCH(sp.title_search, sp.abstract_search) AGAINST(...)`                                                                          | `MATCH(w.title, w.subtitle, w.abstract) AGAINST(...)`                                                                                                    |
|                                                | `MATCH(sp.authors_search, sp.venue_search, sp.subjects_search) AGAINST(...)`                                                       | `MATCH(w.authors_search, w.subjects_search) AGAINST(...)` plus optional `MATCH(v.name, v.abbreviated_name) AGAINST(...)`                                 |
|                                                | `sp.authors_json`, `sp.subjects_json`                                                                                              | `JSON_ARRAYAGG(...)` over `authorships+persons` and `work_subjects+subjects` in a dedicated hydration helper (~15 ms per 20-row page on indexed joins). |
|                                                | live files JOIN (`SELECT … FROM files WHERE publication_id IN (…) LIMIT 500`)                                                      | unchanged — this path already exists                                                                                                                     |
| `src/services/publications.service.js`         | `FROM summary_publications sp LEFT JOIN summary_venues sv …`                                                                       | `FROM publications p INNER JOIN works w ON w.id = p.work_id LEFT JOIN venues v ON v.id = p.venue_id`                                                     |
| `src/services/persons.service.js`              | `LEFT JOIN summary_publications sp_a ON sp_a.publication_id = (SELECT MAX(publication_id) FROM summary_publications WHERE work_id = w.id)` | `LEFT JOIN publications p ON p.id = (SELECT MAX(id) FROM publications WHERE work_id = w.id)` plus `JOIN works w ON w.id = a.work_id`                     |
|                                                | `FROM summary_persons sp` (not present after dissolution)                                                                          | reads `persons` directly (`total_works`, `total_citations`, etc.)                                                                                        |
| `src/services/venues.service.js`               | `FROM summary_venues sv LEFT JOIN venues v …`                                                                                      | `FROM venues v LEFT JOIN organizations pub ON pub.id = v.publisher_id`                                                                                   |
|                                                | `sv.name_search`, `sv.abbrev_search`, `sv.venue_type`, `sv.total_publications_count`, `sv.total_cited_by_count`, `sv.global_ranking_score`, `sv.open_access_status` | `v.name`, `v.abbreviated_name`, `v.type`, `v.works_count`, `v.cited_by_count`, `v.total_score`, `v.open_access`                                          |
|                                                | `sv.score_breakdown_json`                                                                                                          | inline `JSON_OBJECT('subject', v.subject_score, 'oa', v.oa_score, 'authorship', v.authorship_score, 'affiliation', v.affiliation_score, 'citation', v.citation_score, 'llm', v.llm_score, 'llm_relevance', v.llm_relevance, 'llm_justification', v.llm_justification)` |
|                                                | `sv.top_subjects_json`, `sv.top_publications_json`                                                                                 | computed on detail page via `venue_subjects + subjects` / `publications + works` JOIN with `LIMIT 10`                                                    |
| `src/services/metrics.service.js`              | `FROM summary_persons sp ORDER BY sp.total_publications_count DESC`                                                                | `FROM persons p WHERE p.total_works > 0 ORDER BY p.total_works DESC, p.total_citations DESC` (uses existing `idx_persons_total_works`)                   |
|                                                | `FROM summary_venues sv ORDER BY sv.total_publications_count DESC`                                                                 | `FROM venues v WHERE v.works_count > 0 ORDER BY v.works_count DESC` (uses existing `idx_venues_total_score` after Phase 2)                                |
| `src/services/autocomplete.service.js`         | `MATCH(sp.title_search, sp.abstract_search) AGAINST (:q IN BOOLEAN MODE)`                                                          | `MATCH(w.title, w.subtitle, w.abstract) AGAINST (:q IN BOOLEAN MODE)` against `works`                                                                    |
| `src/services/signatures.service.js`           | `LEFT JOIN summary_publications sp ON sp.publication_id = (SELECT MAX(...) FROM summary_publications WHERE work_id = w.id)`         | `LEFT JOIN publications p ON p.id = (SELECT MAX(id) FROM publications WHERE work_id = w.id)`                                                             |
| `src/services/courses.service.js`              | `LEFT JOIN summary_publications sp_a ON ...`                                                                                       | same shape, retargeted to `publications`                                                                                                                  |
| `src/services/instructors.service.js`          | same                                                                                                                               | same                                                                                                                                                     |
| `src/services/bibliography.service.js`         | same                                                                                                                               | same                                                                                                                                                     |
| `src/services/citations.service.js`            | `LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id`                                                                          | `LEFT JOIN venues v ON v.id = p.venue_id`                                                                                                                |
| `src/services/organizations.service.js`        | `LEFT JOIN summary_venues sv ON sv.venue_id = v.id`                                                                                 | drop the join (use `v` directly)                                                                                                                          |
| `src/services/publications.service.js` (DTO bits) | hydrates `authors_json`, `subjects_json`, `files_json` from `summary_publications`                                                | hydration helper: `authors_json` from `authorships+persons`, `subjects_json` from `work_subjects+subjects`, `files_json` from `files` (live join, already exists) |
| `src/routes/*` (JSDoc)                         | references to `summary_publications` / `summary_venues` / `summary_persons`                                                        | replace with the base-table names                                                                                                                         |
| `CLAUDE.md`                                    | "Summary architecture" + "Summary lifecycle" sections                                                                              | replaced with "Base-table architecture" describing the four FULLTEXT contracts and the absence of any `summary_*` layer                                  |

The API contract on the wire stays byte-identical except for `meta.engine` which
already reports `"MariaDB"`.

---

## 6. Verification plan

### 6.1 Read parity (must return identical numbers before / after on the same dataset)

```sql
-- /metrics/persons top-20 (using persons directly after Phase 3 catch-up)
SELECT id, preferred_name, orcid, is_verified,
       total_works, total_citations,
       first_publication_year, latest_publication_year
FROM persons
WHERE total_works > 0
ORDER BY total_works DESC, total_citations DESC
LIMIT 20;
-- expected: identical IDs to the pre-change /metrics/persons output

-- /metrics/venues top-20
SELECT v.id, v.name, v.abbreviated_name, v.type,
       v.works_count, v.cited_by_count, v.total_score
FROM venues v
WHERE v.works_count > 0
ORDER BY v.works_count DESC
LIMIT 20;
-- expected: identical to current /metrics/venues

-- /search/works token-level parity (FT clauses on works + venues)
SELECT COUNT(*) FROM works w
WHERE MATCH(w.title, w.subtitle, w.abstract) AGAINST ('+anthropology' IN BOOLEAN MODE);
SELECT COUNT(*) FROM works w
WHERE MATCH(w.authors_search, w.subjects_search) AGAINST ('+geertz' IN BOOLEAN MODE);
-- expected: counts within ±0.1 % of the pre-change summary_publications hits
```

### 6.2 EXPLAIN checks

```sql
EXPLAIN SELECT … FROM works w
JOIN publications p ON p.work_id = w.id
WHERE MATCH(w.title, w.subtitle, w.abstract) AGAINST ('?' IN BOOLEAN MODE)
LIMIT 20;
-- expected: type=fulltext on w + ref=p.work_id on p; no filesort
```

### 6.3 Disk recovery assertion

```sql
SELECT
  ROUND(SUM(DATA_LENGTH+INDEX_LENGTH)/1024/1024,1) AS mb_after
FROM information_schema.TABLES
WHERE TABLE_SCHEMA='data'
  AND TABLE_NAME IN ('works','publications','persons','venues');
-- expected: ~14,800 MB before  →  ~17,100 MB after (works +2.3 GB)
-- and summary_* gone (-16.4 GB) plus FT aux drop (-10.7 GB) = net ~ -14 GB freed.
```

### 6.4 API smoke

```bash
PORT=1210 NODE_ENV=production node src/app.js &
INTEGRATION_BASE_URL=http://localhost:1210 \
INTEGRATION_ACCESS_KEY="$API_KEY" \
npm run test:integration
# expected: 21/21 passing; payload shape unchanged for every endpoint that
# previously returned data shaped by summary_*.
```

### 6.5 Search latency budget

`/search/works`, `/search/advanced`, `/publications?q=...` must keep p95 latency
within 1.5× of the pre-change baseline. If any endpoint regresses past 2×, the
fallback is **option (b) below** — restore the slim `summary_publications` shape
described in the original `2026-05-18_intervention_C_thin_summary_publications.md`
(now reverted). Measurement must happen on the post-change snapshot before
Phase 6 (procedure drops) is authorised.

---

## 7. Risks and rollback

| Risk                                                                  | Likelihood / Impact | Mitigation                                                       |
| --------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------- |
| `UPDATE … LEFT JOIN` to populate `works.authors_search` is slow       | Medium / Medium     | Run in chunks of 50 K work IDs; monitor for replication lag      |
| `ALTER … ADD FULLTEXT` locks `works` SHARED                            | Medium / Medium     | Maintenance window of ~5-10 minutes                              |
| Search latency regresses past budget after multi-table FT path        | Low / High          | Restore-from-snapshot path (Phase 0 dumps); revert all DDL       |
| Operator pipeline writes still call `sp_orchestrate_all_summaries`    | Medium / High       | Phase 6 must wait until the pipeline is updated and verified     |
| `JSON_ARRAYAGG` per-page hydration on `/works` and `/publications` is slower than current denormalised JSON | Low / Medium        | Pre-measure on dev snapshot; add per-work cache key in Redis     |
| Pagination `total` budgets exceed 6 s on JOIN-heavy listings          | Medium / Medium     | Keep the existing `SET STATEMENT max_statement_time` + estimate-fallback path; tighten `LIMIT` defaults if needed |
| Downstream consumers (outside this repo) read `summary_*` directly    | Low / High          | Phase 0 dumps + a 14-day soak between Phase 4 (DROP) and Phase 6 (PROCEDURE DROP); keep the dumps for 30 days |

Rollback:

1. If Phase 1-2 (column adds + FT) regress search badly: drop the new columns,
   drop the new FT, revert API to read from `summary_*` (still present).
2. If Phase 4 (DROP TABLE) has been executed and a regression appears: restore
   each summary from its Phase 0 dump (`RENAME` swap into place), revert the API
   commit that retargeted to base tables.
3. If Phase 6 (DROP PROCEDURE) has been executed: restore the procedures from the
   schema-history backup in `database/data.schema.sql` (the file kept in git
   tracks the historic procedure definitions; the operator can `SOURCE` the
   relevant block).

---

## 8. Decision gates

Four discrete authorisations the operator should give explicitly:

1. **Phase 0+1+2+3 (snapshots + works text columns + FT + persons drift catch-up)**
   — additive, non-destructive. The summary tables still exist. Safe to soak for
   2-7 days while the API is dual-pathed (reads still come from summary_* during
   this window; the new fields are populated and indexed but unused).
2. **API switchover** — the application change that retargets every service from
   `summary_*` to base tables. Roll out on port 1210 first; integration smoke must
   pass before promotion to 1211.
3. **Phase 4+5 (DROP TABLE summary_* + OPTIMIZE / ANALYZE)** — destructive on the
   summary tables themselves. Keep the Phase 0 dumps for 30 days.
4. **Phase 6+7 (DROP PROCEDURE summary_* builders + regenerate schema dump)** —
   removes the operator-side orchestration. Must wait until the operator's
   mutation pipeline is updated to call `sp_refresh_work_search_fields` instead.

Holding back any gate stops the request at that boundary; the remaining gates can
be deferred to follow-up requests.
