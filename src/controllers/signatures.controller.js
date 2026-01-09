const signaturesService = require('../services/signatures.service');
const { validationResult } = require('express-validator');
const { logger } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/responseBuilder');

class SignaturesController {
  
  async getAllSignatures(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const {
        limit = 20,
        offset = 0,
        search,
        sortBy = 'signature',
        sortOrder = 'ASC'
      } = req.query;

      const options = {
        limit: Math.min(parseInt(limit) || 20, 100),
        offset: parseInt(offset) || 0,
        search,
        sortBy,
        sortOrder,
        includeCounts: String(req.query.light || 'false').toLowerCase() !== 'true'
      };

      const result = await signaturesService.getAllSignatures(options);
      
      logger.info('Signatures list retrieved', {
        endpoint: '/signatures',
        count: result.signatures.length,
        total: result.pagination.total,
        page: options.limit ? Math.floor(options.offset / options.limit) + 1 : 1,
        responseTime: `${Date.now() - req.startTime}ms`
      });

      return res.success(result.signatures, {
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('Error in getAllSignatures:', error);
      return res.error(error, { code: ERROR_CODES.INTERNAL });
    }
  }

  
  async getSignatureById(req, res, next) {
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
      
      if (!id || isNaN(parseInt(id))) {
        return res.fail('Invalid signature ID', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION
        });
      }

      const signature = await signaturesService.getSignatureById(parseInt(id));
      
      if (!signature) {
        return res.fail('Signature not found', {
          statusCode: 404,
          code: ERROR_CODES.NOT_FOUND
        });
      }

      logger.info(`Retrieved signature ${id}`, {
        endpoint: `/signatures/${id}`,
        signature: signature.signature,
        personsCount: signature.persons_count
      });

      return res.success(signature);
    } catch (error) {
      logger.error(`Error in getSignatureById for ID ${req.params.id}:`, error);
      return res.error(error, { code: ERROR_CODES.INTERNAL });
    }
  }

  
  async getSignaturePersons(req, res, next) {
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
      const { limit = 20, offset = 0 } = req.query;
      
      if (!id || isNaN(parseInt(id))) {
        return res.fail('Invalid signature ID', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION
        });
      }

      const options = {
        limit: Math.min(parseInt(limit) || 20, 100),
        offset: parseInt(offset) || 0
      };

      const result = await signaturesService.getSignaturePersons(parseInt(id), options);
      
      if (!result) {
        return res.fail('Signature not found', {
          statusCode: 404,
          code: ERROR_CODES.NOT_FOUND
        });
      }

      logger.info(`Retrieved ${result.persons.length} persons for signature ${id}`, {
        endpoint: `/signatures/${id}/persons`,
        options,
        total: result.pagination.total
      });

      return res.success(result.persons, {
        pagination: result.pagination
      });
    } catch (error) {
      logger.error(`Error in getSignaturePersons for signature ${req.params.id}:`, error);
      return res.error(error, { code: ERROR_CODES.INTERNAL });
    }
  }

  
  async getSignatureStatistics(req, res, next) {
    try {
      const stats = await signaturesService.getSignatureStatistics();
      
      logger.info('Retrieved signature statistics', {
        endpoint: '/signatures/statistics',
        totalSignatures: stats.total_signatures
      });

      return res.success(stats);
    } catch (error) {
      logger.error('Error in getSignatureStatistics:', error);
      return res.error(error, { code: ERROR_CODES.INTERNAL });
    }
  }

  
  async getSignatureWorks(req, res, next) {
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
      const { page = 1, limit = 20 } = req.query;
      
      const result = await signaturesService.getSignatureWorks(id, { page, limit });
      
      if (!result) {
        return res.fail(`Signature with ID ${id} not found`, {
          statusCode: 404,
          code: ERROR_CODES.NOT_FOUND
        });
      }

      logger.info(`Signature ${id} works retrieved: ${result.data.length} items`);
      
      return res.success(result.data || result, {
        pagination: result.pagination
      });
    } catch (error) {
      logger.error(`Error retrieving works for signature ${req.params.id}:`, error);
      return res.error(error, { code: ERROR_CODES.INTERNAL });
    }
  }

  async searchSignatures(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const { q, exact = false, limit = 20, offset = 0 } = req.query;
      
      if (!q || q.trim().length === 0) {
        return res.fail('Search query (q) parameter is required', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION
        });
      }

      const options = {
        limit: Math.min(parseInt(limit) || 20, 100),
        offset: parseInt(offset) || 0,
        exact: exact === 'true' || exact === true
      };

      const result = await signaturesService.searchSignatures(q.trim(), options);
      
      logger.info(`Found ${result.signatures.length} signatures matching search`, {
        endpoint: '/signatures/search',
        searchTerm: q,
        exact: options.exact,
        total: result.pagination.total
      });

      return res.success(result.signatures, {
        pagination: result.pagination,
        meta: { searchTerm: q.trim(), exact: options.exact }
      });
    } catch (error) {
      logger.error(`Error in searchSignatures for query "${req.query.q}":`, error);
      return res.error(error, { code: ERROR_CODES.INTERNAL });
    }
  }
}

module.exports = new SignaturesController();
