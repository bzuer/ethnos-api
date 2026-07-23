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
 *       Returns a paginated list of publications backed by
 *       `publications p INNER JOIN works w LEFT JOIN venues v LEFT JOIN organizations publisher`.
 *       Paginate-then-hydrate: a page of `p.id` is selected first (joining
 *       `works` only when a `w.` column is referenced), then the full row set is
 *       hydrated for those ids.
 *
 *       Full-text resolution:
 *       - `q`, `author`, `subject` resolve matching work ids through **Manticore**
 *         (`q` spans title+subtitle+abstract+authors+subjects+venue; `author` → `authors`;
 *         `subject` → `subjects`), capped at 5000 work ids. When a full-text term
 *         participates, `meta.engine` is `"Manticore"` and the total is exact; the cap
 *         hit sets `meta.fulltext_truncated=true` and `meta.fulltext_work_cap=5000`.
 *       - `venue` (substring) resolves through MariaDB `ft_venues_search`
 *         (venue name + abbreviated name, boolean mode) and flips the venue join to INNER.
 *       - All other filters (`type`, `language`, `year_from`/`year_to`, `open_access`,
 *         `peer_reviewed`, `has_files`, `venue_id`, `publisher_id`, `work_id`, `doi`,
 *         `cited_by_min`/`cited_by_max`) hit B-tree indexes directly and set `meta.engine="MariaDB"`.
 *
 *       `pagination.total` is only reliable when `meta.pagination_total_exact` is `true`.
 *       When `false` (e.g. `type` or `year_from`/`year_to` whose count exceeds the 2s budget),
 *       `pagination.total` is the whole-corpus estimate, NOT the filtered subset — use
 *       `data.length < limit` as the last-page terminator. `cited_by_min`/`cited_by_max`
 *       and the `cited_by_count`/`references_count` sorts run against the indexed
 *       denormalized `p.citation_count`/`p.reference_count` and DO return exact totals fast.
 *
 *       Note: `sort_by=relevance` is accepted but is a no-op on this listing (falls back to
 *       `p.id DESC`); publications are never ordered by full-text relevance.
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
 *         description: >-
 *           Manticore full-text query spanning title, subtitle, abstract, authors,
 *           subjects and venue of each publication's parent work. Sets `meta.engine="Manticore"`.
 *         example: ritual
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, CONFERENCE_PAPER, REPORT, DATASET, PREPRINT, REVIEW, EDITORIAL, OTHER]
 *         description: Exact publication type filter on `p.type`.
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
 *         description: Filter by open access flag (accepts 1/0/true/false)
 *       - in: query
 *         name: peer_reviewed
 *         schema:
 *           type: boolean
 *         description: Filter by peer reviewed flag (accepts 1/0/true/false)
 *       - in: query
 *         name: has_files
 *         schema:
 *           type: boolean
 *         description: >-
 *           Keep only publications with (or without) attached files, enforced via
 *           `EXISTS (files)`. Combine with a selective filter (e.g. `venue_id`);
 *           a standalone `has_files=true` can exceed the statement budget.
 *       - in: query
 *         name: venue
 *         schema:
 *           type: string
 *           maxLength: 255
 *         description: >-
 *           Substring match against the venue name and abbreviated name via MariaDB
 *           `ft_venues_search` (boolean mode). This is the only text predicate that runs in MariaDB.
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
 *         description: Manticore `authors` match; publications whose work has an author matching this term (AND semantics across tokens).
 *       - in: query
 *         name: subject
 *         schema:
 *           type: string
 *           maxLength: 255
 *         description: Manticore `subjects` match; publications whose work is tagged with this subject term.
 *       - in: query
 *         name: cited_by_min
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: >-
 *           Inclusive lower bound on the indexed `p.citation_count`. Alias `citation_count_min`. Returns an exact total.
 *         example: 5
 *       - in: query
 *         name: cited_by_max
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive upper bound on the indexed `p.citation_count`. Alias `citation_count_max`.
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [cited_by_count, citation_count, references_count, reference_count, publication_year, year, id, publication_id, relevance]
 *         description: >-
 *           Primary sort key (aliases: `citation_count`=`cited_by_count`, `reference_count`=`references_count`,
 *           `year`=`publication_year`, `publication_id`=`id`; camelCase `sortBy` is also accepted).
 *           `cited_by_count`/`references_count` sort the indexed `p.citation_count`/`p.reference_count`.
 *           `relevance` is accepted but is a no-op (falls back to `p.id DESC`). Default order is `p.id DESC`.
 *         example: cited_by_count
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort direction for `sort_by` (case-insensitive; alias `sortOrder`). Defaults to DESC.
 *     responses:
 *       200:
 *         description: >-
 *           Publications retrieved. `meta.engine` is `"Manticore"` when a full-text term
 *           (`q`/`author`/`subject`) participates, else `"MariaDB"`; `meta.pagination_total_exact`
 *           gates the reliability of `pagination.total`; `meta.fulltext_truncated`/`meta.fulltext_work_cap`
 *           appear when the Manticore work-id cap is hit; `meta.page_degraded` appears if the id-selection
 *           budget fires.
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
 *                         $ref: '#/components/schemas/PublicationListItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         engine:
 *                           type: string
 *                           enum: [MariaDB, Manticore]
 *                         pagination_total_exact:
 *                           type: boolean
 *                         elapsed_ms:
 *                           type: integer
 *                         fulltext_truncated:
 *                           type: boolean
 *                         fulltext_work_cap:
 *                           type: integer
 *                         page_degraded:
 *                           type: boolean
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
 *         description: >-
 *           Include the incoming-citations array hydrated from `work_references`. When `false`,
 *           `data.citations` is `null` (not an empty array).
 *       - in: query
 *         name: include_references
 *         schema:
 *           type: boolean
 *           default: true
 *         description: >-
 *           Include the `references` block (`{resolved[], unresolved[]}`) hydrated from `work_references`.
 *           When `false`, `data.references` is `null`.
 *     responses:
 *       200:
 *         description: Publication retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PublicationDetail'
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
