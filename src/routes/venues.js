const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');
const { commonValidations } = require('../middleware/validation');
const venuesController = require('../controllers/venues.controller');

/**
 * @swagger
 * /venues:
 *   get:
 *     summary: Get list of academic venues
 *     description: Retrieve a paginated list of academic venues including journals, conferences, repositories, and book series. Supports filtering and sorting.
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
 *           enum: [name, type, impact_factor, works_count, id, score, ranking, h_index, cited_by_count, coverage_start_year, coverage_end_year, oldest, newest]
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
 *           enum: [name, type, impact_factor, works_count, id, score, ranking, h_index, cited_by_count, coverage_start_year, coverage_end_year, oldest, newest]
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
      .isIn(['JOURNAL', 'CONFERENCE', 'REPOSITORY', 'BOOK_SERIES', 'SOURCE_BOOK', 'OTHER'])
      .withMessage('Type must be one of: JOURNAL, CONFERENCE, REPOSITORY, BOOK_SERIES, SOURCE_BOOK, OTHER'),
    query('search')
      .optional({ values: 'falsy' })
      .isLength({ min: 1, max: 200 })
      .withMessage('Search term must be between 1 and 200 characters'),
    query('sortBy')
      .optional({ values: 'falsy' })
      .isIn(['name', 'type', 'impact_factor', 'works_count', 'id', 'score', 'ranking', 'h_index', 'cited_by_count', 'coverage_start_year', 'coverage_end_year', 'oldest', 'newest'])
      .withMessage('Sort field must be one of: name, type, impact_factor, works_count, id, score, ranking, h_index, cited_by_count, coverage_start_year, coverage_end_year, oldest, newest'),
    query('sort_by')
      .optional({ values: 'falsy' })
      .isIn(['name', 'type', 'impact_factor', 'works_count', 'id', 'score', 'ranking', 'h_index', 'cited_by_count', 'coverage_start_year', 'coverage_end_year', 'oldest', 'newest'])
      .withMessage('sort_by must be one of: name, type, impact_factor, works_count, id, score, ranking, h_index, cited_by_count, coverage_start_year, coverage_end_year, oldest, newest'),
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
      .toInt()
  ],
  venuesController.getAllVenues
);

/**
 * @swagger
 * /venues/statistics:
 *   get:
 *     summary: Get venue statistics
 *     description: Retrieve aggregate venue counts (per type, all six types) and impact-factor / ranking-score summaries. Returns a single flat object (no pagination).
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
 *     description: Search venues by name (MariaDB LIKE over `name`, `abbreviated_name`, `issn`, `eissn`, and publisher name), optionally filtered by type. Rows are the same shape as `/venues`; results are fixed-ordered by `COALESCE(total_score,0) DESC, name ASC` (no sort param). `meta` carries `source` and the echoed `query`.
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
 *     description: Retrieve detailed information about a specific venue
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
