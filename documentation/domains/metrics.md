# Metrics — aggregate ranking and yearly roll-up analytics

The metrics domain exposes five **read-only** aggregate views: a yearly publication roll-up (`/metrics/annual`) and four leaderboards over venues, institutions, persons and co-authorship pairs. Each reads operator-maintained columns or tables (`metrics_annual_summary`, `venues.works_count`, `organizations.publication_count`, `persons.total_works`) except the pair ranking, which is an `authorships` self-join. There is no Manticore involvement. All five are **public** (no `X-Access-Key`), governed only by the shared rate limiter.

Per-entity detail pages live in other domains: venue rows point at [./venues.md](./venues.md), institution rows at [./institutions.md](./institutions.md), person rows at [./persons.md](./persons.md). The pair ranking is the same statement and shape as `/collaborations/top` in [./collaborations.md](./collaborations.md).

All responses follow the shared envelope, pagination model (default page size 10, `limit` 1..100, an explicit `offset` is served as given and echoed in `meta.pagination_extras.offset`) and error codes documented in [../00-conventions.md](../00-conventions.md). A query that exceeds its statement budget returns **503** `REQUEST_TIMEOUT`, except the pair ranking, which degrades (see below). Responses are cached for 24 h when Redis is available (`metrics:annual:v6`, `metrics:venues:v4`, `metrics:institutions:v4`, `metrics:persons:v6`, `metrics:collaborations:v6`).

## Shared traits of the four leaderboards

- **`ranking` is global.** Every row carries `ranking = offset + index + 1`: on page 2 with `limit=2` the first row is `3`.
- **`meta.summary`** mixes one corpus-level count (`total_*_ranked` / `total_collaboration_pairs`, equal to `pagination.total`) with aggregates of the **current page only** (`top_*_works`, `avg_citations_per_work`, `total_citations`, `avg_collaboration_years`, the strength histogram, `venue_types`, `countries_represented`).
- **`meta.filters`** echoes the effective `limit`/`page`/`offset` and the endpoint filters; `meta.performance.controller_time_ms` and `meta.generated_at` are always present.
- **`productivity_score`** (institutions, persons) and **`primary_affiliation`** (persons) are always `null` — reserved, never computed.

---

## `GET /metrics/annual`

Yearly roll-up read from the operator-maintained `metrics_annual_summary` table (one row per year), newest year first. Years are bounded to `1000..YEAR(CURDATE())+1`. If the table were absent the API would fall back to a live aggregation over `publications` with the same row shape (`meta.summary.source = "live_aggregation"`, `scope = "current_page"`). Sub-second at any depth (~3 ms measured 2026-10-14).

### Query parameters

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `year_from` | integer | — | 1900..currentYear+1 | Inclusive lower bound on `year`. Echoed as a string in `meta.filters`. |
| `year_to` | integer | — | 1900..currentYear+1 | Inclusive upper bound. Echoed as a string. |
| `page` / `limit` / `offset` | integer | 1 / 10 / — | `limit` 1..100 | Pagination over the years (270 years in the table, 1543–2026). |

Ordering is fixed `year DESC`; there are no sort or citation params.

### Example requests

```
GET /metrics/annual?limit=10
GET /metrics/annual?year_from=2015&year_to=2024&limit=3
GET /metrics/annual?limit=10&offset=20
```

### Example response (`?limit=2`, measured 2026-10-14; second row trimmed)

```json
{
  "status": "success",
  "data": [
    {
      "year": 2026,
      "metrics": {
        "total_publications": 205986,
        "unique_works": 205982,
        "open_access_count": 164986,
        "open_access_percentage": 80.1,
        "articles": 205354,
        "books": 63,
        "unique_organizations": 53449,
        "avg_citations": 0.02
      },
      "growth": { "publications_vs_previous": null, "authors_vs_previous": null }
    },
    { "year": 2025, "metrics": { "total_publications": 370199 } }
  ],
  "pagination": { "page": 1, "limit": 2, "total": 270, "totalPages": 135, "hasNext": true, "hasPrev": false },
  "meta": {
    "summary": {
      "scope": "all_years_in_range",
      "total_years": 270,
      "date_range": "1543-2026",
      "total_publications_all_years": 7219995,
      "avg_publications_per_year": 26741,
      "growth_trend": "stable",
      "source": "metrics_annual_summary",
      "refreshed_at": "2026-07-23T22:06:14.000Z"
    },
    "filters": { "year_from": null, "year_to": null, "limit": 2, "page": 1, "offset": 0 },
    "generated_at": "2026-10-14T05:20:42.791Z",
    "performance": { "controller_time_ms": 3 },
    "request": { "method": "GET", "path": "/metrics/annual?limit=2" },
    "pagination_extras": { "offset": 0 }
  }
}
```

With `?year_from=2015&year_to=2024` the summary covers those ten years: `total_years: 10`, `date_range: "2015-2024"`, `total_publications_all_years: 2657544`, `growth_trend: "increasing"`.

### Fields — data item

| field (dot-path) | type | notes |
|---|---|---|
| `year` | integer | Grouping key. |
| `metrics.total_publications` | integer | Publications in the year. |
| `metrics.unique_works` | integer | Distinct works in the year (slightly below `total_publications`: multi-manifestation works). |
| `metrics.open_access_count` | integer | Publications with `open_access = 1`. |
| `metrics.open_access_percentage` | number | `ROUND(open_access_count * 100 / total_publications, 2)`. |
| `metrics.articles` / `metrics.books` | integer | Publications of type `ARTICLE` / `BOOK`; other types are not broken out. |
| `metrics.unique_organizations` | integer | Distinct affiliated organizations active in the year (precomputed). |
| `metrics.avg_citations` | number | Mean citations per publication in the year (precomputed); low for recent years. |
| `growth.publications_vs_previous` / `growth.authors_vs_previous` | null | Always `null` — not computed. |

There is no `total_downloads` field: download counts are not computed in the database.

### Fields — `meta.summary`

The summary covers **every year in the requested range** (all 270 years when no bounds are given), not just the page.

| field | type | notes |
|---|---|---|
| `scope` | string | `"all_years_in_range"`; `"current_page"` only on the live-aggregation fallback. |
| `total_years` | integer | Years in range (= `pagination.total`). |
| `date_range` | string \| null | `"min-max"` over the years in range. |
| `total_publications_all_years` | integer | Sum of `total_publications` over the years in range. |
| `avg_publications_per_year` | integer | `total_publications_all_years / total_years`, rounded. |
| `growth_trend` | string | Mean of the 3 most recent **complete** years (the current year is excluded) vs the mean of the 3 years before: `increasing` above +10 %, `decreasing` below −10 %, else `stable`; `insufficient_data` with fewer than 6 complete years in range. |
| `source` | string | `"metrics_annual_summary"` (or `"live_aggregation"`). |
| `refreshed_at` | string(date-time) \| null | Latest `refreshed_at` of the summary table — how current the figures are. |

The summary table is refreshed operator-side; on 2026-10-14 it dated from 2026-07-23, so recent years lag the live corpus slightly (e.g. 2025: 370,199 in the table vs 372,934 live publications). Check `refreshed_at` before presenting the figures as current.

---

## `GET /metrics/venues`

Venues ranked by `venues.works_count DESC` (tiebreak `total_score DESC`), restricted to `works_count > 0` (359,810 venues measured 2026-10-14). Pagination only; no filters, no sort override. ~0.1–0.6 s.

### Example response (`?limit=2`, measured 2026-10-14; second row trimmed)

```json
{
  "status": "success",
  "data": [
    {
      "venue_id": 1074172,
      "ranking": 1,
      "name": "International Journal of Environmental Research and Public Health",
      "abbreviated_name": "Int. J. Environ. Res. Public Heal.",
      "type": "JOURNAL",
      "metrics": { "total_works": 55552, "unique_authors": 0, "open_access_works": 0, "open_access_percentage": 0 },
      "timespan": { "first_publication_year": 1992, "latest_publication_year": 2026, "years_active": 35 }
    },
    { "venue_id": 1013446, "ranking": 2, "name": "The English Historical Review", "metrics": { "total_works": 32492 } }
  ],
  "pagination": { "page": 1, "limit": 2, "total": 359810, "totalPages": 179905, "hasNext": true, "hasPrev": false },
  "meta": {
    "summary": {
      "total_venues_ranked": 359810,
      "top_venue_publications": 55552,
      "total_unique_authors": 0,
      "avg_open_access_percentage": 0,
      "venue_types": ["JOURNAL"]
    },
    "filters": { "limit": 2, "page": 1, "offset": 0 },
    "generated_at": "2026-10-14T05:20:43.435Z",
    "performance": { "controller_time_ms": 611 },
    "request": { "method": "GET", "path": "/metrics/venues?limit=2" },
    "pagination_extras": { "offset": 0 }
  }
}
```

### Fields — data item

| field (dot-path) | type | notes |
|---|---|---|
| `venue_id` | integer | Link to `/venues/{venue_id}`. |
| `ranking` | integer | Global rank. |
| `name` / `abbreviated_name` | string / string \| null | Always surfaced together. |
| `type` | string enum | `JOURNAL \| CONFERENCE \| REPOSITORY \| BOOK_SERIES \| SOURCE_BOOK \| OTHER`. |
| `metrics.total_works` | integer | `venues.works_count` — the ranking key. |
| `metrics.unique_authors` / `metrics.open_access_works` / `metrics.open_access_percentage` | integer / integer / number | **Always `0`** — placeholders, not computed. Do not chart them; venue OA data is on the venue detail. |
| `timespan.first_publication_year` / `latest_publication_year` | integer \| null | The venue's declared coverage years (`coverage_start_year` / `coverage_end_year`), not MIN/MAX over its publications. |
| `timespan.years_active` | integer | `latest - first + 1`, else `0`. |

`meta.summary.total_unique_authors` and `avg_open_access_percentage` are placeholder zeros as well.

---

## `GET /metrics/institutions`

Organizations ranked by `organizations.publication_count DESC` (tiebreak `id ASC`), restricted to `publication_count > 0` (831,094 measured 2026-10-14). Stored metric columns are presented verbatim; the year range comes from an `authorships + publications` join over the page's organizations (`limit=100` takes ~3 s uncached).

### Query parameters

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `country_code` | string | — | exactly 2 chars (ISO 3166-1 alpha-2) | Filter; echoed in `meta.filters.country_code`. `BR` → 1,278 organizations. |
| `page` / `limit` / `offset` | integer | 1 / 10 / — | `limit` 1..100 | Pagination. |

### Example response (`?limit=2`, measured 2026-10-14; second row trimmed)

```json
{
  "status": "success",
  "data": [
    {
      "organization_id": 4551628,
      "ranking": 1,
      "name": "Universidade de São Paulo",
      "country_code": "BR",
      "metrics": {
        "total_works": 27366,
        "total_citations": 62073,
        "avg_citations": 2.27,
        "unique_researchers": 18045,
        "open_access_works_count": 41989,
        "h_index": 48
      },
      "timespan": { "first_publication_year": 1940, "latest_publication_year": 2026, "years_active": 87 },
      "productivity_score": null
    },
    { "organization_id": 4549817, "ranking": 2, "name": "University of Toronto", "metrics": { "total_works": 24839 } }
  ],
  "pagination": { "page": 1, "limit": 2, "total": 831094, "totalPages": 415547, "hasNext": true, "hasPrev": false },
  "meta": {
    "summary": {
      "total_institutions_ranked": 831094,
      "countries_represented": ["BR", "CA"],
      "top_institution_works": 27366,
      "avg_citations_per_work": 3.7,
      "total_citations": 189128
    },
    "filters": { "limit": 2, "page": 1, "offset": 0, "country_code": null },
    "generated_at": "2026-10-14T05:20:44.039Z",
    "performance": { "controller_time_ms": 479 },
    "request": { "method": "GET", "path": "/metrics/institutions?limit=2" },
    "pagination_extras": { "offset": 0 }
  }
}
```

### Fields — data item

| field (dot-path) | type | notes |
|---|---|---|
| `organization_id` | integer | Link to `/institutions/{organization_id}`. |
| `ranking` | integer | Global rank. |
| `name` / `country_code` | string / string \| null | |
| `metrics.total_works` | integer | Stored `publication_count` — the ranking key. |
| `metrics.total_citations` | integer | Stored. |
| `metrics.avg_citations` | number | `ROUND(total_citations / total_works, 2)`. |
| `metrics.unique_researchers` | integer | Stored `researcher_count`. |
| `metrics.open_access_works_count` | integer | Stored. **Scoped differently from `total_works` and can exceed it** (USP: 41,989 vs 27,366). Do not derive an OA percentage. |
| `metrics.h_index` | integer \| null | Stored. |
| `timespan.first_publication_year` / `latest_publication_year` | integer \| null | MIN/MAX publication year over affiliated works; the latest can be a future year present in the data. |
| `timespan.years_active` | integer | `latest - first + 1`, else `0`. |
| `productivity_score` | null | Always `null`. |

`meta.summary.avg_citations_per_work` is the mean of the page rows' `avg_citations`; `total_citations` sums the page rows.

---

## `GET /metrics/persons`

Researchers ranked by `persons.total_works DESC`, then `persons.id DESC`, base filter `total_works > 0` (4,903,219 persons measured 2026-10-14). Page ids are selected index-only, so deep pages stay fast (page 40,000 at `limit=100`: 0.6 s).

### Query parameters

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `min_works` | integer | — | ≥ 0 (400 otherwise) | `total_works >= min_works`; `0` or omitted adds no filter. `min_works=500` → 49 persons. |
| `organization_id` | integer | — | ≥ 1 | Persons with at least one authorship affiliated to this organization. Echoed as a **string** in `meta.filters.organization_id`. `4549817` → 13,190 persons. |
| `page` / `limit` / `offset` | integer | 1 / 10 / — | `limit` 1..100 | Pagination. |

### Example response (`?min_works=500&limit=2`, measured 2026-10-14; second row trimmed)

```json
{
  "status": "success",
  "data": [
    {
      "person_id": 10661218,
      "ranking": 1,
      "name": "Philosophy Documentation Center",
      "identifiers": { "orcid": null },
      "is_verified": false,
      "primary_affiliation": null,
      "metrics": { "total_works": 2063, "total_citations": 789, "avg_citations": 0.38 },
      "timespan": { "first_publication_year": 1952, "latest_publication_year": 2026, "years_active": 75 },
      "productivity_score": null
    },
    { "person_id": 215893, "ranking": 2, "name": "Barry Kernfeld", "metrics": { "total_works": 1359 } }
  ],
  "pagination": { "page": 1, "limit": 2, "total": 49, "totalPages": 25, "hasNext": true, "hasPrev": false },
  "meta": {
    "summary": { "total_persons_ranked": 49, "top_person_works": 2063, "avg_citations_per_work": 0.19, "total_citations": 789 },
    "filters": { "limit": 2, "page": 1, "offset": 0, "organization_id": null },
    "generated_at": "2026-10-14T05:20:48.773Z",
    "performance": { "controller_time_ms": 1 },
    "request": { "method": "GET", "path": "/metrics/persons?min_works=500&limit=2" },
    "pagination_extras": { "offset": 0 }
  }
}
```

### Fields — data item

| field (dot-path) | type | notes |
|---|---|---|
| `person_id` | integer | Link to `/persons/{person_id}`. |
| `ranking` | integer | Global rank. |
| `name` | string | `persons.preferred_name`. |
| `identifiers.orcid` | string \| null | Only ORCID is surfaced here. |
| `is_verified` | boolean \| null | `persons.is_verified`. |
| `primary_affiliation` | null | Always `null`. |
| `metrics.total_works` / `metrics.total_citations` | integer | Stored person metrics; `total_works` is the ranking key. |
| `metrics.avg_citations` | number | `ROUND(total_citations / total_works, 2)`. |
| `timespan.first_publication_year` / `latest_publication_year` | integer \| null | Stored. |
| `timespan.years_active` | integer | `latest - first + 1`, else `0`. |
| `productivity_score` | null | Always `null`. |

**Data quality.** The head of this ranking contains non-person or placeholder entities that aggregate many attributions (e.g. "Philosophy Documentation Center", "Fulano de Tal"). ORCID presence and `is_verified` are useful trust signals.

---

## `GET /metrics/collaborations`

Top co-authorship pairs. Served by the **same ranking statement as `/collaborations/top`** — pairs among the 2,000 persons with the most works (`total_works >= 30`), AUTHOR role on both sides, each shared work counted once — so rows have the identical shape and strength scale. The differences: `min_collaborations` defaults to **2** here (5 there) and there are no year filters. ~1.1–2.1 s uncached.

### Query parameters

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `min_collaborations` | integer | 2 | 1..50 | Keep pairs with `shared_works >= min_collaborations`. Echoed as a number. |
| `page` / `limit` / `offset` | integer | 1 / 10 / — | `limit` 1..100 | Pagination. |

Ordering: `shared_works DESC`, `avg_shared_citations DESC`, then the two person ids. Totals measured 2026-10-14: 5,677 pairs at the default, 1,126 at `min_collaborations=5`, 17,812 at `1`.

### Example response (`?limit=2`, measured 2026-10-14; second row trimmed)

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
    { "ranking": 2, "collaborators": { "person_1": { "id": 4908336, "name": "Fulano de Tal" }, "person_2": { "id": 10604863, "name": "No authorship indicated No authorship indicated" } } }
  ],
  "pagination": { "page": 1, "limit": 2, "total": 5677, "totalPages": 2839, "hasNext": true, "hasPrev": false },
  "meta": {
    "summary": {
      "total_collaboration_pairs": 5677,
      "strongest_collaboration_count": 779,
      "avg_collaboration_years": 83,
      "collaboration_strength_distribution": { "very_strong": 2, "strong": 0, "moderate": 0, "weak": 0 }
    },
    "filters": { "limit": 2, "page": 1, "offset": 0, "min_collaborations": 2 },
    "generated_at": "2026-10-14T05:20:50.986Z",
    "performance": { "controller_time_ms": 2122 },
    "pagination_total_exact": true,
    "request": { "method": "GET", "path": "/metrics/collaborations?limit=2" },
    "pagination_extras": { "offset": 0 }
  }
}
```

### Fields

The row fields (`ranking`, `collaborators.person_1/person_2`, `metrics.shared_works`, `metrics.avg_shared_citations`, `metrics.collaboration_strength`, `timespan.*`) are documented once in [./collaborations.md](./collaborations.md#get-collaborationstop). `meta` adds:

| field | type | notes |
|---|---|---|
| `meta.summary.total_collaboration_pairs` | integer | Exact pair count (= `pagination.total`). |
| `meta.summary.strongest_collaboration_count` | integer | `shared_works` of the page's first pair. |
| `meta.summary.avg_collaboration_years` | integer | Page mean of `collaboration_years`. |
| `meta.summary.collaboration_strength_distribution` | object | Page histogram `{ very_strong, strong, moderate, weak }`. |
| `meta.pagination_total_exact` | boolean | `true` normally; `false` together with `meta.degraded: true` when the statement exceeded its budget — the page is then empty and **is not** "no results". |
| `meta.degraded` | boolean | Present only on a degraded page. Degraded pages are not cached. |

**Data quality.** The top pairs are dominated by placeholder persons and same-person duplicates (`Fulano de Tal` / `No authorship indicated`, `Et Al` / `et al et al`, `Sassen` / `Saskia Sassen`) rather than genuine partnerships.
