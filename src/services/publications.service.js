const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination, normalizePagination } = require('../utils/pagination');
const {
  formatPublicationListItem,
  formatPublicationDetails
} = require('../dto/publication.dto');
const { normalizeType, toOptionalInteger } = require('../dto/helpers');
const { withTimeout, latestPublicationJoin, isStatementTimeout } = require('../utils/db');
const { hydrateAuthorsForWorks } = require('../utils/hydration');
const searchEngine = require('./searchEngine.service');

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

const toBoolFlag = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) return 1;
  if (['0', 'false', 'no'].includes(normalized)) return 0;
  return null;
};

const toNonNegativeInt = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
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

const resolvePublicationsOrderClause = (sortBy, sortOrder) => {
  const dir = typeof sortOrder === 'string' && sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const key = (typeof sortBy === 'string' ? sortBy : '').toLowerCase();
  switch (key) {
    case 'cited_by_count':
    case 'citation_count':
    case 'citations':
      return `p.citation_count ${dir}, p.id ${dir}`;
    case 'references_count':
    case 'reference_count':
      return `p.reference_count ${dir}, p.id ${dir}`;
    case 'publication_year':
    case 'year':
      return `p.year ${dir}, p.id DESC`;
    case 'id':
    case 'publication_id':
      return `p.id ${dir}`;
    default:
      return null;
  }
};

const PUBLICATION_BASE_COLUMNS = `
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
  p.created_at,
  p.updated_at,
  w.title,
  w.subtitle,
  w.abstract,
  p.type AS work_type,
  w.language,
  w.citation_count AS work_citation_count,
  w.reference_count AS work_reference_count,
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

const FILES_SELECT = `
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


const hydrateSubjectsForWorks = async (workIds) => {
  const map = new Map();
  if (!Array.isArray(workIds) || workIds.length === 0) return map;
  const placeholders = workIds.map(() => '?').join(',');
  const rows = await sequelize.query(`
    SELECT
      ws.work_id,
      s.id AS subject_id,
      s.term,
      s.vocabulary,
      s.lang
    FROM work_subjects ws
    INNER JOIN subjects s ON s.id = ws.subject_id
    WHERE ws.work_id IN (${placeholders})
    ORDER BY ws.work_id, ws.relevance_score DESC, s.term ASC
  `, { replacements: workIds, type: sequelize.QueryTypes.SELECT });
  for (const row of rows) {
    const bucket = map.get(row.work_id) || [];
    bucket.push({
      subject_id: toOptionalInteger(row.subject_id),
      term: row.term,
      vocabulary: normalizeType(row.vocabulary) || 'KEYWORD',
      lang: row.lang || null
    });
    map.set(row.work_id, bucket);
  }
  return map;
};

const hydrateFilesForPublications = async (publicationIds, cap = 200) => {
  const map = new Map();
  if (!Array.isArray(publicationIds) || publicationIds.length === 0) return map;
  const placeholders = publicationIds.map(() => '?').join(',');
  const rows = await sequelize.query(`
    SELECT
      ${FILES_SELECT}
    FROM files f
    WHERE f.publication_id IN (${placeholders})
    ORDER BY f.publication_id ASC,
             FIELD(f.file_role,'MAIN','SUPPLEMENT','COVER','PREVIEW'),
             f.id ASC
    LIMIT ${cap}
  `, { replacements: publicationIds, type: sequelize.QueryTypes.SELECT });
  for (const row of rows) {
    const pubId = parseInt(row.publication_id, 10);
    if (!Number.isFinite(pubId)) continue;
    const bucket = map.get(pubId) || [];
    bucket.push(row);
    map.set(pubId, bucket);
  }
  return map;
};

class PublicationsService {
  async getPublicationById(id, options = {}) {
    const includeCitations = options.includeCitations !== false;
    const includeReferences = options.includeReferences !== false;
    const cacheKey = `publication:${id}:v3:c${includeCitations ? 1 : 0}:r${includeReferences ? 1 : 0}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;
    } catch (cacheError) {
      logger.warn('Publication cache read failed', { id, error: cacheError.message });
    }

    const [row] = await sequelize.query(`
      SELECT
        ${PUBLICATION_BASE_COLUMNS}
      FROM publications p
      INNER JOIN works w ON w.id = p.work_id
      LEFT JOIN venues v ON v.id = p.venue_id
      LEFT JOIN organizations publisher ON publisher.id = p.publisher_id
      WHERE p.id = ?
      LIMIT 1
    `, { replacements: [id], type: sequelize.QueryTypes.SELECT });

    if (!row) return null;

    try {
      const filesMap = await hydrateFilesForPublications([id], 200);
      const liveFiles = filesMap.get(parseInt(id, 10)) || [];
      row.files_json = liveFiles;
      row.has_files = liveFiles.length > 0 ? 1 : 0;
      row.has_scimag_file = liveFiles.some(f => f.scimag_id !== null && f.scimag_id !== undefined) ? 1 : 0;
      row.has_libgen_file = liveFiles.some(f => f.libgen_id !== null && f.libgen_id !== undefined) ? 1 : 0;
    } catch (filesError) {
      logger.warn('Live files JOIN for publication failed; continuing without files', {
        publication_id: id,
        error: filesError.message
      });
      row.files_json = [];
      row.has_files = 0;
      row.has_scimag_file = 0;
      row.has_libgen_file = 0;
    }

    const [authorsMap, subjectsMap] = await Promise.all([
      hydrateAuthorsForWorks([row.work_id]),
      hydrateSubjectsForWorks([row.work_id])
    ]);
    row.authors_json = authorsMap.get(row.work_id) || [];
    row.subjects_json = subjectsMap.get(row.work_id) || [];

    const siblings = await sequelize.query(`
      SELECT
        p.id AS publication_id,
        p.work_id,
        p.venue_id,
        p.year AS publication_year,
        p.publication_date,
        p.volume,
        p.issue,
        p.pages,
        p.doi,
        p.open_access,
        p.peer_reviewed,
        v.name AS venue_name,
        v.abbreviated_name AS venue_abbreviated_name
      FROM publications p
      LEFT JOIN venues v ON v.id = p.venue_id
      WHERE p.work_id = ? AND p.id != ?
      ORDER BY p.year DESC, p.id DESC
      LIMIT 50
    `, { replacements: [row.work_id, id], type: sequelize.QueryTypes.SELECT });

    const siblingIds = siblings.map(s => parseInt(s.publication_id, 10)).filter(Number.isFinite);
    const siblingFilesMap = siblingIds.length ? await hydrateFilesForPublications(siblingIds, 500).catch(() => new Map()) : new Map();
    for (const sibling of siblings) {
      const files = siblingFilesMap.get(parseInt(sibling.publication_id, 10)) || [];
      sibling.has_files = files.length > 0 ? 1 : 0;
    }

    const extras = { siblings };

    if (includeCitations || includeReferences) {
      try {
        const citationData = await this._fetchCitationsForWork(row.work_id, row.doi, {
          includeCitations,
          includeReferences
        });
        extras.citations = citationData.cited_by;
        extras.references = {
          resolved: citationData.references,
          unresolved: citationData.unresolved_references
        };
      } catch (citationError) {
        logger.warn('Publication citations fetch failed', {
          id,
          work_id: row.work_id,
          error: citationError.message
        });
      }
    }

    const hydrated = {
      ...row,
      venue: row.venue_v_id
        ? {
            id: row.venue_v_id,
            name: row.venue_name,
            abbreviated_name: row.venue_abbreviated_name,
            type: row.venue_type,
            issn: row.issn,
            eissn: row.eissn,
            scopus_id: row.venue_scopus_id,
            wikidata_id: row.venue_wikidata_id,
            openalex_id: row.venue_openalex_id
          }
        : null,
      publisher: row.publisher_v_id
        ? {
            id: row.publisher_v_id,
            name: row.publisher_name,
            type: row.publisher_type,
            country: row.publisher_country,
            ror_id: row.publisher_ror_id,
            wikidata_id: row.publisher_wikidata_id,
            openalex_id: row.publisher_openalex_id,
            url: row.publisher_url
          }
        : null
    };

    const result = formatPublicationDetails(hydrated, extras);

    try {
      await cacheService.set(cacheKey, result, 7200);
    } catch (cacheError) {
      logger.warn('Publication cache write failed', { id, error: cacheError.message });
    }

    return result;
  }

  async getPublicationByDoi(doi, options = {}) {
    const normalized = normalizeDoiValue(doi);
    if (!normalized) return null;

    const candidates = buildDoiCandidates([normalized]);
    if (candidates.length === 0) return null;

    const placeholders = candidates.map(() => '?').join(',');
    const pubRows = await sequelize.query(
      `SELECT id
         FROM publications
        WHERE doi IN (${placeholders})
        ORDER BY id DESC
        LIMIT 1`,
      { replacements: candidates, type: sequelize.QueryTypes.SELECT }
    );

    if (!pubRows || pubRows.length === 0) return null;
    return this.getPublicationById(pubRows[0].id, options);
  }

  async getPublications(filters = {}) {
    const t0 = Date.now();
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;

    const cacheKey = `publications:list:v3:p${page}:l${limit}:o${offset}:${JSON.stringify(filters)}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;
    } catch (cacheError) {
      logger.warn('Publications list cache read failed', { error: cacheError.message });
    }

    const searchTerm = (filters.q || filters.search || '').trim();
    const venueFilter = filters.venue_name || filters.venue || null;
    const authorFilter = filters.author || null;
    const subjectFilter = filters.subject || null;

    const citedByMin = toNonNegativeInt(filters.cited_by_min ?? filters.citation_count_min);
    const citedByMax = toNonNegativeInt(filters.cited_by_max ?? filters.citation_count_max);
    const sortBy = filters.sort_by ?? filters.sortBy ?? null;
    const sortOrder = filters.sort_order ?? filters.sortOrder ?? null;
    const orderClause = resolvePublicationsOrderClause(sortBy, sortOrder) || 'p.id DESC';

    const where = [];
    const params = [];

    const workType = filters.type || filters.work_type;
    if (workType) {
      where.push('p.type = ?');
      params.push(workType);
    }
    if (filters.language) {
      where.push('w.language = ?');
      params.push(filters.language);
    }
    if (filters.year_from) {
      where.push('p.year >= ?');
      params.push(parseInt(filters.year_from, 10));
    }
    if (filters.year_to) {
      where.push('p.year <= ?');
      params.push(parseInt(filters.year_to, 10));
    }

    const oaFlag = toBoolFlag(filters.open_access);
    if (oaFlag !== null) {
      where.push('p.open_access = ?');
      params.push(oaFlag);
    }
    const peerFlag = toBoolFlag(filters.peer_reviewed);
    if (peerFlag !== null) {
      where.push('p.peer_reviewed = ?');
      params.push(peerFlag);
    }
    const filesFlag = toBoolFlag(filters.has_files);
    let requireHasFiles = false;
    if (filesFlag !== null) {
      if (filesFlag === 1) {
        requireHasFiles = true;
      } else {
        where.push('NOT EXISTS (SELECT 1 FROM files f WHERE f.publication_id = p.id)');
      }
    }

    if (filters.venue_id) {
      where.push('p.venue_id = ?');
      params.push(parseInt(filters.venue_id, 10));
    }
    if (filters.publisher_id) {
      where.push('p.publisher_id = ?');
      params.push(parseInt(filters.publisher_id, 10));
    }
    if (filters.work_id) {
      where.push('p.work_id = ?');
      params.push(parseInt(filters.work_id, 10));
    }
    if (filters.doi) {
      const normalized = normalizeDoiValue(filters.doi);
      if (normalized) {
        const candidates = buildDoiCandidates([normalized]);
        const placeholders = candidates.map(() => '?').join(',');
        where.push(`p.doi IN (${placeholders})`);
        params.push(...candidates);
      }
    }

    if (citedByMin !== null) {
      where.push('p.citation_count >= ?');
      params.push(citedByMin);
    }
    if (citedByMax !== null) {
      where.push('p.citation_count <= ?');
      params.push(citedByMax);
    }

    let ftCapped = false;
    if (searchTerm || authorFilter || subjectFilter) {
      const cap = parseInt(process.env.MANTICORE_PUBLICATIONS_WORK_CAP || '5000', 10);
      const ft = await searchEngine.fetchWorkIdsForFilters({ q: searchTerm, author: authorFilter, subject: subjectFilter }, cap);
      ftCapped = ft.capped;
      if (ft.ids.length === 0) {
        where.push('1 = 0');
      } else {
        where.push(`p.work_id IN (${ft.ids.map(() => '?').join(',')})`);
        params.push(...ft.ids);
      }
    }

    const venueExpr = buildBooleanExpr(venueFilter);
    if (venueExpr) {
      where.push('p.venue_id IN (SELECT v_ft.id FROM venues v_ft WHERE MATCH(v_ft.name, v_ft.abbreviated_name) AGAINST (? IN BOOLEAN MODE))');
      params.push(venueExpr);
    }

    const COUNT_BUDGET_MS = 2000;
    const ESTIMATED_PUBLICATIONS_TOTAL = 6756567;

    const useFilesFastPath = requireHasFiles
      && !searchTerm && !authorFilter && !subjectFilter
      && !venueExpr
      && orderClause === 'p.id DESC';

    const hasFilesExists = 'EXISTS (SELECT 1 FROM files f WHERE f.publication_id = p.id)';
    const effectiveWhere = (requireHasFiles && !useFilesFastPath) ? [...where, hasFilesExists] : where;
    const whereClause = effectiveWhere.length ? `WHERE ${effectiveWhere.join(' AND ')}` : '';
    const idSelectionNeedsWorks = /\bw\./.test(whereClause) || /\bw\./.test(orderClause);

    let countPromise;
    if (effectiveWhere.length === 0) {
      countPromise = Promise.resolve({ total: ESTIMATED_PUBLICATIONS_TOTAL, exact: false });
    } else {
      const countSql = `
        SELECT COUNT(*) AS total
        FROM publications p
        INNER JOIN works w ON w.id = p.work_id
        ${whereClause}
      `;
      countPromise = sequelize.query(withTimeout(countSql, COUNT_BUDGET_MS), {
        replacements: params,
        type: sequelize.QueryTypes.SELECT
      })
        .then(([countRow]) => ({ total: parseInt(countRow?.total, 10) || 0, exact: true }))
        .catch((countError) => {
          logger.warn('Publications list count query exceeded budget; returning estimate', {
            error: countError.message
          });
          return { total: ESTIMATED_PUBLICATIONS_TOTAL, exact: false };
        });
    }

    const idSelectionSql = useFilesFastPath
      ? `
        SELECT p.id
        FROM (
          SELECT DISTINCT f.publication_id AS pid
          FROM files f
          ORDER BY f.publication_id DESC
          LIMIT ? OFFSET ?
        ) ff
        JOIN publications p ON p.id = ff.pid
        ${idSelectionNeedsWorks ? 'INNER JOIN works w ON w.id = p.work_id' : ''}
        ${whereClause}
        ORDER BY p.id DESC
      `
      : `
        SELECT p.id
        FROM publications p
        ${idSelectionNeedsWorks ? 'INNER JOIN works w ON w.id = p.work_id' : ''}
        ${whereClause}
        ORDER BY ${orderClause}
        LIMIT ? OFFSET ?
      `;
    const idSelectionParams = useFilesFastPath ? [limit, offset, ...params] : [...params, limit, offset];

    const idPromise = sequelize.query(withTimeout(idSelectionSql), {
      replacements: idSelectionParams,
      type: sequelize.QueryTypes.SELECT
    })
      .then((selected) => ({ rows: selected, degraded: false }))
      .catch((pageError) => {
        if (!isStatementTimeout(pageError)) throw pageError;
        logger.warn('Publications list page query exceeded budget; serving empty page', {
          error: pageError.message, sort: orderClause
        });
        return { rows: [], degraded: true };
      });

    const [countOutcome, idOutcome] = await Promise.all([countPromise, idPromise]);
    let totalItems = countOutcome.total;
    let totalIsExact = countOutcome.exact;
    const idRows = idOutcome.rows;
    const pageDegraded = idOutcome.degraded;
    if (pageDegraded) totalIsExact = false;

    const pageIds = idRows.map(r => parseInt(r.id, 10)).filter(Number.isFinite);
    const rows = pageIds.length === 0 ? [] : await sequelize.query(`
      SELECT
        ${PUBLICATION_BASE_COLUMNS}
      FROM publications p
      INNER JOIN works w ON w.id = p.work_id
      LEFT JOIN venues v ON v.id = p.venue_id
      LEFT JOIN organizations publisher ON publisher.id = p.publisher_id
      WHERE p.id IN (${pageIds.map(() => '?').join(',')})
      ORDER BY ${orderClause}
    `, {
      replacements: pageIds,
      type: sequelize.QueryTypes.SELECT
    });

    const workIds = Array.from(new Set(rows.map(r => r.work_id).filter(Number.isFinite)));
    const pubIds = rows.map(r => parseInt(r.publication_id, 10)).filter(Number.isFinite);

    const [authorsMap, filesMap] = await Promise.all([
      hydrateAuthorsForWorks(workIds),
      hydrateFilesForPublications(pubIds, 500).catch(() => new Map())
    ]);

    const data = rows.map(row => {
      const authors = authorsMap.get(row.work_id) || [];
      row.authors_json = authors;
      const files = filesMap.get(parseInt(row.publication_id, 10)) || [];
      row.files_json = files;
      row.has_files = files.length > 0 ? 1 : 0;
      row.has_scimag_file = files.some(f => f.scimag_id !== null && f.scimag_id !== undefined) ? 1 : 0;
      row.has_libgen_file = files.some(f => f.libgen_id !== null && f.libgen_id !== undefined) ? 1 : 0;
      return formatPublicationListItem(row);
    });

    const result = {
      data,
      pagination: createPagination(page, limit, totalItems),
      meta: {
        engine: (searchTerm || authorFilter || subjectFilter) ? 'Manticore' : 'MariaDB',
        pagination_total_exact: totalIsExact,
        ...(pageDegraded ? { page_degraded: true, note: 'This sort exceeded the statement budget; try a narrower filter or a different sort.' } : {}),
        ...(ftCapped ? { fulltext_truncated: true, fulltext_work_cap: parseInt(process.env.MANTICORE_PUBLICATIONS_WORK_CAP || '5000', 10) } : {}),
        ...(useFilesFastPath ? { has_files_source: 'files_index', ...(where.length ? { has_files_note: 'has_files paginates over the files index; extra filters are applied after, so a page may under-fill.' } : {}) } : {}),
        elapsed_ms: Date.now() - t0
      }
    };

    try {
      await cacheService.set(cacheKey, result, 1800);
    } catch (cacheError) {
      logger.warn('Publications list cache write failed', { error: cacheError.message });
    }

    return result;
  }

  async _fetchCitationsForWork(workId, primaryDoi, options = {}) {
    const includeCitations = options.includeCitations !== false;
    const includeReferences = options.includeReferences !== false;

    const doiCandidates = buildDoiCandidates(primaryDoi ? [primaryDoi] : []);
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
        ${latestPublicationJoin('p', 'LEFT')}
        LEFT JOIN venues v ON v.id = p.venue_id
        WHERE w.id IN (${placeholders})
      `, { replacements: allWorkIds, type: sequelize.QueryTypes.SELECT });
      const authorsMap = await hydrateAuthorsForWorks(allWorkIds);
      for (const row of rows) {
        const authors = authorsMap.get(row.work_id) || [];
        workMap[row.work_id] = {
          ...row,
          authors_count: authors.length,
          authors_string: authors.map(a => a.preferred_name).filter(Boolean).join('; ') || null
        };
      }
    }

    const projectCitation = (row, idField) => {
      const wm = workMap[row[idField]] || {};
      return {
        work_id: row[idField],
        title: wm.title || null,
        type: wm.work_type || null,
        year: wm.year || null,
        venue_name: wm.venue_name || wm.venue_abbreviated_name || null,
        venue_abbreviated_name: wm.venue_abbreviated_name || null,
        doi: wm.doi || row.cited_doi || null,
        authors: wm.authors_string || null,
        authors_count: wm.authors_count || 0,
        open_access: typeof wm.open_access === 'number' ? Boolean(wm.open_access) : null,
        citation_type: row.citation_type || 'NEUTRAL',
        citation_status: row.citation_status || null,
        citation_context: null
      };
    };

    return {
      cited_by: incomingRows.map(r => projectCitation(r, 'citing_work_id')),
      references: outgoingResolvedRows.map(r => projectCitation(r, 'cited_work_id')),
      unresolved_references: unresolvedRows.map(row => ({
        cited_doi: row.cited_doi || null,
        status: row.status || 'PENDING',
        citation_type: row.citation_type || 'NEUTRAL',
        created_at: row.created_at || null,
        resolved_at: row.resolved_at || null
      }))
    };
  }
}

module.exports = new PublicationsService();
