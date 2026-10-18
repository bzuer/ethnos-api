const manticore = require('../config/manticore');
const { logger, AppError } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/responseBuilder');
const spelling = require('../utils/spelling');

const BACKEND = (process.env.SEARCH_BACKEND || 'manticore').toLowerCase();

const WORKS_TABLE = process.env.MANTICORE_WORKS_TABLE || 'works';
const PERSONS_TABLE = process.env.MANTICORE_PERSONS_TABLE || 'persons';

const WORKS_FIELD_WEIGHTS = 'title=10, subtitle=4, abstract=2, authors=6, subjects=4, venue=4';
const PERSONS_FIELD_WEIGHTS = 'preferred_name=10, family_name=6, given_names=4';

const WORKS_STEMMED_FIELDS = 'title,subtitle,abstract,subjects';
const WORKS_VERBATIM_FIELDS = 'authors,venue';

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

const WORKS_RELEVANCE_RANKER = "ranker=expr('sum((word_count + if(min_gaps == 0, word_count, 0))*user_weight)*500 + bm25 + min(citation_count,1000)*50')";
const PERSONS_RELEVANCE_RANKER = "ranker=expr('sum(lcs*user_weight)*1000 + bm25 + min(total_works,500)*20')";
const MAX_QUERY_TIME_MS = parseInt(process.env.MANTICORE_MAX_QUERY_TIME_MS, 10) || 4000;
const UNRANKED = `ranker=none, max_query_time=${MAX_QUERY_TIME_MS}`;

const PREFIX_FIELDS = new Set(['title', 'authors', 'venue']);
const MIN_PREFIX_LENGTH = 3;
const PREFIX_EXPANSION_LIMIT = 128;

const MAX_MATCHES_CEILING = 100000;
const YEAR_ENUM_MAX_SPAN = 150;

const REVISION_QUERY_TIME_MS = parseInt(process.env.MANTICORE_REVISION_QUERY_TIME_MS, 10) || 500;
const REVISION_UNRANKED = `ranker=none, max_query_time=${REVISION_QUERY_TIME_MS}`;
const REVISION_START_BUDGET_MS = 1000;
const REVISED_PAGE_MIN_QUERY_TIME_MS = 250;
const SUGGESTION_MAX_TERM_DOCS = 1000;
const MAX_REVISION_SLOTS = 3;
const MAX_RELAXATION_TERMS = 10;
const REVISION_CONCURRENCY = 4;
const WILDCARD_EXPANSION_LIMIT = 64;
const RELAXABLE_PARAMETER = 'q';

const WORKS_DICTIONARY = {
  table: WORKS_TABLE,
  exactPrefix: '=',
  weightAttr: 'citation_count',
  contextCandidates: 6,
  maxRewrites: 16
};
const PERSONS_DICTIONARY = {
  table: PERSONS_TABLE,
  exactPrefix: '',
  weightAttr: 'total_works',
  contextCandidates: 30,
  maxRewrites: 48
};

function assertWithinMatchWindow(offset, limit) {
  if (offset + limit > MAX_MATCHES_CEILING) {
    throw new AppError(
      `Full-text results can be paged up to the first ${MAX_MATCHES_CEILING} matches; narrow the query or use a different sort`,
      400,
      ERROR_CODES.VALIDATION
    );
  }
}

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
    .replace(/[^\p{L}\p{M}\p{N}_\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return cleaned;
}

function quoteAttr(value) {
  return `'${String(value).replace(/['\\]/g, '')}'`;
}

function splitTerms(value) {
  const cleaned = sanitizeMatchValue(value);
  return cleaned ? cleaned.split(' ') : [];
}

function hasTerms(groups) {
  return Object.values(groups).some(terms => terms.length > 0);
}

function worksTermGroups({ q, author, subject, venue_name }) {
  return {
    q: splitTerms(q),
    author: splitTerms(author),
    subject: splitTerms(subject),
    venue_name: splitTerms(venue_name)
  };
}

function buildFreeTextExpr(terms) {
  return terms
    .map(term => `((@(${WORKS_STEMMED_FIELDS}) ${term}) | (@(${WORKS_VERBATIM_FIELDS}) ${term}))`)
    .join(' ');
}

function buildWorksMatchFromGroups(groups) {
  const parts = [];
  if (groups.q?.length) parts.push(buildFreeTextExpr(groups.q));
  if (groups.author?.length) parts.push(`@authors ${groups.author.join(' ')}`);
  if (groups.subject?.length) parts.push(`@subjects ${groups.subject.join(' ')}`);
  if (groups.venue_name?.length) parts.push(`@venue ${groups.venue_name.join(' ')}`);
  return parts.join(' ');
}

function buildWorksMatch(filters) {
  return buildWorksMatchFromGroups(worksTermGroups(filters));
}

function buildPersonsMatch(groups) {
  return groups.q.length ? `@(preferred_name,given_names,family_name) ${groups.q.join(' ')}` : '';
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

function queryTimeExceeded(meta) {
  return (meta || []).some(row => row.Variable_name === 'warning' && /max_query_time/i.test(String(row.Value)));
}

async function boundedQuery(sql) {
  const { rows, meta } = await manticore.queryWithMeta(sql);
  if (queryTimeExceeded(meta)) {
    const error = new Error('Search query exceeded max_query_time');
    error.code = 'ER_STATEMENT_TIMEOUT';
    throw error;
  }
  return rows;
}

async function boundedCount(sql) {
  const { rows, meta } = await manticore.queryWithMeta(sql);
  return { total: Number(rows[0]?.total) || 0, exact: !queryTimeExceeded(meta) };
}

function resolveTotal(counted, offset, limit, pageLength) {
  if (counted.exact) return { total: counted.total, exact: true };
  const lowerBound = offset + pageLength + (pageLength === limit ? 1 : 0);
  return { total: Math.max(counted.total, lowerBound), exact: false };
}

function unrankedOptions(queryTimeMs) {
  return `ranker=none, max_query_time=${queryTimeMs}`;
}

async function runWorksSearch(groups, attrConds, order, limit, offset, queryTimeMs = MAX_QUERY_TIME_MS) {
  const whereClause = [`MATCH('${buildWorksMatchFromGroups(groups)}')`, ...attrConds].join(' AND ');
  const maxMatches = Math.min(MAX_MATCHES_CEILING, Math.max(1000, offset + limit));
  const options = [`max_matches=${maxMatches}`, `field_weights=(${WORKS_FIELD_WEIGHTS})`];
  options.push(order.relevance ? `${WORKS_RELEVANCE_RANKER}, max_query_time=${queryTimeMs}` : unrankedOptions(queryTimeMs));

  const pageSql = `SELECT id, weight() AS w FROM ${WORKS_TABLE} WHERE ${whereClause} `
    + `ORDER BY ${order.clause} LIMIT ${offset}, ${limit} `
    + `OPTION ${options.join(', ')}`;
  const countSql = `SELECT COUNT(*) AS total FROM ${WORKS_TABLE} WHERE ${whereClause} OPTION ${unrankedOptions(queryTimeMs)}`;

  const [pageRows, counted] = await Promise.all([
    boundedQuery(pageSql),
    boundedCount(countSql)
  ]);

  return {
    ids: pageRows.map(r => Number(r.id)),
    weights: pageRows.map(r => Number(r.w)),
    ...resolveTotal(counted, offset, limit, pageRows.length)
  };
}

async function runPersonsSearch(groups, conds, limit, offset, queryTimeMs = MAX_QUERY_TIME_MS) {
  const whereClause = [`MATCH('${buildPersonsMatch(groups)}')`, ...conds].join(' AND ');
  const maxMatches = Math.min(MAX_MATCHES_CEILING, Math.max(1000, offset + limit));

  const pageSql = `SELECT id, weight() AS w FROM ${PERSONS_TABLE} WHERE ${whereClause} `
    + `ORDER BY weight() DESC, total_works DESC, id DESC LIMIT ${offset}, ${limit} `
    + `OPTION max_matches=${maxMatches}, field_weights=(${PERSONS_FIELD_WEIGHTS}), ${PERSONS_RELEVANCE_RANKER}, max_query_time=${queryTimeMs}`;
  const countSql = `SELECT COUNT(*) AS total FROM ${PERSONS_TABLE} WHERE ${whereClause} OPTION ${unrankedOptions(queryTimeMs)}`;

  const [pageRows, counted] = await Promise.all([
    boundedQuery(pageSql),
    boundedCount(countSql)
  ]);

  return {
    ids: pageRows.map(r => Number(r.id)),
    weights: pageRows.map(r => Number(r.w)),
    ...resolveTotal(counted, offset, limit, pageRows.length)
  };
}

async function revisionCount(dictionary, matchExpr, conds = []) {
  const whereClause = [`MATCH('${matchExpr}')`, ...conds].join(' AND ');
  const { rows, meta } = await manticore.queryWithMeta(
    `SELECT COUNT(*) AS total, SUM(${dictionary.weightAttr}) AS weight FROM ${dictionary.table} WHERE ${whereClause} OPTION ${REVISION_UNRANKED}`
  );
  return { total: Number(rows[0]?.total) || 0, weight: Number(rows[0]?.weight) || 0, exact: !queryTimeExceeded(meta) };
}

async function keywordStats(table, tokens, extraOptions = '') {
  if (tokens.length === 0) return [];
  return manticore.query(`CALL KEYWORDS(?, ?, 1 AS stats${extraOptions})`, [tokens.join(' '), table]);
}

async function fetchTermDocs(dictionary, forms) {
  const docs = new Map(forms.map(form => [form, 0]));
  const { exactPrefix } = dictionary;
  const tokens = forms.flatMap(form => (exactPrefix ? [form, `${exactPrefix}${form}`] : [form]));
  for (const row of await keywordStats(dictionary.table, tokens)) {
    const token = String(row.tokenized ?? '');
    const form = exactPrefix && token.startsWith(exactPrefix) ? token.slice(exactPrefix.length) : token;
    if (docs.has(form)) docs.set(form, Math.max(docs.get(form), Number(row.docs) || 0));
  }
  return docs;
}

async function fetchCandidates(dictionary, entries, { contextual = false } = {}) {
  const contextLimit = contextual ? dictionary.contextCandidates : 0;
  if (entries.length === 0) return [];
  const { exactPrefix } = dictionary;
  const plans = entries.map(entry => ({
    entry,
    variants: spelling.editsOne(entry.form),
    seeds: spelling.wildcardSeeds(entry.form)
  }));
  const exactTokens = [...new Set(plans.flatMap(plan => plan.variants.map(variant => `${exactPrefix}${variant}`)))];
  const seedTokens = [...new Set(plans.flatMap(plan => plan.seeds.map(seed => `${seed}*`)))];
  const [exactRows, seedRows] = await Promise.all([
    keywordStats(dictionary.table, exactTokens),
    keywordStats(dictionary.table, seedTokens, `, 0 AS fold_wildcards, 'docs' AS sort_mode, ${WILDCARD_EXPANSION_LIMIT} AS expansion_limit`)
  ]);

  const exactDocs = new Map(exactRows.map(row => [String(row.tokenized ?? ''), Number(row.docs) || 0]));
  const expansions = new Map();
  for (const row of seedRows) {
    const normalized = String(row.normalized ?? '');
    if (normalized.endsWith('*') || !normalized.startsWith(exactPrefix)) continue;
    const word = normalized.slice(exactPrefix.length);
    if (!/^[a-z]+$/.test(word)) continue;
    const seed = String(row.tokenized ?? '').replace(/\*$/, '');
    if (!expansions.has(seed)) expansions.set(seed, []);
    expansions.get(seed).push([word, Number(row.docs) || 0]);
  }

  return plans.map(({ entry, variants, seeds }) => {
    const docsByWord = new Map();
    for (const variant of variants) {
      const docs = exactDocs.get(`${exactPrefix}${variant}`) || 0;
      if (docs > 0) docsByWord.set(variant, docs);
    }
    for (const seed of seeds) {
      for (const [word, docs] of expansions.get(seed) || []) {
        docsByWord.set(word, Math.max(docsByWord.get(word) || 0, docs));
      }
    }
    return spelling.rankCandidates(entry.form, docsByWord, entry.docs, { contextLimit });
  });
}

async function planRevision({ dictionary, groups, total, count, countUnfiltered = null, relaxable = null, allowSuggestion = false }) {
  const zero = total === 0;
  if (!zero && !allowSuggestion) return null;

  const entries = Object.entries(groups).flatMap(([parameter, terms]) => terms.map(term => ({
    parameter,
    term,
    form: spelling.correctableForm(term),
    stat: spelling.statForm(term),
    docs: null
  })));
  const docsByForm = await fetchTermDocs(dictionary, [...new Set(entries.map(entry => entry.stat).filter(Boolean))]);
  for (const entry of entries) {
    if (entry.stat) entry.docs = docsByForm.get(entry.stat);
  }
  const unmatched = entries.filter(entry => entry.docs === 0);
  if (!zero && unmatched.length > 0) return null;
  if (zero && unmatched.length === 0 && countUnfiltered) {
    const bare = await countUnfiltered(groups);
    if (bare.total > 0) return null;
  }

  const slots = entries
    .filter(entry => entry.form && (zero || entry.docs <= SUGGESTION_MAX_TERM_DOCS))
    .sort((a, b) => a.docs - b.docs)
    .slice(0, MAX_REVISION_SLOTS);
  if (!zero && slots.length === 0) return null;
  const candidateLists = await fetchCandidates(dictionary, slots, { contextual: zero });

  const drops = new Set(unmatched.filter(entry => !slots.includes(entry)));
  const optionSlots = [];
  slots.forEach((entry, i) => {
    const options = candidateLists[i].map(candidate => ({ entry, term: entry.term, ...candidate }));
    if (entry.docs > 0) {
      options.unshift({ entry, term: entry.term, word: entry.term, docs: entry.docs, distance: 0, score: spelling.priorScore(entry.docs, 0) });
    }
    if (options.length === 0) drops.add(entry);
    else if (options.length > 1 || options[0].word !== entry.term) optionSlots.push({ options });
  });
  if ([...drops].some(entry => entry.parameter !== relaxable)) return null;
  if (!zero && optionSlots.length === 0) return null;

  const rewriteGroups = (choices, dropped) => {
    const replacement = new Map(choices.map(choice => [choice.entry, choice.word]));
    const rewritten = Object.fromEntries(Object.keys(groups).map(parameter => [parameter, []]));
    for (const entry of entries) {
      if (!dropped.has(entry)) rewritten[entry.parameter].push(replacement.get(entry) ?? entry.term);
    }
    return rewritten;
  };
  const correctionsOf = (choices, dropped) => choices
    .filter(choice => choice.word !== choice.term && !dropped.has(choice.entry))
    .map(choice => ({ parameter: choice.entry.parameter, term: choice.term, replacement: choice.word, distance: choice.distance }));
  const droppedOf = dropped => entries
    .filter(entry => dropped.has(entry))
    .map(entry => ({ parameter: entry.parameter, term: entry.term }));
  const countEach = async trials => {
    const counted = [];
    for (let i = 0; i < trials.length; i += REVISION_CONCURRENCY) {
      const batch = trials.slice(i, i + REVISION_CONCURRENCY);
      counted.push(...await Promise.all(batch.map(async trial => ({ ...trial, ...(await count(trial.groups)) }))));
    }
    return counted;
  };

  const rewrites = spelling.enumerateRewrites(optionSlots, dictionary.maxRewrites);
  if (drops.size > 0 && optionSlots.every(slot => slot.options[0].distance === 0)) {
    rewrites.unshift({ choices: [], distance: 0, score: 0, changes: 0 });
  }
  const trials = rewrites
    .map(rewrite => ({ ...rewrite, groups: rewriteGroups(rewrite.choices, drops) }))
    .filter(trial => hasTerms(trial.groups));
  const countTiers = async () => {
    const counted = [];
    for (const changes of [...new Set(trials.map(trial => trial.changes))]) {
      const tier = await countEach(trials.filter(trial => trial.changes === changes));
      counted.push(...tier);
      if (tier.some(trial => trial.total > 0)) break;
    }
    return counted;
  };
  const [baseline, evaluated] = await Promise.all([zero ? null : count(groups), countTiers()]);
  const viable = evaluated
    .filter(trial => trial.total > 0)
    .sort((x, y) => spelling.contextScore(y.total, y.weight, y.distance) - spelling.contextScore(x.total, x.weight, x.distance)
      || y.score - x.score);
  const best = viable[0];
  if (best) {
    if (baseline && spelling.contextScore(best.total, best.weight, best.distance) <= spelling.contextScore(baseline.total, baseline.weight, 0)) {
      return null;
    }
    return {
      kind: zero ? 'rewrite' : 'suggestion',
      groups: best.groups,
      corrections: correctionsOf(best.choices, drops),
      dropped: droppedOf(drops),
      total: best.total,
      exact: best.exact
    };
  }
  if (!zero || !relaxable) return null;

  const baseChoices = optionSlots.filter(slot => slot.options[0].distance > 0).map(slot => slot.options[0]);
  const baseDocs = new Map(baseChoices.map(choice => [choice.entry, choice.docs]));
  const kept = entries.filter(entry => entry.parameter === relaxable && !drops.has(entry));
  if (kept.length < 2 || kept.length > MAX_RELAXATION_TERMS) return null;
  const relaxations = (await countEach(kept
    .map(entry => {
      const dropped = new Set([...drops, entry]);
      return { entry, dropped, groups: rewriteGroups(baseChoices, dropped) };
    })
    .filter(trial => hasTerms(trial.groups))))
    .filter(trial => trial.total > 0)
    .map(trial => ({
      ...trial,
      score: spelling.contextScore(trial.total, trial.weight, 0) + Math.log(Math.max(baseDocs.get(trial.entry) ?? trial.entry.docs ?? 0, 1))
    }))
    .sort((x, y) => y.score - x.score);
  const relaxed = relaxations[0];
  if (!relaxed) return null;
  return {
    kind: 'rewrite',
    groups: relaxed.groups,
    corrections: correctionsOf(baseChoices, relaxed.dropped),
    dropped: droppedOf(relaxed.dropped),
    total: relaxed.total,
    exact: relaxed.exact
  };
}

async function reviseSearch({
  dictionary,
  groups,
  result,
  offset,
  started,
  autocorrect,
  allowSuggestion = true,
  count,
  countUnfiltered = null,
  rerun
}) {
  const eligible = result.exact
    && (result.total === 0 || (allowSuggestion && offset === 0))
    && Date.now() - started <= REVISION_START_BUDGET_MS;
  if (!eligible) return { ...result, revision: null };

  let plan = null;
  try {
    plan = await planRevision({
      dictionary,
      groups,
      total: result.total,
      count,
      countUnfiltered,
      relaxable: RELAXABLE_PARAMETER,
      allowSuggestion
    });
  } catch (error) {
    logger.warn('Search query revision failed; serving the original result', { error: error.message });
  }
  if (!plan) return { ...result, revision: null };

  const describe = (applied, revisedTotal, revisedTotalExact) => spelling.formatQueryRevision({
    status: applied ? (plan.dropped.length ? 'relaxed' : 'corrected') : 'suggested',
    applied,
    originalGroups: groups,
    revisedGroups: plan.groups,
    corrections: plan.corrections,
    dropped: plan.dropped,
    originalTotal: result.total,
    revisedTotal,
    revisedTotalExact
  });
  if (plan.kind === 'suggestion' || !autocorrect) {
    return { ...result, revision: describe(false, plan.total, plan.exact) };
  }

  try {
    const queryTimeMs = Math.max(REVISED_PAGE_MIN_QUERY_TIME_MS, MAX_QUERY_TIME_MS - (Date.now() - started));
    const revised = await rerun(plan.groups, queryTimeMs);
    if (revised.total > 0) return { ...revised, revision: describe(true, revised.total, revised.exact) };
  } catch (error) {
    logger.warn('Revised search query failed; serving the original result', { error: error.message });
  }
  return { ...result, revision: describe(false, plan.total, plan.exact) };
}

async function searchWorkIds(filters = {}, limit, offset) {
  const groups = worksTermGroups(filters);
  if (!hasTerms(groups)) return { ids: [], total: 0, exact: true, revision: null };

  assertWithinMatchWindow(offset, limit);
  const started = Date.now();
  const attrConds = buildWorksAttrConditions(filters);
  const order = buildWorksOrder(filters);
  const result = await runWorksSearch(groups, attrConds, order, limit, offset);

  return reviseSearch({
    dictionary: WORKS_DICTIONARY,
    groups,
    result,
    offset,
    started,
    autocorrect: spelling.isAutocorrectEnabled(filters.autocorrect),
    count: candidate => revisionCount(WORKS_DICTIONARY, buildWorksMatchFromGroups(candidate), attrConds),
    countUnfiltered: attrConds.length ? candidate => revisionCount(WORKS_DICTIONARY, buildWorksMatchFromGroups(candidate)) : null,
    rerun: (candidate, queryTimeMs) => runWorksSearch(candidate, attrConds, order, limit, offset, queryTimeMs)
  });
}

async function searchPersonIds(query, { verified, limit, offset, autocorrect } = {}) {
  const groups = { q: splitTerms(query) };
  if (!hasTerms(groups)) return { ids: [], total: 0, exact: true, revision: null };

  const conds = [];
  const verifiedFlag = toBoolFlag(verified);
  if (verifiedFlag !== null) conds.push(`is_verified = ${verifiedFlag}`);
  const lim = toInt(limit) ?? 20;
  const off = toInt(offset) ?? 0;
  assertWithinMatchWindow(off, lim);
  const started = Date.now();
  const result = await runPersonsSearch(groups, conds, lim, off);

  return reviseSearch({
    dictionary: PERSONS_DICTIONARY,
    groups,
    result,
    offset: off,
    started,
    autocorrect: spelling.isAutocorrectEnabled(autocorrect),
    count: candidate => revisionCount(PERSONS_DICTIONARY, buildPersonsMatch(candidate), conds),
    countUnfiltered: conds.length ? candidate => revisionCount(PERSONS_DICTIONARY, buildPersonsMatch(candidate)) : null,
    rerun: (candidate, queryTimeMs) => runPersonsSearch(candidate, conds, lim, off, queryTimeMs)
  });
}

async function runRelevanceWorkIdQuery(matchExpr, lim, maxMatches) {
  const sql = `SELECT id FROM ${WORKS_TABLE} WHERE MATCH('${matchExpr}') `
    + `ORDER BY weight() DESC, citation_count DESC, id DESC LIMIT 0, ${lim} `
    + `OPTION max_matches=${maxMatches}, field_weights=(${WORKS_FIELD_WEIGHTS}), ${WORKS_RELEVANCE_RANKER}, max_query_time=${MAX_QUERY_TIME_MS}`;
  const rows = await boundedQuery(sql);
  return rows.map(r => Number(r.id));
}

async function fetchWorkIdsForFilters(filters, cap = 5000) {
  const groups = worksTermGroups(filters);
  if (!hasTerms(groups)) return { ids: [], capped: false, revision: null };

  const lim = Math.min(Math.max(cap, 1), MAX_MATCHES_CEILING);
  const started = Date.now();
  const run = async candidate => {
    const ids = await runRelevanceWorkIdQuery(buildWorksMatchFromGroups(candidate), lim, lim);
    return { ids, total: ids.length, exact: ids.length < lim };
  };
  const final = await reviseSearch({
    dictionary: WORKS_DICTIONARY,
    groups,
    result: await run(groups),
    offset: 0,
    started,
    autocorrect: spelling.isAutocorrectEnabled(filters.autocorrect),
    allowSuggestion: false,
    count: candidate => revisionCount(WORKS_DICTIONARY, buildWorksMatchFromGroups(candidate)),
    rerun: candidate => run(candidate)
  });
  return { ids: final.ids, capped: final.ids.length >= lim, revision: final.revision };
}

function buildPrefixMatch(query, field) {
  if (!PREFIX_FIELDS.has(field)) return '';
  const terms = sanitizeMatchValue(query).split(' ').filter(Boolean);
  if (terms.length === 0) return '';
  const last = terms.pop();
  if ([...last].length >= MIN_PREFIX_LENGTH) terms.push(`${last}*`);
  else if (terms.length === 0) terms.push(last);
  return `@${field} ${terms.join(' ')}`;
}

async function fetchWorkIdsForPrefix(query, field, limit) {
  const matchExpr = buildPrefixMatch(query, field);
  if (!matchExpr) return [];
  const lim = Math.min(Math.max(toInt(limit) ?? 50, 1), 1000);
  const sql = `SELECT id FROM ${WORKS_TABLE} WHERE MATCH('${matchExpr}') `
    + `ORDER BY citation_count DESC, id DESC LIMIT 0, ${lim} `
    + `OPTION max_matches=${Math.max(1000, lim)}, ${UNRANKED}, expansion_limit=${PREFIX_EXPANSION_LIMIT}`;
  const rows = await manticore.query(sql);
  return rows.map(r => Number(r.id));
}

async function prefixExists(form) {
  const rows = await keywordStats(WORKS_TABLE, [`${form}*`], ', 0 AS fold_wildcards, 1 AS expansion_limit');
  return rows.some(row => !String(row.normalized ?? '').endsWith('*') && Number(row.docs) > 0);
}

async function prefixMatchesInContext(terms) {
  const head = buildFreeTextExpr(terms.slice(0, -1));
  const prefix = buildFreeTextExpr([`${terms[terms.length - 1]}*`]);
  const rows = await manticore.query(
    `SELECT COUNT(*) AS total FROM ${WORKS_TABLE} WHERE MATCH('${[head, prefix].filter(Boolean).join(' ')}') `
    + `OPTION ${REVISION_UNRANKED}, expansion_limit=${PREFIX_EXPANSION_LIMIT}`
  );
  return Number(rows[0]?.total) > 0;
}

async function planPrefixRevision(complete) {
  const count = candidate => revisionCount(WORKS_DICTIONARY, buildWorksMatchFromGroups(candidate));
  const plan = await planRevision({
    dictionary: WORKS_DICTIONARY,
    groups: { q: complete },
    total: 0,
    count,
    countUnfiltered: count
  });
  return plan && plan.corrections.length > 0 ? plan : null;
}

async function revisePrefixQuery(query) {
  const terms = splitTerms(query);
  if (terms.length === 0) return null;
  const lastForm = spelling.correctableForm(terms[terms.length - 1]);
  const lastIsPrefix = !lastForm || await prefixExists(lastForm);

  let tail = lastIsPrefix ? terms.slice(-1) : [];
  let plan = terms.length > tail.length ? await planPrefixRevision(terms.slice(0, terms.length - tail.length)) : null;
  if (!plan && lastForm && lastIsPrefix && !(await prefixMatchesInContext(terms))) {
    tail = [];
    plan = await planPrefixRevision(terms);
  }
  if (!plan) return null;

  const revisedTerms = [...plan.groups.q, ...tail];
  return {
    query: revisedTerms.join(' '),
    revision: spelling.formatQueryRevision({
      status: 'corrected',
      applied: true,
      originalGroups: { q: terms },
      revisedGroups: { q: revisedTerms },
      corrections: plan.corrections,
      dropped: [],
      originalTotal: 0,
      revisedTotal: plan.total,
      revisedTotalExact: plan.exact
    })
  };
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
  buildWorksMatch,
  buildPrefixMatch,
  searchWorkIds,
  searchPersonIds,
  fetchWorkIdsForFilters,
  fetchWorkIdsForPrefix,
  revisePrefixQuery,
  healthcheck,
  BACKEND
};
