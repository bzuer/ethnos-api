const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const worksController = require('../controllers/works.controller');

const validateWorkId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Work ID must be a positive integer')
];

const validateWorksQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Limit must be between 1 and 20'),

  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
  
  query('search')
    .optional(),
  
  query('type')
    .optional(),

  query('language')
    .optional()
    .isLength({ min: 2, max: 5 })
    .withMessage('Language must be a valid language code'),

  query('open_access')
    .optional()
    .isIn(['1', '0', 'true', 'false'])
    .withMessage('open_access must be boolean-like (1/0/true/false)'),
  
  query('year_from')
    .optional()
    .isInt({ min: 1000 })
    .withMessage('Year from must be a valid year'),
  
  query('year_to')
    .optional()
    .isInt({ min: 1000 })
    .withMessage('Year to must be a valid year'),
  
];


/**
 * @swagger
 * /works:
 *   get:
 *     summary: Get list of academic works
 *     description: |
 *       Returns a paginated list of works backed by `summary_publications`.
 *       Filters apply with **`match_mode: "any_publication"`** semantics: a
 *       work appears in the result set if **any of its publications** matches
 *       the filter set. When a filter matches multiple siblings of the same
 *       work, the latest matching publication is the one displayed in the
 *       card (its venue, year, doi, etc.). The semantic is signalled in
 *       `meta.match_mode`.
 *     tags: [Works]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 20
 *         description: Number of results per page (max 20)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of items to skip (alternative to page parameter)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 3
 *           maxLength: 255
 *         description: Search term to filter works by title or content
 *         example: machine learning
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           maxLength: 50
 *         description: Filter by work type (article, book, thesis, etc.)
 *         example: ARTICLE
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Filter works published from this year onwards
 *         example: 2020
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Filter works published up to this year
 *         example: 2023
 *       - in: query
 *         name: open_access
 *         schema:
 *           type: boolean
 *         description: Filter by open access availability
 *         example: true
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 5
 *         description: Filter by language code
 *         example: en
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */

/**
 * @swagger
 * /works/showcase:
 *   get:
 *     summary: Get works list optimized for browsing (showcase)
 *     description: |
 *       High-performance endpoint for browsing works using `summary_publications`
 *       (one row per publication, latest pick per work). Filters apply with
 *       **`match_mode: "any_publication"`** semantics: a work appears in the
 *       result if any of its publications matches the filter set, and the
 *       displayed publication is the latest matching one. Returns work-level
 *       fields plus derived browsing columns, including legacy aliases
 *       `work_type`/`year` for backward compatibility.
 *     tags: [Works]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page (max 100)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of items to skip (alternative to page parameter)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           maxLength: 50
 *         description: Filter by work type
 *         example: ARTICLE
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Filter works from this year
 *         example: 2020
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Filter works up to this year
 *         example: 2023
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           maxLength: 3
 *         description: Filter by language code
 *         example: en
 *     responses:
 *       200:
 *         description: Works showcase retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Work'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     query_source:
 *                       type: string
 *                       example: summary_publications
 *                     performance:
 *                       $ref: '#/components/schemas/PerformanceMeta'
 */
router.get('/showcase', validateWorksQuery, worksController.getWorksVitrine);

router.get('/', validateWorksQuery, worksController.getWorks);

/**
 * @swagger
 * /works/{id}:
 *   get:
 *     summary: Get specific academic work by ID
 *     description: |
 *       Returns the detailed payload for a work. The response embeds **all
 *       publications of the work** as `publications[]` (capped at 50, with
 *       `publications_total` and `publications_has_more` flags). Each entry
 *       carries its own `identifiers`, `venue`, `publisher`, `files`, and
 *       `_links.self`. The legacy single `publication`/`venue`/`publisher`/`files`/`licenses`
 *       blocks have been removed (Phase 6 breaking change). Aggregated
 *       `identifiers` (union of every publication's identifier set) remains
 *       at the work level for backward reference. The cache key was bumped
 *       from `work:complete:*` to `work:v2:*`.
 *     tags: [Works]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Unique identifier of the work
 *         example: 123456
 *       - in: query
 *         name: include_citations
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include inline citations (cited_by) in the work payload
 *         example: true
 *       - in: query
 *         name: include_references
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include inline references list in the work payload
 *         example: true
 *     responses:
 *       200:
 *         description: Work retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     title:
 *                       type: string
 *                     subtitle:
 *                       type: string
 *                       nullable: true
 *                     abstract:
 *                       type: string
 *                       nullable: true
 *                     type:
 *                       type: string
 *                     language:
 *                       type: string
 *                       nullable: true
 *                     publications:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           identifiers:
 *                             type: object
 *                           publication_year:
 *                             type: integer
 *                             nullable: true
 *                           venue:
 *                             type: object
 *                             nullable: true
 *                           publisher:
 *                             type: object
 *                             nullable: true
 *                           files:
 *                             type: array
 *                             items:
 *                               type: object
 *                           _links:
 *                             type: object
 *                             properties:
 *                               self:
 *                                 type: string
 *                                 example: /publications/123
 *                     publications_total:
 *                       type: integer
 *                       example: 2
 *                     publications_has_more:
 *                       type: boolean
 *                       example: false
 *                     identifiers:
 *                       type: object
 *                       description: Aggregated union of every publication's identifier set
 *                     authors:
 *                       type: array
 *                       items:
 *                         type: object
 *                     subjects:
 *                       type: array
 *                       items:
 *                         type: object
 *                     citations:
 *                       type: object
 *                     metrics:
 *                       type: object
 *                     funding:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id', validateWorkId, worksController.getWork);

/**
 * @swagger
 * /works/{id}/bibliographies:
 *   get:
 *     summary: Get work bibliography usage
 *     description: Retrieve courses where this work is used in bibliography, with instructor information
 *     tags: [Works]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Work ID
 *         example: 2684644
 *       - in: query
 *         name: reading_type
 *         schema:
 *           type: string
 *           enum: [REQUIRED, RECOMMENDED, SUPPLEMENTARY, OPTIONAL]
 *         description: Filter by reading type
 *         example: RECOMMENDED
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1900
 *         description: Filter courses from this year
 *         example: 2020
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1900
 *         description: Filter courses up to this year
 *         example: 2025
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of results to skip
 *     responses:
 *       200:
 *         description: Work bibliography usage retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       course_id:
 *                         type: integer
 *                         example: 465
 *                       course_name:
 *                         type: string
 *                         example: "Antropologia do Parentesco"
 *                       course_year:
 *                         type: integer
 *                         example: 2025
 *                       program_id:
 *                         type: integer
 *                         example: 2
 *                       reading_type:
 *                         type: string
 *                         enum: [REQUIRED, RECOMMENDED, SUPPLEMENTARY, OPTIONAL]
 *                         example: RECOMMENDED
 *                       instructor_count:
 *                         type: integer
 *                         example: 2
 *                       instructors:
 *                         type: string
 *                         example: "João Silva; Maria Santos"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id/bibliographies', validateWorkId, worksController.getWorkBibliography);

module.exports = router;
