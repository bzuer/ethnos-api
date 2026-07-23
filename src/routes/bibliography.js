const express = require('express');
const router = express.Router();
const bibliographyController = require('../controllers/bibliography.controller');
const rateLimit = require('../middleware/rateLimiting');
const { query } = require('express-validator');

router.use(rateLimit.generalLimiter);

const validatePagination = [
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

const validateBibliographyList = [
  ...validatePagination,
  query('course_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('course_id must be a positive integer'),
  query('work_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('work_id must be a positive integer'),
  query('instructor_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('instructor_id must be a positive integer'),
  query('reading_type')
    .optional({ values: 'falsy' })
    .isLength({ min: 1, max: 50 })
    .withMessage('reading_type must be between 1 and 50 characters'),
  query('week_number')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('week_number must be a positive integer'),
  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: 2030 })
    .withMessage('year_from must be a valid year'),
  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: 2030 })
    .withMessage('year_to must be a valid year'),
  query('program_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('program_id must be a positive integer'),
  query('search')
    .optional({ values: 'falsy' })
    .isLength({ min: 1, max: 255 })
    .withMessage('search must be between 1 and 255 characters'),
  query('light')
    .optional({ values: 'falsy' })
    .isBoolean()
    .withMessage('light must be boolean')
];

const validateBibliographyAnalysis = [
  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: 2030 })
    .withMessage('year_from must be a valid year'),
  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: 2030 })
    .withMessage('year_to must be a valid year'),
  query('program_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('program_id must be a positive integer'),
  query('reading_type')
    .optional({ values: 'falsy' })
    .isLength({ min: 1, max: 50 })
    .withMessage('reading_type must be between 1 and 50 characters'),
  query('limit')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100')
];

/**
 * @swagger
 * /bibliographies:
 *   get:
 *     summary: List bibliography entries (course readings)
 *     description: >-
 *       Lists course-reading assignments, one row per (course_id, work_id), joined from the
 *       course_bibliography table across courses, works and their latest publication. Fixed sort:
 *       course year DESC, then semester, week_number, reading_type, title (not client-controllable).
 *       The service auto-enables light mode whenever none of course_id/instructor_id/search is
 *       supplied, so the default bare listing returns author_count and instructors as null; those two
 *       fields are only populated on the filtered (non-light) query path.
 *     tags: [Bibliography]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: course_id
 *         description: Filter by course id.
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: work_id
 *         description: Filter by work id.
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: instructor_id
 *         description: Keep rows whose course has this instructor (course_instructors.canonical_person_id).
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: reading_type
 *         description: Exact match on course_bibliography.reading_type (e.g. required, recommended).
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *       - in: query
 *         name: week_number
 *         description: Filter by the course week the reading is assigned to.
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: year_from
 *         description: Lower bound on courses.year.
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2030
 *       - in: query
 *         name: year_to
 *         description: Upper bound on courses.year.
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2030
 *       - in: query
 *         name: program_id
 *         description: Filter by courses.program_id.
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: search
 *         description: LIKE search across works.title, courses.name and courses.code.
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 255
 *       - in: query
 *         name: light
 *         description: >-
 *           Force the lightweight query, dropping the author_count/instructors subquery (they return
 *           null). Light mode is also auto-enabled when no course_id/instructor_id/search filter is set.
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Paginated list of bibliography entries (empty until course data is loaded operator-side).
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
 *                         $ref: '#/components/schemas/BibliographyItem'
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

router.get('/', validateBibliographyList, bibliographyController.getBibliography);

/**
 * @swagger
 * /bibliographies/analyses:
 *   get:
 *     summary: Bibliography analytics
 *     description: >-
 *       Aggregate analytics over course bibliographies: most-reused works, per-year trends, and
 *       reading-type / document-type distributions. Returns a single object (no pagination envelope).
 *     tags: [Bibliography]
 *     parameters:
 *       - in: query
 *         name: year_from
 *         description: Lower bound on courses.year, applied to all four aggregations.
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2030
 *       - in: query
 *         name: year_to
 *         description: Upper bound on courses.year, applied to all four aggregations.
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2030
 *       - in: query
 *         name: program_id
 *         description: Filter by courses.program_id.
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: reading_type
 *         description: Filter by course_bibliography.reading_type.
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *       - in: query
 *         name: limit
 *         description: >-
 *           Caps the most_used_works array only. trends_by_year and document_type_distribution are
 *           fixed at 10; reading_type_distribution is unbounded.
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Bibliography analytics object (arrays empty until course data is loaded operator-side).
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/BibliographyAnalyses'
 *                     meta:
 *                       type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/analyses', validateBibliographyAnalysis, bibliographyController.getBibliographyAnalysis);
/**
 * @swagger
 * /bibliographies/statistics:
 *   get:
 *     summary: Bibliography statistics
 *     description: >-
 *       Global rollup counts over course bibliographies, including reading-type distribution and a
 *       nested year_range block. No query parameters; returns a single object (no pagination envelope).
 *     tags: [Bibliography]
 *     responses:
 *       200:
 *         description: Bibliography statistics object (zeros/nulls until course data is loaded operator-side).
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/BibliographyStatistics'
 *                     meta:
 *                       type: object
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/statistics', bibliographyController.getBibliographyStatistics);

module.exports = router;
