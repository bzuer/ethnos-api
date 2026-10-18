# Persons — researchers and authors

This domain exposes the **person / author entity**: researchers and authors, backed by the `persons` base table (metric block, identifiers, `signature_id`). At request time it is enriched by joins to:

- `signatures`;
- `authorships`, with `works`, `publications` and `venues`;
- `work_subjects` and `subjects`;
- `organizations`, for the primary affiliation.

Free-text name search (`search` / `q`) always runs through **Manticore** (the `persons` index: `preferred_name, given_names, family_name`, unstemmed). There is no MariaDB fallback. The plain list, the `signature` lookup and every nested endpoint are served by **MariaDB**.

Persons link outward to:

- [works](./works.md) (`/persons/{id}/works`);
- [institutions](./institutions.md) (`primary_affiliation`);
- [signatures](./signatures.md).

`/persons/{id}/collaborators` and `/persons/{id}/network` are documented in [collaborations](./collaborations.md).

Corpus (measured 2026-10-14): **4,903,220 persons**, **1,545,674 verified**. Most persons have a single work. Productive ones are the exception, for example id `3589585` (John C Campbell): 1,230 works, h-index 16.

Global conventions (envelope, pagination, rate limiting, error codes, normalization, shared citation and sort parameters) are in [../00-conventions.md](../00-conventions.md). The default page size is 10. An explicit `offset` is served as given and echoed in `meta.pagination_extras.offset`.

## Identifiers on person payloads

`identifiers{}` always carries six keys:

| key | source | populated |
|---|---|---|
| `orcid` | `persons.orcid` | On every path. |
| `lattes_id` | `persons.lattes_id` | Detail only (`/persons/{id}`). One person in the corpus has one. |
| `scopus_id` | `persons.scopus_id` | Detail only. No person has one today. |
| `wikidata_id`, `openalex_id`, `url` | none (no such columns) | Always `null` on every endpoint. |

---

## `GET /persons`

Paginated list of researchers and authors. It has no `sort_by`/`sort_order` and no affiliation or country filter. Parameters are applied in this order of precedence:

1. `search` (alias `q`) runs the Manticore name search. `verified` still applies; `signature` is ignored.
2. `signature` runs a MariaDB prefix lookup on `signatures.signature`, combined with `verified`.
3. Otherwise the plain MariaDB list, `id DESC` (newest first), optionally filtered by `verified`.

**Query parameters**

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `page` | integer | 1 | ≥ 1 | 1-based page. |
| `limit` | integer | 10 | 1–100 (400 outside) | Page size. |
| `offset` | integer | — | ≥ 0 | Alternative to `page`; served as given. |
| `search` | string | — | 2–200 chars after trimming | Manticore name search: every term required, names unstemmed. Sets `meta.engine="Manticore"` and `meta.query_type="search"`. |
| `q` | string | — | 2–200 chars after trimming | Alias of `search`, validated the same way. |
| `signature` | string | — | 2–100 chars | Prefix match on the stored signature (`SILVA J` → `SILVA J…`). Case-insensitive. `%`, `_` and `\` are literal characters, not wildcards. Sets `meta.query_type="signature_lookup"`. |
| `verified` | string | — | `true` \| `false` \| `1` \| `0` (400 otherwise) | Filters `is_verified` on every path. |
| `autocorrect` | string | `true` | `true` \| `false` \| `1` \| `0` (400 otherwise) | Search path only. `false` serves the literal name query and only suggests a revision. |

Unknown parameters such as `affiliation=` or `country=` are ignored: they are no-ops, not errors.

**Example requests**

```
GET /persons?limit=20
GET /persons?search=silva&verified=true
GET /persons?signature=SILVA J&verified=true
GET /persons?verified=true&offset=40&limit=20
```

**Example response** (`GET /persons?limit=3`, first row shown)

```json
{
  "status": "success",
  "data": [
    {
      "id": 11182656,
      "_links": { "self": "/persons/11182656" },
      "preferred_name": "Deborah Cassuto",
      "given_names": "Deborah",
      "family_name": "Cassuto",
      "name_signature": "CASSUTO D",
      "identifiers": { "orcid": null, "lattes_id": null, "scopus_id": null, "wikidata_id": null, "openalex_id": null, "url": null },
      "is_verified": false,
      "metrics": { "works_count": 1, "latest_publication_year": 2026 }
    }
  ],
  "pagination": { "page": 1, "limit": 3, "total": 4903220, "totalPages": 1634407, "hasNext": true, "hasPrev": false },
  "meta": {
    "engine": "MariaDB",
    "query_type": "list",
    "elapsed_ms": 362,
    "pagination_total_exact": true,
    "request": { "method": "GET", "path": "/persons?limit=3" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields** (list item)

| field (dot-path) | type | notes |
|---|---|---|
| `id` | integer | Person id. |
| `_links.self` | string | `/persons/{id}`. |
| `preferred_name` | string \| null | Display name. |
| `given_names` / `family_name` | string \| null | |
| `name_signature` | string \| null | From the `signatures` join, e.g. `CASSUTO D`. Always `null` on the `search`/`q` path. |
| `identifiers` | object | See [Identifiers](#identifiers-on-person-payloads). Only `orcid` can be populated on the list. |
| `is_verified` | boolean | Verification flag. |
| `metrics.works_count` | integer | `persons.total_works`. |
| `metrics.latest_publication_year` | integer \| null | `persons.latest_publication_year`. |

**meta**

| field | notes |
|---|---|
| `meta.engine` | `MariaDB` (list, signature) or `Manticore` (search). |
| `meta.query_type` | `list` \| `signature_lookup` \| `search`. |
| `meta.elapsed_ms` | MariaDB paths only. |
| `meta.pagination_total_exact` | Plain list and search paths. `false` when the count exceeded its budget (2 s on the list, Manticore's 4 s `max_query_time` on search): `total` is then only a lower bound (`offset` + rows on this page, + 1 when the page is full). |
| `meta.page_degraded`, `meta.note` | Plain list only, when the page query itself exceeded the statement budget: `data` is empty and `pagination.total` is 0. Use a filter or a shallower page. |
| `meta.query_revision` | Search path only, when the name matched nothing and was revised (a misspelled part corrected, preferring the better-known match: `lkuiz fernando dias duarte` → Luiz Fernando Dias Duarte; failing that, the conflicting part dropped), or when a revision is suggested. See [search › Query revision](./search.md#query-revision-typo-tolerance). |
| `meta.pagination_extras.offset` | Effective offset. |
| `meta.request` | `{ method, path }`. |

**Notes**

- **Statement budgets.**
  - The plain list selects the page ids under the statement budget and then hydrates them; deep pages remain answerable (`page=490000` took 3.2 s, measured 2026-10-14).
  - The signature lookup is budgeted too; a timeout there answers **503 `REQUEST_TIMEOUT`**.
  - The search path pages up to the first 100,000 matches; beyond that it answers **400 `VALIDATION_ERROR`**. A search page that exceeds Manticore's 4 s `max_query_time` answers **503 `REQUEST_TIMEOUT`** instead of a truncated page.
- **Search freshness.** The search path depends on the Manticore index. A person created or updated after the last index build resolves on `/persons/{id}` but may be missing from search. The development index currently lacks about 137k persons.
- Live cardinalities (2026-10-14):
  - `search=silva`: 35,970.
  - `signature=SILVA J`: 841, of which 378 with `verified=true`.
  - `verified=true`: 1,545,674.

---

## `GET /persons/{id}`

Full researcher profile: metrics, identifiers, primary affiliation, authorship profile, subject expertise, top collaborators and recent works. MariaDB only. There are no query parameters.

**Path parameters**

| param | type | notes |
|---|---|---|
| `id` | integer ≥ 1 | Person id. Non-existent → **404 NOT_FOUND**. |

**Example response** (`GET /persons/3589585`, arrays trimmed to one element)

```json
{
  "status": "success",
  "data": {
    "id": 3589585,
    "_links": { "self": "/persons/3589585" },
    "preferred_name": "John C Campbell",
    "given_names": "John C",
    "family_name": "Campbell",
    "name_variations": [],
    "name_signature": "CAMPBELL J C",
    "identifiers": { "orcid": null, "lattes_id": null, "scopus_id": null, "wikidata_id": null, "openalex_id": null, "url": null },
    "is_verified": false,
    "metrics": { "works_count": 1230, "latest_publication_year": 2025 },
    "primary_affiliation": {
      "id": 2964896,
      "name": "Council on Foreign Relations",
      "type": "INSTITUTE",
      "country_code": "US",
      "_links": { "self": "/institutions/2964896" }
    },
    "authorship_profile": {
      "works_count": 1230,
      "author_count": 1230,
      "editor_count": 0,
      "total_citations": 2688,
      "open_access_works": null,
      "first_publication_year": 1922,
      "latest_publication_year": 2025,
      "h_index": 16
    },
    "subject_expertise": [
      { "subject_id": 341907, "term": "Political science", "vocabulary": "Keyword", "works_count": 1213 }
    ],
    "top_collaborators": [
      { "person_id": 993965, "preferred_name": "Seweryn Bialer", "shared_works_count": 7 }
    ],
    "recent_works": [
      {
        "id": 21454979,
        "title": "The effects of implicit bias interventions on mock jurors’ civil trial decisions and perceptions of the courts",
        "subtitle": null,
        "type": "ARTICLE",
        "language": "en",
        "publication_year": 2025,
        "doi": "10.1037/lhb0000610",
        "open_access": false,
        "role": "AUTHOR",
        "roles": ["AUTHOR"],
        "position": 4,
        "venue": { "id": 1023027, "name": "Law and Human Behavior", "abbreviated_name": "Law Hum. Behav.", "type": "JOURNAL" }
      }
    ],
    "created_at": "2025-11-14T20:10:42.000Z",
    "updated_at": "2026-09-28T07:35:25.000Z"
  },
  "meta": { "request": { "method": "GET", "path": "/persons/3589585" } }
}
```

**Fields** (root)

| field (dot-path) | type | notes |
|---|---|---|
| `id`, `_links.self`, `preferred_name`, `given_names`, `family_name` | | As on the list. |
| `name_variations` | string[] | Always `[]`: no source column is read. |
| `name_signature` | string \| null | From the `signatures` join. |
| `identifiers` | object | See [Identifiers](#identifiers-on-person-payloads). The detail also reads `lattes_id` and `scopus_id`. |
| `is_verified` | boolean | |
| `metrics.works_count` | integer | `persons.total_works`. |
| `metrics.latest_publication_year` | integer \| null | |
| `created_at` / `updated_at` | ISO date-time | |

**`primary_affiliation`** is a compact stub (object \| null): `{ id, name, type, country_code, _links.self → /institutions/{id} }`. It is the organization most often attached to this person's authorships, and `null` when there is none. `name` can be a raw affiliation string. Fetch `/institutions/{id}` for the full record.

**`authorship_profile`**

| field | type | notes |
|---|---|---|
| `works_count` | integer | `persons.total_works` (stored; all roles). |
| `author_count` | integer | Distinct works with role `AUTHOR`. |
| `editor_count` | integer | Distinct works with role `EDITOR`. Translator credits are counted in `works_count` but not broken out. |
| `total_citations` | integer \| null | `persons.total_citations`. |
| `open_access_works` | integer \| null | Always `null` (not computed). |
| `first_publication_year` / `latest_publication_year` | integer \| null | Stored person metrics. |
| `h_index` | integer \| null | `persons.h_index`. |

**`subject_expertise[]`**: top 10 subjects of the person's works: `{ subject_id, term, vocabulary, works_count }`. The same concept can appear under several vocabularies.

**`top_collaborators[]`**: top 10 co-contributors by shared works: `{ person_id, preferred_name, shared_works_count }`.

**`recent_works[]`**: up to 10 works, **one row per work**. They are ordered by the year of the latest publication, newest first with NULL years last, then by work id.

| field | type | notes |
|---|---|---|
| `id` | integer | Work id → `/works/{id}`. |
| `title` / `subtitle` | string \| null | |
| `type` | string \| null | Type of the latest publication. |
| `language` | string \| null | ISO 639-1. |
| `publication_year` | integer \| null | Year of the latest publication. |
| `doi` | string \| null | |
| `open_access` | boolean | |
| `role` | string | Highest-ranked role this person holds on the work: `AUTHOR` > `EDITOR` > `TRANSLATOR` > `REVIEWER`. |
| `roles` | string[] | Every role held, e.g. `["EDITOR","TRANSLATOR"]` (person 10254056, work 11786579). |
| `position` | integer \| null | Position within `role`. Positions are 1-based per role, not per work. |
| `venue` | object \| null | `{ id, name, abbreviated_name, type }`. |

**Notes**

- 404: `{ status:"error", code:"NOT_FOUND", message:"Person with ID … not found", meta:{ id, request } }`.
- `primary_affiliation`, `subject_expertise` and `top_collaborators` degrade to `null`/`[]` if their query fails or exceeds its budget. The rest of the profile is still returned.
- For the full paginated list of works, use `/persons/{id}/works`.

---

## `GET /persons/{id}/works`

Every work the person contributed to, in any role, paginated with **one row per work**. Honours the shared work sort and citation-filter contract plus `role`/`year_from`/`year_to`. Rate-limited by `relationalLimiter`. Counts are exact.

**Query parameters**

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `page` / `limit` / `offset` | integer | 1 / 10 / — | `limit` 1–100 | Pagination. |
| `role` | string | — | `AUTHOR` \| `EDITOR` \| `TRANSLATOR` \| `REVIEWER` (case-insensitive) | Keep works where the person holds this role. `authorship.roles` still lists every role the person holds. |
| `year_from` / `year_to` | integer | — | ≥ 1000 | Inclusive bounds on the year of the displayed (latest) publication. A work without a year counts as year 0: `year_from` excludes it, while `year_to` alone keeps it. |
| `cited_by_min` / `cited_by_max` | integer | — | ≥ 0 | Inclusive bounds on `works.citation_count` (aliases `citation_count_min` / `citation_count_max`). |
| `sort_by` | string | `publication_year` | `cited_by_count`, `references_count`, `publication_year` (aliases `citation_count`, `reference_count`, `year`) | Primary sort key. Invalid → 400. |
| `sort_order` | string | `DESC` | `ASC` \| `DESC` | Direction. On the year sort, works without a year come last in both directions. The citation and reference sorts break ties on year (newest first, NULL last), then on work id `DESC`. |

**Example requests**

```
GET /persons/3589585/works?limit=20
GET /persons/3589585/works?sort_by=cited_by_count&sort_order=DESC
GET /persons/416317/works?role=TRANSLATOR
GET /persons/3589585/works?year_from=2000&year_to=2020
```

**Example response** (`GET /persons/3589585/works?limit=2&sort_by=cited_by_count`, first row shown)

```json
{
  "status": "success",
  "data": [
    {
      "id": 9825585,
      "title": "Duties beyond Borders",
      "subtitle": "On the Limits and Possibilities of Ethical International Politics",
      "abstract": null,
      "type": "ARTICLE",
      "language": "en",
      "doi": "10.2307/20040911",
      "publication_year": 1981,
      "open_access": false,
      "cited_by_count": 24,
      "references_count": 0,
      "authorship": { "role": "AUTHOR", "roles": ["AUTHOR"], "position": 1, "is_corresponding": true },
      "publication": { "year": 1981, "journal": "Foreign Affairs", "volume": "59", "issue": "5", "pages": "1174", "open_access": false },
      "authors": { "total_count": 2, "author_string": "John C Campbell; Stanley Hoffmann" },
      "created_at": "2026-04-08T01:20:09.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 2, "total": 1230, "totalPages": 615, "hasNext": true, "hasPrev": false },
  "meta": {
    "request": { "method": "GET", "path": "/persons/3589585/works?limit=2&sort_by=cited_by_count" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields** (work row)

| field (dot-path) | type | notes |
|---|---|---|
| `id` | integer | Work id → `/works/{id}`. |
| `title` / `subtitle` | string \| null | |
| `abstract` | string \| null | Full text, can be long. |
| `type` | string \| null | Type of the latest publication. |
| `language` | string \| null | ISO 639-1. |
| `doi` | string \| null | Latest publication. |
| `publication_year` | integer \| null | Year of the latest publication. |
| `open_access` | boolean | Latest publication. |
| `cited_by_count` / `references_count` | integer | `works.citation_count` / `works.reference_count`. |
| `authorship.role` | string | Highest-ranked role the person holds on the work. |
| `authorship.roles` | string[] | Every role held, complete even under a `role` filter. For example, person 416317 with `role=TRANSLATOR` returns work 2687677 with `role: "EDITOR"` and `roles: ["EDITOR","TRANSLATOR"]`. |
| `authorship.position` | integer \| null | Position within `authorship.role` (1-based per role). |
| `authorship.is_corresponding` | boolean | Corresponding flag on any of the person's authorships of the work. |
| `publication.{year,volume,issue,pages,open_access}` | | Latest publication. `publication.year` duplicates `publication_year`. |
| `publication.journal` | string \| null | Venue name of the latest publication (no abbreviation on this endpoint). |
| `authors.total_count` | integer | Distinct people credited on the work, across every role. |
| `authors.author_string` | string \| null | `; `-joined names of every contributor (not just this person), deduplicated by person, AUTHOR first. |
| `created_at` | ISO date-time | Work record creation. |

**Notes**

- 404 for a non-existent person id (same envelope as `/persons/{id}`). An existing person with no matching work returns 200 with an empty page.
- Fast in practice: a 2,063-work person answers in under 40 ms uncached (measured 2026-10-14).

---

## `GET /persons/{id}/signatures`

The name signature linked to the person (`persons.signature_id` → `signatures`). A person has 0 or 1 signature, so pagination is effectively cosmetic. Rate-limited by `relationalLimiter`.

**Path parameters**: `id` (integer ≥ 1; non-existent → **404**). **Query parameters**: `page`, `limit` (1–100, default 10) and `offset`.

**Example response** (`GET /persons/3589585/signatures`)

```json
{
  "status": "success",
  "data": [
    { "id": 32492, "signature": "CAMPBELL J C", "created_at": "2025-11-16T15:30:27.000Z", "persons_count": 9 }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1, "hasNext": false, "hasPrev": false },
  "meta": {
    "request": { "method": "GET", "path": "/persons/3589585/signatures" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields**

| field | type | notes |
|---|---|---|
| `id` | integer | Signature id → `/signatures/{id}` (see [signatures](./signatures.md)). |
| `signature` | string | Normalized signature text (uppercase, e.g. `CAMPBELL J C`). |
| `created_at` | ISO date-time | |
| `persons_count` | integer | Persons sharing this signature, a useful "ambiguous name" signal: here 9 people share `CAMPBELL J C`. |

---

## Cross-links

- Works by a person: `GET /persons/{id}/works` → [works](./works.md).
- Primary affiliation → [institutions](./institutions.md).
- Signature detail and shared-signature clusters → [signatures](./signatures.md).
- Collaborator graph: `GET /persons/{id}/collaborators` and `GET /persons/{id}/network` → [collaborations](./collaborations.md).
- Name search across works and persons together → [search](./search.md) (`/search/persons`, `/search/global`).
