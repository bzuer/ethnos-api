const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
try { require('dotenv').config({ path: '/etc/node-backend.env' }); } catch (_) {}

const { globalErrorHandler, notFoundHandler, logger } = require('./middleware/errorHandler');
const { responseFormatter } = require('./middleware/responseFormatter');
const { performanceMonitoring, errorMonitoring } = require('./middleware/monitoring');
const { testConnection } = require('./config/database');
const { testRedisConnection } = require('./config/redis');

const homepageStatsService = require('./services/homepageStats.service');

const app = express();

app.set('trust proxy', 1);
app.set('query parser', false);

app.use((req, res, next) => {
  try {
    const base = `${req.protocol || 'http'}://localhost`;
    const u = new URL(req.url, base);
    Object.defineProperty(req, 'query', {
      value: Object.fromEntries(u.searchParams.entries()),
      writable: true,
      configurable: true,
      enumerable: true
    });
  } catch (_) {
  }
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "*.gravatar.com"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  
  frameguard: {
    action: 'deny'
  },
  
  noSniff: true,
  
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin"
  },
  
  dnsPrefetchControl: {
    allow: false
  },
  
  ieNoOpen: true,
  
  permittedCrossDomainPolicies: false,
  
  hidePoweredBy: true,
  
  expectCt: {
    maxAge: 86400,
    enforce: process.env.NODE_ENV === 'production',
  }
}));

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const defaultAllowedOrigins = ['http://localhost:1211', 'http://localhost:3001', 'https://ethnos.app'];
    if ((process.env.NODE_ENV || '').toLowerCase() === 'test') {
      defaultAllowedOrigins.unshift('http://localhost:3000');
    }

    const allowedOrigins = process.env.CORS_ORIGINS ?
      process.env.CORS_ORIGINS.split(',').map(o => o.trim()) :
      defaultAllowedOrigins;
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'x-access-key',
    'x-internal-key',
    'x-api-key'
  ],
  credentials: true,
  maxAge: 86400,
};

app.use(cors(corsOptions));

const {
  generalLimiter,
  searchLimiter,
  speedLimiter,
  metricsLimiter,
  relationalLimiter,
  honeypotMiddleware
} = require('./middleware/rateLimiting');

app.use(honeypotMiddleware);

app.use('/', generalLimiter);
app.use('/', speedLimiter);

app.use(compression());

const SENSITIVE_QUERY_KEYS = new Set(['access_key', 'accesskey', 'api_key']);
const redactUrl = (url) => {
  if (!url) return url;
  const qi = url.indexOf('?');
  if (qi === -1) return url;
  const params = new URLSearchParams(url.slice(qi + 1));
  let changed = false;
  for (const key of Array.from(params.keys())) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      params.set(key, 'REDACTED');
      changed = true;
    }
  }
  return changed ? `${url.slice(0, qi)}?${params.toString()}` : url;
};
morgan.token('url', (req) => redactUrl(req.originalUrl || req.url));

app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(responseFormatter);

const { sanitizationMiddleware } = require('./middleware/sanitization');
app.use(sanitizationMiddleware);

const { requestTimeout } = require('./middleware/timeout');
app.use(requestTimeout({ timeoutMs: 0 }));

app.use(performanceMonitoring);

homepageStatsService.refresh();

/**
 * @swagger
 * /:
 *   get:
 *     summary: API root and service metadata
 *     description: Returns service metadata — name, version, environment, documentation links, live totals, and the catalogue of available endpoint groups. Public; no access key required.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service metadata and live corpus totals
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SystemRoot'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
app.get('/', (req, res) => {
  const homepageStats = homepageStatsService.getSnapshot();
  const totals = homepageStats?.totals || {};
  const formatNumber = (value) => {
    if (!Number.isFinite(value)) return null;
    return value.toLocaleString('en-US');
  };
  const totalWorksLabel = formatNumber(totals.total_works);
  const totalResearchersLabel = formatNumber(totals.total_researchers);
  const totalOrganizationsLabel = formatNumber(totals.total_organizations);
  const totalPublicationsLabel = formatNumber(totals.total_publications);
  const totalVenuesLabel = formatNumber(totals.total_venues);
  const totalCoursesLabel = formatNumber(totals.total_courses);

  res.success({
    name: 'Ethnos.app Academic Bibliography API',
    version: '2.0.0',
    description: homepageStats ? 
      `Public RESTful API for academic bibliographic research with ${totalWorksLabel} works, ${totalPublicationsLabel} publications, ${totalResearchersLabel} researchers` :
      'Public RESTful API for academic bibliographic research',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    documentation: {
      swagger_ui: '/docs',
      openapi_spec: '/docs.json'
    },
    system_status: {
      database: homepageStats ? `${totalWorksLabel} works, ${totalPublicationsLabel} publications` : 'Database connected',
      search_engine: 'Manticore Search (SphinxQL) full-text for works and persons; MariaDB FULLTEXT for venues (ft_venues_search), subjects (ft_subjects_term), organizations (ft_organizations_name); the venue filter uses ft_venues_search',
      cache: 'Redis with 30min TTL',
      rate_limiting: 'Public requests limited to 120/min per IP; a valid X-Access-Key removes the limit',
      authentication: 'No key required for data and metrics endpoints; X-Access-Key still gates /dashboard, /security/* and the internal health probes (/health/readiness, /health/metrics)'
    },
    main_categories: {
      search_discovery: {
        description: 'Search across works, persons, and publications backed by Manticore Search (SphinxQL) full-text for works and persons; MariaDB FULLTEXT for venues, subjects, organizations (institutions search disabled for performance)',
        endpoints: ['/search/works', '/search/persons', '/search/advanced', '/search/autocomplete', '/search/global']
      },
      academic_works: {
        description: 'Publications and citations analysis',
        endpoints: ['/works', '/works/{id}', '/works/{id}/citations', '/works/{id}/references']
      },
      researchers_authors: {
        description: 'Researcher profiles and collaboration networks',
        endpoints: ['/persons', '/persons/{id}', '/persons/{id}/collaborators', '/persons/{id}/works']
      },
      institutions: {
        description: 'Academic institutions, publishers and funders',
        endpoints: ['/institutions', '/institutions/{id}', '/institutions/{id}/works', '/institutions/{id}/funded-works']
      },
      academic_venues: {
        description: 'Journals, conferences, and publication venues',
        endpoints: ['/venues', '/venues/{id}', '/venues/search', '/venues/statistics']
      },
      courses_teaching: {
        description: 'Academic courses and instructor profiles',
        endpoints: ['/courses', '/courses/{id}', '/instructors', '/instructors/{id}/statistics']
      },
      bibliography_analysis: {
        description: 'Academic bibliography and reading analysis',
        endpoints: ['/bibliographies', '/bibliographies/analyses']
      },
      metrics_analytics: {
        description: 'Research metrics and institutional analytics',
        endpoints: ['/metrics/venues', '/metrics/institutions', '/metrics/persons', '/metrics/collaborations', '/dashboard/overview']
      }
    },
    data_statistics: {
      total_works: totalWorksLabel,
      total_publications: totalPublicationsLabel,
      total_researchers: totalResearchersLabel,
      total_organizations: totalOrganizationsLabel,
      total_venues: totalVenuesLabel,
      total_courses: totalCoursesLabel,
      collected_at: homepageStats?.collected_at || null
    },
    technical_features: {
      search_performance: 'Manticore Search (SphinxQL) full-text for works and persons; MariaDB FULLTEXT for venues (ft_venues_search), subjects (ft_subjects_term), organizations (ft_organizations_name); the venue filter uses ft_venues_search; institutions search disabled for optimal performance',
      authentication: 'Open access: data and metrics endpoints need no key. An optional X-Access-Key (header: x-access-key | x-internal-key | x-api-key) lifts the rate limit and unlocks /dashboard, /security/* and the internal health probes (/health/readiness, /health/metrics).',
      rate_limits: 'Unauthenticated requests: 120/min per IP. No limit when a valid X-Access-Key is supplied.',
      response_format: 'JSON with pagination {page, limit, total, totalPages, hasNext, hasPrev}',
      cache_ttl: '30 minutes',
      security: 'XSS protection, SQL injection prevention, abuse detection'
    },
    quick_examples: {
      search_works: 'GET /search/works?q=machine+learning&limit=10',
      get_work_details: 'GET /works/22519667',
      search_authors: 'GET /persons?search=silva&limit=5',
      venue_metrics: 'GET /venues/statistics',
      system_health: 'GET /health/liveness'
    },
    support: {
      license: 'MIT License',
      website: 'https://ethnos.app',
      technical_contact: 'Bruno Cesar Cunha Cruz - PPGAS/MN/UFRJ'
    }
  });
});

const healthRoutes = require('./routes/health');
const securityRoutes = require('./routes/security');
const worksRoutes = require('./routes/works');
const personsRoutes = require('./routes/persons');
const organizationsRoutes = require('./routes/organizations');
const venuesRoutes = require('./routes/venues');
const searchRoutes = require('./routes/search');
const metricsRoutes = require('./routes/metrics');
const citationsRoutes = require('./routes/citations');
const collaborationsRoutes = require('./routes/collaborations');
const signaturesRoutes = require('./routes/signatures');
const dashboardRoutes = require('./routes/dashboard');
const subjectsRoutes = require('./routes/subjects');

const coursesRoutes = require('./routes/courses');
const instructorsRoutes = require('./routes/instructors');
const bibliographyRoutes = require('./routes/bibliography');
const publicationsRoutes = require('./routes/publications');

const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('../config/swagger.config');
const path = require('path');

app.get('/docs.json', (req, res) => {
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.send(swaggerSpecs);
});

const swaggerOptions = {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "ethnos.app API - Documentation",
  swaggerOptions: {
    url: `/docs.json?v=${Date.now()}`,
    validatorUrl: null,
  }
};

app.use('/docs', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, swaggerOptions));

app.get(['/docs.yaml', '/openapi.yaml', '/openapi.yml'], (req, res) => {
  const yamlPath = path.resolve(__dirname, '../docs/swagger.yaml');
  res.set({
    'Content-Type': 'application/yaml',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.sendFile(yamlPath, (err) => {
    if (err) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to load OpenAPI YAML',
        code: 'INTERNAL_ERROR'
      });
    }
  });
});


app.use('/health', healthRoutes);

app.use('/security', metricsLimiter, securityRoutes);

app.use('/search', searchLimiter, searchRoutes);
app.use('/publications', relationalLimiter, publicationsRoutes);
app.use('/works', relationalLimiter, worksRoutes);
app.use('/persons', relationalLimiter, personsRoutes);
app.use('/institutions', relationalLimiter, organizationsRoutes);
app.use('/venues', relationalLimiter, venuesRoutes);
app.use('/metrics', metricsLimiter, metricsRoutes);
app.use('/dashboard', metricsLimiter, dashboardRoutes);
app.use('/', citationsRoutes);
app.use('/', collaborationsRoutes);
app.use('/signatures', relationalLimiter, signaturesRoutes);
app.use('/subjects', relationalLimiter, subjectsRoutes);

app.use('/courses', coursesRoutes);
app.use('/instructors', instructorsRoutes);
app.use('/bibliographies', bibliographyRoutes);

const publicationsController = require('./controllers/publications.controller');

/**
 * @swagger
 * /{doi}:
 *   get:
 *     summary: Resolve a publication by DOI
 *     description: |
 *       Look up a publication by its DOI. Accepts multiple URL formats:
 *       - `/{doi}` (e.g. `/10.4324/9781003371694`)
 *       - `/doi.org/{doi}` (e.g. `/doi.org/10.4324/9781003371694`)
 *       - `/https://doi.org/{doi}` (e.g. `/https://doi.org/10.4324/9781003371694`)
 *
 *       Returns the publication-shaped payload with the parent `work` block embedded,
 *       resolving to the exact publication that owns the DOI.
 *     tags: [Publications]
 *     parameters:
 *       - in: path
 *         name: doi
 *         required: true
 *         schema:
 *           type: string
 *         description: DOI identifier (with or without doi.org prefix)
 *         example: 10.4324/9781003371694
 *       - in: query
 *         name: include_citations
 *         schema:
 *           type: boolean
 *           default: true
 *         description: When false, `data.citations` is set to null (the key is still present, not omitted).
 *       - in: query
 *         name: include_references
 *         schema:
 *           type: boolean
 *           default: true
 *         description: When false, `data.references` is set to null (the key is still present, not omitted).
 *     responses:
 *       200:
 *         description: Publication resolved from the DOI, with the parent work embedded
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PublicationDetail'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
app.get(/^\/((?:https?:\/\/)?doi\.org\/)?(\d{2}\..+)$/, (req, res, next) => {
  req.params.doi = req.params[1];
  next();
}, relationalLimiter, publicationsController.getPublicationByDoi);

app.use(notFoundHandler);

app.use(errorMonitoring);
app.use(globalErrorHandler);

const PORT = parseInt(process.env.PORT, 10) || ((process.env.NODE_ENV || '').toLowerCase() === 'test' ? 3000 : 1211);

let server = null;

const startServer = async () => {
  try {
    const dbConnected = await testConnection();
    const redisConnected = await testRedisConnection();
    
    if (!dbConnected) {
      logger.warn('Database connection failed - some features may not work');
    }
    
    if (!redisConnected) {
      logger.warn('Redis connection failed - caching disabled');
    }

    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`API Bibliografica ${process.env.NODE_ENV || 'development'} mode`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info('Search engine: Manticore Search (SphinxQL) full-text for works and persons; MariaDB FULLTEXT for venues (ft_venues_search), subjects (ft_subjects_term), organizations (ft_organizations_name); the venue filter uses ft_venues_search');
    });

    server.on('error', (error) => {
      if (error.syscall !== 'listen') throw error;

      const bind = typeof PORT === 'string' ? `Pipe ${PORT}` : `Port ${PORT}`;

      switch (error.code) {
        case 'EACCES':
          logger.error(`${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.error(`${bind} is already in use`);
          process.exit(1);
          break;
        default:
          logger.error('Server error:', error);
          throw error;
      }
    });

    server.on('listening', () => {
      const addr = server.address();
      const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr.port}`;
      logger.info(`Server listening on ${bind}`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  if (!server) return process.exit(0);

  server.close(async (err) => {
    if (err) {
      logger.error('Error during server shutdown:', err);
      process.exit(1);
    }

    logger.info('HTTP server closed');

    try {
      const { sequelize, closePool } = require('./config/database');
      await sequelize.close();
      await closePool();
      logger.info('Database connections closed');

      const redis = require('./config/redis');
      if (redis && typeof redis.quit === 'function') {
        await redis.quit();
        logger.info('Redis connections closed');
      }

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  });

  setTimeout(() => process.exit(1), 10000);
};

const registerProcessHandlers = () => {
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      gracefulShutdown('PM2_SHUTDOWN');
    }
  });
};

if (require.main === module) {
  registerProcessHandlers();
  startServer();
}

module.exports = app;
