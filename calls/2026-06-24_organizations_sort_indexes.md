# organizations — add sort indexes for the rebuilt /institutions listing

**Filed:** 2026-06-24
**Status:** APPLIED 2026-06-24 — operator ran the `ALTER TABLE organizations ADD INDEX` for all three columns (`idx_organizations_total_citations`, `idx_organizations_h_index`, `idx_organizations_i10_index`); `Query OK, 0 rows affected`. The `/institutions` secondary sorts (`citations`/`h_index`/`i10_index`) are now index-backed. Additive index creation only; no data, column, or structural change to rows.

## Why
The rebuilt `/institutions` endpoint reads org metrics straight from the stored columns and offers
`sort_by` over them. The default sort (`works_count` → `publication_count`) is already covered by
`idx_organizations_publication_count`, and `researcher_count` by `idx_organizations_researcher_count`.
The remaining sort keys have **no supporting index**, so `ORDER BY … LIMIT` falls back to a filesort
over the ~414k-row default-browse set (unresolved + blank-name rows excluded). Cache absorbs most of
the cost, but a cold `sort_by=citations|h_index|i10_index` request currently measures ~0.5 s, almost
entirely filesort.

## Current state
`organizations` indexes relevant to listing/sort:
- `idx_organizations_publication_count (publication_count)` — covers default sort.
- `idx_organizations_researcher_count (researcher_count)` — covers `researchers_count` sort.
- `idx_organizations_type_country`, `idx_country`, `idx_ror`, `idx_org_stdname_type`, `ft_organizations_name`.

No index on `total_citations`, `h_index`, or `i10_index`.

## Proposed change (operator)
Add three single-column descending-friendly indexes so the optimizer can satisfy the sort by index
order and apply the residual filters on the fly:

```sql
ALTER TABLE organizations
  ADD INDEX idx_organizations_total_citations (total_citations),
  ADD INDEX idx_organizations_h_index (h_index),
  ADD INDEX idx_organizations_i10_index (i10_index);
```

(`2yr_mean_citedness` is not a documented sort key and is intentionally left unindexed.)

## Verification
After creation:
```sql
EXPLAIN SELECT o.id FROM organizations o
  WHERE NOT EXISTS (SELECT 1 FROM organization_unresolved u WHERE u.org_id = o.id)
    AND CHAR_LENGTH(TRIM(o.name)) >= 2
  ORDER BY o.total_citations DESC LIMIT 20;   -- expect key=idx_organizations_total_citations, no "Using filesort"
```
API side: `GET /institutions?sort_by=citations&limit=20` cold-cache latency should drop from ~0.5 s
toward the indexed `sort_by=works_count` baseline.

## Rollback
```sql
ALTER TABLE organizations
  DROP INDEX idx_organizations_total_citations,
  DROP INDEX idx_organizations_h_index,
  DROP INDEX idx_organizations_i10_index;
```
The API works correctly without these indexes (the only effect is filesort latency on the three
secondary sort keys), so the change is safe to defer or revert.
