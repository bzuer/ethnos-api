const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const personsController = require('../controllers/persons.controller');

const validatePersonId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Person ID must be a positive integer')
];

const validatePersonsQuery = [
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
    .withMessage('Search term must be between 2 and 200 characters'),
  query('q')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('q must be between 2 and 200 characters'),

  query('signature')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Signature must be between 2 and 100 characters'),

  query('verified')
    .optional({ values: 'falsy' })
    .isIn(['true', 'false', '1', '0'])
    .withMessage('verified must be boolean-like (1/0/true/false)'),

  query('autocorrect')
    .optional({ values: 'falsy' })
    .isIn(['1', '0', 'true', 'false'])
    .withMessage('autocorrect must be boolean-like (1/0/true/false)')
];

/**
 * @swagger
 * /persons:
 *   get:
 *     summary: Get list of researchers and authors
 *     description: >-
 *       Paginated list of researchers and authors. Precedence: `search` (alias `q`) runs
 *       the Manticore name search (honours `verified`, ignores `signature`); otherwise
 *       `signature` runs a MariaDB prefix lookup combined with `verified`; otherwise the
 *       plain list, newest first (`id DESC`). There is no `sort_by`/`sort_order` and no
 *       affiliation or country filter. The plain list selects ids under the statement
 *       budget: a count over budget sets `meta.pagination_total_exact=false`, and a page
 *       over budget returns empty `data` with `meta.page_degraded=true` and a `meta.note`.
 *       The search path pages up to the first 100,000 matches (400 beyond). A name search
 *       that matches nothing is revised (a misspelled name part corrected, preferring the
 *       better-known match; failing that, the part that conflicts with the rest dropped) and
 *       described in `meta.query_revision`; `autocorrect=false` keeps the literal query and
 *       only suggests the revision.
 *     tags: [Persons]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 200
 *         description: >-
 *           Name search via Manticore (2-200 characters after trimming; every term
 *           required, unstemmed, query text literal). Sets `meta.engine=Manticore` and
 *           `meta.query_type=search`. Alias: `q`.
 *         example: silva
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 200
 *         description: Alias of `search`, validated the same way (2-200 characters).
 *       - in: query
 *         name: signature
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *         description: >-
 *           Prefix match on the stored normalized signature (`signatures.signature`),
 *           case-insensitive; `%`, `_` and `\` are literal characters. Combines with
 *           `verified`. Sets `meta.query_type=signature_lookup`.
 *         example: SILVA J
 *       - in: query
 *         name: verified
 *         schema:
 *           type: string
 *           enum: ['true', 'false', '1', '0']
 *         description: Filter by verification status (`is_verified`) on every path.
 *         example: 'true'
 *       - $ref: '#/components/parameters/autocorrectParam'
 *     responses:
 *       200:
 *         description: List of persons retrieved successfully
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
 *                         $ref: '#/components/schemas/PersonListItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *                     meta:
 *                       type: object
 *                       description: >-
 *                         `engine` (`MariaDB` for list/signature paths, `Manticore`
 *                         for search), `query_type` (`list|signature_lookup|search`),
 *                         `elapsed_ms` (absent on the Manticore search path),
 *                         `pagination_total_exact` (plain list only; false when the
 *                         count exceeded its 2 s budget and `total` is a lower bound),
 *                         `page_degraded` and `note` (plain list page over budget),
 *                         `query_revision` (search path, see QueryRevision),
 *                         `pagination_extras.offset`.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/', validatePersonsQuery, personsController.getPersons);

/**
 * @swagger
 * /persons/{id}:
 *   get:
 *     summary: Get specific researcher by ID
 *     description: >-
 *       Full researcher profile: stored metrics, identifiers (`wikidata_id`,
 *       `openalex_id` and `url` have no source column and are always null), primary
 *       affiliation, authorship profile, top 10 subjects, top 10 collaborators and up to
 *       10 recent works. `recent_works` has one row per work with the highest-ranked
 *       `role`, every role in `roles[]` and the position within that role, ordered by
 *       publication year (newest first, NULL years last).
 *     tags: [Persons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Unique identifier of the person
 *         example: 3589585
 *     responses:
 *       200:
 *         description: Person details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PersonDetail'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id', validatePersonId, personsController.getPerson);

/**
 * @swagger
 * /persons/{id}/signatures:
 *   get:
 *     summary: Get signatures linked to a person
 *     description: >-
 *       The name signature linked to the person through `persons.signature_id` (0 or 1
 *       row), with `persons_count` = persons sharing that signature. 404 when the person
 *       does not exist.
 *     tags: [Persons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Person ID
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: Signatures retrieved successfully
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
 *                         $ref: '#/components/schemas/PersonSignature'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const validateSignaturesQuery = [
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

/**
 * @swagger
 * /persons/{id}/works:
 *   get:
 *     summary: Get works a person contributed to
 *     description: >-
 *       Every work the person contributed to in any role, one row per work.
 *       `authorship.role` is the highest-ranked role held, `authorship.roles` lists every
 *       role (complete even under a `role` filter) and `authorship.position` is the
 *       position within that role. Displayed publication fields come from the latest
 *       publication. Counts are exact; 404 when the person does not exist.
 *     tags: [Persons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Person ID
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [AUTHOR, EDITOR, TRANSLATOR, REVIEWER]
 *         description: Keep works where the person holds this role (case-insensitive).
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: >-
 *           Inclusive lower bound on the year of the latest publication; works without a
 *           year are excluded.
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1000
 *         description: >-
 *           Inclusive upper bound on the year of the latest publication; works without a
 *           year count as year 0 and are kept.
 *       - in: query
 *         name: cited_by_min
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: >-
 *           Inclusive lower bound on `cited_by_count` (against `works.citation_count`).
 *           Alias: `citation_count_min`.
 *         example: 5
 *       - in: query
 *         name: cited_by_max
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: >-
 *           Inclusive upper bound on `cited_by_count`. Alias: `citation_count_max`.
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [cited_by_count, references_count, publication_year, citation_count, reference_count, year]
 *         description: >-
 *           Primary sort key. `citation_count`/`reference_count`/`year` are accepted
 *           aliases of `cited_by_count`/`references_count`/`publication_year`. With
 *           `sort_by` omitted the order is publication_year DESC. Works without a year
 *           sort last on the year sort in both directions; ties break on work id DESC.
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort direction for `sort_by` (case-insensitive).
 *     responses:
 *       200:
 *         description: Works retrieved successfully
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
 *                         $ref: '#/components/schemas/PersonWork'
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
  
  query('role')
    .optional({ values: 'falsy' })
    .customSanitizer(value => (typeof value === 'string' ? value.toUpperCase() : value))
    .isIn(['AUTHOR', 'EDITOR', 'TRANSLATOR', 'REVIEWER'])
    .withMessage('Role must be one of: AUTHOR, EDITOR, TRANSLATOR, REVIEWER'),

  query('year_from')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000 })
    .withMessage('year_from must be a valid year'),

  query('year_to')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000 })
    .withMessage('year_to must be a valid year'),

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
    .isIn(['cited_by_count', 'citation_count', 'references_count', 'reference_count', 'publication_year', 'year'])
    .withMessage('sort_by must be one of: cited_by_count, references_count, publication_year'),

  query('sort_order')
    .optional({ values: 'falsy' })
    .customSanitizer(value => (typeof value === 'string' ? value.toUpperCase() : value))
    .isIn(['ASC', 'DESC'])
    .withMessage('sort_order must be ASC or DESC')
];

router.get('/:id/works', validatePersonId, validateWorksQuery, personsController.getPersonWorks);

router.get('/:id/signatures', validatePersonId, validateSignaturesQuery, personsController.getPersonSignatures);

module.exports = router;
