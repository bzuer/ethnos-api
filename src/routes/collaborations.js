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
 *       Co-authors of a person (any contributor role), ranked by shared works with the
 *       person id as tiebreak. Each shared work is counted once; `avg_shared_citations` is
 *       the mean `works.citation_count` of the shared works and the timespan uses
 *       `works.latest_publication_year`. `pagination.total` is the exact number of
 *       qualifying co-authors. A person who exists but has no co-author meeting
 *       `min_collaborations` gets 200 with an empty `collaborators[]`; 404 only when the
 *       person does not exist.
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
 *           Ordering of the collaborator list (always descending, tiebreak person id).
 *           `collaboration_count` sorts by shared works, `latest_collaboration_year` by the
 *           most recent shared-work year, `avg_citations_together` by average citations of
 *           the shared works.
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
 *       503:
 *         $ref: '#/components/responses/RequestTimeout'
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
 *       with a per-node fan-out of 20 collaborators. Returns 404 when the person does
 *       not exist; a person without qualifying co-authors gets 200 with only the
 *       central node and no edges.
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
 *       503:
 *         $ref: '#/components/responses/RequestTimeout'
 */
router.get('/persons/:id/network', [...validatePersonId, ...validateNetworkDepth], collaborationsController.getCollaborationNetwork);

/**
 * @swagger
 * /collaborations/top:
 *   get:
 *     summary: Get top research collaborations
 *     tags: [Collaborations]
 *     description: >-
 *       Most productive research partnerships: pairs among the 2,000 persons with the most
 *       works (`total_works >= 30`) who share works as AUTHOR on both sides, each shared
 *       work counted once, keeping pairs with at least `min_collaborations` shared works.
 *       `data` is a flat array ordered by shared works DESC, average shared citations DESC,
 *       then the person ids; `ranking` is the global rank (offset + index + 1).
 *       `avg_shared_citations` is the mean `works.citation_count` of the shared works and the
 *       timespan uses `works.latest_publication_year`. Same statement, pair shape and strength
 *       scale as `/metrics/collaborations` (which defaults `min_collaborations` to 2 and has no
 *       year filters). `pagination.total` is exact; if the statement exceeds its budget the
 *       page is empty with `meta.degraded = true` and `meta.pagination_total_exact = false`.
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
 *         description: Count only shared works whose latest publication year is >= this value.
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           example: 2015
 *       - name: year_to
 *         in: query
 *         description: Count only shared works whose latest publication year is <= this value.
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
 *                         `pagination_total_exact`, `query_time_ms`,
 *                         `pagination_extras.offset`, and `degraded: true` only when the
 *                         ranking statement exceeded its budget (the page is then empty).
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *       503:
 *         $ref: '#/components/responses/RequestTimeout'
 */
router.get('/collaborations/top', validateTopCollaborations, collaborationsController.getTopCollaborations);

module.exports = router;
