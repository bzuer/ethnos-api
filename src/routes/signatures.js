const express = require('express');
const router = express.Router();
const { query, param } = require('express-validator');
const signaturesController = require('../controllers/signatures.controller');

/**
 * @swagger
 * /signatures/statistics:
 *   get:
 *     summary: Get signature statistics
 *     description: Aggregate statistics over the whole signatures table (length buckets measured in characters, and person linkage). No query parameters. Cached for 48h.
 *     tags: [Signatures]
 *     responses:
 *       200:
 *         description: Signature statistics
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SignatureStatistics'
 *                     meta:
 *                       type: object
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get(
  '/statistics',
  signaturesController.getSignatureStatistics
);

/**
 * @swagger
 * /signatures/search:
 *   get:
 *     summary: Search signatures
 *     description: >-
 *       Substring (default) or exact search over the normalized signature string via MariaDB LIKE/=
 *       on signatures.signature; matching is case- and accent-insensitive and LIKE metacharacters
 *       (%, _ and backslash) in q are matched literally. Rows are returned in signature order
 *       (alphabetical, then id), each with persons_count (computed for the returned rows) and
 *       _links.self. page or offset is honoured. The count runs under a 2 s budget; when it is
 *       exceeded meta.pagination_total_exact is false and pagination.total is only a lower bound.
 *       Terms that match few signatures scan the whole index (about 3 s measured); a page that exceeds
 *       its statement budget returns 503 REQUEST_TIMEOUT. Cached for 30 minutes.
 *     tags: [Signatures]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *         description: Search term (trimmed). Missing, empty or shorter than 2 characters yields 400.
 *         example: silva
 *       - in: query
 *         name: exact
 *         schema:
 *           type: string
 *           enum: ['true', 'false', '1', '0']
 *           default: 'false'
 *         description: true or 1 matches signature = q exactly; otherwise signature LIKE %q%.
 *       - $ref: '#/components/parameters/pageParam'
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of items to skip; takes precedence over page
 *     responses:
 *       200:
 *         description: Matching signatures in signature order (alphabetical, then id).
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
 *                         $ref: '#/components/schemas/SignatureSearchItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         searchTerm:
 *                           type: string
 *                           example: silva
 *                         exact:
 *                           type: boolean
 *                           example: false
 *                         pagination_total_exact:
 *                           type: boolean
 *                           description: False when the count exceeded its 2 s budget and pagination.total is a lower bound.
 *                         pagination_extras:
 *                           type: object
 *                           properties:
 *                             offset:
 *                               type: integer
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *       503:
 *         $ref: '#/components/responses/RequestTimeout'
 */
router.get(
  '/search',
  [
    query('q')
      .trim()
      .notEmpty()
      .isLength({ min: 2, max: 100 })
      .withMessage('Search query is required and must be between 2 and 100 characters'),
    query('exact')
      .optional({ values: 'falsy' })
      .isBoolean()
      .withMessage('Exact parameter must be a boolean'),
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
  ],
  signaturesController.searchSignatures
);

/**
 * @swagger
 * /signatures/{id}:
 *   get:
 *     summary: Get signature by ID
 *     description: Retrieve a single signature with its person linkage count and a self link. Cached for 1h.
 *     tags: [Signatures]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Signature ID
 *         example: 14490421
 *     responses:
 *       200:
 *         description: Signature detail
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SignatureDetail'
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
router.get(
  '/:id',
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Signature ID must be a positive integer')
  ],
  signaturesController.getSignatureById
);

/**
 * @swagger
 * /signatures/{id}/persons:
 *   get:
 *     summary: Get persons associated with a signature
 *     description: Paginated list of persons that share this signature (persons.signature_id), ordered by preferred_name then id. Returns the shared person list-item shape with nested identifiers and metrics; page or offset is honoured. Returns 404 when the signature id does not exist. pagination.total is exact. Cached for 30 minutes.
 *     tags: [Signatures]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Signature ID
 *         example: 259377
 *       - $ref: '#/components/parameters/pageParam'
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of items to skip; takes precedence over page
 *     responses:
 *       200:
 *         description: Persons sharing this signature
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
 *                         $ref: '#/components/schemas/SignaturePersonItem'
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
/**
 * @swagger
 * /signatures/{id}/works:
 *   get:
 *     summary: Get works associated with a signature
 *     description: >-
 *       Paginated list of works contributed by any person carrying this signature, one row per work.
 *       Ordering is fixed: latest publication year DESC with works lacking a year last, then work id DESC.
 *       The authorship block is one coherent representative authorship row, picked by role rank
 *       (AUTHOR, EDITOR, TRANSLATOR, REVIEWER), then lowest position, then lowest person id;
 *       person_id, person_name, role, position and is_corresponding all come from that row. Accepts
 *       page or offset with limit; it does not honor the standard work-listing sort/citation/type/
 *       language/year filters. Returns 404 when the signature id does not exist. pagination.total is
 *       an exact count of distinct works. Cached for 1 hour.
 *     tags: [Signatures]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Signature ID
 *         example: 259377
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of items to skip; takes precedence over page
 *     responses:
 *       200:
 *         description: Works authored under this signature
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
 *                         $ref: '#/components/schemas/SignatureWork'
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
const validateWorksQuery = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Signature ID must be a positive integer'),
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

router.get('/:id/works', validateWorksQuery, signaturesController.getSignatureWorks);

router.get(
  '/:id/persons',
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Signature ID must be a positive integer'),
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
  ],
  signaturesController.getSignaturePersons
);

module.exports = router;
