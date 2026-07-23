const express = require('express');
const router = express.Router();
const { query, param } = require('express-validator');
const instructorsController = require('../controllers/instructors.controller');
const rateLimit = require('../middleware/rateLimiting');
const { commonValidations } = require('../middleware/validation');

router.use(rateLimit.generalLimiter);

const validateInstructorId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Instructor ID must be a positive integer')
    .toInt()
];

const validateInstructorList = [
  ...commonValidations.pagination,
  query('role')
    .optional({ values: 'falsy' })
    .isLength({ min: 1, max: 100 })
    .withMessage('Role must be between 1 and 100 characters'),
  query('program_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('Program ID must be a positive integer')
    .toInt(),
  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year from must be valid')
    .toInt(),
  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year to must be valid')
    .toInt(),
  query('search')
    .optional({ values: 'falsy' })
    .isLength({ min: 2, max: 200 })
    .withMessage('Search must be between 2 and 200 characters')
];

const validateInstructorCourses = [
  ...validateInstructorId,
  ...commonValidations.pagination,
  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year from must be valid')
    .toInt(),
  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year to must be valid')
    .toInt(),
  query('program_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('Program ID must be a positive integer')
    .toInt(),
  query('semester')
    .optional({ values: 'falsy' })
    .isLength({ min: 1, max: 20 })
    .withMessage('Semester must be between 1 and 20 characters'),
  query('role')
    .optional({ values: 'falsy' })
    .isLength({ min: 1, max: 100 })
    .withMessage('Role must be between 1 and 100 characters')
];

const validateInstructorSubjects = [
  ...validateInstructorId,
  ...commonValidations.pagination,
  query('vocabulary')
    .optional({ values: 'falsy' })
    .isLength({ min: 2, max: 100 })
    .withMessage('Vocabulary must be between 2 and 100 characters')
];

const validateInstructorBibliography = [
  ...validateInstructorId,
  ...commonValidations.pagination,
  query('reading_type')
    .optional({ values: 'falsy' })
    .isLength({ min: 1, max: 50 })
    .withMessage('Reading type must be between 1 and 50 characters'),
  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year from must be valid')
    .toInt(),
  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year to must be valid')
    .toInt()
];

/**
 * @swagger
 * /instructors:
 *   get:
 *     summary: List instructors
 *     tags: [Instructors]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: Exact match on course_instructors.role (e.g. PROFESSOR)
 *       - in: query
 *         name: program_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Exact match on courses.program_id
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1900
 *         description: Keep instructors teaching a course with year >= this
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1900
 *         description: Keep instructors teaching a course with year <= this
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 200
 *         description: LIKE match across preferred_name / given_names / family_name
 *     responses:
 *       200:
 *         description: Paginated instructors, ordered by courses_taught DESC then preferred_name ASC (no sort param).
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
 *                         $ref: '#/components/schemas/InstructorListItem'
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
router.get('/', validateInstructorList, instructorsController.getInstructors);

/**
 * @swagger
 * /instructors/statistics:
 *   get:
 *     summary: Aggregate instructors statistics
 *     description: Corpus-wide totals, role distribution, and a top-instructors leaderboard. No query params, no pagination.
 *     tags: [Instructors]
 *     responses:
 *       200:
 *         description: Aggregate instructor statistics.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/InstructorStatisticsSummary'
 *                     meta:
 *                       type: object
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/statistics', instructorsController.getInstructorsStatistics);

/**
 * @swagger
 * /instructors/{id}:
 *   get:
 *     summary: Get instructor by ID
 *     description: Single instructor. Returns 404 when the person id is not present in course_instructors.
 *     tags: [Instructors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *     responses:
 *       200:
 *         description: Instructor detail.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/InstructorDetail'
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
router.get('/:id', validateInstructorId, instructorsController.getInstructorById);

/**
 * @swagger
 * /instructors/{id}/courses:
 *   get:
 *     summary: List courses taught by an instructor
 *     description: Courses for the instructor, ordered by year DESC, semester, name. Unknown ids yield an empty page (no 404).
 *     tags: [Instructors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1900
 *         description: Keep courses with year >= this
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1900
 *         description: Keep courses with year <= this
 *       - in: query
 *         name: program_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Exact match on courses.program_id
 *       - in: query
 *         name: semester
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 20
 *         description: Exact match on courses.semester
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: Exact match on the instructor's role in the course
 *     responses:
 *       200:
 *         description: Paginated courses taught by the instructor.
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
 *                         $ref: '#/components/schemas/InstructorCourse'
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

/**
 * @swagger
 * /instructors/{id}/statistics:
 *   get:
 *     summary: Rich instructor teaching and authorship profile
 *     description: Combined teaching + authorship analytics for one instructor. Gates on course_instructors membership (404 for non-instructors). No pagination or query params. Sub-arrays are empty when the underlying course_bibliography / authorship data is not yet loaded.
 *     tags: [Instructors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *     responses:
 *       200:
 *         description: Full instructor statistics payload.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/InstructorStatistics'
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
router.get('/:id/statistics', validateInstructorId, instructorsController.getInstructorStatistics);
router.get('/:id/courses', validateInstructorCourses, instructorsController.getInstructorCourses);

/**
 * @swagger
 * /instructors/{id}/subjects:
 *   get:
 *     summary: List instructor subject expertise
 *     description: Subjects derived from works in the instructor's course bibliographies, ordered by courses_count DESC then works_count DESC. Empty until course_bibliography data is loaded.
 *     tags: [Instructors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: vocabulary
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *         description: Exact match on subjects.vocabulary
 *     responses:
 *       200:
 *         description: Paginated subject expertise for the instructor.
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
 *                         $ref: '#/components/schemas/InstructorSubject'
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
router.get('/:id/subjects', validateInstructorSubjects, instructorsController.getInstructorSubjects);

/**
 * @swagger
 * /instructors/{id}/bibliographies:
 *   get:
 *     summary: List bibliography entries linked to an instructor
 *     description: Works used as bibliography across the instructor's courses, ordered by used_in_courses DESC then publication_year DESC. Empty until course_bibliography data is loaded.
 *     tags: [Instructors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: reading_type
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *         description: Exact match on course_bibliography.reading_type
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1900
 *         description: Keep works whose latest publication year >= this
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1900
 *         description: Keep works whose latest publication year <= this
 *     responses:
 *       200:
 *         description: Paginated bibliography works for the instructor.
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
 *                         $ref: '#/components/schemas/InstructorBibliographyItem'
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
router.get('/:id/bibliographies', validateInstructorBibliography, instructorsController.getInstructorBibliography);

module.exports = router;
