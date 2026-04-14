DROP PROCEDURE IF EXISTS sp_build_summary_publications;

DELIMITER $$

CREATE PROCEDURE sp_build_summary_publications(IN p_batch_size INT)
BEGIN
    DECLARE v_min_id INT;
    DECLARE v_max_id INT;
    DECLARE v_current_id INT;

    IF p_batch_size IS NULL OR p_batch_size <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'p_batch_size must be a positive integer';
    END IF;

    SET SESSION group_concat_max_len = 1000000;

    SELECT MIN(id), MAX(id) INTO v_min_id, v_max_id FROM works;
    SET v_current_id = COALESCE(v_min_id, 0);

    TRUNCATE TABLE summary_publications;

    DROP TEMPORARY TABLE IF EXISTS tmp_batch_authors;
    CREATE TEMPORARY TABLE tmp_batch_authors (
        work_id INT PRIMARY KEY,
        authors_search MEDIUMTEXT,
        authors_json LONGTEXT
    ) ENGINE=InnoDB;

    DROP TEMPORARY TABLE IF EXISTS tmp_batch_subjects;
    CREATE TEMPORARY TABLE tmp_batch_subjects (
        work_id INT PRIMARY KEY,
        subjects_search MEDIUMTEXT,
        subjects_json LONGTEXT
    ) ENGINE=InnoDB;

    DROP TEMPORARY TABLE IF EXISTS tmp_batch_files;
    CREATE TEMPORARY TABLE tmp_batch_files (
        publication_id INT PRIMARY KEY,
        files_json LONGTEXT,
        publication_download_count INT
    ) ENGINE=InnoDB;

    WHILE v_current_id <= v_max_id DO

        TRUNCATE TABLE tmp_batch_authors;
        TRUNCATE TABLE tmp_batch_subjects;
        TRUNCATE TABLE tmp_batch_files;

        START TRANSACTION;

        INSERT INTO tmp_batch_authors (work_id, authors_search, authors_json)
        SELECT
            a.work_id,
            GROUP_CONCAT(p.preferred_name SEPARATOR ' '),
            JSON_ARRAYAGG(JSON_OBJECT('id', p.id, 'name', p.preferred_name, 'role', a.role))
        FROM authorships a
        JOIN persons p ON a.person_id = p.id
        WHERE a.work_id >= v_current_id AND a.work_id < v_current_id + p_batch_size
        GROUP BY a.work_id;

        INSERT INTO tmp_batch_subjects (work_id, subjects_search, subjects_json)
        SELECT
            ws.work_id,
            GROUP_CONCAT(s.term SEPARATOR ' '),
            JSON_ARRAYAGG(JSON_OBJECT('id', s.id, 'term', s.term))
        FROM work_subjects ws
        JOIN subjects s ON ws.subject_id = s.id
        WHERE ws.work_id >= v_current_id AND ws.work_id < v_current_id + p_batch_size
        GROUP BY ws.work_id;

        INSERT INTO tmp_batch_files (publication_id, files_json, publication_download_count)
        SELECT
            f.publication_id,
            JSON_ARRAYAGG(JSON_OBJECT(
                'id', f.id,
                'format', f.file_format,
                'size', f.file_size,
                'role', f.file_role,
                'md5', f.md5
            )),
            COALESCE(SUM(f.download_count), 0)
        FROM files f
        JOIN publications pub ON pub.id = f.publication_id
        WHERE pub.work_id >= v_current_id AND pub.work_id < v_current_id + p_batch_size
        GROUP BY f.publication_id;

        INSERT INTO summary_publications (
            publication_id, work_id, venue_id, publisher_id,
            title_search, abstract_search, authors_search, venue_search, subjects_search,
            doi, work_type, publication_year, language, open_access, peer_reviewed,
            has_files, work_citation_count, work_reference_count, publication_download_count,
            authors_json, subjects_json, files_json
        )
        SELECT
            pub.id, w.id, pub.venue_id, pub.publisher_id,
            w.title, w.abstract, tpa.authors_search, v.name, tps.subjects_search,
            pub.doi, w.work_type, pub.year, w.language, pub.open_access, pub.peer_reviewed,
            CASE WHEN tpf.publication_id IS NULL THEN 0 ELSE 1 END,
            w.citation_count, w.reference_count,
            COALESCE(tpf.publication_download_count, 0),
            tpa.authors_json, tps.subjects_json, tpf.files_json
        FROM works w
        JOIN publications pub ON pub.work_id = w.id
        LEFT JOIN venues v ON pub.venue_id = v.id
        LEFT JOIN tmp_batch_authors tpa ON w.id = tpa.work_id
        LEFT JOIN tmp_batch_subjects tps ON w.id = tps.work_id
        LEFT JOIN tmp_batch_files tpf ON pub.id = tpf.publication_id
        WHERE w.id >= v_current_id AND w.id < v_current_id + p_batch_size;

        COMMIT;

        SET v_current_id = v_current_id + p_batch_size;
    END WHILE;

    DROP TEMPORARY TABLE IF EXISTS tmp_batch_authors;
    DROP TEMPORARY TABLE IF EXISTS tmp_batch_subjects;
    DROP TEMPORARY TABLE IF EXISTS tmp_batch_files;
END$$

DELIMITER ;
