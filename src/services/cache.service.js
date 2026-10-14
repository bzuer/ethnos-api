const { getActiveRedisClient } = require('../config/redis');
const { logger } = require('../middleware/errorHandler');

const MEMORY_CACHE_MAX_ENTRIES = 5000;

class CacheService {
  constructor() {
    this.defaultTTL = {
      search: parseInt(process.env.CACHE_TTL_SEARCH) || 3600,
      statistics: parseInt(process.env.CACHE_TTL_STATISTICS) || 86400,
      workDetails: parseInt(process.env.CACHE_TTL_WORK_DETAILS) || 7200,
      listings: parseInt(process.env.CACHE_TTL_LISTINGS) || 7200,
      relationships: parseInt(process.env.CACHE_TTL_RELATIONSHIPS) || 3600,
      organizations: parseInt(process.env.CACHE_TTL_ORGANIZATIONS) || 14400,
      signatures_statistics: parseInt(process.env.CACHE_TTL_SIGNATURES_STATISTICS) || 172800,
      venues_statistics: parseInt(process.env.CACHE_TTL_VENUES_STATISTICS) || 86400,
      default: parseInt(process.env.CACHE_TTL_DEFAULT) || 1800
    };

    this.memoryCache = new Map();
  }

  resolveTtl(ttl) {
    if (typeof ttl === 'number' && Number.isFinite(ttl) && ttl > 0) {
      return Math.floor(ttl);
    }
    return this.defaultTTL[ttl] || this.defaultTTL.default;
  }

  _redisMandatory() {
    return process.env.NODE_ENV === 'production' && process.env.REDIS_MANDATORY_IN_PRODUCTION === 'true';
  }

  async get(key) {
    try {
      const client = await getActiveRedisClient();
      if (!client) {
        if (this._redisMandatory()) return null;
        return this._memoryGet(key);
      }

      const value = await client.get(key);
      if (value) {
        logger.debug(`Cache HIT (Redis): ${key}`);
        return JSON.parse(value);
      }
      logger.debug(`Cache MISS: ${key}`);
      return null;
    } catch (error) {
      logger.warn('Cache get error', { key, error: error.message });
      return null;
    }
  }

  async set(key, value, ttl = 'default') {
    const seconds = this.resolveTtl(ttl);

    try {
      const client = await getActiveRedisClient();
      if (!client) {
        if (this._redisMandatory()) return false;
        this._memorySet(key, value, seconds);
        return true;
      }

      await client.setEx(key, seconds, JSON.stringify(value));
      logger.debug(`Cache SET (Redis): ${key} (TTL: ${seconds}s)`);
      return true;
    } catch (error) {
      logger.warn('Cache set error', { key, error: error.message });
      return false;
    }
  }

  async del(key) {
    try {
      const client = await getActiveRedisClient();
      if (!client) {
        return this.memoryCache.delete(key);
      }
      const result = await client.del(key);
      return result > 0;
    } catch (error) {
      logger.warn('Cache delete error', { key, error: error.message });
      return false;
    }
  }

  _memoryGet(key) {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.memoryCache.delete(key);
      return null;
    }
    logger.debug(`Cache HIT (memory): ${key}`);
    return entry.value;
  }

  _memorySet(key, value, seconds) {
    this.memoryCache.delete(key);
    if (this.memoryCache.size >= MEMORY_CACHE_MAX_ENTRIES) {
      this._cleanupExpiredMemoryEntries();
      while (this.memoryCache.size >= MEMORY_CACHE_MAX_ENTRIES) {
        this.memoryCache.delete(this.memoryCache.keys().next().value);
      }
    }
    this.memoryCache.set(key, { value, expiresAt: Date.now() + (seconds * 1000) });
    logger.debug(`Cache SET (memory): ${key} (TTL: ${seconds}s)`);
  }

  _cleanupExpiredMemoryEntries() {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt <= now) {
        this.memoryCache.delete(key);
      }
    }
  }
}

module.exports = new CacheService();
