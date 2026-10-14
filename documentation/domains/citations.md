# Citations — citation graph, references, bibliometrics and network for a work

This domain exposes the **citation relationships of a single work**: who cites it, what it cites, its bibliometric summary and a bounded citation-network graph. All four operations are nested under `/works/{id}` and backed by the MariaDB `work_references` table (`status` ∈ `PENDING|RESOLVED|FAILED`, `citation_type` ∈ `POSITIVE|NEUTRAL|NEGATIVE|SELF` or `null`) joined to `works`/`publications`/`venues`/`authorships` for hydration. No Manticore is involved. The parent work lives in [./works.md](./works.md); envelope, pagination (default page size 10; an explicit `offset` is served as given and echoed in `meta.pagination_extras.offset`), error codes and rate limiting are in [../00-conventions.md](../00-conventions.md).

An edge records "citing work cites cited work". It is resolved by a **direct work link** (`cited_work_id` set, status `RESOLVED`: the cited work exists locally) or carries only a **DOI** (`cited_work_id` null, status `PENDING`: the cited work is not yet in the corpus — the normal state, not an error; `FAILED`: resolution gave up).

Shared behaviour:

- All four endpoints are **public**. A non-existent work id returns **404** `NOT_FOUND` (message like `"Citations for work with ID … not found"`); invalid params return **400** `VALIDATION_ERROR` with the express-validator `errors[]`.
- Failures are surfaced, never masked as empty or zeroed data: a statement-budget overrun returns **503** `REQUEST_TIMEOUT`, other failures **500**.
- **Two citation totals can disagree.** `/works` and `/publications` surface the denormalized `works.citation_count` as `cited_by_count`; this domain counts `work_references` rows. Measured 2026-10-14 for `7539537`: `cited_by_count` 21,493 vs 44,750 resolved citing works here. Decide per screen which is authoritative.
- Row DTO artifacts: every citation row carries both `citing_work_id` and `cited_work_id`, but only one is populated (`citing_work_id` on `/citations`, `cited_work_id` on `/references`); `citation.context` is always `null` (no context text is stored).

---

## `GET /works/{id}/citations`

Works that **cite** the target (incoming edges), one row per citing work, matched by `cited_work_id = id` **or** by `cited_doi` equal to any DOI of the target's publications. Ordered by the newest edge (`MAX(wr.id) DESC`).

### Query parameters

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `type` | string | `all` | `all`, `POSITIVE`, `NEUTRAL`, `NEGATIVE`, `SELF` (case-insensitive) | Filter by `citation_type`; `all` = no filter. Other values → 400. |
| `page` / `limit` / `offset` | integer | 1 / 10 / — | `limit` 1..100 | Pagination. |

No `sort_by` / `cited_by_*` params.

### Example requests

```
GET /works/7539537/citations?limit=1
GET /works/7539537/citations?type=neutral&limit=20
GET /works/7539537/citations?limit=20&offset=40
GET /works/22519667/citations?limit=5        # a work with zero citations
```

### Example response (`/works/7539537/citations?limit=1`, measured 2026-10-14)

```json
{
  "status": "success",
  "data": {
    "work_id": 7539537,
    "citing_works": [
      {
        "citing_work_id": 24221083,
        "cited_work_id": null,
        "title": "Ethical AI for language assessment",
        "type": "ARTICLE",
        "publication_year": 2025,
        "venue_name": "Annual Review of Applied Linguistics",
        "venue_abbreviated_name": "Annu. Rev. Appl. Linguist.",
        "doi": "10.1017/s0267190525100081",
        "authors_count": 2,
        "citation": { "type": null, "status": "RESOLVED", "context": null }
      }
    ],
    "filters": { "type": "all" }
  },
  "pagination": { "page": 1, "limit": 1, "total": 44750, "totalPages": 44750, "hasNext": true, "hasPrev": false },
  "meta": {
    "query_time_ms": 221,
    "source": "citations_analysis",
    "filters": { "type": "all" },
    "request": { "method": "GET", "path": "/works/7539537/citations?limit=1" },
    "pagination_extras": { "offset": 0 }
  }
}
```

With no citations (`22519667`) the envelope is identical with `citing_works: []` and `pagination.total: 0`.

### Fields

| field (dot-path) | type | notes |
|---|---|---|
| `data.work_id` | integer | Path id. |
| `data.citing_works[]` | array | One entry per citing work. |
| `.citing_work_id` | integer | Link to `/works/{citing_work_id}`. |
| `.title` | string \| null | Citing work title. |
| `.type` | string \| null | Type of the citing work's latest publication. |
| `.publication_year` | integer \| null | Year of that publication. |
| `.venue_name` | string \| null | Falls back to the abbreviated name when the full name is null. |
| `.venue_abbreviated_name` | string \| null | |
| `.doi` | string \| null | DOI of that publication. |
| `.authors_count` | integer | Distinct contributors (persons) of the citing work. |
| `.citation.type` | string \| null | `MIN(citation_type)` over the edges from that citing work; `null` when untyped. Essentially all typed edges are `NEUTRAL` (7539537: 43,875 of 44,750). |
| `.citation.status` | string | `RESOLVED` if any edge is resolved, else `PENDING`, else `FAILED`. |
| `data.filters.type` / `meta.filters.type` | string | Effective filter, upper-cased (`all` when unset). |
| `pagination.total` | integer | Exact `COUNT(DISTINCT citing_work_id)` over the same match. |
| `meta.source` | string | `"citations_analysis"`. |

Latency grows with the citation count: ~0.2 s for 44,750 citations (measured 2026-10-14).

---

## `GET /works/{id}/references`

What the target work **references** (outgoing edges), paginated over its `work_references` rows (`id DESC`) and split into resolved and unresolved lists, plus whole-work `counts`. No `type` filter.

### Query parameters

| param | type | default | bounds | effect |
|---|---|---|---|---|
| `page` / `limit` / `offset` | integer | 1 / 10 / — | `limit` 1..100 | Paginates the reference rows. |

### Example requests

```
GET /works/22519667/references?limit=3
GET /works/22519667/references?limit=100      # the whole list (57 rows) in one page
```

### Example response (`/works/22519667/references?limit=100`, measured 2026-10-14; arrays trimmed)

```json
{
  "status": "success",
  "data": {
    "work_id": 22519667,
    "referenced_works": [
      {
        "citing_work_id": null,
        "cited_work_id": 2689413,
        "title": "The Book of Jerry Falwell",
        "type": "BOOK",
        "publication_year": 2018,
        "venue_name": "Book of Jerry Falwell",
        "venue_abbreviated_name": null,
        "doi": "10.2307/j.ctv301gc8",
        "authors_count": 2,
        "citation": { "type": null, "context": null }
      }
    ],
    "unresolved_references": [
      { "cited_doi": "10.1093/oso/9780198797852.003.0013", "status": "PENDING", "citation_type": "NEUTRAL", "created_at": "2026-07-23T00:25:16.000Z", "resolved_at": null }
    ],
    "unsolved": [
      { "cited_doi": "10.1093/oso/9780198797852.003.0013", "status": "PENDING", "citation_type": "NEUTRAL", "created_at": "2026-07-23T00:25:16.000Z", "resolved_at": null }
    ],
    "counts": { "total": 57, "resolved": 47, "unresolved": 10 }
  },
  "pagination": { "page": 1, "limit": 100, "total": 57, "totalPages": 1, "hasNext": false, "hasPrev": false },
  "meta": {
    "query_time_ms": 5,
    "source": "references_analysis",
    "request": { "method": "GET", "path": "/works/22519667/references?limit=100" },
    "pagination_extras": { "offset": 0 }
  }
}
```

### Fields

| field (dot-path) | type | notes |
|---|---|---|
| `data.referenced_works[]` | array | RESOLVED rows **of the current page**, one entry per `cited_work_id`. |
| `.cited_work_id` | integer | Link to `/works/{cited_work_id}`. |
| `.title` / `.type` / `.publication_year` / `.venue_name` / `.venue_abbreviated_name` / `.authors_count` | mixed | Same definitions as on `/citations`, for the referenced work. |
| `.doi` | string \| null | Referenced work's DOI, falling back to the edge's `cited_doi`. |
| `.citation` | object | `{ type, context }` — no `status` key here. |
| `data.unresolved_references[]` | array | PENDING/FAILED rows **of the current page**: `{ cited_doi, status, citation_type (default NEUTRAL), created_at, resolved_at }`. |
| `data.unsolved[]` | array | Exact alias of `unresolved_references`, kept for back-compat. |
| `data.counts.total` | integer | All reference rows of the work (`= pagination.total`). |
| `data.counts.resolved` | integer | RESOLVED rows with a `cited_work_id`, whole work. |
| `data.counts.unresolved` | integer | PENDING + FAILED rows, whole work. |
| `meta.source` | string | `"references_analysis"`. |

The two lists are **page-scoped** while `counts` covers the whole work: drive summary badges ("47 resolved · 10 unresolved") off `counts` and render the lists off the arrays. A page can show `unresolved_references: []` while `counts.unresolved > 0`. Single-digit milliseconds typical.

---

## `GET /works/{id}/metrics`

Bibliometric summary for one work: citations received, references made, citation-type breakdown, temporal span and impact flags. No query params.

### Example requests

```
GET /works/7539537/metrics       # highly cited
GET /works/22519667/metrics      # zero citations
```

### Example response (`/works/7539537/metrics`, measured 2026-10-14)

```json
{
  "status": "success",
  "data": {
    "work_id": 7539537,
    "title": "Using thematic analysis in psychology",
    "type": "ARTICLE",
    "publication_year": 2006,
    "citation_metrics": {
      "total_citations_received": 44750,
      "total_references_made": 34,
      "unique_citing_works": 44750,
      "citations_per_year": 799.11,
      "citation_types": { "positive": 0, "neutral": 43875, "negative": 0, "self": 0 }
    },
    "temporal_metrics": { "first_citation_year": 1970, "latest_citation_year": 2027, "citation_span_years": 58 },
    "impact_indicators": { "highly_cited": true, "citation_velocity": "recent" }
  },
  "meta": {
    "query_time_ms": 426,
    "source": "bibliometric_analysis",
    "request": { "method": "GET", "path": "/works/7539537/metrics" }
  }
}
```

Zero-citation case (`22519667`): every citation count `0`, `citations_per_year: 0`, the three `temporal_metrics` `null`, `highly_cited: false`, `citation_velocity: "historical"`.

### Fields

| field (dot-path) | type | notes |
|---|---|---|
| `data.type` | string \| null | Type of the latest publication (by year, then id). |
| `data.publication_year` | integer \| null | **Earliest** publication year of the work. |
| `citation_metrics.total_citations_received` | integer | RESOLVED rows with `cited_work_id = id` (DOI-only matches are not counted, unlike `/citations`). |
| `citation_metrics.total_references_made` | integer | All rows with `citing_work_id = id` (= `counts.total` on `/references`). |
| `citation_metrics.unique_citing_works` | integer | Distinct citing works among the resolved rows. |
| `citation_metrics.citations_per_year` | number | `total_citations_received ÷ max(1, currentYear − first_citation_year)`, 2 dp; `0` without citations. |
| `citation_metrics.citation_types.{positive,neutral,negative,self}` | integer | Counts per `citation_type`; untyped edges are in none of them. |
| `temporal_metrics.first_citation_year` / `latest_citation_year` | integer \| null | MIN/MAX over citing works of their earliest publication year within 1000..currentYear+1; `null` without citations. |
| `temporal_metrics.citation_span_years` | integer \| null | `latest − first + 1`. |
| `impact_indicators.highly_cited` | boolean | `total_citations_received > 100`. |
| `impact_indicators.citation_velocity` | string | `current` (latest citation year = this year), `recent` (≥ this year − 2), else `historical` (also when there are no citations). |
| `meta.source` | string | `"bibliometric_analysis"`. |

Citing-work years come from `publications.year` and contain dirty data (citing works dated before the cited work, future years such as 2027); treat the temporal fields as approximate.

---

## `GET /works/{id}/network`

Bounded citation-network graph around a central work: BFS over **RESOLVED** edges in both directions (references and citations) up to `depth` levels. No pagination.

### Query parameters

| param | type | default | bounds | effect |
|---|---|---|---|---|
| `depth` | integer | 1 | 1..3 | BFS levels; out of range → 400. |

Caps: at most **100 edges**, ~120 nodes, 200 rows per direction per level. A work with 100 or more resolved edges fills the edge cap at depth 1, so `depth=2`/`3` return the same graph (measured 2026-10-14: `7539537` → 101 nodes / 100 edges / `max_depth: 1` at every depth). `22519667` → 48 nodes / 47 edges at depth 1, 98 nodes / 100 edges / `max_depth: 2` at depth 2.

### Example response (`/works/22519667/network`, measured 2026-10-14; maps trimmed)

```json
{
  "status": "success",
  "data": {
    "central_work_id": 22519667,
    "network_depth": 1,
    "nodes": {
      "22519667": { "id": 22519667, "title": "Theological Possibilities and the Anthropology of Eastern Orthodox Christianity", "year": 2026, "is_central": true },
      "2689413": { "id": 2689413, "title": "The Book of Jerry Falwell", "year": 2018, "is_central": false }
    },
    "edges": [
      { "source": 22519667, "target": 2689413, "depth": 1, "citation_type": null, "source_year": 2026, "target_year": 2018 }
    ],
    "network_stats": { "total_nodes": 48, "total_edges": 47, "max_depth": 1 }
  },
  "meta": {
    "query_time_ms": 3,
    "source": "network_analysis",
    "complexity": { "total_nodes": 48, "total_edges": 47, "max_depth": 1 },
    "request": { "method": "GET", "path": "/works/22519667/network" }
  }
}
```

### Fields

| field (dot-path) | type | notes |
|---|---|---|
| `data.central_work_id` | integer | The path id. |
| `data.network_depth` | integer | The requested `depth` (see `max_depth` for the level actually reached). |
| `data.nodes` | object (map) | **Keyed by work-id string**, not an array; includes the central node. |
| `data.nodes.<id>.{id,title,year,is_central}` | mixed | `year` = earliest publication year; `is_central` only for the central work. |
| `data.edges[]` | array | Directed: `source` cites `target`. `{ source, target, depth, citation_type, source_year, target_year }`; `depth` = BFS level at which the edge was found. |
| `data.network_stats.total_nodes` / `total_edges` | integer | Graph size. |
| `data.network_stats.max_depth` | integer | Deepest edge level present (`0` for an empty graph). |
| `meta.complexity` | object | Duplicate of `network_stats`. |

The graph is a sample, sparser than `/references` when references are unresolved; citation type lives on edges only.
