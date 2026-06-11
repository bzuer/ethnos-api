# Manticore search engine — deploy, index, and enable

**Filed:** 2026-06-11
**Status:** PENDING (operator) — additive and reversible. No MariaDB schema change in this request.

## Why
Full-text search for `works` and `persons` is moving off MariaDB FULLTEXT onto Manticore
Search (25.0.0, already installed and running on `127.0.0.1:9306`). Manticore indexes
straight from the base tables (`works` + `publications` + `authorships` + `persons` +
`work_subjects` + `subjects` + `venues`) via `sql_joined_field`, so the denormalized
`works.authors_search` / `works.subjects_search` columns and the three overlapping
FULLTEXT indexes become obsolete. This removes the data multiplication, makes the
abstract searchable, and fixes the staleness where ~70% of the newest works were missing
from author/subject search.

The API change is already in the repo behind `SEARCH_BACKEND` (default `mariadb`), so the
live path is unchanged until the operator completes the steps below and flips the flag.

## Current state
- Manticore 25.0.0 running (systemd unit `manticore.service`, ports 9306/9308/9312), default
  `data_dir` config at `/etc/manticoresearch/manticore.conf`.
- The repo ships the production index config at `config/manticore.conf` (path mode: plain
  `works_main`/`works_delta`/`persons_main`/`persons_delta` + distributed `works`/`persons`),
  plus `scripts/manticore/render-config.sh` and `scripts/manticore/reindex.sh`.
- Validated on a 30k-work slice end-to-end: path mode serves plain tables, joined
  author/subject/venue fields build correctly, MVA year/oa filters and attribute
  filters/sort work, relevance ranking works. Build rate ~14.6k docs/sec
  (full `works` build ≈ 7 minutes).

## Proposed change (operator steps, in order)

1. **MySQL client library for the indexer.** Manticore's `indexer` `dlopen`s
   `libmysqlclient.so.21`, which is absent (the box has `.so.24`). The MariaDB connector
   (`libmariadb.so.3`) is NOT ABI-safe here — it crashes in `FetchJoinedFields`. Symlink the
   real MySQL client:
   ```
   sudo ln -s /usr/lib/x86_64-linux-gnu/libmysqlclient.so.24 /usr/lib/x86_64-linux-gnu/libmysqlclient.so.21
   sudo ldconfig
   ```

2. **Render the production config** (injects `DB_PASSWORD` from `/etc/node-backend.env`,
   replaces the default `data_dir` config, creates `/var/lib/manticore/ethnos`):
   ```
   sudo ENV_FILE=/etc/node-backend.env scripts/manticore/render-config.sh
   ```

3. **Initial full build**, then restart searchd to serve the plain tables. The `manticore`
   user cannot read scripts under `/home/ubuntu`, so invoke the `indexer` binary directly
   (binary and config are both in system paths):
   ```
   sudo -u manticore indexer --config /etc/manticoresearch/manticore.conf --all
   sudo systemctl restart manticore
   ```
   (`render-config.sh` also installs `/usr/local/bin/manticore-ethnos-reindex`, so
   `sudo -u manticore manticore-ethnos-reindex init` is the equivalent convenience form.)

4. **Schedule freshness** (operator cron; API stays consumer-only). Use the installed helper
   (re-run `render-config.sh` once to install it) or the `indexer` binary directly — both are
   reachable by the `manticore` user, unlike the repo path under `/home/ubuntu`. Example
   `/etc/cron.d/manticore-ethnos`:
   ```
   */5 * * * * manticore /usr/local/bin/manticore-ethnos-reindex delta >/dev/null 2>&1
   17 3  * * * manticore /usr/local/bin/manticore-ethnos-reindex main  >/dev/null 2>&1
   ```
   Binary-direct equivalent (no helper needed):
   ```
   */5 * * * * manticore /usr/bin/indexer --config /etc/manticoresearch/manticore.conf --rotate works_delta persons_delta >/dev/null 2>&1
   17 3  * * * manticore /usr/bin/indexer --config /etc/manticoresearch/manticore.conf --rotate works_main persons_main >/dev/null 2>&1
   ```
   (Delta window is 48h in `config/manticore.conf`; keep delta interval well under it.)

5. **Enable the backend in the API.** Add to `/etc/node-backend.env`:
   ```
   SEARCH_BACKEND=manticore
   MANTICORE_HOST=127.0.0.1
   MANTICORE_PORT=9306
   MANTICORE_DATABASE=Manticore
   ```
   Then restart the API service.

## Verification
- `mysql -h127.0.0.1 -P9306 --skip-ssl -e "SHOW TABLES; SELECT COUNT(*) FROM works; SELECT COUNT(*) FROM persons;"`
  returns the distributed tables with row counts close to `works`/`persons` in MariaDB.
- On port 1210 (never 1211): `GET /search/health` reports `search_engine: "Manticore"`,
  `reachable: true`; `GET /search/works?q=anthropology` returns results with
  `meta.performance.engine = "Manticore"`; `GET /works?author=<name>` returns recent works
  (the staleness gap is gone); `npm run test:integration` stays green (21/21).
- Abstract is now searchable: a token that appears only in an abstract returns the work.

## Rollback
- Set `SEARCH_BACKEND=mariadb` (or remove it) and restart the API — instantly back on the
  MariaDB FULLTEXT path (valid until the separate
  `calls/2026-06-11_retire_works_fulltext_denormalization.md` drop is executed).
- `sudo systemctl stop manticore` to take searchd down; `sudo rm /usr/lib/x86_64-linux-gnu/libmysqlclient.so.21`
  to undo the symlink. No MariaDB data is touched by this request.
