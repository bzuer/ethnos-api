const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const worksController = require('../controllers/works.controller');

const validateWorkId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Work ID must be a positive integer')
];

const validateWorksQuery = [
  query('page')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('offset')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
  
  query('search')
    .optional({ values: 'falsy' }),
  
  query('type')
    .optional({ values: 'falsy' }),

  query('language')
    .optional({ values: 'falsy' })
    .isLength({ min: 2, max: 5 })
    .withMessage('Language must be a valid language code'),

  query('open_access')
    .optional({ values: 'falsy' })
    .isIn(['1', '0', 'true', 'false'])
    .withMessage('open_access must be boolean-like (1/0/true/false)'),
  
  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000 })
    .withMessage('Year from must be a valid year'),
  
  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000 })
    .withMessage('Year to must be a valid year'),

  query('cited_by_min')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('cited_by_min must be a non-negative integer'),

  query('cited_by_max')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('cited_by_max must be a non-negative integer'),

  query('sort_by')
    .optional({ values: 'falsy' })
    .isIn(['cited_by_count', 'citation_count', 'references_count', 'reference_count', 'publication_year', 'year', 'id', 'work_id', 'relevance'])
    .withMessage('sort_by must be one of: cited_by_count, references_count, publication_year, id, relevance'),

  query('sort_order')
    .optional({ values: 'falsy' })
    .customSanitizer(value => (typeof value === 'string' ? value.toUpperCase() : value))
    .isIn(['ASC', 'DESC'])
    .withMessage('sort_order must be ASC or DESC')
];


/**
 * @swagger
 * /works:
 *   get:
 *     summary: Get list of academic works
 *     description: |
 *       Returns a paginated list of works backed by the `works` + `publications` base tables.
 *       Filters apply with **`match_mode: "any_publication"`** semantics: a
 *       work appears in the result set if **any of its publications** matches
 *       the filter set. When a filter matches multiple siblings of the same
 *       work, the latest matching publication is the one displayed in the
 *       card (its venue, year, doi, etc.). The semantic is signalled in
 *       `meta.match_mode`.
 *
 *       Backend routing: the default browse and pure structured-filter paths
 *       (`type`, `language`, `year_from`/`year_to`, `open_access`,
 *       `peer_reviewed`, `venue_id`, `cited_by_min`/`max`) run against
 *       **MariaDB**. Free-text `q` and the metadata filters `author` /
 *       `subject` / `venue_name` resolve matching work ids through
 *       **Manticore** (`author` → `authors`, `subject` → `subjects`, each
 *       with AND semantics); the `venue_name` filter matches MariaDB
 *       `ft_venues_search` even though `meta.performance.engine` labels the
 *       full-text code path `"Manticore"`. `meta.performance.engine` and the
 *       per-row `search_engine` report which engine served the page. On
 *       full-text/metadata filters `meta.pagination_total_exact` is `true`
 *       (exact `COUNT`); on the default unfiltered browse `total` is a fixed
 *       estimate with `pagination_total_exact: false`.
 *
 *       Note: when a full-text/metadata filter is active a page may under-fill
 *       (`data.length < limit`) because some matched work ids do not hydrate
 *       through the publications join; clients must rely on
 *       `pagination.hasNext` / `pagination.total`, not the row count, to detect
 *       the last page. `sort_by=publication_year` may surface out-of-range
 *       future years present in the source data.
 *     tags: [Works]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of results per page (1..100, default 10)
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: |
 *           Free-text query resolved through Manticore across
 *           title/subtitle/abstract/authors/subjects/venue. `search` is an
 *           accepted alias.
 *         example: kinship
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Alias of `q`.
 *       - in: query
 *         name: author
 *         schema:
 *           type: string
 *         description: Manticore `authors` filter (AND semantics). Matches works whose author names contain the term.
 *         example: silva
 *       - in: query
 *         name: subject
 *         schema:
 *           type: string
 *         description: Manticore `subjects` filter (AND semantics).
 *         example: anthropology
 *       - in: query
 *         name: venue_name
 *         schema:
 *           type: string
 *         description: Venue-name filter matched against MariaDB `ft_venues_search`. `venue` is an accepted alias.
 *         example: mana
 *       - in: query
 *         name: venue
 *         schema:
 *           type: string
 *         description: Alias of `venue_name`.
 *       - in: query
 *         name: venue_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Exact venue id filter.
 *         example: 1012159
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, CONFERENCE_PAPER, REPORT, DATASET, PREPRINT, REVIEW, EDITORIAL, OTHER]
 *         description: Filter by publication type (any_publication semantics). `work_type` is an accepted alias.
 *         example: ARTICLE
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 5
 *         description: Filter by ISO 639-1 language code (matches `works.language`).
 *         example: en
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Filter works whose displayed publication year is at or after this value.
 *         example: 2020
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Filter works whose displayed publication year is at or before this value.
 *         example: 2023
 *       - in: query
 *         name: open_access
 *         schema:
 *           type: boolean
 *         description: Filter by open access availability (accepts 1/0/true/false).
 *         example: true
 *       - in: query
 *         name: peer_reviewed
 *         schema:
 *           type: boolean
 *         description: Filter by peer-review status (accepts 1/0/true/false).
 *       - in: query
 *         name: cited_by_min
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive lower bound on `cited_by_count` (`works.citation_count`). `citation_count_min` is an accepted alias.
 *         example: 10
 *       - in: query
 *         name: cited_by_max
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive upper bound on `cited_by_count`. `citation_count_max` is an accepted alias.
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [cited_by_count, references_count, publication_year, id, relevance]
 *         description: |
 *           Primary sort key (`sortBy` is an accepted alias). `cited_by_count` /
 *           `references_count` sort index-ordered against `works`; `relevance`
 *           applies only on the full-text path (`q`/`author`/`subject`/`venue_name`)
 *           and is the default there. With no filter the default order is
 *           `publication_year DESC, id DESC`.
 *         example: cited_by_count
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort direction for `sort_by` (`sortOrder` is an accepted alias). Defaults to DESC.
 *     responses:
 *       200:
 *         description: Paginated list of works.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/WorkListItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         match_mode:
 *                           type: string
 *                           example: any_publication
 *                         pagination_total_exact:
 *                           type: boolean
 *                         performance:
 *                           $ref: '#/components/schemas/PerformanceMeta'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */

/**
 * @swagger
 * /works/showcase:
 *   get:
 *     summary: Get works list optimized for browsing (showcase)
 *     description: |
 *       High-performance MariaDB-backed browse over the `works` base table
 *       joined to the latest publication per work. Returns the exact same row
 *       shape (`WorkListItem`) and `meta` as `GET /works`. Filters apply with
 *       **`match_mode: "any_publication"`** semantics: a work appears if any of
 *       its publications matches, and the displayed publication is the latest
 *       matching one. This endpoint accepts only the structured filters below;
 *       it does **not** read `q` / `search` / `author` / `subject` /
 *       `venue_name` / `peer_reviewed`. On the default unfiltered browse
 *       `total` is a fixed estimate with `pagination_total_exact: false`.
 *     tags: [Works]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of results per page (1..100, default 10)
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, CONFERENCE_PAPER, REPORT, DATASET, PREPRINT, REVIEW, EDITORIAL, OTHER]
 *         description: Filter by publication type (any_publication semantics).
 *         example: ARTICLE
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Filter works from this year onwards.
 *         example: 2020
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Filter works up to this year.
 *         example: 2023
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 5
 *         description: Filter by ISO 639-1 language code.
 *         example: en
 *       - in: query
 *         name: cited_by_min
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive lower bound on `cited_by_count`.
 *       - in: query
 *         name: cited_by_max
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive upper bound on `cited_by_count`.
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [cited_by_count, references_count, publication_year, id]
 *         description: Primary sort key for the showcase listing.
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort direction for `sort_by`.
 *     responses:
 *       200:
 *         description: Paginated works browse.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/WorkListItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         match_mode:
 *                           type: string
 *                           example: any_publication
 *                         pagination_total_exact:
 *                           type: boolean
 *                         performance:
 *                           $ref: '#/components/schemas/PerformanceMeta'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/showcase', validateWorksQuery, worksController.getWorksVitrine);

router.get('/', validateWorksQuery, worksController.getWorks);

/**
 * @swagger
 * /works/{id}:
 *   get:
 *     summary: Get specific academic work by ID
 *     description: |
 *       Returns the detailed payload for a work. The response embeds **all
 *       publications of the work** as `publications[]` (capped at 50, with
 *       `publications_total` and `publications_has_more` flags), each carrying
 *       its own `identifiers`, `venue`, `publisher`, `files`, `_links.self`,
 *       and an `is_primary` flag. Work-level aggregations expose
 *       `primary_publication_id` / `primary_publication`, convenience
 *       top-level `publication_year` / `doi` / `open_access` / `peer_reviewed`
 *       / `has_files` / `venue`, a `year_range` block, a distinct `venues[]`
 *       roll-up (with `publication_count` / `latest_year` per venue), a flat
 *       `files[]` aggregation (capped at 50, each entry carrying its parent
 *       `publication_id`), a `file_summary` block, aggregated `identifiers`
 *       (union over publications), `authors[]`, `subjects[]`, a `citations`
 *       object (`cited_by`, `references`, `unresolved_references`, and the
 *       `unsolved` alias), a `metrics` block, `funding[]`, and
 *       `summary_updated_at` (ISO of `works.metrics_last_updated`).
 *     tags: [Works]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Unique identifier of the work
 *         example: 7539537
 *       - in: query
 *         name: include_citations
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include the inline `citations.cited_by` list in the payload.
 *       - in: query
 *         name: include_references
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include the inline `citations.references` list in the payload.
 *     responses:
 *       200:
 *         description: Work retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/WorkDetail'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id', validateWorkId, worksController.getWork);

/**
 * @swagger
 * /works/{id}/bibliographies:
 *   get:
 *     summary: Get work bibliography usage
 *     description: |
 *       Lists the courses whose reading list includes this work, with per-course
 *       reading type and instructor information. Returns an empty list when
 *       course/bibliography data is not loaded.
 *     tags: [Works]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Work ID
 *         example: 2684644
 *       - in: query
 *         name: reading_type
 *         schema:
 *           type: string
 *           enum: [REQUIRED, RECOMMENDED, SUPPLEMENTARY, OPTIONAL]
 *         description: Filter by reading type
 *         example: RECOMMENDED
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1900
 *         description: Filter courses from this year
 *         example: 2020
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1900
 *         description: Filter courses up to this year
 *         example: 2025
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of results per page (1..100, default 10)
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: Work bibliography usage retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/WorkBibliographyItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id/bibliographies', validateWorkId, worksController.getWorkBibliography);

module.exports = router;
