SELECT 'resolved_without_cited_work' AS check_name, COUNT(*) AS row_count
FROM work_references
WHERE status = 'RESOLVED'
  AND cited_work_id IS NULL
UNION ALL
SELECT 'collaboration_cache_rows', COUNT(*)
FROM collaboration_cache
UNION ALL
SELECT 'v_collaborations_uses_cache', COUNT(*)
FROM information_schema.VIEWS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'v_collaborations'
  AND UPPER(VIEW_DEFINITION) LIKE '%COLLABORATION_CACHE%'
UNION ALL
SELECT 'v_sphinx_publications_index_exists', COUNT(*)
FROM information_schema.VIEWS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'v_sphinx_publications_index';
