const express = require('express');
const router = express.Router();
const { query, param } = require('express-validator');
const signaturesController = require('../controllers/signatures.controller');
const { relationalLimiter } = require('../middleware/rateLimiting');

/**
 * @swagger
 * /signatures/statistics:
 *   get:
 *     summary: Get signature statistics
 *     description: Aggregate statistics over the whole signatures table (length buckets and person linkage). No query parameters. Cached for 48h.
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
 *     description: Substring (or exact) search over the normalized signature string via MariaDB LIKE/= over signatures.signature. Returns matching signatures with a per-signature persons_count. Rows are raw service rows and do NOT carry _links. The search term and exact flag are echoed under meta.searchTerm / meta.exact; the raw offset is echoed under meta.pagination_extras.offset.
 *     tags: [Signatures]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: Search term (trimmed). Empty or missing yields 400.
 *         example: silva
 *       - in: query
 *         name: exact
 *         schema:
 *           type: boolean
 *           default: false
 *         description: When true, matches signature = q exactly; otherwise signature LIKE %q%.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: Matching signatures ordered by exact-match first, then persons_count DESC, then signature ASC. pagination.total is exact.
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
 */
router.get(
  '/search',
  [
    query('q')
      .notEmpty()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search query is required and must be between 1 and 100 characters'),
    query('exact')
      .optional({ values: 'falsy' })
      .isBoolean()
      .withMessage('Exact parameter must be a boolean'),
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
 *     description: Paginated list of persons that share this signature (persons.signature_id). Returns the shared person list-item shape with nested identifiers and metrics. Returns 404 when the signature id does not exist. pagination.total is exact.
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
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of items to skip
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
 *     description: Paginated list of works authored by any person carrying this signature. Ordering is fixed at COALESCE(publication.year, 2024) DESC, work_id DESC. This endpoint accepts ONLY page and limit — it does NOT honor the standard work-listing sort/citation/type/language/year filters. Returns 404 when the signature id does not exist. pagination.total is exact.
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
 *           default: 20
 *         description: Results per page
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
    .withMessage('Limit must be between 1 and 100')
];

router.get('/:id/works', validateWorksQuery, relationalLimiter, signaturesController.getSignatureWorks);

router.get(
  '/:id/persons',
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Signature ID must be a positive integer'),
    query('limit')
      .optional({ values: 'falsy' })
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional({ values: 'falsy' })
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
  ],
  relationalLimiter,
  signaturesController.getSignaturePersons
);

module.exports = router;
