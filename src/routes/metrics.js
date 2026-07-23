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
    .withMessage('Organization ID must be a positive integer')
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
 *       Yearly roll-up served from the operator-maintained precomputed metrics_annual_summary
 *       table (single indexed read per page, sub-second; transparent fallback to a live
 *       publications aggregation if the table is absent). Years are bounded 1000..YEAR(CURDATE())+1
 *       and ordered year DESC. Each row nests a metrics block (unique_organizations and
 *       avg_citations are real precomputed values) and a growth block (growth.* are always null).
 *       There is no total_downloads field — download counts are not computed in the DB.
 *       meta.summary carries total_years, date_range, total_works_all_years, avg_works_per_year
 *       and a growth_trend enum (increasing|stable|decreasing|insufficient_data or null).
 *     parameters:
 *       - name: year_from
 *         in: query
 *         required: false
 *         description: Inclusive lower bound on year (effective service floor is 1000).
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           example: 2020
 *       - name: year_to
 *         in: query
 *         required: false
 *         description: Inclusive upper bound on year.
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
 */
router.get('/annual', validateAnnualStats, metricsController.getAnnualStats);

/**
 * @swagger
 * /metrics/venues:
 *   get:
 *     summary: Top venues by works count
 *     description: >-
 *       Venues ranked by venues.works_count DESC (tiebreak total_score DESC). Compact ranking
 *       rows only. Note: metrics.unique_authors, metrics.open_access_works and
 *       metrics.open_access_percentage are placeholder zeros (not yet computed). timespan uses
 *       the venue coverage years. meta.summary carries total_venues_ranked, top_venue_publications,
 *       total_unique_authors (0), avg_open_access_percentage (0) and the page's distinct venue_types.
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
 */
router.get('/venues', validateLimit, metricsController.getTopVenues);

/**
 * @swagger
 * /metrics/institutions:
 *   get:
 *     summary: Institution productivity ranking
 *     description: >-
 *       Organizations ranked by organizations.publication_count DESC (tiebreak id ASC), restricted
 *       to publication_count > 0. Compact ranking rows only. productivity_score is always null.
 *       metrics.open_access_works_count is scope-mismatched and can exceed total_works, so do not
 *       derive an OA percentage from it. timespan first/latest publication year come from a bounded
 *       authorships+publications join and the latest year may be a garbage future year.
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
 */
router.get('/institutions', validateInstitutionProductivity, metricsController.getInstitutionProductivity);

/**
 * @swagger
 * /metrics/persons:
 *   get:
 *     summary: Person production analytics
 *     description: >-
 *       Researchers ranked by persons.total_works DESC (base filter total_works > 0). Compact
 *       ranking rows only. primary_affiliation and productivity_score are always null.
 *       meta.filters echoes organization_id (as a string when provided).
 *     tags: [Metrics]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - name: min_works
 *         in: query
 *         required: false
 *         description: Minimum works threshold (filters total_works >= min_works). No default applied when omitted.
 *         schema:
 *           type: integer
 *           minimum: 1
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
 */
router.get('/persons', validatePersonProduction, metricsController.getPersonProduction);

/**
 * @swagger
 * /metrics/collaborations:
 *   get:
 *     summary: Top collaboration pairs
 *     description: >-
 *       Top co-authorship pairs computed over the top ~2000 authors (persons.total_works >= 30),
 *       ordered by shared_works DESC. Each row is a flat pair shape identical to CollaborationPair
 *       (also served by /collaborations/top). meta.summary carries total_collaboration_pairs,
 *       strongest_collaboration_count, avg_collaboration_years and a
 *       collaboration_strength_distribution histogram. On statement-timeout the service degrades to
 *       an empty data array with meta.degraded = true.
 *     tags: [Metrics]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - name: min_collaborations
 *         in: query
 *         required: false
 *         description: Minimum shared works per pair (HAVING shared_works >= min_collaborations). Defaults to 2.
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
 */
router.get('/collaborations', validateCollaborations, metricsController.getCollaborations);

module.exports = router;
