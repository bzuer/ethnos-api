const { validationResult } = require('express-validator');
const collaborationsService = require('../services/collaborations.service');
const { logger } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/responseBuilder');
const { normalizePagination } = require('../utils/pagination');

class CollaborationsController {
  
  async getPersonCollaborators(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Person collaborators validation failed:', errors.array());
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const personId = req.params.id;
      const pagination = normalizePagination(req.query);
      const filters = {
        page: pagination.page,
        limit: pagination.limit,
        min_collaborations: req.query.min_collaborations,
        sort_by: req.query.sort_by
      };

      const startTime = Date.now();
      const result = await collaborationsService.getPersonCollaborators(personId, filters);
      const queryTime = Date.now() - startTime;

      if (!result) {
        logger.warn(`Collaborators not found for person ${personId}`);
        return res.fail(`Collaborators for person with ID ${personId} not found`, {
          statusCode: 404,
          code: ERROR_CODES.NOT_FOUND
        });
      }

      logger.info(`Person ${personId} collaborators retrieved: ${result.collaborators.length} collaborators in ${queryTime}ms`);

      return res.success({
        person_id: result.person_id,
        collaborators: result.collaborators || []
      }, {
        pagination: result.pagination,
        meta: {
          query_time_ms: queryTime,
          source: 'collaboration_analysis',
          person_id: result.person_id,
          filters: result.filters,
          summary: result.summary
        }
      });
    } catch (error) {
      logger.error('Error in person collaborators controller:', error);
      return res.fail('Failed to retrieve person collaborators', {
        statusCode: 500,
        code: ERROR_CODES.INTERNAL
      });
    }
  }

  
  async getCollaborationNetwork(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Collaboration network validation failed:', errors.array());
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const personId = req.params.id;
      const depth = req.query.depth || 2;

      const startTime = Date.now();
      const result = await collaborationsService.getCollaborationNetwork(personId, depth);
      const queryTime = Date.now() - startTime;

      if (!result) {
        logger.warn(`Collaboration network not found for person ${personId}`);
        return res.fail(`Collaboration network for person with ID ${personId} not found`, {
          statusCode: 404,
          code: ERROR_CODES.NOT_FOUND
        });
      }

      logger.info(`Person ${personId} collaboration network retrieved: ${result.network_stats.total_nodes} nodes, ${result.network_stats.total_edges} edges in ${queryTime}ms`);

      return res.success(result, {
        meta: {
          query_time_ms: queryTime,
          source: 'network_analysis',
          complexity: result.network_stats
        }
      });
    } catch (error) {
      logger.error('Error in collaboration network controller:', error);
      return res.fail('Failed to retrieve collaboration network', {
        statusCode: 500,
        code: ERROR_CODES.INTERNAL
      });
    }
  }

  
  async getTopCollaborations(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Top collaborations validation failed:', errors.array());
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const pagination = normalizePagination(req.query);
      const filters = {
        limit: pagination.limit,
        offset: pagination.offset,
        min_collaborations: req.query.min_collaborations,
        year_from: req.query.year_from,
        year_to: req.query.year_to
      };

      const startTime = Date.now();
      const result = await collaborationsService.getTopCollaborations(filters);
      const queryTime = Date.now() - startTime;

      logger.info(`Top collaborations retrieved: ${result.top_collaborations.length} partnerships in ${queryTime}ms`);

      return res.success(result.top_collaborations || [], {
        pagination: result.pagination,
        meta: {
          query_time_ms: queryTime,
          source: 'collaboration_ranking',
          summary: result.summary,
          filters: result.filters
        }
      });
    } catch (error) {
      logger.error('Error in top collaborations controller:', error);
      return res.fail('Failed to retrieve top collaborations', {
        statusCode: 500,
        code: ERROR_CODES.INTERNAL
      });
    }
  }
}

module.exports = new CollaborationsController();
