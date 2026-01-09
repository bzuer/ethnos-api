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

function formatSignatureListItem(row = {}) {
  return {
    id: toOptionalInteger(row.id),
    signature: row.signature || null,
    created_at: row.created_at || null,
    persons_count: toOptionalInteger(row.persons_count)
  };
}

function formatSignatureDetails(row = {}) {
  return formatSignatureListItem(row);
}

function formatSignatureWork(row = {}) {
  return {
    id: toOptionalInteger(row.id),
    title: row.title || null,
    subtitle: row.subtitle || null,
    type: row.type || row.work_type || null,
    language: row.language || null,
    doi: row.doi || null,
    open_access: toOptionalBoolean(row.open_access),
    authorship: row.authorship || null,
    publication: row.publication || null,
    authors: row.authors || null,
    created_at: row.created_at || null
  };
}

module.exports = {
  formatSignatureListItem,
  formatSignatureDetails,
  formatSignatureWork
};
