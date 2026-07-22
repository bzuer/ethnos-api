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

function formatCitationWork(row = {}) {
  return {
    citing_work_id: toOptionalInteger(row.citing_work_id),
    cited_work_id: toOptionalInteger(row.cited_work_id),
    title: row.title || null,
    type: row.type || null,
    publication_year: toOptionalInteger(row.year),
    venue_name: row.venue_name || null,
    venue_abbreviated_name: row.venue_abbreviated_name || row.venue_abbrev || null,
    doi: row.doi || null,
    authors_count: toOptionalInteger(row.authors_count) || 0,
    citation: row.citation || null
  };
}

module.exports = {
  formatCitationWork
};
