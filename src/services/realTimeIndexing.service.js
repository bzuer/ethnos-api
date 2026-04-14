const { sequelize } = require('../models');
const { logger } = require('../middleware/errorHandler');
const sphinxService = require('./sphinx.service');
const cacheService = require('./cache.service');

const REFRESH_PROC_SQL = 'CALL sp_refresh_summary_publications_for_work(?)';

const SUMMARY_FETCH_SQL = `
  SELECT
    sp.publication_id,
    sp.work_id,
    sp.venue_id,
    sp.publisher_id,
    sp.title_search,
    sp.abstract_search,
    sp.authors_search,
    sp.venue_search,
    sp.subjects_search,
    sp.doi,
    sp.work_type,
    sp.publication_year,
    sp.language,
    sp.open_access,
    sp.peer_reviewed,
    sp.has_files,
    sp.work_citation_count,
    sp.work_reference_count,
    sp.publication_download_count
  FROM summary_publications sp
  WHERE sp.work_id = ?
`;

const SINGLE_FETCH_SQL = `
  SELECT
    sp.publication_id,
    sp.work_id,
    sp.venue_id,
    sp.publisher_id,
    sp.title_search,
    sp.abstract_search,
    sp.authors_search,
    sp.venue_search,
    sp.subjects_search,
    sp.doi,
    sp.work_type,
    sp.publication_year,
    sp.language,
    sp.open_access,
    sp.peer_reviewed,
    sp.has_files,
    sp.work_citation_count,
    sp.work_reference_count,
    sp.publication_download_count
  FROM summary_publications sp
  WHERE sp.publication_id = ?
  LIMIT 1
`;

const PUBLICATION_LOOKUP_SQL = 'SELECT work_id FROM publications WHERE id = ? LIMIT 1';

const toRtRow = (row) => ({
  publication_id: row.publication_id,
  work_id: row.work_id,
  venue_id: row.venue_id,
  publisher_id: row.publisher_id,
  title_search: row.title_search || '',
  abstract_search: row.abstract_search || '',
  authors_search: row.authors_search || '',
  venue_search: row.venue_search || '',
  subjects_search: row.subjects_search || '',
  doi: row.doi || '',
  work_type: row.work_type || 'ARTICLE',
  language: row.language || 'unknown',
  publication_year: row.publication_year || 0,
  open_access: row.open_access ? 1 : 0,
  peer_reviewed: row.peer_reviewed ? 1 : 0,
  has_files: row.has_files ? 1 : 0,
  work_citation_count: row.work_citation_count || 0,
  work_reference_count: row.work_reference_count || 0,
  publication_download_count: row.publication_download_count || 0
});

class RealTimeIndexingService {
    constructor() {
        this.enabled = process.env.SPHINX_RT_INDEXING !== 'false';
        this.retryQueue = [];
        this.processing = false;
        this.maxRetries = 3;

        if (this.enabled && process.env.NODE_ENV !== 'test') {
            this.startQueueProcessor();
        }
    }

    async _refreshSummaryForWork(workId) {
        await sequelize.query(REFRESH_PROC_SQL, { replacements: [workId] });
    }

    async _loadSummaryRowsForWork(workId) {
        const rows = await sequelize.query(SUMMARY_FETCH_SQL, {
            replacements: [workId],
            type: sequelize.QueryTypes.SELECT
        });
        return rows || [];
    }

    async _loadSummaryRowForPublication(publicationId) {
        const rows = await sequelize.query(SINGLE_FETCH_SQL, {
            replacements: [publicationId],
            type: sequelize.QueryTypes.SELECT
        });
        return rows && rows.length ? rows[0] : null;
    }

    async _resolveWorkIdForPublication(publicationId) {
        const rows = await sequelize.query(PUBLICATION_LOOKUP_SQL, {
            replacements: [publicationId],
            type: sequelize.QueryTypes.SELECT
        });
        return rows && rows.length ? rows[0].work_id : null;
    }

    async _invalidateWorkCache(workId) {
        if (!workId) return;
        const variants = ['c0:r0', 'c0:r1', 'c1:r0', 'c1:r1'];
        await Promise.all(variants.map(suffix =>
            cacheService.del(`work:v2:${workId}:${suffix}`)
        ));
    }

    async _invalidatePublicationCache(publicationId) {
        if (!publicationId) return;
        const variants = ['c0:r0', 'c0:r1', 'c1:r0', 'c1:r1'];
        await Promise.all(variants.map(suffix =>
            cacheService.del(`publication:${publicationId}:v1:${suffix}`)
        ));
    }

    async indexNewPublication(publicationId) {
        if (!this.enabled) {
            logger.debug('Real-time indexing disabled');
            return { success: true, skipped: true };
        }

        try {
            const workId = await this._resolveWorkIdForPublication(publicationId);
            if (!workId) {
                return { success: false, error: 'publication not found' };
            }

            await this._refreshSummaryForWork(workId);
            const row = await this._loadSummaryRowForPublication(publicationId);
            if (!row) {
                return { success: false, error: 'summary row missing after refresh' };
            }

            await sphinxService.ensureConnection();
            await sphinxService.indexPublication(toRtRow(row));

            await Promise.all([
                this._invalidatePublicationCache(publicationId),
                this._invalidateWorkCache(workId)
            ]);

            logger.info('Real-time publication indexing successful', {
                publication_id: publicationId,
                work_id: workId
            });

            return { success: true, indexed: true, publication_id: publicationId, work_id: workId };

        } catch (error) {
            logger.error('Real-time publication indexing failed', {
                publication_id: publicationId,
                error: error.message
            });
            this.addToRetryQueue('PUBLICATION_INSERT', { publication_id: publicationId });
            return { success: false, queued: true, error: error.message };
        }
    }

    async updatePublication(publicationId) {
        if (!this.enabled) {
            return { success: true, skipped: true };
        }

        try {
            const workId = await this._resolveWorkIdForPublication(publicationId);
            if (!workId) {
                return { success: false, error: 'publication not found' };
            }

            await this._refreshSummaryForWork(workId);
            const row = await this._loadSummaryRowForPublication(publicationId);
            if (!row) {
                return { success: false, error: 'summary row missing after refresh' };
            }

            await sphinxService.ensureConnection();
            await sphinxService.indexPublication(toRtRow(row));

            await Promise.all([
                this._invalidatePublicationCache(publicationId),
                this._invalidateWorkCache(workId)
            ]);

            logger.info('Real-time publication update successful', {
                publication_id: publicationId,
                work_id: workId
            });

            return { success: true, updated: true, publication_id: publicationId, work_id: workId };

        } catch (error) {
            logger.error('Real-time publication update failed', {
                publication_id: publicationId,
                error: error.message
            });
            this.addToRetryQueue('PUBLICATION_UPDATE', { publication_id: publicationId });
            return { success: false, queued: true, error: error.message };
        }
    }

    async deletePublication(publicationId, options = {}) {
        if (!this.enabled) {
            return { success: true, skipped: true };
        }

        try {
            const workId = options.work_id || await this._resolveWorkIdForPublication(publicationId);

            await sphinxService.ensureConnection();
            await sphinxService.deletePublication(publicationId);

            if (workId) {
                await this._refreshSummaryForWork(workId);
                await this._invalidateWorkCache(workId);
            }
            await this._invalidatePublicationCache(publicationId);

            logger.info('Real-time publication deletion successful', {
                publication_id: publicationId,
                work_id: workId
            });

            return { success: true, deleted: true, publication_id: publicationId, work_id: workId };

        } catch (error) {
            logger.error('Real-time publication deletion failed', {
                publication_id: publicationId,
                error: error.message
            });
            this.addToRetryQueue('PUBLICATION_DELETE', { publication_id: publicationId });
            return { success: false, queued: true, error: error.message };
        }
    }

    async rebuildPublicationsForWork(workId) {
        if (!this.enabled) {
            return { success: true, skipped: true };
        }

        try {
            await this._refreshSummaryForWork(workId);
            const rows = await this._loadSummaryRowsForWork(workId);

            if (rows.length === 0) {
                await this._invalidateWorkCache(workId);
                return { success: true, indexed: 0, work_id: workId };
            }

            await sphinxService.ensureConnection();
            for (const row of rows) {
                await sphinxService.indexPublication(toRtRow(row));
                await this._invalidatePublicationCache(row.publication_id);
            }
            await this._invalidateWorkCache(workId);

            logger.info('Work rebuilt across all sibling publications', {
                work_id: workId,
                indexed: rows.length
            });

            return { success: true, indexed: rows.length, work_id: workId };

        } catch (error) {
            logger.error('Work rebuild failed', {
                work_id: workId,
                error: error.message
            });
            this.addToRetryQueue('WORK_REBUILD', { work_id: workId });
            return { success: false, queued: true, error: error.message };
        }
    }

    async indexNewWork(workData) {
        const workId = typeof workData === 'object' ? workData?.id : workData;
        if (!workId) {
            return { success: false, error: 'work id is required' };
        }
        return this.rebuildPublicationsForWork(workId);
    }

    async updateWork(workId) {
        if (!workId) {
            return { success: false, error: 'work id is required' };
        }
        return this.rebuildPublicationsForWork(workId);
    }

    async deleteWork(workId) {
        if (!this.enabled) {
            return { success: true, skipped: true };
        }
        if (!workId) {
            return { success: false, error: 'work id is required' };
        }

        try {
            const rows = await this._loadSummaryRowsForWork(workId);

            await sphinxService.ensureConnection();
            for (const row of rows) {
                try {
                    await sphinxService.deletePublication(row.publication_id);
                    await this._invalidatePublicationCache(row.publication_id);
                } catch (deleteError) {
                    logger.warn('Sphinx publication delete failed during work delete', {
                        work_id: workId,
                        publication_id: row.publication_id,
                        error: deleteError.message
                    });
                }
            }

            await this._invalidateWorkCache(workId);

            logger.info('Real-time work deletion successful', {
                work_id: workId,
                publications_deleted: rows.length
            });

            return { success: true, deleted: true, work_id: workId, publications_deleted: rows.length };

        } catch (error) {
            logger.error('Real-time work deletion failed', {
                work_id: workId,
                error: error.message
            });
            this.addToRetryQueue('WORK_DELETE', { work_id: workId });
            return { success: false, queued: true, error: error.message };
        }
    }

    addToRetryQueue(operation, data) {
        this.retryQueue.push({
            operation,
            data,
            attempts: 0,
            added_at: new Date(),
            next_retry: new Date(Date.now() + 5000)
        });

        logger.debug('Added item to retry queue', {
            operation,
            payload: data,
            queue_size: this.retryQueue.length
        });
    }

    startQueueProcessor() {
        setInterval(() => {
            this.processRetryQueue();
        }, 10000);

        logger.info('Real-time indexing queue processor started');
    }

    async processRetryQueue() {
        if (this.processing || this.retryQueue.length === 0) {
            return;
        }

        this.processing = true;

        try {
            const now = new Date();
            const itemsToProcess = this.retryQueue.filter(item => item.next_retry <= now);

            for (const item of itemsToProcess) {
                try {
                    let result;

                    switch (item.operation) {
                        case 'PUBLICATION_INSERT':
                            result = await this.indexNewPublication(item.data.publication_id);
                            break;
                        case 'PUBLICATION_UPDATE':
                            result = await this.updatePublication(item.data.publication_id);
                            break;
                        case 'PUBLICATION_DELETE':
                            result = await this.deletePublication(item.data.publication_id, item.data);
                            break;
                        case 'WORK_REBUILD':
                            result = await this.rebuildPublicationsForWork(item.data.work_id);
                            break;
                        case 'WORK_DELETE':
                            result = await this.deleteWork(item.data.work_id);
                            break;
                        default:
                            logger.warn('Unknown retry queue operation', { operation: item.operation });
                            this.retryQueue = this.retryQueue.filter(i => i !== item);
                            continue;
                    }

                    if (result && result.success !== false) {
                        this.retryQueue = this.retryQueue.filter(i => i !== item);
                        logger.info('Retry queue item processed successfully', {
                            operation: item.operation,
                            payload: item.data,
                            attempts: item.attempts + 1
                        });
                    } else {
                        throw new Error(result?.error || 'unknown failure');
                    }

                } catch (error) {
                    item.attempts++;

                    if (item.attempts >= this.maxRetries) {
                        this.retryQueue = this.retryQueue.filter(i => i !== item);

                        logger.error('Retry queue item failed permanently', {
                            operation: item.operation,
                            payload: item.data,
                            attempts: item.attempts,
                            error: error.message
                        });
                    } else {
                        const delay = Math.pow(2, item.attempts) * 5000;
                        item.next_retry = new Date(Date.now() + delay);

                        logger.warn('Retry queue item failed, scheduling retry', {
                            operation: item.operation,
                            payload: item.data,
                            attempts: item.attempts,
                            next_retry: item.next_retry
                        });
                    }
                }
            }

        } catch (error) {
            logger.error('Retry queue processing failed', error);
        } finally {
            this.processing = false;
        }
    }

    getQueueStatus() {
        const now = new Date();
        const pending = this.retryQueue.filter(item => item.next_retry <= now).length;
        const waiting = this.retryQueue.length - pending;

        return {
            enabled: this.enabled,
            total_queued: this.retryQueue.length,
            pending_retry: pending,
            waiting_retry: waiting,
            processing: this.processing
        };
    }

    clearQueue() {
        const cleared = this.retryQueue.length;
        this.retryQueue = [];

        logger.info('Retry queue cleared', { items_cleared: cleared });

        return { cleared };
    }

    enable() {
        this.enabled = true;
        process.env.SPHINX_RT_INDEXING = 'true';

        if (!this.processing) {
            this.startQueueProcessor();
        }

        logger.info('Real-time indexing enabled');
        return { enabled: true };
    }

    disable() {
        this.enabled = false;
        process.env.SPHINX_RT_INDEXING = 'false';

        logger.info('Real-time indexing disabled');
        return { enabled: false };
    }
}

module.exports = new RealTimeIndexingService();
