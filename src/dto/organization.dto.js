function toOptionalInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
}

function toOptionalFloat(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeType(value) {
  const str = normalizeString(value);
  return str ? str.toUpperCase() : null;
}

function parseJsonArray(value) {
  if (value === null || value === undefined || value === '') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map(normalizeString).filter(Boolean);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(normalizeString).filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

function toBoolean(value) {
  return value === 1 || value === true || value === '1';
}

function normalizeLocation(row = {}) {
  const country = normalizeString(row.country_code || row.country);
  const city = normalizeString(row.city);
  if (!country && !city) {
    return null;
  }
  return { country_code: country, city };
}

function normalizeIdentifiers(row = {}) {
  return {
    ror_id: normalizeString(row.ror_id),
    grid_id: normalizeString(row.grid_id),
    wikidata_id: normalizeString(row.wikidata_id),
    openalex_id: normalizeString(row.openalex_id),
    url: normalizeString(row.url)
  };
}

function formatMetrics(row = {}) {
  const works = toOptionalInteger(row.publication_count ?? row.works_count) || 0;
  const oa = toOptionalInteger(row.open_access_works_count);
  const openAccessPercentage = works > 0 && oa !== null
    ? Math.round((oa / works) * 1000) / 10
    : null;

  return {
    works_count: works,
    researchers_count: toOptionalInteger(row.researcher_count ?? row.researchers_count) || 0,
    total_citations: toOptionalInteger(row.total_citations) || 0,
    open_access_works_count: oa === null ? 0 : oa,
    open_access_percentage: openAccessPercentage,
    h_index: toOptionalInteger(row.h_index),
    i10_index: toOptionalInteger(row.i10_index),
    two_yr_mean_citedness: toOptionalFloat(row['2yr_mean_citedness'] ?? row.two_yr_mean_citedness)
  };
}

function buildSelfLink(id) {
  const numericId = toOptionalInteger(id);
  return numericId === null ? null : `/institutions/${numericId}`;
}

function formatOrganizationListItem(row = {}) {
  const id = toOptionalInteger(row.id);
  const item = {
    id,
    name: normalizeString(row.name),
    type: normalizeType(row.type),
    openalex_type: normalizeString(row.openalex_type),
    status: normalizeString(row.status),
    acronyms: parseJsonArray(row.acronyms),
    location: normalizeLocation(row),
    identifiers: normalizeIdentifiers(row),
    metrics: formatMetrics(row),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    _links: { self: buildSelfLink(id) }
  };

  if (row.relevance !== undefined && row.relevance !== null) {
    item.relevance = toOptionalFloat(row.relevance);
  }

  return item;
}

function formatRelatedOrganization(row = {}) {
  return {
    id: toOptionalInteger(row.id),
    name: normalizeString(row.name),
    type: normalizeType(row.type),
    country_code: normalizeString(row.country_code),
    _links: { self: buildSelfLink(row.id) }
  };
}

function formatRelationships(raw = {}) {
  const mapList = (items) => (Array.isArray(items) ? items.map(formatRelatedOrganization) : []);
  const parents = mapList(raw.parents);
  const children = mapList(raw.children);
  const related = mapList(raw.related);
  return {
    parents,
    children,
    related,
    parents_count: parents.length,
    children_count: children.length,
    related_count: related.length
  };
}

function formatAffiliatedWork(work = {}) {
  const year = toOptionalInteger(work.year ?? work.publication_year);
  const venue = work.venue_name || work.venue_id
    ? {
        id: toOptionalInteger(work.venue_id),
        name: normalizeString(work.venue_name),
        abbreviated_name: normalizeString(work.venue_abbreviated_name),
        type: normalizeType(work.venue_type)
      }
    : null;

  const authorNames = Array.isArray(work.author_names) ? work.author_names.filter(Boolean) : [];

  return {
    id: toOptionalInteger(work.id),
    title: normalizeString(work.title),
    subtitle: normalizeString(work.subtitle),
    type: normalizeType(work.work_type || work.type),
    language: normalizeString(work.language),
    doi: normalizeString(work.doi),
    publication_year: year,
    open_access: toBoolean(work.open_access),
    peer_reviewed: toBoolean(work.peer_reviewed),
    cited_by_count: toOptionalInteger(work.citation_count ?? work.work_citation_count) || 0,
    references_count: toOptionalInteger(work.reference_count ?? work.work_reference_count) || 0,
    publication: {
      id: toOptionalInteger(work.publication_id),
      year,
      doi: normalizeString(work.doi),
      volume: normalizeString(work.volume),
      issue: normalizeString(work.issue),
      pages: normalizeString(work.pages),
      open_access: toBoolean(work.open_access),
      peer_reviewed: toBoolean(work.peer_reviewed)
    },
    venue,
    authors: {
      total_count: toOptionalInteger(work.author_count ?? work.total_authors) || authorNames.length,
      author_string: authorNames.length ? authorNames.join('; ') : null,
      authors_preview: authorNames.slice(0, 3)
    },
    grant_number: work.grant_number !== undefined ? normalizeString(work.grant_number) : undefined,
    _links: { self: toOptionalInteger(work.id) === null ? null : `/works/${toOptionalInteger(work.id)}` }
  };
}

function formatOrganizationDetails(org = {}) {
  const id = toOptionalInteger(org.id);

  return {
    id,
    name: normalizeString(org.name),
    type: normalizeType(org.type),
    openalex_type: normalizeString(org.openalex_type),
    status: normalizeString(org.status),
    location: normalizeLocation(org),
    names: {
      acronyms: parseJsonArray(org.acronyms),
      alternative_names: parseJsonArray(org.alternative_names)
    },
    identifiers: normalizeIdentifiers(org),
    metrics: formatMetrics(org),
    relationships: formatRelationships(org.relationships || {}),
    created_at: org.created_at || null,
    updated_at: org.updated_at || null,
    _links: {
      self: buildSelfLink(id),
      works: id === null ? null : `/institutions/${id}/works`,
      funded_works: id === null ? null : `/institutions/${id}/funded-works`
    }
  };
}

module.exports = {
  formatOrganizationListItem,
  formatOrganizationDetails,
  formatAffiliatedWork,
  formatRelatedOrganization
};
