const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const collaborationsController = require('../controllers/collaborations.controller');

const validatePersonId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Person ID must be a positive integer')
];

const validateCollaborationFilters = [
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
    
  query('min_collaborations')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 50 })
    .withMessage('Minimum collaborations must be between 1 and 50'),
    
  query('sort_by')
    .optional({ values: 'falsy' })
    .isIn(['collaboration_count', 'latest_collaboration_year', 'avg_citations_together'])
    .withMessage('Sort by must be one of: collaboration_count, latest_collaboration_year, avg_citations_together')
];

const validateTopCollaborations = [
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
    
  query('min_collaborations')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 50 })
    .withMessage('Minimum collaborations must be between 1 and 50'),
    
  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year from must be a valid year'),
    
  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year to must be a valid year')
];

const validateNetworkDepth = [
  query('depth')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 3 })
    .withMessage('Network depth must be between 1 and 3')
];

/**
 * @swagger
 * /persons/{id}/collaborators:
 *   get:
 *     summary: Get collaborators for a person
 *     tags: [Collaborations]
 *     description: >-
 *       Co-authors of a person ranked by shared-work count, with per-pair metrics
 *       (shared works, average shared citations, collaboration strength) and the
 *       collaboration timespan. Returns 200 with an empty `collaborators[]` when the
 *       person exists and has co-authors but none meet `min_collaborations`; returns
 *       404 only when the person has no co-authors at all or does not exist.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Person ID
 *         schema:
 *           type: integer
 *           example: 18165
 *       - name: min_collaborations
 *         in: query
 *         description: Minimum shared-work count for a co-author to be included (HAVING >= n).
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 2
 *       - name: sort_by
 *         in: query
 *         description: >-
 *           Ordering of the collaborator list. `collaboration_count` sorts by shared works,
 *           `latest_collaboration_year` by most recent shared publication year,
 *           `avg_citations_together` by average citations of shared works.
 *         schema:
 *           type: string
 *           enum: [collaboration_count, latest_collaboration_year, avg_citations_together]
 *           default: collaboration_count
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: Collaborators retrieved successfully
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
 *                         person_id:
 *                           type: integer
 *                           description: The queried person id.
 *                         collaborators:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/PersonCollaborator'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *                       description: >-
 *                         Includes `source` (`collaboration_analysis`), `person_id`,
 *                         `filters.{min_collaborations,sort_by}`,
 *                         `summary.{total_collaborators,avg_collaborations_per_collaborator}`,
 *                         `query_time_ms`, and `pagination_extras.offset`.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/persons/:id/collaborators', [...validatePersonId, ...validateCollaborationFilters], collaborationsController.getPersonCollaborators);

/**
 * @swagger
 * /persons/{id}/network:
 *   get:
 *     summary: Get collaboration network for a person
 *     tags: [Collaborations]
 *     description: >-
 *       Co-authorship ego-network built by BFS outward from the person. `nodes` is a
 *       map keyed by stringified person-id; `edges` are undirected co-authorship links
 *       whose `weight` (shared works) is at least 2. The result is capped at 120 nodes
 *       with a per-node fan-out of 20 direct collaborators. Returns 404 when the person
 *       does not exist or has no co-authorship network.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Person ID
 *         schema:
 *           type: integer
 *           example: 18165
 *       - name: depth
 *         in: query
 *         description: Network depth in levels (BFS hops from the central person).
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 3
 *           default: 2
 *     responses:
 *       200:
 *         description: Collaboration network retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PersonNetwork'
 *                     meta:
 *                       type: object
 *                       description: >-
 *                         Includes `source` (`network_analysis`), `query_time_ms`, and
 *                         `complexity` (a duplicate of `network_stats`).
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/persons/:id/network', [...validatePersonId, ...validateNetworkDepth], collaborationsController.getCollaborationNetwork);

/**
 * @swagger
 * /collaborations/top:
 *   get:
 *     summary: Get top research collaborations
 *     tags: [Collaborations]
 *     description: >-
 *       Most productive research partnerships — pairs of persons who co-authored,
 *       ranked by shared-work count. Restricted to the top 2000 persons by total works,
 *       keeping pairs whose shared-work count is at least `min_collaborations`. `data`
 *       is a flat array ordered by shared works descending; the partnership summary is in
 *       `meta.summary`.
 *     parameters:
 *       - name: min_collaborations
 *         in: query
 *         description: Minimum shared-work count per pair.
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 5
 *       - name: year_from
 *         in: query
 *         description: Keep pairs with at least one shared publication year >= this value.
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           example: 2015
 *       - name: year_to
 *         in: query
 *         description: Keep pairs with at least one shared publication year <= this value.
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           example: 2020
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: Top collaborations retrieved successfully
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
 *                         $ref: '#/components/schemas/CollaborationPair'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *                       description: >-
 *                         Includes `source` (`collaboration_ranking`),
 *                         `summary.{total_partnerships,avg_collaborations}`,
 *                         `filters.{min_collaborations,year_from,year_to}`,
 *                         `query_time_ms`, `pagination_extras.offset`, and (only when the
 *                         self-join hits its statement-timeout budget and the page falls
 *                         back to empty) `degraded: true`.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/collaborations/top', validateTopCollaborations, collaborationsController.getTopCollaborations);

module.exports = router;
