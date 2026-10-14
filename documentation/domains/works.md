# Works — academic works (the parent record of the corpus)

The Works domain exposes the *work* entity: the parent bibliographic record that owns one or more publications (manifestations). It is backed by the `works` base table joined to `publications` (and, per row, `venues` / `organizations` / `persons` / `subjects` / `files` / `work_references`). A work is *multi-manifestation*: type, DOI, year, venue, files etc. live on the publication, so one work can carry several publications of different types (e.g. a `PREPRINT` and an `ARTICLE`). Listings use `match_mode: "any_publication"` — a work is in the result set if *any* of its publications matches the filters — and each card displays the **latest publication that matches the filters** (the one with the highest publication id among the matching ones; with no publication filter, the work's latest publication).

Search routing: the default browse and the structured filters (`type`, `language`, `year_from`/`year_to`, `open_access`, `peer_reviewed`, `venue_id`, `cited_by_min`/`cited_by_max`, the attribute sorts) run on **MariaDB**. Free-text `q` and the metadata filters `author`, `subject` and `venue_name` run on **Manticore** (`q` spans title, subtitle, abstract, authors, subjects and venue; `author` → the authors field, `subject` → the subjects field, `venue_name` → the venue field, each with AND semantics). When a full-text term is present the structured filters are applied inside Manticore as well — except `venue_id`, which cannot be combined with full-text terms (400; use `venue_name`). Every response reports the engine that served it in `meta.performance.engine` and in each row's `search_engine`.

Related domains: publications ([./publications.md](./publications.md), navigate via each row's `publication_id`), persons ([./persons.md](./persons.md), via `first_author.person_id` / authors), venues ([./venues.md](./venues.md)), institutions ([./institutions.md](./institutions.md), via author affiliations), subjects ([./subjects.md](./subjects.md)), citations ([./citations.md](./citations.md)) and courses/bibliographies ([./bibliographies.md](./bibliographies.md), the reverse of `/works/{id}/bibliographies`). The response envelope, pagination (`page`/`limit` and `offset`/`limit`), auth, rate limiting, error codes, boolean/date normalization, the shared `meta` flags and the citation/sort params are documented once in [../00-conventions.md](../00-conventions.md); this chapter only covers what is specific to works.

## Contributor roles and positions

A work credits people through `authorships`, which is keyed `(work_id, person_id, role)`. Two consequences shape every authors field in this chapter.

**`position` is 1-based per role, not per work.** An `AUTHOR` at position 1 and an `EDITOR` or `TRANSLATOR` at position 1 coexist on the same work (57,321 works, measured 2026-10-14). Sorting contributors by `position` alone interleaves the roles; the API orders by role first — `AUTHOR`, `EDITOR`, `TRANSLATOR`, `REVIEWER` — then by position, then by `person_id`. Clients should keep the order the API returns rather than re-sorting on `position`.

**The same person can hold several roles on one work.** The data pipeline has deduplicated almost all of these (163 work/person pairs remain, measured 2026-10-14), but the key allows it — typically someone who both wrote in and edited a volume — and the API does not hide it:

| field | endpoint | meaning |
|---|---|---|
| `authors[]` | `GET /works/{id}` | faithful, one entry per authorship row — a dual-role person appears twice. Role-grouped, so the AUTHOR block precedes the EDITOR block. |
| `contributors[]` | `GET /works/{id}` | the same people collapsed to one entry each, with `roles[]` listing every role held. Render this to avoid two visually identical blocks. |
| `contributor_roles` | `GET /works/{id}` | per-role tallies of the authorship rows, e.g. `{"AUTHOR": 3, "EDITOR": 3}`. |

Counts follow the person, not the row: `authors_count` (detail) and `author_count` (listings) report **distinct people**.

On listings, `authors_preview[]` is an array of plain strings (deduplicated by person, AUTHOR first) and `contributors_preview[]` carries the same people with their `role`, so a translator is distinguishable from an author. `first_author` always resolves to an `AUTHOR`-role contributor, falling back to the highest-ranked role only when the work credits no author at all.

---

Endpoints in this domain:

| Endpoint | Purpose |
|---|---|
| `GET /works` | Paginated, searchable, filterable work listing (MariaDB + Manticore). |
| `GET /works/showcase` | Browse with structured filters only; same row shape as `/works`. |
| `GET /works/{id}` | Full work detail (publications, files, authors, subjects, citations, metrics, review links). |
| `GET /works/{id}/bibliographies` | Courses whose reading list includes this work. |

---

## `GET /works`

Paginated list of works. Open (no auth). Without filters or `sort_by` the newest works (highest work id) come first.

**Query parameters**

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `page` | int | 1 | ≥1 | page number (1-based); ignored when `offset` is given. |
| `limit` | int | 10 | 1..100 | page size. |
| `offset` | int | 0 | ≥0 | rows to skip, served exactly as given and echoed in `meta.pagination_extras.offset`. |
| `q` | string | — | 2..200 chars | free text across title/subtitle/abstract/authors/subjects/venue → **Manticore**. |
| `search` | string | — | 2..200 chars | alias of `q`. |
| `author` | string | — | text | Manticore authors filter (AND semantics). |
| `subject` | string | — | text | Manticore subjects filter (AND semantics). |
| `venue_name` | string | — | text | Manticore venue filter (venue name and abbreviation, AND semantics). |
| `venue` | string | — | text | alias of `venue_name`. |
| `venue_id` | int | — | ≥1 | works with at least one publication in this venue. **400** when combined with `q`/`search`/`author`/`subject`/`venue_name`. |
| `type` | string | — | `ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, CONFERENCE_PAPER, REPORT, DATASET, PREPRINT, REVIEW, EDITORIAL, OTHER` (case-insensitive) | works with at least one publication of this type. Anything else → 400. |
| `work_type` | string | — | same enum | alias of `type`. |
| `language` | string | — | 2..5 chars | ISO 639-1 match on `works.language`. |
| `year_from` | int | — | ≥1000 | works with at least one publication dated in or after this year. |
| `year_to` | int | — | ≥1000 | works with at least one publication dated in or before this year. |
| `open_access` | bool | — | `1/0/true/false` | works with at least one publication with this open-access flag. |
| `peer_reviewed` | bool | — | `1/0/true/false` | works with at least one publication with this peer-review flag. Every publication is currently flagged peer-reviewed, so `false` returns an empty, exact page. |
| `cited_by_min` | int | — | ≥0 | inclusive lower bound on `cited_by_count` (`works.citation_count`). Alias `citation_count_min`. |
| `cited_by_max` | int | — | ≥0 | inclusive upper bound. Alias `citation_count_max`. |
| `sort_by` | string | see below | `cited_by_count, references_count, publication_year, id, relevance` (aliases `citation_count, reference_count, year, work_id`; camelCase `sortBy`) | primary sort key. |
| `sort_order` | string | `DESC` | `ASC`/`DESC`, case-insensitive (alias `sortOrder`) | sort direction. |

The publication-level filters (`type`, `year_from`/`year_to`, `open_access`, `peer_reviewed`, `venue_id`) are matched together against a single publication: `type=BOOK&year_from=2020` keeps works that have a BOOK published in or after 2020.

**Sorting**

- Without `sort_by`: relevance on the full-text path (`q`/`author`/`subject`/`venue_name`), otherwise `id DESC` (newest work first). `sort_by=relevance` without a full-text term is the same `id DESC` order.
- `cited_by_count` / `references_count` sort on `works.citation_count` / `works.reference_count`; ties break on the work id.
- `publication_year` sorts on the work's latest publication year (`works.latest_publication_year`), even when a filter selects an older publication for display. Ascending order lists the few works with no dated publication first (247, measured 2026-10-14), and descending order starts with out-of-range future years present in the source data (2098 and 2027 observed).

**Example requests**

```
GET /works?limit=1
GET /works?q=kinship&limit=10
GET /works?author=silva&type=ARTICLE&year_from=2015&limit=20
GET /works?type=ARTICLE&sort_by=cited_by_count&limit=20
GET /works?venue_id=1012159&limit=20
GET /works?cited_by_min=100&cited_by_max=500&open_access=true
GET /works?venue_name=mana&limit=20
```

**Example response** (`GET /works?limit=1`, captured 2026-10-14)

```json
{
  "status": "success",
  "data": [
    {
      "id": 24224223,
      "publication_id": 1129319242,
      "publications_count": 1,
      "title": "Region I",
      "subtitle": "Survey and Excavations of Caves along Wadiel-Makkuk and Wadi ed-Daliya",
      "abstract": null,
      "type": "ARTICLE",
      "language": "en",
      "publication_year": 2002,
      "doi": "10.70967/2948-040x.2544",
      "open_access": false,
      "peer_reviewed": true,
      "venue": {
        "id": 1058161,
        "name": "Atiqot",
        "abbreviated_name": "Atiqot",
        "type": "BOOK_SERIES",
        "issn": "2948-040X",
        "eissn": "2948-040X",
        "scopus_id": "21100202123",
        "wikidata_id": null,
        "openalex_id": "S5407036620"
      },
      "authors_preview": ["Yuval Peleg", "Nadav Hameiri"],
      "contributors_preview": [
        { "person_id": 5086026, "name": "Yuval Peleg", "role": "AUTHOR", "roles": ["AUTHOR"], "position": 1 },
        { "person_id": 11182578, "name": "Nadav Hameiri", "role": "AUTHOR", "roles": ["AUTHOR"], "position": 2 }
      ],
      "author_count": 2,
      "first_author": { "person_id": 5086026, "name": "Yuval Peleg" },
      "first_author_id": 5086026,
      "first_author_identifiers": null,
      "cited_by_count": 0,
      "references_count": 0,
      "added_to_database": "2026-10-08T20:23:23.000Z",
      "data_source": "full_api",
      "search_engine": "MariaDB",
      "_links": { "self": "/works/24224223" }
    }
  ],
  "pagination": { "page": 1, "limit": 1, "total": 7657142, "totalPages": 7657142, "hasNext": true, "hasPrev": false },
  "meta": {
    "match_mode": "any_publication",
    "pagination_total_exact": false,
    "performance": { "engine": "MariaDB", "query_type": "showcase_optimized", "primary_query_ms": 0 },
    "request": { "method": "GET", "path": "/works?limit=1" },
    "pagination_extras": { "offset": 0 }
  }
}
```

On the Manticore path (`q=kinship`) each row instead carries `data_source: "search"` and `search_engine: "Manticore"`, and `meta.performance` reports `engine: "Manticore"`, `query_type: "search"`.

**Fields** — list item (identical shape on `/works`, `/works/showcase` and the full-text variants)

| field | type | notes |
|---|---|---|
| `id` | int | work id. |
| `publication_id` | int | id of the displayed publication (the latest one matching the filters) → `/publications/{publication_id}`. |
| `publications_count` | int | total publications of this work. |
| `title` | string \| null | work title. |
| `subtitle` | string \| null | |
| `abstract` | string \| null | full abstract text; can be very long. |
| `type` | string \| null | type of the displayed publication (12-value enum above). |
| `language` | string \| null | ISO 639-1 (`works.language`). |
| `publication_year` | int \| null | year of the displayed publication. |
| `doi` | string \| null | DOI of the displayed publication. |
| `open_access` | bool \| null | flag of the displayed publication. |
| `peer_reviewed` | bool \| null | flag of the displayed publication. |
| `venue` | object \| null | venue of the displayed publication; see the venue sub-table. |
| `authors_preview` | string[] | up to 3 contributor names, deduplicated by person, AUTHOR first. |
| `contributors_preview` | object[] | the same people with their role: `{ person_id, name, role, roles[], position }`. See [Contributor roles and positions](#contributor-roles-and-positions). |
| `author_count` | int | distinct people credited across every role. |
| `first_author` | object \| null | `{ person_id, name }`; always an `AUTHOR`-role contributor when the work has one. |
| `first_author_id` | int \| null | same as `first_author.person_id`. |
| `first_author_identifiers` | null | always `null` on listings (identifiers are on the detail `authors[]`). |
| `cited_by_count` | int | incoming citations = `works.citation_count`; 0 when unknown. |
| `references_count` | int | outgoing references = `works.reference_count`; 0 when unknown. |
| `added_to_database` | string(date-time) \| null | `works.created_at`. |
| `data_source` | string | `"full_api"` (MariaDB path) or `"search"` (Manticore path). |
| `search_engine` | string | `"MariaDB"` or `"Manticore"`. |
| `_links.self` | string | `/works/{id}`. |

Venue sub-object (`venue`, and every venue block in this domain):

| field | type | notes |
|---|---|---|
| `id` | int | venue id → `/venues/{id}`. |
| `name` | string | |
| `abbreviated_name` | string \| null | always present alongside `name`. |
| `type` | string \| null | `JOURNAL, CONFERENCE, REPOSITORY, BOOK_SERIES, SOURCE_BOOK, OTHER`. |
| `issn` / `eissn` | string \| null | |
| `scopus_id` / `wikidata_id` / `openalex_id` | string \| null | external identifiers. |

**Totals, timing and degraded pages**

- `meta.match_mode` is always `"any_publication"`.
- `pagination.total` is exact (`meta.pagination_total_exact: true`) on the full-text path and on filtered MariaDB requests whose count finishes inside its 2 s budget. Measured 2026-10-14: `type=BOOK` → 388,246, `type=THESIS` → 10,614, `language=pt` → 289,191, `year_from=2020&year_to=2021` → 696,649.
- It is the fixed corpus estimate **7,657,142** with `pagination_total_exact: false` on the unfiltered browse and whenever the count exceeds its budget. That fallback is the **whole-corpus** figure, not an approximation of the filtered set — e.g. `open_access=true` or `type=ARTICLE` answer 7,657,142 although the rows are correctly filtered. Treat `false` as "no usable total" and page with `hasNext` / `data.length`. Such a request takes about 2 s, because the response waits for the count budget.
- The page is selected by one of three plans, chosen by the filters and the sort:
  - **default order (`id`) with a publication filter** (`type`, years, `open_access`, `peer_reviewed`, `venue_id`): the page is read from the publications index in work-id order, so rare and common filters page alike — `type=PREPRINT&limit=100&page=15` and `venue_id=1012159&limit=100&page=2` answer in ~0.02 s, `type=ARTICLE&limit=100&page=1000` in ~0.3 s;
  - **citation, reference or year sort with a publication filter**: when the filtered set is at most 250,000 works (exact count), the page is sorted over that set (`type=BOOK&sort_by=cited_by_count&page=3` ~0.5 s, `type=PREPRINT&sort_by=cited_by_count` ~0.02 s); a larger set walks the works index in sort order and checks each work for a matching publication (`type=ARTICLE&sort_by=cited_by_count` selects its page in ~0.02 s, but the response waits for the 2 s count budget);
  - **no publication filter**: the works index in the requested order.
- If the page query still exceeds its statement budget, the response is `200` with `data: []`, `meta.page_degraded: true`, a `meta.note` and `pagination_total_exact: false` — never a 500/503. A deep page of a large filtered set sorted by citations is the remaining case that can degrade; narrow the filters or use [`/publications`](./publications.md), which pages any publication filter exactly.
- Full-text results can be paged through the first 100,000 matches; `offset + limit` beyond that is a 400 `VALIDATION_ERROR`.
- **Full-text pages can under-fill** (`data.length < limit` on a page that is not the last) when the search index still holds works that were since deleted or merged: their ids match but no longer hydrate. Rely on `pagination.hasNext`, not the row count.
- The list card shows the latest **matching** publication, while `GET /works/{id}` picks its primary publication by latest year, then files, then id. For a work with several publications the card and the detail can therefore show different years, DOIs or types (e.g. work 19153405: `/works?q=…` shows its 2003 BOOK, `/works/19153405` its 2005 ARTICLE; `/works?…&type=ARTICLE` shows the ARTICLE).
- `has_files` is not a `/works` filter (it is ignored); use `/publications?has_files=true`.

---

## `GET /works/showcase`

MariaDB browse with the same row shape and `meta` as `GET /works`. Open (no auth). It accepts only the structured filters below; `q`/`search`/`author`/`subject`/`venue_name` are ignored (`q`/`search` are still length-validated).

**Query parameters**

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `page` | int | 1 | ≥1 | page number; ignored when `offset` is given. |
| `limit` | int | 10 | 1..100 | page size. |
| `offset` | int | 0 | ≥0 | rows to skip, served as given. |
| `type` / `work_type` | string | — | same 12-value enum as `/works`, case-insensitive | publication type filter. |
| `year_from` / `year_to` | int | — | ≥1000 | publication year range. |
| `language` | string | — | 2..5 chars | ISO 639-1 match. |
| `open_access` | bool | — | `1/0/true/false` | publication open-access flag. |
| `peer_reviewed` | bool | — | `1/0/true/false` | publication peer-review flag. |
| `venue_id` | int | — | ≥1 | publication venue. |
| `cited_by_min` / `cited_by_max` | int | — | ≥0 | inclusive citation bounds (aliases `citation_count_min` / `citation_count_max`). |
| `sort_by` | string | `id DESC` | `cited_by_count, references_count, publication_year, id` | primary sort. |
| `sort_order` | string | `DESC` | `ASC`/`DESC` | direction. |

**Example requests**

```
GET /works/showcase?limit=20
GET /works/showcase?type=BOOK&limit=20
GET /works/showcase?year_from=2020&year_to=2023&sort_by=cited_by_count
```

**Example response** (`GET /works/showcase?limit=1&type=BOOK`, captured 2026-10-14)

```json
{
  "status": "success",
  "data": [
    {
      "id": 24211083,
      "publication_id": 1129306108,
      "publications_count": 1,
      "title": "Cognitive-Behavioral Therapy",
      "subtitle": null,
      "abstract": null,
      "type": "BOOK",
      "language": "en",
      "publication_year": 2017,
      "doi": null,
      "open_access": false,
      "peer_reviewed": true,
      "venue": { "id": 1916723, "name": "Cognitive-behavioral therapy (2nd ed.).", "abbreviated_name": null, "type": "SOURCE_BOOK", "issn": null, "eissn": null, "scopus_id": null, "wikidata_id": null, "openalex_id": null },
      "authors_preview": ["American Psychological Association Staff", "Michelle G Craske"],
      "contributors_preview": [
        { "person_id": 9302562, "name": "American Psychological Association Staff", "role": "AUTHOR", "roles": ["AUTHOR"], "position": 1 },
        { "person_id": 1300096, "name": "Michelle G Craske", "role": "AUTHOR", "roles": ["AUTHOR"], "position": 2 }
      ],
      "author_count": 2,
      "first_author": { "person_id": 9302562, "name": "American Psychological Association Staff" },
      "first_author_id": 9302562,
      "first_author_identifiers": null,
      "cited_by_count": 0,
      "references_count": 0,
      "added_to_database": "2026-09-30T23:39:25.000Z",
      "data_source": "full_api",
      "search_engine": "MariaDB",
      "_links": { "self": "/works/24211083" }
    }
  ],
  "pagination": { "page": 1, "limit": 1, "total": 388246, "totalPages": 388246, "hasNext": true, "hasPrev": false },
  "meta": {
    "match_mode": "any_publication",
    "pagination_total_exact": true,
    "performance": { "engine": "MariaDB", "query_type": "showcase_optimized", "primary_query_ms": 449 },
    "request": { "method": "GET", "path": "/works/showcase?limit=1&type=BOOK" },
    "pagination_extras": { "offset": 0 }
  }
}
```

Totals, the corpus-estimate fallback and degraded pages behave exactly as on `/works` (see above).

---

## `GET /works/{id}`

Full detail payload for one work: every publication embedded, plus work-level aggregations (primary publication, files, venues roll-up, authors, subjects, citations, metrics, funding, review links). Open (no auth).

**Path parameters**

| param | type | notes |
|---|---|---|
| `id` | int (≥1) | work id. Non-integer → 400 `VALIDATION_ERROR`; unknown → 404 `NOT_FOUND` (`"Work with ID {id} not found"`). |

**Query parameters**

| param | type | default | accepted values | effect |
|---|---|---|---|---|
| `include_citations` | bool | true | `false`/`0`/`no` disable; anything else keeps it | when disabled, `citations.cited_by` is `null`. |
| `include_references` | bool | true | `false`/`0`/`no` disable; anything else keeps it | when disabled, `citations.references`, `citations.unresolved_references` and `citations.unsolved` are `null`. |

The two flags are independent; the `citations` object is always present.

**Example requests**

```
GET /works/7539537
GET /works/7539537?include_citations=false&include_references=false
GET /works/19121098                       # a PREPRINT + ARTICLE work
```

**Example response** (`GET /works/7539537`, captured 2026-10-14, arrays trimmed to one element)

```json
{
  "status": "success",
  "data": {
    "id": 7539537,
    "_links": { "self": "/works/7539537" },
    "title": "Using thematic analysis in psychology",
    "subtitle": null,
    "abstract": "Increasingly, adult Indigenous language learners are being i… (long)",
    "type": "ARTICLE",
    "language": "en",
    "publication_year": 2006,
    "doi": "10.1191/1478088706qp063oa",
    "open_access": true,
    "peer_reviewed": true,
    "has_files": true,
    "venue": { "id": 1014042, "name": "Qualitative Research in Psychology", "abbreviated_name": "Qual. Res. Psychol.", "type": "JOURNAL", "issn": "1478-0887", "eissn": "1478-0895", "scopus_id": "5100155099", "wikidata_id": "Q15749868", "openalex_id": "S51001188" },
    "year_range": { "earliest": 2006, "latest": 2006 },
    "languages": ["en"],
    "summary_updated_at": "2026-07-22T16:55:15.000Z",
    "primary_publication_id": 1112638398,
    "primary_publication": {
      "id": 1112638398, "doi": "10.1191/1478088706qp063oa", "publication_year": 2006,
      "publication_date": "2006-01-01T00:00:00.000Z", "volume": "3", "issue": "2", "pages": "77-101",
      "open_access": true, "peer_reviewed": true, "has_files": true,
      "venue": { "id": 1014042, "name": "Qualitative Research in Psychology", "abbreviated_name": "Qual. Res. Psychol.", "type": "JOURNAL", "issn": "1478-0887", "eissn": "1478-0895", "scopus_id": "5100155099", "wikidata_id": "Q15749868", "openalex_id": "S51001188" },
      "publisher": { "id": 693664, "name": "Taylor & Francis", "type": "PUBLISHER", "country": "GB", "ror_id": null, "wikidata_id": "Q880582", "openalex_id": "P4310320547", "url": "https://www.taylorfrancis.com" },
      "source": "openalex", "license_url": "other-oa", "license_version": "publishedVersion",
      "_links": { "self": "/publications/1112638398" }
    },
    "files": [
      {
        "file_id": 9648677, "publication_id": 1112638398, "md5": "76dd10b645a4c2d1e2a266def1ea1804",
        "format": "PDF", "size": null, "pages": null, "language": null, "version": null, "role": "MAIN",
        "libgen_id": null, "scimag_id": null, "openacess_id": "doi:10.1191/1478088706qp063oa",
        "best_oa_url": "https://www.tandfonline.com/doi/abs/10.1191/1478088706qp063oa",
        "verification": "PENDING", "download_count": 0
      }
    ],
    "file_summary": { "files_returned": 2, "files_total": 2, "files_truncated": false, "publications_with_files": 1, "total_download_count": 0, "best_oa_url": "https://www.tandfonline.com/doi/abs/10.1191/1478088706qp063oa", "by_format": { "PDF": 2 }, "by_role": { "MAIN": 2 }, "has_scimag": true, "has_libgen": false, "has_open_access": true },
    "venues": [
      { "id": 1014042, "name": "Qualitative Research in Psychology", "abbreviated_name": "Qual. Res. Psychol.", "type": "JOURNAL", "issn": "1478-0887", "eissn": "1478-0895", "scopus_id": "5100155099", "wikidata_id": "Q15749868", "openalex_id": "S51001188", "publication_count": 1, "latest_year": 2006 }
    ],
    "publications": [
      {
        "id": 1112638398,
        "type": "ARTICLE",
        "identifiers": { "doi": "10.1191/1478088706qp063oa", "pmid": null, "pmcid": null, "arxiv": null, "wos_id": null, "handle": null, "wikidata_id": null, "openalex_id": "W1979290264", "isbn": null, "openlibrary_id": null, "scielo_pid": null, "google_book_id": null },
        "publication_date": "2006-01-01T00:00:00.000Z", "publication_year": 2006,
        "volume": "3", "issue": "2", "pages": "77-101", "language": "en",
        "open_access": true, "peer_reviewed": true, "has_files": true,
        "has_scimag_file": true, "has_libgen_file": false,
        "license_url": "other-oa", "license_version": "publishedVersion", "source": "openalex",
        "source_indexed_at": "2026-07-19T12:19:00.000Z",
        "venue": { "id": 1014042, "name": "Qualitative Research in Psychology", "abbreviated_name": "Qual. Res. Psychol.", "type": "JOURNAL", "issn": "1478-0887", "eissn": "1478-0895", "scopus_id": "5100155099", "wikidata_id": "Q15749868", "openalex_id": "S51001188" },
        "publisher": { "id": 693664, "name": "Taylor & Francis", "type": "PUBLISHER", "country": "GB", "ror_id": null, "wikidata_id": "Q880582", "openalex_id": "P4310320547", "url": "https://www.taylorfrancis.com" },
        "files": [ /* per-publication file entries, same shape as files[] minus publication_id */ ],
        "reviewed_work_id": null,
        "created_at": "2026-03-13T19:56:42.000Z",
        "updated_at": "2026-07-22T03:30:21.000Z",
        "_links": { "self": "/publications/1112638398" },
        "is_primary": true
      }
    ],
    "publications_total": 1,
    "publications_has_more": false,
    "review_relations": {
      "is_review": false, "reviews_of": [],
      "is_reviewed": false, "reviewed_by": [], "reviewed_by_total": 0, "reviewed_by_has_more": false
    },
    "identifiers": { "doi": ["10.1191/1478088706qp063oa"], "openalex_id": ["W1979290264"] },
    "authors": [
      {
        "person_id": 7922, "preferred_name": "Braun", "given_names": null, "family_name": "Braun",
        "identifiers": { "orcid": "0000-0002-3435-091X", "scopus_id": null, "lattes_id": null },
        "role": "AUTHOR", "position": 1, "is_corresponding": true, "affiliation": null
      }
      // ... (3 total, one entry per authorship row, role-grouped)
    ],
    "authors_count": 3,
    "contributors": [
      {
        "person_id": 7922, "preferred_name": "Braun", "given_names": null, "family_name": "Braun",
        "identifiers": { "orcid": "0000-0002-3435-091X", "scopus_id": null, "lattes_id": null },
        "roles": ["AUTHOR"], "position": 1, "is_corresponding": true, "affiliation": null
      }
      // ... (3 total)
    ],
    "contributor_roles": { "AUTHOR": 3 },
    "subjects": [
      { "subject_id": 341989, "term": "Cartography", "vocabulary": "Keyword", "lang": "en", "relevance_score": 1, "assigned_by": "AUTHOR" }
      // ... (17 total)
    ],
    "citations": {
      "cited_by": [
        { "work_id": 24221083, "title": "Ethical AI for language assessment", "authors": "Evelina Galaczi; Carla PASTORINO-CAMPOS", "publication_year": 2025, "venue_name": "Annual Review of Applied Linguistics", "venue_abbreviated_name": "Annu. Rev. Appl. Linguist.", "open_access": true, "citation_type": "NEUTRAL", "citation_status": "RESOLVED", "citation_context": null }
        // ... (100, the cap)
      ],
      "references": [
        { "work_id": 24201791, "title": "Subjectivity and method in psychology", "authors": "Wendy Hollway", "publication_year": 1989, "venue_name": "Subjectivity and method in psychology", "venue_abbreviated_name": null, "doi": "10.2307/3791398", "open_access": false, "citation_type": "NEUTRAL", "citation_context": null }
        // ... (27 total)
      ],
      "unresolved_references": [
        { "cited_doi": "10.1348/014466500163031", "status": "PENDING", "citation_type": "NEUTRAL", "created_at": "2026-07-19T20:34:21.000Z", "resolved_at": null }
        // ... (7 total)
      ],
      "unsolved": [ /* same content as unresolved_references */ ]
    },
    "metrics": {
      "citation_count": 21493, "reference_count": 11, "download_count": 0, "view_count": 0,
      "altmetric_score": null, "social_media_mentions": 0, "news_mentions": 0,
      "publications_count": 1, "publications_with_files_count": 1, "publications_open_access_count": 1,
      "publications_peer_reviewed_count": 1, "distinct_venues_count": 1,
      "total_files_count": 2, "total_files_download_count": 0, "metrics_last_updated": "2026-07-22T16:55:15.000Z"
    },
    "funding": [],
    "created_at": "2026-03-13T19:56:42.000Z",
    "updated_at": "2026-07-22T16:55:15.000Z"
  }
}
```

**Fields** — top-level `data`

| field | type | notes |
|---|---|---|
| `id` | int | work id. |
| `_links.self` | string | `/works/{id}`. |
| `title` / `subtitle` / `abstract` | string \| null | |
| `type` | string \| null | type of the primary publication (12-value enum). |
| `language` | string \| null | work-level language (`works.language`). |
| `publication_year` | int \| null | primary publication year. |
| `doi` | string \| null | primary publication DOI. |
| `open_access` | bool | true if **any** embedded publication is open access. |
| `peer_reviewed` | bool | true if **any** embedded publication is peer-reviewed. |
| `has_files` | bool | true if any embedded publication has files. |
| `venue` | object \| null | primary publication venue (venue sub-shape). |
| `year_range.earliest` / `.latest` | int \| null | min/max year over the embedded publications. |
| `languages` | string[] | the work language as a one-element array (empty when unknown); publications carry no language of their own. |
| `summary_updated_at` | string(date-time) \| null | `works.metrics_last_updated`. |
| `primary_publication_id` | int \| null | picker: latest year → has files → highest publication id. This can differ from the publication a list card shows (see the `/works` notes). |
| `primary_publication` | object \| null | compact block, see sub-table. |
| `files` | object[] | flat work-level file aggregation, see sub-table. |
| `file_summary` | object | file roll-up, see sub-table. |
| `venues` | object[] | distinct-venue roll-up: venue fields + `publication_count` + `latest_year`; ordered `publication_count DESC, latest_year DESC`. |
| `publications` | object[] | full per-publication entries (capped at 50), see sub-table. |
| `publications_total` | int | true number of publications (counted separately when over 50). |
| `publications_has_more` | bool | true when more than 50 publications exist. |
| `review_relations` | object | review links in both directions (always present), see below. |
| `identifiers` | object | union of the embedded publications' identifiers; a key appears only when non-empty, each value a string array. Possible keys: `doi, pmid, pmcid, arxiv, wos_id, handle, wikidata_id, openalex_id, isbn, openlibrary_id, scielo_pid, google_book_id`. |
| `authors` | object[] | see sub-table. |
| `authors_count` | int | distinct people across every role. |
| `contributors` | object[] | one entry per person: the `authors[]` fields with `roles[]` instead of `role`. |
| `contributor_roles` | object(map) | authorship rows per role. |
| `subjects` | object[] | see sub-table. |
| `citations` | object | `cited_by`, `references`, `unresolved_references`, `unsolved` — see sub-tables; individual blocks are `null` when excluded by the include flags. |
| `metrics` | object | see sub-table. |
| `funding` | object[] | `{ funder_id, funder_name, grant_number }`; empty when no funding is recorded. |
| `created_at` / `updated_at` | string(date-time) \| null | work timestamps. |

`primary_publication` block:

| field | type | notes |
|---|---|---|
| `id` | int | publication id → `/publications/{id}`. |
| `doi` | string \| null | |
| `publication_year` | int \| null | |
| `publication_date` | string(date-time) \| null | |
| `volume` / `issue` / `pages` | string \| null | |
| `open_access` / `peer_reviewed` / `has_files` | bool | |
| `venue` | object \| null | venue sub-shape. |
| `publisher` | object \| null | `{ id, name, type, country, ror_id, wikidata_id, openalex_id, url }`. |
| `source` | string \| null | provenance, e.g. `"crossref"`, `"openalex"`. |
| `license_url` / `license_version` | string \| null | `license_url` may hold a licence code (e.g. `"other-oa"`) rather than a URL. |
| `_links.self` | string | `/publications/{id}`. |

`files[]` entry (flat, capped at 50; sorted role `MAIN > SUPPLEMENT > COVER > PREVIEW`, then verification `VERIFIED` first, then `publication_id` DESC):

| field | type | notes |
|---|---|---|
| `file_id` | int | |
| `publication_id` | int | parent publication. |
| `md5` | string \| null | |
| `format` | string \| null | e.g. `PDF`. |
| `size` | int \| null | bytes. |
| `pages` | int \| null | |
| `language` | string \| null | |
| `version` | string \| null | |
| `role` | string | `MAIN, SUPPLEMENT, COVER, PREVIEW`. |
| `libgen_id` / `scimag_id` | int \| null | source-specific ids. |
| `openacess_id` | string \| null | may hold `doi:…` (note the spelling). |
| `best_oa_url` | string \| null | open-access URL. |
| `verification` | string \| null | `PENDING, VERIFIED, FAILED, CORRUPTED`. |
| `download_count` | int | |

`file_summary` block:

| field | type | notes |
|---|---|---|
| `files_returned` | int | entries in `files[]` (≤50). |
| `files_total` | int | files across the embedded publications. |
| `files_truncated` | bool | true when `files_total > files_returned`. |
| `publications_with_files` | int | |
| `total_download_count` | int | |
| `best_oa_url` | string \| null | |
| `by_format` | object(map) | `{ "PDF": 2, ... }`. |
| `by_role` | object(map) | `{ "MAIN": 2, ... }`. |
| `has_scimag` / `has_libgen` / `has_open_access` | bool | roll-up flags. |

`publications[]` entry (capped at 50, ordered by year then id, newest first):

| field | type | notes |
|---|---|---|
| `id` | int | publication id. |
| `type` | string \| null | this publication's type (12-value enum) — manifestations of one work can differ (`/works/19121098`: an `ARTICLE` and a `PREPRINT`). |
| `identifiers` | object | 12 keys: `doi, pmid, pmcid, arxiv, wos_id, handle, wikidata_id, openalex_id, isbn, openlibrary_id, scielo_pid, google_book_id`; each string or null. |
| `publication_date` | string(date-time) \| null | |
| `publication_year` | int \| null | |
| `volume` / `issue` / `pages` | string \| null | |
| `language` | string \| null | the work language. |
| `open_access` / `peer_reviewed` / `has_files` | bool | |
| `has_scimag_file` / `has_libgen_file` | bool | |
| `license_url` / `license_version` | string \| null | |
| `source` | string \| null | |
| `source_indexed_at` | string(date-time) \| null | when the source last indexed this record. |
| `venue` | object \| null | venue sub-shape. |
| `publisher` | object \| null | publisher sub-shape. |
| `files` | object[] | this publication's files: the `files[]` shape without `publication_id`. |
| `reviewed_work_id` | int \| null | when this publication is a review, the id of the work it reviews (`publications.reviewed_id`); equals this work's id when the review was collapsed into the reviewed work itself. |
| `created_at` / `updated_at` | string(date-time) \| null | publication record timestamps. |
| `_links.self` | string | `/publications/{id}`. |
| `is_primary` | bool | true for the primary publication. |

`authors[]` entry:

| field | type | notes |
|---|---|---|
| `person_id` | int | → `/persons/{person_id}`. |
| `preferred_name` | string | |
| `given_names` / `family_name` | string \| null | |
| `identifiers` | object | `{ orcid, scopus_id, lattes_id }`, each string or null. |
| `role` | string | `AUTHOR` \| `EDITOR` \| `TRANSLATOR` \| `REVIEWER`. |
| `position` | int | 1-based **within the role**. |
| `is_corresponding` | bool | |
| `affiliation` | object \| null | `{ id, name, type, country, _links.self }` (`_links.self` → `/institutions/{id}`). |

`subjects[]` entry:

| field | type | notes |
|---|---|---|
| `subject_id` | int | → `/subjects/{id}`. |
| `term` | string | |
| `vocabulary` | string | as stored, e.g. `Keyword`, `OpenAlex`, `Scopus`. |
| `lang` | string \| null | |
| `relevance_score` | number | placeholder, typically `1`. |
| `assigned_by` | string | e.g. `AUTHOR`, `SYSTEM`. |

`citations.cited_by[]` (works citing this one, most recently recorded citation first, capped at 100):

| field | type | notes |
|---|---|---|
| `work_id` | int | citing work → `/works/{work_id}`. |
| `title` | string \| null | |
| `authors` | string \| null | `"; "`-joined names of up to 3 contributors. |
| `publication_year` | int \| null | |
| `venue_name` / `venue_abbreviated_name` | string \| null | |
| `open_access` | bool \| null | |
| `citation_type` | string | default `NEUTRAL`. |
| `citation_status` | string | `RESOLVED`, `PENDING` or `FAILED`. |
| `citation_context` | string \| null | currently always null. |

`citations.references[]` (resolved outgoing references, capped at 100): same shape as `cited_by` plus `doi` (string \| null), without `citation_status`.

`citations.unresolved_references[]` (and its alias `citations.unsolved[]`, identical content):

| field | type | notes |
|---|---|---|
| `cited_doi` | string \| null | DOI of the not-yet-resolved reference. |
| `status` | string | `PENDING` (expected: the cited work is not in the corpus yet) or `FAILED`. |
| `citation_type` | string | default `NEUTRAL`. |
| `created_at` | string(date-time) \| null | |
| `resolved_at` | string(date-time) \| null | |

`metrics` block:

| field | type | notes |
|---|---|---|
| `citation_count` | int | `works.citation_count` (maintained by the data pipeline; it can differ from the number of `cited_by` rows). |
| `reference_count` | int | `works.reference_count`. |
| `download_count` / `view_count` | int \| null | |
| `altmetric_score` | number \| null | |
| `social_media_mentions` / `news_mentions` | int \| null | |
| `publications_count` | int | equals `publications_total`. |
| `publications_with_files_count` / `publications_open_access_count` / `publications_peer_reviewed_count` | int | over the embedded publications. |
| `distinct_venues_count` | int | |
| `total_files_count` / `total_files_download_count` | int | |
| `metrics_last_updated` | string(date-time) \| null | |

`review_relations` block — review links read from `publications.reviewed_id` (a review publication points at the work it reviews). Measured 2026-10-14: 25,249 publications carry one (almost all of type `REVIEW`), covering 19,718 reviewed works — mostly books — with at most 10 reviews each.

| field | type | notes |
|---|---|---|
| `is_review` | bool | true when at least one publication of this work reviews **another** work. |
| `reviews_of` | object[] | distinct works this work reviews (capped at 50), in order of the first reviewing publication; never the work itself. |
| `reviews_of[].work_id` | int | the reviewed work. |
| `reviews_of[].title` / `subtitle` | string \| null | |
| `reviews_of[].publication_year` | int \| null | latest publication year of the reviewed work. |
| `reviews_of[].authors_preview` | string[] | up to 3 distinct names of the reviewed work's contributors. |
| `reviews_of[].contributors_preview` | object[] | same people as `{ person_id, name, role, roles[], position }`. |
| `reviews_of[].via_publication_ids` | int[] | which of this work's publications review it (each also carries `reviewed_work_id`). |
| `reviews_of[].same_work` | bool | always `false` here; `true` only on [`GET /publications/{id}`](./publications.md) for a review collapsed into its book's work. |
| `reviews_of[]._links.self` | string | `/works/{work_id}`. |
| `is_reviewed` | bool | true when at least one publication reviews this work. |
| `reviewed_by` | object[] | the review publications of this work, newest first (capped at 50). |
| `reviewed_by[].publication_id` | int | the review publication. |
| `reviewed_by[].work_id` | int | the work the review belongs to. |
| `reviewed_by[].title` / `subtitle` | string \| null | the review's own title (often repeats the reviewed book's title). |
| `reviewed_by[].type` | string \| null | publication type, normally `REVIEW`. |
| `reviewed_by[].publication_year` / `publication_date` | int / string \| null | when the review appeared. |
| `reviewed_by[].doi` | string \| null | DOI of the review. |
| `reviewed_by[].venue` | object \| null | `{ id, name, abbreviated_name, _links.self }` — the journal that published the review. |
| `reviewed_by[].authors_preview` | string[] | up to 3 distinct names of the reviewers. |
| `reviewed_by[].contributors_preview` | object[] | same people as `{ person_id, name, role, roles[], position }`. |
| `reviewed_by[].same_work` | bool | true when the review publication belongs to this very work (collapsed review; it also appears in `publications[]` with `reviewed_work_id` = this id). |
| `reviewed_by[]._links` | object | `self` → `/publications/{publication_id}`, `work` → `/works/{work_id}`. |
| `reviewed_by_total` | int | true number of review publications. |
| `reviewed_by_has_more` | bool | true when `reviewed_by` was truncated at 50. |

Real pair — the book `GET /works/23400326` (*Environmental Magnetism*, Thompson & Oldfield, 1986) and its review `GET /works/23384268`:

```json
// GET /works/23400326 → data.review_relations
{
  "is_review": false,
  "reviews_of": [],
  "is_reviewed": true,
  "reviewed_by": [
    {
      "publication_id": 1128473948,
      "work_id": 23384268,
      "title": "Environmental magnetism",
      "subtitle": null,
      "type": "REVIEW",
      "publication_year": 1987,
      "publication_date": "1987-01-01T00:00:00.000Z",
      "doi": "10.1016/0277-3791(87)90024-2",
      "venue": { "id": 1342750, "name": "Quaternary Science Reviews", "abbreviated_name": "Quat. Sci. Rev.", "_links": { "self": "/venues/1342750" } },
      "authors_preview": ["J Dearing", "Joel B Dearing"],
      "contributors_preview": [ { "person_id": 10748880, "name": "J Dearing", "role": "AUTHOR", "roles": ["AUTHOR"], "position": 1 } /* … */ ],
      "same_work": false,
      "_links": { "self": "/publications/1128473948", "work": "/works/23384268" }
    }
  ],
  "reviewed_by_total": 1,
  "reviewed_by_has_more": false
}

// GET /works/23384268 → data.review_relations.reviews_of
[
  {
    "work_id": 23400326,
    "title": "Environmental Magnetism",
    "subtitle": null,
    "publication_year": 1986,
    "authors_preview": ["Roy Thompson", "Frank Oldfield"],
    "contributors_preview": [ { "person_id": 3604520, "name": "Roy Thompson", "role": "AUTHOR", "roles": ["AUTHOR"], "position": 1 } /* … */ ],
    "via_publication_ids": [1128473948],
    "same_work": false,
    "_links": { "self": "/works/23400326" }
  }
]
```

**Notes / caveats**

- `publications`, `files`, `citations.cited_by` and `citations.references` are capped (50 / 50 / 100 / 100). Use `publications_has_more` / `file_summary.files_truncated` and the dedicated [`/publications?work_id={id}`](./publications.md) and [`/works/{id}/citations|references`](./citations.md) endpoints for the full lists.
- Use `include_citations=false` / `include_references=false` to shrink the payload when the UI does not render those blocks.
- `unsolved` repeats `unresolved_references`; read one of them.
- **Reviews.** A review collapsed into the reviewed book's own work (138 cases, measured 2026-10-14) shows up only in `reviewed_by`, with `same_work: true`; such a book work can then display `type: "REVIEW"` when the review is its primary publication. Reviewer lists come from the source metadata and sometimes also credit the reviewed author, or the same reviewer under two person records.
- Works with very long author lists produce large payloads (2,033 authors → about 1.1 MB), because `authors[]` and `contributors[]` both list everyone.
- Every database statement is bounded (4.5 s); a detail request that exceeds it answers 503 `REQUEST_TIMEOUT` and can be retried. A first, uncached request for a heavily cited work can take a few seconds (`/works/7539537`: 3.5 s cold, measured 2026-10-14).

---

## `GET /works/{id}/bibliographies`

Lists the courses whose reading list includes this work (reverse of the courses/bibliography domain). Open (no auth).

**Path parameters**

| param | type | notes |
|---|---|---|
| `id` | int (≥1) | work id; non-integer → 400; an unknown work → **404**. An existing work that no course lists returns an empty `200`. |

**Query parameters**

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `reading_type` | string | — | `REQUIRED, RECOMMENDED, SUPPLEMENTARY` (case-insensitive; 400 otherwise) | filter by reading type. |
| `year_from` | int | — | 1000..next year (400 otherwise) | courses from this year. |
| `year_to` | int | — | 1000..next year (400 otherwise) | courses up to this year. |
| `page` | int | 1 | ≥1 (400 otherwise) | page number; ignored when `offset` is given. |
| `limit` | int | 10 | 1..100 (400 otherwise) | page size. |
| `offset` | int | 0 | ≥0 (400 otherwise) | rows to skip. |

**Example requests**

```
GET /works/2684644/bibliographies
GET /works/2684644/bibliographies?reading_type=REQUIRED&year_from=2020&year_to=2025
```

**Example response** (`GET /works/7539537/bibliographies`)

```json
{
  "status": "success",
  "data": [],
  "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0, "hasNext": false, "hasPrev": false },
  "meta": { "request": { "method": "GET", "path": "/works/7539537/bibliographies" }, "pagination_extras": { "offset": 0 } }
}
```

**Fields** — row shape (no row exists today: `course_bibliography` is empty, measured 2026-10-14):

| field | type | notes |
|---|---|---|
| `course_id` | int | → `/courses/{id}`. |
| `course_code` | string | |
| `course_name` | string | |
| `course_year` | int | |
| `program_id` | int \| null | |
| `reading_type` | string | `REQUIRED, RECOMMENDED, SUPPLEMENTARY`. |
| `instructor_count` | int | |
| `instructors` | string | `"; "`-joined instructor names. |

Rows are ordered by course year (newest first), then course name. The forward direction lives in [./bibliographies.md](./bibliographies.md).
