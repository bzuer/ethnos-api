const { sequelize } = require('../config/database');
const { logger } = require('../middleware/errorHandler');

class HomepageStatsService {
  constructor() {
    this.snapshot = null;
  }

  async refresh() {
    try {
      const [totals] = await sequelize.query(`
        SELECT 
          (SELECT COUNT(*) FROM works) as total_works,
          (SELECT COUNT(*) FROM persons) as total_persons,
          (SELECT COUNT(*) FROM organizations) as total_organizations,
          (SELECT COUNT(*) FROM publications) as total_publications,
          (SELECT COUNT(*) FROM venues) as total_venues,
          (SELECT COUNT(*) FROM courses) as total_courses
      `, { type: sequelize.QueryTypes.SELECT });

      const snapshot = {
        totals: {
          total_works: parseInt(totals.total_works, 10) || 0,
          total_researchers: parseInt(totals.total_persons, 10) || 0,
          total_organizations: parseInt(totals.total_organizations, 10) || 0,
          total_publications: parseInt(totals.total_publications, 10) || 0,
          total_venues: parseInt(totals.total_venues, 10) || 0,
          total_courses: parseInt(totals.total_courses, 10) || 0
        },
        collected_at: new Date().toISOString()
      };

      this.snapshot = snapshot;
      logger.info('Homepage stats refreshed', { totals: snapshot.totals });
      return snapshot;
    } catch (error) {
      logger.error('Failed to refresh homepage stats', { error: error.message });
      return null;
    }
  }

  getSnapshot() {
    return this.snapshot;
  }
}

module.exports = new HomepageStatsService();
