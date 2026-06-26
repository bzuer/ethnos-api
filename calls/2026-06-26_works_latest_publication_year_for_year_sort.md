# Store works.latest_publication_year to make `sort_by=publication_year` viable on /works

- **Status:** OPEN — operator action requested.

## Why
`GET /works?sort_by=publication_year` (and `/works/showcase`) without a narrowing filter
times out (HTTP 503 / `REQUEST_TIMEOUT`). This predates the 2026-06-26 works-listing fix
and is independent of it: the API cannot sort the full ~6.19 M-work corpus by year without
a usable key. The order key is `MAX(p.year)` per work, so the only correct plan is to join
`publications`, `GROUP BY w.id`, and filesort the aggregate over every work — unbounded, and
it blows the statement-time budget. The `cited_by_count` / `references_count` / `id` sorts do
not have this problem because they order on indexed `works` columns with no publications join.

## Current state
- `works` has no per-work publication-year column; the year lives only on `publications.year`
  (generated), surfaced per-work today via `MAX(p.year)` over the join.
- Indexes present: `idx_publications_work_year`, `idx_publications_year`, `idx_works_citation_count`.
- The API is consumer-only and must not add columns, indexes, or procedures itself.

## Proposed change (operator pipeline)
Add and maintain a stored, indexed latest-publication-year on `works`:
- `works.latest_publication_year SMALLINT NULL` (and optionally `first_publication_year`),
  populated as `MAX(publications.year)` / `MIN(...)` per work.
- Index `idx_works_latest_pub_year (latest_publication_year)` so
  `ORDER BY latest_publication_year DESC, id DESC LIMIT ?` is index-ordered.
- Refresh it from the same procedure that already maintains the per-work metric columns
  after `publications` mutations (alongside `citation_count` etc.).

Once the column exists, the API will switch the `publication_year` sort to order by the stored
column (no join, no GROUP BY), mirroring the `cited_by_count` path. Until then the sort stays
gated by the statement-time budget and may 503 on unfiltered calls.

## Verification
- `EXPLAIN SELECT id FROM works ORDER BY latest_publication_year DESC, id DESC LIMIT 50;`
  uses `idx_works_latest_pub_year` (no filesort, no temporary).
- For a sample of work ids, `works.latest_publication_year = (SELECT MAX(year) FROM publications WHERE work_id = works.id)`.
- `GET /works?sort_by=publication_year&limit=50` returns 200 in well under the timeout.

## Rollback
Drop `idx_works_latest_pub_year` and the `latest_publication_year` column; the API falls back
to the current `MAX(p.year)` join path (the present, timeout-prone behaviour).
