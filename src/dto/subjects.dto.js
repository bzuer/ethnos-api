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

function formatSubjectListItem(row = {}) {
  return {
    id: toOptionalInteger(row.id),
    term: row.term || null,
    vocabulary: row.vocabulary || null,
    parent_id: row.parent_id === null ? null : toOptionalInteger(row.parent_id),
    created_at: row.created_at || null,
    works_count: toOptionalInteger(row.works_count) || 0,
    courses_count: toOptionalInteger(row.courses_count) || 0,
    children_count: toOptionalInteger(row.children_count) || 0,
    parent_term: row.parent_term || null
  };
}

function formatSubjectDetails(row = {}) {
  return {
    id: toOptionalInteger(row.id),
    term: row.term || null,
    vocabulary: row.vocabulary || null,
    parent_id: row.parent_id === null ? null : toOptionalInteger(row.parent_id),
    created_at: row.created_at || null,
    works_count: toOptionalInteger(row.works_count) || 0,
    courses_count: toOptionalInteger(row.courses_count) || 0,
    children_count: toOptionalInteger(row.children_count) || 0,
    parent_term: row.parent_term || null,
    parent_vocabulary: row.parent_vocabulary || null,
    avg_relevance_score: row.avg_relevance_score === null || row.avg_relevance_score === undefined
      ? null
      : Number(row.avg_relevance_score)
  };
}

function formatSubjectWork(row = {}) {
  return {
    id: toOptionalInteger(row.id),
    title: row.title || null,
    publication_year: toOptionalInteger(row.publication_year),
    language: row.language || null,
    document_type: row.document_type || null,
    open_access: toOptionalBoolean(row.open_access),
    relevance_score: row.relevance_score === null || row.relevance_score === undefined
      ? null
      : Number(row.relevance_score),
    assigned_by: row.assigned_by || null,
    used_in_courses: toOptionalInteger(row.used_in_courses) || 0
  };
}

function formatSubjectCourse(row = {}) {
  return {
    id: toOptionalInteger(row.id),
    program_id: toOptionalInteger(row.program_id),
    code: row.code || null,
    name: row.name || null,
    credits: row.credits || null,
    semester: row.semester || null,
    year: toOptionalInteger(row.year),
    reading_type: row.reading_type || null,
    works_with_subject: toOptionalInteger(row.works_with_subject) || 0,
    instructor_count: toOptionalInteger(row.instructor_count) || 0
  };
}

module.exports = {
  formatSubjectListItem,
  formatSubjectDetails,
  formatSubjectWork,
  formatSubjectCourse
};
