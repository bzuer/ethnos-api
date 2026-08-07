const {
  toOptionalBoolean,
  toOptionalInteger,
  normalizeType,
  normalizeVenue,
  parseJsonColumn,
  sortContributors,
  countDistinctContributors,
  pickPrimaryAuthor
} = require('./helpers');

function mapAuthors(value) {
  const authors = parseJsonColumn(value);
  if (!Array.isArray(authors)) {
    return [];
  }
  return sortContributors(authors.map(author => ({
    person_id: toOptionalInteger(author.id || author.person_id),
    preferred_name: author.name || author.preferred_name || null,
    role: normalizeType(author.role) || 'AUTHOR',
    position: toOptionalInteger(author.position),
    is_corresponding: toOptionalBoolean(author.is_corresponding)
  })));
}

function mapSubjects(value) {
  const subjects = parseJsonColumn(value);
  if (!Array.isArray(subjects)) {
    return [];
  }
  return subjects.map(subject => ({
    subject_id: toOptionalInteger(subject.id || subject.subject_id),
    term: subject.term || null,
    vocabulary: normalizeType(subject.vocabulary) || 'KEYWORD',
    lang: subject.lang || null
  }));
}

function mapFiles(value) {
  const files = parseJsonColumn(value);
  if (!Array.isArray(files)) {
    return [];
  }
  return files.map(file => ({
    file_id: toOptionalInteger(file.id || file.file_id),
    md5: file.md5 || null,
    format: normalizeType(file.format || file.file_format),
    size:
      file.size === null || file.size === undefined
        ? null
        : Number(file.size),
    pages: toOptionalInteger(file.pages),
    language: file.language || null,
    version: file.version || null,
    role: normalizeType(file.role || file.file_role) || 'MAIN',
    libgen_id: toOptionalInteger(file.libgen_id),
    scimag_id: toOptionalInteger(file.scimag_id),
    openacess_id: file.openacess_id || null,
    best_oa_url: file.best_oa_url || null,
    verification: normalizeType(file.verification || file.verification_status),
    download_count: toOptionalInteger(file.downloads || file.download_count) || 0
  }));
}

function pickVenue(row) {
  if (row.venue && typeof row.venue === 'object') {
    const fromEmbedded = normalizeVenue(row.venue);
    if (fromEmbedded) return fromEmbedded;
  }

  return normalizeVenue({
    id: row.venue_id,
    name: row.venue_name || row.venue_search || null,
    abbreviated_name:
      row.venue_abbreviated_name ||
      row.venue_abbrev ||
      row.abbrev_search ||
      null,
    type: row.venue_type,
    issn: row.issn,
    eissn: row.eissn,
    scopus_id: row.venue_scopus_id,
    wikidata_id: row.venue_wikidata_id,
    openalex_id: row.venue_openalex_id
  });
}

function pickPublisher(row) {
  if (row.publisher && typeof row.publisher === 'object') {
    const source = row.publisher;
    if (!source.name) return null;
    return {
      id: toOptionalInteger(source.id),
      name: source.name,
      type: normalizeType(source.type),
      country: source.country || source.country_code || null,
      ror_id: source.ror_id || null,
      wikidata_id: source.wikidata_id || null,
      openalex_id: source.openalex_id || null,
      url: source.url || null
    };
  }

  const name = row.publisher_name || row.publisher_search || null;
  if (!name) return null;
  return {
    id: toOptionalInteger(row.publisher_id),
    name,
    type: normalizeType(row.publisher_type),
    country: row.publisher_country || row.publisher_country_code || null,
    ror_id: row.publisher_ror_id || null,
    wikidata_id: row.publisher_wikidata_id || null,
    openalex_id: row.publisher_openalex_id || null,
    url: row.publisher_url || null
  };
}

function buildFirstAuthor(authors) {
  const first = pickPrimaryAuthor(authors);
  if (!first || !first.preferred_name) {
    return null;
  }
  return {
    person_id: first.person_id,
    name: first.preferred_name
  };
}

function publicationIdentifiers(row) {
  const parsed = parseJsonColumn(row.identifiers_json);
  const fromJson = parsed && typeof parsed === 'object' ? parsed : {};
  return {
    doi: row.doi || null,
    pmid: row.pmid ?? fromJson.pmid ?? null,
    pmcid: row.pmcid ?? fromJson.pmcid ?? null,
    arxiv: row.arxiv ?? fromJson.arxiv ?? null,
    wos_id: row.wos_id ?? fromJson.wos_id ?? null,
    handle: row.handle ?? fromJson.handle ?? null,
    wikidata_id: row.wikidata_id ?? fromJson.wikidata_id ?? null,
    openalex_id: row.openalex_id ?? fromJson.openalex_id ?? null,
    isbn: row.isbn ?? fromJson.isbn ?? null,
    openlibrary_id: row.openlibrary_id ?? fromJson.openlibrary_id ?? null,
    scielo_pid: row.scielo_pid ?? fromJson.scielo_pid ?? null,
    google_book_id: row.google_book_id ?? fromJson.google_book_id ?? null
  };
}

function formatPublicationListItem(row = {}) {
  const authors = mapAuthors(row.authors_json);
  return {
    id: toOptionalInteger(row.publication_id || row.id),
    work_id: toOptionalInteger(row.work_id),
    doi: row.doi || null,
    title: row.title || row.title_search || null,
    abstract: row.abstract || row.abstract_search || null,
    type: normalizeType(row.work_type || row.type),
    language: row.language || null,
    publication_year: toOptionalInteger(row.publication_year || row.year),
    publication_date: row.publication_date || null,
    volume: row.volume || null,
    issue: row.issue || null,
    pages: row.pages || row.pages_text || null,
    source: row.source || null,
    license_url: row.license_url || null,
    license_version: row.license_version || null,
    open_access: toOptionalBoolean(row.open_access),
    peer_reviewed: toOptionalBoolean(row.peer_reviewed),
    has_files: toOptionalBoolean(row.has_files),
    has_scimag_file: toOptionalBoolean(row.has_scimag_file),
    has_libgen_file: toOptionalBoolean(row.has_libgen_file),
    venue: pickVenue(row),
    publisher: pickPublisher(row),
    identifiers: publicationIdentifiers(row),
    first_author: buildFirstAuthor(authors),
    author_count: countDistinctContributors(authors),
    citation_count: toOptionalInteger(row.work_citation_count || row.citation_count) || 0,
    reference_count: toOptionalInteger(row.work_reference_count || row.reference_count) || 0,
    download_count: toOptionalInteger(row.publication_download_count || row.download_count) || 0
  };
}

function formatPublicationSibling(row = {}) {
  const id = toOptionalInteger(row.publication_id || row.id);
  return {
    id,
    doi: row.doi || null,
    publication_year: toOptionalInteger(row.publication_year || row.year),
    publication_date: row.publication_date || null,
    volume: row.volume || null,
    issue: row.issue || null,
    pages: row.pages || row.pages_text || null,
    open_access: toOptionalBoolean(row.open_access),
    peer_reviewed: toOptionalBoolean(row.peer_reviewed),
    has_files: toOptionalBoolean(row.has_files),
    venue: pickVenue(row),
    _links: id !== null ? { self: `/publications/${id}` } : null
  };
}

function formatPublicationDetails(row = {}, extras = {}) {
  const authors = mapAuthors(row.authors_json);
  const subjects = mapSubjects(row.subjects_json);
  const files = mapFiles(row.files_json);

  const work = {
    id: toOptionalInteger(row.work_id),
    title: row.title || row.title_search || null,
    subtitle: row.subtitle || null,
    abstract: row.abstract || row.abstract_search || null,
    type: normalizeType(row.work_type || row.type),
    language: row.language || null,
    citation_count: toOptionalInteger(row.work_citation_count) || 0,
    reference_count: toOptionalInteger(row.work_reference_count) || 0,
    authors,
    subjects
  };

  return {
    id: toOptionalInteger(row.publication_id || row.id),
    identifiers: publicationIdentifiers(row),
    publication_date: row.publication_date || null,
    publication_year: toOptionalInteger(row.publication_year || row.year),
    volume: row.volume || null,
    issue: row.issue || null,
    pages: row.pages || row.pages_text || null,
    language: row.language || null,
    open_access: toOptionalBoolean(row.open_access),
    peer_reviewed: toOptionalBoolean(row.peer_reviewed),
    has_files: toOptionalBoolean(row.has_files),
    has_scimag_file: toOptionalBoolean(row.has_scimag_file),
    has_libgen_file: toOptionalBoolean(row.has_libgen_file),
    download_count: toOptionalInteger(row.publication_download_count || row.download_count) || 0,
    license_url: row.license_url || null,
    license_version: row.license_version || null,
    source: row.source || null,
    source_indexed_at: row.source_indexed_at || null,
    venue: pickVenue(row),
    publisher: pickPublisher(row),
    files,
    work,
    siblings: Array.isArray(extras.siblings)
      ? extras.siblings.map(formatPublicationSibling)
      : [],
    citations: extras.citations || null,
    references: extras.references || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || row.summary_updated_at || null
  };
}

function formatPublicationEntry(row = {}) {
  const detail = formatPublicationDetails(row, {});
  delete detail.work;
  delete detail.siblings;
  delete detail.citations;
  delete detail.references;
  detail._links = detail.id !== null ? { self: `/publications/${detail.id}` } : null;
  return detail;
}

module.exports = {
  formatPublicationListItem,
  formatPublicationSibling,
  formatPublicationDetails,
  formatPublicationEntry
};
