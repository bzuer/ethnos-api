CREATE OR REPLACE VIEW v_collaborations AS
SELECT
    cc.person1_id,
    p1.preferred_name AS person1_name,
    cc.person2_id,
    p2.preferred_name AS person2_name,
    cc.collaboration_count,
    cc.first_collaboration_year,
    cc.latest_collaboration_year,
    cc.avg_citations_together
FROM collaboration_cache cc
JOIN persons p1
  ON p1.id = cc.person1_id
JOIN persons p2
  ON p2.id = cc.person2_id;
