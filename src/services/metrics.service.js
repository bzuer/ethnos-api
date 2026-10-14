const { sequelize } = require('../config/database');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination, normalizePagination } = require('../utils/pagination');
const { withTimeout, isStatementTimeout } = require('../utils/db');
const {
  formatAnnualStats,
  formatVenueRanking,
  formatInstitutionProductivity,
  formatPersonProduction
} = require('../dto/metrics.dto');
const { formatTopCollaboration } = require('../dto/collaborations.dto');
const collaborationsService = require('./collaborations.service');

class MetricsService {
  async getAnnualStats(filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { year_from, year_to } = filters;
    const cacheKey = `metrics:annual:v6:${JSON.stringify({ page, limit, offset, year_from, year_to })}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Annual stats retrieved from cache');
        return cached;
      }

      const params = { limit: parseInt(limit), offset: parseInt(offset), year_from, year_to };
      let source;
      try {
        source = await this._getAnnualStatsFromSummary(params);
      } catch (summaryError) {
        if (isMissingTable(summaryError)) {
          logger.warn('metrics_annual_summary unavailable; falling back to live aggregation');
          source = await this._getAnnualStatsLive(params);
        } else {
          throw summaryError;
        }
      }

      const result = buildAnnualResult(source, page, limit);
      await cacheService.set(cacheKey, result, 86400);
      logger.info(`Annual stats cached: ${source.stats.length} years (${source.engine})`);
      return result;
    } catch (error) {
      if (isStatementTimeout(error)) {
        logger.warn('Annual stats statement budget exceeded; serving degraded page');
        return {
          data: [],
          pagination: createPagination(page, limit, 0),
          summary: {
            total_years: 0,
            date_range: null,
            total_publications_all_years: 0,
            avg_publications_per_year: 0,
            growth_trend: null,
            degraded: true
          }
        };
      }
      logger.error('Error fetching annual stats:', error);
      throw error;
    }
  }

  async _getAnnualStatsFromSummary({ limit, offset, year_from, year_to }) {
    const whereConditions = ['s.year >= 1000', 's.year <= YEAR(CURDATE()) + 1'];
    const replacements = {};
    if (year_from) {
      whereConditions.push('s.year >= :year_from');
      replacements.year_from = parseInt(year_from);
    }
    if (year_to) {
      whereConditions.push('s.year <= :year_to');
      replacements.year_to = parseInt(year_to);
    }

    const rows = await sequelize.query(withTimeout(`
      SELECT
        s.year AS year,
        s.total_publications AS total_publications,
        s.unique_works AS unique_works,
        s.open_access_count AS open_access_count,
        ROUND(s.open_access_count * 100.0 / NULLIF(s.total_publications, 0), 2) AS open_access_percentage,
        s.articles AS articles,
        s.books AS books,
        s.avg_citations AS avg_citations,
        s.unique_organizations AS unique_organizations,
        s.refreshed_at AS refreshed_at
      FROM metrics_annual_summary s
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY s.year DESC
    `), { replacements, type: sequelize.QueryTypes.SELECT });

    const refreshedAt = rows.reduce((latest, row) => (row.refreshed_at && (!latest || row.refreshed_at > latest) ? row.refreshed_at : latest), null);
    return {
      stats: rows.slice(parseInt(offset), parseInt(offset) + parseInt(limit)),
      total: rows.length,
      aggregate: rows,
      refreshedAt,
      engine: 'metrics_annual_summary'
    };
  }

  async _getAnnualStatsLive({ limit, offset, year_from, year_to }) {
    const whereConditions = ['p.year IS NOT NULL', 'p.year >= 1000', 'p.year <= YEAR(CURDATE()) + 1'];
    const replacements = { limit: parseInt(limit), offset: parseInt(offset) };
    if (year_from) {
      whereConditions.push('p.year >= :year_from');
      replacements.year_from = parseInt(year_from);
    }
    if (year_to) {
      whereConditions.push('p.year <= :year_to');
      replacements.year_to = parseInt(year_to);
    }
    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const [yearRows, countRows] = await Promise.all([
      sequelize.query(withTimeout(`
        SELECT DISTINCT p.year AS year
        FROM publications p
        ${whereClause}
        ORDER BY p.year DESC
        LIMIT :limit OFFSET :offset
      `), { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(withTimeout(`
        SELECT COUNT(DISTINCT p.year) AS total
        FROM publications p
        ${whereClause}
      `), { replacements, type: sequelize.QueryTypes.SELECT })
    ]);
    const total = countRows?.[0]?.total ? parseInt(countRows[0].total, 10) : 0;
    const pageYears = (yearRows || [])
      .map((row) => parseInt(row.year, 10))
      .filter((year) => Number.isFinite(year));

    let stats = [];
    if (pageYears.length > 0) {
      stats = await sequelize.query(withTimeout(`
        SELECT
          p.year AS year,
          COUNT(*) AS total_publications,
          COUNT(DISTINCT p.work_id) AS unique_works,
          SUM(CASE WHEN p.open_access = 1 THEN 1 ELSE 0 END) AS open_access_count,
          ROUND(SUM(CASE WHEN p.open_access = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS open_access_percentage,
          SUM(CASE WHEN p.type = 'ARTICLE' THEN 1 ELSE 0 END) AS articles,
          SUM(CASE WHEN p.type = 'BOOK' THEN 1 ELSE 0 END) AS books,
          ROUND(AVG(p.citation_count), 2) AS avg_citations,
          0 AS unique_organizations
        FROM publications p
        WHERE p.year IN (:pageYears)
        GROUP BY p.year
        ORDER BY p.year DESC
      `), { replacements: { pageYears }, type: sequelize.QueryTypes.SELECT });
    }

    return { stats: stats || [], total, engine: 'live_aggregation' };
  }

  async getTopVenues(filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const cacheKey = `metrics:venues:v4:${JSON.stringify({ page, limit, offset })}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Venue ranking retrieved from cache');
        return cached;
      }

      const [venues, countRows] = await Promise.all([
        sequelize.query(`
          SELECT
            v.id AS venue_id,
            v.name AS venue_name,
            v.abbreviated_name AS venue_abbreviated_name,
            v.type AS venue_type,
            COALESCE(v.works_count, 0) AS total_works,
            0 AS unique_authors,
            v.coverage_start_year AS first_publication_year,
            v.coverage_end_year AS latest_publication_year,
            NULL AS open_access_percentage,
            NULL AS open_access_works
          FROM venues v
          WHERE COALESCE(v.works_count, 0) > 0
          ORDER BY v.works_count DESC, v.total_score DESC
          LIMIT :limit OFFSET :offset
        `, {
          replacements: { limit: parseInt(limit), offset: parseInt(offset) },
          type: sequelize.QueryTypes.SELECT
        }),
        sequelize.query(`
          SELECT COUNT(*) AS total
          FROM venues
          WHERE COALESCE(works_count, 0) > 0
        `, { type: sequelize.QueryTypes.SELECT })
      ]);
      const total = countRows?.[0]?.total ? parseInt(countRows[0].total, 10) : 0;

      const formattedVenues = venues.map((venue, index) => formatVenueRanking(venue, offset + index + 1));

      const result = {
        data: formattedVenues,
        pagination: createPagination(page, limit, total),
        summary: {
          total_venues_ranked: total,
          top_venue_publications: formattedVenues.length > 0 ? formattedVenues[0].metrics.total_works : 0,
          total_unique_authors: formattedVenues.reduce((sum, v) => sum + v.metrics.unique_authors, 0),
          avg_open_access_percentage: formattedVenues.length > 0
            ? Math.round(formattedVenues.reduce((sum, v) => sum + v.metrics.open_access_percentage, 0) / formattedVenues.length * 10) / 10
            : 0,
          venue_types: [...new Set(formattedVenues.map(v => v.type))].filter(Boolean)
        }
      };

      await cacheService.set(cacheKey, result, 86400);
      logger.info(`Venue ranking cached: ${venues.length} venues`);
      return result;
    } catch (error) {
      logger.error('Error fetching venue ranking:', error);
      throw error;
    }
  }

  async getInstitutionProductivity(filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { country_code } = filters;
    const cacheKey = `metrics:institutions:v4:${JSON.stringify({ page, limit, offset, country_code })}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Institution productivity retrieved from cache');
        return cached;
      }

      const replacements = { limit: parseInt(limit), offset: parseInt(offset) };
      const countryFilter = country_code ? 'AND o.country_code = :country_code' : '';
      if (country_code) replacements.country_code = country_code;

      const topOrgsRows = await sequelize.query(`
        SELECT
          o.id AS organization_id,
          o.name AS organization_name,
          o.country_code,
          o.publication_count AS total_works,
          o.researcher_count AS unique_researchers,
          o.total_citations,
          o.open_access_works_count,
          o.h_index
        FROM organizations o
        WHERE o.publication_count > 0
          ${countryFilter}
        ORDER BY o.publication_count DESC, o.id ASC
        LIMIT :limit OFFSET :offset
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      });

      const orgIds = topOrgsRows.map(r => r.organization_id);
      const timespanMap = Object.create(null);
      if (orgIds.length > 0) {
        const timespans = await sequelize.query(`
          SELECT
            a.affiliation_id AS organization_id,
            MIN(pub.year) AS first_publication_year,
            MAX(pub.year) AS latest_publication_year
          FROM authorships a
          JOIN publications pub ON pub.work_id = a.work_id
          WHERE a.affiliation_id IN (:orgIds) AND pub.year IS NOT NULL
          GROUP BY a.affiliation_id
        `, {
          replacements: { orgIds },
          type: sequelize.QueryTypes.SELECT
        });
        for (const row of timespans) {
          timespanMap[row.organization_id] = row;
        }
      }

      const institutions = topOrgsRows.map(row => {
        const timespan = timespanMap[row.organization_id] || {};
        const totalWorks = parseInt(row.total_works, 10) || 0;
        const totalCitations = parseInt(row.total_citations, 10) || 0;
        return {
          organization_id: row.organization_id,
          organization_name: row.organization_name,
          country_code: row.country_code,
          total_works: totalWorks,
          total_citations: totalCitations,
          avg_citations: totalWorks > 0 ? Math.round((totalCitations / totalWorks) * 100) / 100 : null,
          unique_researchers: parseInt(row.unique_researchers, 10) || 0,
          open_access_works_count: parseInt(row.open_access_works_count, 10) || 0,
          h_index: row.h_index === null || row.h_index === undefined ? null : parseInt(row.h_index, 10),
          first_publication_year: timespan.first_publication_year || null,
          latest_publication_year: timespan.latest_publication_year || null
        };
      });

      let total = institutions.length + parseInt(offset);
      try {
        const [countRow] = await sequelize.query(withTimeout(`
          SELECT COUNT(*) AS total
          FROM organizations o
          WHERE o.publication_count > 0
            ${countryFilter}
        `), {
          replacements: country_code ? { country_code } : {},
          type: sequelize.QueryTypes.SELECT
        });
        if (countRow && countRow.total !== undefined) total = parseInt(countRow.total, 10);
      } catch (error) {
        logger.warn('Institution productivity count fallback used', { error: error.message });
      }
      const formattedInstitutions = institutions.map((inst, index) => formatInstitutionProductivity(inst, offset + index + 1));

      const result = {
        data: formattedInstitutions,
        pagination: createPagination(page, limit, total),
        summary: {
          total_institutions_ranked: total,
          countries_represented: [...new Set(formattedInstitutions.map(i => i.country_code))].filter(Boolean),
          top_institution_works: formattedInstitutions.length > 0 ? formattedInstitutions[0].metrics.total_works : 0,
          avg_citations_per_work: formattedInstitutions.length > 0
            ? Math.round(formattedInstitutions.reduce((sum, i) => sum + i.metrics.avg_citations, 0) / formattedInstitutions.length * 100) / 100
            : 0,
          total_citations: formattedInstitutions.reduce((sum, i) => sum + i.metrics.total_citations, 0)
        }
      };

      await cacheService.set(cacheKey, result, 86400);
      logger.info(`Institution productivity cached: ${institutions.length} institutions`);
      return result;
    } catch (error) {
      logger.error('Error fetching institution productivity:', error);
      throw error;
    }
  }

  async getPersonProduction(filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { organization_id } = filters;
    const minWorks = filters.min_works !== undefined && filters.min_works !== null && filters.min_works !== ''
      ? parseInt(filters.min_works, 10)
      : null;
    const cacheKey = `metrics:persons:v6:${JSON.stringify({ page, limit, offset, organization_id, minWorks })}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Person production retrieved from cache');
        return cached;
      }

      const whereConditions = ['p.total_works > 0'];
      const replacements = { limit: parseInt(limit), offset: parseInt(offset) };

      if (Number.isFinite(minWorks) && minWorks > 0) {
        whereConditions.push('p.total_works >= :min_works');
        replacements.min_works = minWorks;
      }

      if (organization_id) {
        whereConditions.push(`EXISTS (
          SELECT 1 FROM authorships a
          WHERE a.person_id = p.id AND a.affiliation_id = :organization_id
        )`);
        replacements.organization_id = parseInt(organization_id);
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      const [idRows, countRows] = await Promise.all([
        sequelize.query(withTimeout(`
          SELECT p.id
          FROM persons p
          ${whereClause}
          ORDER BY p.total_works DESC, p.id DESC
          LIMIT :limit OFFSET :offset
        `), {
          replacements,
          type: sequelize.QueryTypes.SELECT
        }),
        sequelize.query(withTimeout(`
          SELECT COUNT(*) AS total
          FROM persons p
          ${whereClause}
        `), {
          replacements,
          type: sequelize.QueryTypes.SELECT
        })
      ]);
      const total = countRows?.[0]?.total ? parseInt(countRows[0].total, 10) : 0;

      const ids = idRows.map((row) => row.id);
      const persons = ids.length === 0 ? [] : await sequelize.query(withTimeout(`
        SELECT
          p.id AS person_id,
          p.preferred_name AS person_name,
          p.orcid,
          p.is_verified,
          p.total_works AS total_works,
          p.total_citations AS total_citations,
          ROUND(
            CASE WHEN p.total_works > 0
                 THEN p.total_citations / p.total_works
                 ELSE NULL END,
            2
          ) AS avg_citations,
          p.first_publication_year,
          p.latest_publication_year
        FROM persons p
        WHERE p.id IN (:ids)
        ORDER BY p.total_works DESC, p.id DESC
      `), {
        replacements: { ids },
        type: sequelize.QueryTypes.SELECT
      });

      const formattedPersons = persons.map((person, index) => formatPersonProduction(person, offset + index + 1));

      const result = {
        data: formattedPersons,
        pagination: createPagination(page, limit, total),
        summary: {
          total_persons_ranked: total,
          top_person_works: formattedPersons.length > 0 ? formattedPersons[0].metrics.total_works : 0,
          avg_citations_per_work: formattedPersons.length > 0
            ? Math.round(formattedPersons.reduce((sum, p) => sum + p.metrics.avg_citations, 0) / formattedPersons.length * 100) / 100
            : 0,
          total_citations: formattedPersons.reduce((sum, p) => sum + p.metrics.total_citations, 0)
        }
      };

      await cacheService.set(cacheKey, result, 86400);
      logger.info(`Person production cached: ${persons.length} persons`);
      return result;
    } catch (error) {
      logger.error('Error fetching person production:', error);
      throw error;
    }
  }

  async getCollaborations(filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const minCollaborations = parseInt(filters.min_collaborations, 10) || 2;
    const cacheKey = `metrics:collaborations:v5:${JSON.stringify({ page, limit, offset, minCollaborations })}`;

    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const ranked = await collaborationsService.rankCollaborationPairs({ minCollaborations, limit, offset });
    const formattedCollaborations = ranked.pairs.map((pair, index) => formatTopCollaboration(pair, offset + index + 1));
    const total = ranked.total ?? offset;

    const result = {
      data: formattedCollaborations,
      pagination: createPagination(page, limit, total),
      summary: {
        total_collaboration_pairs: total,
        strongest_collaboration_count: formattedCollaborations.length > 0 ? formattedCollaborations[0].metrics.shared_works : 0,
        avg_collaboration_years: formattedCollaborations.length > 0
          ? Math.round(formattedCollaborations.reduce((sum, c) => sum + c.timespan.collaboration_years, 0) / formattedCollaborations.length)
          : 0,
        collaboration_strength_distribution: calculateCollaborationStrengthDistribution(formattedCollaborations)
      },
      filters: { min_collaborations: minCollaborations },
      meta: ranked.degraded ? { degraded: true, pagination_total_exact: false } : { pagination_total_exact: true }
    };

    if (!ranked.degraded) await cacheService.set(cacheKey, result, 86400);
    return result;
  }
}

const isMissingTable = (error) => {
  if (!error) return false;
  const src = error.original || error.parent || error;
  const code = src.code || error.code;
  const errno = src.errno || error.errno;
  return code === 'ER_NO_SUCH_TABLE' || errno === 1146 || /doesn't exist/i.test(String(error.message || ''));
};

const buildAnnualResult = (source, page, limit) => {
  const formattedStats = source.stats.map(formatAnnualStats);
  const scope = (source.aggregate || source.stats).map((row) => ({
    year: parseInt(row.year, 10),
    total_publications: parseInt(row.total_publications, 10) || 0
  }));
  const years = scope.map((row) => row.year).filter(Number.isFinite);
  const totalPublications = scope.reduce((sum, row) => sum + row.total_publications, 0);
  return {
    data: formattedStats,
    pagination: createPagination(page, limit, source.total),
    summary: {
      scope: source.aggregate ? 'all_years_in_range' : 'current_page',
      total_years: source.total,
      date_range: years.length > 0 ? `${Math.min(...years)}-${Math.max(...years)}` : null,
      total_publications_all_years: totalPublications,
      avg_publications_per_year: scope.length > 0 ? Math.round(totalPublications / scope.length) : 0,
      growth_trend: calculateGrowthTrend(scope),
      source: source.engine,
      refreshed_at: source.refreshedAt || null
    }
  };
};

const calculateGrowthTrend = (rows) => {
  const currentYear = new Date().getFullYear();
  const complete = rows
    .filter((row) => row.year < currentYear)
    .sort((a, b) => b.year - a.year);
  if (complete.length < 6) return 'insufficient_data';
  const mean = (list) => list.reduce((sum, row) => sum + row.total_publications, 0) / list.length;
  const recent = mean(complete.slice(0, 3));
  const previous = mean(complete.slice(3, 6));
  if (previous === 0) return recent > 0 ? 'increasing' : 'stable';
  const change = ((recent - previous) / previous) * 100;
  if (change > 10) return 'increasing';
  if (change < -10) return 'decreasing';
  return 'stable';
};

const calculateCollaborationStrengthDistribution = (collaborations) => {
  const distribution = { very_strong: 0, strong: 0, moderate: 0, weak: 0 };
  collaborations.forEach(collab => {
    const strength = collab.metrics.collaboration_strength;
    if (Object.prototype.hasOwnProperty.call(distribution, strength)) {
      distribution[strength]++;
    }
  });
  return distribution;
};

module.exports = new MetricsService();
