1. `mariadb data_dev < scripts/maintenance/00_precheck_structural_data.sql`
2. `mariadb data_dev < scripts/maintenance/01_setup_structural_maintenance.sql`
3. `mariadb data_dev < scripts/maintenance/02_refresh_collaboration_cache.sql`
4. `mariadb data_dev < scripts/maintenance/03_switch_collaborations_view_to_cache.sql`
5. `mariadb data_dev < scripts/maintenance/04_repair_work_references_consistency.sql`
6. `mariadb data_dev < scripts/maintenance/05_postcheck_structural_data.sql`

Rollback rápido da view de colaborações:
`CREATE OR REPLACE VIEW v_collaborations AS SELECT * FROM v_collaborations_legacy;`
