const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const sphinxService = require('./sphinx.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination, normalizePagination } = require('../utils/pagination');
const {
  formatPublicationListItem,
  formatPublicationDetails
} = require('../dto/publication.dto');
const { authorsFromJson } = require('../dto/helpers');
const { withTimeout } = require('../utils/db');

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

const resolvePublicationsOrderClause = (sortBy, sortOrder) => {
  const dir = typeof sortOrder === 'string' && sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const key = (typeof sortBy === 'string' ? sortBy : '').toLowerCase();
  switch (key) {
    case 'cited_by_count':
    case 'citation_count':
    case 'citations':
      return `sp.work_citation_count ${dir}, sp.publication_year DESC, sp.publication_id DESC`;
    case 'references_count':
    case 'reference_count':
      return `sp.work_reference_count ${dir}, sp.publication_year DESC, sp.publication_id DESC`;
    case 'publication_year':
    case 'year':
      return `sp.publication_year ${dir}, sp.publication_id DESC`;
    case 'id':
    case 'publication_id':
      return `sp.publication_id ${dir}`;
    default:
      return null;
  }
};

const resolveSphinxPublicationOrderBy = (sortBy, sortOrder) => {
  const dir = typeof sortOrder === 'string' && sortOrder.toUpperCase() === 'ASC' ? 'asc' : 'desc';
  const key = (typeof sortBy === 'string' ? sortBy : '').toLowerCase();
  switch (key) {
    case 'cited_by_count':
    case 'citation_count':
    case 'citations':
      return `cited_by_count_${dir}`;
    case 'publication_year':
    case 'year':
      return `publication_year_${dir}`;
    case 'relevance':
      return 'relevance';
    default:
      return null;
  }
};

class PublicationsService {
  async getPublicationById(id, options = {}) {
    const includeCitations = options.includeCitations !== false;
    const includeReferences = options.includeReferences !== false;

    const cacheKey = `publication:${id}:v1:c${includeCitations ? 1 : 0}:r${includeReferences ? 1 : 0}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;
    } catch (cacheError) {
      logger.warn('Publication cache read failed', { id, error: cacheError.message });
    }

    const [row] = await sequelize.query(`
      SELECT
        sp.publication_id,
        sp.work_id,
        sp.venue_id,
        sp.publisher_id,
        sp.title_search AS title,
        sp.abstract_search AS abstract,
        sp.work_type,
        sp.language,
        sp.publication_year,
        sp.publication_date,
        sp.volume,
        sp.issue,
        sp.pages_text AS pages,
        sp.doi,
        sp.source,
        sp.license_url,
        sp.license_version,
        sp.open_access,
        sp.peer_reviewed,
        sp.has_files,
        sp.has_scimag_file,
        sp.has_libgen_file,
        sp.work_citation_count,
        sp.work_reference_count,
        sp.publication_download_count,
        sp.authors_json,
        sp.subjects_json,
        sp.files_json,
        sp.identifiers_json,
        sp.summary_updated_at,
        w.subtitle,
        v.id AS venue_v_id,
        v.name AS venue_name,
        sv.abbrev_search AS venue_abbreviated_name,
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
      FROM summary_publications sp
      LEFT JOIN works w ON w.id = sp.work_id
      LEFT JOIN venues v ON v.id = sp.venue_id
      LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id
      LEFT JOIN organizations publisher ON publisher.id = sp.publisher_id
      WHERE sp.publication_id = ?
      LIMIT 1
    `, { replacements: [id], type: sequelize.QueryTypes.SELECT });

    if (!row) return null;

    const siblings = await sequelize.query(`
      SELECT
        sp.publication_id,
        sp.work_id,
        sp.venue_id,
        sp.publication_year,
        sp.publication_date,
        sp.volume,
        sp.issue,
        sp.pages_text AS pages,
        sp.open_access,
        sp.peer_reviewed,
        sp.has_files,
        sp.doi,
        sp.venue_search AS venue_name,
        sv.abbrev_search AS venue_abbreviated_name
      FROM summary_publications sp
      LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id
      WHERE sp.work_id = ? AND sp.publication_id != ?
      ORDER BY sp.publication_year DESC, sp.publication_id DESC
      LIMIT 50
    `, { replacements: [row.work_id, id], type: sequelize.QueryTypes.SELECT });

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

    const summaryRows = await sequelize.query(
      `SELECT publication_id
         FROM summary_publications
         WHERE doi IN (${placeholders})
         ORDER BY publication_id DESC
         LIMIT 1`,
      { replacements: candidates, type: sequelize.QueryTypes.SELECT }
    );

    if (summaryRows && summaryRows.length > 0) {
      return this.getPublicationById(summaryRows[0].publication_id, options);
    }

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

    const cacheKey = `publications:list:p${page}:l${limit}:o${offset}:${JSON.stringify(filters)}`;

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
    const useSphinx = Boolean(searchTerm || venueFilter || authorFilter || subjectFilter);
    let sphinxIds = null;
    let sphinxTotal = null;
    let sphinxQueryMs = null;
    let sphinxFailed = false;
    let searchEngine = 'MariaDB';

    const citedByMin = toNonNegativeInt(filters.cited_by_min ?? filters.citation_count_min);
    const citedByMax = toNonNegativeInt(filters.cited_by_max ?? filters.citation_count_max);
    const sortBy = filters.sort_by ?? filters.sortBy ?? null;
    const sortOrder = filters.sort_order ?? filters.sortOrder ?? null;
    const sphinxOrderBy = resolveSphinxPublicationOrderBy(sortBy, sortOrder);
    const mariaOrderClause = resolvePublicationsOrderClause(sortBy, sortOrder);

    if (useSphinx) {
      try {
        const spx = await sphinxService.searchPublicationIds(searchTerm, {
          work_type: filters.type || filters.work_type,
          language: filters.language,
          year_from: filters.year_from,
          year_to: filters.year_to,
          peer_reviewed: filters.peer_reviewed,
          open_access: filters.open_access,
          venue_name: venueFilter,
          author: authorFilter,
          subject: subjectFilter,
          venue_id: filters.venue_id,
          publisher_id: filters.publisher_id,
          work_id: filters.work_id,
          has_files: filters.has_files,
          citation_count_min: citedByMin ?? filters.citation_count_min,
          citation_count_max: citedByMax ?? filters.citation_count_max
        }, { limit, offset, orderBy: sphinxOrderBy });
        sphinxIds = Array.isArray(spx?.publication_ids) ? spx.publication_ids : (Array.isArray(spx?.ids) ? spx.ids : []);
        sphinxTotal = parseInt(spx?.total ?? sphinxIds.length, 10) || 0;
        sphinxQueryMs = spx?.query_time ?? null;
        searchEngine = 'Sphinx+MariaDB';
      } catch (sphinxError) {
        sphinxFailed = true;
        searchEngine = 'MariaDB-fallback';
        logger.warn('Sphinx publication search unavailable, falling back to MariaDB', {
          error: sphinxError.message
        });
      }
    }

    if (sphinxIds && sphinxIds.length === 0) {
      const emptyResult = {
        data: [],
        pagination: createPagination(page, limit, sphinxTotal || 0),
        meta: {
          engine: searchEngine,
          sphinx_query_ms: sphinxQueryMs,
          elapsed_ms: Date.now() - t0
        }
      };
      try {
        await cacheService.set(cacheKey, emptyResult, 1800);
      } catch (_) {}
      return emptyResult;
    }

    const whereConditions = [];
    const queryParams = [];

    if (sphinxIds && sphinxIds.length > 0) {
      const placeholders = sphinxIds.map(() => '?').join(',');
      whereConditions.push(`sp.publication_id IN (${placeholders})`);
      queryParams.push(...sphinxIds);
    } else {
      const workType = filters.type || filters.work_type;
      if (workType) {
        whereConditions.push('sp.work_type = ?');
        queryParams.push(workType);
      }
      if (filters.language) {
        whereConditions.push('sp.language = ?');
        queryParams.push(filters.language);
      }
      if (filters.year_from) {
        whereConditions.push('sp.publication_year >= ?');
        queryParams.push(parseInt(filters.year_from, 10));
      }
      if (filters.year_to) {
        whereConditions.push('sp.publication_year <= ?');
        queryParams.push(parseInt(filters.year_to, 10));
      }

      const oaFlag = toBoolFlag(filters.open_access);
      if (oaFlag !== null) {
        whereConditions.push('sp.open_access = ?');
        queryParams.push(oaFlag);
      }

      const peerFlag = toBoolFlag(filters.peer_reviewed);
      if (peerFlag !== null) {
        whereConditions.push('sp.peer_reviewed = ?');
        queryParams.push(peerFlag);
      }

      const filesFlag = toBoolFlag(filters.has_files);
      if (filesFlag !== null) {
        whereConditions.push('sp.has_files = ?');
        queryParams.push(filesFlag);
      }

      if (filters.venue_id) {
        whereConditions.push('sp.venue_id = ?');
        queryParams.push(parseInt(filters.venue_id, 10));
      }
      if (filters.publisher_id) {
        whereConditions.push('sp.publisher_id = ?');
        queryParams.push(parseInt(filters.publisher_id, 10));
      }
      if (filters.work_id) {
        whereConditions.push('sp.work_id = ?');
        queryParams.push(parseInt(filters.work_id, 10));
      }
      if (filters.doi) {
        const normalized = normalizeDoiValue(filters.doi);
        if (normalized) {
          const candidates = buildDoiCandidates([normalized]);
          const placeholders = candidates.map(() => '?').join(',');
          whereConditions.push(`sp.doi IN (${placeholders})`);
          queryParams.push(...candidates);
        }
      }

      if (citedByMin !== null) {
        whereConditions.push('sp.work_citation_count >= ?');
        queryParams.push(citedByMin);
      }
      if (citedByMax !== null) {
        whereConditions.push('sp.work_citation_count <= ?');
        queryParams.push(citedByMax);
      }

      if (sphinxFailed) {
        if (searchTerm) {
          whereConditions.push('(MATCH(sp.title_search, sp.abstract_search) AGAINST (? IN BOOLEAN MODE))');
          queryParams.push(searchTerm);
        }
        if (venueFilter) {
          whereConditions.push('sp.venue_search LIKE ?');
          queryParams.push(`%${venueFilter}%`);
        }
        if (authorFilter) {
          whereConditions.push('sp.authors_search LIKE ?');
          queryParams.push(`%${authorFilter}%`);
        }
        if (subjectFilter) {
          whereConditions.push('sp.subjects_search LIKE ?');
          queryParams.push(`%${subjectFilter}%`);
        }
      } else {
        if (filters.venue_name || filters.venue) {
          whereConditions.push('sp.venue_search LIKE ?');
          queryParams.push(`%${filters.venue_name || filters.venue}%`);
        }
        if (filters.author) {
          whereConditions.push('sp.authors_search LIKE ?');
          queryParams.push(`%${filters.author}%`);
        }
        if (filters.subject) {
          whereConditions.push('sp.subjects_search LIKE ?');
          queryParams.push(`%${filters.subject}%`);
        }
      }
    }

    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const COUNT_BUDGET_MS = 2000;
    let totalItems;
    let totalIsExact = true;
    if (sphinxIds && sphinxTotal !== null) {
      totalItems = sphinxTotal;
    } else if (whereConditions.length === 0) {
      totalItems = 6567060;
      totalIsExact = false;
    } else {
      const countSql = `SELECT COUNT(*) AS total FROM summary_publications sp ${whereClause}`;
      try {
        const [countRow] = await sequelize.query(withTimeout(countSql, COUNT_BUDGET_MS), {
          replacements: queryParams,
          type: sequelize.QueryTypes.SELECT
        });
        totalItems = parseInt(countRow?.total) || 0;
      } catch (countError) {
        logger.warn('Publications list count query exceeded budget, returning estimate', {
          error: countError.message
        });
        totalItems = 6567060;
        totalIsExact = false;
      }
    }

    const orderClause = sphinxIds && sphinxIds.length > 0
      ? `ORDER BY FIELD(sp.publication_id, ${sphinxIds.map(() => '?').join(',')})`
      : `ORDER BY ${mariaOrderClause || 'sp.publication_id DESC'}`;

    const orderParams = sphinxIds && sphinxIds.length > 0 ? [...sphinxIds] : [];
    const limitClause = sphinxIds ? '' : 'LIMIT ? OFFSET ?';
    const limitParams = sphinxIds ? [] : [limit, offset];

    const rows = await sequelize.query(`
      SELECT
        sp.publication_id,
        sp.work_id,
        sp.venue_id,
        sp.publisher_id,
        sp.title_search AS title,
        sp.abstract_search AS abstract,
        sp.doi,
        sp.work_type,
        sp.language,
        sp.publication_year,
        sp.publication_date,
        sp.volume,
        sp.issue,
        sp.pages_text AS pages,
        sp.source,
        sp.license_url,
        sp.license_version,
        sp.open_access,
        sp.peer_reviewed,
        sp.has_files,
        sp.has_scimag_file,
        sp.has_libgen_file,
        sp.work_citation_count,
        sp.work_reference_count,
        sp.publication_download_count,
        sp.authors_json,
        sp.subjects_json,
        sp.identifiers_json,
        sp.venue_search AS venue_name,
        sv.abbrev_search AS venue_abbreviated_name,
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
      FROM summary_publications sp
      LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id
      LEFT JOIN venues v ON v.id = sp.venue_id
      LEFT JOIN organizations publisher ON publisher.id = sp.publisher_id
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `, {
      replacements: [...queryParams, ...orderParams, ...limitParams],
      type: sequelize.QueryTypes.SELECT
    });

    const data = rows.map(formatPublicationListItem);

    const result = {
      data,
      pagination: createPagination(page, limit, totalItems),
      meta: {
        engine: searchEngine,
        pagination_total_exact: totalIsExact,
        sphinx_query_ms: sphinxQueryMs,
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
      ? await sequelize.query(
          `SELECT
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
           LIMIT 100`,
          { replacements: incomingReplacements, type: sequelize.QueryTypes.SELECT }
        )
      : [];

    const outgoingResolvedRows = includeReferences
      ? await sequelize.query(
          `SELECT wr.cited_work_id, MIN(wr.citation_type) AS citation_type, MIN(wr.cited_doi) AS cited_doi
             FROM work_references wr
             WHERE wr.citing_work_id = ?
               AND wr.cited_work_id IS NOT NULL
               AND wr.status = 'RESOLVED'
             GROUP BY wr.cited_work_id
             ORDER BY wr.cited_work_id DESC
             LIMIT 100`,
          { replacements: [workId], type: sequelize.QueryTypes.SELECT }
        )
      : [];

    const unresolvedRows = includeReferences
      ? await sequelize.query(
          `SELECT wr.cited_doi, wr.status, wr.created_at, wr.resolved_at, wr.citation_type
             FROM work_references wr
             WHERE wr.citing_work_id = ?
               AND wr.status IN ('PENDING', 'FAILED')
             ORDER BY wr.id DESC
             LIMIT 100`,
          { replacements: [workId], type: sequelize.QueryTypes.SELECT }
        )
      : [];

    const allWorkIds = Array.from(new Set([
      ...incomingRows.map(r => r.citing_work_id),
      ...outgoingResolvedRows.map(r => r.cited_work_id)
    ].filter(Number.isFinite)));

    let summaryMap = {};
    if (allWorkIds.length) {
      const placeholders = allWorkIds.map(() => '?').join(',');
      const summaryRows = await sequelize.query(
        `SELECT sp.work_id,
                sp.title_search AS title,
                sp.publication_year AS year,
                sp.work_type,
                sp.venue_search AS venue_name,
                sv.abbrev_search AS venue_abbrev,
                sp.doi,
                sp.open_access,
                sp.authors_json
           FROM summary_publications sp
           LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id
           INNER JOIN (
             SELECT work_id, MAX(publication_id) AS pub_id
             FROM summary_publications
             WHERE work_id IN (${placeholders})
             GROUP BY work_id
           ) latest ON latest.pub_id = sp.publication_id`,
        { replacements: allWorkIds, type: sequelize.QueryTypes.SELECT }
      );
      summaryMap = summaryRows.reduce((acc, row) => {
        acc[row.work_id] = row;
        return acc;
      }, {});
    }

    const projectCitation = (row, idField) => {
      const sw = summaryMap[row[idField]] || {};
      const authors = authorsFromJson(sw.authors_json);
      return {
        work_id: row[idField],
        title: sw.title || null,
        type: sw.work_type || null,
        year: sw.year || null,
        venue_name: sw.venue_name || sw.venue_abbrev || null,
        venue_abbreviated_name: sw.venue_abbrev || null,
        doi: sw.doi || row.cited_doi || null,
        authors: authors.length ? authors.join('; ') : null,
        authors_count: authors.length,
        open_access: typeof sw.open_access === 'number' ? Boolean(sw.open_access) : null,
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
