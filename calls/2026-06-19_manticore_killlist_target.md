# Manticore delta tables — add killlist_target and rebuild delta

**Filed:** 2026-06-19
**Status:** PENDING (operator) — config change + delta rebuild only (fast, ~2 min). No MariaDB schema change.

## Why
The distributed `works` table returns every recently-updated work **twice**: the work exists
in both `works_main` (full corpus) and `works_delta` (works with `updated_at` in the last 48h),
and nothing suppresses the stale `works_main` copy. Verified on the live index — all 10,721
current `works_delta` ids resolve to 2 rows in the distributed `works` table. The same defect
applies to `persons`. This inflates `COUNT(*)` totals and can surface duplicate hits and skewed
pagination. The `indexer` already flags it on every delta build:
```
WARNING: table 'works_delta': kill-list not empty but no killlist_target specified
```

The sources define the kill-list (`sql_query_killlist = SELECT id FROM works WHERE updated_at ...`)
but Manticore plain tables also require a table-level `killlist_target` to say where the
kill-list is applied. That directive was missing.

## Current state
- `config/manticore.conf` `works_delta` / `persons_delta` had `source` + `path` only.
- `searchd` (Manticore 25.0.0) serves the distributed `works` / `persons` = main + delta with
  no dedup, so updated docs double up.

## Proposed change (operator steps, in order)
1. **Config (already committed).** `works_delta` now declares `killlist_target = works_main:kl`
   and `persons_delta` declares `killlist_target = persons_main:kl`. The `:kl` suffix applies
   the source `sql_query_killlist` ids against the main table, so the fresh delta row wins.

2. **Re-render and install the config:**
   ```
   sudo ENV_FILE=/etc/node-backend.env scripts/manticore/render-config.sh
   ```

3. **Rebuild + rotate the delta tables** (the kill-list is applied to the already-loaded main
   at rotate time; main itself is not rebuilt):
   ```
   sudo -u manticore indexer --config /etc/manticoresearch/manticore.conf --rotate works_delta persons_delta
   ```
   (`sudo -u manticore manticore-ethnos-reindex delta` is the convenience form.)

## Verification
```
# pick any works_delta id; it must resolve to exactly ONE row in the distributed table
ID=$(mysql --skip-ssl -h127.0.0.1 -P9306 -se "SELECT id FROM works_delta LIMIT 1;")
mysql --skip-ssl -h127.0.0.1 -P9306 -se "SELECT COUNT(*) FROM works WHERE id=$ID;"   # expect 1, was 2
```
The `kill-list ... no killlist_target` warning should also disappear from the delta build output.

## Rollback
Remove the two `killlist_target` lines from `config/manticore.conf`, re-render, and rebuild
the delta tables again. The index returns to its prior (duplicating) behavior; no data is lost.
