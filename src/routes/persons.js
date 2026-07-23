const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const personsController = require('../controllers/persons.controller');
const { relationalLimiter } = require('../middleware/rateLimiting');

const validatePersonId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Person ID must be a positive integer')
];

const validatePersonsQuery = [
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
    .withMessage('Offset must be a non-negative integer'),
  
  query('search')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Search term must be between 2 and 255 characters'),

  query('signature')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Signature must be between 2 and 100 characters'),

  query('verified')
    .optional({ values: 'falsy' })
    .isIn(['true', 'false'])
    .withMessage('Verified must be true or false')
];

/**
 * @swagger
 * /persons:
 *   get:
 *     summary: Get list of researchers and authors
 *     description: >-
 *       Paginated list of academic researchers and authors, ordered newest-first
 *       (`id DESC`). The base list has NO metric/name sort — `sort_by`/`sort_order`
 *       are not honoured here. Free-text name search (`search`, alias `q`) resolves
 *       through Manticore; `signature` is a MariaDB LIKE-prefix lookup; `verified`
 *       filters on verification status. There is no affiliation or country filter.
 *     tags: [Persons]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 255
 *         description: >-
 *           Full-text name search via Manticore (min 2 chars). Sets
 *           `meta.engine=Manticore` and `meta.query_type=search`. Alias: `q`.
 *         example: silva
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 255
 *         description: Alias of `search` — Manticore full-text name search.
 *       - in: query
 *         name: signature
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *         description: >-
 *           Filter by normalized name signature (MariaDB LIKE-prefix `{value}%`
 *           over `signatures.signature`). Sets `meta.query_type=signature_lookup`.
 *         example: SILVA
 *       - in: query
 *         name: verified
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: Filter by verification status (`is_verified`).
 *         example: 'true'
 *     responses:
 *       200:
 *         description: List of persons retrieved successfully
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
 *                         $ref: '#/components/schemas/PersonListItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *                       description: >-
 *                         `engine` (`MariaDB` for list/signature paths, `Manticore`
 *                         for search), `query_type` (`list|signature_lookup|search`),
 *                         `elapsed_ms` (absent on the Manticore search path),
 *                         `pagination_extras.offset`. Counts are exact.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/', validatePersonsQuery, personsController.getPersons);

/**
 * @swagger
 * /persons/{id}:
 *   get:
 *     summary: Get specific researcher by ID
 *     description: Retrieve detailed information about a specific researcher or author by their unique identifier.
 *     tags: [Persons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Unique identifier of the person
 *         example: 5952
 *     responses:
 *       200:
 *         description: Person details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PersonDetail'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id', validatePersonId, personsController.getPerson);

/**
 * @swagger
 * /persons/{id}/signatures:
 *   get:
 *     summary: Get signatures linked to a person
 *     description: Retrieve all name signatures associated with a specific person
 *     tags: [Persons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Person ID
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: Signatures retrieved successfully
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
 *                         $ref: '#/components/schemas/PersonSignature'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const validateSignaturesQuery = [
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

/**
 * @swagger
 * /persons/{id}/works:
 *   get:
 *     summary: Get works authored/edited by a person
 *     description: Retrieve all academic works (publications) authored or edited by a specific person
 *     tags: [Persons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Person ID
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [AUTHOR, EDITOR]
 *         description: Filter by authorship role (case-insensitive).
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Inclusive lower bound on publication year.
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Inclusive upper bound on publication year.
 *       - in: query
 *         name: cited_by_min
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: >-
 *           Inclusive lower bound on `cited_by_count` (against `works.citation_count`).
 *           Alias: `citation_count_min`.
 *         example: 5
 *       - in: query
 *         name: cited_by_max
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: >-
 *           Inclusive upper bound on `cited_by_count`. Alias: `citation_count_max`.
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [cited_by_count, references_count, publication_year, citation_count, reference_count, year]
 *         description: >-
 *           Primary sort key. `citation_count`/`reference_count`/`year` are accepted
 *           aliases of `cited_by_count`/`references_count`/`publication_year`. With
 *           `sort_by` omitted the order falls back to publication_year DESC.
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort direction for `sort_by` (case-insensitive).
 *     responses:
 *       200:
 *         description: Works retrieved successfully
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
 *                         $ref: '#/components/schemas/PersonWork'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const validateWorksQuery = [
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
    .withMessage('Offset must be a non-negative integer'),
  
  query('role')
    .optional({ values: 'falsy' })
    .customSanitizer(value => (typeof value === 'string' ? value.toUpperCase() : value))
    .isIn(['AUTHOR', 'EDITOR'])
    .withMessage('Role must be AUTHOR or EDITOR'),

  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000 })
    .withMessage('year_from must be a valid year'),

  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000 })
    .withMessage('year_to must be a valid year'),

  query('cited_by_min')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('cited_by_min must be a non-negative integer'),

  query('cited_by_max')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('cited_by_max must be a non-negative integer'),

  query('sort_by')
    .optional({ values: 'falsy' })
    .isIn(['cited_by_count', 'citation_count', 'references_count', 'reference_count', 'publication_year', 'year'])
    .withMessage('sort_by must be one of: cited_by_count, references_count, publication_year'),

  query('sort_order')
    .optional({ values: 'falsy' })
    .customSanitizer(value => (typeof value === 'string' ? value.toUpperCase() : value))
    .isIn(['ASC', 'DESC'])
    .withMessage('sort_order must be ASC or DESC')
];

router.get('/:id/works', relationalLimiter, validatePersonId, validateWorksQuery, personsController.getPersonWorks);

router.get('/:id/signatures', relationalLimiter, validatePersonId, validateSignaturesQuery, personsController.getPersonSignatures);

module.exports = router;
