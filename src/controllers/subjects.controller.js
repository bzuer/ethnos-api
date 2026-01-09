const subjectsService = require('../services/subjects.service');
const { handleError } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/responseBuilder');
const { normalizePagination } = require('../utils/pagination');
const { validationResult } = require('express-validator');

class SubjectsController {

  
  async getSubjects(req, res) {
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
        vocabulary: req.query.vocabulary,
        parent_id: req.query.parent_id,
        search: req.query.search,
        has_children: req.query.has_children,
        limit: pagination.limit,
        offset: pagination.offset,
        light: req.query.light
      };

      const result = await subjectsService.getSubjects(filters);
      return res.success(result.subjects || [], {
        pagination: result.pagination
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  
  async getSubjectById(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const subject = await subjectsService.getSubjectById(req.params.id);
      
      if (!subject) {
        return res.fail('Subject not found', {
          statusCode: 404,
          code: ERROR_CODES.NOT_FOUND
        });
      }

      return res.success(subject);
    } catch (error) {
      handleError(res, error);
    }
  }

  
  async getSubjectChildren(req, res) {
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
        limit: pagination.limit,
        offset: pagination.offset
      };

      const children = await subjectsService.getSubjectChildren(req.params.id, filters);
      return res.success(children.data || [], {
        pagination: children.pagination
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  
  async getSubjectHierarchy(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const hierarchy = await subjectsService.getSubjectHierarchy(req.params.id);
      return res.success(hierarchy);
    } catch (error) {
      handleError(res, error);
    }
  }

  
  async getSubjectWorks(req, res) {
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
        min_relevance: req.query.min_relevance,
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        document_type: req.query.document_type,
        language: req.query.language,
        limit: pagination.limit,
        offset: pagination.offset
      };

      const works = await subjectsService.getSubjectWorks(req.params.id, filters);
      return res.success(works.data || [], {
        pagination: works.pagination
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  
  async getSubjectCourses(req, res) {
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
        program_id: req.query.program_id,
        reading_type: req.query.reading_type,
        limit: pagination.limit,
        offset: pagination.offset
      };

      const courses = await subjectsService.getSubjectCourses(req.params.id, filters);
      return res.success(courses.data || [], {
        pagination: courses.pagination
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  
  async getSubjectsStatistics(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const statistics = await subjectsService.getSubjectsStatistics();
      return res.success(statistics);
    } catch (error) {
      handleError(res, error);
    }
  }
}

module.exports = new SubjectsController();
