SELECT 'sp_refresh_summary_publications_for_work_exists' AS check_name, COUNT(*) AS row_count
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
  AND ROUTINE_NAME = 'sp_refresh_summary_publications_for_work'
  AND ROUTINE_TYPE = 'PROCEDURE'
UNION ALL
SELECT 'sp_build_summary_publications_exists', COUNT(*)
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
  AND ROUTINE_NAME = 'sp_build_summary_publications'
  AND ROUTINE_TYPE = 'PROCEDURE'
UNION ALL
SELECT 'sp_build_summary_publications_files_temp_table_in_body',
       CASE WHEN ROUTINE_DEFINITION LIKE '%tmp_batch_files%' THEN 1 ELSE 0 END
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
  AND ROUTINE_NAME = 'sp_build_summary_publications'
UNION ALL
SELECT 'sp_refresh_files_subquery_in_body',
       CASE WHEN ROUTINE_DEFINITION LIKE '%FROM files WHERE publication_id = pub.id%' THEN 1 ELSE 0 END
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
  AND ROUTINE_NAME = 'sp_refresh_summary_publications_for_work';
