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
    const cacheKey = `subject:v2:${id}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const query = `
      SELECT
        s.id,
        s.term,
        s.vocabulary,
        s.parent_id,
        s.created_at,
        s.total_works as works_count,
        0 as courses_count,
        (SELECT COUNT(*) FROM subjects c WHERE c.parent_id = s.id) as children_count,
        parent.term as parent_term,
        parent.vocabulary as parent_vocabulary
      FROM subjects s
      LEFT JOIN subjects parent ON s.parent_id = parent.id
      WHERE s.id = ?
    `;

    const [subjects] = await pool.query(withTimeout(query), [id]);
    if (!subjects.length) return null;

    const subject = formatSubjectDetails(subjects[0]);
    await cache.set(cacheKey, subject, 3600);
    return subject;
  }

  async getSubjectChildren(id, filters = {}) {
    const cacheKey = `subject:${id}:children:v3:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { limit = 50, offset = 0 } = filters;
    const lim = parseInt(limit, 10);
    const off = parseInt(offset, 10);

    const [childRows] = await pool.execute(
      `SELECT s.id, s.term, s.vocabulary, s.parent_id, s.created_at, s.total_works AS works_count
       FROM subjects s
       WHERE s.parent_id = ?
       ORDER BY s.total_works DESC, s.term ASC`,
      [id]
    );
    const total = childRows.length;

    const childrenMap = Object.create(null);
    if (childRows.length) {
      const ids = childRows.map(r => r.id);
      const ph = ids.map(() => '?').join(',');
      const [ccRows] = await pool.query(
        `SELECT parent_id, COUNT(*) AS children_count
         FROM subjects WHERE parent_id IN (${ph}) GROUP BY parent_id`,
        ids
      );
      for (const r of ccRows) childrenMap[r.parent_id] = Number.parseInt(r.children_count, 10) || 0;
    }

    const enriched = childRows.map(r => ({
      ...r,
      works_count: Number.parseInt(r.works_count, 10) || 0,
      courses_count: 0,
      children_count: childrenMap[r.id] || 0
    }));
    const pageRows = enriched.slice(off, off + lim);

    const pagination = createPagination(Math.floor(off / Math.max(1, lim)) + 1, lim, total);
    const result = { data: pageRows.map(formatSubjectListItem), pagination };
    await cache.set(cacheKey, result, 1800);
    return result;
  }

  async getSubjectHierarchy(id) {
    const cacheKey = `subject:${id}:hierarchy:v2`;
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
          s.total_works as works_count
        FROM subjects s
        WHERE s.id = ?
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
    const cacheKey = 'subjects:statistics:v3';
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const [stats] = await pool.query(withTimeout(`
      SELECT
        COUNT(*) as total_subjects,
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as root_subjects,
        COUNT(CASE WHEN parent_id IS NOT NULL THEN 1 END) as child_subjects,
        COUNT(DISTINCT vocabulary) as vocabularies_count,
        COUNT(CASE WHEN subject_type IS NOT NULL AND subject_type <> '' THEN 1 END) as typed_subjects,
        COUNT(CASE WHEN total_works > 0 THEN 1 END) as subjects_with_works,
        COALESCE(SUM(total_works), 0) as total_work_subject_relations
      FROM subjects
    `));

    const [vocabularyDist] = await pool.query(withTimeout(`
      SELECT
        vocabulary,
        COUNT(*) as subject_count,
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as root_count,
        COALESCE(SUM(total_works), 0) as works_count
      FROM subjects
      GROUP BY vocabulary
      ORDER BY subject_count DESC
    `));

    const [topSubjects] = await pool.query(withTimeout(`
      SELECT id, term, vocabulary, subject_type, total_works AS works_count
      FROM subjects
      WHERE total_works > 0
      ORDER BY total_works DESC, term ASC
      LIMIT 20
    `));

    const base = stats[0];
    const result = {
      total_subjects: Number(base.total_subjects) || 0,
      root_subjects: Number(base.root_subjects) || 0,
      child_subjects: Number(base.child_subjects) || 0,
      vocabularies_count: Number(base.vocabularies_count) || 0,
      typed_subjects: Number(base.typed_subjects) || 0,
      subjects_with_works: Number(base.subjects_with_works) || 0,
      total_work_subject_relations: Number(base.total_work_subject_relations) || 0,
      vocabulary_distribution: vocabularyDist.map(v => ({
        vocabulary: v.vocabulary,
        subject_count: Number(v.subject_count) || 0,
        root_count: Number(v.root_count) || 0,
        works_count: Number(v.works_count) || 0
      })),
      top_subjects: topSubjects.map(s => ({
        id: Number(s.id),
        term: s.term || null,
        vocabulary: s.vocabulary || null,
        subject_type: s.subject_type || null,
        works_count: Number(s.works_count) || 0
      })),
      meta: {
        work_linkage_available: true,
        source: 'subjects.total_works (operator-maintained denormalized aggregate)'
      }
    };

    await cache.set(cacheKey, result, 3600);
    return result;
  }
}

module.exports = new SubjectsService();
