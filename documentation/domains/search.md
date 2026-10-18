# Search — full-text discovery over works and persons

The search domain is the primary discovery surface of the API. It exposes seven read-only endpoints. Full-text matching runs on **Manticore Search** (SphinxQL), the same engine behind `q=` on `/works`, `/publications` and `/persons`, and a query that matches nothing is revised for typos and stray words (see [Query revision](#query-revision-typo-tolerance)):

- The `works` index has the full-text fields `title, subtitle, abstract, authors, subjects, venue`. The `authors` field holds **AUTHOR-role contributors only**, so editors and translators are not matched by `q` or `author=`. The `venue` field holds the name and abbreviation of the venue of every publication of the work.
- The `persons` index has the fields `preferred_name, given_names, family_name`.

Manticore returns matching ids, and the API hydrates each row from the MariaDB base tables. Every result row therefore carries the same shape as the corresponding entity endpoint. All endpoints are public: no key is needed and requests are only rate-limited (see [../00-conventions.md](../00-conventions.md)).

Result rows reuse shapes from other domains:

- The work row is the `WorkListItem` of [works › `GET /works`](./works.md#get-works) plus search provenance.
- The person row is a compact subset of [persons](./persons.md).

This chapter documents only what is specific to search. The envelope, pagination, auth, rate limits, error codes, value normalization and the shared citation/sort parameters are covered in [../00-conventions.md](../00-conventions.md).

| Endpoint | Entities | Engine | Paginated | `q` |
|---|---|---|---|---|
| `GET /search/works` | works | Manticore when a text term is present, else MariaDB | yes | optional |
| `GET /search/advanced` | works | same as `/search/works` | yes | optional |
| `GET /search/global` | works + persons | Manticore | no (per-entity slice) | **required** |
| `GET /search/persons` | persons | Manticore | yes | **required** |
| `GET /search/autocomplete` | titles + authors + venues | Manticore → MariaDB | no | optional (< 2 chars → short shape) |
| `GET /search/popular` | most frequent recent queries | Redis analytics | no | n/a |
| `GET /search/health` | engine status | — | no | n/a |

## Rules shared by every search endpoint

- **Query text is literal.** Only letters, combining marks, digits, `_` and whitespace reach the engine. Every other character is a word separator, including `? % * " ' & : . - | @ ( )`. The text is also lower-cased. So `ritual&myth` is the same query as `ritual myth`, `culture?` is the same as `culture`, and words such as `MAYBE`, `NEAR`, `SENTENCE` or `ZONE` are ordinary terms. There are no operators, phrases or wildcards.
- **Every term is required (AND).** In the content fields (`title`, `subtitle`, `abstract`, `subjects`), each term also matches its inflected forms through Portuguese and English stemming: `movimentos` finds *movimento*. In `authors` and `venue`, terms match verbatim, so names are never stemmed. A query that matches nothing is revised: misspellings are corrected, and failing that the conflicting term is dropped. See [Query revision](#query-revision-typo-tolerance).
- **Match window.** Full-text results can be paged up to the first 100,000 matches. A request with `offset + limit > 100000` returns **400 `VALIDATION_ERROR`**: "Full-text results can be paged up to the first 100000 matches; narrow the query or use a different sort".
- **Time budget.** Every Manticore query carries `max_query_time = 4000 ms`, below the 5 s request ceiling. When the page query hits it, the request fails with **503 `REQUEST_TIMEOUT`** rather than serving a truncated page. When only the count hits it, the page is served with `meta.pagination_total_exact: false` and a lower-bound `total` (one more than the rows seen while a full page came back, so `hasNext` stays usable).
- **Pagination.** `page`/`limit` or `offset`/`limit`, with a default `limit` of 10. An explicit `offset` is served as given and echoed in `meta.pagination_extras.offset`.
- **`relevance` is always `null`.** The field appears on the work rows of `/search/works` and `/search/global` and on the person rows of `/search/persons` and `/search/global`. It stays `null` even with `sort_by=relevance`: the ranking score is never surfaced. `/search/advanced` rows omit the key entirely.

> Figures in this chapter were measured on 2026-10-14 against the development server. Its Manticore index is stale: it holds 7,673,100 works for 7,657,142 in MariaDB, and 4,766,283 persons for 4,903,220. Full-text totals there drift from production. Treat the numbers as orders of magnitude, not fixed values.

## Query revision (typo tolerance)

Because every term is required, a single misspelled or out-of-place word used to empty the whole result: `lkuiz fernando dias duarte` returned nothing, while `luiz fernando dias duarte` returns 56 works and the person Luiz Fernando Dias Duarte. Since 2026-10-18 the works and persons full-text paths revise such queries against the Manticore dictionary, which is the vocabulary of the very index the query runs on.

**1. The literal query matches nothing.** The API looks for a revised query that does match, and serves it:

- **Correction.** A term absent from the dictionary is replaced by a dictionary word within one edit. An edit is a deletion, insertion, substitution or adjacent transposition, so `bourdeiu` is one edit from `bourdieu`. Words of six letters or more may take two edits: `malinowksy` → `malinowski`. A term that does exist in the dictionary is only ever replaced by a one-edit neighbour (`castor` → `castro` in `eduardo viveiros de castor`).
- **How candidates are chosen.** Each candidate is judged by how much the *whole* corrected query matches: its matches, plus their citations for works or their `total_works` for persons. Each edit costs a factor of 20. Popularity therefore breaks ties: on `/search/persons`, `marcel maus` becomes `marcel mauss` rather than one of the many other one-edit neighbours of `maus`. Rewrites that change fewer terms are always tried first.
- **Relaxation.** If no correction yields results, the one `q` term that conflicts with the others is dropped: `durkheim suicide nervosa` → `durkheim suicide`, 508 works. A term that occurs nowhere in the index and has no correction is dropped as well (`luiz fernando dias duarte xqztw` → the 56 works). Only `q` is relaxed. `author`, `subject` and `venue_name` are corrected but never dropped, and a query is never reduced to nothing.
- **Filters are respected.** No revision happens when the zero is explained by the structured filters (`type`, `language`, years, flags, `verified`, citation bounds). If the text alone matches, the terms are fine and the empty page is the true answer.
- The response carries the revised query's rows and `pagination`. `query_revision.applied` is `true`, with `status` `"corrected"`, or `"relaxed"` when a term was dropped.

**2. The literal query has results.** This applies to the first page only. Suppose a term is rare (in at most 1,000 documents) and sits one edit away from a word whose query matches at least 20 times more. The response then stays the literal query, and `query_revision` carries a **suggestion** with `status: "suggested"` and `applied: false`. For example, `bourdeiu distinction` returns its 2 works and suggests `bourdieu distinction` (1,181).

**3. `autocorrect=false`** turns every revision into a suggestion: the literal (possibly empty) result is served and `query_revision.applied` is `false`. Use it for the "search instead for …" link, otherwise that link would be revised again.

Correctly spelled queries are never revised. A query that already has results and no rare term costs one extra dictionary lookup (1–3 ms). A zero-result query typically takes 15–130 ms longer. The work is bounded: each candidate count is capped at 500 ms, and the revision is skipped when the literal search already took over 1 s. If the revision fails, the literal result is served unchanged.

### `query_revision`

Present only when a revision was applied or is suggested. It sits in `meta.query_revision` on `/works`, `/search/works`, `/search/advanced`, `/search/persons`, `/persons` (search path) and `/publications`. On `/search/global` it sits inside each block (`data.works.query_revision`, `data.persons.query_revision`), and on `/search/autocomplete` in `data.query_revision`.

| field | type | notes |
|---|---|---|
| `status` | enum | `"corrected"`: the rows are those of the corrected query. `"relaxed"`: a term was also dropped. `"suggested"`: the rows are the literal query's and `revised` is only a proposal. |
| `applied` | boolean | `true` when `data` and `pagination` reflect `revised`. |
| `original` | object | Normalised literal terms per parameter (lower-cased, punctuation removed), e.g. `{ "q": "lkuiz fernando dias duarte" }`. Only parameters that carry terms appear. |
| `revised` | object | Revised terms per parameter. Send them back as the same parameters to reproduce the response. |
| `corrections[]` | array | `{ parameter, term, replacement, edit_distance }`. `parameter` is `q`, `author`, `subject` or `venue_name`. `edit_distance` is 1 or 2. |
| `dropped_terms[]` | array | `{ parameter, term }`. Always `q`. |
| `original_total` | int | Matches of the literal query: 0 unless `status` is `"suggested"`. |
| `revised_total` / `revised_total_exact` | int / boolean | Matches of the revised query. They equal `pagination.total` when applied. On `/publications` they count matching works (capped at the 5,000-work full-text cap), not publications. |

`GET /search/works?q=lkuiz fernando dias duarte&limit=1` (row omitted):

```json
{
  "pagination": { "page": 1, "limit": 1, "total": 56, "totalPages": 56, "hasNext": true, "hasPrev": false },
  "meta": {
    "query": "lkuiz fernando dias duarte",
    "search_type": "fulltext",
    "match_mode": "any_publication",
    "pagination_total_exact": true,
    "query_revision": {
      "status": "corrected",
      "applied": true,
      "original": { "q": "lkuiz fernando dias duarte" },
      "revised": { "q": "luiz fernando dias duarte" },
      "corrections": [{ "parameter": "q", "term": "lkuiz", "replacement": "luiz", "edit_distance": 1 }],
      "dropped_terms": [],
      "original_total": 0,
      "revised_total": 56,
      "revised_total_exact": true
    }
  }
}
```

`GET /works?q=durkheim suicide nervosa` (`meta.query_revision` only):

```json
{
  "status": "relaxed",
  "applied": true,
  "original": { "q": "durkheim suicide nervosa" },
  "revised": { "q": "durkheim suicide" },
  "corrections": [],
  "dropped_terms": [{ "parameter": "q", "term": "nervosa" }],
  "original_total": 0,
  "revised_total": 508,
  "revised_total_exact": true
}
```

**Rendering it.**
- `applied: true`: show "Showing results for **{revised.q}**", with the `corrections[].replacement` words highlighted. Add "Search instead for {original.q}", linking to the same request with `autocorrect=false`. For `status: "relaxed"`, add "Missing: {dropped_terms[].term}".
- `applied: false`: show "Did you mean **{revised.q}**?", linking to the revised parameters.

**Limits.**
- Words shorter than four letters are never corrected.
- Only Latin letters (after accent folding, so `antropología` counts) are corrected. Terms with digits or in other scripts can only be dropped, and only when they occur nowhere in the index.
- Merged or split words (`levistrauss`, `da matta`) are not repaired.
- Corrections can only reach what the search index holds. On the development server the stale index lacks some recently updated persons (e.g. Clifford Geertz, Bronislaw Malinowski), so a name search for them falls back to relaxation there.

---

## `GET /search/works`

Works search. `q` is optional, and the request takes one of two paths depending on whether a text term is present.

**With a text term** (`q`, `author`, `subject` or `venue`/`venue_name`), the request runs on Manticore:
- Rows default to relevance order.
- `pagination.total` is an exact Manticore `COUNT(*)`.

**Without a text term** (only `type`, `language`, years, booleans and citation bounds, or no parameters at all), the request is the same MariaDB browse as [`/works`](./works.md#get-works):
- Rows default to `id DESC` (newest work first).
- The count runs under a 2 s budget. When the budget fires, `total` falls back to the corpus estimate and `meta.pagination_total_exact` is `false`. For example, `open_access=true` returns 7,657,142 with the flag `false`.

### Query parameters

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `q` | string | — | 2–200 chars after trimming | Free text over every text field (see the shared rules). |
| `type` | enum | — | `ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, CONFERENCE_PAPER, REPORT, DATASET, PREPRINT, REVIEW, EDITORIAL, OTHER` (case-insensitive) | Matches a work if any of its publications is of that type. |
| `language` | string | — | 2–5 chars (`en`, `pt`, …) | Language filter. |
| `peer_reviewed` | boolean | — | `1/0/true/false` | Peer-review flag of any publication. |
| `open_access` | boolean | — | `1/0/true/false` | Open-access flag of any publication. |
| `venue_name` | string | — | 2–255 chars | Manticore `venue` field: the name or abbreviation of the venue of any of the work's publications, verbatim words. Counts as a text term. |
| `venue` | string | — | 2–255 chars | Alias of `venue_name`. |
| `year_from` / `year_to` | integer | — | 1000 .. next year | Publication-year bounds (any publication). |
| `author` | string | — | 2–255 chars | Manticore `authors` field (AUTHOR-role names, verbatim). |
| `subject` | string | — | 2–255 chars | Manticore `subjects` field (stemmed). |
| `sort_by` | enum | relevance with a text term, otherwise `id DESC` | `cited_by_count, references_count, publication_year, id, relevance` (aliases `citation_count, reference_count, year, work_id`) | Primary sort key. |
| `sort_order` | enum | `DESC` | `ASC`/`DESC`, case-insensitive | Sort direction. |
| `autocorrect` | boolean | `true` | `1/0/true/false` (400 otherwise) | `false` serves the literal query and only suggests a revision. See [Query revision](#query-revision-typo-tolerance). |

The shared `cited_by_min`/`cited_by_max` (aliases `citation_count_min`/`citation_count_max`) and pagination parameters also apply. Any invalid value returns 400 with the standard `errors[]` array.

### Example requests

```
GET /search/works?q=kinship&limit=20
GET /search/works?q=european union&type=article&sort_by=cited_by_count
GET /search/works?venue=mana&limit=10                                  # filter-only, still Manticore (venue is a text term)
GET /search/works?author=silva&subject=anthropology&limit=10
GET /search/works?type=THESIS&language=pt                              # no text term → MariaDB browse
```

### Example response

`GET /search/works?q=kinship&limit=2`, first row shown, `abstract` trimmed:

```json
{
  "status": "success",
  "data": [
    {
      "id": 2689796,
      "publication_id": 1180479,
      "publications_count": 1,
      "title": "Mama's Baby, Papa's Maybe",
      "subtitle": "An American Grammar Book",
      "abstract": "… (long text)",
      "type": "BOOK",
      "language": "en",
      "publication_year": 1987,
      "doi": "10.2307/464747",
      "open_access": false,
      "peer_reviewed": true,
      "venue": {
        "id": 1014939, "name": "diacritics", "abbreviated_name": "diacritics", "type": "JOURNAL",
        "issn": "0300-7162", "eissn": "1080-6539", "scopus_id": "5700156387",
        "wikidata_id": "Q5270247", "openalex_id": "S149853692"
      },
      "authors_preview": ["Hortense J Spillers"],
      "contributors_preview": [
        { "person_id": 374840, "name": "Hortense J Spillers", "role": "AUTHOR", "roles": ["AUTHOR"], "position": 1 }
      ],
      "author_count": 1,
      "first_author": { "person_id": 374840, "name": "Hortense J Spillers" },
      "first_author_id": 374840,
      "first_author_identifiers": null,
      "cited_by_count": 1075,
      "references_count": 0,
      "added_to_database": "2025-08-29T17:47:32.000Z",
      "data_source": "search",
      "search_engine": "Manticore",
      "_links": { "self": "/works/2689796" },
      "relevance": null
    }
  ],
  "pagination": { "page": 1, "limit": 2, "total": 18039, "totalPages": 9020, "hasNext": true, "hasPrev": false },
  "meta": {
    "query": "kinship",
    "search_type": "fulltext",
    "match_mode": "any_publication",
    "pagination_total_exact": true,
    "performance": {
      "engine": "Manticore", "query_type": "search", "match_mode": "any_publication",
      "primary_query_ms": 9, "elapsed_ms": 11, "controller": "searchWorks", "controller_time_ms": 11
    },
    "request": { "method": "GET", "path": "/search/works?q=kinship&limit=2" },
    "pagination_extras": { "offset": 0 }
  }
}
```

### Fields

The row is the `/works` list item. Its full field table is in [works › `GET /works`](./works.md#get-works) and is not repeated here. Search-specific points:

| field | notes |
|---|---|
| `publication_id`, `type`, `publication_year`, `doi`, `open_access`, `peer_reviewed`, `venue` | Taken from the **latest publication that matches the filters**. With `type=PREPRINT`, a work holding a PREPRINT and a newer ARTICLE shows the PREPRINT. |
| `data_source` / `search_engine` | `"search"` / `"Manticore"` on the full-text path; `"full_api"` / `"MariaDB"` on the browse path. |
| `relevance` | Always `null`. |
| `meta.query` | Echoed `q`; empty string when absent. |
| `meta.search_type` | Constant `"fulltext"`, on both paths. |
| `meta.match_mode` | `"any_publication"`. |
| `meta.pagination_total_exact` | `true` on the full-text path. On the browse path it is `false` when the count fell back to the corpus estimate. |
| `meta.query_revision` | Present only when the text query was revised or a revision is suggested. See [Query revision](#query-revision-typo-tolerance). |
| `meta.performance.*` | `engine` (`Manticore`/`MariaDB`), `query_type` (`search` / `showcase_optimized`), `primary_query_ms`, `elapsed_ms`, `controller`, `controller_time_ms`. |

### Notes

- **Relevance order** (the default with a text term) is computed per field:
  - Each matched query word counts once, and twice when the matched words sit contiguously.
  - Field weights: `title` 10, `authors` 6, `subtitle`/`subjects`/`venue` 4, `abstract` 2.
  - A BM25 term and a citation boost (`min(citation_count, 1000)`) are added.

  An exact title query therefore ranks that title first: `q=Cultural Nationalism in Contemporary Japan` returns the book at #1. The attribute sorts skip relevance scoring.
- `sort_by=publication_year` orders by the latest publication year of the work. On the full-text path, works without any year are indexed as year 0, so they open an ascending sort and close a descending one.
- An inverted year range (`year_from > year_to`) is swapped on the full-text path.
- **Searching for editors or translators.** The `authors` field holds AUTHOR-role contributors only. `author=barry kernfeld` matches 523 works, while the person also has 837 edited volumes. List everything a person contributed through [`/persons/{id}/works`](./persons.md#get-personsidworks).
- Every request with a non-empty `q` is recorded for [`/search/popular`](#get-searchpopular).
- Live cardinalities (dev, 2026-10-14): `q=kinship` 18,039; `q=european union` 80,569; `venue=mana` 906; `type=THESIS` 10,614 (exact count on the browse path).

---

## `GET /search/advanced`

Same engine, parameters and validation as `/search/works`, with two differences:

- Rows are nested under `data.results`, and `data.facets` is always `{}`. Faceting is not implemented, so build filter UI from the static enums.
- An extra `work_type` alias of `type` is accepted. It takes precedence when both are set.

Requests are not recorded for `/search/popular`.

### Example requests

```
GET /search/advanced?q=ritual&author=silva&limit=20
GET /search/advanced?work_type=ARTICLE&year_from=2018&language=pt&limit=10
GET /search/advanced?q=ritual&peer_reviewed=1
```

### Example response

`GET /search/advanced?q=ritual&author=silva&limit=2`, first row shown:

```json
{
  "status": "success",
  "data": {
    "results": [
      {
        "id": 3974425,
        "publication_id": 2671174,
        "publications_count": 1,
        "title": "Remarks on Similarity in Ritual Classification",
        "subtitle": "Affliction, Divination, and Object Animation",
        "abstract": "… (long text)",
        "type": "ARTICLE",
        "language": "en",
        "publication_year": 2013,
        "doi": "10.1086/673184",
        "open_access": false,
        "peer_reviewed": true,
        "venue": {
          "id": 1012740, "name": "History of Religions", "abbreviated_name": "Hist. Relig.", "type": "JOURNAL",
          "issn": "0018-2710", "eissn": "1545-6935", "scopus_id": "26797", "wikidata_id": null, "openalex_id": "S99675065"
        },
        "authors_preview": ["Sónia Silva"],
        "contributors_preview": [
          { "person_id": 3621666, "name": "Sónia Silva", "role": "AUTHOR", "roles": ["AUTHOR"], "position": 1 }
        ],
        "author_count": 1,
        "first_author": { "person_id": 3621666, "name": "Sónia Silva" },
        "first_author_id": 3621666,
        "first_author_identifiers": null,
        "cited_by_count": 4,
        "references_count": 10,
        "added_to_database": "2025-10-07T17:29:47.000Z",
        "data_source": "search",
        "search_engine": "Manticore",
        "_links": { "self": "/works/3974425" }
      }
    ],
    "facets": {}
  },
  "pagination": { "page": 1, "limit": 2, "total": 207, "totalPages": 104, "hasNext": true, "hasPrev": false },
  "meta": {
    "query": "ritual",
    "search_type": "fulltext_faceted",
    "filters_applied": 1,
    "engine": "Manticore",
    "pagination_total_exact": true,
    "performance": { "controller_time_ms": 5 },
    "request": { "method": "GET", "path": "/search/advanced?q=ritual&author=silva&limit=2" },
    "pagination_extras": { "offset": 0 }
  }
}
```

### Fields

| field | type | notes |
|---|---|---|
| `data.results[]` | array | `/search/works` rows without the `relevance` key. |
| `data.facets` | object | Always `{}`. |
| `meta.query` | string | Echoed `q` (empty on filter-only requests). |
| `meta.search_type` | string | Constant `"fulltext_faceted"`. |
| `meta.filters_applied` | int | Number of non-empty filters other than `q`, sort and pagination. |
| `meta.engine` | string | `"Manticore"` when a text term participates, else `"MariaDB"`. |
| `meta.pagination_total_exact` | boolean | Same semantics as on `/search/works`. |
| `meta.query_revision` | object | Same as on `/search/works`, including `autocorrect`. |
| `meta.performance.controller_time_ms` | int | Controller wall time. |

---

## `GET /search/global`

Works and persons in one round trip, for a unified search box. There is no cross-entity pagination: each block returns its own `total` and a `results[]` slice capped at `limit`. Institutions are not searched here; use `/institutions?q=`. The query is recorded for `/search/popular`.

### Query parameters

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `q` | string | — | **required**, 2–200 chars | Run against the works and persons indexes. |
| `limit` | integer | 5 | 1–20 (400 outside) | Rows per entity block. |
| `autocorrect` | boolean | `true` | `1/0/true/false` (400 otherwise) | `false` serves the literal query in both blocks and only suggests revisions. |

### Example response

`GET /search/global?q=anthropology&limit=1`, `abstract` trimmed:

```json
{
  "status": "success",
  "data": {
    "works": {
      "total": 408629,
      "results": [
        {
          "id": 7098772,
          "publication_id": 1112197633,
          "publications_count": 1,
          "title": "Anthropology as Cultural Critique",
          "subtitle": "An Experimental Moment in the Human Sciences",
          "abstract": "… (long text)",
          "type": "BOOK",
          "language": "en",
          "publication_year": 1999,
          "doi": "10.7208/chicago/9780226229539.001.0001",
          "open_access": false,
          "peer_reviewed": true,
          "venue": {
            "id": 1683204, "name": "Anthropology as Cultural Critique", "abbreviated_name": null, "type": "SOURCE_BOOK",
            "issn": null, "eissn": null, "scopus_id": null, "wikidata_id": null, "openalex_id": null
          },
          "authors_preview": ["George E Marcus", "M M J Fischer", "达居 蓝"],
          "contributors_preview": [
            { "person_id": 3591298, "name": "George E Marcus", "role": "AUTHOR", "roles": ["AUTHOR"], "position": 1 },
            { "person_id": 3890, "name": "M M J Fischer", "role": "AUTHOR", "roles": ["AUTHOR"], "position": 2 },
            { "person_id": 9316915, "name": "达居 蓝", "role": "AUTHOR", "roles": ["AUTHOR"], "position": 3 }
          ],
          "author_count": 4,
          "first_author": { "person_id": 3591298, "name": "George E Marcus" },
          "first_author_id": 3591298,
          "first_author_identifiers": null,
          "cited_by_count": 1071,
          "references_count": 0,
          "added_to_database": "2026-02-03T23:33:26.000Z",
          "data_source": "search",
          "search_engine": "Manticore",
          "_links": { "self": "/works/7098772" },
          "relevance": null
        }
      ]
    },
    "persons": {
      "total": 26,
      "results": [
        {
          "id": 9472721,
          "_links": { "self": "/persons/9472721" },
          "preferred_name": "Department of Anthropology",
          "given_names": "Department of",
          "family_name": "Anthropology",
          "name_signature": null,
          "identifiers": { "orcid": null, "lattes_id": null, "scopus_id": null, "wikidata_id": null, "openalex_id": null, "url": null },
          "is_verified": false,
          "metrics": { "works_count": 16, "latest_publication_year": 1941 },
          "relevance": null
        }
      ]
    },
    "institutions": {
      "total": null,
      "results": [],
      "note": "Institutions are not part of the global search; query /institutions?q= instead"
    }
  },
  "meta": {
    "query": "anthropology",
    "query_time_ms": 45,
    "sources": {
      "works": { "engine": "Manticore", "query_type": "search", "match_mode": "any_publication", "primary_query_ms": 44, "elapsed_ms": 45, "controller": "searchWorks" },
      "persons": { "engine": "Manticore", "query_type": "search", "controller": "searchPersons" },
      "institutions": null
    },
    "controller_time_ms": 46,
    "request": { "method": "GET", "path": "/search/global?q=anthropology&limit=1" }
  }
}
```

### Fields

| field | type | notes |
|---|---|---|
| `data.works.total` | int | Exact Manticore count. |
| `data.works.results[]` | array | `/search/works` rows (with `relevance: null`). |
| `data.persons.total` | int | Exact Manticore count. |
| `data.persons.results[]` | array | `/search/persons` rows. |
| `data.works.query_revision` / `data.persons.query_revision` | object | Present per block when that block was revised or a revision is suggested. The blocks are revised independently. |
| `data.institutions` | object | Always `{ total: null, results: [], note }`. `null` means "not searched", not zero. Hide the block or link to `/institutions?q=`. |
| `meta.query_time_ms` | int | Combined works + persons time. |
| `meta.sources.works` / `meta.sources.persons` | object | Per-entity performance blocks. `meta.sources.institutions` is `null`. |
| `meta.controller_time_ms` | int | Controller wall time. |

To page deeper, switch to `/search/works` or `/search/persons` with the same `q`.

---

## `GET /search/persons`

Researcher and author name search over `preferred_name, given_names, family_name`. Names are unstemmed; every term is required. Each row is a compact person item, not the full profile of `/persons/{id}`. Totals are exact Manticore counts. `/persons?search=` (or `q=`) runs the same search with the `/persons` list envelope.

### Query parameters

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `q` | string | — | **required**, 2–200 chars | Name query. |
| `verified` | boolean | — | `1/0/true/false` (400 otherwise) | Restrict by `is_verified`. Echoed as a boolean in `meta.verified`. |
| `autocorrect` | boolean | `true` | `1/0/true/false` (400 otherwise) | `false` serves the literal query and only suggests a revision. |

Plus `page`/`limit`/`offset`.

### Example response

`GET /search/persons?q=silva&limit=2`, first row shown:

```json
{
  "status": "success",
  "data": [
    {
      "id": 1396157,
      "_links": { "self": "/persons/1396157" },
      "preferred_name": "Kleber Aparecido Da Silva Silva",
      "given_names": "Kleber Aparecido Da Silva",
      "family_name": "Silva",
      "name_signature": null,
      "identifiers": { "orcid": "0000-0002-7815-7767", "lattes_id": null, "scopus_id": null, "wikidata_id": null, "openalex_id": null, "url": null },
      "is_verified": true,
      "metrics": { "works_count": 57, "latest_publication_year": 2025 },
      "relevance": null
    }
  ],
  "pagination": { "page": 1, "limit": 2, "total": 35970, "totalPages": 17985, "hasNext": true, "hasPrev": false },
  "meta": {
    "query": "silva",
    "search_type": "fulltext",
    "performance": { "engine": "Manticore", "query_type": "search", "controller": "searchPersons", "controller_time_ms": 6 },
    "request": { "method": "GET", "path": "/search/persons?q=silva&limit=2" },
    "pagination_extras": { "offset": 0 }
  }
}
```

### Fields

The row is the `/persons` list item (see [persons › `GET /persons`](./persons.md#get-persons)) plus `relevance: null`. Differences:

- `name_signature` is always `null` here.
- Only `identifiers.orcid` can be populated. `lattes_id` and `scopus_id` are not read on this path. `wikidata_id`, `openalex_id` and `url` have no source column and are always `null`.

| meta field | notes |
|---|---|
| `meta.query` | Echoed `q`. |
| `meta.search_type` | Constant `"fulltext"`. |
| `meta.verified` | Boolean; present only when `verified` was supplied. |
| `meta.query_revision` | Present only when the name was revised or a revision is suggested. See [Query revision](#query-revision-typo-tolerance). |
| `meta.performance.*` | `engine` (`"Manticore"`), `query_type` (`"search"`), `controller`, `controller_time_ms`. |

### Notes

- A name that matches nothing is revised. `lkuiz fernando dias duarte` serves Luiz Fernando Dias Duarte, `lilia schwarz` serves Lilia Schwarcz, and `darcy ribero` serves Darcy Ribeiro. A wrong name part is dropped: `luiz fernando silva duarte` → `luiz fernando duarte`.
- Ranking: names matching the query words in order rank first (`preferred_name` 10, `family_name` 6, `given_names` 4), then a BM25 term and a productivity boost (`min(total_works, 500)`).
- Some "persons" are institutional author strings (e.g. `"Department of Anthropology"`). This reflects the data.
- Live cardinalities (dev, 2026-10-14): `q=silva` 35,970; with `verified=true`, 16,698.

---

## `GET /search/autocomplete`

Typeahead suggestions blending work **titles**, **author** names and **venue** names. Each kind is searched in its own Manticore field. The **last term matches as a prefix** from 3 characters on (`kins` → *kinship*, *Kinsella*), and earlier terms match as whole words. The most-cited matching works are then hydrated from MariaDB. Not paginated. Requests are not recorded for `/search/popular`.

### Query parameters

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `q` | string | — | up to 200 chars (400 above). Shorter than 2 chars, or absent, returns the short-query shape (HTTP 200). | Text to complete. |
| `type` | enum | `all` | `all, titles, authors, venues` (400 otherwise) | Suggestion kinds. |
| `limit` | integer | 10 | 1–20 (400 outside) | Maximum suggestions. |

### Example response (`type=all`)

`GET /search/autocomplete?q=kins`, abridged:

```json
{
  "status": "success",
  "data": {
    "query": "kins",
    "suggestions": [
      { "text": "American Kinship", "type": "title", "relevance": 1, "preview": "American Kinship" },
      { "text": "Bill Kinsey", "type": "author", "work_count": 3, "preview": "Bill Kinsey (3 works)" },
      {
        "text": "Anthropological Perspectives on Kinship",
        "name": "Anthropological Perspectives on Kinship",
        "abbreviated_name": null,
        "type": "venue",
        "work_count": 1,
        "preview": "Anthropological Perspectives on Kinship (1 works)"
      }
    ],
    "type": "all",
    "count": 10,
    "generated_at": "2026-10-14T05:20:09.886Z"
  },
  "meta": { "query": "kins", "type": "all", "limit": 10, "engine": "Manticore", "request": { "method": "GET", "path": "/search/autocomplete?q=kins" } }
}
```

### Example response (short query, HTTP 200)

```json
{
  "status": "success",
  "data": { "suggestions": [], "message": "Query too short" },
  "meta": { "query": "a", "type": "all", "limit": 10, "request": { "method": "GET", "path": "/search/autocomplete?q=a" } }
}
```

### Fields

| field | type | notes |
|---|---|---|
| `data.query` | string | Echoed query. Absent in the short shape. |
| `data.suggestions[]` | array | Mixed items, discriminated by `type`. With `type=all`, the list is the first three titles, then three authors, then three venues, then any remainder. |
| `suggestions[].text` | string | Display text. |
| `suggestions[].type` | enum | `"title"` \| `"author"` \| `"venue"`. |
| `suggestions[].relevance` | int | **Title items only.** Number of matched works sharing that exact title. Titles are ordered by this count, then by the citations of their most-cited work. |
| `suggestions[].work_count` | int | **Author and venue items only.** Number of works carrying that name **among the sampled matches** (the top `limit × 5` matching works by citations), not the person's or venue's total. The `preview` string reuses this number. |
| `suggestions[].name` / `abbreviated_name` | string | **Venue items only.** |
| `suggestions[].preview` | string | Ready-to-display string. |
| `data.type`, `data.count`, `data.generated_at` | | Absent in the short shape. |
| `data.query_revision` | object | Present only when the typed text produced no suggestion and the suggestions shown are those of a corrected text (`status: "corrected"`, always applied). See [Query revision](#query-revision-typo-tolerance). |
| `data.message` | string | Short shape only: `"Query too short"`. |
| `meta.engine` | string | `"Manticore"`. Absent in the short shape. |

### Notes

- Handle both shapes. Key off `Array.isArray(data.suggestions)` plus the presence of `data.count`.
- **Prefix rule.**
  - A trailing fragment shorter than 3 characters is ignored while earlier terms exist: `antropologia ur` suggests for `antropologia`.
  - A lone 2-character query matches that exact word.
  - Prefix expansion is capped at the 128 most frequent completions.
- **Author and venue items** must contain every typed term (case- and accent-insensitive substring), so names that matched only through a co-author or a sibling publication are dropped. Author suggestions come from the AUTHOR-role `authors` field. Title items match on stems.
- **Correction fallback.** When the typed text yields no suggestion, its completed words are corrected against the dictionary and the suggestions of the corrected text are returned with `data.query_revision`: `lkuiz fernando d` suggests for `luiz fernando d`. The last word is treated as a prefix being typed and left alone, unless no dictionary word starts with it, or it matches nothing as a prefix next to the other words. Autocomplete never drops a word.
- If the full-text lookup fails, the endpoint returns an empty `suggestions` list, never an error inside a success envelope.

---

## `GET /search/popular`

The most frequent recent search queries, for "trending" chips on an empty search box.

**Source.** Every `/search/works` request with a non-empty `q`, and every `/search/global` request, appends its query to a Redis list:
- The query is stored whole, trimmed and lower-cased, not split into words.
- The list key is `search_analytics:YYYY-MM-DD`, using the UTC date.
- Each daily list keeps its newest 5,000 entries and expires after 30 days.

**Aggregation.**
- The endpoint counts identical query strings over every retained entry (up to 5,000) of each of the last 7 days.
- Queries shorter than 2 characters and single common stop words are skipped.
- Results are sorted by frequency, then alphabetically.
- The top 50 are cached for 600 s under `autocomplete:v2:popular:terms:v2` and sliced to `limit`.

Without Redis the list is empty: it is never an error and never a corpus scan.

### Query parameters

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `limit` | integer | 20 | 1–50 (clamped, not rejected) | Maximum terms returned. |

### Example response

Values are illustrative; they depend on live traffic.

```json
{
  "status": "success",
  "data": {
    "popular_terms": [
      { "term": "kinship", "frequency": 12, "type": "popular" },
      { "term": "european union", "frequency": 7, "type": "popular" }
    ],
    "generated_at": "2026-10-14T05:20:09.967Z"
  },
  "meta": { "limit": 5, "source": "autocomplete_popular", "request": { "method": "GET", "path": "/search/popular?limit=5" } }
}
```

### Fields

| field | type | notes |
|---|---|---|
| `popular_terms[].term` | string | A recorded query string (may contain several words). |
| `popular_terms[].frequency` | int | Number of recorded requests with that query in the window. |
| `popular_terms[].type` | string | Constant `"popular"`. |
| `data.generated_at` | ISO datetime | When this response was assembled. |
| `meta.limit` | int | Effective clamped limit. |
| `meta.source` | string | Constant `"autocomplete_popular"` (historical label). |

Feed a chosen `term` straight into `/search/works?q=`.

---

## `GET /search/health`

Manticore backend status and table topology, for status dashboards rather than end-user UI. No parameters.

### Example response

```json
{
  "status": "success",
  "data": {
    "search_engine": "Manticore",
    "backend": "manticore",
    "reachable": true,
    "tables": [
      { "Table": "persons", "Type": "distributed" },
      { "Table": "persons_delta", "Type": "local" },
      { "Table": "persons_main", "Type": "local" },
      { "Table": "works", "Type": "distributed" },
      { "Table": "works_delta", "Type": "local" },
      { "Table": "works_main", "Type": "local" }
    ],
    "indexes": {
      "works": "Manticore table works (title, subtitle, abstract, authors, subjects, venue)",
      "persons": "Manticore table persons (preferred_name, given_names, family_name)",
      "venues": "Manticore field venue for the works venue filter; MariaDB ft_venues_search (name + abbreviated_name) for the /publications venue filter"
    },
    "endpoints": {
      "basic_search": "/search/works",
      "advanced_search": "/search/advanced",
      "autocomplete": "/search/autocomplete",
      "popular_terms": "/search/popular"
    }
  },
  "meta": { "request": { "method": "GET", "path": "/search/health" } }
}
```

### Fields

| field | type | notes |
|---|---|---|
| `data.backend` | string | Runtime `SEARCH_BACKEND` (default `manticore`). |
| `data.reachable` | boolean | Whether `searchd` answered. |
| `data.error` | string | Present only when unreachable. |
| `data.tables[]` | array | `{ Table, Type }`. Each distributed table (`works`, `persons`) fans out to its `*_main` and `*_delta` local tables. |
| `data.indexes.*` | string | Descriptive labels. `venues` names both venue-filter backends: the Manticore `venue` field (works filter of `/works` and `/search/*`) and MariaDB `ft_venues_search` (`/publications` venue filter). `/venues` itself uses neither; it matches with LIKE. |
| `data.endpoints.*` | string | Route hints. |

### Notes

- When `reachable` is `false`, `/search/works` and `/search/advanced` requests that carry a text term fail, and so do `/search/global`, `/search/persons` and `/persons?search=`. `/search/autocomplete` returns an empty `suggestions` list. There is no MariaDB fallback for works or persons full-text. Filter-only `/search/works` requests (MariaDB browse) keep working.
- `*_main` holds a full build and `*_delta` holds the works and persons updated in the 48 h before the last delta build. Rebuilds are an operator task. A record created or updated after the last build resolves by id on `/works/{id}` or `/persons/{id}` but is missing from search until the index is rebuilt.
