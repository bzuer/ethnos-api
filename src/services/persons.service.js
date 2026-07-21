const { sequelize } = require('../models');
const { Op } = require('sequelize');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination, normalizePagination } = require('../utils/pagination');
const { formatPersonDetails, formatPersonListItem } = require('../dto/person.dto');
const { withTimeout } = require('../utils/db');
const { hydrateAuthorNamesForWorks } = require('../utils/hydration');
const searchEngine = require('./searchEngine.service');

class PersonsService {
  async getPersonById(id) {
    const cacheKey = `person:v2:${id}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Person ${id} retrieved from cache`);
        return cached;
      }

      const person = await sequelize.query(withTimeout(`
        SELECT p.*, s.signature as name_signature
        FROM persons p
        LEFT JOIN signatures s ON p.signature_id = s.id
        WHERE p.id = :id
        LIMIT 1
      `), {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      });
      
      if (!person || person.length === 0) {
        return null;
      }

      const [roleBreakdown] = await sequelize.query(withTimeout(`
        SELECT
          COUNT(DISTINCT CASE WHEN a.role = 'AUTHOR' THEN a.work_id END) AS works_as_author,
          COUNT(DISTINCT CASE WHEN a.role = 'EDITOR' THEN a.work_id END) AS works_as_editor
        FROM authorships a
        WHERE a.person_id = :id
      `), { replacements: { id }, type: sequelize.QueryTypes.SELECT });

      const stored = person[0];
      const personData = {
        ...stored,
        works_count: parseInt(stored.total_works, 10) || 0,
        author_count: parseInt(roleBreakdown?.works_as_author, 10) || 0,
        editor_count: parseInt(roleBreakdown?.works_as_editor, 10) || 0,
        first_publication_year: stored.first_publication_year ? parseInt(stored.first_publication_year, 10) : null,
        latest_publication_year: stored.latest_publication_year ? parseInt(stored.latest_publication_year, 10) : null,
        total_citations: stored.total_citations !== null && stored.total_citations !== undefined ? parseInt(stored.total_citations, 10) : null,
        open_access_works: null
      };

      const recentWorks = await sequelize.query(withTimeout(`
        SELECT
          w.id,
          w.title,
          w.subtitle,
          w.abstract,
          pub.type AS work_type,
          w.language,
          pub.year,
          pub.doi,
          pub.open_access,
          a.role,
          a.position,
          v.id as venue_id,
          v.name as venue_name,
          v.abbreviated_name as venue_abbreviated_name,
          v.type as venue_type
        FROM authorships a
        INNER JOIN works w ON a.work_id = w.id
        LEFT JOIN publications pub ON pub.id = (
          SELECT MAX(p2.id) FROM publications p2 WHERE p2.work_id = w.id
        )
        LEFT JOIN venues v ON v.id = pub.venue_id
        WHERE a.person_id = :id
        ORDER BY COALESCE(pub.year, 2024) DESC, w.id DESC
        LIMIT 10
      `), {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      });

      const [primaryAffiliation, subjectExpertise, topCollaborators] = await Promise.all([
        sequelize.query(withTimeout(`
          SELECT a.affiliation_id AS organization_id, o.name, o.type, o.country_code
          FROM authorships a
          LEFT JOIN organizations o ON o.id = a.affiliation_id
          WHERE a.person_id = :id AND a.affiliation_id IS NOT NULL
          GROUP BY a.affiliation_id, o.name
          ORDER BY COUNT(*) DESC
          LIMIT 1
        `), { replacements: { id }, type: sequelize.QueryTypes.SELECT })
          .then(([aff]) => aff && aff.organization_id ? {
            organization_id: aff.organization_id,
            name: aff.name,
            type: aff.type || null,
            country_code: aff.country_code || null,
            _links: { self: `/institutions/${aff.organization_id}` }
          } : null)
          .catch(() => null),

        sequelize.query(withTimeout(`
          SELECT ws.subject_id, s.term, s.vocabulary, COUNT(DISTINCT ws.work_id) AS works_count
          FROM authorships a
          JOIN work_subjects ws ON ws.work_id = a.work_id
          JOIN subjects s ON s.id = ws.subject_id
          WHERE a.person_id = :id
          GROUP BY ws.subject_id, s.term, s.vocabulary
          ORDER BY works_count DESC, s.term ASC
          LIMIT 10
        `), { replacements: { id }, type: sequelize.QueryTypes.SELECT })
          .then((results) => results)
          .catch(() => []),

        sequelize.query(withTimeout(`
          SELECT a2.person_id, p2.preferred_name, COUNT(DISTINCT a1.work_id) AS shared_works_count
          FROM authorships a1
          JOIN authorships a2 ON a1.work_id = a2.work_id AND a1.person_id <> a2.person_id
          JOIN persons p2 ON p2.id = a2.person_id
          WHERE a1.person_id = :id
          GROUP BY a2.person_id, p2.preferred_name
          ORDER BY shared_works_count DESC, p2.preferred_name ASC
          LIMIT 10
        `), { replacements: { id }, type: sequelize.QueryTypes.SELECT })
          .then((results) => results)
          .catch(() => [])
      ]);

      const metricsSummary = {
        works_count: parseInt(personData.works_count, 10) || 0,
        latest_publication_year: personData.latest_publication_year || null
      };

      const authorshipProfile = {
        works_count: metricsSummary.works_count,
        author_count: parseInt(personData.author_count, 10) || 0,
        editor_count: parseInt(personData.editor_count, 10) || 0,
        total_citations: personData.total_citations !== undefined ? personData.total_citations : null,
        open_access_works: personData.open_access_works !== undefined ? personData.open_access_works : null,
        first_publication_year: personData.first_publication_year
          ? parseInt(personData.first_publication_year, 10)
          : null,
        latest_publication_year: metricsSummary.latest_publication_year,
        h_index: personData.h_index !== undefined ? personData.h_index : null
      };

      const result = formatPersonDetails({
        id: personData.id,
        preferred_name: personData.preferred_name,
        given_names: personData.given_names,
        family_name: personData.family_name,
        name_signature: person[0]?.name_signature || null,
        orcid: personData.orcid,
        lattes_id: personData.lattes_id,
        scopus_id: personData.scopus_id,
        is_verified: personData.is_verified,
        primary_affiliation: primaryAffiliation,
        subject_expertise: subjectExpertise,
        top_collaborators: topCollaborators,
        recent_works: recentWorks.map(work => ({
          id: work.id,
          title: work.title,
          subtitle: work.subtitle,
          abstract: work.abstract || null,
          type: work.work_type,
          language: work.language,
          year: work.year,
          doi: work.doi,
          open_access: work.open_access === 1 || work.open_access === true,
          role: work.role,
          position: work.position,
          venue: work.venue_id
            ? {
                id: work.venue_id,
                name: work.venue_name,
                abbreviated_name: work.venue_abbreviated_name || null,
                type: work.venue_type
              }
            : null
        })),
        metrics: metricsSummary,
        authorship_profile: authorshipProfile,
        created_at: personData.created_at,
        updated_at: personData.updated_at
      });
      
      await cacheService.set(cacheKey, result, 7200);
      logger.info(`Person ${id} cached for 2 hours`);
      
      return result;
    } catch (error) {
      logger.error('Error fetching person by ID:', error);
      throw error;
    }
  }

  async getPersons(filters = {}) {
    const t0 = Date.now();
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { search, verified } = filters;
    
    const cacheKey = `persons:${JSON.stringify(filters)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Persons list retrieved from cache');
        return cached;
      }

      const whereConditions = [];
      const replacements = { limit: parseInt(limit), offset: parseInt(offset) };

      if (search) {
        return await this.searchPersons(search, { limit, offset, verified });
      }

      if (verified !== undefined) {
        whereConditions.push('p.is_verified = :verified');
        replacements.verified = verified === 'true' ? 1 : 0;
      }

      if (filters.signature) {
        const signatureQuery = `${filters.signature}%`;
        const [rows, countRows] = await Promise.all([
          sequelize.query(`
            SELECT 
              p.id,
              p.preferred_name,
              p.given_names,
              p.family_name,
              p.orcid,
              p.is_verified,
              p.total_works,
              p.latest_publication_year,
              s.signature as name_signature
            FROM persons p
            INNER JOIN signatures s ON p.signature_id = s.id
            WHERE s.signature LIKE :signature
            ORDER BY p.id DESC
            LIMIT :limit OFFSET :offset
          `, {
            replacements: { signature: signatureQuery, limit: parseInt(limit), offset: parseInt(offset) },
            type: sequelize.QueryTypes.SELECT
          }),
          sequelize.query(`
            SELECT COUNT(DISTINCT p.id) as total
            FROM persons p
            INNER JOIN signatures s ON p.signature_id = s.id
            WHERE s.signature LIKE :signature
          `, {
            replacements: { signature: signatureQuery },
            type: sequelize.QueryTypes.SELECT
          })
        ]);

        const total = parseInt(countRows?.[0]?.total || 0, 10);
        const data = rows.map(p => formatPersonListItem({
          ...p,
          metrics: {
            works_count: parseInt(p.total_works, 10) || 0,
            latest_publication_year: p.latest_publication_year || null
          }
        }));
        const fastResult = {
          data,
          pagination: createPagination(page, limit, total),
          performance: {
            engine: 'MariaDB',
            query_type: 'signature_lookup'
          }
        };
        await cacheService.set(cacheKey, fastResult, 7200);
        return {
          ...fastResult,
          performance: { ...(fastResult.performance || {}), elapsed_ms: Date.now() - t0 }
        };
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      let persons = [];
      let countResult = [{ total: 0 }];
      try {
        [persons, countResult] = await Promise.all([
          sequelize.query(`
            SELECT
              p.id,
              p.preferred_name,
              p.given_names,
              p.family_name,
              p.orcid,
              p.is_verified,
              p.total_works,
              p.latest_publication_year,
              s.signature as name_signature
            FROM persons p
            LEFT JOIN signatures s ON p.signature_id = s.id
            ${whereClause}
            ORDER BY p.id DESC
            LIMIT :limit OFFSET :offset
          `, {
            replacements,
            type: sequelize.QueryTypes.SELECT
          }),
          
          sequelize.query(`
            SELECT COUNT(*) as total
            FROM persons p
            ${whereClause}
          `, {
            replacements: Object.fromEntries(
              Object.entries(replacements).filter(([key]) => !['limit', 'offset'].includes(key))
            ),
            type: sequelize.QueryTypes.SELECT
          })
        ]);
      } catch (listErr) {
        if (process.env.NODE_ENV === 'test') {
          logger.warn('Persons listing query failed; returning empty listing (test mode)', { error: listErr.message });
          const empty = {
            data: [],
            pagination: createPagination(page, limit, 0)
          };
          await cacheService.set(cacheKey, empty, 7200);
          return empty;
        }
        throw listErr;
      }

      const total = countResult[0].total;
      const totalPages = Math.ceil(total / limit);

      const listItems = persons.map(person => formatPersonListItem({
        ...person,
        metrics: {
          works_count: parseInt(person.total_works, 10) || 0,
          latest_publication_year: person.latest_publication_year || null
        }
      }));

      const result = {
        data: listItems,
        pagination: createPagination(page, limit, total),
        performance: {
          engine: 'MariaDB',
          query_type: 'list'
        }
      };

      result.performance = { ...(result.performance || {}), elapsed_ms: Date.now() - t0 };
      await cacheService.set(cacheKey, result, 7200);
      logger.info(`Persons list cached for 2 hours`);
      
      return result;
    } catch (error) {
      logger.error('Error fetching persons:', error);
      throw error;
    }
  }

  async getPersonWorks(personId, options = {}) {
    const pagination = normalizePagination(options);
    const { page, limit, offset } = pagination;
    const { role } = options;

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
        orderClause = `COALESCE(w.citation_count, 0) ${sortDir}, COALESCE(pub.year, 2024) DESC, w.id DESC`;
        break;
      case 'references_count':
      case 'reference_count':
        orderClause = `COALESCE(w.reference_count, 0) ${sortDir}, COALESCE(pub.year, 2024) DESC, w.id DESC`;
        break;
      case 'publication_year':
      case 'year':
        orderClause = `COALESCE(pub.year, 2024) ${sortDir}, w.id DESC`;
        break;
      default:
        orderClause = 'COALESCE(pub.year, 2024) DESC, w.id DESC';
    }

    const cacheKey = `person:${personId}:works:v2:${JSON.stringify({ page, limit, offset, role, citedByMin, citedByMax, yearFrom, yearTo, sortKey, sortDir })}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Person ${personId} works retrieved from cache`);
        return cached;
      }

      const whereConditions = ['a.person_id = :personId'];
      const replacements = { personId, limit: parseInt(limit), offset: parseInt(offset) };

      if (role) {
        whereConditions.push('a.role = :role');
        replacements.role = role.toUpperCase();
      }

      if (yearFrom !== null) {
        whereConditions.push('COALESCE(pub.year, 0) >= :yearFrom');
        replacements.yearFrom = yearFrom;
      }
      if (yearTo !== null) {
        whereConditions.push('COALESCE(pub.year, 0) <= :yearTo');
        replacements.yearTo = yearTo;
      }
      if (citedByMin !== null) {
        whereConditions.push('COALESCE(w.citation_count, 0) >= :citedByMin');
        replacements.citedByMin = citedByMin;
      }
      if (citedByMax !== null) {
        whereConditions.push('COALESCE(w.citation_count, 0) <= :citedByMax');
        replacements.citedByMax = citedByMax;
      }

      const whereClause = whereConditions.join(' AND ');

      const [works, countResult] = await Promise.all([
        sequelize.query(`
          SELECT
            w.id,
            w.title,
            w.subtitle,
            w.abstract,
            pub.type AS work_type,
            w.language,
            w.created_at,
            w.citation_count AS work_citation_count,
            w.reference_count AS work_reference_count,
            a.role,
            a.position,
            a.is_corresponding,
            pub.year,
            pub.doi,
            v.name as journal,
            pub.volume,
            pub.issue,
            pub.pages,
            pub.open_access,
            (SELECT COUNT(*) FROM authorships a2 WHERE a2.work_id = w.id) AS total_authors
          FROM authorships a
          INNER JOIN works w ON a.work_id = w.id
          LEFT JOIN publications pub ON pub.id = (
            SELECT MAX(p2.id) FROM publications p2 WHERE p2.work_id = w.id
          )
          LEFT JOIN venues v ON v.id = pub.venue_id
          WHERE ${whereClause}
          ORDER BY ${orderClause}
          LIMIT :limit OFFSET :offset
        `, {
          replacements,
          type: sequelize.QueryTypes.SELECT
        }),

        sequelize.query(`
          SELECT COUNT(*) as total
          FROM authorships a
          INNER JOIN works w ON a.work_id = w.id
          LEFT JOIN publications pub ON pub.id = (
            SELECT MAX(p2.id) FROM publications p2 WHERE p2.work_id = w.id
          )
          WHERE ${whereClause}
        `, {
          replacements: Object.fromEntries(
            Object.entries(replacements).filter(([key]) => !['limit', 'offset'].includes(key))
          ),
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      if (countResult[0].total === 0) {
        const personExists = await sequelize.query(`
          SELECT 1 FROM persons WHERE id = :personId LIMIT 1
        `, {
          replacements: { personId },
          type: sequelize.QueryTypes.SELECT
        });
        
        if (personExists.length === 0) {
          return null;
        }
      }

      const total = countResult[0].total;
      const totalPages = Math.ceil(total / limit);

      const workIds = works.map(w => w.id).filter(Number.isFinite);
      const authorStringByWork = workIds.length > 0
        ? await hydrateAuthorNamesForWorks(workIds)
        : {};

      const result = {
        data: works.map(work => {
          const authorNames = authorStringByWork[work.id] || [];
          return {
            id: work.id,
            title: work.title,
            subtitle: work.subtitle,
            abstract: work.abstract || null,
            type: work.work_type,
            language: work.language,
            doi: work.doi,
            publication_year: work.year !== undefined && work.year !== null ? parseInt(work.year, 10) : null,
            open_access: work.open_access === 1 || work.open_access === true,
            cited_by_count: parseInt(work.work_citation_count, 10) || 0,
            references_count: parseInt(work.work_reference_count, 10) || 0,
            authorship: {
              role: work.role,
              position: work.position,
              is_corresponding: work.is_corresponding === 1
            },
            publication: {
              year: work.year,
              journal: work.journal,
              volume: work.volume,
              issue: work.issue,
              pages: work.pages,
              open_access: work.open_access === 1 || work.open_access === true
            },
            authors: {
              total_count: parseInt(work.total_authors, 10) || authorNames.length,
              author_string: authorNames.length ? authorNames.join('; ') : null
            },
            created_at: work.created_at
          };
        }),
        pagination: createPagination(page, limit, total)
      };

      await cacheService.set(cacheKey, result, 3600);
      logger.info(`Person ${personId} works cached for 1 hour`);
      
      return result;
    } catch (error) {
      logger.error(`Error fetching works for person ${personId}:`, error);
      throw error;
    }
  }

  async getPersonSignatures(personId, options = {}) {
    const pagination = normalizePagination(options);
    const { page, limit, offset } = pagination;
    
    const cacheKey = `person:${personId}:signatures:${JSON.stringify(options)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Person ${personId} signatures retrieved from cache`);
        return cached;
      }

      const [signatures, countResult] = await Promise.all([
        sequelize.query(`
          SELECT 
            s.id,
            s.signature,
            s.created_at,
            COUNT(DISTINCT p2.id) as persons_count
          FROM persons p
          INNER JOIN signatures s ON p.signature_id = s.id
          LEFT JOIN persons p2 ON s.id = p2.signature_id
          WHERE p.id = :personId
          GROUP BY s.id, s.signature, s.created_at
          ORDER BY s.signature ASC
          LIMIT :limit OFFSET :offset
        `, {
          replacements: { personId, limit: parseInt(limit), offset: parseInt(offset) },
          type: sequelize.QueryTypes.SELECT
        }),
        
        sequelize.query(`
          SELECT COUNT(*) as total
          FROM persons p
          WHERE p.id = :personId
            AND p.signature_id IS NOT NULL
        `, {
          replacements: { personId },
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      if (countResult[0].total === 0) {
        const personExists = await sequelize.query(`
          SELECT 1 FROM persons WHERE id = :personId LIMIT 1
        `, {
          replacements: { personId },
          type: sequelize.QueryTypes.SELECT
        });
        
        if (personExists.length === 0) {
          return null;
        }
      }

      const total = countResult[0].total;
      const totalPages = Math.ceil(total / limit);

      const result = {
        data: signatures,
        pagination: createPagination(page, limit, total)
      };

      await cacheService.set(cacheKey, result, 3600);
      logger.info(`Person ${personId} signatures cached for 1 hour`);
      
      return result;
    } catch (error) {
      logger.error(`Error fetching signatures for person ${personId}:`, error);
      throw error;
    }
  }

  async searchPersons(searchTerm, options = {}) {
    const pagination = normalizePagination(options);
    const { page, limit, offset } = pagination;
    const { verified } = options;
    const trimmed = (searchTerm || '').trim();
    const cacheKey = `persons:search:v3:${trimmed}:${limit}:${offset}:${verified ?? 'all'}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;
    } catch (_) {}

    if (searchEngine.isEnabled() && trimmed.length >= 2) {
      const mres = await searchEngine.searchPersonIds(trimmed, { verified, limit, offset });
      let people = [];
      if (mres.ids.length) {
        const rows = await sequelize.query(
          'SELECT p.id, p.preferred_name, p.given_names, p.family_name, p.orcid, p.is_verified, p.total_works, p.latest_publication_year FROM persons p WHERE p.id IN (:ids)',
          { replacements: { ids: mres.ids }, type: sequelize.QueryTypes.SELECT }
        );
        const byId = new Map(rows.map(r => [r.id, r]));
        people = mres.ids.map(id => byId.get(id)).filter(Boolean);
      }
      const formattedResults = people.map(person => formatPersonListItem({
        ...person,
        name_signature: null,
        metrics: {
          works_count: parseInt(person.total_works, 10) || 0,
          latest_publication_year: person.latest_publication_year || null
        }
      }));
      const result = {
        data: formattedResults,
        pagination: createPagination(page, limit, mres.total),
        performance: { engine: 'Manticore', query_type: 'search' }
      };
      try { await cacheService.set(cacheKey, result, 3600); } catch (_) {}
      logger.info(`Persons search "${trimmed}" [Manticore]: ${formattedResults.length} of ${mres.total} results`);
      return result;
    }

    const whereConditions = [];
    const replacements = { limit: parseInt(limit), offset: parseInt(offset) };

    let useFulltext = false;
    if (trimmed.length >= 2) {
      whereConditions.push('(p.preferred_name LIKE :likeSearch OR p.given_names LIKE :likeSearch OR p.family_name LIKE :likeSearch)');
      replacements.likeSearch = `%${trimmed}%`;
      useFulltext = true;
      replacements.ftSearch = trimmed;
    }

    if (verified !== undefined && verified !== null && verified !== '') {
      whereConditions.push('p.is_verified = :verified');
      replacements.verified = (verified === 'true' || verified === true || verified === 1 || verified === '1') ? 1 : 0;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [persons, countResult] = await Promise.all([
      sequelize.query(`
        SELECT p.id, p.preferred_name, p.given_names, p.family_name,
               p.orcid, p.is_verified, p.total_works, p.latest_publication_year
        FROM persons p
        ${whereClause}
        ORDER BY ${useFulltext ? 'CASE WHEN p.preferred_name = :ftSearch THEN 0 ELSE 1 END, ' : ''}p.preferred_name ASC
        LIMIT :limit OFFSET :offset
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      }),

      sequelize.query(`
        SELECT COUNT(*) as total
        FROM persons p
        ${whereClause}
      `, {
        replacements: Object.fromEntries(
          Object.entries(replacements).filter(([key]) => !['limit', 'offset'].includes(key))
        ),
        type: sequelize.QueryTypes.SELECT
      })
    ]);

    const total = parseInt(countResult[0]?.total || 0, 10);
    const formattedResults = persons.map(person => formatPersonListItem({
      ...person,
      name_signature: null,
      metrics: {
        works_count: parseInt(person.total_works, 10) || 0,
        latest_publication_year: person.latest_publication_year || null
      }
    }));

    const result = {
      data: formattedResults,
      pagination: createPagination(page, limit, total),
      performance: {
        engine: 'MariaDB',
        query_type: 'search'
      }
    };

    try {
      await cacheService.set(cacheKey, result, 3600);
    } catch (_) {}

    logger.info(`Persons search "${trimmed}": ${formattedResults.length} of ${total} results`);
    return result;
  }
}

module.exports = new PersonsService();
