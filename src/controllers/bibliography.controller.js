const bibliographyService = require('../services/bibliography.service');
const { handleError } = require('../middleware/errorHandler');
const { normalizePagination } = require('../utils/pagination');
const { validationResult } = require('express-validator');
const { ERROR_CODES } = require('../utils/responseBuilder');

class BibliographyController {

  
  async getBibliography(req, res) {
    try {
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
        course_id: req.query.course_id,
        work_id: req.query.work_id,
        instructor_id: req.query.instructor_id,
        reading_type: req.query.reading_type,
        week_number: req.query.week_number,
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        program_id: req.query.program_id,
        search: req.query.search,
        limit: pagination.limit,
        offset: pagination.offset,
        light: req.query.light
      };

      const result = await bibliographyService.getBibliography(filters);
      return res.success(result.bibliography || result.data || [], {
        pagination: result.pagination,
        meta: { source: 'bibliography.service' }
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  
  async getWorkBibliography(req, res) {
    try {
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
        reading_type: req.query.reading_type,
        limit: pagination.limit,
        offset: pagination.offset
      };

      const result = await bibliographyService.getWorkBibliography(req.params.id, filters);
      return res.success(result.data || [], {
        pagination: result.pagination
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  
  async getBibliographyAnalysis(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const filters = {
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        program_id: req.query.program_id,
        reading_type: req.query.reading_type,
        limit: req.query.limit || 20
      };

      const analysis = await bibliographyService.getBibliographyAnalysis(filters);
      return res.success(analysis);
    } catch (error) {
      handleError(res, error);
    }
  }

  
  async getBibliographyStatistics(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const statistics = await bibliographyService.getBibliographyStatistics();
      return res.success(statistics);
    } catch (error) {
      handleError(res, error);
    }
  }
}

module.exports = new BibliographyController();
