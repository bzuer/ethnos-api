const publicationsService = require('../services/publications.service');
const { validationResult } = require('express-validator');
const { ERROR_CODES } = require('../utils/responseBuilder');
const { logger } = require('../middleware/errorHandler');

const normalizeOptional = (value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const parseBooleanFlag = (value, defaultValue = true) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() !== 'false';
};

class PublicationsController {
  async getPublication(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const includeCitations = parseBooleanFlag(req.query.include_citations);
      const includeReferences = parseBooleanFlag(req.query.include_references);

      const publication = await publicationsService.getPublicationById(id, {
        includeCitations,
        includeReferences
      });

      if (!publication) {
        return res.fail(`Publication with ID ${id} not found`, {
          statusCode: 404,
          code: ERROR_CODES.NOT_FOUND,
          meta: { id }
        });
      }

      return res.success(publication);
    } catch (error) {
      logger.error('Error retrieving publication', {
        id: req.params.id,
        error: error.message
      });
      next(error);
    }
  }

  async getPublications(req, res, next) {
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
        page: req.query.page,
        limit: req.query.limit,
        offset: req.query.offset,
        q: normalizeOptional(req.query.q),
        type: normalizeOptional(req.query.type),
        language: normalizeOptional(req.query.language),
        year_from: normalizeOptional(req.query.year_from),
        year_to: normalizeOptional(req.query.year_to),
        open_access: normalizeOptional(req.query.open_access),
        peer_reviewed: normalizeOptional(req.query.peer_reviewed),
        has_files: normalizeOptional(req.query.has_files),
        venue: normalizeOptional(req.query.venue),
        venue_id: normalizeOptional(req.query.venue_id),
        publisher_id: normalizeOptional(req.query.publisher_id),
        work_id: normalizeOptional(req.query.work_id),
        doi: normalizeOptional(req.query.doi),
        author: normalizeOptional(req.query.author),
        subject: normalizeOptional(req.query.subject)
      };

      const result = await publicationsService.getPublications(filters);

      return res.success(result.data, {
        pagination: result.pagination,
        meta: result.meta
      });
    } catch (error) {
      logger.error('Error retrieving publications list', {
        error: error.message
      });
      next(error);
    }
  }

  async getPublicationByDoi(req, res, next) {
    try {
      const doi = req.params.doi;
      if (!doi) {
        return res.fail('DOI is required', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION
        });
      }

      const includeCitations = parseBooleanFlag(req.query.include_citations);
      const includeReferences = parseBooleanFlag(req.query.include_references);

      const publication = await publicationsService.getPublicationByDoi(doi, {
        includeCitations,
        includeReferences
      });

      if (!publication) {
        return res.fail('Publication not found for the given DOI', {
          statusCode: 404,
          code: ERROR_CODES.NOT_FOUND,
          meta: { doi }
        });
      }

      return res.success(publication);
    } catch (error) {
      logger.error('Error retrieving publication by DOI', {
        doi: req.params.doi,
        error: error.message
      });
      next(error);
    }
  }
}

module.exports = new PublicationsController();
