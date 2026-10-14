# Publications — per-publication instances of works, DOI resolution

The publications domain exposes individual *published instances* of a work: one row per `publications` record (`publications.id`), carrying its own type, DOI, venue, publisher, dates, identifiers, files and citation counts. A single [work](./works.md) is a multi-manifestation record and may own several publications (e.g. a `PREPRINT` and an `ARTICLE`), which appear as `siblings` of one another. The read path is `publications p INNER JOIN works w LEFT JOIN venues v LEFT JOIN organizations publisher`. The corpus holds 7,744,534 publications (measured 2026-10-14).

Filter routing: the full-text filters (`q`/`search`, `author`, `subject`) resolve matching work ids through **Manticore** and then keep `p.work_id IN (…)`; the `venue`/`venue_name` filter matches venue names through MariaDB `ft_venues_search`; every other filter hits a B-tree index directly.

This chapter assumes you have read [../00-conventions.md](../00-conventions.md) for the response envelope, `page`/`limit` and `offset`/`limit` pagination, auth/rate-limit rules, error codes, boolean/date normalization, the shared `meta` flags and the citation/sort query params. Related: [./works.md](./works.md) (the parent entity), [./venues.md](./venues.md), [./institutions.md](./institutions.md) (publishers are `organizations`).

---

## `GET /publications`

List publications, paginated. No auth. `meta.engine` is `"Manticore"` whenever a full-text term (`q`/`search`/`author`/`subject`) participates, otherwise `"MariaDB"`. A page of publication ids is selected first (joining `works` only when a works column such as `language` is involved) and the full rows are then loaded for those ids.

### Query parameters

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `page` | integer | 1 | ≥ 1 | 1-based page; ignored when `offset` is given. |
| `limit` | integer | 10 | 1..100 (400 outside) | rows per page. |
| `offset` | integer | 0 | ≥ 0 | rows to skip, served exactly as given and echoed in `meta.pagination_extras.offset`. |
| `q` | string | — | 2..200 chars after trimming (400 otherwise) | Manticore full-text over the parent work's title, subtitle, abstract, authors, subjects and venue. |
| `search` | string | — | 2..200 chars | alias of `q`, validated the same way. |
| `author` | string | — | ≤ 255 chars | Manticore authors filter; AND semantics across words. |
| `subject` | string | — | ≤ 255 chars | Manticore subjects filter. |
| `type` | string | — | `ARTICLE`, `BOOK`, `CHAPTER`, `THESIS`, `CONFERENCE`, `CONFERENCE_PAPER`, `REPORT`, `DATASET`, `PREPRINT`, `REVIEW`, `EDITORIAL`, `OTHER` (case-insensitive) | exact `p.type`. Any other value is a **400 `VALIDATION_ERROR`**. |
| `language` | string | — | 2..5 chars, ISO 639-1 | `w.language = ?` (the work's language). |
| `year_from` | integer | — | ≥ 1000 | inclusive `p.year >= ?`. |
| `year_to` | integer | — | ≥ 1000 | inclusive `p.year <= ?`. |
| `open_access` | boolean | — | `1/0/true/false` | `p.open_access`. |
| `peer_reviewed` | boolean | — | `1/0/true/false` | `p.peer_reviewed`. Every publication is currently flagged peer-reviewed, so `false` returns an empty, exact page. |
| `has_files` | boolean | — | `1/0/true/false` | keep only publications with (or without) attached files — see *has_files* below. |
| `venue` | string | — | 2..255 chars | word match against venue name and abbreviation via MariaDB `ft_venues_search` (boolean mode, every word required). |
| `venue_name` | string | — | 2..255 chars | alias of `venue`, validated the same way. |
| `venue_id` | integer | — | ≥ 1 | exact `p.venue_id`. |
| `publisher_id` | integer | — | ≥ 1 | exact `p.publisher_id`. |
| `work_id` | integer | — | ≥ 1 | the publications of one work (its manifestations). |
| `doi` | string | — | ≤ 255 chars | exact DOI lookup; `https://doi.org/` / `doi:` prefixes are stripped and case is ignored. |
| `cited_by_min` / `cited_by_max` | integer | — | ≥ 0 | inclusive bounds on `p.citation_count` (an exact mirror of the parent work's `works.citation_count`). Aliases `citation_count_min` / `citation_count_max`. |
| `sort_by` | string | `p.id DESC` | `cited_by_count`, `citation_count`, `references_count`, `reference_count`, `publication_year`, `year`, `id`, `publication_id`, `relevance` (camelCase `sortBy` also accepted) | primary sort key, see below. |
| `sort_order` | string | `DESC` | `ASC`/`DESC`, case-insensitive (alias `sortOrder`) | sort direction. |

Sort resolution:

- `cited_by_count` (`citation_count`) → `p.citation_count <dir>, p.id <dir>`; `references_count` (`reference_count`) → `p.reference_count <dir>, p.id <dir>`; `publication_year` (`year`) → `p.year <dir>, p.id DESC`; `id` (`publication_id`) → `p.id <dir>`.
- Without `sort_by` the order is `p.id DESC` (newest publication record first). **`sort_by=relevance` is accepted but behaves like the default** — publications are never ordered by full-text relevance, even with `q`.
- Ascending `publication_year` lists publications with no date first; descending starts with out-of-range future years present in the source data.

**has_files**

- `has_files=true` used alone with the default sort is served from the files index: `meta.has_files_source: "files_index"` and an exact total (6,239,322 publications with files, measured 2026-10-14).
- Combined with any other filter or sort, `has_files=true` or `false` is checked per publication and the total is exact whenever the count fits its budget (`has_files=true&type=BOOK` → 269,635; `has_files=true&venue_id=1012159` → 1,927).
- `has_files=false` alone, or `has_files=true` with a non-default sort, serves its rows but its count exceeds the budget, so the total falls back to the corpus estimate (see below).

### Example requests

```
GET /publications?limit=20
GET /publications?q=ritual&limit=20
GET /publications?sort_by=cited_by_count&sort_order=DESC&limit=10
GET /publications?type=ARTICLE&year_from=2015&year_to=2020&open_access=true
GET /publications?venue_id=1012121&sort_by=publication_year
GET /publications?has_files=true&venue_id=1012159
GET /publications?work_id=19121098          # the manifestations of one work
GET /publications?author=silva&subject=ritual
```

### Example response (`GET /publications?limit=1`, captured 2026-10-14)

```json
{
  "status": "success",
  "data": [
    {
      "id": 1129319242,
      "work_id": 24224223,
      "doi": "10.70967/2948-040x.2544",
      "title": "Region I",
      "abstract": null,
      "type": "ARTICLE",
      "language": "en",
      "publication_year": 2002,
      "publication_date": "2002-10-31T00:00:00.000Z",
      "volume": "41",
      "issue": "2",
      "pages": null,
      "source": "crossref",
      "license_url": null,
      "license_version": "publishedVersion",
      "open_access": false,
      "peer_reviewed": true,
      "has_files": true,
      "has_scimag_file": false,
      "has_libgen_file": false,
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
      "publisher": {
        "id": 2363091,
        "name": "Israel Antiquities Authority - DIGITAL COMMONS JOURNALS",
        "type": "PUBLISHER",
        "country": null,
        "ror_id": null,
        "wikidata_id": null,
        "openalex_id": null,
        "url": null
      },
      "identifiers": {
        "doi": "10.70967/2948-040x.2544",
        "pmid": null,
        "pmcid": null,
        "arxiv": null,
        "wos_id": null,
        "handle": null,
        "wikidata_id": null,
        "openalex_id": "W7214019072",
        "isbn": null,
        "openlibrary_id": null,
        "scielo_pid": null,
        "google_book_id": null
      },
      "first_author": { "person_id": 5086026, "name": "Yuval Peleg" },
      "author_count": 2,
      "citation_count": 0,
      "reference_count": 0,
      "_links": { "self": "/publications/1129319242" }
    }
  ],
  "pagination": { "page": 1, "limit": 1, "total": 7744534, "totalPages": 7744534, "hasNext": true, "hasPrev": false },
  "meta": {
    "engine": "MariaDB",
    "pagination_total_exact": false,
    "elapsed_ms": 2,
    "request": { "method": "GET", "path": "/publications?limit=1" },
    "pagination_extras": { "offset": 0 }
  }
}
```

A capped full-text query (`GET /publications?q=ritual`) reports `"meta": { "engine": "Manticore", "pagination_total_exact": false, "fulltext_truncated": true, "fulltext_work_cap": 5000, … }`.

### Fields — list item

| field | type | notes |
|---|---|---|
| `id` | int | `publications.id` — the publication id (not the work id). |
| `work_id` | int | parent work id → `/works/{work_id}`. |
| `doi` | string \| null | DOI of this publication. |
| `title` | string \| null | parent work title. |
| `abstract` | string \| null | parent work abstract (long; frequently null). |
| `type` | string \| null | this publication's type (enum above). |
| `language` | string \| null | ISO 639-1, from `works.language`. |
| `publication_year` | int \| null | `p.year`, derived from `publication_date`. |
| `publication_date` | string(date-time) \| null | |
| `volume` / `issue` / `pages` | string \| null | `pages` can be a placeholder such as `"000-000"`. |
| `source` | string \| null | provenance, e.g. `"crossref"`, `"openalex"`. |
| `license_url` | string \| null | may hold a licence **code** rather than a URL (e.g. `"cc-by"`, `"other-oa"`). |
| `license_version` | string \| null | e.g. `"vor"`, `"publishedVersion"`, `"unspecified"`. |
| `open_access` / `peer_reviewed` | bool \| null | |
| `has_files` | bool | derived live from the `files` table. |
| `has_scimag_file` / `has_libgen_file` | bool | an attached file carries a `scimag_id` / `libgen_id`. |
| `venue` | object \| null | see venue sub-table. |
| `publisher` | object \| null | see publisher sub-table. |
| `identifiers` | object | 12 keys, see identifiers sub-table. |
| `first_author` | object \| null | `{ person_id, name }`; always an `AUTHOR`-role contributor when the work has one. |
| `author_count` | int | distinct people credited on the parent work across every role. See [works › Contributor roles and positions](./works.md#contributor-roles-and-positions). |
| `citation_count` | int | parent work incoming citations (0 when unknown). |
| `reference_count` | int | parent work outgoing references (0 when unknown). |
| `_links.self` | string | `/publications/{id}`. |

**`venue` block** (also used on the detail):

| field | type | notes |
|---|---|---|
| `venue.id` | int \| null | `venues.id`. |
| `venue.name` | string \| null | |
| `venue.abbreviated_name` | string \| null | always present alongside `name`. |
| `venue.type` | string \| null | `JOURNAL`, `CONFERENCE`, `REPOSITORY`, `BOOK_SERIES`, `SOURCE_BOOK`, `OTHER`. |
| `venue.issn` / `venue.eissn` | string \| null | |
| `venue.scopus_id` / `venue.wikidata_id` / `venue.openalex_id` | string \| null | |

**`publisher` block** (from `organizations`):

| field | type | notes |
|---|---|---|
| `publisher.id` | int \| null | `organizations.id` → `/institutions/{id}`. |
| `publisher.name` | string | |
| `publisher.type` | string \| null | e.g. `PUBLISHER`. |
| `publisher.country` | string \| null | ISO-2 (`organizations.country_code`). |
| `publisher.ror_id` / `publisher.wikidata_id` / `publisher.openalex_id` | string \| null | |
| `publisher.url` | string \| null | |

**`identifiers` block** (same 12 keys on list and detail, each string or null, read from the publication's own columns): `doi`, `pmid`, `pmcid`, `arxiv`, `wos_id`, `handle`, `wikidata_id`, `openalex_id`, `isbn`, `openlibrary_id`, `scielo_pid`, `google_book_id`.

### Totals and degraded pages

- `pagination.total` is exact (`meta.pagination_total_exact: true`) when its count finishes inside a 2 s budget. Measured 2026-10-14: `type=ARTICLE` → 7,055,450, `type=BOOK` → 396,140, `year_from=2015&year_to=2020` → 1,391,184, `language=pt` → 292,206, `venue=journal` → 1,913,840, `cited_by_min=50` → 53,459.
- It is the fixed corpus estimate **7,744,534** with `pagination_total_exact: false` on the unfiltered listing and whenever the count exceeds its budget (e.g. `has_files=false` alone). That fallback is the whole-corpus figure, not an approximation of the filtered set; treat `false` as "no usable total" and stop paging when `data.length < limit`.
- **Full-text cap.** `q`/`author`/`subject` keep at most the first 5,000 matching works by relevance (`MANTICORE_PUBLICATIONS_WORK_CAP`). When the cap is hit the response sets `meta.fulltext_truncated: true`, `meta.fulltext_work_cap: 5000` and `pagination_total_exact: false`: the total counts the publications of those 5,000 works only (`q=ritual` → 4,976 publications, while 53,180 works match on `/works?q=ritual`). Below the cap the total is exact.
- If the id selection exceeds its statement budget the page degrades to `data: []` with `meta.page_degraded: true`, a `meta.note` and `pagination_total_exact: false` instead of failing.
- Invalid `sort_by`, `limit` outside 1..100, a non-integer id filter, etc. → 400 `VALIDATION_ERROR` with the express-validator `errors[]` array.

---

## `GET /publications/{id}`

One publication with its parent `work` block, `siblings[]`, live `files[]`, review links and (by default) incoming `citations` and outgoing `references`. No auth.

### Path parameters

| param | type | notes |
|---|---|---|
| `id` | integer ≥ 1 | `publications.id`. Non-integer → 400 `VALIDATION_ERROR`; unknown id → 404 `NOT_FOUND` (`"Publication with ID {id} not found"`). |

### Query parameters

| param | type | default | accepted values | effect |
|---|---|---|---|---|
| `include_citations` | boolean | `true` | `false`/`0`/`no` disable | when disabled, `data.citations` is `null` (the key stays). |
| `include_references` | boolean | `true` | `false`/`0`/`no` disable | when disabled, `data.references` is `null` (the key stays). |

The two flags are independent.

### Example requests

```
GET /publications/1127609346
GET /publications/1124210777                                  # a PREPRINT whose sibling is the ARTICLE
GET /publications/1127609346?include_citations=false&include_references=false
```

### Example response (`GET /publications/1127609346`, captured 2026-10-14, trimmed)

```json
{
  "status": "success",
  "data": {
    "id": 1127609346,
    "type": "ARTICLE",
    "identifiers": {
      "doi": "10.1086/742191",
      "pmid": null, "pmcid": null, "arxiv": null, "wos_id": null,
      "handle": null, "wikidata_id": null, "openalex_id": "W7170065152",
      "isbn": null, "openlibrary_id": null, "scielo_pid": null, "google_book_id": null
    },
    "publication_date": "2026-07-22T00:00:00.000Z",
    "publication_year": 2026,
    "volume": "82",
    "issue": "3",
    "pages": "000-000",
    "language": "en",
    "open_access": false,
    "peer_reviewed": true,
    "has_files": false,
    "has_scimag_file": false,
    "has_libgen_file": false,
    "license_url": null,
    "license_version": "publishedVersion",
    "source": "crossref",
    "source_indexed_at": "2026-07-23T01:02:39.000Z",
    "venue": {
      "id": 1012159, "name": "Journal of Anthropological Research",
      "abbreviated_name": "J. Anthropol. Res.", "type": "JOURNAL",
      "issn": "0091-7710", "eissn": "2153-3806", "scopus_id": "37322",
      "wikidata_id": "Q15750490", "openalex_id": "S30381306"
    },
    "publisher": {
      "id": 2741923, "name": "University of Chicago Press", "type": "PUBLISHER",
      "country": "US", "ror_id": null, "wikidata_id": "Q1814982",
      "openalex_id": "P4310315672", "url": "https://www.press.uchicago.edu"
    },
    "files": [],
    "work": {
      "id": 22519667,
      "title": "Theological Possibilities and the Anthropology of Eastern Orthodox Christianity",
      "subtitle": null,
      "abstract": null,
      "type": "ARTICLE",
      "language": "en",
      "citation_count": 0,
      "reference_count": 0,
      "authors": [
        { "person_id": 1601246, "preferred_name": "Sarah Riccardi‐swartz", "role": "AUTHOR", "position": 1, "is_corresponding": true }
        // ... (2 total)
      ],
      "subjects": [
        { "subject_id": 346254, "term": "Anthropology of religion", "vocabulary": "KEYWORD", "lang": "en" }
        // ... (7 total)
      ]
    },
    "reviewed_work_id": null,
    "review_relations": {
      "is_review": false, "reviews_of": [],
      "is_reviewed": false, "reviewed_by": [], "reviewed_by_total": 0, "reviewed_by_has_more": false
    },
    "siblings": [],
    "citations": [],
    "references": {
      "resolved": [
        {
          "work_id": 24092945,
          "title": "Religious Orthodoxies",
          "type": "ARTICLE",
          "publication_year": 2022,
          "venue_name": "Annual Review of Anthropology",
          "venue_abbreviated_name": "Annu. Rev. Anthropol.",
          "doi": "10.1146/annurev-anthro-101819-110322",
          "authors": "Ayala Fader; Vlad Naumescu",
          "authors_count": 2,
          "open_access": false,
          "citation_type": "NEUTRAL",
          "citation_status": null,
          "citation_context": null
        }
        // ... (47 total)
      ],
      "unresolved": [
        {
          "cited_doi": "10.1093/oso/9780198797852.003.0013",
          "status": "PENDING",
          "citation_type": "NEUTRAL",
          "created_at": "2026-07-23T00:25:16.000Z",
          "resolved_at": null
        }
        // ... (10 total)
      ]
    },
    "created_at": "2026-07-23T00:25:16.000Z",
    "updated_at": "2026-09-01T19:51:28.000Z"
  }
}
```

A multi-manifestation example: `GET /publications/1124210777` answers `"type": "PREPRINT"` with `"siblings": [{ "id": 1126396603, "type": "ARTICLE", "publication_year": 2025, "venue": { "id": 1092639, "name": "Cognition", … }, … }]`.

### Fields — detail top level

`identifiers`, `venue` and `publisher` are identical to the list blocks above.

| field | type | notes |
|---|---|---|
| `id` | int | `publications.id`. |
| `type` | string \| null | this publication's type. |
| `publication_date` | string(date-time) \| null | |
| `publication_year` | int \| null | |
| `volume` / `issue` / `pages` | string \| null | |
| `language` | string \| null | the work's language. |
| `open_access` / `peer_reviewed` | bool \| null | |
| `has_files` / `has_scimag_file` / `has_libgen_file` | bool | computed live from `files`. |
| `license_url` / `license_version` | string \| null | `license_url` may be a licence code, not a URL. |
| `source` | string \| null | |
| `source_indexed_at` | string(date-time) \| null | when the source last indexed this record. |
| `venue` | object \| null | 9-key venue block. |
| `publisher` | object \| null | 8-key publisher block. |
| `files[]` | array | live from `files`, capped at 200, ordered role `MAIN > SUPPLEMENT > COVER > PREVIEW` then file id. |
| `work` | object | parent work block, see below. |
| `reviewed_work_id` | int \| null | when this publication is a review, the id of the work it reviews (`publications.reviewed_id`); equals `work.id` when the review was collapsed into the reviewed work itself. |
| `review_relations` | object | review links, same shape as on [`GET /works/{id}`](./works.md) — see **`review_relations`** below. |
| `siblings[]` | array | the other publications of the same work, capped at 50; usually empty. |
| `citations` | array \| null | works citing the parent work, capped at 100; `[]` if none; `null` when `include_citations` is disabled. |
| `references` | object \| null | the parent work's outgoing references `{ resolved[], unresolved[] }`, each capped at 100; `null` when `include_references` is disabled. |
| `created_at` / `updated_at` | string(date-time) \| null | publication record timestamps. |

**`files[]` items:**

| field | type | notes |
|---|---|---|
| `file_id` | int | |
| `md5` | string \| null | |
| `format` | string \| null | e.g. `PDF` (upper-cased). |
| `size` | number \| null | bytes. |
| `pages` | int \| null | |
| `language` | string \| null | |
| `version` | string \| null | |
| `role` | string | `MAIN`, `SUPPLEMENT`, `COVER` or `PREVIEW`. |
| `libgen_id` / `scimag_id` | int \| null | |
| `openacess_id` | string \| null | note the spelling `openacess`. |
| `best_oa_url` | string \| null | best open-access URL. |
| `verification` | string \| null | `PENDING`, `VERIFIED`, `FAILED` or `CORRUPTED`. |
| `download_count` | int | per file; default 0. |

**`work` block:**

| field | type | notes |
|---|---|---|
| `work.id` | int | → `/works/{id}`. |
| `work.title` / `subtitle` / `abstract` | string \| null | |
| `work.type` | string \| null | **this publication's** type (same value as the top-level `type`), not the work's primary type — two manifestations of one work answer different values. |
| `work.language` | string \| null | |
| `work.citation_count` / `reference_count` | int | default 0. |
| `work.authors[]` | array | every authorship row of the work: `{ person_id, preferred_name, role, position, is_corresponding }`, role-grouped (AUTHOR first), `position` 1-based within the role. |
| `work.subjects[]` | array | `{ subject_id, term, vocabulary, lang }`; `vocabulary` is upper-cased here (`KEYWORD`, `OPENALEX`), unlike `/works/{id}` which returns it as stored (`Keyword`). |

**`siblings[]` items** (ordered by year, then id, newest first):

| field | type | notes |
|---|---|---|
| `siblings[].id` | int | → `/publications/{id}`. |
| `siblings[].doi` | string \| null | |
| `siblings[].type` | string \| null | the sibling's own type. |
| `siblings[].publication_year` | int \| null | |
| `siblings[].publication_date` | string(date-time) \| null | |
| `siblings[].volume` / `issue` / `pages` | string \| null | |
| `siblings[].open_access` / `peer_reviewed` / `has_files` | bool | |
| `siblings[].venue` | object \| null | the 9-key venue block with only `id`, `name` and `abbreviated_name` filled (the other keys are null). |
| `siblings[]._links.self` | string | `/publications/{id}`. |

**`citations[]` and `references.resolved[]` items** (a citing / cited work row):

| field | type | notes |
|---|---|---|
| `work_id` | int | the citing (citations) / cited (references) work id. |
| `title` | string \| null | |
| `type` | string \| null | type of that work's latest publication. |
| `publication_year` | int \| null | that publication's year (the same key as `/works/{id}`; it was `year` until 2026-10-14). |
| `venue_name` / `venue_abbreviated_name` | string \| null | |
| `doi` | string \| null | |
| `authors` | string \| null | `"; "`-joined names of the first 3 contributors (role rank, then position), as on `/works/{id}`. |
| `authors_count` | int | distinct contributors of the whole work (not capped at 3). |
| `open_access` | bool \| null | |
| `citation_type` | string | default `NEUTRAL`. |
| `citation_status` | string \| null | `RESOLVED` \| `PENDING` \| `FAILED` on citations; null on references. |
| `citation_context` | string \| null | currently always null. |

**`references.unresolved[]` items** (references whose cited work is not in the corpus yet):

| field | type | notes |
|---|---|---|
| `cited_doi` | string \| null | the referenced DOI. |
| `status` | string | `PENDING` (expected, not an error) or `FAILED`. |
| `citation_type` | string | default `NEUTRAL`. |
| `created_at` | string(date-time) \| null | |
| `resolved_at` | string(date-time) \| null | null while unresolved. |

**`review_relations`** — the same block and field inventory as on [`GET /works/{id}`](./works.md), read from `publications.reviewed_id`, with publication-level scope:

| field | publication-level meaning |
|---|---|
| `is_review` / `reviews_of[]` | the work **this publication** reviews — 0 or 1 entry (`via_publication_ids` = `[this id]`). A review collapsed into the reviewed book's own work lists that parent work with `same_work: true` (on `/works/{id}` the work never lists itself). |
| `is_reviewed` / `reviewed_by[]` / `reviewed_by_total` / `reviewed_by_has_more` | the reviews of the **parent work** (newest first, capped at 50) — identical to the parent work's `reviewed_by`, so every publication of a reviewed book shows its reviews. It can include this publication itself (compare `publication_id`). |

Real example — the review publication `GET /publications/1128473948` (also served by its DOI, `GET /10.1016/0277-3791(87)90024-2`):

```json
{
  "type": "REVIEW",
  "reviewed_work_id": 23400326,
  "review_relations": {
    "is_review": true,
    "reviews_of": [
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
    ],
    "is_reviewed": false,
    "reviewed_by": [],
    "reviewed_by_total": 0,
    "reviewed_by_has_more": false
  }
}
```

The reviewed book's own publication (`GET /publications/1128490006`, `type: "BOOK"`) answers `reviewed_work_id: null`, `is_review: false` and `reviewed_by` = `[{ "publication_id": 1128473948, "venue": { "name": "Quaternary Science Reviews", "abbreviated_name": "Quat. Sci. Rev.", … }, "publication_year": 1987, … }]`.

### Notes / caveats

- **Shape asymmetry:** `citations` is a bare **array**, but `references` is an **object** `{ resolved[], unresolved[] }`. Disabling either sets it to `null`, not `[]` / `{}`.
- `citations` and `references` describe the **parent work**, so every manifestation of a work shows the same lists.
- `files[]` and the `has_*` flags are read live from the `files` table; if that read fails the service logs it and returns an empty file list rather than failing the request.
- For the work-level file roll-up, the venues roll-up and per-work metrics use [`GET /works/{id}`](./works.md); this endpoint is publication-scoped.
- Every database statement is bounded (4.5 s); a detail request that exceeds it answers 503 `REQUEST_TIMEOUT` and can be retried. A first, uncached request for a heavily cited publication can take a few seconds.

---

## `GET /{doi}` (and `/doi.org/{doi}`, `/https://doi.org/{doi}`)

Resolve a DOI directly to its publication. No auth. Wired as a regex route in `src/app.js` (`/^\/((?:https?:\/\/)?doi\.org\/)?(\d{2}\..+)$/`) and served by the same code path as `GET /publications/{id}`, so the response is **identical to the detail endpoint** (same `type`, `work`, `siblings`, `files`, `review_relations`, `citations`, `references` blocks).

### Path parameter

| param | type | notes |
|---|---|---|
| `doi` | string | a DOI beginning with two digits and a dot (e.g. `10.1086/742191`). The optional `doi.org/` or `https://doi.org/` prefix is stripped and case is ignored; resolved against the unique `publications.doi`. Slashes and parentheses inside the DOI need no encoding (`%2F` also works). |

### Query parameters

Same as the detail: `include_citations` and `include_references` (default `true`; `false`/`0`/`no` set the respective block to `null`).

### Example requests

```
GET /10.1191/1478088706qp063oa
GET /doi.org/10.1086/742191
GET /https://doi.org/10.1002/fea2.70059
GET /10.1191/1478088706qp063oa?include_citations=false
```

### Example response (`GET /10.1191/1478088706qp063oa`, captured 2026-10-14, trimmed)

```json
{
  "status": "success",
  "data": {
    "id": 1112638398,
    "type": "ARTICLE",
    "identifiers": {
      "doi": "10.1191/1478088706qp063oa",
      "openalex_id": "W1979290264",
      "pmid": null, "pmcid": null, "arxiv": null, "wos_id": null,
      "handle": null, "wikidata_id": null, "isbn": null,
      "openlibrary_id": null, "scielo_pid": null, "google_book_id": null
    },
    "publication_year": 2006,
    "volume": "3", "issue": "2", "pages": "77-101",
    "language": "en",
    "open_access": true, "peer_reviewed": true,
    "has_files": true, "has_scimag_file": true, "has_libgen_file": false,
    "license_url": "other-oa", "license_version": "publishedVersion",
    "source": "openalex",
    "source_indexed_at": "2026-07-19T12:19:00.000Z",
    "venue": { "id": 1014042, "name": "Qualitative Research in Psychology", "abbreviated_name": "Qual. Res. Psychol.", "type": "JOURNAL", "issn": "1478-0887", "eissn": "1478-0895", "scopus_id": "5100155099", "wikidata_id": "Q15749868", "openalex_id": "S51001188" },
    "publisher": { "id": 693664, "name": "Taylor & Francis", "type": "PUBLISHER", "country": "GB", "ror_id": null, "wikidata_id": "Q880582", "openalex_id": "P4310320547", "url": "https://www.taylorfrancis.com" },
    "files": [ /* same shape as the detail */ ],
    "work": { "id": 7539537, "title": "Using thematic analysis in psychology", "type": "ARTICLE", "citation_count": 21493, "reference_count": 11, "authors": [ /* ... */ ], "subjects": [ /* ... */ ] },
    "reviewed_work_id": null,
    "review_relations": { "is_review": false, "reviews_of": [], "is_reviewed": false, "reviewed_by": [], "reviewed_by_total": 0, "reviewed_by_has_more": false },
    "siblings": [],
    "citations": [ /* ... 100 (the cap) */ ],
    "references": { "resolved": [ /* ... */ ], "unresolved": [ /* ... */ ] },
    "created_at": "2026-03-13T19:56:42.000Z",
    "updated_at": "2026-07-22T03:30:21.000Z"
  }
}
```

### Fields

Identical to [`GET /publications/{id}`](#get-publicationsid).

### Notes / caveats

- Unknown DOI → **404** `NOT_FOUND`: `{"status":"error","message":"Publication not found for the given DOI","code":"NOT_FOUND","meta":{"doi":"10.9999/nonexistent-doi-xyz",...}}`.
- The regex only matches paths whose segment (after the optional prefix) starts with two digits and a dot, so it does not collide with the named collection routes. The `https://` form needs its double slash intact: a client or proxy that collapses it to `/https:/doi.org/…` gets a 404.
- Use the resolver when you hold a DOI but not the internal `publications.id`; it returns the full detail in one call (`/publications?doi=…` returns the list shape instead).
