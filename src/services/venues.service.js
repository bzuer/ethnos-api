const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination, normalizePagination } = require('../utils/pagination');
const { formatVenueListItem, formatVenueDetails } = require('../dto/venue.dto');
const { withTimeout } = require('../utils/db');

const toInt = (value, fallback = 0) => {
  if (value === null || value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toNullableInt = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const toNullableFloat = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const toNullableBoolean = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  return Number(value) === 1;
};

const BASE_SORT_FIELDS = {
  id: 'v.id',
  name: 'v.name',
  type: 'v.type',
  works_count: 'COALESCE(v.works_count, 0)',
  cited_by_count: 'COALESCE(v.cited_by_count, 0)',
  impact_factor: 'v.impact_factor',
  h_index: 'v.h_index',
  score: 'v.total_score',
  ranking: 'v.total_score',
  coverage_start_year: 'v.coverage_start_year',
  coverage_end_year: 'v.coverage_end_year',
  oldest: 'v.coverage_start_year',
  newest: 'v.coverage_end_year'
};

const BASE_SELECT = `
  v.id AS id,
  v.name,
  v.abbreviated_name,
  v.type,
  v.aggregation_type,
  v.open_access,
  v.country_code,
  v.lang,
  v.homepage_url,
  v.issn,
  v.eissn,
  v.scopus_id,
  v.wikidata_id,
  v.openalex_id,
  v.scielo_id,
  v.coverage_start_year,
  v.coverage_end_year,
  v.works_count,
  v.cited_by_count,
  v.impact_factor,
  v.citescore,
  v.sjr,
  v.snip,
  v.h_index,
  v.i10_index,
  v.\`2yr_mean_citedness\` AS two_yr_mean_citedness,
  v.is_in_doaj,
  v.is_in_scielo,
  v.is_indexed_in_scopus,
  v.validation_status,
  v.total_score,
  v.subject_score,
  v.oa_score,
  v.impact_score,
  v.llm_score,
  v.llm_relevance,
  v.llm_justification,
  v.last_validated_at,
  v.created_at,
  v.updated_at,
  pub.id AS publisher_org_id,
  pub.name AS publisher_org_name,
  pub.type AS publisher_org_type,
  pub.country_code AS publisher_org_country
`;

const BASE_FROM = `
  FROM venues v
  LEFT JOIN organizations pub ON pub.id = v.publisher_id
`;

const buildScoreBreakdown = (row) => ({
  total: toNullableFloat(row.total_score),
  subject: toNullableFloat(row.subject_score),
  oa: toNullableFloat(row.oa_score),
  impact: toNullableFloat(row.impact_score),
  llm: toNullableFloat(row.llm_score),
  llm_relevance: row.llm_relevance ?? null,
  llm_justification: row.llm_justification ?? null
});

const mapVenueRow = (row) => {
  if (!row) return null;
  return {
    id: toInt(row.id, null),
    name: row.name || null,
    abbreviated_name: row.abbreviated_name || null,
    type: row.type || null,
    aggregation_type: row.aggregation_type || null,
    open_access: toNullableBoolean(row.open_access),
    open_access_status: toNullableBoolean(row.open_access),
    country_code: row.country_code || null,
    language: row.lang || null,
    homepage_url: row.homepage_url || null,
    issn: row.issn || null,
    eissn: row.eissn || null,
    scopus_id: row.scopus_id || null,
    wikidata_id: row.wikidata_id || null,
    openalex_id: row.openalex_id || null,
    scielo_id: row.scielo_id || null,
    coverage_start_year: toNullableInt(row.coverage_start_year),
    coverage_end_year: toNullableInt(row.coverage_end_year),
    works_count: toInt(row.works_count, 0),
    cited_by_count: toInt(row.cited_by_count, 0),
    impact_factor: toNullableFloat(row.impact_factor),
    citescore: toNullableFloat(row.citescore),
    sjr: toNullableFloat(row.sjr),
    snip: toNullableFloat(row.snip),
    h_index: toNullableInt(row.h_index),
    i10_index: toNullableInt(row.i10_index),
    two_yr_mean_citedness: toNullableFloat(row.two_yr_mean_citedness),
    is_in_doaj: toNullableBoolean(row.is_in_doaj),
    is_in_scielo: toNullableBoolean(row.is_in_scielo),
    is_indexed_in_scopus: toNullableBoolean(row.is_indexed_in_scopus),
    validation_status: row.validation_status || null,
    global_ranking_score: toNullableFloat(row.total_score),
    score_breakdown: buildScoreBreakdown(row),
    llm_relevance: row.llm_relevance ?? null,
    llm_justification: row.llm_justification ?? null,
    summary_updated_at: row.updated_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    last_validated_at: row.last_validated_at || null,
    publisher: (row.publisher_org_id || row.publisher_org_name) ? {
      id: row.publisher_org_id ?? null,
      name: row.publisher_org_name || null,
      type: row.publisher_org_type || null,
      country_code: row.publisher_org_country || null
    } : null,
    subjects: [],
    top_publications: []
  };
};

class VenuesService {
  async _loadVenueRows(venueIds = []) {
    const uniqueIds = Array.from(new Set((venueIds || []).filter(Boolean)));
    if (uniqueIds.length === 0) return [];
    const sql = `
      SELECT ${BASE_SELECT}
      ${BASE_FROM}
      WHERE v.id IN (:venueIds)
    `;
    return sequelize.query(withTimeout(sql), {
      replacements: { venueIds: uniqueIds },
      type: sequelize.QueryTypes.SELECT
    });
  }

  async _loadVenuesByIds(venueIds = []) {
    const rows = await this._loadVenueRows(venueIds);
    const map = new Map();
    for (const row of rows) {
      const mapped = mapVenueRow(row);
      if (mapped && mapped.id != null) {
        map.set(mapped.id, mapped);
      }
    }
    return map;
  }

  async _loadTopSubjects(venueIds = [], limit = 10) {
    const map = new Map();
    const uniqueIds = Array.from(new Set((venueIds || []).filter(Boolean)));
    if (uniqueIds.length === 0) return map;
    const rows = await sequelize.query(withTimeout(`
      SELECT
        vs.venue_id,
        s.id AS subject_id,
        s.term,
        s.vocabulary,
        s.lang,
        vs.score
      FROM venue_subjects vs
      INNER JOIN subjects s ON s.id = vs.subject_id
      WHERE vs.venue_id IN (:venueIds)
      ORDER BY vs.venue_id, vs.score DESC, s.term ASC
    `), {
      replacements: { venueIds: uniqueIds },
      type: sequelize.QueryTypes.SELECT
    });
    for (const row of rows) {
      const bucket = map.get(row.venue_id) || [];
      if (bucket.length >= limit) continue;
      bucket.push({
        subject_id: toNullableInt(row.subject_id),
        term: row.term || null,
        score: toNullableFloat(row.score),
        vocabulary: row.vocabulary || null,
        lang: row.lang || null
      });
      map.set(row.venue_id, bucket);
    }
    return map;
  }

  async _loadTopPublications(venueId, limit = 10) {
    if (!venueId) return [];
    const rows = await sequelize.query(withTimeout(`
      SELECT
        p.id AS publication_id,
        p.work_id,
        p.year AS publication_year,
        p.doi,
        p.open_access,
        w.title,
        w.citation_count
      FROM publications p
      INNER JOIN works w ON w.id = p.work_id
      WHERE p.venue_id = :venueId
      ORDER BY COALESCE(w.citation_count, 0) DESC, p.year DESC, p.id DESC
      LIMIT :lim
    `), {
      replacements: { venueId, lim: limit },
      type: sequelize.QueryTypes.SELECT
    });
    return rows.map(row => ({
      publication_id: toNullableInt(row.publication_id),
      work_id: toNullableInt(row.work_id),
      title: row.title || null,
      publication_year: toNullableInt(row.publication_year),
      doi: row.doi || null,
      open_access: toNullableBoolean(row.open_access),
      citation_count: toInt(row.citation_count, 0)
    }));
  }

  async _loadYearlyStats(venueIds = []) {
    const uniqueIds = Array.from(new Set((venueIds || []).filter(Boolean)));
    if (uniqueIds.length === 0) return new Map();

    const sql = `
      SELECT
        p.venue_id,
        p.year,
        COUNT(*) AS works_count,
        SUM(CASE WHEN p.open_access = 1 THEN 1 ELSE 0 END) AS oa_works_count,
        SUM(COALESCE(w.citation_count, 0)) AS cited_by_count
      FROM publications p
      LEFT JOIN works w ON w.id = p.work_id
      WHERE p.venue_id IN (:venueIds) AND p.year IS NOT NULL
      GROUP BY p.venue_id, p.year
      ORDER BY p.venue_id, p.year DESC
    `;

    const rows = await sequelize.query(withTimeout(sql), {
      replacements: { venueIds: uniqueIds },
      type: sequelize.QueryTypes.SELECT
    });

    const map = new Map();
    for (const row of rows) {
      const list = map.get(row.venue_id) || [];
      list.push({
        year: toInt(row.year, null),
        works_count: toInt(row.works_count, 0),
        oa_works_count: toInt(row.oa_works_count, 0),
        cited_by_count: toInt(row.cited_by_count, 0)
      });
      map.set(row.venue_id, list);
    }
    return map;
  }

  async _loadTopAuthors(venueIds = [], limit = 10) {
    const uniqueIds = Array.from(new Set((venueIds || []).filter(Boolean)));
    if (uniqueIds.length === 0) return new Map();

    const sql = `
      SELECT
        p.venue_id,
        a.person_id,
        COUNT(*) AS works_count,
        MIN(a.position) AS best_position,
        MAX(CASE WHEN a.is_corresponding = 1 THEN 1 ELSE 0 END) AS is_corresponding,
        COALESCE(
          pr.preferred_name,
          TRIM(CONCAT(COALESCE(pr.given_names, ''), ' ', COALESCE(pr.family_name, '')))
        ) AS name
      FROM publications p
      INNER JOIN authorships a ON a.work_id = p.work_id
      LEFT JOIN persons pr ON pr.id = a.person_id
      WHERE p.venue_id IN (:venueIds)
      GROUP BY p.venue_id, a.person_id, name
    `;

    const rows = await sequelize.query(withTimeout(sql), {
      replacements: { venueIds: uniqueIds },
      type: sequelize.QueryTypes.SELECT
    });

    const grouped = new Map();
    for (const row of rows) {
      const list = grouped.get(row.venue_id) || [];
      list.push({
        person_id: row.person_id ?? null,
        name: (row.name || '').trim() || null,
        works_count: toInt(row.works_count, 0),
        best_position: toNullableInt(row.best_position),
        is_corresponding: toNullableBoolean(row.is_corresponding)
      });
      grouped.set(row.venue_id, list);
    }

    const map = new Map();
    for (const [venueId, authors] of grouped.entries()) {
      const sorted = authors
        .sort((a, b) => {
          if (b.works_count !== a.works_count) return b.works_count - a.works_count;
          if (a.best_position !== null && b.best_position !== null && a.best_position !== b.best_position) {
            return a.best_position - b.best_position;
          }
          return (a.name || '').localeCompare(b.name || '');
        })
        .slice(0, limit);
      map.set(venueId, sorted);
    }
    return map;
  }

  async _loadRecentWorks(venueId, limit = 10) {
    const sql = `
      SELECT
        w.id,
        w.title,
        w.subtitle,
        w.abstract,
        p.type AS work_type,
        w.language,
        p.year,
        p.volume,
        p.issue,
        p.pages,
        p.doi,
        p.open_access,
        p.peer_reviewed,
        p.publication_date
      FROM publications p
      INNER JOIN works w ON w.id = p.work_id
      WHERE p.venue_id = :venueId
      ORDER BY p.year DESC, p.id DESC
      LIMIT :lim
    `;

    const works = await sequelize.query(withTimeout(sql), {
      replacements: { venueId, lim: limit },
      type: sequelize.QueryTypes.SELECT
    });

    const workIds = works.map((w) => w.id);
    let authorsByWork = {};
    if (workIds.length > 0) {
      const authorRows = await sequelize.query(withTimeout(`
        SELECT
          a.work_id,
          a.person_id,
          a.position,
          a.is_corresponding,
          COALESCE(
            pr.preferred_name,
            TRIM(CONCAT(COALESCE(pr.given_names, ''), ' ', COALESCE(pr.family_name, '')))
          ) AS name
        FROM authorships a
        LEFT JOIN persons pr ON pr.id = a.person_id
        WHERE a.work_id IN (:workIds)
        ORDER BY a.work_id, a.position
      `), {
        replacements: { workIds },
        type: sequelize.QueryTypes.SELECT
      });
      for (const row of authorRows) {
        if (!authorsByWork[row.work_id]) authorsByWork[row.work_id] = [];
        authorsByWork[row.work_id].push({
          person_id: row.person_id ?? null,
          name: (row.name || '').trim() || 'Unknown Author',
          position: toInt(row.position, 0),
          is_corresponding: toNullableBoolean(row.is_corresponding)
        });
      }
    }

    return works.map((w) => {
      const authors = (authorsByWork[w.id] || []).sort((a, b) => a.position - b.position);
      return {
        id: w.id,
        title: w.title,
        subtitle: w.subtitle ?? null,
        abstract: w.abstract ?? null,
        type: w.work_type,
        language: w.language ?? null,
        year: toNullableInt(w.year),
        volume: w.volume ?? null,
        issue: w.issue ?? null,
        pages: w.pages ?? null,
        doi: w.doi ?? null,
        open_access: toNullableBoolean(w.open_access),
        peer_reviewed: toNullableBoolean(w.peer_reviewed),
        publication_date: w.publication_date ?? null,
        author_count: authors.length,
        authors
      };
    });
  }

  async searchVenues(query, options = {}) {
    const pagination = normalizePagination(options);
    const currentPage = Math.max(1, parseInt(pagination.page, 10) || 1);
    const currentLimit = Math.min(Math.max(1, parseInt(pagination.limit, 10) || 20), 100);
    const currentOffset = Math.max(0, parseInt(pagination.offset, 10) || 0);
    const type = options.type;

    const cacheKey = `venues:search:v4:${query}:${JSON.stringify({ currentPage, currentLimit, currentOffset, type })}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      logger.info(`Venues search "${query}" retrieved from cache`);
      return cached;
    }

    const result = await this._searchVenuesMariaDB(query, { page: currentPage, limit: currentLimit, offset: currentOffset, type });

    await cacheService.set(cacheKey, result, 3600);
    return result;
  }

  async _searchVenuesMariaDB(query, { page, limit, offset, type }) {
    const where = ['(v.name LIKE :term OR v.abbreviated_name LIKE :term OR v.issn LIKE :term OR v.eissn LIKE :term OR pub.name LIKE :term)'];
    const replacements = { term: `%${query}%`, lim: limit, off: offset };

    if (type) {
      where.push('v.type = :type');
      replacements.type = type;
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;
    const listSql = `
      SELECT ${BASE_SELECT}
      ${BASE_FROM}
      ${whereClause}
      ORDER BY COALESCE(v.total_score, 0) DESC, v.name ASC
      LIMIT :lim OFFSET :off
    `;
    const countSql = `SELECT COUNT(*) AS total ${BASE_FROM} ${whereClause}`;

    const [rows, countRows] = await Promise.all([
      sequelize.query(withTimeout(listSql), { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(withTimeout(countSql), { replacements, type: sequelize.QueryTypes.SELECT })
    ]);

    const venueIds = rows.map(r => r.id).filter(Boolean);
    const subjectsMap = await this._loadTopSubjects(venueIds, 5);

    const venues = rows
      .map(mapVenueRow)
      .filter(Boolean)
      .map((venue) => {
        venue.subjects = subjectsMap.get(venue.id) || [];
        return formatVenueListItem(venue);
      });

    const total = toInt(countRows?.[0]?.total, 0);
    const meta = { source: 'venues', query };
    if (type) meta.filters = { type };

    return {
      data: venues,
      pagination: createPagination(page, limit, total),
      meta
    };
  }

  async getVenues(options = {}) {
    const pagination = normalizePagination(options);
    const minId = toNullableInt(options.min_id);
    const normalizedOptions = {
      ...options,
      ...pagination,
      min_id: Number.isInteger(minId) && minId > 0 ? minId : undefined
    };

    const cacheKey = `venues:list:v6:${JSON.stringify(normalizedOptions)}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      logger.info('Venues list retrieved from cache');
      return cached;
    }

    const result = await this._getVenuesMariaDB(normalizedOptions);
    await cacheService.set(cacheKey, result, 7200);
    return result;
  }

  async _getVenuesMariaDB(options) {
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(options.limit, 10) || 20), 100);
    const offset = Math.max(0, parseInt(options.offset, 10) || 0);
    const {
      type,
      search,
      sortBy,
      sortOrder,
      min_id,
      coverage_from,
      coverage_to,
      coverage_start_from,
      coverage_start_to,
      coverage_end_from,
      coverage_end_to,
      active_in_year
    } = options;

    const toYear = (value) => {
      if (value === undefined || value === null || value === '') return null;
      const parsed = parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 0) return null;
      return parsed;
    };

    const coverageFrom = toYear(coverage_from);
    const coverageTo = toYear(coverage_to);
    const coverageStartFrom = toYear(coverage_start_from);
    const coverageStartTo = toYear(coverage_start_to);
    const coverageEndFrom = toYear(coverage_end_from);
    const coverageEndTo = toYear(coverage_end_to);
    const activeInYear = toYear(active_in_year);

    const where = [];
    const replacements = { lim: limit, off: offset };

    if (Number.isInteger(min_id) && min_id > 0) {
      where.push('v.id >= :minId');
      replacements.minId = min_id;
    }

    if (type) {
      where.push('v.type = :type');
      replacements.type = type;
    }

    if (search && String(search).trim()) {
      where.push('(v.name LIKE :term OR v.abbreviated_name LIKE :term OR v.issn LIKE :term OR v.eissn LIKE :term OR pub.name LIKE :term)');
      replacements.term = `%${String(search).trim()}%`;
    }

    if (coverageFrom !== null) {
      where.push('v.coverage_start_year >= :coverageFrom');
      replacements.coverageFrom = coverageFrom;
    }
    if (coverageTo !== null) {
      where.push('v.coverage_end_year <= :coverageTo');
      replacements.coverageTo = coverageTo;
    }
    if (coverageStartFrom !== null) {
      where.push('v.coverage_start_year >= :coverageStartFrom');
      replacements.coverageStartFrom = coverageStartFrom;
    }
    if (coverageStartTo !== null) {
      where.push('v.coverage_start_year <= :coverageStartTo');
      replacements.coverageStartTo = coverageStartTo;
    }
    if (coverageEndFrom !== null) {
      where.push('v.coverage_end_year >= :coverageEndFrom');
      replacements.coverageEndFrom = coverageEndFrom;
    }
    if (coverageEndTo !== null) {
      where.push('v.coverage_end_year <= :coverageEndTo');
      replacements.coverageEndTo = coverageEndTo;
    }
    if (activeInYear !== null) {
      where.push('v.coverage_start_year <= :activeInYear AND v.coverage_end_year >= :activeInYear');
      replacements.activeInYear = activeInYear;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const requestedSortBy = typeof sortBy === 'string' && sortBy.trim() ? sortBy.trim().toLowerCase() : null;
    const normalizedSortBy = requestedSortBy && BASE_SORT_FIELDS[requestedSortBy] ? requestedSortBy : 'score';
    const sortField = BASE_SORT_FIELDS[normalizedSortBy];
    const descByDefault = new Set(['score', 'ranking', 'impact_factor', 'citescore', 'sjr', 'snip', 'works_count', 'cited_by_count', 'h_index', 'i10_index', 'coverage_end_year', 'newest']);
    const ascByDefault = new Set(['coverage_start_year', 'oldest']);
    const requestedOrder = typeof sortOrder === 'string' ? sortOrder.trim().toUpperCase() : '';
    const sortOrderFinal = requestedOrder === 'ASC' || requestedOrder === 'DESC'
      ? requestedOrder
      : (ascByDefault.has(normalizedSortBy) ? 'ASC' : (descByDefault.has(normalizedSortBy) ? 'DESC' : 'ASC'));

    const coverageSortKeys = new Set(['coverage_start_year', 'coverage_end_year', 'oldest', 'newest']);
    const sortNullGuard = coverageSortKeys.has(normalizedSortBy)
      ? `${sortField} IS NULL, `
      : '';

    const scoreSortKeys = new Set(['score', 'ranking']);
    const scoreTiebreaker = scoreSortKeys.has(normalizedSortBy)
      ? ''
      : ', COALESCE(v.total_score, 0) DESC';

    const listSql = `
      SELECT ${BASE_SELECT}
      ${BASE_FROM}
      ${whereClause}
      ORDER BY ${sortNullGuard}${sortField} ${sortOrderFinal}${scoreTiebreaker}, v.name ASC
      LIMIT :lim OFFSET :off
    `;
    const countSql = `SELECT COUNT(*) AS total ${BASE_FROM} ${whereClause}`;

    const [rows, countRows] = await Promise.all([
      sequelize.query(withTimeout(listSql), { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(withTimeout(countSql), { replacements, type: sequelize.QueryTypes.SELECT })
    ]);

    const venueIds = rows.map(r => r.id).filter(Boolean);
    const subjectsMap = await this._loadTopSubjects(venueIds, 5);

    const venues = rows
      .map(mapVenueRow)
      .filter(Boolean)
      .map((venue) => {
        venue.subjects = subjectsMap.get(venue.id) || [];
        return formatVenueListItem(venue);
      });

    const total = toInt(countRows?.[0]?.total, 0);
    const meta = {
      source: 'venues',
      sort: {
        by: normalizedSortBy,
        order: sortOrderFinal
      }
    };

    const filters = {};
    if (type) filters.type = type;
    if (search) filters.search = search;
    if (Number.isInteger(min_id) && min_id > 0) filters.min_id = min_id;
    if (Object.keys(filters).length) meta.filters = filters;

    return {
      data: venues,
      pagination: createPagination(page, limit, total),
      meta
    };
  }

  async getVenueById(id, options = {}) {
    const venueId = parseInt(id, 10);
    if (!Number.isInteger(venueId) || venueId <= 0) {
      return null;
    }

    const includeSubjects = options.includeSubjects !== false;
    const includeYearly = options.includeYearly !== false;
    const includeTopAuthors = options.includeTopAuthors !== false;
    const includeRecentWorks = options.includeRecentWorks !== false;

    const cacheKey = `venue:v5:${venueId}:${JSON.stringify({
      includeSubjects,
      includeYearly,
      includeTopAuthors,
      includeRecentWorks
    })}`;

    const cached = await cacheService.get(cacheKey);
    if (cached) {
      logger.info(`Venue ${venueId} retrieved from cache`);
      return cached;
    }

    const venueMap = await this._loadVenuesByIds([venueId]);
    const venue = venueMap.get(venueId);
    if (!venue) return null;

    const [subjectsMap, yearlyMap, topAuthorsMap, recentWorks, topPublications] = await Promise.all([
      includeSubjects ? this._loadTopSubjects([venueId], 10).catch((err) => {
        logger.warn(`Top subjects failed for venue ${venueId}: ${err.message}`);
        return new Map();
      }) : Promise.resolve(new Map()),
      includeYearly ? this._loadYearlyStats([venueId]).catch((err) => {
        logger.warn(`Yearly stats failed for venue ${venueId}: ${err.message}`);
        return new Map();
      }) : Promise.resolve(new Map()),
      includeTopAuthors ? this._loadTopAuthors([venueId]).catch((err) => {
        logger.warn(`Top authors failed for venue ${venueId}: ${err.message}`);
        return new Map();
      }) : Promise.resolve(new Map()),
      includeRecentWorks ? this._loadRecentWorks(venueId).catch((err) => {
        logger.warn(`Recent works failed for venue ${venueId}: ${err.message}`);
        return [];
      }) : Promise.resolve([]),
      this._loadTopPublications(venueId, 10).catch((err) => {
        logger.warn(`Top publications failed for venue ${venueId}: ${err.message}`);
        return [];
      })
    ]);

    venue.subjects = subjectsMap.get(venueId) || [];
    venue.yearly_stats = yearlyMap.get(venueId) || [];
    venue.top_authors = topAuthorsMap.get(venueId) || [];
    venue.top_publications = topPublications;

    const formatted = formatVenueDetails(venue, {
      includeSubjects,
      includeYearlyStats: includeYearly,
      includeTopAuthors,
      recentWorks: includeRecentWorks ? recentWorks : null
    });

    const response = { data: formatted };
    await cacheService.set(cacheKey, response, 7200);
    logger.info(`Retrieved venue ${venueId} with enriched metrics`, {
      includeSubjects,
      includeYearly,
      includeTopAuthors
    });
    return response;
  }

  async getVenueWorks(venueId, options = {}) {
    const pagination = normalizePagination(options);
    const { page, limit, offset } = pagination;
    const { year = null } = options;

    const toNonNegativeInt = (value) => {
      if (value === undefined || value === null || value === '') return null;
      const parsed = parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 0) return null;
      return parsed;
    };

    const citedByMin = toNonNegativeInt(options.cited_by_min ?? options.citation_count_min);
    const citedByMax = toNonNegativeInt(options.cited_by_max ?? options.citation_count_max);
    const yearFrom = toNonNegativeInt(options.year_from);
    const yearTo = toNonNegativeInt(options.year_to);

    const sortKey = (typeof options.sort_by === 'string'
      ? options.sort_by
      : (typeof options.sortBy === 'string' ? options.sortBy : '')).toLowerCase();
    const sortDir = (typeof options.sort_order === 'string'
      ? options.sort_order
      : (typeof options.sortOrder === 'string' ? options.sortOrder : 'DESC')).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let orderClause;
    switch (sortKey) {
      case 'cited_by_count':
      case 'citation_count':
      case 'citations':
        orderClause = `COALESCE(w.citation_count, 0) ${sortDir}, p.year DESC, w.id DESC`;
        break;
      case 'references_count':
      case 'reference_count':
        orderClause = `COALESCE(w.reference_count, 0) ${sortDir}, p.year DESC, w.id DESC`;
        break;
      case 'publication_year':
      case 'year':
        orderClause = `p.year ${sortDir}, w.id DESC`;
        break;
      default:
        orderClause = 'p.year DESC, w.id DESC';
    }

    const cacheKey = `venue:${venueId}:works:v3:${JSON.stringify({ page, limit, offset, year, citedByMin, citedByMax, yearFrom, yearTo, sortKey, sortDir })}`;

    const cached = await cacheService.get(cacheKey);
    if (cached) {
      logger.info(`Venue ${venueId} works retrieved from cache`);
      return cached;
    }

    const where = ['p.venue_id = :venueId'];
    const replacements = { venueId: parseInt(venueId, 10), lim: parseInt(limit, 10), off: parseInt(offset, 10) };
    if (year) {
      where.push('p.year = :year');
      replacements.year = parseInt(year, 10);
    }
    if (yearFrom !== null) {
      where.push('p.year >= :yearFrom');
      replacements.yearFrom = yearFrom;
    }
    if (yearTo !== null) {
      where.push('p.year <= :yearTo');
      replacements.yearTo = yearTo;
    }
    if (citedByMin !== null) {
      where.push('COALESCE(w.citation_count, 0) >= :citedByMin');
      replacements.citedByMin = citedByMin;
    }
    if (citedByMax !== null) {
      where.push('COALESCE(w.citation_count, 0) <= :citedByMax');
      replacements.citedByMax = citedByMax;
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;

    const listSql = `
      SELECT
        w.id,
        w.title,
        w.subtitle,
        w.abstract,
        p.type AS work_type,
        w.language,
        p.year,
        p.volume,
        p.issue,
        p.pages,
        p.doi,
        p.open_access,
        p.peer_reviewed,
        p.publication_date,
        w.citation_count AS work_citation_count,
        w.reference_count AS work_reference_count
      FROM publications p
      INNER JOIN works w ON w.id = p.work_id
      ${whereClause}
      ORDER BY ${orderClause}
      LIMIT :lim OFFSET :off
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM publications p
      INNER JOIN works w ON w.id = p.work_id
      ${whereClause}
    `;

    const [works, countRows] = await Promise.all([
      sequelize.query(withTimeout(listSql), { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(withTimeout(countSql), { replacements, type: sequelize.QueryTypes.SELECT })
    ]);

    const workIds = works.map((w) => w.id);
    let authorsByWork = {};

    if (workIds.length > 0) {
      try {
        const authorRows = await sequelize.query(withTimeout(`
          SELECT
            a.work_id,
            a.person_id,
            a.position,
            a.is_corresponding,
            COALESCE(
              pr.preferred_name,
              TRIM(CONCAT(COALESCE(pr.given_names, ''), ' ', COALESCE(pr.family_name, '')))
            ) AS name
          FROM authorships a
          LEFT JOIN persons pr ON pr.id = a.person_id
          WHERE a.work_id IN (:workIds)
          ORDER BY a.work_id, a.position
          LIMIT 1000
        `), {
          replacements: { workIds },
          type: sequelize.QueryTypes.SELECT
        });

        for (const author of authorRows) {
          if (!authorsByWork[author.work_id]) authorsByWork[author.work_id] = [];
          authorsByWork[author.work_id].push({
            person_id: author.person_id,
            name: (author.name || '').trim() || 'Unknown Author',
            position: toInt(author.position, 0),
            is_corresponding: toNullableBoolean(author.is_corresponding)
          });
        }
      } catch (authorError) {
        logger.error('Error fetching authors:', authorError);
      }
    }

    const data = works.map((w) => {
      const authors = (authorsByWork[w.id] || []).sort((a, b) => a.position - b.position);
      return {
        id: w.id,
        title: w.title,
        subtitle: w.subtitle,
        abstract: w.abstract || null,
        type: w.work_type,
        language: w.language,
        year: toNullableInt(w.year),
        volume: w.volume,
        issue: w.issue,
        pages: w.pages,
        doi: w.doi,
        open_access: toNullableBoolean(w.open_access),
        peer_reviewed: toNullableBoolean(w.peer_reviewed),
        publication_date: w.publication_date,
        cited_by_count: toInt(w.work_citation_count, 0),
        references_count: toInt(w.work_reference_count, 0),
        author_count: authors.length,
        authors
      };
    });

    const total = toInt(countRows?.[0]?.total, 0);
    const result = {
      data,
      pagination: createPagination(page, limit, total)
    };

    await cacheService.set(cacheKey, result, 3600);
    logger.info(`Retrieved ${data.length} works for venue ${venueId}`);
    return result;
  }

  async getVenueStatistics() {
    const cacheKey = 'venues:statistics:v3';
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      logger.info('Venue statistics retrieved from cache');
      return cached;
    }

    const [row] = await sequelize.query(withTimeout(`
      SELECT
        COUNT(*) AS total_venues,
        SUM(CASE WHEN type = 'JOURNAL' THEN 1 ELSE 0 END) AS journals,
        SUM(CASE WHEN type = 'CONFERENCE' THEN 1 ELSE 0 END) AS conferences,
        SUM(CASE WHEN type = 'REPOSITORY' THEN 1 ELSE 0 END) AS repositories,
        SUM(CASE WHEN type = 'BOOK_SERIES' THEN 1 ELSE 0 END) AS book_series,
        SUM(CASE WHEN impact_factor IS NOT NULL THEN 1 ELSE 0 END) AS with_impact_factor,
        AVG(impact_factor) AS avg_impact_factor,
        MAX(impact_factor) AS max_impact_factor,
        MIN(impact_factor) AS min_impact_factor,
        SUM(CASE WHEN is_in_doaj = 1 THEN 1 ELSE 0 END) AS in_doaj,
        SUM(CASE WHEN is_in_scielo = 1 THEN 1 ELSE 0 END) AS in_scielo,
        SUM(CASE WHEN is_indexed_in_scopus = 1 THEN 1 ELSE 0 END) AS in_scopus,
        AVG(total_score) AS avg_ranking_score
      FROM venues
    `), {
      type: sequelize.QueryTypes.SELECT
    });

    const stats = {
      total_venues: toInt(row?.total_venues, 0),
      journals: toInt(row?.journals, 0),
      conferences: toInt(row?.conferences, 0),
      repositories: toInt(row?.repositories, 0),
      book_series: toInt(row?.book_series, 0),
      with_impact_factor: toInt(row?.with_impact_factor, 0),
      avg_impact_factor: toNullableFloat(row?.avg_impact_factor),
      max_impact_factor: toNullableFloat(row?.max_impact_factor),
      min_impact_factor: toNullableFloat(row?.min_impact_factor),
      indexed_in_doaj: toInt(row?.in_doaj, 0),
      indexed_in_scielo: toInt(row?.in_scielo, 0),
      indexed_in_scopus: toInt(row?.in_scopus, 0),
      avg_global_ranking_score: toNullableFloat(row?.avg_ranking_score)
    };

    await cacheService.set(cacheKey, stats, 86400);
    return stats;
  }
}

module.exports = new VenuesService();
