const mongoSanitize = require('express-mongo-sanitize');
const { logger } = require('./errorHandler');

const sanitizationMiddleware = [
  mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
      logger.warn('MongoDB injection attempt detected', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        sanitizedKey: key,
        timestamp: new Date().toISOString()
      });
    }
  })
];

module.exports = {
  sanitizationMiddleware
};
