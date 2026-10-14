const express = require('express');
const { query, validationResult } = require('express-validator');
const router = express.Router();
const searchController = require('../controllers/search.controller');
const { commonValidations } = require('../middleware/validation');
const { logger } = require('../middleware/errorHandler');
const { createPagination, normalizePagination } = require('../utils/pagination');
const { ERROR_CODES } = require('../utils/responseBuilder');

const WORK_TYPES = ['ARTICLE', 'BOOK', 'CHAPTER', 'THESIS', 'CONFERENCE', 'CONFERENCE_PAPER', 'REPORT', 'DATASET', 'PREPRINT', 'REVIEW', 'EDITORIAL', 'OTHER'];
const MAX_YEAR = new Date().getFullYear() + 1;

const toBooleanParam = (value) => {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
};

const validateWorksSearch = [
  commonValidations.optionalSearchText('q'),
  ...commonValidations.pagination,
  query('type')
    .optional({ values: 'falsy' })
    .customSanitizer(value => (typeof value === 'string' ? value.toUpperCase() : value))
    .isIn(WORK_TYPES)
    .withMessage(`type must be one of: ${WORK_TYPES.join(', ')}`),
  query('language')
    .optional({ values: 'falsy' })
    .isLength({ min: 2, max: 5 })
    .withMessage('Language must be a valid language code'),
  query('peer_reviewed')
    .optional({ values: 'falsy' })
    .isIn(['1', '0', 'true', 'false'])
    .withMessage('peer_reviewed must be boolean-like (1/0/true/false)'),
  query('open_access')
    .optional({ values: 'falsy' })
    .isIn(['1', '0', 'true', 'false'])
    .withMessage('open_access must be boolean-like (1/0/true/false)'),
  query('venue_name')
    .optional({ values: 'falsy' })
    .isLength({ min: 2, max: 255 })
    .withMessage('venue_name must have between 2 and 255 characters'),
  query('venue')
    .optional({ values: 'falsy' })
    .isLength({ min: 2, max: 255 })
    .withMessage('venue must have between 2 and 255 characters'),
  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000, max: MAX_YEAR })
    .withMessage(`year_from must be between 1000 and ${MAX_YEAR}`)
    .toInt(),
  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000, max: MAX_YEAR })
    .withMessage(`year_to must be between 1000 and ${MAX_YEAR}`)
    .toInt(),
  query('author')
    .optional({ values: 'falsy' })
    .isLength({ min: 2, max: 255 })
    .withMessage('author must have between 2 and 255 characters'),
  query('subject')
    .optional({ values: 'falsy' })
    .isLength({ min: 2, max: 255 })
    .withMessage('subject must have between 2 and 255 characters'),
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
    .withMessage('sort_order must be ASC or DESC')
];

/**
 * @swagger
 * /search/works:
 *   get:
 *     summary: Search works using full-text search
 *     tags: [Search]
 *     description: >-
 *       Works search. With a text term (`q`, `author`, `subject` or `venue`/`venue_name`)
 *       it runs on Manticore over (title, subtitle, abstract, authors, subjects, venue),
 *       defaults to relevance order and reports an exact Manticore count. Without a text
 *       term it is the MariaDB `/works` browse (default order `id DESC`; the count has a
 *       2 s budget and falls back to the corpus estimate with
 *       `meta.pagination_total_exact=false`). Query text is literal: only letters, digits,
 *       `_` and whitespace reach the engine (everything else separates words, no operators
 *       or wildcards) and every term is required. The `authors` field holds AUTHOR-role
 *       contributors only. Pages beyond the first 100,000 full-text matches return 400.
 *       Each row shows the latest publication matching the filters. Requests with `q`
 *       are recorded for /search/popular.
 *     parameters:
 *       - name: q
 *         in: query
 *         required: false
 *         description: Free-text query (2-200 characters after trimming). Optional.
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 200
 *           example: "kinship"
 *       - name: type
 *         in: query
 *         description: Work type (case-insensitive); matches a work if any of its publications has that type.
 *         schema:
 *           type: string
 *           enum: [ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, CONFERENCE_PAPER, REPORT, DATASET, PREPRINT, REVIEW, EDITORIAL, OTHER]
 *       - name: language
 *         in: query
 *         description: Language code (2-5 characters).
 *         schema:
 *           type: string
 *           example: "en"
 *       - name: peer_reviewed
 *         in: query
 *         description: Peer-review flag of any publication.
 *         schema:
 *           type: string
 *           enum: ["1", "0", "true", "false"]
 *       - name: open_access
 *         in: query
 *         description: Open-access flag of any publication.
 *         schema:
 *           type: string
 *           enum: ["1", "0", "true", "false"]
 *       - name: venue_name
 *         in: query
 *         description: >-
 *           Venue text filter (2-255 characters) on the Manticore `venue` field (name and
 *           abbreviation of the venue of any publication, verbatim words). Counts as a text term.
 *         schema:
 *           type: string
 *           example: "mana"
 *       - name: venue
 *         in: query
 *         description: Alias of venue_name.
 *         schema:
 *           type: string
 *           example: "mana"
 *       - name: year_from
 *         in: query
 *         description: Minimum publication year (any publication).
 *         schema:
 *           type: integer
 *           minimum: 1000
 *           example: 2015
 *       - name: year_to
 *         in: query
 *         description: Maximum publication year (any publication; at most next year).
 *         schema:
 *           type: integer
 *           minimum: 1000
 *           example: 2024
 *       - name: author
 *         in: query
 *         description: Author name (2-255 characters) on the Manticore `authors` field (AUTHOR-role names, verbatim, AND semantics).
 *         schema:
 *           type: string
 *           example: "Geertz"
 *       - name: subject
 *         in: query
 *         description: Subject (2-255 characters) on the Manticore `subjects` field (stemmed, AND semantics).
 *         schema:
 *           type: string
 *           example: "anthropology"
 *       - name: cited_by_min
 *         in: query
 *         description: Keep only works whose cited_by_count is greater than or equal to this value.
 *         schema:
 *           type: integer
 *           minimum: 0
 *         example: 10
 *       - name: cited_by_max
 *         in: query
 *         description: Keep only works whose cited_by_count is less than or equal to this value.
 *         schema:
 *           type: integer
 *           minimum: 0
 *       - name: sort_by
 *         in: query
 *         description: >-
 *           Primary sort key. Defaults to relevance when a text term is present, otherwise
 *           `id` DESC. `relevance` is only meaningful with a text term.
 *         schema:
 *           type: string
 *           enum: [cited_by_count, references_count, publication_year, id, relevance]
 *       - name: sort_order
 *         in: query
 *         description: Sort direction for `sort_by`. Defaults to DESC.
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: >-
 *           Paginated work search results. Each row is a WorkListItem plus search
 *           provenance (`data_source` / `search_engine`: `search` / `Manticore` on the
 *           full-text path, `full_api` / `MariaDB` on the browse path) and `relevance`,
 *           which is always null.
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
 *                         query:
 *                           type: string
 *                         search_type:
 *                           type: string
 *                           example: fulltext
 *                         match_mode:
 *                           type: string
 *                           example: any_publication
 *                         pagination_total_exact:
 *                           type: boolean
 *                           description: False when the browse-path count fell back to the corpus estimate.
 *                         performance:
 *                           type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/works', validateWorksSearch, searchController.searchWorks);

/**
 * @swagger
 * /search/global:
 *   get:
 *     summary: Global search across all entities
 *     tags: [Search]
 *     description: >-
 *       Works and persons searched in one round trip (Manticore), each block with its own
 *       exact total and a `results[]` slice capped at `limit`. Institutions are not part of
 *       the global search (use /institutions?q=). The query is recorded for /search/popular.
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         description: Search query (2-200 characters after trimming).
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 200
 *           example: "anthropology"
 *       - name: limit
 *         in: query
 *         description: Rows per entity block (400 outside 1-20).
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 5
 *     responses:
 *       200:
 *         description: >-
 *           Works and persons blocks, each capped at `limit`. The institutions block is
 *           always `{ total: null, results: [], note }`; `null` means not searched.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/GlobalSearchResult'
 *                     meta:
 *                       type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/global', [
  ...commonValidations.searchQuery,
  query('limit')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 20 })
    .withMessage('limit must be between 1 and 20')
], searchController.globalSearch);


/**
 * @swagger
 * /search/persons:
 *   get:
 *     summary: Search persons/researchers by name
 *     description: >-
 *       Name search for researchers and authors served by Manticore across
 *       preferred_name, given_names and family_name (unstemmed, every term required,
 *       query text literal). Each row is a compact PersonSearchItem, not the full person
 *       profile; `relevance` is always null. Totals are exact; pages beyond the first
 *       100,000 matches return 400.
 *     tags: [Search]
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         description: Person name query (2-200 characters after trimming).
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 200
 *           example: "silva"
 *       - name: verified
 *         in: query
 *         required: false
 *         description: Restrict by verification status; echoed as a boolean in `meta.verified`.
 *         schema:
 *           type: string
 *           enum: ["1", "0", "true", "false"]
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: Compact person search results.
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
 *                         $ref: '#/components/schemas/PersonSearchItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/persons', [
  ...commonValidations.searchQuery,
  ...commonValidations.pagination,
  query('verified')
    .optional({ values: 'falsy' })
    .isIn(['true', 'false', '1', '0'])
    .withMessage('verified must be boolean-like (1/0/true/false)')
], searchController.searchPersons);


/**
 * @swagger
 * /search/advanced:
 *   get:
 *     summary: Advanced works search with filters
 *     tags: [Search]
 *     description: >-
 *       Same engine, parameters and validation as /search/works, with the rows wrapped
 *       under `data.results` (without the `relevance` key) next to a `data.facets` object.
 *       Faceting is not implemented: `data.facets` is always `{}`. `work_type` is an alias
 *       of `type` and takes precedence when both are set. Requests are not recorded for
 *       /search/popular.
 *     parameters:
 *       - name: q
 *         in: query
 *         required: false
 *         description: Free-text query (2-200 characters after trimming). Optional.
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 200
 *           example: "ritual"
 *       - name: work_type
 *         in: query
 *         description: Work type (case-insensitive); alias of `type` that wins when both are set.
 *         schema:
 *           type: string
 *           enum: [ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, CONFERENCE_PAPER, REPORT, DATASET, PREPRINT, REVIEW, EDITORIAL, OTHER]
 *       - name: language
 *         in: query
 *         description: Language code (2-5 characters).
 *         schema:
 *           type: string
 *           example: "en"
 *       - name: year_from
 *         in: query
 *         description: Minimum publication year (any publication).
 *         schema:
 *           type: integer
 *           minimum: 1000
 *           example: 2018
 *       - name: year_to
 *         in: query
 *         description: Maximum publication year (any publication; at most next year).
 *         schema:
 *           type: integer
 *           minimum: 1000
 *           example: 2024
 *       - name: peer_reviewed
 *         in: query
 *         description: Peer-review flag of any publication.
 *         schema:
 *           type: string
 *           enum: ["1", "0", "true", "false"]
 *       - name: open_access
 *         in: query
 *         description: Open-access flag of any publication.
 *         schema:
 *           type: string
 *           enum: ["1", "0", "true", "false"]
 *       - name: venue_name
 *         in: query
 *         description: Venue text filter on the Manticore `venue` field (2-255 characters); counts as a text term.
 *         schema:
 *           type: string
 *       - name: venue
 *         in: query
 *         description: Alias of venue_name.
 *         schema:
 *           type: string
 *       - name: author
 *         in: query
 *         description: Author name on the Manticore `authors` field (AUTHOR-role names, 2-255 characters).
 *         schema:
 *           type: string
 *           example: "silva"
 *       - name: subject
 *         in: query
 *         description: Subject on the Manticore `subjects` field (2-255 characters).
 *         schema:
 *           type: string
 *           example: "anthropology"
 *       - name: type
 *         in: query
 *         description: Work type (case-insensitive).
 *         schema:
 *           type: string
 *           enum: [ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, CONFERENCE_PAPER, REPORT, DATASET, PREPRINT, REVIEW, EDITORIAL, OTHER]
 *       - name: cited_by_min
 *         in: query
 *         description: Keep only works whose cited_by_count is greater than or equal to this value.
 *         schema:
 *           type: integer
 *           minimum: 0
 *       - name: cited_by_max
 *         in: query
 *         description: Keep only works whose cited_by_count is less than or equal to this value.
 *         schema:
 *           type: integer
 *           minimum: 0
 *       - name: sort_by
 *         in: query
 *         description: >-
 *           Primary sort key. Defaults to relevance when a text term is present, otherwise
 *           `id` DESC. `relevance` is only meaningful with a text term.
 *         schema:
 *           type: string
 *           enum: [cited_by_count, references_count, publication_year, id, relevance]
 *       - name: sort_order
 *         in: query
 *         description: Sort direction for `sort_by`. Defaults to DESC.
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: >-
 *           Works results under `data.results` (each row a WorkListItem; the `relevance`
 *           key is omitted on this endpoint) plus an always-empty `data.facets` object.
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
 *                         results:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/WorkListItem'
 *                         facets:
 *                           type: object
 *                           description: Always an empty object; faceting is not implemented.
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         query:
 *                           type: string
 *                         search_type:
 *                           type: string
 *                           example: fulltext_faceted
 *                         filters_applied:
 *                           type: integer
 *                         engine:
 *                           type: string
 *                           enum: [Manticore, MariaDB]
 *                         pagination_total_exact:
 *                           type: boolean
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const worksService = require('../services/works.service');

const advancedSearch = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.fail('Validation failed', {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION,
        errors: errors.array()
      });
    }
    const query = (req.query.q || '').trim();
    const pagination = normalizePagination(req.query);
    const { limit, offset, page } = pagination;

    const toNonNegativeInt = (value) => {
      if (value === undefined || value === null || value === '') return undefined;
      const parsed = parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 0) return undefined;
      return parsed;
    };

    const filters = {
      work_type: req.query.work_type || req.query.type,
      language: req.query.language,
      year_from: req.query.year_from,
      year_to: req.query.year_to,
      peer_reviewed: toBooleanParam(req.query.peer_reviewed),
      venue_name: (req.query.venue_name || req.query.venue || '').trim() || undefined,
      open_access: toBooleanParam(req.query.open_access),
      author: (req.query.author || '').trim() || undefined,
      subject: (req.query.subject || '').trim() || undefined,
      citation_count_min: toNonNegativeInt(req.query.cited_by_min ?? req.query.citation_count_min),
      citation_count_max: toNonNegativeInt(req.query.cited_by_max ?? req.query.citation_count_max)
    };

    const sortBy = req.query.sort_by ?? req.query.sortBy ?? null;
    const sortOrder = req.query.sort_order ?? req.query.sortOrder ?? null;

    Object.keys(filters).forEach((key) => {
      if (filters[key] === undefined || filters[key] === null || filters[key] === '') {
        delete filters[key];
      }
    });

    const start = Date.now();

    const worksFilters = {
      page,
      limit,
      offset,
      search: query,
      type: filters.work_type,
      language: filters.language,
      year_from: filters.year_from,
      year_to: filters.year_to,
      peer_reviewed: filters.peer_reviewed,
      open_access: filters.open_access,
      venue_name: filters.venue_name,
      author: filters.author,
      subject: filters.subject,
      cited_by_min: filters.citation_count_min,
      cited_by_max: filters.citation_count_max,
      sort_by: sortBy,
      sort_order: sortOrder
    };
    const result = await worksService.getWorks(worksFilters);
    const controllerTime = Date.now() - start;
    const data = {
      results: result.data || [],
      facets: {}
    };

    return res.success(data, {
      pagination: result.pagination || createPagination(page, limit, data.results.length),
      meta: {
        query,
        search_type: 'fulltext_faceted',
        filters_applied: Object.keys(filters).length,
        engine: result.meta?.performance?.engine || (query ? 'Manticore' : 'MariaDB'),
        pagination_total_exact: result.meta?.pagination_total_exact ?? true,
        performance: {
          controller_time_ms: controllerTime
        }
      }
    });
  } catch (error) {
    logger.error('Advanced search failed', {
      query: req.query.q,
      error: error.message
    });

    if (typeof res.error === 'function') {
      return res.error(error, {
        meta: { context: 'advancedSearch' }
      });
    }
    return next(error);
  }
};

const validateAdvancedSearch = [
  ...validateWorksSearch,
  query('work_type')
    .optional({ values: 'falsy' })
    .customSanitizer(value => (typeof value === 'string' ? value.toUpperCase() : value))
    .isIn(WORK_TYPES)
    .withMessage(`work_type must be one of: ${WORK_TYPES.join(', ')}`)
];

router.get('/advanced', validateAdvancedSearch, advancedSearch);

/**
 * @swagger
 * /search/health:
 *   get:
 *     summary: Search engine health
 *     tags: [Search]
 *     description: >-
 *       Reports the Manticore backend status and table topology. Works and persons
 *       full-text (including the works `venue` filter) is served by Manticore with no
 *       MariaDB fallback; `indexes.venues` names the MariaDB index behind /venues and the
 *       /publications venue filter.
 *     responses:
 *       200:
 *         description: Search engine status and index topology.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SearchHealthStatus'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/health', async (req, res, next) => {
  try {
    const searchEngine = require('../services/searchEngine.service');
    const health = await searchEngine.healthcheck();
    return res.success({
      search_engine: 'Manticore',
      backend: health.backend,
      reachable: health.reachable,
      ...(health.error ? { error: health.error } : {}),
      tables: health.tables || [],
      indexes: {
        works: 'Manticore table works (title, subtitle, abstract, authors, subjects, venue)',
        persons: 'Manticore table persons (preferred_name, given_names, family_name)',
        venues: 'Manticore field venue for the works venue filter; MariaDB ft_venues_search (name + abbreviated_name) for the /publications venue filter'
      },
      endpoints: {
        basic_search: '/search/works',
        advanced_search: '/search/advanced',
        autocomplete: '/search/autocomplete',
        popular_terms: '/search/popular'
      }
    });
  } catch (error) {
    logger.error('Search health check failed', { error: error.message });
    if (typeof res.error === 'function') {
      return res.error(error, { meta: { context: 'searchHealth' } });
    }
    return next(error);
  }
});

const autocompleteService = require('../services/autocomplete.service');

/**
 * @swagger
 * /search/autocomplete:
 *   get:
 *     summary: Get autocomplete suggestions for search queries
 *     tags: [Search]
 *     description: >-
 *       Typeahead suggestions blending work titles, author names, and venue names.
 *       Each kind is searched in its own Manticore field (titles, author names, venue
 *       names) with the last term matched as a prefix (from 3 characters) and earlier
 *       terms as whole words; the most-cited matching works are hydrated from MariaDB.
 *       Author and venue suggestions contain every typed term. Author and venue
 *       `work_count` counts works among the sampled matches (the top `limit` x 5 by
 *       citations), not the total. For a query shorter than 2 characters (or absent)
 *       the endpoint still returns HTTP 200 but with the reduced shape
 *       `data: { suggestions: [], message: "Query too short" }` (no
 *       `query`/`type`/`count`/`generated_at`, and `meta.engine` absent). Requests are
 *       not recorded for /search/popular.
 *     parameters:
 *       - name: q
 *         in: query
 *         required: false
 *         description: Text to complete (at most 200 characters; under 2 returns the short shape).
 *         schema:
 *           type: string
 *           maxLength: 200
 *           example: "kins"
 *       - name: type
 *         in: query
 *         description: Suggestion kinds (400 for any other value).
 *         schema:
 *           type: string
 *           enum: [all, titles, authors, venues]
 *           default: all
 *       - name: limit
 *         in: query
 *         description: Maximum suggestions to return (400 outside 1-20).
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 10
 *     responses:
 *       200:
 *         description: Autocomplete suggestions envelope.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AutocompleteResult'
 *                     meta:
 *                       type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/autocomplete', [
  query('q')
    .optional({ values: 'falsy' })
    .isLength({ max: 200 })
    .withMessage('q must be at most 200 characters'),
  query('type')
    .optional({ values: 'falsy' })
    .isIn(['all', 'titles', 'authors', 'venues'])
    .withMessage('type must be one of: all, titles, authors, venues'),
  query('limit')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 20 })
    .withMessage('limit must be between 1 and 20')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.fail('Validation failed', {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION,
        errors: errors.array()
      });
    }
    const { q, type = 'all', limit = 10 } = req.query;
    const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 20));
    const trimmedQuery = (q || '').trim();

    if (!trimmedQuery || trimmedQuery.length < 2) {
      return res.success({
        suggestions: [],
        message: 'Query too short'
      }, {
        meta: {
          query: trimmedQuery,
          type,
          limit: parsedLimit
        }
      });
    }

    const suggestions = await autocompleteService.getSuggestions(trimmedQuery, type, parsedLimit);

    return res.success(suggestions, {
      meta: {
        query: trimmedQuery,
        type,
        limit: parsedLimit,
        engine: 'Manticore'
      }
    });
  } catch (error) {
    logger.error('Autocomplete failed', { error: error.message });
    if (typeof res.error === 'function') {
      return res.error(error, { meta: { context: 'autocomplete' } });
    }
    return next(error);
  }
});

/**
 * @swagger
 * /search/popular:
 *   get:
 *     summary: Get popular search terms
 *     tags: [Search]
 *     description: >-
 *       Most frequent recent search queries. Every /search/works request with a
 *       non-empty `q` and every /search/global request appends its query (trimmed,
 *       lower-cased, whole string) to the Redis list `search_analytics:YYYY-MM-DD`
 *       (UTC date; newest 5000 entries kept per day, 30-day expiry). The endpoint counts
 *       identical queries over the newest 2000 entries of each of the last 7 days, sorts
 *       by frequency then alphabetically, and caches the top 50 for 600 s. Without Redis
 *       the list is empty.
 *     parameters:
 *       - name: limit
 *         in: query
 *         description: Maximum number of terms to return (values outside 1-50 are clamped).
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *     responses:
 *       200:
 *         description: Popular search terms.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PopularTerms'
 *                     meta:
 *                       type: object
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/popular', async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 50));
    const popularTerms = await autocompleteService.getPopularTerms(limit);

    return res.success({
      popular_terms: popularTerms,
      generated_at: new Date().toISOString()
    }, {
      meta: {
        limit,
        source: 'autocomplete_popular'
      }
    });
  } catch (error) {
    logger.error('Popular terms failed', { error: error.message });
    if (typeof res.error === 'function') {
      return res.error(error, { meta: { context: 'popularSearchTerms' } });
    }
    return next(error);
  }
});

module.exports = router;
