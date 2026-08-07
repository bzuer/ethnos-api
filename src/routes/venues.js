const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');
const { commonValidations } = require('../middleware/validation');
const venuesController = require('../controllers/venues.controller');

const VENUE_TYPES = ['JOURNAL', 'CONFERENCE', 'REPOSITORY', 'BOOK_SERIES', 'SOURCE_BOOK', 'OTHER'];
const VENUE_QUARTILES = ['Q1', 'Q2', 'Q3', 'Q4'];
const VENUE_VALIDATION_STATUSES = ['PENDING', 'VALIDATED', 'NOT_FOUND', 'FAILED'];
const VENUE_SORTS = [
  'name', 'type', 'id', 'score', 'ranking', 'works_count', 'cited_by_count',
  'impact_factor', 'citescore', 'sjr', 'snip', 'h_index', 'i10_index',
  'two_yr_mean_citedness', 'overton', 'female_share',
  'coverage_start_year', 'coverage_end_year', 'oldest', 'newest',
  'created_at', 'updated_at'
];

const validateVenueFilters = [
  query('country').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 2 }).withMessage('country must be a 2-letter ISO code'),
  query('country_code').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 2 }).withMessage('country_code must be a 2-letter ISO code'),
  query('language').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 3 }).withMessage('language must be a 2 or 3 letter code'),
  query('lang').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 3 }).withMessage('lang must be a 2 or 3 letter code'),
  query('aggregation_type').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 50 }).withMessage('aggregation_type must be between 2 and 50 characters'),
  query('publisher_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('publisher_id must be a positive integer'),
  query('sjr_best_quartile').optional({ values: 'falsy' }).trim().toUpperCase().isIn(VENUE_QUARTILES).withMessage(`sjr_best_quartile must be one of: ${VENUE_QUARTILES.join(', ')}`),
  query('validation_status').optional({ values: 'falsy' }).trim().toUpperCase().isIn(VENUE_VALIDATION_STATUSES).withMessage(`validation_status must be one of: ${VENUE_VALIDATION_STATUSES.join(', ')}`),
  query('open_access').optional({ values: 'falsy' }).isBoolean().withMessage('open_access must be a boolean'),
  query('is_in_doaj').optional({ values: 'falsy' }).isBoolean().withMessage('is_in_doaj must be a boolean'),
  query('is_in_scielo').optional({ values: 'falsy' }).isBoolean().withMessage('is_in_scielo must be a boolean'),
  query('is_indexed_in_scopus').optional({ values: 'falsy' }).isBoolean().withMessage('is_indexed_in_scopus must be a boolean'),
  query('is_oa_diamond').optional({ values: 'falsy' }).isBoolean().withMessage('is_oa_diamond must be a boolean'),
  query('has_issn').optional({ values: 'falsy' }).isBoolean().withMessage('has_issn must be a boolean'),
  query('has_isbn13').optional({ values: 'falsy' }).isBoolean().withMessage('has_isbn13 must be a boolean'),
  query('has_summary').optional({ values: 'falsy' }).isBoolean().withMessage('has_summary must be a boolean'),
  query('works_min').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('works_min must be a non-negative integer'),
  query('works_max').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('works_max must be a non-negative integer'),
  query('cited_by_min').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('cited_by_min must be a non-negative integer'),
  query('cited_by_max').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('cited_by_max must be a non-negative integer'),
  query('impact_factor_min').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('impact_factor_min must be a non-negative number'),
  query('impact_factor_max').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('impact_factor_max must be a non-negative number'),
  query('h_index_min').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('h_index_min must be a non-negative integer'),
  query('score_min').optional({ values: 'falsy' }).isFloat().withMessage('score_min must be a number')
];

/**
 * @swagger
 * /venues:
 *   get:
 *     summary: Get list of academic venues
 *     description: >-
 *       Retrieve a paginated list of academic venues including journals, conferences, repositories, book series, and
 *       source books. Every row carries the full venue surface: `identifiers` (issn, eissn, isbn13, scopus_id,
 *       wikidata_id, openalex_id, scielo_id, mag_id, openlibrary_work), `indexing` (doaj, scielo, scopus, oa_diamond,
 *       validation_status), `metrics` (impact_factor, citescore, sjr, sjr_best_quartile, snip, h_index, i10_index,
 *       two_yr_mean_citedness, overton, female_share), `ranking` (score, components, llm), and the `publisher`
 *       organization with its own identifiers and `_links.self`. `summary` is the editorial presentation of the venue,
 *       truncated to 500 characters with `summary_truncated` flagging the cut; the full text is on `/venues/{id}`.
 *     tags: [Venues]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page (max 100)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of items to skip (alternative to page parameter)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [JOURNAL, CONFERENCE, REPOSITORY, BOOK_SERIES, SOURCE_BOOK, OTHER]
 *         description: Filter by venue type
 *         example: JOURNAL
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 200
 *         description: Free-text term matched with a MariaDB LIKE over `name`, `abbreviated_name`, `issn`, `eissn`, and the publisher name. (The dedicated `/venues/search` endpoint uses `q` instead.)
 *         example: Nature
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, type, id, score, ranking, works_count, cited_by_count, impact_factor, citescore, sjr, snip, h_index, i10_index, two_yr_mean_citedness, overton, female_share, coverage_start_year, coverage_end_year, oldest, newest, created_at, updated_at]
 *           default: score
 *         description: |
 *           Field to sort by. Defaults to `score` (global ranking score) so the most important venues come first.
 *           `oldest` is an alias for `coverage_start_year` (ASC by default — oldest coverage first); `newest` is an alias
 *           for `coverage_end_year` (DESC by default — most recently covered first). Rows with NULL coverage years are
 *           always pushed to the tail regardless of direction. The snake_case spelling `sort_by` is also accepted.
 *         example: score
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [name, type, id, score, ranking, works_count, cited_by_count, impact_factor, citescore, sjr, snip, h_index, i10_index, two_yr_mean_citedness, overton, female_share, coverage_start_year, coverage_end_year, oldest, newest, created_at, updated_at]
 *         description: snake_case alias of `sortBy`.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         description: Sort order. When omitted, numeric/ranking fields default to `DESC`; `id`, `name`, `type`, `coverage_start_year`, and `oldest` default to `ASC`; `coverage_end_year` and `newest` default to `DESC`. The snake_case spelling `sort_order` is also accepted.
 *         example: DESC
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         description: snake_case alias of `sortOrder`.
 *       - in: query
 *         name: coverage_from
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Keep only venues whose `coverage_start_year` is greater than or equal to this year.
 *         example: 1950
 *       - in: query
 *         name: coverage_to
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Keep only venues whose `coverage_end_year` is less than or equal to this year.
 *         example: 2024
 *       - in: query
 *         name: coverage_start_from
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive lower bound on `coverage_start_year`.
 *       - in: query
 *         name: coverage_start_to
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive upper bound on `coverage_start_year`.
 *       - in: query
 *         name: coverage_end_from
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive lower bound on `coverage_end_year`.
 *       - in: query
 *         name: coverage_end_to
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive upper bound on `coverage_end_year`.
 *       - in: query
 *         name: active_in_year
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Keep only venues whose coverage range covers the supplied year (coverage_start_year <= year <= coverage_end_year).
 *         example: 2010
 *       - in: query
 *         name: min_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Keyset-pagination helper — return only venues with `id` greater than or equal to this value.
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 2
 *         description: ISO-2 country code of the venue (`country_code` is an accepted alias).
 *         example: BR
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 3
 *         description: Venue language from `venues.lang` (`lang` is an accepted alias).
 *         example: pt
 *       - in: query
 *         name: aggregation_type
 *         schema:
 *           type: string
 *         description: Source aggregation label. Live values are `journal`, `bookseries`, `conferenceproceeding`, `tradejournal`.
 *         example: journal
 *       - in: query
 *         name: publisher_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Keep only venues published by this organization id (see `/institutions/{id}`).
 *       - in: query
 *         name: sjr_best_quartile
 *         schema:
 *           type: string
 *           enum: [Q1, Q2, Q3, Q4]
 *         description: Filter by best SJR subject quartile (`quartile` is an accepted alias).
 *       - in: query
 *         name: validation_status
 *         schema:
 *           type: string
 *           enum: [PENDING, VALIDATED, NOT_FOUND, FAILED]
 *         description: Filter by the operator validation audit status.
 *       - in: query
 *         name: open_access
 *         schema:
 *           type: boolean
 *         description: Keep only fully open-access venues (or only non-OA when false).
 *       - in: query
 *         name: is_in_doaj
 *         schema:
 *           type: boolean
 *         description: Filter on DOAJ indexing.
 *       - in: query
 *         name: is_in_scielo
 *         schema:
 *           type: boolean
 *         description: Filter on SciELO indexing.
 *       - in: query
 *         name: is_indexed_in_scopus
 *         schema:
 *           type: boolean
 *         description: Filter on Scopus indexing.
 *       - in: query
 *         name: is_oa_diamond
 *         schema:
 *           type: boolean
 *         description: Filter on diamond open access. `false` also matches venues where the flag is NULL.
 *       - in: query
 *         name: has_issn
 *         schema:
 *           type: boolean
 *         description: Keep venues carrying an `issn` or `eissn` (serial surface).
 *       - in: query
 *         name: has_isbn13
 *         schema:
 *           type: boolean
 *         description: Keep venues carrying an `isbn13` — the identifier that matters for SOURCE_BOOK venues.
 *       - in: query
 *         name: has_summary
 *         schema:
 *           type: boolean
 *         description: Keep venues that do (or do not) carry an editorial `summary`.
 *       - in: query
 *         name: works_min
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive lower bound on `works_count`.
 *       - in: query
 *         name: works_max
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive upper bound on `works_count`.
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
 *         name: impact_factor_min
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Inclusive lower bound on `impact_factor`. Venues with a NULL impact factor are excluded.
 *       - in: query
 *         name: impact_factor_max
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Inclusive upper bound on `impact_factor`.
 *       - in: query
 *         name: h_index_min
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive lower bound on `h_index`.
 *       - in: query
 *         name: score_min
 *         schema:
 *           type: number
 *         description: Inclusive lower bound on the ranking score (`venues.total_score`).
 *     responses:
 *       200:
 *         description: Paginated list of venues. `offset` is snapped to a page boundary and echoed under `meta.pagination_extras.offset`; `meta.sort` reports the effective `{ by, order }`, and `meta.filters` appears only when a filter is applied.
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
 *                         $ref: '#/components/schemas/VenueListItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
router.get(
  '/',
  [
    ...commonValidations.pagination,
    query('type')
      .optional({ values: 'falsy' })
      .isIn(VENUE_TYPES)
      .withMessage(`Type must be one of: ${VENUE_TYPES.join(', ')}`),
    query('search')
      .optional({ values: 'falsy' })
      .isLength({ min: 1, max: 200 })
      .withMessage('Search term must be between 1 and 200 characters'),
    query('sortBy')
      .optional({ values: 'falsy' })
      .isIn(VENUE_SORTS)
      .withMessage(`Sort field must be one of: ${VENUE_SORTS.join(', ')}`),
    query('sort_by')
      .optional({ values: 'falsy' })
      .isIn(VENUE_SORTS)
      .withMessage(`sort_by must be one of: ${VENUE_SORTS.join(', ')}`),
    query('sortOrder')
      .optional({ values: 'falsy' })
      .isIn(['ASC', 'DESC'])
      .withMessage('Sort order must be ASC or DESC'),
    query('sort_order')
      .optional({ values: 'falsy' })
      .customSanitizer(value => (typeof value === 'string' ? value.toUpperCase() : value))
      .isIn(['ASC', 'DESC'])
      .withMessage('sort_order must be ASC or DESC'),
    query('coverage_from')
      .optional({ values: 'falsy' })
      .isInt({ min: 0 })
      .withMessage('coverage_from must be a non-negative integer'),
    query('coverage_to')
      .optional({ values: 'falsy' })
      .isInt({ min: 0 })
      .withMessage('coverage_to must be a non-negative integer'),
    query('coverage_start_from')
      .optional({ values: 'falsy' })
      .isInt({ min: 0 })
      .withMessage('coverage_start_from must be a non-negative integer'),
    query('coverage_start_to')
      .optional({ values: 'falsy' })
      .isInt({ min: 0 })
      .withMessage('coverage_start_to must be a non-negative integer'),
    query('coverage_end_from')
      .optional({ values: 'falsy' })
      .isInt({ min: 0 })
      .withMessage('coverage_end_from must be a non-negative integer'),
    query('coverage_end_to')
      .optional({ values: 'falsy' })
      .isInt({ min: 0 })
      .withMessage('coverage_end_to must be a non-negative integer'),
    query('active_in_year')
      .optional({ values: 'falsy' })
      .isInt({ min: 0 })
      .withMessage('active_in_year must be a non-negative integer'),
    query('min_id')
      .optional({ values: 'falsy' })
      .isInt({ min: 1 })
      .withMessage('min_id must be a positive integer')
      .toInt(),
    ...validateVenueFilters
  ],
  venuesController.getAllVenues
);

/**
 * @swagger
 * /venues/statistics:
 *   get:
 *     summary: Get venue statistics
 *     description: >-
 *       Retrieve aggregate venue counts (per type, all six types), open-access and diamond-OA counts, the SJR quartile
 *       distribution (`sjr_quartiles`), identifier coverage (`identifier_coverage` — issn, isbn13, openlibrary_work,
 *       openalex_id, scopus_id, wikidata_id), publisher linkage (`with_publisher`), editorial-summary coverage
 *       (`with_summary`), and impact-factor / ranking-score summaries. Returns a single flat object (no pagination).
 *     tags: [Venues]
 *     responses:
 *       200:
 *         description: Aggregate venue statistics.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/VenueStatistics'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
router.get(
  '/statistics',
  venuesController.getVenueStatistics
);

/**
 * @swagger
 * /venues/search:
 *   get:
 *     summary: Search venues
 *     description: Search venues by name (MariaDB LIKE over `name`, `abbreviated_name`, `issn`, `eissn`, and publisher name — the `summary` text is not searched), optionally filtered by type. Rows are the same shape as `/venues`; results are fixed-ordered by `COALESCE(total_score,0) DESC, name ASC` (no sort param). `meta` carries `source` and the echoed `query`.
 *     tags: [Venues]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 200
 *         description: Search query for venue name (required; this endpoint uses `q`, not `search`).
 *         example: Nature
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [JOURNAL, CONFERENCE, REPOSITORY, BOOK_SERIES, SOURCE_BOOK, OTHER]
 *         description: Filter by venue type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: Paginated venue search results (same row shape as `/venues`).
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
 *                         $ref: '#/components/schemas/VenueListItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         source:
 *                           type: string
 *                           example: venues
 *                         query:
 *                           type: string
 *                           description: Echo of the `q` search term.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get(
  '/search',
  [
    query('q')
      .notEmpty()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search query is required and must be between 1 and 200 characters'),
    query('type')
      .optional({ values: 'falsy' })
      .isIn(['JOURNAL', 'CONFERENCE', 'REPOSITORY', 'BOOK_SERIES', 'SOURCE_BOOK', 'OTHER'])
      .withMessage('Type must be one of: JOURNAL, CONFERENCE, REPOSITORY, BOOK_SERIES, SOURCE_BOOK, OTHER'),
    query('limit')
      .optional({ values: 'falsy' })
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional({ values: 'falsy' })
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
  ],
  venuesController.searchVenues
);

/**
 * @swagger
 * /venues/{id}:
 *   get:
 *     summary: Get venue by ID
 *     description: Retrieve detailed information about a specific venue. `summary` carries the complete editorial presentation text (never truncated, so `summary_truncated` is always false).
 *     tags: [Venues]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Venue ID
 *         example: 1
 *       - in: query
 *         name: include_subjects
 *         schema: { type: boolean, default: true }
 *         description: Include the venue's top subjects.
 *       - in: query
 *         name: include_yearly
 *         schema: { type: boolean, default: true }
 *         description: Include yearly publication statistics.
 *       - in: query
 *         name: include_top_authors
 *         schema: { type: boolean, default: true }
 *         description: Include the venue's top authors.
 *       - in: query
 *         name: include_recent_works
 *         schema: { type: boolean, default: true }
 *         description: Include the venue's most recent works.
 *     responses:
 *       200:
 *         description: Full venue detail. `meta.includes` reflects the effective include flags. `top_publications[]` is always present when non-empty (it has no include flag).
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/VenueDetail'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get(
  '/:id',
  [
    param('id')
      .matches(/^\d+$/)
      .withMessage('Invalid venue ID')
      .isInt({ min: 1 })
      .withMessage('Venue ID must be a positive integer'),
    query('include_subjects')
      .optional({ values: 'falsy' })
      .isBoolean()
      .withMessage('include_subjects must be a boolean')
      .toBoolean(),
    query('include_yearly')
      .optional({ values: 'falsy' })
      .isBoolean()
      .withMessage('include_yearly must be a boolean')
      .toBoolean(),
    query('include_top_authors')
      .optional({ values: 'falsy' })
      .isBoolean()
      .withMessage('include_top_authors must be a boolean')
      .toBoolean(),
    query('include_recent_works')
      .optional({ values: 'falsy' })
      .isBoolean()
      .withMessage('include_recent_works must be a boolean')
      .toBoolean()
  ],
  venuesController.getVenueById
);

/**
 * @swagger
 * /venues/{id}/works:
 *   get:
 *     summary: Get works published in a venue with citations and authors
 *     description: Retrieve all works published in a specific venue ordered by citation count and publication year, including complete author information
 *     tags: [Venues]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Venue ID
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of items to skip
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           minimum: 1900
 *         description: Exact publication year filter.
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Inclusive lower bound on publication year.
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Inclusive upper bound on publication year.
 *       - in: query
 *         name: cited_by_min
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Keep only works whose cited_by_count is greater than or equal to this value.
 *         example: 10
 *       - in: query
 *         name: cited_by_max
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Keep only works whose cited_by_count is less than or equal to this value.
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [cited_by_count, references_count, publication_year, citation_count, reference_count, year]
 *         description: Primary sort key. `cited_by_count` surfaces the venue's most cited works first. Accepted aliases — `citation_count` (= `cited_by_count`), `reference_count` (= `references_count`), `year` (= `publication_year`); the camelCase spelling `sortBy` is also honoured.
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort direction for `sort_by` (camelCase `sortOrder` also honoured).
 *       - in: query
 *         name: citation_count_min
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Alias of `cited_by_min`.
 *       - in: query
 *         name: citation_count_max
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Alias of `cited_by_max`.
 *     responses:
 *       200:
 *         description: Paginated works published in the venue. Rows key the publication year as `year` (not `publication_year`). `meta` carries only `request` and `pagination_extras` (plus `filters.year` when `year` is set) — there is no `meta.match_mode` or `meta.sort` here.
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
 *                         $ref: '#/components/schemas/VenueWork'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get(
  '/:id/works',
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Venue ID must be a positive integer'),
    query('limit')
      .optional({ values: 'falsy' })
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional({ values: 'falsy' })
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),
    query('year')
      .optional({ values: 'falsy' })
      .isInt({ min: 1900 })
      .withMessage('Year must be equal to or greater than 1900'),
    query('year_from')
      .optional({ values: 'falsy' })
      .isInt({ min: 1000 })
      .withMessage('year_from must be a valid year'),
    query('year_to')
      .optional({ values: 'falsy' })
      .isInt({ min: 1000 })
      .withMessage('year_to must be a valid year'),
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
      .isIn(['cited_by_count', 'citation_count', 'references_count', 'reference_count', 'publication_year', 'year'])
      .withMessage('sort_by must be one of: cited_by_count, references_count, publication_year'),
    query('sort_order')
      .optional({ values: 'falsy' })
      .customSanitizer(value => (typeof value === 'string' ? value.toUpperCase() : value))
      .isIn(['ASC', 'DESC'])
      .withMessage('sort_order must be ASC or DESC')
  ],
  venuesController.getVenueWorks
);

module.exports = router;
