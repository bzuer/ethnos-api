DROP PROCEDURE IF EXISTS sp_refresh_summary_publications_for_work;

DELIMITER $$

CREATE PROCEDURE sp_refresh_summary_publications_for_work(IN p_work_id INT)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_work_id IS NULL OR p_work_id <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'p_work_id must be a positive integer';
    END IF;

    SET SESSION group_concat_max_len = 1000000;

    START TRANSACTION;

    DELETE FROM summary_publications WHERE work_id = p_work_id;

    INSERT INTO summary_publications (
        publication_id, work_id, venue_id, publisher_id,
        title_search, abstract_search, authors_search, venue_search, subjects_search,
        doi, work_type, publication_year, language, open_access, peer_reviewed,
        has_files, work_citation_count, work_reference_count, publication_download_count,
        authors_json, subjects_json, files_json
    )
    SELECT
        pub.id,
        w.id,
        pub.venue_id,
        pub.publisher_id,
        w.title,
        w.abstract,
        (SELECT GROUP_CONCAT(p.preferred_name SEPARATOR ' ')
           FROM authorships a
           JOIN persons p ON p.id = a.person_id
           WHERE a.work_id = w.id),
        v.name,
        (SELECT GROUP_CONCAT(s.term SEPARATOR ' ')
           FROM work_subjects ws
           JOIN subjects s ON s.id = ws.subject_id
           WHERE ws.work_id = w.id),
        pub.doi,
        w.work_type,
        pub.year,
        w.language,
        pub.open_access,
        pub.peer_reviewed,
        (SELECT COUNT(*) > 0 FROM files WHERE publication_id = pub.id),
        w.citation_count,
        w.reference_count,
        (SELECT COALESCE(SUM(download_count), 0) FROM files WHERE publication_id = pub.id),
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', p.id, 'name', p.preferred_name, 'role', a.role))
           FROM authorships a
           JOIN persons p ON p.id = a.person_id
           WHERE a.work_id = w.id),
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', s.id, 'term', s.term))
           FROM work_subjects ws
           JOIN subjects s ON s.id = ws.subject_id
           WHERE ws.work_id = w.id),
        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                  'id', f.id,
                  'format', f.file_format,
                  'size', f.file_size,
                  'role', f.file_role,
                  'md5', f.md5
                ))
           FROM files f
           WHERE f.publication_id = pub.id)
    FROM works w
    JOIN publications pub ON pub.work_id = w.id
    LEFT JOIN venues v ON v.id = pub.venue_id
    WHERE w.id = p_work_id;

    COMMIT;
END$$

DELIMITER ;
