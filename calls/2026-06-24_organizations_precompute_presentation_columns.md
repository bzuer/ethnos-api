# organizations — precompute presentation data the API must not aggregate

**Filed:** 2026-06-24
**Status:** PENDING (operator) — optional enrichment. The API is correct and complete without it; this only lets the API *present* richer institution data without ever computing it.

## Why
The API is a pure presentation layer: it reads stored columns and never aggregates raw tables
(`authorships` / `publications` / `funding`) to derive institution metrics. The rebuilt `/institutions`
detail therefore presents only what `organizations` already stores plus the `organization_relationships`
hierarchy. A few institution-page data points are valuable but are **aggregations** the API will not run.
If the operator pipeline computes and stores them, the API will present them (the database owns the
calculation; the API owns the presentation).

## Proposed change (operator) — all optional, additive
1. **Corpus year range** (cheap, high value — matches `persons.first_publication_year` /
   `persons.latest_publication_year` and `venues.coverage_*`):
   ```sql
   ALTER TABLE organizations
     ADD COLUMN first_publication_year SMALLINT NULL,
     ADD COLUMN latest_publication_year SMALLINT NULL;
   ```
   Populated operator-side from `MIN/MAX(publications.year)` over the org's affiliated works, alongside
   the existing `publication_count` / `researcher_count` refresh. The API will surface them under
   `metrics.first_publication_year` / `metrics.latest_publication_year`.

2. **Resolved flag** (optimization — lets `/institutions` filter/count on an indexed boolean instead of
   the `NOT EXISTS (organization_unresolved)` anti-join run on every browse count, ~0.45 s today):
   ```sql
   ALTER TABLE organizations ADD COLUMN is_resolved TINYINT(1) NOT NULL DEFAULT 1;
   -- operator sets is_resolved = 0 for every org_id in organization_unresolved
   ALTER TABLE organizations ADD INDEX idx_organizations_resolved_pubcount (is_resolved, publication_count);
   ```
   The API would replace the anti-join with `o.is_resolved = 1`.

3. **Production breakdown / yearly trend / top affiliated authors** (only if these institution-page
   features are wanted): these are aggregations the API cannot perform. Provide them as operator-maintained
   storage — e.g. a JSON column `production_summary` on `organizations`, or small precomputed tables
   (`organization_yearly_stats(org_id, year, works_count)`, `organization_top_authors(org_id, person_id,
   works_count, rank)`). The API will present whatever is stored. Until then the detail omits these blocks
   and clients use `/institutions/{id}/works` (sortable/filterable) for the same underlying data.

## Verification
After (1): `GET /institutions/{id}` shows non-null `metrics.first_publication_year` /
`latest_publication_year`. After (2): `EXPLAIN` of the `/institutions` count shows
`idx_organizations_resolved_pubcount` and no `organization_unresolved` anti-join; cold list latency drops.

## Rollback
Drop the added columns/indexes/tables. The API tolerates their absence (it already runs without them),
so this is safe to defer or revert at any time.
