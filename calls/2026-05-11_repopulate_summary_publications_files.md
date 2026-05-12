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
