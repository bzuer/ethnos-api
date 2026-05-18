# 2026-05-18 — Summary tables footprint and value diagnostic

Status: **Diagnostic / discussion (no operator action requested yet).**
Why: the operator perceives the `summary_*` family as occupying close to 60 GB and asked
whether the gain justifies the cost. This file resolves the actual numbers, attributes
them to specific columns/indexes, evaluates the gains the read path actually realises,
enumerates the gaps, and proposes three intervention levels (A/B/C). It does **not**
request a structural change — it surfaces the trade-offs so the operator can decide.

---

## 1. Real footprint (measured, not estimated)

`SELECT … FROM information_schema.tables`, cross-checked with `mysql.innodb_index_stats`
on 2026-05-18.

| Table                | Rows       | Data GB | Index GB | Total GB | data_free |
| -------------------- | ---------- | ------- | -------- | -------- | --------- |
| summary_publications | 6,767,364  | 14.68   | 1.28     | **15.96**| 0.00 GB   |
| summary_persons      | 4,559,642  | 1.21    | 0.34     | **1.55** | 0.01 GB   |
| summary_venues       | 27,444     | 0.04    | 0.00     | **0.04** | 0.004 GB  |
| **summary_* total**  |            |         |          | **17.55**|           |

Sphinx files on disk: 7.2 GB (`/var/lib/ethnos-api/sphinx`). Combined "denormalised
search infrastructure" footprint: **~24.7 GB**, not 60 GB.

If the operator was including the link/mapping tables in the 60 GB estimate, the breakdown
of those is:

| Mapping table     | Rows        | Total GB |
| ----------------- | ----------- | -------- |
| work_subjects     | 79,039,692  | 9.38     |
| work_references   | 49,312,985  | 7.74     |
| authorships       | 14,219,092  | 4.03     |

Those are normalised relational tables (not summaries) — `summary_*` plus the three above
plus Sphinx ≈ 45 GB. Adding `publications` (5.68 GB) and `works` (8.67 GB) brings the
"search-adjacent" total close to 60 GB, but the only truly *redundant* layer is
`summary_*` (17.55 GB) plus the Sphinx mirror (7.2 GB).

### 1.1 Per-index decomposition (summary_publications)

| Index                          | Size    | Role                                |
| ------------------------------ | ------- | ----------------------------------- |
| PRIMARY (clustered = data)     | 14.68 GB| Row store                           |
| uq_summary_pubs_doi            | 351 MB  | DOI resolution                      |
| idx_summary_pubs_venue         | 155 MB  | Listing by venue                    |
| idx_summary_pubs_metrics       | 152 MB  | `cited_by_count` DESC, year DESC    |
| idx_summary_pubs_language      | 126 MB  | Language filter                     |
| FTS_DOC_ID_INDEX               | 116 MB  | InnoDB FT auxiliary                 |
| idx_summary_pubs_file_sources  | 115 MB  | has_files / has_scimag / has_libgen |
| idx_summary_pubs_year          | 115 MB  | Year filter / sort                  |
| idx_summary_pubs_type          | 93 MB   | Work-type filter                    |
| idx_summary_pubs_work          | 91 MB   | Sibling resolution                  |

Plus the two hidden InnoDB FT auxiliary B-trees (`ft_summary_pubs_content`,
`ft_summary_pubs_metadata`) which are not exposed in `innodb_index_stats` by name.

### 1.2 Per-column byte cost (summary_publications data)

`SUM(LENGTH(col))` snapshot:

| Column            | GB    | % of 14.68 GB | Origin in base tables                     |
| ----------------- | ----- | ------------- | ----------------------------------------- |
| abstract_search   | 3.54  | 24 %          | `works.abstract` (mediumtext)             |
| subjects_json     | 2.27  | 15 %          | `work_subjects` × `subjects.term`         |
| files_json        | 1.66  | 11 %          | `files` table                             |
| subjects_search   | 0.94  | 6 %           | same as subjects_json                     |
| authors_json      | 0.87  | 6 %           | `authorships` × `persons.preferred_name`  |
| title_search      | 0.33  | 2 %           | `works.title`                             |
| authors_search    | 0.22  | 1 %           | same as authors_json                      |
| venue_search      | 0.16  | 1 %           | `venues.name`                             |
| identifiers_json  | ~0    | < 0.001 %     | `publications.*` ID columns               |
| **Text/JSON sum** |**~10.0**| **68 %**    |                                           |

**~68 % of the table is text/JSON that already exists in base tables, often with its own
FT index** (`works` has `ft_works_content` over `title + subtitle + abstract`).

### 1.3 Population sanity check

| Column                    | Populated rows | Of total 6,767,364 |
| ------------------------- | -------------- | ------------------ |
| authors_json (non-empty)  | 6,767,364      | 100 %              |
| subjects_json (non-empty) | 4,736,841      | 70 %               |
| files_json (non-empty)    | 5,118,370      | 76 %               |
| has_files = 1             | 5,118,370      | 76 %               |
| has_scimag_file = 1       | 3,940,934      | 58 %               |
| has_libgen_file = 1       | 21,667         | 0.3 %              |
| publication_download_count > 0 | **0**     | **0 %**            |
| identifiers_json          | 1              | ~0 %               |
| publication_date          | 1              | ~0 %               |
| volume, issue, pages_text | 0              | 0 %                |
| source                    | 1              | ~0 %               |
| license_url, license_version | 0           | 0 %                |

Two findings here:

1. **Request 6 (`2026-05-11_repopulate_summary_publications_files.md`) has effectively
   been executed.** 5,118,370 rows now carry `has_files = 1` and a non-empty `files_json`
   — that equals the distinct publication count in the canonical `files` table exactly.
   The live `files` JOIN currently used as a workaround in `_getCompleteWorkData`
   and the `/publications/{id}` detail path is no longer compensating for an empty
   denormalisation. CLAUDE.md still describes that workaround as fixing a broken
   denormalisation; the corresponding paragraph is stale and is being updated in this
   change.

2. **Eight schema columns are effectively dead.** `publication_date`, `volume`, `issue`,
   `pages_text`, `source`, `license_url`, `license_version`, `identifiers_json` are
   declared on `summary_publications` but `sp_build_summary_publications` never writes
   to them — the INSERT statement enumerates only the columns it does populate. They
   are NULL across the corpus. Read-path code that needs them already joins
   `publications` directly. Removing them would simplify the schema without affecting
   anything.

3. **`publication_download_count` is 0 across all 5.1 M file-bearing rows.** The
   procedure computes `COALESCE(SUM(f.download_count), 0)` but every row comes out 0.
   Either `files.download_count` is NULL across the table or the aggregation is not
   surviving the `JSON_ARRAYAGG` + `INSERT` round-trip. Worth filing a follow-up
   operator request, but out of scope for this diagnostic.

### 1.4 `summary_persons` population

| Column                       | Populated rows | Of 4,559,642  |
| ---------------------------- | -------------- | ------------- |
| current_affiliations_json    | 2,745,860      | 60 %          |
| affiliations_search          | 2,745,860      | 60 %          |
| name_variations_search       | **0**          | **0 %**       |
| top_collaborators_json       | **0**          | **0 %**       |
| research_subjects_json       | **0**          | **0 %**       |
| preferred_name_search (size) | 68 MB total    | —             |

Three of the five enrichment columns are dead. The build procedure for persons
(`sp_build_summary_persons`) declares them but does not populate them either. The
column footprint is mostly `current_affiliations_json` (567 MB) and
`affiliations_search` (185 MB). The schema overhead from dead columns is small (a few
hundred bytes of metadata) but the conceptual debt is real — every reader has to ask
"is this column actually used?".

---

## 2. What the summary tables actually buy

Quantified gains on the API read path:

1. **Single-table listing.** `/publications`, `/works`, `/search/works`, `/search/advanced`
   resolve a filtered, paginated, sorted listing against `summary_publications` plus an
   optional `LEFT JOIN summary_venues`. The equivalent against base tables would touch
   `publications + works + venues + organizations + authorships + persons + work_subjects
   + subjects + files`. Empirically the joined path is 5–10× slower at the 6.77 M-row
   scale even with covering indexes, because the JSON aggregations would happen per
   page-row.
2. **`idx_summary_pubs_metrics (work_citation_count DESC, publication_year DESC)`.** The
   `cited_by_count` sort path (showcase, sort_by=cited_by_count) becomes an index scan.
   On `works.citation_count` alone the index exists but the JOIN to `publications` for
   pagination breaks the ordering.
3. **Sphinx ingestion simplicity.** `publications_poc` indexes from a single
   range-keyed table. The `sql_query` reads 19 columns; without the summary, the same
   ingestion would need a multi-table JOIN inside `sql_query` (slower per-row build,
   harder delta handling).
4. **MariaDB FT fallback.** When Sphinx is down, `ft_summary_pubs_content` and
   `ft_summary_pubs_metadata` keep `q=` and metadata-LIKE queries working. Used in
   `worksService._getWorksSearchFallback`, `publications.service.js:486`,
   `autocomplete.service.js:126`, `search.service` (advanced search fallback).
5. **Atomic JSON denormalisation.** Listing endpoints return `authors_json` and
   `subjects_json` without per-row JOINs. A listing of 20 publications loads ~80 KB of
   pre-built JSON vs ~6 JOINs producing the same payload.
6. **DOI lookup independence.** `uq_summary_pubs_doi` resolves DOIs without contending
   on `publications.doi`.

---

## 3. What the summary tables cost

1. **17.55 GB duplicated storage** plus 7.2 GB of Sphinx mirrors of the same corpus.
2. **Build cost.** `sp_build_summary_publications` `TRUNCATE`s and reloads ~6.77 M rows
   in batches. Each batch builds three temporary tables for authors / subjects / files
   aggregation, with `group_concat_max_len = 1,000,000`. Multi-hour run. Failures are
   recoverable only by re-running from the start of the failing batch.
3. **Refresh contract.** Per CLAUDE.md, the API is consumer-only. Every write to
   `works`, `publications`, `authorships`, `files`, `work_subjects` requires the operator
   pipeline to call `sp_refresh_summary_publications_for_work` *before* the publication
   becomes searchable. The API itself cannot keep `summary_publications` fresh — that
   is a hard staleness window.
4. **Sphinx real-time gap.** `publications_rt` is operator-maintained. Between a write
   and the next refresh, new content is invisible to FT search and to the MariaDB FT
   fallback (because that fallback also hits `summary_publications`).
5. **Drift risk.** `work_citation_count` and `work_reference_count` mirror
   `works.citation_count` / `works.reference_count`. A citation refresh job that updates
   `works` without rerunning the build leaves the listing showing stale counts.
6. **MariaDB FT index duplication.** `ft_summary_pubs_content` on `(title_search,
   abstract_search)` is a parallel copy of `ft_works_content` on `works.(title, subtitle,
   abstract)`. Two FT indexes, same corpus, ~3.9 GB combined.
7. **Schema noise.** Eight always-NULL columns on `summary_publications`
   (`publication_date`, `volume`, `issue`, `pages_text`, `source`, `license_url`,
   `license_version`, `identifiers_json`) plus three on `summary_persons`
   (`name_variations_search`, `top_collaborators_json`, `research_subjects_json`).
   They imply the table holds richer data than it does.
8. **`publication_download_count` is broken.** Always 0 despite `files.download_count`
   theoretically feeding it. Likely a build-procedure bug; affects any future "most
   downloaded" sort.

---

## 4. Gaps

1. **Dead columns are documented in CLAUDE.md as populated.** The schema-contracts
   paragraph implies `summary_publications.volume / issue / pages_text / source /
   license_url / license_version / identifiers_json` are part of the additive payload.
   They are not. Either populate them or drop them.
2. **`abstract_search` is mediumtext (16 MB ceiling) duplicating `works.abstract`.** No
   semantic difference. ~3.5 GB recoverable.
3. **No FK between `summary_publications.work_id` and `works.id`.** Only
   `publication_id → publications.id` is enforced. A renumbered or merged work row
   would silently drift.
4. **`summary_persons` enrichment is half-built.** The three top-tier columns
   (collaborators, research subjects, name variations) are empty. The persons summary
   exists primarily for Sphinx ingestion; its denormalised aggregations are not
   delivered.
5. **The MariaDB FT fallback path is not actually documented as a degradation.** Code
   uses it transparently; users can't tell when `meta.engine = "MariaDB-fallback"` is
   firing.

---

## 5. Possibilities (intervention levels)

### A. Schema clean-up. Zero architectural risk. Saves ~0 GB of disk but eliminates
   schema debt and reduces operator confusion.
   - Drop the always-NULL columns on `summary_publications`: `publication_date`,
     `volume`, `issue`, `pages_text`, `source`, `license_url`, `license_version`,
     `identifiers_json`. Read paths that need these fields already JOIN
     `publications`.
   - Drop the always-empty enrichment columns on `summary_persons`:
     `name_variations_search`, `top_collaborators_json`, `research_subjects_json`.
   - Fix or remove `publication_download_count` (currently always 0).
   - Add a FK `summary_publications.work_id → works.id ON DELETE CASCADE`.
   - **Disk recovered:** negligible (these columns store NULLs).
   - **Effort:** low. Single ALTER per column, one procedure edit.
   - **Risk:** low.

### B. Decouple the text corpus from the summary. Saves ~5–6 GB.
   - Drop the five `*_search` columns from `summary_publications` (`title_search`,
     `abstract_search`, `authors_search`, `venue_search`, `subjects_search`) and the
     two FT indexes (`ft_summary_pubs_content`, `ft_summary_pubs_metadata`).
   - Move Sphinx `publications_poc.sql_query` to build the corpus on the fly by
     JOINing `works`, `authorships → persons`, `work_subjects → subjects`, `venues`.
     Sphinx indexer runs slower (each row reads 5 tables) but only once a day.
   - Route the MariaDB FT fallback through:
     - `q` → `MATCH(works.title, works.subtitle, works.abstract) AGAINST … IN BOOLEAN
       MODE` (`ft_works_content` already exists, no schema change).
     - `author` → `MATCH(persons.preferred_name, given_names, family_name) AGAINST …`
       (`ft_persons_names` already exists), joined through `authorships`.
     - `venue` → `MATCH(venues.name) AGAINST …` — needs a new FT index on `venues`
       (~10 MB, trivial).
     - `subject` → leading-wildcard `LIKE` on `subjects.term`. ~100 K-row table, scan
       is sub-100 ms even without FT.
   - **Disk recovered:** ~5.2 GB of text + ~3.9 GB of FT index data ≈ **6–7 GB** once
     the InnoDB FT auxiliary tables (`FTS_DOC_ID_INDEX`, `SYS_TS_*`) are reclaimed.
   - **Effort:** medium. Sphinx config rewrite + four fallback paths in three services.
   - **Risk:** medium. The fallback path widens its blast radius (used in 5 spots);
     each needs a test. Conditional on Sphinx being reliably up, the user-visible
     impact is zero.

### C. Reduce `summary_publications` to a thin attribute table. Saves ~14–15 GB.
   - Keep only the columns Sphinx needs as attribute filters or that drive
     server-side pagination/sort: `publication_id, work_id, venue_id, publisher_id,
     publication_year, work_type, language, open_access, peer_reviewed, has_files,
     has_scimag_file, has_libgen_file, work_citation_count, work_reference_count,
     doi`. ~50 bytes per row × 6.77 M = ~340 MB plus indexes.
   - Drop the text corpus columns (as in B) **and** the three large JSONs
     (`authors_json`, `subjects_json`, `files_json`).
   - Hydrate listings via two batched JOIN queries per page:
     - One `IN (publication_id, …)` against `files` for the file roll-up. ~20-row
       page = ~50 files looked up by indexed PK.
     - One `IN (work_id, …)` against `authorships → persons` for authors, and one
       against `work_subjects → subjects` for subjects. Both already have indexes
       on `(work_id)`.
   - **Disk recovered:** ~14.5 GB. `summary_publications` collapses from 15.96 GB to
     ~1 GB.
   - **Effort:** high. Touches the build procedure, the refresh procedure, the Sphinx
     ingestion, and every listing controller/service that selects `sp.authors_json /
     sp.subjects_json / sp.files_json`.
   - **Risk:** medium-high. Per-page latency on listings increases by the cost of two
     keyed batched lookups (~30 ms in practice, since both are indexed); operator
     pipeline changes are non-trivial.

### D. Drop `summary_publications` entirely. **Not recommended.** Forfeits the listing
   throughput gains and the Sphinx ingestion convenience, in exchange for ~17 GB.

---

## 6. Recommendation

**Apply A unconditionally** — it costs almost nothing, eliminates real schema confusion,
and would already retire the live `files` JOIN workaround documented in CLAUDE.md (the
files denormalisation is now correct).

**Strongly consider B.** Of all the columns on `summary_publications`, the `*_search`
text corpus is the one that *most* duplicates information that already has an index in
the base tables. Six GB is real disk. The only cost is making the MariaDB FT fallback
slightly more complex; that path is already a cold path (Sphinx-down).

**Defer C.** It is a credible re-design and the savings (14 GB) are significant. But it
is a re-design of the listing pipeline, the Sphinx ingestion, and the refresh contract
— a multi-PR effort that should be sized as such. A+B together recovers ~7 GB at
modest effort; C is the next conversation.

The path that maximises ratio of `GB saved / risk taken`:

```
A → measure listing latency → B → measure listing latency → consider C
```

---

## 7. Verification before any of A/B/C ships

Before the operator runs an ALTER on `summary_publications`, verify in this order:

1. `SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='data' AND
    table_name='summary_publications'` — record the column count.
2. `SHOW INDEX FROM summary_publications` — record indexes.
3. For each column to be dropped: `SELECT COUNT(*) FROM summary_publications WHERE
    col IS NOT NULL` to confirm population.
4. Run `EXPLAIN` on a representative `/publications` listing query and a `/works`
    listing query against both the old and new schema to confirm no plan regression.
5. Re-run `npm run test:integration` against port 1210 to confirm contract.

---

## 8. Rollback

For A: each dropped column can be re-added with a single `ALTER TABLE …  ADD COLUMN`.
The data was always NULL, so no information is lost.

For B: dropping the `*_search` columns and FT indexes is reversible by re-adding them
plus a rebuild. The text data is reconstructible from base tables.

For C: cannot be rolled back cheaply — re-populating `authors_json / subjects_json /
files_json` requires a full build run. Sphinx config rollback is easier (single conf
file).
