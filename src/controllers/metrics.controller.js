const { validationResult } = require('express-validator');
const metricsService = require('../services/metrics.service');
const { ERROR_CODES } = require('../utils/responseBuilder');
const { normalizePagination } = require('../utils/pagination');

class MetricsController {
  
  async getAnnualStats(req, res) {
    try {
      const t0 = Date.now();
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const pagination = normalizePagination(req.query);
      const filters = {
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        page: pagination.page,
        limit: pagination.limit,
        offset: pagination.offset
      };

      const result = await metricsService.getAnnualStats(filters);

      return res.success(result.data, {
        pagination: result.pagination,
        meta: {
          summary: result.summary,
          filters: {
            year_from: filters.year_from || null,
            year_to: filters.year_to || null,
            limit: filters.limit,
            page: filters.page,
            offset: filters.offset
          },
          generated_at: new Date().toISOString(),
          performance: { controller_time_ms: Date.now() - t0 }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INTERNAL
      });
    }
  }

  
  async getTopVenues(req, res) {
    try {
      const t0 = Date.now();
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const pagination = normalizePagination(req.query);
      const filters = {
        page: pagination.page,
        limit: pagination.limit,
        offset: pagination.offset
      };

      const result = await metricsService.getTopVenues(filters);

      return res.success(result.data, {
        pagination: result.pagination,
        meta: {
          summary: result.summary,
          filters: {
            limit: filters.limit,
            page: filters.page,
            offset: filters.offset
          },
          generated_at: new Date().toISOString(),
          performance: { controller_time_ms: Date.now() - t0 }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INTERNAL
      });
    }
  }

  
  async getInstitutionProductivity(req, res) {
    try {
      const t0 = Date.now();
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const pagination = normalizePagination(req.query);
      const filters = {
        limit: pagination.limit,
        page: pagination.page,
        offset: pagination.offset,
        country_code: req.query.country_code
      };

      const result = await metricsService.getInstitutionProductivity(filters);

      return res.success(result.data, {
        pagination: result.pagination,
        meta: {
          summary: result.summary,
          filters: {
            limit: filters.limit,
            page: filters.page,
            offset: filters.offset,
            country_code: filters.country_code || null
          },
          generated_at: new Date().toISOString(),
          performance: { controller_time_ms: Date.now() - t0 }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INTERNAL
      });
    }
  }

  
  async getPersonProduction(req, res) {
    try {
      const t0 = Date.now();
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const pagination = normalizePagination(req.query);
      const filters = {
        limit: pagination.limit,
        page: pagination.page,
        offset: pagination.offset,
        organization_id: req.query.organization_id
      };

      const result = await metricsService.getPersonProduction(filters);

      return res.success(result.data, {
        pagination: result.pagination,
        meta: {
          summary: result.summary,
          filters: {
            limit: filters.limit,
            page: filters.page,
            offset: filters.offset,
            organization_id: filters.organization_id || null
          },
          generated_at: new Date().toISOString(),
          performance: { controller_time_ms: Date.now() - t0 }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INTERNAL
      });
    }
  }

  
  async getCollaborations(req, res) {
    try {
      const t0 = Date.now();
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const pagination = normalizePagination(req.query);
      const filters = {
        limit: pagination.limit,
        page: pagination.page,
        offset: pagination.offset,
        min_collaborations: req.query.min_collaborations || 2
      };

      const result = await metricsService.getCollaborations(filters);

      return res.success(result.data, {
        pagination: result.pagination,
        meta: {
          summary: result.summary,
          filters: {
            limit: filters.limit,
            page: filters.page,
            offset: filters.offset,
            min_collaborations: filters.min_collaborations
          },
          generated_at: new Date().toISOString(),
          performance: { controller_time_ms: Date.now() - t0 }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INTERNAL
      });
    }
  }
}

module.exports = new MetricsController();
