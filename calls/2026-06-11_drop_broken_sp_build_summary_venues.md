# Drop the broken leftover procedure sp_build_summary_venues

**Filed:** 2026-06-11
**Status:** PENDING (operator) — **destructive** (single procedure drop). Independent of the
Manticore migration; safe to run at any time.

## Why
`sp_build_summary_venues` is a leftover from the dissolved summary layer
(`calls/2026-05-23_dissolve_all_summaries.md`). Its body `TRUNCATE`s and `INSERT`s into
`summary_venues`, a table that no longer exists, so the procedure is dead and would error
immediately if ever called. No application code references it (the API is consumer-only and
never issued `CALL` on it). CLAUDE.md already lists `sp_build_summary_*` as "explicitly
absent / do not reintroduce", so its continued presence is documentation drift plus a live
footgun.

## Current state
- `information_schema.routines` reports 42 procedures; one of them is
  `sp_build_summary_venues`, referencing the dropped `summary_venues` table.

## Proposed change
```sql
DROP PROCEDURE IF EXISTS sp_build_summary_venues;
```
Then regenerate the schema dump:
```
./scripts/maintenance/publications/regenerate_schema_dump.sh data database/data.schema.sql
```

## Verification
- `SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema='data' AND routine_type='PROCEDURE';`
  returns 41 (was 42).
- `SELECT 1 FROM information_schema.routines WHERE routine_name='sp_build_summary_venues';`
  returns empty.
- API unaffected: `npm run test:integration` stays 21/21 on port 1210.

## Rollback
- The procedure is non-functional (its target table is gone), so there is nothing to
  restore. If ever needed, the definition is recoverable from git history of
  `database/data.schema.sql` prior to this change.
