# Signatures — normalized author name forms and their person/work linkages

The signatures domain exposes **normalized author-name strings**: uppercase canonical forms such as `"SILVA A"` and `"DA SILVA A M"`, with the persons and works attached to them. It is backed by the `signatures` base table (`id`, `signature`, `created_at`; 3,173,239 rows, all linked to at least one person, measured 2026-10-14) joined to `persons.signature_id`. Manticore is not involved: signature search is a MariaDB `LIKE` / `=` over `signatures.signature`, and person and work rows are hydrated from MariaDB by id.

Many `persons` rows can share one `signature_id`; `/signatures/{id}/persons` and `/signatures/{id}/works` expand that grouping. The domain reuses the person list-item shape from [persons](./persons.md) and links out to [works](./works.md). Envelope, pagination (`page`/`limit` or `offset`/`limit`, default page size 10, an explicit `offset` is served as given), rate limiting and error codes follow [00-conventions](../00-conventions.md).

> **No root collection listing.** `GET /signatures` is intentionally not registered and returns 404 from the global not-found handler. Use `/signatures/search` to browse.

| Endpoint | Purpose | Cache |
|---|---|---|
| `GET /signatures/search` | substring or exact search over the signature string | 30 min |
| `GET /signatures/statistics` | aggregate stats over the whole table | 48 h |
| `GET /signatures/{id}` | single signature detail | 1 h |
| `GET /signatures/{id}/persons` | persons sharing this signature | 30 min |
| `GET /signatures/{id}/works` | works contributed by any person carrying this signature | 1 h |

---

## `GET /signatures/search`

Substring (default) or exact search over the normalized signature string. Matching is case- and accent-insensitive (`silva a` finds `SILVA A`; `alcantara-silva` finds `ALCÂNTARA-SILVA T`).

**Query parameters**

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `q` | string | — | **required**, 2..100 chars after trimming | Search term. Missing, empty or one-character → **400** `VALIDATION_ERROR`. |
| `exact` | boolean | `false` | `true` / `1` / `false` / `0` | `true` or `1` → `signature = q`; otherwise substring `LIKE %q%`, with `%`, `_` and `\` in `q` matched literally. |
| `page` | integer | 1 | ≥ 1 | Page number. |
| `limit` | integer | 10 | 1..100 | Page size. |
| `offset` | integer | — | ≥ 0 | Rows to skip; takes precedence over `page`. |

**Ordering** is alphabetical by `signature`, then by `id`. Substring matches are not ranked by how many persons share them.

**Totals.** The count runs under a 2 s budget. When it finishes, `pagination.total` is exact and `meta.pagination_total_exact` is `true`. When it does not, `meta.pagination_total_exact` is `false` and `pagination.total` is only a lower bound: rows seen so far, plus one when the page is full. Paginate with `data.length < limit` as the terminator in that case.

**Cost.** Measured 2026-10-14: about 0.5 s for any substring term, frequent or absent (`silva`, 7,900 matches: 0.67 s; `ZZQX`, no match: 0.52 s), exact searches 2 ms. (Before that day's index cleanup a term matching nothing took 3.2 s.) A page that exceeds its statement budget returns **503** `REQUEST_TIMEOUT`.

**Example requests**

```
GET /signatures/search?q=silva&limit=5
GET /signatures/search?q=silva&limit=5&page=2
GET /signatures/search?q=silva&limit=20&offset=40
GET /signatures/search?q=SILVA%20A&exact=1
GET /signatures/search?q=a           # 400 — q needs at least 2 characters
```

**Example response** (`?q=silva&limit=5`, three of five rows shown)

```json
{
  "status": "success",
  "data": [
    { "id": 28217694, "signature": "ABAYASIRI-SILVA K", "created_at": "2026-04-10T06:08:46.000Z", "persons_count": 1, "_links": { "self": "/signatures/28217694" } },
    { "id": 28789523, "signature": "ABREU-SILVA R S",   "created_at": "2026-04-12T17:22:05.000Z", "persons_count": 1, "_links": { "self": "/signatures/28789523" } },
    { "id": 8538496,  "signature": "ABUFOM-SILVA P",    "created_at": "2025-12-14T05:05:43.000Z", "persons_count": 1, "_links": { "self": "/signatures/8538496" } }
  ],
  "pagination": { "page": 1, "limit": 5, "total": 7900, "totalPages": 1580, "hasNext": true, "hasPrev": false },
  "meta": {
    "searchTerm": "silva",
    "exact": false,
    "pagination_total_exact": true,
    "request": { "method": "GET", "path": "/signatures/search?q=silva&limit=5" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields** (each `data[]` element)

| field | type | notes |
|---|---|---|
| `id` | integer | Signature id; pass to `/signatures/{id}` and the nested endpoints. |
| `signature` | string | Normalized, uppercase name form. |
| `created_at` | string(date-time) \| null | ISO 8601. |
| `persons_count` | integer | `persons` rows carrying this signature, counted for the returned rows only. |
| `_links.self` | string | `/signatures/{id}`. |

**Meta**

| field | type | notes |
|---|---|---|
| `meta.searchTerm` | string | Echo of the trimmed `q`. |
| `meta.exact` | boolean | Whether exact matching was applied. |
| `meta.pagination_total_exact` | boolean | `false` when the count exceeded its budget (see above). |
| `meta.pagination_extras.offset` | integer | Offset served. |

To find a person by natural name rather than by signature, prefer [`/search/persons`](./search.md).

---

## `GET /signatures/statistics`

Aggregate statistics over the entire `signatures` table: length buckets and person linkage. No parameters. A cold call measured 2.0 s.

**Example response** (measured 2026-10-14)

```json
{
  "status": "success",
  "data": {
    "total_signatures": 3173239,
    "short_signatures": 1763369,
    "medium_signatures": 1391406,
    "long_signatures": 18464,
    "avg_signature_length": 10.5339,
    "linked_signatures": 3173239,
    "unlinked_signatures": 0
  },
  "meta": { "request": { "method": "GET", "path": "/signatures/statistics" } }
}
```

**Fields**

| field | type | notes |
|---|---|---|
| `total_signatures` | integer | `COUNT(*)` of the table. |
| `short_signatures` | integer | Signatures of at most 10 characters. |
| `medium_signatures` | integer | 11 to 20 characters. |
| `long_signatures` | integer | More than 20 characters. |
| `avg_signature_length` | number | Mean length in characters. |
| `linked_signatures` | integer | Signatures referenced by at least one `persons.signature_id`. |
| `unlinked_signatures` | integer | `total_signatures - linked_signatures`. |

Lengths are counted in characters (`CHAR_LENGTH`), so accented names are bucketed by what a reader sees.

---

## `GET /signatures/{id}`

Single signature detail.

**Path parameters:** `id` (integer ≥ 1). A non-integer value returns 400; a non-existent id returns **404** `NOT_FOUND` with message `"Signature not found"`.

**Example response** (`/signatures/259377`)

```json
{
  "status": "success",
  "data": {
    "id": 259377,
    "signature": "DA SILVA A M",
    "created_at": "2025-11-16T15:32:32.000Z",
    "persons_count": 93,
    "_links": { "self": "/signatures/259377" }
  },
  "meta": { "request": { "method": "GET", "path": "/signatures/259377" } }
}
```

The fields are the same as a search row: `id`, `signature`, `created_at`, `persons_count`, `_links.self`. To expand the signature, follow with `/signatures/{id}/persons` and `/signatures/{id}/works`.

---

## `GET /signatures/{id}/persons`

Paginated list of the `persons` that share this signature (`persons.signature_id = id`), ordered by `preferred_name`, then `id`. Returns the shared person list-item shape, not a signature shape.

**Query parameters**

| param | type | default | bounds | effect |
|---|---|---|---|---|
| `page` | integer | 1 | ≥ 1 | Page number. |
| `limit` | integer | 10 | 1..100 | Page size. |
| `offset` | integer | — | ≥ 0 | Rows to skip; takes precedence over `page`. |

**Example response** (`/signatures/259377/persons?limit=3`, one of three rows shown)

```json
{
  "status": "success",
  "data": [
    {
      "id": 6799473,
      "_links": { "self": "/persons/6799473" },
      "preferred_name": "Aarão Miranda da Silva",
      "given_names": "Aarão Miranda",
      "family_name": "da Silva",
      "name_signature": null,
      "identifiers": { "orcid": null, "lattes_id": null, "scopus_id": null, "wikidata_id": null, "openalex_id": null, "url": null },
      "is_verified": false,
      "metrics": { "works_count": 1, "latest_publication_year": 2014 }
    }
  ],
  "pagination": { "page": 1, "limit": 3, "total": 93, "totalPages": 31, "hasNext": true, "hasPrev": false },
  "meta": {
    "request": { "method": "GET", "path": "/signatures/259377/persons?limit=3" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields** (the [persons](./persons.md) list-item shape)

| field | type | notes |
|---|---|---|
| `id` / `_links.self` | integer / string | Person id and `/persons/{id}`. |
| `preferred_name` / `given_names` / `family_name` | string \| null | Name parts. |
| `name_signature` | string \| null | Always `null` here (the query does not select it). |
| `identifiers.{orcid,lattes_id,scopus_id,wikidata_id,openalex_id,url}` | string \| null | Only `orcid`, `lattes_id` and `scopus_id` are selected on this route; the others are `null`. |
| `is_verified` | boolean | Person verification flag. |
| `metrics.works_count` | integer | `persons.total_works`. |
| `metrics.latest_publication_year` | integer \| null | Most recent publication year for the person. |

**Notes:** `pagination.total` is an exact count of persons with this `signature_id`. A non-existent signature returns **404** `NOT_FOUND` (`"Signature not found"`).

---

## `GET /signatures/{id}/works`

Paginated list of works contributed by **any** person carrying this signature, one row per work.

**Query parameters**

| param | type | default | bounds | effect |
|---|---|---|---|---|
| `page` | integer | 1 | ≥ 1 | Page number. |
| `limit` | integer | 10 | 1..100 | Page size. |
| `offset` | integer | — | ≥ 0 | Rows to skip; takes precedence over `page`. |

The shared work-listing filters and sorts (`sort_by`, `cited_by_min`, `type`, …) are not available here. **Ordering** is by the year of the work's latest publication, descending, with works that have no year **last**, then by work id descending.

**Representative authorship.** When several persons under the signature contributed to a work, or one person did so under several roles, the `authorship` block describes a single authorship row. That row is picked by role (`AUTHOR`, then `EDITOR`, `TRANSLATOR`, `REVIEWER`), then by lowest position, then by lowest person id. `person_id`, `person_name`, `role`, `position` and `is_corresponding` all come from that same row.

**Example response** (`/signatures/259377/works?limit=3`, one of three rows shown)

```json
{
  "status": "success",
  "data": [
    {
      "id": 24213548,
      "title": "Itinerários terapêuticos de um usuário de um Caps infantojuvenil e práticas de saúde de seu território",
      "subtitle": null,
      "type": "ARTICLE",
      "language": null,
      "doi": "10.1590/s0104-12902026250475pt",
      "open_access": true,
      "authorship": {
        "role": "AUTHOR",
        "position": 1,
        "is_corresponding": false,
        "person_id": 11178501,
        "person_name": "Alexandre Morais da Silva"
      },
      "publication": {
        "year": 2026,
        "journal": "Saúde e Sociedade",
        "volume": "35",
        "issue": "4",
        "pages": null,
        "open_access": true
      },
      "authors": {
        "total_count": 3,
        "author_string": "Alexandre Morais da Silva; Eunice Nakamura; Andrea Perosa Saigh Jurdi"
      },
      "created_at": "2026-10-07T23:31:28.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 3, "total": 211, "totalPages": 71, "hasNext": true, "hasPrev": false },
  "meta": {
    "request": { "method": "GET", "path": "/signatures/259377/works?limit=3" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields** (each `data[]` element)

| field | type | notes |
|---|---|---|
| `id` | integer | Work id; link to `/works/{id}` (see [works](./works.md)). |
| `title` / `subtitle` | string \| null | Work title and subtitle. |
| `type` | string \| null | `type` of the latest publication (`ARTICLE`, `BOOK`, `CHAPTER`, …). |
| `language` | string \| null | ISO 639-1. |
| `doi` | string \| null | DOI of the latest publication. |
| `open_access` | boolean \| null | Open-access flag of the latest publication. |
| `authorship.role` | string | `AUTHOR`, `EDITOR`, `TRANSLATOR` or `REVIEWER` of the representative authorship. |
| `authorship.position` | integer | Its position, 1-based within its role. |
| `authorship.is_corresponding` | boolean | Its corresponding-author flag. |
| `authorship.person_id` / `person_name` | integer / string \| null | The person on that authorship row. |
| `publication.year` | integer \| null | Year of the latest publication. |
| `publication.journal` | string \| null | Venue name. |
| `publication.volume` / `issue` / `pages` | string \| null | Publication locators. |
| `publication.open_access` | boolean | Same value as the top-level `open_access`. |
| `authors.total_count` | integer | Distinct contributors (people) on the work. |
| `authors.author_string` | string \| null | `; `-joined contributor names. |
| `created_at` | string(date-time) \| null | Work `created_at`, ISO 8601. |

**Notes:** `pagination.total` is an exact count of distinct works. A non-existent signature returns **404** `NOT_FOUND` with message `"Signature with ID {id} not found"`. For per-person authorship, resolve through `/signatures/{id}/persons`, then [`/persons/{id}/works`](./persons.md). A cold page on the largest signature (`3292`, 10.7k works, `limit=100`) measured 1.1 s.

---

## Errors and edge cases

| Case | HTTP | Body |
|---|---|---|
| `q` missing, empty or one character on `/search` | 400 | `VALIDATION_ERROR` with `errors[]` (`path: "q"`). |
| Non-integer `id` | 400 | `VALIDATION_ERROR` (`Signature ID must be a positive integer`). |
| Unknown signature on detail / persons | 404 | `NOT_FOUND`, `"Signature not found"`, with `meta.request`. |
| Unknown signature on works | 404 | `NOT_FOUND`, `"Signature with ID {id} not found"`, with `meta.request`. |
| A search page exceeding its statement budget | 503 | `REQUEST_TIMEOUT`. |
| `GET /signatures` (root listing) | 404 | Global not-found, `"Can't find /signatures on this server!"`, without `meta.request`. |
