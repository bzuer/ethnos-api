const { toOptionalInteger } = require('./helpers');

const collaborationStrength = (sharedWorks) => {
  if (sharedWorks >= 10) return 'very_strong';
  if (sharedWorks >= 5) return 'strong';
  if (sharedWorks >= 3) return 'moderate';
  return 'weak';
};

const buildMetrics = (row = {}) => {
  const shared = toOptionalInteger(row.collaboration_count) || 0;
  return {
    shared_works: shared,
    avg_shared_citations: Number.parseFloat(row.avg_citations_together) || 0,
    collaboration_strength: row.collaboration_strength || collaborationStrength(shared)
  };
};

const buildTimespan = (row = {}) => {
  const first = toOptionalInteger(row.first_collaboration_year);
  const latest = toOptionalInteger(row.latest_collaboration_year);
  return {
    first_collaboration_year: first,
    latest_collaboration_year: latest,
    collaboration_years: (first !== null && latest !== null)
      ? latest - first + 1
      : (toOptionalInteger(row.collaboration_span_years) || 0)
  };
};

function formatCollaborator(row = {}) {
  return {
    collaborator: {
      id: toOptionalInteger(row.collaborator_id),
      name: row.collaborator_name || null
    },
    metrics: buildMetrics(row),
    timespan: buildTimespan(row)
  };
}

function formatTopCollaboration(row = {}, rank = null) {
  return {
    ranking: rank,
    collaborators: {
      person_1: {
        id: toOptionalInteger(row.person1_id),
        name: row.person1_name || null
      },
      person_2: {
        id: toOptionalInteger(row.person2_id),
        name: row.person2_name || null
      }
    },
    metrics: buildMetrics(row),
    timespan: buildTimespan(row)
  };
}

module.exports = {
  formatCollaborator,
  formatTopCollaboration
};
