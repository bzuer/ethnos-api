const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination } = require('../utils/pagination');
const { withTimeout, latestPublicationJoin } = require('../utils/db');
const { formatCitationWork } = require('../dto/citations.dto');

const fetchWorkSummaryByIds = async (workIds) => {
  if (!workIds || workIds.length === 0) return {};
  const placeholders = workIds.map(() => '?').join(',');
  const rows = await sequelize.query(
    withTimeout(`SELECT
       w.id AS work_id,
       w.title,
       p.type AS work_type,
       p.year,
       p.doi,
       v.name AS venue_name,
       v.abbreviated_name AS venue_abbrev,
       (SELECT COUNT(*) FROM authorships a WHERE a.work_id = w.id) AS authors_count
     FROM works w
     ${latestPublicationJoin('p', 'LEFT')}
     LEFT JOIN venues v ON v.id = p.venue_id
     WHERE w.id IN (${placeholders})`),
    { replacements: workIds, type: sequelize.QueryTypes.SELECT }
  );
  return rows.reduce((acc, row) => {
    acc[row.work_id] = {
      title: row.title || null,
      year: row.year || null,
      work_type: row.work_type || null,
      venue_name: row.venue_name || null,
      venue_abbrev: row.venue_abbrev || null,
      doi: row.doi || null,
      authors_count: parseInt(row.authors_count, 10) || 0
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

      const citingRows = await sequelize.query(withTimeout(`
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
      `), { replacements: queryReplacements, type: sequelize.QueryTypes.SELECT });

      const [countRow] = await sequelize.query(withTimeout(`
        SELECT COUNT(DISTINCT wr.citing_work_id) AS total
        FROM work_references wr
        WHERE ${whereClause}
      `), { replacements: targetReplacements, type: sequelize.QueryTypes.SELECT });
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

      const referencesRows = await sequelize.query(withTimeout(`
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
      `), { replacements: { workId: parseInt(workId), limit: parseInt(limit), offset: parseInt(offset) }, type: sequelize.QueryTypes.SELECT });

      const [refCount] = await sequelize.query(withTimeout(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN wr.status = 'RESOLVED' AND wr.cited_work_id IS NOT NULL THEN 1 ELSE 0 END) AS resolved_total,
          SUM(CASE WHEN wr.status IN ('PENDING', 'FAILED') THEN 1 ELSE 0 END) AS unresolved_total
        FROM work_references wr
        WHERE wr.citing_work_id = :workId
      `), { replacements: { workId: parseInt(workId) }, type: sequelize.QueryTypes.SELECT });
      const total = parseInt(refCount?.total || 0);
      const resolvedTotal = parseInt(refCount?.resolved_total || 0);
      const unresolvedTotal = parseInt(refCount?.unresolved_total || 0);

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
        counts: { total, resolved: resolvedTotal, unresolved: unresolvedTotal },
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
        'SELECT id, title FROM works WHERE id = :workId LIMIT 1',
        { replacements: { workId: parseInt(workId) }, type: sequelize.QueryTypes.SELECT }
      );

      if (!workExists || workExists.length === 0) {
        return null;
      }

      const [metricsData] = await Promise.all([
        sequelize.query(withTimeout(`
          SELECT
            w.id as work_id,
            w.title,
            (SELECT p3.type FROM publications p3 WHERE p3.work_id = w.id ORDER BY p3.year DESC, p3.id DESC LIMIT 1) AS work_type,
            (SELECT MIN(p.year) FROM publications p WHERE p.work_id = w.id) AS year,
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
            SELECT
              wr.cited_work_id,
              COUNT(*) as total_citations_received,
              COUNT(DISTINCT wr.citing_work_id) as unique_citing_works,
              SUM(CASE WHEN wr.citation_type = 'POSITIVE' THEN 1 ELSE 0 END) as positive_citations,
              SUM(CASE WHEN wr.citation_type = 'NEUTRAL' THEN 1 ELSE 0 END) as neutral_citations,
              SUM(CASE WHEN wr.citation_type = 'NEGATIVE' THEN 1 ELSE 0 END) as negative_citations,
              SUM(CASE WHEN wr.citation_type = 'SELF' THEN 1 ELSE 0 END) as self_citations,
              MIN((SELECT MIN(p.year) FROM publications p WHERE p.work_id = wr.citing_work_id)) as first_citation_year,
              MAX((SELECT MIN(p.year) FROM publications p WHERE p.work_id = wr.citing_work_id)) as latest_citation_year
            FROM work_references wr
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
        `), {
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

      const centralId = parseInt(workId);
      const maxDepth = Math.max(1, Math.min(parseInt(depth) || 1, 3));
      const EDGE_CAP = 100;
      const NODE_CAP = 120;
      const PER_LEVEL_CAP = 200;

      const edgeList = [];
      const seenEdges = new Set();
      const visitedNodes = new Set([centralId]);
      let frontier = [centralId];

      for (let d = 1; d <= maxDepth && edgeList.length < EDGE_CAP && frontier.length; d++) {
        const ph = frontier.map(() => '?').join(',');
        const [outRows, inRows] = await Promise.all([
          sequelize.query(
            withTimeout(`SELECT wr.citing_work_id AS source_work_id, wr.cited_work_id AS target_work_id, wr.citation_type
              FROM work_references wr
              WHERE wr.status = 'RESOLVED' AND wr.cited_work_id IS NOT NULL AND wr.citing_work_id IN (${ph})
              ORDER BY wr.id DESC LIMIT ?`),
            { replacements: [...frontier, PER_LEVEL_CAP], type: sequelize.QueryTypes.SELECT }
          ),
          sequelize.query(
            withTimeout(`SELECT wr.citing_work_id AS source_work_id, wr.cited_work_id AS target_work_id, wr.citation_type
              FROM work_references wr
              WHERE wr.status = 'RESOLVED' AND wr.cited_work_id IS NOT NULL AND wr.cited_work_id IN (${ph})
              ORDER BY wr.id DESC LIMIT ?`),
            { replacements: [...frontier, PER_LEVEL_CAP], type: sequelize.QueryTypes.SELECT }
          )
        ]);

        const nextFrontier = [];
        for (const row of [...outRows, ...inRows]) {
          if (edgeList.length >= EDGE_CAP) break;
          const src = row.source_work_id;
          const tgt = row.target_work_id;
          if (src == null || tgt == null) continue;
          const key = `${src}->${tgt}`;
          if (seenEdges.has(key)) continue;
          seenEdges.add(key);
          edgeList.push({ source_work_id: src, target_work_id: tgt, depth: d, citation_type: row.citation_type });
          for (const nid of [src, tgt]) {
            if (!visitedNodes.has(nid) && visitedNodes.size < NODE_CAP) {
              visitedNodes.add(nid);
              nextFrontier.push(nid);
            }
          }
        }
        frontier = nextFrontier;
      }

      const nodeInfo = {};
      if (visitedNodes.size) {
        const ids = Array.from(visitedNodes);
        const ph = ids.map(() => '?').join(',');
        const infoRows = await sequelize.query(
          withTimeout(`SELECT w.id, w.title, (SELECT MIN(p.year) FROM publications p WHERE p.work_id = w.id) AS year
            FROM works w WHERE w.id IN (${ph})`),
          { replacements: ids, type: sequelize.QueryTypes.SELECT }
        );
        infoRows.forEach((r) => { nodeInfo[r.id] = { title: r.title || null, year: r.year || null }; });
      }

      const networkData = edgeList.map((e) => ({
        source_work_id: e.source_work_id,
        target_work_id: e.target_work_id,
        depth: e.depth,
        citation_type: e.citation_type,
        source_title: nodeInfo[e.source_work_id] ? nodeInfo[e.source_work_id].title : null,
        target_title: nodeInfo[e.target_work_id] ? nodeInfo[e.target_work_id].title : null,
        source_year: nodeInfo[e.source_work_id] ? nodeInfo[e.source_work_id].year : null,
        target_year: nodeInfo[e.target_work_id] ? nodeInfo[e.target_work_id].year : null
      }));

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
