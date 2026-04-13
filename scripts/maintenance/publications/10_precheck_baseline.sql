SELECT 'resolved_without_cited_work' AS check_name, COUNT(*) AS row_count
FROM work_references
WHERE status = 'RESOLVED'
  AND cited_work_id IS NULL
UNION ALL
SELECT 'summary_publications_rows', COUNT(*)
FROM summary_publications
UNION ALL
SELECT 'summary_venues_rows', COUNT(*)
FROM summary_venues
UNION ALL
SELECT 'summary_persons_rows', COUNT(*)
FROM summary_persons
UNION ALL
SELECT 'works_rows', COUNT(*)
FROM works
UNION ALL
SELECT 'publications_rows', COUNT(*)
FROM publications
UNION ALL
SELECT 'files_rows', COUNT(*)
FROM files
UNION ALL
SELECT 'work_references_rows', COUNT(*)
FROM work_references
UNION ALL
SELECT 'authorships_rows', COUNT(*)
FROM authorships
UNION ALL
SELECT 'work_subjects_rows', COUNT(*)
FROM work_subjects
UNION ALL
SELECT 'venues_rows', COUNT(*)
FROM venues
UNION ALL
SELECT 'persons_rows', COUNT(*)
FROM persons
UNION ALL
SELECT 'organizations_rows', COUNT(*)
FROM organizations
UNION ALL
SELECT 'signatures_rows', COUNT(*)
FROM signatures
UNION ALL
SELECT 'subjects_rows', COUNT(*)
FROM subjects
UNION ALL
SELECT 'sp_orchestrate_all_summaries_exists', COUNT(*)
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
  AND ROUTINE_NAME = 'sp_orchestrate_all_summaries'
  AND ROUTINE_TYPE = 'PROCEDURE'
UNION ALL
SELECT 'sp_build_summary_publications_exists', COUNT(*)
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
  AND ROUTINE_NAME = 'sp_build_summary_publications'
  AND ROUTINE_TYPE = 'PROCEDURE'
UNION ALL
SELECT 'sp_build_summary_venues_exists', COUNT(*)
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
  AND ROUTINE_NAME = 'sp_build_summary_venues'
  AND ROUTINE_TYPE = 'PROCEDURE'
UNION ALL
SELECT 'sp_build_summary_persons_exists', COUNT(*)
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
  AND ROUTINE_NAME = 'sp_build_summary_persons'
  AND ROUTINE_TYPE = 'PROCEDURE'
UNION ALL
SELECT 'sp_clean_core_data_exists', COUNT(*)
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
  AND ROUTINE_NAME = 'sp_clean_core_data'
  AND ROUTINE_TYPE = 'PROCEDURE'
UNION ALL
SELECT 'sp_update_core_statistics_exists', COUNT(*)
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
  AND ROUTINE_NAME = 'sp_update_core_statistics'
  AND ROUTINE_TYPE = 'PROCEDURE'
UNION ALL
SELECT 'fn_calculate_10yr_impact_factor_exists', COUNT(*)
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
  AND ROUTINE_NAME = 'fn_calculate_10yr_impact_factor'
  AND ROUTINE_TYPE = 'FUNCTION'
UNION ALL
SELECT 'ft_summary_pubs_content_exists', COUNT(DISTINCT INDEX_NAME)
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'summary_publications'
  AND INDEX_NAME = 'ft_summary_pubs_content'
UNION ALL
SELECT 'ft_summary_pubs_metadata_exists', COUNT(DISTINCT INDEX_NAME)
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'summary_publications'
  AND INDEX_NAME = 'ft_summary_pubs_metadata'
UNION ALL
SELECT 'uq_summary_pubs_doi_exists', COUNT(DISTINCT INDEX_NAME)
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'summary_publications'
  AND INDEX_NAME = 'uq_summary_pubs_doi'
UNION ALL
SELECT 'ft_summary_venues_text_exists', COUNT(DISTINCT INDEX_NAME)
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'summary_venues'
  AND INDEX_NAME = 'ft_summary_venues_text'
UNION ALL
SELECT 'ft_summary_persons_text_exists', COUNT(DISTINCT INDEX_NAME)
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'summary_persons'
  AND INDEX_NAME = 'ft_summary_persons_text'
UNION ALL
SELECT 'summary_publications_authors_json_populated',
       CASE WHEN SUM(CASE WHEN authors_json IS NOT NULL THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END
FROM summary_publications
UNION ALL
SELECT 'summary_publications_subjects_json_populated',
       CASE WHEN SUM(CASE WHEN subjects_json IS NOT NULL THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END
FROM summary_publications
UNION ALL
SELECT 'legacy_sphinx_works_summary_gone',
       CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'sphinx_works_summary'
UNION ALL
SELECT 'legacy_sphinx_venues_summary_gone',
       CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'sphinx_venues_summary'
UNION ALL
SELECT 'legacy_sphinx_persons_summary_gone',
       CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'sphinx_persons_summary'
UNION ALL
SELECT 'legacy_work_author_summary_gone',
       CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'work_author_summary'
UNION ALL
SELECT 'legacy_work_subjects_summary_gone',
       CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'work_subjects_summary'
UNION ALL
SELECT 'legacy_sphinx_queue_gone',
       CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'sphinx_queue'
UNION ALL
SELECT 'legacy_processing_log_gone',
       CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'processing_log'
UNION ALL
SELECT 'legacy_person_match_log_gone',
       CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'person_match_log'
UNION ALL
SELECT 'legacy_staging_person_signatures_gone',
       CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'staging_person_signatures'
UNION ALL
SELECT 'legacy_views_absent',
       CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM information_schema.VIEWS
WHERE TABLE_SCHEMA = DATABASE();
