# Maintenance checks — run order

Read-only tooling the API side runs against the `data` database. Neither step
changes schema or rows; every structural change belongs to the operator
pipeline (see `database/required_objects.sql`).

1. Structural precheck:
   `mariadb data --batch --skip-column-names < scripts/maintenance/publications/10_precheck_baseline.sql`
   (also run by `./scripts/manage.sh test --data`). It emits tab-separated
   `check_name\trow_count` pairs; every row must satisfy either
   `resolved_without_cited_work = 0` or `check_name >= 1`.
2. Schema snapshot:
   `./scripts/maintenance/publications/regenerate_schema_dump.sh data`
   writes `backups/data.schema.$(date +%Y-%m-%d).sql`, overwriting a dump of the
   same day; pass an explicit second argument (e.g.
   `backups/data.schema.$(date +%Y-%m-%d_%H-%M).sql`) to keep both. It runs
   `mysqldump -d --routines --events --order-by-primary
   --single-transaction --compact --skip-comments --skip-tz-utc
   --default-character-set=utf8mb4`.

Run the snapshot after every operator DDL change and update the API against the
new file. To discard a regenerated dump, `git checkout -- backups/`.
