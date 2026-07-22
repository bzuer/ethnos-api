const { body, param, query } = require('express-validator');
const { logger } = require('./errorHandler');

const XSS_PATTERNS = [
  /<script[^>]*>.*?<\/script>/gi,
  /<iframe[^>]*>.*?<\/iframe>/gi,
  /<object[^>]*>.*?<\/object>/gi,
  /<embed[^>]*>/gi,
  /<link[^>]*>/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /onload=/gi,
  /onerror=/gi,
  /onclick=/gi,
  /onmouseover=/gi,
];

const SQL_INJECTION_PATTERNS = [
  /(\b(select|insert|update|delete|drop|create|alter|exec|execute|union|declare)\b)/gi,
  /(--|#|\*\/|\/\*)/g,
  /(\b(or|and)\b\s+\d+\s*=\s*\d+)/gi,
  /('|(\\')|(;)|(\\;))/g,
];

const sanitizeInput = (value) => {
  if (typeof value !== 'string') return value;
  
  let sanitized = value;
  
  XSS_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });
  
  SQL_INJECTION_PATTERNS.forEach(pattern => {
    if (pattern.test(sanitized)) {
      logger.warn('Potential SQL injection attempt detected', {
        originalValue: value.substring(0, 100),
        sanitizedValue: sanitized.substring(0, 100),
        pattern: pattern.toString(),
        timestamp: new Date().toISOString(),
      });
    }
  });
  
  sanitized = sanitized
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  return sanitized.trim();
};

const sanitizeBody = (fields = []) => {
  return (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
      for (const field of fields) {
        if (req.body[field]) {
          req.body[field] = sanitizeInput(req.body[field]);
        }
      }
    }
    next();
  };
};

const commonValidations = {
  idParam: param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer')
    .toInt(),

  pagination: [
    query('page')
      .optional({ values: 'falsy' })
      .isInt({ min: 1, max: 1000 })
      .withMessage('Page must be between 1 and 1000')
      .toInt(),
    query('limit')
      .optional({ values: 'falsy' })
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt(),
    query('offset')
      .optional({ values: 'falsy' })
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
      .toInt(),
  ],

  searchQuery: [
    query('q')
      .notEmpty()
      .withMessage('Search query is required')
      .isLength({ min: 2, max: 200 })
      .withMessage('Search query must be between 2 and 200 characters')
      .custom(value => {
        const suspiciousPatterns = [
          /[<>]/,
          /javascript:/i,
          /(\b(select|insert|update|delete|drop|create|alter|exec|execute|union|declare)\b)/i,
        ];
        
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(value)) {
            throw new Error('Search query contains invalid characters');
          }
        }
        return true;
      })
      .customSanitizer(sanitizeInput),
    query('year')
      .optional({ values: 'falsy' })
      .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
      .withMessage('Year must be between 1900 and next year')
      .toInt(),
  ],

  email: body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email must be less than 255 characters'),

  strongPassword: body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'),

  textField: (fieldName, options = {}) => {
    const { required = true, minLength = 1, maxLength = 255 } = options;
    
    let validation = body(fieldName);
    
    if (required) {
      validation = validation.notEmpty().withMessage(`${fieldName} is required`);
    } else {
      validation = validation.optional({ values: 'falsy' });
    }
    
    return validation
      .isLength({ min: minLength, max: maxLength })
      .withMessage(`${fieldName} must be between ${minLength} and ${maxLength} characters`)
      .matches(/^[a-zA-Z0-9\s\-_.,!?'"()[\]{}:;@#$%&*+=\/\\]*$/)
      .withMessage(`${fieldName} contains invalid characters`)
      .customSanitizer(sanitizeInput);
  },

  url: (fieldName) => 
    body(fieldName)
      .optional({ values: 'falsy' })
      .isURL({ protocols: ['http', 'https'] })
      .withMessage(`${fieldName} must be a valid HTTP or HTTPS URL`)
      .isLength({ max: 2083 })
      .withMessage(`${fieldName} URL is too long`),

  date: (fieldName, options = {}) => {
    const { required = true } = options;
    let validation = body(fieldName);
    
    if (required) {
      validation = validation.notEmpty().withMessage(`${fieldName} is required`);
    } else {
      validation = validation.optional({ values: 'falsy' });
    }
    
    return validation
      .isISO8601()
      .withMessage(`${fieldName} must be a valid ISO 8601 date`)
      .toDate();
  },

  fileUpload: [
    body('filename')
      .optional({ values: 'falsy' })
      .isLength({ max: 255 })
      .withMessage('Filename must be less than 255 characters')
      .matches(/^[a-zA-Z0-9\-_. ()]+\.[a-zA-Z0-9]+$/)
      .withMessage('Filename contains invalid characters or missing extension')
      .customSanitizer(sanitizeInput),
  ],
};

module.exports = {
  sanitizeInput,
  sanitizeBody,
  commonValidations,
};