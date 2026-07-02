const manticore = require('../config/manticore');
const { logger } = require('../middleware/errorHandler');

const BACKEND = (process.env.SEARCH_BACKEND || 'mariadb').toLowerCase();

const WORKS_TABLE = process.env.MANTICORE_WORKS_TABLE || 'works';
const PERSONS_TABLE = process.env.MANTICORE_PERSONS_TABLE || 'persons';

const WORKS_FIELD_WEIGHTS = 'title=10, subtitle=4, abstract=2, authors=6, subjects=4, venue=4';
const PERSONS_FIELD_WEIGHTS = 'preferred_name=10, family_name=6, given_names=4';

const WORKS_TEXT_FIELDS = 'title,subtitle,abstract,authors,subjects,venue';

const WORK_TYPE_CODES = {
  ARTICLE: 1,
  BOOK: 2,
  CHAPTER: 3,
  THESIS: 4,
  CONFERENCE: 5,
  CONFERENCE_PAPER: 6,
  REPORT: 7,
  DATASET: 8,
  PREPRINT: 9,
  REVIEW: 10,
  EDITORIAL: 11,
  OTHER: 12
};

function workTypeCode(value) {
  if (value === undefined || value === null) return null;
  return WORK_TYPE_CODES[String(value).trim().toUpperCase()] ?? null;
}

const WORKS_RELEVANCE_RANKER = "ranker=expr('sum(lcs*user_weight)*1000 + bm25 + min(citation_count,1000)*50')";
const PERSONS_RELEVANCE_RANKER = "ranker=expr('sum(lcs*user_weight)*1000 + bm25 + min(total_works,500)*20')";

const MAX_MATCHES_CEILING = 100000;
const YEAR_ENUM_MAX_SPAN = 150;

function isEnabled() {
  return BACKEND === 'manticore';
}

function toInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function toBoolFlag(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const n = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(n)) return 1;
  if (['0', 'false', 'no', 'n'].includes(n)) return 0;
  return null;
}

function sanitizeMatchValue(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/[@()~/"^$<=>|!*\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

function quoteAttr(value) {
  return `'${String(value).replace(/['\\]/g, '')}'`;
}

function buildWorksMatch({ q, author, subject, venue_name }) {
  const groups = [];
  const free = sanitizeMatchValue(q);
  if (free) groups.push(`@(${WORKS_TEXT_FIELDS}) ${free}`);
  const a = sanitizeMatchValue(author);
  if (a) groups.push(`@authors ${a}`);
  const s = sanitizeMatchValue(subject);
  if (s) groups.push(`@subjects ${s}`);
  const v = sanitizeMatchValue(venue_name);
  if (v) groups.push(`@venue ${v}`);
  return groups.join(' ');
}

function buildWorksAttrConditions(filters) {
  const conds = [];
  const typeCode = workTypeCode(filters.type);
  if (typeCode !== null) conds.push(`type_codes = ${typeCode}`);
  if (filters.language) conds.push(`language = ${quoteAttr(filters.language)}`);

  const citedMin = toInt(filters.cited_by_min ?? filters.citation_count_min);
  const citedMax = toInt(filters.cited_by_max ?? filters.citation_count_max);
  if (citedMin !== null) conds.push(`citation_count >= ${citedMin}`);
  if (citedMax !== null) conds.push(`citation_count <= ${citedMax}`);

  const yFrom = toInt(filters.year_from);
  const yTo = toInt(filters.year_to);
  if (yFrom !== null && yTo !== null) {
    const lo = Math.min(yFrom, yTo);
    const hi = Math.max(yFrom, yTo);
    if (hi - lo <= YEAR_ENUM_MAX_SPAN) {
      const years = [];
      for (let y = lo; y <= hi; y += 1) years.push(y);
      conds.push(`years IN (${years.join(',')})`);
    } else {
      conds.push(`years >= ${lo}`, `years <= ${hi}`);
    }
  } else if (yFrom !== null) {
    conds.push(`years >= ${yFrom}`);
  } else if (yTo !== null) {
    conds.push(`years <= ${yTo}`);
  }

  const oa = toBoolFlag(filters.open_access);
  if (oa !== null) conds.push(`oa_flags = ${oa}`);
  const pr = toBoolFlag(filters.peer_reviewed);
  if (pr !== null) conds.push(`pr_flags = ${pr}`);

  return conds;
}

function buildWorksOrder(filters) {
  const sortBy = (filters.sort_by ?? filters.sortBy ?? '').toString().toLowerCase();
  const dir = (filters.sort_order ?? filters.sortOrder ?? '').toString().toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  switch (sortBy) {
    case 'cited_by_count':
    case 'citation_count':
    case 'citations':
      return { clause: `citation_count ${dir}, max_year DESC, id DESC`, relevance: false };
    case 'references_count':
    case 'reference_count':
      return { clause: `reference_count ${dir}, max_year DESC, id DESC`, relevance: false };
    case 'publication_year':
    case 'year':
      return { clause: `max_year ${dir}, id DESC`, relevance: false };
    case 'id':
    case 'work_id':
      return { clause: `id ${dir}`, relevance: false };
    default:
      return { clause: 'weight() DESC, citation_count DESC, id DESC', relevance: true };
  }
}

async function searchWorkIds(filters = {}, limit, offset) {
  const matchExpr = buildWorksMatch(filters);
  if (!matchExpr) return { ids: [], total: 0, exact: true };

  const where = [`MATCH('${matchExpr}')`, ...buildWorksAttrConditions(filters)];
  const whereClause = where.join(' AND ');
  const order = buildWorksOrder(filters);
  const maxMatches = Math.min(MAX_MATCHES_CEILING, Math.max(1000, offset + limit));
  const options = [`max_matches=${maxMatches}`, `field_weights=(${WORKS_FIELD_WEIGHTS})`];
  if (order.relevance) options.push(WORKS_RELEVANCE_RANKER);

  const pageSql = `SELECT id, weight() AS w FROM ${WORKS_TABLE} WHERE ${whereClause} `
    + `ORDER BY ${order.clause} LIMIT ${offset}, ${limit} `
    + `OPTION ${options.join(', ')}`;
  const countSql = `SELECT COUNT(*) AS total FROM ${WORKS_TABLE} WHERE ${whereClause}`;

  const [pageRows, countRows] = await Promise.all([
    manticore.query(pageSql),
    manticore.query(countSql)
  ]);

  return {
    ids: pageRows.map(r => Number(r.id)),
    weights: pageRows.map(r => Number(r.w)),
    total: Number(countRows[0]?.total) || 0,
    exact: true
  };
}

async function searchPersonIds(query, { verified, limit, offset } = {}) {
  const matchExpr = sanitizeMatchValue(query);
  if (!matchExpr) return { ids: [], total: 0, exact: true };

  const where = [`MATCH('@(preferred_name,given_names,family_name) ${matchExpr}')`];
  const verifiedFlag = toBoolFlag(verified);
  if (verifiedFlag !== null) where.push(`is_verified = ${verifiedFlag}`);
  const whereClause = where.join(' AND ');
  const lim = toInt(limit) ?? 20;
  const off = toInt(offset) ?? 0;
  const maxMatches = Math.min(MAX_MATCHES_CEILING, Math.max(1000, off + lim));

  const pageSql = `SELECT id, weight() AS w FROM ${PERSONS_TABLE} WHERE ${whereClause} `
    + `ORDER BY weight() DESC, total_works DESC, id DESC LIMIT ${off}, ${lim} `
    + `OPTION max_matches=${maxMatches}, field_weights=(${PERSONS_FIELD_WEIGHTS}), ${PERSONS_RELEVANCE_RANKER}`;
  const countSql = `SELECT COUNT(*) AS total FROM ${PERSONS_TABLE} WHERE ${whereClause}`;

  const [pageRows, countRows] = await Promise.all([
    manticore.query(pageSql),
    manticore.query(countSql)
  ]);

  return {
    ids: pageRows.map(r => Number(r.id)),
    weights: pageRows.map(r => Number(r.w)),
    total: Number(countRows[0]?.total) || 0,
    exact: true
  };
}

async function fetchWorkIdsForMatch(query, limit) {
  const matchExpr = buildWorksMatch({ q: query });
  if (!matchExpr) return [];
  const lim = toInt(limit) ?? 50;
  const sql = `SELECT id FROM ${WORKS_TABLE} WHERE MATCH('${matchExpr}') `
    + `ORDER BY weight() DESC, citation_count DESC, id DESC LIMIT 0, ${lim} `
    + `OPTION max_matches=${Math.max(1000, lim)}, field_weights=(${WORKS_FIELD_WEIGHTS}), ${WORKS_RELEVANCE_RANKER}`;
  const rows = await manticore.query(sql);
  return rows.map(r => Number(r.id));
}

async function fetchWorkIdsForFilters(filters, cap = 5000) {
  const matchExpr = buildWorksMatch(filters);
  if (!matchExpr) return { ids: [], capped: false };
  const lim = Math.min(Math.max(cap, 1), MAX_MATCHES_CEILING);
  const sql = `SELECT id FROM ${WORKS_TABLE} WHERE MATCH('${matchExpr}') `
    + `ORDER BY weight() DESC, citation_count DESC, id DESC LIMIT 0, ${lim} `
    + `OPTION max_matches=${lim}, field_weights=(${WORKS_FIELD_WEIGHTS}), ${WORKS_RELEVANCE_RANKER}`;
  const rows = await manticore.query(sql);
  const ids = rows.map(r => Number(r.id));
  return { ids, capped: ids.length >= lim };
}

async function healthcheck() {
  const reachable = await manticore.ping();
  const result = { backend: BACKEND, engine: 'Manticore', reachable };
  if (reachable) {
    try {
      const tables = await manticore.query('SHOW TABLES');
      result.tables = tables;
    } catch (error) {
      logger.warn(`Manticore SHOW TABLES failed: ${error.message}`);
    }
  } else {
    result.error = manticore.getLastError();
  }
  return result;
}

module.exports = {
  isEnabled,
  searchWorkIds,
  searchPersonIds,
  fetchWorkIdsForMatch,
  fetchWorkIdsForFilters,
  healthcheck,
  BACKEND
};
