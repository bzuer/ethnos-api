const mysql = require('mysql2');
const { logger } = require('../middleware/errorHandler');

const PUBLICATION_INDEX = 'publications_poc';
const PUBLICATION_RT_INDEX = 'publications_rt';
const PERSON_INDEX = 'persons_poc';
const VENUE_INDEX = 'venues_poc';

class SphinxService {
    constructor() {
        this.connection = null;
        this.isConnected = false;
        this.connectTimeoutMs = parseInt(process.env.SPHINX_CONNECT_TIMEOUT_MS || '750', 10);
        this.queryTimeoutMs = parseInt(process.env.SPHINX_QUERY_TIMEOUT_MS || '1500', 10);
        this.retryBackoffMs = parseInt(process.env.SPHINX_RETRY_BACKOFF_MS || '30000', 10);
        this.disabledUntil = 0;
        this.enabled = String(process.env.SPHINX_ENABLED || 'true').toLowerCase() !== 'false';
        this.connectionConfig = {
            host: process.env.SPHINX_HOST || 'localhost',
            port: parseInt(process.env.SPHINX_PORT || '9306', 10),
            user: process.env.SPHINX_USER || '',
            password: process.env.SPHINX_PASSWORD || '',
            multipleStatements: false,
            connectTimeout: this.connectTimeoutMs,
            enableKeepAlive: true
        };
    }

    async searchPublicationIds(query, filters = {}, options = {}) {
        await this.ensureConnection();

        const trimmedQuery = (query || '').trim();
        const hasSearchTerm = trimmedQuery.length > 0 && trimmedQuery !== '*';
        const limit = this._sanitizeLimit(options.limit ?? filters.limit);
        const offset = this._sanitizeOffset(options.offset ?? filters.offset);
        const MAX_SPHINX_MATCHES = 10000;
        const DEFAULT_MAX_MATCHES = 1000;
        const maxMatches = Math.min(
            MAX_SPHINX_MATCHES,
            Math.max(DEFAULT_MAX_MATCHES, offset + limit)
        );

        try {
            const matchParts = [];
            if (hasSearchTerm) {
                matchParts.push(this._escapeMatchTerm(trimmedQuery));
            }
            const venueClause = this._buildFieldMatchClause('venue_search', filters.venue_name);
            if (venueClause) matchParts.push(venueClause);
            const authorClause = this._buildFieldMatchClause('authors_search', filters.author);
            if (authorClause) matchParts.push(authorClause);
            const subjectClause = this._buildFieldMatchClause('subjects_search', filters.subject);
            if (subjectClause) matchParts.push(subjectClause);

            let sql;
            if (matchParts.length > 0) {
                sql = `SELECT id, work_id, WEIGHT() as relevance, publication_year
                       FROM ${PUBLICATION_INDEX}
                       WHERE MATCH(${this.connection.escape(matchParts.join(' '))})`;
            } else {
                sql = `SELECT id, work_id, 1 as relevance, publication_year
                       FROM ${PUBLICATION_INDEX}
                       WHERE id > 0`;
            }

            const params = [];
            const appendWhere = (clause, value) => {
                sql += ` AND ${clause}`;
                params.push(value);
            };

            if (filters.year) {
                appendWhere('publication_year = ?', parseInt(filters.year, 10));
            }
            if (filters.year_from) {
                appendWhere('publication_year >= ?', parseInt(filters.year_from, 10));
            }
            if (filters.year_to) {
                appendWhere('publication_year <= ?', parseInt(filters.year_to, 10));
            }
            if (filters.work_type) {
                appendWhere('work_type = ?', filters.work_type);
            }
            if (filters.language && filters.language !== 'unknown') {
                appendWhere('language = ?', filters.language);
            }

            const peerReviewedFlag = this._toTinyIntFlag(filters.peer_reviewed);
            if (peerReviewedFlag !== null) {
                appendWhere('peer_reviewed = ?', peerReviewedFlag);
            }

            const openAccessFlag = this._toTinyIntFlag(filters.open_access);
            if (openAccessFlag !== null) {
                appendWhere('open_access = ?', openAccessFlag);
            }

            if (filters.venue_id) {
                appendWhere('venue_id = ?', parseInt(filters.venue_id, 10));
            }
            if (filters.publisher_id) {
                appendWhere('publisher_id = ?', parseInt(filters.publisher_id, 10));
            }
            if (filters.work_id) {
                appendWhere('work_id = ?', parseInt(filters.work_id, 10));
            }
            if (filters.citation_count_min) {
                appendWhere('work_citation_count >= ?', parseInt(filters.citation_count_min, 10));
            }
            if (filters.citation_count_max) {
                appendWhere('work_citation_count <= ?', parseInt(filters.citation_count_max, 10));
            }
            if (filters.reference_count_min) {
                appendWhere('work_reference_count >= ?', parseInt(filters.reference_count_min, 10));
            }
            if (filters.reference_count_max) {
                appendWhere('work_reference_count <= ?', parseInt(filters.reference_count_max, 10));
            }

            const hasFilesFlag = this._toTinyIntFlag(filters.has_files);
            if (hasFilesFlag !== null) {
                appendWhere('has_files = ?', hasFilesFlag);
            }

            const orderClause = this._publicationOrderClause(options.orderBy);
            sql += ` ORDER BY ${orderClause} LIMIT ?, ? OPTION max_matches=${maxMatches}`;
            params.push(offset, limit);

            const startTime = Date.now();

            return new Promise((resolve, reject) => {
                const qopts = { sql, timeout: this.queryTimeoutMs };
                this.connection.query(qopts, params, (error, results = []) => {
                    const queryTime = Date.now() - startTime;
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }

                    this.connection.query('SHOW META', (metaError, metaRows = []) => {
                        const meta = {};
                        if (!metaError) {
                            metaRows.forEach(row => {
                                const key = row.Variable_name || row.Var_name;
                                meta[key] = row.Value;
                            });
                        } else {
                            this._handleQueryError(metaError);
                        }

                        const publicationIds = results.map(r => r.id);
                        const workIds = results.map(r => r.work_id).filter(Number.isFinite);
                        resolve({
                            publication_ids: publicationIds,
                            work_ids: workIds,
                            ids: publicationIds,
                            total: parseInt(meta.total_found || meta.total || results.length, 10),
                            query_time: queryTime,
                            meta
                        });
                    });
                });
            });
        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('Sphinx publication ID search failed', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            throw error;
        }
    }

    async searchWorkIds(query, filters = {}, options = {}) {
        const response = await this.searchPublicationIds(query, filters, {
            ...options,
            limit: Math.min(
                (options.limit ?? filters.limit ?? 50) * 3,
                500
            )
        });

        const seen = new Set();
        const orderedWorkIds = [];
        for (const workId of response.work_ids) {
            if (workId === null || workId === undefined) continue;
            if (seen.has(workId)) continue;
            seen.add(workId);
            orderedWorkIds.push(workId);
            if (orderedWorkIds.length >= (options.limit ?? filters.limit ?? 50)) break;
        }

        return {
            ids: orderedWorkIds,
            total: response.total,
            query_time: response.query_time,
            meta: response.meta
        };
    }

    async searchPublications(query, filters = {}, options = {}) {
        await this.ensureConnection();

        const trimmedQuery = (query || '').trim();
        const hasSearchTerm = trimmedQuery.length > 0 && trimmedQuery !== '*';
        const limit = this._sanitizeLimit(options.limit ?? filters.limit);
        const offset = this._sanitizeOffset(options.offset ?? filters.offset);
        const MAX_SPHINX_MATCHES = 10000;
        const DEFAULT_MAX_MATCHES = 1000;
        const maxMatches = Math.min(
            MAX_SPHINX_MATCHES,
            Math.max(DEFAULT_MAX_MATCHES, offset + limit)
        );

        try {
            const matchParts = [];
            if (hasSearchTerm) {
                matchParts.push(this._escapeMatchTerm(trimmedQuery));
            }
            const venueClause = this._buildFieldMatchClause('venue_search', filters.venue_name);
            if (venueClause) matchParts.push(venueClause);
            const authorClause = this._buildFieldMatchClause('authors_search', filters.author);
            if (authorClause) matchParts.push(authorClause);
            const subjectClause = this._buildFieldMatchClause('subjects_search', filters.subject);
            if (subjectClause) matchParts.push(subjectClause);

            let sql;
            const columns = `id, work_id, venue_id, publisher_id, publication_year, work_type, language, open_access, peer_reviewed, has_files, work_citation_count, work_reference_count, publication_download_count`;
            if (matchParts.length > 0) {
                sql = `SELECT ${columns}, WEIGHT() as relevance
                       FROM ${PUBLICATION_INDEX}
                       WHERE MATCH(${this.connection.escape(matchParts.join(' '))})`;
            } else {
                sql = `SELECT ${columns}, 1 as relevance
                       FROM ${PUBLICATION_INDEX}
                       WHERE id > 0`;
            }

            const params = [];
            const appendWhere = (clause, value) => {
                sql += ` AND ${clause}`;
                params.push(value);
            };

            if (filters.year) {
                appendWhere('publication_year = ?', parseInt(filters.year, 10));
            }
            if (filters.year_from) {
                appendWhere('publication_year >= ?', parseInt(filters.year_from, 10));
            }
            if (filters.year_to) {
                appendWhere('publication_year <= ?', parseInt(filters.year_to, 10));
            }
            if (filters.work_type) {
                appendWhere('work_type = ?', filters.work_type);
            }
            if (filters.language && filters.language !== 'unknown') {
                appendWhere('language = ?', filters.language);
            }

            const peerReviewedFlag = this._toTinyIntFlag(filters.peer_reviewed);
            if (peerReviewedFlag !== null) {
                appendWhere('peer_reviewed = ?', peerReviewedFlag);
            }

            const openAccessFlag = this._toTinyIntFlag(filters.open_access);
            if (openAccessFlag !== null) {
                appendWhere('open_access = ?', openAccessFlag);
            }

            if (filters.venue_id) {
                appendWhere('venue_id = ?', parseInt(filters.venue_id, 10));
            }
            if (filters.publisher_id) {
                appendWhere('publisher_id = ?', parseInt(filters.publisher_id, 10));
            }
            if (filters.work_id) {
                appendWhere('work_id = ?', parseInt(filters.work_id, 10));
            }
            if (filters.citation_count_min) {
                appendWhere('work_citation_count >= ?', parseInt(filters.citation_count_min, 10));
            }
            if (filters.citation_count_max) {
                appendWhere('work_citation_count <= ?', parseInt(filters.citation_count_max, 10));
            }
            if (filters.reference_count_min) {
                appendWhere('work_reference_count >= ?', parseInt(filters.reference_count_min, 10));
            }
            if (filters.reference_count_max) {
                appendWhere('work_reference_count <= ?', parseInt(filters.reference_count_max, 10));
            }

            const hasFilesFlag = this._toTinyIntFlag(filters.has_files);
            if (hasFilesFlag !== null) {
                appendWhere('has_files = ?', hasFilesFlag);
            }

            const orderClause = this._publicationOrderClause(options.orderBy);
            sql += ` ORDER BY ${orderClause} LIMIT ?, ? OPTION max_matches=${maxMatches}`;
            params.push(offset, limit);

            const startTime = Date.now();

            return new Promise((resolve, reject) => {
                const qopts = { sql, timeout: this.queryTimeoutMs };
                this.connection.query(qopts, params, (error, results = []) => {
                    const queryTime = Date.now() - startTime;

                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }

                    this.connection.query('SHOW META', (metaError, metaRows = []) => {
                        if (metaError) {
                            this._handleQueryError(metaError);
                            reject(metaError);
                            return;
                        }

                        const meta = {};
                        metaRows.forEach(row => {
                            const key = row.Variable_name || row.Var_name;
                            meta[key] = row.Value;
                        });

                        const totalFound = parseInt(meta.total_found || meta.total, 10);
                        const totalReturned = results.length;

                        const formattedResults = results.map(row => ({
                            publication_id: row.id,
                            work_id: row.work_id || null,
                            venue_id: row.venue_id || null,
                            publisher_id: row.publisher_id || null,
                            publication_year: row.publication_year || null,
                            work_type: row.work_type,
                            language: row.language,
                            open_access: Boolean(row.open_access),
                            peer_reviewed: Boolean(row.peer_reviewed),
                            has_files: Boolean(row.has_files),
                            citation_count: row.work_citation_count || 0,
                            reference_count: row.work_reference_count || 0,
                            download_count: row.publication_download_count || 0,
                            relevance_score: row.relevance || row.weight || null
                        }));

                        logger.info('Sphinx publication search completed', {
                            query,
                            results: totalReturned,
                            totalFound: Number.isNaN(totalFound) ? totalReturned : totalFound,
                            queryTime: `${queryTime}ms`,
                            filters: Object.keys(filters).length
                        });

                        resolve({
                            results: formattedResults,
                            total: Number.isNaN(totalFound) ? totalReturned : totalFound,
                            returned: totalReturned,
                            query_time: queryTime,
                            query,
                            filters,
                            meta: {
                                total: parseInt(meta.total, 10) || totalReturned,
                                total_found: Number.isNaN(totalFound) ? totalReturned : totalFound,
                                time: meta.time_ms ? parseFloat(meta.time_ms) : queryTime,
                                limit,
                                offset
                            }
                        });
                    });
                });
            });
        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('Sphinx publication search failed', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            throw error;
        }
    }

    async searchWorks(query, filters = {}, options = {}) {
        const response = await this.searchPublications(query, filters, options);

        const seen = new Set();
        const dedupedResults = [];
        for (const row of response.results) {
            const workId = row.work_id;
            if (workId === null || workId === undefined) continue;
            if (seen.has(workId)) continue;
            seen.add(workId);
            dedupedResults.push({
                id: workId,
                publication_id: row.publication_id,
                work_id: workId,
                title: null,
                subtitle: null,
                abstract: null,
                author_string: null,
                venue_name: null,
                venue_abbreviated_name: null,
                venue_id: row.venue_id,
                publisher_id: row.publisher_id,
                first_author_id: null,
                doi: null,
                year: row.publication_year,
                publication_year: row.publication_year,
                work_type: row.work_type,
                language: row.language,
                open_access: row.open_access,
                peer_reviewed: row.peer_reviewed,
                citation_count: row.citation_count,
                reference_count: row.reference_count,
                resolved_references_count: 0,
                pending_references_count: 0,
                cited_by_count: row.citation_count,
                has_files: row.has_files,
                relevance_score: row.relevance_score,
                created_ts: null
            });
        }

        return {
            results: dedupedResults,
            total: response.total,
            returned: dedupedResults.length,
            query_time: response.query_time,
            query: response.query,
            filters: response.filters,
            meta: response.meta
        };
    }

    async getPublicationFacets(query, filters = {}) {
        await this.ensureConnection();

        try {
            const trimmedQuery = (query || '').trim();
            if (!trimmedQuery) {
                return {
                    years: [],
                    work_types: [],
                    languages: [],
                    venues: [],
                    open_access: []
                };
            }

            const matchExpression = `MATCH(${this.connection.escape(trimmedQuery)})`;

            const yearPromise = new Promise((resolve, reject) => {
                this.connection.query(`
                    SELECT publication_year, COUNT(*) as count
                    FROM ${PUBLICATION_INDEX}
                    WHERE ${matchExpression}
                      AND publication_year > 0
                    GROUP BY publication_year
                    ORDER BY count DESC, publication_year DESC
                    LIMIT 20
                `, (error, results = []) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results.map(f => ({ value: f.publication_year, count: f.count })));
                });
            });

            const typePromise = new Promise((resolve, reject) => {
                this.connection.query(`
                    SELECT work_type, COUNT(*) as count
                    FROM ${PUBLICATION_INDEX}
                    WHERE ${matchExpression}
                    GROUP BY work_type
                    ORDER BY count DESC
                    LIMIT 10
                `, (error, results = []) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results.map(f => ({ value: f.work_type, count: f.count })));
                });
            });

            const languagePromise = new Promise((resolve, reject) => {
                this.connection.query(`
                    SELECT language, COUNT(*) as count
                    FROM ${PUBLICATION_INDEX}
                    WHERE ${matchExpression}
                      AND language != ''
                      AND language != 'unknown'
                    GROUP BY language
                    ORDER BY count DESC
                    LIMIT 10
                `, (error, results = []) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results.map(f => ({ value: f.language, count: f.count })));
                });
            });

            const venuesPromise = new Promise((resolve, reject) => {
                this.connection.query(`
                    SELECT venue_id, COUNT(*) as count
                    FROM ${PUBLICATION_INDEX}
                    WHERE ${matchExpression}
                      AND venue_id > 0
                    GROUP BY venue_id
                    ORDER BY count DESC
                    LIMIT 15
                `, (error, results = []) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results.map(f => ({
                        value: f.venue_id,
                        venue_id: f.venue_id,
                        count: f.count
                    })));
                });
            });

            const openAccessPromise = new Promise((resolve, reject) => {
                this.connection.query(`
                    SELECT open_access, COUNT(*) as count
                    FROM ${PUBLICATION_INDEX}
                    WHERE ${matchExpression}
                    GROUP BY open_access
                    ORDER BY open_access DESC
                `, (error, results = []) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results.map(f => ({
                        value: Boolean(f.open_access),
                        count: f.count
                    })));
                });
            });

            const [years, work_types, languages, venues, open_access] = await Promise.all([
                yearPromise,
                typePromise,
                languagePromise,
                venuesPromise,
                openAccessPromise
            ]);

            return { years, work_types, languages, venues, open_access };

        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('Sphinx publication facets failed', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            throw error;
        }
    }

    async getFacets(query, filters = {}) {
        return this.getPublicationFacets(query, filters);
    }

    async searchPublicationsWithFacets(query, filters = {}, options = {}) {
        const searchResults = await this.searchPublications(query, filters, options);
        let facets = {};
        try {
            facets = await this.getPublicationFacets(query, filters);
        } catch (error) {
            logger.warn('Facets fetch failed in searchPublicationsWithFacets', { error: error.message });
        }

        return {
            ...searchResults,
            facets,
            meta: {
                ...searchResults.meta,
                faceted_search: true,
                total_facets: Object.keys(facets).length
            }
        };
    }

    async searchWithFacets(query, filters = {}, options = {}) {
        const searchResults = await this.searchWorks(query, filters, options);
        let facets = {};
        try {
            facets = await this.getPublicationFacets(query, filters);
        } catch (error) {
            logger.warn('Facets fetch failed in searchWithFacets', { error: error.message });
        }

        return {
            ...searchResults,
            facets,
            meta: {
                ...searchResults.meta,
                faceted_search: true,
                total_facets: Object.keys(facets).length
            }
        };
    }

    async indexPublication(publicationData) {
        await this.ensureConnection();

        try {
            const sql = `
                INSERT INTO ${PUBLICATION_RT_INDEX}
                (id, title_search, abstract_search, authors_search, venue_search, subjects_search, doi,
                 work_id, venue_id, publisher_id, publication_year, open_access, peer_reviewed, has_files,
                 work_citation_count, work_reference_count, publication_download_count, work_type, language)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                publicationData.publication_id || publicationData.id,
                publicationData.title_search || publicationData.title || '',
                publicationData.abstract_search || publicationData.abstract || '',
                publicationData.authors_search || publicationData.author_string || '',
                publicationData.venue_search || publicationData.venue_name || '',
                publicationData.subjects_search || publicationData.subjects_string || '',
                publicationData.doi || '',
                publicationData.work_id || 0,
                publicationData.venue_id || 0,
                publicationData.publisher_id || 0,
                publicationData.publication_year || publicationData.year || 0,
                publicationData.open_access ? 1 : 0,
                publicationData.peer_reviewed ? 1 : 0,
                publicationData.has_files ? 1 : 0,
                publicationData.work_citation_count || publicationData.citation_count || 0,
                publicationData.work_reference_count || publicationData.reference_count || 0,
                publicationData.publication_download_count || publicationData.download_count || 0,
                publicationData.work_type || 'ARTICLE',
                publicationData.language || 'unknown'
            ];

            const result = await new Promise((resolve, reject) => {
                this.connection.query(sql, params, (error, results) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results);
                });
            });

            logger.info('Publication indexed in RT index', {
                publication_id: publicationData.publication_id || publicationData.id,
                work_id: publicationData.work_id
            });

            return result;

        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('RT indexing failed', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            throw error;
        }
    }

    async updatePublication(publicationId, updates) {
        await this.ensureConnection();

        try {
            const setParts = [];
            const params = [];

            Object.entries(updates).forEach(([field, value]) => {
                setParts.push(`${field} = ?`);
                params.push(value);
            });

            if (setParts.length === 0) {
                return { affectedRows: 0 };
            }

            params.push(publicationId);
            const sql = `UPDATE ${PUBLICATION_RT_INDEX} SET ${setParts.join(', ')} WHERE id = ?`;

            const result = await new Promise((resolve, reject) => {
                this.connection.query(sql, params, (error, results) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results);
                });
            });

            logger.info('Publication updated in RT index', {
                publication_id: publicationId,
                fields: Object.keys(updates)
            });

            return result;

        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('RT update failed', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            throw error;
        }
    }

    async deletePublication(publicationId) {
        await this.ensureConnection();

        try {
            const sql = `DELETE FROM ${PUBLICATION_RT_INDEX} WHERE id = ?`;
            const result = await new Promise((resolve, reject) => {
                this.connection.query(sql, [publicationId], (error, results) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results);
                });
            });

            logger.info('Publication deleted from RT index', { publication_id: publicationId });
            return result;

        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('RT deletion failed', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            throw error;
        }
    }

    async indexWork(workData) {
        logger.warn('sphinx.service.indexWork is deprecated (operator pipeline owns real-time indexing)', {
            work_id: workData?.id || workData?.publication_id
        });
        return { affectedRows: 0, skipped: true, reason: 'operator_pipeline_owned' };
    }

    async updateWork(workId) {
        logger.warn('sphinx.service.updateWork is deprecated (operator pipeline owns real-time indexing)', { work_id: workId });
        return { affectedRows: 0, skipped: true, reason: 'operator_pipeline_owned' };
    }

    async deleteWork(workId) {
        logger.warn('sphinx.service.deleteWork is deprecated (operator pipeline owns real-time indexing)', { work_id: workId });
        return { affectedRows: 0, skipped: true, reason: 'operator_pipeline_owned' };
    }

    async searchPersonIds(searchTerm, options = {}) {
        await this.ensureConnection();

        const { limit = 20, offset = 0, verified } = options;
        const sanitizedLimit = this._sanitizeLimit(limit, 20, 100);
        const sanitizedOffset = this._sanitizeOffset(offset);
        const safeTerm = (searchTerm || '').replace(/'/g, "\\'");

        let whereClause = `WHERE MATCH('${safeTerm}')`;
        if (verified !== undefined) {
            whereClause += ` AND is_verified = ${verified === 'true' || verified === true ? 1 : 0}`;
        }

        const sql = `
            SELECT id, WEIGHT() as weight
            FROM ${PERSON_INDEX}
            ${whereClause}
            ORDER BY weight DESC, id ASC
            LIMIT ${parseInt(sanitizedOffset)}, ${parseInt(sanitizedLimit)}
        `;

        const startTime = Date.now();
        return new Promise((resolve, reject) => {
            this.connection.query({ sql, timeout: this.queryTimeoutMs }, (error, rows = []) => {
                const queryTime = Date.now() - startTime;
                if (error) {
                    this._handleQueryError(error);
                    reject(error);
                    return;
                }
                const countSql = `SELECT COUNT(*) as total FROM ${PERSON_INDEX} ${whereClause}`;
                this.connection.query({ sql: countSql, timeout: this.queryTimeoutMs }, (countError, countRows = []) => {
                    if (countError) {
                        this._handleQueryError(countError);
                        resolve({ ids: rows.map(r => r.id), total: rows.length, query_time: queryTime, meta: {} });
                        return;
                    }
                    resolve({
                        ids: rows.map(r => r.id),
                        total: parseInt(countRows[0]?.total || rows.length, 10),
                        query_time: queryTime
                    });
                });
            });
        });
    }

    async searchVenueIds(searchTerm, options = {}) {
        await this.ensureConnection();

        const { limit = 20, offset = 0, type } = options;
        const sanitizedLimit = this._sanitizeLimit(limit, 20, 100);
        const sanitizedOffset = this._sanitizeOffset(offset);
        const trimmed = (searchTerm || '').trim();
        const hasTerm = trimmed.length > 0;

        let whereClause = hasTerm
            ? `WHERE MATCH(${this.connection.escape(this._escapeMatchTerm(trimmed))})`
            : 'WHERE id > 0';
        const params = [];

        if (type) {
            whereClause += ' AND venue_type = ?';
            params.push(type);
        }

        const orderClause = this._venueOrderClause(options.sortBy, options.sortOrder);
        const sql = `SELECT id, WEIGHT() as weight FROM ${VENUE_INDEX} ${whereClause} ORDER BY weight DESC, ${orderClause} LIMIT ${parseInt(sanitizedOffset)}, ${parseInt(sanitizedLimit)}`;
        const countSql = `SELECT COUNT(*) as total FROM ${VENUE_INDEX} ${whereClause}`;

        const startTime = Date.now();
        return new Promise((resolve, reject) => {
            this.connection.query({ sql, timeout: this.queryTimeoutMs }, params, (error, rows = []) => {
                const queryTime = Date.now() - startTime;
                if (error) {
                    this._handleQueryError(error);
                    reject(error);
                    return;
                }

                this.connection.query({ sql: countSql, timeout: this.queryTimeoutMs }, params, (countError, countRows = []) => {
                    if (countError) {
                        this._handleQueryError(countError);
                        resolve({ ids: rows.map(r => r.id), total: rows.length, query_time: queryTime, meta: {} });
                        return;
                    }
                    resolve({
                        ids: rows.map(r => r.id),
                        total: parseInt(countRows[0]?.total || rows.length, 10),
                        query_time: queryTime
                    });
                });
            });
        });
    }

    _ensureEnabled() {
        if (!this.enabled) {
            const error = new Error('Sphinx disabled by configuration');
            error.code = 'SPHINX_UNAVAILABLE';
            throw error;
        }
    }

    _isTemporarilyDisabled() {
        return Date.now() < this.disabledUntil;
    }

    _markUnavailable(error) {
        this.isConnected = false;

        if (this.connection) {
            try {
                this.connection.destroy();
            } catch (destroyError) {
                if (logger.debug) {
                    logger.debug('Sphinx connection destroy failed', { message: destroyError.message });
                }
            }
            this.connection = null;
        }

        this.disabledUntil = Date.now() + this.retryBackoffMs;

        if (error && error.code !== 'SPHINX_UNAVAILABLE') {
            logger.warn('Sphinx temporarily disabled', {
                message: error.message,
                code: error.code,
                retry_in_ms: this.retryBackoffMs
            });
        }
    }

    _handleQueryError(error) {
        if (!error) {
            return;
        }

        if (error.fatal || ['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST'].includes(error.code)) {
            this._markUnavailable(error);
        }
    }

    async connect() {
        this._ensureEnabled();
        if (this._isTemporarilyDisabled()) {
            const retryInMs = this.disabledUntil - Date.now();
            const error = new Error('Sphinx temporarily unavailable');
            error.code = 'SPHINX_UNAVAILABLE';
            error.retry_in_ms = Math.max(0, retryInMs);
            throw error;
        }

        try {
            if (this.connection) {
                try {
                    this.connection.destroy();
                } catch (destroyError) {
                    if (logger.debug) {
                        logger.debug('Sphinx connection destroy before reconnect failed', { message: destroyError.message });
                    }
                }
                this.connection = null;
            }

            this.connection = mysql.createConnection(this.connectionConfig);

            this.connection.on('error', (connError) => {
                logger.error('Sphinx connection error', {
                    message: connError.message,
                    code: connError.code
                });
                this._handleQueryError(connError);
            });

            this.connection.on('end', () => {
                this._markUnavailable(new Error('Sphinx connection ended'));
            });

            return new Promise((resolve, reject) => {
                this.connection.connect((error) => {
                    if (error) {
                        this._markUnavailable(error);
                        logger.error('Failed to connect to Sphinx', {
                            message: error.message,
                            code: error.code
                        });
                        reject(error);
                        return;
                    }

                    this.connection.query('SHOW TABLES', (validationError, results = []) => {
                        if (validationError) {
                            this._handleQueryError(validationError);
                            logger.error('Sphinx connection test failed', {
                                message: validationError.message,
                                code: validationError.code
                            });
                            reject(validationError);
                            return;
                        }

                        this.isConnected = true;
                        this.disabledUntil = 0;

                        logger.info('Sphinx connection established', {
                            indexes: results.length,
                            tables: results.map(r => r.Index || r.Table).filter(Boolean)
                        });
                        resolve(true);
                    });
                });
            });
        } catch (error) {
            this._handleQueryError(error);
            throw error;
        }
    }

    async ensureConnection() {
        if (!this.enabled) {
            const error = new Error('Sphinx disabled by configuration');
            error.code = 'SPHINX_UNAVAILABLE';
            throw error;
        }
        if (this._isTemporarilyDisabled()) {
            const error = new Error('Sphinx temporarily unavailable');
            error.code = 'SPHINX_UNAVAILABLE';
            error.retry_in_ms = Math.max(0, this.disabledUntil - Date.now());
            throw error;
        }

        if (!this.isConnected || !this.connection) {
            await this.connect();
        }
    }

    _sanitizeLimit(value, defaultValue = 50, maxValue = 100) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed <= 0) {
            return defaultValue;
        }
        return Math.min(parsed, maxValue);
    }

    _sanitizeOffset(value) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed < 0) {
            return 0;
        }
        return parsed;
    }

    _toTinyIntFlag(value) {
        if (value === undefined || value === null || value === '') {
            return null;
        }
        if (typeof value === 'boolean') {
            return value ? 1 : 0;
        }

        const normalized = String(value).trim().toLowerCase();
        if (['1', 'true', 'yes'].includes(normalized)) {
            return 1;
        }
        if (['0', 'false', 'no'].includes(normalized)) {
            return 0;
        }

        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            return numeric ? 1 : 0;
        }

        return null;
    }

    _sanitizeOrderClause(requested, allowed, fallbackKey) {
        if (!requested || typeof requested !== 'string') {
            return allowed[fallbackKey];
        }

        const normalized = requested.toLowerCase();
        return allowed[normalized] || allowed[fallbackKey];
    }

    _escapeMatchTerm(term) {
        if (typeof term !== 'string') {
            return '';
        }

        return term
            .replace(/\\/g, '\\')
            .replace(/([()|\-!@~&\/?^$=])/g, '\\$1')
            .trim();
    }

    _buildFieldMatchClause(field, term) {
        if (typeof term !== 'string') return null;
        const cleaned = term.replace(/"/g, '').trim();
        if (!cleaned) return null;
        const escaped = this._escapeMatchTerm(cleaned);
        if (!escaped) return null;
        return /\s/.test(escaped)
            ? `@${field} (${escaped})`
            : `@${field} ${escaped}`;
    }

    _formatMatchExpression(term) {
        const sanitized = this._escapeMatchTerm(term);
        return this.connection.escape(sanitized);
    }

    formatMatchQuery(term) {
        return this._formatMatchExpression(term);
    }

    _publicationOrderClause(orderBy) {
        const allowed = {
            default: 'relevance DESC, publication_year DESC, id DESC',
            relevance: 'relevance DESC, publication_year DESC, id DESC',
            year_desc: 'publication_year DESC, id DESC',
            year_asc: 'publication_year ASC, id ASC',
            publication_year_desc: 'publication_year DESC, id DESC',
            publication_year_asc: 'publication_year ASC, id ASC',
            citations_desc: 'work_citation_count DESC, publication_year DESC, id DESC',
            citations_asc: 'work_citation_count ASC, publication_year ASC, id ASC',
            cited_by_count_desc: 'work_citation_count DESC, publication_year DESC, id DESC',
            cited_by_count_asc: 'work_citation_count ASC, publication_year ASC, id ASC',
            cited_by_count: 'work_citation_count DESC, publication_year DESC, id DESC'
        };

        return this._sanitizeOrderClause(orderBy, allowed, 'default');
    }

    _venueOrderClause(sortBy, sortOrder) {
        const fieldMap = {
            id: 'id',
            type: 'id',
            name: 'id',
            impact_factor: 'impact_factor_x1000',
            h_index: 'h_index',
            works_count: 'total_publications_count',
            publications_count: 'total_publications_count',
            cited_by_count: 'total_cited_by_count'
        };

        const normalizedSort = typeof sortBy === 'string' ? sortBy.toLowerCase() : 'works_count';
        const field = fieldMap[normalizedSort] || fieldMap.works_count;
        const direction = typeof sortOrder === 'string' && sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        return `${field} ${direction}, id ASC`;
    }

    async getStatus() {
        await this.ensureConnection();

        try {
            const statusPromise = new Promise((resolve, reject) => {
                this.connection.query('SHOW STATUS', (error, results) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results);
                });
            });

            const variablesPromise = new Promise((resolve, reject) => {
                this.connection.query('SHOW VARIABLES', (error, results) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results);
                });
            });

            const [status, variables] = await Promise.all([statusPromise, variablesPromise]);

            const statusObj = {};
            status.forEach(row => {
                statusObj[row.Counter || row.Variable_name] = row.Value;
            });

            const variablesObj = {};
            variables.forEach(row => {
                variablesObj[row.Variable_name] = row.Value;
            });

            return {
                connected: this.isConnected,
                uptime: parseInt(statusObj.uptime) || 0,
                queries: parseInt(statusObj.queries) || 0,
                avg_query_time: parseFloat(statusObj.avg_query_wall) || 0,
                connections: parseInt(statusObj.connections) || 0,
                indexes_loaded: Object.keys(variablesObj).length,
                performance: {
                    query_wall: parseFloat(statusObj.query_wall) || 0,
                    queries_per_second: statusObj.uptime ? (statusObj.queries / statusObj.uptime).toFixed(2) : 0
                }
            };

        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('Sphinx status failed', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            return {
                connected: false,
                error: error.message
            };
        }
    }

    async close() {
        if (this.connection) {
            try {
                this.connection.end();
            } catch (error) {
                this.connection.destroy();
            }
            this.connection = null;
            this.isConnected = false;
        }
    }
}

module.exports = new SphinxService();
