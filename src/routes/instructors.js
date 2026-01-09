/**
 * @swagger
 * tags:
 *   name: Instructors
 *   description: Instructor profiles, courses, bibliography, and subjects
 */

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
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Role must be between 1 and 100 characters'),
  query('program_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Program ID must be a positive integer')
    .toInt(),
  query('year_from')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year from must be valid')
    .toInt(),
  query('year_to')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year to must be valid')
    .toInt(),
  query('search')
    .optional()
    .isLength({ min: 2, max: 200 })
    .withMessage('Search must be between 2 and 200 characters')
];

const validateInstructorCourses = [
  ...validateInstructorId,
  ...commonValidations.pagination,
  query('year_from')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year from must be valid')
    .toInt(),
  query('year_to')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year to must be valid')
    .toInt(),
  query('program_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Program ID must be a positive integer')
    .toInt(),
  query('semester')
    .optional()
    .isLength({ min: 1, max: 20 })
    .withMessage('Semester must be between 1 and 20 characters'),
  query('role')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Role must be between 1 and 100 characters')
];

const validateInstructorSubjects = [
  ...validateInstructorId,
  ...commonValidations.pagination,
  query('vocabulary')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Vocabulary must be between 2 and 100 characters')
];

const validateInstructorBibliography = [
  ...validateInstructorId,
  ...commonValidations.pagination,
  query('reading_type')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Reading type must be between 1 and 50 characters'),
  query('year_from')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year from must be valid')
    .toInt(),
  query('year_to')
    .optional()
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
 *         description: Filter by instructor role
 *       - in: query
 *         name: program_id
 *         schema:
 *           type: integer
 *         description: Filter by program ID
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *         description: Filter from year
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *         description: Filter to year
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Filter by instructor name
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/', validateInstructorList, instructorsController.getInstructors);

/**
 * @swagger
 * /instructors/statistics:
 *   get:
 *     summary: Instructors statistics
 *     tags: [Instructors]
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/statistics', instructorsController.getInstructorsStatistics);

/**
 * @swagger
 * /instructors/{id}:
 *   get:
 *     summary: Get instructor by ID
 *     tags: [Instructors]
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
router.get('/:id', validateInstructorId, instructorsController.getInstructorById);

/**
 * @swagger
 * /instructors/{id}/courses:
 *   get:
 *     summary: List courses taught by an instructor
 *     tags: [Instructors]
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
 *         name: year_from
 *         schema:
 *           type: integer
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *       - in: query
 *         name: program_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: semester
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */

/**
 * @swagger
 * /instructors/{id}/statistics:
 *   get:
 *     summary: Instructor statistics
 *     tags: [Instructors]
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
router.get('/:id/statistics', validateInstructorId, instructorsController.getInstructorStatistics);
router.get('/:id/courses', validateInstructorCourses, instructorsController.getInstructorCourses);

/**
 * @swagger
 * /instructors/{id}/subjects:
 *   get:
 *     summary: List instructor subject expertise
 *     tags: [Instructors]
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
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/:id/subjects', validateInstructorSubjects, instructorsController.getInstructorSubjects);

/**
 * @swagger
 * /instructors/{id}/bibliographies:
 *   get:
 *     summary: List bibliography entries linked to an instructor
 *     tags: [Instructors]
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
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/:id/bibliographies', validateInstructorBibliography, instructorsController.getInstructorBibliography);

module.exports = router;
