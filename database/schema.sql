/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-11.8.3-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: data_dev
-- ------------------------------------------------------
-- Server version	11.8.3-MariaDB-1build1 from Ubuntu-log

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Table structure for table `authorships`
--

DROP TABLE IF EXISTS `authorships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authorships` (
  `work_id` int(11) NOT NULL,
  `person_id` int(11) NOT NULL,
  `affiliation_id` int(11) DEFAULT NULL,
  `role` enum('AUTHOR','EDITOR','TRANSLATOR','REVIEWER') NOT NULL DEFAULT 'AUTHOR',
  `position` int(11) NOT NULL,
  `is_corresponding` tinyint(1) DEFAULT 0,
  `raw_affiliation_string` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`work_id`,`person_id`,`role`),
  KEY `idx_authorships_affiliation_id` (`affiliation_id`),
  KEY `idx_position` (`position`),
  KEY `idx_authorships_person_role` (`person_id`,`role`),
  KEY `idx_authorships_work_position` (`work_id`,`position`),
  KEY `idx_authorships_affiliation_person` (`affiliation_id`,`person_id`),
  KEY `idx_authorships_work_role_position` (`work_id`,`role`,`position`),
  KEY `idx_role` (`role`),
  KEY `idx_authorships_created_at` (`created_at`),
  KEY `idx_authorships_work_person` (`work_id`,`person_id`),
  CONSTRAINT `authorships_ibfk_1` FOREIGN KEY (`work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE,
  CONSTRAINT `authorships_ibfk_2` FOREIGN KEY (`person_id`) REFERENCES `persons` (`id`) ON DELETE CASCADE,
  CONSTRAINT `authorships_ibfk_3` FOREIGN KEY (`affiliation_id`) REFERENCES `organizations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cache_rule_subject_map`
--

DROP TABLE IF EXISTS `cache_rule_subject_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `cache_rule_subject_map` (
  `rule_id` int(11) NOT NULL,
  `subject_id` int(11) NOT NULL,
  PRIMARY KEY (`rule_id`,`subject_id`),
  KEY `idx_subject` (`subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `citations`
--

DROP TABLE IF EXISTS `citations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `citations` (
  `citing_work_id` int(11) NOT NULL,
  `cited_work_id` int(11) NOT NULL,
  `citation_context` text DEFAULT NULL,
  `citation_type` enum('POSITIVE','NEUTRAL','NEGATIVE','SELF') DEFAULT 'NEUTRAL',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`citing_work_id`,`cited_work_id`),
  KEY `idx_type` (`citation_type`),
  KEY `idx_citations_citing_type` (`citing_work_id`,`citation_type`),
  KEY `idx_citations_cited_type` (`cited_work_id`,`citation_type`),
  KEY `idx_citations_created_at` (`created_at`),
  KEY `idx_citations_cited_work` (`cited_work_id`),
  KEY `idx_citations_citing_work` (`citing_work_id`),
  CONSTRAINT `citations_ibfk_1` FOREIGN KEY (`citing_work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE,
  CONSTRAINT `citations_ibfk_2` FOREIGN KEY (`cited_work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_bibliography`
--

DROP TABLE IF EXISTS `course_bibliography`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_bibliography` (
  `course_id` int(11) NOT NULL,
  `work_id` int(11) NOT NULL,
  `reading_type` enum('REQUIRED','RECOMMENDED','SUPPLEMENTARY') DEFAULT 'RECOMMENDED',
  `week_number` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  PRIMARY KEY (`course_id`,`work_id`),
  KEY `idx_work` (`work_id`),
  KEY `idx_type` (`reading_type`),
  KEY `idx_week` (`week_number`),
  KEY `idx_course_bibliography_week` (`week_number`,`reading_type`),
  CONSTRAINT `course_bibliography_ibfk_1` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `course_bibliography_ibfk_2` FOREIGN KEY (`work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_instructors`
--

DROP TABLE IF EXISTS `course_instructors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_instructors` (
  `course_id` int(11) NOT NULL,
  `person_id` int(11) NOT NULL,
  `canonical_person_id` int(11) NOT NULL,
  `role` enum('PROFESSOR','ASSISTANT','TA','GUEST') DEFAULT 'PROFESSOR',
  PRIMARY KEY (`course_id`,`person_id`),
  KEY `idx_person` (`person_id`),
  KEY `idx_role` (`role`),
  KEY `idx_canonical` (`canonical_person_id`),
  CONSTRAINT `course_instructors_ibfk_1` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `course_instructors_ibfk_2` FOREIGN KEY (`person_id`) REFERENCES `persons` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_course_instructors_canonical` FOREIGN KEY (`canonical_person_id`) REFERENCES `persons` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `courses`
--

DROP TABLE IF EXISTS `courses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `courses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `program_id` int(11) NOT NULL,
  `code` varchar(20) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `credits` int(11) DEFAULT NULL,
  `semester` enum('1','2','SUMMER','WINTER','YEAR_LONG') DEFAULT NULL,
  `year` year(4) DEFAULT NULL,
  `source_file` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_program_code_year_sem` (`program_id`,`code`,`year`,`semester`),
  KEY `idx_program` (`program_id`),
  KEY `idx_year_semester` (`year`,`semester`),
  CONSTRAINT `courses_ibfk_1` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `files`
--

DROP TABLE IF EXISTS `files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `files` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `md5` char(32) NOT NULL,
  `sha1` char(40) DEFAULT NULL,
  `sha256` char(64) DEFAULT NULL,
  `crc32` char(8) DEFAULT NULL,
  `edonkey` char(32) DEFAULT NULL,
  `aich` char(32) DEFAULT NULL,
  `tth` char(39) DEFAULT NULL,
  `btih` char(40) DEFAULT NULL,
  `ipfs_cid` char(62) DEFAULT NULL,
  `file_size` bigint(20) unsigned DEFAULT NULL,
  `file_format` enum('PDF','EPUB','MOBI','HTML','XML','DOCX','TXT','OTHER') NOT NULL,
  `pages` int(11) DEFAULT NULL,
  `language` char(3) DEFAULT NULL,
  `version` varchar(50) DEFAULT NULL,
  `libgen_id` int(15) unsigned DEFAULT NULL,
  `scimag_id` int(15) unsigned DEFAULT NULL,
  `openacess_id` varchar(255) DEFAULT NULL,
  `best_oa_url` varchar(1024) DEFAULT NULL,
  `download_urls` longtext DEFAULT NULL CHECK (json_valid(`download_urls`)),
  `torrent_info` longtext DEFAULT NULL CHECK (json_valid(`torrent_info`)),
  `download_count` int(11) DEFAULT 0,
  `verification_status` enum('PENDING','VERIFIED','FAILED','CORRUPTED') DEFAULT 'PENDING',
  `last_verified` timestamp NULL DEFAULT NULL,
  `upload_date` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_md5` (`md5`),
  UNIQUE KEY `uq_sha256` (`sha256`),
  UNIQUE KEY `uq_libgen_id` (`libgen_id`),
  UNIQUE KEY `uq_scimag_id` (`scimag_id`),
  KEY `idx_format` (`file_format`),
  KEY `idx_size` (`file_size`),
  KEY `idx_upload_date` (`upload_date`),
  KEY `idx_verification` (`verification_status`,`last_verified`),
  KEY `idx_external_ids` (`libgen_id`,`scimag_id`),
  KEY `idx_sha1` (`sha1`),
  KEY `idx_crc32` (`crc32`),
  KEY `idx_btih` (`btih`),
  KEY `idx_ipfs_cid` (`ipfs_cid`),
  KEY `idx_files_id_openalex` (`openacess_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6546626 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `funding`
--

DROP TABLE IF EXISTS `funding`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `funding` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `work_id` int(11) NOT NULL,
  `funder_id` int(11) NOT NULL,
  `grant_number` varchar(100) DEFAULT NULL,
  `program_name` varchar(255) DEFAULT NULL,
  `amount` decimal(15,2) DEFAULT NULL,
  `currency` char(3) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_work_funder_grant` (`work_id`,`funder_id`,`grant_number`),
  KEY `idx_work` (`work_id`),
  KEY `idx_funder` (`funder_id`),
  KEY `idx_funding_work_funder` (`work_id`,`funder_id`),
  CONSTRAINT `funding_ibfk_1` FOREIGN KEY (`work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE,
  CONSTRAINT `funding_ibfk_2` FOREIGN KEY (`funder_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=428503 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `organizations`
--

DROP TABLE IF EXISTS `organizations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `organizations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(512) NOT NULL,
  `type` enum('UNIVERSITY','INSTITUTE','PUBLISHER','FUNDER','COMPANY','OTHER') NOT NULL,
  `country_code` char(2) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `url` varchar(512) DEFAULT NULL,
  `ror_id` varchar(20) DEFAULT NULL,
  `wikidata_id` varchar(20) DEFAULT NULL,
  `openalex_id` varchar(50) DEFAULT NULL,
  `mag_id` varchar(50) DEFAULT NULL,
  `cluster_key` varchar(100) DEFAULT NULL,
  `semantic_key` varchar(512) DEFAULT NULL,
  `publication_count` int(11) NOT NULL DEFAULT 0,
  `researcher_count` int(11) NOT NULL DEFAULT 0,
  `total_citations` int(11) NOT NULL DEFAULT 0,
  `open_access_works_count` int(11) NOT NULL DEFAULT 0,
  `standardized_name` varchar(512) GENERATED ALWAYS AS (trim(lcase(`name`))) STORED,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_name_type` (`name`(255),`type`),
  UNIQUE KEY `uq_organizations_ror_id` (`ror_id`),
  UNIQUE KEY `uq_org_wikidata` (`wikidata_id`),
  UNIQUE KEY `uq_org_openalex` (`openalex_id`),
  KEY `idx_type` (`type`),
  KEY `idx_country` (`country_code`),
  KEY `idx_ror` (`ror_id`),
  KEY `idx_organizations_type_country` (`type`,`country_code`),
  KEY `idx_organizations_name_country` (`name`(100),`country_code`),
  KEY `idx_organizations_publication_count` (`publication_count`),
  KEY `idx_organizations_researcher_count` (`researcher_count`),
  KEY `idx_semantic_key` (`semantic_key`),
  FULLTEXT KEY `ft_organizations_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=1412016 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `person_match_log`
--

DROP TABLE IF EXISTS `person_match_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `person_match_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `input_name` varchar(500) DEFAULT NULL,
  `matched_person_id` int(11) DEFAULT NULL,
  `match_type` enum('EXACT','ORCID','VARIATION','SIGNATURE','SIMILAR','NONE') DEFAULT NULL,
  `match_score` float DEFAULT NULL,
  `source` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_input` (`input_name`(255)),
  KEY `idx_matched` (`matched_person_id`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `person_match_log_ibfk_1` FOREIGN KEY (`matched_person_id`) REFERENCES `persons` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `persons`
--

DROP TABLE IF EXISTS `persons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `persons` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `preferred_name` varchar(255) NOT NULL,
  `given_names` varchar(255) DEFAULT NULL,
  `family_name` varchar(255) DEFAULT NULL,
  `orcid` varchar(20) DEFAULT NULL,
  `scopus_id` varchar(50) DEFAULT NULL,
  `lattes_id` varchar(20) DEFAULT NULL,
  `normalized_name` varchar(512) NOT NULL,
  `total_works` int(11) NOT NULL DEFAULT 0,
  `total_citations` int(11) NOT NULL DEFAULT 0,
  `first_publication_year` smallint(6) DEFAULT NULL,
  `latest_publication_year` smallint(6) DEFAULT NULL,
  `corresponding_author_count` int(11) NOT NULL DEFAULT 0,
  `h_index` int(11) DEFAULT NULL,
  `is_verified` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_preferred_name` (`preferred_name`),
  UNIQUE KEY `uq_persons_orcid` (`orcid`),
  UNIQUE KEY `uq_persons_scopus_id` (`scopus_id`),
  UNIQUE KEY `uq_persons_lattes` (`lattes_id`),
  KEY `idx_persons_created_at` (`created_at`),
  KEY `idx_family_name` (`family_name`),
  KEY `idx_persons_updated_at` (`updated_at`),
  KEY `idx_persons_verified` (`is_verified`),
  KEY `idx_persons_family_given` (`family_name`,`given_names`),
  KEY `idx_persons_preferred_name` (`preferred_name`),
  KEY `idx_persons_normalized_name` (`normalized_name`),
  KEY `idx_persons_total_works` (`total_works`),
  KEY `idx_persons_total_citations` (`total_citations`),
  KEY `idx_persons_latest_publication_year` (`latest_publication_year`),
  FULLTEXT KEY `ft_persons_names` (`preferred_name`,`given_names`,`family_name`)
) ENGINE=InnoDB AUTO_INCREMENT=4527937 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`pc`@`%`*/ /*!50003 TRIGGER `trg_persons_insert_normalized_name`
BEFORE INSERT ON `persons`
FOR EACH ROW
BEGIN
    SET NEW.normalized_name = clean_person_name(NEW.preferred_name);
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`pc`@`%`*/ /*!50003 TRIGGER `trg_persons_update_normalized_name`
BEFORE UPDATE ON `persons`
FOR EACH ROW
BEGIN
    IF NEW.preferred_name <> OLD.preferred_name 
       OR (NEW.preferred_name IS NULL AND OLD.preferred_name IS NOT NULL)
       OR (NEW.preferred_name IS NOT NULL AND OLD.preferred_name IS NULL) THEN
        SET NEW.normalized_name = clean_person_name(NEW.preferred_name);
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `persons_signatures`
--

DROP TABLE IF EXISTS `persons_signatures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `persons_signatures` (
  `person_id` int(11) NOT NULL,
  `signature_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`person_id`),
  KEY `idx_signature_id` (`signature_id`),
  KEY `idx_person_signature_composite` (`person_id`,`signature_id`),
  KEY `idx_person_signature_link_count` (`signature_id`),
  KEY `idx_persons_signatures_person_id` (`person_id`),
  KEY `idx_persons_signatures_signature_id` (`signature_id`),
  CONSTRAINT `fk_person_link` FOREIGN KEY (`person_id`) REFERENCES `persons` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_signature_link` FOREIGN KEY (`signature_id`) REFERENCES `signatures` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `processing_log`
--

DROP TABLE IF EXISTS `processing_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `processing_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` int(11) DEFAULT 0,
  `action` varchar(100) NOT NULL,
  `status` varchar(20) NOT NULL,
  `error_message` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_entity` (`entity_type`,`entity_id`),
  KEY `idx_action` (`action`),
  KEY `idx_status` (`status`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `programs`
--

DROP TABLE IF EXISTS `programs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `programs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `institution_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `code` varchar(20) DEFAULT NULL,
  `degree_level` enum('UNDERGRADUATE','MASTERS','DOCTORATE','POSTDOC','CERTIFICATE') NOT NULL,
  `department` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_institution_code` (`institution_id`,`code`),
  KEY `idx_institution` (`institution_id`),
  KEY `idx_level` (`degree_level`),
  CONSTRAINT `programs_ibfk_1` FOREIGN KEY (`institution_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `publication_files`
--

DROP TABLE IF EXISTS `publication_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `publication_files` (
  `publication_id` int(11) NOT NULL,
  `file_id` int(11) NOT NULL,
  `file_role` enum('MAIN','SUPPLEMENT','COVER','PREVIEW') DEFAULT 'MAIN',
  `quality` enum('LOW','MEDIUM','HIGH','ORIGINAL') DEFAULT NULL,
  `access_count` int(11) DEFAULT 0,
  `last_accessed` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`publication_id`,`file_id`),
  KEY `idx_file_id` (`file_id`),
  KEY `idx_role_quality` (`file_role`,`quality`),
  KEY `idx_access_stats` (`last_accessed`,`access_count`),
  KEY `idx_publication_files_publication_id` (`publication_id`),
  CONSTRAINT `fk_publication_files_file` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_publication_files_publication` FOREIGN KEY (`publication_id`) REFERENCES `publications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`pc`@`localhost`*/ /*!50003 TRIGGER trg_pub_files_insert_set_oa
AFTER INSERT ON publication_files
FOR EACH ROW
BEGIN
    DECLARE v_has_valid_file INT DEFAULT 0;
    
    
    SELECT COUNT(*) INTO v_has_valid_file
    FROM publication_files pf
    JOIN files f ON pf.file_id = f.id
    WHERE pf.publication_id = NEW.publication_id
      AND f.verification_status = 'VERIFIED'
      AND pf.file_role = 'MAIN';
    
    
    IF v_has_valid_file > 0 THEN
        UPDATE publications
        SET open_access = 1,
            updated_at = NOW()
        WHERE id = NEW.publication_id
          AND open_access = 0; 
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `publications`
--

DROP TABLE IF EXISTS `publications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `publications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `work_id` int(11) NOT NULL,
  `venue_id` int(11) DEFAULT NULL,
  `publisher_id` int(11) DEFAULT NULL,
  `publication_date` date DEFAULT NULL,
  `volume` varchar(50) DEFAULT NULL,
  `issue` varchar(50) DEFAULT NULL,
  `pages` varchar(255) DEFAULT NULL,
  `doi` varchar(255) DEFAULT NULL,
  `isbn` varchar(20) DEFAULT NULL,
  `arxiv` varchar(30) DEFAULT NULL,
  `wos_id` varchar(30) DEFAULT NULL,
  `pmid` varchar(20) DEFAULT NULL,
  `pmcid` varchar(20) DEFAULT NULL,
  `handle` varchar(255) DEFAULT NULL,
  `asin` varchar(200) DEFAULT NULL,
  `udc` varchar(200) DEFAULT NULL,
  `lbc` varchar(200) DEFAULT '',
  `ddc` varchar(45) DEFAULT '',
  `lcc` varchar(45) DEFAULT '',
  `wikidata_id` varchar(20) DEFAULT NULL,
  `openalex_id` varchar(50) DEFAULT NULL,
  `mag_id` varchar(50) DEFAULT NULL,
  `openlibrary_id` varchar(50) DEFAULT NULL,
  `google_book_id` varchar(45) DEFAULT NULL,
  `open_access` tinyint(1) DEFAULT 0,
  `peer_reviewed` tinyint(1) DEFAULT 1,
  `source` varchar(50) DEFAULT NULL,
  `source_prefix` varchar(50) DEFAULT NULL,
  `source_member_id` varchar(50) DEFAULT NULL,
  `source_content_domain` longtext DEFAULT NULL CHECK (json_valid(`source_content_domain`)),
  `source_indexed_at` timestamp NULL DEFAULT NULL,
  `source_deposited_at` timestamp NULL DEFAULT NULL,
  `license_url` varchar(512) DEFAULT NULL,
  `license_version` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `year` smallint(6) GENERATED ALWAYS AS (year(`publication_date`)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doi` (`doi`),
  UNIQUE KEY `uq_publications_pmid` (`pmid`),
  UNIQUE KEY `uq_publications_pmcid` (`pmcid`),
  UNIQUE KEY `uq_publications_arxiv` (`arxiv`),
  UNIQUE KEY `uq_publications_openalex_id` (`openalex_id`),
  UNIQUE KEY `uq_publications_openlibrary_id` (`openlibrary_id`),
  UNIQUE KEY `uq_publications_asin` (`asin`),
  UNIQUE KEY `uq_publications_google_book_id` (`google_book_id`),
  UNIQUE KEY `uq_pub_wos` (`wos_id`),
  UNIQUE KEY `uq_pub_handle` (`handle`),
  KEY `publisher_id` (`publisher_id`),
  KEY `idx_open_access` (`open_access`),
  KEY `idx_publications_work_year` (`work_id`,`year`),
  KEY `idx_publications_created_at` (`created_at`),
  KEY `idx_publications_venue_year_oa` (`venue_id`,`year`,`open_access`),
  KEY `idx_publications_year` (`year`),
  KEY `idx_publications_isbn` (`isbn`),
  KEY `idx_publications_work_year_id` (`work_id`,`year` DESC,`id` DESC),
  KEY `idx_publications_venue_year` (`venue_id`,`year`),
  KEY `idx_publications_mag_id` (`mag_id`),
  KEY `idx_publications_wos_id` (`wos_id`),
  KEY `idx_publications_wikidata_id` (`wikidata_id`),
  KEY `idx_publications_open_access_year` (`open_access`,`year` DESC),
  KEY `idx_publications_publisher_year` (`publisher_id`,`year` DESC),
  KEY `idx_publications_classification` (`udc`,`lbc`,`ddc`,`lcc`),
  CONSTRAINT `publications_ibfk_1` FOREIGN KEY (`work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE,
  CONSTRAINT `publications_ibfk_2` FOREIGN KEY (`venue_id`) REFERENCES `venues` (`id`) ON DELETE SET NULL,
  CONSTRAINT `publications_ibfk_3` FOREIGN KEY (`publisher_id`) REFERENCES `organizations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1111754651 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`brVn0`@`%`*/ /*!50003 TRIGGER `trg_publications_insert_oa_from_venue`
BEFORE INSERT ON `publications`
FOR EACH ROW
BEGIN
    DECLARE v_venue_is_oa TINYINT(1);
    
    
    IF NEW.open_access = 0 AND NEW.venue_id IS NOT NULL THEN
        SELECT open_access INTO v_venue_is_oa 
        FROM venues 
        WHERE id = NEW.venue_id;
        
        IF v_venue_is_oa = 1 THEN
            SET NEW.open_access = 1;
        END IF;
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`brVn0`@`%`*/ /*!50003 TRIGGER `trg_publications_update_oa_from_venue`
BEFORE UPDATE ON `publications`
FOR EACH ROW
BEGIN
    DECLARE v_venue_is_oa TINYINT(1);
    
    
    IF (NEW.open_access = 0 OR NEW.venue_id != OLD.venue_id) AND NEW.venue_id IS NOT NULL THEN
        SELECT open_access INTO v_venue_is_oa 
        FROM venues 
        WHERE id = NEW.venue_id;
        
        IF v_venue_is_oa = 1 THEN
            SET NEW.open_access = 1;
        END IF;
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `signatures`
--

DROP TABLE IF EXISTS `signatures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `signatures` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `signature` varchar(100) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_signature` (`signature`),
  KEY `idx_signature_search` (`signature`(20)),
  KEY `idx_signatures_signature` (`signature`)
) ENGINE=InnoDB AUTO_INCREMENT=14485869 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sphinx_persons_summary`
--

DROP TABLE IF EXISTS `sphinx_persons_summary`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sphinx_persons_summary` (
  `id` int(11) NOT NULL,
  `preferred_name` varchar(255) NOT NULL,
  `search_content` mediumtext NOT NULL,
  `is_verified` tinyint(1) DEFAULT 0,
  `total_works` int(11) DEFAULT 0,
  `latest_publication_year` smallint(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  FULLTEXT KEY `ft_search_content` (`search_content`),
  CONSTRAINT `fk_sphinx_persons_id` FOREIGN KEY (`id`) REFERENCES `persons` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sphinx_queue`
--

DROP TABLE IF EXISTS `sphinx_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sphinx_queue` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `work_id` int(11) NOT NULL,
  `operation` enum('INSERT','UPDATE','DELETE') NOT NULL,
  `title` text DEFAULT NULL,
  `subtitle` text DEFAULT NULL,
  `abstract` text DEFAULT NULL,
  `author_string` text DEFAULT NULL,
  `venue_name` varchar(500) DEFAULT NULL,
  `doi` varchar(200) DEFAULT NULL,
  `year` int(11) DEFAULT NULL,
  `work_type` varchar(50) DEFAULT NULL,
  `language` varchar(10) DEFAULT NULL,
  `open_access` tinyint(1) DEFAULT NULL,
  `peer_reviewed` tinyint(1) DEFAULT NULL,
  `status` enum('pending','processing','completed','failed') DEFAULT 'pending',
  `retry_count` int(11) DEFAULT 0,
  `error_message` text DEFAULT NULL,
  `queued_at` timestamp NULL DEFAULT current_timestamp(),
  `processed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_work_id` (`work_id`),
  KEY `idx_status_queued` (`status`,`queued_at`),
  KEY `idx_work_id` (`work_id`),
  KEY `idx_operation` (`operation`)
) ENGINE=InnoDB AUTO_INCREMENT=146 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sphinx_venues_summary`
--

DROP TABLE IF EXISTS `sphinx_venues_summary`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sphinx_venues_summary` (
  `id` int(11) NOT NULL,
  `name` varchar(512) NOT NULL,
  `type` varchar(50) DEFAULT NULL,
  `publisher_name` varchar(512) DEFAULT NULL,
  `country_code` varchar(16) DEFAULT NULL,
  `issn` varchar(9) DEFAULT NULL,
  `eissn` varchar(9) DEFAULT NULL,
  `subjects_string` mediumtext DEFAULT NULL,
  `top_works_string` mediumtext DEFAULT NULL,
  `works_count` int(11) DEFAULT 0,
  `cited_by_count` int(11) DEFAULT 0,
  `impact_factor` decimal(6,3) DEFAULT NULL,
  `h_index` int(11) DEFAULT NULL,
  `open_access_percentage` decimal(5,2) DEFAULT 0.00,
  `last_updated` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_updated` (`last_updated`),
  FULLTEXT KEY `ft_venue_content` (`name`,`subjects_string`,`top_works_string`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sphinx_works_summary`
--

DROP TABLE IF EXISTS `sphinx_works_summary`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sphinx_works_summary` (
  `id` int(11) NOT NULL,
  `title` text NOT NULL,
  `subtitle` text DEFAULT NULL,
  `abstract` text DEFAULT NULL,
  `author_string` mediumtext DEFAULT NULL,
  `venue_name` varchar(512) DEFAULT NULL,
  `doi` varchar(255) DEFAULT NULL,
  `created_ts` int(11) NOT NULL,
  `year` smallint(6) DEFAULT 0,
  `work_type` enum('ARTICLE','BOOK','CHAPTER','THESIS','CONFERENCE','CONFERENCE_PAPER','REPORT','DATASET','PREPRINT','REVIEW','EDITORIAL','OTHER') NOT NULL,
  `language` char(3) DEFAULT NULL,
  `open_access` tinyint(1) DEFAULT 0,
  `peer_reviewed` tinyint(1) DEFAULT 0,
  `subjects_string` mediumtext DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_year` (`year`),
  KEY `idx_author_string_not_null` (`author_string`(1)),
  FULLTEXT KEY `ft_main_content` (`title`,`subtitle`,`abstract`),
  FULLTEXT KEY `ft_metadata` (`author_string`,`venue_name`),
  CONSTRAINT `fk_sphinx_works_id` FOREIGN KEY (`id`) REFERENCES `works` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `subject_stoplist`
--

DROP TABLE IF EXISTS `subject_stoplist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `subject_stoplist` (
  `token` varchar(255) NOT NULL,
  PRIMARY KEY (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `subjects`
--

DROP TABLE IF EXISTS `subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `subjects` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `term` varchar(255) NOT NULL,
  `vocabulary` varchar(50) DEFAULT 'KEYWORD',
  `subject_type` varchar(50) DEFAULT NULL,
  `lang` char(3) DEFAULT NULL,
  `term_pt` varchar(255) DEFAULT NULL,
  `term_es` varchar(255) DEFAULT NULL,
  `external_uri` varchar(512) DEFAULT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `term_key` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `normalized_term` varchar(255) GENERATED ALWAYS AS (trim(lcase(`term`))) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_term_vocab_type` (`term`,`vocabulary`,`subject_type`),
  UNIQUE KEY `uq_vocab_type_term_key` (`vocabulary`,`subject_type`,`term_key`),
  UNIQUE KEY `external_uri` (`external_uri`),
  UNIQUE KEY `uq_vocab_term_key` (`vocabulary`,`term_key`),
  KEY `parent_id` (`parent_id`),
  KEY `idx_term` (`term`),
  KEY `idx_vocabulary` (`vocabulary`),
  KEY `idx_subjects_term_key` (`term_key`),
  KEY `idx_external_uri` (`external_uri`(100)),
  KEY `idx_subject_type` (`subject_type`),
  KEY `idx_subjects_vocabulary_term` (`vocabulary`,`normalized_term`),
  FULLTEXT KEY `ft_subjects_term` (`term`),
  CONSTRAINT `subjects_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `subjects` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1340513 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `temp_organization_merge_pairs`
--

DROP TABLE IF EXISTS `temp_organization_merge_pairs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `temp_organization_merge_pairs` (
  `primary_org_id` int(11) NOT NULL,
  `secondary_org_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `temp_parsed_names`
--

DROP TABLE IF EXISTS `temp_parsed_names`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `temp_parsed_names` (
  `id` int(11) DEFAULT NULL,
  `new_given_names` varchar(255) DEFAULT NULL,
  `new_family_name` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `temp_person_merge_pairs`
--

DROP TABLE IF EXISTS `temp_person_merge_pairs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `temp_person_merge_pairs` (
  `primary_person_id` int(11) NOT NULL,
  `secondary_person_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`secondary_person_id`),
  KEY `idx_primary` (`primary_person_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `unresolved_citations`
--

DROP TABLE IF EXISTS `unresolved_citations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `unresolved_citations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `citing_work_id` int(11) NOT NULL,
  `cited_doi` varchar(255) NOT NULL,
  `status` enum('PENDING','RESOLVED','FAILED') NOT NULL DEFAULT 'PENDING',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `resolved_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_citing_work_cited_doi` (`citing_work_id`,`cited_doi`),
  KEY `idx_status_doi` (`status`,`cited_doi`),
  CONSTRAINT `fk_unresolved_citing_work` FOREIGN KEY (`citing_work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=45940981 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary table structure for view `v_annual_stats`
--

DROP TABLE IF EXISTS `v_annual_stats`;
/*!50001 DROP VIEW IF EXISTS `v_annual_stats`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `v_annual_stats` AS SELECT
 1 AS `year`,
  1 AS `total_publications`,
  1 AS `unique_works`,
  1 AS `open_access_count`,
  1 AS `open_access_percentage`,
  1 AS `articles`,
  1 AS `books`,
  1 AS `avg_citations`,
  1 AS `total_downloads`,
  1 AS `unique_organizations` */;
SET character_set_client = @saved_cs_client;

--
-- Temporary table structure for view `v_collaborations`
--

DROP TABLE IF EXISTS `v_collaborations`;
/*!50001 DROP VIEW IF EXISTS `v_collaborations`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `v_collaborations` AS SELECT
 1 AS `person1_id`,
  1 AS `person1_name`,
  1 AS `person2_id`,
  1 AS `person2_name`,
  1 AS `collaboration_count`,
  1 AS `first_collaboration_year`,
  1 AS `latest_collaboration_year`,
  1 AS `avg_citations_together` */;
SET character_set_client = @saved_cs_client;

--
-- Temporary table structure for view `v_doi_venue_map`
--

DROP TABLE IF EXISTS `v_doi_venue_map`;
/*!50001 DROP VIEW IF EXISTS `v_doi_venue_map`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `v_doi_venue_map` AS SELECT
 1 AS `doi`,
  1 AS `identifier`,
  1 AS `venue_id` */;
SET character_set_client = @saved_cs_client;

--
-- Temporary table structure for view `v_institution_productivity`
--

DROP TABLE IF EXISTS `v_institution_productivity`;
/*!50001 DROP VIEW IF EXISTS `v_institution_productivity`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `v_institution_productivity` AS SELECT
 1 AS `id`,
  1 AS `institution_name`,
  1 AS `type`,
  1 AS `country_code`,
  1 AS `total_works`,
  1 AS `unique_researchers`,
  1 AS `open_access_works`,
  1 AS `total_citations`,
  1 AS `first_publication_year`,
  1 AS `latest_publication_year` */;
SET character_set_client = @saved_cs_client;

--
-- Temporary table structure for view `v_institution_productivity_optimized`
--

DROP TABLE IF EXISTS `v_institution_productivity_optimized`;
/*!50001 DROP VIEW IF EXISTS `v_institution_productivity_optimized`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `v_institution_productivity_optimized` AS SELECT
 1 AS `id`,
  1 AS `institution_name`,
  1 AS `type`,
  1 AS `country_code`,
  1 AS `total_works`,
  1 AS `unique_researchers`,
  1 AS `open_access_works`,
  1 AS `total_citations`,
  1 AS `first_publication_year`,
  1 AS `latest_publication_year` */;
SET character_set_client = @saved_cs_client;

--
-- Temporary table structure for view `v_person_production`
--

DROP TABLE IF EXISTS `v_person_production`;
/*!50001 DROP VIEW IF EXISTS `v_person_production`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `v_person_production` AS SELECT
 1 AS `id`,
  1 AS `preferred_name`,
  1 AS `orcid`,
  1 AS `is_verified`,
  1 AS `total_works`,
  1 AS `works_as_author`,
  1 AS `works_as_editor`,
  1 AS `corresponding_author_count`,
  1 AS `open_access_papers`,
  1 AS `total_citations`,
  1 AS `avg_citations_per_work`,
  1 AS `latest_publication_year`,
  1 AS `first_publication_year` */;
SET character_set_client = @saved_cs_client;

--
-- Temporary table structure for view `v_venue_ranking`
--

DROP TABLE IF EXISTS `v_venue_ranking`;
/*!50001 DROP VIEW IF EXISTS `v_venue_ranking`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `v_venue_ranking` AS SELECT
 1 AS `venue_id`,
  1 AS `venue_name`,
  1 AS `venue_type`,
  1 AS `total_works`,
  1 AS `unique_authors`,
  1 AS `first_publication_year`,
  1 AS `latest_publication_year`,
  1 AS `open_access_works`,
  1 AS `open_access_percentage` */;
SET character_set_client = @saved_cs_client;

--
-- Temporary table structure for view `v_venue_ranking_final`
--

DROP TABLE IF EXISTS `v_venue_ranking_final`;
/*!50001 DROP VIEW IF EXISTS `v_venue_ranking_final`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `v_venue_ranking_final` AS SELECT
 1 AS `rank_position`,
  1 AS `venue_name`,
  1 AS `type`,
  1 AS `total_score`,
  1 AS `pts_tematicos`,
  1 AS `pts_impacto`,
  1 AS `pts_open_access`,
  1 AS `matched_topics` */;
SET character_set_client = @saved_cs_client;

--
-- Temporary table structure for view `v_works_by_signature`
--

DROP TABLE IF EXISTS `v_works_by_signature`;
/*!50001 DROP VIEW IF EXISTS `v_works_by_signature`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `v_works_by_signature` AS SELECT
 1 AS `signature_id`,
  1 AS `signature_text`,
  1 AS `person_id`,
  1 AS `preferred_name`,
  1 AS `work_id`,
  1 AS `title`,
  1 AS `publication_year` */;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `venue_ranking_rules`
--

DROP TABLE IF EXISTS `venue_ranking_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `venue_ranking_rules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `term_pattern` varchar(255) NOT NULL,
  `weight` decimal(5,2) NOT NULL,
  `priority` int(11) DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pattern` (`term_pattern`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `venue_subjects`
--

DROP TABLE IF EXISTS `venue_subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `venue_subjects` (
  `venue_id` int(11) NOT NULL,
  `subject_id` int(11) NOT NULL,
  `score` decimal(10,5) DEFAULT NULL,
  `source` varchar(20) DEFAULT 'openalex',
  PRIMARY KEY (`venue_id`,`subject_id`),
  KEY `subject_id` (`subject_id`),
  CONSTRAINT `venue_subjects_ibfk_1` FOREIGN KEY (`venue_id`) REFERENCES `venues` (`id`) ON DELETE CASCADE,
  CONSTRAINT `venue_subjects_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `venue_yearly_stats`
--

DROP TABLE IF EXISTS `venue_yearly_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `venue_yearly_stats` (
  `venue_id` int(11) NOT NULL,
  `year` smallint(6) NOT NULL,
  `works_count` int(11) DEFAULT 0,
  `oa_works_count` int(11) DEFAULT 0,
  `cited_by_count` int(11) DEFAULT 0,
  PRIMARY KEY (`venue_id`,`year`),
  CONSTRAINT `venue_yearly_stats_ibfk_1` FOREIGN KEY (`venue_id`) REFERENCES `venues` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `venues`
--

DROP TABLE IF EXISTS `venues`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `venues` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(512) NOT NULL,
  `type` enum('JOURNAL','CONFERENCE','REPOSITORY','BOOK_SERIES','OTHER') NOT NULL,
  `publisher_id` int(11) DEFAULT NULL,
  `country_code` varchar(16) DEFAULT NULL,
  `issn` varchar(9) DEFAULT NULL,
  `eissn` varchar(9) DEFAULT NULL,
  `homepage_url` varchar(512) DEFAULT NULL,
  `aggregation_type` varchar(50) DEFAULT NULL,
  `open_access` tinyint(1) DEFAULT 0,
  `is_in_doaj` tinyint(1) DEFAULT 0,
  `is_indexed_in_scopus` tinyint(1) DEFAULT 0,
  `works_count` int(11) DEFAULT NULL,
  `cited_by_count` int(11) DEFAULT NULL,
  `impact_factor` decimal(6,3) DEFAULT NULL,
  `citescore` decimal(6,2) DEFAULT NULL,
  `sjr` decimal(6,3) DEFAULT NULL,
  `snip` decimal(6,3) DEFAULT NULL,
  `h_index` int(11) DEFAULT NULL,
  `i10_index` int(11) DEFAULT NULL,
  `2yr_mean_citedness` decimal(10,5) DEFAULT NULL,
  `coverage_start_year` smallint(6) DEFAULT NULL,
  `coverage_end_year` smallint(6) DEFAULT NULL,
  `scopus_id` varchar(50) DEFAULT NULL,
  `wikidata_id` varchar(20) DEFAULT NULL,
  `openalex_id` varchar(50) DEFAULT NULL,
  `mag_id` varchar(50) DEFAULT NULL,
  `subject_score` decimal(10,3) DEFAULT 0.000,
  `snip_score` decimal(10,3) DEFAULT 0.000,
  `oa_score` decimal(10,3) DEFAULT 0.000,
  `total_score` decimal(10,3) DEFAULT 0.000,
  `validation_status` enum('PENDING','VALIDATED','NOT_FOUND','FAILED') NOT NULL DEFAULT 'PENDING',
  `last_validated_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_name_type` (`name`(255),`type`),
  UNIQUE KEY `issn` (`issn`),
  UNIQUE KEY `eissn` (`eissn`),
  UNIQUE KEY `uq_venues_scopus_id` (`scopus_id`),
  UNIQUE KEY `uq_venues_openalex_id` (`openalex_id`),
  UNIQUE KEY `uq_venues_mag_id` (`mag_id`),
  UNIQUE KEY `uq_venues_wikidata` (`wikidata_id`),
  KEY `idx_venues_type_impact` (`type`,`impact_factor`),
  KEY `idx_venues_publisher` (`publisher_id`,`type`),
  KEY `idx_eissn` (`eissn`),
  KEY `idx_validation_status` (`validation_status`),
  KEY `idx_venues_open_access` (`open_access`),
  KEY `idx_venues_total_score` (`total_score` DESC),
  CONSTRAINT `venues_ibfk_1` FOREIGN KEY (`publisher_id`) REFERENCES `organizations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1035966 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `work_author_summary`
--

DROP TABLE IF EXISTS `work_author_summary`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_author_summary` (
  `work_id` int(11) NOT NULL,
  `author_string` mediumtext DEFAULT NULL,
  `first_author_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`work_id`),
  KEY `idx_first_author` (`first_author_id`),
  KEY `idx_work_author_first_author` (`first_author_id`),
  KEY `idx_work_author_summary_work` (`work_id`),
  KEY `idx_was_author_string` (`author_string`(768)),
  FULLTEXT KEY `ft_author_string` (`author_string`),
  CONSTRAINT `fk_work_author_summary_work` FOREIGN KEY (`work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `work_subjects`
--

DROP TABLE IF EXISTS `work_subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_subjects` (
  `work_id` int(11) NOT NULL,
  `subject_id` int(11) NOT NULL,
  `relevance_score` decimal(3,2) DEFAULT 1.00,
  `assigned_by` enum('AUTHOR','EDITOR','SYSTEM','CURATOR') DEFAULT 'AUTHOR',
  PRIMARY KEY (`work_id`,`subject_id`),
  KEY `idx_subject` (`subject_id`),
  KEY `idx_relevance` (`relevance_score`),
  KEY `idx_work_subjects_subject_work` (`subject_id`,`work_id`),
  KEY `idx_work_subjects_work_relevance` (`work_id`,`relevance_score`),
  CONSTRAINT `work_subjects_ibfk_1` FOREIGN KEY (`work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE,
  CONSTRAINT `work_subjects_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `work_subjects_summary`
--

DROP TABLE IF EXISTS `work_subjects_summary`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_subjects_summary` (
  `work_id` int(11) NOT NULL,
  `subjects_string` mediumtext DEFAULT NULL,
  PRIMARY KEY (`work_id`),
  FULLTEXT KEY `ft_subjects_string` (`subjects_string`),
  CONSTRAINT `fk_work_subjects_summary_work` FOREIGN KEY (`work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `works`
--

DROP TABLE IF EXISTS `works`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `works` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` text NOT NULL,
  `subtitle` text DEFAULT NULL,
  `abstract` mediumtext DEFAULT NULL,
  `work_type` enum('ARTICLE','BOOK','CHAPTER','THESIS','CONFERENCE','CONFERENCE_PAPER','REPORT','DATASET','PREPRINT','REVIEW','EDITORIAL','OTHER') NOT NULL,
  `language` char(3) DEFAULT NULL,
  `reference_count` int(10) unsigned DEFAULT 0,
  `citation_count` int(11) DEFAULT 0,
  `download_count` int(11) DEFAULT 0,
  `view_count` int(11) DEFAULT 0,
  `altmetric_score` decimal(10,2) DEFAULT NULL,
  `social_media_mentions` int(11) DEFAULT 0,
  `news_mentions` int(11) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `metrics_last_updated` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `title_normalized` varchar(255) GENERATED ALWAYS AS (left(trim(lcase(`title`)),255)) STORED,
  PRIMARY KEY (`id`),
  KEY `idx_work_type` (`work_type`),
  KEY `idx_language` (`language`),
  KEY `idx_works_type_language` (`work_type`,`language`),
  KEY `idx_works_created_at` (`created_at`),
  KEY `idx_works_updated_at` (`updated_at`),
  KEY `idx_works_title_normalized` (`title_normalized`),
  KEY `idx_works_citation_count` (`citation_count` DESC),
  KEY `idx_works_citation_year` (`citation_count` DESC,`created_at` DESC),
  KEY `idx_works_metrics_updated` (`metrics_last_updated` DESC),
  FULLTEXT KEY `ft_works_content` (`title`,`subtitle`,`abstract`)
) ENGINE=InnoDB AUTO_INCREMENT=6655790 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`brVn0`@`%`*/ /*!50003 TRIGGER `trg_works_after_insert_sphinx`
AFTER INSERT ON `works`
FOR EACH ROW
BEGIN
    INSERT INTO sphinx_queue (operation, work_id, status) 
    VALUES ('INSERT', NEW.id, 'pending')
    ON DUPLICATE KEY UPDATE status = 'pending', queued_at = CURRENT_TIMESTAMP;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`brVn0`@`%`*/ /*!50003 TRIGGER `trg_works_queue_sphinx_update`
AFTER UPDATE ON `works`
FOR EACH ROW
BEGIN
    INSERT INTO sphinx_queue (operation, work_id, status) 
    VALUES ('UPDATE', NEW.id, 'pending')
    ON DUPLICATE KEY UPDATE status = 'pending', queued_at = CURRENT_TIMESTAMP;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Dumping events for database 'data_dev'
--
/*!50106 SET @save_time_zone= @@TIME_ZONE */ ;
/*!50106 DROP EVENT IF EXISTS `ev_process_sphinx_50_mil` */;
DELIMITER ;;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;;
/*!50003 SET character_set_client  = utf8mb4 */ ;;
/*!50003 SET character_set_results = utf8mb4 */ ;;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;;
/*!50003 SET @saved_time_zone      = @@time_zone */ ;;
/*!50003 SET time_zone             = 'SYSTEM' */ ;;
/*!50106 CREATE*/ /*!50117 DEFINER=`brVn0`@`%`*/ /*!50106 EVENT `ev_process_sphinx_50_mil` ON SCHEDULE EVERY 1 MINUTE STARTS '2025-11-16 15:08:06' ON COMPLETION NOT PRESERVE ENABLE DO BEGIN
    DECLARE v_done INT DEFAULT FALSE;
    DECLARE v_queue_id INT;
    DECLARE v_work_id INT;
    
    
    CREATE TEMPORARY TABLE IF NOT EXISTS `temp_sphinx_batch` (
        `id` INT PRIMARY KEY,
        `work_id` INT
    );
    
    
    TRUNCATE TABLE `temp_sphinx_batch`;

    
    INSERT INTO `temp_sphinx_batch` (id, work_id)
    SELECT id, work_id
    FROM sphinx_queue
    WHERE status = 'pending'
    ORDER BY queued_at ASC
    LIMIT 50000;
    
    
    UPDATE sphinx_queue q
    JOIN `temp_sphinx_batch` t ON q.id = t.id
    SET q.status = 'processing', q.processed_at = NOW();

    
    BEGIN
        DECLARE cur_queue CURSOR FOR 
            SELECT id, work_id 
            FROM `temp_sphinx_batch`;
            
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

        OPEN cur_queue;
        
        read_loop: LOOP
            FETCH cur_queue INTO v_queue_id, v_work_id;
            IF v_done THEN
                LEAVE read_loop;
            END IF;
            
            
            CALL sp_refresh_single_work_sphinx(v_work_id);
            
            
            UPDATE sphinx_queue 
            SET status = 'completed' 
            WHERE id = v_queue_id;
            
        END LOOP;
        
        CLOSE cur_queue;
    END; 
    
    
    DROP TEMPORARY TABLE `temp_sphinx_batch`;

END */ ;;
/*!50003 SET time_zone             = @saved_time_zone */ ;;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;;
/*!50003 SET character_set_client  = @saved_cs_client */ ;;
/*!50003 SET character_set_results = @saved_cs_results */ ;;
/*!50003 SET collation_connection  = @saved_col_connection */ ;;
/*!50106 DROP EVENT IF EXISTS `ev_process_sphinx_safe` */;;
DELIMITER ;;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;;
/*!50003 SET character_set_client  = utf8mb4 */ ;;
/*!50003 SET character_set_results = utf8mb4 */ ;;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;;
/*!50003 SET @saved_time_zone      = @@time_zone */ ;;
/*!50003 SET time_zone             = 'SYSTEM' */ ;;
/*!50106 CREATE*/ /*!50117 DEFINER=`pc`@`localhost`*/ /*!50106 EVENT `ev_process_sphinx_safe` ON SCHEDULE EVERY 1 MINUTE STARTS '2026-01-08 12:24:16' ON COMPLETION PRESERVE ENABLE DO BEGIN
    DECLARE v_done INT DEFAULT FALSE;
    DECLARE v_queue_id INT;
    DECLARE v_work_id INT;
    DECLARE v_error TEXT;
    
    
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_sphinx_batch (
        id INT PRIMARY KEY,
        work_id INT,
        KEY idx_work (work_id)
    );
    
    
    TRUNCATE TABLE temp_sphinx_batch;
    
    
    INSERT INTO temp_sphinx_batch (id, work_id)
    SELECT id, work_id
    FROM sphinx_queue
    WHERE status = 'pending'
    ORDER BY queued_at ASC
    LIMIT 1000;  
    
    
    UPDATE sphinx_queue q
    JOIN temp_sphinx_batch t ON q.id = t.id
    SET q.status = 'processing', 
        q.processed_at = NOW(),
        q.retry_count = q.retry_count + 1;
    
    
    BEGIN
        DECLARE cur_queue CURSOR FOR 
            SELECT id, work_id FROM temp_sphinx_batch;
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
        DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
        BEGIN
            GET DIAGNOSTICS CONDITION 1 v_error = MESSAGE_TEXT;
            
            INSERT INTO processing_log (entity_type, entity_id, action, status, error_message)
            VALUES ('SPHINX', v_work_id, 'process_queue', 'ERROR', LEFT(v_error, 500));
        END;
        
        OPEN cur_queue;
        
        read_loop: LOOP
            FETCH cur_queue INTO v_queue_id, v_work_id;
            IF v_done THEN
                LEAVE read_loop;
            END IF;
            
            
            BEGIN
                DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
                BEGIN
                    
                    UPDATE sphinx_queue 
                    SET status = 'failed',
                        error_message = LEFT(v_error, 500)
                    WHERE id = v_queue_id;
                END;
                
                CALL sp_refresh_single_work_sphinx(v_work_id);
                
                
                UPDATE sphinx_queue 
                SET status = 'completed',
                    processed_at = NOW()
                WHERE id = v_queue_id;
            END;
            
        END LOOP;
        
        CLOSE cur_queue;
    END;
    
    
    DROP TEMPORARY TABLE IF EXISTS temp_sphinx_batch;
    
END */ ;;
/*!50003 SET time_zone             = @saved_time_zone */ ;;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;;
/*!50003 SET character_set_client  = @saved_cs_client */ ;;
/*!50003 SET character_set_results = @saved_cs_results */ ;;
/*!50003 SET collation_connection  = @saved_col_connection */ ;;
DELIMITER ;
/*!50106 SET TIME_ZONE= @save_time_zone */ ;

--
-- Dumping routines for database 'data_dev'
--
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP FUNCTION IF EXISTS `clean_identifier` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` FUNCTION `clean_identifier`(p_id VARCHAR(50)) RETURNS varchar(50) CHARSET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci
    DETERMINISTIC
BEGIN
    DECLARE v_cleaned VARCHAR(50);
    SET v_cleaned = TRIM(p_id); 
    SET v_cleaned = REPLACE(v_cleaned, ' ', ''); 
    SET v_cleaned = REPLACE(v_cleaned, '-', ''); 
    RETURN v_cleaned;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP FUNCTION IF EXISTS `clean_person_name` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`brVn0`@`%` FUNCTION `clean_person_name`(input_name VARCHAR(512)) RETURNS varchar(512) CHARSET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci
    DETERMINISTIC
BEGIN
    DECLARE cleaned_name VARCHAR(512);
    
    IF input_name IS NULL THEN
        RETURN NULL;
    END IF;
    
    SET cleaned_name = LOWER(input_name);
    
    SET cleaned_name = REPLACE(cleaned_name, CHAR(8206), ''); 
    SET cleaned_name = REPLACE(cleaned_name, CHAR(8207), ''); 
    SET cleaned_name = REPLACE(cleaned_name, CHAR(8203), ''); 
    SET cleaned_name = REPLACE(cleaned_name, CHAR(160), ' '); 
    
    
    SET cleaned_name = REGEXP_REPLACE(cleaned_name, '[.,"`()]+', '');
    
    SET cleaned_name = REGEXP_REPLACE(cleaned_name, '[[:space:]]+', ' ');
    
    SET cleaned_name = TRIM(cleaned_name);
    
    IF cleaned_name = '' OR LENGTH(cleaned_name) < 2 THEN
        RETURN NULL;
    END IF;
    
    RETURN cleaned_name;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP FUNCTION IF EXISTS `extract_university_base_name` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` FUNCTION `extract_university_base_name`(org_name VARCHAR(512)) RETURNS varchar(512) CHARSET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci
    READS SQL DATA
    DETERMINISTIC
BEGIN
    DECLARE normalized_name VARCHAR(512);
    DECLARE result VARCHAR(512);
    
    
    SET normalized_name = TRIM(UPPER(org_name));
    
    
    SET normalized_name = REPLACE(normalized_name, 'Ã', 'A');
    SET normalized_name = REPLACE(normalized_name, 'Á', 'A');
    SET normalized_name = REPLACE(normalized_name, 'À', 'A');
    SET normalized_name = REPLACE(normalized_name, 'Â', 'A');
    SET normalized_name = REPLACE(normalized_name, 'Ä', 'A');
    SET normalized_name = REPLACE(normalized_name, 'É', 'E');
    SET normalized_name = REPLACE(normalized_name, 'Ê', 'E');
    SET normalized_name = REPLACE(normalized_name, 'Ë', 'E');
    SET normalized_name = REPLACE(normalized_name, 'Í', 'I');
    SET normalized_name = REPLACE(normalized_name, 'Ï', 'I');
    SET normalized_name = REPLACE(normalized_name, 'Ó', 'O');
    SET normalized_name = REPLACE(normalized_name, 'Ô', 'O');
    SET normalized_name = REPLACE(normalized_name, 'Õ', 'O');
    SET normalized_name = REPLACE(normalized_name, 'Ö', 'O');
    SET normalized_name = REPLACE(normalized_name, 'Ú', 'U');
    SET normalized_name = REPLACE(normalized_name, 'Ü', 'U');
    SET normalized_name = REPLACE(normalized_name, 'Ç', 'C');
    
    
    SET normalized_name = REPLACE(normalized_name, 'SAO PAULO', 'SÃO PAULO');
    
    SET result = normalized_name;
    
    
    IF normalized_name REGEXP 'FEDERAL UNIVERSITY OF' THEN
        SET result = REGEXP_REPLACE(normalized_name, 
            '^.*(FEDERAL UNIVERSITY OF [A-Z ]+)[^A-Z].*', '\\1');
    
    
    ELSEIF normalized_name REGEXP 'STATE UNIVERSITY OF' THEN
        SET result = REGEXP_REPLACE(normalized_name, 
            '^.*(STATE UNIVERSITY OF [A-Z ]+)[^A-Z].*', '\\1');
    
    
    ELSEIF normalized_name REGEXP 'UNIVERSITY OF [A-Z]' THEN
        SET result = REGEXP_REPLACE(normalized_name, 
            '^.*(UNIVERSITY OF [A-Z ]+)[^A-Z].*', '\\1');
    
    
    ELSEIF normalized_name REGEXP 'UNIVERSIDADE FEDERAL D[OAE]' THEN
        SET result = REGEXP_REPLACE(normalized_name, 
            '^.*(UNIVERSIDADE FEDERAL D[OAE] [A-Z ]+)[^A-Z].*', '\\1');
    
    
    ELSEIF normalized_name REGEXP 'UNIVERSIDADE ESTADUAL D[OAE]' THEN
        SET result = REGEXP_REPLACE(normalized_name, 
            '^.*(UNIVERSIDADE ESTADUAL D[OAE] [A-Z ]+)[^A-Z].*', '\\1');
    
    
    ELSEIF normalized_name REGEXP 'UNIVERSIDADE DE SAO PAULO' THEN
        SET result = 'UNIVERSIDADE DE SÃO PAULO';
    
    
    ELSEIF normalized_name REGEXP 'UNIVERSIDADE CATOLICA' THEN
        SET result = REGEXP_REPLACE(normalized_name, 
            '^.*(UNIVERSIDADE CATOLICA[^,]*).*', '\\1');
    
    
    ELSEIF normalized_name REGEXP 'INSTITUTO FEDERAL' THEN
        SET result = REGEXP_REPLACE(normalized_name, 
            '^.*(INSTITUTO FEDERAL D[OAE] [A-Z ]+)[^A-Z].*', '\\1');
    
    
    ELSEIF normalized_name REGEXP 'UNIVERSIDADE' THEN
        SET result = REGEXP_REPLACE(normalized_name, 
            '^[^A-Z]*(UNIVERSIDADE[^,()/-]*)([,()/-].*| *)', '\\1');
    
    
    ELSEIF normalized_name REGEXP 'UNIVERSITY' THEN
        SET result = REGEXP_REPLACE(normalized_name, 
            '^[^A-Z]*([^,()/-]*UNIVERSITY[^,()/-]*)([,()/-].*| *)', '\\1');
    END IF;
    
    
    SET result = REGEXP_REPLACE(result, 
        ' +\\(?(LABORATORY|PROGRAM|DEPARTMENT|INSTITUTE|SCHOOL|FACULTY|CENTER|COLLEGE|DEPT?|INST?|LAB?|CTR?|SCH?|FCS?)[^)]*\\)? *$', '');
    
    
    SET result = REGEXP_REPLACE(result, 
        ' +\\(?(LABORATORIO|PROGRAMA|DEPARTAMENTO|INSTITUTO|ESCOLA|FACULDADE|CENTRO)[^)]*\\)? *$', '');
    
    RETURN TRIM(result);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP FUNCTION IF EXISTS `fn_calculate_10yr_impact_factor` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`brVn0`@`%` FUNCTION `fn_calculate_10yr_impact_factor`(p_venue_id INT, p_target_year INT) RETURNS decimal(10,3)
    READS SQL DATA
    DETERMINISTIC
BEGIN
    DECLARE v_numerator INT DEFAULT 0;
    DECLARE v_denominator INT DEFAULT 0;
    DECLARE v_result DECIMAL(10,3) DEFAULT 0.000;

    
    
    SELECT COUNT(*)
    INTO v_denominator
    FROM publications p
    JOIN works w ON p.work_id = w.id
    WHERE p.venue_id = p_venue_id
      
      AND p.year BETWEEN (p_target_year - 10) AND (p_target_year - 1)
      AND w.work_type IN ('ARTICLE', 'CONFERENCE', 'CHAPTER', 'BOOK');

    
    IF v_denominator = 0 THEN
        RETURN 0.000;
    END IF;

    
    
    SELECT COUNT(*)
    INTO v_numerator
    FROM citations c
    JOIN publications citing_pub ON c.citing_work_id = citing_pub.work_id 
    JOIN publications cited_pub ON c.cited_work_id = cited_pub.work_id    
    WHERE cited_pub.venue_id = p_venue_id
      AND citing_pub.year = p_target_year 
      
      AND cited_pub.year BETWEEN (p_target_year - 10) AND (p_target_year - 1);

    
    SET v_result = v_numerator / v_denominator;

    RETURN v_result;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP FUNCTION IF EXISTS `fn_clean_text` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` FUNCTION `fn_clean_text`(p_text TEXT
) RETURNS text CHARSET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci
    NO SQL
    DETERMINISTIC
BEGIN
    DECLARE cleaned_text TEXT;

    IF p_text IS NULL THEN
        RETURN NULL;
    END IF;

    
    SET cleaned_text = TRIM(p_text);

    
    SET cleaned_text = REGEXP_REPLACE(cleaned_text, '\\s+', ' ');

    
    SET cleaned_text = REPLACE(cleaned_text, '&amp;', '&');
    SET cleaned_text = REPLACE(cleaned_text, '&quot;', '"');
    SET cleaned_text = REPLACE(cleaned_text, '&apos;', "'");
    SET cleaned_text = REPLACE(cleaned_text, '&lt;', '<');
    SET cleaned_text = REPLACE(cleaned_text, '&gt;', '>');
    SET cleaned_text = REPLACE(cleaned_text, '&nbsp;', ' ');

    
    SET cleaned_text = REGEXP_REPLACE(cleaned_text, '[\\x00-\\x1F\\x7F]', '');

    
    
    IF LENGTH(cleaned_text) > 1 THEN
        SET cleaned_text = CONCAT(UPPER(LEFT(cleaned_text, 1)), LOWER(SUBSTRING(cleaned_text, 2)));
    ELSE
        SET cleaned_text = UPPER(cleaned_text);
    END IF;

    RETURN cleaned_text;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP FUNCTION IF EXISTS `fn_get_name_part_advanced` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` FUNCTION `fn_get_name_part_advanced`(p_full_name VARCHAR(512),
    p_part ENUM('FAMILY', 'GIVEN')
) RETURNS varchar(255) CHARSET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci
    DETERMINISTIC
BEGIN
    DECLARE v_family_name VARCHAR(255); 
    DECLARE v_given_names VARCHAR(255);
    DECLARE v_clean_name VARCHAR(512);
    DECLARE v_upper_name VARCHAR(512);
    DECLARE v_word_count INT;
    DECLARE v_last_name_start_pos INT DEFAULT 0;
    DECLARE v_current_word VARCHAR(100);
    DECLARE i INT;
    DECLARE particles TEXT DEFAULT ',DO,DA,DOS,DAS,DE,DEL,DELLA,DI,DU,VAN,VAN DER,VON,VON DER,AL,EL,LA,LE,SAINT,SAINTE,MC,MAC,O,';

    IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
        RETURN NULL;
    END IF;

    SET v_clean_name = TRIM(p_full_name);
    SET v_upper_name = UPPER(v_clean_name);
    SET v_upper_name = TRIM(REPLACE(REPLACE(v_upper_name, '.', ' '), ',', ' '));
    WHILE LOCATE('  ', v_upper_name) > 0 DO SET v_upper_name = REPLACE(v_upper_name, '  ', ' '); END WHILE;
    
    SET v_word_count = LENGTH(v_upper_name) - LENGTH(REPLACE(v_upper_name, ' ', '')) + 1;

    SET i = v_word_count;
    find_last_significant: WHILE i > 0 DO
        SET v_current_word = SUBSTRING_INDEX(SUBSTRING_INDEX(v_upper_name, ' ', i), ' ', -1);
        IF LENGTH(v_current_word) > 1 
           AND v_current_word NOT IN ('FILHO', 'JUNIOR', 'NETO', 'SOBRINHO', 'JR', 'SR', 'III', 'IV', 'V')
           AND LOCATE(CONCAT(',', v_current_word, ','), particles) = 0 THEN
            SET v_last_name_start_pos = i;
            LEAVE find_last_significant;
        END IF;
        SET i = i - 1;
    END WHILE;

    IF v_last_name_start_pos = 0 THEN SET v_last_name_start_pos = v_word_count; END IF;

    SET i = v_last_name_start_pos - 1;
    include_particles: WHILE i > 0 DO
        SET v_current_word = SUBSTRING_INDEX(SUBSTRING_INDEX(v_upper_name, ' ', i), ' ', -1);
        IF LOCATE(CONCAT(',', v_current_word, ','), particles) > 0 THEN
            SET v_last_name_start_pos = i;
        ELSE
            LEAVE include_particles;
        END IF;
        SET i = i - 1;
    END WHILE;

    IF v_last_name_start_pos <= 1 THEN
        SET v_family_name = v_clean_name;
        SET v_given_names = NULL;
    ELSE
        
        SET @delimiter_pos := 0;
        SET @temp_str := SUBSTRING_INDEX(v_upper_name, ' ', v_last_name_start_pos - 1);
        SET @last_given_word := SUBSTRING_INDEX(@temp_str, ' ', -1);
        
        
        SET @given_len := LENGTH(SUBSTRING_INDEX(v_clean_name, ' ', v_last_name_start_pos - 1));
        
        SET v_given_names = TRIM(SUBSTRING(v_clean_name, 1, @given_len));
        SET v_family_name = TRIM(SUBSTRING(v_clean_name, @given_len + 1));
    END IF;
    
    IF p_part = 'FAMILY' THEN
        RETURN v_family_name;
    ELSE
        RETURN v_given_names;
    END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP FUNCTION IF EXISTS `fn_initcap` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` FUNCTION `fn_initcap`(p_string VARCHAR(512)) RETURNS varchar(512) CHARSET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci
    DETERMINISTIC
BEGIN
    DECLARE v_result VARCHAR(512) DEFAULT '';
    DECLARE v_char CHAR(1);
    DECLARE v_cap_next BOOLEAN DEFAULT TRUE;
    DECLARE v_i INT DEFAULT 1;

    IF p_string IS NULL THEN
        RETURN NULL;
    END IF;

    SET v_result = LOWER(TRIM(p_string));

    WHILE v_i <= LENGTH(v_result) DO
        SET v_char = SUBSTRING(v_result, v_i, 1);
        
        IF v_cap_next THEN
            
            SET v_result = CONCAT(LEFT(v_result, v_i - 1), UPPER(v_char), SUBSTRING(v_result, v_i + 1));
            SET v_cap_next = FALSE;
        END IF;
        
        
        IF v_char IN (' ', '-', '\'', '.') THEN
            SET v_cap_next = TRUE;
        END IF;
        
        SET v_i = v_i + 1;
    END WHILE;

    RETURN v_result;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP FUNCTION IF EXISTS `generate_name_signature` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` FUNCTION `generate_name_signature`(p_full_name VARCHAR(512)
) RETURNS varchar(100) CHARSET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci
    READS SQL DATA
    DETERMINISTIC
BEGIN
    DECLARE cleanName VARCHAR(512) DEFAULT '';
    DECLARE finalSignature VARCHAR(100) DEFAULT '';
    DECLARE lastName VARCHAR(100) DEFAULT '';
    DECLARE givenNames VARCHAR(400) DEFAULT '';
    DECLARE allInitials VARCHAR(200) DEFAULT '';
    DECLARE currentWord VARCHAR(100);
    DECLARE tempWord VARCHAR(100);
    DECLARE i INT DEFAULT 1;
    DECLARE wordCount INT;
    DECLARE lastNameStartPos INT DEFAULT 0;
    
    
    DECLARE particles TEXT DEFAULT ',DO,DA,DOS,DAS,DE,DEL,DELLA,DI,DU,VAN,VAN DER,VON,VON DER,AL,EL,LA,LE,SAINT,SAINTE,MC,MAC,O,';
    
    
    SET cleanName = UPPER(TRIM(p_full_name));
    SET cleanName = REPLACE(cleanName, '.', ' ');
    SET cleanName = REPLACE(cleanName, ',', ' ');
    SET cleanName = REPLACE(cleanName, '(', ' ');
    SET cleanName = REPLACE(cleanName, ')', ' ');
    SET cleanName = REPLACE(cleanName, '"', ' ');
    
    SET cleanName = REPLACE(cleanName, '‐', '-');
    SET cleanName = REPLACE(cleanName, '−', '-');
    SET cleanName = REPLACE(cleanName, '–', '-');
    SET cleanName = REPLACE(cleanName, '—', '-');
    
    
    WHILE LOCATE('  ', cleanName) > 0 DO
        SET cleanName = REPLACE(cleanName, '  ', ' ');
    END WHILE;
    SET cleanName = TRIM(cleanName);
    
    IF cleanName = '' THEN
        RETURN '';
    END IF;
    
    SET wordCount = LENGTH(cleanName) - LENGTH(REPLACE(cleanName, ' ', '')) + 1;
    SET i = wordCount;
    
    
    find_last_significant: WHILE i > 0 DO
        SET currentWord = SUBSTRING_INDEX(SUBSTRING_INDEX(cleanName, ' ', i), ' ', -1);
        
        
        IF LENGTH(currentWord) > 1 
           AND currentWord NOT IN ('FILHO', 'JUNIOR', 'NETO', 'SOBRINHO', 'JR', 'SR', 'III', 'IV', 'V')
           AND LOCATE(CONCAT(',', currentWord, ','), particles) = 0 THEN
            SET lastNameStartPos = i;
            LEAVE find_last_significant;
        END IF;
        SET i = i - 1;
    END WHILE;
    
    
    IF lastNameStartPos = 0 THEN
        SET lastNameStartPos = wordCount;
    END IF;
    
    
    SET i = lastNameStartPos - 1;
    include_particles: WHILE i > 0 DO
        SET currentWord = SUBSTRING_INDEX(SUBSTRING_INDEX(cleanName, ' ', i), ' ', -1);
        
        IF LOCATE(CONCAT(',', currentWord, ','), particles) > 0 THEN
            SET lastNameStartPos = i;
        ELSE
            LEAVE include_particles;
        END IF;
        SET i = i - 1;
    END WHILE;
    
    
    IF lastNameStartPos = 1 THEN
        SET lastName = cleanName;
        SET givenNames = '';
    ELSE
        
        SET givenNames = '';
        SET i = 1;
        WHILE i < lastNameStartPos DO
            SET currentWord = SUBSTRING_INDEX(SUBSTRING_INDEX(cleanName, ' ', i), ' ', -1);
            SET givenNames = CONCAT(givenNames, ' ', currentWord);
            SET i = i + 1;
        END WHILE;
        SET givenNames = TRIM(givenNames);
        
        
        SET lastName = '';
        SET i = lastNameStartPos;
        WHILE i <= wordCount DO
            SET currentWord = SUBSTRING_INDEX(SUBSTRING_INDEX(cleanName, ' ', i), ' ', -1);
            SET lastName = CONCAT(lastName, ' ', currentWord);
            SET i = i + 1;
        END WHILE;
        SET lastName = TRIM(lastName);
    END IF;
    
    
    IF givenNames != '' THEN
        SET i = 1;
        SET wordCount = LENGTH(givenNames) - LENGTH(REPLACE(givenNames, ' ', '')) + 1;
        
        WHILE i <= wordCount DO
            SET currentWord = SUBSTRING_INDEX(SUBSTRING_INDEX(givenNames, ' ', i), ' ', -1); 
            
            IF currentWord != '' THEN
                SET allInitials = CONCAT(allInitials, LEFT(currentWord, 1), ' ');
                
                
                SET tempWord = currentWord;
                WHILE LOCATE('-', tempWord) > 0 DO
                    SET tempWord = SUBSTRING(tempWord, LOCATE('-', tempWord) + 1);
                    IF tempWord != '' THEN
                        SET allInitials = CONCAT(allInitials, LEFT(tempWord, 1), ' ');
                    END IF;
                END WHILE;
            END IF;
            SET i = i + 1;
        END WHILE;
        
        SET allInitials = TRIM(allInitials);
    END IF;
    
    
    IF allInitials != '' THEN
        SET finalSignature = CONCAT(lastName, ' ', allInitials);
    ELSE
        SET finalSignature = lastName;
    END IF;
    
    RETURN TRIM(finalSignature);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP FUNCTION IF EXISTS `safe_initcap` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` FUNCTION `safe_initcap`(str VARCHAR(512)) RETURNS varchar(512) CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
    DETERMINISTIC
BEGIN
    DECLARE result VARCHAR(512);
    DECLARE i INT DEFAULT 1;
    DECLARE cap_next BOOL DEFAULT TRUE;
    DECLARE ch CHAR(1);
    
    IF str IS NULL THEN
        RETURN NULL;
    END IF;
    
    SET str = LOWER(TRIM(str));
    SET result = '';
    
    WHILE i <= LENGTH(str) DO
        SET ch = SUBSTRING(str, i, 1);
        
        IF cap_next THEN
            SET result = CONCAT(result, UPPER(ch));
            SET cap_next = FALSE;
        ELSE
            SET result = CONCAT(result, ch);
        END IF;
        
        IF ch IN (' ', '-', '.', ',', ';', ':', '!', '?', '\'', '"') THEN
            SET cap_next = TRUE;
        END IF;
        
        SET i = i + 1;
    END WHILE;
    
    RETURN result;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_calculate_venue_ranking` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` PROCEDURE `sp_calculate_venue_ranking`()
BEGIN
    UPDATE venues SET 
        subject_score = 0.000, 
        snip_score = 0.000, 
        oa_score = 0.000, 
        total_score = 0.000;

    UPDATE venues v
    INNER JOIN (
        SELECT 
            v_sub.id,
            COALESCE(MAX(r.weight * COALESCE(vs.score, 1.0)), 0.000) as sub_score,
            LOG2(COALESCE(v_sub.snip, 0) + 1) as snp_score,
            CASE WHEN COALESCE(v_sub.open_access, 0) = 1 THEN 0.2 ELSE 0.0 END as o_score
        FROM venues v_sub
        INNER JOIN venue_subjects vs ON v_sub.id = vs.venue_id
        INNER JOIN cache_rule_subject_map map ON vs.subject_id = map.subject_id
        INNER JOIN venue_ranking_rules r ON map.rule_id = r.id
        GROUP BY v_sub.id
    ) src ON v.id = src.id
    SET v.subject_score = src.sub_score,
        v.snip_score = src.snp_score,
        v.oa_score = src.o_score,
        v.total_score = (src.sub_score + src.snp_score + src.o_score);

    SELECT CONCAT('Ranking atualizado em venues. Registros: ', ROW_COUNT()) as status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_check_data_integrity` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_check_data_integrity`()
BEGIN
    DROP TEMPORARY TABLE IF EXISTS temp_integrity_issues;
    CREATE TEMPORARY TABLE temp_integrity_issues (issue_type VARCHAR(100), description TEXT, affected_count INT);
    INSERT INTO temp_integrity_issues SELECT 'UNUSED_PERSONS', 'Pessoas sem autorias', COUNT(*), GROUP_CONCAT(id LIMIT 10) FROM persons p LEFT JOIN authorships a ON p.id = a.person_id WHERE a.person_id IS NULL;
    INSERT INTO temp_integrity_issues SELECT 'AUTHORLESS_WORKS', 'Obras sem autores', COUNT(*), GROUP_CONCAT(id LIMIT 10) FROM works w LEFT JOIN authorships a ON w.id = a.work_id WHERE a.work_id IS NULL;
    SELECT * FROM temp_integrity_issues WHERE affected_count > 0;
    DROP TEMPORARY TABLE temp_integrity_issues;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_check_duplicate_persons` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_check_duplicate_persons`()
BEGIN
    SELECT 'ORCID_DUPLICATES' as type, orcid as identifier, 
           COUNT(*) as count, GROUP_CONCAT(id) as person_ids
    FROM persons 
    WHERE orcid IS NOT NULL 
    GROUP BY orcid 
    HAVING COUNT(*) > 1
    
    UNION ALL
    
    SELECT 'SCOPUS_DUPLICATES' as type, scopus_id as identifier,
           COUNT(*) as count, GROUP_CONCAT(id) as person_ids
    FROM persons 
    WHERE scopus_id IS NOT NULL 
    GROUP BY scopus_id 
    HAVING COUNT(*) > 1
    
    UNION ALL
    
    SELECT 'NAME_SIMILARITY' as type, normalized_name as identifier,
           COUNT(*) as count, GROUP_CONCAT(id) as person_ids
    FROM persons 
    WHERE normalized_name IS NOT NULL 
    GROUP BY normalized_name 
    HAVING COUNT(*) > 1
    ORDER BY count DESC;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_check_signature_conflicts` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_check_signature_conflicts`()
BEGIN
    SELECT
        s.signature,
        COUNT(DISTINCT ps.person_id) as person_count,
        GROUP_CONCAT(DISTINCT p.preferred_name ORDER BY p.preferred_name SEPARATOR ' | ') as conflicting_names,
        GROUP_CONCAT(DISTINCT ps.person_id ORDER BY ps.person_id) as person_ids
    FROM signatures s
    JOIN persons_signatures ps ON s.id = ps.signature_id
    JOIN persons p ON ps.person_id = p.id
    WHERE p.preferred_name IS NOT NULL AND TRIM(p.preferred_name) != ''
    GROUP BY s.signature
    HAVING person_count > 1 
    AND COUNT(DISTINCT TRIM(LOWER(p.preferred_name))) > 1
    ORDER BY person_count DESC;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_clean_all_names` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_clean_all_names`()
BEGIN
    DECLARE v_updated INT DEFAULT 0;
    DECLARE v_nullified INT DEFAULT 0;
    DECLARE v_total INT DEFAULT 0;
    
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        GET DIAGNOSTICS CONDITION 1
            @sqlstate = RETURNED_SQLSTATE, 
            @errno = MYSQL_ERRNO, 
            @text = MESSAGE_TEXT;
        INSERT INTO processing_log (entity_type, entity_id, action, status, error_message)
        VALUES ('ERROR', 0, 'clean_names', 'ERROR', 
                LEFT(CONCAT('SQL ERROR: ', @errno, ' - ', @text), 500));
        RESIGNAL;
    END;
    
    
    SELECT COUNT(*) INTO v_total FROM persons WHERE preferred_name IS NOT NULL;
    
    START TRANSACTION;
    
    
    INSERT INTO processing_log (entity_type, entity_id, action, status, error_message)
    VALUES ('SYSTEM', 0, 'clean_names_start', 'PROCESSING', 
            CONCAT('Iniciando limpeza de ', v_total, ' nomes'));
    
    
    UPDATE persons 
    SET preferred_name = clean_person_name(preferred_name)
    WHERE preferred_name != clean_person_name(preferred_name) 
      AND clean_person_name(preferred_name) IS NOT NULL;
    
    SET v_updated = ROW_COUNT();
    
    
    UPDATE persons 
    SET preferred_name = NULL
    WHERE clean_person_name(preferred_name) IS NULL 
      AND preferred_name IS NOT NULL;
    
    SET v_nullified = ROW_COUNT();
    
    COMMIT;
    
    
    INSERT INTO processing_log (entity_type, entity_id, action, status, error_message)
    VALUES ('SYSTEM', 0, 'clean_names_done', 'SUCCESS', 
            CONCAT('Limpos: ', v_updated, ' Removidos: ', v_nullified));
    
    SELECT 
        v_updated as nomes_limpos,
        v_nullified as nomes_removidos,
        v_total as total_original,
        CONCAT(ROUND(((v_updated + v_nullified) * 100.0 / v_total), 2), '%') as percentual_afetado;
    
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_clean_html_entities` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_clean_html_entities`()
BEGIN
    DECLARE total_cleaned INT DEFAULT 0;
    
    START TRANSACTION;
    
    
    UPDATE IGNORE works SET title = TRIM(REPLACE(REPLACE(title, '&amp;', '&'), '&nbsp;', ' ')) WHERE title REGEXP '&[a-zA-Z0-9#]+;';
    SET total_cleaned = total_cleaned + ROW_COUNT();
    
    UPDATE IGNORE works SET abstract = TRIM(REPLACE(REPLACE(abstract, '&amp;', '&'), '&nbsp;', ' ')) WHERE abstract REGEXP '&[a-zA-Z0-9#]+;' AND abstract IS NOT NULL;
    SET total_cleaned = total_cleaned + ROW_COUNT();
    
    UPDATE IGNORE organizations SET name = TRIM(REPLACE(REPLACE(name, '&amp;', '&'), '&nbsp;', ' ')) WHERE name REGEXP '&[a-zA-Z0-9#]+;';
    SET total_cleaned = total_cleaned + ROW_COUNT();
    
    UPDATE IGNORE venues SET name = TRIM(REPLACE(REPLACE(name, '&amp;', '&'), '&nbsp;', ' ')) WHERE name REGEXP '&[a-zA-Z0-9#]+;';
    SET total_cleaned = total_cleaned + ROW_COUNT();
    
    UPDATE IGNORE persons SET preferred_name = TRIM(REPLACE(REPLACE(preferred_name, '&amp;', '&'), '&nbsp;', ' ')) WHERE preferred_name REGEXP '&[a-zA-Z0-9#]+;' AND preferred_name IS NOT NULL;
    SET total_cleaned = total_cleaned + ROW_COUNT();
    
    COMMIT;
    
    SELECT CONCAT('HTML entities cleaned (com IGNORE): ', total_cleaned, ' records afetados') as result;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_clean_inconsistent_data` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` PROCEDURE `sp_clean_inconsistent_data`()
BEGIN
    
    DELETE a FROM authorships a
    LEFT JOIN works w ON a.work_id = w.id
    LEFT JOIN persons p ON a.person_id = p.id
    WHERE w.id IS NULL OR p.id IS NULL;
    
    
    DELETE pub FROM publications pub
    LEFT JOIN works w ON pub.work_id = w.id
    WHERE w.id IS NULL;
    
    
    DELETE c FROM courses c
    LEFT JOIN programs p ON c.program_id = p.id
    WHERE p.id IS NULL;
    
    SELECT CONCAT('Dados inconsistentes removidos: ', ROW_COUNT()) AS result;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_clean_orphaned_data` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` PROCEDURE `sp_clean_orphaned_data`()
BEGIN
    DELETE was FROM work_author_summary was LEFT JOIN works w ON was.work_id = w.id WHERE w.id IS NULL;
    DELETE a FROM authorships a LEFT JOIN works w ON a.work_id = w.id LEFT JOIN persons p ON a.person_id = p.id WHERE w.id IS NULL OR p.id IS NULL;
    SELECT 'Limpeza de dados órfãos concluída.' AS result;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_clean_orphaned_persons` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_clean_orphaned_persons`()
BEGIN
    
    
    DELETE p FROM persons p
    LEFT JOIN authorships a ON p.id = a.person_id
    WHERE a.work_id IS NULL;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_clean_split_compound_persons` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_clean_split_compound_persons`()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE old_person_id INT;
    DECLARE multi_name_str VARCHAR(512);
    DECLARE single_name VARCHAR(255);
    DECLARE remaining_names TEXT;
    DECLARE new_person_id INT;
    DECLARE work_id_val INT;

    DECLARE cur CURSOR FOR SELECT id, preferred_name FROM persons WHERE preferred_name LIKE '%,%';
    DECLARE works_cursor CURSOR FOR SELECT work_id FROM authorships WHERE person_id = old_person_id;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    OPEN cur;
    read_loop: LOOP
        FETCH cur INTO old_person_id, multi_name_str;
        IF done THEN LEAVE read_loop; END IF;

        START TRANSACTION;
        SET remaining_names = multi_name_str;

        WHILE LENGTH(remaining_names) > 0 DO
            SET single_name = TRIM(SUBSTRING_INDEX(remaining_names, ',', 1));
            IF LOCATE(',', remaining_names) > 0 THEN
                SET remaining_names = TRIM(SUBSTRING(remaining_names, LOCATE(',', remaining_names) + 1));
            ELSE
                SET remaining_names = '';
            END IF;

            IF LENGTH(single_name) > 0 THEN
                
                
                SELECT id INTO new_person_id FROM persons 
                WHERE preferred_name = single_name COLLATE utf8mb4_unicode_ci 
                LIMIT 1;
                
                IF new_person_id IS NULL THEN
                    INSERT INTO persons (preferred_name) VALUES (single_name);
                    SET new_person_id = LAST_INSERT_ID();
                END IF;

                OPEN works_cursor;
                works_loop: LOOP
                    FETCH works_cursor INTO work_id_val;
                    IF done THEN
                        SET done = FALSE; 
                        LEAVE works_loop;
                    END IF;
                    INSERT IGNORE INTO authorships (work_id, person_id, role, position) VALUES (work_id_val, new_person_id, 'AUTHOR', 99);
                END LOOP works_loop;
                CLOSE works_cursor;
            END IF;
        END WHILE;
        DELETE FROM persons WHERE id = old_person_id;
        COMMIT;
    END LOOP;
    CLOSE cur;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_create_person_with_signatures` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_create_person_with_signatures`(
    IN p_preferred_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci, 
    IN p_orcid VARCHAR(20)
)
proc_main: BEGIN
    DECLARE v_person_id INT;

    IF p_preferred_name IS NULL OR TRIM(p_preferred_name) = '' THEN
        LEAVE proc_main;
    END IF;

    INSERT INTO persons (preferred_name, orcid, family_name, given_names)
    VALUES (
        p_preferred_name, 
        p_orcid, 
        fn_get_name_part_advanced(p_preferred_name, 'FAMILY'), 
        fn_get_name_part_advanced(p_preferred_name, 'GIVEN')
    );
    SET v_person_id = LAST_INSERT_ID();

    CALL sp_populate_person_signatures_for_id(v_person_id);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_deduplicate_persons` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_deduplicate_persons`()
proc_main: BEGIN
    TRUNCATE TABLE temp_person_merge_pairs;

    
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_cleaned_persons (
        id INT PRIMARY KEY,
        cleaned_preferred_name VARCHAR(500),
        cleaned_orcid VARCHAR(20),
        cleaned_scopus_id VARCHAR(50),
        cleaned_lattes_id VARCHAR(20),
        INDEX idx_cleaned_name (cleaned_preferred_name),
        INDEX idx_cleaned_orcid (cleaned_orcid),
        INDEX idx_cleaned_scopus (cleaned_scopus_id),
        INDEX idx_cleaned_lattes (cleaned_lattes_id)
    );
    TRUNCATE TABLE temp_cleaned_persons;
    INSERT INTO temp_cleaned_persons (id, cleaned_preferred_name, cleaned_orcid, cleaned_scopus_id, cleaned_lattes_id)
    SELECT 
        id,
        clean_person_name(preferred_name),
        clean_identifier(orcid),
        clean_identifier(scopus_id),
        clean_identifier(lattes_id)
    FROM persons;

    
    INSERT INTO temp_person_merge_pairs (primary_person_id, secondary_person_id)
    SELECT p1.id, p2.id
    FROM temp_cleaned_persons p1
    JOIN temp_cleaned_persons p2 ON p1.id < p2.id
    WHERE (p1.cleaned_orcid = p2.cleaned_orcid AND p1.cleaned_orcid IS NOT NULL)
       OR (p1.cleaned_scopus_id = p2.cleaned_scopus_id AND p1.cleaned_scopus_id IS NOT NULL)
       OR (p1.cleaned_lattes_id = p2.cleaned_lattes_id AND p1.cleaned_lattes_id IS NOT NULL)
    
    ON DUPLICATE KEY UPDATE
        primary_person_id = LEAST(primary_person_id, VALUES(primary_person_id));

    
    INSERT INTO temp_person_merge_pairs (primary_person_id, secondary_person_id)
    SELECT MIN(p1.id), p2.id
    FROM persons p1
    JOIN persons p2 ON p1.normalized_name = p2.normalized_name AND p1.id < p2.id
    WHERE p1.normalized_name IS NOT NULL AND p1.normalized_name != ''
    GROUP BY p2.id
    
    ON DUPLICATE KEY UPDATE
        primary_person_id = LEAST(primary_person_id, VALUES(primary_person_id));

    DROP TEMPORARY TABLE temp_cleaned_persons;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_disable_all_triggers` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_disable_all_triggers`()
BEGIN
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_trigger_definitions (
        trigger_name VARCHAR(64),
        event_manipulation VARCHAR(6),
        event_object_table VARCHAR(64),
        action_timing VARCHAR(6),
        sql_mode TEXT,
        definer TEXT,
        action_statement LONGTEXT
    );
    TRUNCATE TABLE temp_trigger_definitions;

    INSERT INTO temp_trigger_definitions
    SELECT 
        TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE,
        ACTION_TIMING, SQL_MODE, DEFINER, ACTION_STATEMENT
    FROM information_schema.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE();

    BLOCK1: BEGIN
        DECLARE done INT DEFAULT FALSE;
        DECLARE v_trigger_name VARCHAR(64);
        DECLARE cur CURSOR FOR SELECT trigger_name FROM temp_trigger_definitions;
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
        OPEN cur;
        read_loop: LOOP
            FETCH cur INTO v_trigger_name;
            IF done THEN LEAVE read_loop; END IF;
            SET @drop_sql = CONCAT('DROP TRIGGER IF EXISTS `', v_trigger_name, '`');
            PREPARE stmt FROM @drop_sql;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
        END LOOP;
        CLOSE cur;
    END BLOCK1;
    
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_enable_all_triggers` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_enable_all_triggers`()
BEGIN
    BLOCK2: BEGIN
        DECLARE done INT DEFAULT FALSE;
        DECLARE v_trigger_name, v_event, v_table_name, v_timing, v_definer, v_sql_mode TEXT;
        DECLARE v_action LONGTEXT;
        DECLARE cur CURSOR FOR SELECT trigger_name, event_manipulation, event_object_table, action_timing, definer, sql_mode, action_statement FROM temp_trigger_definitions;
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
        OPEN cur;
        read_loop: LOOP
            FETCH cur INTO v_trigger_name, v_event, v_table_name, v_timing, v_definer, v_sql_mode, v_action;
            IF done THEN LEAVE read_loop; END IF;
            SET @create_sql = CONCAT(
                'CREATE DEFINER=', v_definer,
                ' TRIGGER `', v_trigger_name, '` ',
                v_timing, ' ', v_event,
                ' ON `', v_table_name, '` FOR EACH ROW ',
                v_action
            );
            PREPARE stmt FROM @create_sql;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
        END LOOP;
        CLOSE cur;
    END BLOCK2;
    DROP TEMPORARY TABLE IF EXISTS temp_trigger_definitions;
    
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_execute_organization_merge` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_execute_organization_merge`()
BEGIN DECLARE v_batch_size INT DEFAULT 1000;

DECLARE v_rows_affected INT;

CREATE TEMPORARY TABLE IF NOT EXISTS
  temp_org_batch (
    primary_org_id INT,
    secondary_org_id INT,
    PRIMARY KEY (secondary_org_id)
  );

CREATE TEMPORARY TABLE IF NOT EXISTS
  temp_org_keys_to_transfer (
    primary_org_id INT,
    secondary_org_id INT,
    ror_id VARCHAR(20),
    wikidata_id VARCHAR(20),
    openalex_id VARCHAR(50),
    mag_id VARCHAR(50),
    url VARCHAR(512),
    PRIMARY KEY (secondary_org_id)
  );

REPEAT
TRUNCATE TABLE
  temp_org_batch;

TRUNCATE TABLE
  temp_org_keys_to_transfer;

INSERT INTO
  temp_org_batch (primary_org_id, secondary_org_id)
SELECT
  primary_org_id,
  secondary_org_id
FROM
  temp_organization_merge_pairs
LIMIT
  v_batch_size;

SET
  v_rows_affected = FOUND_ROWS();

IF v_rows_affected > 0 THEN
START TRANSACTION;

INSERT INTO
  temp_org_keys_to_transfer (
    primary_org_id,
    secondary_org_id,
    ror_id,
    wikidata_id,
    openalex_id,
    mag_id,
    url
  )
SELECT
  o_primary.id,
  o_secondary.id,
  CASE
    WHEN o_primary.ror_id IS NULL THEN o_secondary.ror_id
    ELSE NULL
  END,
  CASE
    WHEN o_primary.wikidata_id IS NULL THEN o_secondary.wikidata_id
    ELSE NULL
  END,
  CASE
    WHEN o_primary.openalex_id IS NULL THEN o_secondary.openalex_id
    ELSE NULL
  END,
  CASE
    WHEN o_primary.mag_id IS NULL THEN o_secondary.mag_id
    ELSE NULL
  END,
  CASE
    WHEN o_primary.url IS NULL THEN o_secondary.url
    ELSE NULL
  END
FROM
  organizations o_primary
  JOIN temp_org_batch t ON o_primary.id = t.primary_org_id
  JOIN organizations o_secondary ON o_secondary.id = t.secondary_org_id;

UPDATE
  organizations o
  JOIN temp_org_keys_to_transfer temp ON o.id = temp.secondary_org_id
SET
  o.ror_id = NULL,
  o.wikidata_id = NULL,
  o.openalex_id = NULL,
  o.mag_id = NULL;

UPDATE
  organizations o
  JOIN temp_org_keys_to_transfer temp ON o.id = temp.primary_org_id
SET
  o.ror_id = COALESCE(o.ror_id, temp.ror_id),
  o.wikidata_id = COALESCE(o.wikidata_id, temp.wikidata_id),
  o.openalex_id = COALESCE(o.openalex_id, temp.openalex_id),
  o.mag_id = COALESCE(o.mag_id, temp.mag_id),
  o.url = COALESCE(o.url, temp.url);

UPDATE IGNORE
  authorships a
  JOIN temp_org_batch t ON a.affiliation_id = t.secondary_org_id
SET
  a.affiliation_id = t.primary_org_id;

UPDATE IGNORE
  funding f
  JOIN temp_org_batch t ON f.funder_id = t.secondary_org_id
SET
  f.funder_id = t.primary_org_id;

UPDATE IGNORE
  programs p
  JOIN temp_org_batch t ON p.institution_id = t.secondary_org_id
SET
  p.institution_id = t.primary_org_id;

UPDATE IGNORE
  publications pub
  JOIN temp_org_batch t ON pub.publisher_id = t.secondary_org_id
SET
  pub.publisher_id = t.primary_org_id;

UPDATE IGNORE
  venues v
  JOIN temp_org_batch t ON v.publisher_id = t.secondary_org_id
SET
  v.publisher_id = t.primary_org_id;

DELETE o
FROM
  organizations o
  JOIN temp_org_batch t ON o.id = t.secondary_org_id;

DELETE t_main
FROM
  temp_organization_merge_pairs t_main
  JOIN temp_org_batch t_batch ON t_main.secondary_org_id = t_batch.secondary_org_id;

COMMIT;

END IF;

UNTIL v_rows_affected = 0
END
REPEAT;

DROP TEMPORARY TABLE IF EXISTS
  temp_org_batch;

DROP TEMPORARY TABLE IF EXISTS
  temp_org_keys_to_transfer;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_find_duplicate_organizations` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_find_duplicate_organizations`()
BEGIN
    TRUNCATE TABLE temp_organization_merge_pairs;

    
    INSERT INTO temp_organization_merge_pairs (primary_org_id, secondary_org_id)
    SELECT MIN(o1.id), o2.id
    FROM organizations o1
    JOIN organizations o2 ON o1.standardized_name = o2.standardized_name AND o1.id < o2.id
    GROUP BY o2.id
    ON DUPLICATE KEY UPDATE primary_org_id = LEAST(primary_org_id, VALUES(primary_org_id));

    
    INSERT INTO temp_organization_merge_pairs (primary_org_id, secondary_org_id)
    SELECT
        MIN(o1.id) as primary_id,
        o2.id as secondary_id
    FROM organizations o1
    JOIN organizations o2 ON extract_university_base_name(o1.name) = extract_university_base_name(o2.name)
                         AND o1.id < o2.id
                         AND o1.type = 'UNIVERSITY'
                         AND o2.type = 'UNIVERSITY'
    GROUP BY
        o2.id
    ON DUPLICATE KEY UPDATE primary_org_id = LEAST(primary_org_id, VALUES(primary_org_id));
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_fix_merged_work` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_fix_merged_work`(IN p_work_id INT)
BEGIN
    
    DECLARE v_publication_id_to_move INT;
    DECLARE v_first_publication_id INT;
    DECLARE v_new_work_id INT;
    DECLARE v_unmerged_count INT DEFAULT 0;
    DECLARE v_done INT DEFAULT FALSE;

    
    
    DECLARE cur_publications_to_move CURSOR FOR
        SELECT id
        FROM publications
        WHERE work_id = p_work_id AND id != v_first_publication_id;

    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

    
    START TRANSACTION;

    
    SELECT MIN(id) INTO v_first_publication_id
    FROM publications
    WHERE work_id = p_work_id;

    
    OPEN cur_publications_to_move;

    move_loop: LOOP
        FETCH cur_publications_to_move INTO v_publication_id_to_move;
        IF v_done THEN
            LEAVE move_loop;
        END IF;

        
        
        INSERT INTO works (title, subtitle, abstract, work_type, language, reference_count)
        SELECT title, subtitle, abstract, work_type, language, reference_count
        FROM works WHERE id = p_work_id;

        
        SET v_new_work_id = LAST_INSERT_ID();

        
        UPDATE publications SET work_id = v_new_work_id WHERE id = v_publication_id_to_move;

        
        
        INSERT INTO authorships (work_id, person_id, affiliation_id, role, `position`, is_corresponding)
        SELECT v_new_work_id, person_id, affiliation_id, role, `position`, is_corresponding
        FROM authorships
        WHERE work_id = p_work_id;

        SET v_unmerged_count = v_unmerged_count + 1;

    END LOOP move_loop;
    CLOSE cur_publications_to_move;

    
    COMMIT;
    
    
    IF v_unmerged_count > 0 THEN
       SELECT CONCAT('Sucesso para work_id ', p_work_id, ': ', v_unmerged_count, ' publicações foram desmembradas.') AS status;
    END IF;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_generate_name_signature` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` PROCEDURE `sp_generate_name_signature`(
    IN p_dirty_name VARCHAR(500),
    OUT p_signature VARCHAR(100)
)
BEGIN
    SET p_signature = generate_name_signature(p_dirty_name);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_initiate_person_merge_batch` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` PROCEDURE `sp_initiate_person_merge_batch`(IN p_batch_size INT)
BEGIN
    DECLARE v_rows_affected INT DEFAULT 1;
    
    WHILE v_rows_affected > 0 DO
        
        CREATE TEMPORARY TABLE IF NOT EXISTS temp_current_batch (
            primary_person_id INT,
            secondary_person_id INT,
            PRIMARY KEY (secondary_person_id)
        );
        
        TRUNCATE TABLE temp_current_batch;
        
        
        INSERT INTO temp_current_batch (primary_person_id, secondary_person_id)
        SELECT primary_person_id, secondary_person_id
        FROM temp_person_merge_pairs
        LIMIT p_batch_size;
        
        SET v_rows_affected = FOUND_ROWS();
        
        IF v_rows_affected > 0 THEN
            
            
            
            
            DELETE FROM temp_person_merge_pairs
            WHERE secondary_person_id IN (
                SELECT secondary_person_id FROM temp_current_batch
            );
        END IF;
        
        DROP TEMPORARY TABLE IF EXISTS temp_current_batch;
    END WHILE;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_manage_person_signature` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_manage_person_signature`(
    IN p_person_id INT, 
    IN p_signature VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci
)
proc_main: BEGIN
    DECLARE v_signature_id INT;

    IF p_person_id IS NULL OR p_signature IS NULL OR TRIM(p_signature) = '' THEN
        LEAVE proc_main;
    END IF;

    INSERT IGNORE INTO signatures (signature) VALUES (p_signature);
    
    
    SELECT id INTO v_signature_id FROM signatures WHERE signature = p_signature LIMIT 1;

    INSERT IGNORE INTO persons_signatures (person_id, signature_id) VALUES (p_person_id, v_signature_id);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_merge_organizations_in_batches` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_merge_organizations_in_batches`()
BEGIN
    DECLARE v_batch_size INT DEFAULT 1000;
    DECLARE v_rows_affected INT;

    
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_org_batch (
        primary_org_id INT,
        secondary_org_id INT,
        PRIMARY KEY (secondary_org_id)
    );

    
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_org_keys_to_transfer (
        primary_org_id INT,
        secondary_org_id INT,
        ror_id VARCHAR(20),
        wikidata_id VARCHAR(20),
        openalex_id VARCHAR(50),
        mag_id VARCHAR(50),
        url VARCHAR(512),
        PRIMARY KEY (secondary_org_id)
    );

    REPEAT
        
        TRUNCATE TABLE temp_org_batch;
        TRUNCATE TABLE temp_org_keys_to_transfer;

        
        INSERT INTO temp_org_batch (primary_org_id, secondary_org_id)
        SELECT primary_org_id, secondary_org_id
        FROM temp_organization_merge_pairs
        LIMIT v_batch_size;

        SET v_rows_affected = FOUND_ROWS();

        IF v_rows_affected > 0 THEN
            START TRANSACTION;

            
            INSERT INTO temp_org_keys_to_transfer (primary_org_id, secondary_org_id, ror_id, wikidata_id, openalex_id, mag_id, url)
            SELECT
                o_primary.id,
                o_secondary.id,
                CASE WHEN o_primary.ror_id IS NULL THEN o_secondary.ror_id ELSE NULL END,
                CASE WHEN o_primary.wikidata_id IS NULL THEN o_secondary.wikidata_id ELSE NULL END,
                CASE WHEN o_primary.openalex_id IS NULL THEN o_secondary.openalex_id ELSE NULL END,
                CASE WHEN o_primary.mag_id IS NULL THEN o_secondary.mag_id ELSE NULL END,
                CASE WHEN o_primary.url IS NULL THEN o_secondary.url ELSE NULL END
            FROM organizations o_primary
            JOIN temp_org_batch t ON o_primary.id = t.primary_org_id
            JOIN organizations o_secondary ON o_secondary.id = t.secondary_org_id;

            
            UPDATE organizations o
            JOIN temp_org_keys_to_transfer temp ON o.id = temp.secondary_org_id
            SET
                o.ror_id = NULL,
                o.wikidata_id = NULL,
                o.openalex_id = NULL,
                o.mag_id = NULL;

            
            UPDATE organizations o
            JOIN temp_org_keys_to_transfer temp ON o.id = temp.primary_org_id
            SET
                o.ror_id = COALESCE(o.ror_id, temp.ror_id),
                o.wikidata_id = COALESCE(o.wikidata_id, temp.wikidata_id),
                o.openalex_id = COALESCE(o.openalex_id, temp.openalex_id),
                o.mag_id = COALESCE(o.mag_id, temp.mag_id),
                o.url = COALESCE(o.url, temp.url);
            
            
            UPDATE IGNORE authorships a JOIN temp_org_batch t ON a.affiliation_id = t.secondary_org_id SET a.affiliation_id = t.primary_org_id;
            UPDATE IGNORE funding f JOIN temp_org_batch t ON f.funder_id = t.secondary_org_id SET f.funder_id = t.primary_org_id;
            UPDATE IGNORE programs p JOIN temp_org_batch t ON p.institution_id = t.secondary_org_id SET p.institution_id = t.primary_org_id;
            UPDATE IGNORE publications pub JOIN temp_org_batch t ON pub.publisher_id = t.secondary_org_id SET pub.publisher_id = t.primary_org_id;
            UPDATE IGNORE venues v JOIN temp_org_batch t ON v.publisher_id = t.secondary_org_id SET v.publisher_id = t.primary_org_id;

            
            DELETE o FROM organizations o JOIN temp_org_batch t ON o.id = t.secondary_org_id;
            
            
            DELETE t_main FROM temp_organization_merge_pairs t_main
            JOIN temp_org_batch t_batch ON t_main.secondary_org_id = t_batch.secondary_org_id;
            
            COMMIT;
        END IF;

    UNTIL v_rows_affected = 0 END REPEAT;

    DROP TEMPORARY TABLE IF EXISTS temp_org_batch;
    DROP TEMPORARY TABLE IF EXISTS temp_org_keys_to_transfer;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_merge_persons` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_merge_persons`(IN p_master_person_id INT, IN p_duplicate_person_id INT)
BEGIN
    
    
    IF (SELECT orcid FROM persons WHERE id = p_master_person_id) IS NOT NULL THEN
        UPDATE persons SET orcid = NULL WHERE id = p_duplicate_person_id AND orcid IS NOT NULL;
    END IF;

    
    IF (SELECT scopus_id FROM persons WHERE id = p_master_person_id) IS NOT NULL THEN
        UPDATE persons SET scopus_id = NULL WHERE id = p_duplicate_person_id AND scopus_id IS NOT NULL;
    END IF;

    START TRANSACTION;

    
    UPDATE persons p_master
    JOIN persons p_duplicate ON p_duplicate.id = p_duplicate_person_id
    SET
        p_master.orcid = COALESCE(p_master.orcid, p_duplicate.orcid),
        p_master.scopus_id = COALESCE(p_master.scopus_id, p_duplicate.scopus_id),
        p_master.is_verified = GREATEST(p_master.is_verified, p_duplicate.is_verified)
    WHERE p_master.id = p_master_person_id;
    
    
    UPDATE IGNORE authorships SET person_id = p_master_person_id WHERE person_id = p_duplicate_person_id;
    UPDATE IGNORE course_instructors SET person_id = p_master_person_id WHERE person_id = p_duplicate_person_id;
    UPDATE IGNORE person_match_log SET matched_person_id = p_master_person_id WHERE matched_person_id = p_duplicate_person_id;
    UPDATE IGNORE persons_signatures SET person_id = p_master_person_id WHERE person_id = p_duplicate_person_id;

    
    DELETE FROM persons WHERE id = p_duplicate_person_id;

    COMMIT;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_merge_persons_in_batches` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` PROCEDURE `sp_merge_persons_in_batches`()
BEGIN
    DECLARE v_batch_size INT DEFAULT 1000;
    DECLARE v_rows_affected INT;
    DECLARE v_continue BOOLEAN DEFAULT TRUE;

    CREATE TEMPORARY TABLE IF NOT EXISTS temp_batch (
        primary_person_id INT,
        secondary_person_id INT,
        PRIMARY KEY (secondary_person_id)
    );

    CREATE TEMPORARY TABLE IF NOT EXISTS temp_keys_to_transfer (
        primary_person_id INT,
        secondary_person_id INT,
        orcid VARCHAR(20),
        scopus_id VARCHAR(50),
        lattes_id VARCHAR(20),
        PRIMARY KEY (secondary_person_id)
    );

    REPEAT
        
        TRUNCATE TABLE temp_batch;
        TRUNCATE TABLE temp_keys_to_transfer;

        
        INSERT INTO temp_batch (primary_person_id, secondary_person_id)
        SELECT primary_person_id, secondary_person_id
        FROM temp_person_merge_pairs
        LIMIT v_batch_size;

        SET v_rows_affected = FOUND_ROWS();
        SET v_continue = (v_rows_affected > 0);

        IF v_continue THEN
            START TRANSACTION;

            
            INSERT INTO temp_keys_to_transfer (primary_person_id, secondary_person_id, orcid, scopus_id, lattes_id)
            SELECT
                p_primary.id,
                p_secondary.id,
                CASE WHEN p_primary.orcid IS NULL THEN p_secondary.orcid ELSE NULL END,
                CASE WHEN p_primary.scopus_id IS NULL THEN p_secondary.scopus_id ELSE NULL END,
                CASE WHEN p_primary.lattes_id IS NULL THEN p_secondary.lattes_id ELSE NULL END
            FROM persons p_primary
            JOIN temp_batch t ON p_primary.id = t.primary_person_id
            JOIN persons p_secondary ON p_secondary.id = t.secondary_person_id;

            
            UPDATE persons p
            JOIN temp_keys_to_transfer temp ON p.id = temp.secondary_person_id
            SET
                p.orcid = NULL,
                p.scopus_id = NULL,
                p.lattes_id = NULL;

            
            UPDATE persons p
            JOIN temp_keys_to_transfer temp ON p.id = temp.primary_person_id
            SET
                p.orcid = COALESCE(p.orcid, temp.orcid),
                p.scopus_id = COALESCE(p.scopus_id, temp.scopus_id),
                p.lattes_id = COALESCE(p.lattes_id, temp.lattes_id),
                p.is_verified = GREATEST(p.is_verified, 
                    (SELECT is_verified FROM persons WHERE id = temp.secondary_person_id));

            
            UPDATE IGNORE authorships a 
            JOIN temp_batch t ON a.person_id = t.secondary_person_id 
            SET a.person_id = t.primary_person_id;
            
            UPDATE IGNORE course_instructors ci 
            JOIN temp_batch t ON ci.person_id = t.secondary_person_id 
            SET ci.person_id = t.primary_person_id;
            
            UPDATE IGNORE persons_signatures ps 
            JOIN temp_batch t ON ps.person_id = t.secondary_person_id 
            SET ps.person_id = t.primary_person_id;

            
            DELETE FROM persons WHERE id IN (
                SELECT secondary_person_id FROM temp_batch
            );

            
            DELETE FROM temp_person_merge_pairs 
            WHERE secondary_person_id IN (
                SELECT secondary_person_id FROM temp_batch
            );

            COMMIT;
        END IF;

    UNTIL NOT v_continue END REPEAT;

    DROP TEMPORARY TABLE IF EXISTS temp_batch;
    DROP TEMPORARY TABLE IF EXISTS temp_keys_to_transfer;
    
    SELECT CONCAT('Merge concluído. Total processado: ', v_rows_affected) AS status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_merge_single_organization_pair` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_merge_single_organization_pair`(
    IN p_primary_org_id INT,    
    IN p_secondary_org_id INT   
)
BEGIN
    
    DECLARE v_primary_exists INT DEFAULT 0;
    DECLARE v_secondary_exists INT DEFAULT 0;

    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        
        RESIGNAL;
    END;

    
    IF p_primary_org_id IS NULL OR p_secondary_org_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Both primary and secondary IDs must be provided.';
    END IF;

    IF p_primary_org_id = p_secondary_org_id THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Primary and secondary IDs cannot be the same.';
    END IF;

    
    SELECT COUNT(*) INTO v_primary_exists FROM organizations WHERE id = p_primary_org_id;
    SELECT COUNT(*) INTO v_secondary_exists FROM organizations WHERE id = p_secondary_org_id;

    IF v_primary_exists = 0 OR v_secondary_exists = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'One or both organization IDs do not exist.';
    END IF;

    
    START TRANSACTION;

    
    UPDATE organizations o_primary
    JOIN organizations o_secondary ON o_secondary.id = p_secondary_org_id
    SET
        o_primary.ror_id = COALESCE(o_primary.ror_id, o_secondary.ror_id),
        o_primary.wikidata_id = COALESCE(o_primary.wikidata_id, o_secondary.wikidata_id),
        o_primary.openalex_id = COALESCE(o_primary.openalex_id, o_secondary.openalex_id),
        o_primary.mag_id = COALESCE(o_primary.mag_id, o_secondary.mag_id),
        o_primary.url = COALESCE(o_primary.url, o_secondary.url),
        o_primary.updated_at = NOW()
    WHERE o_primary.id = p_primary_org_id;

    
    UPDATE IGNORE authorships SET affiliation_id = p_primary_org_id WHERE affiliation_id = p_secondary_org_id;
    UPDATE IGNORE funding SET funder_id = p_primary_org_id WHERE funder_id = p_secondary_org_id;
    UPDATE IGNORE programs SET institution_id = p_primary_org_id WHERE institution_id = p_secondary_org_id;
    UPDATE IGNORE publications SET publisher_id = p_primary_org_id WHERE publisher_id = p_secondary_org_id;
    UPDATE IGNORE venues SET publisher_id = p_primary_org_id WHERE publisher_id = p_secondary_org_id;

    
    DELETE FROM organizations WHERE id = p_secondary_org_id;

    COMMIT;

    
    SELECT CONCAT('Successfully merged organization ID ', p_secondary_org_id, ' into ID ', p_primary_org_id) as Result;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_merge_works_by_title_authors` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_merge_works_by_title_authors`(IN p_batch_size INT)
BEGIN
    DECLARE v_rows_affected INT DEFAULT 1;
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_work_merge_pairs (primary_work_id INT, secondary_work_id INT, PRIMARY KEY(secondary_work_id));

    WHILE v_rows_affected > 0 DO
        TRUNCATE TABLE temp_work_merge_pairs;
        
        
        INSERT INTO temp_work_merge_pairs (primary_work_id, secondary_work_id)
        WITH WorkGroups AS (
            SELECT MIN(w.id) as primary_id, w.title_normalized, was.author_string
            FROM works w
            JOIN work_author_summary was ON w.id = was.work_id
            GROUP BY w.title_normalized, was.author_string
            HAVING COUNT(w.id) > 1
        )
        SELECT wg.primary_id, w.id
        FROM works w
        JOIN work_author_summary was ON w.id = was.work_id
        JOIN WorkGroups wg ON w.title_normalized = wg.title_normalized AND was.author_string = wg.author_string
        WHERE w.id != wg.primary_id
        LIMIT p_batch_size;
        
        SET v_rows_affected = FOUND_ROWS();

        IF v_rows_affected > 0 THEN
            CALL sp_run_pending_work_merges();
        END IF;
    END WHILE;
    
    DROP TEMPORARY TABLE temp_work_merge_pairs;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_populate_organization_semantic_keys` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_populate_organization_semantic_keys`()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_org_id INT;
    DECLARE v_standardized_name TEXT;
    DECLARE v_cleaned_name TEXT;
    DECLARE v_sorted_key TEXT;
    DECLARE org_cursor CURSOR FOR SELECT id, standardized_name FROM organizations;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_word_processing (word VARCHAR(100));
    
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_numbers (n INT PRIMARY KEY);
    
    IF (SELECT COUNT(*) FROM temp_numbers) = 0 THEN
        INSERT INTO temp_numbers (n)
        SELECT a.N + b.N * 10 + 1
        FROM
            (SELECT 0 AS N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a,
            (SELECT 0 AS N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b; 
    END IF;

    OPEN org_cursor;
    read_loop: LOOP
        FETCH org_cursor INTO v_org_id, v_standardized_name;
        IF done THEN LEAVE read_loop; END IF;

        
        TRUNCATE TABLE temp_word_processing;
        SET v_sorted_key = NULL; 
        SET v_cleaned_name = v_standardized_name; 

        IF v_cleaned_name IS NOT NULL AND TRIM(v_cleaned_name) != '' THEN
            
            
            SET v_cleaned_name = REGEXP_REPLACE(v_cleaned_name, '[[:punct:][:cntrl:]]', ' ');
            
            
            
            SET v_cleaned_name = REGEXP_REPLACE(v_cleaned_name, '\\s+', ' ');
            SET v_cleaned_name = TRIM(v_cleaned_name); 

            
            IF v_cleaned_name != '' THEN
                
                INSERT INTO temp_word_processing (word)
                SELECT SUBSTRING_INDEX(SUBSTRING_INDEX(v_cleaned_name, ' ', n.n), ' ', -1) AS word
                FROM temp_numbers n
                WHERE n.n <= (LENGTH(v_cleaned_name) - LENGTH(REPLACE(v_cleaned_name, ' ', '')) + 1);

                
                SELECT GROUP_CONCAT(wp.word ORDER BY wp.word SEPARATOR ' ')
                INTO v_sorted_key
                FROM temp_word_processing wp
                LEFT JOIN subject_stoplist sw ON wp.word = sw.token
                WHERE sw.token IS NULL 
                  AND wp.word IS NOT NULL AND wp.word != ''; 

                
                
                IF v_sorted_key = '' THEN
                    SET v_sorted_key = NULL;
                END IF;
            END IF; 
        END IF; 

        
        UPDATE organizations SET semantic_key = v_sorted_key WHERE id = v_org_id;

    END LOOP;
    CLOSE org_cursor;

    
    DROP TEMPORARY TABLE IF EXISTS temp_word_processing;
    DROP TEMPORARY TABLE IF EXISTS temp_numbers;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_populate_person_signatures_for_id` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_populate_person_signatures_for_id`(IN p_person_id INT)
proc_main: BEGIN
    DECLARE v_preferred_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;
    DECLARE v_given_names VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;
    DECLARE v_family_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;
    DECLARE v_signature VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;

    IF p_person_id IS NULL THEN
        LEAVE proc_main;
    END IF;

    SELECT preferred_name, given_names, family_name INTO v_preferred_name, v_given_names, v_family_name
    FROM persons WHERE id = p_person_id LIMIT 1;

    IF v_preferred_name IS NOT NULL THEN
        SET v_signature = generate_name_signature(v_preferred_name);
        IF v_signature IS NOT NULL THEN
            CALL sp_manage_person_signature(p_person_id, v_signature);
        END IF;
    END IF;

    IF v_given_names IS NOT NULL AND v_family_name IS NOT NULL THEN
        SET v_signature = CONCAT(LEFT(v_given_names, 1), v_family_name);
        SET v_signature = LOWER(REPLACE(v_signature, ' ', ''));
        IF v_signature IS NOT NULL THEN
            CALL sp_manage_person_signature(p_person_id, v_signature);
        END IF;
    END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_populate_signatures` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_populate_signatures`()
BEGIN
    DECLARE v_done INT DEFAULT FALSE;
    DECLARE v_person_id INT;
    
    DECLARE v_preferred_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;
    
    DECLARE v_signature VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;
    DECLARE v_processed INT DEFAULT 0;
    DECLARE v_skipped INT DEFAULT 0;
    DECLARE v_total INT;
    
    DECLARE person_cursor CURSOR FOR
        SELECT id, preferred_name 
        FROM persons 
        WHERE preferred_name IS NOT NULL 
        AND TRIM(preferred_name) != ''
        ORDER BY id;
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1
            @sqlstate = RETURNED_SQLSTATE, 
            @errno = MYSQL_ERRNO, 
            @text = MESSAGE_TEXT;
        INSERT INTO processing_log (entity_type, entity_id, action, status, error_message)
        VALUES ('ERROR', v_person_id, 'populate_signatures', 'ERROR', 
                LEFT(CONCAT('ERRO: ', @errno, ' - ', LEFT(@text, 400)), 500));
        ROLLBACK;
        RESIGNAL;
    END;
    
    SELECT COUNT(*) INTO v_total
    FROM persons 
    WHERE preferred_name IS NOT NULL 
    AND TRIM(preferred_name) != '';
    
    INSERT INTO processing_log (entity_type, entity_id, action, status, error_message)
    VALUES ('SYSTEM', 0, 'populate_signatures_start', 'PROCESSING', 
            CONCAT('Iniciando: ', v_total, ' pessoas'));
    
    OPEN person_cursor;
    
    process_loop: LOOP
        FETCH person_cursor INTO v_person_id, v_preferred_name;
        IF v_done THEN
            LEAVE process_loop;
        END IF;
        
        SET v_signature = generate_name_signature(v_preferred_name);
        
        IF v_signature IS NOT NULL AND v_signature != '' THEN
            START TRANSACTION;
            
            INSERT IGNORE INTO signatures (signature) VALUES (v_signature);
            
            
            INSERT INTO persons_signatures (person_id, signature_id)
            SELECT v_person_id, id FROM signatures WHERE signature = v_signature
            ON DUPLICATE KEY UPDATE signature_id = VALUES(signature_id);
            
            COMMIT;
            
            SET v_processed = v_processed + 1;
        ELSE
            SET v_skipped = v_skipped + 1;
        END IF;
        
        IF (v_processed + v_skipped) % 10000 = 0 THEN
            INSERT INTO processing_log (entity_type, entity_id, action, status, error_message)
            VALUES ('BATCH', v_processed + v_skipped, 'populate_progress', 'PROCESSING', 
                    CONCAT('Feitos: ', v_processed, ' Ignorados: ', v_skipped));
        END IF;
        
    END LOOP;
    
    CLOSE person_cursor;
    
    INSERT INTO processing_log (entity_type, entity_id, action, status, error_message)
    VALUES ('SYSTEM', 0, 'populate_complete', 'SUCCESS', 
            CONCAT('Concluido: ', v_processed, ' assinaturas'));
    
    SELECT 
        v_processed as processados,
        v_skipped as ignorados,
        v_total as total,
        CONCAT(ROUND((v_processed * 100.0 / v_total), 2), '%') as percentual_sucesso;
    
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_populate_sphinx_venues_summary` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` PROCEDURE `sp_populate_sphinx_venues_summary`()
BEGIN
    SET SESSION group_concat_max_len = 1000000;
    TRUNCATE TABLE `sphinx_venues_summary`;

    INSERT INTO `sphinx_venues_summary` (
        id, name, type, publisher_name, country_code, issn, eissn, 
        subjects_string, top_works_string, works_count, cited_by_count, 
        impact_factor, h_index, open_access_percentage
    )
    WITH VenueOA AS (
        
        SELECT venue_id, (SUM(open_access=1)*100.0/COUNT(*)) as oa_avg
        FROM publications GROUP BY venue_id
    ),
    VenueSubjectsAgg AS (
        SELECT ws.venue_id, GROUP_CONCAT(s.term ORDER BY ws.score DESC SEPARATOR '; ') AS subjects_str
        FROM (SELECT venue_id, subject_id, score, ROW_NUMBER() OVER (PARTITION BY venue_id ORDER BY score DESC) as rn FROM venue_subjects) ws
        JOIN subjects s ON ws.subject_id = s.id WHERE ws.rn <= 20 GROUP BY ws.venue_id
    ),
    VenueWorksAgg AS (
        SELECT venue_id, GROUP_CONCAT(title ORDER BY citation_count DESC SEPARATOR '"; "') AS works_str
        FROM (
            SELECT p.venue_id, w.title, w.citation_count,
                   ROW_NUMBER() OVER (PARTITION BY p.venue_id ORDER BY w.citation_count DESC) as rn
            FROM publications p JOIN works w ON p.work_id = w.id WHERE p.venue_id IS NOT NULL
        ) rw WHERE rn <= 5 GROUP BY venue_id
    )
    SELECT
        v.id, v.name, v.type, o.name, v.country_code, v.issn, v.eissn,
        vsa.subjects_str, vwa.works_str, 
        COALESCE(v.works_count, 0), COALESCE(v.cited_by_count, 0),
        v.impact_factor, v.h_index, COALESCE(voa.oa_avg, 0.00)
    FROM venues v
    LEFT JOIN organizations o ON v.publisher_id = o.id
    LEFT JOIN VenueOA voa ON v.id = voa.venue_id
    LEFT JOIN VenueSubjectsAgg vsa ON v.id = vsa.venue_id
    LEFT JOIN VenueWorksAgg vwa ON v.id = vwa.venue_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_prepare_organization_consolidation` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_prepare_organization_consolidation`()
BEGIN
    DECLARE v_duplicates INT;
    
    
    SELECT COUNT(*) INTO v_duplicates
    FROM (
        SELECT extract_university_base_name(name) as base_name, COUNT(*) as cnt
        FROM organizations
        WHERE type = 'UNIVERSITY'
        GROUP BY extract_university_base_name(name)
        HAVING cnt > 1
    ) dups;
    
    SELECT CONCAT('Encontrados ', v_duplicates, ' grupos de organizações duplicadas para consolidar') as status;
    
    
    SELECT 
        extract_university_base_name(name) as base_name,
        COUNT(*) as count,
        GROUP_CONCAT(DISTINCT name ORDER BY name SEPARATOR ' | ') as original_names,
        GROUP_CONCAT(id ORDER BY id) as ids
    FROM organizations
    WHERE type = 'UNIVERSITY'
    GROUP BY extract_university_base_name(name)
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 10;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_process_sphinx_queue` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`brVn0`@`%` PROCEDURE `sp_process_sphinx_queue`()
BEGIN
    DECLARE v_done INT DEFAULT FALSE;
    DECLARE v_queue_id INT;
    DECLARE v_work_id INT;
    DECLARE v_batch_count INT; 

    
    CREATE TEMPORARY TABLE IF NOT EXISTS `temp_sphinx_batch` (
        `id` INT PRIMARY KEY,
        `work_id` INT
    );

    
    process_loop: LOOP
        
        
        TRUNCATE TABLE `temp_sphinx_batch`;

        
        INSERT INTO `temp_sphinx_batch` (id, work_id)
        SELECT id, work_id
        FROM sphinx_queue
        WHERE status = 'pending'
        ORDER BY queued_at ASC
        LIMIT 100;  

        
        
        
        
        
        SELECT COUNT(*) INTO v_batch_count FROM `temp_sphinx_batch`;
        IF v_batch_count = 0 THEN
            LEAVE process_loop; 
        END IF;
        
        
        UPDATE sphinx_queue q
        JOIN `temp_sphinx_batch` t ON q.id = t.id
        SET q.status = 'processing', q.processed_at = NOW();

        
        BEGIN
            DECLARE cur_queue CURSOR FOR 
                SELECT id, work_id 
                FROM `temp_sphinx_batch`;
                
            DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

            OPEN cur_queue;
            
            
            SET v_done = FALSE; 

            read_loop: LOOP
                FETCH cur_queue INTO v_queue_id, v_work_id;
                IF v_done THEN
                    LEAVE read_loop;
                END IF;
                
                
                CALL sp_refresh_single_work_sphinx(v_work_id);
                
                
                UPDATE sphinx_queue 
                SET status = 'completed' 
                WHERE id = v_queue_id;
                
            END LOOP read_loop; 
            
            CLOSE cur_queue;
        END; 
    
    END LOOP process_loop; 

    
    DROP TEMPORARY TABLE `temp_sphinx_batch`;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_refresh_rule_map` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`brVn0`@`%` PROCEDURE `sp_refresh_rule_map`()
BEGIN
    TRUNCATE TABLE cache_rule_subject_map;
    
    
    INSERT INTO cache_rule_subject_map (rule_id, subject_id)
    SELECT r.id, s.id
    FROM venue_ranking_rules r
    JOIN subjects s ON s.normalized_term LIKE CONCAT('%', r.term_pattern, '%');
    
    SELECT CONCAT('Mapeamento atualizado. Assuntos conectados: ', ROW_COUNT()) as status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_refresh_single_work_sphinx` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`brVn0`@`%` PROCEDURE `sp_refresh_single_work_sphinx`(IN p_work_id INT)
BEGIN
    
    
    CALL sp_update_work_author_summary(p_work_id);
    CALL sp_update_work_subjects_summary(p_work_id);

    
    REPLACE INTO sphinx_works_summary 
        (id, title, subtitle, abstract, author_string, venue_name, doi, created_ts, `year`, work_type, `language`, open_access, peer_reviewed, subjects_string)
    WITH LatestPublication AS (
        SELECT
            p.work_id, p.doi, p.`year`, p.open_access, p.peer_reviewed, p.venue_id,
            ROW_NUMBER() OVER(PARTITION BY p.work_id ORDER BY p.`year` DESC, p.id DESC) as rn
        FROM publications p
        WHERE p.work_id = p_work_id
    )
    SELECT
        w.id, 
        w.title, 
        w.subtitle, 
        w.abstract, 
        was.author_string, 
        v.name AS venue_name, 
        lp.doi,
        UNIX_TIMESTAMP(w.created_at) AS created_ts, 
        COALESCE(lp.`year`, 0) as `year`, 
        w.work_type, 
        w.language,
        COALESCE(lp.open_access, 0) as open_access, 
        COALESCE(lp.peer_reviewed, 0) as peer_reviewed,
        wss.subjects_string 
    FROM works w
    LEFT JOIN work_author_summary was ON was.work_id = w.id
    LEFT JOIN LatestPublication lp ON lp.work_id = w.id AND lp.rn = 1
    LEFT JOIN venues v ON v.id = lp.venue_id
    LEFT JOIN work_subjects_summary wss ON wss.work_id = w.id 
    WHERE w.id = p_work_id;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_reindex_database` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` PROCEDURE `sp_reindex_database`()
BEGIN
    
    SET FOREIGN_KEY_CHECKS = 0;
    
    
    ANALYZE TABLE works;
    ANALYZE TABLE persons;
    ANALYZE TABLE organizations;
    ANALYZE TABLE publications;
    ANALYZE TABLE authorships;
    
    
    SET FOREIGN_KEY_CHECKS = 1;
    
    SELECT 'Reindexação concluída' AS status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_resolve_pending_citations` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_resolve_pending_citations`(IN p_citing_work_id INT)
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_cited_doi VARCHAR(255);
    DECLARE v_cited_work_id INT;
    DECLARE cur_unresolved CURSOR FOR
        SELECT cited_doi FROM unresolved_citations
        WHERE citing_work_id = p_citing_work_id AND status = 'PENDING';
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    OPEN cur_unresolved;
    read_loop: LOOP
        FETCH cur_unresolved INTO v_cited_doi;
        IF done THEN LEAVE read_loop; END IF;

        SELECT w.id INTO v_cited_work_id
        FROM works w
        JOIN publications p ON w.id = p.work_id
        WHERE p.doi = v_cited_doi
        LIMIT 1;

        IF v_cited_work_id IS NOT NULL THEN
            INSERT IGNORE INTO citations (citing_work_id, cited_work_id)
            VALUES (p_citing_work_id, v_cited_work_id);
            UPDATE unresolved_citations SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP
            WHERE citing_work_id = p_citing_work_id AND cited_doi = v_cited_doi;
        END IF;
    END LOOP;
    CLOSE cur_unresolved;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_run_full_recalculation` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_run_full_recalculation`()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE current_id INT;

    
    DECLARE cur_persons CURSOR FOR SELECT id FROM persons;
    DECLARE cur_organizations CURSOR FOR SELECT id FROM organizations;
    DECLARE cur_venues CURSOR FOR SELECT id FROM venues;
    DECLARE cur_works CURSOR FOR SELECT id FROM works;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    
    OPEN cur_persons;
    person_loop: LOOP
        FETCH cur_persons INTO current_id;
        IF done THEN LEAVE person_loop; END IF;
        CALL sp_update_person_stats(current_id);
        CALL sp_update_person_h_index(current_id); 
    END LOOP;
    CLOSE cur_persons;
    SET done = FALSE;

    
    OPEN cur_organizations;
    org_loop: LOOP
        FETCH cur_organizations INTO current_id;
        IF done THEN LEAVE org_loop; END IF;
        CALL sp_update_organization_stats(current_id);
    END LOOP;
    CLOSE cur_organizations;
    SET done = FALSE;

    
    OPEN cur_venues;
    venue_loop: LOOP
        FETCH cur_venues INTO current_id;
        IF done THEN LEAVE venue_loop; END IF;
        CALL sp_update_venue_stats(current_id);
    END LOOP;
    CLOSE cur_venues;
    SET done = FALSE;
    
    
    OPEN cur_works;
    work_loop: LOOP
        FETCH cur_works INTO current_id;
        IF done THEN LEAVE work_loop; END IF;
        CALL sp_update_work_author_summary(current_id);
        CALL sp_update_work_subjects_summary(current_id);
    END LOOP;
    CLOSE cur_works;

    SELECT 'Recalculação completa de todas as estatísticas e sumários concluída com sucesso.' AS final_status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_run_full_recalculation_optimized` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` PROCEDURE `sp_run_full_recalculation_optimized`()
BEGIN
    DECLARE v_total_persons INT;
    DECLARE v_total_orgs INT;
    DECLARE v_total_venues INT;
    DECLARE v_total_works INT;
    DECLARE v_batch_size INT DEFAULT 1000;
    DECLARE v_offset INT DEFAULT 0;
    
    
    SELECT COUNT(*) INTO v_total_persons FROM persons;
    SELECT COUNT(*) INTO v_total_orgs FROM organizations;
    SELECT COUNT(*) INTO v_total_venues FROM venues;
    SELECT COUNT(*) INTO v_total_works FROM works;
    
    
    INSERT INTO processing_log (entity_type, entity_id, action, status, error_message)
    VALUES ('SYSTEM', 0, 'full_recalc_start', 'PROCESSING', 
            CONCAT('Iniciando recálculo. Total: P=', v_total_persons, 
                   ' O=', v_total_orgs, ' V=', v_total_venues, ' W=', v_total_works));
    
    
    SET v_offset = 0;
    WHILE v_offset < v_total_works DO
        INSERT INTO work_author_summary (work_id, author_string, first_author_id)
        SELECT 
            w.id,
            (SELECT GROUP_CONCAT(p.preferred_name ORDER BY a2.position SEPARATOR '; ')
             FROM authorships a2 
             JOIN persons p ON a2.person_id = p.id
             WHERE a2.work_id = w.id AND a2.role = 'AUTHOR'),
            (SELECT a3.person_id 
             FROM authorships a3 
             WHERE a3.work_id = w.id AND a3.role = 'AUTHOR' 
             ORDER BY a3.position ASC LIMIT 1)
        FROM works w
        WHERE w.id BETWEEN v_offset AND v_offset + v_batch_size
        ON DUPLICATE KEY UPDATE
            author_string = VALUES(author_string),
            first_author_id = VALUES(first_author_id);
        
        SET v_offset = v_offset + v_batch_size;
    END WHILE;
    
    
    CALL sp_update_work_subjects_summary_all(); 
    
    
    CALL sp_update_all_sphinx_summaries();
    
    
    SET v_offset = 0;
    WHILE v_offset < v_total_persons DO
        UPDATE persons p
        JOIN (
            SELECT 
                a.person_id,
                COUNT(DISTINCT a.work_id) as total_works,
                SUM(w.citation_count) as total_citations,
                MIN(pub.min_year) as first_year,
                MAX(pub.max_year) as last_year,
                SUM(CASE WHEN a.is_corresponding = 1 THEN 1 ELSE 0 END) as corresponding_count
            FROM authorships a
            JOIN works w ON a.work_id = w.id
            LEFT JOIN (
                SELECT work_id, MIN(year) as min_year, MAX(year) as max_year
                FROM publications
                GROUP BY work_id
            ) pub ON w.id = pub.work_id
            WHERE a.person_id BETWEEN v_offset AND v_offset + v_batch_size
            GROUP BY a.person_id
        ) stats ON p.id = stats.person_id
        SET 
            p.total_works = COALESCE(stats.total_works, 0),
            p.total_citations = COALESCE(stats.total_citations, 0),
            p.first_publication_year = stats.first_year,
            p.latest_publication_year = stats.last_year,
            p.corresponding_author_count = COALESCE(stats.corresponding_count, 0);
        
        SET v_offset = v_offset + v_batch_size;
    END WHILE;
    
    
    INSERT INTO processing_log (entity_type, entity_id, action, status, error_message)
    VALUES ('SYSTEM', 0, 'full_recalc_complete', 'SUCCESS', 'Recálculo concluído com sucesso');
    
    SELECT 'Recálculo completo otimizado concluído' AS final_status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_run_pending_venue_merges` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_run_pending_venue_merges`()
BEGIN
    
    DELETE p_del
    FROM publications p_del
    JOIN temp_venue_merge_pairs t ON p_del.venue_id = t.secondary_id
    WHERE EXISTS (
        SELECT 1 FROM publications p_keep 
        WHERE p_keep.venue_id = t.primary_id 
          AND p_keep.work_id = p_del.work_id 
    );
    
    UPDATE publications p JOIN temp_venue_merge_pairs t ON p.venue_id = t.secondary_id SET p.venue_id = t.primary_id;
    
    DELETE v FROM venues v JOIN temp_venue_merge_pairs t ON v.id = t.secondary_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_run_pending_work_merges` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_run_pending_work_merges`()
BEGIN
    UPDATE IGNORE authorships t JOIN temp_work_merge_pairs p ON t.work_id = p.secondary_work_id SET t.work_id = p.primary_work_id;
    UPDATE IGNORE citations t JOIN temp_work_merge_pairs p ON t.citing_work_id = p.secondary_work_id SET t.citing_work_id = p.primary_work_id;
    UPDATE IGNORE citations t JOIN temp_work_merge_pairs p ON t.cited_work_id = p.secondary_work_id SET t.cited_work_id = p.primary_work_id;
    UPDATE IGNORE publications t JOIN temp_work_merge_pairs p ON t.work_id = p.secondary_work_id SET t.work_id = p.primary_work_id;
    
    
    DELETE w FROM works w JOIN temp_work_merge_pairs p ON w.id = p.secondary_work_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_safe_maintenance` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_safe_maintenance`()
BEGIN
    DECLARE start_time DATETIME DEFAULT NOW();
    
    
    CALL sp_prepare_organization_consolidation();
    
    
    
    
    SELECT 
        'Manutenção segura executada com sucesso' as result,
        TIMESTAMPDIFF(SECOND, start_time, NOW()) as duration_seconds;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_test_system` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_test_system`()
BEGIN
    SELECT 
        'Sistema funcionando corretamente' as status,
        NOW() as tested_at,
        generate_name_signature('Hans van der Berg') as teste_assinatura;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_10yr_impact_factors` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`brVn0`@`%` PROCEDURE `sp_update_10yr_impact_factors`()
BEGIN
    DECLARE v_reference_year INT;
    
    
    SET v_reference_year = YEAR(CURDATE()) - 1;

    
    UPDATE venues v
    SET 
        impact_factor = fn_calculate_10yr_impact_factor(v.id, v_reference_year),
        updated_at = NOW()
    WHERE 
        
        EXISTS (
            SELECT 1 
            FROM publications p 
            WHERE p.venue_id = v.id 
              AND p.year BETWEEN (v_reference_year - 10) AND (v_reference_year - 1)
        );

    SELECT 
        ROW_COUNT() as venues_updated, 
        v_reference_year as calculation_year,
        'Success (10-year window)' as status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_affected_work_summaries` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_update_affected_work_summaries`(IN p_person_id INT)
proc_main: BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_work_id INT;
    DECLARE work_cursor CURSOR FOR SELECT DISTINCT work_id FROM authorships WHERE person_id = p_person_id;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    IF p_person_id IS NULL THEN
        LEAVE proc_main;
    END IF;

    OPEN work_cursor;
    update_loop: LOOP
        FETCH work_cursor INTO v_work_id;
        IF done THEN LEAVE update_loop; END IF;
        CALL sp_update_work_author_summary(v_work_id);
    END LOOP;
    CLOSE work_cursor;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_all_sphinx_summaries` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`brVn0`@`%` PROCEDURE `sp_update_all_sphinx_summaries`()
BEGIN
    
    CALL sp_update_work_author_summary_all();

    
    CALL sp_populate_sphinx_venues_summary();

    
    CALL sp_update_work_subjects_summary_all();

    
    CALL sp_update_works_summary();

    
    CALL sp_update_persons_summary();

    
    SELECT 'Todas as tabelas de sumário para o Sphinx foram atualizadas com sucesso.' AS status;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_file_access_stats` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_update_file_access_stats`(IN p_publication_id INT, IN p_file_id INT)
BEGIN
    UPDATE publication_files 
    SET 
        access_count = access_count + 1,
        last_accessed = NOW()
    WHERE publication_id = p_publication_id AND file_id = p_file_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_organization_stats` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` PROCEDURE `sp_update_organization_stats`(IN p_organization_id INT)
proc_main: BEGIN
    DECLARE v_publication_count INT;
    DECLARE v_researcher_count INT;
    DECLARE v_total_citations INT;
    DECLARE v_open_access_count INT;

    IF p_organization_id IS NULL THEN LEAVE proc_main; END IF;

    
    SELECT COUNT(DISTINCT person_id) INTO v_researcher_count 
    FROM authorships WHERE affiliation_id = p_organization_id;

    
    SELECT 
        COUNT(id), 
        SUM(citation_count),
        SUM(is_oa)
    INTO v_publication_count, v_total_citations, v_open_access_count
    FROM (
        SELECT w.id, w.citation_count, MAX(COALESCE(p.open_access, 0)) as is_oa
        FROM works w
        JOIN authorships a ON w.id = a.work_id
        LEFT JOIN publications p ON w.id = p.work_id
        WHERE a.affiliation_id = p_organization_id
        GROUP BY w.id
    ) unique_inst_works;

    UPDATE organizations SET
        publication_count = COALESCE(v_publication_count, 0),
        researcher_count = COALESCE(v_researcher_count, 0),
        total_citations = COALESCE(v_total_citations, 0),
        open_access_works_count = COALESCE(v_open_access_count, 0)
    WHERE id = p_organization_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_persons_summary` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_update_persons_summary`()
BEGIN
    INSERT INTO sphinx_persons_summary 
        (id, search_content, preferred_name, is_verified, total_works, latest_publication_year)
    SELECT
        p.id,
        CONCAT_WS(' ', p.preferred_name, s.signature) AS search_content,
        p.preferred_name,
        p.is_verified,
        p.total_works,
        p.latest_publication_year
    FROM
        persons p
    LEFT JOIN
        persons_signatures ps ON p.id = ps.person_id
    LEFT JOIN
        signatures s ON ps.signature_id = s.id
    ON DUPLICATE KEY UPDATE
        search_content = VALUES(search_content),
        preferred_name = VALUES(preferred_name),
        is_verified = VALUES(is_verified),
        total_works = VALUES(total_works),
        latest_publication_year = VALUES(latest_publication_year);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_person_details` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_update_person_details`(IN p_person_id INT)
proc_main: BEGIN
    DECLARE v_full_name VARCHAR(255);

    IF p_person_id IS NULL THEN
        LEAVE proc_main;
    END IF;

    SELECT preferred_name INTO v_full_name FROM persons WHERE id = p_person_id LIMIT 1;

    IF v_full_name IS NOT NULL AND TRIM(v_full_name) != '' THEN
        UPDATE persons SET
            family_name = fn_get_name_part_advanced(v_full_name, 'FAMILY'),
            given_names = fn_get_name_part_advanced(v_full_name, 'GIVEN')
        WHERE id = p_person_id;

        CALL sp_populate_person_signatures_for_id(p_person_id);
    END IF;

    CALL sp_update_person_stats(p_person_id);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_person_h_index` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` PROCEDURE `sp_update_person_h_index`(IN p_person_id INT)
proc_main: BEGIN
    DECLARE v_h_index INT DEFAULT 0;
    IF p_person_id IS NULL THEN LEAVE proc_main; END IF;

    WITH ranked_citations AS (
        SELECT ROW_NUMBER() OVER (ORDER BY COALESCE(w.citation_count, 0) DESC) AS rn,
               COALESCE(w.citation_count, 0) AS citations
        FROM authorships a
        JOIN works w ON a.work_id = w.id
        WHERE a.person_id = p_person_id AND a.role = 'AUTHOR'
    )
    SELECT COUNT(*) INTO v_h_index FROM ranked_citations WHERE citations >= rn;

    UPDATE persons SET h_index = v_h_index WHERE id = p_person_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_person_stats` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` PROCEDURE `sp_update_person_stats`(IN p_person_id INT)
proc_main: BEGIN
    DECLARE v_total_works INT;
    DECLARE v_total_citations INT;
    DECLARE v_first_year SMALLINT;
    DECLARE v_latest_year SMALLINT;
    DECLARE v_corresponding_count INT;

    IF p_person_id IS NULL THEN LEAVE proc_main; END IF;

    
    SELECT
        COUNT(DISTINCT a.work_id),
        SUM(t_works.cit),
        MIN(t_works.yr),
        MAX(t_works.yr),
        SUM(CASE WHEN a.is_corresponding = 1 THEN 1 ELSE 0 END)
    INTO v_total_works, v_total_citations, v_first_year, v_latest_year, v_corresponding_count
    FROM authorships a
    JOIN (
        
        SELECT w.id, w.citation_count as cit, MIN(p.year) as yr
        FROM works w
        LEFT JOIN publications p ON w.id = p.work_id
        GROUP BY w.id
    ) t_works ON a.work_id = t_works.id
    WHERE a.person_id = p_person_id;

    UPDATE persons SET
        total_works = COALESCE(v_total_works, 0),
        total_citations = COALESCE(v_total_citations, 0),
        first_publication_year = v_first_year,
        latest_publication_year = v_latest_year,
        corresponding_author_count = COALESCE(v_corresponding_count, 0)
    WHERE id = p_person_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_venue_stats` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` PROCEDURE `sp_update_venue_stats`(IN p_venue_id INT)
proc_main: BEGIN
    DECLARE v_works_count INT;
    DECLARE v_cited_by_count INT;
    DECLARE v_start_year SMALLINT;
    DECLARE v_end_year SMALLINT;

    IF p_venue_id IS NULL THEN LEAVE proc_main; END IF;

    SELECT
        COUNT(id),
        SUM(citation_count),
        MIN(first_year),
        MAX(first_year)
    INTO v_works_count, v_cited_by_count, v_start_year, v_end_year
    FROM (
        SELECT w.id, w.citation_count, MIN(p.year) as first_year
        FROM works w
        JOIN publications p ON w.id = p.work_id
        WHERE p.venue_id = p_venue_id
        GROUP BY w.id
    ) unique_venue_works;

    UPDATE venues SET
        works_count = COALESCE(v_works_count, 0),
        cited_by_count = COALESCE(v_cited_by_count, 0),
        coverage_start_year = v_start_year,
        coverage_end_year = v_end_year
    WHERE id = p_venue_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_works_summary` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_update_works_summary`()
BEGIN
    INSERT INTO sphinx_works_summary 
        (id, title, subtitle, abstract, author_string, venue_name, doi, created_ts, `year`, work_type, `language`, open_access, peer_reviewed, subjects_string)
    WITH LatestPublication AS (
        SELECT
            p.work_id, p.doi, p.`year`, p.open_access, p.peer_reviewed, p.venue_id,
            ROW_NUMBER() OVER(PARTITION BY p.work_id ORDER BY p.`year` DESC, p.id DESC) as rn
        FROM publications p
    )
    SELECT
        w.id, w.title, w.subtitle, w.abstract, was.author_string, v.name AS venue_name, lp.doi,
        UNIX_TIMESTAMP(w.created_at) AS created_ts, lp.`year`, w.work_type, w.language,
        lp.open_access, lp.peer_reviewed,
        
        wss.subjects_string 
    FROM works w
    LEFT JOIN work_author_summary was ON was.work_id = w.id
    LEFT JOIN LatestPublication lp ON lp.work_id = w.id AND lp.rn = 1
    LEFT JOIN venues v ON v.id = lp.venue_id
    
    LEFT JOIN work_subjects_summary wss ON wss.work_id = w.id 
    ON DUPLICATE KEY UPDATE
        title = VALUES(title), subtitle = VALUES(subtitle), abstract = VALUES(abstract), author_string = VALUES(author_string),
        venue_name = VALUES(venue_name), doi = VALUES(doi), `year` = VALUES(`year`), work_type = VALUES(work_type),
        `language` = VALUES(`language`), open_access = VALUES(open_access), peer_reviewed = VALUES(peer_reviewed),
        
        subjects_string = VALUES(subjects_string);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_work_author_summary` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_update_work_author_summary`(IN p_work_id INT)
proc_main: BEGIN
    
    DECLARE v_author_string MEDIUMTEXT;
    DECLARE v_first_author_id INT;
    DECLARE old_group_concat_max_len INT DEFAULT @@group_concat_max_len;

    IF p_work_id IS NULL THEN
        LEAVE proc_main;
    END IF;

    
    SET SESSION group_concat_max_len = 1000000;

    SELECT
        GROUP_CONCAT(p.preferred_name ORDER BY a.position ASC SEPARATOR '; '),
        (SELECT person_id FROM authorships WHERE work_id = p_work_id AND role = 'AUTHOR' ORDER BY position ASC LIMIT 1)
    INTO
        v_author_string,
        v_first_author_id
    FROM
        authorships a
    JOIN
        persons p ON a.person_id = p.id
    WHERE
        a.work_id = p_work_id
        AND a.role = 'AUTHOR';

    INSERT INTO work_author_summary (work_id, author_string, first_author_id)
    VALUES (p_work_id, v_author_string, v_first_author_id)
    ON DUPLICATE KEY UPDATE
        author_string = VALUES(author_string),
        first_author_id = VALUES(first_author_id);

    
    SET SESSION group_concat_max_len = old_group_concat_max_len;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_work_author_summary_all` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_update_work_author_summary_all`()
BEGIN
    
    INSERT INTO work_author_summary (work_id, author_string, first_author_id)
    
    WITH FirstAuthors AS (
        SELECT work_id, person_id
        FROM (
            SELECT work_id, person_id, ROW_NUMBER() OVER (PARTITION BY work_id ORDER BY position ASC) as rn
            FROM authorships
            WHERE role = 'AUTHOR'
        ) AS ranked_authors
        WHERE rn = 1
    )
    
    SELECT
        a.work_id,
        GROUP_CONCAT(p.preferred_name ORDER BY a.position ASC SEPARATOR '; '),
        fa.person_id
    FROM
        authorships a
    JOIN
        persons p ON a.person_id = p.id
    LEFT JOIN
        FirstAuthors fa ON a.work_id = fa.work_id
    WHERE 
        a.role = 'AUTHOR'
    GROUP BY
        a.work_id, fa.person_id
    ON DUPLICATE KEY UPDATE
        author_string = VALUES(author_string),
        first_author_id = VALUES(first_author_id);

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_work_subjects_summary` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_update_work_subjects_summary`(IN p_work_id INT)
BEGIN
    
    
    DECLARE v_subjects_string MEDIUMTEXT;

    
    SELECT GROUP_CONCAT(s.term ORDER BY s.term SEPARATOR '; ')
    INTO v_subjects_string
    FROM work_subjects ws
    JOIN subjects s ON ws.subject_id = s.id
    WHERE ws.work_id = p_work_id;

    
    
    INSERT INTO work_subjects_summary (work_id, subjects_string)
    VALUES (p_work_id, v_subjects_string)
    ON DUPLICATE KEY UPDATE subjects_string = v_subjects_string;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_work_subjects_summary_all` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_update_work_subjects_summary_all`()
BEGIN
    REPLACE INTO work_subjects_summary (work_id, subjects_string)
    SELECT
        ws.work_id,
        GROUP_CONCAT(s.term ORDER BY s.term SEPARATOR '; ')
    FROM
        work_subjects ws
    JOIN
        subjects s ON ws.subject_id = s.id
    INNER JOIN 
        works w ON ws.work_id = w.id
    GROUP BY
        ws.work_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_upsert_person_smart` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`%` PROCEDURE `sp_upsert_person_smart`(
    IN p_dirty_name VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci, 
    IN p_orcid VARCHAR(20), 
    IN p_source VARCHAR(50), 
    OUT p_person_id INT, 
    OUT p_action VARCHAR(20)
)
proc_main: BEGIN
    DECLARE v_existing_id INT DEFAULT NULL;
    DECLARE v_signature VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;

    IF p_dirty_name IS NULL OR TRIM(p_dirty_name) = '' THEN
        LEAVE proc_main;
    END IF;

    IF p_orcid IS NOT NULL AND TRIM(p_orcid) != '' THEN
        SELECT id INTO v_existing_id FROM persons WHERE orcid = p_orcid LIMIT 1;
        IF v_existing_id IS NOT NULL THEN
            SET p_person_id = v_existing_id;
            SET p_action = 'FOUND_BY_ORCID';
            LEAVE proc_main;
        END IF;
    END IF;

    
    SELECT id INTO v_existing_id FROM persons WHERE preferred_name = p_dirty_name LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
        SET p_person_id = v_existing_id;
        SET p_action = 'FOUND_EXACT';
        LEAVE proc_main;
    END IF;

    CALL sp_generate_name_signature(p_dirty_name, v_signature);
    
    IF v_signature IS NOT NULL AND TRIM(v_signature) != '' THEN
        
        SELECT p.id INTO v_existing_id
        FROM persons p
        JOIN persons_signatures ps ON p.id = ps.person_id
        JOIN signatures s ON ps.signature_id = s.id
        WHERE s.signature = v_signature
        LIMIT 1;
        
        IF v_existing_id IS NOT NULL THEN
            SET p_person_id = v_existing_id;
            SET p_action = 'FOUND_SIGNATURE';
            LEAVE proc_main;
        END IF;
    END IF;

    INSERT INTO persons (preferred_name, orcid, family_name, given_names)
    VALUES (
        p_dirty_name, 
        p_orcid, 
        fn_get_name_part_advanced(p_dirty_name, 'FAMILY'), 
        fn_get_name_part_advanced(p_dirty_name, 'GIVEN')
    );
    SET p_person_id = LAST_INSERT_ID();
    SET p_action = 'CREATED';

    IF v_signature IS NOT NULL AND TRIM(v_signature) != '' THEN
        CALL sp_manage_person_signature(p_person_id, v_signature);
    END IF;

    INSERT INTO person_match_log (input_name, source, matched_person_id, match_type)
    VALUES (p_dirty_name, p_source, p_person_id, p_action);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_validate_schema_fixes` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`pc`@`localhost` PROCEDURE `sp_validate_schema_fixes`()
BEGIN
    DECLARE v_error_count INT DEFAULT 0;
    DECLARE v_message TEXT;
    
    
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_test_table (id INT);
    DROP TEMPORARY TABLE IF EXISTS temp_test_table;
    
    SET v_message = '✓ Tabelas temporárias funcionando';
    SELECT v_message AS check_result;
    
    
    BEGIN
        DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
        BEGIN
            SET v_error_count = v_error_count + 1;
        END;
        
        
        CALL sp_generate_name_signature('John Doe', @test_sig);
        
        IF @test_sig IS NOT NULL THEN
            SET v_message = CONCAT('✓ Procedure sp_generate_name_signature: ', @test_sig);
        ELSE
            SET v_message = '✗ Procedure sp_generate_name_signature falhou';
            SET v_error_count = v_error_count + 1;
        END IF;
        
        SELECT v_message AS check_result;
    END;
    
    
    IF EXISTS (
        SELECT 1 FROM information_schema.statistics 
        WHERE table_name = 'authorships' AND index_name = 'idx_authorships_created_at'
    ) THEN
        SET v_message = '✓ Índice idx_authorships_created_at criado';
    ELSE
        SET v_message = '✗ Índice idx_authorships_created_at faltando';
        SET v_error_count = v_error_count + 1;
    END IF;
    
    SELECT v_message AS check_result;
    
    
    IF v_error_count = 0 THEN
        SELECT '✅ TODAS AS CORREÇÕES APLICADAS COM SUCESSO' AS final_status;
    ELSE
        SELECT CONCAT('⚠️ ', v_error_count, ' ERROS ENCONTRADOS. VERIFIQUE OS LOGS.') AS final_status;
    END IF;
    
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Final view structure for view `v_annual_stats`
--

/*!50001 DROP VIEW IF EXISTS `v_annual_stats`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_uca1400_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`pc`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_annual_stats` AS select `t_year`.`yr` AS `year`,count(distinct `pub`.`id`) AS `total_publications`,count(distinct `w`.`id`) AS `unique_works`,count(distinct case when `pub`.`open_access` = 1 then `pub`.`id` end) AS `open_access_count`,round(count(distinct case when `pub`.`open_access` = 1 then `pub`.`id` end) * 100.0 / count(distinct `pub`.`id`),2) AS `open_access_percentage`,count(distinct case when `w`.`work_type` = 'ARTICLE' then `w`.`id` end) AS `articles`,count(distinct case when `w`.`work_type` = 'BOOK' then `w`.`id` end) AS `books`,round(avg(`w`.`citation_count`),2) AS `avg_citations`,sum(`w`.`download_count`) AS `total_downloads`,count(distinct `a`.`affiliation_id`) AS `unique_organizations` from ((((select `publications`.`work_id` AS `work_id`,min(`publications`.`year`) AS `yr` from `publications` group by `publications`.`work_id`) `t_year` join `works` `w` on(`t_year`.`work_id` = `w`.`id`)) join `publications` `pub` on(`w`.`id` = `pub`.`work_id`)) left join `authorships` `a` on(`w`.`id` = `a`.`work_id`)) where `t_year`.`yr` between 1990 and year(curdate()) group by `t_year`.`yr` order by `t_year`.`yr` desc */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_collaborations`
--

/*!50001 DROP VIEW IF EXISTS `v_collaborations`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_uca1400_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`pc`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_collaborations` AS select least(`a1`.`person_id`,`a2`.`person_id`) AS `person1_id`,`p1`.`preferred_name` AS `person1_name`,greatest(`a1`.`person_id`,`a2`.`person_id`) AS `person2_id`,`p2`.`preferred_name` AS `person2_name`,count(distinct `a1`.`work_id`) AS `collaboration_count`,min(`py`.`min_yr`) AS `first_collaboration_year`,max(`py`.`max_yr`) AS `latest_collaboration_year`,round(avg(`w`.`citation_count`),2) AS `avg_citations_together` from (((((`authorships` `a1` join `authorships` `a2` on(`a1`.`work_id` = `a2`.`work_id` and `a1`.`person_id` < `a2`.`person_id`)) join `persons` `p1` on(`p1`.`id` = `a1`.`person_id`)) join `persons` `p2` on(`p2`.`id` = `a2`.`person_id`)) join `works` `w` on(`w`.`id` = `a1`.`work_id`)) join (select `publications`.`work_id` AS `work_id`,min(`publications`.`year`) AS `min_yr`,max(`publications`.`year`) AS `max_yr` from `publications` group by `publications`.`work_id`) `py` on(`w`.`id` = `py`.`work_id`)) group by least(`a1`.`person_id`,`a2`.`person_id`),`p1`.`preferred_name`,greatest(`a1`.`person_id`,`a2`.`person_id`),`p2`.`preferred_name` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_doi_venue_map`
--

/*!50001 DROP VIEW IF EXISTS `v_doi_venue_map`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_uca1400_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`pc`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_doi_venue_map` AS select `p`.`doi` AS `doi`,coalesce(`v`.`issn`,`v`.`eissn`) AS `identifier`,`p`.`venue_id` AS `venue_id` from (`publications` `p` left join `venues` `v` on(`v`.`id` = `p`.`venue_id`)) where `p`.`doi` is not null */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_institution_productivity`
--

/*!50001 DROP VIEW IF EXISTS `v_institution_productivity`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_uca1400_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`pc`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_institution_productivity` AS select `o`.`id` AS `id`,`o`.`name` AS `institution_name`,`o`.`type` AS `type`,`o`.`country_code` AS `country_code`,count(distinct `a`.`work_id`) AS `total_works`,count(distinct `a`.`person_id`) AS `unique_researchers`,count(distinct case when `open_works`.`is_oa` = 1 then `a`.`work_id` end) AS `open_access_works`,coalesce(sum(`distinct_works`.`cit`),0) AS `total_citations`,min(`py`.`min_yr`) AS `first_publication_year`,max(`py`.`max_yr`) AS `latest_publication_year` from ((((`organizations` `o` join `authorships` `a` on(`o`.`id` = `a`.`affiliation_id`)) join (select `works`.`id` AS `id`,`works`.`citation_count` AS `cit` from `works`) `distinct_works` on(`a`.`work_id` = `distinct_works`.`id`)) join (select `publications`.`work_id` AS `work_id`,min(`publications`.`year`) AS `min_yr`,max(`publications`.`year`) AS `max_yr` from `publications` group by `publications`.`work_id`) `py` on(`a`.`work_id` = `py`.`work_id`)) left join (select `publications`.`work_id` AS `work_id`,max(`publications`.`open_access`) AS `is_oa` from `publications` group by `publications`.`work_id`) `open_works` on(`a`.`work_id` = `open_works`.`work_id`)) group by `o`.`id` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_institution_productivity_optimized`
--

/*!50001 DROP VIEW IF EXISTS `v_institution_productivity_optimized`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_uca1400_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`pc`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_institution_productivity_optimized` AS select `o`.`id` AS `id`,`o`.`name` AS `institution_name`,`o`.`type` AS `type`,`o`.`country_code` AS `country_code`,count(distinct `a`.`work_id`) AS `total_works`,count(distinct `a`.`person_id`) AS `unique_researchers`,count(distinct case when `open_works`.`is_oa` = 1 then `a`.`work_id` end) AS `open_access_works`,coalesce(sum(`distinct_works`.`cit`),0) AS `total_citations`,min(`py`.`min_yr`) AS `first_publication_year`,max(`py`.`max_yr`) AS `latest_publication_year` from ((((`organizations` `o` join `authorships` `a` on(`o`.`id` = `a`.`affiliation_id`)) join (select `works`.`id` AS `id`,`works`.`citation_count` AS `cit` from `works`) `distinct_works` on(`a`.`work_id` = `distinct_works`.`id`)) join (select `publications`.`work_id` AS `work_id`,min(`publications`.`year`) AS `min_yr`,max(`publications`.`year`) AS `max_yr` from `publications` group by `publications`.`work_id` having min(`publications`.`year`) is not null) `py` on(`a`.`work_id` = `py`.`work_id`)) left join (select `publications`.`work_id` AS `work_id`,max(`publications`.`open_access`) AS `is_oa` from `publications` group by `publications`.`work_id`) `open_works` on(`a`.`work_id` = `open_works`.`work_id`)) where `a`.`affiliation_id` is not null group by `o`.`id`,`o`.`name`,`o`.`type`,`o`.`country_code` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_person_production`
--

/*!50001 DROP VIEW IF EXISTS `v_person_production`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_uca1400_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`pc`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_person_production` AS select `p`.`id` AS `id`,`p`.`preferred_name` AS `preferred_name`,`p`.`orcid` AS `orcid`,`p`.`is_verified` AS `is_verified`,count(distinct `a`.`work_id`) AS `total_works`,count(distinct case when `a`.`role` = 'AUTHOR' then `a`.`work_id` end) AS `works_as_author`,count(distinct case when `a`.`role` = 'EDITOR' then `a`.`work_id` end) AS `works_as_editor`,count(distinct case when `a`.`is_corresponding` = 1 then `a`.`work_id` end) AS `corresponding_author_count`,count(distinct case when `open_works`.`is_oa` = 1 then `a`.`work_id` end) AS `open_access_papers`,coalesce(sum(`distinct_works`.`cit`),0) AS `total_citations`,round(coalesce(avg(`distinct_works`.`cit`),0),2) AS `avg_citations_per_work`,max(`py`.`max_yr`) AS `latest_publication_year`,min(`py`.`min_yr`) AS `first_publication_year` from ((((`persons` `p` left join `authorships` `a` on(`p`.`id` = `a`.`person_id`)) left join (select `works`.`id` AS `id`,`works`.`citation_count` AS `cit` from `works`) `distinct_works` on(`a`.`work_id` = `distinct_works`.`id`)) left join (select `publications`.`work_id` AS `work_id`,min(`publications`.`year`) AS `min_yr`,max(`publications`.`year`) AS `max_yr` from `publications` group by `publications`.`work_id`) `py` on(`a`.`work_id` = `py`.`work_id`)) left join (select `publications`.`work_id` AS `work_id`,max(`publications`.`open_access`) AS `is_oa` from `publications` group by `publications`.`work_id`) `open_works` on(`a`.`work_id` = `open_works`.`work_id`)) group by `p`.`id` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_venue_ranking`
--

/*!50001 DROP VIEW IF EXISTS `v_venue_ranking`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_uca1400_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`pc`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_venue_ranking` AS select `p`.`venue_id` AS `venue_id`,`v`.`name` AS `venue_name`,`v`.`type` AS `venue_type`,count(distinct `p`.`work_id`) AS `total_works`,count(distinct `a`.`person_id`) AS `unique_authors`,min(`p`.`year`) AS `first_publication_year`,max(`p`.`year`) AS `latest_publication_year`,sum(case when `p`.`open_access` = 1 then 1 else 0 end) AS `open_access_works`,case when count(0) > 0 then round(sum(`p`.`open_access` = 1) * 100.0 / count(0),1) else NULL end AS `open_access_percentage` from ((`publications` `p` left join `venues` `v` on(`v`.`id` = `p`.`venue_id`)) left join `authorships` `a` on(`a`.`work_id` = `p`.`work_id`)) group by `p`.`venue_id`,`v`.`name`,`v`.`type` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_venue_ranking_final`
--

/*!50001 DROP VIEW IF EXISTS `v_venue_ranking_final`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_uca1400_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`pc`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_venue_ranking_final` AS select rank() over ( order by `v`.`total_score` desc,`v`.`snip_score` desc) AS `rank_position`,`v`.`name` AS `venue_name`,`v`.`type` AS `type`,`v`.`total_score` AS `total_score`,`v`.`subject_score` AS `pts_tematicos`,`v`.`snip_score` AS `pts_impacto`,`v`.`oa_score` AS `pts_open_access`,(select group_concat(distinct `r`.`term_pattern` separator ', ') from ((`venue_subjects` `vsub` join `cache_rule_subject_map` `map` on(`vsub`.`subject_id` = `map`.`subject_id`)) join `venue_ranking_rules` `r` on(`map`.`rule_id` = `r`.`id`)) where `vsub`.`venue_id` = `v`.`id` limit 5) AS `matched_topics` from `venues` `v` where `v`.`subject_score` > 0 order by `v`.`total_score` desc */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_works_by_signature`
--

/*!50001 DROP VIEW IF EXISTS `v_works_by_signature`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_uca1400_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`pc`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_works_by_signature` AS select `s`.`id` AS `signature_id`,`s`.`signature` AS `signature_text`,`ps`.`person_id` AS `person_id`,`p`.`preferred_name` AS `preferred_name`,`a`.`work_id` AS `work_id`,`w`.`title` AS `title`,`pub`.`year` AS `publication_year` from (((((`persons_signatures` `ps` join `signatures` `s` on(`s`.`id` = `ps`.`signature_id`)) join `persons` `p` on(`p`.`id` = `ps`.`person_id`)) join `authorships` `a` on(`a`.`person_id` = `ps`.`person_id`)) join `works` `w` on(`w`.`id` = `a`.`work_id`)) left join `publications` `pub` on(`pub`.`work_id` = `a`.`work_id`)) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-01-09 10:41:24
