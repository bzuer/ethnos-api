const { sequelize } = require('../models');
const {
  normalizeType,
  toOptionalBoolean,
  toOptionalInteger,
  authorshipRoleOrderSql,
  contributorNames
} = require('../dto/helpers');

const hydrateAuthorsForWorks = async (workIds, perWorkCap = Infinity) => {
  const map = new Map();
  if (!Array.isArray(workIds) || workIds.length === 0) return map;
  const placeholders = workIds.map(() => '?').join(',');
  const rows = await sequelize.query(`
    SELECT
      a.work_id,
      a.person_id,
      a.role,
      a.position,
      a.is_corresponding,
      p.preferred_name
    FROM authorships a
    INNER JOIN persons p ON p.id = a.person_id
    WHERE a.work_id IN (${placeholders})
    ORDER BY a.work_id, ${authorshipRoleOrderSql('a')}, a.position, a.person_id
  `, { replacements: workIds, type: sequelize.QueryTypes.SELECT });
  const personsSeenByWork = new Map();
  for (const row of rows) {
    const bucket = map.get(row.work_id) || [];
    const seen = personsSeenByWork.get(row.work_id) || new Set();
    const personKey = row.person_id ?? `name:${row.preferred_name}`;
    if (!seen.has(personKey) && seen.size >= perWorkCap) continue;
    seen.add(personKey);
    personsSeenByWork.set(row.work_id, seen);
    bucket.push({
      person_id: toOptionalInteger(row.person_id),
      name: row.preferred_name,
      preferred_name: row.preferred_name,
      role: normalizeType(row.role) || 'AUTHOR',
      position: toOptionalInteger(row.position),
      is_corresponding: toOptionalBoolean(row.is_corresponding)
    });
    map.set(row.work_id, bucket);
  }
  return map;
};

const hydrateAuthorCountsByWork = async (workIds) => {
  const counts = new Map();
  if (!Array.isArray(workIds) || workIds.length === 0) return counts;
  const placeholders = workIds.map(() => '?').join(',');
  const rows = await sequelize.query(`
    SELECT work_id, COUNT(DISTINCT person_id) AS total
    FROM authorships
    WHERE work_id IN (${placeholders})
    GROUP BY work_id
  `, { replacements: workIds, type: sequelize.QueryTypes.SELECT });
  for (const row of rows) {
    counts.set(row.work_id, parseInt(row.total, 10) || 0);
  }
  return counts;
};

const hydrateAuthorNamesForWorks = async (workIds) => {
  const map = await hydrateAuthorsForWorks(workIds);
  const out = Object.create(null);
  for (const [workId, authors] of map) out[workId] = contributorNames(authors);
  return out;
};

module.exports = { hydrateAuthorsForWorks, hydrateAuthorNamesForWorks, hydrateAuthorCountsByWork };
