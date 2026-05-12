# Repopulate `summary_publications.has_files` and `files_json`

**Status:** PENDING (filed 2026-05-11).

## Why it matters to the API

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

## Current state

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

## Proposed change

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

### Preferred path — fix the builder, re-run the existing batched orchestrator

`sp_build_summary_publications(batch_size)` and the
`sp_orchestrate_all_summaries(batch_size)` orchestrator already implement
batched rebuilds and were the routines that populated these columns the
last time they were correct (see the 2026-04-14 status block in
`calls/2026-04-13_database-change-requests.md`: 4.5 M rows then carried
`has_files = 1`). The build evidently regressed — the file-aggregation
block inside the builder is no longer emitting any output.

The right intervention is operator-side:

1. Inspect `sp_build_summary_publications` and locate the block that
   joins `files` and writes `has_files` / `has_scimag_file` /
   `has_libgen_file` / `files_json` / `publication_download_count`.
   Identify why it stopped firing (likely candidates: a renamed source
   column, a `LEFT JOIN` turned into `INNER JOIN`, a `JSON_ARRAYAGG`
   guarded by a condition that is now always false, a dropped step in
   the orchestrator).
2. Restore the block (emitting the JSON keys exactly as listed above —
   the API DTO `src/dto/publication.dto.js::mapFiles` reads
   `format` / `size` / `role` / `verification` / `downloads`, not the
   raw column names).
3. Re-run via the existing batched entry point:
   `CALL sp_orchestrate_all_summaries(50000);` (or whatever batch size
   the operator already uses in production).

No new procedure is needed; this path reuses the operator's normal
pipeline, runs in the same batches it already runs in, and re-emits
correct denormalised state.

### Fallback — one-shot **batched** backfill (do not run as a single UPDATE)

Use this **only** if the preferred path is blocked. **Do not** run a
single 5 M-row `UPDATE summary_publications JOIN (SELECT … FROM files
GROUP BY publication_id)` — that holds row locks across the whole table
for hours, balloons the binlog, and risks OOM on the JSON aggregation
buffer.

Drive the backfill in fixed-width `publication_id` ranges, one batch
per transaction. Both sides of the join are filtered by the same range,
so each batch is bounded and indexed:

```bash
# Pseudo-shell driver — adapt to the operator's runner.
BATCH=20000                                           # ≈ 250 batches total
MAX=$(mariadb -BN data -e \
    'SELECT MAX(publication_id) FROM summary_publications')
START=0
while [ "$START" -le "$MAX" ]; do
  END=$(( START + BATCH ))
  mariadb data -e "
    SET STATEMENT max_statement_time = 120 FOR
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
      WHERE f.publication_id >= ${START} AND f.publication_id < ${END}
      GROUP BY f.publication_id
    ) agg ON agg.publication_id = sp.publication_id
    SET
      sp.has_files                  = IF(agg.publication_id IS NULL, 0, 1),
      sp.has_scimag_file            = COALESCE(agg.has_scimag, 0),
      sp.has_libgen_file            = COALESCE(agg.has_libgen, 0),
      sp.files_json                 = agg.files_payload,
      sp.publication_download_count = COALESCE(agg.dl_total, 0)
    WHERE sp.publication_id >= ${START} AND sp.publication_id < ${END};
  " || { echo \"batch [${START},${END}) failed\"; exit 1; }
  echo \"batch [${START},${END}) done\"
  START=$END
done
```

Why this is safe at 6.77 M / 5 M scale:

- Each batch updates at most `BATCH` rows on `summary_publications` and
  touches only `files` rows in the same `publication_id` range. Both
  sides use `idx_summary_pubs_publication_id` (PK) and
  `idx_files_publication_id`, so the JSON aggregation is a tight
  index-driven group, not a full scan.
- Row locks are released between batches; concurrent reads continue.
- The binlog is split into ~250 small statements instead of one
  monstrous one.
- A 2 minute per-batch budget (`SET STATEMENT max_statement_time = 120`)
  catches degenerate ranges before they wedge replication.
- The driver is resumable: on failure, restart `START` at the last
  reported good batch.
- Optionally parallelisable across non-overlapping ranges if the
  operator has multiple workers.

Expected wall time at `BATCH = 20000`: low tens of minutes, dominated by
the JSON aggregation cost on the ~250 batches that actually contain
files (some publication_id ranges are sparse).

Whatever the operator runs, the resulting JSON keys must match the
contract above; the API DTO (`src/dto/publication.dto.js::mapFiles`)
keys on those JSON field names.

## Verification

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

## Rollback

Set `sp.has_files = 0`, `sp.files_json = NULL`, `sp.has_scimag_file = 0`,
`sp.has_libgen_file = 0`, `sp.publication_download_count = 0` on every
row — the API will fall back to the live `files`-table join on detail
endpoints (already wired) and the listing endpoints will degrade back to
the broken-empty state seen today.
