const { sequelize } = require('../config/database');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination, normalizePagination } = require('../utils/pagination');
const {
  formatAnnualStats,
  formatVenueRanking,
  formatInstitutionProductivity,
  formatPersonProduction,
  formatCollaboration
} = require('../dto/metrics.dto');

class MetricsService {
  async getAnnualStats(filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { year_from, year_to } = filters;
    const cacheKey = `metrics:annual:${JSON.stringify({ page, limit, offset, year_from, year_to })}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Annual stats retrieved from cache');
        return cached;
      }

      const whereConditions = [];
      const replacements = { limit: parseInt(limit), offset: parseInt(offset) };

      if (year_from) {
        whereConditions.push('year >= :year_from');
        replacements.year_from = parseInt(year_from);
      }

      if (year_to) {
        whereConditions.push('year <= :year_to');
        replacements.year_to = parseInt(year_to);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const [stats, countRows] = await Promise.all([
        sequelize.query(`
        SELECT 
          year,
          total_publications,
          unique_works,
          open_access_count,
          ROUND(open_access_percentage, 2) as open_access_percentage,
          articles,
          books,
          ROUND(avg_citations, 2) as avg_citations,
          ROUND(total_downloads, 0) as total_downloads,
          unique_organizations
        FROM v_annual_stats
        ${whereClause}
        ORDER BY year DESC
        LIMIT :limit OFFSET :offset
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      }),
      sequelize.query(`
        SELECT COUNT(*) AS total
        FROM v_annual_stats
        ${whereClause}
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      })
    ]);
      const total = countRows?.[0]?.total ? parseInt(countRows[0].total, 10) : 0;

      const formattedStats = stats.map(formatAnnualStats);

      const result = {
        data: formattedStats,
        pagination: createPagination(page, limit, total),
        summary: {
          total_years: total,
          date_range: stats.length > 0 ? 
            `${stats[stats.length - 1].year}-${stats[0].year}` : null,
          total_works_all_years: formattedStats.reduce((sum, s) => sum + s.metrics.total_publications, 0),
          avg_works_per_year: stats.length > 0 ? 
            Math.round(formattedStats.reduce((sum, s) => sum + s.metrics.total_publications, 0) / stats.length) : 0,
          growth_trend: stats.length >= 2 ? 
            calculateGrowthTrend(formattedStats.map(s => s.metrics.total_publications)) : null
        }
      };

      await cacheService.set(cacheKey, result, 86400);
      logger.info(`Annual stats cached: ${stats.length} years`);
      
      return result;
    } catch (error) {
      logger.error('Error fetching annual stats:', error);
      throw error;
    }
  }

  async getTopVenues(filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const cacheKey = `metrics:venues:${JSON.stringify({ page, limit, offset })}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Venue ranking retrieved from cache');
        return cached;
      }

      const [venues, countRows] = await Promise.all([
        sequelize.query(`
        SELECT 
          venue_id,
          venue_name,
          venue_type,
          total_works,
          unique_authors,
          first_publication_year,
          latest_publication_year,
          open_access_percentage,
          open_access_works
        FROM v_venue_ranking
        ORDER BY total_works DESC
        LIMIT :limit OFFSET :offset
      `, {
        replacements: { limit: parseInt(limit), offset: parseInt(offset) },
        type: sequelize.QueryTypes.SELECT
      }),
      sequelize.query(`
        SELECT COUNT(*) AS total
        FROM v_venue_ranking
      `, { type: sequelize.QueryTypes.SELECT })
    ]);
      const total = countRows?.[0]?.total ? parseInt(countRows[0].total, 10) : 0;

      const formattedVenues = venues.map((venue, index) => formatVenueRanking(venue, index + 1));

      const result = {
        data: formattedVenues,
        pagination: createPagination(page, limit, total),
        summary: {
          total_venues_ranked: total,
          top_venue_publications: formattedVenues.length > 0 ? formattedVenues[0].metrics.total_works : 0,
          total_unique_authors: formattedVenues.reduce((sum, v) => sum + v.metrics.unique_authors, 0),
          avg_open_access_percentage: formattedVenues.length > 0 ? 
            Math.round(formattedVenues.reduce((sum, v) => sum + v.metrics.open_access_percentage, 0) / formattedVenues.length * 10) / 10 : 0,
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
    const cacheKey = `metrics:institutions:${JSON.stringify({ page, limit, offset, country_code })}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Institution productivity retrieved from cache');
        return cached;
      }

      const whereConditions = [];
      const replacements = { limit: parseInt(limit), offset: parseInt(offset) };

      if (country_code) {
        whereConditions.push('country_code = :country_code');
        replacements.country_code = country_code;
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const [institutions, countRows] = await Promise.all([
        sequelize.query(`
        SELECT 
          id as organization_id,
          institution_name as organization_name,
          country_code,
          total_works,
          total_citations,
          ROUND(CASE WHEN total_works > 0 THEN total_citations / total_works ELSE NULL END, 2) as avg_citations,
          unique_researchers,
          first_publication_year,
          latest_publication_year
        FROM v_institution_productivity
        ${whereClause}
        ORDER BY total_works DESC, total_citations DESC
        LIMIT :limit OFFSET :offset
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      }),
      sequelize.query(`
        SELECT COUNT(*) AS total
        FROM v_institution_productivity
        ${whereClause}
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      })
    ]);
      const total = countRows?.[0]?.total ? parseInt(countRows[0].total, 10) : 0;

      const formattedInstitutions = institutions.map((inst, index) => formatInstitutionProductivity(inst, index + 1));

      const result = {
        data: formattedInstitutions,
        pagination: createPagination(page, limit, total),
        summary: {
          total_institutions_ranked: total,
          countries_represented: [...new Set(formattedInstitutions.map(i => i.country_code))].filter(Boolean),
          top_institution_works: formattedInstitutions.length > 0 ? formattedInstitutions[0].metrics.total_works : 0,
          avg_citations_per_work: formattedInstitutions.length > 0 ?
            Math.round(formattedInstitutions.reduce((sum, i) => sum + i.metrics.avg_citations, 0) / formattedInstitutions.length * 100) / 100 : 0,
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
    const cacheKey = `metrics:persons:${JSON.stringify({ page, limit, offset, organization_id })}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Person production retrieved from cache');
        return cached;
      }

      const whereConditions = [];
      const replacements = { limit: parseInt(limit), offset: parseInt(offset) };

      if (organization_id) {
        whereConditions.push(`EXISTS (
          SELECT 1 FROM authorships a 
          WHERE a.person_id = vp.id AND a.affiliation_id = :organization_id
        )`);
        replacements.organization_id = parseInt(organization_id);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const [persons, countRows] = await Promise.all([
        sequelize.query(`
        SELECT 
          id as person_id,
          preferred_name as person_name,
          orcid,
          is_verified,
          total_works,
          total_citations,
          ROUND(avg_citations_per_work, 2) as avg_citations,
          first_publication_year,
          latest_publication_year
        FROM v_person_production vp
        ${whereClause}
        ORDER BY total_works DESC, total_citations DESC
        LIMIT :limit OFFSET :offset
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      }),
      sequelize.query(`
        SELECT COUNT(*) AS total
        FROM v_person_production vp
        ${whereClause}
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      })
    ]);
      const total = countRows?.[0]?.total ? parseInt(countRows[0].total, 10) : 0;

      const formattedPersons = persons.map((person, index) => formatPersonProduction(person, index + 1));

      const result = {
        data: formattedPersons,
        pagination: createPagination(page, limit, total),
        summary: {
          total_persons_ranked: total,
          top_person_works: formattedPersons.length > 0 ? formattedPersons[0].metrics.total_works : 0,
          avg_citations_per_work: formattedPersons.length > 0 ? 
            Math.round(formattedPersons.reduce((sum, p) => sum + p.metrics.avg_citations, 0) / formattedPersons.length * 100) / 100 : 0,
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
    const { min_collaborations = 2 } = filters;
    const cacheKey = `metrics:collaborations:${JSON.stringify({ page, limit, offset, min_collaborations })}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Collaborations retrieved from cache');
        return cached;
      }

      const [collaborations, countRows] = await Promise.all([
        sequelize.query(`
        SELECT 
          person1_id,
          person1_name,
          person2_id,
          person2_name,
          collaboration_count,
          ROUND(avg_citations_together, 2) as avg_citations_together,
          first_collaboration_year,
          latest_collaboration_year
        FROM v_collaborations
        WHERE collaboration_count >= :min_collaborations
        ORDER BY collaboration_count DESC, avg_citations_together DESC
        LIMIT :limit OFFSET :offset
      `, {
        replacements: { 
          limit: parseInt(limit),
          offset: parseInt(offset),
          min_collaborations: parseInt(min_collaborations) 
        },
        type: sequelize.QueryTypes.SELECT
      }),
      sequelize.query(`
        SELECT COUNT(*) AS total
        FROM v_collaborations
        WHERE collaboration_count >= :min_collaborations
      `, {
        replacements: { min_collaborations: parseInt(min_collaborations) },
        type: sequelize.QueryTypes.SELECT
      })
    ]);
      const total = countRows?.[0]?.total ? parseInt(countRows[0].total, 10) : 0;

      const formattedCollaborations = collaborations.map((collab, index) => formatCollaboration(collab, index + 1));

      const result = {
        data: formattedCollaborations,
        pagination: createPagination(page, limit, total),
        summary: {
          total_collaboration_pairs: total,
          strongest_collaboration_count: formattedCollaborations.length > 0 ? formattedCollaborations[0].metrics.shared_works : 0,
          avg_collaboration_years: formattedCollaborations.length > 0 ?
            Math.round(formattedCollaborations.reduce((sum, c) => sum + c.timespan.collaboration_years, 0) / formattedCollaborations.length) : 0,
          collaboration_strength_distribution: calculateCollaborationStrengthDistribution(formattedCollaborations)
        },
        filters: {
          min_collaborations: parseInt(min_collaborations)
        }
      };

      await cacheService.set(cacheKey, result, 86400);
      logger.info(`Collaborations cached: ${collaborations.length} pairs`);
      
      return result;
    } catch (error) {
      logger.error('Error fetching collaborations:', error);
      throw error;
    }
  }

}

const calculateGrowthTrend = (values) => {
  if (values.length < 2) return 'insufficient_data';
  
  const recent = values.slice(0, 3).reduce((sum, v) => sum + v, 0) / Math.min(3, values.length);
  const older = values.slice(-3).reduce((sum, v) => sum + v, 0) / Math.min(3, values.slice(-3).length);
  
  const change = ((recent - older) / older) * 100;
  
  if (change > 10) return 'increasing';
  if (change < -10) return 'decreasing';
  return 'stable';
};

const calculateCollaborationStrengthDistribution = (collaborations) => {
  const distribution = { very_strong: 0, strong: 0, moderate: 0, weak: 0 };
  
  collaborations.forEach(collab => {
    const strength = collab.metrics.collaboration_strength;
    if (distribution.hasOwnProperty(strength)) {
      distribution[strength]++;
    }
  });
  
  return distribution;
};

module.exports = new MetricsService();
