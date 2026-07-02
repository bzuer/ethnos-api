# Manticore works index — re-source work type from publications.type (delta reindex is currently failing)

**Filed:** 2026-07-02
**Status:** PENDING (operator) — config change + rebuild of `works_main`/`works_delta`. No MariaDB schema change (the DB restructure is already applied). **Urgent:** the delta cron is failing on every run since the `works.work_type` column was dropped, so the works index has been frozen since the restructure.

## Why
The database restructure moved work type from the parent `works` table down to the
per-publication `publications.type` column (a single work — one "multi-manifestation"
record — can now carry publications of different types, e.g. a PREPRINT and an ARTICLE).
`works.work_type` **no longer exists**. The committed `config/manticore.conf` still selected
`w.work_type` in both the `works_main` and `works_delta` `sql_query`, so:

- `indexer` now aborts with `Unknown column 'w.work_type'` on every delta run (cron rebuilds
  delta every few minutes). New/updated works have not been indexed since the restructure.
- The nightly `works_main` full rebuild would fail the same way.

The API-side change shipped alongside this request replaces the removed scalar string
attribute `work_type` with a per-publication MVA `type_codes` (the 1-based ordinal of
`publications.type`: ARTICLE=1 … OTHER=12). The `/works` / `/search/works` `type` filter now
matches a work when **any** of its publications is of that type (any_publication semantics),
consistent with every other publication-level filter.

## Current state
- `config/manticore.conf` (repo copy, already committed) has been updated:
  - `works_main` / `works_delta` `sql_query` no longer select `w.work_type`.
  - `sql_attr_string = work_type` was removed from both sources.
  - A new MVA is declared in both sources:
    ```
    sql_attr_multi = uint type_codes from ranged-query; \
        SELECT DISTINCT work_id, type+0 FROM publications WHERE work_id BETWEEN $start AND $end; \
        SELECT MIN(id), MAX(id) FROM works [WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)]
    ```
    (`type+0` yields the enum ordinal; verified 1..12 against the live column.)
- `src/services/searchEngine.service.js` emits `type_codes = <code>` (via the `WORK_TYPE_CODES`
  map) instead of `work_type = '<STRING>'`. Config deploy and this code are a matched pair —
  until the index is rebuilt the `type` filter on the Manticore path will not match.
- The currently-loaded (stale) index still exposes the old `work_type` string attribute; it
  keeps serving reads but is frozen at the pre-restructure corpus.

## Proposed change (operator steps, in order)

1. **Re-render and install the production config** (injects the DB password from
   `/etc/node-backend.env`):
   ```
   sudo ENV_FILE=/etc/node-backend.env scripts/manticore/render-config.sh
   ```

2. **Full rebuild — run as the `manticore` user via the installed helper** (running the
   indexer as root leaves root-owned index files that the `manticore`-user `searchd` can't
   rotate later; the helper lives on a system path because `/home/ubuntu` is not traversable
   by the `manticore` user). `works_main` MUST be rebuilt — a delta-only run leaves the full
   corpus on the old `work_type` schema and the distributed `works` table ends up mixed-schema,
   so `type_codes` filters fail. One-shot rebuild of all four tables (no mixed-schema window):
   ```
   sudo -u manticore manticore-ethnos-reindex init
   ```
   or, minimally, the two that matter in order:
   ```
   sudo -u manticore manticore-ethnos-reindex main
   sudo -u manticore manticore-ethnos-reindex delta
   ```
   NB: the bare `manticore-ethnos-reindex` with no argument defaults to `delta` (last-48h
   works only) — not sufficient for this migration.

3. **Restore the delta cron** (no change needed if it survived; it simply starts succeeding
   again once the config is re-rendered and `works_main` carries `type_codes`).

## Verification
- `indexer` completes without `Unknown column` and rotates `works_main` / `works_delta`.
- Attribute present and populated:
  ```
  mysql -h127.0.0.1 -P9306 -e "SELECT id, type_codes FROM works WHERE MATCH('') LIMIT 5"
  ```
- Type filter round-trips against the API (Manticore backend):
  ```
  curl -s 'http://localhost:1211/search/works?q=ritual&type=BOOK' | jq '.data[].type'
  ```
  every row should be `BOOK`.
- A work with more than one publication type appears under each of its types.

## Rollback
- Additive and reversible. To revert, restore the previous `config/manticore.conf`
  (`git show HEAD:config/manticore.conf`), re-render, and rebuild — but the old config cannot
  build against the restructured schema (`works.work_type` is gone), so rollback also requires
  reverting `src/services/searchEngine.service.js`. The forward fix is the supported path.
