/*M!999999\- enable the sandbox mode */ 
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authorships` (
  `work_id` int(11) NOT NULL,
  `person_id` int(11) NOT NULL,
  `is_corresponding` tinyint(1) DEFAULT 0,
  `affiliation_id` int(11) DEFAULT NULL,
  `role` enum('AUTHOR','EDITOR','TRANSLATOR','REVIEWER') NOT NULL DEFAULT 'AUTHOR',
  `position` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`work_id`,`person_id`,`role`),
  KEY `idx_authorships_affiliation_id` (`affiliation_id`),
  KEY `idx_position` (`position`),
  KEY `idx_authorships_person_role` (`person_id`,`role`),
  KEY `idx_authorships_work_position` (`work_id`,`position`),
  KEY `idx_authorships_work_role_position` (`work_id`,`role`,`position`),
  KEY `idx_role` (`role`),
  KEY `idx_authorships_created_at` (`created_at`),
  KEY `idx_authorships_work_person` (`work_id`,`person_id`),
  KEY `idx_authorships_person_work` (`person_id`,`work_id`),
  KEY `idx_authorships_person_role_position` (`person_id`,`role`,`position`),
  KEY `idx_authorships_affiliation_work_person` (`affiliation_id`,`work_id`,`person_id`),
  CONSTRAINT `authorships_ibfk_1` FOREIGN KEY (`work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE,
  CONSTRAINT `authorships_ibfk_2` FOREIGN KEY (`person_id`) REFERENCES `persons` (`id`) ON DELETE CASCADE,
  CONSTRAINT `authorships_ibfk_3` FOREIGN KEY (`affiliation_id`) REFERENCES `organizations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
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
) ENGINE=InnoDB AUTO_INCREMENT=11112 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `files` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `publication_id` int(11) NOT NULL,
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
  `file_format` enum('PDF','EPUB','MOBI','HTML','XML','DOCX','TXT','OTHER','VOR') NOT NULL,
  `pages` int(11) DEFAULT NULL,
  `language` char(3) DEFAULT NULL,
  `version` varchar(50) DEFAULT NULL,
  `content_version` varchar(20) DEFAULT NULL,
  `libgen_id` int(15) unsigned DEFAULT NULL,
  `scimag_id` int(15) unsigned DEFAULT NULL,
  `openacess_id` varchar(255) DEFAULT NULL,
  `best_oa_url` varchar(1024) DEFAULT NULL,
  `download_urls` longtext DEFAULT NULL,
  `torrent_info` longtext DEFAULT NULL,
  `external_metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `download_count` int(11) DEFAULT 0,
  `last_accessed` timestamp NULL DEFAULT NULL,
  `verification_status` enum('PENDING','VERIFIED','FAILED','CORRUPTED') DEFAULT 'PENDING',
  `last_verified` timestamp NULL DEFAULT NULL,
  `upload_date` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `file_role` enum('MAIN','SUPPLEMENT','COVER','PREVIEW') DEFAULT 'MAIN',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_md5_publication` (`md5`,`publication_id`),
  UNIQUE KEY `uq_sha256_pub` (`sha256`,`publication_id`),
  UNIQUE KEY `uq_libgen_pub` (`libgen_id`,`publication_id`),
  UNIQUE KEY `uq_scimag_pub` (`scimag_id`,`publication_id`),
  KEY `idx_format` (`file_format`),
  KEY `idx_size` (`file_size`),
  KEY `idx_upload_date` (`upload_date`),
  KEY `idx_verification` (`verification_status`,`last_verified`),
  KEY `idx_external_ids` (`libgen_id`,`scimag_id`),
  KEY `idx_sha1` (`sha1`),
  KEY `idx_crc32` (`crc32`),
  KEY `idx_btih` (`btih`),
  KEY `idx_ipfs_cid` (`ipfs_cid`),
  KEY `idx_files_id_openalex` (`openacess_id`),
  KEY `idx_files_content_version` (`content_version`),
  KEY `idx_files_publication_id` (`publication_id`),
  CONSTRAINT `fk_files_publication` FOREIGN KEY (`publication_id`) REFERENCES `publications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=54664713 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `funding` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `work_id` int(11) NOT NULL,
  `funder_id` int(11) NOT NULL,
  `grant_number` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_work_funder_grant` (`work_id`,`funder_id`,`grant_number`),
  KEY `idx_work` (`work_id`),
  KEY `idx_funder` (`funder_id`),
  KEY `idx_funding_work_funder` (`work_id`,`funder_id`),
  CONSTRAINT `funding_ibfk_1` FOREIGN KEY (`work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE,
  CONSTRAINT `funding_ibfk_2` FOREIGN KEY (`funder_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2487516 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `metrics_annual_summary` (
  `year` smallint(6) NOT NULL,
  `total_publications` bigint(20) NOT NULL DEFAULT 0,
  `unique_works` bigint(20) NOT NULL DEFAULT 0,
  `open_access_count` bigint(20) NOT NULL DEFAULT 0,
  `articles` bigint(20) NOT NULL DEFAULT 0,
  `books` bigint(20) NOT NULL DEFAULT 0,
  `avg_citations` decimal(10,2) NOT NULL DEFAULT 0.00,
  `unique_organizations` bigint(20) NOT NULL DEFAULT 0,
  `refreshed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `multi_manifestation_works` (
  `work_id` int(11) NOT NULL,
  `marked_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`work_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `organization_relationships` (
  `parent_id` int(11) NOT NULL,
  `child_id` int(11) NOT NULL,
  `relationship_type` enum('PARENT_CHILD','RELATED') NOT NULL,
  PRIMARY KEY (`parent_id`,`child_id`,`relationship_type`),
  KEY `idx_org_relationships_child` (`child_id`),
  CONSTRAINT `fk_org_relationships_child` FOREIGN KEY (`child_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_org_relationships_parent` FOREIGN KEY (`parent_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `organizations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(512) NOT NULL,
  `type` enum('UNIVERSITY','INSTITUTE','PUBLISHER','FUNDER','COMPANY','OTHER') NOT NULL,
  `city` varchar(100) DEFAULT NULL,
  `region` varchar(100) DEFAULT NULL,
  `latitude` decimal(9,6) DEFAULT NULL,
  `longitude` decimal(9,6) DEFAULT NULL,
  `geonames_id` varchar(20) DEFAULT NULL,
  `url` varchar(512) DEFAULT NULL,
  `ror_id` varchar(20) DEFAULT NULL,
  `cluster_key` varchar(100) DEFAULT NULL,
  `openalex_id` varchar(50) DEFAULT NULL,
  `country_code` char(2) DEFAULT NULL,
  `wikidata_id` varchar(20) DEFAULT NULL,
  `mag_id` varchar(50) DEFAULT NULL,
  `grid_id` varchar(20) DEFAULT NULL,
  `acronyms` longtext DEFAULT NULL,
  `semantic_key` varchar(512) DEFAULT NULL,
  `standardized_name` varchar(512) GENERATED ALWAYS AS (trim(lcase(`name`))) STORED,
  `alternative_names` longtext DEFAULT NULL,
  `total_citations` int(11) NOT NULL DEFAULT 0,
  `h_index` int(11) DEFAULT NULL,
  `i10_index` int(11) DEFAULT NULL,
  `openalex_type` varchar(20) DEFAULT NULL,
  `publication_count` int(11) NOT NULL DEFAULT 0,
  `researcher_count` int(11) NOT NULL DEFAULT 0,
  `open_access_works_count` int(11) NOT NULL DEFAULT 0,
  `2yr_mean_citedness` decimal(10,5) DEFAULT NULL,
  `unresolved_reason` enum('SUBENTITY','COMPOUND','OTHER') DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `status` enum('active','inactive','withdrawn') DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_name_type` (`name`(255),`type`),
  UNIQUE KEY `uq_org_ror_type` (`ror_id`,`type`),
  UNIQUE KEY `uq_org_wikidata_type` (`wikidata_id`,`type`),
  UNIQUE KEY `uq_org_openalex_type` (`openalex_id`,`type`),
  KEY `idx_type` (`type`),
  KEY `idx_country` (`country_code`),
  KEY `idx_ror` (`ror_id`),
  KEY `idx_organizations_type_country` (`type`,`country_code`),
  KEY `idx_organizations_name_country` (`name`(100),`country_code`),
  KEY `idx_organizations_publication_count` (`publication_count`),
  KEY `idx_organizations_researcher_count` (`researcher_count`),
  KEY `idx_semantic_key` (`semantic_key`),
  KEY `idx_org_grid` (`grid_id`),
  KEY `idx_organizations_total_citations` (`total_citations`),
  KEY `idx_organizations_h_index` (`h_index`),
  KEY `idx_organizations_i10_index` (`i10_index`),
  KEY `idx_org_unresolved_reason` (`unresolved_reason`),
  KEY `idx_org_stdname_type` (`standardized_name`(255),`type`),
  FULLTEXT KEY `ft_organizations_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=4618877 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `persons` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `signature_id` int(10) unsigned DEFAULT NULL,
  `preferred_name` varchar(255) NOT NULL,
  `family_name` varchar(255) DEFAULT NULL,
  `given_names` varchar(255) DEFAULT NULL,
  `scopus_id` varchar(50) DEFAULT NULL,
  `orcid` varchar(20) DEFAULT NULL,
  `lattes_id` varchar(20) DEFAULT NULL,
  `total_works` int(11) NOT NULL DEFAULT 0,
  `total_citations` int(11) NOT NULL DEFAULT 0,
  `corresponding_author_count` int(11) NOT NULL DEFAULT 0,
  `first_publication_year` smallint(6) DEFAULT NULL,
  `is_verified` tinyint(1) DEFAULT 0,
  `h_index` int(11) DEFAULT NULL,
  `latest_publication_year` smallint(6) DEFAULT NULL,
  `normalized_name` varchar(512) GENERATED ALWAYS AS (left(trim(lcase(`preferred_name`)),512)) STORED,
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
  KEY `idx_persons_total_works` (`total_works`),
  KEY `idx_persons_total_citations` (`total_citations`),
  KEY `idx_persons_latest_publication_year` (`latest_publication_year`),
  KEY `idx_persons_signature_id` (`signature_id`),
  KEY `idx_persons_normalized_name` (`normalized_name`),
  FULLTEXT KEY `ft_persons_names` (`preferred_name`,`given_names`,`family_name`),
  CONSTRAINT `fk_persons_signature` FOREIGN KEY (`signature_id`) REFERENCES `signatures` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=10906901 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `persons_quarantine_orgs` (
  `id` int(11) NOT NULL,
  `preferred_name` varchar(255) DEFAULT NULL,
  `family_name` varchar(255) DEFAULT NULL,
  `given_names` varchar(255) DEFAULT NULL,
  `orcid` varchar(20) DEFAULT NULL,
  `scopus_id` varchar(50) DEFAULT NULL,
  `lattes_id` varchar(20) DEFAULT NULL,
  `total_works` int(11) DEFAULT NULL,
  `first_publication_year` smallint(6) DEFAULT NULL,
  `latest_publication_year` smallint(6) DEFAULT NULL,
  `quarantined_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`,`quarantined_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `pub_isbn13_map` (
  `pub_id` int(11) NOT NULL,
  `isbn13` varchar(13) NOT NULL,
  PRIMARY KEY (`pub_id`),
  KEY `idx_pim_isbn` (`isbn13`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `publication_relevance` (
  `publication_id` int(11) NOT NULL,
  `work_id` int(11) NOT NULL,
  `venue_id` int(11) DEFAULT NULL,
  `score` decimal(6,2) NOT NULL,
  `rel_class` varchar(16) NOT NULL COMMENT 'CORE|ADJACENT|BORDERLINE|OFF',
  `positive_signal` decimal(6,2) NOT NULL,
  `negative_signal` decimal(6,2) NOT NULL,
  `venue_bonus` decimal(6,2) NOT NULL,
  `no_signal_flag` tinyint(1) NOT NULL,
  `computed_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`publication_id`),
  KEY `idx_work` (`work_id`),
  KEY `idx_venue` (`venue_id`),
  KEY `idx_class` (`rel_class`),
  KEY `idx_score` (`score`),
  CONSTRAINT `fk_pubrel_pub` FOREIGN KEY (`publication_id`) REFERENCES `publications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `publications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `work_id` int(11) NOT NULL,
  `reviewed_id` int(11) DEFAULT NULL,
  `type` enum('ARTICLE','BOOK','CHAPTER','THESIS','CONFERENCE','CONFERENCE_PAPER','REPORT','DATASET','PREPRINT','REVIEW','EDITORIAL','OTHER') NOT NULL,
  `year` smallint(6) GENERATED ALWAYS AS (year(`publication_date`)) STORED,
  `doi` varchar(255) DEFAULT NULL,
  `isbn` varchar(20) DEFAULT NULL,
  `venue_id` int(11) DEFAULT NULL,
  `publisher_id` int(11) DEFAULT NULL,
  `publication_date` date DEFAULT NULL,
  `volume` varchar(50) DEFAULT NULL,
  `issue` varchar(50) DEFAULT NULL,
  `pages` varchar(255) DEFAULT NULL,
  `arxiv` varchar(30) DEFAULT NULL,
  `pmid` varchar(20) DEFAULT NULL,
  `pmcid` varchar(20) DEFAULT NULL,
  `scielo_pid` varchar(50) DEFAULT NULL,
  `wos_id` varchar(30) DEFAULT NULL,
  `handle` varchar(255) DEFAULT NULL,
  `asin` varchar(200) DEFAULT NULL,
  `wikidata_id` varchar(20) DEFAULT NULL,
  `openalex_id` varchar(50) DEFAULT NULL,
  `mag_id` varchar(50) DEFAULT NULL,
  `openlibrary_id` varchar(50) DEFAULT NULL,
  `google_book_id` varchar(45) DEFAULT NULL,
  `oclc` varchar(32) DEFAULT NULL,
  `lccn` varchar(32) DEFAULT NULL,
  `bibtex_key` varchar(64) DEFAULT NULL,
  `external_ids` longtext DEFAULT NULL CHECK (json_valid(`external_ids`)),
  `udc` varchar(200) DEFAULT NULL,
  `lbc` varchar(200) DEFAULT NULL,
  `ddc` varchar(45) DEFAULT NULL,
  `lcc` varchar(45) DEFAULT NULL,
  `open_access` tinyint(1) DEFAULT 0,
  `peer_reviewed` tinyint(1) DEFAULT 1,
  `source` varchar(50) DEFAULT NULL,
  `source_prefix` varchar(50) DEFAULT NULL,
  `source_member_id` varchar(50) DEFAULT NULL,
  `source_deposited_at` timestamp NULL DEFAULT NULL,
  `source_content_domain` longtext DEFAULT NULL,
  `source_indexed_at` timestamp NULL DEFAULT NULL,
  `license_version` varchar(50) DEFAULT NULL,
  `license_url` varchar(512) DEFAULT NULL,
  `citation_count` int(11) NOT NULL DEFAULT 0,
  `reference_count` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `is_book` tinyint(1) GENERATED ALWAYS AS (if(`type` = 'BOOK',1,NULL)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doi` (`doi`),
  UNIQUE KEY `uq_publications_pmid` (`pmid`),
  UNIQUE KEY `uq_publications_pmcid` (`pmcid`),
  UNIQUE KEY `uq_publications_arxiv` (`arxiv`),
  UNIQUE KEY `uq_publications_openalex_id` (`openalex_id`),
  UNIQUE KEY `uq_publications_asin` (`asin`),
  UNIQUE KEY `uq_publications_google_book_id` (`google_book_id`),
  UNIQUE KEY `uq_pub_wos` (`wos_id`),
  UNIQUE KEY `uq_pub_handle` (`handle`),
  UNIQUE KEY `uq_publications_scielo_pid` (`scielo_pid`),
  UNIQUE KEY `uq_publications_bibtex_key` (`bibtex_key`),
  UNIQUE KEY `uq_publications_book_ol` (`is_book`,`openlibrary_id`),
  KEY `publisher_id` (`publisher_id`),
  KEY `idx_open_access` (`open_access`),
  KEY `idx_publications_created_at` (`created_at`),
  KEY `idx_publications_isbn` (`isbn`),
  KEY `idx_publications_mag_id` (`mag_id`),
  KEY `idx_publications_wikidata_id` (`wikidata_id`),
  KEY `idx_publications_classification` (`udc`,`lbc`,`ddc`,`lcc`),
  KEY `idx_publications_work_open_access` (`work_id`,`open_access`),
  KEY `idx_publications_oclc` (`oclc`),
  KEY `idx_publications_lccn` (`lccn`),
  KEY `idx_publications_type` (`type`),
  KEY `idx_publications_venue_year_oa` (`venue_id`,`year`,`open_access`),
  KEY `idx_publications_year` (`year`),
  KEY `idx_publications_work_year_id` (`work_id`,`year` DESC,`id` DESC),
  KEY `idx_publications_open_access_year` (`open_access`,`year` DESC),
  KEY `idx_publications_publisher_year` (`publisher_id`,`year` DESC),
  KEY `idx_publications_work_year_oa` (`work_id`,`year`,`open_access`),
  KEY `idx_citation` (`citation_count`),
  KEY `idx_reference` (`reference_count`),
  KEY `idx_pub_reviewed_id` (`reviewed_id`),
  CONSTRAINT `fk_pub_reviewed` FOREIGN KEY (`reviewed_id`) REFERENCES `works` (`id`) ON DELETE SET NULL,
  CONSTRAINT `publications_ibfk_1` FOREIGN KEY (`work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE,
  CONSTRAINT `publications_ibfk_2` FOREIGN KEY (`venue_id`) REFERENCES `venues` (`id`) ON DELETE SET NULL,
  CONSTRAINT `publications_ibfk_3` FOREIGN KEY (`publisher_id`) REFERENCES `organizations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1128906809 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
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
/*!50003 CREATE*/ /*!50017 DEFINER=`dev`@`%`*/ /*!50003 TRIGGER `trg_resolve_references_after_pub_insert`
AFTER INSERT ON `publications`
FOR EACH ROW
BEGIN
    IF NEW.doi IS NOT NULL THEN
        UPDATE work_references
        SET 
            cited_work_id = NEW.work_id,
            status = 'RESOLVED',
            resolved_at = CURRENT_TIMESTAMP
        WHERE 
            cited_doi = NEW.doi 
            AND status = 'PENDING';
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
/*!50003 CREATE*/ /*!50017 DEFINER=`dev`@`localhost`*/ /*!50003 TRIGGER `trg_resolve_references_after_pub_update`
AFTER UPDATE ON `publications`
FOR EACH ROW
BEGIN
    IF NEW.doi IS NOT NULL AND (OLD.doi IS NULL OR NEW.doi != OLD.doi) THEN
        UPDATE work_references
        SET 
            cited_work_id = NEW.work_id,
            status = 'RESOLVED',
            resolved_at = CURRENT_TIMESTAMP
        WHERE 
            cited_doi = NEW.doi 
            AND status = 'PENDING';
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
/*!50003 CREATE*/ /*!50017 DEFINER=`dev`@`localhost`*/ /*!50003 TRIGGER `trg_revert_references_after_pub_delete`
AFTER DELETE ON `publications`
FOR EACH ROW
BEGIN
    IF OLD.doi IS NOT NULL THEN
        UPDATE work_references
        SET 
            cited_work_id = NULL,
            status = 'PENDING',
            resolved_at = NULL
        WHERE 
            cited_work_id = OLD.work_id;
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `signatures` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `signature` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_signature` (`signature`),
  KEY `idx_signature_search` (`signature`(20)),
  KEY `idx_signatures_signature` (`signature`)
) ENGINE=InnoDB AUTO_INCREMENT=30951984 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `subject_relevance_tiers` (
  `subject_id` int(11) NOT NULL,
  `vocabulary` varchar(50) NOT NULL COMMENT 'Scopus | OpenAlex | SCImago | OpenLibrary',
  `tier` char(1) NOT NULL COMMENT 'A=core B=strong S=socio-political C=related D=peripheral E=generic N=negative X=neutralised',
  `weight` decimal(5,2) NOT NULL,
  PRIMARY KEY (`subject_id`),
  KEY `idx_tier` (`tier`),
  KEY `idx_vocabulary` (`vocabulary`),
  CONSTRAINT `fk_srt_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `subject_stoplist` (
  `token` varchar(255) NOT NULL,
  PRIMARY KEY (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `subjects` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `total_works` int(11) NOT NULL DEFAULT 0,
  `term` varchar(255) NOT NULL,
  `vocabulary` varchar(50) DEFAULT 'Keyword',
  `subject_type` varchar(50) DEFAULT NULL,
  `lang` char(3) DEFAULT NULL,
  `term_pt` varchar(255) DEFAULT NULL,
  `term_es` varchar(255) DEFAULT NULL,
  `external_id` varchar(100) DEFAULT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `term_key` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `normalized_term` varchar(255) GENERATED ALWAYS AS (trim(lcase(`term`))) STORED,
  `subject_type_nn` varchar(50) GENERATED ALWAYS AS (coalesce(`subject_type`,'')) STORED,
  `dedup_key` varchar(120) GENERATED ALWAYS AS (coalesce(`external_id`,concat('k:',left(`term_key`,110)))) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vocab_subtype_external_id` (`vocabulary`,`subject_type`,`external_id`),
  UNIQUE KEY `uq_vocab_stype_dedup` (`vocabulary`,`subject_type_nn`,`dedup_key`),
  UNIQUE KEY `uq_vocab_stype_term_key_nn` (`vocabulary`,`subject_type_nn`,`term_key`),
  KEY `parent_id` (`parent_id`),
  KEY `idx_term` (`term`),
  KEY `idx_vocabulary` (`vocabulary`),
  KEY `idx_subjects_term_key` (`term_key`),
  KEY `idx_subject_type` (`subject_type`),
  KEY `idx_subjects_vocabulary_term` (`vocabulary`,`normalized_term`),
  KEY `idx_external_id` (`external_id`),
  KEY `idx_subjects_total_works` (`total_works`),
  FULLTEXT KEY `ft_subjects_term` (`term`),
  CONSTRAINT `subjects_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `subjects` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2685773 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `venue_isbn13_map` (
  `venue_id` int(11) NOT NULL,
  `isbn13` varchar(13) DEFAULT NULL,
  `n_pubs` int(11) NOT NULL,
  `n_isbn` int(11) NOT NULL,
  `unanimous` tinyint(4) NOT NULL,
  PRIMARY KEY (`venue_id`),
  KEY `idx_vim_isbn` (`isbn13`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `venue_merge_audit` (
  `audit_id` int(11) NOT NULL AUTO_INCREMENT,
  `secondary_id` int(11) DEFAULT NULL,
  `primary_id` int(11) DEFAULT NULL,
  `isbn13` varchar(13) DEFAULT NULL,
  `snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`snapshot`)),
  `moved_pubs` int(11) DEFAULT NULL,
  `moved_subjects` int(11) DEFAULT NULL,
  `merged_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`audit_id`)
) ENGINE=InnoDB AUTO_INCREMENT=10911 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `venue_merge_map` (
  `secondary_id` int(11) NOT NULL,
  `primary_id` int(11) NOT NULL,
  `isbn13` varchar(13) DEFAULT NULL,
  PRIMARY KEY (`secondary_id`),
  KEY `idx_vmm_primary` (`primary_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `venue_ranking_rules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `term_pattern` varchar(255) NOT NULL,
  `weight` decimal(5,2) NOT NULL,
  `priority` int(11) DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pattern` (`term_pattern`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
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
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `venues` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `total_score` decimal(10,3) DEFAULT 0.000,
  `name` varchar(512) DEFAULT NULL,
  `type` enum('JOURNAL','CONFERENCE','REPOSITORY','BOOK_SERIES','SOURCE_BOOK','OTHER') NOT NULL DEFAULT 'OTHER',
  `issn` varchar(9) DEFAULT NULL,
  `eissn` varchar(9) DEFAULT NULL,
  `isbn13` varchar(13) DEFAULT NULL,
  `scopus_id` varchar(50) DEFAULT NULL,
  `openlibrary_work` varchar(20) DEFAULT NULL,
  `abbreviated_name` varchar(512) DEFAULT NULL,
  `homepage_url` varchar(512) DEFAULT NULL,
  `country_code` varchar(16) DEFAULT NULL,
  `publisher_id` int(11) DEFAULT NULL,
  `openalex_id` varchar(50) DEFAULT NULL,
  `wikidata_id` varchar(20) DEFAULT NULL,
  `scielo_id` varchar(50) DEFAULT NULL,
  `lang` char(3) DEFAULT NULL,
  `mag_id` varchar(50) DEFAULT NULL,
  `works_count` int(11) DEFAULT NULL,
  `aggregation_type` varchar(50) DEFAULT NULL,
  `open_access` tinyint(1) DEFAULT 0,
  `is_in_doaj` tinyint(1) DEFAULT 0,
  `is_in_scielo` tinyint(1) DEFAULT 0,
  `is_oa_diamond` tinyint(1) DEFAULT NULL,
  `is_indexed_in_scopus` tinyint(1) DEFAULT 0,
  `sjr_best_quartile` enum('Q1','Q2','Q3','Q4') DEFAULT NULL,
  `cited_by_count` int(11) DEFAULT NULL,
  `impact_factor` decimal(6,3) DEFAULT NULL,
  `citescore` decimal(6,2) DEFAULT NULL,
  `sjr` decimal(6,3) DEFAULT NULL,
  `snip` decimal(6,3) DEFAULT NULL,
  `overton` int(11) DEFAULT NULL,
  `h_index` int(11) DEFAULT NULL,
  `i10_index` int(11) DEFAULT NULL,
  `female_share` decimal(5,2) DEFAULT NULL,
  `2yr_mean_citedness` decimal(10,5) DEFAULT NULL,
  `coverage_start_year` smallint(6) DEFAULT NULL,
  `coverage_end_year` smallint(6) DEFAULT NULL,
  `subject_score` decimal(10,3) DEFAULT 0.000,
  `oa_score` decimal(10,3) DEFAULT 0.000,
  `llm_score` decimal(10,3) NOT NULL DEFAULT 0.000,
  `impact_score` decimal(10,3) NOT NULL DEFAULT 0.000,
  `llm_relevance` tinyint(4) DEFAULT NULL,
  `llm_justification` varchar(512) DEFAULT NULL,
  `summary` text DEFAULT NULL,
  `affiliation_score` decimal(10,3) DEFAULT 0.000,
  `citation_score` decimal(10,3) DEFAULT 0.000,
  `authorship_score` decimal(10,3) DEFAULT 0.000,
  `name_dedup_key` varchar(255) GENERATED ALWAYS AS (case when `type` = 'SOURCE_BOOK' then NULL else left(`name`,255) end) VIRTUAL,
  `last_validated_at` timestamp NULL DEFAULT NULL,
  `validation_status` enum('PENDING','VALIDATED','NOT_FOUND','FAILED') NOT NULL DEFAULT 'PENDING',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `issn` (`issn`),
  UNIQUE KEY `eissn` (`eissn`),
  UNIQUE KEY `uq_venues_scopus_id` (`scopus_id`),
  UNIQUE KEY `uq_venues_openalex_id` (`openalex_id`),
  UNIQUE KEY `uq_venues_mag_id` (`mag_id`),
  UNIQUE KEY `uq_venues_wikidata` (`wikidata_id`),
  UNIQUE KEY `uq_venues_isbn13` (`isbn13`),
  UNIQUE KEY `uq_venues_ol_work` (`openlibrary_work`),
  UNIQUE KEY `uq_venues_name_dedup` (`name_dedup_key`,`type`),
  KEY `idx_venues_type_impact` (`type`,`impact_factor`),
  KEY `idx_venues_publisher` (`publisher_id`,`type`),
  KEY `idx_eissn` (`eissn`),
  KEY `idx_validation_status` (`validation_status`),
  KEY `idx_venues_open_access` (`open_access`),
  KEY `idx_venues_total_score` (`total_score` DESC),
  KEY `idx_venues_scielo` (`scielo_id`),
  KEY `idx_venues_is_scielo` (`is_in_scielo`),
  KEY `idx_venues_abbreviated_name` (`abbreviated_name`),
  FULLTEXT KEY `ft_venues_search` (`name`,`abbreviated_name`),
  CONSTRAINT `venues_ibfk_1` FOREIGN KEY (`publisher_id`) REFERENCES `organizations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1846431 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_references` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `cited_work_id` int(11) DEFAULT NULL,
  `citing_work_id` int(11) NOT NULL,
  `cited_doi` varchar(255) NOT NULL,
  `citation_type` enum('POSITIVE','NEUTRAL','NEGATIVE','SELF') DEFAULT 'NEUTRAL',
  `status` enum('PENDING','RESOLVED','FAILED') NOT NULL DEFAULT 'PENDING',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `resolved_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reference` (`citing_work_id`,`cited_doi`),
  KEY `idx_cited_doi` (`cited_doi`),
  KEY `idx_status` (`status`),
  KEY `fk_ref_cited_work` (`cited_work_id`),
  CONSTRAINT `fk_ref_cited_work` FOREIGN KEY (`cited_work_id`) REFERENCES `works` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ref_citing_work` FOREIGN KEY (`citing_work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=163981024 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
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
/*!50003 CREATE*/ /*!50017 DEFINER=`dev`@`localhost`*/ /*!50003 TRIGGER trg_resolve_reference_before_insert
BEFORE INSERT ON work_references
FOR EACH ROW
BEGIN
    DECLARE v_work_id INT DEFAULT NULL;
    IF NEW.cited_doi IS NOT NULL THEN
        SELECT COALESCE(reviewed_id, work_id) INTO v_work_id
        FROM publications WHERE doi = NEW.cited_doi LIMIT 1;
        IF v_work_id IS NOT NULL THEN
            SET NEW.cited_work_id = v_work_id;
            SET NEW.status = 'RESOLVED';
            SET NEW.resolved_at = CURRENT_TIMESTAMP;
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
/*!50003 CREATE*/ /*!50017 DEFINER=`dev`@`localhost`*/ /*!50003 TRIGGER trg_resolve_reference_before_update
BEFORE UPDATE ON work_references
FOR EACH ROW
BEGIN
    DECLARE v_work_id INT DEFAULT NULL;
    IF NEW.cited_doi IS NOT NULL AND (OLD.cited_doi IS NULL OR NEW.cited_doi != OLD.cited_doi) THEN
        SELECT COALESCE(reviewed_id, work_id) INTO v_work_id
        FROM publications WHERE doi = NEW.cited_doi LIMIT 1;
        IF v_work_id IS NOT NULL THEN
            SET NEW.cited_work_id = v_work_id;
            SET NEW.status = 'RESOLVED';
            SET NEW.resolved_at = CURRENT_TIMESTAMP;
        ELSE
            SET NEW.cited_work_id = NULL;
            SET NEW.status = 'PENDING';
            SET NEW.resolved_at = NULL;
        END IF;
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_subjects` (
  `work_id` int(11) NOT NULL,
  `subject_id` int(11) NOT NULL,
  `assigned_by` enum('AUTHOR','EDITOR','SYSTEM','CURATOR') DEFAULT 'AUTHOR',
  `relevance_score` decimal(3,2) DEFAULT 1.00,
  PRIMARY KEY (`work_id`,`subject_id`),
  KEY `idx_subject` (`subject_id`),
  KEY `idx_relevance` (`relevance_score`),
  KEY `idx_work_subjects_subject_work` (`subject_id`,`work_id`),
  KEY `idx_work_subjects_work_relevance` (`work_id`,`relevance_score`),
  CONSTRAINT `work_subjects_ibfk_1` FOREIGN KEY (`work_id`) REFERENCES `works` (`id`) ON DELETE CASCADE,
  CONSTRAINT `work_subjects_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `works` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` text NOT NULL,
  `subtitle` text DEFAULT NULL,
  `abstract` mediumtext DEFAULT NULL,
  `language` char(3) DEFAULT NULL,
  `citation_count` int(11) DEFAULT 0,
  `reference_count` int(10) unsigned DEFAULT 0,
  `download_count` int(11) DEFAULT 0,
  `view_count` int(11) DEFAULT 0,
  `altmetric_score` decimal(10,2) DEFAULT NULL,
  `social_media_mentions` int(11) DEFAULT 0,
  `news_mentions` int(11) DEFAULT 0,
  `full_title_normalized` varchar(255) GENERATED ALWAYS AS (left(trim(lcase(concat(`title`,coalesce(concat(' ',`subtitle`),'')))),255)) VIRTUAL,
  `latest_publication_year` smallint(6) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `metrics_last_updated` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_language` (`language`),
  KEY `idx_works_created_at` (`created_at`),
  KEY `idx_works_updated_at` (`updated_at`),
  KEY `idx_works_citation_count` (`citation_count` DESC),
  KEY `idx_works_citation_year` (`citation_count` DESC,`created_at` DESC),
  KEY `idx_works_metrics_updated` (`metrics_last_updated` DESC),
  KEY `idx_works_latest_pub_year` (`latest_publication_year`),
  KEY `idx_works_reference_count` (`reference_count`),
  KEY `idx_works_full_title_normalized` (`full_title_normalized`)
) ENGINE=InnoDB AUTO_INCREMENT=23817129 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` FUNCTION `fn_calculate_10yr_impact_factor`(p_venue_id INT, p_target_year INT) RETURNS decimal(10,3)
    READS SQL DATA
    DETERMINISTIC
BEGIN
    DECLARE v_numerator INT DEFAULT 0;
    DECLARE v_denominator INT DEFAULT 0;
    DECLARE v_result DECIMAL(10,3) DEFAULT 0.000;

    SELECT COUNT(*) INTO v_denominator
    FROM publications p
    WHERE p.venue_id = p_venue_id
      AND p.year BETWEEN (p_target_year - 10) AND (p_target_year - 1)
      AND p.type IN ('ARTICLE', 'CONFERENCE', 'CHAPTER', 'BOOK');

    IF v_denominator = 0 THEN RETURN 0.000; END IF;

    SELECT COUNT(*) INTO v_numerator
    FROM work_references wr
    JOIN publications citing_pub ON wr.citing_work_id = citing_pub.work_id 
    JOIN publications cited_pub ON wr.cited_work_id = cited_pub.work_id    
    WHERE cited_pub.venue_id = p_venue_id
      AND wr.status = 'RESOLVED'
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
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` FUNCTION `fn_clean_name_text`(p_name VARCHAR(255)) RETURNS varchar(255) CHARSET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci
    NO SQL
    DETERMINISTIC
BEGIN
    DECLARE v VARCHAR(512);
    IF p_name IS NULL THEN
        RETURN NULL;
    END IF;
    SET v = p_name;
    SET v = REGEXP_REPLACE(v, '\\s*\\([^()]*\\)\\s*', ' ');                        
    SET v = REGEXP_REPLACE(v, '\\s*[(].*$', '');                                  
    SET v = REGEXP_REPLACE(v, '(18|19|20)[0-9Xx?uU]{2}(\\s*[-/]\\s*[0-9Xx?uU]{0,4})?', ' '); 
    SET v = REGEXP_REPLACE(v, '(^|\\s)[-‐−]?[0-9]+([-‐/][0-9]+)*(\\s|$)', ' ');     
    SET v = REGEXP_REPLACE(v, '([[:alpha:]])\\s*[-‐]\\s*([[:alpha:]])', '\\1-\\2'); 
    SET v = REGEXP_REPLACE(v, '(^|\\s)[-‐−]+', '\\1');                            
    SET v = REGEXP_REPLACE(v, '[()]', '');                                        
    SET v = TRIM(REGEXP_REPLACE(v, '\\s+', ' '));                                 
    SET v = TRIM(REGEXP_REPLACE(v, '^[-‐−,;:]+|[-‐−,;:]+$', ''));                 
    RETURN v;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` FUNCTION `fn_roman_to_int`(p_roman VARCHAR(32)) RETURNS int(11)
    NO SQL
    DETERMINISTIC
BEGIN
    DECLARE v_result INT DEFAULT 0;
    DECLARE v_prev INT DEFAULT 0;
    DECLARE v_curr INT;
    DECLARE v_i INT DEFAULT 1;
    DECLARE v_len INT;
    DECLARE v_char CHAR(1);
    DECLARE v_norm VARCHAR(32);

    IF p_roman IS NULL OR p_roman = '' THEN RETURN NULL; END IF;
    SET v_norm = UPPER(TRIM(p_roman));
    
    
    
    
    
    
    IF v_norm NOT REGEXP '^M{0,4}(CM|CD|DC{0,4}|C{0,4})(XC|XL|LX{0,4}|X{0,4})(IX|IV|VI{0,4}|I{0,4})$' THEN
        RETURN NULL;
    END IF;

    SET v_len = CHAR_LENGTH(v_norm);
    WHILE v_i <= v_len DO
        SET v_char = SUBSTRING(v_norm, v_len - v_i + 1, 1);
        SET v_curr = CASE v_char
            WHEN 'I' THEN 1   WHEN 'V' THEN 5   WHEN 'X' THEN 10
            WHEN 'L' THEN 50  WHEN 'C' THEN 100 WHEN 'D' THEN 500
            WHEN 'M' THEN 1000
        END;
        IF v_curr < v_prev THEN
            SET v_result = v_result - v_curr;
        ELSE
            SET v_result = v_result + v_curr;
        END IF;
        SET v_prev = v_curr;
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
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`%` FUNCTION `format_to_isbn13`(raw_isbn VARCHAR(20)) RETURNS varchar(13) CHARSET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci
    DETERMINISTIC
BEGIN
    DECLARE clean_isbn VARCHAR(20);
    DECLARE base_12 VARCHAR(12);
    DECLARE check_digit INT;
    DECLARE checksum INT;

    
    SET clean_isbn = REPLACE(REPLACE(REPLACE(raw_isbn, '-', ''), '–', ''), '—', '');

    
    IF CHAR_LENGTH(clean_isbn) = 13 THEN
        RETURN clean_isbn;
    END IF;

    
    IF CHAR_LENGTH(clean_isbn) = 10 THEN
        
        SET base_12 = CONCAT('978', SUBSTRING(clean_isbn, 1, 9));
        
        
        SET checksum = 
            CAST(SUBSTRING(base_12, 1, 1) AS UNSIGNED) * 1 +
            CAST(SUBSTRING(base_12, 2, 1) AS UNSIGNED) * 3 +
            CAST(SUBSTRING(base_12, 3, 1) AS UNSIGNED) * 1 +
            CAST(SUBSTRING(base_12, 4, 1) AS UNSIGNED) * 3 +
            CAST(SUBSTRING(base_12, 5, 1) AS UNSIGNED) * 1 +
            CAST(SUBSTRING(base_12, 6, 1) AS UNSIGNED) * 3 +
            CAST(SUBSTRING(base_12, 7, 1) AS UNSIGNED) * 1 +
            CAST(SUBSTRING(base_12, 8, 1) AS UNSIGNED) * 3 +
            CAST(SUBSTRING(base_12, 9, 1) AS UNSIGNED) * 1 +
            CAST(SUBSTRING(base_12, 10, 1) AS UNSIGNED) * 3 +
            CAST(SUBSTRING(base_12, 11, 1) AS UNSIGNED) * 1 +
            CAST(SUBSTRING(base_12, 12, 1) AS UNSIGNED) * 3;

        SET check_digit = (10 - (checksum MOD 10)) MOD 10;
        
        RETURN CONCAT(base_12, check_digit);
    END IF;

    
    RETURN clean_isbn;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`%` PROCEDURE `sp_apply_structural_indexes`()
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
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_build_summary_venues`()
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
            'oa',          v.oa_score,
            'authorship',  v.authorship_score,
            'affiliation', v.affiliation_score,
            'citation',    v.citation_score,
            'impact',      v.impact_score,
            'llm',         v.llm_score,
            'llm_relevance',     v.llm_relevance,
            'llm_justification', v.llm_justification,
            
            'sjr_best_quartile', v.sjr_best_quartile,
            'is_oa_diamond',     v.is_oa_diamond,
            'overton',           v.overton
        ),
        v.impact_factor, v.citescore, v.sjr, v.snip,
        v.h_index, v.i10_index, v.`2yr_mean_citedness`,
        v.is_in_doaj, v.is_in_scielo, v.is_indexed_in_scopus, v.homepage_url,
        v.validation_status, tvs.top_subjects_json
    FROM venues v
    LEFT JOIN organizations o ON v.publisher_id = o.id
    LEFT JOIN tmp_venue_subjects tvs ON v.id = tvs.venue_id;

    DROP TEMPORARY TABLE IF EXISTS tmp_venue_subjects;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_calculate_venue_ranking`()
BEGIN
    DECLARE scored_count INT DEFAULT 0;

    UPDATE venues SET
        subject_score=0.000, oa_score=0.000, authorship_score=0.000,
        affiliation_score=0.000, citation_score=0.000, impact_score=0.000,
        llm_score=0.000, total_score=0.000;

    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    UPDATE venues v
    INNER JOIN (
        SELECT vs.venue_id AS id, MAX(srt.weight) AS sub_score
        FROM venue_subjects vs
        INNER JOIN subject_relevance_tiers srt
            ON vs.subject_id = srt.subject_id
           AND srt.vocabulary IN ('Scopus','SCImago','OpenLibrary')
           AND srt.tier IN ('A','B','C','D','E','S')
        GROUP BY vs.venue_id
    ) scopus ON v.id = scopus.id
    SET v.subject_score = scopus.sub_score;

    
    
    
    UPDATE venues v
    INNER JOIN (
        SELECT vs.venue_id AS id,
               SUM(COALESCE(own.weight, par.weight, 0)) / COUNT(*) AS sub_score
        FROM venue_subjects vs
        INNER JOIN subjects s ON vs.subject_id = s.id
        LEFT JOIN subject_relevance_tiers own
            ON own.subject_id = s.id AND own.vocabulary = 'OpenAlex'
           AND own.tier IN ('A','B','C','D','E','S')
        LEFT JOIN subject_relevance_tiers par
            ON par.subject_id = s.parent_id AND par.vocabulary = 'OpenAlex'
           AND par.tier IN ('A','B','C','D','E','S')
           AND NOT EXISTS (SELECT 1 FROM subject_relevance_tiers o2 WHERE o2.subject_id = s.id)
        WHERE s.vocabulary = 'OpenAlex' AND s.subject_type = 'Topic'
        GROUP BY vs.venue_id
    ) oa ON v.id = oa.id
    SET v.subject_score = GREATEST(v.subject_score, oa.sub_score)
    WHERE oa.sub_score > v.subject_score;

    
    
    
    
    UPDATE venues
    SET subject_score = GREATEST(subject_score, (llm_relevance - 1) * 2.0)
    WHERE llm_relevance >= 4;

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    UPDATE venues
    SET oa_score = CASE
            WHEN COALESCE(is_oa_diamond,0)=1 THEN 0.05
            WHEN COALESCE(open_access,0)=1   THEN 0.025
            ELSE 0.0 END
    WHERE subject_score > 0;

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    UPDATE venues v
    JOIN (
        SELECT id,
               (COALESCE(n_cs,0)+COALESCE(n_mc,0)+COALESCE(n_cpw,0))
                   / NULLIF((n_cs IS NOT NULL)+(n_mc IS NOT NULL)+(n_cpw IS NOT NULL),0) AS ci,
               (COALESCE(n_sjr,0)+COALESCE(n_q,0)+COALESCE(n_h,0))
                   / NULLIF((n_sjr IS NOT NULL)+(n_q IS NOT NULL)+(n_h IS NOT NULL),0) AS pr,
               n_ov
        FROM (
            SELECT id,
                CASE WHEN citescore > 0            THEN LEAST(citescore/6.0, 1.0) END AS n_cs,
                
                
                
                
                
                
                
                CASE WHEN `2yr_mean_citedness` IS NOT NULL THEN LEAST(`2yr_mean_citedness`/1.0, 1.0) END AS n_mc,
                CASE WHEN works_count > 0 AND cited_by_count > 0
                     THEN LEAST((cited_by_count/works_count)/20.0, 1.0) END AS n_cpw,
                CASE WHEN sjr > 0                  THEN LEAST(sjr/1.0, 1.0) END AS n_sjr,
                CASE sjr_best_quartile WHEN 'Q1' THEN 1.00 WHEN 'Q2' THEN 0.75
                                       WHEN 'Q3' THEN 0.50 WHEN 'Q4' THEN 0.25 END AS n_q,
                CASE WHEN h_index > 0              THEN LEAST(h_index/100.0, 1.0) END AS n_h,
                CASE WHEN overton > 0              THEN LEAST(LN(1+overton)/LN(51), 1.0) END AS n_ov
            FROM venues
        ) z
    ) m ON m.id = v.id
    SET v.impact_score = LEAST(6.0, COALESCE(ROUND(
        6.0 * (0.7*COALESCE(m.ci,0) + 0.3*COALESCE(m.pr,0))
            / NULLIF(0.7*(m.ci IS NOT NULL) + 0.3*(m.pr IS NOT NULL), 0)
    , 3), 0.000) + 0.5 * COALESCE(m.n_ov, 0))
    WHERE (v.llm_relevance >= 3 OR v.subject_score >= 5)
      AND v.type <> 'SOURCE_BOOK';
    
    
    
    
    
    
    
    
    
    

    
    UPDATE venues
    SET llm_score = COALESCE(llm_relevance,0) * 2
    WHERE llm_relevance IS NOT NULL OR subject_score > 0;

    
    UPDATE venues
    SET total_score = subject_score + llm_score + impact_score + oa_score
    WHERE subject_score > 0 OR llm_score > 0;

    SET scored_count = (SELECT COUNT(*) FROM venues WHERE total_score > 0);
    SELECT CONCAT('Ranking updated. Venues scored: ', scored_count) AS status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`%` PROCEDURE `sp_change_person_id`(
    IN p_old_id INT,
    IN p_new_id INT
)
BEGIN
    DECLARE v_old_exists INT DEFAULT 0;
    DECLARE v_new_exists INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = 1;
        RESIGNAL;
    END;

    
    SELECT COUNT(*) INTO v_old_exists FROM persons WHERE id = p_old_id;
    IF v_old_exists = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Identificador original inexistente na tabela persons.';
    END IF;

    SELECT COUNT(*) INTO v_new_exists FROM persons WHERE id = p_new_id;
    IF v_new_exists > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Identificador de destino já registrado na tabela persons.';
    END IF;

    
    START TRANSACTION;
    SET FOREIGN_KEY_CHECKS = 0;

    
    UPDATE persons SET id = p_new_id WHERE id = p_old_id;

    
    UPDATE authorships SET person_id = p_new_id WHERE person_id = p_old_id;
    UPDATE course_instructors SET person_id = p_new_id WHERE person_id = p_old_id;
    UPDATE course_instructors SET canonical_person_id = p_new_id WHERE canonical_person_id = p_old_id;
    
    
    UPDATE persons_quarantine_orgs SET id = p_new_id WHERE id = p_old_id;

    
    SET FOREIGN_KEY_CHECKS = 1;
    COMMIT;

    SELECT CONCAT('Identificador de pessoa alterado de ', p_old_id, ' para ', p_new_id) AS status_execucao;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`%` PROCEDURE `sp_check_data_integrity`()
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
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb3 */ ;
/*!50003 SET character_set_results = utf8mb3 */ ;
/*!50003 SET collation_connection  = utf8mb3_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`%` PROCEDURE `sp_check_duplicate_persons`()
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
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`%` PROCEDURE `sp_check_signature_conflicts`()
BEGIN
    SELECT
        s.signature,
        COUNT(DISTINCT p.id) as person_count,
        GROUP_CONCAT(DISTINCT p.preferred_name ORDER BY p.preferred_name SEPARATOR ' | ') as conflicting_names,
        GROUP_CONCAT(DISTINCT p.id ORDER BY p.id) as person_ids
    FROM signatures s
    JOIN persons p ON s.id = p.signature_id
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
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_clean_core_data`()
BEGIN
    DELETE a FROM authorships a LEFT JOIN works w ON a.work_id = w.id WHERE w.id IS NULL;
    DELETE a FROM authorships a LEFT JOIN persons p ON a.person_id = p.id WHERE p.id IS NULL;
    DELETE pub FROM publications pub LEFT JOIN works w ON pub.work_id = w.id WHERE w.id IS NULL;
    DELETE cb FROM course_bibliography cb LEFT JOIN works w ON cb.work_id = w.id WHERE w.id IS NULL;
    DELETE f FROM funding f LEFT JOIN works w ON f.work_id = w.id WHERE w.id IS NULL;
    DELETE wr FROM work_references wr LEFT JOIN works w ON wr.citing_work_id = w.id WHERE w.id IS NULL;
    
    DELETE p FROM persons p 
    LEFT JOIN authorships a ON p.id = a.person_id 
    LEFT JOIN course_instructors ci ON p.id = ci.person_id 
    WHERE a.work_id IS NULL AND ci.course_id IS NULL;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_clean_html_entities`()
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
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_clean_persons_dirty`()
BEGIN
    DECLARE v_placeholder INT DEFAULT 0;
    DECLARE v_stray_na INT DEFAULT 0;
    DECLARE v_paren_stripped INT DEFAULT 0;
    DECLARE v_paren_nulled INT DEFAULT 0;
    DECLARE v_single_letter INT DEFAULT 0;
    DECLARE v_org_quarantined INT DEFAULT 0;
    DECLARE v_quote_residue INT DEFAULT 0;
    DECLARE v_prefix_stripped INT DEFAULT 0;
    DECLARE v_family_cruft INT DEFAULT 0;
    DECLARE v_given_cruft INT DEFAULT 0;
    DECLARE v_hyphen_compound INT DEFAULT 0;
    DECLARE v_name_text_cleaned INT DEFAULT 0;
    DECLARE v_initials_quarantined INT DEFAULT 0;

    CREATE TABLE IF NOT EXISTS persons_quarantine_orgs (
        id INT NOT NULL,
        preferred_name VARCHAR(255),
        family_name VARCHAR(255),
        given_names VARCHAR(255),
        orcid VARCHAR(20),
        scopus_id VARCHAR(50),
        lattes_id VARCHAR(20),
        total_works INT,
        first_publication_year SMALLINT,
        latest_publication_year SMALLINT,
        quarantined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id, quarantined_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

    
    
    
    
    
    
    
    
    
    
    
    
    UPDATE IGNORE persons
    SET preferred_name = fn_clean_name_text(preferred_name)
    WHERE preferred_name REGEXP '[0-9()]|[[:space:]][-‐]|[-‐][[:space:]]|[-‐][-‐]'
      AND fn_clean_name_text(preferred_name) <> preferred_name
      AND fn_clean_name_text(preferred_name) <> '';
    SET v_name_text_cleaned = ROW_COUNT();

    UPDATE IGNORE persons
    SET family_name = NULLIF(fn_clean_name_text(family_name), '')
    WHERE family_name REGEXP '[0-9()]|[[:space:]][-‐]|[-‐][[:space:]]|[-‐][-‐]|^[[:space:]]*[-‐]'
      AND COALESCE(fn_clean_name_text(family_name), '') <> COALESCE(family_name, '');

    UPDATE IGNORE persons
    SET given_names = NULLIF(fn_clean_name_text(given_names), '')
    WHERE given_names REGEXP '[0-9()]|[[:space:]][-‐]|[-‐][[:space:]]|[-‐][-‐]'
      AND COALESCE(fn_clean_name_text(given_names), '') <> COALESCE(given_names, '');

    
    
    UPDATE IGNORE persons
    SET preferred_name = TRIM(REGEXP_REPLACE(
        REGEXP_REPLACE(
            REGEXP_REPLACE(preferred_name, '^"+', ''),
            '"+$', ''),
        '""+', '"'))
    WHERE preferred_name REGEXP '^"|"$|""';
    SET v_quote_residue = ROW_COUNT();

    
    
    
    
    
    UPDATE IGNORE persons
    SET preferred_name = TRIM(REGEXP_REPLACE(preferred_name, '^\\([^)]{1,40}\\)\\s+', ''))
    WHERE preferred_name REGEXP '^\\([^)]{1,40}\\)\\s+';
    SET v_prefix_stripped = ROW_COUNT();

    
    
    UPDATE persons
    SET family_name = TRIM(REGEXP_REPLACE(family_name, '\\s+\\([^)]*$', ''))
    WHERE family_name REGEXP '\\s+\\([^)]*$';
    SET v_family_cruft = ROW_COUNT();

    
    
    UPDATE persons
    SET given_names = NULLIF(TRIM(REGEXP_REPLACE(given_names, '^[^(]*\\)\\s*', '')), '')
    WHERE given_names REGEXP '^[^(]*\\)';
    SET v_given_cruft = ROW_COUNT();

    
    DELETE FROM persons
    WHERE LOWER(TRIM(COALESCE(preferred_name, ''))) IN
          ('none', 'null', 'n/a', 'na.', 'nan', 'unknown', 'anonymous', 'anon',
           '?', '??', '???', 'undefined', '');
    SET v_placeholder = ROW_COUNT();

    
    
    UPDATE IGNORE persons
    SET preferred_name = TRIM(REGEXP_REPLACE(preferred_name, '\\s+Na$', ''))
    WHERE family_name IS NULL
      AND preferred_name REGEXP '\\s+Na$'
      AND (given_names IS NULL OR given_names NOT REGEXP '(?i)\\bNa\\b');
    SET v_stray_na = ROW_COUNT();

    
    UPDATE persons
    SET family_name = NULLIF(TRIM(REGEXP_REPLACE(family_name, '^\\([^)]*\\)\\s+', '')), '')
    WHERE family_name REGEXP '^\\([^)]+\\)\\s+';
    SET v_paren_stripped = ROW_COUNT();

    
    UPDATE persons SET family_name = NULL WHERE family_name REGEXP '^\\(';
    SET v_paren_nulled = ROW_COUNT();

    
    UPDATE IGNORE persons
    SET preferred_name = TRIM(REGEXP_REPLACE(preferred_name, '\\s+\\([^)]*\\)?$', ''))
    WHERE preferred_name REGEXP '\\s+\\([^)]*\\)?$';

    
    
    UPDATE persons
    SET
        given_names = TRIM(CONCAT(
            CASE
                WHEN LENGTH(preferred_name) - LENGTH(REPLACE(preferred_name, ' ', '')) >= 2
                THEN TRIM(SUBSTRING(
                    preferred_name, 1,
                    
                    
                    GREATEST(0, CHAR_LENGTH(preferred_name) - CHAR_LENGTH(SUBSTRING_INDEX(preferred_name, ' ', -2)) - 1)
                ))
                ELSE ''
            END,
            ' ',
            SUBSTRING_INDEX(preferred_name, ' ', -1)
        )),
        family_name = SUBSTRING_INDEX(SUBSTRING_INDEX(preferred_name, ' ', -2), ' ', 1)
    WHERE CHAR_LENGTH(family_name) = 1
      AND family_name REGEXP '^[A-Za-z]$'
      AND LOCATE(' ', preferred_name) > 0
      AND CHAR_LENGTH(SUBSTRING_INDEX(SUBSTRING_INDEX(preferred_name, ' ', -2), ' ', 1)) >= 2
      AND SUBSTRING_INDEX(SUBSTRING_INDEX(preferred_name, ' ', -2), ' ', 1) NOT LIKE '(%';
    SET v_single_letter = ROW_COUNT();

    
    
    
    UPDATE persons
    SET
        given_names = TRIM(CONCAT(
            CASE
                WHEN LENGTH(preferred_name) - LENGTH(REPLACE(preferred_name, ' ', '')) >= 3
                THEN TRIM(SUBSTRING(
                    preferred_name, 1,
                    
                    
                    GREATEST(0, CHAR_LENGTH(preferred_name) - CHAR_LENGTH(SUBSTRING_INDEX(preferred_name, ' ', -3)) - 1)
                ))
                ELSE ''
            END,
            ' ',
            SUBSTRING_INDEX(preferred_name, ' ', -2)
        )),
        family_name = SUBSTRING_INDEX(SUBSTRING_INDEX(preferred_name, ' ', -3), ' ', 1)
    WHERE CHAR_LENGTH(family_name) = 1
      AND family_name REGEXP '^[A-Za-z]$'
      AND LOCATE(' ', preferred_name) > 0
      AND CHAR_LENGTH(SUBSTRING_INDEX(SUBSTRING_INDEX(preferred_name, ' ', -2), ' ', 1)) = 1
      AND CHAR_LENGTH(SUBSTRING_INDEX(SUBSTRING_INDEX(preferred_name, ' ', -3), ' ', 1)) >= 2
      AND SUBSTRING_INDEX(SUBSTRING_INDEX(preferred_name, ' ', -3), ' ', 1) NOT LIKE '(%';
    SET v_single_letter = v_single_letter + ROW_COUNT();

    
    
    
    DELETE FROM persons
    WHERE LOWER(TRIM(COALESCE(preferred_name, ''))) IN
          ('none', 'null', 'n/a', 'na.', 'nan', 'unknown', 'anonymous', 'anon',
           '?', '??', '???', 'undefined', '');
    SET v_placeholder = v_placeholder + ROW_COUNT();

    UPDATE persons SET family_name = NULL WHERE family_name REGEXP '^\\(';
    SET v_paren_nulled = v_paren_nulled + ROW_COUNT();

    
    
    
    
    
    
    
    
    
    
    UPDATE persons
    SET
        family_name = CONCAT(SUBSTRING_INDEX(TRIM(given_names), ' ', -1), COALESCE(family_name, '')),
        given_names = NULLIF(TRIM(SUBSTRING(TRIM(given_names), 1,
            CHAR_LENGTH(TRIM(given_names)) - CHAR_LENGTH(SUBSTRING_INDEX(TRIM(given_names), ' ', -1)))), '')
    WHERE given_names REGEXP '[-‐]$'
      AND LOCATE(' ', TRIM(given_names)) > 0;
    SET v_hyphen_compound = ROW_COUNT();

    
    
    
    
    
    
    
    
    
    
    
    INSERT INTO persons_quarantine_orgs
        (id, preferred_name, family_name, given_names, orcid, scopus_id,
         lattes_id, total_works, first_publication_year, latest_publication_year)
    SELECT id, preferred_name, family_name, given_names, orcid, scopus_id,
           lattes_id, total_works, first_publication_year, latest_publication_year
    FROM persons
    WHERE COALESCE(orcid,'') = '' AND COALESCE(scopus_id,'') = '' AND COALESCE(lattes_id,'') = ''
      AND (CHAR_LENGTH(preferred_name) >= 80
        OR (CHAR_LENGTH(preferred_name) >= 12
            AND preferred_name REGEXP '(?i)\\b(unive|institut|istitut|fakult|facult|laborat|politecnic|polytechni|academi|académi|cnrs)')
        OR (CHAR_LENGTH(preferred_name) >= 20
            AND preferred_name REGEXP '(?i)\\b(university|hospital|consortium|college|federation|federa[cç][aã]o|foundation|funda[cç][aã]o|ministry|minist[eé]rio|network|study group|working group|research group|research cent(er|re)|interest group|group|groupe|associa[cç][aã]o|comiss[aã]o|comit[eê]|study of|conference|galler[iy]|museum|museo|museu|archives|arquivos|reserva|forum|seminar|sympos|academy|academia|theater|theatre|teatro|escuela|école|ecole|departament|département)\\b'));

    DELETE FROM persons
    WHERE COALESCE(orcid,'') = '' AND COALESCE(scopus_id,'') = '' AND COALESCE(lattes_id,'') = ''
      AND (CHAR_LENGTH(preferred_name) >= 80
        OR (CHAR_LENGTH(preferred_name) >= 12
            AND preferred_name REGEXP '(?i)\\b(unive|institut|istitut|fakult|facult|laborat|politecnic|polytechni|academi|académi|cnrs)')
        OR (CHAR_LENGTH(preferred_name) >= 20
            AND preferred_name REGEXP '(?i)\\b(university|hospital|consortium|college|federation|federa[cç][aã]o|foundation|funda[cç][aã]o|ministry|minist[eé]rio|network|study group|working group|research group|research cent(er|re)|interest group|group|groupe|associa[cç][aã]o|comiss[aã]o|comit[eê]|study of|conference|galler[iy]|museum|museo|museu|archives|arquivos|reserva|forum|seminar|sympos|academy|academia|theater|theatre|teatro|escuela|école|ecole|departament|département)\\b'));
    SET v_org_quarantined = ROW_COUNT();

    
    
    
    
    
    
    
    
    INSERT INTO persons_quarantine_orgs
        (id, preferred_name, family_name, given_names, orcid, scopus_id,
         lattes_id, total_works, first_publication_year, latest_publication_year)
    SELECT id, preferred_name, family_name, given_names, orcid, scopus_id,
           lattes_id, total_works, first_publication_year, latest_publication_year
    FROM persons
    WHERE preferred_name IS NOT NULL
      AND preferred_name NOT REGEXP '[[:alpha:]]{2,}'
      AND COALESCE(orcid,'') = '' AND COALESCE(scopus_id,'') = '' AND COALESCE(lattes_id,'') = '';

    DELETE FROM persons
    WHERE preferred_name IS NOT NULL
      AND preferred_name NOT REGEXP '[[:alpha:]]{2,}'
      AND COALESCE(orcid,'') = '' AND COALESCE(scopus_id,'') = '' AND COALESCE(lattes_id,'') = '';
    SET v_initials_quarantined = ROW_COUNT();

    SELECT
        v_name_text_cleaned    AS name_text_cleaned,
        v_quote_residue        AS quote_residue_stripped,
        v_prefix_stripped      AS paren_prefix_stripped,
        v_family_cruft         AS family_cruft_stripped,
        v_given_cruft          AS given_cruft_stripped,
        v_placeholder          AS placeholder_deleted,
        v_stray_na             AS stray_na_stripped,
        v_paren_stripped       AS paren_stripped,
        v_paren_nulled         AS paren_nulled,
        v_single_letter        AS single_letter_fixed,
        v_hyphen_compound      AS hyphen_compound_repaired,
        v_initials_quarantined AS initials_residue_quarantined,
        v_org_quarantined      AS orgs_quarantined;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_clean_split_compound_persons`()
BEGIN
    
    CREATE TEMPORARY TABLE temp_split_names AS
    WITH RECURSIVE name_splitter AS (
        SELECT 
            id AS original_person_id,
            TRIM(SUBSTRING_INDEX(preferred_name, ',', 1)) AS extracted_name,
            TRIM(SUBSTRING(preferred_name, LENGTH(SUBSTRING_INDEX(preferred_name, ',', 1)) + 2)) AS remainder
        FROM persons
        WHERE preferred_name LIKE '%,%'
        
        UNION ALL
        
        SELECT 
            original_person_id,
            TRIM(SUBSTRING_INDEX(remainder, ',', 1)),
            TRIM(SUBSTRING(remainder, LENGTH(SUBSTRING_INDEX(remainder, ',', 1)) + 2))
        FROM name_splitter
        WHERE remainder != ''
    )
    SELECT original_person_id, extracted_name 
    FROM name_splitter 
    WHERE extracted_name != '';

    
    INSERT IGNORE INTO persons (preferred_name)
    SELECT DISTINCT extracted_name FROM temp_split_names;

    
    INSERT IGNORE INTO authorships (work_id, person_id, role, position)
    SELECT a.work_id, p_new.id, 'AUTHOR', 99
    FROM authorships a
    JOIN temp_split_names tsn ON a.person_id = tsn.original_person_id
    JOIN persons p_new ON p_new.preferred_name = tsn.extracted_name COLLATE utf8mb4_unicode_ci;

    
    DELETE p FROM persons p
    JOIN (SELECT DISTINCT original_person_id FROM temp_split_names) del_list 
      ON p.id = del_list.original_person_id;

    DROP TEMPORARY TABLE temp_split_names;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_collapse_book_pubs_by_isbn`(IN p_apply TINYINT)
BEGIN
  
  
  
  
  INSERT IGNORE INTO book_pub_merge_audit
    (loser_pub_id, survivor_pub_id, work_id, isbn, loser_pub_json)
  SELECT m.loser_pub_id, m.survivor_pub_id, m.work_id, m.isbn,
    JSON_OBJECT('id',lp.id,'work_id',lp.work_id,'doi',lp.doi,'openalex_id',lp.openalex_id,'isbn',lp.isbn,
      'scielo_pid',lp.scielo_pid,'pmid',lp.pmid,'pmcid',lp.pmcid,'arxiv',lp.arxiv,'wos_id',lp.wos_id,
      'handle',lp.handle,'wikidata_id',lp.wikidata_id,'mag_id',lp.mag_id,'asin',lp.asin,
      'google_book_id',lp.google_book_id,'openlibrary_id',lp.openlibrary_id,'oclc',lp.oclc,'lccn',lp.lccn,
      'lcc',lp.lcc,'ddc',lp.ddc,'venue_id',lp.venue_id,'type',lp.type,'external_ids',lp.external_ids,
      'publication_date',lp.publication_date,'volume',lp.volume,'issue',lp.issue,'pages',lp.pages)
  FROM book_pub_merge_map m
  JOIN publications lp ON lp.id = m.loser_pub_id;

  
  

  IF p_apply = 1 THEN
    
    
    
    
    
    UPDATE IGNORE files fi JOIN book_pub_merge_map m ON fi.publication_id = m.loser_pub_id
      SET fi.publication_id = m.survivor_pub_id;

    
    
    DELETE p FROM publications p JOIN book_pub_merge_map m ON p.id = m.loser_pub_id;

    
    
    
    
    
    
    
    
    
    
    UPDATE publications sp
    JOIN (
      SELECT survivor_pub_id,
             MAX(JSON_VALUE(loser_pub_json,'$.openalex_id'))    AS openalex_id,
             MAX(JSON_VALUE(loser_pub_json,'$.openlibrary_id')) AS openlibrary_id,
             MAX(JSON_VALUE(loser_pub_json,'$.doi'))            AS doi,
             MAX(JSON_VALUE(loser_pub_json,'$.google_book_id')) AS google_book_id,
             MAX(JSON_VALUE(loser_pub_json,'$.asin'))           AS asin,
             MAX(JSON_VALUE(loser_pub_json,'$.scielo_pid'))     AS scielo_pid,
             MAX(JSON_VALUE(loser_pub_json,'$.wos_id'))         AS wos_id,
             MAX(JSON_VALUE(loser_pub_json,'$.handle'))         AS handle,
             MAX(JSON_VALUE(loser_pub_json,'$.pmid'))           AS pmid,
             MAX(JSON_VALUE(loser_pub_json,'$.pmcid'))          AS pmcid,
             MAX(JSON_VALUE(loser_pub_json,'$.arxiv'))          AS arxiv,
             MAX(JSON_VALUE(loser_pub_json,'$.oclc'))           AS oclc,
             MAX(JSON_VALUE(loser_pub_json,'$.lccn'))           AS lccn,
             MAX(JSON_VALUE(loser_pub_json,'$.lcc'))            AS lcc,
             MAX(JSON_VALUE(loser_pub_json,'$.ddc'))            AS ddc,
             MAX(JSON_VALUE(loser_pub_json,'$.wikidata_id'))    AS wikidata_id,
             MAX(JSON_VALUE(loser_pub_json,'$.mag_id'))         AS mag_id
      FROM book_pub_merge_audit
      GROUP BY survivor_pub_id
    ) g ON sp.id = g.survivor_pub_id
    SET sp.openalex_id    = COALESCE(sp.openalex_id,    g.openalex_id),
        sp.openlibrary_id = COALESCE(sp.openlibrary_id, g.openlibrary_id),
        sp.doi            = COALESCE(sp.doi,            g.doi),
        sp.google_book_id = COALESCE(sp.google_book_id, g.google_book_id),
        sp.asin           = COALESCE(sp.asin,           g.asin),
        sp.scielo_pid     = COALESCE(sp.scielo_pid,     g.scielo_pid),
        sp.wos_id         = COALESCE(sp.wos_id,         g.wos_id),
        sp.handle         = COALESCE(sp.handle,         g.handle),
        sp.pmid           = COALESCE(sp.pmid,           g.pmid),
        sp.pmcid          = COALESCE(sp.pmcid,          g.pmcid),
        sp.arxiv          = COALESCE(sp.arxiv,          g.arxiv),
        sp.oclc           = COALESCE(sp.oclc,           g.oclc),
        sp.lccn           = COALESCE(sp.lccn,           g.lccn),
        sp.lcc            = COALESCE(sp.lcc,            g.lcc),
        sp.ddc            = COALESCE(sp.ddc,            g.ddc),
        sp.wikidata_id    = COALESCE(sp.wikidata_id,    g.wikidata_id),
        sp.mag_id         = COALESCE(sp.mag_id,         g.mag_id);
  END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_compute_publication_relevance`(
    IN p_only_venue_id INT,
    IN p_mode          VARCHAR(16),
    IN p_dry_run       TINYINT
)
BEGIN
    DECLARE v_target_table VARCHAR(64);
    DECLARE v_verb         VARCHAR(32);

    
    DROP TEMPORARY TABLE IF EXISTS tmp_pub_pos;
    CREATE TEMPORARY TABLE tmp_pub_pos (
        publication_id  INT          PRIMARY KEY,
        positive_signal DECIMAL(6,2) NOT NULL
    ) ENGINE=InnoDB;

    INSERT INTO tmp_pub_pos (publication_id, positive_signal)
    SELECT p.id, MAX(weights.w)
    FROM publications p
    JOIN work_subjects ws ON ws.work_id = p.work_id
    JOIN subjects s ON s.id = ws.subject_id
    JOIN (
        
        
        SELECT subject_id, weight AS w
        FROM subject_relevance_tiers
        WHERE tier IN ('A','B','C','D','E','S')

        UNION ALL

        
        
        SELECT t.id AS subject_id, srt.weight AS w
        FROM subjects t
        JOIN subjects parent ON parent.id = t.parent_id
        JOIN subject_relevance_tiers srt
          ON srt.subject_id = parent.id
         AND srt.vocabulary = 'OpenAlex'
         AND srt.tier IN ('A','B','C','D','S')
        WHERE t.vocabulary  = 'OpenAlex'
          AND t.subject_type = 'Topic'
          AND NOT EXISTS (
              SELECT 1 FROM subject_relevance_tiers o WHERE o.subject_id = t.id
          )
    ) weights ON weights.subject_id = s.id
    WHERE (p_only_venue_id = 0 OR p.venue_id = p_only_venue_id)
    GROUP BY p.id;

    
    DROP TEMPORARY TABLE IF EXISTS tmp_pub_neg;
    CREATE TEMPORARY TABLE tmp_pub_neg (
        publication_id  INT          PRIMARY KEY,
        negative_signal DECIMAL(6,2) NOT NULL
    ) ENGINE=InnoDB;

    INSERT INTO tmp_pub_neg (publication_id, negative_signal)
    SELECT p.id, SUM(srt.weight)
    FROM publications p
    JOIN work_subjects ws ON ws.work_id = p.work_id
    JOIN subject_relevance_tiers srt
      ON srt.subject_id = ws.subject_id AND srt.tier = 'N'
    WHERE (p_only_venue_id = 0 OR p.venue_id = p_only_venue_id)
    GROUP BY p.id;

    
    DROP TEMPORARY TABLE IF EXISTS tmp_pub_scored;
    CREATE TEMPORARY TABLE tmp_pub_scored (
        publication_id   INT          PRIMARY KEY,
        work_id          INT          NOT NULL,
        venue_id         INT          NULL,
        score            DECIMAL(6,2) NOT NULL,
        rel_class        VARCHAR(16)  NOT NULL,
        positive_signal  DECIMAL(6,2) NOT NULL,
        negative_signal  DECIMAL(6,2) NOT NULL,
        venue_bonus      DECIMAL(6,2) NOT NULL,
        no_signal_flag   TINYINT(1)   NOT NULL,
        KEY idx_class (rel_class),
        KEY idx_score (score)
    ) ENGINE=InnoDB;

    INSERT INTO tmp_pub_scored
        (publication_id, work_id, venue_id, score, rel_class,
         positive_signal, negative_signal, venue_bonus, no_signal_flag)
    SELECT
        d.publication_id, d.work_id, d.venue_id, d.score,
        CASE
            WHEN d.score >= 7 THEN 'CORE'
            WHEN d.score >= 3 THEN 'ADJACENT'
            WHEN d.score >= 0 THEN 'BORDERLINE'
            ELSE 'OFF'
        END AS rel_class,
        d.positive_signal, d.negative_signal, d.venue_bonus, d.no_signal_flag
    FROM (
        SELECT
            p.id        AS publication_id,
            p.work_id   AS work_id,
            p.venue_id  AS venue_id,
            COALESCE(pp.positive_signal, 0) AS positive_signal,
            COALESCE(pn.negative_signal, 0) AS negative_signal,
            CASE
                
                
                WHEN v.type = 'SOURCE_BOOK' OR p.type IN ('BOOK','CHAPTER') THEN
                    CASE WHEN v.llm_relevance >= 4 THEN 1.0
                         WHEN v.llm_relevance  = 3 THEN 0.5
                         ELSE 0.0 END
                WHEN v.llm_relevance >= 4    THEN  1.0
                WHEN v.llm_relevance  = 3    THEN  0.5
                WHEN v.llm_relevance  = 2    THEN  0.0
                WHEN v.llm_relevance IS NULL THEN  0.0
                ELSE -0.5
            END AS venue_bonus,
            CASE WHEN pp.positive_signal IS NULL AND pn.negative_signal IS NULL THEN 1 ELSE 0 END AS no_signal_flag,
            ROUND(
                COALESCE(pp.positive_signal, 0)
              - COALESCE(pn.negative_signal, 0)
              + CASE
                    WHEN v.type = 'SOURCE_BOOK' OR p.type IN ('BOOK','CHAPTER') THEN
                        CASE WHEN v.llm_relevance >= 4 THEN 1.0
                             WHEN v.llm_relevance  = 3 THEN 0.5
                             ELSE 0.0 END
                    WHEN v.llm_relevance >= 4    THEN  1.0
                    WHEN v.llm_relevance  = 3    THEN  0.5
                    WHEN v.llm_relevance  = 2    THEN  0.0
                    WHEN v.llm_relevance IS NULL THEN  0.0
                    ELSE -0.5
                END
              + CASE WHEN pp.positive_signal IS NULL AND pn.negative_signal IS NULL
                          AND v.llm_relevance <= 1
                          AND NOT (v.type = 'SOURCE_BOOK' OR p.type IN ('BOOK','CHAPTER'))
                     THEN -1.0 ELSE 0.0 END
            , 2) AS score
        FROM publications p
        LEFT JOIN venues       v  ON v.id  = p.venue_id
        LEFT JOIN tmp_pub_pos  pp ON pp.publication_id = p.id
        LEFT JOIN tmp_pub_neg  pn ON pn.publication_id = p.id
        WHERE (p_only_venue_id = 0 OR p.venue_id = p_only_venue_id)
    ) d;

    
    IF p_dry_run = 1 THEN
        CREATE TEMPORARY TABLE IF NOT EXISTS tmp_publication_relevance_preview
            LIKE publication_relevance;
        SET v_target_table = 'tmp_publication_relevance_preview';
    ELSE
        SET v_target_table = 'publication_relevance';
    END IF;
    SET v_verb = IF(p_mode = 'incremental', 'INSERT IGNORE INTO', 'REPLACE INTO');

    SET @sql_write = CONCAT(
        v_verb, ' ', v_target_table, ' ',
        '(publication_id, work_id, venue_id, score, rel_class, ',
        ' positive_signal, negative_signal, venue_bonus, no_signal_flag, computed_at) ',
        'SELECT publication_id, work_id, venue_id, score, rel_class, ',
        ' positive_signal, negative_signal, venue_bonus, no_signal_flag, NOW() ',
        'FROM tmp_pub_scored'
    );

    PREPARE stmt FROM @sql_write;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    DROP TEMPORARY TABLE IF EXISTS tmp_pub_pos;
    DROP TEMPORARY TABLE IF EXISTS tmp_pub_neg;
    DROP TEMPORARY TABLE IF EXISTS tmp_pub_scored;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_delete_publication`(IN p_venue_id INT)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    SELECT 'Erro ao deletar' AS mensagem;
  END;

  START TRANSACTION;
  
  IF EXISTS (SELECT 1 FROM publications WHERE venue_id = p_venue_id) THEN
    DELETE FROM publications WHERE venue_id = p_venue_id;
    SELECT CONCAT('Deletado venue_id ', p_venue_id) AS mensagem;
  ELSE
    SELECT CONCAT('venue_id ', p_venue_id, ' não existe, nada feito') AS mensagem;
  END IF;
  
  COMMIT;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_disable_all_triggers`()
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
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_enable_all_triggers`()
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
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_fix_family_given_names`(IN p_batch_size INT)
BEGIN
    DECLARE v_max_id INT;
    DECLARE v_offset INT DEFAULT 0;

    SELECT MAX(id) INTO v_max_id FROM persons;

    WHILE v_offset <= v_max_id DO
        UPDATE persons
        SET

            family_name = CASE
                WHEN LOCATE(' ', TRIM(preferred_name)) > 0 THEN
                    REGEXP_SUBSTR(TRIM(preferred_name), '(?i)(\\b(do|da|dos|das|de|del|della|di|du|van der|van|von der|von|al|el|la|le|saint|sainte|mc|mac|o)\\s+)*[^\\s]+(\\s+(filho|junior|neto|sobrinho|jr|sr|iii|iv|v))?$')
                ELSE
                    TRIM(preferred_name)
            END,

            given_names = CASE
                WHEN LOCATE(' ', TRIM(preferred_name)) > 0 THEN
                    
                    
                    
                    
                    NULLIF(TRIM(SUBSTRING(TRIM(preferred_name), 1,
                        CHAR_LENGTH(TRIM(preferred_name)) - CHAR_LENGTH(
                            REGEXP_SUBSTR(TRIM(preferred_name), '(?i)(\\b(do|da|dos|das|de|del|della|di|du|van der|van|von der|von|al|el|la|le|saint|sainte|mc|mac|o)\\s+)*[^\\s]+(\\s+(filho|junior|neto|sobrinho|jr|sr|iii|iv|v))?$')
                        )
                    )), '')
                ELSE
                    NULL
            END
        WHERE id BETWEEN v_offset AND v_offset + p_batch_size
          AND preferred_name IS NOT NULL
          
          AND CHAR_LENGTH(SUBSTRING_INDEX(TRIM(preferred_name), ' ', -1)) >= 2;

        SET v_offset = v_offset + p_batch_size + 1;
    END WHILE;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_fix_family_name`(
    IN p_wrong  VARCHAR(255),
    IN p_right  VARCHAR(255)
)
BEGIN
    DECLARE v_affected INT DEFAULT 0;

    
    UPDATE IGNORE persons
    SET family_name = p_right
    WHERE family_name = p_wrong;
    SET v_affected = ROW_COUNT();

    
    UPDATE IGNORE persons
    SET preferred_name = CONCAT(LEFT(preferred_name, CHAR_LENGTH(preferred_name) - CHAR_LENGTH(p_wrong)), p_right)
    WHERE preferred_name LIKE CONCAT('% ', p_wrong)
      AND family_name = p_right;

    SELECT CONCAT(p_wrong, ' → ', p_right, ': ', v_affected, ' family_name(s) corrigido(s), ', ROW_COUNT(), ' preferred_name(s) corrigido(s)') AS resultado;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_fix_merged_work`(IN p_work_id INT)
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

        
        INSERT INTO works (title, subtitle, abstract, language, reference_count)
        SELECT title, subtitle, abstract, language, reference_count
        FROM works WHERE id = p_work_id;

        SET v_new_work_id = LAST_INSERT_ID();

        
        UPDATE publications SET work_id = v_new_work_id WHERE id = v_publication_id_to_move;
        

        
        INSERT INTO authorships (work_id, person_id, affiliation_id, role, `position`, is_corresponding)
        SELECT v_new_work_id, person_id, affiliation_id, role, `position`, is_corresponding
        FROM authorships
        WHERE work_id = p_work_id;

        INSERT INTO funding (work_id, funder_id, grant_number)
        SELECT v_new_work_id, funder_id, grant_number
        FROM funding
        WHERE work_id = p_work_id;

        INSERT INTO work_subjects (work_id, subject_id, relevance_score, assigned_by)
        SELECT v_new_work_id, subject_id, relevance_score, assigned_by
        FROM work_subjects
        WHERE work_id = p_work_id;

        INSERT INTO course_bibliography (course_id, work_id, reading_type, week_number, notes)
        SELECT course_id, v_new_work_id, reading_type, week_number, notes
        FROM course_bibliography
        WHERE work_id = p_work_id;

        SET v_unmerged_count = v_unmerged_count + 1;

    END LOOP move_loop;
    CLOSE cur_publications_to_move;

    COMMIT;
    
    IF v_unmerged_count > 0 THEN
       SELECT CONCAT('Sucesso para work_id ', p_work_id, ': ', v_unmerged_count, ' publicações desmembradas com relacionamentos duplicados por segurança.') AS status;
    END IF;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_generate_name_signature`(
    IN  p_dirty_name VARCHAR(500),
    OUT p_signature  VARCHAR(255)
)
BEGIN
    DECLARE v_clean       VARCHAR(500);
    DECLARE v_last_name   VARCHAR(255);
    DECLARE v_given_names VARCHAR(500);
    DECLARE v_initials    VARCHAR(255);
    DECLARE v_particle    VARCHAR(255);

    
    
    
    
    
    

    
    SET v_clean = TRIM(REGEXP_REPLACE(
        UPPER(p_dirty_name),
        '[.,()"\'‐−–—/\\[\\]{}#@!?;:°ªº&~`^_+=|<>]',
        ' '
    ));

    
    
    
    SET v_clean = REGEXP_REPLACE(v_clean, '([^[:alpha:]])-', '\\1 ');
    SET v_clean = REGEXP_REPLACE(v_clean, '-([^[:alpha:]])', ' \\1');
    SET v_clean = REGEXP_REPLACE(v_clean, '^-', '');
    SET v_clean = REGEXP_REPLACE(v_clean, '-$', '');

    
    SET v_clean = TRIM(REGEXP_REPLACE(v_clean, '\\s+', ' '));

    
    
    
    SET v_clean = TRIM(REGEXP_REPLACE(
        v_clean,
        '\\s+(FILHO|FILHA|JUNIOR|JÚNIOR|NETO|NETA|SOBRINHO|SOBRINHA|BISNETO|BISNETA|TERCEIRO|TERCEIRA|JR|SR|SRA|II|III|IV|V|VI|VII|VIII|IX|X)$',
        ''
    ));
    SET v_clean = TRIM(REGEXP_REPLACE(
        v_clean,
        '\\s+(FILHO|FILHA|JUNIOR|JÚNIOR|NETO|NETA|SOBRINHO|SOBRINHA|BISNETO|BISNETA|TERCEIRO|TERCEIRA|JR|SR|SRA|II|III|IV|V|VI|VII|VIII|IX|X)$',
        ''
    ));

    
    
    
    IF v_clean = '' OR v_clean IS NULL THEN
        SET p_signature = NULL;
    ELSEIF LOCATE(' ', v_clean) = 0 THEN
        IF CHAR_LENGTH(v_clean) > 1 THEN
            SET p_signature = v_clean;
        ELSE
            SET p_signature = NULL;
        END IF;
    ELSE
        
        
        
        
        

        SET v_particle = NULL;

        
        SET v_particle = REGEXP_SUBSTR(
            v_clean,
            '\\b(VAN DER|VAN DEN|VAN DE|VON DER|VON DEM|DE LA|DE LOS|DE LAS|DE LO)\\s+[^\\s]+$'
        );

        
        IF v_particle IS NULL OR v_particle = '' THEN
            SET v_particle = REGEXP_SUBSTR(
                v_clean,
                '\\b(DO|DA|DOS|DAS|DE|DEL|DELA|DELLA|DELLE|DELLO|DEGLI|DI|DU|DES|VAN|VON|AL|EL|LA|LE|LES|LO|LOS|LAS|SAINT|SAINTE|SAN|SANTA|SANTO|MC|MAC|O|BEN|BIN|IBN|AB|AP|AUF|ZU|ZUM|ZUR|TER|TEN)\\s+[^\\s]+$'
            );
        END IF;

        
        IF v_particle IS NOT NULL AND v_particle != '' THEN
            SET v_last_name = v_particle;
        ELSE
            SET v_last_name = REGEXP_SUBSTR(v_clean, '[^\\s]+$');
        END IF;

        IF v_last_name IS NULL OR v_last_name = '' THEN
            SET p_signature = NULL;
        ELSE
            
            
            
            SET v_given_names = TRIM(SUBSTRING(
                v_clean, 1,
                CHAR_LENGTH(v_clean) - CHAR_LENGTH(v_last_name)
            ));

            
            
            
            
            
            IF v_given_names != '' AND v_given_names IS NOT NULL THEN
                SET v_initials = TRIM(REGEXP_REPLACE(
                    v_given_names,
                    '\\b([[:alpha:]])[^\\s]*\\s*',
                    '\\1 '
                ));
                SET p_signature = CONCAT(v_last_name, ' ', v_initials);
            ELSE
                SET p_signature = v_last_name;
            END IF;
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
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_merge_manifestations`(IN p_apply TINYINT)
BEGIN
  
  INSERT IGNORE INTO work_manifest_audit (loser_work_id, survivor_work_id, loser_work_json, moved_pub_ids)
  SELECT m.loser_work_id, m.survivor_work_id,
    JSON_OBJECT('id',w.id,'title',w.title,'subtitle',w.subtitle,'language',w.language,'has_abstract',(w.abstract IS NOT NULL)),
    (SELECT GROUP_CONCAT(p.id) FROM publications p WHERE p.work_id=m.loser_work_id)
  FROM work_manifest_map m JOIN works w ON w.id=m.loser_work_id;

  
  

  IF p_apply = 1 THEN
    
    INSERT IGNORE INTO multi_manifestation_works (work_id)
      SELECT DISTINCT survivor_work_id FROM work_manifest_map;

    
    UPDATE IGNORE authorships         a JOIN work_manifest_map m ON a.work_id=m.loser_work_id        SET a.work_id=m.survivor_work_id;
    UPDATE IGNORE work_subjects       s JOIN work_manifest_map m ON s.work_id=m.loser_work_id        SET s.work_id=m.survivor_work_id;
    UPDATE IGNORE work_references     r JOIN work_manifest_map m ON r.citing_work_id=m.loser_work_id SET r.citing_work_id=m.survivor_work_id;
    UPDATE        work_references     r JOIN work_manifest_map m ON r.cited_work_id=m.loser_work_id  SET r.cited_work_id=m.survivor_work_id;
    UPDATE IGNORE funding             f JOIN work_manifest_map m ON f.work_id=m.loser_work_id        SET f.work_id=m.survivor_work_id;
    UPDATE IGNORE course_bibliography c JOIN work_manifest_map m ON c.work_id=m.loser_work_id        SET c.work_id=m.survivor_work_id;
    
    UPDATE        publications      p JOIN work_manifest_map m ON p.reviewed_id=m.loser_work_id      SET p.reviewed_id=m.survivor_work_id;

    
    UPDATE publications p JOIN work_manifest_map m ON p.work_id=m.loser_work_id SET p.work_id=m.survivor_work_id;

    
    DELETE w FROM works w JOIN work_manifest_map m ON w.id=m.loser_work_id;
  END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_merge_organizations_by_map`(IN p_batch INT)
proc_body: BEGIN
    DECLARE v_lo INT;
    DECLARE v_hi INT;
    DECLARE v_cur INT;
    DECLARE v_end INT;

    IF p_batch IS NULL OR p_batch < 1 THEN SET p_batch = 20000; END IF;

    SELECT MIN(secondary_id), MAX(secondary_id) INTO v_lo, v_hi FROM organization_merge_map;
    IF v_lo IS NULL THEN
        SELECT 'organization_merge_map is empty; nothing to merge.' AS status;
        LEAVE proc_body;
    END IF;

    SET v_cur = v_lo;
    WHILE v_cur <= v_hi DO
        SET v_end = v_cur + p_batch - 1;

        
        INSERT INTO organization_merge_audit
            (secondary_id, primary_id, secondary_name, secondary_type,
             secondary_ror, secondary_openalex, secondary_wikidata, match_tier)
        SELECT m.secondary_id, m.primary_id, s.name, s.type,
               s.ror_id, s.openalex_id, s.wikidata_id, m.match_tier
        FROM organization_merge_map m
        JOIN organizations s ON s.id = m.secondary_id
        WHERE m.secondary_id BETWEEN v_cur AND v_end;

        
        UPDATE organizations p
        JOIN (
            SELECT m.primary_id,
                   MAX(s.country_code) AS cc,
                   MAX(s.city)         AS city,
                   MAX(s.url)          AS url
            FROM organization_merge_map m
            JOIN organizations s ON s.id = m.secondary_id
            WHERE m.secondary_id BETWEEN v_cur AND v_end
            GROUP BY m.primary_id
        ) x ON p.id = x.primary_id
        SET p.country_code = COALESCE(p.country_code, x.cc),
            p.city         = COALESCE(p.city, x.city),
            p.url          = COALESCE(p.url, x.url),
            p.updated_at   = NOW();

        
        UPDATE IGNORE authorships a JOIN organization_merge_map m ON a.affiliation_id = m.secondary_id
            SET a.affiliation_id = m.primary_id WHERE m.secondary_id BETWEEN v_cur AND v_end;
        UPDATE IGNORE funding f JOIN organization_merge_map m ON f.funder_id = m.secondary_id
            SET f.funder_id = m.primary_id WHERE m.secondary_id BETWEEN v_cur AND v_end;
        UPDATE IGNORE programs pr JOIN organization_merge_map m ON pr.institution_id = m.secondary_id
            SET pr.institution_id = m.primary_id WHERE m.secondary_id BETWEEN v_cur AND v_end;
        UPDATE IGNORE publications pub JOIN organization_merge_map m ON pub.publisher_id = m.secondary_id
            SET pub.publisher_id = m.primary_id WHERE m.secondary_id BETWEEN v_cur AND v_end;
        UPDATE IGNORE venues v JOIN organization_merge_map m ON v.publisher_id = m.secondary_id
            SET v.publisher_id = m.primary_id WHERE m.secondary_id BETWEEN v_cur AND v_end;

        UPDATE IGNORE organization_relationships r JOIN organization_merge_map m ON r.parent_id = m.secondary_id
            SET r.parent_id = m.primary_id WHERE m.secondary_id BETWEEN v_cur AND v_end;
        UPDATE IGNORE organization_relationships r JOIN organization_merge_map m ON r.child_id = m.secondary_id
            SET r.child_id = m.primary_id WHERE m.secondary_id BETWEEN v_cur AND v_end;
        DELETE FROM organization_relationships WHERE parent_id = child_id;

        
        DELETE s FROM organizations s JOIN organization_merge_map m ON s.id = m.secondary_id
            WHERE m.secondary_id BETWEEN v_cur AND v_end;

        COMMIT;
        SET v_cur = v_end + 1;
    END WHILE;

    SELECT CONCAT('Merged ', (SELECT COUNT(*) FROM organization_merge_audit),
                  ' organizations via map.') AS status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_merge_persons_in_batches`()
BEGIN
    DECLARE v_batch_size INT DEFAULT 1000;
    DECLARE v_rows_affected INT;
    DECLARE v_total_processed INT DEFAULT 0;
    DECLARE v_continue BOOLEAN DEFAULT TRUE;

    
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_batch (
        primary_person_id INT,
        secondary_person_id INT,
        PRIMARY KEY (secondary_person_id)
    ) ENGINE=InnoDB;

    
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_keys_to_transfer (
        primary_person_id INT,
        secondary_person_id INT,
        orcid VARCHAR(20),
        scopus_id VARCHAR(50),
        lattes_id VARCHAR(20),
        signature_id INT UNSIGNED,
        sec_is_verified TINYINT(1),
        PRIMARY KEY (secondary_person_id)
    ) ENGINE=InnoDB;

    REPEAT
        TRUNCATE TABLE temp_batch;
        TRUNCATE TABLE temp_keys_to_transfer;

        
        INSERT INTO temp_batch (primary_person_id, secondary_person_id)
        SELECT primary_person_id, secondary_person_id
        FROM temp_person_merge_pairs
        LIMIT v_batch_size;

        SET v_rows_affected = ROW_COUNT();
        SET v_continue = (v_rows_affected > 0);
        SET v_total_processed = v_total_processed + v_rows_affected;

        IF v_continue THEN
            START TRANSACTION;

            
            INSERT INTO temp_keys_to_transfer (
                primary_person_id, secondary_person_id, orcid, scopus_id, lattes_id, signature_id, sec_is_verified
            )
            SELECT
                p_primary.id,
                p_secondary.id,
                CASE WHEN p_primary.orcid IS NULL THEN p_secondary.orcid ELSE NULL END,
                CASE WHEN p_primary.scopus_id IS NULL THEN p_secondary.scopus_id ELSE NULL END,
                CASE WHEN p_primary.lattes_id IS NULL THEN p_secondary.lattes_id ELSE NULL END,
                CASE WHEN p_primary.signature_id IS NULL THEN p_secondary.signature_id ELSE NULL END,
                p_secondary.is_verified
            FROM persons p_primary
            JOIN temp_batch t ON p_primary.id = t.primary_person_id
            JOIN persons p_secondary ON p_secondary.id = t.secondary_person_id;

            
            UPDATE persons p
            JOIN temp_keys_to_transfer temp ON p.id = temp.secondary_person_id
            SET p.orcid = NULL, p.scopus_id = NULL, p.lattes_id = NULL;

            
            UPDATE persons p
            JOIN temp_keys_to_transfer temp ON p.id = temp.primary_person_id
            SET
                p.orcid = COALESCE(p.orcid, temp.orcid),
                p.scopus_id = COALESCE(p.scopus_id, temp.scopus_id),
                p.lattes_id = COALESCE(p.lattes_id, temp.lattes_id),
                p.signature_id = COALESCE(p.signature_id, temp.signature_id),
                p.is_verified = GREATEST(p.is_verified, temp.sec_is_verified);

            
            UPDATE IGNORE authorships a JOIN temp_batch t ON a.person_id = t.secondary_person_id SET a.person_id = t.primary_person_id;
            UPDATE IGNORE course_instructors ci JOIN temp_batch t ON ci.person_id = t.secondary_person_id SET ci.person_id = t.primary_person_id;
            UPDATE IGNORE course_instructors ci JOIN temp_batch t ON ci.canonical_person_id = t.secondary_person_id SET ci.canonical_person_id = t.primary_person_id;

            
            DELETE FROM persons WHERE id IN (SELECT secondary_person_id FROM temp_batch);
            DELETE FROM temp_person_merge_pairs WHERE secondary_person_id IN (SELECT secondary_person_id FROM temp_batch);

            COMMIT;
        END IF;

    UNTIL NOT v_continue END REPEAT;

    DROP TEMPORARY TABLE IF EXISTS temp_batch;
    DROP TEMPORARY TABLE IF EXISTS temp_keys_to_transfer;
    
    SELECT CONCAT('Merge concluído. Total processado: ', v_total_processed) AS status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_merge_persons_list`(
    IN p_primary_id INT,
    IN p_secondary_ids TEXT
)
BEGIN
    DECLARE v_len INT;
    DECLARE v_pos INT DEFAULT 1;
    DECLARE v_comma_pos INT;
    DECLARE v_id_str VARCHAR(20);

    IF p_primary_id IS NULL OR p_secondary_ids IS NULL OR p_secondary_ids = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid parameters provided for unification.';
    END IF;

    
    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_merge_sec_ids (
        id INT PRIMARY KEY
    ) ENGINE=InnoDB;
    TRUNCATE TABLE tmp_merge_sec_ids;

    
    SET v_len = CHAR_LENGTH(p_secondary_ids);
    WHILE v_pos <= v_len DO
        SET v_comma_pos = LOCATE(',', p_secondary_ids, v_pos);
        IF v_comma_pos = 0 THEN
            SET v_comma_pos = v_len + 1;
        END IF;
        SET v_id_str = TRIM(SUBSTRING(p_secondary_ids, v_pos, v_comma_pos - v_pos));
        
        IF v_id_str REGEXP '^[0-9]+$' THEN
            INSERT IGNORE INTO tmp_merge_sec_ids (id) VALUES (CAST(v_id_str AS UNSIGNED));
        END IF;
        SET v_pos = v_comma_pos + 1;
    END WHILE;

    
    DELETE FROM tmp_merge_sec_ids WHERE id = p_primary_id;

    
    IF (SELECT COUNT(*) FROM tmp_merge_sec_ids) > 0 THEN
        START TRANSACTION;

        
        UPDATE persons p
        JOIN (
            SELECT
                MAX(orcid) AS max_orcid,
                MAX(scopus_id) AS max_scopus,
                MAX(lattes_id) AS max_lattes,
                MAX(signature_id) AS max_sig,
                MAX(is_verified) AS max_verified
            FROM persons
            WHERE id IN (SELECT id FROM tmp_merge_sec_ids)
        ) sec_data
        SET
            p.orcid = COALESCE(p.orcid, sec_data.max_orcid),
            p.scopus_id = COALESCE(p.scopus_id, sec_data.max_scopus),
            p.lattes_id = COALESCE(p.lattes_id, sec_data.max_lattes),
            p.signature_id = COALESCE(p.signature_id, sec_data.max_sig),
            p.is_verified = GREATEST(COALESCE(p.is_verified, 0), COALESCE(sec_data.max_verified, 0))
        WHERE p.id = p_primary_id;

        
        UPDATE IGNORE authorships a
        JOIN tmp_merge_sec_ids t ON a.person_id = t.id
        SET a.person_id = p_primary_id;

        UPDATE IGNORE course_instructors ci
        JOIN tmp_merge_sec_ids t ON ci.person_id = t.id
        SET ci.person_id = p_primary_id;

        UPDATE IGNORE course_instructors ci
        JOIN tmp_merge_sec_ids t ON ci.canonical_person_id = t.id
        SET ci.canonical_person_id = p_primary_id;

        
        DELETE p FROM persons p
        JOIN tmp_merge_sec_ids t ON p.id = t.id;

        COMMIT;

        
        CALL sp_update_person_stats(p_primary_id);
        CALL sp_update_person_h_index(p_primary_id);
    END IF;

    DROP TEMPORARY TABLE IF EXISTS tmp_merge_sec_ids;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_merge_single_organization_pair`(
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
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_merge_venues_by_map`(IN p_apply TINYINT)
BEGIN
    IF p_apply = 0 THEN
        SELECT
            (SELECT COUNT(*) FROM venue_merge_map) AS secondaries,
            (SELECT COUNT(DISTINCT primary_id) FROM venue_merge_map) AS survivors,
            (SELECT COUNT(*) FROM publications p JOIN venue_merge_map m ON p.venue_id = m.secondary_id) AS pubs_to_remap,
            (SELECT COUNT(*) FROM venue_subjects vs JOIN venue_merge_map m ON vs.venue_id = m.secondary_id) AS subjects_to_union;
    ELSE
        
        INSERT INTO venue_merge_audit (secondary_id, primary_id, isbn13, snapshot, moved_pubs, moved_subjects)
        SELECT m.secondary_id, m.primary_id, m.isbn13,
               JSON_OBJECT('id', v.id, 'name', v.name, 'type', v.type, 'isbn13', v.isbn13,
                           'issn', v.issn, 'eissn', v.eissn, 'openalex_id', v.openalex_id,
                           'publisher_id', v.publisher_id, 'country_code', v.country_code,
                           'homepage_url', v.homepage_url, 'aggregation_type', v.aggregation_type,
                           'wikidata_id', v.wikidata_id),
               (SELECT COUNT(*) FROM publications p WHERE p.venue_id = m.secondary_id),
               (SELECT COUNT(*) FROM venue_subjects vs WHERE vs.venue_id = m.secondary_id)
        FROM venue_merge_map m JOIN venues v ON v.id = m.secondary_id;

        
        UPDATE publications p JOIN venue_merge_map m ON p.venue_id = m.secondary_id
            SET p.venue_id = m.primary_id;
        INSERT IGNORE INTO venue_subjects (venue_id, subject_id, score, source)
            SELECT m.primary_id, vs.subject_id, vs.score, vs.source
            FROM venue_subjects vs JOIN venue_merge_map m ON vs.venue_id = m.secondary_id;
        DELETE vs FROM venue_subjects vs JOIN venue_merge_map m ON vs.venue_id = m.secondary_id;

        
        DELETE v FROM venues v JOIN venue_merge_map m ON v.id = m.secondary_id;

        SELECT (SELECT COUNT(*) FROM venue_merge_audit) AS audited_secondaries,
               ROW_COUNT() AS venues_deleted;
    END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_merge_works_by_map`(IN p_apply TINYINT)
BEGIN
  
  INSERT IGNORE INTO work_merge_audit
    (loser_work_id, survivor_work_id, sig, loser_title, loser_doi, loser_openalex_id, loser_pub_id, loser_pub_json, loser_work_json)
  SELECT m.loser_work_id, m.survivor_work_id, m.sig, LEFT(w.title,1000), lp.doi, lp.openalex_id, m.loser_pub_id,
    JSON_OBJECT('id',lp.id,'work_id',lp.work_id,'doi',lp.doi,'openalex_id',lp.openalex_id,'isbn',lp.isbn,
      'scielo_pid',lp.scielo_pid,'pmid',lp.pmid,'pmcid',lp.pmcid,'arxiv',lp.arxiv,'wos_id',lp.wos_id,
      'handle',lp.handle,'wikidata_id',lp.wikidata_id,'mag_id',lp.mag_id,'asin',lp.asin,
      'google_book_id',lp.google_book_id,'openlibrary_id',lp.openlibrary_id,'oclc',lp.oclc,'lccn',lp.lccn,
      'lcc',lp.lcc,'ddc',lp.ddc,'venue_id',lp.venue_id,'type',lp.type,'external_ids',lp.external_ids,
      'publication_date',lp.publication_date,'volume',lp.volume,'issue',lp.issue,'pages',lp.pages),
    JSON_OBJECT('id',w.id,'title',w.title,'subtitle',w.subtitle,'language',w.language,'has_abstract',(w.abstract IS NOT NULL))
  FROM work_merge_map m
  JOIN works w ON w.id=m.loser_work_id
  LEFT JOIN publications lp ON lp.id=m.loser_pub_id;

  
  
  

  IF p_apply = 1 THEN
    
    
    
    UPDATE IGNORE authorships       a JOIN work_merge_map m ON a.work_id=m.loser_work_id        SET a.work_id=m.survivor_work_id;
    UPDATE IGNORE work_subjects     s JOIN work_merge_map m ON s.work_id=m.loser_work_id        SET s.work_id=m.survivor_work_id;
    UPDATE IGNORE work_references   r JOIN work_merge_map m ON r.citing_work_id=m.loser_work_id SET r.citing_work_id=m.survivor_work_id;
    UPDATE        work_references   r JOIN work_merge_map m ON r.cited_work_id=m.loser_work_id  SET r.cited_work_id=m.survivor_work_id;
    UPDATE IGNORE funding           f JOIN work_merge_map m ON f.work_id=m.loser_work_id        SET f.work_id=m.survivor_work_id;
    UPDATE IGNORE course_bibliography c JOIN work_merge_map m ON c.work_id=m.loser_work_id      SET c.work_id=m.survivor_work_id;
    
    UPDATE        publications      p JOIN work_merge_map m ON p.reviewed_id=m.loser_work_id  SET p.reviewed_id=m.survivor_work_id;

    
    UPDATE IGNORE files fi JOIN work_merge_map m ON fi.publication_id=m.loser_pub_id SET fi.publication_id=m.survivor_pub_id;

    
    DELETE p FROM publications p JOIN work_merge_map m ON p.id=m.loser_pub_id;

    
    
    UPDATE publications sp
    JOIN (SELECT m.survivor_pub_id, MIN(a.loser_openalex_id) AS oaid
          FROM work_merge_map m JOIN work_merge_audit a ON a.loser_work_id=m.loser_work_id
          WHERE a.loser_openalex_id IS NOT NULL GROUP BY m.survivor_pub_id) g ON sp.id=g.survivor_pub_id
    SET sp.openalex_id = g.oaid
    WHERE sp.openalex_id IS NULL;

    
    UPDATE publications sp
    JOIN (SELECT m.survivor_pub_id, JSON_ARRAYAGG(a.loser_doi) AS aliases
          FROM work_merge_map m JOIN work_merge_audit a ON a.loser_work_id=m.loser_work_id
          WHERE a.loser_doi IS NOT NULL GROUP BY m.survivor_pub_id) g ON sp.id=g.survivor_pub_id
    SET sp.external_ids = JSON_MERGE_PATCH(COALESCE(sp.external_ids,'{}'), JSON_OBJECT('merged_doi', g.aliases));

    
    DELETE w FROM works w JOIN work_merge_map m ON w.id=m.loser_work_id;
  END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_normalize_publications_data`()
BEGIN
    
    
    UPDATE publications
    SET 
        pmid = CASE WHEN LOWER(pmid) IN ('none', 'null', 'nan', '') THEN NULL ELSE pmid END,
        pmcid = CASE WHEN LOWER(pmcid) IN ('none', 'null', 'nan', '') THEN NULL ELSE pmcid END,
        isbn = CASE WHEN LOWER(isbn) IN ('none', 'null', 'nan', '') THEN NULL ELSE isbn END,
        asin = CASE WHEN LOWER(asin) IN ('none', 'null', 'nan', '') THEN NULL ELSE asin END,
        udc = CASE WHEN LOWER(udc) IN ('none', 'null', 'nan', '') THEN NULL ELSE udc END,
        lbc = CASE WHEN LOWER(lbc) IN ('none', 'null', 'nan', '') THEN NULL ELSE lbc END,
        ddc = CASE WHEN LOWER(ddc) IN ('none', 'null', 'nan', '') THEN NULL ELSE ddc END,
        lcc = CASE WHEN LOWER(lcc) IN ('none', 'null', 'nan', '') THEN NULL ELSE lcc END,
        google_book_id = CASE WHEN LOWER(google_book_id) IN ('none', 'null', 'nan', '') THEN NULL ELSE google_book_id END,
        volume = CASE WHEN LOWER(volume) IN ('none', 'null', 'nan', '') THEN NULL ELSE volume END,
        issue = CASE WHEN LOWER(issue) IN ('none', 'null', 'nan', '') THEN NULL ELSE issue END,
        pages = CASE WHEN LOWER(pages) IN ('none', 'null', 'nan', '') THEN NULL ELSE pages END
    WHERE 
        LOWER(pmid) IN ('none', 'null', 'nan', '') OR
        LOWER(pmcid) IN ('none', 'null', 'nan', '') OR
        LOWER(isbn) IN ('none', 'null', 'nan', '') OR
        LOWER(asin) IN ('none', 'null', 'nan', '') OR
        LOWER(udc) IN ('none', 'null', 'nan', '') OR
        LOWER(lbc) IN ('none', 'null', 'nan', '') OR
        LOWER(ddc) IN ('none', 'null', 'nan', '') OR
        LOWER(lcc) IN ('none', 'null', 'nan', '') OR
        LOWER(google_book_id) IN ('none', 'null', 'nan', '') OR
        LOWER(volume) IN ('none', 'null', 'nan', '') OR
        LOWER(issue) IN ('none', 'null', 'nan', '') OR
        LOWER(pages) IN ('none', 'null', 'nan', '');

    
    
    UPDATE publications
    SET volume = NULL
    WHERE volume LIKE '10.%/%';

    UPDATE publications
    SET issue = NULL
    WHERE issue LIKE '10.%/%';

    
    
    UPDATE publications
    SET isbn = LEFT(REPLACE(SUBSTRING_INDEX(isbn, ',', 1), '-', ''), 20)
    WHERE isbn LIKE '%-%' OR isbn LIKE '%,%';

    
    
    UPDATE publications
    SET pages = TRIM(REGEXP_REPLACE(pages, '(?i)\\s+p\\.?$|\\s+pp\\.?$', ''))
    WHERE pages REGEXP '(?i)\\s+p\\.?$|\\s+pp\\.?$';

    
    UPDATE publications
    SET pages = TRIM(pages)
    WHERE pages != TRIM(pages);

    
    SELECT 'Procedimento de normalização dos metadados concluído com sucesso.' AS status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_normalize_publication_issues`()
BEGIN
    DECLARE v_vol_volume INT DEFAULT 0;
    DECLARE v_v_dot INT DEFAULT 0;
    DECLARE v_n_sign INT DEFAULT 0;
    DECLARE v_no_dot INT DEFAULT 0;
    DECLARE v_no_space INT DEFAULT 0;
    DECLARE v_n_o_space INT DEFAULT 0;
    DECLARE v_n_digit INT DEFAULT 0;
    DECLARE v_nr_space INT DEFAULT 0;
    DECLARE v_num_form INT DEFAULT 0;
    DECLARE v_number INT DEFAULT 0;
    DECLARE v_hash INT DEFAULT 0;
    DECLARE v_band INT DEFAULT 0;
    DECLARE v_tomo INT DEFAULT 0;
    DECLARE v_roman INT DEFAULT 0;

    
    UPDATE publications
    SET issue = TRIM(REGEXP_REPLACE(issue, '(?i)^vol(ume)?\\.?[\\s,]*', ''))
    WHERE issue REGEXP '(?i)^vol(ume)?\\.?[\\s,]+'
       OR issue REGEXP '(?i)^vol(ume)?\\.[0-9]';
    SET v_vol_volume = ROW_COUNT();

    
    UPDATE publications
    SET issue = TRIM(REGEXP_REPLACE(issue, '(?i)^v\\.\\s*', ''))
    WHERE issue REGEXP '(?i)^v\\.\\s*[0-9IVXLCDM]';
    SET v_v_dot = ROW_COUNT();

    
    UPDATE publications
    SET issue = TRIM(REGEXP_REPLACE(issue, '(?i)^n[°º]\\.?\\s*', ''))
    WHERE issue REGEXP '^[Nn][°º]';
    SET v_n_sign = ROW_COUNT();

    
    UPDATE publications
    SET issue = TRIM(REGEXP_REPLACE(issue, '(?i)^no\\.\\s*', ''))
    WHERE issue REGEXP '(?i)^no\\.';
    SET v_no_dot = ROW_COUNT();

    
    UPDATE publications
    SET issue = TRIM(REGEXP_REPLACE(issue, '(?i)^no\\s*', ''))
    WHERE issue REGEXP '(?i)^no\\s+[0-9IVXLCDM]'
       OR issue REGEXP '(?i)^no[0-9]';
    SET v_no_space = ROW_COUNT();

    
    UPDATE publications
    SET issue = TRIM(REGEXP_REPLACE(issue, '(?i)^n\\s+o\\s+', ''))
    WHERE issue REGEXP '(?i)^n\\s+o\\s+[0-9IVXLCDM]';
    SET v_n_o_space = ROW_COUNT();

    
    
    
    UPDATE publications
    SET issue = TRIM(REGEXP_REPLACE(issue, '(?i)^n', ''))
    WHERE issue REGEXP '(?i)^n[0-9]';
    SET v_n_digit = ROW_COUNT();

    
    UPDATE publications
    SET issue = TRIM(REGEXP_REPLACE(issue, '(?i)^nr\\.?\\s+', ''))
    WHERE issue REGEXP '(?i)^nr\\.?\\s+[0-9IVXLCDM]';
    SET v_nr_space = ROW_COUNT();

    
    UPDATE publications
    SET issue = TRIM(REGEXP_REPLACE(issue, '(?i)^n[uú]m([eé]ro)?\\.?\\s+', ''))
    WHERE issue REGEXP '(?i)^n[uú]m';
    SET v_num_form = ROW_COUNT();

    
    UPDATE publications
    SET issue = TRIM(REGEXP_REPLACE(issue, '(?i)^number\\s+', ''))
    WHERE issue REGEXP '(?i)^number\\s+[0-9IVXLCDM]';
    SET v_number = ROW_COUNT();

    
    UPDATE publications
    SET issue = TRIM(REGEXP_REPLACE(issue, '^#\\s*', ''))
    WHERE issue LIKE '#%';
    SET v_hash = ROW_COUNT();

    
    UPDATE publications
    SET issue = TRIM(REGEXP_REPLACE(issue, '(?i)^bd\\.?\\s+', ''))
    WHERE issue REGEXP '(?i)^bd\\.?\\s+[0-9IVXLCDM]';
    SET v_band = ROW_COUNT();

    
    UPDATE publications
    SET issue = TRIM(REGEXP_REPLACE(issue, '(?i)^(tomo\\s+|t\\.\\s*)', ''))
    WHERE issue REGEXP '(?i)^tomo\\s+[0-9IVXLCDM]'
       OR issue REGEXP '(?i)^t\\.\\s*[0-9IVXLCDM]';
    SET v_tomo = ROW_COUNT();
    
    UPDATE publications
    SET publication_date = CASE
        WHEN YEAR(publication_date) >= 2100 AND YEAR(publication_date) <= 2199 THEN DATE_SUB(publication_date, INTERVAL 100 YEAR)
        WHEN YEAR(publication_date) >= 2200 AND YEAR(publication_date) <= 2299 THEN DATE_SUB(publication_date, INTERVAL 200 YEAR)
        WHEN YEAR(publication_date) >= 2030 AND YEAR(publication_date) <= 2039 THEN DATE_SUB(publication_date, INTERVAL 10 YEAR)
        ELSE publication_date
        END
    WHERE YEAR(publication_date) > YEAR(CURDATE());

    
    UPDATE IGNORE publications
    SET issue = CAST(fn_roman_to_int(issue) AS CHAR)
    WHERE issue REGEXP '^[IVXLCDMivxlcdm]+$'
      AND fn_roman_to_int(issue) IS NOT NULL
      AND fn_roman_to_int(issue) > 0;
    SET v_roman = ROW_COUNT();

    SELECT
        v_vol_volume  AS stripped_vol,
        v_v_dot       AS stripped_v_dot,
        v_n_sign      AS stripped_n_sign,
        v_no_dot      AS stripped_no_dot,
        v_no_space    AS stripped_no_space,
        v_n_o_space   AS stripped_n_o_space,
        v_n_digit     AS stripped_n_digit,
        v_nr_space    AS stripped_nr,
        v_num_form    AS stripped_num,
        v_number      AS stripped_number,
        v_hash        AS stripped_hash,
        v_band        AS stripped_bd,
        v_tomo        AS stripped_tomo,
        v_roman       AS roman_to_decimal;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_normalize_publication_volumes`()
BEGIN
    DECLARE v_vol_volume INT DEFAULT 0;
    DECLARE v_v_dot INT DEFAULT 0;
    DECLARE v_n_sign INT DEFAULT 0;
    DECLARE v_no_dot INT DEFAULT 0;
    DECLARE v_no_space INT DEFAULT 0;
    DECLARE v_n_o_space INT DEFAULT 0;
    DECLARE v_nr_space INT DEFAULT 0;
    DECLARE v_num_form INT DEFAULT 0;
    DECLARE v_number INT DEFAULT 0;
    DECLARE v_hash INT DEFAULT 0;
    DECLARE v_band INT DEFAULT 0;
    DECLARE v_tomo INT DEFAULT 0;
    DECLARE v_roman INT DEFAULT 0;

    
    UPDATE publications
    SET volume = TRIM(REGEXP_REPLACE(volume, '(?i)^vol(ume)?\\.?[\\s,]*', ''))
    WHERE volume REGEXP '(?i)^vol(ume)?\\.?[\\s,]+'
       OR volume REGEXP '(?i)^vol(ume)?\\.[0-9]';
    SET v_vol_volume = ROW_COUNT();

    
    UPDATE publications
    SET volume = TRIM(REGEXP_REPLACE(volume, '(?i)^v\\.\\s*', ''))
    WHERE volume REGEXP '(?i)^v\\.\\s*[0-9IVXLCDM]';
    SET v_v_dot = ROW_COUNT();

    
    UPDATE publications
    SET volume = TRIM(REGEXP_REPLACE(volume, '(?i)^n[°º]\\.?\\s*', ''))
    WHERE volume REGEXP '^[Nn][°º]';
    SET v_n_sign = ROW_COUNT();

    
    UPDATE publications
    SET volume = TRIM(REGEXP_REPLACE(volume, '(?i)^no\\.\\s*', ''))
    WHERE volume REGEXP '(?i)^no\\.';
    SET v_no_dot = ROW_COUNT();

    
    
    
    UPDATE publications
    SET volume = TRIM(REGEXP_REPLACE(volume, '(?i)^no\\s*', ''))
    WHERE volume REGEXP '(?i)^no\\s+[0-9IVXLCDM]'
       OR volume REGEXP '(?i)^no[0-9]';
    SET v_no_space = ROW_COUNT();

    
    UPDATE publications
    SET volume = TRIM(REGEXP_REPLACE(volume, '(?i)^n\\s+o\\s+', ''))
    WHERE volume REGEXP '(?i)^n\\s+o\\s+[0-9IVXLCDM]';
    SET v_n_o_space = ROW_COUNT();

    
    UPDATE publications
    SET volume = TRIM(REGEXP_REPLACE(volume, '(?i)^nr\\.?\\s+', ''))
    WHERE volume REGEXP '(?i)^nr\\.?\\s+[0-9IVXLCDM]';
    SET v_nr_space = ROW_COUNT();

    
    UPDATE publications
    SET volume = TRIM(REGEXP_REPLACE(volume, '(?i)^n[uú]m([eé]ro)?\\.?\\s+', ''))
    WHERE volume REGEXP '(?i)^n[uú]m';
    SET v_num_form = ROW_COUNT();

    
    UPDATE publications
    SET volume = TRIM(REGEXP_REPLACE(volume, '(?i)^number\\s+', ''))
    WHERE volume REGEXP '(?i)^number\\s+[0-9IVXLCDM]';
    SET v_number = ROW_COUNT();

    
    UPDATE publications
    SET volume = TRIM(REGEXP_REPLACE(volume, '^#\\s*', ''))
    WHERE volume LIKE '#%';
    SET v_hash = ROW_COUNT();

    
    UPDATE publications
    SET volume = TRIM(REGEXP_REPLACE(volume, '(?i)^bd\\.?\\s+', ''))
    WHERE volume REGEXP '(?i)^bd\\.?\\s+[0-9IVXLCDM]';
    SET v_band = ROW_COUNT();

    
    UPDATE publications
    SET volume = TRIM(REGEXP_REPLACE(volume, '(?i)^(tomo\\s+|t\\.\\s*)', ''))
    WHERE volume REGEXP '(?i)^tomo\\s+[0-9IVXLCDM]'
       OR volume REGEXP '(?i)^t\\.\\s*[0-9IVXLCDM]';
    SET v_tomo = ROW_COUNT();

    
    
    
    
    UPDATE IGNORE publications
    SET volume = CAST(fn_roman_to_int(volume) AS CHAR)
    WHERE volume REGEXP '^[IVXLCDMivxlcdm]+$'
      AND fn_roman_to_int(volume) IS NOT NULL
      AND fn_roman_to_int(volume) > 0;
    SET v_roman = ROW_COUNT();

    SELECT
        v_vol_volume  AS stripped_vol,
        v_v_dot       AS stripped_v_dot,
        v_n_sign      AS stripped_n_sign,
        v_no_dot      AS stripped_no_dot,
        v_no_space    AS stripped_no_space,
        v_n_o_space   AS stripped_n_o_space,
        v_nr_space    AS stripped_nr,
        v_num_form    AS stripped_num,
        v_number      AS stripped_number,
        v_hash        AS stripped_hash,
        v_band        AS stripped_bd,
        v_tomo        AS stripped_tomo,
        v_roman       AS roman_to_decimal;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`%` PROCEDURE `sp_populate_metrics_annual_summary`()
BEGIN
    INSERT INTO metrics_annual_summary (
        year, 
        total_publications, 
        unique_works, 
        open_access_count,
        articles, 
        books, 
        avg_citations, 
        unique_organizations, 
        refreshed_at
    )
    WITH org_counts AS (
        SELECT 
            p.year, 
            COUNT(DISTINCT a.affiliation_id) AS unique_orgs
        FROM publications p
        JOIN authorships a ON p.work_id = a.work_id
        WHERE p.year IS NOT NULL 
          AND a.affiliation_id IS NOT NULL
        GROUP BY p.year
    )
    SELECT
        p.year,
        COUNT(p.id) AS total_publications,
        COUNT(DISTINCT p.work_id) AS unique_works,
        SUM(p.open_access) AS open_access_count,
        SUM(CASE WHEN p.type = 'ARTICLE' THEN 1 ELSE 0 END) AS articles,
        SUM(CASE WHEN p.type = 'BOOK' THEN 1 ELSE 0 END) AS books,
        COALESCE(AVG(p.citation_count), 0) AS avg_citations,
        COALESCE(o.unique_orgs, 0) AS unique_organizations,
        CURRENT_TIMESTAMP
    FROM publications p
    LEFT JOIN org_counts o ON p.year = o.year
    WHERE p.year IS NOT NULL
    GROUP BY p.year
    ON DUPLICATE KEY UPDATE
        total_publications = VALUES(total_publications),
        unique_works = VALUES(unique_works),
        open_access_count = VALUES(open_access_count),
        articles = VALUES(articles),
        books = VALUES(books),
        avg_citations = VALUES(avg_citations),
        unique_organizations = VALUES(unique_organizations),
        refreshed_at = CURRENT_TIMESTAMP;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_populate_organizations_semantic_keys`(IN p_batch_size INT)
BEGIN 
  DECLARE v_max_id INT;
  DECLARE v_offset INT DEFAULT 0;

  CREATE TEMPORARY TABLE IF NOT EXISTS temp_tally (n INT PRIMARY KEY);
  TRUNCATE TABLE temp_tally;

  INSERT INTO temp_tally (n)
  WITH RECURSIVE tally AS (
    SELECT 1 AS n
    UNION ALL
    SELECT n + 1 FROM tally WHERE n < 100
  )
  SELECT n FROM tally;

  CREATE TEMPORARY TABLE IF NOT EXISTS temp_org_batch (
    id INT PRIMARY KEY, 
    clean_name TEXT
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_uca1400_ai_ci;

  SELECT MAX(id) INTO v_max_id FROM organizations;

  WHILE v_offset <= v_max_id DO
    TRUNCATE TABLE temp_org_batch;

    INSERT INTO temp_org_batch (id, clean_name)
    SELECT
      id,
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(standardized_name, '[[:punct:][:cntrl:]]+', ' '), 
          '\\s+', ' '
        )
      )
    FROM organizations
    WHERE id BETWEEN v_offset AND v_offset + p_batch_size
      AND standardized_name IS NOT NULL;

    IF ROW_COUNT() > 0 THEN
      UPDATE organizations o
      JOIN (
        SELECT
          ext.id,
          GROUP_CONCAT(ext.token ORDER BY ext.token ASC SEPARATOR ' ') AS final_key
        FROM (
          SELECT
            b.id,
            SUBSTRING_INDEX(SUBSTRING_INDEX(b.clean_name, ' ', t.n), ' ', -1) AS token
          FROM temp_org_batch b
          JOIN temp_tally t 
            ON t.n <= (LENGTH(b.clean_name) - LENGTH(REPLACE(b.clean_name, ' ', '')) + 1)
        ) ext
        LEFT JOIN subject_stoplist sl ON ext.token = sl.token
        WHERE ext.token != '' AND sl.token IS NULL
        GROUP BY ext.id
      ) final_data ON o.id = final_data.id
      SET o.semantic_key = final_data.final_key;
    END IF;

    SET v_offset = v_offset + p_batch_size + 1;
  END WHILE;

  DROP TEMPORARY TABLE IF EXISTS temp_tally;
  DROP TEMPORARY TABLE IF EXISTS temp_org_batch;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_populate_organization_semantic_keys`(IN p_batch_size INT)
BEGIN
    DECLARE v_max_id INT;
    DECLARE v_offset INT DEFAULT 0;

    
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_tally (n INT PRIMARY KEY);
    TRUNCATE TABLE temp_tally;
    INSERT INTO temp_tally (n)
    WITH RECURSIVE tally AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM tally WHERE n < 50)
    SELECT n FROM tally;

    
    
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_org_stop (token VARCHAR(64) PRIMARY KEY)
        ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
    TRUNCATE TABLE temp_org_stop;
    INSERT IGNORE INTO temp_org_stop (token) VALUES
        ('de'),('da'),('do'),('das'),('dos'),('di'),('del'),('della'),('du'),('des'),
        ('of'),('the'),('a'),('an'),('and'),('e'),('y'),('et'),('und'),('en'),
        ('la'),('le'),('el'),('les'),('los'),('las'),('lo'),('il'),('l'),
        ('van'),('von'),('der'),('den'),('das'),('zu'),('zur'),('am'),
        ('para'),('pour'),('per'),('fur'),('fuer'),('at'),('in'),('on'),('for'),('to');

    CREATE TEMPORARY TABLE IF NOT EXISTS temp_org_batch (
        id INT PRIMARY KEY,
        clean_name TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

    SELECT MAX(id) INTO v_max_id FROM organizations;

    WHILE v_offset <= v_max_id DO
        TRUNCATE TABLE temp_org_batch;

        INSERT INTO temp_org_batch (id, clean_name)
        SELECT
            id,
            TRIM(REGEXP_REPLACE(standardized_name, '[[:punct:][:cntrl:]]', ' '))
        FROM organizations
        WHERE id BETWEEN v_offset AND v_offset + p_batch_size
          AND standardized_name IS NOT NULL;

        IF ROW_COUNT() > 0 THEN
            UPDATE organizations o
            JOIN (
                SELECT
                    ext.id,
                    GROUP_CONCAT(ext.token ORDER BY ext.token ASC SEPARATOR ' ') AS final_key
                FROM (
                    SELECT
                        b.id,
                        SUBSTRING_INDEX(SUBSTRING_INDEX(b.clean_name, ' ', t.n), ' ', -1) AS token
                    FROM temp_org_batch b
                    JOIN temp_tally t
                      ON t.n <= LENGTH(b.clean_name) - LENGTH(REPLACE(b.clean_name, ' ', '')) + 1
                ) ext
                LEFT JOIN temp_org_stop sl ON ext.token = sl.token
                WHERE ext.token != '' AND sl.token IS NULL
                GROUP BY ext.id
            ) final_data ON o.id = final_data.id
            SET o.semantic_key = final_data.final_key;
        END IF;

        SET v_offset = v_offset + p_batch_size + 1;
    END WHILE;

    DROP TEMPORARY TABLE IF EXISTS temp_tally;
    DROP TEMPORARY TABLE IF EXISTS temp_org_stop;
    DROP TEMPORARY TABLE IF EXISTS temp_org_batch;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_populate_references_counts`(IN p_batch_size INT)
BEGIN
    DECLARE v_current_id INT DEFAULT 0;
    DECLARE v_max_id INT;
    DECLARE v_next_id INT;
    DECLARE v_batch INT DEFAULT 50000;

    IF p_batch_size IS NOT NULL AND p_batch_size > 0 THEN
        SET v_batch = p_batch_size;
    END IF;

    SELECT MAX(id) INTO v_max_id FROM publications;

    IF v_max_id IS NULL THEN
        SELECT 'Nenhum registro encontrado na tabela publications.' AS status;
    ELSE
        
        SELECT MIN(id) INTO v_current_id FROM publications;

        WHILE v_current_id <= v_max_id DO
            SET v_next_id = v_current_id + v_batch - 1;

            UPDATE publications p
            INNER JOIN works w ON p.work_id = w.id
            SET 
                p.citation_count = IFNULL(w.citation_count, 0),
                p.reference_count = IFNULL(w.reference_count, 0)
            WHERE p.id BETWEEN v_current_id AND v_next_id
              AND (p.citation_count != IFNULL(w.citation_count, 0) 
                   OR p.reference_count != IFNULL(w.reference_count, 0));

            
            SELECT MIN(id) INTO v_current_id 
            FROM publications 
            WHERE id > v_next_id;
            
            
            IF v_current_id IS NULL THEN
                SET v_current_id = v_max_id + 1;
            ELSE
                
                DO SLEEP(0.05);
            END IF;
        END WHILE;

        SELECT 'Procedimento concluído: colunas populadas com sucesso.' AS status;
    END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_rebuild_signatures`()
BEGIN
    DECLARE v_id INT;
    DECLARE v_preferred_name VARCHAR(255);
    DECLARE v_clean VARCHAR(500);
    DECLARE v_last_name VARCHAR(255);
    DECLARE v_given_upper VARCHAR(500);
    DECLARE v_initials VARCHAR(255);
    DECLARE v_particle VARCHAR(255);
    DECLARE v_signature VARCHAR(255);
    DECLARE v_done INT DEFAULT 0;

    DECLARE cur CURSOR FOR
        SELECT id, preferred_name
        FROM persons
        WHERE preferred_name IS NOT NULL
          AND TRIM(preferred_name) != '';

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    DROP TEMPORARY TABLE IF EXISTS tmp_signatures;
    CREATE TEMPORARY TABLE tmp_signatures (
        person_id INT PRIMARY KEY,
        signature_string VARCHAR(255)
    ) ENGINE=InnoDB;

    OPEN cur;

    read_loop: LOOP
        FETCH cur INTO v_id, v_preferred_name;
        IF v_done THEN
            LEAVE read_loop;
        END IF;

        SET v_clean = TRIM(REGEXP_REPLACE(UPPER(v_preferred_name), '[.,()"\'‐−–—/\\[\\]{}#@!?;:°ªº&~`^_+=|<>]', ' '));
        SET v_clean = REGEXP_REPLACE(v_clean, '([^[:alpha:]])-', '\\1 ');
        SET v_clean = REGEXP_REPLACE(v_clean, '-([^[:alpha:]])', ' \\1');
        SET v_clean = REGEXP_REPLACE(v_clean, '^-', '');
        SET v_clean = REGEXP_REPLACE(v_clean, '-$', '');
        SET v_clean = TRIM(REGEXP_REPLACE(v_clean, '\\s+', ' '));
        SET v_clean = TRIM(REGEXP_REPLACE(v_clean, '\\s+(NETO|NETA|SOBRINHO|SOBRINHA|BISNETO|BISNETA|TERCEIRO|TERCEIRA|SR|SRA|II|III|IV|V|VI|VII|VIII|IX|X)$', ''));

        IF v_clean IS NULL OR v_clean = '' THEN
            ITERATE read_loop;
        END IF;

        IF LOCATE(' ', v_clean) = 0 THEN
            IF CHAR_LENGTH(v_clean) > 1 THEN
                SET v_signature = v_clean;
            ELSE
                ITERATE read_loop;
            END IF;
        ELSE
            SET v_particle = REGEXP_SUBSTR(v_clean, '\\b(VAN DER|VAN DEN|VAN DE|VON DER|VON DEM|DE LA|DE LOS|DE LAS|DE LO)\\s+[^\\s]+$');
            
            IF v_particle IS NULL OR v_particle = '' THEN
                SET v_particle = REGEXP_SUBSTR(v_clean, '\\b(DO|DA|DOS|DAS|DE|DEL|DELA|DELLA|DELLE|DELLO|DEGLI|DI|DU|DES|VAN|VON|AL|EL|LA|LE|LES|LO|LOS|LAS|SAINT|SAINTE|SAN|SANTA|SANTO|MC|MAC|BEN|BIN|IBN|AB|AP|AUF|ZU|ZUM|ZUR|TER|TEN)\\s+[^\\s]+$');
            END IF;

            IF v_particle IS NOT NULL AND v_particle != '' THEN
                SET v_last_name = v_particle;
            ELSE
                SET v_last_name = REGEXP_SUBSTR(v_clean, '[^\\s]+$');
            END IF;

            IF v_last_name IS NULL OR v_last_name = '' THEN
                ITERATE read_loop;
            END IF;

            SET v_given_upper = TRIM(SUBSTRING(v_clean, 1, CHAR_LENGTH(v_clean) - CHAR_LENGTH(v_last_name)));

            IF v_given_upper != '' AND v_given_upper IS NOT NULL THEN
                
                
                
                
                
                
                
                
                SET v_given_upper = TRIM(REGEXP_REPLACE(v_given_upper,
                    '\\b(DE|DO|DA|DOS|DAS|DEL|DELA|DELLA|DELLE|DELLO|DEGLI|DI|DU|DES|VAN|VON|LA|LE|LES|LO|LOS|LAS|EL)\\b\\s*', ''));
                SET v_initials = TRIM(REGEXP_REPLACE(v_given_upper, '\\b([[:alpha:]])[^\\s]*\\s*', '\\1 '));
                IF v_initials IS NULL OR v_initials = '' THEN
                    SET v_signature = v_last_name;
                ELSE
                    SET v_signature = CONCAT(v_last_name, ' ', v_initials);
                END IF;
            ELSE
                SET v_signature = v_last_name;
            END IF;
        END IF;

        IF v_signature IS NOT NULL AND TRIM(v_signature) != '' THEN
            INSERT INTO tmp_signatures (person_id, signature_string) VALUES (v_id, TRIM(v_signature))
            ON DUPLICATE KEY UPDATE signature_string = VALUES(signature_string);
        END IF;

    END LOOP;
    CLOSE cur;

    INSERT IGNORE INTO signatures (signature)
    SELECT DISTINCT signature_string FROM tmp_signatures;

    UPDATE persons p
    JOIN tmp_signatures ts ON p.id = ts.person_id
    JOIN signatures s ON s.signature = ts.signature_string
    SET p.signature_id = s.id;

    DROP TEMPORARY TABLE tmp_signatures;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_refresh_persons_stats`()
BEGIN
      DECLARE v_min INT;
      DECLARE v_max INT;
      DECLARE v_cur INT;
      DECLARE v_batch INT DEFAULT 50000;

      DROP TEMPORARY TABLE IF EXISTS tmp_person_stats;
      CREATE TEMPORARY TABLE tmp_person_stats (
          person_id       INT PRIMARY KEY,
          total_works     INT      NOT NULL DEFAULT 0,
          total_citations BIGINT   NOT NULL DEFAULT 0,
          h_index         INT      NOT NULL DEFAULT 0,
          first_year      SMALLINT DEFAULT NULL,
          last_year       SMALLINT DEFAULT NULL
      ) ENGINE=InnoDB;

      INSERT INTO tmp_person_stats
          (person_id, total_works, total_citations, h_index, first_year, last_year)
      SELECT
          person_id,
          COUNT(*),
          COALESCE(SUM(citation_count), 0),
          MAX(CASE WHEN citation_count >= rn THEN rn ELSE 0 END),
          MIN(work_first_year),
          MAX(work_last_year)
      FROM (
          SELECT
              a.person_id,
              a.work_id,
              w.citation_count,
              wy.first_year AS work_first_year,
              wy.last_year  AS work_last_year,
              ROW_NUMBER() OVER (
                  PARTITION BY a.person_id
                  ORDER BY w.citation_count DESC, a.work_id
              ) AS rn
          FROM authorships a
          JOIN works w ON w.id = a.work_id
          LEFT JOIN (
              SELECT work_id, MIN(year) AS first_year, MAX(year) AS last_year
              FROM publications
              WHERE year IS NOT NULL AND year > 0
              GROUP BY work_id
          ) wy ON wy.work_id = a.work_id
          GROUP BY a.person_id, a.work_id        
      ) ranked
      GROUP BY person_id;

      SELECT MIN(id), MAX(id) INTO v_min, v_max FROM persons;
      SET v_cur = COALESCE(v_min, 0);

      WHILE v_cur <= v_max DO
          UPDATE persons p
          LEFT JOIN tmp_person_stats t ON t.person_id = p.id
          SET p.total_works             = COALESCE(t.total_works,     p.total_works),
              p.total_citations         = COALESCE(t.total_citations, p.total_citations),
              p.h_index                 = COALESCE(t.h_index,         p.h_index),
              p.first_publication_year  = COALESCE(t.first_year,      p.first_publication_year),
              p.latest_publication_year = COALESCE(t.last_year,       p.latest_publication_year)
          WHERE p.id BETWEEN v_cur AND v_cur + v_batch - 1
            AND ( COALESCE(t.total_works,     p.total_works)     <> p.total_works
               OR COALESCE(t.total_citations, p.total_citations) <> p.total_citations
               OR COALESCE(t.h_index,         p.h_index)         <> p.h_index
               OR NOT (COALESCE(t.first_year, p.first_publication_year)  <=> p.first_publication_year)
               OR NOT (COALESCE(t.last_year,  p.latest_publication_year) <=> p.latest_publication_year)
                );

          SET v_cur = v_cur + v_batch;
      END WHILE;

      DROP TEMPORARY TABLE tmp_person_stats;
  END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_refresh_subjects_total_works_simple`(
    IN p_batch_size INT
)
BEGIN
    DECLARE v_cur_id INT DEFAULT 0;
    DECLARE v_max_id INT DEFAULT 0;
    DECLARE v_batch INT DEFAULT 50000;
    DECLARE v_updated INT DEFAULT 0;
    DECLARE v_total_updated INT DEFAULT 0;
    DECLARE v_new_count INT DEFAULT 0;

    IF p_batch_size IS NOT NULL AND p_batch_size > 0 THEN
        SET v_batch = p_batch_size;
    END IF;

    SELECT MAX(id) INTO v_max_id FROM subjects;
    
    IF v_max_id IS NULL THEN
        SELECT 'No subjects found.' AS status;
    ELSE
        REPEAT
            UPDATE subjects s
            SET s.total_works = (
                SELECT COUNT(DISTINCT ws.work_id)
                FROM work_subjects ws
                WHERE ws.subject_id = s.id
            )
            WHERE s.id BETWEEN v_cur_id AND v_cur_id + v_batch - 1
              AND COALESCE(s.total_works, -1) <> COALESCE((
                  SELECT COUNT(DISTINCT ws.work_id)
                  FROM work_subjects ws
                  WHERE ws.subject_id = s.id
              ), -1);

            SET v_updated = ROW_COUNT();
            SET v_total_updated = v_total_updated + v_updated;
            SET v_cur_id = v_cur_id + v_batch;
        UNTIL v_cur_id > v_max_id END REPEAT;

        
        UPDATE subjects s
        LEFT JOIN work_subjects ws ON s.id = ws.subject_id
        SET s.total_works = 0
        WHERE ws.subject_id IS NULL
          AND COALESCE(s.total_works, -1) <> 0;

        SET v_updated = ROW_COUNT();
        SET v_total_updated = v_total_updated + v_updated;

        SELECT CONCAT('Updated ', v_total_updated, ' subjects.') AS status;
    END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_refresh_works_publication_years`()
BEGIN
    DECLARE v_min   INT;
    DECLARE v_max   INT;
    DECLARE v_cur   INT;
    DECLARE v_batch INT DEFAULT 50000;

    SELECT MIN(id), MAX(id) INTO v_min, v_max FROM works;
    SET v_cur = COALESCE(v_min, 0);

    WHILE v_cur <= v_max DO
        UPDATE works w
        JOIN (
            SELECT work_id, MAX(year) AS max_y
            FROM publications
            WHERE year > 0
              AND work_id BETWEEN v_cur AND v_cur + v_batch - 1
            GROUP BY work_id
        ) p ON p.work_id = w.id
        SET w.latest_publication_year = p.max_y
        WHERE NOT (p.max_y <=> w.latest_publication_year);

        SET v_cur = v_cur + v_batch;
    END WHILE;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_reindex_database`()
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
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`%` PROCEDURE `sp_remove_all_orphans`()
BEGIN

DELETE FROM works
WHERE
  NOT EXISTS (
    SELECT 1 FROM publications WHERE work_id = works.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM authorships WHERE work_id = works.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM funding WHERE work_id = works.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM work_subjects WHERE work_id = works.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM course_bibliography WHERE work_id = works.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM work_references WHERE citing_work_id = works.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM work_references WHERE cited_work_id = works.id
  );

DELETE FROM courses
WHERE
  NOT EXISTS (
    SELECT 1 FROM course_bibliography WHERE course_id = courses.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM course_instructors WHERE course_id = courses.id
  );

DELETE FROM programs
WHERE
  NOT EXISTS (
    SELECT 1 FROM courses WHERE program_id = programs.id
  );

DELETE FROM venues
WHERE
  NOT EXISTS (
    SELECT 1 FROM publications WHERE venue_id = venues.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM venue_subjects WHERE venue_id = venues.id
  );

DELETE FROM subjects
WHERE
  NOT EXISTS (
    SELECT 1 FROM work_subjects WHERE subject_id = subjects.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM venue_subjects WHERE subject_id = subjects.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM subject_relevance_tiers WHERE subject_id = subjects.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM subjects child WHERE child.parent_id = subjects.id
  );

DELETE FROM organizations
WHERE
  NOT EXISTS (
    SELECT 1 FROM authorships WHERE affiliation_id = organizations.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM funding WHERE funder_id = organizations.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM programs WHERE institution_id = organizations.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM publications WHERE publisher_id = organizations.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM venues WHERE publisher_id = organizations.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM organization_relationships WHERE parent_id = organizations.id OR child_id = organizations.id
  );

DELETE FROM persons
WHERE
  NOT EXISTS (
    SELECT 1 FROM authorships WHERE person_id = persons.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM course_instructors WHERE person_id = persons.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM course_instructors WHERE canonical_person_id = persons.id
  );

DELETE FROM signatures
WHERE
  NOT EXISTS (
    SELECT 1 FROM persons WHERE signature_id = signatures.id
  );

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_repair_work_references_consistency`(IN p_apply TINYINT)
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
        SET wr.cited_work_id = COALESCE(p.reviewed_id, p.work_id),
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
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_resolve_all_pending_existing`(IN p_batch_size INT)
BEGIN
    DECLARE v_rows_affected INT DEFAULT 1;
    DECLARE v_total_resolved INT DEFAULT 0;

    WHILE v_rows_affected > 0 DO
        UPDATE work_references wr
        JOIN (
            SELECT wr_inner.id, COALESCE(p.reviewed_id, p.work_id) AS work_id
            FROM work_references wr_inner
            JOIN publications p ON wr_inner.cited_doi = p.doi
            WHERE wr_inner.status = 'PENDING'
            LIMIT p_batch_size
        ) batch ON wr.id = batch.id
        SET 
            wr.cited_work_id = batch.work_id,
            wr.status = 'RESOLVED',
            wr.resolved_at = CURRENT_TIMESTAMP;

        SET v_rows_affected = ROW_COUNT();
        SET v_total_resolved = v_total_resolved + v_rows_affected;
    END WHILE;

    SELECT CONCAT('Total de referências retroativas resolvidas: ', v_total_resolved) AS status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_resolve_pending_references`(IN p_limit INT)
BEGIN
    
    
    
    UPDATE work_references wr
    JOIN publications p ON wr.cited_doi = p.doi
    SET
        wr.cited_work_id = COALESCE(p.reviewed_id, p.work_id),
        wr.status = 'RESOLVED',
        wr.resolved_at = CURRENT_TIMESTAMP
    WHERE
        wr.status = 'PENDING'
        AND wr.cited_doi IS NOT NULL
        AND p.doi IS NOT NULL
    LIMIT p_limit;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_review_reference_consistency`(IN p_batch_size INT)
BEGIN
    DECLARE v_rows_affected INT DEFAULT 1;

    
    WHILE v_rows_affected > 0 DO
        UPDATE work_references wr
        LEFT JOIN publications p ON wr.cited_doi = p.doi
        SET
            wr.status = 'PENDING',
            wr.cited_work_id = NULL,
            wr.resolved_at = NULL
        WHERE
            p.doi IS NULL
            AND (wr.status != 'PENDING' OR wr.cited_work_id IS NOT NULL)
        LIMIT p_batch_size;

        SET v_rows_affected = ROW_COUNT();
        DO SLEEP(0.1);
    END WHILE;

    SET v_rows_affected = 1;

    
    WHILE v_rows_affected > 0 DO
        UPDATE work_references wr
        INNER JOIN publications p ON wr.cited_doi = p.doi
        SET
            wr.status = 'RESOLVED',
            wr.cited_work_id = COALESCE(p.reviewed_id, p.work_id),
            wr.resolved_at = CURRENT_TIMESTAMP
        WHERE
            wr.status = 'PENDING'
            OR wr.cited_work_id IS NULL
            OR wr.cited_work_id != COALESCE(p.reviewed_id, p.work_id)
        LIMIT p_batch_size;

        SET v_rows_affected = ROW_COUNT();
        DO SLEEP(0.1);
    END WHILE;

    SELECT 'Reference consistency review completed.' AS execution_status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_test_system`(IN p_input_name VARCHAR(255))
BEGIN
DECLARE v_test_sig VARCHAR(255);


CALL sp_generate_name_signature(p_input_name, v_test_sig);

SELECT 
    'System functioning correctly (UDFs removed)' AS status,
    NOW() AS tested_at,
    p_input_name AS provided_name,
    v_test_sig AS signature_test;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_update_10yr_impact_factors`()
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
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`%` PROCEDURE `sp_update_all_venue_stats`()
BEGIN
    
    DROP TEMPORARY TABLE IF EXISTS tmp_all_venue_stats;
    CREATE TEMPORARY TABLE tmp_all_venue_stats (
        venue_id INT PRIMARY KEY,
        works_count INT DEFAULT 0,
        cited_by_count INT DEFAULT 0,
        start_year SMALLINT DEFAULT NULL,
        end_year SMALLINT DEFAULT NULL
    ) ENGINE=InnoDB;

    
    INSERT INTO tmp_all_venue_stats (venue_id, works_count, cited_by_count, start_year, end_year)
    SELECT 
        p.venue_id,
        COUNT(DISTINCT w.id) AS works_count,
        SUM(w.citation_count) AS cited_by_count,
        MIN(p.year) AS start_year,
        MAX(p.year) AS end_year
    FROM works w
    JOIN publications p ON w.id = p.work_id
    WHERE p.venue_id IS NOT NULL
    GROUP BY p.venue_id;

    
    UPDATE venues v 
    JOIN tmp_all_venue_stats t ON v.id = t.venue_id
    SET 
        v.works_count = t.works_count,
        v.cited_by_count = t.cited_by_count,
        v.coverage_start_year = t.start_year,
        v.coverage_end_year = t.end_year;

    
    DROP TEMPORARY TABLE IF EXISTS tmp_all_venue_stats;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_update_core_statistics`()
BEGIN
    SET FOREIGN_KEY_CHECKS = 0;
    SET SESSION group_concat_max_len = 1000000;

    
    DROP TEMPORARY TABLE IF EXISTS tmp_person_stats;
    CREATE TEMPORARY TABLE tmp_person_stats (
        person_id INT PRIMARY KEY,
        total_works INT DEFAULT 0,
        total_citations INT DEFAULT 0,
        corresponding_count INT DEFAULT 0,
        first_year SMALLINT DEFAULT NULL,
        last_year SMALLINT DEFAULT NULL,
        h_index INT DEFAULT 0
    ) ENGINE=InnoDB;

    INSERT INTO tmp_person_stats (person_id, total_works, corresponding_count, first_year, last_year)
    SELECT 
        a.person_id,
        COUNT(DISTINCT a.work_id),
        SUM(CASE WHEN a.is_corresponding = 1 THEN 1 ELSE 0 END),
        MIN(p.year),
        MAX(p.year)
    FROM authorships a
    LEFT JOIN publications p ON a.work_id = p.work_id
    GROUP BY a.person_id;

    
    DROP TEMPORARY TABLE IF EXISTS tmp_person_hindex;
    CREATE TEMPORARY TABLE tmp_person_hindex (
        person_id INT PRIMARY KEY,
        total_citations INT DEFAULT 0,
        h_index INT DEFAULT 0
    ) ENGINE=InnoDB;

    INSERT INTO tmp_person_hindex (person_id, total_citations, h_index)
    SELECT 
        person_id,
        SUM(citations),
        MAX(CASE WHEN citations >= rn THEN rn ELSE 0 END)
    FROM (
        SELECT 
            a.person_id,
            w.citation_count AS citations,
            ROW_NUMBER() OVER(PARTITION BY a.person_id ORDER BY w.citation_count DESC) as rn
        FROM authorships a
        JOIN works w ON a.work_id = w.id
    ) ranked
    GROUP BY person_id;

    UPDATE tmp_person_stats t
    JOIN tmp_person_hindex h ON t.person_id = h.person_id
    SET t.total_citations = h.total_citations, t.h_index = h.h_index;

    UPDATE persons p JOIN tmp_person_stats t ON p.id = t.person_id
    SET p.total_works = t.total_works, p.total_citations = t.total_citations, 
        p.corresponding_author_count = t.corresponding_count, p.first_publication_year = t.first_year, 
        p.latest_publication_year = t.last_year, p.h_index = t.h_index;

    
    DROP TEMPORARY TABLE IF EXISTS tmp_org_stats;
    CREATE TEMPORARY TABLE tmp_org_stats (
        affiliation_id INT PRIMARY KEY,
        researcher_count INT DEFAULT 0,
        publication_count INT DEFAULT 0,
        total_citations INT DEFAULT 0,
        open_access_count INT DEFAULT 0
    ) ENGINE=InnoDB;

    INSERT INTO tmp_org_stats (affiliation_id, researcher_count, publication_count, total_citations, open_access_count)
    SELECT 
        a.affiliation_id,
        COUNT(DISTINCT a.person_id),
        COUNT(DISTINCT a.work_id),
        SUM(w.citation_count),
        SUM(CASE WHEN pub.open_access = 1 THEN 1 ELSE 0 END)
    FROM authorships a
    JOIN works w ON a.work_id = w.id
    LEFT JOIN publications pub ON a.work_id = pub.work_id
    WHERE a.affiliation_id IS NOT NULL
    GROUP BY a.affiliation_id;

    UPDATE organizations o JOIN tmp_org_stats t ON o.id = t.affiliation_id
    SET o.publication_count = t.publication_count, o.researcher_count = t.researcher_count, 
        o.total_citations = t.total_citations, o.open_access_works_count = t.open_access_count;

    
    DROP TEMPORARY TABLE IF EXISTS tmp_venue_stats;
    CREATE TEMPORARY TABLE tmp_venue_stats (
        venue_id INT PRIMARY KEY,
        works_count INT DEFAULT 0,
        cited_by_count INT DEFAULT 0,
        start_year SMALLINT DEFAULT NULL,
        end_year SMALLINT DEFAULT NULL
    ) ENGINE=InnoDB;

    INSERT INTO tmp_venue_stats (venue_id, works_count, cited_by_count, start_year, end_year)
    SELECT 
        pub.venue_id,
        COUNT(DISTINCT w.id),
        SUM(w.citation_count),
        MIN(pub.year),
        MAX(pub.year)
    FROM works w
    JOIN publications pub ON w.id = pub.work_id
    WHERE pub.venue_id IS NOT NULL
    GROUP BY pub.venue_id;

    UPDATE venues v JOIN tmp_venue_stats t ON v.id = t.venue_id
    SET v.works_count = t.works_count, v.cited_by_count = t.cited_by_count, 
        v.coverage_start_year = t.start_year, v.coverage_end_year = t.end_year;

    
    DROP TEMPORARY TABLE tmp_person_stats;
    DROP TEMPORARY TABLE tmp_person_hindex;
    DROP TEMPORARY TABLE tmp_org_stats;
    DROP TEMPORARY TABLE tmp_venue_stats;
    SET FOREIGN_KEY_CHECKS = 1;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`%` PROCEDURE `sp_update_file_access_stats`(IN p_publication_id INT, IN p_file_id INT)
BEGIN
    
    
    UPDATE files 
    SET 
        download_count = download_count + 1
    WHERE id = p_file_id AND publication_id = p_publication_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_update_organization_bibliometrics`()
BEGIN
    
    
    DECLARE v_refyear INT;
    SET v_refyear = YEAR(CURDATE());

    
    
    DROP TEMPORARY TABLE IF EXISTS tmp_org_work;
    CREATE TEMPORARY TABLE tmp_org_work (
        affiliation_id INT NOT NULL,
        work_id INT NOT NULL,
        citations INT NOT NULL DEFAULT 0,
        is_recent TINYINT NOT NULL DEFAULT 0,
        KEY idx_aff (affiliation_id)
    ) ENGINE=InnoDB;

    INSERT INTO tmp_org_work (affiliation_id, work_id, citations, is_recent)
    SELECT DISTINCT
        a.affiliation_id,
        a.work_id,
        COALESCE(w.citation_count, 0),
        CASE WHEN p.year BETWEEN v_refyear - 1 AND v_refyear THEN 1 ELSE 0 END
    FROM authorships a
    JOIN works w ON a.work_id = w.id
    LEFT JOIN publications p ON a.work_id = p.work_id
    WHERE a.affiliation_id IS NOT NULL;

    DROP TEMPORARY TABLE IF EXISTS tmp_org_biblio;
    CREATE TEMPORARY TABLE tmp_org_biblio (
        affiliation_id INT PRIMARY KEY,
        h_index INT NOT NULL DEFAULT 0,
        i10 INT NOT NULL DEFAULT 0,
        mc2 DECIMAL(10,5) DEFAULT NULL
    ) ENGINE=InnoDB;

    INSERT INTO tmp_org_biblio (affiliation_id, h_index, i10)
    SELECT
        affiliation_id,
        MAX(CASE WHEN citations >= rn THEN rn ELSE 0 END) AS h_index,
        SUM(CASE WHEN citations >= 10 THEN 1 ELSE 0 END) AS i10
    FROM (
        SELECT affiliation_id, citations,
               ROW_NUMBER() OVER (PARTITION BY affiliation_id ORDER BY citations DESC) AS rn
        FROM tmp_org_work
    ) ranked
    GROUP BY affiliation_id;

    UPDATE tmp_org_biblio b
    JOIN (
        SELECT affiliation_id, AVG(citations) AS mc
        FROM tmp_org_work WHERE is_recent = 1 GROUP BY affiliation_id
    ) r ON b.affiliation_id = r.affiliation_id
    SET b.mc2 = r.mc;

    UPDATE organizations o
    JOIN tmp_org_biblio b ON o.id = b.affiliation_id
    SET o.h_index = b.h_index,
        o.i10_index = b.i10,
        o.`2yr_mean_citedness` = b.mc2;

    
    UPDATE organizations o
    LEFT JOIN tmp_org_biblio b ON o.id = b.affiliation_id
    SET o.h_index = NULL, o.i10_index = NULL, o.`2yr_mean_citedness` = NULL
    WHERE b.affiliation_id IS NULL
      AND (o.h_index IS NOT NULL OR o.i10_index IS NOT NULL OR o.`2yr_mean_citedness` IS NOT NULL);

    DROP TEMPORARY TABLE IF EXISTS tmp_org_work;
    DROP TEMPORARY TABLE IF EXISTS tmp_org_biblio;

    SELECT 'organization bibliometrics recomputed from corpus' AS status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`%` PROCEDURE `sp_update_organization_stats`(IN p_organization_id INT)
proc_main: BEGIN
    IF p_organization_id IS NULL THEN LEAVE proc_main; END IF;

    UPDATE organizations o
    LEFT JOIN (
        SELECT 
            a.affiliation_id,
            COUNT(DISTINCT a.person_id) as researcher_count,
            COUNT(DISTINCT a.work_id) as publication_count,
            SUM(w.citation_count) as total_citations
        FROM authorships a
        JOIN works w ON a.work_id = w.id
        WHERE a.affiliation_id = p_organization_id
        GROUP BY a.affiliation_id
    ) stats ON o.id = stats.affiliation_id
    LEFT JOIN (
        SELECT a.affiliation_id, COUNT(DISTINCT a.work_id) as open_access_count
        FROM authorships a
        JOIN publications p ON a.work_id = p.work_id
        WHERE a.affiliation_id = p_organization_id AND p.open_access = 1
        GROUP BY a.affiliation_id
    ) oa_stats ON o.id = oa_stats.affiliation_id
    SET
        o.publication_count = COALESCE(stats.publication_count, 0),
        o.researcher_count = COALESCE(stats.researcher_count, 0),
        o.total_citations = COALESCE(stats.total_citations, 0),
        o.open_access_works_count = COALESCE(oa_stats.open_access_count, 0)
    WHERE o.id = p_organization_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`%` PROCEDURE `sp_update_person_h_index`(IN p_person_id INT)
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
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`%` PROCEDURE `sp_update_person_stats`(IN p_person_id INT)
proc_main: BEGIN
    IF p_person_id IS NULL THEN LEAVE proc_main; END IF;

    UPDATE persons p
    LEFT JOIN (
        SELECT 
            a.person_id,
            COUNT(DISTINCT a.work_id) as total_works,
            SUM(w.citation_count) as total_citations,
            SUM(CASE WHEN a.is_corresponding = 1 THEN 1 ELSE 0 END) as corresponding_count
        FROM authorships a
        JOIN works w ON a.work_id = w.id
        WHERE a.person_id = p_person_id
        GROUP BY a.person_id
    ) stats ON p.id = stats.person_id
    LEFT JOIN (
        SELECT a.person_id, MIN(pub.year) as first_year, MAX(pub.year) as last_year
        FROM authorships a
        JOIN publications pub ON a.work_id = pub.work_id
        WHERE a.person_id = p_person_id
        GROUP BY a.person_id
    ) pub_stats ON p.id = pub_stats.person_id
    SET
        p.total_works = COALESCE(stats.total_works, 0),
        p.total_citations = COALESCE(stats.total_citations, 0),
        p.corresponding_author_count = COALESCE(stats.corresponding_count, 0),
        p.first_publication_year = pub_stats.first_year,
        p.latest_publication_year = pub_stats.last_year
    WHERE p.id = p_person_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_update_venues_type_from_aggregation`(IN p_batch_size INT)
BEGIN
    DECLARE v_current_id INT DEFAULT 0;
    DECLARE v_max_id INT;
    DECLARE v_next_id INT;
    DECLARE v_batch INT DEFAULT 50000;

    IF p_batch_size IS NOT NULL AND p_batch_size > 0 THEN
        SET v_batch = p_batch_size;
    END IF;

    SELECT MAX(id) INTO v_max_id FROM venues;

    IF v_max_id IS NULL THEN
        SELECT 'Nenhum registro encontrado na tabela venues.' AS status;
    ELSE
        
        SELECT MIN(id) INTO v_current_id FROM venues;

        WHILE v_current_id <= v_max_id DO
            SET v_next_id = v_current_id + v_batch - 1;

            UPDATE venues
            SET type = CASE 
                WHEN LOWER(TRIM(aggregation_type)) = 'journal' THEN 'JOURNAL'
                WHEN LOWER(TRIM(aggregation_type)) LIKE '%conference%' OR LOWER(TRIM(aggregation_type)) LIKE '%proceedings%' THEN 'CONFERENCE'
                
                WHEN LOWER(TRIM(aggregation_type)) IN ('book series', 'book_series', 'bookseries') THEN 'BOOK_SERIES'
                WHEN LOWER(TRIM(aggregation_type)) = 'repository' THEN 'REPOSITORY'
                WHEN LOWER(TRIM(aggregation_type)) = 'book' THEN 'SOURCE_BOOK'
                ELSE 'OTHER'
            END
            WHERE id BETWEEN v_current_id AND v_next_id
              AND aggregation_type IS NOT NULL;

            
            SELECT MIN(id) INTO v_current_id 
            FROM venues 
            WHERE id > v_next_id;
            
            
            IF v_current_id IS NULL THEN
                SET v_current_id = v_max_id + 1;
            ELSE
                DO SLEEP(0.05);
            END IF;
        END WHILE;

        SELECT 'Procedimento concluído: coluna type atualizada com base em aggregation_type.' AS status;
    END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`localhost` PROCEDURE `sp_update_venue_bibliometrics`()
BEGIN
    DECLARE v_refyear INT;
    SET v_refyear = YEAR(CURDATE());

    
    DROP TEMPORARY TABLE IF EXISTS tmp_venue_work;
    CREATE TEMPORARY TABLE tmp_venue_work (
        venue_id INT NOT NULL,
        work_id INT NOT NULL,
        citations INT NOT NULL DEFAULT 0,
        is_recent TINYINT NOT NULL DEFAULT 0,
        KEY idx_venue (venue_id)
    ) ENGINE=InnoDB;

    INSERT INTO tmp_venue_work (venue_id, work_id, citations, is_recent)
    SELECT DISTINCT
        p.venue_id,
        p.work_id,
        COALESCE(w.citation_count, 0),
        CASE WHEN p.year BETWEEN v_refyear - 1 AND v_refyear THEN 1 ELSE 0 END
    FROM publications p
    JOIN works w ON p.work_id = w.id
    WHERE p.venue_id IS NOT NULL;

    DROP TEMPORARY TABLE IF EXISTS tmp_venue_biblio;
    CREATE TEMPORARY TABLE tmp_venue_biblio (
        venue_id INT PRIMARY KEY,
        h_index INT NOT NULL DEFAULT 0,
        i10 INT NOT NULL DEFAULT 0,
        mc2 DECIMAL(10,5) DEFAULT NULL
    ) ENGINE=InnoDB;

    INSERT INTO tmp_venue_biblio (venue_id, h_index, i10)
    SELECT
        venue_id,
        MAX(CASE WHEN citations >= rn THEN rn ELSE 0 END) AS h_index,
        SUM(CASE WHEN citations >= 10 THEN 1 ELSE 0 END) AS i10
    FROM (
        SELECT venue_id, citations,
               ROW_NUMBER() OVER (PARTITION BY venue_id ORDER BY citations DESC) AS rn
        FROM tmp_venue_work
    ) ranked
    GROUP BY venue_id;

    UPDATE tmp_venue_biblio b
    JOIN (
        SELECT venue_id, AVG(citations) AS mc
        FROM tmp_venue_work WHERE is_recent = 1 GROUP BY venue_id
    ) r ON b.venue_id = r.venue_id
    SET b.mc2 = r.mc;

    UPDATE venues v
    JOIN tmp_venue_biblio b ON v.id = b.venue_id
    SET v.h_index = b.h_index,
        v.i10_index = b.i10,
        v.`2yr_mean_citedness` = b.mc2;

    
    UPDATE venues v
    LEFT JOIN tmp_venue_biblio b ON v.id = b.venue_id
    SET v.h_index = NULL, v.i10_index = NULL, v.`2yr_mean_citedness` = NULL
    WHERE b.venue_id IS NULL
      AND (v.h_index IS NOT NULL OR v.i10_index IS NOT NULL OR v.`2yr_mean_citedness` IS NOT NULL);

    DROP TEMPORARY TABLE IF EXISTS tmp_venue_work;
    DROP TEMPORARY TABLE IF EXISTS tmp_venue_biblio;

    SELECT 'venue bibliometrics recomputed from corpus' AS status;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`dev`@`%` PROCEDURE `sp_update_venue_stats`(IN p_venue_id INT)
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
