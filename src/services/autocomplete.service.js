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
            return {
                query,
                suggestions: [],
                type,
                count: 0,
                generated_at: new Date().toISOString()
            };
        }
    }


    async _fetchPublicationIdsByMatch(query, fetchLimit) {
        const cappedLimit = Math.max(1, Math.min(parseInt(fetchLimit, 10) || 50, 500));

        try {
            await sphinxService.ensureConnection();
            const matchExpr = sphinxService.formatMatchQuery(query);
            const sql = `SELECT id, WEIGHT() as weight
                FROM publications_poc
                WHERE MATCH(${matchExpr})
                ORDER BY weight DESC
                LIMIT ${cappedLimit}
                OPTION max_matches=${cappedLimit}`;

            return await new Promise((resolve, reject) => {
                sphinxService.connection.query(sql, (error, results) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve((results || []).map(row => row.id).filter(Number.isFinite));
                });
            });
        } catch (sphinxError) {
            logger.warn('Autocomplete Sphinx path unavailable, falling back to MariaDB fulltext', {
                error: sphinxError.message
            });
            const rows = await sequelize.query(
                `SELECT sp.publication_id AS id
                 FROM summary_publications sp
                 WHERE MATCH(sp.title_search, sp.abstract_search) AGAINST (:q IN BOOLEAN MODE)
                 LIMIT :lim`,
                {
                    replacements: { q: query, lim: cappedLimit },
                    type: sequelize.QueryTypes.SELECT
                }
            );
            return rows.map(r => r.id).filter(Number.isFinite);
        }
    }

    async getTitleSuggestions(query, limit) {
        const sanitizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));
        const ids = await this._fetchPublicationIdsByMatch(query, sanitizedLimit * 5);
        if (ids.length === 0) return [];

        const rows = await sequelize.query(
            `SELECT title_search AS title, COUNT(*) AS relevance
             FROM summary_publications
             WHERE publication_id IN (:ids)
               AND title_search != ''
             GROUP BY title_search
             ORDER BY relevance DESC, title_search ASC
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
        const ids = await this._fetchPublicationIdsByMatch(query, sanitizedLimit * 5);
        if (ids.length === 0) return [];

        const rows = await sequelize.query(
            `SELECT authors_search AS author_string, COUNT(*) AS work_count
             FROM summary_publications
             WHERE publication_id IN (:ids)
               AND authors_search IS NOT NULL
               AND authors_search != ''
             GROUP BY authors_search
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
            const authors = (row.author_string || '').split(/[;,]\s*/).map(a => a.trim()).filter(Boolean);
            for (const author of authors) {
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
            if (suggestions.length >= sanitizedLimit) break;
        }

        suggestions.sort((a, b) => b.work_count - a.work_count);
        return suggestions.slice(0, sanitizedLimit);
    }

    async getVenueSuggestions(query, limit) {
        const sanitizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));
        const ids = await this._fetchPublicationIdsByMatch(query, sanitizedLimit * 5);
        if (ids.length === 0) return [];

        const rows = await sequelize.query(
            `SELECT sp.venue_id,
                    sv.name_search AS venue_name,
                    sv.abbrev_search AS venue_abbrev,
                    COUNT(*) AS work_count
             FROM summary_publications sp
             LEFT JOIN summary_venues sv ON sv.venue_id = sp.venue_id
             WHERE sp.publication_id IN (:ids)
               AND sp.venue_id IS NOT NULL
             GROUP BY sp.venue_id, sv.name_search, sv.abbrev_search
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
            const fetchLimit = sanitizedLimit * 3;

            const rows = await sequelize.query(`
                SELECT LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(sp.title_search, ' ', numbers.n), ' ', -1)) AS term,
                       COUNT(*) AS frequency
                FROM summary_publications sp
                JOIN (
                    SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL
                    SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL
                    SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
                ) numbers
                ON CHAR_LENGTH(sp.title_search) - CHAR_LENGTH(REPLACE(sp.title_search, ' ', '')) >= numbers.n - 1
                WHERE sp.publication_year >= 2020
                  AND CHAR_LENGTH(SUBSTRING_INDEX(SUBSTRING_INDEX(sp.title_search, ' ', numbers.n), ' ', -1)) > 3
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
