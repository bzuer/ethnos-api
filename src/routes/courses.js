const express = require('express');
const router = express.Router();
const coursesController = require('../controllers/courses.controller');
const { query, param } = require('express-validator');


/**
 * @swagger
 * /courses:
 *   get:
 *     summary: List courses
 *     description: >-
 *       Paginated list of courses with instructor/bibliography rollup counts and a preview of up to
 *       three instructor names. Sort is fixed (year DESC, semester, name) and not client-controllable.
 *       Default page size is 10; an explicit offset is served as given. Every query parameter is
 *       validated and an out-of-range value returns 400 VALIDATION_ERROR. List rows carry only
 *       instructor_count and bibliography_count under metrics (subject_count is detail-only).
 *       Cached for 30 minutes.
 *     tags: [Courses]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: Case-insensitive LIKE filter over course name or code
 *       - in: query
 *         name: program_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Exact match on program_id
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Exact match on academic year (1000 up to next year)
 *       - in: query
 *         name: semester
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 20
 *         description: Exact match on semester label (1, 2, SUMMER, WINTER, YEAR_LONG)
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
 *       400:
 *         $ref: '#/components/responses/BadRequest'
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
    .toInt(),
  query('program_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('program_id must be a positive integer'),
  query('year')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000, max: new Date().getFullYear() + 1 })
    .withMessage('year must be a valid year'),
  query('semester')
    .optional({ values: 'falsy' })
    .isLength({ min: 1, max: 20 })
    .withMessage('semester must be between 1 and 20 characters')
];

const validateCourseId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Course ID must be a positive integer')
    .toInt()
];

const validateNestedPagination = [
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
    .withMessage('Offset must be non-negative')
];

const upperCaseEnum = (field, values) => query(field)
  .optional({ values: 'falsy' })
  .customSanitizer((value) => String(value).trim().toUpperCase())
  .isIn(values)
  .withMessage(`${field} must be one of ${values.join(', ')}`);

const validateCourseInstructors = [
  ...validateCourseId,
  ...validateNestedPagination,
  upperCaseEnum('role', ['PROFESSOR', 'ASSISTANT', 'TA', 'GUEST'])
];

const validateCourseBibliography = [
  ...validateCourseId,
  ...validateNestedPagination,
  upperCaseEnum('reading_type', ['REQUIRED', 'RECOMMENDED', 'SUPPLEMENTARY']),
  query('week_number')
    .optional({ values: 'falsy' })
    .isInt({ min: 0, max: 1000 })
    .withMessage('week_number must be a non-negative integer')
];

const validateCourseSubjects = [
  ...validateCourseId,
  ...validateNestedPagination,
  query('vocabulary')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('vocabulary must be between 1 and 50 characters')
];

const validateCourseDetail = [
  ...validateCourseId,
  ...['bibliography_limit', 'instructors_limit', 'subjects_limit'].map((field) => query(field)
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 100 })
    .withMessage(`${field} must be between 1 and 100`)),
  ...['include_bibliography', 'include_instructors', 'include_subjects'].map((field) => query(field)
    .optional({ values: 'falsy' })
    .isIn(['true', 'false', '1', '0'])
    .withMessage(`${field} must be boolean-like (1/0/true/false)`))
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
 *       Cached for 1 hour.
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
 *       each with per-facet statistics. Nested lists may be legitimately empty. Include flags accept
 *       true/false/1/0 and the *_limit parameters accept 1..100; any other value returns 400
 *       VALIDATION_ERROR. Returns 404 COURSE_NOT_FOUND when the id does not exist. Cached for 30 minutes.
 *     tags: [Courses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: include_bibliography
 *         schema:
 *           type: string
 *           enum: ['true', 'false', '1', '0']
 *           default: 'true'
 *         description: false or 0 omits the bibliography array and bibliography_statistics
 *       - in: query
 *         name: include_instructors
 *         schema:
 *           type: string
 *           enum: ['true', 'false', '1', '0']
 *           default: 'true'
 *         description: false or 0 omits the instructors array and instructor_statistics
 *       - in: query
 *         name: include_subjects
 *         schema:
 *           type: string
 *           enum: ['true', 'false', '1', '0']
 *           default: 'true'
 *         description: false or 0 omits the subjects array and subject_statistics
 *       - in: query
 *         name: bibliography_limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Cap on embedded bibliography rows (echoed in meta.limits.bibliography)
 *       - in: query
 *         name: instructors_limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Cap on embedded instructor rows (echoed in meta.limits.instructors)
 *       - in: query
 *         name: subjects_limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 30
 *         description: Cap on embedded subject rows (echoed in meta.limits.subjects)
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
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id', validateCourseDetail, coursesController.getCourseById);

/**
 * @swagger
 * /courses/{id}/instructors:
 *   get:
 *     summary: List course instructors
 *     description: >-
 *       Paginated instructors for a course. Sort is fixed (role, preferred_name); default page size is 10
 *       (a limit above 100 is clamped to 100). Returns 404 COURSE_NOT_FOUND when the course id does not
 *       exist. Cached for 30 minutes.
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
 *           enum: [PROFESSOR, ASSISTANT, TA, GUEST]
 *         description: Exact, case-insensitive match on the instructor role
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
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */

router.get('/:id/instructors', validateCourseInstructors, coursesController.getCourseInstructors);

/**
 * @swagger
 * /courses/{id}/bibliographies:
 *   get:
 *     summary: List course bibliography entries
 *     description: >-
 *       Paginated bibliography (reading list) for a course. Each row carries the work's latest
 *       publication (highest publications.id) and every contributor name (authors_preview, not capped).
 *       Sort is fixed (week_number, reading_type, title); default page size is 10 (a limit above 100 is
 *       clamped to 100). No existence guard: an unknown course id returns HTTP 200 with an empty page.
 *       Cached for 30 minutes.
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
 *           enum: [REQUIRED, RECOMMENDED, SUPPLEMENTARY]
 *         description: Exact, case-insensitive match on reading type
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
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id/bibliographies', validateCourseBibliography, coursesController.getCourseBibliography);

/**
 * @swagger
 * /courses/{id}/subjects:
 *   get:
 *     summary: List course subjects
 *     description: >-
 *       Subjects derived from the course's bibliography works (course_bibliography -> work_subjects -> subjects).
 *       Sort is fixed (work_count DESC, term); default page size is 10 (a limit above 100 is clamped to 100).
 *       No existence guard: an unknown course id returns HTTP 200 with an empty page. Cached for 30 minutes.
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
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id/subjects', validateCourseSubjects, coursesController.getCourseSubjects);

module.exports = router;
