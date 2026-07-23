const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const citationsController = require('../controllers/citations.controller');

const validateWorkId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Work ID must be a positive integer')
];

const validatePagination = [
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

const validateCitationType = [
  query('type')
    .optional({ values: 'falsy' })
    .isIn(['all', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'SELF'])
    .withMessage('Type must be one of: all, POSITIVE, NEUTRAL, NEGATIVE, SELF')
];

const validateNetworkDepth = [
  query('depth')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 3 })
    .withMessage('Depth must be between 1 and 3')
];

/**
 * @swagger
 * /works/{id}/citations:
 *   get:
 *     summary: Get works that cite this work
 *     tags: [Citations]
 *     description: Retrieve works that cite the target, resolved by direct work link or DOI matching. Each citation entry includes `citation.type` and `citation.status`.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Work ID
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: type
 *         in: query
 *         description: Filter by citation type
 *         schema:
 *           type: string
 *           enum: [all, POSITIVE, NEUTRAL, NEGATIVE, SELF]
 *           default: all
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: Citing works retrieved successfully. `total` is an exact `COUNT(DISTINCT citing_work_id)`.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         work_id:
 *                           type: integer
 *                           description: Echoes the path id.
 *                         citing_works:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/CitationRow'
 *                         filters:
 *                           type: object
 *                           properties:
 *                             type:
 *                               type: string
 *                               description: Echoes the requested citation-type filter.
 *                               example: all
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
router.get('/works/:id/citations', [...validateWorkId, ...validatePagination, ...validateCitationType], citationsController.getWorkCitations);

/**
 * @swagger
 * /works/{id}/references:
 *   get:
 *     summary: Get works referenced by this work
 *     tags: [Citations]
 *     description: Retrieve resolved references and unresolved DOI references (`unresolved_references`, alias `unsolved`) for the specified work.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Work ID
 *         schema:
 *           type: integer
 *           example: 1
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: >-
 *           References retrieved successfully. `referenced_works` and `unresolved_references` are
 *           page-scoped (filtered from the current page's rows); `counts` is corpus-wide, so drive
 *           summary badges off `counts`, not the array lengths. `unsolved` is an exact alias of
 *           `unresolved_references`.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ReferenceRow'
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
router.get('/works/:id/references', [...validateWorkId, ...validatePagination], citationsController.getWorkReferences);

/**
 * @swagger
 * /works/{id}/metrics:
 *   get:
 *     summary: Get bibliometric metrics for a work
 *     tags: [Citations]
 *     description: >-
 *       Retrieve citation/reference counts, citation-type breakdown, temporal span and impact
 *       indicators for a work. `total_citations_received` counts RESOLVED `work_references` rows and
 *       may differ from the denormalized `works.citation_count` surfaced as `cited_by_count` on
 *       `/works`. `temporal_metrics` years are clamped to a valid range (1000..current year+1).
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Work ID
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       200:
 *         description: Bibliometric metrics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/WorkMetricsReport'
 *                     meta:
 *                       type: object
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/works/:id/metrics', validateWorkId, citationsController.getWorkMetrics);

/**
 * @swagger
 * /works/{id}/network:
 *   get:
 *     summary: Get citation network for a work
 *     tags: [Citations]
 *     description: >-
 *       Build a BFS-expanded citation network (nodes + directed edges) around a central work over
 *       resolved `work_references`. The graph is a bounded sample, not exhaustive: it is capped at
 *       ~120 nodes and 100 edges, so a deep/dense work returns a truncated graph. `nodes` is an
 *       object keyed by work-id string, not an array.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Work ID
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: depth
 *         in: query
 *         description: Network depth (1-3 levels)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 3
 *           default: 1
 *     responses:
 *       200:
 *         description: Citation network retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/WorkCitationNetwork'
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
router.get('/works/:id/network', [...validateWorkId, ...validateNetworkDepth], citationsController.getCitationNetwork);

module.exports = router;
