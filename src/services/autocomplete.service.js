const { logger } = require('../middleware/errorHandler');
const sphinxService = require('./sphinx.service');
const redis = require('../config/redis');
const { sequelize } = require('../models');

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
            return { suggestions: [], type: 'error', error: error.message };
        }
    }


    async getTitleSuggestions(query, limit) {
        await sphinxService.ensureConnection();

        const matchExpr = sphinxService.formatMatchQuery(query);
        const sanitizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));

        const sql = `SELECT title, COUNT(*) as relevance
            FROM works_poc
            WHERE MATCH(${matchExpr})
            AND title != ''
            GROUP BY title
            ORDER BY relevance DESC, title ASC
            LIMIT ${sanitizedLimit}`;

        return new Promise((resolve, reject) => {
            sphinxService.connection.query(sql, (error, results) => {
                if (error) {
                    reject(error);
                    return;
                }

                const suggestions = (results || []).map(row => ({
                    text: row.title,
                    type: 'title',
                    relevance: row.relevance,
                    preview: row.title.substring(0, 100) + (row.title.length > 100 ? '...' : '')
                }));

                resolve(suggestions);
            });
        });
    }


    async getAuthorSuggestions(query, limit) {
        await sphinxService.ensureConnection();

        const matchExpr = sphinxService.formatMatchQuery(query);
        const sanitizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));

        const sql = `SELECT author_string, COUNT(*) as work_count
            FROM works_poc
            WHERE MATCH(${matchExpr})
            AND author_string != ''
            GROUP BY author_string
            ORDER BY work_count DESC
            LIMIT ${sanitizedLimit}`;

        return new Promise((resolve, reject) => {
            sphinxService.connection.query(sql, (error, results) => {
                if (error) {
                    reject(error);
                    return;
                }

                const queryLower = query.toLowerCase();
                const suggestions = [];
                (results || []).forEach(row => {
                    const authors = row.author_string.split(';').map(a => a.trim());
                    const matchingAuthors = authors.filter(author =>
                        author.toLowerCase().includes(queryLower)
                    );

                    matchingAuthors.forEach(author => {
                        if (!suggestions.find(s => s.text === author)) {
                            suggestions.push({
                                text: author,
                                type: 'author',
                                work_count: row.work_count,
                                preview: `${author} (${row.work_count} works)`
                            });
                        }
                    });
                });

                suggestions.sort((a, b) => b.work_count - a.work_count);
                resolve(suggestions.slice(0, limit));
            });
        });
    }


    async getVenueSuggestions(query, limit) {
        await sphinxService.ensureConnection();

        const matchExpr = sphinxService.formatMatchQuery(query);
        const sanitizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));

        const sql = `SELECT venue_name, venue_abbrev, COUNT(*) as work_count
            FROM works_poc
            WHERE MATCH(${matchExpr})
            AND venue_name != ''
            GROUP BY venue_name, venue_abbrev
            ORDER BY work_count DESC
            LIMIT ${sanitizedLimit}`;

        return new Promise((resolve, reject) => {
            sphinxService.connection.query(sql, (error, results) => {
                if (error) {
                    reject(error);
                    return;
                }

                const suggestions = (results || []).map(row => ({
                    text: row.venue_name,
                    name: row.venue_name,
                    abbreviated_name: row.venue_abbrev || null,
                    type: 'venue',
                    work_count: row.work_count,
                    preview: `${row.venue_name}${row.venue_abbrev ? ` [${row.venue_abbrev}]` : ''} (${row.work_count} works)`
                }));

                resolve(suggestions);
            });
        });
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
            const fetchLimit = sanitizedLimit * 3;

            const rows = await sequelize.query(`
                SELECT LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(sws.title, ' ', numbers.n), ' ', -1)) AS term,
                       COUNT(*) AS frequency
                FROM sphinx_works_summary sws
                JOIN (
                    SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL
                    SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL
                    SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
                ) numbers
                ON CHAR_LENGTH(sws.title) - CHAR_LENGTH(REPLACE(sws.title, ' ', '')) >= numbers.n - 1
                WHERE sws.year >= 2020
                AND CHAR_LENGTH(SUBSTRING_INDEX(SUBSTRING_INDEX(sws.title, ' ', numbers.n), ' ', -1)) > 3
                GROUP BY term
                HAVING frequency > 10
                ORDER BY frequency DESC
                LIMIT :fetchLimit
            `, {
                replacements: { fetchLimit },
                type: sequelize.QueryTypes.SELECT
            });

            const terms = (rows || [])
                .filter(row => !this.stopWords.has(row.term))
                .slice(0, sanitizedLimit)
                .map(row => ({
                    term: row.term,
                    frequency: parseInt(row.frequency, 10),
                    type: 'popular'
                }));

            if (redis.connected && terms.length > 0) {
                redis.setex(cacheKey, 21600, JSON.stringify(terms));
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
