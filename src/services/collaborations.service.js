const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { withTimeout, isStatementTimeout } = require('../utils/db');
const { createPagination, normalizePagination } = require('../utils/pagination');
const { formatCollaborator, formatTopCollaboration } = require('../dto/collaborations.dto');

const COLLABORATION_RANKING_SCOPE = 2000;

class CollaborationsService {
  async getPersonCollaborators(personId, filters = {}) {
    const { page = 1, limit = 20, min_collaborations = 2, sort_by = 'collaboration_count' } = filters;
    const offset = Number.isFinite(parseInt(filters.offset, 10)) ? Math.max(0, parseInt(filters.offset, 10)) : (page - 1) * limit;
    
    const cacheKey = `collaborators:v2:${personId}:${JSON.stringify(filters)}`;
    
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

      const sortColumnMap = {
        collaboration_count: 'collaboration_count DESC',
        latest_collaboration_year: 'latest_collaboration_year DESC',
        avg_citations_together: 'avg_citations_together DESC'
      };
      const orderByClause = sortColumnMap[sort_by] || sortColumnMap.collaboration_count;

      const collaborators = await sequelize.query(withTimeout(`
        SELECT
          p2.id AS collaborator_id,
          p2.preferred_name AS collaborator_name,
          COUNT(*) AS collaboration_count,
          ROUND(AVG(w.citation_count), 2) AS avg_citations_together,
          MIN(w.latest_publication_year) AS first_collaboration_year,
          MAX(w.latest_publication_year) AS latest_collaboration_year,
          COUNT(*) OVER () AS total_collaborators
        FROM (
          SELECT DISTINCT a2.person_id, a1.work_id
          FROM authorships a1
          INNER JOIN authorships a2 ON a2.work_id = a1.work_id AND a2.person_id <> a1.person_id
          WHERE a1.person_id = :id
        ) shared
        INNER JOIN works w ON w.id = shared.work_id
        INNER JOIN persons p2 ON p2.id = shared.person_id
        GROUP BY p2.id, p2.preferred_name
        HAVING collaboration_count >= :min
        ORDER BY ${orderByClause}, p2.id ASC
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
      const totalCount = collaboratorsList.length > 0
        ? parseInt(collaboratorsList[0].total_collaborators, 10)
        : parseInt(offset, 10) || 0;
      const formattedCollaborators = collaboratorsList.map(formatCollaborator);

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

  async rankCollaborationPairs({ minCollaborations, yearFrom = null, yearTo = null, limit, offset }) {
    const yearConds = [];
    const replacements = { minCollaborations, limit, offset };
    if (yearFrom !== null) { yearConds.push('w.latest_publication_year >= :yearFrom'); replacements.yearFrom = yearFrom; }
    if (yearTo !== null) { yearConds.push('w.latest_publication_year <= :yearTo'); replacements.yearTo = yearTo; }

    let pairs;
    try {
      pairs = await sequelize.query(withTimeout(`
        WITH top AS (
          SELECT id FROM persons WHERE total_works >= 30 ORDER BY total_works DESC LIMIT ${COLLABORATION_RANKING_SCOPE}
        ),
        pair_works AS (
          SELECT
            LEAST(a1.person_id, a2.person_id) AS person1_id,
            GREATEST(a1.person_id, a2.person_id) AS person2_id,
            a1.work_id
          FROM top t1
          JOIN authorships a1 ON a1.person_id = t1.id AND a1.role = 'AUTHOR'
          JOIN authorships a2 ON a2.work_id = a1.work_id AND a2.person_id > a1.person_id AND a2.role = 'AUTHOR'
          JOIN top t2 ON t2.id = a2.person_id
          GROUP BY person1_id, person2_id, a1.work_id
        )
        SELECT
          pw.person1_id,
          pw.person2_id,
          COUNT(*) AS collaboration_count,
          ROUND(AVG(w.citation_count), 2) AS avg_citations_together,
          MIN(w.latest_publication_year) AS first_collaboration_year,
          MAX(w.latest_publication_year) AS latest_collaboration_year,
          COUNT(*) OVER () AS total_pairs
        FROM pair_works pw
        JOIN works w ON w.id = pw.work_id
        ${yearConds.length ? `WHERE ${yearConds.join(' AND ')}` : ''}
        GROUP BY pw.person1_id, pw.person2_id
        HAVING collaboration_count >= :minCollaborations
        ORDER BY collaboration_count DESC, avg_citations_together DESC, pw.person1_id, pw.person2_id
        LIMIT :limit OFFSET :offset
      `), { replacements, type: sequelize.QueryTypes.SELECT });
    } catch (error) {
      if (!isStatementTimeout(error)) throw error;
      logger.warn('Collaboration ranking exceeded the statement budget');
      return { pairs: [], total: 0, degraded: true };
    }

    const personIds = Array.from(new Set(pairs.flatMap((p) => [p.person1_id, p.person2_id])));
    const nameMap = new Map();
    if (personIds.length > 0) {
      const names = await sequelize.query(withTimeout('SELECT id, preferred_name FROM persons WHERE id IN (:personIds)'), {
        replacements: { personIds },
        type: sequelize.QueryTypes.SELECT
      });
      for (const row of names) nameMap.set(row.id, row.preferred_name);
    }

    return {
      pairs: pairs.map((pair) => ({
        ...pair,
        person1_name: nameMap.get(pair.person1_id) || null,
        person2_name: nameMap.get(pair.person2_id) || null
      })),
      total: pairs.length > 0 ? parseInt(pairs[0].total_pairs, 10) : (offset > 0 ? null : 0),
      degraded: false
    };
  }

  async getTopCollaborations(filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const minCollaborations = parseInt(filters.min_collaborations, 10) || 5;
    const yearFrom = filters.year_from ? parseInt(filters.year_from, 10) : null;
    const yearTo = filters.year_to ? parseInt(filters.year_to, 10) : null;
    const cacheKey = `top_collaborations:v3:${JSON.stringify({ page, limit, offset, minCollaborations, yearFrom, yearTo })}`;

    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const ranked = await this.rankCollaborationPairs({ minCollaborations, yearFrom, yearTo, limit, offset });
    const formattedPairs = ranked.pairs.map((pair, i) => formatTopCollaboration(pair, offset + i + 1));
    const total = ranked.total ?? offset;

    const result = {
      top_collaborations: formattedPairs,
      summary: {
        total_partnerships: total,
        avg_collaborations: formattedPairs.length > 0
          ? Math.round(formattedPairs.reduce((sum, p) => sum + p.metrics.shared_works, 0) / formattedPairs.length)
          : 0
      },
      pagination: createPagination(page, limit, total),
      filters: { min_collaborations: minCollaborations, year_from: yearFrom, year_to: yearTo },
      meta: ranked.degraded ? { degraded: true, pagination_total_exact: false } : { pagination_total_exact: true }
    };

    if (!ranked.degraded) await cacheService.set(cacheKey, result, 1800);
    return result;
  }
}

module.exports = new CollaborationsService();
