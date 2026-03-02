DROP PROCEDURE IF EXISTS `sp_process_sphinx_queue`;
DROP PROCEDURE IF EXISTS `sp_refresh_single_work_sphinx`;
DROP PROCEDURE IF EXISTS `sp_update_works_summary`;

DELIMITER ;;

CREATE PROCEDURE `sp_process_sphinx_queue`()
BEGIN
    DECLARE v_batch_limit INT DEFAULT 1000;

    CREATE TEMPORARY TABLE IF NOT EXISTS temp_sphinx_batch (
        id INT PRIMARY KEY,
        work_id INT
    );
    TRUNCATE TABLE temp_sphinx_batch;

    INSERT INTO temp_sphinx_batch (id, work_id)
    SELECT id, work_id
    FROM sphinx_queue
    WHERE status = 'pending'
    ORDER BY queued_at ASC
    LIMIT v_batch_limit;

    UPDATE sphinx_queue q
    JOIN temp_sphinx_batch t ON q.id = t.id
    SET q.status = 'processing', q.processed_at = NOW();

    INSERT INTO sphinx_works_summary 
        (
            id, title, subtitle, abstract, author_string, first_author_name, venue_name, venue_abbrev, publisher_name, doi,
            publication_id, venue_id, publisher_id, first_author_id,
            created_ts, `year`, work_type, `language`, open_access, peer_reviewed,
            author_count, institutions_count, citation_count, reference_count,
            resolved_references_count, pending_references_count, cited_by_count,
            has_pending_references, has_files,
            subjects_string
        )
    SELECT
        w.id, w.title, w.subtitle, w.abstract, was.author_string, fa.preferred_name, v.name, v.abbreviated_name, org.name, lp.doi,
        lp.publication_id, lp.venue_id, lp.publisher_id, was.first_author_id,
        UNIX_TIMESTAMP(w.created_at), COALESCE(lp.`year`, 0), w.work_type, w.language,
        COALESCE(lp.open_access, 0), COALESCE(lp.peer_reviewed, 0),
        COALESCE(auth.author_count, 0), COALESCE(auth.institutions_count, 0), COALESCE(w.citation_count, 0), COALESCE(w.reference_count, 0),
        COALESCE(wr_out.resolved_references_count, 0), COALESCE(wr_out.pending_references_count, 0), COALESCE(wr_in.cited_by_count, 0),
        CASE WHEN COALESCE(wr_out.pending_references_count, 0) > 0 THEN 1 ELSE 0 END,
        CASE WHEN COALESCE(file_map.files_count, 0) > 0 THEN 1 ELSE 0 END,
        wss.subjects_string
    FROM works w
    JOIN temp_sphinx_batch t ON w.id = t.work_id
    LEFT JOIN work_author_summary was ON was.work_id = w.id
    LEFT JOIN persons fa ON fa.id = was.first_author_id
    LEFT JOIN (
        SELECT a.work_id,
               COUNT(*) AS author_count,
               COUNT(DISTINCT CASE WHEN a.affiliation_id IS NOT NULL THEN a.affiliation_id END) AS institutions_count
        FROM authorships a
        JOIN temp_sphinx_batch t_auth ON t_auth.work_id = a.work_id
        GROUP BY a.work_id
    ) auth ON auth.work_id = w.id
    LEFT JOIN (
        SELECT id AS publication_id, work_id, doi, `year`, open_access, peer_reviewed, venue_id, publisher_id,
               ROW_NUMBER() OVER(PARTITION BY work_id ORDER BY `year` DESC, id DESC) as rn
        FROM publications
    ) lp ON lp.work_id = w.id AND lp.rn = 1
    LEFT JOIN venues v ON v.id = lp.venue_id
    LEFT JOIN organizations org ON org.id = lp.publisher_id
    LEFT JOIN (
        SELECT wr.citing_work_id AS work_id,
               SUM(wr.status = 'RESOLVED') AS resolved_references_count,
               SUM(wr.status = 'PENDING') AS pending_references_count
        FROM work_references wr
        JOIN temp_sphinx_batch t_out ON t_out.work_id = wr.citing_work_id
        GROUP BY wr.citing_work_id
    ) wr_out ON wr_out.work_id = w.id
    LEFT JOIN (
        SELECT wr.cited_work_id AS work_id,
               COUNT(*) AS cited_by_count
        FROM work_references wr
        JOIN temp_sphinx_batch t_in ON t_in.work_id = wr.cited_work_id
        WHERE wr.status = 'RESOLVED' AND wr.cited_work_id IS NOT NULL
        GROUP BY wr.cited_work_id
    ) wr_in ON wr_in.work_id = w.id
    LEFT JOIN (
        SELECT f.work_id, COUNT(*) AS files_count
        FROM files f
        JOIN temp_sphinx_batch t_file ON t_file.work_id = f.work_id
        WHERE f.work_id IS NOT NULL
        GROUP BY f.work_id
    ) file_map ON file_map.work_id = w.id
    LEFT JOIN work_subjects_summary wss ON wss.work_id = w.id
    ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        subtitle = VALUES(subtitle),
        abstract = VALUES(abstract),
        author_string = VALUES(author_string),
        first_author_name = VALUES(first_author_name),
        venue_name = VALUES(venue_name),
        venue_abbrev = VALUES(venue_abbrev),
        publisher_name = VALUES(publisher_name),
        doi = VALUES(doi),
        publication_id = VALUES(publication_id),
        venue_id = VALUES(venue_id),
        publisher_id = VALUES(publisher_id),
        first_author_id = VALUES(first_author_id),
        year = VALUES(year),
        work_type = VALUES(work_type),
        language = VALUES(language),
        peer_reviewed = VALUES(peer_reviewed),
        open_access = VALUES(open_access),
        author_count = VALUES(author_count),
        institutions_count = VALUES(institutions_count),
        citation_count = VALUES(citation_count),
        reference_count = VALUES(reference_count),
        resolved_references_count = VALUES(resolved_references_count),
        pending_references_count = VALUES(pending_references_count),
        cited_by_count = VALUES(cited_by_count),
        has_pending_references = VALUES(has_pending_references),
        has_files = VALUES(has_files),
        created_ts = VALUES(created_ts),
        subjects_string = VALUES(subjects_string);

    UPDATE sphinx_queue q
    JOIN temp_sphinx_batch t ON q.id = t.id
    SET q.status = 'completed';

    DROP TEMPORARY TABLE temp_sphinx_batch;
END ;;

CREATE PROCEDURE `sp_refresh_single_work_sphinx`(IN p_work_id INT)
BEGIN
    IF EXISTS (SELECT 1 FROM works WHERE id = p_work_id) THEN
        CALL sp_update_work_author_summary(p_work_id);
        CALL sp_update_work_subjects_summary(p_work_id);

        REPLACE INTO sphinx_works_summary 
            (
                id, title, subtitle, abstract, author_string, first_author_name, venue_name, venue_abbrev, publisher_name, doi,
                publication_id, venue_id, publisher_id, first_author_id,
                created_ts, `year`, work_type, `language`, open_access, peer_reviewed,
                author_count, institutions_count, citation_count, reference_count,
                resolved_references_count, pending_references_count, cited_by_count,
                has_pending_references, has_files,
                subjects_string
            )
        SELECT
            w.id, w.title, w.subtitle, w.abstract, was.author_string, fa.preferred_name, v.name, v.abbreviated_name, org.name, lp.doi,
            lp.publication_id, lp.venue_id, lp.publisher_id, was.first_author_id,
            UNIX_TIMESTAMP(w.created_at), COALESCE(lp.`year`, 0), w.work_type, w.language,
            COALESCE(lp.open_access, 0), COALESCE(lp.peer_reviewed, 0),
            COALESCE(auth.author_count, 0), COALESCE(auth.institutions_count, 0), COALESCE(w.citation_count, 0), COALESCE(w.reference_count, 0),
            COALESCE(wr_out.resolved_references_count, 0), COALESCE(wr_out.pending_references_count, 0), COALESCE(wr_in.cited_by_count, 0),
            CASE WHEN COALESCE(wr_out.pending_references_count, 0) > 0 THEN 1 ELSE 0 END,
            CASE WHEN COALESCE(file_map.files_count, 0) > 0 THEN 1 ELSE 0 END,
            wss.subjects_string
        FROM works w
        LEFT JOIN work_author_summary was ON was.work_id = w.id
        LEFT JOIN persons fa ON fa.id = was.first_author_id
        LEFT JOIN (
            SELECT a.work_id,
                   COUNT(*) AS author_count,
                   COUNT(DISTINCT CASE WHEN a.affiliation_id IS NOT NULL THEN a.affiliation_id END) AS institutions_count
            FROM authorships a
            WHERE a.work_id = p_work_id
            GROUP BY a.work_id
        ) auth ON auth.work_id = w.id
        LEFT JOIN (
            SELECT id AS publication_id, work_id, doi, `year`, open_access, peer_reviewed, venue_id, publisher_id,
                   ROW_NUMBER() OVER(PARTITION BY work_id ORDER BY `year` DESC, id DESC) as rn
            FROM publications WHERE work_id = p_work_id
        ) lp ON lp.work_id = w.id AND lp.rn = 1
        LEFT JOIN venues v ON v.id = lp.venue_id
        LEFT JOIN organizations org ON org.id = lp.publisher_id
        LEFT JOIN (
            SELECT wr.citing_work_id AS work_id,
                   SUM(wr.status = 'RESOLVED') AS resolved_references_count,
                   SUM(wr.status = 'PENDING') AS pending_references_count
            FROM work_references wr
            WHERE wr.citing_work_id = p_work_id
            GROUP BY wr.citing_work_id
        ) wr_out ON wr_out.work_id = w.id
        LEFT JOIN (
            SELECT wr.cited_work_id AS work_id,
                   COUNT(*) AS cited_by_count
            FROM work_references wr
            WHERE wr.status = 'RESOLVED'
              AND wr.cited_work_id = p_work_id
            GROUP BY wr.cited_work_id
        ) wr_in ON wr_in.work_id = w.id
        LEFT JOIN (
            SELECT f.work_id, COUNT(*) AS files_count
            FROM files f
            WHERE f.work_id = p_work_id
            GROUP BY f.work_id
        ) file_map ON file_map.work_id = w.id
        LEFT JOIN work_subjects_summary wss ON wss.work_id = w.id 
        WHERE w.id = p_work_id;
    ELSE
        DELETE FROM sphinx_queue WHERE work_id = p_work_id;
    END IF;
END ;;

CREATE PROCEDURE `sp_update_works_summary`()
BEGIN
    INSERT INTO sphinx_works_summary 
        (
            id, title, subtitle, abstract, author_string, first_author_name, venue_name, venue_abbrev, publisher_name, doi,
            publication_id, venue_id, publisher_id, first_author_id,
            created_ts, `year`, work_type, `language`, open_access, peer_reviewed,
            author_count, institutions_count, citation_count, reference_count,
            resolved_references_count, pending_references_count, cited_by_count,
            has_pending_references, has_files,
            subjects_string
        )
    WITH LatestPublication AS (
        SELECT
            p.id AS publication_id, p.work_id, p.doi, p.`year`, p.open_access, p.peer_reviewed, p.venue_id, p.publisher_id,
            ROW_NUMBER() OVER(PARTITION BY p.work_id ORDER BY p.`year` DESC, p.id DESC) as rn
        FROM publications p
    ),
    AuthAgg AS (
        SELECT
            a.work_id,
            COUNT(*) AS author_count,
            COUNT(DISTINCT CASE WHEN a.affiliation_id IS NOT NULL THEN a.affiliation_id END) AS institutions_count
        FROM authorships a
        GROUP BY a.work_id
    ),
    WorkReferencesOutgoing AS (
        SELECT
            wr.citing_work_id AS work_id,
            SUM(wr.status = 'RESOLVED') AS resolved_references_count,
            SUM(wr.status = 'PENDING') AS pending_references_count
        FROM work_references wr
        GROUP BY wr.citing_work_id
    ),
    WorkReferencesIncoming AS (
        SELECT
            wr.cited_work_id AS work_id,
            COUNT(*) AS cited_by_count
        FROM work_references wr
        WHERE wr.status = 'RESOLVED' AND wr.cited_work_id IS NOT NULL
        GROUP BY wr.cited_work_id
    ),
    FileAgg AS (
        SELECT f.work_id, COUNT(*) AS files_count
        FROM files f
        WHERE f.work_id IS NOT NULL
        GROUP BY f.work_id
    )
    SELECT
        w.id, w.title, w.subtitle, w.abstract, was.author_string, fa.preferred_name AS first_author_name, v.name AS venue_name, v.abbreviated_name AS venue_abbrev, org.name AS publisher_name, lp.doi,
        lp.publication_id, lp.venue_id, lp.publisher_id, was.first_author_id,
        UNIX_TIMESTAMP(w.created_at) AS created_ts, lp.`year`, w.work_type, w.language,
        lp.open_access, lp.peer_reviewed,
        COALESCE(auth.author_count, 0), COALESCE(auth.institutions_count, 0), COALESCE(w.citation_count, 0), COALESCE(w.reference_count, 0),
        COALESCE(wr_out.resolved_references_count, 0), COALESCE(wr_out.pending_references_count, 0), COALESCE(wr_in.cited_by_count, 0),
        CASE WHEN COALESCE(wr_out.pending_references_count, 0) > 0 THEN 1 ELSE 0 END,
        CASE WHEN COALESCE(file_map.files_count, 0) > 0 THEN 1 ELSE 0 END,
        wss.subjects_string 
    FROM works w
    LEFT JOIN work_author_summary was ON was.work_id = w.id
    LEFT JOIN persons fa ON fa.id = was.first_author_id
    LEFT JOIN LatestPublication lp ON lp.work_id = w.id AND lp.rn = 1
    LEFT JOIN venues v ON v.id = lp.venue_id
    LEFT JOIN organizations org ON org.id = lp.publisher_id
    LEFT JOIN AuthAgg auth ON auth.work_id = w.id
    LEFT JOIN WorkReferencesOutgoing wr_out ON wr_out.work_id = w.id
    LEFT JOIN WorkReferencesIncoming wr_in ON wr_in.work_id = w.id
    LEFT JOIN FileAgg file_map ON file_map.work_id = w.id
    LEFT JOIN work_subjects_summary wss ON wss.work_id = w.id 
    ON DUPLICATE KEY UPDATE
        title = VALUES(title), subtitle = VALUES(subtitle), abstract = VALUES(abstract), author_string = VALUES(author_string),
        first_author_name = VALUES(first_author_name), venue_name = VALUES(venue_name), venue_abbrev = VALUES(venue_abbrev), publisher_name = VALUES(publisher_name),
        doi = VALUES(doi), publication_id = VALUES(publication_id), venue_id = VALUES(venue_id), publisher_id = VALUES(publisher_id), first_author_id = VALUES(first_author_id),
        `year` = VALUES(`year`), work_type = VALUES(work_type), `language` = VALUES(`language`), open_access = VALUES(open_access), peer_reviewed = VALUES(peer_reviewed),
        author_count = VALUES(author_count), institutions_count = VALUES(institutions_count),
        citation_count = VALUES(citation_count), reference_count = VALUES(reference_count),
        resolved_references_count = VALUES(resolved_references_count), pending_references_count = VALUES(pending_references_count), cited_by_count = VALUES(cited_by_count),
        has_pending_references = VALUES(has_pending_references), has_files = VALUES(has_files),
        subjects_string = VALUES(subjects_string);
END ;;

DELIMITER ;
