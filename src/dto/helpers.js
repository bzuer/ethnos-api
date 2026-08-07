function toOptionalBoolean(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 0) return false;
    if (value === 1) return true;
    return value > 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (['1', 'true', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n'].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function toOptionalInteger(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
}

function normalizeType(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const str = String(value).trim();
  return str ? str.toUpperCase() : null;
}

function normalizeVenue(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const name = raw.name || raw.venue_name || raw.name_search || null;
  if (!name) {
    return null;
  }

  const abbreviatedName =
    raw.abbreviated_name ||
    raw.venue_abbreviated_name ||
    raw.venue_abbrev ||
    raw.abbrev_search ||
    null;

  return {
    id: toOptionalInteger(raw.id || raw.venue_id),
    name,
    abbreviated_name: abbreviatedName,
    type: normalizeType(raw.type || raw.venue_type),
    issn: raw.issn || null,
    eissn: raw.eissn || null,
    scopus_id: raw.scopus_id || null,
    wikidata_id: raw.wikidata_id || null,
    openalex_id: raw.openalex_id || null
  };
}

function parseJsonColumn(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object') {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    return null;
  }
}

function authorsFromJson(value) {
  const parsed = parseJsonColumn(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(author => {
      if (!author || typeof author !== 'object') return null;
      const name = author.name || author.preferred_name || null;
      return name ? String(name).trim() : null;
    })
    .filter(Boolean);
}

function subjectsFromJson(value) {
  const parsed = parseJsonColumn(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(subject => {
      if (!subject || typeof subject !== 'object') return null;
      const term = subject.term || null;
      if (!term) return null;
      return {
        subject_id: subject.id ?? subject.subject_id ?? null,
        term,
        vocabulary: subject.vocabulary || 'KEYWORD',
        lang: subject.lang || null
      };
    })
    .filter(Boolean);
}

const CONTRIBUTOR_ROLES = ['AUTHOR', 'EDITOR', 'TRANSLATOR', 'REVIEWER'];
const CONTRIBUTOR_ROLE_RANK = new Map(CONTRIBUTOR_ROLES.map((role, index) => [role, index]));
const UNKNOWN_ROLE_RANK = CONTRIBUTOR_ROLES.length;

function authorshipRoleOrderSql(alias = 'a') {
  const list = CONTRIBUTOR_ROLES.map(role => `'${role}'`).join(', ');
  return `COALESCE(NULLIF(FIELD(${alias}.role, ${list}), 0), ${UNKNOWN_ROLE_RANK + 1})`;
}

function contributorRoleRank(role) {
  const normalized = normalizeType(role);
  if (normalized !== null && CONTRIBUTOR_ROLE_RANK.has(normalized)) {
    return CONTRIBUTOR_ROLE_RANK.get(normalized);
  }
  return UNKNOWN_ROLE_RANK;
}

function contributorKey(contributor = {}) {
  const personId = toOptionalInteger(contributor.person_id);
  if (personId !== null) return `id:${personId}`;
  const name = contributor.preferred_name || contributor.name || '';
  const normalized = String(name).trim().toLowerCase();
  return normalized ? `name:${normalized}` : null;
}

function compareContributors(left = {}, right = {}) {
  const roleDelta = contributorRoleRank(left.role) - contributorRoleRank(right.role);
  if (roleDelta !== 0) return roleDelta;

  const leftPosition = toOptionalInteger(left.position);
  const rightPosition = toOptionalInteger(right.position);
  if (leftPosition !== rightPosition) {
    if (leftPosition === null) return 1;
    if (rightPosition === null) return -1;
    return leftPosition - rightPosition;
  }

  const leftId = toOptionalInteger(left.person_id);
  const rightId = toOptionalInteger(right.person_id);
  if (leftId === rightId) return 0;
  if (leftId === null) return 1;
  if (rightId === null) return -1;
  return leftId - rightId;
}

function sortContributors(contributors) {
  if (!Array.isArray(contributors)) return [];
  return contributors.slice().sort(compareContributors);
}

function dedupeContributorsByPerson(contributors) {
  if (!Array.isArray(contributors)) return [];
  const merged = new Map();
  for (const contributor of sortContributors(contributors)) {
    const key = contributorKey(contributor);
    if (key === null) continue;
    const existing = merged.get(key);
    const role = normalizeType(contributor.role) || 'AUTHOR';
    if (existing) {
      if (!existing.roles.includes(role)) existing.roles.push(role);
      existing.is_corresponding = existing.is_corresponding || contributor.is_corresponding === true;
      continue;
    }
    merged.set(key, {
      ...contributor,
      role,
      roles: [role],
      is_corresponding: contributor.is_corresponding === true
    });
  }
  return Array.from(merged.values());
}

function countDistinctContributors(contributors) {
  if (!Array.isArray(contributors)) return 0;
  const keys = new Set();
  for (const contributor of contributors) {
    const key = contributorKey(contributor);
    if (key !== null) keys.add(key);
  }
  return keys.size;
}

function contributorNames(contributors, limit = Infinity) {
  const names = dedupeContributorsByPerson(contributors)
    .map(contributor => {
      const name = contributor.preferred_name || contributor.name || '';
      return String(name).trim();
    })
    .filter(Boolean);
  return Number.isFinite(limit) ? names.slice(0, limit) : names;
}

function pickPrimaryAuthor(contributors) {
  const ordered = sortContributors(contributors);
  if (ordered.length === 0) return null;
  return ordered.find(contributor => contributorRoleRank(contributor.role) === 0) || ordered[0];
}

function summarizeContributorRoles(contributors) {
  const summary = Object.create(null);
  for (const contributor of Array.isArray(contributors) ? contributors : []) {
    const role = normalizeType(contributor.role) || 'AUTHOR';
    summary[role] = (summary[role] || 0) + 1;
  }
  return summary;
}

module.exports = {
  toOptionalBoolean,
  toOptionalInteger,
  normalizeType,
  normalizeVenue,
  parseJsonColumn,
  authorsFromJson,
  subjectsFromJson,
  CONTRIBUTOR_ROLES,
  authorshipRoleOrderSql,
  contributorRoleRank,
  compareContributors,
  sortContributors,
  dedupeContributorsByPerson,
  countDistinctContributors,
  contributorNames,
  pickPrimaryAuthor,
  summarizeContributorRoles
};
