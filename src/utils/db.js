const DB_QUERY_TIMEOUT_MS = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '6000', 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '5000', 10);
const REQUEST_HEADROOM_MS = 500;

const safeDbMs = Number.isFinite(DB_QUERY_TIMEOUT_MS) && DB_QUERY_TIMEOUT_MS > 0 ? DB_QUERY_TIMEOUT_MS : 6000;
const safeReqMs = Number.isFinite(REQUEST_TIMEOUT_MS) && REQUEST_TIMEOUT_MS > 0 ? REQUEST_TIMEOUT_MS : 5000;

// Every server-side statement budget must fire BEFORE the request-timeout ceiling,
// so a slow query aborts at the DB (caught -> graceful degrade) instead of tripping
// the request timer's hard 503. Any explicit budget is capped to this invariant.
const DEFAULT_MS = Math.max(1000, Math.min(safeDbMs, safeReqMs - REQUEST_HEADROOM_MS));

function secondsFromMs(ms) {
  const val = Number(ms);
  const effective = !Number.isFinite(val) || val <= 0 ? DEFAULT_MS : Math.min(val, DEFAULT_MS);
  return Math.max(0.1, Math.round((effective / 1000) * 10) / 10);
}

function withTimeout(sql, ms = DEFAULT_MS) {
  const secs = secondsFromMs(ms);
  return `SET STATEMENT max_statement_time=${secs} FOR ${sql}`;
}

function isStatementTimeout(error) {
  if (!error) return false;
  const src = error.original || error.parent || error;
  const code = src.code || error.code;
  const errno = src.errno || error.errno;
  const msg = String(error.message || '');
  return code === 'ER_STATEMENT_TIMEOUT' || errno === 1969 || /max_statement_time|execution was interrupted/i.test(msg);
}

const LATEST_PUBLICATION_ID_SUBQUERY = 'SELECT MAX(p2.id) FROM publications p2 WHERE p2.work_id = w.id';

function latestPublicationJoin(alias = 'pub', joinType = 'LEFT') {
  return `${joinType} JOIN publications ${alias} ON ${alias}.id = (${LATEST_PUBLICATION_ID_SUBQUERY})`;
}

module.exports = { withTimeout, DEFAULT_MS, isStatementTimeout, LATEST_PUBLICATION_ID_SUBQUERY, latestPublicationJoin };
