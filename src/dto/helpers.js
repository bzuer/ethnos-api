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
    openalex_id: raw.openalex_id || null,
    mag_id: raw.mag_id || null
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

module.exports = {
  toOptionalBoolean,
  toOptionalInteger,
  normalizeType,
  normalizeVenue,
  parseJsonColumn
};
