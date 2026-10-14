const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { withTimeout, isStatementTimeout, latestPublicationJoin } = require('../utils/db');
const { hydrateAuthorNamesForWorks } = require('../utils/hydration');
const { authorshipRoleOrderSql } = require('../dto/helpers');
const { formatSignatureDetails, formatSignatureListItem, formatSignatureWork } = require('../dto/signatures.dto');

const escapeLikeTerm = (value) => String(value).replace(/[\\%_]/g, (ch) => `\\${ch}`);
const { formatPersonListItem } = require('../dto/person.dto');
const { createPagination } = require('../utils/pagination');

class SignaturesService {
  async getSignatureById(id) {
    const cacheKey = `signature:v2:${id}`;
    
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
        ORDER BY p.preferred_name ASC, p.id ASC
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
    const cacheKey = 'signatures:statistics:v2';
    
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
            COUNT(CASE WHEN CHAR_LENGTH(signature) <= 10 THEN 1 END) as short_signatures,
            COUNT(CASE WHEN CHAR_LENGTH(signature) > 10 AND CHAR_LENGTH(signature) <= 20 THEN 1 END) as medium_signatures,
            COUNT(CASE WHEN CHAR_LENGTH(signature) > 20 THEN 1 END) as long_signatures,
            AVG(CHAR_LENGTH(signature)) as avg_signature_length
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
    const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 20));
    const offset = Math.max(0, parseInt(options.offset, 10) || 0);
    const page = Math.floor(offset / limit) + 1;

    const cacheKey = `signature:${signatureId}:works:v3:${limit}:${offset}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Signature ${signatureId} works retrieved from cache`);
        return cached;
      }

      const [works, countResult] = await Promise.all([
        sequelize.query(withTimeout(`
          SELECT
            w.id,
            w.title,
            rep.person_id,
            rep.person_name,
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
            rep.role,
            rep.position,
            rep.is_corresponding,
            (SELECT COUNT(DISTINCT a2.person_id) FROM authorships a2 WHERE a2.work_id = w.id) AS total_authors
          FROM (
            SELECT
              a.work_id,
              a.person_id,
              p.preferred_name AS person_name,
              a.role,
              a.position,
              a.is_corresponding,
              ROW_NUMBER() OVER (PARTITION BY a.work_id ORDER BY ${authorshipRoleOrderSql('a')}, a.position, a.person_id) AS rn
            FROM persons p
            INNER JOIN authorships a ON a.person_id = p.id
            WHERE p.signature_id = ?
          ) rep
          INNER JOIN works w ON w.id = rep.work_id
          ${latestPublicationJoin('pub', 'LEFT')}
          LEFT JOIN venues v ON v.id = pub.venue_id
          WHERE rep.rn = 1
          ORDER BY pub.year IS NULL, pub.year DESC, w.id DESC
          LIMIT ? OFFSET ?
        `), {
          replacements: [signatureId, parseInt(limit), parseInt(offset)],
          type: sequelize.QueryTypes.SELECT
        }),

        sequelize.query(withTimeout(`
          SELECT COUNT(DISTINCT a.work_id) AS total
          FROM persons p
          INNER JOIN authorships a ON a.person_id = p.id
          WHERE p.signature_id = ?
        `), {
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

      const workIds = Array.from(new Set(works.map(w => w.id).filter(Number.isFinite)));
      const authorStringByWork = workIds.length > 0
        ? await hydrateAuthorNamesForWorks(workIds)
        : Object.create(null);

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
        pagination: createPagination(page, limit, parseInt(total, 10) || 0)
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
    const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 20));
    const offset = Math.max(0, parseInt(options.offset, 10) || 0);
    const exact = options.exact === true;
    const term = String(searchTerm || '').trim();
    const cacheKey = `signatures:search:v2:${term}:${limit}:${offset}:${exact ? 1 : 0}`;

    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const condition = exact ? 's.signature = ?' : 's.signature LIKE ?';
    const value = exact ? term : `%${escapeLikeTerm(term)}%`;

    const [rows, counted] = await Promise.all([
      sequelize.query(withTimeout(`
        SELECT s.id, s.signature, s.created_at
        FROM signatures s
        WHERE ${condition}
        ORDER BY s.signature ASC, s.id ASC
        LIMIT ? OFFSET ?
      `), { replacements: [value, limit, offset], type: sequelize.QueryTypes.SELECT }),
      sequelize.query(withTimeout(`SELECT COUNT(*) AS total FROM signatures s WHERE ${condition}`, 2000), {
        replacements: [value],
        type: sequelize.QueryTypes.SELECT
      })
        .then(([row]) => ({ total: parseInt(row?.total, 10) || 0, exact: true }))
        .catch((error) => {
          if (!isStatementTimeout(error)) throw error;
          return { total: null, exact: false };
        })
    ]);

    const ids = rows.map((row) => row.id);
    const personCounts = new Map();
    if (ids.length > 0) {
      const counts = await sequelize.query(withTimeout(`
        SELECT signature_id, COUNT(*) AS persons_count
        FROM persons
        WHERE signature_id IN (:ids)
        GROUP BY signature_id
      `), { replacements: { ids }, type: sequelize.QueryTypes.SELECT });
      for (const row of counts) personCounts.set(row.signature_id, parseInt(row.persons_count, 10) || 0);
    }

    const total = counted.total ?? (offset + rows.length + (rows.length === limit ? 1 : 0));
    const result = {
      signatures: rows.map((row) => formatSignatureListItem({ ...row, persons_count: personCounts.get(row.id) || 0 })),
      pagination: createPagination(Math.floor(offset / limit) + 1, limit, total),
      totalExact: counted.exact,
      searchTerm: term,
      exact
    };

    await cacheService.set(cacheKey, result, 1800);
    return result;
  }
}

module.exports = new SignaturesService();
