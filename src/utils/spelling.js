const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const MIN_CORRECTABLE_LENGTH = 4;
const SECOND_EDIT_MIN_LENGTH = 6;
const WILDCARD_PREFIX_LENGTH = 4;
const EDIT_COST = Math.log(20);
const MAX_CANDIDATES_PER_TERM = 3;
const MIN_CANDIDATE_DOCS = 3;

const isAutocorrectEnabled = (value) => value !== false && !['0', 'false'].includes(String(value ?? '').trim().toLowerCase());

const foldTerm = (term) => String(term ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const correctableForm = (term) => {
  const folded = foldTerm(term);
  return folded.length >= MIN_CORRECTABLE_LENGTH && /^[a-z]+$/.test(folded) ? folded : null;
};

const statForm = (term) => {
  const folded = foldTerm(term);
  return /^[a-z0-9]{2,}$/.test(folded) ? folded : null;
};

const maxEditDistance = (term) => (term.length >= SECOND_EDIT_MIN_LENGTH ? 2 : 1);

const editsOne = (term) => {
  const variants = new Set();
  for (let i = 0; i <= term.length; i += 1) {
    const head = term.slice(0, i);
    const tail = term.slice(i);
    if (tail) variants.add(head + tail.slice(1));
    if (tail.length > 1) variants.add(head + tail[1] + tail[0] + tail.slice(2));
    for (const letter of ALPHABET) {
      if (tail) variants.add(head + letter + tail.slice(1));
      variants.add(head + letter + tail);
    }
  }
  variants.delete(term);
  return [...variants].filter((variant) => variant.length >= 2);
};

const wildcardSeeds = (term) => {
  if (term.length < SECOND_EDIT_MIN_LENGTH) return [];
  const seeds = new Set([term.slice(0, WILDCARD_PREFIX_LENGTH)]);
  for (const variant of editsOne(term)) {
    if (variant.length >= WILDCARD_PREFIX_LENGTH) seeds.add(variant.slice(0, WILDCARD_PREFIX_LENGTH));
  }
  return [...seeds];
};

const editDistance = (a, b) => {
  let before = null;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, before[j - 2] + 1);
      }
      current.push(value);
    }
    before = previous;
    previous = current;
  }
  return previous[b.length];
};

const priorScore = (docs, distance) => Math.log(Math.max(Number(docs) || 0, 1)) - EDIT_COST * distance;

const contextScore = (total, weight, distance) => Math.log(1 + (Number(total) || 0) + (Number(weight) || 0)) - EDIT_COST * distance;

const byScore = (x, y) => y.score - x.score || x.word.localeCompare(y.word);

const rankCandidates = (term, docsByWord, termDocs = 0, { contextLimit = 0 } = {}) => {
  const known = termDocs > 0;
  const limit = known ? 1 : maxEditDistance(term);
  const floor = known ? priorScore(termDocs, 0) : -Infinity;
  const likely = [];
  const contextOnly = [];
  for (const [word, docs] of docsByWord) {
    if (!(docs > 0) || word === term || Math.abs(word.length - term.length) > limit) continue;
    const distance = editDistance(term, word);
    if (distance === 0 || distance > limit) continue;
    const candidate = { word, docs, distance, score: priorScore(docs, distance) };
    if (candidate.score > floor && docs >= MIN_CANDIDATE_DOCS) likely.push(candidate);
    else if (known && contextLimit > 0) contextOnly.push(candidate);
  }
  return [
    ...likely.sort(byScore).slice(0, MAX_CANDIDATES_PER_TERM),
    ...contextOnly.sort(byScore).slice(0, contextLimit)
  ];
};

const changedChoices = (rewrite) => rewrite.choices.filter((choice) => choice.word !== choice.term).length;

const enumerateRewrites = (optionSlots, limit) => {
  let rewrites = [{ choices: [], distance: 0, score: 0 }];
  for (const { options } of optionSlots) {
    const next = [];
    for (const rewrite of rewrites) {
      for (const option of options) {
        next.push({
          choices: [...rewrite.choices, option],
          distance: rewrite.distance + option.distance,
          score: rewrite.score + option.score
        });
      }
    }
    rewrites = next;
  }
  return rewrites
    .map((rewrite) => ({ ...rewrite, changes: changedChoices(rewrite) }))
    .filter((rewrite) => rewrite.changes > 0)
    .sort((x, y) => x.changes - y.changes || y.score - x.score || x.distance - y.distance)
    .slice(0, limit);
};

const joinGroups = (groups) => Object.fromEntries(
  Object.entries(groups)
    .filter(([, terms]) => terms.length > 0)
    .map(([parameter, terms]) => [parameter, terms.join(' ')])
);

const formatQueryRevision = ({
  status,
  applied,
  originalGroups,
  revisedGroups,
  corrections,
  dropped,
  originalTotal,
  revisedTotal,
  revisedTotalExact
}) => ({
  status,
  applied,
  original: joinGroups(originalGroups),
  revised: joinGroups(revisedGroups),
  corrections: corrections.map(({ parameter, term, replacement, distance }) => ({
    parameter,
    term,
    replacement,
    edit_distance: distance
  })),
  dropped_terms: dropped.map(({ parameter, term }) => ({ parameter, term })),
  original_total: originalTotal,
  revised_total: revisedTotal,
  revised_total_exact: revisedTotalExact
});

module.exports = {
  isAutocorrectEnabled,
  EDIT_COST,
  MAX_CANDIDATES_PER_TERM,
  MIN_CANDIDATE_DOCS,
  foldTerm,
  correctableForm,
  statForm,
  maxEditDistance,
  editsOne,
  wildcardSeeds,
  editDistance,
  priorScore,
  contextScore,
  rankCandidates,
  enumerateRewrites,
  formatQueryRevision
};
