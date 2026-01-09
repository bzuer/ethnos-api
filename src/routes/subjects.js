/**
 * @swagger
 * tags:
 *   name: Subjects
 *   description: Subject taxonomy and subject-linked listings
 */

const express = require('express');
const router = express.Router();
const subjectsController = require('../controllers/subjects.controller');
const rateLimit = require('../middleware/rateLimiting');
const { query, param } = require('express-validator');

router.use(rateLimit.generalLimiter);

const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
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
    .optional()
    .isFloat({ min: 0 })
    .withMessage('min_relevance must be a positive number'),
  query('year_from')
    .optional()
    .isInt({ min: 1900, max: 2030 })
    .withMessage('year_from must be a valid year'),
  query('year_to')
    .optional()
    .isInt({ min: 1900, max: 2030 })
    .withMessage('year_to must be a valid year'),
  query('document_type')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('document_type must be between 1 and 50 characters'),
  query('language')
    .optional()
    .isLength({ min: 2, max: 10 })
    .withMessage('language must be between 2 and 10 characters')
];

const validateSubjectCourses = [
  ...validatePagination,
  query('year_from')
    .optional()
    .isInt({ min: 1900, max: 2030 })
    .withMessage('year_from must be a valid year'),
  query('year_to')
    .optional()
    .isInt({ min: 1900, max: 2030 })
    .withMessage('year_to must be a valid year'),
  query('program_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('program_id must be a positive integer'),
  query('reading_type')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('reading_type must be between 1 and 50 characters')
];

/**
 * @swagger
 * /subjects/statistics:
 *   get:
 *     summary: Subject statistics
 *     tags: [Subjects]
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/statistics', subjectsController.getSubjectsStatistics);

/**
 * @swagger
 * /subjects/{id}:
 *   get:
 *     summary: Get subject by ID
 *     tags: [Subjects]
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
router.get('/:id', validateSubjectId, subjectsController.getSubjectById);

/**
 * @swagger
 * /subjects/{id}/children:
 *   get:
 *     summary: List subject children
 *     tags: [Subjects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/:id/children', [...validateSubjectId, ...validatePagination], subjectsController.getSubjectChildren);
/**
 * @swagger
 * /subjects/{id}/hierarchy:
 *   get:
 *     summary: Get subject hierarchy
 *     tags: [Subjects]
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
router.get('/:id/hierarchy', validateSubjectId, subjectsController.getSubjectHierarchy);
/**
 * @swagger
 * /subjects/{id}/works:
 *   get:
 *     summary: List works for a subject
 *     tags: [Subjects]
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
 *         name: min_relevance
 *         schema:
 *           type: number
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *       - in: query
 *         name: document_type
 *         schema:
 *           type: string
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/:id/works', [...validateSubjectId, ...validateSubjectWorks], subjectsController.getSubjectWorks);
/**
 * @swagger
 * /subjects/{id}/courses:
 *   get:
 *     summary: List courses for a subject
 *     tags: [Subjects]
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
 *         name: reading_type
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/:id/courses', [...validateSubjectId, ...validateSubjectCourses], subjectsController.getSubjectCourses);

module.exports = router;
