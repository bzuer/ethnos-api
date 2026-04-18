const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const SphinxService = require('./sphinx.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination, normalizePagination } = require('../utils/pagination');
const { formatWorkListItem, formatWorkDetails } = require('../dto/work.dto');
const { authorsFromJson, subjectsFromJson: baseSubjectsFromJson, parseJsonColumn } = require('../dto/helpers');
const { formatPublicationEntry } = require('../dto/publication.dto');
const { withTimeout } = require('../utils/db');

const subjectsFromJson = (value) =>
  baseSubjectsFromJson(value).map(subject => ({
    ...subject,
    relevance_score: 1.0,
    assigned_by: 'SYSTEM'
  }));

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
const uniqueById = (items) => {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    const id = item && item.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
};

class WorksService {
  
  async getWorks(filters = {}) {
    const t0 = Date.now();
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { search, type, year_from, year_to, open_access, language, peer_reviewed, venue_name, author, subject } = filters;
    const effectiveLimit = Math.min(limit, 20);
    const cacheKey = `works:showcase:p${page}:l${effectiveLimit}:s${search || 'all'}:t${type || 'all'}:y${year_from || 'all'}-${year_to || 'all'}:oa${open_access || 'all'}:lang${language || 'all'}:pr${peer_reviewed === undefined ? 'all' : Number(Boolean(peer_reviewed))}:vn${venue_name || 'all'}:au${author || 'all'}:su${subject || 'all'}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;

      const trimmedSearch = (search || '').trim();
      const hasFulltextFilter = Boolean(trimmedSearch || venue_name || author || subject);

      if (hasFulltextFilter) {
        try {
          const result = await this._getWorksFromSphinx(trimmedSearch, filters);
          result.performance = { ...(result.performance || {}), elapsed_ms: Date.now() - t0 };
          return result;
        } catch (sphinxError) {
          logger.warn('Sphinx search unavailable, using MariaDB fallback', { message: sphinxError.message, code: sphinxError.code });
          const result = await this._getWorksSearchFallback(trimmedSearch, filters, effectiveLimit, offset, page);
          result.performance = { ...(result.performance || {}), elapsed_ms: Date.now() - t0 };
          return result;
        }
      }

      const result = await this._getWorksVitrine(filters, effectiveLimit, offset, page);
      result.performance = { ...(result.performance || {}), elapsed_ms: Date.now() - t0 };
      await cacheService.set(cacheKey, result, 1800);
      return result;
    } catch (error) {
      throw new Error(`Works showcase query failed: ${error.message}`);
    }
  }

  async getWorkById(id, options = {}) {
    const includeCitations = options.includeCitations !== false;
    const includeReferences = options.includeReferences !== false;
    const cacheKey = `work:v2:${id}:c${includeCitations ? 1 : 0}:r${includeReferences ? 1 : 0}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const work = await this._getCompleteWorkData(id, { includeCitations, includeReferences });

      if (!work) {
        return null;
      }

      await cacheService.set(cacheKey, work, 7200);
      return work;

    } catch (error) {
      logger.error(`Error fetching complete work ${id}:`, error.message);
      throw error;
    }
  }


  
  async getWorksVitrine(filters = {}) {
    const t0 = Date.now();
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { type, year_from, year_to, language } = filters;
    const effectiveLimit = Math.min(limit, 100);
    
    const cacheKey = `works:showcase:p${page}:l${effectiveLimit}:t${type || 'all'}:y${year_from || 'all'}-${year_to || 'all'}:lang${language || 'all'}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const whereConditions = [];
      const queryParams = [];

      if (type) {
        whereConditions.push('work_type = ?');
        queryParams.push(type);
      }

      if (language) {
        whereConditions.push('language = ?');
        queryParams.push(language);
      }

      if (year_from) {
        whereConditions.push('publication_year >= ?');
        queryParams.push(parseInt(year_from));
      }

      if (year_to) {
        whereConditions.push('publication_year <= ?');
        queryParams.push(parseInt(year_to));
      }

      const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const COUNT_BUDGET_MS = 2000;
      let totalItems = 0;
      let totalIsExact = true;

      if (queryParams.length === 0) {
        totalItems = 2499146;
        totalIsExact = false;
      } else {
        const countSql = `SELECT COUNT(*) as total FROM summary_publications ${whereClause}`;

        try {
          const [countResult] = await sequelize.query(withTimeout(countSql, COUNT_BUDGET_MS), {
            replacements: queryParams,
            type: sequelize.QueryTypes.SELECT
          });
          totalItems = parseInt(countResult?.total) || 0;
        } catch (countError) {
          logger.warn('Works vitrine count query exceeded budget, returning estimate', {
            error: countError.message
          });
          totalItems = 2499146;
          totalIsExact = false;
        }
      }

      const selectSql = `
        SELECT
          sp.work_id AS id,
          sp.work_id,
          sp.publication_id,
          latest.publications_count,
          sp.title_search AS title,
          sp.abstract_search AS abstract,
          sp.doi,
          sp.publication_year,
          sp.work_type,
          sp.language,
          sp.open_access,
          sp.peer_reviewed,
          sp.has_files,
          sp.authors_json,
          sp.subjects_json,
          sp.venue_id,
          sp.venue_search AS venue_name,
          sv.abbrev_search AS venue_abbrev,
          sp.work_citation_count AS citation_count,
          sp.work_reference_count AS reference_count
        FROM (
          SELECT
            work_id,
            MAX(publication_id) AS pub_id,
            COUNT(*) AS publications_count
          FROM summary_publications
          ${whereClause}
          GROUP BY work_id
          ORDER BY work_id DESC
          LIMIT ? OFFSET ?
        ) latest
        INNER JOIN summary_publications sp ON sp.publication_id = latest.pub_id
        LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id
        ORDER BY sp.work_id DESC
      `;

      const queryParamsWithPagination = [...queryParams, effectiveLimit, offset];
      const primaryQueryStart = process.hrtime.bigint();

      const works = await sequelize.query(withTimeout(selectSql), {
        replacements: queryParamsWithPagination,
        type: sequelize.QueryTypes.SELECT
      });

      const primaryQueryMs = Number(((process.hrtime.bigint() - primaryQueryStart) / BigInt(1e6)).toString());

      const formattedWorks = works.map(work => {
        const authorsPreview = authorsFromJson(work.authors_json);
        const base = formatWorkListItem({
          id: work.id,
          publication_id: work.publication_id || null,
          publications_count: work.publications_count !== undefined && work.publications_count !== null
            ? parseInt(work.publications_count, 10)
            : null,
          title: work.title,
          subtitle: null,
          abstract: work.abstract,
          work_type: work.work_type,
          language: work.language,
          publication_year: work.publication_year,
          doi: work.doi,
          open_access: work.open_access,
          peer_reviewed: work.peer_reviewed,
          venue_name: work.venue_name || work.venue_abbrev || null,
          venue_abbreviated_name: work.venue_abbrev || null,
          venue_abbrev: work.venue_abbrev || null,
          authors_preview: authorsPreview.slice(0, 3),
          author_count: authorsPreview.length,
          first_author: authorsPreview[0] || null,
          created_at: null
        });

        return {
          ...base,
          author_string: authorsPreview.join('; ') || null,
          subjects_string: subjectsFromJson(work.subjects_json).map(s => s.term).join('; ') || null,
          venue_name: (work.venue_name || work.venue_abbrev) || null,
          venue_abbreviated_name: work.venue_abbrev || null,
          work_type: work.work_type || null,
          year: work.publication_year ?? null,
          created_ts: null,
          created_at: null
        };
      });

      const result = {
        data: formattedWorks,
        pagination: createPagination(page, effectiveLimit, totalItems),
        meta: {
          match_mode: 'any_publication',
          query_source: 'summary_publications',
          pagination_total_exact: totalIsExact,
          performance: {
            engine: 'MariaDB',
            query_type: 'showcase_optimized',
            primary_query_ms: primaryQueryMs,
            total_rows_examined: works.length,
            elapsed_ms: Date.now() - t0
          }
        }
      };

      await cacheService.set(cacheKey, result, 1800);
      return result;

    } catch (error) {
      throw new Error(`Works showcase query failed: ${error.message}`);
    }
  }

  
  async _getWorksVitrine(filters, limit, offset, page) {
    const { type, year_from, year_to, search, open_access, language, peer_reviewed, venue_name, author, subject } = filters;

    const whereConditions = [];
    const filterParams = [];

    if (search) {
      whereConditions.push('sp.title_search LIKE ?');
      filterParams.push(`%${search}%`);
    }

    if (type) {
      whereConditions.push('sp.work_type = ?');
      filterParams.push(type);
    }

    if (language) {
      whereConditions.push('sp.language = ?');
      filterParams.push(language);
    }

    if (year_from) {
      whereConditions.push('sp.publication_year >= ?');
      filterParams.push(parseInt(year_from));
    }

    if (year_to) {
      whereConditions.push('sp.publication_year <= ?');
      filterParams.push(parseInt(year_to));
    }

    if (open_access !== undefined) {
      whereConditions.push('sp.open_access = ?');
      filterParams.push(open_access === 'true' || open_access === true ? 1 : 0);
    }

    if (peer_reviewed !== undefined) {
      whereConditions.push('sp.peer_reviewed = ?');
      filterParams.push(peer_reviewed === 'true' || peer_reviewed === true ? 1 : 0);
    }

    let venueJoin = '';
    if (venue_name) {
      venueJoin = 'LEFT JOIN summary_venues sv_filter ON sv_filter.venue_id = sp.venue_id';
      whereConditions.push('(sp.venue_search LIKE ? OR sv_filter.abbrev_search LIKE ?)');
      filterParams.push(`%${venue_name}%`, `%${venue_name}%`);
    }

    if (author) {
      whereConditions.push('sp.authors_search LIKE ?');
      filterParams.push(`%${author}%`);
    }

    if (subject) {
      whereConditions.push('sp.subjects_search LIKE ?');
      filterParams.push(`%${subject}%`);
    }

    const dbTimeoutMs = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '8000');
    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const COUNT_BUDGET_MS = 2000;
    let totalItems;
    let totalIsExact = true;
    if (filterParams.length === 0) {
      totalItems = 2499146;
      totalIsExact = false;
    } else {
      const countSql = `SELECT COUNT(*) as total FROM summary_publications sp ${venueJoin} ${whereClause}`;

      try {
        const [countRow] = await sequelize.query(withTimeout(countSql, COUNT_BUDGET_MS), {
          replacements: filterParams,
          type: sequelize.QueryTypes.SELECT
        });
        totalItems = parseInt(countRow?.total) || 0;
      } catch (countError) {
        logger.warn('Works showcase count query exceeded budget, returning estimate', {
          error: countError.message,
          filters: Object.keys(filters || {})
        });
        totalItems = 2499146;
        totalIsExact = false;
      }
    }

    const queryParams = [...filterParams, limit, offset];
    const selectSql = `
      SELECT
        sp.work_id AS id,
        sp.work_id,
        sp.publication_id,
        latest.publications_count,
        sp.title_search AS title,
        sp.abstract_search AS abstract,
        sp.doi,
        sp.publication_year,
        sp.work_type,
        sp.language,
        sp.open_access,
        sp.peer_reviewed,
        sp.has_files,
        sp.authors_json,
        sp.subjects_json,
        sp.venue_id,
        sp.venue_search AS venue_name,
        sv.abbrev_search AS venue_abbrev,
        v.type AS venue_type,
        v.issn AS venue_issn,
        v.eissn AS venue_eissn,
        v.scopus_id AS venue_scopus_id,
        v.wikidata_id AS venue_wikidata_id,
        v.openalex_id AS venue_openalex_id,
        sp.work_citation_count AS citation_count,
        sp.work_reference_count AS reference_count
      FROM (
        SELECT
          sp.work_id,
          MAX(sp.publication_id) AS pub_id,
          COUNT(*) AS publications_count
        FROM summary_publications sp
        ${venueJoin}
        ${whereClause}
        GROUP BY sp.work_id
        ORDER BY sp.work_id DESC
        LIMIT ? OFFSET ?
      ) latest
      INNER JOIN summary_publications sp ON sp.publication_id = latest.pub_id
      LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id
      LEFT JOIN venues v ON v.id = sp.venue_id
      ORDER BY sp.work_id DESC
    `;

    const primaryQueryStart = process.hrtime.bigint();
    const works = await Promise.race([
      sequelize.query(selectSql, {
        replacements: queryParams,
        type: sequelize.QueryTypes.SELECT
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Operation timeout')), dbTimeoutMs))
    ]);
    const primaryQueryMs = Number(((process.hrtime.bigint() - primaryQueryStart) / BigInt(1e6)).toString());

    let processedWorks = works.map(work => {
      const authors = authorsFromJson(work.authors_json);

      return {
        id: work.id,
        publication_id: work.publication_id || null,
        publications_count: work.publications_count !== undefined && work.publications_count !== null
          ? parseInt(work.publications_count, 10)
          : null,
        title: work.title,
        subtitle: null,
        abstract: work.abstract || null,
        type: work.work_type,
        language: work.language,
        publication_year: work.publication_year,
        doi: work.doi,
        peer_reviewed: work.peer_reviewed === 1,
        open_access: work.open_access === 1,
        venue: (work.venue_name || work.venue_abbrev)
          ? {
              id: work.venue_id || null,
              name: work.venue_name || work.venue_abbrev,
              abbreviated_name: work.venue_abbrev || null,
              type: work.venue_type || null,
              issn: work.venue_issn || null,
              eissn: work.venue_eissn || null,
              scopus_id: work.venue_scopus_id || null,
              wikidata_id: work.venue_wikidata_id || null,
              openalex_id: work.venue_openalex_id || null
            }
          : null,
        author_count: authors.length,
        first_author: authors.length > 0 ? authors[0] : null,
        authors_preview: authors.slice(0, 3),
        added_to_database: null,
        created_at: null,
        data_source: 'full_api',
        search_engine: null
      };
    });
    processedWorks = uniqueById(processedWorks);

    let publicationsQueryMs = null;
    let authorsQueryMs = null;
    if (processedWorks.length > 0) {
      const ids = processedWorks.map(w => w.id);
      const placeholders = ids.map(() => '?').join(',');

      const authorSql = `
        SELECT a.work_id,
               a.person_id AS first_author_id,
               p.orcid,
               p.scopus_id,
               p.lattes_id
        FROM authorships a
        LEFT JOIN persons p ON p.id = a.person_id
        WHERE a.work_id IN (${placeholders}) AND a.position = 1
      `;
      const authStart = process.hrtime.bigint();
      const authorRows = await sequelize.query(authorSql, {
        replacements: ids,
        type: sequelize.QueryTypes.SELECT
      });
      authorsQueryMs = Number(((process.hrtime.bigint() - authStart) / BigInt(1e6)).toString());
      const authorMap = Object.create(null);
      for (const row of authorRows) authorMap[row.work_id] = row;

      for (const item of processedWorks) {
        const a = authorMap[item.id];
        if (a) {
          item.first_author_id = a.first_author_id || null;
          item.first_author_identifiers = {
            orcid: a.orcid || null,
            scopus_id: a.scopus_id || null,
            lattes_id: a.lattes_id || null
          };
        } else {
          item.first_author_id = item.first_author_id || null;
          item.first_author_identifiers = item.first_author_identifiers || null;
        }
      }
    }

    const items = processedWorks.map(formatWorkListItem);
    return {
      data: items,
      pagination: createPagination(page, limit, totalItems),
      meta: {
        pagination_total_exact: totalIsExact
      },
      performance: {
        engine: 'MariaDB',
        query_type: 'showcase_enriched',
        match_mode: 'any_publication',
        primary_query_ms: primaryQueryMs,
        publications_query_ms: publicationsQueryMs,
        authors_query_ms: authorsQueryMs,
        total_rows_examined: works.length
      }
    };
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
        w.work_type,
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
        w.updated_at
      FROM works w
      WHERE w.id = ?
      LIMIT 1
    `, {
      replacements: [id],
      type: sequelize.QueryTypes.SELECT
    });

    if (!workData) {
      return null;
    }

    const authorsPromise = sequelize.query(`
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
        o.id as affiliation_id,
        o.name as affiliation_name,
        o.type as affiliation_type,
        o.country_code as affiliation_country
      FROM authorships a
      LEFT JOIN persons p ON a.person_id = p.id
      LEFT JOIN organizations o ON a.affiliation_id = o.id
      WHERE a.work_id = ?
      ORDER BY a.position ASC
    `, {
      replacements: [id],
      type: sequelize.QueryTypes.SELECT
    });

    const subjectsPromise = sequelize.query(`
      SELECT 
        s.id as subject_id,
        s.term,
        s.vocabulary,
        s.lang,
        ws.relevance_score,
        ws.assigned_by
      FROM work_subjects ws
      JOIN subjects s ON ws.subject_id = s.id
      WHERE ws.work_id = ?
      ORDER BY ws.relevance_score DESC, s.vocabulary, s.term
    `, {
      replacements: [id],
      type: sequelize.QueryTypes.SELECT
    });

    const fundingPromise = sequelize.query(`
      SELECT 
        f.funder_id,
        o.name AS funder_name,
        f.grant_number,
        f.program_name,
        f.amount,
        f.currency
      FROM funding f
      JOIN organizations o ON o.id = f.funder_id
      WHERE f.work_id = ?
      ORDER BY o.name ASC, f.grant_number ASC
    `, {
      replacements: [id],
      type: sequelize.QueryTypes.SELECT
    });


    const publicationsPromise = sequelize.query(`
      SELECT
        sp.publication_id,
        sp.work_id,
        sp.venue_id,
        sp.publisher_id,
        sp.title_search,
        sp.abstract_search,
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
      LEFT JOIN venues v ON v.id = sp.venue_id
      LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id
      LEFT JOIN organizations publisher ON publisher.id = sp.publisher_id
      WHERE sp.work_id = ?
      ORDER BY sp.publication_year DESC, sp.publication_id DESC
      LIMIT 51
    `, {
      replacements: [id],
      type: sequelize.QueryTypes.SELECT
    });

    let [
      authorsData,
      subjectsData,
      fundingData,
      publicationRows
    ] = await Promise.all([
      authorsPromise,
      subjectsPromise,
      fundingPromise,
      publicationsPromise
    ]);

    const publicationsHasMore = publicationRows.length > 50;
    const cappedPublicationRows = publicationsHasMore
      ? publicationRows.slice(0, 50)
      : publicationRows;

    let publicationsTotal = cappedPublicationRows.length;
    if (publicationsHasMore) {
      const [countRow] = await sequelize.query(
        `SELECT COUNT(*) AS total FROM summary_publications WHERE work_id = ?`,
        { replacements: [id], type: sequelize.QueryTypes.SELECT }
      );
      publicationsTotal = parseInt(countRow?.total) || cappedPublicationRows.length;
    }

    const publicationEntries = cappedPublicationRows.map(formatPublicationEntry);

    const metricsData = {
      citation_count: workData.citation_count,
      reference_count: workData.reference_count,
      altmetric_score: workData.altmetric_score,
      download_count: workData.download_count,
      view_count: workData.view_count,
      social_media_mentions: workData.social_media_mentions,
      news_mentions: workData.news_mentions
    };

    if (!subjectsData || subjectsData.length === 0) {
      const headRow = cappedPublicationRows[0];
      if (headRow) {
        const fromJson = subjectsFromJson(headRow.subjects_json);
        if (fromJson.length > 0) {
          subjectsData = fromJson;
        }
      }
    }

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
      if (row.doi && String(row.doi).trim()) {
        identifiersAgg.doi.add(String(row.doi).trim());
      }
      const parsedIds = parseJsonColumn(row.identifiers_json);
      const idsSource = parsedIds && typeof parsedIds === 'object' ? parsedIds : {};
      for (const key of Object.keys(identifiersAgg)) {
        if (key === 'doi') continue;
        const val = idsSource[key];
        if (val && String(val).trim()) identifiersAgg[key].add(String(val).trim());
      }
    }
    const identifiersAggPlain = Object.fromEntries(
      Object.entries(identifiersAgg).map(([k, set]) => [k, Array.from(set)])
    );

    const queryTime = Number(((process.hrtime.bigint() - startTime) / BigInt(1e6)).toString());

    let citedBy = [];
    let references = [];
    let unresolvedReferences = [];
    try {
      const doiCandidates = buildDoiCandidates(identifiersAggPlain.doi || []);
      const incomingConditions = ['wr.cited_work_id = ?'];
      const incomingReplacements = [id];
      if (doiCandidates.length) {
        incomingConditions.push(`wr.cited_doi IN (${doiCandidates.map(() => '?').join(',')})`);
        incomingReplacements.push(...doiCandidates);
      }
      const incomingRows = await sequelize.query(
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
      );
      const outgoingResolvedRows = await sequelize.query(
        `SELECT wr.cited_work_id, MIN(wr.citation_type) AS citation_type, MIN(wr.cited_doi) AS cited_doi
         FROM work_references wr
         WHERE wr.citing_work_id = ?
           AND wr.cited_work_id IS NOT NULL
           AND wr.status = 'RESOLVED'
         GROUP BY wr.cited_work_id
         ORDER BY wr.cited_work_id DESC
         LIMIT 100`,
        { replacements: [id], type: sequelize.QueryTypes.SELECT }
      );
      const unresolvedRows = await sequelize.query(
        `SELECT wr.cited_doi, wr.status, wr.created_at, wr.resolved_at, wr.citation_type
         FROM work_references wr
         WHERE wr.citing_work_id = ?
           AND wr.status IN ('PENDING', 'FAILED')
         ORDER BY wr.id DESC
         LIMIT 100`,
        { replacements: [id], type: sequelize.QueryTypes.SELECT }
      );

      const inIds = incomingRows.map(r => r.citing_work_id);
      const outIds = outgoingResolvedRows.map(r => r.cited_work_id);
      const allIds = Array.from(new Set([...inIds, ...outIds]));
      let summaryMap = {};
      if (allIds.length) {
        const placeholders = allIds.map(() => '?').join(',');
        const summaryRows = await sequelize.query(
          `SELECT sp.work_id,
                  sp.title_search AS title,
                  sp.publication_year AS year,
                  sp.authors_json,
                  sp.venue_search AS venue_name,
                  sv.abbrev_search AS venue_abbrev,
                  sp.doi,
                  sp.open_access
             FROM summary_publications sp
             LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id
             INNER JOIN (
               SELECT work_id, MAX(publication_id) AS pub_id
               FROM summary_publications
               WHERE work_id IN (${placeholders})
               GROUP BY work_id
             ) latest ON latest.pub_id = sp.publication_id`,
          { replacements: allIds, type: sequelize.QueryTypes.SELECT }
        );
        summaryMap = summaryRows.reduce((acc, row) => {
          acc[row.work_id] = row;
          return acc;
        }, {});
      }

      const citationAuthorString = (row) => {
        const authors = authorsFromJson(row.authors_json);
        return authors.length ? authors.join('; ') : null;
      };

      citedBy = includeCitations ? incomingRows.map(row => {
        const sw = summaryMap[row.citing_work_id] || {};
        return {
          work_id: row.citing_work_id,
          title: sw.title || null,
          authors: citationAuthorString(sw),
          publication_year: sw.year || null,
          venue_name: sw.venue_name || sw.venue_abbrev || null,
          venue_abbreviated_name: sw.venue_abbrev || null,
          open_access: sw.open_access,
          citation_type: row.citation_type || 'NEUTRAL',
          citation_status: row.citation_status || null,
          citation_context: null
        };
      }) : [];

      references = includeReferences ? outgoingResolvedRows.map(row => {
        const sw = summaryMap[row.cited_work_id] || {};
        return {
          work_id: row.cited_work_id,
          title: sw.title || null,
          authors: citationAuthorString(sw),
          publication_year: sw.year || null,
          venue_name: sw.venue_name || sw.venue_abbrev || null,
          venue_abbreviated_name: sw.venue_abbrev || null,
          doi: sw.doi || row.cited_doi || null,
          open_access: sw.open_access,
          citation_type: row.citation_type || 'NEUTRAL',
          citation_context: null
        };
      }) : [];

      unresolvedReferences = includeReferences ? unresolvedRows.map(row => ({
        cited_doi: row.cited_doi || null,
        status: row.status || 'PENDING',
        citation_type: row.citation_type || 'NEUTRAL',
        created_at: row.created_at || null,
        resolved_at: row.resolved_at || null
      })) : [];
    } catch (_) {}

    const completeWork = {
      id: workData.id,
      title: workData.title,
      subtitle: workData.subtitle,
      abstract: workData.abstract,
      type: workData.work_type,
      language: workData.language,
      created_at: workData.created_at,
      updated_at: workData.updated_at,

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
          country: author.affiliation_country
        } : null
      })),

      subjects: subjectsData,

      citations: {
        cited_by: citedBy,
        references: references,
        unresolved_references: unresolvedReferences,
        unsolved: unresolvedReferences
      },

      metrics: metricsData,

      identifiers: identifiersAggPlain,

      funding: fundingData
    };

    return formatWorkDetails(completeWork);
  }

  
  async _getWorksSearchFallback(search, filters, limit, offset, page) {
    const { type, language, year_from, year_to, open_access, peer_reviewed, venue_name, author, subject } = filters || {};
    const trimmed = (search || '').trim();
    const hasContent = Boolean(trimmed);
    const hasMetadata = Boolean(venue_name || author || subject);
    if (!hasContent && !hasMetadata) {
      return { data: [], pagination: createPagination(page, limit, 0) };
    }

    const dbTimeoutMs = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '4000');

    const whereConditions = [];
    const filterParams = [];

    if (hasContent) {
      whereConditions.push('MATCH(sp.title_search, sp.abstract_search) AGAINST (? IN BOOLEAN MODE)');
      filterParams.push(trimmed);
    }

    const metadataTerms = [venue_name, author, subject].filter(Boolean).join(' ');
    if (metadataTerms) {
      whereConditions.push('MATCH(sp.authors_search, sp.venue_search, sp.subjects_search) AGAINST (? IN BOOLEAN MODE)');
      filterParams.push(metadataTerms);
    }

    if (type) {
      whereConditions.push('sp.work_type = ?');
      filterParams.push(type);
    }
    if (language) {
      whereConditions.push('sp.language = ?');
      filterParams.push(language);
    }
    if (year_from) {
      whereConditions.push('sp.publication_year >= ?');
      filterParams.push(parseInt(year_from, 10));
    }
    if (year_to) {
      whereConditions.push('sp.publication_year <= ?');
      filterParams.push(parseInt(year_to, 10));
    }
    if (open_access !== undefined) {
      whereConditions.push('sp.open_access = ?');
      filterParams.push(open_access === true || open_access === 'true' || open_access === 1 || open_access === '1' ? 1 : 0);
    }
    if (peer_reviewed !== undefined) {
      whereConditions.push('sp.peer_reviewed = ?');
      filterParams.push(peer_reviewed === true || peer_reviewed === 'true' || peer_reviewed === 1 || peer_reviewed === '1' ? 1 : 0);
    }

    const relevanceExpr = hasContent
      ? 'MAX(MATCH(sp.title_search, sp.abstract_search) AGAINST (? IN BOOLEAN MODE))'
      : (metadataTerms
        ? 'MAX(MATCH(sp.authors_search, sp.venue_search, sp.subjects_search) AGAINST (? IN BOOLEAN MODE))'
        : '0');
    const innerRelevanceParams = hasContent
      ? [trimmed]
      : (metadataTerms ? [metadataTerms] : []);

    const selectSql = `
      SELECT
        sp.work_id AS id,
        sp.work_id,
        sp.publication_id,
        latest.publications_count,
        latest.relevance,
        sp.title_search AS title,
        sp.abstract_search AS abstract,
        sp.publication_year,
        sp.work_type,
        sp.language,
        sp.open_access,
        sp.peer_reviewed,
        sp.has_files,
        sp.authors_json,
        sp.doi,
        sp.venue_id,
        sp.venue_search AS venue_name,
        sv.abbrev_search AS venue_abbreviated_name,
        w.subtitle,
        w.created_at
      FROM (
        SELECT
          sp.work_id,
          MAX(sp.publication_id) AS pub_id,
          COUNT(*) AS publications_count,
          ${relevanceExpr} AS relevance
        FROM summary_publications sp
        WHERE ${whereConditions.join(' AND ')}
        GROUP BY sp.work_id
        ORDER BY relevance DESC, sp.work_id DESC
        LIMIT ? OFFSET ?
      ) latest
      INNER JOIN summary_publications sp ON sp.publication_id = latest.pub_id
      LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id
      LEFT JOIN works w ON w.id = sp.work_id
      ORDER BY latest.relevance DESC, sp.work_id DESC
    `;

    const queryParams = [...innerRelevanceParams, ...filterParams, limit, offset];
    const primaryQueryStart = process.hrtime.bigint();
    const rows = await sequelize.query(withTimeout(selectSql, dbTimeoutMs), {
      replacements: queryParams,
      type: sequelize.QueryTypes.SELECT
    });
    const primaryQueryMs = Number(((process.hrtime.bigint() - primaryQueryStart) / BigInt(1e6)).toString());

    let totalItems;
    let totalIsExact = true;
    const distinctCountSql = `
      SELECT COUNT(DISTINCT sp.work_id) AS total
      FROM summary_publications sp
      WHERE ${whereConditions.join(' AND ')}
    `;
    try {
      const [countRow] = await sequelize.query(withTimeout(distinctCountSql, 2000), {
        replacements: filterParams,
        type: sequelize.QueryTypes.SELECT
      });
      totalItems = parseInt(countRow?.total) || 0;
    } catch (countError) {
      logger.warn('Works search fallback count exceeded budget, using lower-bound estimate', {
        error: countError.message
      });
      totalItems = offset + rows.length + (rows.length === limit ? limit : 0);
      totalIsExact = false;
    }

    const processed = (rows || []).map(row => {
      const authors = authorsFromJson(row.authors_json);
      return {
        id: row.work_id,
        publication_id: row.publication_id || null,
        publications_count: row.publications_count !== undefined && row.publications_count !== null
          ? parseInt(row.publications_count, 10)
          : null,
        title: row.title,
        subtitle: row.subtitle || null,
        abstract: row.abstract || null,
        work_type: row.work_type,
        language: row.language,
        publication_year: row.publication_year,
        doi: row.doi,
        peer_reviewed: row.peer_reviewed === 1,
        open_access: row.open_access === 1,
        venue: row.venue_name ? {
          id: row.venue_id || null,
          name: row.venue_name,
          abbreviated_name: row.venue_abbreviated_name || null
        } : null,
        author_count: authors.length,
        first_author: authors[0] || null,
        authors_preview: authors.slice(0, 3),
        added_to_database: row.created_at,
        data_source: 'showcase',
        search_engine: 'MariaDB'
      };
    });

    const items = processed.map(formatWorkListItem);
    return {
      data: items,
      pagination: createPagination(page, limit, totalItems),
      meta: {
        pagination_total_exact: totalIsExact
      },
      performance: {
        engine: 'MariaDB',
        query_type: 'search_fallback',
        match_mode: 'any_publication',
        primary_query_ms: primaryQueryMs
      }
    };
  }

  
  async _getWorksFromSphinx(search, filters) {
    const pagination = normalizePagination(filters);
    const { limit, offset } = pagination;

    const spx = await SphinxService.searchPublicationIds(search, {
      work_type: filters?.type,
      language: filters?.language,
      year_from: filters?.year_from,
      year_to: filters?.year_to,
      peer_reviewed: filters?.peer_reviewed,
      open_access: filters?.open_access,
      venue_name: filters?.venue_name,
      author: filters?.author,
      subject: filters?.subject,
      venue_id: filters?.venue_id,
      publisher_id: filters?.publisher_id,
      citation_count_min: filters?.citation_count_min,
      reference_count_min: filters?.reference_count_min,
      has_files: filters?.has_files
    }, { limit, offset });

    const matchedPubIds = Array.isArray(spx?.publication_ids) ? spx.publication_ids : (Array.isArray(spx?.ids) ? spx.ids : []);
    const matchedWorkIds = Array.isArray(spx?.work_ids) ? spx.work_ids : [];
    const total = parseInt(spx?.total || 0, 10) || 0;

    if (matchedPubIds.length === 0) {
      return {
        data: [],
        pagination: createPagination(pagination.page, limit, total),
        performance: {
          engine: 'Sphinx+MariaDB',
          query_type: 'search_hydrate',
          match_mode: 'any_publication',
          sphinx_query_ms: spx?.query_time || null
        }
      };
    }

    const seen = new Set();
    const orderedPubIds = [];
    for (let i = 0; i < matchedPubIds.length; i += 1) {
      const wid = matchedWorkIds[i];
      if (wid === null || wid === undefined) continue;
      if (seen.has(wid)) continue;
      seen.add(wid);
      orderedPubIds.push(matchedPubIds[i]);
    }

    if (orderedPubIds.length === 0) {
      return {
        data: [],
        pagination: createPagination(pagination.page, limit, total),
        performance: {
          engine: 'Sphinx+MariaDB',
          query_type: 'search_hydrate',
          match_mode: 'any_publication',
          sphinx_query_ms: spx?.query_time || null
        }
      };
    }

    const placeholders = orderedPubIds.map(() => '?').join(',');
    const orderField = `FIELD(sp.publication_id, ${placeholders})`;
    const dbTimeoutMs = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '6000');
    const hydrateStart = process.hrtime.bigint();

    const rows = await Promise.race([
      sequelize.query(`
        SELECT
          sp.work_id AS id,
          sp.work_id,
          sp.publication_id,
          sp.title_search AS title,
          sp.abstract_search AS abstract,
          sp.publication_year,
          sp.work_type,
          sp.language,
          sp.open_access,
          sp.peer_reviewed,
          sp.has_files,
          sp.authors_json,
          sp.doi,
          sp.venue_id,
          sp.venue_search AS venue_name,
          sv.abbrev_search AS venue_abbreviated_name,
          w.subtitle,
          w.created_at
        FROM summary_publications sp
        LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id
        LEFT JOIN works w ON w.id = sp.work_id
        WHERE sp.publication_id IN (${placeholders})
        ORDER BY ${orderField}
      `, {
        replacements: [...orderedPubIds, ...orderedPubIds],
        type: sequelize.QueryTypes.SELECT
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Operation timeout')), dbTimeoutMs))
    ]);
    const hydrateMs = Number(((process.hrtime.bigint() - hydrateStart) / BigInt(1e6)).toString());

    const processedWorks = (rows || []).map(row => {
      const authors = authorsFromJson(row.authors_json);
      return {
        id: row.work_id,
        publication_id: row.publication_id || null,
        title: row.title,
        subtitle: row.subtitle || null,
        abstract: row.abstract || null,
        work_type: row.work_type || 'ARTICLE',
        language: row.language || null,
        publication_year: row.publication_year || null,
        doi: row.doi || null,
        open_access: row.open_access === 1,
        peer_reviewed: row.peer_reviewed === 1,
        venue: row.venue_name ? {
          id: row.venue_id || null,
          name: row.venue_name,
          abbreviated_name: row.venue_abbreviated_name || null
        } : null,
        author_count: authors.length,
        first_author: authors[0] || null,
        authors_preview: authors.slice(0, 3),
        added_to_database: row.created_at,
        data_source: 'showcase',
        search_engine: 'Sphinx'
      };
    });

    const uniqueWorks = uniqueById(processedWorks);
    if (uniqueWorks.length > 0) {
      const workIds = uniqueWorks.map((w) => w.id).filter(Boolean);
      if (workIds.length > 0) {
        const countPlaceholders = workIds.map(() => '?').join(',');
        const countRows = await sequelize.query(
          `SELECT work_id, COUNT(*) AS publications_count
             FROM summary_publications
             WHERE work_id IN (${countPlaceholders})
             GROUP BY work_id`,
          { replacements: workIds, type: sequelize.QueryTypes.SELECT }
        );
        const countMap = new Map(countRows.map((r) => [r.work_id, parseInt(r.publications_count, 10)]));
        for (const work of uniqueWorks) {
          work.publications_count = countMap.get(work.id) ?? null;
        }
      }
    }

    const items = uniqueWorks.map(formatWorkListItem);

    return {
      data: items,
      pagination: createPagination(pagination.page, limit, total),
      performance: {
        engine: 'Sphinx+MariaDB',
        query_type: 'search_hydrate',
        match_mode: 'any_publication',
        sphinx_query_ms: spx?.query_time || null,
        hydrate_query_ms: hydrateMs
      }
    };
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
      const [bibliography] = await pool.execute({ sql: paginatedQuery, timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS || '3000') }, params);

      const countQuery = `SELECT COUNT(*) as total FROM ( ${baseQuery} ${groupOrderClause} ) t`;
      const [countRows] = await pool.execute({ sql: countQuery, timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS || '3000') }, whereParams);
      const total = parseInt(countRows?.[0]?.total) || 0;

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
