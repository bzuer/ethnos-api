const { logger } = require('../middleware/errorHandler');
const redis = require('../config/redis');
const { sequelize } = require('../models');
const searchEngine = require('./searchEngine.service');

class AutocompleteService {
    constructor() {
        this.cachePrefix = 'autocomplete:';
        this.cacheTTL = 3600;
        this.minQueryLength = 2;
        this.maxSuggestions = 10;

        this.suggestionTypes = {
            titles: 'title_suggestions',
            authors: 'author_suggestions',
            venues: 'venue_suggestions'
        };

        this.stopWords = new Set([
            'from', 'with', 'that', 'this', 'than', 'them', 'then', 'they',
            'their', 'there', 'these', 'those', 'have', 'been', 'were', 'being',
            'will', 'would', 'could', 'should', 'about', 'after', 'before',
            'between', 'under', 'over', 'into', 'through', 'during', 'each',
            'which', 'what', 'when', 'where', 'some', 'other', 'also', 'more',
            'most', 'only', 'very', 'just', 'such', 'like', 'para', 'como',
            'does', 'based', 'using', 'case', 'upon', 'among'
        ]);
    }


    async getSuggestions(query, type = 'all', limit = 10) {
        if (!query || query.length < this.minQueryLength) {
            return { suggestions: [], type: 'none' };
        }

        const cacheKey = `${this.cachePrefix}${type}:${query.toLowerCase()}`;

        if (redis.connected) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (error) {
                logger.warn('Autocomplete cache read failed', error);
            }
        }

        let suggestions = [];

        try {
            switch (type) {
                case 'titles':
                    suggestions = await this.getTitleSuggestions(query, limit);
                    break;
                case 'authors':
                    suggestions = await this.getAuthorSuggestions(query, limit);
                    break;
                case 'venues':
                    suggestions = await this.getVenueSuggestions(query, limit);
                    break;
                default:
                    suggestions = await this.getAllSuggestions(query, limit);
            }

            const result = {
                query,
                suggestions,
                type,
                count: suggestions.length,
                generated_at: new Date().toISOString()
            };

            if (redis.connected && suggestions.length > 0) {
                try {
                    await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
                } catch (error) {
                    logger.warn('Autocomplete cache write failed', error);
                }
            }

            return result;

        } catch (error) {
            logger.error('Autocomplete suggestions failed', { query, type, error: error.message });
            return {
                query,
                suggestions: [],
                type,
                count: 0,
                generated_at: new Date().toISOString()
            };
        }
    }


    async _fetchWorkIdsByMatch(query, fetchLimit) {
        const cappedLimit = Math.max(1, Math.min(parseInt(fetchLimit, 10) || 50, 500));

        try {
            return await searchEngine.fetchWorkIdsForMatch(query, cappedLimit);
        } catch (error) {
            logger.warn('Autocomplete Manticore lookup failed; returning empty match set', {
                error: error.message
            });
            return [];
        }
    }

    async getTitleSuggestions(query, limit) {
        const sanitizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));
        const ids = await this._fetchWorkIdsByMatch(query, sanitizedLimit * 5);
        if (ids.length === 0) return [];

        const rows = await sequelize.query(
            `SELECT title, COUNT(*) AS relevance
             FROM works
             WHERE id IN (:ids)
               AND title != ''
             GROUP BY title
             ORDER BY relevance DESC, title ASC
             LIMIT :limit`,
            {
                replacements: { ids, limit: sanitizedLimit },
                type: sequelize.QueryTypes.SELECT
            }
        );

        return rows.map(row => ({
            text: row.title,
            type: 'title',
            relevance: parseInt(row.relevance, 10) || 0,
            preview: row.title.substring(0, 100) + (row.title.length > 100 ? '...' : '')
        }));
    }

    async getAuthorSuggestions(query, limit) {
        const sanitizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));
        const ids = await this._fetchWorkIdsByMatch(query, sanitizedLimit * 5);
        if (ids.length === 0) return [];

        const rows = await sequelize.query(
            `SELECT p.preferred_name AS author_name,
                    COUNT(DISTINCT a.work_id) AS work_count
             FROM authorships a
             INNER JOIN persons p ON p.id = a.person_id
             WHERE a.work_id IN (:ids)
               AND p.preferred_name IS NOT NULL
               AND p.preferred_name != ''
             GROUP BY p.preferred_name
             ORDER BY work_count DESC
             LIMIT :limit`,
            {
                replacements: { ids, limit: sanitizedLimit * 3 },
                type: sequelize.QueryTypes.SELECT
            }
        );

        const queryLower = query.toLowerCase();
        const suggestions = [];
        for (const row of rows) {
            const author = (row.author_name || '').trim();
            if (!author) continue;
            if (!author.toLowerCase().includes(queryLower)) continue;
            if (suggestions.find(s => s.text === author)) continue;
            suggestions.push({
                text: author,
                type: 'author',
                work_count: parseInt(row.work_count, 10) || 0,
                preview: `${author} (${row.work_count} works)`
            });
            if (suggestions.length >= sanitizedLimit) break;
        }

        suggestions.sort((a, b) => b.work_count - a.work_count);
        return suggestions.slice(0, sanitizedLimit);
    }

    async getVenueSuggestions(query, limit) {
        const sanitizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));
        const ids = await this._fetchWorkIdsByMatch(query, sanitizedLimit * 5);
        if (ids.length === 0) return [];

        const rows = await sequelize.query(
            `SELECT v.id AS venue_id,
                    v.name AS venue_name,
                    v.abbreviated_name AS venue_abbrev,
                    COUNT(DISTINCT p.work_id) AS work_count
             FROM publications p
             INNER JOIN venues v ON v.id = p.venue_id
             WHERE p.work_id IN (:ids)
             GROUP BY v.id, v.name, v.abbreviated_name
             ORDER BY work_count DESC
             LIMIT :limit`,
            {
                replacements: { ids, limit: sanitizedLimit },
                type: sequelize.QueryTypes.SELECT
            }
        );

        return rows
            .filter(row => row.venue_name)
            .map(row => ({
                text: row.venue_name,
                name: row.venue_name,
                abbreviated_name: row.venue_abbrev || null,
                type: 'venue',
                work_count: parseInt(row.work_count, 10) || 0,
                preview: `${row.venue_name}${row.venue_abbrev ? ` [${row.venue_abbrev}]` : ''} (${row.work_count} works)`
            }));
    }


    async getAllSuggestions(query, limit) {
        const perType = Math.ceil(limit / 3);
        const [titles, authors, venues] = await Promise.all([
            this.getTitleSuggestions(query, perType),
            this.getAuthorSuggestions(query, perType),
            this.getVenueSuggestions(query, perType)
        ]);

        const mixed = [
            ...titles.slice(0, 3),
            ...authors.slice(0, 3),
            ...venues.slice(0, 3),
            ...titles.slice(3),
            ...authors.slice(3),
            ...venues.slice(3)
        ];

        return mixed.slice(0, limit);
    }


    async getPopularTerms(limit = 20) {
        const cacheKey = `${this.cachePrefix}popular:terms`;

        if (redis.connected) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (error) {
                logger.warn('Popular terms cache read failed', error);
            }
        }

        try {
            const sanitizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 50));
            const counts = new Map();

            if (redis.connected) {
                const today = new Date();
                for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
                    const day = new Date(today.getTime() - dayOffset * 86400000);
                    const key = `search_analytics:${day.toISOString().slice(0, 10)}`;
                    let entries = [];
                    try {
                        entries = await redis.lrange(key, 0, 1999);
                    } catch (readError) {
                        entries = [];
                    }
                    for (const raw of entries || []) {
                        let term = null;
                        try {
                            term = JSON.parse(raw)?.query;
                        } catch (parseError) {
                            term = null;
                        }
                        if (!term) continue;
                        term = String(term).trim().toLowerCase();
                        if (term.length < 2 || this.stopWords.has(term)) continue;
                        counts.set(term, (counts.get(term) || 0) + 1);
                    }
                }
            }

            const terms = Array.from(counts.entries())
                .map(([term, frequency]) => ({ term, frequency, type: 'popular' }))
                .sort((a, b) => b.frequency - a.frequency)
                .slice(0, sanitizedLimit);

            if (redis.connected) {
                redis.setex(cacheKey, 600, JSON.stringify(terms));
            }

            return terms;

        } catch (error) {
            logger.error('Popular terms generation failed', { error: error.message });
            return [];
        }
    }


    async recordSearchQuery(query, resultCount = 0) {
        if (!query || query.length < 2) return;

        try {
            const key = `search_analytics:${new Date().toISOString().slice(0, 10)}`;
            const queryData = {
                query: query.toLowerCase(),
                timestamp: new Date().toISOString(),
                result_count: resultCount
            };

            if (redis.connected) {
                await redis.lpush(key, JSON.stringify(queryData));
                await redis.expire(key, 86400 * 30);
            }

        } catch (error) {
            logger.warn('Search analytics recording failed', error);
        }
    }


    async getSearchAnalytics(days = 7) {
        if (!redis.connected) {
            return { analytics: [], message: 'Redis not available' };
        }

        try {
            const analytics = {};
            const today = new Date();

            for (let i = 0; i < days; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateKey = date.toISOString().slice(0, 10);
                const key = `search_analytics:${dateKey}`;

                const queries = await redis.lrange(key, 0, -1);
                const dayData = queries.map(q => JSON.parse(q));

                analytics[dateKey] = {
                    total_searches: dayData.length,
                    unique_queries: new Set(dayData.map(d => d.query)).size,
                    avg_results: dayData.length > 0 ?
                        dayData.reduce((sum, d) => sum + d.result_count, 0) / dayData.length : 0,
                    top_queries: this.getTopQueries(dayData, 10)
                };
            }

            return analytics;

        } catch (error) {
            logger.error('Search analytics retrieval failed', error);
            return { analytics: {}, error: error.message };
        }
    }

    getTopQueries(dayData, limit = 10) {
        const queryCount = {};
        dayData.forEach(item => {
            queryCount[item.query] = (queryCount[item.query] || 0) + 1;
        });

        return Object.entries(queryCount)
            .sort(([,a], [,b]) => b - a)
            .slice(0, limit)
            .map(([query, count]) => ({ query, count }));
    }


    async clearCache() {
        if (!redis.connected) {
            return { cleared: false, message: 'Redis not available' };
        }

        try {
            const keys = await redis.keys(`${this.cachePrefix}*`);
            if (keys.length > 0) {
                await redis.del(...keys);
            }

            logger.info('Autocomplete cache cleared', { keys_cleared: keys.length });
            return { cleared: true, keys_cleared: keys.length };

        } catch (error) {
            logger.error('Autocomplete cache clear failed', error);
            return { cleared: false, error: error.message };
        }
    }
}

module.exports = new AutocompleteService();
