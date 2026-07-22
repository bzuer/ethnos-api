const {
  toOptionalBoolean,
  toOptionalInteger,
  normalizeType,
  normalizeVenue
} = require('./helpers');

function ensureAuthorsPreview(row = {}) {
  if (Array.isArray(row.authors_preview)) {
    return row.authors_preview.map(author => (author ? String(author).trim() : '')).filter(Boolean);
  }

  if (typeof row.author_string === 'string' && row.author_string.trim()) {
    return row.author_string
      .split(';')
      .map(author => author.trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  return [];
}

function formatWorkListItem(row = {}) {
  const authorsPreview = ensureAuthorsPreview(row);
  const authorCountSource =
    row.author_count !== undefined && row.author_count !== null
      ? toOptionalInteger(row.author_count)
      : Array.isArray(row.authors)
        ? row.authors.length
        : authorsPreview.length;

  const publicationYear = toOptionalInteger(row.publication_year);
  const venue = normalizeVenue(row.venue || {
    name: row.venue_name,
    abbreviated_name: row.venue_abbreviated_name || row.venue_abbrev || null,
    type: row.venue_type
  });

  const citedByCount =
    row.cited_by_count !== undefined && row.cited_by_count !== null
      ? toOptionalInteger(row.cited_by_count)
      : toOptionalInteger(row.citation_count);
  const referencesCount =
    row.references_count !== undefined && row.references_count !== null
      ? toOptionalInteger(row.references_count)
      : toOptionalInteger(row.reference_count);

  return {
    id: toOptionalInteger(row.id),
    publication_id: toOptionalInteger(row.publication_id),
    publications_count: toOptionalInteger(row.publications_count),
    title: row.title || null,
    subtitle: row.subtitle || null,
    abstract: row.abstract || null,
    type: normalizeType(row.type || row.work_type),
    language: row.language || null,
    publication_year: publicationYear,
    doi: row.doi || null,
    open_access: toOptionalBoolean(row.open_access),
    peer_reviewed: toOptionalBoolean(row.peer_reviewed),
    venue,
    authors_preview: authorsPreview,
    author_count: authorCountSource,
    first_author: row.first_author || (authorsPreview.length > 0 ? authorsPreview[0] : null),
    first_author_id: toOptionalInteger(row.first_author_id),
    first_author_identifiers: row.first_author_identifiers || null,
    cited_by_count: citedByCount !== null ? citedByCount : 0,
    references_count: referencesCount !== null ? referencesCount : 0,
    added_to_database: row.added_to_database || row.created_at || null,
    data_source: row.data_source || null,
    search_engine: row.search_engine || null,
    _links: { self: toOptionalInteger(row.id) === null ? null : `/works/${toOptionalInteger(row.id)}` }
  };
}

function formatWorkDetails(work = {}) {
  const publications = Array.isArray(work.publications)
    ? work.publications
    : [];

  const authors = Array.isArray(work.authors)
    ? work.authors.map(author => {
        const preferredName =
          author.preferred_name ||
          author.name ||
          [author.given_names, author.family_name]
            .filter(Boolean)
            .map(part => part.trim())
            .filter(Boolean)
            .join(' ') ||
          null;

        const affiliation =
          author.affiliation && author.affiliation.name
            ? {
                id: author.affiliation.id || null,
                name: author.affiliation.name,
                type: author.affiliation.type ? normalizeType(author.affiliation.type) : null,
                country: author.affiliation.country || null,
                _links: { self: author.affiliation.id ? `/institutions/${author.affiliation.id}` : null }
              }
            : null;

        const identifiers = author.identifiers && typeof author.identifiers === 'object'
          ? author.identifiers
          : {
              orcid: author.orcid || null,
              scopus_id: author.scopus_id || null,
              lattes_id: author.lattes_id || null
            };

        return {
          person_id: author.person_id || null,
          preferred_name: preferredName,
          given_names: author.given_names || null,
          family_name: author.family_name || null,
          identifiers,
          role: author.role || 'AUTHOR',
          position: toOptionalInteger(author.position),
          is_corresponding: toOptionalBoolean(author.is_corresponding),
          affiliation
        };
      })
    : [];

  const subjects = Array.isArray(work.subjects)
    ? work.subjects.map(subject => ({
        subject_id: subject.subject_id || subject.id || null,
        term: subject.term || null,
        vocabulary: subject.vocabulary || 'KEYWORD',
        lang: subject.lang || null,
        relevance_score:
          subject.relevance_score === null || subject.relevance_score === undefined
            ? 1.0
            : Number(subject.relevance_score),
        assigned_by: subject.assigned_by || 'SYSTEM'
      }))
    : [];

  const citations = work.citations || {};
  const processedCitations = {
    cited_by: Array.isArray(citations.cited_by) && citations.cited_by.length > 0
      ? citations.cited_by.map(citation => ({
          work_id: toOptionalInteger(citation.work_id),
          title: citation.title || null,
          authors: citation.authors || null,
          publication_year: toOptionalInteger(citation.publication_year),
          venue_name: citation.venue_name || null,
          venue_abbreviated_name: citation.venue_abbreviated_name || citation.venue_abbrev || null,
          open_access: toOptionalBoolean(citation.open_access),
          citation_type: citation.citation_type || 'NEUTRAL',
          citation_status: citation.citation_status || null,
          citation_context: citation.citation_context || null
        }))
      : [],
    references: Array.isArray(citations.references) && citations.references.length > 0
      ? citations.references.map(ref => ({
          work_id: toOptionalInteger(ref.work_id),
          title: ref.title || null,
          authors: ref.authors || null,
          publication_year: toOptionalInteger(ref.publication_year),
          venue_name: ref.venue_name || null,
          venue_abbreviated_name: ref.venue_abbreviated_name || ref.venue_abbrev || null,
          doi: ref.doi || null,
          open_access: toOptionalBoolean(ref.open_access),
          citation_type: ref.citation_type || 'NEUTRAL',
          citation_context: ref.citation_context || null
        }))
      : [],
    unresolved_references: Array.isArray(citations.unresolved_references) && citations.unresolved_references.length > 0
      ? citations.unresolved_references.map(unres => ({
          cited_doi: unres.cited_doi || null,
          status: unres.status || 'PENDING',
          citation_type: unres.citation_type || 'NEUTRAL',
          created_at: unres.created_at || null,
          resolved_at: unres.resolved_at || null
        }))
      : []
  };
  processedCitations.unsolved = processedCitations.unresolved_references;

  const funding = Array.isArray(work.funding)
    ? work.funding.map(item => ({
        funder_id: item.funder_id || null,
        funder_name: item.funder_name || null,
        grant_number: item.grant_number || null
      }))
    : [];

  const identifiers = work.identifiers && typeof work.identifiers === 'object'
    ? Object.keys(work.identifiers).reduce((acc, key) => {
        const values = work.identifiers[key];
        if (Array.isArray(values) && values.length > 0) {
          acc[key] = Array.from(new Set(values.map(value => (value ? String(value).trim() : null)).filter(Boolean)));
        }
        return acc;
      }, {})
    : {};

  const metricsSource = work.metrics && typeof work.metrics === 'object' ? work.metrics : {};
  const metrics = {
    citation_count: toOptionalInteger(metricsSource.citation_count) || 0,
    reference_count: toOptionalInteger(metricsSource.reference_count) || 0,
    download_count: toOptionalInteger(metricsSource.download_count),
    view_count: toOptionalInteger(metricsSource.view_count),
    altmetric_score:
      metricsSource.altmetric_score === null || metricsSource.altmetric_score === undefined
        ? null
        : Number(metricsSource.altmetric_score),
    social_media_mentions: toOptionalInteger(metricsSource.social_media_mentions),
    news_mentions: toOptionalInteger(metricsSource.news_mentions),
    publications_count: toOptionalInteger(metricsSource.publications_count),
    publications_with_files_count: toOptionalInteger(metricsSource.publications_with_files_count),
    publications_open_access_count: toOptionalInteger(metricsSource.publications_open_access_count),
    publications_peer_reviewed_count: toOptionalInteger(metricsSource.publications_peer_reviewed_count),
    distinct_venues_count: toOptionalInteger(metricsSource.distinct_venues_count),
    total_files_count: toOptionalInteger(metricsSource.total_files_count),
    total_files_download_count: toOptionalInteger(metricsSource.total_files_download_count),
    metrics_last_updated: metricsSource.metrics_last_updated || null
  };

  const publicationsTotal = work.publications_total !== undefined && work.publications_total !== null
    ? toOptionalInteger(work.publications_total)
    : publications.length;
  const publicationsHasMore = work.publications_has_more === true;

  const venuesList = Array.isArray(work.venues)
    ? work.venues.map(entry => ({
        id: toOptionalInteger(entry.id),
        name: entry.name || null,
        abbreviated_name: entry.abbreviated_name || null,
        type: entry.type ? normalizeType(entry.type) : null,
        issn: entry.issn || null,
        eissn: entry.eissn || null,
        scopus_id: entry.scopus_id || null,
        wikidata_id: entry.wikidata_id || null,
        openalex_id: entry.openalex_id || null,
        publication_count: toOptionalInteger(entry.publication_count) || 0,
        latest_year: toOptionalInteger(entry.latest_year)
      }))
    : [];

  const filesList = Array.isArray(work.files)
    ? work.files.map(file => ({
        file_id: toOptionalInteger(file.file_id),
        publication_id: toOptionalInteger(file.publication_id),
        md5: file.md5 || null,
        format: normalizeType(file.format),
        size: file.size === null || file.size === undefined ? null : Number(file.size),
        pages: toOptionalInteger(file.pages),
        language: file.language || null,
        version: file.version || null,
        role: normalizeType(file.role) || 'MAIN',
        libgen_id: toOptionalInteger(file.libgen_id),
        scimag_id: toOptionalInteger(file.scimag_id),
        openacess_id: file.openacess_id || null,
        best_oa_url: file.best_oa_url || null,
        verification: normalizeType(file.verification),
        download_count: toOptionalInteger(file.download_count) || 0
      }))
    : [];

  const fileSummary = work.file_summary && typeof work.file_summary === 'object'
    ? {
        files_returned: toOptionalInteger(work.file_summary.files_returned) || 0,
        files_total: toOptionalInteger(work.file_summary.files_total) || 0,
        files_truncated: work.file_summary.files_truncated === true,
        publications_with_files: toOptionalInteger(work.file_summary.publications_with_files) || 0,
        total_download_count: toOptionalInteger(work.file_summary.total_download_count) || 0,
        best_oa_url: work.file_summary.best_oa_url || null,
        by_format: (work.file_summary.by_format && typeof work.file_summary.by_format === 'object') ? work.file_summary.by_format : {},
        by_role: (work.file_summary.by_role && typeof work.file_summary.by_role === 'object') ? work.file_summary.by_role : {},
        has_scimag: work.file_summary.has_scimag === true,
        has_libgen: work.file_summary.has_libgen === true,
        has_open_access: work.file_summary.has_open_access === true
      }
    : null;

  const yearRange = work.year_range && typeof work.year_range === 'object'
    ? {
        earliest: toOptionalInteger(work.year_range.earliest),
        latest: toOptionalInteger(work.year_range.latest)
      }
    : { earliest: null, latest: null };

  const primaryPublication = work.primary_publication && typeof work.primary_publication === 'object'
    ? work.primary_publication
    : null;

  const languages = Array.isArray(work.languages)
    ? Array.from(new Set(work.languages.filter(Boolean)))
    : [];

  return {
    id: toOptionalInteger(work.id),
    _links: { self: toOptionalInteger(work.id) === null ? null : `/works/${toOptionalInteger(work.id)}` },
    title: work.title || null,
    subtitle: work.subtitle || null,
    abstract: work.abstract || null,
    type: normalizeType(work.type || work.work_type),
    language: work.language || null,
    publication_year: toOptionalInteger(work.publication_year),
    doi: work.doi || null,
    open_access: toOptionalBoolean(work.open_access),
    peer_reviewed: toOptionalBoolean(work.peer_reviewed),
    has_files: toOptionalBoolean(work.has_files),
    venue: work.venue || null,
    year_range: yearRange,
    languages,
    summary_updated_at: work.summary_updated_at || null,

    primary_publication_id: toOptionalInteger(work.primary_publication_id),
    primary_publication: primaryPublication,

    files: filesList,
    file_summary: fileSummary,
    venues: venuesList,

    publications,
    publications_total: publicationsTotal,
    publications_has_more: publicationsHasMore,
    identifiers,
    authors,
    subjects,
    citations: processedCitations,
    metrics,
    funding,
    created_at: work.created_at || null,
    updated_at: work.updated_at || null
  };
}

module.exports = {
  formatWorkListItem,
  formatWorkDetails,
  toOptionalBoolean,
  toOptionalInteger,
  normalizeType,
  normalizeVenue
};
