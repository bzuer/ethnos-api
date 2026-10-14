# Institutions — organizations, their affiliated works, and their funded works

This domain exposes **organizations**: universities, institutes, publishers, funders and companies. It is backed entirely by the `organizations` MariaDB base table; search runs through the MariaDB `ft_organizations_name` FULLTEXT index plus an exact match against the `acronyms` JSON array (no Manticore here). Affiliated works are resolved through `authorships.affiliation_id` and funded works through `funding.funder_id`, both joining `works`/`publications`/`venues` — the same corpus surfaced by [./works.md](./works.md) and [./publications.md](./publications.md), rendered through a compact affiliated-work DTO. Person links point into [./persons.md](./persons.md).

All responses use the standard envelope, pagination (`page/limit` or `offset/limit`, default page size 10), auth/rate-limit rules, boolean/date normalization and error codes documented in [../00-conventions.md](../00-conventions.md). This chapter documents only what is specific to institutions. Every endpoint is **public** (no key required). A query that exceeds its statement budget returns **503** `REQUEST_TIMEOUT`.

> **Division of labour.** Whatever the DB stores, the API presents **verbatim and never recomputes**: the org metric columns (`works_count`, `researchers_count`, `total_citations`, `h_index`, `i10_index`, `two_yr_mean_citedness`) are the source of truth. Whatever is useful but not stored, the API **derives** from the affiliated-works corpus (year range, production by type, yearly trend, top authors, recent works), each bounded by a statement budget, gated by an include flag and degrading to an empty block on failure.

## Data reality (measured 2026-10-14)

| type | rows | rows with `publication_count > 0` (listed) |
|------|-----:|-------------------------------------------:|
| INSTITUTE | 840,134 | 827,914 |
| UNIVERSITY | 3,569 | 3,180 |
| FUNDER | 220,408 | 0 |
| PUBLISHER | 22,176 | 0 |
| COMPANY / OTHER | 0 | 0 |

- `GET /institutions` lists only publication-bearing organizations (831,094), so only `type=INSTITUTE` and `type=UNIVERSITY` return rows; the other enum values return an empty page, which is not an error.
- FUNDER and PUBLISHER organizations are reachable **only by id** (`GET /institutions/{id}`) and, for funders, through `GET /institutions/{id}/funded-works`.
- The table holds operator-side duplicates: e.g. University of Toronto is `4549817` (INSTITUTE, 24,839 works) and also `2801117` (UNIVERSITY, 128 works); Universidade de São Paulo is `4551628` (27,366 works) and `2801123` (128 works). Use the larger record; examples below do.

---

## `GET /institutions`

List or search organizations, activity-gated on `publication_count > 0`. Adding `q`/`search` switches to search mode (`meta.engine = "MariaDB-FULLTEXT"`, `query_type = "search"`, a top-level `relevance` on each row); otherwise `meta.engine = "MariaDB"`, `query_type = "list"`.

### Query parameters

| param | type | default | accepted values / bounds | effect |
|-------|------|---------|--------------------------|--------|
| `page` | integer | 1 | ≥ 1 | 1-based page. |
| `limit` | integer | 10 | 1..100 (400 outside) | Items per page. |
| `offset` | integer | — | ≥ 0 | Served as given; wins over `page`; echoed at `meta.pagination_extras.offset`. |
| `search` | string | — | 2..255 chars | See [Search semantics](#search-semantics). |
| `q` | string | — | 2..255 chars | Alias of `search`. |
| `type` | string enum | — | `UNIVERSITY,INSTITUTE,PUBLISHER,FUNDER,COMPANY,OTHER` (case-insensitive) | Filter by org type; only INSTITUTE and UNIVERSITY yield rows. |
| `openalex_type` | string | — | 2..30 chars, exact | `education`, `healthcare`, `company`, `facility`, `government`, `nonprofit`, `archive`, `funder`, `other`. |
| `country` / `country_code` | string | — | 2-letter ISO 3166-1 alpha-2 | Filter by `country_code`. |
| `status` | string enum | — | `active,inactive,withdrawn` (case-insensitive) | Lifecycle status. |
| `has_ror` | boolean | — | `true`/`false` | `true` restricts to `ror_id IS NOT NULL`; `false` applies no filter. |
| `works_min` / `works_max` | integer | — | ≥ 0 | Inclusive bounds on `works_count` (= `publication_count`). |
| `researchers_min` | integer | — | ≥ 0 | Inclusive lower bound on `researchers_count`. |
| `cited_by_min` / `cited_by_max` | integer | — | ≥ 0 | Inclusive bounds on the org-level `total_citations`. Aliases `citation_count_min` / `citation_count_max`. |
| `h_index_min` | integer | — | ≥ 0 | Inclusive lower bound on `h_index`. |
| `sort_by` | string enum | `works_count` (browse) / `relevance` (search) | `works_count, researchers_count, citations, cited_by_count, h_index, i10_index, name, id, created_at, updated_at, relevance` | `citations` == `cited_by_count` (both `total_citations`). camelCase alias `sortBy`. |
| `sort_order` | string | key-dependent | `ASC`/`DESC` | Numeric keys default `DESC`; `name`/`id` default `ASC`. camelCase alias `sortOrder`. |

Every non-relevance sort appends `id ASC` as tiebreaker. The citation bounds and sort here target the org's stored `total_citations`, not `works.citation_count`.

### Search semantics

- A row matches when its **name contains every token of 3+ characters as a word prefix** (FULLTEXT `BOOLEAN MODE`, `+token*`; InnoDB stopwords such as `of`, `the`, `de`, `for` are dropped), **or** when one of its **acronyms equals the whole term**, case-insensitively (`USP`, `samdu` → `SamDU`).
- A term made only of short tokens or stopwords matches acronyms only (`q=ab` → organizations whose acronym is `AB`; `q=of the` → no rows).
- `sort_by=relevance` (the search default) orders: exact acronym match, then exact name match, then `publication_count DESC`, then name relevance DESC, then `id`. Measured 2026-10-14: `q=Toronto Rehabilitation Institute` → the exact-name org `2805274` first (64 matches); `q=Universidade de São Paulo` → `4551628` first (1,326 matches).
- Search requests take about 0.8–1.0 s (the acronym branch scans the activity-gated rows).

### Example requests

```
GET /institutions?limit=2
GET /institutions?q=USP&limit=3
GET /institutions?sort_by=citations&sort_order=DESC&limit=10
GET /institutions?country=BR&works_min=100&h_index_min=10&limit=20
GET /institutions?type=UNIVERSITY&openalex_type=education&limit=20
```

### Example response (`?limit=2`, measured 2026-10-14; second row trimmed)

```json
{
  "status": "success",
  "data": [
    {
      "id": 4551628,
      "name": "Universidade de São Paulo",
      "type": "INSTITUTE",
      "openalex_type": "education",
      "status": "active",
      "acronyms": ["USP"],
      "location": { "country_code": "BR", "city": "São Paulo" },
      "identifiers": {
        "ror_id": "036rp1748",
        "grid_id": "grid.11899.38",
        "wikidata_id": "Q835960",
        "openalex_id": "I17974374",
        "url": "https://www5.usp.br"
      },
      "metrics": {
        "works_count": 27366,
        "researchers_count": 18045,
        "total_citations": 62073,
        "h_index": 48,
        "i10_index": 813,
        "two_yr_mean_citedness": 0.0235
      },
      "created_at": "2026-08-03T18:58:01.000Z",
      "updated_at": "2026-10-08T22:06:53.000Z",
      "_links": { "self": "/institutions/4551628" }
    },
    { "id": 4549817, "name": "University of Toronto", "type": "INSTITUTE", "acronyms": [] }
  ],
  "pagination": { "page": 1, "limit": 2, "total": 831094, "totalPages": 415547, "hasNext": true, "hasPrev": false },
  "meta": {
    "engine": "MariaDB",
    "query_type": "list",
    "elapsed_ms": 225,
    "source": "organizations",
    "sort": { "by": "works_count", "order": "DESC" },
    "pagination_total_exact": true,
    "request": { "method": "GET", "path": "/institutions?limit=2" },
    "pagination_extras": { "offset": 0 }
  }
}
```

On a search (`?q=USP&limit=3` → 531 matches) each row additionally carries `"relevance": 0` (name relevance; `0` when the row qualified through the acronym branch) and `meta` reports `"engine": "MariaDB-FULLTEXT"`, `"query_type": "search"`, `"sort": { "by": "relevance", "order": "DESC" }`.

### Fields (list item)

| field (dot-path) | type | notes |
|------------------|------|-------|
| `id` | integer | Organization id. |
| `name` | string | Canonical name. |
| `type` | string enum | `UNIVERSITY\|INSTITUTE\|PUBLISHER\|FUNDER\|COMPANY\|OTHER`; listed rows are INSTITUTE or UNIVERSITY. |
| `openalex_type` | string \| null | Finer OpenAlex type. |
| `status` | string \| null | `active\|inactive\|withdrawn`; most rows are `null`. |
| `acronyms` | string[] | May be `[]`. On detail this moves under `names`. |
| `location` | object \| null | `{ country_code, city }`; `null` when both are null. |
| `identifiers.{ror_id,grid_id,wikidata_id,openalex_id,url}` | string \| null | ROR without URL prefix, GRID, Wikidata Q-id, OpenAlex I-id, homepage. |
| `metrics.works_count` | integer | Stored `publication_count`. |
| `metrics.researchers_count` | integer | Stored `researcher_count` (distinct affiliated authors). |
| `metrics.total_citations` | integer | Stored. |
| `metrics.h_index` / `metrics.i10_index` | integer \| null | Stored. |
| `metrics.two_yr_mean_citedness` | number \| null | Stored `2yr_mean_citedness`. |
| `created_at` / `updated_at` | string(date-time) \| null | |
| `_links.self` | string | `/institutions/{id}`. |
| `relevance` | number | **Search responses only.** Name relevance (natural-language MATCH score); `0` for acronym-only matches. Informational — the row order is the ranking. |

The open-access surface is intentionally **not** exposed here: the stored `open_access_works_count` is scoped differently from `publication_count` and can exceed it (the raw count is on `/metrics/institutions`).

---

## `GET /institutions/{id}`

Full institution profile. Resolves **any existing organization regardless of activity** (0-publication FUNDER/PUBLISHER orgs included); a non-existent id returns **404** with `meta.id`. No `pagination`.

### Query parameters (include flags)

| param | type | default | effect |
|-------|------|---------|--------|
| `include_production` | `true\|false\|1\|0` | `true` | Embed `production_summary`. |
| `include_authors` | `true\|false\|1\|0` | `true` | Embed `top_authors`. |
| `include_works` | `true\|false\|1\|0` | `true` | Embed `recent_works`. |
| `include_relationships` | `true\|false\|1\|0` | `true` | Embed `relationships`. |

Any other value is a **400** (`include_works must be boolean-like (1/0/true/false)`). A flag set to false emits its block **empty** (arrays `[]`, relationship counts `0`), so the shape stays stable. `metrics.first/latest_publication_year` and `funding_role` are always computed.

### Example requests

```
GET /institutions/4549817
GET /institutions/4549817?include_production=false&include_authors=false&include_works=false&include_relationships=false
GET /institutions/694519            # a FUNDER org (0 publications) — resolves by id only
```

### Example response (`/institutions/4549817`, measured 2026-10-14; arrays trimmed)

```json
{
  "status": "success",
  "data": {
    "id": 4549817,
    "name": "University of Toronto",
    "type": "INSTITUTE",
    "openalex_type": "education",
    "status": "active",
    "location": { "country_code": "CA", "city": "Toronto" },
    "names": {
      "acronyms": [],
      "alternative_names": ["University of Toronto", "Université de Toronto"],
      "aliases_count": 2
    },
    "identifiers": {
      "ror_id": "03dbr7087", "grid_id": "grid.17063.33",
      "wikidata_id": "Q180865", "openalex_id": "I185261750",
      "url": "https://www.utoronto.ca"
    },
    "metrics": {
      "works_count": 24839, "researchers_count": 13190, "total_citations": 127055,
      "h_index": 99, "i10_index": 2407, "two_yr_mean_citedness": 0.1207,
      "first_publication_year": 1891, "latest_publication_year": 2026
    },
    "funding_role": { "funded_works_count": 0, "grants_count": 0 },
    "production_summary": {
      "by_work_type": [
        { "type": "ARTICLE", "works_count": 24138 },
        { "type": "CHAPTER", "works_count": 421 },
        { "type": "BOOK", "works_count": 186 }
      ],
      "publication_trend": [
        { "year": 2026, "works_count": 871 },
        { "year": 2025, "works_count": 1216 }
      ]
    },
    "relationships": {
      "parents": [
        { "id": 2802111, "name": "Sunnybrook Health Science Centre", "type": "INSTITUTE", "country_code": "CA", "_links": { "self": "/institutions/2802111" } }
      ],
      "children": [
        { "id": 2805274, "name": "Toronto Rehabilitation Institute", "type": "INSTITUTE", "country_code": "CA", "_links": { "self": "/institutions/2805274" } }
      ],
      "related": [
        { "id": 4604066, "name": "University Health Network", "type": "INSTITUTE", "country_code": "CA", "_links": { "self": "/institutions/4604066" } }
      ],
      "parents_count": 2,
      "children_count": 7,
      "related_count": 25
    },
    "top_authors": [
      { "person_id": 157802, "preferred_name": "Carmen H Logie", "works_count": 115, "latest_publication_year": 2026, "_links": { "self": "/persons/157802" } }
    ],
    "recent_works": [
      {
        "id": 24218470,
        "title": "Sex and play in game and porn studies",
        "subtitle": "An interdisciplinary roundtable discussion",
        "type": "ARTICLE",
        "language": "en",
        "doi": "10.1080/23268743.2026.2720648",
        "publication_year": 2026,
        "open_access": true,
        "peer_reviewed": true,
        "cited_by_count": 0,
        "references_count": 0,
        "publication": { "id": 1129313489, "year": 2026, "doi": "10.1080/23268743.2026.2720648", "volume": null, "issue": null, "pages": "1-15", "open_access": true, "peer_reviewed": true },
        "venue": { "id": 1024441, "name": "Porn Studies", "abbreviated_name": "Porn Stud.", "type": "JOURNAL" },
        "authors": { "total_count": 6, "author_string": "Harrison Charles; Charlotte Courtois; Ummni Khan; Margaret Y Macdonald; Matthew Wysocki; Jean Ketterling", "authors_preview": ["Harrison Charles", "Charlotte Courtois", "Ummni Khan"] },
        "grant_number": null,
        "grant_numbers": null,
        "_links": { "self": "/works/24218470" }
      }
    ],
    "created_at": "2026-08-03T18:56:31.000Z",
    "updated_at": "2026-10-08T21:38:48.000Z",
    "_links": {
      "self": "/institutions/4549817",
      "works": "/institutions/4549817/works",
      "funded_works": "/institutions/4549817/funded-works"
    }
  },
  "meta": { "request": { "method": "GET", "path": "/institutions/4549817" } }
}
```

### Fields (detail)

Identity, `location`, `identifiers` and the stored `metrics` are as in the list item; `acronyms` moves under `names` and there is no `relevance`.

| field | type | notes |
|-------|------|-------|
| `names.acronyms` | string[] | |
| `names.alternative_names` | string[] | Translated / historical names. |
| `names.aliases_count` | integer | `acronyms.length + alternative_names.length`. |
| `metrics.first_publication_year` / `metrics.latest_publication_year` | integer \| null | Derived: MIN/MAX publication year over the affiliated works (can be a future year present in the data). |
| `funding_role.funded_works_count` | integer | Distinct works financed by this org (`COUNT(DISTINCT work_id)` over `funding`); equals the `/funded-works` total. `0` for pure institutes. |
| `funding_role.grants_count` | integer | Distinct grant numbers. |
| `production_summary.by_work_type[]` | `{ type, works_count }` | Affiliated works per publication type, `works_count` DESC. A work with publications of two types counts under both. |
| `production_summary.publication_trend[]` | `{ year, works_count }` | Up to 15 most recent years, newest first. |
| `relationships.parents[]` / `children[]` / `related[]` | array | `{ id, name, type, country_code, _links.self }` from `organization_relationships` (read under a 200-row cap). |
| `relationships.parents_count` / `children_count` / `related_count` | integer | Lengths of the arrays. |
| `top_authors[]` | array | Up to 10 `{ person_id, preferred_name, works_count, latest_publication_year, _links.self }`; `works_count` = distinct works at this org by that person. |
| `recent_works[]` | array | Up to 10 affiliated works, newest latest-publication year first; same shape as the `/institutions/{id}/works` rows. |
| `created_at` / `updated_at` | string(date-time) \| null | |
| `_links.self` / `_links.works` / `_links.funded_works` | string | Navigation. |

Each derived block runs under its own statement budget and degrades to empty if it fails. Measured 2026-10-14: `/institutions/4549817` ~1.5 s uncached, `/institutions/694519` ~0.3 s.

---

## `GET /institutions/{id}/works`

Works whose authorships carry this organization as `affiliation_id` (`meta.match_mode = "affiliation"`, `query_type = "organization_works"`). 404 on a non-existent org id.

### Query parameters

| param | type | default | accepted values / bounds | effect |
|-------|------|---------|--------------------------|--------|
| `page` / `limit` / `offset` | integer | 1 / 10 / — | `limit` 1..100 | Standard pagination. |
| `type` | string enum | — | `ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, CONFERENCE_PAPER, REPORT, DATASET, PREPRINT, REVIEW, EDITORIAL, OTHER` (case-insensitive; anything else → 400) | Publication filter. |
| `year_from` / `year_to` | integer | — | ≥ 1500 | Publication filter: inclusive bounds on a publication's year. |
| `open_access` | boolean | — | `true`/`false` | Publication filter. |
| `peer_reviewed` | boolean | — | `true`/`false` | Publication filter. |
| `language` | string | — | 2..10 chars | Exact `works.language`. |
| `cited_by_min` / `cited_by_max` | integer | — | ≥ 0 | Inclusive bounds on `works.citation_count`. Aliases `citation_count_min` / `citation_count_max`. |
| `sort_by` | string enum | `publication_year` | `cited_by_count, references_count, publication_year, id` | Aliases: `citations`/`citation_count` → `cited_by_count`, `reference_count` → `references_count`, `year` → `publication_year`; camelCase `sortBy`. |
| `sort_order` | string | `DESC` | `ASC`/`DESC` | camelCase `sortOrder`. |

**Publication filters** (`type`, `year_from`, `year_to`, `open_access`, `peer_reviewed`) keep a work when **at least one of its publications satisfies all of them**, and the row then shows the **latest such publication** (highest publication id). Without publication filters the row shows the work's latest publication. Example (measured 2026-10-14): `/institutions/4549817/works?type=REVIEW` → 40 works, every row `type: "REVIEW"`.

### Example requests

```
GET /institutions/4549817/works?limit=20
GET /institutions/4549817/works?sort_by=cited_by_count&sort_order=DESC&limit=20
GET /institutions/4551628/works?type=BOOK&year_from=2000&limit=20
GET /institutions/4551628/works?open_access=true&cited_by_min=10&limit=20
```

### Example response (`/institutions/4549817/works?limit=2&sort_by=cited_by_count`, measured 2026-10-14; one row shown)

```json
{
  "status": "success",
  "data": [
    {
      "id": 5774951,
      "title": "Getting Personal",
      "subtitle": "Reflexivity, Positionality, and Feminist Research∗",
      "type": "ARTICLE",
      "language": "en",
      "doi": "10.1111/j.0033-0124.1994.00080.x",
      "publication_year": 1994,
      "open_access": false,
      "peer_reviewed": true,
      "cited_by_count": 720,
      "references_count": 18,
      "publication": { "id": 4246722, "year": 1994, "doi": "10.1111/j.0033-0124.1994.00080.x", "volume": "46", "issue": "1", "pages": "80-89", "open_access": false, "peer_reviewed": true },
      "venue": { "id": 1014394, "name": "The Professional Geographer", "abbreviated_name": "Prof. Geogr.", "type": "JOURNAL" },
      "authors": { "total_count": 2, "author_string": "Kim England; Kim V L England", "authors_preview": ["Kim England", "Kim V L England"] },
      "grant_number": null,
      "grant_numbers": null,
      "_links": { "self": "/works/5774951" }
    }
  ],
  "pagination": { "page": 1, "limit": 2, "total": 24839, "totalPages": 12420, "hasNext": true, "hasPrev": false },
  "meta": {
    "engine": "MariaDB",
    "query_type": "organization_works",
    "match_mode": "affiliation",
    "sort": { "by": "cited_by_count", "order": "DESC" },
    "pagination_total_exact": true,
    "request": { "method": "GET", "path": "/institutions/4549817/works?limit=2&sort_by=cited_by_count" },
    "pagination_extras": { "offset": 0 }
  }
}
```

### Fields (affiliated-work item)

This shape is shared by these rows, `recent_works[]` on the detail and `/funded-works` rows.

| field (dot-path) | type | notes |
|------------------|------|-------|
| `id` | integer | Work id. |
| `title` / `subtitle` | string \| null | |
| `type` | string enum \| null | Type of the displayed publication. |
| `language` | string \| null | `works.language`. |
| `doi` | string \| null | DOI of the displayed publication. |
| `publication_year` | integer \| null | Year of the displayed publication. |
| `open_access` / `peer_reviewed` | boolean | Of the displayed publication. |
| `cited_by_count` / `references_count` | integer | `works.citation_count` / `works.reference_count`. |
| `publication.{id,year,doi,volume,issue,pages,open_access,peer_reviewed}` | mixed | The displayed publication (navigate to `/publications/{id}`). |
| `venue` | object \| null | `{ id, name, abbreviated_name, type }`; `null` when the publication has no venue. |
| `authors.total_count` | integer | Distinct contributors (persons) on the work. |
| `authors.author_string` | string \| null | `; `-joined names, one per person (distinct person records that spell the same author differently both appear). |
| `authors.authors_preview` | string[] | First 3 names. |
| `grant_number` | string \| null | `null` on the affiliation surface and in `recent_works`; on `/funded-works` the lowest grant number of this funder on the work. |
| `grant_numbers` | string[] \| null | `null` on the affiliation surface and in `recent_works`; on `/funded-works` every distinct grant number, sorted (`[]` when none is recorded). |
| `_links.self` | string | `/works/{id}`. |

`pagination.total` is the number of distinct affiliated works matching the filters (e.g. `4549817` → 24,839, equal to its stored `works_count`); the count runs under a 2.5 s budget and `meta.pagination_total_exact` flips to `false` with an estimated total if it fires. Full work detail is on [./works.md](./works.md) `GET /works/{id}`.

---

## `GET /institutions/{id}/funded-works`

Works financed by this org acting as a funder (`funding.funder_id`; `meta.match_mode = "funder"`, `query_type = "organization_funded_works"`). Same parameters, filter semantics, sort contract and row shape as `/institutions/{id}/works`; 404 on a non-existent org id. For an INSTITUTE id the page is normally empty (`total: 0`), which is expected.

### Example requests

```
GET /institutions/694519/funded-works?limit=20
GET /institutions/694484/funded-works?sort_by=cited_by_count&limit=20
GET /institutions/4549817/funded-works?limit=20         # an INSTITUTE — empty
```

FUNDER ids with real data (all `publication_count = 0`, so reached by id only; measured 2026-10-14):

| id | funder | funded works | funding rows |
|----|--------|-------------:|-------------:|
| `694519` | National Natural Science Foundation of China | 34,974 | 51,925 |
| `694484` | National Science Foundation | 16,196 | 19,996 |
| `694715` | Social Sciences and Humanities Research Council of Canada | 10,684 | 11,536 |
| `2741433` | National Institutes of Health | 9,637 | 13,521 |
| `694426` | Economic and Social Research Council | 9,228 | 9,900 |

### Example response (`/institutions/694519/funded-works?limit=2`, measured 2026-10-14; one row trimmed)

```json
{
  "status": "success",
  "data": [
    {
      "id": 24214645,
      "title": "Traditional Chinese medicine for Helicobacter pylori infection in the antibiotic-resistance era",
      "type": "ARTICLE",
      "publication_year": 2027,
      "venue": { "id": 1014003, "name": "Journal of Ethnopharmacology", "abbreviated_name": "J. Ethnopharmacol.", "type": "JOURNAL" },
      "authors": { "total_count": 11, "author_string": "Kai Zhang; Yu Zhao; Yulei Yang; …", "authors_preview": ["Kai Zhang", "Yu Zhao", "Yulei Yang"] },
      "grant_number": "82072247",
      "grant_numbers": ["82072247", "82374154", "82574877"],
      "_links": { "self": "/works/24214645" }
    }
  ],
  "pagination": { "page": 1, "limit": 2, "total": 34974, "totalPages": 17487, "hasNext": true, "hasPrev": false },
  "meta": {
    "engine": "MariaDB",
    "query_type": "organization_funded_works",
    "match_mode": "funder",
    "sort": { "by": "publication_year", "order": "DESC" },
    "pagination_total_exact": true,
    "request": { "method": "GET", "path": "/institutions/694519/funded-works?limit=2" },
    "pagination_extras": { "offset": 0 }
  }
}
```

Publication years ahead of the current year (e.g. `2027`) are advance/online-first records present in the corpus.

---

## 404 shape (all `{id}` endpoints)

```json
{
  "status": "error",
  "message": "Institution with ID 99999999999 not found",
  "timestamp": "2026-10-14T05:20:10.747Z",
  "code": "NOT_FOUND",
  "meta": { "id": "99999999999", "request": { "method": "GET", "path": "/institutions/99999999999" } }
}
```

## Related endpoints

- `/metrics/institutions` — leaderboard by stored `publication_count`, and the one place the raw `open_access_works_count` is surfaced. See [./metrics.md](./metrics.md).
- [./works.md](./works.md), [./publications.md](./publications.md), [./persons.md](./persons.md), [./venues.md](./venues.md) for the entities linked from these payloads.
