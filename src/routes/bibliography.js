/**
 * @swagger
 * tags:
 *   name: Bibliography
 *   description: Course bibliography listings and analysis
 */

const express = require('express');
const router = express.Router();
const bibliographyController = require('../controllers/bibliography.controller');
const rateLimit = require('../middleware/rateLimiting');
const { query } = require('express-validator');

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

const validateBibliographyList = [
  ...validatePagination,
  query('course_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('course_id must be a positive integer'),
  query('work_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('work_id must be a positive integer'),
  query('instructor_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('instructor_id must be a positive integer'),
  query('reading_type')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('reading_type must be between 1 and 50 characters'),
  query('week_number')
    .optional()
    .isInt({ min: 1 })
    .withMessage('week_number must be a positive integer'),
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
  query('search')
    .optional()
    .isLength({ min: 1, max: 255 })
    .withMessage('search must be between 1 and 255 characters'),
  query('light')
    .optional()
    .isBoolean()
    .withMessage('light must be boolean')
];

const validateBibliographyAnalysis = [
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
    .withMessage('reading_type must be between 1 and 50 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100')
];

/**
 * @swagger
 * /bibliographies:
 *   get:
 *     summary: List bibliography entries
 *     tags: [Bibliography]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: course_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: work_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: instructor_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: reading_type
 *         schema:
 *           type: string
 *       - in: query
 *         name: week_number
 *         schema:
 *           type: integer
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
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: light
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */

router.get('/', validateBibliographyList, bibliographyController.getBibliography);

/**
 * @swagger
 * /bibliographies/analyses:
 *   get:
 *     summary: Bibliography analysis
 *     tags: [Bibliography]
 *     parameters:
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
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/analyses', validateBibliographyAnalysis, bibliographyController.getBibliographyAnalysis);
/**
 * @swagger
 * /bibliographies/statistics:
 *   get:
 *     summary: Bibliography statistics
 *     tags: [Bibliography]
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/statistics', bibliographyController.getBibliographyStatistics);

module.exports = router;
