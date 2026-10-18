const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const worksController = require('../controllers/works.controller');

const WORK_TYPES = ['ARTICLE', 'BOOK', 'CHAPTER', 'THESIS', 'CONFERENCE', 'CONFERENCE_PAPER', 'REPORT', 'DATASET', 'PREPRINT', 'REVIEW', 'EDITORIAL', 'OTHER'];

const validateWorkId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Work ID must be a positive integer')
];

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
  
  query('search')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('search must be between 2 and 200 characters'),

  query('q')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('q must be between 2 and 200 characters'),

  query('type')
    .optional({ values: 'falsy' })
    .customSanitizer(value => (typeof value === 'string' ? value.toUpperCase() : value))
    .isIn(WORK_TYPES)
    .withMessage(`type must be one of: ${WORK_TYPES.join(', ')}`),

  query('work_type')
    .optional({ values: 'falsy' })
    .customSanitizer(value => (typeof value === 'string' ? value.toUpperCase() : value))
    .isIn(WORK_TYPES)
    .withMessage(`work_type must be one of: ${WORK_TYPES.join(', ')}`),

  query('peer_reviewed')
    .optional({ values: 'falsy' })
    .isIn(['1', '0', 'true', 'false'])
    .withMessage('peer_reviewed must be boolean-like (1/0/true/false)'),

  query('venue_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('venue_id must be a positive integer'),

  query('language')
    .optional({ values: 'falsy' })
    .isLength({ min: 2, max: 5 })
    .withMessage('Language must be a valid language code'),

  query('open_access')
    .optional({ values: 'falsy' })
    .isIn(['1', '0', 'true', 'false'])
    .withMessage('open_access must be boolean-like (1/0/true/false)'),
  
  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000 })
    .withMessage('Year from must be a valid year'),
  
  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000 })
    .withMessage('Year to must be a valid year'),

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
    .isIn(['cited_by_count', 'citation_count', 'references_count', 'reference_count', 'publication_year', 'year', 'id', 'work_id', 'relevance'])
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
 * /works:
 *   get:
 *     summary: Get list of academic works
 *     description: |
 *       Returns a paginated list of works backed by the `works` + `publications` base tables.
 *       Filters apply with **`match_mode: "any_publication"`** semantics: a
 *       work appears if **any of its publications** matches the filter set,
 *       and each card displays the latest publication that matches the
 *       filters (highest publication id among the matching ones; without a
 *       publication filter, the work's latest publication). The detail
 *       endpoint picks its primary publication differently (latest year,
 *       then files, then id), so a card and the detail can show different
 *       publications of a multi-manifestation work.
 *
 *       Backend routing: the default browse and the structured filters
 *       (`type`, `language`, `year_from`/`year_to`, `open_access`,
 *       `peer_reviewed`, `venue_id`, `cited_by_min`/`cited_by_max`) run on
 *       **MariaDB**. Free-text `q` and the metadata filters `author`,
 *       `subject` and `venue_name` run on **Manticore** (authors, subjects
 *       and venue fields respectively, each with AND semantics); the
 *       structured filters are then applied inside Manticore, except
 *       `venue_id`, which cannot be combined with full-text terms (400).
 *       `meta.performance.engine` and the per-row `search_engine` report the
 *       engine that served the page.
 *
 *       Full-text revision: when a full-text query matches nothing, misspelled
 *       terms are corrected against the Manticore dictionary (one edit, or two
 *       for long words absent from the dictionary) and, failing that, the `q`
 *       term that conflicts with the others is dropped; the response then
 *       serves the revised query and describes it in `meta.query_revision`
 *       (`autocorrect=false` serves the literal query and only suggests the
 *       revision). A first page whose rare term is one edit from a far more
 *       frequent word carries a non-applied suggestion instead.
 *
 *       Totals: exact (`meta.pagination_total_exact: true`) on the full-text
 *       path and when the filtered count finishes inside its 2 s budget;
 *       otherwise, and on the unfiltered browse, `total` is the whole-corpus
 *       estimate (7,657,142) with `pagination_total_exact: false` — not an
 *       approximation of the filtered set. If the page query exceeds its
 *       statement budget the response is 200 with `data: []`,
 *       `meta.page_degraded: true`, `meta.note` and
 *       `pagination_total_exact: false`; selective publication filters
 *       (rare `type`, `venue_id`) are the most likely to degrade on deeper
 *       pages — `/publications` pages such sets exactly. Full-text results can
 *       be paged through the first 100,000 matches (`offset + limit` beyond
 *       that is a 400). A full-text page can under-fill when the search index
 *       still holds deleted works; rely on `pagination.hasNext`, not the row
 *       count.
 *     tags: [Works]
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
 *           minLength: 2
 *           maxLength: 200
 *         description: |
 *           Free-text query resolved through Manticore across
 *           title/subtitle/abstract/authors/subjects/venue. `search` is an
 *           accepted alias.
 *         example: kinship
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 200
 *         description: Alias of `q`.
 *       - in: query
 *         name: author
 *         schema:
 *           type: string
 *         description: Manticore authors filter (AND semantics).
 *         example: silva
 *       - in: query
 *         name: subject
 *         schema:
 *           type: string
 *         description: Manticore subjects filter (AND semantics).
 *         example: anthropology
 *       - in: query
 *         name: venue_name
 *         schema:
 *           type: string
 *         description: Manticore venue filter (venue name and abbreviation, AND semantics). `venue` is an accepted alias.
 *         example: mana
 *       - in: query
 *         name: venue
 *         schema:
 *           type: string
 *         description: Alias of `venue_name`.
 *       - in: query
 *         name: venue_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: |
 *           Works with at least one publication in this venue. Cannot be
 *           combined with `q`/`search`/`author`/`subject`/`venue_name`
 *           (400 `VALIDATION_ERROR`; use `venue_name` instead).
 *         example: 1012159
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, CONFERENCE_PAPER, REPORT, DATASET, PREPRINT, REVIEW, EDITORIAL, OTHER]
 *         description: Works with at least one publication of this type (case-insensitive; other values are a 400). `work_type` is an accepted alias.
 *         example: ARTICLE
 *       - in: query
 *         name: work_type
 *         schema:
 *           type: string
 *           enum: [ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, CONFERENCE_PAPER, REPORT, DATASET, PREPRINT, REVIEW, EDITORIAL, OTHER]
 *         description: Alias of `type`.
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 5
 *         description: Filter by ISO 639-1 language code (matches `works.language`).
 *         example: en
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Works with at least one publication dated in or after this year.
 *         example: 2020
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Works with at least one publication dated in or before this year.
 *         example: 2023
 *       - in: query
 *         name: open_access
 *         schema:
 *           type: boolean
 *         description: Works with at least one publication with this open-access flag (1/0/true/false).
 *         example: true
 *       - in: query
 *         name: peer_reviewed
 *         schema:
 *           type: boolean
 *         description: Works with at least one publication with this peer-review flag (1/0/true/false). Every publication is currently flagged peer-reviewed.
 *       - in: query
 *         name: cited_by_min
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive lower bound on `cited_by_count` (`works.citation_count`). `citation_count_min` is an accepted alias.
 *         example: 10
 *       - in: query
 *         name: cited_by_max
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive upper bound on `cited_by_count`. `citation_count_max` is an accepted alias.
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [cited_by_count, references_count, publication_year, id, relevance]
 *         description: |
 *           Primary sort key (`sortBy` is an accepted alias; aliases
 *           `citation_count`, `reference_count`, `year`, `work_id`).
 *           `cited_by_count` / `references_count` sort on `works.citation_count` /
 *           `works.reference_count`; `publication_year` sorts on the work's
 *           latest publication year. `relevance` applies only on the full-text
 *           path (`q`/`author`/`subject`/`venue_name`) and is the default there;
 *           otherwise the default order is `id DESC` (newest work first).
 *         example: cited_by_count
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort direction for `sort_by` (`sortOrder` is an accepted alias). Defaults to DESC.
 *       - $ref: '#/components/parameters/autocorrectParam'
 *     responses:
 *       200:
 *         description: Paginated list of works.
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
 *                         $ref: '#/components/schemas/WorkListItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         match_mode:
 *                           type: string
 *                           example: any_publication
 *                         pagination_total_exact:
 *                           type: boolean
 *                         page_degraded:
 *                           type: boolean
 *                           description: Present (true) when the page query exceeded its statement budget and `data` is empty.
 *                         note:
 *                           type: string
 *                           description: Explanation accompanying `page_degraded`.
 *                         query_revision:
 *                           $ref: '#/components/schemas/QueryRevision'
 *                         performance:
 *                           $ref: '#/components/schemas/PerformanceMeta'
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
 *       MariaDB browse with the same row shape (`WorkListItem`) and `meta` as
 *       `GET /works`. Filters apply with **`match_mode: "any_publication"`**
 *       semantics: a work appears if any of its publications matches, and the
 *       card displays the latest matching publication. This endpoint reads
 *       only the structured filters below; `q` / `search` / `author` /
 *       `subject` / `venue_name` are ignored (`q` / `search` are still
 *       length-validated). Totals, the corpus-estimate fallback (7,657,142
 *       with `pagination_total_exact: false`) and degraded pages
 *       (`meta.page_degraded`) behave exactly as on `GET /works`.
 *     tags: [Works]
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
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, CONFERENCE_PAPER, REPORT, DATASET, PREPRINT, REVIEW, EDITORIAL, OTHER]
 *         description: Works with at least one publication of this type (case-insensitive). `work_type` is an accepted alias.
 *         example: ARTICLE
 *       - in: query
 *         name: work_type
 *         schema:
 *           type: string
 *           enum: [ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, CONFERENCE_PAPER, REPORT, DATASET, PREPRINT, REVIEW, EDITORIAL, OTHER]
 *         description: Alias of `type`.
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Works with at least one publication dated in or after this year.
 *         example: 2020
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Works with at least one publication dated in or before this year.
 *         example: 2023
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 5
 *         description: Filter by ISO 639-1 language code.
 *         example: en
 *       - in: query
 *         name: open_access
 *         schema:
 *           type: boolean
 *         description: Works with at least one publication with this open-access flag (1/0/true/false).
 *       - in: query
 *         name: peer_reviewed
 *         schema:
 *           type: boolean
 *         description: Works with at least one publication with this peer-review flag (1/0/true/false).
 *       - in: query
 *         name: venue_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Works with at least one publication in this venue.
 *         example: 1012159
 *       - in: query
 *         name: cited_by_min
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive lower bound on `cited_by_count`. `citation_count_min` is an accepted alias.
 *       - in: query
 *         name: cited_by_max
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Inclusive upper bound on `cited_by_count`. `citation_count_max` is an accepted alias.
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [cited_by_count, references_count, publication_year, id]
 *         description: Primary sort key (`sortBy` is an accepted alias). Default order is `id DESC` (newest work first).
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort direction for `sort_by` (`sortOrder` is an accepted alias).
 *     responses:
 *       200:
 *         description: Paginated works browse.
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
 *                         $ref: '#/components/schemas/WorkListItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         match_mode:
 *                           type: string
 *                           example: any_publication
 *                         pagination_total_exact:
 *                           type: boolean
 *                         page_degraded:
 *                           type: boolean
 *                           description: Present (true) when the page query exceeded its statement budget and `data` is empty.
 *                         note:
 *                           type: string
 *                           description: Explanation accompanying `page_degraded`.
 *                         performance:
 *                           $ref: '#/components/schemas/PerformanceMeta'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
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
 *       `publications_total` and `publications_has_more` flags), each carrying
 *       its own `type`, `identifiers`, `venue`, `publisher`, `files`,
 *       `source_indexed_at`, `created_at` / `updated_at`, `reviewed_work_id`,
 *       `_links.self` and an `is_primary` flag. Work-level aggregations expose
 *       `primary_publication_id` / `primary_publication` (picker: latest year,
 *       then has files, then highest id), convenience top-level
 *       `publication_year` / `doi` / `open_access` / `peer_reviewed` /
 *       `has_files` / `venue`, a `year_range` block, a distinct `venues[]`
 *       roll-up (with `publication_count` / `latest_year` per venue), a flat
 *       `files[]` aggregation (capped at 50, each entry carrying its parent
 *       `publication_id`), a `file_summary` block, aggregated `identifiers`
 *       (union over publications), `review_relations`, `authors[]` /
 *       `authors_count` / `contributors[]` / `contributor_roles`,
 *       `subjects[]`, a `citations` object (`cited_by`, `references`,
 *       `unresolved_references`, and the `unsolved` alias), a `metrics` block,
 *       `funding[]`, and `summary_updated_at` (`works.metrics_last_updated`).
 *     tags: [Works]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Unique identifier of the work
 *         example: 7539537
 *       - in: query
 *         name: include_citations
 *         schema:
 *           type: boolean
 *           default: true
 *         description: |
 *           Include the inline `citations.cited_by` list. `false`, `0` or `no`
 *           disable it, and `citations.cited_by` is then `null`.
 *       - in: query
 *         name: include_references
 *         schema:
 *           type: boolean
 *           default: true
 *         description: |
 *           Include the inline reference lists. `false`, `0` or `no` disable
 *           them, and `citations.references`, `citations.unresolved_references`
 *           and `citations.unsolved` are then `null`. Independent of
 *           `include_citations`.
 *     responses:
 *       200:
 *         description: Work retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/WorkDetail'
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
router.get('/:id', validateWorkId, worksController.getWork);

/**
 * @swagger
 * /works/{id}/bibliographies:
 *   get:
 *     summary: Get work bibliography usage
 *     description: |
 *       Lists the courses whose reading list includes this work, with per-course
 *       reading type and instructor information, ordered by course year
 *       (newest first) then course name. An unknown work id is a 404; an
 *       existing work no course lists returns an empty 200. `reading_type`,
 *       `year_from`, `year_to`, `page`, `limit` (1..100) and `offset` are
 *       validated (400 on an invalid value).
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
 *           enum: [REQUIRED, RECOMMENDED, SUPPLEMENTARY]
 *         description: Filter by reading type (case-insensitive)
 *         example: RECOMMENDED
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Filter courses from this year
 *         example: 2020
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: Filter courses up to this year
 *         example: 2025
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of results per page (1..100, default 10)
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: Work bibliography usage retrieved successfully.
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
 *                         $ref: '#/components/schemas/WorkBibliographyItem'
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
const validateWorkBibliography = [
  ...validateWorkId,
  query('reading_type')
    .optional({ values: 'falsy' })
    .customSanitizer(value => (typeof value === 'string' ? value.trim().toUpperCase() : value))
    .isIn(['REQUIRED', 'RECOMMENDED', 'SUPPLEMENTARY'])
    .withMessage('reading_type must be one of: REQUIRED, RECOMMENDED, SUPPLEMENTARY'),
  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000, max: new Date().getFullYear() + 1 })
    .withMessage('year_from must be a valid year'),
  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000, max: new Date().getFullYear() + 1 })
    .withMessage('year_to must be a valid year'),
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

router.get('/:id/bibliographies', validateWorkBibliography, worksController.getWorkBibliography);

module.exports = router;
