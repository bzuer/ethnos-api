const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const personsService = require('./persons.service');
const worksService = require('./works.service');
const { createPagination, normalizePagination } = require('../utils/pagination');
const { isAutocorrectEnabled } = require('../utils/spelling');


class SearchService {
  async searchWorks(query, filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { type, language, year_from, year_to, peer_reviewed, open_access, venue_name, author, subject } = filters;
    const citedByMin = filters.cited_by_min ?? filters.citation_count_min ?? null;
    const citedByMax = filters.cited_by_max ?? filters.citation_count_max ?? null;
    const sortBy = filters.sort_by ?? filters.sortBy ?? null;
    const sortOrder = filters.sort_order ?? filters.sortOrder ?? null;
    const trimmedQuery = (query || '').trim();
    const autocorrect = isAutocorrectEnabled(filters.autocorrect);

    const cacheKey = `search:works:v6:${autocorrect ? 1 : 0}:${trimmedQuery}:${page}:${limit}:${offset}:${type || 'all'}:${language || 'all'}:${year_from || 'all'}:${year_to || 'all'}:${peer_reviewed === undefined ? 'all' : Number(Boolean(peer_reviewed))}:${open_access === undefined ? 'all' : Number(Boolean(open_access))}:${venue_name || 'all'}:${author || 'all'}:${subject || 'all'}:${citedByMin ?? 'all'}:${citedByMax ?? 'all'}:${sortBy || 'default'}:${sortOrder || 'desc'}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Works search retrieved from cache');
        return cached;
      }

      const worksFilters = {
        page,
        limit,
        offset,
        search: trimmedQuery,
        type,
        language,
        year_from,
        year_to,
        peer_reviewed,
        open_access,
        venue_name,
        author,
        subject,
        cited_by_min: citedByMin,
        cited_by_max: citedByMax,
        sort_by: sortBy,
        sort_order: sortOrder,
        autocorrect
      };

      const worksResult = await worksService.getWorks(worksFilters);

      const data = (worksResult.data || []).map(item => ({
        ...item,
        relevance: null
      }));

      const result = {
        data,
        pagination: worksResult.pagination || createPagination(page, limit, data.length),
        meta: {
          query: trimmedQuery,
          search_type: 'fulltext',
          ...(worksResult.meta?.match_mode ? { match_mode: worksResult.meta.match_mode } : {}),
          pagination_total_exact: worksResult.meta?.pagination_total_exact ?? true,
          ...(worksResult.meta?.query_revision ? { query_revision: worksResult.meta.query_revision } : {})
        },
        performance: {
          ...((worksResult && worksResult.performance) || (worksResult && worksResult.meta && worksResult.meta.performance) || {}),
          controller: 'searchWorks'
        }
      };

      await cacheService.set(cacheKey, result, 300);
      logger.info(`Works search cached: "${trimmedQuery}" - ${result.pagination.total} results`);
      return result;
    } catch (error) {
      logger.error('Error in works search:', error);
      throw error;
    }
  }

  async searchPersons(query, filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const verified = filters.verified === 'true' || filters.verified === '1' || filters.verified === true
      ? true
      : (filters.verified === 'false' || filters.verified === '0' || filters.verified === false ? false : undefined);
    const trimmedQuery = (query || '').trim();
    const autocorrect = isAutocorrectEnabled(filters.autocorrect);
    const cacheKey = `search:persons:v3:${autocorrect ? 1 : 0}:${trimmedQuery}:${page}:${limit}:${offset}:${verified ?? 'all'}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Persons search retrieved from cache');
        return cached;
      }

      const serviceResult = await personsService.searchPersons(trimmedQuery, {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        verified,
        autocorrect
      });
      logger.info(`Persons search completed: "${trimmedQuery}" - ${serviceResult.data.length} results`);

      const data = (serviceResult.data || []).map(person => ({
        ...person,
        relevance: person.relevance !== undefined && person.relevance !== null
          ? person.relevance
          : null
      }));

      const result = {
        data,
        pagination: serviceResult.pagination || createPagination(page, limit, data.length),
        meta: {
          query: trimmedQuery,
          search_type: 'fulltext',
          ...(verified !== undefined ? { verified } : {}),
          ...(serviceResult.meta || {})
        },
        performance: {
          ...(serviceResult.performance || {}),
          controller: 'searchPersons'
        }
      };

      await cacheService.set(cacheKey, result, 300);
      return result;
    } catch (error) {
      logger.error('Error in persons search:', error);
      throw error;
    }
  }


  async globalSearch(query, filters = {}) {
    const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 5, 1), 20);
    const trimmedQuery = (query || '').trim();
    const autocorrect = isAutocorrectEnabled(filters.autocorrect);

    const cacheKey = `search:global:v4:${autocorrect ? 1 : 0}:${trimmedQuery}:${limit}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Global search retrieved from cache');
        return cached;
      }

      const start = process.hrtime.bigint();

      const [works, persons] = await Promise.all([
        this.searchWorks(trimmedQuery, { page: 1, limit, offset: 0, autocorrect }),
        this.searchPersons(trimmedQuery, { page: 1, limit, offset: 0, autocorrect })
      ]);

      const totalTimeMs = Number(((process.hrtime.bigint() - start) / BigInt(1e6)).toString());

      const result = {
        data: {
          works: {
            total: works.pagination.total,
            results: works.data.slice(0, limit),
            ...(works.meta?.query_revision ? { query_revision: works.meta.query_revision } : {})
          },
          persons: {
            total: persons.pagination.total,
            results: persons.data.slice(0, limit),
            ...(persons.meta?.query_revision ? { query_revision: persons.meta.query_revision } : {})
          },
          institutions: {
            total: null,
            results: [],
            note: 'Institutions are not part of the global search; query /institutions?q= instead'
          }
        },
        meta: {
          query: trimmedQuery,
          query_time_ms: totalTimeMs,
          sources: {
            works: works.performance || null,
            persons: persons.performance || null,
            institutions: null
          }
        }
      };

      await cacheService.set(cacheKey, result, 300);
      logger.info(`Global search cached: "${trimmedQuery}"`);

      return result;
    } catch (error) {
      logger.error('Error in global search:', error);
      throw error;
    }
  }
}

module.exports = new SearchService();
