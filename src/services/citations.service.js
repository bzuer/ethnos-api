const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination } = require('../utils/pagination');
const { formatCitationWork } = require('../dto/citations.dto');
const { parseJsonColumn } = require('../dto/helpers');

const fetchWorkSummaryByIds = async (workIds) => {
  if (!workIds || workIds.length === 0) return {};
  const placeholders = workIds.map(() => '?').join(',');
  const rows = await sequelize.query(
    `SELECT sp.work_id,
            sp.title_search AS title,
            sp.publication_year AS year,
            sp.work_type,
            sp.venue_search AS venue_name,
            sv.abbrev_search AS venue_abbrev,
            sp.doi,
            sp.authors_json
       FROM summary_publications sp
       LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id
       INNER JOIN (
         SELECT work_id, MAX(publication_id) AS pub_id
         FROM summary_publications
         WHERE work_id IN (${placeholders})
         GROUP BY work_id
       ) latest ON latest.pub_id = sp.publication_id`,
    { replacements: workIds, type: sequelize.QueryTypes.SELECT }
  );
  return rows.reduce((acc, row) => {
    const authors = parseJsonColumn(row.authors_json);
    acc[row.work_id] = {
      title: row.title || null,
      year: row.year || null,
      work_type: row.work_type || null,
      venue_name: row.venue_name || null,
      venue_abbrev: row.venue_abbrev || null,
      doi: row.doi || null,
      authors_count: Array.isArray(authors) ? authors.length : 0
    };
    return acc;
  }, {});
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

class CitationsService {
  async getWorkCitations(workId, filters = {}) {
    const { page = 1, limit = 20, type = 'all' } = filters;
    const offset = (page - 1) * limit;
    
    const cacheKey = `citations:${workId}:${JSON.stringify(filters)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Citations for work ${workId} retrieved from cache`);
        return cached;
      }

      const workIdInt = parseInt(workId);
      const [targetDoiRows] = await Promise.all([
        sequelize.query(
          `SELECT doi
           FROM publications
           WHERE work_id = :workId
             AND doi IS NOT NULL
             AND TRIM(doi) <> ''`,
          { replacements: { workId: workIdInt }, type: sequelize.QueryTypes.SELECT }
        )
      ]);
      const doiCandidates = buildDoiCandidates((targetDoiRows || []).map(row => row.doi));
      const targetConditions = ['wr.cited_work_id = ?'];
      const targetReplacements = [workIdInt];
      if (doiCandidates.length) {
        targetConditions.push(`wr.cited_doi IN (${doiCandidates.map(() => '?').join(',')})`);
        targetReplacements.push(...doiCandidates);
      }
      const typeFilterEnabled = type !== 'all' && ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'SELF'].includes(String(type).toUpperCase());
      if (typeFilterEnabled) {
        targetConditions.push('wr.citation_type = ?');
        targetReplacements.push(String(type).toUpperCase());
      }
      const whereClause = `(${targetConditions.slice(0, doiCandidates.length ? 2 : 1).map(cond => `(${cond})`).join(' OR ')})${typeFilterEnabled ? ` AND (${targetConditions[targetConditions.length - 1]})` : ''}`;
      const queryReplacements = [...targetReplacements, parseInt(limit), parseInt(offset)];

      const citingRows = await sequelize.query(`
        SELECT 
          wr.citing_work_id,
          MIN(wr.citation_type) AS citation_type,
          CASE
            WHEN SUM(CASE WHEN wr.status = 'RESOLVED' THEN 1 ELSE 0 END) > 0 THEN 'RESOLVED'
            WHEN SUM(CASE WHEN wr.status = 'PENDING' THEN 1 ELSE 0 END) > 0 THEN 'PENDING'
            ELSE 'FAILED'
          END AS citation_status
        FROM work_references wr
        WHERE ${whereClause}
        GROUP BY wr.citing_work_id
        ORDER BY MAX(wr.id) DESC
        LIMIT ? OFFSET ?
      `, { replacements: queryReplacements, type: sequelize.QueryTypes.SELECT });

      const [countRow] = await sequelize.query(`
        SELECT COUNT(DISTINCT wr.citing_work_id) AS total
        FROM work_references wr
        WHERE ${whereClause}
      `, { replacements: targetReplacements, type: sequelize.QueryTypes.SELECT });
      const total = parseInt(countRow?.total || 0);

      const ids = citingRows.map(r => r.citing_work_id);
      const summaryMap = await fetchWorkSummaryByIds(ids);
      const citingWorks = citingRows.map(row => {
        const sw = summaryMap[row.citing_work_id] || {};
        return {
          citing_work_id: row.citing_work_id,
          title: sw.title || null,
          type: sw.work_type || null,
          year: sw.year || null,
          venue_name: sw.venue_name || sw.venue_abbrev || null,
          venue_abbreviated_name: sw.venue_abbrev || null,
          doi: sw.doi || null,
          authors_count: sw.authors_count || 0,
          citation: { type: row.citation_type || null, status: row.citation_status || null, context: null }
        };
      }).map(formatCitationWork);

      const result = {
        work_id: parseInt(workId),
        citing_works: citingWorks,
        pagination: createPagination(parseInt(page), parseInt(limit), parseInt(total)),
        filters: {
          type: type
        }
      };

      await cacheService.set(cacheKey, result, 300);
      logger.info(`Citations for work ${workId} cached: ${total} citing works`);
      
      return result;
    } catch (error) {
      logger.error(`Error fetching citations for work ${workId}:`, error);
      throw error;
    }
  }

  async getWorkReferences(workId, filters = {}) {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    const cacheKey = `references:${workId}:${JSON.stringify(filters)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`References for work ${workId} retrieved from cache`);
        return cached;
      }

      const referencesRows = await sequelize.query(`
        SELECT 
          wr.id,
          wr.cited_work_id,
          wr.cited_doi,
          wr.status,
          wr.citation_type,
          wr.created_at,
          wr.resolved_at
        FROM work_references wr
        WHERE wr.citing_work_id = :workId
        ORDER BY wr.id DESC
        LIMIT :limit OFFSET :offset
      `, { replacements: { workId: parseInt(workId), limit: parseInt(limit), offset: parseInt(offset) }, type: sequelize.QueryTypes.SELECT });

      const [refCount] = await sequelize.query(`
        SELECT COUNT(*) AS total
        FROM work_references wr
        WHERE wr.citing_work_id = :workId
      `, { replacements: { workId: parseInt(workId) }, type: sequelize.QueryTypes.SELECT });
      const total = parseInt(refCount?.total || 0);

      const resolvedByWorkId = new Map();
      referencesRows.forEach((row) => {
        if (!row.cited_work_id || row.status !== 'RESOLVED') {
          return;
        }
        if (!resolvedByWorkId.has(row.cited_work_id)) {
          resolvedByWorkId.set(row.cited_work_id, row);
        }
      });

      const resolvedRows = Array.from(resolvedByWorkId.values());
      const refIds = resolvedRows.map(r => r.cited_work_id);
      const refSummaryMap = await fetchWorkSummaryByIds(refIds);
      const referencedWorks = resolvedRows.map(row => {
        const sw = refSummaryMap[row.cited_work_id] || {};
        return {
          cited_work_id: row.cited_work_id,
          title: sw.title || null,
          type: sw.work_type || null,
          year: sw.year || null,
          venue_name: sw.venue_name || sw.venue_abbrev || null,
          venue_abbreviated_name: sw.venue_abbrev || null,
          doi: sw.doi || row.cited_doi || null,
          authors_count: sw.authors_count || 0,
          citation: { type: row.citation_type || null, context: null }
        };
      }).map(formatCitationWork);

      const unresolvedReferences = referencesRows
        .filter(row => row.status === 'PENDING' || row.status === 'FAILED')
        .map(row => ({
          cited_doi: row.cited_doi || null,
          status: row.status || 'PENDING',
          citation_type: row.citation_type || 'NEUTRAL',
          created_at: row.created_at || null,
          resolved_at: row.resolved_at || null
        }));

      const result = {
        work_id: parseInt(workId),
        referenced_works: referencedWorks,
        unresolved_references: unresolvedReferences,
        unsolved: unresolvedReferences,
        pagination: createPagination(parseInt(page), parseInt(limit), parseInt(total))
      };

      await cacheService.set(cacheKey, result, 300);
      logger.info(`References for work ${workId} cached: ${total} referenced works`);
      
      return result;
    } catch (error) {
      logger.error(`Error fetching references for work ${workId}:`, error);
      throw error;
    }
  }

  async getWorkMetrics(workId) {
    const cacheKey = `metrics:work:${workId}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Metrics for work ${workId} retrieved from cache`);
        return cached;
      }

      const workExists = await sequelize.query(
        'SELECT id, title, work_type FROM works WHERE id = :workId LIMIT 1',
        { replacements: { workId: parseInt(workId) }, type: sequelize.QueryTypes.SELECT }
      );

      if (!workExists || workExists.length === 0) {
        return null;
      }

      const [metricsData] = await Promise.all([
        sequelize.query(`
          SELECT 
            w.id as work_id,
            w.title,
            w.work_type,
            pub_year.year,
            COALESCE(cite_stats.total_citations_received, 0) as total_citations_received,
            COALESCE(ref_stats.total_references_made, 0) as total_references_made,
            COALESCE(cite_stats.unique_citing_works, 0) as unique_citing_works,
            COALESCE(cite_stats.positive_citations, 0) as positive_citations,
            COALESCE(cite_stats.neutral_citations, 0) as neutral_citations,
            COALESCE(cite_stats.negative_citations, 0) as negative_citations,
            COALESCE(cite_stats.self_citations, 0) as self_citations,
            cite_stats.first_citation_year,
            cite_stats.latest_citation_year
             
          FROM works w
          LEFT JOIN (
            SELECT p.work_id, MIN(p.year) AS year
            FROM publications p
            GROUP BY p.work_id
          ) pub_year ON w.id = pub_year.work_id
          LEFT JOIN (
            SELECT 
              wr.cited_work_id,
              COUNT(*) as total_citations_received,
              COUNT(DISTINCT wr.citing_work_id) as unique_citing_works,
              SUM(CASE WHEN wr.citation_type = 'POSITIVE' THEN 1 ELSE 0 END) as positive_citations,
              SUM(CASE WHEN wr.citation_type = 'NEUTRAL' THEN 1 ELSE 0 END) as neutral_citations,
              SUM(CASE WHEN wr.citation_type = 'NEGATIVE' THEN 1 ELSE 0 END) as negative_citations,
              SUM(CASE WHEN wr.citation_type = 'SELF' THEN 1 ELSE 0 END) as self_citations,
              MIN(citing_pub.year) as first_citation_year,
              MAX(citing_pub.year) as latest_citation_year
            FROM work_references wr
            LEFT JOIN (
              SELECT p.work_id, MIN(p.year) AS year
              FROM publications p
              GROUP BY p.work_id
            ) citing_pub ON wr.citing_work_id = citing_pub.work_id
            WHERE wr.cited_work_id = :workId
              AND wr.status = 'RESOLVED'
            GROUP BY wr.cited_work_id
          ) cite_stats ON w.id = cite_stats.cited_work_id
          LEFT JOIN (
            SELECT 
              wr.citing_work_id,
              COUNT(*) as total_references_made
            FROM work_references wr
            WHERE wr.citing_work_id = :workId
            GROUP BY wr.citing_work_id
          ) ref_stats ON w.id = ref_stats.citing_work_id
          WHERE w.id = :workId
        `, {
          replacements: { workId: parseInt(workId) },
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      if (!metricsData || metricsData.length === 0) {
        return null;
      }

      const metrics = metricsData[0];
      
      const citationsPerYear = metrics.year && metrics.first_citation_year ? 
        Math.max(1, new Date().getFullYear() - metrics.first_citation_year) : 1;
      
      const result = {
        work_id: parseInt(workId),
        title: metrics.title,
        type: metrics.work_type,
        publication_year: metrics.year,
        citation_metrics: {
          total_citations_received: parseInt(metrics.total_citations_received) || 0,
          total_references_made: parseInt(metrics.total_references_made) || 0,
          unique_citing_works: parseInt(metrics.unique_citing_works) || 0,
          citations_per_year: parseFloat((metrics.total_citations_received / citationsPerYear).toFixed(2)),
          citation_types: {
            positive: parseInt(metrics.positive_citations) || 0,
            neutral: parseInt(metrics.neutral_citations) || 0,
            negative: parseInt(metrics.negative_citations) || 0,
            self: parseInt(metrics.self_citations) || 0
          }
        },
        temporal_metrics: {
          first_citation_year: metrics.first_citation_year,
          latest_citation_year: metrics.latest_citation_year,
          citation_span_years: metrics.first_citation_year && metrics.latest_citation_year ? 
            metrics.latest_citation_year - metrics.first_citation_year + 1 : null
        },
        impact_indicators: {
          highly_cited: (metrics.total_citations_received || 0) > 100,
          citation_velocity: metrics.latest_citation_year === new Date().getFullYear() ? 'current' : 
                            metrics.latest_citation_year >= new Date().getFullYear() - 2 ? 'recent' : 'historical'
        }
      };

      await cacheService.set(cacheKey, result, 600);
      logger.info(`Metrics for work ${workId} cached`);
      
      return result;
    } catch (error) {
      logger.error(`Error fetching metrics for work ${workId}:`, error);
      try {
        const fallback = {
          work_id: parseInt(workId),
          title: null,
          type: null,
          publication_year: null,
          citation_metrics: {
            total_citations_received: 0,
            total_references_made: 0,
            unique_citing_works: 0,
            citations_per_year: 0,
            citation_types: { positive: 0, neutral: 0, negative: 0, self: 0 }
          },
          temporal_metrics: {
            first_citation_year: null,
            latest_citation_year: null,
            citation_span_years: null
          },
          impact_indicators: {
            highly_cited: false,
            citation_velocity: 'unknown'
          }
        };
        await cacheService.set(cacheKey, fallback, 300);
        return fallback;
      } catch (_) {
        return null;
      }
    }
  }

  async getCitationNetwork(workId, depth = 1) {
    const cacheKey = `network:${workId}:depth${depth}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Citation network for work ${workId} retrieved from cache`);
        return cached;
      }

      let networkData;
      try {
        const [rows] = await Promise.all([
          sequelize.query(`
          WITH RECURSIVE citation_network AS (
            SELECT 
              wr.citing_work_id as source_work_id,
              wr.cited_work_id as target_work_id,
              1 as depth,
              wr.citation_type
            FROM work_references wr
            WHERE wr.status = 'RESOLVED'
              AND wr.cited_work_id IS NOT NULL
              AND (wr.cited_work_id = :workId OR wr.citing_work_id = :workId)
            
            UNION ALL
            
            SELECT 
              wr.citing_work_id as source_work_id,
              wr.cited_work_id as target_work_id,
              cn.depth + 1,
              wr.citation_type
            FROM work_references wr
            INNER JOIN citation_network cn ON (wr.cited_work_id = cn.source_work_id OR wr.citing_work_id = cn.target_work_id)
            WHERE cn.depth < :maxDepth
              AND wr.status = 'RESOLVED'
              AND wr.cited_work_id IS NOT NULL
          )
          SELECT 
            cn.source_work_id,
            cn.target_work_id,
            cn.depth,
            cn.citation_type,
            w1.title as source_title,
            w2.title as target_title,
            pub1.year as source_year,
            pub2.year as target_year
          FROM citation_network cn
          LEFT JOIN works w1 ON cn.source_work_id = w1.id
          LEFT JOIN works w2 ON cn.target_work_id = w2.id
          LEFT JOIN publications pub1 ON w1.id = pub1.work_id
          LEFT JOIN publications pub2 ON w2.id = pub2.work_id
          ORDER BY cn.depth, cn.source_work_id, cn.target_work_id
          LIMIT 100
        `, {
            replacements: { workId: parseInt(workId), maxDepth: parseInt(depth) },
            type: sequelize.QueryTypes.SELECT
          })
        ]);
        networkData = rows;
      } catch (cteError) {
        logger.warn('Recursive CTE not available, using 1-depth fallback for citation network', {
          error: cteError.message
        });
        networkData = await sequelize.query(
          `SELECT 
            wr.citing_work_id as source_work_id,
            wr.cited_work_id as target_work_id,
            1 as depth,
            wr.citation_type,
            w1.title as source_title,
            w2.title as target_title,
            pub1.year as source_year,
            pub2.year as target_year
          FROM work_references wr
          LEFT JOIN works w1 ON wr.citing_work_id = w1.id
          LEFT JOIN works w2 ON wr.cited_work_id = w2.id
          LEFT JOIN publications pub1 ON w1.id = pub1.work_id
          LEFT JOIN publications pub2 ON w2.id = pub2.work_id
          WHERE wr.status = 'RESOLVED'
            AND wr.cited_work_id IS NOT NULL
            AND (wr.cited_work_id = :workId OR wr.citing_work_id = :workId)
          ORDER BY wr.citing_work_id, wr.cited_work_id
          LIMIT 100`,
          { replacements: { workId: parseInt(workId) }, type: sequelize.QueryTypes.SELECT }
        );
      }

      const result = {
        central_work_id: parseInt(workId),
        network_depth: parseInt(depth),
        nodes: {},
        edges: [],
        network_stats: {
          total_nodes: 0,
          total_edges: networkData.length,
          max_depth: Math.max(...networkData.map(d => d.depth), 0)
        }
      };

      const nodeSet = new Set();
      
      networkData.forEach(edge => {
        nodeSet.add(edge.source_work_id);
        nodeSet.add(edge.target_work_id);
        
        result.edges.push({
          source: edge.source_work_id,
          target: edge.target_work_id,
          depth: edge.depth,
          citation_type: edge.citation_type,
          source_year: edge.source_year,
          target_year: edge.target_year
        });
        
        if (!result.nodes[edge.source_work_id]) {
          result.nodes[edge.source_work_id] = {
            id: edge.source_work_id,
            title: edge.source_title,
            year: edge.source_year,
            is_central: edge.source_work_id === parseInt(workId)
          };
        }
        
        if (!result.nodes[edge.target_work_id]) {
          result.nodes[edge.target_work_id] = {
            id: edge.target_work_id,
            title: edge.target_title,
            year: edge.target_year,
            is_central: edge.target_work_id === parseInt(workId)
          };
        }
      });

      result.network_stats.total_nodes = nodeSet.size;

      await cacheService.set(cacheKey, result, 900);
      logger.info(`Citation network for work ${workId} cached: ${result.network_stats.total_nodes} nodes, ${result.network_stats.total_edges} edges`);
      
      return result;
    } catch (error) {
      logger.error(`Error fetching citation network for work ${workId}:`, error);
      return {
        central_work_id: parseInt(workId),
        network_depth: parseInt(depth),
        nodes: {},
        edges: [],
        network_stats: {
          total_nodes: 0,
          total_edges: 0,
          max_depth: 0
        }
      };
    }
  }
}

module.exports = new CitationsService();
