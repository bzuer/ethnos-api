const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const organizationsController = require('../controllers/organizations.controller');

const ORG_TYPES = ['UNIVERSITY', 'INSTITUTE', 'PUBLISHER', 'FUNDER', 'COMPANY', 'OTHER'];
const ORG_STATUSES = ['active', 'inactive', 'withdrawn'];
const LIST_SORTS = ['works_count', 'researchers_count', 'citations', 'cited_by_count', 'h_index', 'i10_index', 'name', 'id', 'created_at', 'updated_at', 'relevance'];
const WORK_SORTS = ['cited_by_count', 'references_count', 'publication_year', 'id'];

const validateOrganizationId = [
  param('id').isInt({ min: 1 }).withMessage('Institution ID must be a positive integer')
];

const validatePagination = [
  query('page').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('Offset must be a non-negative integer')
];

const validateOrganizationsQuery = [
  ...validatePagination,
  query('search').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 255 }).withMessage('Search term must be between 2 and 255 characters'),
  query('q').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 255 }).withMessage('Search term must be between 2 and 255 characters'),
  query('country').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 2 }).withMessage('Country must be a 2-letter ISO code'),
  query('country_code').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 2 }).withMessage('Country code must be a 2-letter ISO code'),
  query('type').optional({ values: 'falsy' }).trim().toUpperCase().isIn(ORG_TYPES).withMessage(`Type must be one of: ${ORG_TYPES.join(', ')}`),
  query('openalex_type').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 30 }),
  query('status').optional({ values: 'falsy' }).trim().toLowerCase().isIn(ORG_STATUSES).withMessage(`Status must be one of: ${ORG_STATUSES.join(', ')}`),
  query('has_ror').optional({ values: 'falsy' }).isBoolean().withMessage('has_ror must be a boolean'),
  query('works_min').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('works_min must be a non-negative integer'),
  query('works_max').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('works_max must be a non-negative integer'),
  query('researchers_min').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('researchers_min must be a non-negative integer'),
  query('cited_by_min').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('cited_by_min must be a non-negative integer'),
  query('cited_by_max').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('cited_by_max must be a non-negative integer'),
  query('h_index_min').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('h_index_min must be a non-negative integer'),
  query('sort_by').optional({ values: 'falsy' }).trim().toLowerCase().isIn(LIST_SORTS).withMessage(`sort_by must be one of: ${LIST_SORTS.join(', ')}`),
  query('sort_order').optional({ values: 'falsy' }).trim().toUpperCase().isIn(['ASC', 'DESC']).withMessage('sort_order must be ASC or DESC')
];

const validateOrganizationWorksQuery = [
  ...validatePagination,
  query('type').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 50 }).withMessage('Work type must be between 2 and 50 characters'),
  query('year_from').optional({ values: 'falsy' }).isInt({ min: 1500 }).withMessage('year_from must be a valid year'),
  query('year_to').optional({ values: 'falsy' }).isInt({ min: 1500 }).withMessage('year_to must be a valid year'),
  query('language').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 10 }).withMessage('Language must be between 2 and 10 characters'),
  query('open_access').optional({ values: 'falsy' }).isBoolean().withMessage('open_access must be a boolean'),
  query('peer_reviewed').optional({ values: 'falsy' }).isBoolean().withMessage('peer_reviewed must be a boolean'),
  query('cited_by_min').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('cited_by_min must be a non-negative integer'),
  query('cited_by_max').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('cited_by_max must be a non-negative integer'),
  query('sort_by').optional({ values: 'falsy' }).trim().toLowerCase().isIn(WORK_SORTS).withMessage(`sort_by must be one of: ${WORK_SORTS.join(', ')}`),
  query('sort_order').optional({ values: 'falsy' }).trim().toUpperCase().isIn(['ASC', 'DESC']).withMessage('sort_order must be ASC or DESC')
];

/**
 * @swagger
 * /institutions:
 *   get:
 *     summary: List academic institutions and organizations
 *     description: >-
 *       Paginated catalogue of organizations (universities, institutes, publishers, funders, companies)
 *       backed by operator-maintained metric columns. Supports full-text + acronym search, faceted
 *       filtering (type, OpenAlex type, country, status, identifier presence, metric bounds) and rich
 *       sorting. Browse is activity-gated on `publication_count > 0`; in the current corpus every
 *       publication-bearing organization is `type=INSTITUTE`, so `type=UNIVERSITY|PUBLISHER|FUNDER|COMPANY|OTHER`
 *       return an empty page here. FUNDER and PUBLISHER organizations exist but carry 0 publications and are
 *       reachable only by direct id (`/institutions/{id}`, and for funders `/institutions/{id}/funded-works`).
 *       `meta.engine` is `MariaDB` on browse and `MariaDB-FULLTEXT` on a search; `meta.sort` echoes the
 *       effective `{by,order}` and `meta.pagination_total_exact` is `true` (count runs under a 2.5s budget).
 *     tags: [Institutions]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: search
 *         schema: { type: string, minLength: 2, maxLength: 255 }
 *         description: Free-text query over institution name (MariaDB FULLTEXT `ft_organizations_name`) and acronyms (exact match against the acronyms JSON array, e.g. `USP`). Min 2, max 255 chars.
 *         example: Universidade de São Paulo
 *       - in: query
 *         name: q
 *         schema: { type: string, minLength: 2, maxLength: 255 }
 *         description: Alias of `search`. Presence switches the response to search mode (adds a top-level `relevance` per row; `meta.engine=MariaDB-FULLTEXT`).
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [UNIVERSITY, INSTITUTE, PUBLISHER, FUNDER, COMPANY, OTHER] }
 *         description: >-
 *           Filter by organization type. Because browse is activity-gated (`publication_count > 0`), only
 *           `INSTITUTE` returns rows here; the other values are documented for completeness but yield an empty page.
 *       - in: query
 *         name: openalex_type
 *         schema: { type: string, minLength: 2, maxLength: 30 }
 *         description: Exact match on the finer OpenAlex institution type (education, healthcare, government, nonprofit, archive, funder, company).
 *         example: education
 *       - in: query
 *         name: country
 *         schema: { type: string, minLength: 2, maxLength: 2 }
 *         description: Filter by ISO 3166-1 alpha-2 country code. Alias of `country_code`.
 *         example: BR
 *       - in: query
 *         name: country_code
 *         schema: { type: string, minLength: 2, maxLength: 2 }
 *         description: Alias of `country`.
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, withdrawn] }
 *         description: Filter by lifecycle status.
 *       - in: query
 *         name: has_ror
 *         schema: { type: boolean }
 *         description: Restrict to organizations carrying a ROR identifier.
 *       - in: query
 *         name: works_min
 *         schema: { type: integer, minimum: 0 }
 *         description: Inclusive lower bound on works_count (publication_count).
 *       - in: query
 *         name: works_max
 *         schema: { type: integer, minimum: 0 }
 *         description: Inclusive upper bound on works_count.
 *       - in: query
 *         name: researchers_min
 *         schema: { type: integer, minimum: 0 }
 *         description: Inclusive lower bound on researchers_count.
 *       - in: query
 *         name: cited_by_min
 *         schema: { type: integer, minimum: 0 }
 *         description: Inclusive lower bound on total_citations. Alias `citation_count_min` is also honored.
 *       - in: query
 *         name: cited_by_max
 *         schema: { type: integer, minimum: 0 }
 *         description: Inclusive upper bound on total_citations. Alias `citation_count_max` is also honored.
 *       - in: query
 *         name: h_index_min
 *         schema: { type: integer, minimum: 0 }
 *         description: Inclusive lower bound on h_index.
 *       - in: query
 *         name: sort_by
 *         schema: { type: string, enum: [works_count, researchers_count, citations, cited_by_count, h_index, i10_index, name, id, created_at, updated_at, relevance], default: works_count }
 *         description: Sort key (`citations` == `cited_by_count`). `relevance` applies only with a search term and is the implicit default when searching. camelCase alias `sortBy` is also honored.
 *       - in: query
 *         name: sort_order
 *         schema: { type: string, enum: [ASC, DESC] }
 *         description: Sort direction (numeric keys default DESC, name/id default ASC). camelCase alias `sortOrder` is also honored.
 *     responses:
 *       200:
 *         description: Paginated list of organizations. Each row is an OrganizationListItem; the top-level `relevance` float appears only on search responses (`q`/`search`).
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
 *                         $ref: '#/components/schemas/OrganizationListItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       429: { $ref: '#/components/responses/RateLimitExceeded' }
 *       500: { $ref: '#/components/responses/InternalError' }
 */
router.get('/', validateOrganizationsQuery, organizationsController.getOrganizations);

/**
 * @swagger
 * /institutions/{id}:
 *   get:
 *     summary: Get an institution by ID
 *     description: >-
 *       Full institution profile: identifiers, names (acronyms + alternative names), operator-maintained
 *       metrics (works, researchers, citations, h-index, i10-index, 2-yr mean citedness),
 *       corpus production summary (by work type + yearly trend), affiliated top authors, recent works,
 *       organizational hierarchy (parents/children/related), and funding role. Resolves any existing
 *       organization regardless of activity (0-publication FUNDER/PUBLISHER orgs resolve by id); an id that
 *       does not exist returns 404. Each include flag, when set `false`, emits its block EMPTY (arrays `[]`,
 *       relationship counts `0`) rather than omitting it.
 *     tags: [Institutions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *         description: Unique identifier of the organization.
 *       - in: query
 *         name: include_production
 *         schema: { type: boolean, default: true }
 *         description: Embed production_summary (by_work_type + publication_trend).
 *       - in: query
 *         name: include_authors
 *         schema: { type: boolean, default: true }
 *         description: Embed top_authors.
 *       - in: query
 *         name: include_works
 *         schema: { type: boolean, default: true }
 *         description: Embed recent_works.
 *       - in: query
 *         name: include_relationships
 *         schema: { type: boolean, default: true }
 *         description: Embed the parents/children/related hierarchy.
 *     responses:
 *       200:
 *         description: Full institution profile.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/OrganizationDetail'
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/RateLimitExceeded' }
 *       500: { $ref: '#/components/responses/InternalError' }
 */
router.get('/:id', validateOrganizationId, organizationsController.getOrganization);

/**
 * @swagger
 * /institutions/{id}/works:
 *   get:
 *     summary: List works affiliated with an institution
 *     description: >-
 *       Works whose authorships carry this organization as an affiliation (`meta.match_mode = "affiliation"`).
 *       Supports work-type, language, publication-year, open-access, peer-review and citation-bound filters
 *       plus the standard work sort contract (cited_by_count, references_count, publication_year, id). Each
 *       row carries a `grant_number` key that is `null` on this affiliation surface (it is populated on
 *       `/institutions/{id}/funded-works`). 404 when the organization id does not exist.
 *     tags: [Institutions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *         description: Unique identifier of the organization.
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *         description: Filter by work type (e.g. ARTICLE, BOOK, CHAPTER, THESIS).
 *       - in: query
 *         name: year_from
 *         schema: { type: integer }
 *         description: Inclusive lower bound on publication year.
 *       - in: query
 *         name: year_to
 *         schema: { type: integer }
 *         description: Inclusive upper bound on publication year.
 *       - in: query
 *         name: language
 *         schema: { type: string }
 *         description: Filter by work language.
 *       - in: query
 *         name: open_access
 *         schema: { type: boolean }
 *         description: Filter by open-access status of the latest publication.
 *       - in: query
 *         name: peer_reviewed
 *         schema: { type: boolean }
 *         description: Filter by peer-review status of the latest publication.
 *       - in: query
 *         name: cited_by_min
 *         schema: { type: integer, minimum: 0 }
 *         description: Inclusive lower bound on the work citation count.
 *       - in: query
 *         name: cited_by_max
 *         schema: { type: integer, minimum: 0 }
 *         description: Inclusive upper bound on the work citation count.
 *       - in: query
 *         name: sort_by
 *         schema: { type: string, enum: [cited_by_count, references_count, publication_year, id], default: publication_year }
 *         description: Sort key. Aliases honored — `citations`/`citation_count` → `cited_by_count`, `reference_count` → `references_count`, `year` → `publication_year`; camelCase `sortBy` also honored.
 *       - in: query
 *         name: sort_order
 *         schema: { type: string, enum: [ASC, DESC] }
 *         description: Sort direction. camelCase alias `sortOrder` also honored.
 *     responses:
 *       200:
 *         description: Paginated affiliated works. `meta.match_mode` is `affiliation`.
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
 *                         $ref: '#/components/schemas/AffiliatedWork'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/RateLimitExceeded' }
 *       500: { $ref: '#/components/responses/InternalError' }
 */
router.get('/:id/works', validateOrganizationId, validateOrganizationWorksQuery, organizationsController.getOrganizationWorks);

/**
 * @swagger
 * /institutions/{id}/funded-works:
 *   get:
 *     summary: List works funded by an institution
 *     description: >-
 *       Works financed by this organization acting as a funder (`funding.funder_id`; `meta.match_mode = "funder"`).
 *       Each row carries the associated `grant_number` when available. This surface is meaningful only for
 *       FUNDER organizations (e.g. id `694519` National Natural Science Foundation of China, `694484` NSF,
 *       `2741433` NIH); those funders carry 0 publications and so are absent from `/institutions` browse —
 *       reach them by direct id. INSTITUTE ids typically return an empty page. Accepts the same filters and
 *       sort contract as `/institutions/{id}/works`. 404 when the organization id does not exist.
 *     tags: [Institutions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *         description: Unique identifier of the funding organization.
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: year_from
 *         schema: { type: integer }
 *       - in: query
 *         name: year_to
 *         schema: { type: integer }
 *       - in: query
 *         name: language
 *         schema: { type: string }
 *       - in: query
 *         name: open_access
 *         schema: { type: boolean }
 *       - in: query
 *         name: peer_reviewed
 *         schema: { type: boolean }
 *       - in: query
 *         name: cited_by_min
 *         schema: { type: integer, minimum: 0 }
 *       - in: query
 *         name: cited_by_max
 *         schema: { type: integer, minimum: 0 }
 *       - in: query
 *         name: sort_by
 *         schema: { type: string, enum: [cited_by_count, references_count, publication_year, id], default: publication_year }
 *         description: Sort key. Aliases honored — `citations`/`citation_count` → `cited_by_count`, `reference_count` → `references_count`, `year` → `publication_year`; camelCase `sortBy` also honored.
 *       - in: query
 *         name: sort_order
 *         schema: { type: string, enum: [ASC, DESC] }
 *         description: Sort direction. camelCase alias `sortOrder` also honored.
 *     responses:
 *       200:
 *         description: Paginated funded works. `meta.match_mode` is `funder`; each row's `grant_number` is populated where recorded.
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
 *                         $ref: '#/components/schemas/AffiliatedWork'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/RateLimitExceeded' }
 *       500: { $ref: '#/components/responses/InternalError' }
 */
router.get('/:id/funded-works', validateOrganizationId, validateOrganizationWorksQuery, organizationsController.getOrganizationFundedWorks);

module.exports = router;
