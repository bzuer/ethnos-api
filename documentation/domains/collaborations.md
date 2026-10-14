# Collaborations — co-authorship partnerships, ego-networks, and per-person collaborators

This domain surfaces **co-authorship relationships** derived from the `authorships` table (a self-join on `work_id`, with `persons` for names and `works` for citations and years). There is **no Manticore** involvement. Three read-only endpoints: a global ranking of research partnerships (`/collaborations/top`) and two person-scoped views (`/persons/{id}/collaborators`, `/persons/{id}/network`) that live under `/persons` but belong to this domain. All three are open (no access key) and governed by the shared rate limiter. Envelope, pagination (default page size 10; an explicit `offset` is served as given and echoed in `meta.pagination_extras.offset`) and error codes are in [../00-conventions.md](../00-conventions.md); person entities are in [./persons.md](./persons.md). `/metrics/collaborations` ([./metrics.md](./metrics.md)) serves the same pair ranking.

Shared conventions:

- **Shared works are counted once.** A work counts once per pair even when it has several publications or when a person holds several roles on it.
- **`avg_shared_citations`** is the mean `works.citation_count` over the shared works (`ROUND(…, 2)`; can be `0`).
- **Years** (`first_collaboration_year`, `latest_collaboration_year`) are MIN/MAX of `works.latest_publication_year` over the shared works; `collaboration_years = latest − first + 1`, `0` when either is null.
- **Strength scale** (one scale everywhere): `very_strong` ≥ 10 shared works, `strong` ≥ 5, `moderate` ≥ 3, otherwise `weak`.

---

## `GET /collaborations/top`

Most productive research partnerships. The ranking statement considers the **2,000 persons with the most works** (`persons.total_works >= 30`, ordered by `total_works`), pairs whose shared works list **both persons with role `AUTHOR`**, and keeps pairs with at least `min_collaborations` shared works. Rows are ordered `shared_works DESC`, `avg_shared_citations DESC`, then the two person ids; `ranking = offset + index + 1`. `pagination.total` is exact (a window count in the same statement); a page past the end returns `[]` with the same exact total. About 1.1 s uncached (measured 2026-10-14); cached 30 min (`top_collaborations:v4`).

If the statement exceeds its budget the response is still 200 but the page is empty with `meta.degraded: true` and `meta.pagination_total_exact: false` — treat it as "try again", not "no results". Degraded pages are not cached.

### Query parameters

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `min_collaborations` | integer | 5 | 1..50 | Minimum shared works per pair. |
| `year_from` | integer | — | 1900..currentYear+1 | Count only shared works whose `latest_publication_year >= year_from`. |
| `year_to` | integer | — | 1900..currentYear+1 | Count only shared works whose `latest_publication_year <= year_to`. |
| `page` / `limit` / `offset` | integer | 1 / 10 / — | `limit` 1..100 | Pagination. |

The year bounds restrict which shared works are counted, so `shared_works` and the timespan are computed inside the window. No citation/sort params; the order is fixed.

Totals measured 2026-10-14: 1,126 pairs at the default; `year_from=2020` → 477; `year_to=1990` → 107; `min_collaborations=50&year_from=2015&year_to=2020` → 13.

### Example requests

```
GET /collaborations/top?limit=3
GET /collaborations/top?min_collaborations=50&year_from=2015&year_to=2020
GET /collaborations/top?limit=2&offset=3
```

### Example response (`?limit=3`, measured 2026-10-14; rows 2–3 trimmed)

```json
{
  "status": "success",
  "data": [
    {
      "ranking": 1,
      "collaborators": {
        "person_1": { "id": 185263, "name": "Alfredo Fontes" },
        "person_2": { "id": 10839772, "name": "A C" }
      },
      "metrics": { "shared_works": 779, "avg_shared_citations": 0.41, "collaboration_strength": "very_strong" },
      "timespan": { "first_collaboration_year": 1926, "latest_collaboration_year": 2009, "collaboration_years": 84 }
    },
    { "ranking": 2, "collaborators": { "person_1": { "id": 4908336, "name": "Fulano de Tal" }, "person_2": { "id": 10604863, "name": "No authorship indicated No authorship indicated" } } },
    { "ranking": 3, "collaborators": { "person_1": { "id": 400985, "name": "Et Al" }, "person_2": { "id": 5757439, "name": "et al et al" } } }
  ],
  "pagination": { "page": 1, "limit": 3, "total": 1126, "totalPages": 376, "hasNext": true, "hasPrev": false },
  "meta": {
    "query_time_ms": 1155,
    "source": "collaboration_ranking",
    "summary": { "total_partnerships": 1126, "avg_collaborations": 585 },
    "filters": { "min_collaborations": 5, "year_from": null, "year_to": null },
    "pagination_total_exact": true,
    "request": { "method": "GET", "path": "/collaborations/top?limit=3" },
    "pagination_extras": { "offset": 0 }
  }
}
```

### Fields

| field (dot-path) | type | notes |
|---|---|---|
| `data[]` | array | Flat array of pair objects. |
| `data[].ranking` | integer | Global rank (`offset + index + 1`). |
| `data[].collaborators.person_1.id` / `.name` | integer / string \| null | The **lower** person id of the pair and its `preferred_name`. |
| `data[].collaborators.person_2.id` / `.name` | integer / string \| null | The **higher** person id. |
| `data[].metrics.shared_works` | integer | Shared works (within the year window when one is given). |
| `data[].metrics.avg_shared_citations` | number | Mean `works.citation_count` of the shared works. |
| `data[].metrics.collaboration_strength` | string enum | `very_strong \| strong \| moderate \| weak` (scale above). |
| `data[].timespan.first_collaboration_year` / `latest_collaboration_year` | integer \| null | From `works.latest_publication_year`. |
| `data[].timespan.collaboration_years` | integer | `latest − first + 1`, else `0`. |
| `meta.summary.total_partnerships` | integer | `= pagination.total`. |
| `meta.summary.avg_collaborations` | integer | Mean `shared_works` of the page rows. |
| `meta.filters.{min_collaborations,year_from,year_to}` | integer \| null | Effective filters. |
| `meta.pagination_total_exact` | boolean | `false` only on a degraded page. |
| `meta.degraded` | boolean | Present (`true`) only on a degraded page. |
| `meta.query_time_ms` | integer | Server time. |

**Data quality.** The head of the ranking is dominated by placeholder persons and same-person duplicates (`Fulano de Tal` / `No authorship indicated`, `Et Al` / `et al et al`, `Sassen` / `Saskia Sassen`). Genuine partnerships appear further down; a UI may want to flag pairs whose names normalize to the same string.

---

## `GET /persons/{id}/collaborators`

Co-authors of one person, in **any contributor role**, ranked by shared works with the person id as tiebreak. `pagination.total` is the exact number of co-authors meeting `min_collaborations`, also on a page past the end. Single-person scope: 5–20 ms (measured 2026-10-14). Cached 5 min (`collaborators:v3`).

**404 only when the person does not exist.** A person who exists but has no co-author meeting `min_collaborations` (including one with no co-authors at all) returns **200** with `collaborators: []` and `total: 0`.

### Query parameters

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `min_collaborations` | integer | 2 | 1..50 | Minimum shared works for a co-author to be listed. Use `1` for every co-author. |
| `sort_by` | string | `collaboration_count` | `collaboration_count`, `latest_collaboration_year`, `avg_citations_together` | Descending order on shared works, most recent shared-work year, or average shared citations; tiebreak person id. |
| `page` / `limit` / `offset` | integer | 1 / 10 / — | `limit` 1..100 | Pagination. |

### Example requests

```
GET /persons/18165/collaborators?limit=3
GET /persons/18165/collaborators?sort_by=latest_collaboration_year&limit=3
GET /persons/54/collaborators                 # existing person without co-authors → 200, empty list
```

### Example response (`/persons/18165/collaborators?limit=3`, measured 2026-10-14; rows 2–3 trimmed)

```json
{
  "status": "success",
  "data": {
    "person_id": 18165,
    "collaborators": [
      {
        "collaborator": { "id": 3624542, "name": "Bijou Yang" },
        "metrics": { "shared_works": 59, "avg_shared_citations": 0.58, "collaboration_strength": "very_strong" },
        "timespan": { "first_collaboration_year": 1988, "latest_collaboration_year": 2016, "collaboration_years": 29 }
      },
      { "collaborator": { "id": 687684, "name": "Ahmed M Abdel-Khalek" }, "metrics": { "shared_works": 52 } },
      { "collaborator": { "id": 8859990, "name": "Ahmed Abdel-Khalek" }, "metrics": { "shared_works": 21 } }
    ]
  },
  "pagination": { "page": 1, "limit": 3, "total": 136, "totalPages": 46, "hasNext": true, "hasPrev": false },
  "meta": {
    "query_time_ms": 19,
    "source": "collaboration_analysis",
    "person_id": 18165,
    "filters": { "min_collaborations": 2, "sort_by": "collaboration_count" },
    "summary": { "total_collaborators": 136, "avg_collaborations_per_collaborator": 44 },
    "request": { "method": "GET", "path": "/persons/18165/collaborators?limit=3" },
    "pagination_extras": { "offset": 0 }
  }
}
```

### Fields

| field (dot-path) | type | notes |
|---|---|---|
| `data.person_id` | integer | The queried person. |
| `data.collaborators[]` | array | May be `[]` (still 200). |
| `data.collaborators[].collaborator.id` / `.name` | integer / string \| null | Co-author id and `preferred_name`. |
| `data.collaborators[].metrics` | object | `shared_works`, `avg_shared_citations`, `collaboration_strength` — same definitions and scale as `/collaborations/top`. |
| `data.collaborators[].timespan` | object | Same definitions as `/collaborations/top`. |
| `pagination.*` | object | Envelope-level (sibling of `data`). |
| `meta.person_id` | integer | Duplicate of `data.person_id`. |
| `meta.filters.{min_collaborations,sort_by}` | integer / string | Effective filters. |
| `meta.summary.total_collaborators` | integer | `= pagination.total`. |
| `meta.summary.avg_collaborations_per_collaborator` | integer | Mean `shared_works` of the page rows. |
| `meta.source` / `meta.query_time_ms` | string / integer | `"collaboration_analysis"`; server time. |

A query that exceeds its time budget returns 503 `REQUEST_TIMEOUT`; other unexpected failures return 500 `INTERNAL_ERROR`.

---

## `GET /persons/{id}/network`

Co-authorship **ego-network**: a BFS outward from the central person, returning graph `nodes` and `edges`. Hard caps: **120 nodes**, **20 collaborators per expanded node**, and an edge needs `weight` (shared works) ≥ 2. No pagination. 5–200 ms (measured 2026-10-14).

**404 only when the person does not exist.** A person without qualifying co-authors returns 200 with just the central node and `edges: []`.

### Query parameters

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `depth` | integer | 2 | 1..3 | BFS hops. `1` = direct collaborators only; `2`/`3` add indirect ones. Out of range → 400. |

### Example requests

```
GET /persons/18165/network?depth=1
GET /persons/18165/network
GET /persons/54/network                       # no co-authors → central node only
```

### Example response (`/persons/18165/network?depth=1`, measured 2026-10-14; maps trimmed)

```json
{
  "status": "success",
  "data": {
    "central_person_id": 18165,
    "network_depth": 1,
    "nodes": {
      "18165": { "id": 18165, "name": "D Lester", "type": "central", "level": 0 },
      "76299": { "id": 76299, "name": "Antoon A Leenaars", "type": "direct_collaborator", "level": 1 }
    },
    "edges": [
      { "source": 18165, "target": 3624542, "weight": 59, "relationship": "collaboration" }
    ],
    "network_stats": { "total_nodes": 21, "total_edges": 20, "direct_collaborators": 20, "network_density": 0.095 }
  },
  "meta": {
    "query_time_ms": 5,
    "source": "network_analysis",
    "complexity": { "total_nodes": 21, "total_edges": 20, "direct_collaborators": 20, "network_density": 0.095 },
    "request": { "method": "GET", "path": "/persons/18165/network?depth=1" }
  }
}
```

At the default `depth=2` the same person fills the node cap: 120 nodes (1 central, 20 direct, 99 indirect) and 154 edges.

### Fields

| field (dot-path) | type | notes |
|---|---|---|
| `data.central_person_id` | integer | The queried person. |
| `data.network_depth` | integer | Effective depth after clamping to 1..3. |
| `data.nodes` | object (map) | **Keyed by stringified person id**, not an array; includes the central node; ≤ 120 entries. |
| `data.nodes.<id>.{id,name}` | integer / string \| null | Person id and `preferred_name`. |
| `data.nodes.<id>.type` | string enum | `central` (level 0), `direct_collaborator` (level 1), `indirect_collaborator` (level ≥ 2). |
| `data.nodes.<id>.level` | integer | BFS hop distance. |
| `data.edges[]` | array | Undirected, unique co-authorship edges `{ source, target, weight, relationship }`; `weight` = distinct shared works (≥ 2); `relationship` is always `"collaboration"`. |
| `data.network_stats.total_nodes` / `total_edges` | integer | Graph size. |
| `data.network_stats.direct_collaborators` | integer | Level-1 nodes (≤ 20). |
| `data.network_stats.network_density` | number | `edges / (n·(n−1)/2)`, 3 decimals. |
| `meta.complexity` | object | Duplicate of `network_stats`. |

The graph is a **sample**: the caps cut highly connected persons short, so do not present `total_nodes`/`total_edges` as the person's collaborator count (use `/persons/{id}/collaborators`). Unlike the other views, edge weights count works regardless of contributor role. Errors other than 400/404 return 500 `INTERNAL_ERROR`.
