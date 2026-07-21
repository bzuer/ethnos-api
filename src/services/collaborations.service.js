const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { withTimeout, isStatementTimeout } = require('../utils/db');
const { createPagination, normalizePagination } = require('../utils/pagination');
const { formatCollaborator, formatTopCollaboration } = require('../dto/collaborations.dto');

class CollaborationsService {
  async getPersonCollaborators(personId, filters = {}) {
    const { page = 1, limit = 20, min_collaborations = 2, sort_by = 'collaboration_count' } = filters;
    const offset = (page - 1) * limit;
    
    const cacheKey = `collaborators:${personId}:${JSON.stringify(filters)}`;
    
    try {
      const [exists] = await sequelize.query(
        'SELECT 1 FROM persons WHERE id = ? LIMIT 1',
        {
          replacements: [parseInt(personId)],
          type: sequelize.QueryTypes.SELECT
        }
      );

      if (!exists) {
        return null;
      }

      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Collaborators for person ${personId} retrieved from cache`);
        return cached;
      }

      const collaborators = await sequelize.query(withTimeout(`
        SELECT
          p2.id AS collaborator_id,
          p2.preferred_name AS collaborator_name,
          COUNT(DISTINCT a1.work_id) AS collaboration_count
        FROM authorships a1
        INNER JOIN authorships a2 ON a1.work_id = a2.work_id
        INNER JOIN persons p2 ON a2.person_id = p2.id
        WHERE a1.person_id = :id
          AND a2.person_id != :id
          AND a2.person_id IS NOT NULL
        GROUP BY p2.id, p2.preferred_name
        HAVING COUNT(DISTINCT a1.work_id) >= :min
        ORDER BY collaboration_count DESC
        LIMIT :limit OFFSET :offset
      `), {
        replacements: {
          id: parseInt(personId),
          min: parseInt(min_collaborations),
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        type: sequelize.QueryTypes.SELECT
      });

      const collaboratorsList = Array.isArray(collaborators) ? collaborators : [];

      if (collaboratorsList.length === 0) {
        const [potentialCollaborator] = await sequelize.query(`
          SELECT 1
          FROM authorships a1
          INNER JOIN authorships a2 ON a1.work_id = a2.work_id
          WHERE a1.person_id = ?
            AND a2.person_id != ?
          GROUP BY a2.person_id
          HAVING COUNT(DISTINCT a1.work_id) >= 1
          LIMIT 1
        `, {
          replacements: [parseInt(personId), parseInt(personId)],
          type: sequelize.QueryTypes.SELECT
        });

        if (!potentialCollaborator) {
          logger.warn(`No collaborators found for person ${personId}`);
          return null;
        }

        const emptyResult = {
          person_id: parseInt(personId),
          collaborators: [],
          pagination: createPagination(parseInt(page), parseInt(limit), 0),
          filters: {
            min_collaborations: parseInt(min_collaborations),
            sort_by: sort_by
          },
          summary: {
            total_collaborators: 0,
            avg_collaborations_per_collaborator: 0
          }
        };

        await cacheService.set(cacheKey, emptyResult, 60);
        return emptyResult;
      }

      let totalCount = collaboratorsList.length;
      try {
        const [countRow] = await sequelize.query(withTimeout(`
          SELECT COUNT(*) AS total
          FROM (
            SELECT a2.person_id
            FROM authorships a1
            INNER JOIN authorships a2 ON a1.work_id = a2.work_id
            WHERE a1.person_id = :id
              AND a2.person_id != :id
              AND a2.person_id IS NOT NULL
            GROUP BY a2.person_id
            HAVING COUNT(DISTINCT a1.work_id) >= :min
          ) distinct_collaborators
        `), {
          replacements: {
            id: parseInt(personId),
            min: parseInt(min_collaborations)
          },
          type: sequelize.QueryTypes.SELECT
        });
        if (countRow && countRow.total !== undefined) {
          totalCount = parseInt(countRow.total, 10);
        }
      } catch (error) {
        logger.warn('Collaborators count fallback used', { error: error.message });
      }

      const formattedCollaborators = collaboratorsList.map(collab => ({
        ...collab,
        collaboration_strength: this.calculateCollaborationStrength(collab.collaboration_count)
      })).map(formatCollaborator);

      const result = {
        person_id: parseInt(personId),
        collaborators: formattedCollaborators,
        pagination: createPagination(parseInt(page), parseInt(limit), totalCount),
        filters: {
          min_collaborations: parseInt(min_collaborations),
          sort_by: sort_by
        },
        summary: {
          total_collaborators: totalCount,
          avg_collaborations_per_collaborator: collaboratorsList.length > 0 ? 
            Math.round(collaboratorsList.reduce((sum, c) => sum + c.collaboration_count, 0) / collaboratorsList.length) : 0
        }
      };

      await cacheService.set(cacheKey, result, 300);
      logger.info(`Collaborators for person ${personId} cached: ${collaboratorsList.length} collaborators`);
      
      return result;
    } catch (error) {
      logger.error(`Error fetching collaborators for person ${personId}:`, error);
      throw error;
    }
  }

  calculateCollaborationStrength(count) {
    if (count >= 10) return 'very_strong';
    if (count >= 5) return 'strong';
    if (count >= 2) return 'moderate';
    return 'weak';
  }

  async getCollaborationNetwork(personId, depth = 2) {
    const centralId = parseInt(personId);
    const maxDepth = Math.max(1, Math.min(parseInt(depth) || 1, 3));
    const cacheKey = `network:v2:${centralId}:${maxDepth}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Network for person ${centralId} retrieved from cache`);
        return cached;
      }

      const [central] = await sequelize.query(
        'SELECT id, preferred_name FROM persons WHERE id = ? LIMIT 1',
        { replacements: [centralId], type: sequelize.QueryTypes.SELECT }
      );
      if (!central) {
        return null;
      }

      const PER_NODE_LIMIT = 20;
      const NODE_CAP = 120;
      const nodes = {
        [centralId]: { id: centralId, name: central.preferred_name || null, type: 'central', level: 0 }
      };
      const edges = [];
      const seenEdges = new Set();
      let frontier = [centralId];

      for (let level = 1; level <= maxDepth && frontier.length && Object.keys(nodes).length < NODE_CAP; level++) {
        const ph = frontier.map(() => '?').join(',');
        const rows = await sequelize.query(withTimeout(`
          SELECT a1.person_id AS source_id, p2.id AS target_id, p2.preferred_name AS target_name,
                 COUNT(DISTINCT a1.work_id) AS weight
          FROM authorships a1
          INNER JOIN authorships a2 ON a1.work_id = a2.work_id AND a2.person_id <> a1.person_id
          INNER JOIN persons p2 ON p2.id = a2.person_id
          WHERE a1.person_id IN (${ph})
          GROUP BY a1.person_id, p2.id, p2.preferred_name
          HAVING weight >= 2
          ORDER BY a1.person_id, weight DESC
        `), { replacements: frontier, type: sequelize.QueryTypes.SELECT });

        const perSourceCount = Object.create(null);
        const nextFrontier = [];
        for (const row of rows) {
          if (Object.keys(nodes).length >= NODE_CAP) break;
          const src = row.source_id;
          const tgt = row.target_id;
          perSourceCount[src] = perSourceCount[src] || 0;
          if (perSourceCount[src] >= PER_NODE_LIMIT) continue;
          const key = src < tgt ? `${src}-${tgt}` : `${tgt}-${src}`;
          if (!nodes[tgt]) {
            nodes[tgt] = {
              id: tgt,
              name: row.target_name || null,
              type: level === 1 ? 'direct_collaborator' : 'indirect_collaborator',
              level
            };
            nextFrontier.push(tgt);
          }
          if (!seenEdges.has(key)) {
            seenEdges.add(key);
            edges.push({ source: src, target: tgt, weight: parseInt(row.weight, 10) || 0, relationship: 'collaboration' });
            perSourceCount[src]++;
          }
        }
        frontier = nextFrontier;
      }

      const nodeCount = Object.keys(nodes).length;
      const maxPossible = nodeCount > 1 ? (nodeCount * (nodeCount - 1)) / 2 : 0;
      const density = maxPossible > 0 ? Math.round((edges.length / maxPossible) * 1000) / 1000 : 0;

      const result = {
        central_person_id: centralId,
        network_depth: maxDepth,
        nodes,
        edges,
        network_stats: {
          total_nodes: nodeCount,
          total_edges: edges.length,
          direct_collaborators: Object.values(nodes).filter(n => n.level === 1).length,
          network_density: density
        }
      };

      await cacheService.set(cacheKey, result, 600);
      logger.info(`Network for person ${centralId} cached: ${nodeCount} nodes`);

      return result;
    } catch (error) {
      logger.error(`Error building network for person ${centralId}:`, error);
      throw error;
    }
  }

  async getTopCollaborations(filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { min_collaborations = 5, year_from, year_to } = filters;
    
    const cacheKey = `top_collaborations:v2:${JSON.stringify({ page, limit, offset, min_collaborations, year_from, year_to })}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Top collaborations retrieved from cache');
        return cached;
      }

      const topPersons = await sequelize.query(withTimeout(`
        SELECT id
        FROM persons
        WHERE total_works >= 30
        ORDER BY total_works DESC
        LIMIT 2000
      `), { type: sequelize.QueryTypes.SELECT });
      const topPersonIds = topPersons.map(r => r.id);

      if (topPersonIds.length === 0) {
        const emptyResult = {
          top_collaborations: [],
          summary: { total_partnerships: 0, avg_collaborations: 0 },
          pagination: createPagination(page, limit, 0),
          filters: {
            min_collaborations: parseInt(min_collaborations, 10),
            year_from: year_from ? parseInt(year_from, 10) : null,
            year_to: year_to ? parseInt(year_to, 10) : null
          }
        };
        await cacheService.set(cacheKey, emptyResult, 300);
        return emptyResult;
      }

      const yearConds = [];
      const pairReplacements = {
        topPersonIds,
        min_collaborations: parseInt(min_collaborations, 10),
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
      };
      if (year_from) { yearConds.push('pub.year >= :year_from'); pairReplacements.year_from = parseInt(year_from, 10); }
      if (year_to) { yearConds.push('pub.year <= :year_to'); pairReplacements.year_to = parseInt(year_to, 10); }
      const yearWhere = yearConds.length ? `AND ${yearConds.join(' AND ')}` : '';

      const topPairs = await sequelize.query(withTimeout(`
        SELECT
          LEAST(a1.person_id, a2.person_id) AS person1_id,
          GREATEST(a1.person_id, a2.person_id) AS person2_id,
          COUNT(DISTINCT a1.work_id) AS collaboration_count,
          ROUND(AVG(COALESCE(w.citation_count, 0)), 2) AS avg_citations_together,
          MIN(pub.year) AS first_collaboration_year,
          MAX(pub.year) AS latest_collaboration_year
        FROM authorships a1
        INNER JOIN authorships a2
          ON a1.work_id = a2.work_id
          AND a1.person_id < a2.person_id
          AND a1.role = 'AUTHOR'
          AND a2.role = 'AUTHOR'
        LEFT JOIN works w ON w.id = a1.work_id
        LEFT JOIN publications pub ON pub.work_id = a1.work_id
        WHERE a1.person_id IN (:topPersonIds)
          AND a2.person_id IN (:topPersonIds)
          ${yearWhere}
        GROUP BY person1_id, person2_id
        HAVING collaboration_count >= :min_collaborations
        ORDER BY collaboration_count DESC, avg_citations_together DESC
        LIMIT :limit OFFSET :offset
      `), { replacements: pairReplacements, type: sequelize.QueryTypes.SELECT });

      const topPairsList = Array.isArray(topPairs) ? topPairs : [];

      let totalCount = offset + topPairsList.length;
      try {
        const countReplacements = { topPersonIds, min_collaborations: parseInt(min_collaborations, 10) };
        if (year_from) countReplacements.year_from = parseInt(year_from, 10);
        if (year_to) countReplacements.year_to = parseInt(year_to, 10);
        const [countRow] = await sequelize.query(withTimeout(`
          SELECT COUNT(*) AS total FROM (
            SELECT 1
            FROM authorships a1
            INNER JOIN authorships a2
              ON a1.work_id = a2.work_id
              AND a1.person_id < a2.person_id
              AND a1.role = 'AUTHOR'
              AND a2.role = 'AUTHOR'
            LEFT JOIN publications pub ON pub.work_id = a1.work_id
            WHERE a1.person_id IN (:topPersonIds)
              AND a2.person_id IN (:topPersonIds)
              ${yearWhere}
            GROUP BY LEAST(a1.person_id, a2.person_id), GREATEST(a1.person_id, a2.person_id)
            HAVING COUNT(DISTINCT a1.work_id) >= :min_collaborations
          ) pairs
        `), { replacements: countReplacements, type: sequelize.QueryTypes.SELECT });
        if (countRow && countRow.total !== undefined) {
          totalCount = parseInt(countRow.total, 10);
        }
      } catch (error) {
        logger.warn('Top collaborations count fallback used', { error: error.message });
      }

      const personIds = Array.from(new Set([
        ...topPairsList.map(p => p.person1_id),
        ...topPairsList.map(p => p.person2_id)
      ]));
      const nameMap = Object.create(null);
      if (personIds.length > 0) {
        const names = await sequelize.query(`
          SELECT id, preferred_name FROM persons WHERE id IN (:personIds)
        `, { replacements: { personIds }, type: sequelize.QueryTypes.SELECT });
        for (const row of names) nameMap[row.id] = row.preferred_name;
      }

      const formattedPairs = topPairsList.map(pair => formatTopCollaboration({
        person1_id: pair.person1_id,
        person1_name: nameMap[pair.person1_id] || null,
        person2_id: pair.person2_id,
        person2_name: nameMap[pair.person2_id] || null,
        collaboration_count: parseInt(pair.collaboration_count, 10) || 0,
        avg_citations_together: parseFloat(pair.avg_citations_together) || 0,
        first_collaboration_year: pair.first_collaboration_year ? parseInt(pair.first_collaboration_year, 10) : null,
        latest_collaboration_year: pair.latest_collaboration_year ? parseInt(pair.latest_collaboration_year, 10) : null,
        collaboration_strength: this.calculateCollaborationStrength(pair.collaboration_count)
      }));

      const result = {
        top_collaborations: formattedPairs,
        summary: {
          total_partnerships: totalCount,
          avg_collaborations: topPairsList.length > 0 ?
            Math.round(topPairsList.reduce((sum, p) => sum + (parseInt(p.collaboration_count, 10) || 0), 0) / topPairsList.length) : 0
        },
        pagination: createPagination(page, limit, totalCount),
        filters: {
          min_collaborations: parseInt(min_collaborations, 10),
          year_from: year_from ? parseInt(year_from, 10) : null,
          year_to: year_to ? parseInt(year_to, 10) : null
        }
      };

      await cacheService.set(cacheKey, result, 1800);
      logger.info(`Top collaborations cached: ${topPairsList.length} partnerships`);

      return result;
    } catch (error) {
      if (isStatementTimeout(error)) {
        logger.warn('Top collaborations degraded (statement timeout)', { error: error.message });
        return {
          top_collaborations: [],
          summary: { total_partnerships: 0, avg_collaborations: 0 },
          pagination: createPagination(page, limit, 0),
          filters: {
            min_collaborations: parseInt(min_collaborations, 10),
            year_from: year_from ? parseInt(year_from, 10) : null,
            year_to: year_to ? parseInt(year_to, 10) : null
          },
          meta: { degraded: true }
        };
      }
      logger.error('Error fetching top collaborations:', error);
      throw error;
    }
  }

}

module.exports = new CollaborationsService();
