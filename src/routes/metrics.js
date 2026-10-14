const express = require('express');
const router = express.Router();
const { query } = require('express-validator');
const metricsController = require('../controllers/metrics.controller');

const validateLimit = [
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
    .withMessage('Offset must be a non-negative integer')
];

const validateAnnualStats = [
  ...validateLimit,
  
  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year from must be a valid year'),
  
  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year to must be a valid year')
];

const validateInstitutionProductivity = [
  ...validateLimit,
  
  query('country_code')
    .optional({ values: 'falsy' })
    .isLength({ min: 2, max: 2 })
    .withMessage('Country code must be 2 characters')
];

const validatePersonProduction = [
  ...validateLimit,
  
  query('organization_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('Organization ID must be a positive integer'),

  query('min_works')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('min_works must be a non-negative integer')
];

const validateCollaborations = [
  ...validateLimit,
  
  query('min_collaborations')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 50 })
    .withMessage('Minimum collaborations must be between 1 and 50')
];

/**
 * @swagger
 * /metrics/annual:
 *   get:
 *     summary: Annual publication statistics
 *     tags: [Metrics]
 *     description: >-
 *       Yearly roll-up read from the operator-maintained metrics_annual_summary table (fallback to a
 *       live aggregation over publications only if the table is absent). Years are bounded
 *       1000..YEAR(CURDATE())+1 and ordered year DESC. Each row nests a metrics block and a growth
 *       block (growth.* are always null). meta.summary covers every year in the requested range, not
 *       only the page: scope ("all_years_in_range"), total_years, date_range ("min-max"),
 *       total_publications_all_years, avg_publications_per_year, growth_trend (mean of the 3 most recent
 *       complete years vs the 3 before; increasing|stable|decreasing above ±10%, insufficient_data with
 *       fewer than 6 complete years), source and refreshed_at (latest refresh of the summary table).
 *     parameters:
 *       - name: year_from
 *         in: query
 *         required: false
 *         description: Inclusive lower bound on year (1900..current year + 1).
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           example: 2020
 *       - name: year_to
 *         in: query
 *         required: false
 *         description: Inclusive upper bound on year (1900..current year + 1).
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           example: 2024
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: Annual statistics, newest year first.
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
 *                         $ref: '#/components/schemas/MetricsAnnualItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *       503:
 *         $ref: '#/components/responses/RequestTimeout'
 */
router.get('/annual', validateAnnualStats, metricsController.getAnnualStats);

/**
 * @swagger
 * /metrics/venues:
 *   get:
 *     summary: Top venues by works count
 *     description: >-
 *       Venues ranked by venues.works_count DESC (tiebreak total_score DESC), restricted to
 *       works_count > 0. ranking is the global rank (offset + index + 1). metrics.unique_authors,
 *       metrics.open_access_works and metrics.open_access_percentage are placeholder zeros (not
 *       computed). timespan uses the venue coverage years. meta.summary carries total_venues_ranked,
 *       top_venue_publications, total_unique_authors (0), avg_open_access_percentage (0) and the
 *       page's distinct venue_types.
 *     tags: [Metrics]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: Venue ranking list.
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
 *                         $ref: '#/components/schemas/MetricsVenueRankingItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *       503:
 *         $ref: '#/components/responses/RequestTimeout'
 */
router.get('/venues', validateLimit, metricsController.getTopVenues);

/**
 * @swagger
 * /metrics/institutions:
 *   get:
 *     summary: Institution productivity ranking
 *     description: >-
 *       Organizations ranked by organizations.publication_count DESC (tiebreak id ASC), restricted
 *       to publication_count > 0. ranking is the global rank (offset + index + 1). Stored metric
 *       columns are presented verbatim; productivity_score is always null.
 *       metrics.open_access_works_count is scope-mismatched and can exceed total_works, so do not
 *       derive an OA percentage from it. timespan first/latest publication year come from an
 *       authorships+publications join over the page's organizations and the latest year can be a
 *       future year present in the data.
 *     tags: [Metrics]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - name: country_code
 *         in: query
 *         required: false
 *         description: Filter by ISO 3166-1 alpha-2 country code (exactly 2 characters).
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 2
 *           example: "BR"
 *     responses:
 *       200:
 *         description: Institution ranking list.
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
 *                         $ref: '#/components/schemas/MetricsInstitutionRankingItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *       503:
 *         $ref: '#/components/responses/RequestTimeout'
 */
router.get('/institutions', validateInstitutionProductivity, metricsController.getInstitutionProductivity);

/**
 * @swagger
 * /metrics/persons:
 *   get:
 *     summary: Person production analytics
 *     description: >-
 *       Researchers ranked by persons.total_works DESC, then persons.id DESC (base filter
 *       total_works > 0). ranking is the global rank (offset + index + 1). primary_affiliation and
 *       productivity_score are always null. meta.filters echoes organization_id (as a string when
 *       provided).
 *     tags: [Metrics]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - name: min_works
 *         in: query
 *         required: false
 *         description: Minimum works threshold (total_works >= min_works). Non-integer or negative values are a 400; 0 or omitted applies no extra filter.
 *         schema:
 *           type: integer
 *           minimum: 0
 *       - name: organization_id
 *         in: query
 *         required: false
 *         description: Restrict to persons with an authorship whose affiliation_id equals this organization id.
 *         schema:
 *           type: integer
 *           minimum: 1
 *     responses:
 *       200:
 *         description: Person ranking list.
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
 *                         $ref: '#/components/schemas/MetricsPersonRankingItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *       503:
 *         $ref: '#/components/responses/RequestTimeout'
 */
router.get('/persons', validatePersonProduction, metricsController.getPersonProduction);

/**
 * @swagger
 * /metrics/collaborations:
 *   get:
 *     summary: Top collaboration pairs
 *     description: >-
 *       Top co-authorship pairs, computed by the same statement as /collaborations/top: pairs among
 *       the 2,000 persons with the most works (total_works >= 30), AUTHOR role on both sides, each shared
 *       work counted once. Ordered by shared_works DESC, avg_shared_citations DESC, then the person ids;
 *       ranking is the global rank (offset + index + 1). Rows use the CollaborationPair shape and the
 *       shared strength scale. pagination.total is exact and meta.pagination_total_exact is true; if the
 *       statement exceeds its budget the page is empty with meta.degraded = true and
 *       meta.pagination_total_exact = false. meta.summary carries total_collaboration_pairs,
 *       strongest_collaboration_count, avg_collaboration_years and a page-level
 *       collaboration_strength_distribution histogram. Differs from /collaborations/top only in the
 *       min_collaborations default (2 here, 5 there) and the absence of year filters.
 *     tags: [Metrics]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - name: min_collaborations
 *         in: query
 *         required: false
 *         description: Minimum shared works per pair (shared_works >= min_collaborations). Defaults to 2.
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 2
 *     responses:
 *       200:
 *         description: Collaboration pair ranking list.
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
 *                         $ref: '#/components/schemas/MetricsCollaborationRankingItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *       503:
 *         $ref: '#/components/responses/RequestTimeout'
 */
router.get('/collaborations', validateCollaborations, metricsController.getCollaborations);

module.exports = router;
