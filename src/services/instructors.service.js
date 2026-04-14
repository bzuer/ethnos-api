const { pool } = require('../config/database');
const cache = require('./cache.service');
const { createPagination } = require('../utils/pagination');
const {
  formatInstructorListItem,
  formatInstructorDetails,
  formatInstructorCourse,
  formatInstructorSubject,
  formatInstructorBibliography,
  formatInstructorStatistics
} = require('../dto/instructor.dto');
const { authorsFromJson } = require('../dto/helpers');

class InstructorsService {
  
  async getInstructors(filters = {}) {
    const cacheKey = `instructors:list:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const {
      role,
      program_id,
      year_from,
      year_to,
      search,
      limit = 20,
      offset = 0
    } = filters;

    let query = `
      SELECT DISTINCT
        p.id as person_id,
        p.preferred_name,
        p.given_names,
        p.family_name,
        p.orcid,
        p.lattes_id,
        p.is_verified,
        COUNT(DISTINCT ci.course_id) as courses_taught,
        COUNT(DISTINCT c.program_id) as programs_count,
        MIN(c.year) as earliest_year,
        MAX(c.year) as latest_year,
        GROUP_CONCAT(DISTINCT ci.role ORDER BY ci.role) as roles,
        GROUP_CONCAT(DISTINCT c.program_id ORDER BY c.program_id) as program_ids
      FROM persons p
      JOIN course_instructors ci ON p.id = ci.canonical_person_id
      JOIN courses c ON ci.course_id = c.id
      WHERE 1=1
    `;

    const params = [];

    if (role) {
      query += ' AND ci.role = ?';
      params.push(role);
    }

    if (program_id) {
      query += ' AND c.program_id = ?';
      params.push(program_id);
    }

    if (year_from) {
      query += ' AND c.year >= ?';
      params.push(year_from);
    }

    if (year_to) {
      query += ' AND c.year <= ?';
      params.push(year_to);
    }

    if (search) {
      query += ' AND (p.preferred_name LIKE ? OR p.given_names LIKE ? OR p.family_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += `
      GROUP BY p.id, p.preferred_name, p.given_names, p.family_name, p.orcid, p.lattes_id, p.is_verified
      ORDER BY courses_taught DESC, p.preferred_name
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit), parseInt(offset));

    const [instructors] = await pool.execute(query, params);

    for (const instructor of instructors) {
      if (instructor.roles) {
        instructor.roles = instructor.roles.split(',').map(r => r.trim());
      }
      if (instructor.program_ids) {
        instructor.program_ids = instructor.program_ids.split(',').map(id => parseInt(id.trim()));
      }
    }

    const countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM persons p
      JOIN course_instructors ci ON p.id = ci.canonical_person_id
      JOIN courses c ON ci.course_id = c.id
      WHERE 1=1
      ${role ? 'AND ci.role = ?' : ''}
      ${program_id ? 'AND c.program_id = ?' : ''}
      ${year_from ? 'AND c.year >= ?' : ''}
      ${year_to ? 'AND c.year <= ?' : ''}
      ${search ? 'AND (p.preferred_name LIKE ? OR p.given_names LIKE ? OR p.family_name LIKE ?)' : ''}
    `;

    const countParams = [];
    if (role) countParams.push(role);
    if (program_id) countParams.push(program_id);
    if (year_from) countParams.push(year_from);
    if (year_to) countParams.push(year_to);
    if (search) countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);

    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    const formattedInstructors = instructors.map(formatInstructorListItem);
    const pagination = createPagination(
      Math.floor(parseInt(offset) / parseInt(limit)) + 1,
      parseInt(limit),
      total
    );

    const result = {
      data: formattedInstructors,
      pagination
    };

    await cache.set(cacheKey, result, 1800);
    return result;
  }

  async getInstructorById(personId) {
    const cacheKey = `instructor:${personId}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const query = `
      SELECT DISTINCT
        p.id as person_id,
        p.preferred_name,
        p.given_names,
        p.family_name,
        p.orcid,
        p.lattes_id,
        p.scopus_id,
        p.is_verified,
        p.created_at,
        COUNT(DISTINCT ci.course_id) as courses_taught,
        COUNT(DISTINCT c.program_id) as programs_count,
        COUNT(DISTINCT cb.work_id) as bibliography_contributed,
        MIN(c.year) as earliest_year,
        MAX(c.year) as latest_year,
        GROUP_CONCAT(DISTINCT ci.role ORDER BY ci.role) as roles
      FROM persons p
      JOIN course_instructors ci ON p.id = ci.canonical_person_id
      JOIN courses c ON ci.course_id = c.id
      LEFT JOIN course_bibliography cb ON c.id = cb.course_id
      WHERE p.id = ?
      GROUP BY p.id, p.preferred_name, p.given_names, p.family_name, p.orcid, p.lattes_id, p.scopus_id, p.is_verified, p.created_at
    `;

    const [instructors] = await pool.execute(query, [personId]);
    if (!instructors.length) return null;

    const instructor = instructors[0];
    if (instructor.roles) {
      instructor.roles = instructor.roles.split(',').map(r => r.trim());
    }

    const formattedInstructor = formatInstructorDetails(instructor);
    await cache.set(cacheKey, formattedInstructor, 3600);
    return formattedInstructor;
  }

  async getInstructorCourses(personId, filters = {}) {
    const cacheKey = `instructor:${personId}:courses:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { 
      year_from, 
      year_to, 
      program_id, 
      semester,
      role,
      limit = 20, 
      offset = 0 
    } = filters;

    let query = `
      SELECT 
        c.id,
        c.program_id,
        c.code,
        c.name,
        c.credits,
        c.semester,
        c.year,
        ci.role,
        COUNT(DISTINCT cb.work_id) as bibliography_count,
        COUNT(DISTINCT ci2.canonical_person_id) as co_instructors_count
      FROM courses c
      JOIN course_instructors ci ON c.id = ci.course_id
      LEFT JOIN course_bibliography cb ON c.id = cb.course_id
      LEFT JOIN course_instructors ci2 ON c.id = ci2.course_id AND ci2.canonical_person_id != ci.canonical_person_id
      WHERE ci.canonical_person_id = ?
    `;

    const params = [personId];

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

    if (semester) {
      query += ' AND c.semester = ?';
      params.push(semester);
    }

    if (role) {
      query += ' AND ci.role = ?';
      params.push(role);
    }

    query += `
      GROUP BY c.id, c.program_id, c.code, c.name, c.credits, c.semester, c.year, ci.role
      ORDER BY c.year DESC, c.semester, c.name
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit), parseInt(offset));

    const [courses] = await pool.execute(query, params);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM courses c
      JOIN course_instructors ci ON c.id = ci.course_id
      WHERE ci.canonical_person_id = ?
      ${year_from ? 'AND c.year >= ?' : ''}
      ${year_to ? 'AND c.year <= ?' : ''}
      ${program_id ? 'AND c.program_id = ?' : ''}
      ${semester ? 'AND c.semester = ?' : ''}
      ${role ? 'AND ci.role = ?' : ''}
    `;
    const countParams = [personId];
    if (year_from) countParams.push(year_from);
    if (year_to) countParams.push(year_to);
    if (program_id) countParams.push(program_id);
    if (semester) countParams.push(semester);
    if (role) countParams.push(role);
    
    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    const formattedCourses = courses.map(formatInstructorCourse);
    const pagination = createPagination(
      Math.floor(parseInt(offset) / parseInt(limit)) + 1,
      parseInt(limit),
      total
    );

    const result = {
      data: formattedCourses,
      pagination
    };

    await cache.set(cacheKey, result, 1800);
    return result;
  }

  async getInstructorSubjectsExpertise(personId, filters = {}) {
    const cacheKey = `instructor:${personId}:subjects:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { vocabulary, limit = 20, offset = 0 } = filters;

    let query = `
      SELECT 
        s.id,
        s.term,
        s.vocabulary,
        s.parent_id,
        COUNT(DISTINCT cb.course_id) as courses_count,
        COUNT(DISTINCT cb.work_id) as works_count,
        AVG(ws.relevance_score) as avg_relevance
      FROM subjects s
      JOIN work_subjects ws ON s.id = ws.subject_id
      JOIN course_bibliography cb ON ws.work_id = cb.work_id
      JOIN course_instructors ci ON cb.course_id = ci.course_id
      WHERE ci.canonical_person_id = ?
    `;

    const params = [personId];

    if (vocabulary) {
      query += ' AND s.vocabulary = ?';
      params.push(vocabulary);
    }

    query += `
      GROUP BY s.id, s.term, s.vocabulary, s.parent_id
      ORDER BY courses_count DESC, works_count DESC
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit), parseInt(offset));

    const [subjects] = await pool.execute(query, params);

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM subjects s
      JOIN work_subjects ws ON s.id = ws.subject_id
      JOIN course_bibliography cb ON ws.work_id = cb.work_id
      JOIN course_instructors ci ON cb.course_id = ci.course_id
      WHERE ci.canonical_person_id = ?
      ${vocabulary ? 'AND s.vocabulary = ?' : ''}
    `;
    const countParams = [personId];
    if (vocabulary) countParams.push(vocabulary);
    
    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    const formattedSubjects = subjects.map(formatInstructorSubject);
    const pagination = createPagination(
      Math.floor(parseInt(offset) / parseInt(limit)) + 1,
      parseInt(limit),
      total
    );

    const result = {
      data: formattedSubjects,
      pagination
    };

    await cache.set(cacheKey, result, 1800);
    return result;
  }

  async getInstructorBibliography(personId, filters = {}) {
    const cacheKey = `instructor:${personId}:bibliography:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { reading_type, year_from, year_to, limit = 20, offset = 0 } = filters;

    let query = `
      SELECT DISTINCT
        w.id as work_id,
        w.title,
        pub.year as publication_year,
        w.language,
        w.work_type as document_type,
        pub.open_access,
        cb.reading_type,
        COALESCE(JSON_LENGTH(sp_a.authors_json), 0) as author_count,
        sp_a.authors_json,
        COUNT(DISTINCT cb.course_id) as used_in_courses
      FROM works w
      JOIN course_bibliography cb ON w.id = cb.work_id
      JOIN course_instructors ci ON cb.course_id = ci.course_id
      LEFT JOIN publications pub ON w.id = pub.work_id
      LEFT JOIN summary_publications sp_a ON sp_a.publication_id = (
        SELECT MAX(publication_id)
        FROM summary_publications
        WHERE work_id = w.id
      )
      WHERE ci.canonical_person_id = ?
    `;

    const params = [personId];

    if (reading_type) {
      query += ' AND cb.reading_type = ?';
      params.push(reading_type);
    }

    if (year_from) {
      query += ' AND pub.year >= ?';
      params.push(year_from);
    }

    if (year_to) {
      query += ' AND pub.year <= ?';
      params.push(year_to);
    }

    query += `
      GROUP BY w.id, w.title, pub.year, w.language, w.work_type, cb.reading_type, sp_a.authors_json
      ORDER BY used_in_courses DESC, pub.year DESC
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit), parseInt(offset));

    const [bibliography] = await pool.execute(query, params);

    for (const item of bibliography) {
      const authors = authorsFromJson(item.authors_json);
      item.authors = authors;
      item.first_author_name = authors[0] || null;
      delete item.authors_json;
    }

    const countQuery = `
      SELECT COUNT(DISTINCT w.id) as total
      FROM works w
      JOIN course_bibliography cb ON w.id = cb.work_id
      JOIN course_instructors ci ON cb.course_id = ci.course_id
      WHERE ci.canonical_person_id = ?
      ${reading_type ? 'AND cb.reading_type = ?' : ''}
      ${year_from ? 'AND pub.year >= ?' : ''}
      ${year_to ? 'AND pub.year <= ?' : ''}
    `;
    const countParams = [personId];
    if (reading_type) countParams.push(reading_type);
    if (year_from) countParams.push(year_from);
    if (year_to) countParams.push(year_to);
    
    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    const formattedBibliography = bibliography.map(formatInstructorBibliography);
    const pagination = createPagination(
      Math.floor(parseInt(offset) / parseInt(limit)) + 1,
      parseInt(limit),
      total
    );

    const result = {
      data: formattedBibliography,
      pagination
    };

    await cache.set(cacheKey, result, 1800);
    return result;
  }

  async getInstructorStatistics(personId) {
    const cacheKey = `instructor:${personId}:statistics`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const personInfoQuery = `
      SELECT 
        p.id,
        p.preferred_name,
        p.given_names,
        p.family_name,
        p.orcid,
        p.lattes_id,
        p.scopus_id,
        p.is_verified,
        p.created_at
      FROM persons p
      WHERE p.id = ?
    `;

    const [personInfo] = await pool.execute(personInfoQuery, [personId]);
    if (!personInfo.length) return null;

    const teachingStatsQuery = `
      SELECT 
        COUNT(DISTINCT ci.course_id) as courses_taught,
        COUNT(DISTINCT c.program_id) as programs_count,
        COUNT(DISTINCT cb.work_id) as bibliography_items_used,
        COUNT(DISTINCT ci2.canonical_person_id) as unique_collaborators,
        MIN(c.year) as teaching_start_year,
        MAX(c.year) as teaching_end_year,
        GROUP_CONCAT(DISTINCT ci.role ORDER BY ci.role) as teaching_roles
      FROM course_instructors ci
      JOIN courses c ON ci.course_id = c.id
      LEFT JOIN course_bibliography cb ON c.id = cb.course_id
      LEFT JOIN course_instructors ci2 ON c.id = ci2.course_id AND ci2.canonical_person_id != ci.canonical_person_id
      WHERE ci.canonical_person_id = ?
      GROUP BY ci.canonical_person_id
    `;

    const [teachingStats] = await pool.execute(teachingStatsQuery, [personId]);

    const authorshipStatsQuery = `
      SELECT
        COUNT(DISTINCT a.work_id) AS works_authored,
        COUNT(DISTINCT p.signature_id) AS unique_signatures,
        COUNT(DISTINCT a.work_id) AS confirmed_authorships,
        MIN(pub.year) AS first_publication_year,
        MAX(pub.year) AS latest_publication_year
      FROM persons p
      LEFT JOIN authorships a ON a.person_id = p.id
      LEFT JOIN publications pub ON pub.work_id = a.work_id
      WHERE p.id = ?
      GROUP BY p.id
    `;

    const [authorshipStats] = await pool.execute(authorshipStatsQuery, [personId]);

    const signaturesQuery = `
      SELECT
        s.id,
        s.signature,
        COUNT(DISTINCT a.work_id) AS works_with_signature
      FROM persons p
      JOIN signatures s ON p.signature_id = s.id
      LEFT JOIN authorships a ON a.person_id = p.id
      WHERE p.id = ?
      GROUP BY s.id, s.signature
      ORDER BY works_with_signature DESC
    `;

    const [signatures] = await pool.execute(signaturesQuery, [personId]);

    const bibliographyUsageQuery = `
      SELECT 
        cb.reading_type,
        COUNT(DISTINCT cb.work_id) as works_count,
        COUNT(DISTINCT cb.course_id) as courses_count
      FROM course_instructors ci
      JOIN course_bibliography cb ON ci.course_id = cb.course_id
      WHERE ci.canonical_person_id = ?
      GROUP BY cb.reading_type
      ORDER BY works_count DESC
    `;

    const [bibliographyUsage] = await pool.execute(bibliographyUsageQuery, [personId]);

    const recentWorksQuery = `
      SELECT DISTINCT
        w.id,
        w.title,
        pub.year,
        w.work_type,
        w.language,
        pub.open_access,
        s.signature AS signature_text
      FROM authorships a
      INNER JOIN works w ON w.id = a.work_id
      LEFT JOIN publications pub ON pub.work_id = w.id
      LEFT JOIN persons p ON p.id = a.person_id
      LEFT JOIN signatures s ON s.id = p.signature_id
      WHERE a.person_id = ?
      ORDER BY pub.year DESC
      LIMIT 10
    `;

    const [recentWorks] = await pool.execute(recentWorksQuery, [personId]);
    recentWorks.forEach(work => {
      work.open_access = work.open_access === 1 || work.open_access === true;
    });

    const mostUsedAuthorsQuery = `
      SELECT
        sp_a.authors_json,
        COUNT(DISTINCT cb.work_id) as usage_count,
        COUNT(DISTINCT cb.course_id) as courses_count
      FROM course_instructors ci
      JOIN course_bibliography cb ON ci.course_id = cb.course_id
      JOIN summary_publications sp_a ON sp_a.publication_id = (
        SELECT MAX(publication_id)
        FROM summary_publications
        WHERE work_id = cb.work_id
      )
      WHERE ci.canonical_person_id = ?
      GROUP BY sp_a.authors_json
      ORDER BY usage_count DESC
      LIMIT 15
    `;

    const [mostUsedAuthors] = await pool.execute(mostUsedAuthorsQuery, [personId]);
    mostUsedAuthors.forEach(row => {
      const authors = authorsFromJson(row.authors_json);
      row.author_string = authors.join('; ') || null;
      row.first_author_name = authors[0] || null;
      delete row.authors_json;
    });

    const subjectsExpertiseQuery = `
      SELECT 
        s.vocabulary,
        COUNT(DISTINCT s.id) as subjects_count,
        COUNT(DISTINCT cb.work_id) as works_count,
        COUNT(DISTINCT cb.course_id) as courses_count
      FROM course_instructors ci
      JOIN course_bibliography cb ON ci.course_id = cb.course_id
      JOIN work_subjects ws ON cb.work_id = ws.work_id
      JOIN subjects s ON ws.subject_id = s.id
      WHERE ci.canonical_person_id = ?
      GROUP BY s.vocabulary
      ORDER BY subjects_count DESC
    `;

    const [subjectsExpertise] = await pool.execute(subjectsExpertiseQuery, [personId]);

    const collaboratorsQuery = `
      SELECT DISTINCT
        p2.id as collaborator_id,
        p2.preferred_name as collaborator_name,
        COUNT(DISTINCT c.id) as shared_courses
      FROM course_instructors ci1
      JOIN courses c ON ci1.course_id = c.id
      JOIN course_instructors ci2 ON c.id = ci2.course_id AND ci1.canonical_person_id != ci2.canonical_person_id
      JOIN persons p2 ON ci2.canonical_person_id = p2.id
      WHERE ci1.canonical_person_id = ?
      GROUP BY p2.id, p2.preferred_name
      ORDER BY shared_courses DESC
      LIMIT 10
    `;

    const [collaborators] = await pool.execute(collaboratorsQuery, [personId]);

    for (const author of mostUsedAuthors) {
      if (author.author_string) {
        author.authors_array = author.author_string.split(';').map(name => name.trim());
      }
    }

    const result = {
      person: personInfo[0],
      teaching_profile: {
        ...teachingStats[0],
        teaching_roles: teachingStats[0]?.teaching_roles?.split(',') || [],
        teaching_span_years: teachingStats[0] ? 
          (teachingStats[0].teaching_end_year - teachingStats[0].teaching_start_year + 1) : 0
      },
      authorship_profile: authorshipStats[0] || {
        works_authored: 0,
        unique_signatures: 0,
        confirmed_authorships: 0,
        first_publication_year: null,
        latest_publication_year: null
      },
      signatures: signatures,
      recent_authored_works: recentWorks,
      bibliography_usage_patterns: bibliographyUsage,
      most_used_authors_in_courses: mostUsedAuthors,
      subject_expertise: subjectsExpertise,
      teaching_collaborators: collaborators,
      combined_statistics: {
        total_academic_span_years: Math.max(
          (teachingStats[0]?.teaching_end_year || 0) - (teachingStats[0]?.teaching_start_year || 0) + 1,
          (authorshipStats[0]?.latest_publication_year || 0) - (authorshipStats[0]?.first_publication_year || 0) + 1
        ),
        academic_productivity_ratio: authorshipStats[0]?.works_authored && teachingStats[0]?.courses_taught ? 
          (authorshipStats[0].works_authored / teachingStats[0].courses_taught).toFixed(2) : '0.00',
        bibliography_diversity_score: bibliographyUsage.length,
        signature_consistency_score: signatures.length > 0 ? 
          Math.max(...signatures.map(s => s.works_with_signature)) / signatures.length : 0
      }
    };

    const formattedStatistics = formatInstructorStatistics(result);
    await cache.set(cacheKey, formattedStatistics, 1800);
    return formattedStatistics;
  }

  async getInstructorsStatistics() {
    const cacheKey = 'instructors:statistics';
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const query = `
      SELECT 
        COUNT(DISTINCT ci.canonical_person_id) as total_instructors,
        COUNT(DISTINCT ci.course_id) as total_courses_taught,
        COUNT(DISTINCT c.program_id) as programs_with_instructors,
        AVG(courses_per_instructor.course_count) as avg_courses_per_instructor
      FROM course_instructors ci
      JOIN courses c ON ci.course_id = c.id
      JOIN (
        SELECT canonical_person_id, COUNT(*) as course_count
        FROM course_instructors
        GROUP BY canonical_person_id
      ) courses_per_instructor ON ci.canonical_person_id = courses_per_instructor.canonical_person_id
    `;

    const [stats] = await pool.execute(query);

    const roleDistQuery = `
      SELECT 
        role,
        COUNT(DISTINCT canonical_person_id) as instructor_count,
        COUNT(*) as assignment_count
      FROM course_instructors
      GROUP BY role
      ORDER BY assignment_count DESC
    `;

    const [roleDist] = await pool.execute(roleDistQuery);

    const topInstructorsQuery = `
      SELECT 
        p.preferred_name,
        COUNT(DISTINCT ci.course_id) as courses_taught,
        COUNT(DISTINCT c.program_id) as programs_count,
        MIN(c.year) as earliest_year,
        MAX(c.year) as latest_year
      FROM persons p
      JOIN course_instructors ci ON p.id = ci.canonical_person_id
      JOIN courses c ON ci.course_id = c.id
      GROUP BY p.id, p.preferred_name
      ORDER BY courses_taught DESC
      LIMIT 10
    `;

    const [topInstructors] = await pool.execute(topInstructorsQuery);

    const result = {
      ...stats[0],
      role_distribution: roleDist,
      top_instructors: topInstructors
    };

    await cache.set(cacheKey, result, 3600);
    return result;
  }
}

module.exports = new InstructorsService();
