const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const publicationsController = require('../controllers/publications.controller');

const validatePublicationId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Publication ID must be a positive integer')
];

const validatePublicationsQuery = [
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

  query('q')
    .optional({ values: 'falsy' })
    .isLength({ min: 1, max: 200 })
    .withMessage('Query string must be 1 to 200 characters'),

  query('type')
    .optional({ values: 'falsy' })
    .isLength({ max: 50 }),

  query('language')
    .optional({ values: 'falsy' })
    .isLength({ min: 2, max: 5 })
    .withMessage('Language must be a valid language code'),

  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000 })
    .withMessage('Year from must be a valid year'),

  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000 })
    .withMessage('Year to must be a valid year'),

  query('open_access')
    .optional({ values: 'falsy' })
    .isIn(['1', '0', 'true', 'false'])
    .withMessage('open_access must be boolean-like (1/0/true/false)'),

  query('peer_reviewed')
    .optional({ values: 'falsy' })
    .isIn(['1', '0', 'true', 'false'])
    .withMessage('peer_reviewed must be boolean-like (1/0/true/false)'),

  query('has_files')
    .optional({ values: 'falsy' })
    .isIn(['1', '0', 'true', 'false'])
    .withMessage('has_files must be boolean-like (1/0/true/false)'),

  query('venue')
    .optional({ values: 'falsy' })
    .isLength({ max: 255 }),

  query('venue_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('venue_id must be a positive integer'),

  query('publisher_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('publisher_id must be a positive integer'),

  query('work_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('work_id must be a positive integer'),

  query('doi')
    .optional({ values: 'falsy' })
    .isLength({ max: 255 }),

  query('author')
    .optional({ values: 'falsy' })
    .isLength({ max: 255 }),

  query('subject')
    .optional({ values: 'falsy' })
    .isLength({ max: 255 }),

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
    .isIn(['cited_by_count', 'citation_count', 'references_count', 'reference_count', 'publication_year', 'year', 'id', 'publication_id', 'relevance'])
    .withMessage('sort_by must be one of: cited_by_count, references_count, publication_year, id, relevance'),

  query('sort_order')
    .optional({ values: 'falsy' })
    .customSanitizer(value => (typeof value === 'string' ? value.toUpperCase() : value))
    .isIn(['ASC', 'DESC'])
    .withMessage('sort_order must be ASC or DESC')
];

/**
 * @swagger
 * /publications:
 *   get:
 *     summary: List publications
 *     description: |
 *       Returns a paginated list of publications backed by `publications` + `works` + `venues`.
 *       Filters can target the parent work (`work_type`, `language`, `work_id`)
 *       or the publication itself (`year_from`, `year_to`, `open_access`,
 *       `peer_reviewed`, `has_files`, `venue`, `venue_id`, `publisher_id`,
 *       `doi`). Free-text queries (`q`) use MariaDB FULLTEXT against
 *       `ft_works_content`; metadata filters (`venue`, `author`, `subject`)
 *       use FULLTEXT against `ft_works_metadata` (authors + subjects) and
 *       `ft_venues_search` (venue name + abbreviated name).
 *     tags: [Publications]
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
 *         description: Number of items to skip (alternative to page)
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 200
 *         description: Free-text query against ft_works_content (full_title_normalized + subjects_search)
 *         example: machine learning
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           maxLength: 50
 *         description: Work type filter (ARTICLE, BOOK, CHAPTER, ...)
 *         example: ARTICLE
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 5
 *         description: ISO language code
 *         example: en
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Inclusive lower bound on publication_year
 *         example: 2020
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Inclusive upper bound on publication_year
 *         example: 2024
 *       - in: query
 *         name: open_access
 *         schema:
 *           type: boolean
 *         description: Filter by open access flag
 *       - in: query
 *         name: peer_reviewed
 *         schema:
 *           type: boolean
 *         description: Filter by peer reviewed flag
 *       - in: query
 *         name: has_files
 *         schema:
 *           type: boolean
 *         description: Filter publications that carry attached files
 *       - in: query
 *         name: venue
 *         schema:
 *           type: string
 *           maxLength: 255
 *         description: Substring match against the publication venue search field
 *       - in: query
 *         name: venue_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Exact match against publications.venue_id
 *       - in: query
 *         name: publisher_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Exact match against publications.publisher_id
 *       - in: query
 *         name: work_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Restrict the result set to siblings of a single work
 *       - in: query
 *         name: doi
 *         schema:
 *           type: string
 *           maxLength: 255
 *         description: Exact DOI lookup (uses publications.doi unique key)
 *       - in: query
 *         name: author
 *         schema:
 *           type: string
 *           maxLength: 255
 *         description: Substring match against authors_search
 *       - in: query
 *         name: subject
 *         schema:
 *           type: string
 *           maxLength: 255
 *         description: Substring match against subjects_search
 *       - in: query
 *         name: cited_by_min
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Keep only publications whose parent work has cited_by_count >= this value.
 *         example: 5
 *       - in: query
 *         name: cited_by_max
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Keep only publications whose parent work has cited_by_count <= this value.
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [cited_by_count, references_count, publication_year, id, relevance]
 *         description: |
 *           Primary sort key. `cited_by_count` surfaces the most cited publications first; `relevance`
 *           is only meaningful when `q`, `venue`, `author`, or `subject` is set (FULLTEXT path).
 *         example: cited_by_count
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort direction for `sort_by`. Defaults to DESC.
 *     responses:
 *       200:
 *         description: Publications retrieved successfully
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
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     engine:
 *                       type: string
 *                       example: MariaDB
 *                     elapsed_ms:
 *                       type: integer
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/', validatePublicationsQuery, publicationsController.getPublications);

/**
 * @swagger
 * /publications/{id}:
 *   get:
 *     summary: Get a publication by id
 *     description: |
 *       Returns a single publication identified by `publications.id`.
 *       The response carries a nested `work` block (parent work fields), the
 *       full identifier set from `publications`, embedded `files` joined live
 *       from the `files` base table, an array of `siblings` (other publications
 *       of the same work, capped at 50), and optional `citations` / `references`
 *       blocks hydrated from `work_references`.
 *     tags: [Publications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: publications.id
 *         example: 123456
 *       - in: query
 *         name: include_citations
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include the cited_by block hydrated from work_references
 *       - in: query
 *         name: include_references
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include the references block hydrated from work_references
 *     responses:
 *       200:
 *         description: Publication retrieved successfully
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
 *                     identifiers:
 *                       type: object
 *                     work:
 *                       type: object
 *                     siblings:
 *                       type: array
 *                       items:
 *                         type: object
 *                     files:
 *                       type: array
 *                       items:
 *                         type: object
 *                     venue:
 *                       type: object
 *                       nullable: true
 *                     publisher:
 *                       type: object
 *                       nullable: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id', validatePublicationId, publicationsController.getPublication);

module.exports = router;
