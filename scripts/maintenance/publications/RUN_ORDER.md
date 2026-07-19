# Publications migration — run order

Maintenance SQL for the `summary_*` migration. Each file is read-only or additive
through Phase 9; the only irreversible step is Phase 10 (`files.work_id` drop).

## Phase 0 — baseline (read-only)

1. `mariadb data --batch --skip-column-names < scripts/maintenance/publications/10_precheck_baseline.sql`
2. `./scripts/maintenance/publications/regenerate_schema_dump.sh data` (writes `backups/data.schema.$(date +%Y-%m-%d).sql`)

The precheck emits tab-separated `check_name\trow_count` pairs and is also the
target of `./scripts/manage.sh test --data`. Every row must satisfy either
`resolved_without_cited_work = 0` or `check_name >= 1`.

The helper invokes `mysqldump -d --routines --events --order-by-primary
--single-transaction --compact --skip-comments --skip-tz-utc
--default-character-set=utf8mb4` and writes a dated snapshot under `backups/`.

## Rollback

Phase 0 is read-only and touches no schema. Rollback is `git checkout --
backups/` if a regenerated dump must be reverted.
