const toNullableNumber = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const toNullableInt = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const toInteger = (value, fallback = 0) => {
  if (value === null || value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toNullableBoolean = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const n = value.trim().toLowerCase();
    if (n === 'true' || n === '1') return true;
    if (n === 'false' || n === '0') return false;
  }
  return null;
};

const SCORE_COMPONENT_KEYS = ['subject', 'oa', 'impact', 'llm'];

const buildRanking = (venue = {}) => {
  const source = venue.score_breakdown && typeof venue.score_breakdown === 'object' ? venue.score_breakdown : null;
  const score = toNullableNumber(source?.total ?? venue.global_ranking_score);

  const components = {};
  for (const key of SCORE_COMPONENT_KEYS) {
    components[key] = toNullableNumber(source?.[key]);
  }

  const llmRelevance = source?.llm_relevance ?? venue.llm_relevance ?? null;
  const llmJustification = source?.llm_justification ?? venue.llm_justification ?? null;

  return {
    score,
    components,
    llm: {
      relevance: llmRelevance !== null && llmRelevance !== undefined ? toNullableInt(llmRelevance) : null,
      justification: llmJustification || null
    }
  };
};

const buildIdentifiers = (venue = {}) => ({
  issn: venue.issn || null,
  eissn: venue.eissn || null,
  scopus_id: venue.scopus_id || null,
  wikidata_id: venue.wikidata_id || null,
  openalex_id: venue.openalex_id || null,
  scielo_id: venue.scielo_id || null
});

const buildIndexing = (venue = {}) => ({
  is_in_doaj: toNullableBoolean(venue.is_in_doaj),
  is_in_scielo: toNullableBoolean(venue.is_in_scielo),
  is_indexed_in_scopus: toNullableBoolean(venue.is_indexed_in_scopus),
  validation_status: venue.validation_status || null
});

const buildMetrics = (venue = {}) => ({
  impact_factor: toNullableNumber(venue.impact_factor),
  citescore: toNullableNumber(venue.citescore),
  sjr: toNullableNumber(venue.sjr),
  snip: toNullableNumber(venue.snip),
  h_index: toNullableInt(venue.h_index),
  i10_index: toNullableInt(venue.i10_index),
  two_yr_mean_citedness: toNullableNumber(venue.two_yr_mean_citedness)
});

const buildPublisher = (venue = {}) => {
  const publisher = venue.publisher || {};
  const hasData = publisher && (publisher.id || publisher.name);
  if (!hasData) return null;
  return {
    id: publisher.id ?? null,
    name: publisher.name || null,
    type: publisher.type || null,
    country_code: publisher.country_code || null
  };
};

const mapSubject = (subject = {}) => ({
  subject_id: subject?.subject_id ?? null,
  term: subject?.term || null,
  score: toNullableNumber(subject?.score),
  vocabulary: subject?.vocabulary || null,
  lang: subject?.lang || null
});

const buildSubjects = (subjects = [], options = {}) => {
  if (!Array.isArray(subjects) || subjects.length === 0) return [];
  const limit = Number.isInteger(options.limit) ? options.limit : undefined;
  const slice = limit !== undefined ? subjects.slice(0, limit) : subjects.slice();
  return slice
    .map(mapSubject)
    .filter((s) => s.subject_id !== null || s.term !== null);
};

const baseVenue = (venue = {}) => ({
  id: toNullableInt(venue.id),
  _links: { self: toNullableInt(venue.id) === null ? null : `/venues/${toNullableInt(venue.id)}` },
  name: venue.name || null,
  abbreviated_name: venue.abbreviated_name || null,
  type: venue.type || null,
  aggregation_type: venue.aggregation_type || null,
  country_code: venue.country_code || null,
  language: venue.language || null,
  homepage_url: venue.homepage_url || null,
  open_access: toNullableBoolean(venue.open_access),
  coverage_start_year: toNullableInt(venue.coverage_start_year),
  coverage_end_year: toNullableInt(venue.coverage_end_year),
  works_count: toInteger(venue.works_count, 0),
  cited_by_count: toInteger(venue.cited_by_count, 0),
  publisher: buildPublisher(venue),
  identifiers: buildIdentifiers(venue),
  indexing: buildIndexing(venue),
  metrics: buildMetrics(venue),
  ranking: buildRanking(venue)
});

function formatVenueListItem(venue = {}, options = {}) {
  const includeSubjects = options.includeSubjects !== false;
  const subjectsLimit = Number.isInteger(options.subjectsLimit) ? options.subjectsLimit : 5;

  const result = baseVenue(venue);

  if (includeSubjects) {
    result.subjects = buildSubjects(venue.subjects || [], { limit: subjectsLimit });
  }

  return result;
}

function formatVenueDetails(venue = {}, options = {}) {
  const detail = baseVenue(venue);

  detail.created_at = venue.created_at || null;
  detail.updated_at = venue.updated_at || null;
  detail.last_validated_at = venue.last_validated_at || null;
  detail.summary_updated_at = venue.summary_updated_at || null;

  const yearly = Array.isArray(venue.yearly_stats) ? venue.yearly_stats : [];
  const yearsWithWorks = yearly.filter((y) => (y.works_count || 0) > 0).map((y) => y.year).filter(Number.isFinite);
  const firstYear = venue.coverage_start_year ?? (yearsWithWorks.length ? Math.min(...yearsWithWorks) : null);
  const latestYear = venue.coverage_end_year ?? (yearsWithWorks.length ? Math.max(...yearsWithWorks) : null);

  const totalWorksFromYearly = yearly.reduce((sum, y) => sum + toInteger(y.works_count, 0), 0);
  const oaWorksFromYearly = yearly.reduce((sum, y) => sum + toInteger(y.oa_works_count, 0), 0);
  const openAccessPercentage = totalWorksFromYearly > 0
    ? Math.round((oaWorksFromYearly / totalWorksFromYearly) * 1000) / 10
    : null;

  detail.publication_summary = {
    first_publication_year: firstYear,
    latest_publication_year: latestYear,
    total_works_count: totalWorksFromYearly,
    open_access_works_count: oaWorksFromYearly,
    open_access_percentage: openAccessPercentage,
    publication_trend: yearly.map((y) => ({
      year: y.year,
      works_count: toInteger(y.works_count, 0),
      oa_works_count: toInteger(y.oa_works_count, 0)
    }))
  };

  if (options.includeSubjects) {
    detail.subjects = buildSubjects(venue.subjects || []);
  }

  if (options.includeYearlyStats) {
    detail.yearly_stats = yearly.map((y) => ({
      year: toNullableInt(y.year),
      works_count: toInteger(y.works_count, 0),
      oa_works_count: toInteger(y.oa_works_count, 0),
      cited_by_count: toInteger(y.cited_by_count, 0)
    }));
  }

  if (options.includeTopAuthors) {
    detail.top_authors = (venue.top_authors || []).map((author) => ({
      person_id: author.person_id ?? null,
      name: author.name || null,
      works_count: toInteger(author.works_count, 0),
      best_position: toNullableInt(author.best_position),
      is_corresponding: toNullableBoolean(author.is_corresponding)
    }));
  }

  if (Array.isArray(venue.top_publications) && venue.top_publications.length > 0) {
    detail.top_publications = venue.top_publications;
  }

  if (Array.isArray(options.recentWorks)) {
    detail.recent_works = options.recentWorks.map((w) => ({
      id: w.id,
      title: w.title,
      subtitle: w.subtitle ?? null,
      abstract: w.abstract ?? null,
      type: w.type,
      language: w.language ?? null,
      publication_year: toNullableInt(w.year),
      volume: w.volume ?? null,
      issue: w.issue ?? null,
      pages: w.pages ?? null,
      doi: w.doi ?? null,
      open_access: toNullableBoolean(w.open_access),
      peer_reviewed: toNullableBoolean(w.peer_reviewed),
      publication_date: w.publication_date ?? null,
      author_count: toInteger(w.author_count, 0),
      authors: Array.isArray(w.authors) ? w.authors.map((a) => ({
        person_id: a.person_id,
        name: a.name,
        role: a.role || 'AUTHOR',
        position: toInteger(a.position, 0),
        is_corresponding: toNullableBoolean(a.is_corresponding)
      })) : []
    }));
  }

  return detail;
}

module.exports = {
  formatVenueListItem,
  formatVenueDetails
};
