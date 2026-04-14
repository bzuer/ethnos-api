# Publications migration — run order

Maintenance SQL for the `summary_*` migration. Each file is read-only or additive
through Phase 9; the only irreversible step is Phase 10 (`files.work_id` drop).

## Phase 0 — baseline (read-only)

1. `mariadb data --batch --skip-column-names < scripts/maintenance/publications/10_precheck_baseline.sql`
2. `./scripts/maintenance/publications/regenerate_schema_dump.sh data database/data.schema.sql`

The precheck emits tab-separated `check_name\trow_count` pairs and is also the
target of `./scripts/manage.sh test --data`. Every row must satisfy either
`resolved_without_cited_work = 0` or `check_name >= 1`.

The helper invokes `mariadb-dump --no-data --routines --triggers --events
--skip-opt --create-options --add-drop-table --set-charset --skip-dump-date
--no-tablespaces` and overwrites `database/data.schema.sql`.

## Phase 9a — incremental refresh and build-proc patch

3. `mariadb data < scripts/maintenance/publications/20_create_sp_refresh_summary_publications_for_work.sql`
4. `mariadb data < scripts/maintenance/publications/21_patch_sp_build_summary_publications.sql`
5. `mariadb data --batch --skip-column-names < scripts/maintenance/publications/22_postcheck_refresh.sql`

`20` creates `sp_refresh_summary_publications_for_work(p_work_id)` — the
incremental routine that the JS realtime layer calls to refresh a single
work's `summary_publications` rows (including `has_files` / `files_json` /
`publication_download_count`, which the legacy build proc never populated).

`21` rewrites `sp_build_summary_publications` to add a `tmp_batch_files` temp
table inside the existing batched loop, so a full rebuild via
`sp_orchestrate_all_summaries(batch_size)` also populates the three previously
empty file-related columns.

`22` is the postcheck: asserts both procedures exist, that the patched build
proc body contains `tmp_batch_files`, and that the refresh proc body contains
the per-publication files subquery. Each row must be `>= 1`.

After applying `21`, the operator runs the heavy full rebuild manually:

```
mariadb data -e 'CALL sp_orchestrate_all_summaries(50000)'
```

Expected duration: hours. The agent must not run this. Once it completes,
`SELECT COUNT(*) FROM summary_publications WHERE files_json IS NOT NULL`
should return `> 0` (and ideally match the count of publications that have
attached files).

## Rollback

Phase 0 is read-only and touches no schema. Rollback is `git checkout --
database/data.schema.sql` if the regenerated dump must be reverted.

Phase 9a rollback: re-run the previous body of `sp_build_summary_publications`
captured in `database/data.schema.sql` from before the patch
(`git show HEAD~1:database/data.schema.sql`), and `DROP PROCEDURE
sp_refresh_summary_publications_for_work` to retire the incremental routine.
