const express = require('express');
const router = express.Router();
const subjectsController = require('../controllers/subjects.controller');
const rateLimit = require('../middleware/rateLimiting');
const { query, param } = require('express-validator');

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

const validateSubjectId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Subject ID must be a positive integer')
];

const validateSubjectWorks = [
  ...validatePagination,
  query('min_relevance')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('min_relevance must be a positive number'),
  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: 2030 })
    .withMessage('year_from must be a valid year'),
  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: 2030 })
    .withMessage('year_to must be a valid year'),
  query('document_type')
    .optional({ values: 'falsy' })
    .isLength({ min: 1, max: 50 })
    .withMessage('document_type must be between 1 and 50 characters'),
  query('language')
    .optional({ values: 'falsy' })
    .isLength({ min: 2, max: 10 })
    .withMessage('language must be between 2 and 10 characters')
];

const validateSubjectCourses = [
  ...validatePagination,
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
    .withMessage('reading_type must be between 1 and 50 characters')
];

/**
 * @swagger
 * /subjects/statistics:
 *   get:
 *     summary: Subject statistics
 *     description: >-
 *       Structural and work-linkage rollup over the whole `subjects` table.
 *       Takes no parameters. `works_count` figures derive from the denormalized
 *       `subjects.total_works` column; `total_work_subject_relations` is the SUM
 *       of those per-subject counts (not a count of distinct work_subjects rows).
 *       Cached for 1 hour.
 *     tags: [Subjects]
 *     responses:
 *       200:
 *         description: Aggregate subject statistics.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SubjectStatistics'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/statistics', subjectsController.getSubjectsStatistics);

/**
 * @swagger
 * /subjects/{id}:
 *   get:
 *     summary: Get subject by ID
 *     description: >-
 *       Single controlled-vocabulary subject term. `works_count` is read from the
 *       denormalized `subjects.total_works` column. `avg_relevance_score` is always
 *       null by design (the underlying relevance_score is a uniform placeholder) and
 *       `courses_count` is always 0 (course linkage is not populated). Returns 404
 *       when the id does not exist. Cached for 1 hour.
 *     tags: [Subjects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Subject id.
 *         schema:
 *           type: integer
 *           minimum: 1
 *     responses:
 *       200:
 *         description: Subject detail.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SubjectDetail'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id', validateSubjectId, subjectsController.getSubjectById);

/**
 * @swagger
 * /subjects/{id}/children:
 *   get:
 *     summary: List subject children
 *     description: >-
 *       Direct children (one level down) of the subject, ordered by
 *       `works_count` DESC then term ASC. On child rows `parent_term` is always
 *       null and `courses_count` is always 0. A non-existent parent id returns an
 *       HTTP 200 empty page (no existence 404 on this endpoint). Cached for 1 hour.
 *     tags: [Subjects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Parent subject id.
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: Paginated list of direct child subjects.
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
 *                         $ref: '#/components/schemas/SubjectChild'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id/children', [...validateSubjectId, ...validatePagination], subjectsController.getSubjectChildren);
/**
 * @swagger
 * /subjects/{id}/hierarchy:
 *   get:
 *     summary: Get subject hierarchy
 *     description: >-
 *       Ancestor chain from the root down to the requested subject, walking
 *       `parent_id`. Returns a flat array (root first, the requested subject last),
 *       unpaginated. Nodes are raw rows carrying only id, term, vocabulary,
 *       parent_id and works_count — they do not include `_links`, `subject_type`,
 *       or `created_at`. Returns 404 when the id does not exist. Cached for 1 hour.
 *     tags: [Subjects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Subject id.
 *         schema:
 *           type: integer
 *           minimum: 1
 *     responses:
 *       200:
 *         description: Root-first ancestor chain including the requested subject.
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
 *                         $ref: '#/components/schemas/SubjectHierarchyNode'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id/hierarchy', validateSubjectId, subjectsController.getSubjectHierarchy);
/**
 * @swagger
 * /subjects/{id}/works:
 *   get:
 *     summary: List works for a subject
 *     description: >-
 *       Works tagged with this subject (via `work_subjects`), ordered by
 *       relevance_score DESC then publication_year DESC. `used_in_courses` is
 *       always 0 (course linkage not populated). A non-existent subject id returns
 *       an HTTP 200 empty page (no existence 404 on this endpoint). Cached for 1 hour.
 *     tags: [Subjects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Subject id.
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: min_relevance
 *         description: Keep only rows with work_subjects.relevance_score >= this value.
 *         schema:
 *           type: number
 *           format: float
 *           minimum: 0
 *       - in: query
 *         name: year_from
 *         description: Lower bound (inclusive) on the work's publication year.
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2030
 *       - in: query
 *         name: year_to
 *         description: Upper bound (inclusive) on the work's publication year.
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2030
 *       - in: query
 *         name: document_type
 *         description: Exact match against the publication type (e.g. ARTICLE, BOOK).
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *       - in: query
 *         name: language
 *         description: Exact match against the work language (ISO 639-1).
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 10
 *     responses:
 *       200:
 *         description: Paginated list of works tagged with this subject.
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
 *                         $ref: '#/components/schemas/SubjectWork'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id/works', [...validateSubjectId, ...validateSubjectWorks], subjectsController.getSubjectWorks);
/**
 * @swagger
 * /subjects/{id}/courses:
 *   get:
 *     summary: List courses for a subject
 *     description: >-
 *       Courses whose bibliography includes a work tagged with this subject.
 *       Currently always returns an empty page because the course domain
 *       (`courses` / `course_bibliography`) is not populated; the row shape below
 *       documents the populated response. A non-existent subject id returns an
 *       HTTP 200 empty page (no existence 404 on this endpoint). Cached for 1 hour.
 *     tags: [Subjects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Subject id.
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: year_from
 *         description: Lower bound (inclusive) on the course year.
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2030
 *       - in: query
 *         name: year_to
 *         description: Upper bound (inclusive) on the course year.
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2030
 *       - in: query
 *         name: program_id
 *         description: Restrict to courses in this program.
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: reading_type
 *         description: Exact match against course_bibliography.reading_type.
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *     responses:
 *       200:
 *         description: Paginated list of courses referencing this subject (currently always empty).
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
 *                         $ref: '#/components/schemas/SubjectCourse'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id/courses', [...validateSubjectId, ...validateSubjectCourses], subjectsController.getSubjectCourses);

module.exports = router;
