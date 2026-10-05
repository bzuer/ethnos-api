const { sequelize } = require('../models');
const { logger } = require('../middleware/errorHandler');
const { hydrateAuthorsForWorks } = require('./hydration');

const REVIEW_RELATIONS_CAP = 50;

const emptyReviewRelations = () => ({
  reviews_of: [],
  reviewed_by: [],
  reviewed_by_total: 0,
  reviewed_by_has_more: false
});

const fetchReviewedWorks = (workId, publicationId) => {
  if (publicationId !== null && publicationId !== undefined) {
    return sequelize.query(`
      SELECT
        p.reviewed_id AS work_id,
        CAST(p.id AS CHAR) AS via_publication_ids,
        rw.title,
        rw.subtitle,
        rw.latest_publication_year AS publication_year
      FROM publications p
      INNER JOIN works rw ON rw.id = p.reviewed_id
      WHERE p.id = ?
        AND p.reviewed_id IS NOT NULL
    `, { replacements: [publicationId], type: sequelize.QueryTypes.SELECT });
  }

  return sequelize.query(`
    SELECT
      p.reviewed_id AS work_id,
      GROUP_CONCAT(p.id ORDER BY p.id) AS via_publication_ids,
      rw.title,
      rw.subtitle,
      rw.latest_publication_year AS publication_year
    FROM publications p
    INNER JOIN works rw ON rw.id = p.reviewed_id
    WHERE p.work_id = ?
      AND p.reviewed_id IS NOT NULL
      AND p.reviewed_id <> p.work_id
    GROUP BY p.reviewed_id, rw.title, rw.subtitle, rw.latest_publication_year
    ORDER BY MIN(p.id) ASC
    LIMIT ${REVIEW_RELATIONS_CAP}
  `, { replacements: [workId], type: sequelize.QueryTypes.SELECT });
};

const fetchReviewsOfWork = (workId) => sequelize.query(`
  SELECT
    p.id AS publication_id,
    p.work_id,
    p.type,
    p.year AS publication_year,
    p.publication_date,
    p.doi,
    v.id AS venue_id,
    v.name AS venue_name,
    v.abbreviated_name AS venue_abbreviated_name,
    w.title,
    w.subtitle
  FROM publications p
  INNER JOIN works w ON w.id = p.work_id
  LEFT JOIN venues v ON v.id = p.venue_id
  WHERE p.reviewed_id = ?
  ORDER BY p.year DESC, p.id DESC
  LIMIT ${REVIEW_RELATIONS_CAP + 1}
`, { replacements: [workId], type: sequelize.QueryTypes.SELECT });

const fetchReviewRelations = async ({ workId, publicationId = null }) => {
  const parentWorkId = Number(workId);
  if (!Number.isFinite(parentWorkId)) return emptyReviewRelations();

  try {
    const [reviewedWorks, reviewRows] = await Promise.all([
      fetchReviewedWorks(parentWorkId, publicationId),
      fetchReviewsOfWork(parentWorkId)
    ]);

    const reviewedByHasMore = reviewRows.length > REVIEW_RELATIONS_CAP;
    const reviewedBy = reviewedByHasMore ? reviewRows.slice(0, REVIEW_RELATIONS_CAP) : reviewRows;
    let reviewedByTotal = reviewedBy.length;
    if (reviewedByHasMore) {
      const [countRow] = await sequelize.query(
        'SELECT COUNT(*) AS total FROM publications WHERE reviewed_id = ?',
        { replacements: [parentWorkId], type: sequelize.QueryTypes.SELECT }
      );
      reviewedByTotal = parseInt(countRow?.total, 10) || reviewedBy.length;
    }

    const relatedWorkIds = Array.from(new Set([
      ...reviewedWorks.map(row => row.work_id),
      ...reviewedBy.map(row => row.work_id)
    ].map(value => parseInt(value, 10)).filter(Number.isFinite)));
    const authorsByWork = await hydrateAuthorsForWorks(relatedWorkIds, 5);

    return {
      reviews_of: reviewedWorks.map(row => ({
        ...row,
        same_work: Number(row.work_id) === parentWorkId,
        authors: authorsByWork.get(row.work_id) || []
      })),
      reviewed_by: reviewedBy.map(row => ({
        ...row,
        same_work: Number(row.work_id) === parentWorkId,
        authors: authorsByWork.get(row.work_id) || []
      })),
      reviewed_by_total: reviewedByTotal,
      reviewed_by_has_more: reviewedByHasMore
    };
  } catch (error) {
    logger.warn('Review relations fetch failed; continuing without them', {
      work_id: workId,
      publication_id: publicationId,
      error: error.message
    });
    return emptyReviewRelations();
  }
};

module.exports = { fetchReviewRelations, REVIEW_RELATIONS_CAP };
