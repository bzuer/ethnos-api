const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination, normalizePagination } = require('../utils/pagination');
const {
  formatOrganizationListItem,
  formatOrganizationDetails,
  formatAffiliatedWork
} = require('../dto/organization.dto');
const { withTimeout, latestPublicationJoin } = require('../utils/db');
const { hydrateAuthorNamesForWorks } = require('../utils/hydration');
const { authorshipRoleOrderSql, contributorNames } = require('../dto/helpers');

const ORG_TYPES = new Set(['UNIVERSITY', 'INSTITUTE', 'PUBLISHER', 'FUNDER', 'COMPANY', 'OTHER']);
const ORG_STATUSES = new Set(['active', 'inactive', 'withdrawn']);
const TREND_YEARS = 15;

const LIST_SORT_COLUMNS = {
  works_count: 'o.publication_count',
  publication_count: 'o.publication_count',
  researchers_count: 'o.researcher_count',
  researcher_count: 'o.researcher_count',
  citations: 'o.total_citations',
  total_citations: 'o.total_citations',
  cited_by_count: 'o.total_citations',
  h_index: 'o.h_index',
  i10_index: 'o.i10_index',
  name: 'o.name',
  id: 'o.id',
  created_at: 'o.created_at',
  updated_at: 'o.updated_at'
};

const ASCENDING_DEFAULT_SORTS = new Set(['name', 'id']);

function toNonNegativeInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function toBooleanFlag(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const str = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(str)) return true;
  if (['false', '0', 'no', 'off'].includes(str)) return false;
  return fallback;
}

class OrganizationsService {
  resolveListSort(filters = {}) {
    const rawKey = (typeof filters.sort_by === 'string'
      ? filters.sort_by
      : (typeof filters.sortBy === 'string' ? filters.sortBy : '')).trim().toLowerCase();
    const rawOrder = (typeof filters.sort_order === 'string'
      ? filters.sort_order
      : (typeof filters.sortOrder === 'string' ? filters.sortOrder : '')).trim().toUpperCase();

    const hasSearch = Boolean((filters.search || filters.q) && String(filters.search || filters.q).trim());

    if (rawKey === 'relevance' || (!rawKey && hasSearch)) {
      return { by: 'relevance', order: rawOrder === 'ASC' ? 'ASC' : 'DESC', column: null };
    }

    const key = LIST_SORT_COLUMNS[rawKey] ? rawKey : 'works_count';
    const column = LIST_SORT_COLUMNS[key];
    const defaultOrder = ASCENDING_DEFAULT_SORTS.has(key) ? 'ASC' : 'DESC';
    const order = rawOrder === 'ASC' || rawOrder === 'DESC' ? rawOrder : defaultOrder;
    return { by: key, order, column };
  }

  buildListFilters(filters = {}) {
    const where = ['o.publication_count > 0'];
    const replacements = {};

    const type = (filters.type || '').trim().toUpperCase();
    if (type && ORG_TYPES.has(type)) {
      where.push('o.type = :type');
      replacements.type = type;
    }

    const openalexType = (filters.openalex_type || '').trim().toLowerCase();
    if (openalexType) {
      where.push('o.openalex_type = :openalexType');
      replacements.openalexType = openalexType;
    }

    const country = (filters.country || filters.country_code || '').trim().toUpperCase();
    if (country) {
      where.push('o.country_code = :country');
      replacements.country = country;
    }

    const status = (filters.status || '').trim().toLowerCase();
    if (status && ORG_STATUSES.has(status)) {
      where.push('o.status = :status');
      replacements.status = status;
    }

    if (toBooleanFlag(filters.has_ror, false)) {
      where.push('o.ror_id IS NOT NULL');
    }

    const worksMin = toNonNegativeInt(filters.works_min);
    if (worksMin !== null) {
      where.push('o.publication_count >= :worksMin');
      replacements.worksMin = worksMin;
    }
    const worksMax = toNonNegativeInt(filters.works_max);
    if (worksMax !== null) {
      where.push('o.publication_count <= :worksMax');
      replacements.worksMax = worksMax;
    }

    const researchersMin = toNonNegativeInt(filters.researchers_min);
    if (researchersMin !== null) {
      where.push('o.researcher_count >= :researchersMin');
      replacements.researchersMin = researchersMin;
    }

    const citedByMin = toNonNegativeInt(filters.cited_by_min ?? filters.citation_count_min);
    if (citedByMin !== null) {
      where.push('o.total_citations >= :citedByMin');
      replacements.citedByMin = citedByMin;
    }
    const citedByMax = toNonNegativeInt(filters.cited_by_max ?? filters.citation_count_max);
    if (citedByMax !== null) {
      where.push('o.total_citations <= :citedByMax');
      replacements.citedByMax = citedByMax;
    }

    const hIndexMin = toNonNegativeInt(filters.h_index_min);
    if (hIndexMin !== null) {
      where.push('o.h_index >= :hIndexMin');
      replacements.hIndexMin = hIndexMin;
    }

    const term = (filters.search || filters.q || '').trim();
    if (term) {
      replacements.q = term;
      replacements.qupper = term.toUpperCase();
      where.push(`(MATCH(o.name) AGAINST(:q IN NATURAL LANGUAGE MODE)
        OR JSON_CONTAINS(o.acronyms, JSON_QUOTE(:qupper)))`);
    }

    return { where, replacements, term };
  }

  async countWithBudget(sql, replacements) {
    try {
      const rows = await sequelize.query(withTimeout(sql, 2500), {
        replacements,
        type: sequelize.QueryTypes.SELECT
      });
      return { total: parseInt(rows?.[0]?.total || 0, 10), exact: true };
    } catch (error) {
      logger.warn('Organizations count budget exceeded; returning estimate', { error: error.message });
      return { total: null, exact: false };
    }
  }

  async getOrganizations(filters = {}) {
    const t0 = Date.now();
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;

    const cacheKey = `organizations:v6:${JSON.stringify({ ...filters, page, limit, offset })}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Organizations list retrieved from cache');
        return cached;
      }

      const sort = this.resolveListSort(filters);
      const { where, replacements, term } = this.buildListFilters(filters);
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

      let orderClause;
      let relevanceSelect = '';
      if (sort.by === 'relevance' && term) {
        relevanceSelect = `,
            COALESCE(JSON_CONTAINS(o.acronyms, JSON_QUOTE(:qupper)), 0) AS acronym_exact,
            MATCH(o.name) AGAINST(:q IN NATURAL LANGUAGE MODE) AS relevance`;
        orderClause = 'acronym_exact DESC, o.publication_count DESC, relevance DESC, o.id ASC';
      } else {
        const column = sort.column || 'o.publication_count';
        const tieBreak = column === 'o.id' ? '' : ', o.id ASC';
        orderClause = `${column} ${sort.order}${tieBreak}`;
      }

      const listReplacements = { ...replacements, limit: parseInt(limit, 10), offset: parseInt(offset, 10) };

      const [rows, count] = await Promise.all([
        sequelize.query(`
          SELECT
            o.id, o.name, o.type, o.openalex_type, o.status,
            o.country_code, o.city, o.url, o.ror_id, o.grid_id, o.wikidata_id, o.openalex_id,
            o.acronyms,
            o.publication_count, o.researcher_count, o.total_citations,
            o.h_index, o.i10_index, o.\`2yr_mean_citedness\`,
            o.created_at, o.updated_at
            ${relevanceSelect}
          FROM organizations o
          ${whereClause}
          ORDER BY ${orderClause}
          LIMIT :limit OFFSET :offset
        `, {
          replacements: listReplacements,
          type: sequelize.QueryTypes.SELECT
        }),
        this.countWithBudget(`
          SELECT COUNT(*) AS total
          FROM organizations o
          ${whereClause}
        `, replacements)
      ]);

      const data = rows.map(formatOrganizationListItem);

      let total = count.total;
      let totalExact = count.exact;
      if (total === null) {
        total = offset + data.length + (data.length === limit ? limit : 0);
      }

      const result = {
        data,
        pagination: createPagination(page, limit, total),
        performance: {
          engine: term ? 'MariaDB-FULLTEXT' : 'MariaDB',
          query_type: term ? 'search' : 'list',
          elapsed_ms: Date.now() - t0
        },
        meta: {
          source: 'organizations',
          sort: { by: sort.by, order: sort.order },
          pagination_total_exact: totalExact
        }
      };

      await cacheService.set(cacheKey, result, term ? 1800 : 14400);
      logger.info(`Organizations list cached (${term ? 'search' : 'browse'})`);
      return result;
    } catch (error) {
      logger.error('Error fetching organizations:', error);
      throw error;
    }
  }

  async getOrganizationById(id, options = {}) {
    const includeProduction = toBooleanFlag(options.include_production, true);
    const includeAuthors = toBooleanFlag(options.include_authors, true);
    const includeWorks = toBooleanFlag(options.include_works, true);
    const includeRelationships = toBooleanFlag(options.include_relationships, true);

    const cacheKey = `organization:v6:${id}:${[
      includeProduction ? 1 : 0,
      includeAuthors ? 1 : 0,
      includeWorks ? 1 : 0,
      includeRelationships ? 1 : 0
    ].join('')}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Organization ${id} retrieved from cache`);
        return cached;
      }

      const orgRows = await sequelize.query(`
        SELECT
          o.id, o.name, o.type, o.openalex_type, o.status,
          o.country_code, o.city, o.url, o.ror_id, o.grid_id, o.wikidata_id, o.openalex_id,
          o.acronyms, o.alternative_names,
          o.publication_count, o.researcher_count, o.total_citations,
          o.h_index, o.i10_index, o.\`2yr_mean_citedness\`,
          o.created_at, o.updated_at
        FROM organizations o
        WHERE o.id = :id
      `, {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      });

      if (!orgRows || orgRows.length === 0) {
        return null;
      }
      const organization = orgRows[0];

      const enrichment = await Promise.allSettled([
        sequelize.query(withTimeout(`
          SELECT MIN(pub.year) AS first_publication_year, MAX(pub.year) AS latest_publication_year
          FROM authorships a
          JOIN publications pub ON pub.work_id = a.work_id
          WHERE a.affiliation_id = :id AND pub.year IS NOT NULL
        `), { replacements: { id }, type: sequelize.QueryTypes.SELECT }),

        includeProduction ? sequelize.query(withTimeout(`
          SELECT pub.type AS type, COUNT(DISTINCT a.work_id) AS works_count
          FROM authorships a
          JOIN publications pub ON pub.work_id = a.work_id
          WHERE a.affiliation_id = :id
          GROUP BY pub.type
          ORDER BY works_count DESC
        `), { replacements: { id }, type: sequelize.QueryTypes.SELECT }) : Promise.resolve([]),

        includeProduction ? sequelize.query(withTimeout(`
          SELECT pub.year, COUNT(DISTINCT a.work_id) AS works_count
          FROM authorships a
          JOIN publications pub ON pub.work_id = a.work_id
          WHERE a.affiliation_id = :id AND pub.year IS NOT NULL
          GROUP BY pub.year
          ORDER BY pub.year DESC
          LIMIT :years
        `), { replacements: { id, years: TREND_YEARS }, type: sequelize.QueryTypes.SELECT }) : Promise.resolve([]),

        includeAuthors ? sequelize.query(withTimeout(`
          SELECT p.id AS person_id, p.preferred_name,
                 COUNT(DISTINCT a.work_id) AS works_count,
                 MAX(pub.year) AS latest_publication_year
          FROM authorships a
          JOIN persons p ON p.id = a.person_id
          LEFT JOIN publications pub ON pub.work_id = a.work_id
          WHERE a.affiliation_id = :id
          GROUP BY p.id, p.preferred_name
          ORDER BY works_count DESC, p.preferred_name ASC
          LIMIT 10
        `), { replacements: { id }, type: sequelize.QueryTypes.SELECT }) : Promise.resolve([]),

        includeWorks ? sequelize.query(withTimeout(`
          SELECT
            w.id, w.title, w.subtitle, pub.type AS work_type, w.language,
            w.citation_count, w.reference_count,
            pub.id AS publication_id, pub.year, pub.doi, pub.volume, pub.issue, pub.pages,
            pub.open_access, pub.peer_reviewed,
            v.id AS venue_id, v.name AS venue_name, v.abbreviated_name AS venue_abbreviated_name, v.type AS venue_type,
            (SELECT COUNT(DISTINCT a2.person_id) FROM authorships a2 WHERE a2.work_id = w.id) AS author_count
          FROM works w
          JOIN authorships a ON a.work_id = w.id
          ${latestPublicationJoin('pub', 'LEFT')}
          LEFT JOIN venues v ON v.id = pub.venue_id
          WHERE a.affiliation_id = :id
          GROUP BY w.id
          ORDER BY COALESCE(pub.year, 0) DESC, w.id DESC
          LIMIT 10
        `), { replacements: { id }, type: sequelize.QueryTypes.SELECT }) : Promise.resolve([]),

        sequelize.query(withTimeout(`
          SELECT COUNT(*) AS funded_works_count, COUNT(DISTINCT grant_number) AS grants_count
          FROM funding WHERE funder_id = :id
        `), { replacements: { id }, type: sequelize.QueryTypes.SELECT }),

        includeRelationships ? this.getRelationships(id) : Promise.resolve({})
      ]);

      const value = (idx, fallback) => (enrichment[idx].status === 'fulfilled' ? enrichment[idx].value : fallback);
      const corpusRow = value(0, [])[0] || {};
      const productionByType = value(1, []);
      const publicationTrend = value(2, []);
      const topAuthors = value(3, []);
      const recentWorks = value(4, []);
      const fundingRow = value(5, [])[0] || {};
      const relationships = value(6, {});

      if (recentWorks.length) {
        const rwIds = recentWorks.map(w => w.id).filter(Number.isFinite);
        if (rwIds.length) {
          try {
            const ph = rwIds.map(() => '?').join(',');
            const authorRows = await sequelize.query(
              withTimeout(`SELECT a.work_id, a.person_id, a.role, a.position, p.preferred_name
                           FROM authorships a JOIN persons p ON p.id = a.person_id
                           WHERE a.work_id IN (${ph})
                           ORDER BY a.work_id, ${authorshipRoleOrderSql('a')}, a.position, a.person_id`),
              { replacements: rwIds, type: sequelize.QueryTypes.SELECT }
            );
            const contributorsByWork = Object.create(null);
            for (const r of authorRows) {
              (contributorsByWork[r.work_id] = contributorsByWork[r.work_id] || []).push(r);
            }
            const namesByWork = Object.create(null);
            for (const [workId, contributors] of Object.entries(contributorsByWork)) {
              namesByWork[workId] = contributorNames(contributors);
            }
            for (const w of recentWorks) {
              w.author_names = namesByWork[w.id] || [];
            }
          } catch (_) { /* leave authors unhydrated on error */ }
        }
      }

      const shaped = formatOrganizationDetails({
        ...organization,
        corpus: corpusRow,
        funded_works_count: fundingRow.funded_works_count,
        grants_count: fundingRow.grants_count,
        production_summary: { by_work_type: productionByType, publication_trend: publicationTrend },
        top_authors: topAuthors,
        recent_works: recentWorks,
        relationships
      });

      await cacheService.set(cacheKey, shaped, 600);
      logger.info(`Organization ${id} cached for 10 minutes`);
      return shaped;
    } catch (error) {
      logger.error('Error fetching organization by ID:', error);
      throw error;
    }
  }

  async getRelationships(id) {
    const rows = await sequelize.query(withTimeout(`
      SELECT 'children' AS bucket, o.id, o.name, o.type, o.country_code
        FROM organization_relationships r
        JOIN organizations o ON o.id = r.child_id
        WHERE r.parent_id = :id AND r.relationship_type = 'PARENT_CHILD'
      UNION ALL
      SELECT 'parents' AS bucket, o.id, o.name, o.type, o.country_code
        FROM organization_relationships r
        JOIN organizations o ON o.id = r.parent_id
        WHERE r.child_id = :id AND r.relationship_type = 'PARENT_CHILD'
      UNION ALL
      SELECT 'related' AS bucket, o.id, o.name, o.type, o.country_code
        FROM organization_relationships r
        JOIN organizations o ON o.id = r.child_id
        WHERE r.parent_id = :id AND r.relationship_type = 'RELATED'
      UNION ALL
      SELECT 'related' AS bucket, o.id, o.name, o.type, o.country_code
        FROM organization_relationships r
        JOIN organizations o ON o.id = r.parent_id
        WHERE r.child_id = :id AND r.relationship_type = 'RELATED'
      LIMIT 200
    `), { replacements: { id }, type: sequelize.QueryTypes.SELECT });

    const buckets = { parents: [], children: [], related: [] };
    for (const row of rows) {
      if (buckets[row.bucket]) {
        buckets[row.bucket].push(row);
      }
    }
    return buckets;
  }

  buildWorksSort(options = {}) {
    const sortKey = (typeof options.sort_by === 'string'
      ? options.sort_by
      : (typeof options.sortBy === 'string' ? options.sortBy : '')).toLowerCase();
    const sortDir = (typeof options.sort_order === 'string'
      ? options.sort_order
      : (typeof options.sortOrder === 'string' ? options.sortOrder : 'DESC')).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    switch (sortKey) {
      case 'cited_by_count':
      case 'citation_count':
      case 'citations':
        return { clause: `COALESCE(w.citation_count, 0) ${sortDir}, COALESCE(pub.year, 0) DESC, w.id DESC`, by: 'cited_by_count', order: sortDir };
      case 'references_count':
      case 'reference_count':
        return { clause: `COALESCE(w.reference_count, 0) ${sortDir}, COALESCE(pub.year, 0) DESC, w.id DESC`, by: 'references_count', order: sortDir };
      case 'publication_year':
      case 'year':
        return { clause: `COALESCE(pub.year, 0) ${sortDir}, w.id DESC`, by: 'publication_year', order: sortDir };
      case 'id':
        return { clause: `w.id ${sortDir}`, by: 'id', order: sortDir };
      default:
        return { clause: 'COALESCE(pub.year, 0) DESC, w.id DESC', by: 'publication_year', order: 'DESC' };
    }
  }

  buildWorkFilters(options = {}) {
    const where = [];
    const replacements = {};

    const type = (options.type || '').trim();
    if (type) {
      where.push('EXISTS (SELECT 1 FROM publications ptype WHERE ptype.work_id = w.id AND ptype.type = :type)');
      replacements.type = type.toUpperCase();
    }
    const language = (options.language || '').trim();
    if (language) {
      where.push('w.language = :language');
      replacements.language = language;
    }
    const yearFrom = toNonNegativeInt(options.year_from);
    if (yearFrom !== null) {
      where.push('COALESCE(pub.year, 0) >= :yearFrom');
      replacements.yearFrom = yearFrom;
    }
    const yearTo = toNonNegativeInt(options.year_to);
    if (yearTo !== null) {
      where.push('COALESCE(pub.year, 0) <= :yearTo');
      replacements.yearTo = yearTo;
    }
    const citedByMin = toNonNegativeInt(options.cited_by_min ?? options.citation_count_min);
    if (citedByMin !== null) {
      where.push('COALESCE(w.citation_count, 0) >= :citedByMin');
      replacements.citedByMin = citedByMin;
    }
    const citedByMax = toNonNegativeInt(options.cited_by_max ?? options.citation_count_max);
    if (citedByMax !== null) {
      where.push('COALESCE(w.citation_count, 0) <= :citedByMax');
      replacements.citedByMax = citedByMax;
    }
    const openAccess = toBooleanFlag(options.open_access, null);
    if (openAccess !== null) {
      where.push('pub.open_access = :openAccess');
      replacements.openAccess = openAccess ? 1 : 0;
    }
    const peerReviewed = toBooleanFlag(options.peer_reviewed, null);
    if (peerReviewed !== null) {
      where.push('pub.peer_reviewed = :peerReviewed');
      replacements.peerReviewed = peerReviewed ? 1 : 0;
    }

    return { where, replacements };
  }

  async hydrateAuthors(workIds) {
    if (!workIds.length) return {};
    return hydrateAuthorNamesForWorks(workIds);
  }

  async getOrganizationWorks(organizationId, filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;

    const sort = this.buildWorksSort(filters);
    const { where, replacements } = this.buildWorkFilters(filters);

    const cacheKey = `organization:${organizationId}:works:v2:${JSON.stringify({ page, limit, offset, filters })}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Organization ${organizationId} works retrieved from cache`);
        return cached;
      }

      const orgExists = await sequelize.query(`
        SELECT 1 FROM organizations WHERE id = :organizationId LIMIT 1
      `, { replacements: { organizationId }, type: sequelize.QueryTypes.SELECT });
      if (!orgExists || orgExists.length === 0) {
        return null;
      }

      const whereClause = ['a.affiliation_id = :organizationId', ...where].join(' AND ');
      const listReplacements = { ...replacements, organizationId, limit: parseInt(limit, 10), offset: parseInt(offset, 10) };
      const countReplacements = { ...replacements, organizationId };

      const [works, count] = await Promise.all([
        sequelize.query(`
          SELECT
            w.id, w.title, w.subtitle, pub.type AS work_type, w.language,
            w.citation_count, w.reference_count,
            pub.id AS publication_id, pub.year, pub.doi, pub.volume, pub.issue, pub.pages,
            pub.open_access, pub.peer_reviewed,
            v.id AS venue_id, v.name AS venue_name, v.abbreviated_name AS venue_abbreviated_name, v.type AS venue_type,
            (SELECT COUNT(DISTINCT a2.person_id) FROM authorships a2 WHERE a2.work_id = w.id) AS author_count
          FROM works w
          INNER JOIN authorships a ON a.work_id = w.id
          ${latestPublicationJoin('pub', 'LEFT')}
          LEFT JOIN venues v ON v.id = pub.venue_id
          WHERE ${whereClause}
          GROUP BY w.id
          ORDER BY ${sort.clause}
          LIMIT :limit OFFSET :offset
        `, { replacements: listReplacements, type: sequelize.QueryTypes.SELECT }),
        this.countWithBudget(`
          SELECT COUNT(DISTINCT w.id) AS total
          FROM works w
          INNER JOIN authorships a ON a.work_id = w.id
          ${latestPublicationJoin('pub', 'LEFT')}
          WHERE ${whereClause}
        `, countReplacements)
      ]);

      const workIds = Array.from(new Set(works.map(w => w.id).filter(Number.isFinite)));
      const authorsByWork = await this.hydrateAuthors(workIds);

      const data = works.map(work => formatAffiliatedWork({
        ...work,
        author_names: authorsByWork[work.id] || []
      }));

      let total = count.total;
      let totalExact = count.exact;
      if (total === null) {
        total = offset + data.length + (data.length === limit ? limit : 0);
      }

      const result = {
        data,
        pagination: createPagination(page, limit, total),
        performance: { engine: 'MariaDB', query_type: 'organization_works', elapsed_ms: 0 },
        meta: {
          match_mode: 'affiliation',
          sort: { by: sort.by, order: sort.order },
          pagination_total_exact: totalExact
        }
      };

      await cacheService.set(cacheKey, result, 600);
      logger.info(`Organization ${organizationId} works cached for 10 minutes`);
      return result;
    } catch (error) {
      logger.error(`Error fetching works for organization ${organizationId}:`, error);
      throw error;
    }
  }

  async getOrganizationFundedWorks(organizationId, filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;

    const sort = this.buildWorksSort(filters);
    const { where, replacements } = this.buildWorkFilters(filters);

    const cacheKey = `organization:${organizationId}:funded:v1:${JSON.stringify({ page, limit, offset, filters })}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Organization ${organizationId} funded works retrieved from cache`);
        return cached;
      }

      const orgExists = await sequelize.query(`
        SELECT 1 FROM organizations WHERE id = :organizationId LIMIT 1
      `, { replacements: { organizationId }, type: sequelize.QueryTypes.SELECT });
      if (!orgExists || orgExists.length === 0) {
        return null;
      }

      const whereClause = ['f.funder_id = :organizationId', ...where].join(' AND ');
      const listReplacements = { ...replacements, organizationId, limit: parseInt(limit, 10), offset: parseInt(offset, 10) };
      const countReplacements = { ...replacements, organizationId };

      const [works, count] = await Promise.all([
        sequelize.query(`
          SELECT
            w.id, w.title, w.subtitle, pub.type AS work_type, w.language,
            w.citation_count, w.reference_count,
            MAX(f.grant_number) AS grant_number,
            pub.id AS publication_id, pub.year, pub.doi, pub.volume, pub.issue, pub.pages,
            pub.open_access, pub.peer_reviewed,
            v.id AS venue_id, v.name AS venue_name, v.abbreviated_name AS venue_abbreviated_name, v.type AS venue_type,
            (SELECT COUNT(DISTINCT a2.person_id) FROM authorships a2 WHERE a2.work_id = w.id) AS author_count
          FROM funding f
          INNER JOIN works w ON w.id = f.work_id
          ${latestPublicationJoin('pub', 'LEFT')}
          LEFT JOIN venues v ON v.id = pub.venue_id
          WHERE ${whereClause}
          GROUP BY w.id
          ORDER BY ${sort.clause}
          LIMIT :limit OFFSET :offset
        `, { replacements: listReplacements, type: sequelize.QueryTypes.SELECT }),
        this.countWithBudget(`
          SELECT COUNT(DISTINCT w.id) AS total
          FROM funding f
          INNER JOIN works w ON w.id = f.work_id
          ${latestPublicationJoin('pub', 'LEFT')}
          WHERE ${whereClause}
        `, countReplacements)
      ]);

      const workIds = Array.from(new Set(works.map(w => w.id).filter(Number.isFinite)));
      const authorsByWork = await this.hydrateAuthors(workIds);

      const data = works.map(work => formatAffiliatedWork({
        ...work,
        author_names: authorsByWork[work.id] || []
      }));

      let total = count.total;
      let totalExact = count.exact;
      if (total === null) {
        total = offset + data.length + (data.length === limit ? limit : 0);
      }

      const result = {
        data,
        pagination: createPagination(page, limit, total),
        performance: { engine: 'MariaDB', query_type: 'organization_funded_works' },
        meta: {
          match_mode: 'funder',
          sort: { by: sort.by, order: sort.order },
          pagination_total_exact: totalExact
        }
      };

      await cacheService.set(cacheKey, result, 600);
      logger.info(`Organization ${organizationId} funded works cached for 10 minutes`);
      return result;
    } catch (error) {
      logger.error(`Error fetching funded works for organization ${organizationId}:`, error);
      throw error;
    }
  }
}

module.exports = new OrganizationsService();
