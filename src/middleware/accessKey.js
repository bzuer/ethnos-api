const { logger } = require('./errorHandler');

const DEFAULT_HEADER_NAMES = ['x-access-key', 'x-internal-key', 'x-api-key'];
const DEFAULT_QUERY_KEYS = ['access_key', 'accessKey', 'api_key'];

const DEFAULT_ACCEPTED_ENV_VARS = [
  'API_KEY',
  'INTERNAL_ACCESS_KEY',
  'SECURITY_ACCESS_KEY',
  'API_ACCESS_KEY',
  'ETHNOS_API_KEY',
  'ETHNOS_API_ACCESS_KEY',
  'API_SECRET_KEY',
  'ETHNOS_API_KEY_2',
];

const collectAcceptedKeys = (envVars = []) => {
  const keys = new Set();
  for (const envVar of envVars) {
    const value = process.env[envVar];
    if (value && typeof value === 'string') {
      keys.add(value);
    }
  }
  return keys;
};

const extractProvidedKey = (req, headerNames, queryParamNames) => {
  for (const header of headerNames) {
    const value = req.get(header);
    if (value) return value;
  }
  for (const queryKey of queryParamNames) {
    const value = req.query?.[queryKey];
    if (value) return value;
  }
  return null;
};

const hasValidAccessKey = (req, options = {}) => {
  const {
    envVars = DEFAULT_ACCEPTED_ENV_VARS,
    headerNames = DEFAULT_HEADER_NAMES,
    queryParamNames = DEFAULT_QUERY_KEYS,
  } = options;
  const accepted = collectAcceptedKeys(envVars);
  if (accepted.size === 0) return false;
  const provided = extractProvidedKey(req, headerNames, queryParamNames);
  return Boolean(provided) && accepted.has(provided);
};

const createAccessKeyGuard = (options = {}) => {
  const {
    envVars = DEFAULT_ACCEPTED_ENV_VARS,
    context = 'internal endpoint',
    headerNames = DEFAULT_HEADER_NAMES,
    queryParamNames = DEFAULT_QUERY_KEYS,
  } = options;

  if (!Array.isArray(envVars) || envVars.length === 0) {
    throw new Error('createAccessKeyGuard requires at least one env var name');
  }

  return (req, res, next) => {
    const acceptedKeys = collectAcceptedKeys(envVars);

    if (acceptedKeys.size === 0) {
      logger.error(`${context} access denied: no access keys configured (checked ${envVars.join(', ')})`);
      return res.status(503).json({
        status: 'error',
        message: 'Access key not configured',
        code: 'ACCESS_KEY_MISSING',
        context,
      });
    }

    const providedKey = extractProvidedKey(req, headerNames, queryParamNames);

    if (!providedKey || !acceptedKeys.has(providedKey)) {
      logger.warn(`${context} access denied: invalid or missing key`, {
        ip: req.ip,
        path: req.originalUrl,
        method: req.method,
      });

      return res.status(401).json({
        status: 'error',
        message: 'Invalid or missing access key',
        code: 'UNAUTHORIZED',
        context,
      });
    }

    req.accessKeyAuthenticated = true;
    return next();
  };
};

const requireInternalAccessKey = createAccessKeyGuard({
  envVars: DEFAULT_ACCEPTED_ENV_VARS,
  context: 'internal API',
});

module.exports = {
  createAccessKeyGuard,
  requireInternalAccessKey,
  hasValidAccessKey,
  DEFAULT_ACCEPTED_ENV_VARS,
  DEFAULT_HEADER_NAMES,
  DEFAULT_QUERY_KEYS,
};
