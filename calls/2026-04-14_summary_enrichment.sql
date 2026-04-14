-- ============================================================================
-- Summary enrichment request — 2026-04-14
-- ============================================================================
--
-- Filed by: Ethnos_API project (consumer-only).
-- Target:   `data` database.
-- Scope:    additive enrichment of the three `summary_*` tables and their
--           build/refresh procedures so the API can serve detail and listing
--           responses without falling back to base-table joins.
--
-- The Ethnos_API project NEVER calls these procedures or runs any of the SQL
-- in this file directly. The file is a request to the operator's separate
-- pipeline. After the operator applies it the project will read the new
-- columns/JSON fields from `summary_publications`, `summary_venues`, and
-- `summary_persons` via plain `SELECT`.
--
-- STATUS as of 2026-04-14 (applied by operator):
--
--   Mudança 1 (files_json enrichment) ............. APPLIED + rebuilt
--     summary_publications.files_json now carries libgen_id / scimag_id /
--     openacess_id / best_oa_url / version / verification / downloads /
--     pages / language on every row. Consumer side wired in
--     src/dto/publication.dto.js::mapFiles.
--
--   Mudança 2 (venue score breakdown) ............. APPLIED + rebuilt
--     summary_venues rebuilt with score_breakdown_json populated for all
--     30 350 rows, plus sjr / snip / i10_index / two_yr_mean_citedness /
--     is_in_doaj / is_in_scielo / is_indexed_in_scopus / homepage_url.
--     Consumer side wired in src/dto/venue.dto.js::buildScoreBreakdown
--     and src/services/venues.service.js (base query extended).
--
--   Mudança 3 (signature text in persons) ......... APPLIED + rebuilt
--     summary_persons rebuilt with signature_text / family_name /
--     given_names / normalized_name denormalised on 4 466 008 rows.
--     Current consumer path already JOINs the base `signatures` table
--     (src/services/persons.service.js); future endpoints that read
--     summary_persons directly can now skip the JOIN.
--
--   Mudança 4 (identifiers_json + bibliographic columns) ... APPLIED
--     Build proc patched (see "Request 1 follow-up" below) and
--     summary_publications rebuilt. identifiers_json populated on every
--     row (6 567 062); volume present on 6 012 157 rows; publication_date
--     on 6 566 689. Consumer side wired: publications.service.js and
--     works.service.js::_getCompleteWorkData no longer JOIN the base
--     `publications` table — every bibliographic field and identifier
--     reads from summary_publications directly.
--
--   Mudança 5 (has_scimag_file / has_libgen_file flags) .... APPLIED
--     Same follow-up rebuild populated both flags: has_scimag_file on
--     3 419 557 rows (matches base `files` count), has_libgen_file on
--     16 269 rows. Consumer exposes both as top-level booleans on the
--     publication DTO (list + detail + sibling shapes).
--
-- Live-state baseline at filing time (informational):
--
--   summary_publications: 6 567 062 rows
--   summary_venues:          30 350 rows (all)
--   summary_persons:      4 466 053 rows
--   files: 3 419 557 with scimag_id, 1 396 317 with best_oa_url,
--          19 925 with libgen_id  (out of ≈ 4.5 M files total)
--   persons: 4 466 008 / 4 466 053 carry a signature_id (≈ 100 %)
--   signatures: 2 883 785 distinct → ≈ 1.55 persons/signature avg
--
-- The five changes below were independent and applied in any order. The
-- follow-up section at the bottom of this file closes the gap left by
-- Mudanças 4 and 5 (ALTER TABLEs landed, procedure bodies did not).
-- ============================================================================


-- ============================================================================
-- --- Mudança 1 — Enriquecer files_json em summary_publications ---
-- ============================================================================
--
-- Why
-- ---
-- Today every entry in `summary_publications.files_json` carries only
-- `{ id, format, size, role, md5 }`. The consumer cannot route the user to
-- the right file source without an extra query against the base `files`
-- table because each of the three real download paths needs a different
-- identifier:
--
--   - OA route       → `best_oa_url`           (1.4 M files)
--   - sci-hub route  → publication DOI + scimag_id flag  (3.4 M files)
--   - libgen route   → libgen.li/md5/<md5> + libgen_id flag (≈ 20 k files)
--
-- Storing only `md5` forces the API to hit `files` per request just to
-- discover whether a row qualifies for sci-hub or libgen. Adding the four
-- source identifiers plus a few low-cost bibliographic fields removes the
-- secondary query entirely.
--
-- Change
-- ------
-- Patch `sp_build_summary_publications` AND `sp_refresh_summary_publications_for_work`
-- so the JSON projection becomes:
--
--   {
--     "id": <files.id>,
--     "format": <files.file_format>,
--     "size": <files.file_size>,
--     "role": <files.file_role>,
--     "md5": <files.md5>,
--     "libgen_id": <files.libgen_id>,        -- NULL unless libgen
--     "scimag_id": <files.scimag_id>,        -- NULL unless sci-hub
--     "openacess_id": <files.openacess_id>,  -- NULL unless OA-indexed
--     "best_oa_url": <files.best_oa_url>,    -- NULL unless OA
--     "pages": <files.pages>,
--     "language": <files.language>,
--     "version": <files.version>,            -- e.g. publishedVersion / acceptedVersion
--     "verification": <files.verification_status>,
--     "downloads": <files.download_count>
--   }
--
-- The schema of `summary_publications` itself does not change — only the
-- contents of the LONGTEXT `files_json` column. No ALTER TABLE is needed.
--
-- Rollback: re-create either procedure from
-- `git show <pre-change>:database/data.schema.sql`.

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
                'id',           f.id,
                'format',       f.file_format,
                'size',         f.file_size,
                'role',         f.file_role,
                'md5',          f.md5,
                'libgen_id',    f.libgen_id,
                'scimag_id',    f.scimag_id,
                'openacess_id', f.openacess_id,
                'best_oa_url',  f.best_oa_url,
                'pages',        f.pages,
                'language',     f.language,
                'version',      f.version,
                'verification', f.verification_status,
                'downloads',    f.download_count
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
                  'id',           f.id,
                  'format',       f.file_format,
                  'size',         f.file_size,
                  'role',         f.file_role,
                  'md5',          f.md5,
                  'libgen_id',    f.libgen_id,
                  'scimag_id',    f.scimag_id,
                  'openacess_id', f.openacess_id,
                  'best_oa_url',  f.best_oa_url,
                  'pages',        f.pages,
                  'language',     f.language,
                  'version',      f.version,
                  'verification', f.verification_status,
                  'downloads',    f.download_count
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


-- ============================================================================
-- --- Mudança 2 — Score breakdown e flags de qualidade em summary_venues ---
-- ============================================================================
--
-- Why
-- ---
-- `summary_venues.global_ranking_score` already mirrors `venues.total_score`
-- (verified live: same value for the top-ranked venues). What is missing is
-- the **breakdown** of how that score was assembled — the subject_score,
-- snip_score, oa_score, authorship_score, affiliation_score, citation_score,
-- llm_score components — and the supporting bibliometric signals that the
-- ranking pipeline already computed (sjr, snip, i10_index, 2yr_mean_citedness,
-- llm_relevance, llm_justification, validation_status).
--
-- The venue ranking pipeline is the most carefully built scoring code in the
-- whole DB. Surfacing the per-component breakdown lets the API explain *why*
-- a venue is ranked high (subject fit vs metric vs LLM judgement vs OA
-- posture) without having to JOIN back to `venues` per request.
--
-- The quality flags `is_in_doaj`, `is_in_scielo`, `is_indexed_in_scopus`
-- live on the base table but are absent from the summary, so the API
-- currently cannot filter on them from the listing path.
--
-- Change
-- ------
-- Add eight scalar columns and one JSON column to `summary_venues`, then
-- patch `sp_build_summary_venues` to populate them from `venues`.
--
-- The score breakdown lives in a dedicated `score_breakdown_json` column so
-- the schema can absorb future score components without further ALTERs.
--
-- New columns:
--   sjr                       DECIMAL(6,3)   NULL
--   snip                      DECIMAL(6,3)   NULL
--   i10_index                 INT            NULL
--   two_yr_mean_citedness     DECIMAL(10,5)  NULL
--   is_in_doaj                TINYINT(1)     DEFAULT 0
--   is_in_scielo              TINYINT(1)     DEFAULT 0
--   is_indexed_in_scopus      TINYINT(1)     DEFAULT 0
--   homepage_url              VARCHAR(512)   NULL
--   score_breakdown_json      LONGTEXT       NULL  (JSON)
--
-- New index:
--   idx_summary_venues_quality (is_in_doaj, is_in_scielo, is_indexed_in_scopus)
--
-- Rollback:
--   ALTER TABLE summary_venues
--     DROP COLUMN sjr, DROP COLUMN snip, DROP COLUMN i10_index,
--     DROP COLUMN two_yr_mean_citedness,
--     DROP COLUMN is_in_doaj, DROP COLUMN is_in_scielo,
--     DROP COLUMN is_indexed_in_scopus, DROP COLUMN homepage_url,
--     DROP COLUMN score_breakdown_json,
--     DROP INDEX idx_summary_venues_quality;
--   plus restore the previous body of sp_build_summary_venues from
--   `git show <pre-change>:database/data.schema.sql`.

ALTER TABLE summary_venues
    ADD COLUMN sjr DECIMAL(6,3) DEFAULT NULL AFTER citescore,
    ADD COLUMN snip DECIMAL(6,3) DEFAULT NULL AFTER sjr,
    ADD COLUMN i10_index INT DEFAULT NULL AFTER h_index,
    ADD COLUMN two_yr_mean_citedness DECIMAL(10,5) DEFAULT NULL AFTER i10_index,
    ADD COLUMN is_in_doaj TINYINT(1) DEFAULT 0 AFTER two_yr_mean_citedness,
    ADD COLUMN is_in_scielo TINYINT(1) DEFAULT 0 AFTER is_in_doaj,
    ADD COLUMN is_indexed_in_scopus TINYINT(1) DEFAULT 0 AFTER is_in_scielo,
    ADD COLUMN homepage_url VARCHAR(512) DEFAULT NULL AFTER is_indexed_in_scopus,
    ADD COLUMN score_breakdown_json LONGTEXT DEFAULT NULL
        CHECK (json_valid(score_breakdown_json)) AFTER global_ranking_score,
    ADD INDEX idx_summary_venues_quality (is_in_doaj, is_in_scielo, is_indexed_in_scopus);


DROP PROCEDURE IF EXISTS sp_build_summary_venues;

DELIMITER $$

CREATE PROCEDURE sp_build_summary_venues()
BEGIN
    SET SESSION group_concat_max_len = 1000000;

    DROP TEMPORARY TABLE IF EXISTS tmp_venue_subjects;
    CREATE TEMPORARY TABLE tmp_venue_subjects (
        venue_id INT PRIMARY KEY,
        top_subjects_json LONGTEXT
    ) ENGINE=InnoDB;

    INSERT INTO tmp_venue_subjects (venue_id, top_subjects_json)
    SELECT venue_id, JSON_ARRAYAGG(JSON_OBJECT('id', subject_id, 'term', term, 'score', score))
    FROM (
        SELECT vs.venue_id, s.id AS subject_id, s.term, vs.score,
               ROW_NUMBER() OVER (PARTITION BY vs.venue_id ORDER BY vs.score DESC) AS rn
        FROM venue_subjects vs
        JOIN subjects s ON vs.subject_id = s.id
    ) ranked
    WHERE rn <= 10
    GROUP BY venue_id;

    TRUNCATE TABLE summary_venues;

    INSERT INTO summary_venues (
        venue_id, publisher_id, name_search, abbrev_search, publisher_search,
        venue_type, country_code, issn, eissn, scopus_id, open_access_status,
        total_publications_count, total_cited_by_count, coverage_start_year, coverage_end_year,
        global_ranking_score, score_breakdown_json,
        impact_factor, citescore, sjr, snip, h_index, i10_index, two_yr_mean_citedness,
        is_in_doaj, is_in_scielo, is_indexed_in_scopus, homepage_url,
        validation_status, top_subjects_json
    )
    SELECT
        v.id, v.publisher_id, v.name, v.abbreviated_name, o.name,
        v.type, v.country_code, v.issn, v.eissn, v.scopus_id, v.open_access,
        v.works_count, v.cited_by_count, v.coverage_start_year, v.coverage_end_year,
        v.total_score,
        JSON_OBJECT(
            'total',       v.total_score,
            'subject',     v.subject_score,
            'snip',        v.snip_score,
            'oa',          v.oa_score,
            'authorship',  v.authorship_score,
            'affiliation', v.affiliation_score,
            'citation',    v.citation_score,
            'llm',         v.llm_score,
            'llm_relevance',     v.llm_relevance,
            'llm_justification', v.llm_justification
        ),
        v.impact_factor, v.citescore, v.sjr, v.snip,
        v.h_index, v.i10_index, v.`2yr_mean_citedness`,
        v.is_in_doaj, v.is_in_scielo, v.is_indexed_in_scopus, v.homepage_url,
        v.validation_status, tvs.top_subjects_json
    FROM venues v
    LEFT JOIN organizations o ON v.publisher_id = o.id
    LEFT JOIN tmp_venue_subjects tvs ON v.id = tvs.venue_id;

    DROP TEMPORARY TABLE IF EXISTS tmp_venue_subjects;
END$$

DELIMITER ;


-- ============================================================================
-- --- Mudança 3 — Signature text denormalizada em summary_persons ---
-- ============================================================================
--
-- Why
-- ---
-- `summary_persons.signature_id` is already populated (≈ 100 % coverage:
-- 4 466 008 / 4 466 053 persons), but the API still has to JOIN the
-- `signatures` base table just to read the human-readable string
-- ("Silva M", "Duarte L F D"). Denormalising that text into the summary
-- removes the JOIN and lets the consumer:
--
--   - group people by signature directly from a single summary row,
--   - render "M Silva → Maria Silva / Marcio Silva / Marcos Silva" trees
--     without a second query,
--   - support a fulltext search over signature variants on the same index
--     that already serves preferred_name_search / name_variations_search.
--
-- The change is also load-bearing for the disambiguation path: when two
-- ORCID-less authors collapse onto the same signature, the API can present
-- them side-by-side without re-deriving the signature.
--
-- Change
-- ------
-- Add `signature_text VARCHAR(255) NULL` plus a btree index, and patch
-- `sp_build_summary_persons` to populate it from `signatures.signature`.
-- Also add `family_name` / `given_names` / `normalized_name` (already on
-- `persons`) so the consumer can render structured names without a JOIN.
--
-- Rollback:
--   ALTER TABLE summary_persons
--     DROP COLUMN signature_text,
--     DROP COLUMN family_name,
--     DROP COLUMN given_names,
--     DROP COLUMN normalized_name,
--     DROP INDEX idx_summary_persons_signature_text,
--     DROP INDEX idx_summary_persons_family_name;
--   plus restore the previous body of sp_build_summary_persons from
--   `git show <pre-change>:database/data.schema.sql`.

ALTER TABLE summary_persons
    ADD COLUMN signature_text VARCHAR(255) DEFAULT NULL AFTER signature_id,
    ADD COLUMN family_name VARCHAR(255) DEFAULT NULL AFTER preferred_name_search,
    ADD COLUMN given_names VARCHAR(255) DEFAULT NULL AFTER family_name,
    ADD COLUMN normalized_name VARCHAR(512) DEFAULT NULL AFTER given_names,
    ADD INDEX idx_summary_persons_signature_text (signature_text),
    ADD INDEX idx_summary_persons_family_name (family_name);


DROP PROCEDURE IF EXISTS sp_build_summary_persons;

DELIMITER $$

CREATE PROCEDURE sp_build_summary_persons(IN p_batch_size INT)
BEGIN
    DECLARE v_min_id INT;
    DECLARE v_max_id INT;
    DECLARE v_current_id INT;

    IF p_batch_size IS NULL OR p_batch_size <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'p_batch_size must be a positive integer';
    END IF;

    SET SESSION group_concat_max_len = 1000000;

    SELECT MIN(id), MAX(id) INTO v_min_id, v_max_id FROM persons;
    SET v_current_id = COALESCE(v_min_id, 0);

    TRUNCATE TABLE summary_persons;

    DROP TEMPORARY TABLE IF EXISTS tmp_batch_affiliations;
    CREATE TEMPORARY TABLE tmp_batch_affiliations (
        person_id INT PRIMARY KEY,
        affiliations_search MEDIUMTEXT,
        affiliations_json LONGTEXT
    ) ENGINE=InnoDB;

    WHILE v_current_id <= v_max_id DO
        TRUNCATE TABLE tmp_batch_affiliations;

        START TRANSACTION;

        INSERT INTO tmp_batch_affiliations (person_id, affiliations_search, affiliations_json)
        SELECT
            a.person_id,
            GROUP_CONCAT(DISTINCT o.name SEPARATOR ' '),
            JSON_ARRAYAGG(JSON_OBJECT('id', o.id, 'name', o.name, 'type', o.type))
        FROM authorships a
        JOIN organizations o ON a.affiliation_id = o.id
        WHERE a.person_id >= v_current_id AND a.person_id < v_current_id + p_batch_size
        GROUP BY a.person_id;

        INSERT INTO summary_persons (
            person_id, signature_id, signature_text,
            preferred_name_search, family_name, given_names, normalized_name,
            affiliations_search,
            orcid, scopus_id, lattes_id, is_verified,
            first_publication_year, latest_publication_year,
            total_publications_count, total_citations_count, h_index,
            corresponding_author_count, current_affiliations_json
        )
        SELECT
            p.id, p.signature_id, s.signature,
            p.preferred_name, p.family_name, p.given_names, p.normalized_name,
            tpa.affiliations_search,
            p.orcid, p.scopus_id, p.lattes_id, p.is_verified,
            p.first_publication_year, p.latest_publication_year,
            p.total_works, p.total_citations, p.h_index,
            p.corresponding_author_count, tpa.affiliations_json
        FROM persons p
        LEFT JOIN signatures s ON s.id = p.signature_id
        LEFT JOIN tmp_batch_affiliations tpa ON p.id = tpa.person_id
        WHERE p.id >= v_current_id AND p.id < v_current_id + p_batch_size;

        COMMIT;

        SET v_current_id = v_current_id + p_batch_size;
    END WHILE;

    DROP TEMPORARY TABLE IF EXISTS tmp_batch_affiliations;
END$$

DELIMITER ;


-- ============================================================================
-- --- Mudança 4 — Identifiers e bibliographic metadata em summary_publications ---
-- ============================================================================
--
-- Why (additional, not in the original three-item list — included because
-- it removes the most expensive remaining JOIN in the API)
-- ---
-- Every `/publications/{id}` and `/works/{id}` response currently JOINs
-- `publications` to fetch `volume`, `issue`, `pages`, `publication_date`,
-- `source`, `license_url`, `license_version`, plus the secondary identifier
-- set (`pmid`, `pmcid`, `arxiv`, `wos_id`, `handle`, `scielo_pid`, `isbn`,
-- `wikidata_id`, `openalex_id`, `mag_id`, `openlibrary_id`,
-- `google_book_id`). The DTO renders all of these on every detail page.
--
-- Adding them to `summary_publications` cuts one JOIN out of the hottest
-- path and lets the listing endpoints expose identifier filters without
-- hitting the base table.
--
-- The identifiers go into a single `identifiers_json` column (12 fields
-- bundled as JSON) so the schema does not need 12 new ALTERs. The four
-- bibliographic columns become first-class because they are read on every
-- detail page and the listing path also wants them for sort/filter.
--
-- Change
-- ------
--   ADD publication_date DATE NULL
--   ADD volume VARCHAR(50) NULL
--   ADD issue VARCHAR(50) NULL
--   ADD pages_text VARCHAR(255) NULL          (note: `pages` already exists in files_json)
--   ADD source VARCHAR(50) NULL
--   ADD license_url VARCHAR(512) NULL
--   ADD license_version VARCHAR(50) NULL
--   ADD identifiers_json LONGTEXT NULL        (JSON object)
--
-- Identifiers JSON shape:
--   {
--     "pmid": ..., "pmcid": ..., "arxiv": ..., "wos_id": ...,
--     "handle": ..., "scielo_pid": ..., "isbn": ...,
--     "wikidata_id": ..., "openalex_id": ..., "mag_id": ...,
--     "openlibrary_id": ..., "google_book_id": ...
--   }
--
-- Both `sp_build_summary_publications` AND
-- `sp_refresh_summary_publications_for_work` need to populate these in the
-- same place where `pub.doi` / `pub.year` are already projected. The patch
-- is mechanical: extend the column lists in each procedure with the eight
-- new fields. The bodies are not repeated here to keep this file scannable
-- — apply the same SELECT extension as Mudança 1, adding:
--
--   pub.publication_date, pub.volume, pub.issue, pub.pages,
--   pub.source, pub.license_url, pub.license_version,
--   JSON_OBJECT(
--     'pmid', pub.pmid, 'pmcid', pub.pmcid, 'arxiv', pub.arxiv,
--     'wos_id', pub.wos_id, 'handle', pub.handle, 'scielo_pid', pub.scielo_pid,
--     'isbn', pub.isbn, 'wikidata_id', pub.wikidata_id,
--     'openalex_id', pub.openalex_id, 'mag_id', pub.mag_id,
--     'openlibrary_id', pub.openlibrary_id, 'google_book_id', pub.google_book_id
--   )
--
-- to the projection.
--
-- Rollback:
--   ALTER TABLE summary_publications
--     DROP COLUMN publication_date, DROP COLUMN volume, DROP COLUMN issue,
--     DROP COLUMN pages_text, DROP COLUMN source,
--     DROP COLUMN license_url, DROP COLUMN license_version,
--     DROP COLUMN identifiers_json;
--   plus restore the previous bodies of both procedures.

ALTER TABLE summary_publications
    ADD COLUMN publication_date DATE DEFAULT NULL AFTER publication_year,
    ADD COLUMN volume VARCHAR(50) DEFAULT NULL AFTER publication_date,
    ADD COLUMN issue VARCHAR(50) DEFAULT NULL AFTER volume,
    ADD COLUMN pages_text VARCHAR(255) DEFAULT NULL AFTER issue,
    ADD COLUMN source VARCHAR(50) DEFAULT NULL AFTER pages_text,
    ADD COLUMN license_url VARCHAR(512) DEFAULT NULL AFTER source,
    ADD COLUMN license_version VARCHAR(50) DEFAULT NULL AFTER license_url,
    ADD COLUMN identifiers_json LONGTEXT DEFAULT NULL
        CHECK (json_valid(identifiers_json)) AFTER subjects_json;

-- The two procedure bodies for Mudança 4 are not duplicated here.
-- Apply the column-list extension described above to both
-- `sp_build_summary_publications` and `sp_refresh_summary_publications_for_work`,
-- in the same change set as Mudança 1 above.


-- ============================================================================
-- --- Mudança 5 — Filtros booleanos auxiliares em summary_publications ---
-- ============================================================================
--
-- Why (smallest of the five — included because the listing path can use it
-- immediately and it costs almost nothing in row width)
-- ---
-- Two listing-side capabilities the API would like but cannot offer today:
--
--   1. "publications with sci-hub fallback only"  → needs an aggregate flag
--      `has_scimag_file` so the SQL can use an indexed boolean filter
--      instead of `JSON_EXTRACT(files_json, '$[*].scimag_id')`.
--   2. "publications with libgen catalogue entry"  → idem `has_libgen_file`.
--
-- These are the same idea as the existing `has_files` flag and are cheap to
-- compute alongside it during the build / refresh.
--
-- Change
-- ------
-- Two TINYINT(1) columns + a composite index. The build proc fills them
-- from the same `tmp_batch_files` aggregate it already builds; the refresh
-- proc fills them from the same correlated subquery used for `has_files`.
--
--   ADD has_scimag_file TINYINT(1) DEFAULT 0
--   ADD has_libgen_file TINYINT(1) DEFAULT 0
--   ADD INDEX idx_summary_pubs_file_sources (has_files, has_scimag_file, has_libgen_file)
--
-- Procedure patches: extend `tmp_batch_files` with two MAX() aggregates and
-- the SELECT projection of both procs with two `CASE WHEN` expressions.
-- See Mudança 1 for the procedure bodies; the addition is mechanical.
--
-- Rollback:
--   ALTER TABLE summary_publications
--     DROP COLUMN has_scimag_file,
--     DROP COLUMN has_libgen_file,
--     DROP INDEX idx_summary_pubs_file_sources;

ALTER TABLE summary_publications
    ADD COLUMN has_scimag_file TINYINT(1) DEFAULT 0 AFTER has_files,
    ADD COLUMN has_libgen_file TINYINT(1) DEFAULT 0 AFTER has_scimag_file,
    ADD INDEX idx_summary_pubs_file_sources (has_files, has_scimag_file, has_libgen_file);

-- Procedure body extension (apply to BOTH sp_build_summary_publications
-- and sp_refresh_summary_publications_for_work alongside Mudança 1):
--
--   tmp_batch_files becomes:
--     CREATE TEMPORARY TABLE tmp_batch_files (
--         publication_id INT PRIMARY KEY,
--         files_json LONGTEXT,
--         publication_download_count INT,
--         has_scimag_file TINYINT(1),
--         has_libgen_file TINYINT(1)
--     ) ENGINE=InnoDB;
--
--   The INSERT into tmp_batch_files appends:
--     MAX(CASE WHEN f.scimag_id IS NOT NULL THEN 1 ELSE 0 END),
--     MAX(CASE WHEN f.libgen_id IS NOT NULL THEN 1 ELSE 0 END)
--
--   The INSERT into summary_publications appends the two new columns at
--   the same position, projecting tpf.has_scimag_file / tpf.has_libgen_file
--   (with COALESCE to 0 when the row has no files at all).


-- ============================================================================
-- Verification (read-only — operator can re-run to confirm the change set)
-- ============================================================================
--
-- After all five changes are applied and the orchestrator has run, the
-- following assertions should all hold:
--
--   -- Mudança 1: files_json now exposes source identifiers
--   SELECT COUNT(*) FROM summary_publications
--   WHERE files_json IS NOT NULL
--     AND JSON_EXTRACT(files_json, '$[0].scimag_id') IS NOT NULL;
--   -- Expected: > 3 000 000
--
--   -- Mudança 2: venue score breakdown populated
--   SELECT COUNT(*) FROM summary_venues
--   WHERE score_breakdown_json IS NOT NULL
--     AND JSON_EXTRACT(score_breakdown_json, '$.subject') IS NOT NULL;
--   -- Expected: ≈ all rows (≈ 26 437)
--
--   -- Mudança 3: signature text denormalized
--   SELECT COUNT(*) FROM summary_persons WHERE signature_text IS NOT NULL;
--   -- Expected: ≈ 4 466 008
--
--   -- Mudança 4: identifiers_json populated
--   SELECT COUNT(*) FROM summary_publications WHERE identifiers_json IS NOT NULL;
--   -- Expected: ≈ all rows (≈ 6 567 062)
--
--   -- Mudança 5: file-source flags populated
--   SELECT
--     SUM(has_files) AS with_files,
--     SUM(has_scimag_file) AS with_scimag,
--     SUM(has_libgen_file) AS with_libgen
--   FROM summary_publications;
--   -- Expected: with_files ≈ 4 500 053, with_scimag ≈ 3 419 557,
--   --           with_libgen ≈ 19 925 (matches base `files` counts)
--
-- After verification, regenerate the schema dump on the project side:
--
--   ./scripts/maintenance/publications/regenerate_schema_dump.sh data database/data.schema.sql
--
-- and bump CLAUDE.md to mention the new columns / JSON shapes alongside
-- the existing summary contracts. The Ethnos_API project will adopt the
-- new fields in a follow-up commit (DTO + Sphinx attr extension) once the
-- change set has landed in production.


-- ============================================================================
-- --- Request 1 (follow-up) — Complete Mudanças 4 + 5 in the build procs ---
-- ============================================================================
--
-- Status at filing: PENDING. Mudanças 4 and 5 in the first pass landed
-- only at the ALTER TABLE level. The build proc and the incremental refresh
-- proc were not updated, so the new columns
-- (publication_date, volume, issue, pages_text, source, license_url,
-- license_version, identifiers_json, has_scimag_file, has_libgen_file) are
-- present on the table but all NULL / 0.
--
-- This block supersedes the prose-only patch notes from Mudanças 4 and 5 by
-- rewriting the two procedures completely, folding in:
--
--   - every field already populated by the current bodies (Mudança 1
--     files_json shape stays as-is);
--   - the eight bibliographic / identifier fields from Mudança 4;
--   - the two file-source flags from Mudança 5.
--
-- After applying this block, run `CALL sp_build_summary_publications(50000)`
-- to rebuild summary_publications so the new columns populate on every row.
-- The incremental refresh path (`sp_refresh_summary_publications_for_work`)
-- is ALSO patched here so mutations after the rebuild remain consistent.
--
-- Rollback: re-create both procedures from
-- `git show cedf334:database/data.schema.sql` (the snapshot taken after
-- Mudanças 1 + 2 + 3 landed and before this follow-up).

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
        publication_download_count INT,
        has_scimag_file TINYINT(1),
        has_libgen_file TINYINT(1)
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

        INSERT INTO tmp_batch_files (
            publication_id, files_json, publication_download_count,
            has_scimag_file, has_libgen_file
        )
        SELECT
            f.publication_id,
            JSON_ARRAYAGG(JSON_OBJECT(
                'id',           f.id,
                'format',       f.file_format,
                'size',         f.file_size,
                'role',         f.file_role,
                'md5',          f.md5,
                'libgen_id',    f.libgen_id,
                'scimag_id',    f.scimag_id,
                'openacess_id', f.openacess_id,
                'best_oa_url',  f.best_oa_url,
                'pages',        f.pages,
                'language',     f.language,
                'version',      f.version,
                'verification', f.verification_status,
                'downloads',    f.download_count
            )),
            COALESCE(SUM(f.download_count), 0),
            MAX(CASE WHEN f.scimag_id IS NOT NULL THEN 1 ELSE 0 END),
            MAX(CASE WHEN f.libgen_id IS NOT NULL THEN 1 ELSE 0 END)
        FROM files f
        JOIN publications pub ON pub.id = f.publication_id
        WHERE pub.work_id >= v_current_id AND pub.work_id < v_current_id + p_batch_size
        GROUP BY f.publication_id;

        INSERT INTO summary_publications (
            publication_id, work_id, venue_id, publisher_id,
            title_search, abstract_search, authors_search, venue_search, subjects_search,
            doi, work_type, publication_year,
            publication_date, volume, issue, pages_text, source,
            license_url, license_version,
            language, open_access, peer_reviewed,
            has_files, has_scimag_file, has_libgen_file,
            work_citation_count, work_reference_count, publication_download_count,
            authors_json, subjects_json, files_json, identifiers_json
        )
        SELECT
            pub.id, w.id, pub.venue_id, pub.publisher_id,
            w.title, w.abstract, tpa.authors_search, v.name, tps.subjects_search,
            pub.doi, w.work_type, pub.year,
            pub.publication_date, pub.volume, pub.issue, pub.pages, pub.source,
            pub.license_url, pub.license_version,
            w.language, pub.open_access, pub.peer_reviewed,
            CASE WHEN tpf.publication_id IS NULL THEN 0 ELSE 1 END,
            COALESCE(tpf.has_scimag_file, 0),
            COALESCE(tpf.has_libgen_file, 0),
            w.citation_count, w.reference_count,
            COALESCE(tpf.publication_download_count, 0),
            tpa.authors_json, tps.subjects_json, tpf.files_json,
            JSON_OBJECT(
                'pmid',           pub.pmid,
                'pmcid',          pub.pmcid,
                'arxiv',          pub.arxiv,
                'wos_id',         pub.wos_id,
                'handle',         pub.handle,
                'scielo_pid',     pub.scielo_pid,
                'isbn',           pub.isbn,
                'wikidata_id',    pub.wikidata_id,
                'openalex_id',    pub.openalex_id,
                'mag_id',         pub.mag_id,
                'openlibrary_id', pub.openlibrary_id,
                'google_book_id', pub.google_book_id
            )
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
        doi, work_type, publication_year,
        publication_date, volume, issue, pages_text, source,
        license_url, license_version,
        language, open_access, peer_reviewed,
        has_files, has_scimag_file, has_libgen_file,
        work_citation_count, work_reference_count, publication_download_count,
        authors_json, subjects_json, files_json, identifiers_json
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
        pub.publication_date,
        pub.volume,
        pub.issue,
        pub.pages,
        pub.source,
        pub.license_url,
        pub.license_version,
        w.language,
        pub.open_access,
        pub.peer_reviewed,
        (SELECT COUNT(*) > 0 FROM files WHERE publication_id = pub.id),
        (SELECT COALESCE(MAX(CASE WHEN scimag_id IS NOT NULL THEN 1 ELSE 0 END), 0)
           FROM files WHERE publication_id = pub.id),
        (SELECT COALESCE(MAX(CASE WHEN libgen_id IS NOT NULL THEN 1 ELSE 0 END), 0)
           FROM files WHERE publication_id = pub.id),
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
                  'id',           f.id,
                  'format',       f.file_format,
                  'size',         f.file_size,
                  'role',         f.file_role,
                  'md5',          f.md5,
                  'libgen_id',    f.libgen_id,
                  'scimag_id',    f.scimag_id,
                  'openacess_id', f.openacess_id,
                  'best_oa_url',  f.best_oa_url,
                  'pages',        f.pages,
                  'language',     f.language,
                  'version',      f.version,
                  'verification', f.verification_status,
                  'downloads',    f.download_count
                ))
           FROM files f
           WHERE f.publication_id = pub.id),
        JSON_OBJECT(
            'pmid',           pub.pmid,
            'pmcid',          pub.pmcid,
            'arxiv',          pub.arxiv,
            'wos_id',         pub.wos_id,
            'handle',         pub.handle,
            'scielo_pid',     pub.scielo_pid,
            'isbn',           pub.isbn,
            'wikidata_id',    pub.wikidata_id,
            'openalex_id',    pub.openalex_id,
            'mag_id',         pub.mag_id,
            'openlibrary_id', pub.openlibrary_id,
            'google_book_id', pub.google_book_id
        )
    FROM works w
    JOIN publications pub ON pub.work_id = w.id
    LEFT JOIN venues v ON v.id = pub.venue_id
    WHERE w.id = p_work_id;

    COMMIT;
END$$

DELIMITER ;


-- Verification after the follow-up rebuild:
--
--   SELECT
--     SUM(has_scimag_file) AS ws,
--     SUM(has_libgen_file) AS wl,
--     SUM(CASE WHEN identifiers_json IS NOT NULL THEN 1 ELSE 0 END) AS wi,
--     SUM(CASE WHEN volume IS NOT NULL THEN 1 ELSE 0 END) AS wv
--   FROM summary_publications;
--   -- Expected: ws ≈ 3.4 M, wl ≈ 20 k, wi ≈ 6.57 M, wv > 0
