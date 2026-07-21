const { sequelize } = require('../models');
const { Op } = require('sequelize');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { withTimeout } = require('../utils/db');
const { formatSignatureListItem, formatSignatureDetails, formatSignatureWork } = require('../dto/signatures.dto');
const { formatPersonListItem } = require('../dto/person.dto');

class SignaturesService {
  async getAllSignatures(options = {}) {
    const { 
      limit = 20, 
      offset = 0, 
      search = null,
      sortBy = 'signature',
      sortOrder = 'ASC',
      includeCounts = true
    } = options;

    const cacheKey = `signatures:v2:${JSON.stringify(options)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Signatures list retrieved from cache');
        return cached;
      }

      return await this.getSignaturesFallback({ limit, offset, search, sortBy, sortOrder, includeCounts });

    } catch (error) {
      logger.error('Error fetching signatures:', error);
      throw error;
    }
  }

  
  async getSignaturesFallback(options = {}) {
    const { 
      limit = 20, 
      offset = 0, 
      search = null,
      sortBy = 'signature',
      sortOrder = 'ASC',
      includeCounts = true
    } = options;

    let whereClause = '';
    const params = [];
    let paramIndex = 0;

    if (search) {
      whereClause = 'WHERE s.signature LIKE ?';
      params.push(`%${search}%`);
      paramIndex++;
    }

    const validSortFields = ['signature', 'created_at', 'id'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'signature';
    const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const query = includeCounts ? `
      SELECT 
        s.id,
        s.signature,
        s.created_at,
        (SELECT COUNT(*) FROM persons p WHERE p.signature_id = s.id) as persons_count
      FROM signatures s
      ${whereClause}
      ORDER BY ${sortField} ${order}
      LIMIT ? OFFSET ?
    ` : `
      SELECT 
        s.id,
        s.signature,
        s.created_at,
        NULL as persons_count
      FROM signatures s
      ${whereClause}
      ORDER BY ${sortField} ${order}
      LIMIT ? OFFSET ?
    `;

    params.push(parseInt(limit), parseInt(offset));

    const [signatures] = await sequelize.query(query, {
      replacements: params,
      type: sequelize.QueryTypes.SELECT
    });

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM signatures s
      ${whereClause}
    `;

    const [countResult] = await sequelize.query(countQuery, {
      replacements: params.slice(0, paramIndex),
      type: sequelize.QueryTypes.SELECT
    });

    const result = {
      signatures: Array.isArray(signatures) ? signatures.map(formatSignatureListItem) : [formatSignatureListItem(signatures)],
      pagination: {
        total: countResult.total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(countResult.total / limit)
      }
    };

    await cacheService.set(`signatures:v2:${JSON.stringify(options)}`, result, 3600);
    logger.info(`Retrieved ${result.signatures.length} signatures`);
    
    return result;
  }

  async getSignatureById(id) {
    const cacheKey = `signature:${id}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Signature ${id} retrieved from cache`);
        return cached;
      }

      const query = `
        SELECT 
          s.id,
          s.signature,
          s.created_at,
          COUNT(p.id) as persons_count
        FROM signatures s
        LEFT JOIN persons p ON s.id = p.signature_id
        WHERE s.id = ?
        GROUP BY s.id, s.signature, s.created_at
      `;

      const [signature] = await sequelize.query(query, {
        replacements: [id],
        type: sequelize.QueryTypes.SELECT
      });

      if (!signature) {
        return null;
      }

      const formatted = formatSignatureDetails(signature);
      await cacheService.set(cacheKey, formatted, 3600);
      logger.info(`Retrieved signature ${id}`);
      
      return formatted;

    } catch (error) {
      logger.error(`Error fetching signature ${id}:`, error);
      throw error;
    }
  }

  async getSignaturePersons(signatureId, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const cacheKey = `signature:${signatureId}:persons:v2:${JSON.stringify(options)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Signature ${signatureId} persons retrieved from cache`);
        return cached;
      }

      const query = `
        SELECT
          p.id,
          p.preferred_name,
          p.given_names,
          p.family_name,
          p.orcid,
          p.scopus_id,
          p.lattes_id,
          p.is_verified,
          p.total_works AS works_count,
          p.latest_publication_year
        FROM persons p
        WHERE p.signature_id = ?
        ORDER BY p.preferred_name ASC
        LIMIT ? OFFSET ?
      `;

      const persons = await sequelize.query(query, {
        replacements: [signatureId, parseInt(limit), parseInt(offset)],
        type: sequelize.QueryTypes.SELECT
      });

      const countQuery = `
        SELECT COUNT(*) as total
        FROM persons p
        WHERE p.signature_id = ?
      `;

      const [countResult] = await sequelize.query(countQuery, {
        replacements: [signatureId],
        type: sequelize.QueryTypes.SELECT
      });

      if (countResult.total === 0) {
        const signatureExists = await sequelize.query(`
          SELECT 1 FROM signatures WHERE id = ? LIMIT 1
        `, {
          replacements: [signatureId],
          type: sequelize.QueryTypes.SELECT
        });
        
        if (signatureExists.length === 0) {
          return null;
        }
      }

      const result = {
        persons: persons.map(formatPersonListItem),
        pagination: {
          total: countResult.total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(countResult.total / limit)
        }
      };

      await cacheService.set(cacheKey, result, 1800);
      logger.info(`Retrieved ${persons.length} persons for signature ${signatureId}`);
      
      return result;

    } catch (error) {
      logger.error(`Error fetching persons for signature ${signatureId}:`, error);
      throw error;
    }
  }

  async getSignatureStatistics() {
    const cacheKey = 'signatures:statistics';
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Signature statistics retrieved from cache');
        return cached;
      }

      const [signatureStats, linkStats] = await Promise.all([
        sequelize.query(`
          SELECT 
            COUNT(*) as total_signatures,
            COUNT(CASE WHEN LENGTH(signature) <= 10 THEN 1 END) as short_signatures,
            COUNT(CASE WHEN LENGTH(signature) > 10 AND LENGTH(signature) <= 20 THEN 1 END) as medium_signatures,
            COUNT(CASE WHEN LENGTH(signature) > 20 THEN 1 END) as long_signatures,
            AVG(LENGTH(signature)) as avg_signature_length
          FROM signatures
        `, {
          type: sequelize.QueryTypes.SELECT
        }),
        
        sequelize.query(`
          SELECT 
            COUNT(DISTINCT signature_id) as linked_signatures
          FROM persons
          WHERE signature_id IS NOT NULL
        `, {
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      const stats = {
        ...signatureStats[0],
        linked_signatures: linkStats[0].linked_signatures,
        unlinked_signatures: signatureStats[0].total_signatures - linkStats[0].linked_signatures
      };

      await cacheService.set(cacheKey, stats, 172800);
      logger.info('Retrieved signature statistics');
      
      return stats;

    } catch (error) {
      logger.error('Error fetching signature statistics:', error);
      throw error;
    }
  }

  async getSignatureWorks(signatureId, options = {}) {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;
    
    const cacheKey = `signature:${signatureId}:works:v2:${JSON.stringify(options)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Signature ${signatureId} works retrieved from cache`);
        return cached;
      }

      const [works, countResult] = await Promise.all([
        sequelize.query(withTimeout(`
          SELECT
            a.work_id AS id,
            w.title,
            MIN(a.person_id) AS person_id,
            MAX(p.preferred_name) AS person_name,
            pub.type AS work_type,
            w.language,
            w.subtitle,
            w.created_at,
            pub.year AS year,
            pub.doi,
            v.name AS journal,
            pub.volume,
            pub.issue,
            pub.pages AS pages,
            pub.open_access,
            MIN(a.role) AS role,
            MIN(a.position) AS position,
            MAX(a.is_corresponding) AS is_corresponding,
            (SELECT COUNT(*) FROM authorships a2 WHERE a2.work_id = w.id) AS total_authors
          FROM persons p
          INNER JOIN authorships a ON a.person_id = p.id
          INNER JOIN works w ON w.id = a.work_id
          LEFT JOIN publications pub ON pub.id = (
            SELECT MAX(p2.id) FROM publications p2 WHERE p2.work_id = w.id
          )
          LEFT JOIN venues v ON v.id = pub.venue_id
          WHERE p.signature_id = ?
          GROUP BY a.work_id, w.title, w.language, w.subtitle, w.created_at,
                   pub.type, pub.year, pub.doi, v.name, pub.volume, pub.issue, pub.pages, pub.open_access
          ORDER BY COALESCE(pub.year, 2024) DESC, a.work_id DESC
          LIMIT ? OFFSET ?
        `), {
          replacements: [signatureId, parseInt(limit), parseInt(offset)],
          type: sequelize.QueryTypes.SELECT
        }),

        sequelize.query(`
          SELECT COUNT(DISTINCT a.work_id) AS total
          FROM persons p
          INNER JOIN authorships a ON a.person_id = p.id
          WHERE p.signature_id = ?
        `, {
          replacements: [signatureId],
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      if (countResult[0].total === 0) {
        const signatureExists = await sequelize.query(`
          SELECT 1 FROM signatures WHERE id = ? LIMIT 1
        `, {
          replacements: [signatureId],
          type: sequelize.QueryTypes.SELECT
        });
        
        if (signatureExists.length === 0) {
          return null;
        }
      }

      const total = countResult[0].total;
      const totalPages = Math.ceil(total / limit);

      const workIds = Array.from(new Set(works.map(w => w.id).filter(Number.isFinite)));
      const authorStringByWork = Object.create(null);
      if (workIds.length > 0) {
        const placeholders = workIds.map(() => '?').join(',');
        const authorRows = await sequelize.query(`
          SELECT a.work_id, p.preferred_name
          FROM authorships a
          INNER JOIN persons p ON p.id = a.person_id
          WHERE a.work_id IN (${placeholders})
          ORDER BY a.work_id, a.position
        `, {
          replacements: workIds,
          type: sequelize.QueryTypes.SELECT
        });
        for (const row of authorRows) {
          if (!authorStringByWork[row.work_id]) authorStringByWork[row.work_id] = [];
          authorStringByWork[row.work_id].push(row.preferred_name);
        }
      }

      const items = works.map(work => {
        const names = authorStringByWork[work.id] || [];
        return {
          id: work.id,
          title: work.title,
          subtitle: work.subtitle,
          type: work.work_type,
          language: work.language,
          doi: work.doi,
          open_access: work.open_access === 1 || work.open_access === true,
          authorship: {
            role: work.role,
            position: work.position,
            is_corresponding: work.is_corresponding === 1,
            person_id: work.person_id,
            person_name: work.person_name
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
            total_count: parseInt(work.total_authors, 10) || names.length,
            author_string: names.length ? names.join('; ') : null
          },
          created_at: work.created_at
        };
      });

      const result = {
        data: items.map(formatSignatureWork),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total),
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };

      await cacheService.set(cacheKey, result, 3600);
      logger.info(`Signature ${signatureId} works cached for 1 hour`);
      
      return result;
    } catch (error) {
      logger.error(`Error fetching works for signature ${signatureId}:`, error);
      throw error;
    }
  }

  async searchSignatures(searchTerm, options = {}) {
    const { limit = 20, offset = 0, exact = false } = options;
    const cacheKey = `signatures:search:${searchTerm}:${JSON.stringify(options)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Signature search results retrieved from cache');
        return cached;
      }

      const searchPattern = exact ? searchTerm : `%${searchTerm}%`;
      const searchOperator = exact ? '=' : 'LIKE';

      const query = `
        SELECT 
          s.id,
          s.signature,
          s.created_at,
          COUNT(p.id) as persons_count
        FROM signatures s
        LEFT JOIN persons p ON s.id = p.signature_id
        WHERE s.signature ${searchOperator} ?
        GROUP BY s.id, s.signature, s.created_at
        ORDER BY 
          CASE WHEN s.signature = ? THEN 1 ELSE 2 END,
          persons_count DESC,
          s.signature ASC
        LIMIT ? OFFSET ?
      `;

      const signatures = await sequelize.query(query, {
        replacements: [searchPattern, searchTerm, parseInt(limit), parseInt(offset)],
        type: sequelize.QueryTypes.SELECT
      });

      const countQuery = `
        SELECT COUNT(DISTINCT s.id) as total
        FROM signatures s
        WHERE s.signature ${searchOperator} ?
      `;

      const [countResult] = await sequelize.query(countQuery, {
        replacements: [searchPattern],
        type: sequelize.QueryTypes.SELECT
      });

      const result = {
        signatures,
        pagination: {
          total: countResult.total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(countResult.total / limit)
        },
        searchTerm,
        exact
      };

      await cacheService.set(cacheKey, result, 1800);
      logger.info(`Found ${signatures.length} signatures matching search: ${searchTerm}`);
      
      return result;

    } catch (error) {
      logger.error(`Error searching signatures for: ${searchTerm}`, error);
      throw error;
    }
  }
}

module.exports = new SignaturesService();
