const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const publicationsController = require('../controllers/publications.controller');
const { commonValidations } = require('../middleware/validation');

const WORK_TYPES = ['ARTICLE', 'BOOK', 'CHAPTER', 'THESIS', 'CONFERENCE', 'CONFERENCE_PAPER', 'REPORT', 'DATASET', 'PREPRINT', 'REVIEW', 'EDITORIAL', 'OTHER'];

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

  commonValidations.optionalSearchText('q'),
  commonValidations.optionalSearchText('search'),

  query('type')
    .optional({ values: 'falsy' })
    .customSanitizer(value => (typeof value === 'string' ? value.trim().toUpperCase() : value))
    .isIn(WORK_TYPES)
    .withMessage(`type must be one of: ${WORK_TYPES.join(', ')}`),

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
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('venue must be between 2 and 255 characters'),

  query('venue_name')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('venue_name must be between 2 and 255 characters'),

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
    .withMessage('sort_order must be ASC or DESC'),

  query('autocorrect')
    .optional({ values: 'falsy' })
    .isIn(['1', '0', 'true', 'false'])
    .withMessage('autocorrect must be boolean-like (1/0/true/false)')
];

/**
 * @swagger
 * /publications:
 *   get:
 *     summary: List publications
 *     description: |
 *       Returns a paginated list of publications backed by
 *       `publications p INNER JOIN works w LEFT JOIN venues v LEFT JOIN organizations publisher`.
 *       A page of `p.id` is selected first (joining `works` only when a works
 *       column such as `language` is involved), then the full rows are loaded
 *       for those ids. Every row carries `_links.self`.
 *
 *       Filter resolution:
 *       - `q` (alias `search`), `author`, `subject` resolve matching work ids
 *         through **Manticore** (`q` spans title+subtitle+abstract+authors+subjects+venue;
 *         `author` → authors; `subject` → subjects), keeping at most the first 5000
 *         works by relevance (`MANTICORE_PUBLICATIONS_WORK_CAP`); `meta.engine` is
 *         then `"Manticore"`. When the cap is hit the response sets
 *         `meta.fulltext_truncated=true`, `meta.fulltext_work_cap=5000` and
 *         `pagination_total_exact=false` (the total only counts those works' publications).
 *         When these terms match no work, misspelled terms are corrected (and, failing
 *         that, the conflicting `q` term dropped) and the revised query is described in
 *         `meta.query_revision`; `autocorrect=false` keeps the literal query and only
 *         suggests the revision. There is no first-page suggestion on this endpoint.
 *       - `venue` (alias `venue_name`) is a word match (boolean mode, every word
 *         required) against venue name and abbreviation via MariaDB `ft_venues_search`.
 *       - All other filters (`type`, `language`, `year_from`/`year_to`, `open_access`,
 *         `peer_reviewed`, `has_files`, `venue_id`, `publisher_id`, `work_id`, `doi`,
 *         `cited_by_min`/`cited_by_max`) hit indexes directly (`meta.engine="MariaDB"`).
 *       - `has_files=true` alone with the default sort is served from the files index
 *         (`meta.has_files_source="files_index"`, exact total); combined with any other
 *         filter or sort, `has_files` (true or false) is checked per publication.
 *
 *       `pagination.total` is exact when its count finishes inside a 2 s budget
 *       (`type=ARTICLE` → 7,055,450). Otherwise, and on the unfiltered listing, it is
 *       the whole-corpus estimate (7,744,534) with `pagination_total_exact=false` —
 *       NOT the filtered subset; use `data.length < limit` as the last-page
 *       terminator. If the id selection exceeds its statement budget the page
 *       degrades to `data: []` with `meta.page_degraded=true` and a `meta.note`.
 *
 *       Note: `sort_by=relevance` is accepted but behaves like the default
 *       (`p.id DESC`); publications are never ordered by full-text relevance.
 *     tags: [Publications]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of results per page (1..100, default 10)
 *       - $ref: '#/components/parameters/offsetParam'
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Alias of `q`.
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, CONFERENCE_PAPER, REPORT, DATASET, PREPRINT, REVIEW, EDITORIAL, OTHER]
 *         description: Exact publication type filter on `p.type` (case-insensitive). Values outside the enum are not rejected; they return an empty page.
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
 *         description: Filter by peer reviewed flag (accepts 1/0/true/false). Every publication is currently flagged peer-reviewed.
 *       - in: query
 *         name: has_files
 *         schema:
 *           type: boolean
 *         description: >-
 *           Keep only publications with (or without) attached files. `has_files=true` alone with the
 *           default sort is served from the files index (`meta.has_files_source="files_index"`, exact
 *           total); combined with any other filter or sort it is checked per publication and the
 *           total is exact whenever the count fits its budget.
 *       - in: query
 *         name: venue
 *         schema:
 *           type: string
 *           maxLength: 255
 *         description: >-
 *           Word match (boolean mode, every word required) against the venue name and abbreviated
 *           name via MariaDB `ft_venues_search`. `venue_name` is an accepted alias.
 *       - in: query
 *         name: venue_name
 *         schema:
 *           type: string
 *         description: Alias of `venue`.
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
 *         description: Restrict the result set to the publications of a single work
 *       - in: query
 *         name: doi
 *         schema:
 *           type: string
 *           maxLength: 255
 *         description: Exact DOI lookup on the unique `publications.doi`; `https://doi.org/` / `doi:` prefixes are stripped and case is ignored
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
 *           Inclusive lower bound on the indexed `p.citation_count` (an exact mirror of the parent work's
 *           `works.citation_count`). Alias `citation_count_min`.
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
 *           `cited_by_count`/`references_count` sort the indexed `p.citation_count`/`p.reference_count`
 *           (ties on `p.id` in the same direction); `publication_year` sorts `p.year` then `p.id DESC`.
 *           `relevance` is accepted but behaves like the default. Default order is `p.id DESC`.
 *         example: cited_by_count
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort direction for `sort_by` (case-insensitive; alias `sortOrder`). Defaults to DESC.
 *       - $ref: '#/components/parameters/autocorrectParam'
 *     responses:
 *       200:
 *         description: >-
 *           Publications retrieved. `meta.engine` is `"Manticore"` when a full-text term
 *           (`q`/`search`/`author`/`subject`) participates, else `"MariaDB"`; `meta.pagination_total_exact`
 *           gates the reliability of `pagination.total`; `meta.fulltext_truncated`/`meta.fulltext_work_cap`
 *           appear when the Manticore work-id cap is hit; `meta.has_files_source` appears on the
 *           files-index path; `meta.page_degraded` and `meta.note` appear if the id-selection budget fires.
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
 *                         note:
 *                           type: string
 *                         has_files_source:
 *                           type: string
 *                           enum: [files_index]
 *                         query_revision:
 *                           $ref: '#/components/schemas/QueryRevision'
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
 *       Returns a single publication identified by `publications.id`: its own
 *       `type`, the full identifier set from `publications`, `source_indexed_at`,
 *       embedded `files` read live from the `files` base table (capped at 200),
 *       a nested `work` block (parent work fields; `work.type` repeats this
 *       publication's type), `reviewed_work_id` and `review_relations`, an
 *       array of `siblings` (the other publications of the same work, each with
 *       its own `type`, capped at 50), and the parent work's `citations` /
 *       `references` blocks hydrated from `work_references`. The DOI resolver
 *       (`GET /{doi}`) returns the same payload.
 *     tags: [Publications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: publications.id
 *         example: 1127609346
 *       - in: query
 *         name: include_citations
 *         schema:
 *           type: boolean
 *           default: true
 *         description: >-
 *           Include the incoming-citations array hydrated from `work_references`. `false`, `0` or `no`
 *           disable it, and `data.citations` is then `null` (not an empty array). Independent of
 *           `include_references`.
 *       - in: query
 *         name: include_references
 *         schema:
 *           type: boolean
 *           default: true
 *         description: >-
 *           Include the `references` block (`{resolved[], unresolved[]}`) hydrated from `work_references`.
 *           `false`, `0` or `no` disable it, and `data.references` is then `null`.
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
 *       503:
 *         $ref: '#/components/responses/RequestTimeout'
 */
router.get('/:id', validatePublicationId, publicationsController.getPublication);

module.exports = router;
