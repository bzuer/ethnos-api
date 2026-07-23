const express = require('express');
const router = express.Router();
const coursesController = require('../controllers/courses.controller');
const rateLimit = require('../middleware/rateLimiting');
const { query, param } = require('express-validator');

router.use(rateLimit.generalLimiter);

/**
 * @swagger
 * /courses:
 *   get:
 *     summary: List courses
 *     description: >-
 *       Paginated list of courses with instructor/bibliography rollup counts and a preview of up to
 *       three instructor names. Sort is fixed (year DESC, semester, name) and not client-controllable.
 *       Default page size is 10; out-of-range limit values are silently clamped to 100.
 *       Note: list rows carry only instructor_count and bibliography_count under metrics (subject_count
 *       is computed on the detail endpoint only). meta.performance.query_time_ms is a placeholder and is always 0.
 *     tags: [Courses]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Case-insensitive LIKE filter over course name or code
 *       - in: query
 *         name: program_id
 *         schema:
 *           type: integer
 *         description: Exact match on program_id
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Exact match on academic year
 *       - in: query
 *         name: semester
 *         schema:
 *           type: string
 *         description: Exact match on semester label (e.g. "1")
 *     responses:
 *       200:
 *         description: Paginated list of courses
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
 *                         $ref: '#/components/schemas/CourseListItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */

const validateCoursesList = [
  query('search')
    .optional({ values: 'falsy' })
    .isLength({ min: 1, max: 100 })
    .withMessage('Search must be between 1 and 100 characters'),
  query('page')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('offset')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative')
    .toInt()
];

const validateCourseId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Course ID must be a positive integer')
    .toInt()
];

router.get('/', validateCoursesList, coursesController.getCourses);

/**
 * @swagger
 * /courses/statistics:
 *   get:
 *     summary: Course statistics
 *     description: >-
 *       Aggregate course counts plus year and semester distributions. Note avg_credits is returned as a
 *       DECIMAL string (e.g. "1.0000"), not a JSON number, and is null when no credited courses exist.
 *     tags: [Courses]
 *     responses:
 *       200:
 *         description: Aggregate course statistics
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/CourseStatistics'
 *                     meta:
 *                       type: object
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/statistics', coursesController.getCoursesStatistics);

/**
 * @swagger
 * /courses/{id}:
 *   get:
 *     summary: Get course by ID
 *     description: >-
 *       Full course detail: base fields plus embedded bibliography, instructors and derived subjects,
 *       each with per-facet statistics. Nested lists may be legitimately empty. Returns 404
 *       COURSE_NOT_FOUND when the id does not exist.
 *     tags: [Courses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: include_bibliography
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Set false to omit the bibliography array and bibliography_statistics
 *       - in: query
 *         name: include_instructors
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Set false to omit the instructors array and instructor_statistics
 *       - in: query
 *         name: include_subjects
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Set false to omit the subjects array and subject_statistics
 *       - in: query
 *         name: bibliography_limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Cap on embedded bibliography rows
 *       - in: query
 *         name: instructors_limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Cap on embedded instructor rows (echoed in meta.limits.instructors)
 *       - in: query
 *         name: subjects_limit
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Cap on embedded subject rows
 *     responses:
 *       200:
 *         description: Full course detail
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/CourseDetail'
 *                     meta:
 *                       type: object
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id', validateCourseId, coursesController.getCourseById);

/**
 * @swagger
 * /courses/{id}/instructors:
 *   get:
 *     summary: List course instructors
 *     description: >-
 *       Paginated instructors for a course. Sort is fixed (role, preferred_name); default page size is 10.
 *       Returns 404 COURSE_NOT_FOUND when the course id does not exist.
 *     tags: [Courses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Exact match on instructor role (e.g. PROFESSOR)
 *     responses:
 *       200:
 *         description: Paginated list of course instructors
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
 *                         $ref: '#/components/schemas/CourseInstructor'
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

router.get('/:id/instructors', validateCourseId, coursesController.getCourseInstructors);

/**
 * @swagger
 * /courses/{id}/bibliographies:
 *   get:
 *     summary: List course bibliography entries
 *     description: >-
 *       Paginated bibliography (reading list) for a course, each row carrying an author preview.
 *       Sort is fixed (week_number, reading_type, title); default page size is 10. No existence guard:
 *       an unknown course id returns HTTP 200 with an empty page (does not 404).
 *     tags: [Courses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: reading_type
 *         schema:
 *           type: string
 *           enum: [REQUIRED, RECOMMENDED, SUPPLEMENTARY, OPTIONAL]
 *         description: Exact match on reading type
 *       - in: query
 *         name: week_number
 *         schema:
 *           type: integer
 *         description: Exact match on week number
 *     responses:
 *       200:
 *         description: Paginated list of course bibliography entries
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
 *                         $ref: '#/components/schemas/CourseBibliographyItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id/bibliographies', validateCourseId, coursesController.getCourseBibliography);

/**
 * @swagger
 * /courses/{id}/subjects:
 *   get:
 *     summary: List course subjects
 *     description: >-
 *       Subjects derived from the course's bibliography works (course_bibliography -> work_subjects -> subjects).
 *       Sort is fixed (work_count DESC, term); default page size is 10. No existence guard: an unknown course
 *       id returns HTTP 200 with an empty page (does not 404).
 *     tags: [Courses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: vocabulary
 *         schema:
 *           type: string
 *         description: Exact match on subject vocabulary
 *     responses:
 *       200:
 *         description: Paginated list of subjects derived from the course bibliography
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
 *                         $ref: '#/components/schemas/CourseSubject'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id/subjects', validateCourseId, coursesController.getCourseSubjects);

module.exports = router;
