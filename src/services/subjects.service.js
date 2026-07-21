const { pool } = require('../config/database');
const cache = require('./cache.service');
const { createPagination } = require('../utils/pagination');
const { withTimeout } = require('../utils/db');
const { formatSubjectListItem, formatSubjectDetails, formatSubjectWork, formatSubjectCourse } = require('../dto/subjects.dto');

class SubjectsService {
  
  async getSubjects(filters = {}) {
    const cacheKey = `subjects:list:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const {
      vocabulary,
      parent_id,
      search,
      has_children,
      limit = 50,
      offset = 0,
      light
    } = filters;

    const limitValue = Math.min(100, Number.parseInt(limit, 10) || 50);
    const offsetValue = Math.max(0, Number.parseInt(offset, 10) || 0);

    if (String(light || 'false').toLowerCase() === 'true') {
      const whereParts = [];
      const whereParams = [];
      if (vocabulary) { whereParts.push('s.vocabulary = ?'); whereParams.push(vocabulary); }
      if (parent_id !== undefined) {
        if (parent_id === null || parent_id === 'null') {
          whereParts.push('s.parent_id IS NULL');
        } else {
          whereParts.push('s.parent_id = ?');
          whereParams.push(parent_id);
        }
      }
      if (search) { whereParts.push('s.term LIKE ?'); whereParams.push(`%${search}%`); }
      const whereLite = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
      const liteQuery = `
        SELECT s.id, s.term, s.vocabulary, s.parent_id, s.created_at
        FROM subjects s
        ${whereLite}
        ORDER BY s.term ASC
        LIMIT ? OFFSET ?
      `;
      const liteParams = [...whereParams, Math.min(100, Number.parseInt(limit, 10) || 50), Math.max(0, Number.parseInt(offset, 10) || 0)];
      const [rows] = await pool.execute(liteQuery, liteParams);
      const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM subjects s ${whereLite}`, whereParams);
      const total = countRows?.[0]?.total ? Number.parseInt(countRows[0].total, 10) : 0;
      const result = {
        subjects: rows.map(formatSubjectListItem),
        pagination: {
          total,
          limit: liteParams[liteParams.length - 2],
          offset: liteParams[liteParams.length - 1],
          has_next: (liteParams[liteParams.length - 1] + liteParams[liteParams.length - 2]) < total
        }
      };
      await cache.set(cacheKey, result, 1800);
      return result;
    }

    const baseSelect = `
      SELECT
        s.id,
        s.term,
        s.vocabulary,
        s.parent_id,
        s.created_at,
        COALESCE(ws.works_count, 0) AS works_count,
        COALESCE(cb.courses_count, 0) AS courses_count,
        COALESCE(cc.children_count, 0) AS children_count,
        parent.term AS parent_term
      FROM subjects s
      LEFT JOIN (
        SELECT subject_id, COUNT(DISTINCT work_id) AS works_count
        FROM work_subjects
        GROUP BY subject_id
      ) ws ON s.id = ws.subject_id
      LEFT JOIN (
        SELECT ws.subject_id, COUNT(DISTINCT cb.course_id) AS courses_count
        FROM work_subjects ws
        LEFT JOIN course_bibliography cb ON ws.work_id = cb.work_id
        GROUP BY ws.subject_id
      ) cb ON s.id = cb.subject_id
      LEFT JOIN (
        SELECT parent_id, COUNT(*) AS children_count
        FROM subjects
        WHERE parent_id IS NOT NULL
        GROUP BY parent_id
      ) cc ON s.id = cc.parent_id
      LEFT JOIN subjects parent ON s.parent_id = parent.id
    `;

    const filtersClauses = [];
    const filterParams = [];

    if (vocabulary) {
      filtersClauses.push('s.vocabulary = ?');
      filterParams.push(vocabulary);
    }

    if (parent_id !== undefined) {
      if (parent_id === null || parent_id === 'null') {
        filtersClauses.push('s.parent_id IS NULL');
      } else {
        filtersClauses.push('s.parent_id = ?');
        filterParams.push(parent_id);
      }
    }

    if (search) {
      filtersClauses.push('s.term LIKE ?');
      filterParams.push(`%${search}%`);
    }

    if (has_children === 'true') {
      filtersClauses.push('COALESCE(cc.children_count, 0) > 0');
    } else if (has_children === 'false') {
      filtersClauses.push('COALESCE(cc.children_count, 0) = 0');
    }

    const whereClause = filtersClauses.length ? `WHERE ${filtersClauses.join(' AND ')}` : '';

    const subjectsQuery = `
      ${baseSelect}
      ${whereClause}
      ORDER BY works_count DESC, courses_count DESC, s.term
      LIMIT ? OFFSET ?
    `;

    const [subjects] = await pool.execute(subjectsQuery, [...filterParams, limitValue, offsetValue]);

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        ${baseSelect}
        ${whereClause}
      ) subjects_with_metrics
    `;

    const [countRows] = await pool.execute(countQuery, filterParams);
    const total = countRows[0]?.total ? Number.parseInt(countRows[0].total, 10) : 0;

    const result = {
      subjects: subjects.map(formatSubjectListItem),
      pagination: {
        total,
        limit: limitValue,
        offset: offsetValue,
        has_next: (offsetValue + limitValue) < total
      }
    };

    await cache.set(cacheKey, result, 1800);
    return result;
  }

  async getSubjectById(id) {
    const cacheKey = `subject:${id}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const query = `
      SELECT
        s.id,
        s.term,
        s.vocabulary,
        s.parent_id,
        s.created_at,
        COUNT(DISTINCT ws.work_id) as works_count,
        0 as courses_count,
        (SELECT COUNT(*) FROM subjects c WHERE c.parent_id = s.id) as children_count,
        parent.term as parent_term,
        parent.vocabulary as parent_vocabulary,
        AVG(ws.relevance_score) as avg_relevance_score
      FROM subjects s
      LEFT JOIN work_subjects ws ON s.id = ws.subject_id
      LEFT JOIN subjects parent ON s.parent_id = parent.id
      WHERE s.id = ?
      GROUP BY s.id, s.term, s.vocabulary, s.parent_id, s.created_at, parent.term, parent.vocabulary
    `;

    const [subjects] = await pool.query(withTimeout(query), [id]);
    if (!subjects.length) return null;

    const subject = formatSubjectDetails(subjects[0]);
    await cache.set(cacheKey, subject, 3600);
    return subject;
  }

  async getSubjectChildren(id, filters = {}) {
    const cacheKey = `subject:${id}:children:v2:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { limit = 50, offset = 0 } = filters;
    const lim = parseInt(limit, 10);
    const off = parseInt(offset, 10);

    const [childRows] = await pool.execute(
      `SELECT s.id, s.term, s.vocabulary, s.parent_id, s.created_at
       FROM subjects s
       WHERE s.parent_id = ?
       ORDER BY s.term ASC`,
      [id]
    );
    const total = childRows.length;

    const worksMap = Object.create(null);
    const childrenMap = Object.create(null);
    if (childRows.length) {
      const ids = childRows.map(r => r.id);
      const ph = ids.map(() => '?').join(',');
      const [wcRows, ccRows] = await Promise.all([
        pool.query(
          withTimeout(`SELECT subject_id, COUNT(DISTINCT work_id) AS works_count
                       FROM work_subjects WHERE subject_id IN (${ph}) GROUP BY subject_id`),
          ids
        ),
        pool.query(
          `SELECT parent_id, COUNT(*) AS children_count
           FROM subjects WHERE parent_id IN (${ph}) GROUP BY parent_id`,
          ids
        )
      ]);
      for (const r of wcRows[0]) worksMap[r.subject_id] = Number.parseInt(r.works_count, 10) || 0;
      for (const r of ccRows[0]) childrenMap[r.parent_id] = Number.parseInt(r.children_count, 10) || 0;
    }

    const enriched = childRows.map(r => ({
      ...r,
      works_count: worksMap[r.id] || 0,
      courses_count: 0,
      children_count: childrenMap[r.id] || 0
    }));
    enriched.sort((a, b) => (b.works_count - a.works_count) || String(a.term).localeCompare(String(b.term)));
    const pageRows = enriched.slice(off, off + lim);

    const pagination = createPagination(Math.floor(off / Math.max(1, lim)) + 1, lim, total);
    const result = { data: pageRows.map(formatSubjectListItem), pagination };
    await cache.set(cacheKey, result, 1800);
    return result;
  }

  async getSubjectHierarchy(id) {
    const cacheKey = `subject:${id}:hierarchy`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const hierarchy = [];
    let currentId = id;

    while (currentId) {
      const query = `
        SELECT
          s.id,
          s.term,
          s.vocabulary,
          s.parent_id,
          COUNT(DISTINCT ws.work_id) as works_count
        FROM subjects s
        LEFT JOIN work_subjects ws ON s.id = ws.subject_id
        WHERE s.id = ?
        GROUP BY s.id, s.term, s.vocabulary, s.parent_id
      `;

      const [subjects] = await pool.query(withTimeout(query), [currentId]);
      if (!subjects.length) break;

      const subject = subjects[0];
      hierarchy.unshift(subject);
      currentId = subject.parent_id;
    }

    await cache.set(cacheKey, hierarchy, 3600);
    return hierarchy;
  }

  async getSubjectWorks(id, filters = {}) {
    const cacheKey = `subject:${id}:works:v2:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { 
      min_relevance,
      year_from,
      year_to,
      document_type,
      language,
      limit = 20, 
      offset = 0 
    } = filters;

    let query = `
      SELECT
        w.id,
        w.title,
        MAX(pub.year) as publication_year,
        w.language,
        SUBSTRING_INDEX(GROUP_CONCAT(pub.type ORDER BY pub.id DESC), ',', 1) as document_type,
        MAX(pub.open_access) as open_access,
        CAST(ws.relevance_score AS DOUBLE) as relevance_score,
        ws.assigned_by,
        0 as used_in_courses
      FROM works w
      JOIN work_subjects ws ON w.id = ws.work_id
      LEFT JOIN publications pub ON w.id = pub.work_id
      WHERE ws.subject_id = ?
    `;

    const params = [id];

    if (min_relevance) {
      query += ' AND ws.relevance_score >= ?';
      params.push(parseFloat(min_relevance));
    }

    if (year_from) {
      query += ' AND pub.year >= ?';
      params.push(year_from);
    }

    if (year_to) {
      query += ' AND pub.year <= ?';
      params.push(year_to);
    }

    if (document_type) {
      query += ' AND pub.type = ?';
      params.push(document_type);
    }

    if (language) {
      query += ' AND w.language = ?';
      params.push(language);
    }

    query += `
      GROUP BY w.id, w.title, w.language, ws.relevance_score, ws.assigned_by
      ORDER BY ws.relevance_score DESC, publication_year DESC
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit), parseInt(offset));

    const [worksResult, countResult] = await Promise.all([
      pool.query(withTimeout(query), params),
      pool.query(
        withTimeout(`
          SELECT COUNT(DISTINCT w.id) AS total
          FROM works w
          JOIN work_subjects ws ON w.id = ws.work_id
          LEFT JOIN publications pub ON w.id = pub.work_id
          WHERE ws.subject_id = ?
          ${min_relevance ? ' AND ws.relevance_score >= ?' : ''}
          ${year_from ? ' AND pub.year >= ?' : ''}
          ${year_to ? ' AND pub.year <= ?' : ''}
          ${document_type ? ' AND pub.type = ?' : ''}
          ${language ? ' AND w.language = ?' : ''}
        `),
        params.slice(0, params.length - 2)
      )
    ]);
    const works = worksResult[0];
    const countRows = countResult[0];
    const total = countRows?.[0]?.total ? Number.parseInt(countRows[0].total, 10) : 0;

    for (const w of works) {
      if (w.relevance_score !== undefined) {
        w.relevance_score = parseFloat(w.relevance_score);
      }
      if (w.open_access !== undefined) {
        w.open_access = w.open_access === 1 || w.open_access === true;
      }
    }

    const pagination = createPagination(
      Math.floor(parseInt(offset, 10) / Math.max(1, parseInt(limit, 10))) + 1,
      parseInt(limit, 10),
      total
    );
    const result = { data: works.map(formatSubjectWork), pagination };
    await cache.set(cacheKey, result, 1800);
    return result;
  }

  async getSubjectCourses(id, filters = {}) {
    const cacheKey = `subject:${id}:courses:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { 
      year_from,
      year_to,
      program_id,
      reading_type,
      limit = 20, 
      offset = 0 
    } = filters;

    let query = `
      SELECT DISTINCT
        c.id,
        c.program_id,
        c.code,
        c.name,
        c.credits,
        c.semester,
        c.year,
        cb.reading_type,
        COUNT(DISTINCT cb.work_id) as works_with_subject,
        COUNT(DISTINCT ci.canonical_person_id) as instructor_count
      FROM courses c
      JOIN course_bibliography cb ON c.id = cb.course_id
      JOIN work_subjects ws ON cb.work_id = ws.work_id
      LEFT JOIN course_instructors ci ON c.id = ci.course_id
      WHERE ws.subject_id = ?
    `;

    const params = [id];

    if (year_from) {
      query += ' AND c.year >= ?';
      params.push(year_from);
    }

    if (year_to) {
      query += ' AND c.year <= ?';
      params.push(year_to);
    }

    if (program_id) {
      query += ' AND c.program_id = ?';
      params.push(program_id);
    }

    if (reading_type) {
      query += ' AND cb.reading_type = ?';
      params.push(reading_type);
    }

    query += `
      GROUP BY c.id, c.program_id, c.code, c.name, c.credits, c.semester, c.year, cb.reading_type
      ORDER BY works_with_subject DESC, c.year DESC
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit), parseInt(offset));

    const [coursesResult, countResult] = await Promise.all([
      pool.execute(query, params),
      pool.execute(
        `
          SELECT COUNT(DISTINCT c.id) AS total
          FROM courses c
          JOIN course_bibliography cb ON c.id = cb.course_id
          JOIN work_subjects ws ON cb.work_id = ws.work_id
          WHERE ws.subject_id = ?
          ${year_from ? ' AND c.year >= ?' : ''}
          ${year_to ? ' AND c.year <= ?' : ''}
          ${program_id ? ' AND c.program_id = ?' : ''}
          ${reading_type ? ' AND cb.reading_type = ?' : ''}
        `,
        params.slice(0, params.length - 2)
      )
    ]);
    const courses = coursesResult[0];
    const countRows = countResult[0];
    const total = countRows?.[0]?.total ? Number.parseInt(countRows[0].total, 10) : 0;
    const pagination = createPagination(
      Math.floor(parseInt(offset, 10) / Math.max(1, parseInt(limit, 10))) + 1,
      parseInt(limit, 10),
      total
    );
    const result = { data: courses.map(formatSubjectCourse), pagination };
    await cache.set(cacheKey, result, 1800);
    return result;
  }

  async getSubjectsStatistics() {
    const cacheKey = 'subjects:statistics:v2';
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const [stats] = await pool.query(withTimeout(`
      SELECT
        COUNT(*) as total_subjects,
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as root_subjects,
        COUNT(CASE WHEN parent_id IS NOT NULL THEN 1 END) as child_subjects,
        COUNT(DISTINCT vocabulary) as vocabularies_count,
        COUNT(CASE WHEN subject_type IS NOT NULL AND subject_type <> '' THEN 1 END) as typed_subjects
      FROM subjects
    `));

    const [vocabularyDist] = await pool.query(withTimeout(`
      SELECT
        vocabulary,
        COUNT(*) as subject_count,
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as root_count
      FROM subjects
      GROUP BY vocabulary
      ORDER BY subject_count DESC
    `));

    const result = {
      ...stats[0],
      subjects_with_works: null,
      total_work_subject_relations: null,
      vocabulary_distribution: vocabularyDist,
      top_subjects: [],
      meta: {
        work_linkage_available: false,
        note: 'Work-linkage statistics (subjects_with_works, total_work_subject_relations, per-vocabulary and top-subject works_count) require an operator-maintained subjects.total_works aggregate; the request-time 15.8M-row work_subjects join exceeds the statement budget.'
      }
    };

    await cache.set(cacheKey, result, 3600);
    return result;
  }
}

module.exports = new SubjectsService();
