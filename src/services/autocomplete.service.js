const { logger } = require('../middleware/errorHandler');
const redis = require('../config/redis');

const POPULAR_TERMS_MAX = 50;
const ANALYTICS_DAILY_CAP = 5000;
const { sequelize } = require('../models');
const searchEngine = require('./searchEngine.service');

class AutocompleteService {
    constructor() {
        this.cachePrefix = 'autocomplete:v3:';
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

        const cacheKey = `${this.cachePrefix}${type}:${limit}:${query.toLowerCase()}`;

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

        try {
            let suggestions = await this._suggestionsFor(query, type, limit);
            let revision = null;
            if (suggestions.length === 0) {
                const revised = await this._reviseQuery(query);
                if (revised) {
                    const corrected = await this._suggestionsFor(revised.query, type, limit);
                    if (corrected.length > 0) {
                        suggestions = corrected;
                        revision = revised.revision;
                    }
                }
            }

            const result = {
                query,
                suggestions,
                type,
                count: suggestions.length,
                ...(revision ? { query_revision: revision } : {}),
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


    async _suggestionsFor(query, type, limit) {
        switch (type) {
            case 'titles':
                return this.getTitleSuggestions(query, limit);
            case 'authors':
                return this.getAuthorSuggestions(query, limit);
            case 'venues':
                return this.getVenueSuggestions(query, limit);
            default:
                return this.getAllSuggestions(query, limit);
        }
    }


    async _reviseQuery(query) {
        try {
            return await searchEngine.revisePrefixQuery(query);
        } catch (error) {
            logger.warn('Autocomplete query revision failed; returning no suggestions', { error: error.message });
            return null;
        }
    }


    _normalizeForMatch(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    _queryTerms(query) {
        return this._normalizeForMatch(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    }

    _containsAllTerms(text, terms) {
        const haystack = this._normalizeForMatch(text);
        return terms.every(term => haystack.includes(term));
    }

    async _fetchWorkIdsByPrefix(query, field, fetchLimit) {
        const cappedLimit = Math.max(1, Math.min(parseInt(fetchLimit, 10) || 50, 500));

        try {
            return await searchEngine.fetchWorkIdsForPrefix(query, field, cappedLimit);
        } catch (error) {
            logger.warn('Autocomplete Manticore lookup failed; returning empty match set', {
                error: error.message
            });
            return [];
        }
    }

    async getTitleSuggestions(query, limit) {
        const sanitizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));
        const ids = await this._fetchWorkIdsByPrefix(query, 'title', sanitizedLimit * 5);
        if (ids.length === 0) return [];

        const rows = await sequelize.query(
            `SELECT title, COUNT(*) AS relevance, MIN(FIELD(id, :ids)) AS first_rank
             FROM works
             WHERE id IN (:ids)
               AND title != ''
             GROUP BY title
             ORDER BY relevance DESC, first_rank ASC
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
        const ids = await this._fetchWorkIdsByPrefix(query, 'authors', sanitizedLimit * 5);
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

        const terms = this._queryTerms(query);
        const suggestions = [];
        for (const row of rows) {
            const author = (row.author_name || '').trim();
            if (!author) continue;
            if (!this._containsAllTerms(author, terms)) continue;
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
        const ids = await this._fetchWorkIdsByPrefix(query, 'venue', sanitizedLimit * 5);
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
                replacements: { ids, limit: sanitizedLimit * 3 },
                type: sequelize.QueryTypes.SELECT
            }
        );

        const terms = this._queryTerms(query);
        return rows
            .filter(row => row.venue_name)
            .filter(row => this._containsAllTerms(`${row.venue_name} ${row.venue_abbrev || ''}`, terms))
            .slice(0, sanitizedLimit)
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
        const sanitizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, POPULAR_TERMS_MAX));
        const cacheKey = `${this.cachePrefix}popular:terms:v2`;

        if (redis.connected) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached).slice(0, sanitizedLimit);
                }
            } catch (error) {
                logger.warn('Popular terms cache read failed', error);
            }
        }

        try {
            const counts = new Map();

            if (redis.connected) {
                const today = new Date();
                for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
                    const day = new Date(today.getTime() - dayOffset * 86400000);
                    const key = `search_analytics:${day.toISOString().slice(0, 10)}`;
                    let entries = [];
                    try {
                        entries = await redis.lrange(key, 0, ANALYTICS_DAILY_CAP - 1);
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
                .sort((a, b) => b.frequency - a.frequency || a.term.localeCompare(b.term))
                .slice(0, POPULAR_TERMS_MAX);

            if (redis.connected) {
                redis.setex(cacheKey, 600, JSON.stringify(terms));
            }

            return terms.slice(0, sanitizedLimit);

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
                await redis.ltrim(key, 0, ANALYTICS_DAILY_CAP - 1);
                await redis.expire(key, 86400 * 30);
            }

        } catch (error) {
            logger.warn('Search analytics recording failed', error);
        }
    }


    async getSearchAnalytics(days = 7) {
        if (!redis.connected) {
            return {};
        }

        try {
            const today = new Date();
            const dateKeys = Array.from({ length: days }, (_, i) => {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                return date.toISOString().slice(0, 10);
            });
            const lists = await Promise.all(dateKeys.map((dateKey) => redis.lrange(`search_analytics:${dateKey}`, 0, -1)));

            const analytics = {};
            dateKeys.forEach((dateKey, index) => {
                const dayData = (lists[index] || []).map((raw) => {
                    try { return JSON.parse(raw); } catch (_) { return null; }
                }).filter(Boolean);
                analytics[dateKey] = {
                    total_searches: dayData.length,
                    unique_queries: new Set(dayData.map(d => d.query)).size,
                    avg_results: dayData.length > 0
                        ? dayData.reduce((sum, d) => sum + (Number(d.result_count) || 0), 0) / dayData.length
                        : 0,
                    top_queries: this.getTopQueries(dayData, 10)
                };
            });
            return analytics;
        } catch (error) {
            logger.error('Search analytics retrieval failed', { error: error.message });
            return {};
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


}

module.exports = new AutocompleteService();
