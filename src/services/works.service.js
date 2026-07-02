const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination, normalizePagination } = require('../utils/pagination');
const { formatWorkListItem, formatWorkDetails } = require('../dto/work.dto');
const {
  normalizeType,
  toOptionalBoolean,
  toOptionalInteger
} = require('../dto/helpers');
const { formatPublicationEntry } = require('../dto/publication.dto');
const { withTimeout } = require('../utils/db');
const searchEngine = require('./searchEngine.service');

const WORK_LEVEL_FILE_CAP = 50;
const FILE_ROLE_PRIORITY = { MAIN: 0, SUPPLEMENT: 1, COVER: 2, PREVIEW: 3 };
const FILE_VERIFICATION_PRIORITY = { VERIFIED: 0, PENDING: 1, FAILED: 2, CORRUPTED: 3 };

const toNonNegativeInt = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

const toBoolFlag = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return 1;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return 0;
  return null;
};

const sanitizeBooleanTokens = (input) => {
  if (typeof input !== 'string') return [];
  return input
    .replace(/["\\]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(token => `+${token}`);
};

const buildBooleanExpr = (...values) => {
  const tokens = [];
  for (const value of values) {
    if (!value) continue;
    tokens.push(...sanitizeBooleanTokens(value));
  }
  return tokens.length > 0 ? tokens.join(' ') : null;
};

const normalizeDoiValue = (value) => {
  if (!value) return null;
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/doi\.org\//, '')
    .replace(/^doi:/, '')
    .replace(/\/+$/, '');
  return normalized || null;
};

const buildDoiCandidates = (dois = []) => {
  const candidates = new Set();
  for (const doi of dois) {
    if (!doi) continue;
    const raw = String(doi).trim();
    const normalized = normalizeDoiValue(raw);
    if (!normalized) continue;
    candidates.add(raw);
    candidates.add(normalized);
    candidates.add(`https://doi.org/${normalized}`);
    candidates.add(`http://doi.org/${normalized}`);
    candidates.add(`doi:${normalized}`);
    candidates.add(`DOI:${normalized}`);
  }
  return Array.from(candidates);
};

const resolveWorksOrderClause = (sortBy, sortOrder) => {
  const dir = typeof sortOrder === 'string' && sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const key = (typeof sortBy === 'string' ? sortBy : '').toLowerCase();
  switch (key) {
    case 'cited_by_count':
    case 'citation_count':
    case 'citations':
      return { withPub: `w.citation_count ${dir}, MAX(p.year) DESC, w.id DESC`, noPub: `w.citation_count ${dir}, w.id DESC`, needsPub: false };
    case 'references_count':
    case 'reference_count':
      return { withPub: `w.reference_count ${dir}, MAX(p.year) DESC, w.id DESC`, noPub: `w.reference_count ${dir}, w.id DESC`, needsPub: false };
    case 'publication_year':
    case 'year':
      return { withPub: `MAX(p.year) ${dir}, w.id DESC`, noPub: `MAX(p.year) ${dir}, w.id DESC`, needsPub: true };
    case 'id':
    case 'work_id':
      return { withPub: `w.id ${dir}`, noPub: `w.id ${dir}`, needsPub: false };
    default:
      return null;
  }
};

const FILE_SELECT_COLUMNS = `
  f.id,
  f.publication_id,
  f.md5,
  f.file_format AS format,
  f.file_size AS size,
  f.pages,
  f.language,
  f.version,
  f.file_role AS role,
  f.libgen_id,
  f.scimag_id,
  f.openacess_id,
  f.best_oa_url,
  f.verification_status AS verification,
  f.download_count AS downloads
`;

const buildAggregatedFileEntry = (file, publicationId) => {
  if (!file || typeof file !== 'object') return null;
  return {
    file_id: toOptionalInteger(file.id ?? file.file_id),
    publication_id: toOptionalInteger(publicationId),
    md5: file.md5 || null,
    format: normalizeType(file.format || file.file_format),
    size: file.size === null || file.size === undefined ? null : Number(file.size),
    pages: toOptionalInteger(file.pages),
    language: file.language || null,
    version: file.version || null,
    role: normalizeType(file.role || file.file_role) || 'MAIN',
    libgen_id: toOptionalInteger(file.libgen_id),
    scimag_id: toOptionalInteger(file.scimag_id),
    openacess_id: file.openacess_id || null,
    best_oa_url: file.best_oa_url || null,
    verification: normalizeType(file.verification || file.verification_status),
    download_count: toOptionalInteger(file.downloads ?? file.download_count) || 0
  };
};

const sortAggregatedFiles = (files = []) =>
  [...files].sort((a, b) => {
    const ra = FILE_ROLE_PRIORITY[a.role] ?? 99;
    const rb = FILE_ROLE_PRIORITY[b.role] ?? 99;
    if (ra !== rb) return ra - rb;
    const va = FILE_VERIFICATION_PRIORITY[a.verification] ?? 99;
    const vb = FILE_VERIFICATION_PRIORITY[b.verification] ?? 99;
    if (va !== vb) return va - vb;
    return (b.publication_id || 0) - (a.publication_id || 0);
  });

const pickPrimaryPublicationRow = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const scored = rows.map(row => ({
    row,
    year: parseInt(row.publication_year, 10) || 0,
    hasFiles: row.has_files === 1 || row.has_files === true ? 1 : 0,
    publicationId: parseInt(row.publication_id, 10) || 0
  }));
  scored.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    if (b.hasFiles !== a.hasFiles) return b.hasFiles - a.hasFiles;
    return b.publicationId - a.publicationId;
  });
  return scored[0].row;
};

const hydrateAuthorsForWorks = async (workIds, perWorkCap = 50) => {
  const map = new Map();
  if (!Array.isArray(workIds) || workIds.length === 0) return map;
  const placeholders = workIds.map(() => '?').join(',');
  const rows = await sequelize.query(`
    SELECT
      a.work_id,
      a.person_id,
      a.role,
      a.position,
      a.is_corresponding,
      p.preferred_name
    FROM authorships a
    INNER JOIN persons p ON p.id = a.person_id
    WHERE a.work_id IN (${placeholders})
    ORDER BY a.work_id, a.position
  `, {
    replacements: workIds,
    type: sequelize.QueryTypes.SELECT
  });
  for (const row of rows) {
    const bucket = map.get(row.work_id) || [];
    if (bucket.length >= perWorkCap) continue;
    bucket.push({
      person_id: toOptionalInteger(row.person_id),
      name: row.preferred_name,
      preferred_name: row.preferred_name,
      role: normalizeType(row.role) || 'AUTHOR',
      position: toOptionalInteger(row.position),
      is_corresponding: toOptionalBoolean(row.is_corresponding)
    });
    map.set(row.work_id, bucket);
  }
  return map;
};

const hydrateSubjectsForWorks = async (workIds, perWorkCap = 30) => {
  const map = new Map();
  if (!Array.isArray(workIds) || workIds.length === 0) return map;
  const placeholders = workIds.map(() => '?').join(',');
  const rows = await sequelize.query(`
    SELECT
      ws.work_id,
      s.id AS subject_id,
      s.term,
      s.vocabulary,
      s.lang,
      ws.relevance_score,
      ws.assigned_by
    FROM work_subjects ws
    INNER JOIN subjects s ON s.id = ws.subject_id
    WHERE ws.work_id IN (${placeholders})
    ORDER BY ws.work_id, ws.relevance_score DESC, s.term ASC
  `, {
    replacements: workIds,
    type: sequelize.QueryTypes.SELECT
  });
  for (const row of rows) {
    const bucket = map.get(row.work_id) || [];
    if (bucket.length >= perWorkCap) continue;
    bucket.push({
      subject_id: toOptionalInteger(row.subject_id),
      term: row.term,
      vocabulary: row.vocabulary || null,
      lang: row.lang || null,
      relevance_score: row.relevance_score === null || row.relevance_score === undefined ? 1.0 : Number(row.relevance_score),
      assigned_by: normalizeType(row.assigned_by) || 'SYSTEM'
    });
    map.set(row.work_id, bucket);
  }
  return map;
};

const hydrateFilesForPublications = async (publicationIds, cap = 500) => {
  const map = new Map();
  if (!Array.isArray(publicationIds) || publicationIds.length === 0) return map;
  const placeholders = publicationIds.map(() => '?').join(',');
  const rows = await sequelize.query(`
    SELECT
      ${FILE_SELECT_COLUMNS}
    FROM files f
    WHERE f.publication_id IN (${placeholders})
    ORDER BY f.publication_id ASC,
             FIELD(f.file_role,'MAIN','SUPPLEMENT','COVER','PREVIEW'),
             f.id ASC
    LIMIT ${cap}
  `, {
    replacements: publicationIds,
    type: sequelize.QueryTypes.SELECT
  });
  for (const row of rows) {
    const pubId = parseInt(row.publication_id, 10);
    if (!Number.isFinite(pubId)) continue;
    const bucket = map.get(pubId) || [];
    bucket.push(row);
    map.set(pubId, bucket);
  }
  return map;
};

const hydratePublicationCountsByWork = async (workIds) => {
  const counts = new Map();
  if (!Array.isArray(workIds) || workIds.length === 0) return counts;
  const placeholders = workIds.map(() => '?').join(',');
  const rows = await sequelize.query(`
    SELECT work_id, COUNT(*) AS total
    FROM publications
    WHERE work_id IN (${placeholders})
    GROUP BY work_id
  `, {
    replacements: workIds,
    type: sequelize.QueryTypes.SELECT
  });
  for (const row of rows) {
    counts.set(row.work_id, parseInt(row.total, 10) || 0);
  }
  return counts;
};

const buildVenuePayloadFromRow = (row) => {
  if (!row || (!row.venue_id && !row.venue_name)) return null;
  return {
    id: toOptionalInteger(row.venue_id),
    name: row.venue_name || row.venue_abbreviated_name || null,
    abbreviated_name: row.venue_abbreviated_name || null,
    type: normalizeType(row.venue_type),
    issn: row.issn || null,
    eissn: row.eissn || null,
    scopus_id: row.venue_scopus_id || null,
    wikidata_id: row.venue_wikidata_id || null,
    openalex_id: row.venue_openalex_id || null
  };
};

const buildPublisherPayloadFromRow = (row) => {
  if (!row) return null;
  const id = row.publisher_id || row.publisher_v_id;
  const name = row.publisher_name;
  if (!id && !name) return null;
  return {
    id: toOptionalInteger(id),
    name: name || null,
    type: normalizeType(row.publisher_type),
    country: row.publisher_country || row.publisher_country_code || null,
    ror_id: row.publisher_ror_id || null,
    wikidata_id: row.publisher_wikidata_id || null,
    openalex_id: row.publisher_openalex_id || null,
    url: row.publisher_url || null
  };
};

const PUBLICATION_LIST_COLUMNS = `
  p.id AS publication_id,
  p.work_id,
  p.venue_id,
  p.publisher_id,
  p.publication_date,
  p.year AS publication_year,
  p.volume,
  p.issue,
  p.pages,
  p.doi,
  p.open_access,
  p.peer_reviewed,
  p.source,
  p.license_url,
  p.license_version,
  p.scielo_pid,
  p.isbn,
  p.arxiv,
  p.wos_id,
  p.pmid,
  p.pmcid,
  p.handle,
  p.wikidata_id,
  p.openalex_id,
  p.openlibrary_id,
  p.google_book_id,
  w.title,
  w.subtitle,
  w.abstract,
  p.type AS work_type,
  w.language,
  w.citation_count AS work_citation_count,
  w.reference_count AS work_reference_count,
  w.created_at AS work_created_at,
  w.updated_at AS work_updated_at,
  v.id AS venue_v_id,
  v.name AS venue_name,
  v.abbreviated_name AS venue_abbreviated_name,
  v.type AS venue_type,
  v.issn,
  v.eissn,
  v.scopus_id AS venue_scopus_id,
  v.wikidata_id AS venue_wikidata_id,
  v.openalex_id AS venue_openalex_id,
  publisher.id AS publisher_v_id,
  publisher.name AS publisher_name,
  publisher.type AS publisher_type,
  publisher.country_code AS publisher_country,
  publisher.ror_id AS publisher_ror_id,
  publisher.wikidata_id AS publisher_wikidata_id,
  publisher.openalex_id AS publisher_openalex_id,
  publisher.url AS publisher_url
`;

class WorksService {
  async getWorks(filters = {}) {
    const t0 = Date.now();
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { search, type, year_from, year_to, open_access, language, peer_reviewed, venue_name, author, subject } = filters;
    const citedByMin = toNonNegativeInt(filters.cited_by_min ?? filters.citation_count_min);
    const citedByMax = toNonNegativeInt(filters.cited_by_max ?? filters.citation_count_max);
    const sortBy = filters.sort_by ?? filters.sortBy ?? null;
    const sortOrder = filters.sort_order ?? filters.sortOrder ?? null;
    const effectiveLimit = Math.min(limit, 100);
    const cacheKey = `works:list:v6:p${page}:l${effectiveLimit}:s${search || 'all'}:t${type || 'all'}:y${year_from || 'all'}-${year_to || 'all'}:oa${open_access || 'all'}:lang${language || 'all'}:pr${peer_reviewed === undefined ? 'all' : Number(Boolean(peer_reviewed))}:vn${venue_name || 'all'}:au${author || 'all'}:su${subject || 'all'}:cb${citedByMin ?? 'all'}-${citedByMax ?? 'all'}:sb${sortBy || 'default'}:so${sortOrder || 'desc'}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;

      const trimmedSearch = (search || '').trim();
      const hasFulltext = Boolean(trimmedSearch || venue_name || author || subject);

      const enrichedFilters = {
        ...filters,
        cited_by_min: citedByMin,
        cited_by_max: citedByMax,
        sort_by: sortBy,
        sort_order: sortOrder
      };

      const result = hasFulltext
        ? await this._getWorksSearch(trimmedSearch, enrichedFilters, effectiveLimit, offset, page)
        : await this._getWorksVitrine(enrichedFilters, effectiveLimit, offset, page);

      result.performance = { ...(result.performance || {}), elapsed_ms: Date.now() - t0 };
      await cacheService.set(cacheKey, result, 1800);
      return result;
    } catch (error) {
      throw new Error(`Works query failed: ${error.message}`);
    }
  }

  async getWorksVitrine(filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const effectiveLimit = Math.min(limit, 100);
    const enriched = {
      ...filters,
      cited_by_min: toNonNegativeInt(filters.cited_by_min ?? filters.citation_count_min),
      cited_by_max: toNonNegativeInt(filters.cited_by_max ?? filters.citation_count_max)
    };
    const cacheKey = `works:vitrine:v6:p${page}:l${effectiveLimit}:t${filters.type || 'all'}:y${filters.year_from || 'all'}-${filters.year_to || 'all'}:lang${filters.language || 'all'}:cb${enriched.cited_by_min ?? 'all'}-${enriched.cited_by_max ?? 'all'}:sb${filters.sort_by || filters.sortBy || 'default'}:so${filters.sort_order || filters.sortOrder || 'desc'}`;

    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const t0 = Date.now();
    const result = await this._getWorksVitrine(enriched, effectiveLimit, offset, page);
    result.performance = { ...(result.performance || {}), elapsed_ms: Date.now() - t0, query_type: 'showcase_optimized' };
    await cacheService.set(cacheKey, result, 1800);
    return result;
  }

  async _getWorksVitrine(filters, limit, offset, page) {
    const { type, year_from, year_to, language, open_access, peer_reviewed } = filters;
    const citedByMin = toNonNegativeInt(filters.cited_by_min ?? filters.citation_count_min);
    const citedByMax = toNonNegativeInt(filters.cited_by_max ?? filters.citation_count_max);
    const customOrder = resolveWorksOrderClause(filters.sort_by ?? filters.sortBy, filters.sort_order ?? filters.sortOrder);

    const innerWhere = [];
    const innerParams = [];
    const publicationConds = [];
    const publicationParams = [];

    if (language) {
      innerWhere.push('w.language = ?');
      innerParams.push(language);
    }
    if (citedByMin !== null) {
      innerWhere.push('w.citation_count >= ?');
      innerParams.push(citedByMin);
    }
    if (citedByMax !== null) {
      innerWhere.push('w.citation_count <= ?');
      innerParams.push(citedByMax);
    }

    if (type) {
      publicationConds.push('p.type = ?');
      publicationParams.push(type);
    }
    if (year_from !== undefined && year_from !== null && year_from !== '') {
      publicationConds.push('p.year >= ?');
      publicationParams.push(parseInt(year_from, 10));
    }
    if (year_to !== undefined && year_to !== null && year_to !== '') {
      publicationConds.push('p.year <= ?');
      publicationParams.push(parseInt(year_to, 10));
    }
    const oaFlag = toBoolFlag(open_access);
    if (oaFlag !== null) {
      publicationConds.push('p.open_access = ?');
      publicationParams.push(oaFlag);
    }
    const peerFlag = toBoolFlag(peer_reviewed);
    if (peerFlag !== null) {
      publicationConds.push('p.peer_reviewed = ?');
      publicationParams.push(peerFlag);
    }

    const hasPubFilters = publicationConds.length > 0;
    const orderNeedsPub = customOrder ? customOrder.needsPub : false;
    const isDefaultBrowse = innerWhere.length === 0 && !hasPubFilters && !customOrder;
    const innerJoin = hasPubFilters
      ? `INNER JOIN publications p ON p.work_id = w.id AND ${publicationConds.join(' AND ')}`
      : (orderNeedsPub ? 'LEFT JOIN publications p ON p.work_id = w.id' : '');
    const innerJoinParams = hasPubFilters ? publicationParams : [];
    const groupByClause = (hasPubFilters || orderNeedsPub) ? 'GROUP BY w.id' : '';

    const innerWhereClause = innerWhere.length ? `WHERE ${innerWhere.join(' AND ')}` : '';
    const dbTimeoutMs = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '8000', 10);
    const COUNT_BUDGET_MS = 2000;
    const ESTIMATED_WORKS_TOTAL = 6187180;

    let totalItems;
    let totalIsExact = true;
    if (innerWhere.length === 0 && !hasPubFilters) {
      totalItems = ESTIMATED_WORKS_TOTAL;
      totalIsExact = false;
    } else {
      try {
        const countSql = hasPubFilters
          ? `SELECT COUNT(DISTINCT w.id) AS total FROM works w ${innerJoin} ${innerWhereClause}`
          : `SELECT COUNT(*) AS total FROM works w ${innerWhereClause}`;
        const [countRow] = await sequelize.query(withTimeout(countSql, COUNT_BUDGET_MS), {
          replacements: [...innerJoinParams, ...innerParams],
          type: sequelize.QueryTypes.SELECT
        });
        totalItems = parseInt(countRow?.total, 10) || 0;
      } catch (countError) {
        logger.warn('Works vitrine count query exceeded budget; using estimate', { error: countError.message });
        totalItems = ESTIMATED_WORKS_TOTAL;
        totalIsExact = false;
      }
    }

    const innerOrderClause = customOrder
      ? ((hasPubFilters || orderNeedsPub) ? customOrder.withPub : customOrder.noPub)
      : 'w.id DESC';
    const innerSql = isDefaultBrowse
      ? 'SELECT DISTINCT work_id FROM publications ORDER BY work_id DESC LIMIT ? OFFSET ?'
      : `
      SELECT w.id AS work_id
      FROM works w
      ${innerJoin}
      ${innerWhereClause}
      ${groupByClause}
      ORDER BY ${innerOrderClause}
      LIMIT ? OFFSET ?
    `;
    const innerReplacements = isDefaultBrowse
      ? [limit, offset]
      : [...innerJoinParams, ...innerParams, limit, offset];

    const primaryStart = process.hrtime.bigint();
    const innerRows = await sequelize.query(withTimeout(innerSql, dbTimeoutMs), {
      replacements: innerReplacements,
      type: sequelize.QueryTypes.SELECT
    });
    const innerQueryMs = Number(((process.hrtime.bigint() - primaryStart) / BigInt(1e6)).toString());

    const workIds = innerRows.map(r => r.work_id).filter(Boolean);
    if (workIds.length === 0) {
      return {
        data: [],
        pagination: createPagination(page, limit, totalItems),
        meta: {
          match_mode: 'any_publication',
          pagination_total_exact: totalIsExact,
          performance: { engine: 'MariaDB', query_type: 'showcase_optimized', primary_query_ms: innerQueryMs }
        },
        performance: { engine: 'MariaDB', query_type: 'showcase_optimized', match_mode: 'any_publication', primary_query_ms: innerQueryMs }
      };
    }

    const detailPlaceholders = workIds.map(() => '?').join(',');
    const detailSql = `
      SELECT
        w.id AS id,
        ${PUBLICATION_LIST_COLUMNS}
      FROM works w
      INNER JOIN publications p ON p.id = (
        SELECT MAX(p2.id) FROM publications p2 WHERE p2.work_id = w.id
      )
      LEFT JOIN venues v ON v.id = p.venue_id
      LEFT JOIN organizations publisher ON publisher.id = p.publisher_id
      WHERE w.id IN (${detailPlaceholders})
    `;
    const rawRows = await sequelize.query(detailSql, {
      replacements: workIds,
      type: sequelize.QueryTypes.SELECT
    });
    const byId = new Map(rawRows.map(r => [r.id, r]));
    const rows = workIds.map(id => byId.get(id)).filter(Boolean);
    const primaryQueryMs = Number(((process.hrtime.bigint() - primaryStart) / BigInt(1e6)).toString());

    const [authorsMap, publicationCounts] = await Promise.all([
      hydrateAuthorsForWorks(workIds, 5),
      hydratePublicationCountsByWork(workIds)
    ]);

    const data = rows.map(row => {
      const authors = authorsMap.get(row.id) || [];
      const authorsPreview = authors.map(a => a.preferred_name).filter(Boolean).slice(0, 3);
      const first = authors[0];
      return formatWorkListItem({
        id: row.id,
        publication_id: row.publication_id || null,
        publications_count: publicationCounts.get(row.id) || 1,
        title: row.title,
        subtitle: row.subtitle,
        abstract: row.abstract,
        work_type: row.work_type,
        language: row.language,
        publication_year: row.publication_year,
        doi: row.doi,
        open_access: row.open_access,
        peer_reviewed: row.peer_reviewed,
        venue: buildVenuePayloadFromRow(row),
        authors_preview: authorsPreview,
        author_count: authors.length,
        first_author: first ? first.preferred_name : null,
        first_author_id: first ? first.person_id : null,
        first_author_identifiers: null,
        cited_by_count: row.work_citation_count,
        references_count: row.work_reference_count,
        added_to_database: row.work_created_at,
        data_source: 'full_api',
        search_engine: 'MariaDB'
      });
    });

    return {
      data,
      pagination: createPagination(page, limit, totalItems),
      meta: {
        match_mode: 'any_publication',
        pagination_total_exact: totalIsExact,
        performance: {
          engine: 'MariaDB',
          query_type: 'showcase_optimized',
          primary_query_ms: primaryQueryMs,
          total_rows_examined: rows.length
        }
      },
      performance: {
        engine: 'MariaDB',
        query_type: 'showcase_optimized',
        match_mode: 'any_publication',
        primary_query_ms: primaryQueryMs
      }
    };
  }

  async _getWorksSearch(search, filters, limit, offset, page) {
    const { type, language, year_from, year_to, open_access, peer_reviewed, venue_name, author, subject } = filters || {};
    const citedByMin = toNonNegativeInt(filters?.cited_by_min ?? filters?.citation_count_min);
    const citedByMax = toNonNegativeInt(filters?.cited_by_max ?? filters?.citation_count_max);
    const customOrder = resolveWorksOrderClause(filters?.sort_by ?? filters?.sortBy, filters?.sort_order ?? filters?.sortOrder);
    const trimmed = (search || '').trim();
    const hasContent = Boolean(trimmed);
    const metadataExpr = buildBooleanExpr(author, subject);
    const venueExpr = buildBooleanExpr(venue_name);
    const hasMetadata = Boolean(metadataExpr);
    const hasVenue = Boolean(venueExpr);

    if (!hasContent && !hasMetadata && !hasVenue) {
      return { data: [], pagination: createPagination(page, limit, 0) };
    }

    if (searchEngine.isEnabled()) {
      const manticoreStart = process.hrtime.bigint();
      const mres = await searchEngine.searchWorkIds({
        q: trimmed,
        author,
        subject,
        venue_name,
        type,
        language,
        year_from,
        year_to,
        open_access,
        peer_reviewed,
        cited_by_min: citedByMin,
        cited_by_max: citedByMax,
        sort_by: filters?.sort_by ?? filters?.sortBy,
        sort_order: filters?.sort_order ?? filters?.sortOrder
      }, limit, offset);
      return this._hydrateWorkSearchResults(mres.ids, page, limit, mres.total, mres.exact, 'Manticore', manticoreStart);
    }

    const innerWhere = [];
    const innerParams = [];
    const publicationConds = [];
    const publicationParams = [];

    if (hasContent) {
      innerWhere.push('MATCH(w.full_title_normalized, w.subjects_search) AGAINST (? IN BOOLEAN MODE)');
      innerParams.push(trimmed);
    }
    if (hasMetadata) {
      innerWhere.push('MATCH(w.authors_search, w.subjects_search) AGAINST (? IN BOOLEAN MODE)');
      innerParams.push(metadataExpr);
    }
    if (hasVenue) {
      innerWhere.push(`EXISTS (
        SELECT 1 FROM publications p
        INNER JOIN venues v ON v.id = p.venue_id
        WHERE p.work_id = w.id
          AND MATCH(v.name, v.abbreviated_name) AGAINST (? IN BOOLEAN MODE)
      )`);
      innerParams.push(venueExpr);
    }
    if (language) {
      innerWhere.push('w.language = ?');
      innerParams.push(language);
    }
    if (citedByMin !== null) {
      innerWhere.push('w.citation_count >= ?');
      innerParams.push(citedByMin);
    }
    if (citedByMax !== null) {
      innerWhere.push('w.citation_count <= ?');
      innerParams.push(citedByMax);
    }

    if (type) {
      publicationConds.push('p.type = ?');
      publicationParams.push(type);
    }
    if (year_from !== undefined && year_from !== null && year_from !== '') {
      publicationConds.push('p.year >= ?');
      publicationParams.push(parseInt(year_from, 10));
    }
    if (year_to !== undefined && year_to !== null && year_to !== '') {
      publicationConds.push('p.year <= ?');
      publicationParams.push(parseInt(year_to, 10));
    }
    const oaFlag = toBoolFlag(open_access);
    if (oaFlag !== null) {
      publicationConds.push('p.open_access = ?');
      publicationParams.push(oaFlag);
    }
    const peerFlag = toBoolFlag(peer_reviewed);
    if (peerFlag !== null) {
      publicationConds.push('p.peer_reviewed = ?');
      publicationParams.push(peerFlag);
    }
    const hasPubFilters = publicationConds.length > 0;
    const orderNeedsPub = customOrder ? customOrder.needsPub : false;
    const innerJoin = hasPubFilters
      ? `INNER JOIN publications p ON p.work_id = w.id AND ${publicationConds.join(' AND ')}`
      : (orderNeedsPub ? 'LEFT JOIN publications p ON p.work_id = w.id' : '');
    const innerJoinParams = hasPubFilters ? publicationParams : [];
    const groupByClause = (hasPubFilters || orderNeedsPub) ? 'GROUP BY w.id' : '';

    const relevanceExpr = hasContent
      ? 'MATCH(w.full_title_normalized, w.subjects_search) AGAINST (? IN BOOLEAN MODE)'
      : (hasMetadata
        ? 'MATCH(w.authors_search, w.subjects_search) AGAINST (? IN BOOLEAN MODE)'
        : '0');
    const relevanceParams = hasContent
      ? [trimmed]
      : (hasMetadata ? [metadataExpr] : []);

    const innerWhereClause = `WHERE ${innerWhere.join(' AND ')}`;
    const innerOrderClause = customOrder
      ? ((hasPubFilters || orderNeedsPub) ? customOrder.withPub : customOrder.noPub)
      : (hasContent || hasMetadata
        ? 'relevance DESC, w.citation_count DESC, w.id DESC'
        : 'w.citation_count DESC, w.id DESC');

    const innerSql = `
      SELECT
        w.id AS work_id,
        (${relevanceExpr}) AS relevance
      FROM works w
      ${innerJoin}
      ${innerWhereClause}
      ${groupByClause}
      ORDER BY ${innerOrderClause}
      LIMIT ? OFFSET ?
    `;

    const dbTimeoutMs = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '6000', 10);
    const primaryStart = process.hrtime.bigint();
    const innerRows = await sequelize.query(withTimeout(innerSql, dbTimeoutMs), {
      replacements: [...relevanceParams, ...innerJoinParams, ...innerParams, limit, offset],
      type: sequelize.QueryTypes.SELECT
    });
    const innerQueryMs = Number(((process.hrtime.bigint() - primaryStart) / BigInt(1e6)).toString());

    let totalItems;
    let totalIsExact = true;
    try {
      const countSql = hasPubFilters
        ? `SELECT COUNT(DISTINCT w.id) AS total FROM works w ${innerJoin} ${innerWhereClause}`
        : `SELECT COUNT(*) AS total FROM works w ${innerWhereClause}`;
      const [countRow] = await sequelize.query(withTimeout(countSql, 2000), {
        replacements: [...innerJoinParams, ...innerParams],
        type: sequelize.QueryTypes.SELECT
      });
      totalItems = parseInt(countRow?.total, 10) || 0;
    } catch (countError) {
      logger.warn('Works search count exceeded budget; lower-bound estimate used', { error: countError.message });
      totalItems = offset + innerRows.length + (innerRows.length === limit ? limit : 0);
      totalIsExact = false;
    }

    const workIds = innerRows.map(r => r.work_id).filter(Boolean);
    return this._hydrateWorkSearchResults(workIds, page, limit, totalItems, totalIsExact, 'MariaDB', primaryStart);
  }

  async _hydrateWorkSearchResults(workIds, page, limit, totalItems, totalIsExact, engine, primaryStart) {
    if (!workIds || workIds.length === 0) {
      return {
        data: [],
        pagination: createPagination(page, limit, totalItems),
        meta: { match_mode: 'any_publication', pagination_total_exact: totalIsExact },
        performance: { engine, query_type: 'search', match_mode: 'any_publication', primary_query_ms: Number(((process.hrtime.bigint() - primaryStart) / BigInt(1e6)).toString()) }
      };
    }

    const detailPlaceholders = workIds.map(() => '?').join(',');
    const detailSql = `
      SELECT
        w.id AS id,
        ${PUBLICATION_LIST_COLUMNS}
      FROM works w
      INNER JOIN publications p ON p.id = (
        SELECT MAX(p2.id) FROM publications p2 WHERE p2.work_id = w.id
      )
      LEFT JOIN venues v ON v.id = p.venue_id
      LEFT JOIN organizations publisher ON publisher.id = p.publisher_id
      WHERE w.id IN (${detailPlaceholders})
    `;
    const rawRows = await sequelize.query(detailSql, {
      replacements: workIds,
      type: sequelize.QueryTypes.SELECT
    });
    const byId = new Map(rawRows.map(r => [r.id, r]));
    const rows = workIds.map(id => byId.get(id)).filter(Boolean);
    const primaryQueryMs = Number(((process.hrtime.bigint() - primaryStart) / BigInt(1e6)).toString());

    const [authorsMap, publicationCounts] = await Promise.all([
      hydrateAuthorsForWorks(workIds, 5),
      hydratePublicationCountsByWork(workIds)
    ]);

    const data = rows.map(row => {
      const authors = authorsMap.get(row.id) || [];
      const authorsPreview = authors.map(a => a.preferred_name).filter(Boolean).slice(0, 3);
      const first = authors[0];
      return formatWorkListItem({
        id: row.id,
        publication_id: row.publication_id || null,
        publications_count: publicationCounts.get(row.id) || 1,
        title: row.title,
        subtitle: row.subtitle,
        abstract: row.abstract,
        work_type: row.work_type,
        language: row.language,
        publication_year: row.publication_year,
        doi: row.doi,
        open_access: row.open_access,
        peer_reviewed: row.peer_reviewed,
        venue: buildVenuePayloadFromRow(row),
        authors_preview: authorsPreview,
        author_count: authors.length,
        first_author: first ? first.preferred_name : null,
        first_author_id: first ? first.person_id : null,
        first_author_identifiers: null,
        cited_by_count: row.work_citation_count,
        references_count: row.work_reference_count,
        added_to_database: row.work_created_at,
        data_source: 'search',
        search_engine: engine
      });
    });

    return {
      data,
      pagination: createPagination(page, limit, totalItems),
      meta: {
        match_mode: 'any_publication',
        pagination_total_exact: totalIsExact,
        performance: {
          engine,
          query_type: 'search',
          primary_query_ms: primaryQueryMs
        }
      },
      performance: {
        engine,
        query_type: 'search',
        match_mode: 'any_publication',
        primary_query_ms: primaryQueryMs
      }
    };
  }

  async getWorkById(id, options = {}) {
    const includeCitations = options.includeCitations !== false;
    const includeReferences = options.includeReferences !== false;
    const cacheKey = `work:v5:${id}:c${includeCitations ? 1 : 0}:r${includeReferences ? 1 : 0}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;

      const work = await this._getCompleteWorkData(id, { includeCitations, includeReferences });
      if (!work) return null;

      await cacheService.set(cacheKey, work, 7200);
      return work;
    } catch (error) {
      logger.error(`Error fetching complete work ${id}:`, error.message);
      throw error;
    }
  }

  async _getCompleteWorkData(id, options = {}) {
    const includeCitations = options.includeCitations !== false;
    const includeReferences = options.includeReferences !== false;
    const startTime = process.hrtime.bigint();

    const [workData] = await sequelize.query(`
      SELECT
        w.id,
        w.title,
        w.subtitle,
        w.language,
        w.abstract,
        w.reference_count,
        w.citation_count,
        w.altmetric_score,
        w.download_count,
        w.view_count,
        w.social_media_mentions,
        w.news_mentions,
        w.created_at,
        w.updated_at,
        w.metrics_last_updated
      FROM works w
      WHERE w.id = ?
      LIMIT 1
    `, { replacements: [id], type: sequelize.QueryTypes.SELECT });

    if (!workData) return null;

    const [
      authorsData,
      subjectsData,
      fundingData,
      publicationRows
    ] = await Promise.all([
      sequelize.query(`
        SELECT
          a.person_id,
          a.role,
          a.position,
          a.is_corresponding,
          p.preferred_name,
          p.given_names,
          p.family_name,
          p.orcid,
          p.scopus_id,
          p.lattes_id,
          o.id AS affiliation_id,
          o.name AS affiliation_name,
          o.type AS affiliation_type,
          o.country_code AS affiliation_country
        FROM authorships a
        LEFT JOIN persons p ON p.id = a.person_id
        LEFT JOIN organizations o ON o.id = a.affiliation_id
        WHERE a.work_id = ?
        ORDER BY a.position ASC
      `, { replacements: [id], type: sequelize.QueryTypes.SELECT }),

      sequelize.query(`
        SELECT
          s.id AS subject_id,
          s.term,
          s.vocabulary,
          s.lang,
          ws.relevance_score,
          ws.assigned_by
        FROM work_subjects ws
        INNER JOIN subjects s ON s.id = ws.subject_id
        WHERE ws.work_id = ?
        ORDER BY ws.relevance_score DESC, s.vocabulary, s.term
      `, { replacements: [id], type: sequelize.QueryTypes.SELECT }),

      sequelize.query(`
        SELECT
          f.funder_id,
          o.name AS funder_name,
          f.grant_number
        FROM funding f
        INNER JOIN organizations o ON o.id = f.funder_id
        WHERE f.work_id = ?
        ORDER BY o.name ASC, f.grant_number ASC
      `, { replacements: [id], type: sequelize.QueryTypes.SELECT }),

      sequelize.query(`
        SELECT
          ${PUBLICATION_LIST_COLUMNS}
        FROM publications p
        INNER JOIN works w ON w.id = p.work_id
        LEFT JOIN venues v ON v.id = p.venue_id
        LEFT JOIN organizations publisher ON publisher.id = p.publisher_id
        WHERE p.work_id = ?
        ORDER BY p.year DESC, p.id DESC
        LIMIT 51
      `, { replacements: [id], type: sequelize.QueryTypes.SELECT })
    ]);

    const publicationsHasMore = publicationRows.length > 50;
    const cappedPublicationRows = publicationsHasMore
      ? publicationRows.slice(0, 50)
      : publicationRows;

    let publicationsTotal = cappedPublicationRows.length;
    if (publicationsHasMore) {
      const [countRow] = await sequelize.query(
        `SELECT COUNT(*) AS total FROM publications WHERE work_id = ?`,
        { replacements: [id], type: sequelize.QueryTypes.SELECT }
      );
      publicationsTotal = parseInt(countRow?.total, 10) || cappedPublicationRows.length;
    }

    const pubIdsForFiles = cappedPublicationRows
      .map(row => parseInt(row.publication_id, 10))
      .filter(Number.isFinite);
    let liveFilesByPub = new Map();
    try {
      liveFilesByPub = await hydrateFilesForPublications(pubIdsForFiles, 500);
    } catch (filesError) {
      logger.warn('Live files JOIN for work failed; continuing without files', {
        work_id: id,
        error: filesError.message
      });
    }

    for (const row of cappedPublicationRows) {
      const pubId = parseInt(row.publication_id, 10);
      const liveFiles = liveFilesByPub.get(pubId) || [];
      row.files_json = liveFiles;
      row.has_files = liveFiles.length > 0 ? 1 : 0;
      row.has_scimag_file = liveFiles.some(f => f.scimag_id !== null && f.scimag_id !== undefined) ? 1 : 0;
      row.has_libgen_file = liveFiles.some(f => f.libgen_id !== null && f.libgen_id !== undefined) ? 1 : 0;
    }

    const primaryRow = pickPrimaryPublicationRow(cappedPublicationRows);
    const primaryPublicationId = primaryRow ? parseInt(primaryRow.publication_id, 10) || null : null;

    const publicationEntries = cappedPublicationRows.map(row => {
      const entry = formatPublicationEntry(row);
      entry.is_primary = primaryPublicationId !== null && entry.id === primaryPublicationId;
      return entry;
    });

    const aggregatedFiles = [];
    let totalFilesAcrossPublications = 0;
    let totalDownloadCount = 0;
    let publicationsWithFilesCount = 0;
    let publicationsOpenAccessCount = 0;
    let publicationsPeerReviewedCount = 0;
    let bestOaUrl = null;
    const formatBreakdown = Object.create(null);
    const roleBreakdown = Object.create(null);
    const venueAgg = new Map();
    const yearsSet = new Set();

    for (const row of cappedPublicationRows) {
      if (row.open_access === 1) publicationsOpenAccessCount += 1;
      if (row.peer_reviewed === 1) publicationsPeerReviewedCount += 1;
      if (row.publication_year && row.publication_year > 0) yearsSet.add(row.publication_year);

      if (row.venue_id) {
        const key = row.venue_id;
        const existing = venueAgg.get(key);
        if (existing) {
          existing.publication_count += 1;
          if (row.publication_year && row.publication_year > existing.latest_year) {
            existing.latest_year = row.publication_year;
          }
        } else {
          venueAgg.set(key, {
            id: parseInt(row.venue_id, 10) || null,
            name: row.venue_name || row.venue_abbreviated_name || null,
            abbreviated_name: row.venue_abbreviated_name || null,
            type: normalizeType(row.venue_type),
            issn: row.issn || null,
            eissn: row.eissn || null,
            scopus_id: row.venue_scopus_id || null,
            wikidata_id: row.venue_wikidata_id || null,
            openalex_id: row.venue_openalex_id || null,
            publication_count: 1,
            latest_year: row.publication_year || null
          });
        }
      }

      const liveFiles = liveFilesByPub.get(parseInt(row.publication_id, 10)) || [];
      if (liveFiles.length === 0) continue;
      publicationsWithFilesCount += 1;
      totalFilesAcrossPublications += liveFiles.length;
      for (const rawFile of liveFiles) {
        const file = buildAggregatedFileEntry(rawFile, row.publication_id);
        if (!file) continue;
        totalDownloadCount += file.download_count || 0;
        if (file.format) formatBreakdown[file.format] = (formatBreakdown[file.format] || 0) + 1;
        if (file.role) roleBreakdown[file.role] = (roleBreakdown[file.role] || 0) + 1;
        if (!bestOaUrl && file.best_oa_url) bestOaUrl = file.best_oa_url;
        if (aggregatedFiles.length < WORK_LEVEL_FILE_CAP) {
          aggregatedFiles.push(file);
        }
      }
    }

    const orderedFiles = sortAggregatedFiles(aggregatedFiles);

    const fileSummary = {
      files_returned: orderedFiles.length,
      files_total: totalFilesAcrossPublications,
      files_truncated: totalFilesAcrossPublications > orderedFiles.length,
      publications_with_files: publicationsWithFilesCount,
      total_download_count: totalDownloadCount,
      best_oa_url: bestOaUrl,
      by_format: formatBreakdown,
      by_role: roleBreakdown,
      has_scimag: cappedPublicationRows.some(row => row.has_scimag_file === 1),
      has_libgen: cappedPublicationRows.some(row => row.has_libgen_file === 1),
      has_open_access: publicationsOpenAccessCount > 0 || Boolean(bestOaUrl)
    };

    const venues = Array.from(venueAgg.values())
      .filter(entry => entry.name || entry.abbreviated_name)
      .sort((a, b) => {
        if (b.publication_count !== a.publication_count) return b.publication_count - a.publication_count;
        return (b.latest_year || 0) - (a.latest_year || 0);
      });

    const yearsArr = Array.from(yearsSet).sort((a, b) => a - b);
    const yearRange = yearsArr.length
      ? { earliest: yearsArr[0], latest: yearsArr[yearsArr.length - 1] }
      : { earliest: null, latest: null };

    const primaryEntry = primaryPublicationId !== null
      ? publicationEntries.find(entry => entry.id === primaryPublicationId) || null
      : null;

    const primaryPublication = primaryEntry
      ? {
          id: primaryEntry.id,
          doi: primaryEntry.identifiers?.doi || null,
          publication_year: primaryEntry.publication_year,
          publication_date: primaryEntry.publication_date,
          volume: primaryEntry.volume,
          issue: primaryEntry.issue,
          pages: primaryEntry.pages,
          open_access: primaryEntry.open_access,
          peer_reviewed: primaryEntry.peer_reviewed,
          has_files: primaryEntry.has_files,
          venue: primaryEntry.venue,
          publisher: primaryEntry.publisher,
          source: primaryEntry.source,
          license_url: primaryEntry.license_url,
          license_version: primaryEntry.license_version,
          _links: primaryEntry._links
        }
      : null;

    const distinctLanguages = Array.from(
      new Set(cappedPublicationRows.map(row => row.language).filter(Boolean))
    );

    const workAggregations = {
      primary_publication_id: primaryPublicationId,
      primary_publication: primaryPublication,
      publication_year: primaryEntry ? primaryEntry.publication_year : null,
      doi: primaryEntry ? primaryEntry.identifiers?.doi || null : null,
      venue: primaryEntry ? primaryEntry.venue : null,
      open_access: publicationsOpenAccessCount > 0,
      peer_reviewed: publicationsPeerReviewedCount > 0,
      has_files: publicationsWithFilesCount > 0,
      files: orderedFiles,
      file_summary: fileSummary,
      year_range: yearRange,
      venues,
      languages: distinctLanguages,
      summary_updated_at: workData.metrics_last_updated
        ? new Date(workData.metrics_last_updated).toISOString()
        : null
    };

    const metricsData = {
      citation_count: workData.citation_count,
      reference_count: workData.reference_count,
      altmetric_score: workData.altmetric_score,
      download_count: workData.download_count,
      view_count: workData.view_count,
      social_media_mentions: workData.social_media_mentions,
      news_mentions: workData.news_mentions,
      publications_count: publicationsTotal,
      publications_with_files_count: publicationsWithFilesCount,
      publications_open_access_count: publicationsOpenAccessCount,
      publications_peer_reviewed_count: publicationsPeerReviewedCount,
      distinct_venues_count: venues.length,
      total_files_count: totalFilesAcrossPublications,
      total_files_download_count: totalDownloadCount,
      metrics_last_updated: workData.metrics_last_updated || null
    };

    const identifiersAgg = {
      doi: new Set(),
      pmid: new Set(),
      pmcid: new Set(),
      arxiv: new Set(),
      wos_id: new Set(),
      handle: new Set(),
      wikidata_id: new Set(),
      openalex_id: new Set(),
      isbn: new Set(),
      openlibrary_id: new Set(),
      scielo_pid: new Set(),
      google_book_id: new Set()
    };
    for (const row of cappedPublicationRows) {
      const fields = ['doi', 'pmid', 'pmcid', 'arxiv', 'wos_id', 'handle', 'wikidata_id', 'openalex_id', 'isbn', 'openlibrary_id', 'scielo_pid', 'google_book_id'];
      for (const key of fields) {
        const val = row[key];
        if (val && String(val).trim()) identifiersAgg[key].add(String(val).trim());
      }
    }
    const identifiersAggPlain = Object.fromEntries(
      Object.entries(identifiersAgg).map(([k, set]) => [k, Array.from(set)])
    );

    const citationData = await this._fetchCitationsForWork(id, identifiersAggPlain.doi || [], {
      includeCitations,
      includeReferences
    }).catch(err => {
      logger.warn('Work citations fetch failed', { id, error: err.message });
      return { cited_by: [], references: [], unresolved_references: [] };
    });

    const queryTime = Number(((process.hrtime.bigint() - startTime) / BigInt(1e6)).toString());
    logger.debug(`Work ${id} composed in ${queryTime} ms`);

    const completeWork = {
      id: workData.id,
      title: workData.title,
      subtitle: workData.subtitle,
      abstract: workData.abstract,
      type: primaryRow ? primaryRow.work_type : null,
      language: workData.language,
      created_at: workData.created_at,
      updated_at: workData.updated_at,

      publication_year: workAggregations.publication_year,
      doi: workAggregations.doi,
      open_access: workAggregations.open_access,
      peer_reviewed: workAggregations.peer_reviewed,
      has_files: workAggregations.has_files,
      venue: workAggregations.venue,
      languages: workAggregations.languages,
      year_range: workAggregations.year_range,
      summary_updated_at: workAggregations.summary_updated_at,

      primary_publication_id: workAggregations.primary_publication_id,
      primary_publication: workAggregations.primary_publication,

      files: workAggregations.files,
      file_summary: workAggregations.file_summary,
      venues: workAggregations.venues,

      publications: publicationEntries,
      publications_total: publicationsTotal,
      publications_has_more: publicationsHasMore,

      authors: authorsData.map(author => ({
        person_id: author.person_id,
        preferred_name: author.preferred_name,
        given_names: author.given_names,
        family_name: author.family_name,
        identifiers: {
          orcid: author.orcid,
          scopus_id: author.scopus_id,
          lattes_id: author.lattes_id
        },
        role: author.role,
        position: author.position,
        is_corresponding: author.is_corresponding,
        affiliation: author.affiliation_name ? {
          id: author.affiliation_id,
          name: author.affiliation_name,
          type: author.affiliation_type,
          country: author.affiliation_country,
          _links: { self: author.affiliation_id ? `/institutions/${author.affiliation_id}` : null }
        } : null
      })),

      subjects: subjectsData,

      citations: {
        cited_by: citationData.cited_by,
        references: citationData.references,
        unresolved_references: citationData.unresolved_references,
        unsolved: citationData.unresolved_references
      },

      metrics: metricsData,
      identifiers: identifiersAggPlain,
      funding: fundingData
    };

    return formatWorkDetails(completeWork);
  }

  async _fetchCitationsForWork(workId, primaryDois, options = {}) {
    const includeCitations = options.includeCitations !== false;
    const includeReferences = options.includeReferences !== false;
    const doiCandidates = buildDoiCandidates(Array.isArray(primaryDois) ? primaryDois : (primaryDois ? [primaryDois] : []));

    const incomingConditions = ['wr.cited_work_id = ?'];
    const incomingReplacements = [workId];
    if (doiCandidates.length) {
      incomingConditions.push(`wr.cited_doi IN (${doiCandidates.map(() => '?').join(',')})`);
      incomingReplacements.push(...doiCandidates);
    }

    const incomingRows = includeCitations
      ? await sequelize.query(`
          SELECT
            wr.citing_work_id,
            MIN(wr.citation_type) AS citation_type,
            CASE
              WHEN SUM(CASE WHEN wr.status = 'RESOLVED' THEN 1 ELSE 0 END) > 0 THEN 'RESOLVED'
              WHEN SUM(CASE WHEN wr.status = 'PENDING' THEN 1 ELSE 0 END) > 0 THEN 'PENDING'
              ELSE 'FAILED'
            END AS citation_status
          FROM work_references wr
          WHERE ${incomingConditions.map(cond => `(${cond})`).join(' OR ')}
          GROUP BY wr.citing_work_id
          ORDER BY MAX(wr.id) DESC
          LIMIT 100
        `, { replacements: incomingReplacements, type: sequelize.QueryTypes.SELECT })
      : [];

    const outgoingResolvedRows = includeReferences
      ? await sequelize.query(`
          SELECT wr.cited_work_id, MIN(wr.citation_type) AS citation_type, MIN(wr.cited_doi) AS cited_doi
          FROM work_references wr
          WHERE wr.citing_work_id = ?
            AND wr.cited_work_id IS NOT NULL
            AND wr.status = 'RESOLVED'
          GROUP BY wr.cited_work_id
          ORDER BY wr.cited_work_id DESC
          LIMIT 100
        `, { replacements: [workId], type: sequelize.QueryTypes.SELECT })
      : [];

    const unresolvedRows = includeReferences
      ? await sequelize.query(`
          SELECT wr.cited_doi, wr.status, wr.created_at, wr.resolved_at, wr.citation_type
          FROM work_references wr
          WHERE wr.citing_work_id = ?
            AND wr.status IN ('PENDING', 'FAILED')
          ORDER BY wr.id DESC
          LIMIT 100
        `, { replacements: [workId], type: sequelize.QueryTypes.SELECT })
      : [];

    const allWorkIds = Array.from(new Set([
      ...incomingRows.map(r => r.citing_work_id),
      ...outgoingResolvedRows.map(r => r.cited_work_id)
    ].filter(Number.isFinite)));

    let workMap = {};
    if (allWorkIds.length) {
      const placeholders = allWorkIds.map(() => '?').join(',');
      const rows = await sequelize.query(`
        SELECT
          w.id AS work_id,
          w.title,
          p.type AS work_type,
          p.year,
          p.doi,
          p.open_access,
          v.name AS venue_name,
          v.abbreviated_name AS venue_abbreviated_name
        FROM works w
        LEFT JOIN publications p ON p.id = (
          SELECT MAX(p2.id) FROM publications p2 WHERE p2.work_id = w.id
        )
        LEFT JOIN venues v ON v.id = p.venue_id
        WHERE w.id IN (${placeholders})
      `, { replacements: allWorkIds, type: sequelize.QueryTypes.SELECT });

      const authorMap = await hydrateAuthorsForWorks(allWorkIds, 3);
      for (const row of rows) {
        const authorsForWork = authorMap.get(row.work_id) || [];
        workMap[row.work_id] = {
          ...row,
          authors_string: authorsForWork.map(a => a.preferred_name).filter(Boolean).join('; ') || null
        };
      }
    }

    const cited_by = incomingRows.map(row => {
      const wm = workMap[row.citing_work_id] || {};
      return {
        work_id: row.citing_work_id,
        title: wm.title || null,
        authors: wm.authors_string || null,
        publication_year: wm.year || null,
        venue_name: wm.venue_name || wm.venue_abbreviated_name || null,
        venue_abbreviated_name: wm.venue_abbreviated_name || null,
        open_access: wm.open_access,
        citation_type: row.citation_type || 'NEUTRAL',
        citation_status: row.citation_status || null,
        citation_context: null
      };
    });

    const references = outgoingResolvedRows.map(row => {
      const wm = workMap[row.cited_work_id] || {};
      return {
        work_id: row.cited_work_id,
        title: wm.title || null,
        authors: wm.authors_string || null,
        publication_year: wm.year || null,
        venue_name: wm.venue_name || wm.venue_abbreviated_name || null,
        venue_abbreviated_name: wm.venue_abbreviated_name || null,
        doi: wm.doi || row.cited_doi || null,
        open_access: wm.open_access,
        citation_type: row.citation_type || 'NEUTRAL',
        citation_context: null
      };
    });

    const unresolved_references = unresolvedRows.map(row => ({
      cited_doi: row.cited_doi || null,
      status: row.status || 'PENDING',
      citation_type: row.citation_type || 'NEUTRAL',
      created_at: row.created_at || null,
      resolved_at: row.resolved_at || null
    }));

    return { cited_by, references, unresolved_references };
  }

  async getWorkBibliography(workId, filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { reading_type, year_from, year_to } = filters;
    const cacheKey = `work:${workId}:bibliography:v2:${JSON.stringify(filters)}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;

      let baseQuery = `
        SELECT
          c.id as course_id,
          c.code as course_code,
          c.name as course_name,
          c.year as course_year,
          c.program_id,
          cb.reading_type,
          COUNT(DISTINCT ci.canonical_person_id) as instructor_count,
          GROUP_CONCAT(DISTINCT p.preferred_name ORDER BY p.preferred_name SEPARATOR '; ') as instructors
        FROM course_bibliography cb
        JOIN courses c ON cb.course_id = c.id
        LEFT JOIN course_instructors ci ON c.id = ci.course_id
        LEFT JOIN persons p ON ci.canonical_person_id = p.id
        WHERE cb.work_id = ?
      `;

      const whereParams = [workId];

      if (reading_type) {
        baseQuery += ' AND cb.reading_type = ?';
        whereParams.push(reading_type);
      }
      if (year_from) {
        baseQuery += ' AND c.year >= ?';
        whereParams.push(year_from);
      }
      if (year_to) {
        baseQuery += ' AND c.year <= ?';
        whereParams.push(year_to);
      }

      const groupOrderClause = `
        GROUP BY c.id, c.code, c.name, c.year, c.program_id, cb.reading_type
        ORDER BY c.year DESC, c.name ASC
      `;

      const paginatedQuery = `${baseQuery} ${groupOrderClause} LIMIT ? OFFSET ?`;
      const params = [...whereParams, limit, offset];

      const { pool } = require('../config/database');
      const [bibliography] = await pool.execute(
        { sql: paginatedQuery, timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS || '3000', 10) },
        params
      );

      const countQuery = `SELECT COUNT(*) as total FROM ( ${baseQuery} ${groupOrderClause} ) t`;
      const [countRows] = await pool.execute(
        { sql: countQuery, timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS || '3000', 10) },
        whereParams
      );
      const total = parseInt(countRows?.[0]?.total, 10) || 0;

      const result = {
        data: bibliography,
        pagination: createPagination(page, limit, total)
      };

      await cacheService.set(cacheKey, result, 1800);
      return result;
    } catch (error) {
      logger.error('Error retrieving work bibliography:', error);
      throw error;
    }
  }
}

module.exports = new WorksService();
