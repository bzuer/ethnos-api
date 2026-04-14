const { logger } = require('../middleware/errorHandler');

class RealTimeIndexingService {
    constructor() {
        this.enabled = false;
    }

    async indexNewWork(workData) {
        logger.debug('Real-time indexing no-op', { work_id: workData?.id });
        return { success: true, skipped: true, reason: 'operator_pipeline_owned' };
    }

    async updateWork(workId) {
        logger.debug('Real-time indexing no-op', { work_id: workId });
        return { success: true, skipped: true, reason: 'operator_pipeline_owned' };
    }

    async deleteWork(workId) {
        logger.debug('Real-time indexing no-op', { work_id: workId });
        return { success: true, skipped: true, reason: 'operator_pipeline_owned' };
    }

    getQueueStatus() {
        return {
            enabled: false,
            reason: 'operator_pipeline_owned',
            total_queued: 0,
            pending_retry: 0,
            waiting_retry: 0,
            processing: false
        };
    }

    clearQueue() {
        return { cleared: 0 };
    }

    enable() {
        logger.warn('RealTimeIndexingService.enable() is a no-op under consumer-only rule');
        return { enabled: false };
    }

    disable() {
        return { enabled: false };
    }
}

module.exports = new RealTimeIndexingService();
