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

function formatBibliographyItem(row = {}) {
  return {
    course_id: toOptionalInteger(row.course_id),
    work_id: toOptionalInteger(row.work_id),
    reading_type: row.reading_type || null,
    week_number: toOptionalInteger(row.week_number),
    notes: row.notes || null,
    course_code: row.course_code || null,
    course_name: row.course_name || null,
    course_year: toOptionalInteger(row.course_year),
    semester: row.semester || null,
    program_id: toOptionalInteger(row.program_id),
    title: row.title || null,
    publication_year: toOptionalInteger(row.publication_year),
    open_access: toOptionalBoolean(row.open_access),
    language: row.language || null,
    document_type: row.document_type || null,
    author_count: toOptionalInteger(row.author_count),
    first_author_name: row.first_author_name || null,
    instructors: row.instructors || null,
    authors: Array.isArray(row.authors) ? row.authors : []
  };
}

function formatBibliographyCourseUsage(row = {}) {
  return {
    course_id: toOptionalInteger(row.course_id),
    reading_type: row.reading_type || null,
    week_number: toOptionalInteger(row.week_number),
    notes: row.notes || null,
    course_code: row.course_code || null,
    course_name: row.course_name || null,
    course_year: toOptionalInteger(row.course_year),
    semester: row.semester || null,
    program_id: toOptionalInteger(row.program_id),
    instructor_count: toOptionalInteger(row.instructor_count),
    instructors: row.instructors || null
  };
}

module.exports = {
  formatBibliographyItem,
  formatBibliographyCourseUsage
};
