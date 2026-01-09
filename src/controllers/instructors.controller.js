const instructorsService = require('../services/instructors.service');
const { ERROR_CODES } = require('../utils/responseBuilder');
const { normalizePagination } = require('../utils/pagination');
const { validationResult } = require('express-validator');

class InstructorsController {

  
  async getInstructors(req, res) {
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
        role: req.query.role,
        program_id: req.query.program_id,
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        search: req.query.search,
        limit: pagination.limit,
        offset: pagination.offset
      };

      const result = await instructorsService.getInstructors(filters);
      
      return res.success(result.data, {
        pagination: result.pagination,
        meta: {
          filters: {
            role: filters.role || null,
            program_id: filters.program_id || null,
            year_from: filters.year_from || null,
            year_to: filters.year_to || null,
            search: filters.search || null
          }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INSTRUCTORS_LIST_FAILED
      });
    }
  }

  
  async getInstructorById(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const instructor = await instructorsService.getInstructorById(req.params.id);
      
      if (!instructor) {
        return res.fail(`Instructor not found with ID ${req.params.id}`, {
          statusCode: 404,
          code: ERROR_CODES.INSTRUCTOR_NOT_FOUND
        });
      }

      return res.success(instructor);
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INSTRUCTOR_DETAILS_FAILED
      });
    }
  }

  
  async getInstructorCourses(req, res) {
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
        semester: req.query.semester,
        role: req.query.role,
        limit: pagination.limit,
        offset: pagination.offset
      };

      const result = await instructorsService.getInstructorCourses(req.params.id, filters);
      
      return res.success(result.data, {
        pagination: result.pagination,
        meta: {
          instructor_id: parseInt(req.params.id, 10),
          filters: {
            year_from: filters.year_from || null,
            year_to: filters.year_to || null,
            program_id: filters.program_id || null,
            semester: filters.semester || null,
            role: filters.role || null
          }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INSTRUCTOR_COURSES_FAILED
      });
    }
  }

  
  async getInstructorSubjects(req, res) {
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
        limit: pagination.limit,
        offset: pagination.offset
      };

      const result = await instructorsService.getInstructorSubjectsExpertise(req.params.id, filters);
      
      return res.success(result.data, {
        pagination: result.pagination,
        meta: {
          instructor_id: parseInt(req.params.id, 10),
          filters: {
            vocabulary: filters.vocabulary || null
          }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INSTRUCTOR_SUBJECTS_FAILED
      });
    }
  }

  
  async getInstructorBibliography(req, res) {
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
        reading_type: req.query.reading_type,
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        limit: pagination.limit,
        offset: pagination.offset
      };

      const result = await instructorsService.getInstructorBibliography(req.params.id, filters);
      
      return res.success(result.data, {
        pagination: result.pagination,
        meta: {
          instructor_id: parseInt(req.params.id, 10),
          filters: {
            reading_type: filters.reading_type || null,
            year_from: filters.year_from || null,
            year_to: filters.year_to || null
          }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INSTRUCTOR_BIBLIOGRAPHY_FAILED
      });
    }
  }

  
  async getInstructorStatistics(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const statistics = await instructorsService.getInstructorStatistics(req.params.id);
      
      if (!statistics) {
        return res.fail(`Instructor not found with ID ${req.params.id}`, {
          statusCode: 404,
          code: ERROR_CODES.INSTRUCTOR_NOT_FOUND
        });
      }

      return res.success(statistics);
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INSTRUCTOR_STATISTICS_FAILED
      });
    }
  }

  
  async getInstructorsStatistics(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const statistics = await instructorsService.getInstructorsStatistics();
      
      return res.success(statistics);
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INSTRUCTORS_STATISTICS_FAILED
      });
    }
  }
}

module.exports = new InstructorsController();
