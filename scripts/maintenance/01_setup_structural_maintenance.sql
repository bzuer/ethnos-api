DROP PROCEDURE IF EXISTS sp_apply_structural_indexes;
DELIMITER ;;
CREATE PROCEDURE sp_apply_structural_indexes()
BEGIN
    DECLARE v_exists INT DEFAULT 0;

    SELECT COUNT(*)
      INTO v_exists
      FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'authorships'
       AND index_name = 'idx_authorships_person_work';
    IF v_exists = 0 THEN
        ALTER TABLE authorships
          ADD INDEX idx_authorships_person_work (person_id, work_id);
    END IF;

    SELECT COUNT(*)
      INTO v_exists
      FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'publications'
       AND index_name = 'idx_publications_work_open_access';
    IF v_exists = 0 THEN
        ALTER TABLE publications
          ADD INDEX idx_publications_work_open_access (work_id, open_access);
    END IF;
END;;
DELIMITER ;

CALL sp_apply_structural_indexes();

CREATE TABLE IF NOT EXISTS collaboration_cache (
    person1_id INT NOT NULL,
    person2_id INT NOT NULL,
    collaboration_count INT NOT NULL,
    first_collaboration_year SMALLINT DEFAULT NULL,
    latest_collaboration_year SMALLINT DEFAULT NULL,
    avg_citations_together DECIMAL(10,2) DEFAULT NULL,
    refreshed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (person1_id, person2_id),
    KEY idx_collaboration_count (collaboration_count),
    KEY idx_collaboration_person1_count (person1_id, collaboration_count),
    KEY idx_collaboration_person2_count (person2_id, collaboration_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE OR REPLACE VIEW v_collaborations_legacy AS
SELECT
    LEAST(a1.person_id, a2.person_id) AS person1_id,
    p1.preferred_name AS person1_name,
    GREATEST(a1.person_id, a2.person_id) AS person2_id,
    p2.preferred_name AS person2_name,
    COUNT(DISTINCT a1.work_id) AS collaboration_count,
    MIN(py.min_yr) AS first_collaboration_year,
    MAX(py.max_yr) AS latest_collaboration_year,
    ROUND(AVG(w.citation_count), 2) AS avg_citations_together
FROM authorships a1
JOIN authorships a2
  ON a1.work_id = a2.work_id
 AND a1.person_id < a2.person_id
JOIN persons p1
  ON p1.id = a1.person_id
JOIN persons p2
  ON p2.id = a2.person_id
JOIN works w
  ON w.id = a1.work_id
JOIN (
    SELECT publications.work_id, MIN(publications.year) AS min_yr, MAX(publications.year) AS max_yr
    FROM publications
    GROUP BY publications.work_id
) py
  ON py.work_id = w.id
GROUP BY
    LEAST(a1.person_id, a2.person_id),
    p1.preferred_name,
    GREATEST(a1.person_id, a2.person_id),
    p2.preferred_name;

DROP PROCEDURE IF EXISTS sp_refresh_collaboration_cache;
DELIMITER ;;
CREATE PROCEDURE sp_refresh_collaboration_cache(IN p_apply TINYINT, IN p_min_collaborations INT)
BEGIN
    DECLARE v_apply TINYINT DEFAULT 1;
    DECLARE v_min INT DEFAULT 1;
    DECLARE v_has_cache INT DEFAULT 0;
    DECLARE v_rows BIGINT DEFAULT 0;

    SET v_apply = IFNULL(p_apply, 1);
    SET v_min = IFNULL(NULLIF(p_min_collaborations, 0), 1);

    DROP TEMPORARY TABLE IF EXISTS tmp_publication_year_span;
    CREATE TEMPORARY TABLE tmp_publication_year_span (
        work_id INT NOT NULL PRIMARY KEY,
        min_year SMALLINT DEFAULT NULL,
        max_year SMALLINT DEFAULT NULL
    ) ENGINE=InnoDB;

    INSERT INTO tmp_publication_year_span (work_id, min_year, max_year)
    SELECT p.work_id, MIN(p.year), MAX(p.year)
    FROM publications p
    GROUP BY p.work_id;

    DROP TABLE IF EXISTS collaboration_cache_build;
    CREATE TABLE collaboration_cache_build (
        person1_id INT NOT NULL,
        person2_id INT NOT NULL,
        collaboration_count INT NOT NULL,
        first_collaboration_year SMALLINT DEFAULT NULL,
        latest_collaboration_year SMALLINT DEFAULT NULL,
        avg_citations_together DECIMAL(10,2) DEFAULT NULL,
        refreshed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (person1_id, person2_id),
        KEY idx_collaboration_count (collaboration_count),
        KEY idx_collaboration_person1_count (person1_id, collaboration_count),
        KEY idx_collaboration_person2_count (person2_id, collaboration_count)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

    INSERT INTO collaboration_cache_build (
        person1_id,
        person2_id,
        collaboration_count,
        first_collaboration_year,
        latest_collaboration_year,
        avg_citations_together,
        refreshed_at
    )
    SELECT
        a1.person_id AS person1_id,
        a2.person_id AS person2_id,
        COUNT(DISTINCT a1.work_id) AS collaboration_count,
        MIN(py.min_year) AS first_collaboration_year,
        MAX(py.max_year) AS latest_collaboration_year,
        ROUND(AVG(w.citation_count), 2) AS avg_citations_together,
        NOW() AS refreshed_at
    FROM authorships a1
    JOIN authorships a2
      ON a1.work_id = a2.work_id
     AND a1.person_id < a2.person_id
    JOIN works w
      ON w.id = a1.work_id
    LEFT JOIN tmp_publication_year_span py
      ON py.work_id = a1.work_id
    GROUP BY a1.person_id, a2.person_id
    HAVING COUNT(DISTINCT a1.work_id) >= v_min;

    SELECT COUNT(*) INTO v_rows FROM collaboration_cache_build;

    IF v_apply = 1 THEN
        SELECT COUNT(*)
          INTO v_has_cache
          FROM information_schema.tables
         WHERE table_schema = DATABASE()
           AND table_name = 'collaboration_cache';

        IF v_has_cache = 1 THEN
            RENAME TABLE collaboration_cache TO collaboration_cache_prev, collaboration_cache_build TO collaboration_cache;
            DROP TABLE collaboration_cache_prev;
        ELSE
            RENAME TABLE collaboration_cache_build TO collaboration_cache;
        END IF;
    ELSE
        DROP TABLE collaboration_cache_build;
    END IF;

    SELECT
        v_apply AS apply_mode,
        v_min AS min_collaborations,
        v_rows AS rows_built;
END;;
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_repair_work_references_consistency;
DELIMITER ;;
CREATE PROCEDURE sp_repair_work_references_consistency(IN p_apply TINYINT)
BEGIN
    DECLARE v_apply TINYINT DEFAULT 1;
    DECLARE v_before_invalid BIGINT DEFAULT 0;
    DECLARE v_exact_matches BIGINT DEFAULT 0;
    DECLARE v_set_pending BIGINT DEFAULT 0;
    DECLARE v_after_invalid BIGINT DEFAULT 0;

    SET v_apply = IFNULL(p_apply, 1);

    SELECT COUNT(*)
      INTO v_before_invalid
      FROM work_references wr
     WHERE wr.status = 'RESOLVED'
       AND wr.cited_work_id IS NULL;

    SELECT COUNT(*)
      INTO v_exact_matches
      FROM work_references wr
      JOIN publications p ON p.doi = wr.cited_doi
     WHERE wr.status = 'RESOLVED'
       AND wr.cited_work_id IS NULL;

    IF v_apply = 1 THEN
        UPDATE work_references wr
        JOIN publications p
          ON p.doi = wr.cited_doi
        SET wr.cited_work_id = p.work_id,
            wr.resolved_at = COALESCE(wr.resolved_at, NOW())
        WHERE wr.status = 'RESOLVED'
          AND wr.cited_work_id IS NULL;

        UPDATE work_references wr
        SET wr.status = 'PENDING',
            wr.resolved_at = NULL
        WHERE wr.status = 'RESOLVED'
          AND wr.cited_work_id IS NULL;

        SET v_set_pending = ROW_COUNT();
    END IF;

    SELECT COUNT(*)
      INTO v_after_invalid
      FROM work_references wr
     WHERE wr.status = 'RESOLVED'
       AND wr.cited_work_id IS NULL;

    SELECT
        v_apply AS apply_mode,
        v_before_invalid AS invalid_before,
        v_exact_matches AS exact_matches_available,
        v_set_pending AS rows_set_to_pending,
        v_after_invalid AS invalid_after;
END;;
DELIMITER ;

CREATE OR REPLACE VIEW v_sphinx_publications_index AS
SELECT
    p.id AS id,
    p.work_id AS work_id,
    p.doi AS doi,
    p.year AS year,
    p.open_access AS open_access,
    p.peer_reviewed AS peer_reviewed,
    p.created_at AS created_at
FROM publications p;
