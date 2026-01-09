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

function formatCollaborator(row = {}) {
  return {
    collaborator_id: toOptionalInteger(row.collaborator_id),
    collaborator_name: row.collaborator_name || null,
    collaboration_metrics: {
      total_collaborations: toOptionalInteger(row.collaboration_count),
      collaboration_span_years: toOptionalInteger(row.collaboration_span_years) || 0,
      avg_citations_together: row.avg_citations_together || 0
    },
    collaboration_strength: row.collaboration_strength || null
  };
}

function formatTopCollaboration(row = {}) {
  return {
    collaboration_pair: {
      person1: {
        id: toOptionalInteger(row.person1_id),
        name: row.person1_name || null
      },
      person2: {
        id: toOptionalInteger(row.person2_id),
        name: row.person2_name || null
      }
    },
    collaboration_metrics: {
      total_collaborations: toOptionalInteger(row.collaboration_count),
      avg_citations_together: row.avg_citations_together || 0,
      first_collaboration_year: toOptionalInteger(row.first_collaboration_year),
      latest_collaboration_year: toOptionalInteger(row.latest_collaboration_year)
    },
    collaboration_strength: row.collaboration_strength || null
  };
}

module.exports = {
  formatCollaborator,
  formatTopCollaboration
};
