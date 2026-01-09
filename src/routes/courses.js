/**
 * @swagger
 * tags:
 *   name: Courses
 *   description: Academic courses, instructors, bibliography, and subjects
 */

const express = require('express');
const router = express.Router();
const coursesController = require('../controllers/courses.controller');
const rateLimit = require('../middleware/rateLimiting');
const { query, param } = require('express-validator');
const { enhancedValidationHandler } = require('../middleware/validation');

router.use(rateLimit.generalLimiter);

/**
 * @swagger
 * /courses:
 *   get:
 *     summary: List courses
 *     tags: [Courses]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Filter by course name or code
 *       - in: query
 *         name: program_id
 *         schema:
 *           type: integer
 *         description: Filter by program ID
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Filter by course year
 *       - in: query
 *         name: semester
 *         schema:
 *           type: string
 *         description: Filter by semester
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */

const validateCoursesList = [
  query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search must be between 1 and 100 characters'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative')
    .toInt()
];

const validateCourseId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Course ID must be a positive integer')
    .toInt(),
  enhancedValidationHandler
];

router.get('/', validateCoursesList, coursesController.getCourses);

/**
 * @swagger
 * /courses/statistics:
 *   get:
 *     summary: Course statistics
 *     tags: [Courses]
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/statistics', coursesController.getCoursesStatistics);

/**
 * @swagger
 * /courses/{id}:
 *   get:
 *     summary: Get course by ID
 *     tags: [Courses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', validateCourseId, coursesController.getCourseById);

/**
 * @swagger
 * /courses/{id}/instructors:
 *   get:
 *     summary: List course instructors
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
 *         description: Filter by instructor role
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */

router.get('/:id/instructors', validateCourseId, coursesController.getCourseInstructors);

/**
 * @swagger
 * /courses/{id}/bibliographies:
 *   get:
 *     summary: List course bibliography entries
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
 *         description: Filter by reading type
 *       - in: query
 *         name: week_number
 *         schema:
 *           type: integer
 *         description: Filter by week number
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/:id/bibliographies', validateCourseId, coursesController.getCourseBibliography);

/**
 * @swagger
 * /courses/{id}/subjects:
 *   get:
 *     summary: List course subjects
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
 *         description: Filter by vocabulary
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/:id/subjects', validateCourseId, coursesController.getCourseSubjects);

module.exports = router;
