# 2026-05-23 — Slim down `summary_persons` to the columns the API actually reads

Status: **Operator action requested.** Phase A is a structural change on `summary_persons`
(drop dead columns, drop the unused FULLTEXT index, drop two unused B-tree indexes); the
API survives unchanged. Phase B is the deliberately rejected alternative ("replace
`summary_persons` with direct queries") — documented so the trade-off is on record.

Why now: with the Sphinx removal (2026-05-23 refactor) the read path of the API is
fully MariaDB-only. That makes it possible — and useful — to audit each summary table
against the actual queries the API issues, and to drop everything that has no reader.
The audit answers three questions: (1) which `summary_*` tables and columns the API
reads; (2) what real gain in disk / index / maintenance comes from removing the dead
parts; (3) whether the table can be retired entirely. The answers feed exactly one
operator request, restricted to `summary_persons`.

---

## 1. Read-side audit — what the API actually touches

Method: full grep of `src/` for every alias used (`sp`, `sp_a`, `sv`, `sv_filter`,
bare names) and every column name. Findings cross-checked against the live DB on
2026-05-23.

| Table                 | Distinct files that read it | API columns referenced | Columns defined | Coverage |
| --------------------- | --------------------------- | ---------------------- | --------------- | -------- |
| `summary_publications`| 17                          | 33                     | 33              | 100 %    |
| `summary_venues`      | 10                          | 33                     | 33              | 100 %    |
| `summary_persons`     | **1** (`metrics.service.js`)| **8**                  | 23              | **35 %** |

### 1.1 `summary_publications` — fully utilised by the read path

Every defined column is selected by at least one read query. Nine columns
(`publication_date`, `volume`, `issue`, `pages_text`, `source`, `license_url`,
`license_version`, `identifiers_json`, `publication_download_count`) are selected but
**always carry NULL / 0** because `sp_build_summary_publications` never populates them
— already documented in [`2026-05-18_summary_tables_diagnostic.md`](2026-05-18_summary_tables_diagnostic.md)
and addressed by [`2026-05-18_intervention_C_thin_summary_publications.md`](2026-05-18_intervention_C_thin_summary_publications.md).
**No additional request needed in this file** — the existing intervention C plan
already covers the column-level clean-up for `summary_publications`.

### 1.2 `summary_venues` — fully utilised, no waste

Every defined column has a reader; no column is always NULL; total footprint is
**48.5 MB** (44.6 MB data + 3.9 MB indexes) across 28,947 venues. There is nothing
to recover here. Leave as is.

### 1.3 `summary_persons` — 15 of 23 columns have no reader

API readers (only `src/services/metrics.service.js`, two functions):

```
person_id                    -- WHERE / GROUP BY
preferred_name_search        -- SELECT (rendered as person_name)
orcid                        -- SELECT
is_verified                  -- SELECT
total_publications_count     -- SELECT + WHERE / ORDER BY (sort key)
total_citations_count        -- SELECT + ORDER BY (secondary sort)
first_publication_year       -- SELECT
latest_publication_year      -- SELECT
```

Columns with no reader anywhere in the API (and no reader in any procedure either —
verified with `grep` on `data.schema.sql`):

```
signature_id, signature_text, family_name, given_names, normalized_name,
name_variations_search, affiliations_search, scopus_id, lattes_id, h_index,
corresponding_author_count, current_affiliations_json, top_collaborators_json,
research_subjects_json, summary_updated_at
```

The associated unused secondary indexes are `idx_summary_persons_family_name`,
`idx_summary_persons_signature_text`, and the FULLTEXT `ft_summary_persons_text`
(over `preferred_name_search`, `name_variations_search`, `affiliations_search`).
None of them is referenced by `MATCH(...) AGAINST(...)` or by any equality / range
predicate anywhere in `src/`.

---

## 2. Real footprint — what slim-down actually recovers

### 2.1 Total disk

`information_schema.TABLES` snapshot, 2026-05-23:

| Table                  | Rows       | Data MB  | Index MB | Total MB |
| ---------------------- | ---------- | -------- | -------- | -------- |
| summary_publications   | 7,634,025  | 13,486.0 | 1,201.5  | 14,687.5 |
| summary_persons        | 3,413,577¹ | 1,269.0  | 365.2    | **1,634.2** |
| summary_venues         | 28,947     | 44.6     | 3.9      | 48.5     |

¹ `information_schema.TABLES.TABLE_ROWS` is an estimate. The exact `COUNT(*)` on
2026-05-23 is **4,562,331** rows.

### 2.2 Per-index decomposition (`summary_persons`)

`mysql.innodb_index_stats`, `size` = pages, page size = 16 KB:

| Index                                | Pages   | MB     | Used by API? | Action     |
| ------------------------------------ | ------- | ------ | ------------ | ---------- |
| PRIMARY (clustered = row data)       | 81,216  | 1,269  | yes (PK)     | keep       |
| idx_summary_persons_metrics          | 5,931   | 92.7   | yes (sort)¹  | replace²   |
| idx_summary_persons_orcid            | 6,511   | 101.7  | **no**³      | keep (defensive) |
| idx_summary_persons_family_name      | 2,981   | 46.6   | no           | **drop**   |
| idx_summary_persons_signature_text   | 2,981   | 46.6   | no           | **drop**   |
| FTS_DOC_ID_INDEX (FT aux header)     | 4,969   | 77.6   | no           | **drop** (with the FT index) |
| ft_summary_persons_text (FT aux)     | —⁴      | ~30    | no           | **drop**   |

¹ Used in the `ORDER BY` of both `/metrics/persons` and `/metrics/collaborations`,
but in the *wrong column order* — current index is
`(total_citations_count DESC, total_publications_count DESC)` while the API sorts by
`total_publications_count DESC` first. EXPLAIN shows the optimizer falls back to
`type=index` + `Using filesort`. Worth re-keying as
`(total_publications_count DESC, total_citations_count DESC)` so the sort is index-driven.

² Replace the existing `idx_summary_persons_metrics` with the correctly-ordered
version — same footprint, removes the filesort.

³ The API selects `sp.orcid` but never filters / joins on it. The B-tree on `orcid`
is therefore dead from the API's perspective. Keeping it is cheap (102 MB) and gives
the operator a fast lookup path for one-off ORCID checks; recommending to keep
unless space is critical.

⁴ FT auxiliary B-trees are not surfaced by `innodb_index_stats` per name. The
difference between the measured indexes (~1,633 MB) and the tablespace size
(1,664 MB on disk) places the FT auxiliary at ~30 MB — small because
`name_variations_search` is 0 % filled and `affiliations_search` is only 60 % filled.

### 2.3 Per-column byte cost (recoverable data MB)

`SUM(LENGTH(col))` snapshot, 2026-05-23:

| Column to drop                | Filled rows | Avg bytes when filled | Estimated MB |
| ----------------------------- | ----------- | --------------------- | ------------ |
| current_affiliations_json     | 2,763,677   | 217.5                 | **573.4**    |
| affiliations_search           | 2,763,677   | 70.3                  | **185.2**    |
| corresponding_author_count    | 4,562,331   | 4                     | 17.4         |
| h_index                       | 4,562,331   | 4                     | 17.4         |
| signature_id                  | 4,562,295   | 4                     | 17.4         |
| family_name                   | 0           | —                     | 0            |
| given_names                   | 0           | —                     | 0            |
| normalized_name               | 0           | —                     | 0            |
| signature_text                | 0           | —                     | 0            |
| name_variations_search        | 0           | —                     | 0            |
| top_collaborators_json        | 0           | —                     | 0            |
| research_subjects_json        | 0           | —                     | 0            |
| scopus_id                     | 0           | —                     | 0            |
| lattes_id                     | 1           | 16                    | ~0           |
| **Recoverable data**          |             |                       | **~810 MB**  |

### 2.4 Projected post-slim footprint

| Layer                                  | Before MB | After MB | Delta MB |
| -------------------------------------- | --------- | -------- | -------- |
| Data (row payload)                     | 1,269.0   | ~460     | -809     |
| idx_summary_persons_metrics            | 92.7      | ~93      | 0        |
| idx_summary_persons_orcid              | 101.7     | ~102     | 0        |
| idx_summary_persons_family_name        | 46.6      | 0        | -47      |
| idx_summary_persons_signature_text     | 46.6      | 0        | -47      |
| FT (header + aux)                      | ~108      | 0        | -108     |
| **Total**                              | **1,664** | **~655** | **-1,009** |

Recovered: **~1.0 GB** (60 % of the table). After this, `summary_persons` becomes a
thin attribute table whose only purpose is to feed the two `/metrics` aggregates —
which is exactly what the API treats it as.

---

## 3. Why not retire `summary_persons` entirely (the alternative)

The slim-down keeps the table because the alternative — recomputing the aggregates
from `persons` + `authorships` + `publications` on every request — is empirically too
slow. Measured on 2026-05-23 with `SQL_NO_CACHE`:

| Query path                                     | With `summary_persons` | Direct join over base tables |
| ---------------------------------------------- | ---------------------- | ----------------------------- |
| `/metrics/persons` top 20 (page 1)             | **0.82 s**             | **100.28 s** (125 × slower)  |
| `/metrics/collaborations` top-N pool (LIMIT 2000) | **0.68 s**             | **8.42 s** (12 × slower)     |

The direct paths force `GROUP BY person_id` over the 13.97 M-row `authorships` table
(plus `LEFT JOIN works` for citation totals), well past the 6 s server-side budget on
`/metrics/collaborations` and orders of magnitude over the `/metrics` SLA on
`/metrics/persons`. Caching cushions it for the second hit but every cache miss costs
the operator a minute and a half. Result: **summary_persons must stay** — it earns its
keep at ~650 MB once slimmed.

`summary_publications` and `summary_venues` are kept on the same logic; their
read-path coverage is 100 %, so there is no equivalent slim-down here.

---

## 4. Proposed change — DDL the operator should apply

**Phase 0 — pre-flight snapshot.** Confirm the row count and current size so post-apply
recovery can be measured against a fixed baseline:

```sql
SELECT COUNT(*) AS rows_before FROM summary_persons;
SELECT ROUND(SUM(DATA_LENGTH+INDEX_LENGTH)/1024/1024,1) AS mb_before
FROM information_schema.TABLES
WHERE TABLE_SCHEMA='data' AND TABLE_NAME='summary_persons';
```

**Phase 1 — drop the dead schema (one transactional ALTER, `ALGORITHM=INPLACE LOCK=NONE`
allowed for the column drops and for the non-FT index drops; the FULLTEXT drop forces
`ALGORITHM=INPLACE LOCK=SHARED` in InnoDB, so plan a short maintenance window):**

```sql
ALTER TABLE summary_persons
  DROP COLUMN signature_id,
  DROP COLUMN signature_text,
  DROP COLUMN family_name,
  DROP COLUMN given_names,
  DROP COLUMN normalized_name,
  DROP COLUMN name_variations_search,
  DROP COLUMN affiliations_search,
  DROP COLUMN scopus_id,
  DROP COLUMN lattes_id,
  DROP COLUMN h_index,
  DROP COLUMN corresponding_author_count,
  DROP COLUMN current_affiliations_json,
  DROP COLUMN top_collaborators_json,
  DROP COLUMN research_subjects_json,
  DROP COLUMN summary_updated_at,
  DROP INDEX idx_summary_persons_family_name,
  DROP INDEX idx_summary_persons_signature_text,
  DROP INDEX ft_summary_persons_text;
```

**Phase 2 — re-key the metrics index so the `/metrics/persons` ORDER BY stops doing a
filesort:**

```sql
ALTER TABLE summary_persons
  DROP INDEX idx_summary_persons_metrics,
  ADD INDEX idx_summary_persons_metrics
    (total_publications_count DESC, total_citations_count DESC);
```

**Phase 3 — reclaim free pages and refresh stats:**

```sql
OPTIMIZE TABLE summary_persons;
ANALYZE TABLE summary_persons;
```

**Phase 4 — update the build procedure.** `sp_build_summary_persons` must stop writing
to the dropped columns. The procedure currently sets every column on `INSERT`; remove
the columns from the `INSERT … SELECT` field list and remove the matching expressions.
This is operator-side; the API never calls the procedure. After updating, run a fresh
build on a dev snapshot first to confirm row counts match the pre-change baseline.

**Phase 5 — regenerate the schema dump.** Run
`./scripts/maintenance/publications/regenerate_schema_dump.sh data database/data.schema.sql`
so the committed `data.schema.sql` reflects the new shape.

---

## 5. Verification plan

Read parity (must return identical numbers before / after):

```sql
-- /metrics/persons top-20 stays identical
SELECT person_id, preferred_name_search, orcid, is_verified,
       total_publications_count, total_citations_count,
       first_publication_year, latest_publication_year
FROM summary_persons
WHERE total_publications_count > 0
ORDER BY total_publications_count DESC, total_citations_count DESC
LIMIT 20;

-- /metrics/collaborations top-2000 pool stays identical
SELECT person_id
FROM summary_persons
WHERE total_publications_count >= 30
ORDER BY total_publications_count DESC
LIMIT 2000;
```

EXPLAIN check (the metrics query should now hit the new index without `Using filesort`):

```sql
EXPLAIN SELECT person_id, preferred_name_search, orcid, is_verified,
               total_publications_count, total_citations_count,
               first_publication_year, latest_publication_year
        FROM summary_persons
        WHERE total_publications_count > 0
        ORDER BY total_publications_count DESC, total_citations_count DESC
        LIMIT 20;
-- expected: type=index, key=idx_summary_persons_metrics, Extra=Using where; Using index
```

Disk recovery:

```sql
SELECT ROUND(SUM(DATA_LENGTH+INDEX_LENGTH)/1024/1024,1) AS mb_after
FROM information_schema.TABLES
WHERE TABLE_SCHEMA='data' AND TABLE_NAME='summary_persons';
-- expected: ~655 MB (down from 1,664 MB)
```

API smoke (after applying):

```bash
PORT=1210 NODE_ENV=production node src/app.js &
INTEGRATION_BASE_URL=http://localhost:1210 \
INTEGRATION_ACCESS_KEY="$API_KEY" \
npm run test:integration
# expected: 21/21 passing, identical payload shapes for /metrics/persons.
```

---

## 6. Risks and rollback

| Risk                                                   | Likelihood / Impact | Mitigation                                      |
| ------------------------------------------------------ | ------------------- | ----------------------------------------------- |
| A downstream consumer (outside this repo) reads the dropped columns | Low / High          | Search shared infra dumps first; phase 0 backup |
| FT index drop holds a SHARED lock for a few seconds    | Medium / Low        | Apply in low-traffic window                     |
| Re-keying `idx_summary_persons_metrics` recreates the index in two passes | Low / Low           | Single ALTER groups DROP + ADD; no orphaning   |
| `OPTIMIZE TABLE` rebuilds the tablespace               | Medium / Low        | Plan ~15 min window; the table is 1.6 GB        |

Rollback: keep a `mariadb-dump --single-transaction summary_persons` snapshot from
Phase 0; if anything regresses, `DROP TABLE summary_persons` followed by `RENAME` of
the snapshot restores the pre-change state. No data is generated by the API for this
table — the operator pipeline owns it — so reverting is a pure restore.

---

## 7. Scope explicitly excluded from this file

- **`summary_publications`**: already covered by
  [`2026-05-18_intervention_C_thin_summary_publications.md`](2026-05-18_intervention_C_thin_summary_publications.md);
  this file does not duplicate that request.
- **`summary_venues`**: 100 % of columns have readers; total 48 MB; no action.
- **API-side code changes**: none required. The API selects only the eight kept
  columns. Re-running `npm test` and `npm run test:integration` after the apply
  should be green without code edits.

---

## 8. Decision gate

Three discrete authorisations the operator should give explicitly:

1. **Phase 1+2+3 (slim + re-key + OPTIMIZE)** — the structural change on
   `summary_persons`. Recovers ~1.0 GB and removes the filesort on `/metrics/persons`.
2. **Phase 4 (update `sp_build_summary_persons`)** — operator-pipeline code change.
   Without it, the next full rebuild will fail on missing columns.
3. **Phase 5 (regenerate `database/data.schema.sql`)** — repository commit, driven
   from the operator-side `regenerate_schema_dump.sh`.

If any of the three is held back, the request stops at that boundary and the rest is
deferred to a follow-up file.
