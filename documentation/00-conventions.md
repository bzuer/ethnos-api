# Ethnos API — Global conventions (read this first)

This chapter documents everything that is the **same across every endpoint**: the response envelope, pagination, authentication, error handling, automatic value normalization, the shared `meta` flags, the shared query parameters, and the search-engine model. The per-domain chapters under [`domains/`](./domains/) assume you have read this and only document what is specific to each domain.

The companion document [`API_ISSUES.md`](./API_ISSUES.md) records the behaviour defects that were found and fixed (and the few operator-side follow-ups). The machine-readable contract is the OpenAPI spec at `GET /docs.json` (Swagger UI at `GET /docs`).

---

## 1. What the API is

A public, **read-only** RESTful API over an academic bibliographic corpus:

| Entity | Scale (2026-10-14) | Endpoints |
|---|---|---|
| Works (multi-manifestation records) | 7,657,142 | `/works`, `/search/works` |
| Publications (one per published instance of a work) | 7,744,534 | `/publications` |
| Persons (researchers) | 4,903,220 | `/persons`, `/search/persons` |
| Venues (journals, book series, repositories…) | 359,932 | `/venues` |
| Organizations (institutions, publishers, funders) | 1,086,287 | `/institutions` |
| Subjects (controlled vocabulary) | 247,543 | `/subjects/*` |
| Signatures (normalized author name forms) | 3,173,239 | `/signatures/*` |
| Courses / Instructors / Bibliographies | 1 / 1 / 0 rows | `/courses`, `/instructors`, `/bibliographies` |

A **work** is a *multi-manifestation* record: its type lives per-publication on `publications.type`, so one work can carry publications of different types. Work listings use **`any_publication`** semantics (a work matches a filter if any of its publications matches).

**Base URLs**

| Environment | URL |
|---|---|
| Production | `https://api.ethnos.app` |
| Local/dev | `http://localhost:1211` |

All examples in this guide use relative paths; prefix them with a base URL. OpenAPI `info.version` is `2.0.0`.

**Ports**

Both base URLs are served by **nginx**, which reverse-proxies to the application on loopback. The API is not reachable except through that proxy, so `1211` is the only port a client ever calls.

| Port | Owner | What a client calls |
|---|---|---|
| `1211` | nginx — the API's front door | **This one.** On the API host itself it is `http://localhost:1211`; from outside, the production base URL above. |
| `1201` | the API process (`127.0.0.1` only) | Never. Loopback-bound, not routable even on the LAN. |
| `1210` | temporary instance for integration tests | Never. Only exists while a test run is up. |
| `1212` | **the frontend** | Reserved for the frontend app; never an API port. |

The application port `1201` is always loopback-bound and never reachable. How far `1211` itself reaches depends on the deployment: it may be scoped to loopback with an upstream edge terminating TLS in front of it, or bound on the host's interfaces. Either way a client on another machine uses the production base URL, not `host:1211`.

Nothing about the API surface changes because of the proxy — the path, the envelope, the headers and the status codes are the same — with one exception, described under [Gateway errors](#gateway-errors) below. The rate limiter counts the **real client IP**: every loopback hop in front of the application (the edge tunnel, nginx) appends to `X-Forwarded-For`, and the application skips loopback hops when reading it; requests are not exempted just because a proxy is on loopback.

Do not hardcode `1201` to "skip the proxy". It is not exposed, and bypassing nginx would also bypass the client-IP forwarding the rate limiter depends on.

---

## 2. Response envelope

Every response is a JSON object with a `status` discriminator.

**Success**
```json
{
  "status": "success",
  "data": <object | array | null>,
  "pagination": { ... },     // only on list endpoints
  "meta": { ... }            // almost always present
}
```

**Error**
```json
{
  "status": "error",
  "message": "Human-readable message",
  "code": "MACHINE_CODE",
  "timestamp": "2026-10-14T18:24:42.455Z",
  "errors": [ ... ],         // only on validation failures (express-validator array)
  "meta": { "request": { "method": "GET", "path": "/works" } }
}
```

Always branch on `status` first. On success, read `data`; on error, read `code` (stable) and `message` (human). `status` is `"error"` for every 4xx and 5xx produced by the application.

<a id="gateway-errors"></a>
**Gateway errors are not in this envelope**

The envelope is produced by the application. When the application is down, restarting, or unreachable, the request never gets that far and **nginx answers instead, in HTML**:

```
HTTP/1.1 502 Bad Gateway
Server: nginx
Content-Type: text/html

<html>
<head><title>502 Bad Gateway</title></head>
...
```

So a client must not assume a response body is JSON just because it came from the API host. Parse defensively:

- **`502`** — the API is not answering (deploy, restart, crash). Retry; the envelope returns with the service.
- **`504`** — the API accepted the request but did not answer within the proxy's 30 s ceiling. Rare: the application's own 5 s request budget normally answers first, in JSON, with a proper error `code`.
- Any status with `Content-Type: text/html` is the proxy talking, not the API. Treat it as infrastructure-level and fall back to a generic message rather than reading `message` / `code`.

Every other error — validation, not-found, rate limit, internal — comes from the application and does use the envelope above.

---

## 3. Pagination

Every listing accepts pagination **two ways**:

- `page` + `limit` (1-based page), or
- `offset` + `limit` (0-based offset, served exactly as given — `offset=15&limit=10` returns rows 16–25).

If both are supplied, `offset` wins and `pagination.page` reports `floor(offset/limit) + 1`.

| Param | Default | Bounds |
|---|---|---|
| `limit` | `10` (`/venues` and a few domain listings use `20`; see each chapter) | `1..100`; out-of-range values are a **400** on validated listings |
| `page` | `1` | `>= 1` |
| `offset` | `0` | `>= 0` |

The `pagination` object on list responses:

| Field | Type | Meaning |
|---|---|---|
| `page` | int | current 1-based page |
| `limit` | int | effective page size |
| `total` | int | total matching rows — **best-effort**, see `meta.pagination_total_exact` |
| `totalPages` | int | `ceil(total/limit)` |
| `hasNext` | bool | more pages after this one |
| `hasPrev` | bool | pages before this one |

The served offset is echoed under `meta.pagination_extras.offset` (the request's own `offset` when one was sent).

Full-text listings served by Manticore can be paged through the first **100,000** matches; a request whose `offset + limit` goes past that is a **400** — narrow the query or sort differently.

> **Terminator rule.** On JOIN-heavy or full-text listings `total` can be a non-exact estimate (see §6). Do not treat `total` as authoritative unless `meta.pagination_total_exact === true`. Always also stop paging when a page returns fewer than `limit` rows (`data.length < limit`).

---

## 4. Automatic value normalization

Every response passes through a normalizer, so clients can rely on stable types:

- **Booleans**: fields matching `is_*`, `has_*`, `*_flag`, `*_enabled`, `open_access`, `peer_reviewed`, `is_in_doaj`, `is_in_scielo`, `is_indexed_in_scopus`, `active`, etc. are always real JSON booleans (`0/1` and `"true"/"false"` are coerced). Numeric-looking exceptions like `works_count`, `year`, `total`, `limit`, `offset` are **not** coerced.
- **Dates**: fields matching `*_at`, `*_date`, `*timestamp`, `created_at`, `updated_at`, `publication_date`, etc. are ISO-8601 UTC strings (`YYYY-MM-DDT...Z`). Date-only values become `T00:00:00.000Z`.
- **Absent values**: missing values are JSON `null` (never `""`). Stored text is presented verbatim — a work titled `Null` keeps its title.

- **Text is never HTML-escaped**, in either direction. Query values reach the API exactly as sent (a DOI such as `10.1002/(sici)1096-8644(1996)23+<1::aid-ajpa1>3.0.co;2-9` matches `/publications?doi=`), echoes such as `meta.query` return them verbatim, and stored titles keep their characters. Escape on display.

So: booleans are booleans, dates are ISO strings, absent values are `null`, and text is raw.

---

## 5. Authentication & rate limiting

**The API is open by default — no key is required** for any data or metrics endpoint (`/`, `/works`, `/publications`, `/persons`, `/venues`, `/institutions`, `/search/*`, `/subjects/*`, `/signatures/*`, `/courses`, `/instructors`, `/bibliographies`, `/metrics/*`, citations, collaborations, the DOI resolver).

**Endpoints that require a key** (`X-Access-Key` header) — reject with **401** when missing/invalid:

- `/dashboard/*`
- `/security/*`
- `/health/readiness`, `/health/metrics`

`/health/liveness`, `/docs`, and the OpenAPI documents are public.

**Rate limiting** is on by default: one bucket per client IP, **120 requests per 60 s window** across every endpoint, plus a progressive slow-down after a configured number of requests. Over the cap → **429** `RATE_LIMITED`. Read `RateLimit-Limit` from the response rather than assuming a value — the cap is configuration, not contract. A valid key **removes** the cap on the open endpoints (it is an optional rate-limit bypass there).

The counted IP is the **real client address**, taken from `X-Forwarded-For` past every loopback proxy hop — not a proxy's own loopback address, and not a value a client can forge by sending its own `X-Forwarded-For`. The exemption for loopback traffic applies only to a process calling the API directly on the host, which is never how a browser or a deployed frontend reaches it: **assume you are rate-limited, including in local development against `localhost:1211`**. Responses carry `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`, so a client can pace itself instead of discovering the cap at 429.

Header aliases (case-insensitive): `x-access-key`, `x-internal-key`, `x-api-key`. Query-string aliases: `access_key`, `accessKey`, `api_key`.

In OpenAPI the security scheme `XAccessKey` is declared globally as **optional** (`security: [{}, { XAccessKey: [] }]`); gated operations override to require it.

---

## 6. The `meta` object — shared flags

`meta` carries provenance and reliability signals. Not every flag appears on every endpoint; the ones you will encounter:

| Flag | Where | Meaning |
|---|---|---|
| `request.{method,path}` | everywhere | echo of the request |
| `pagination_total_exact` | work/publication/institution/subject/person/signature listings, search, collaborations | `false` → `pagination.total` is an estimate (unfiltered browse, a count that exceeded its ~2 s budget, or a capped full-text set); gate on this before trusting `total`. Count outcomes are cached per filter set (an estimate for 10 minutes, an exact count for 1 hour), so only the first request for a filter pays the count budget |
| `match_mode` | work listings / affiliated works | `"any_publication"` on `/works`; `"affiliation"` / `"funder"` on institution nested works |
| `engine` / `performance.engine` | works, publications, search | `"Manticore"` when a full-text term participated, else `"MariaDB"` |
| `performance.*` | works, publications | server-side timing (`primary_query_ms`, `total_rows_examined`, `query_type`) |
| `fulltext_truncated` / `fulltext_work_cap` | `/publications` with full-text | the full-text work-id set was capped (default 5000) |
| `query_revision` | full-text works/persons/publications listings and search (`data.works`/`data.persons` on `/search/global`, `data` on autocomplete) | the literal query matched nothing and a corrected or relaxed query was served (`applied: true`), or a revision is only suggested (`applied: false`). See [search › Query revision](./domains/search.md#query-revision-typo-tolerance) |
| `page_degraded` (+ `note`) | `/works`, `/works/showcase`, `/publications`, `/persons`, `/subjects/{id}/works` | the page query hit the statement budget and returned empty; narrow the filter or ask for a shallower page |
| `degraded` | collaboration rankings | the ranking exceeded its budget; the empty page is not a real zero |
| `has_files_source` | `/publications?has_files=true` | `"files_index"` when the fast path served the page (`has_files=true` alone, default sort) |
| `sort` / `sort.{by,order}` | venues, institutions | the effective sort applied |
| `summary` | metrics/collaborations | aggregate roll-ups |
| `pagination_extras.offset` | any list called with `offset` | the effective offset |

**Graceful degradation.** Every database statement is bounded below the 5 s request ceiling (4.5 s by default, 2 s for counts), and every full-text query carries a 4 s search budget. Listings that can degrade return an empty or estimated page plus one of the flags above; anywhere else an exceeded budget is a **503 `REQUEST_TIMEOUT`**. A full-text page that runs out of search time is a 503, never a silently shorter page; a full-text count that runs out keeps its page and reports `pagination_total_exact: false` with a lower-bound total. Design the UI to read the flags rather than assume every page is exact and full, and treat 503 as retryable with a narrower request.

---

## 7. Shared query parameters

### Citation filters & sorting (work and publication listings)
Available on `/works`, `/works/showcase`, `/publications`, `/search/works`, `/search/advanced`, `/persons/{id}/works`, `/venues/{id}/works`, `/institutions/{id}/works`, `/institutions/{id}/funded-works`:

| Param | Meaning |
|---|---|
| `cited_by_min` / `cited_by_max` | inclusive bounds on citation count (aliases `citation_count_min` / `citation_count_max`) |
| `sort_by` | `cited_by_count` \| `references_count` \| `publication_year` \| `id` \| (`relevance` on full-text paths). Aliases `sortBy`, and `citation_count`/`reference_count`/`year`/`work_id` |
| `sort_order` | `ASC` \| `DESC` (alias `sortOrder`); numeric fields default `DESC` |

With `sort_by` omitted: `/works`, `/works/showcase` and filter-only search default to `id DESC`, `/publications` to `id DESC`, the person/venue/institution work listings to `publication_year DESC` (with an id tiebreak); full-text paths default to relevance. Year sorts put works without a year last (except the ascending `publication_year` sort on `/works`, which starts with them). Work list items expose `cited_by_count` / `references_count`; publication list items expose `citation_count` / `reference_count`.

### Full-text query revision
`autocorrect` (bool, default `true`) on `/works`, `/publications`, `/persons` and `/search/{works,advanced,global,persons}`. With the default, a full-text query that matches nothing is served corrected or relaxed. `false` serves the literal query and returns the revision as a suggestion only; use it for a "search instead for …" link.

### Common filters
`type` (per the domain's enum, case-insensitive), `language` (ISO 639-1), `year_from` / `year_to` (from year 1000), `open_access` (bool), `peer_reviewed` (bool). Booleans accept `true`/`false`/`1`/`0`. Empty-string params (`param=`) are treated as absent. On work listings a publication-level filter matches if **any** publication matches, and the row shows the latest **matching** publication.

---

## 8. Search-engine model

- **Manticore Search** (SphinxQL) powers free-text `q` and the `author` / `subject` / `venue_name` filters for **works** and **persons**. `q` spans `title, subtitle, abstract, authors, subjects, venue`; `author` → the authors field (AUTHOR-role contributors only — editors and translators are not matched), `subject` → the subjects field, `venue_name` → the venue field (AND semantics). Matching ids are hydrated from MariaDB. Manticore `COUNT(*)` totals are **exact**.
- **Query text is literal.** Only letters, digits and `_` are word characters; every other character (quotes, `?`, `%`, `*`, `&`, `:`, …) separates words, and operator words such as `NEAR` or `MAYBE` are searched as plain words. There are no wildcards or phrase operators.
- **MariaDB** serves the rest: `/venues` search is a substring `LIKE` over name, abbreviation, ISSNs and publisher name; the `/publications` `venue` filter uses `ft_venues_search` (word match); there is no subject term search; `/institutions` requires every query word in `ft_organizations_name` or an exact acronym; `/signatures/search` is a substring match.
- **Word forms.** Each `q` term matches inflected variants in the content fields (`title`, `subtitle`, `abstract`, `subjects`) through Portuguese and English stemming — `movimentos` also finds *movimento*, `ethnographies` also finds *ethnography* and *ethnographic* — while matching `authors` and `venue` verbatim, so proper names are never stemmed into something else. A term is satisfied by either side, and multi-word queries require every term (AND). The `author` / `subject` / `venue` filters keep the behaviour of the field they target: names verbatim, subjects stemmed.
- **Typos and stray words.** Every term is required, so a single misspelled or unrelated word would empty the result. When the literal query matches nothing, the API corrects the misspelled terms against the search index's own dictionary: one edit, two for long unknown words, candidates judged by how much the whole corrected query matches. Failing that, it drops the free-text term that conflicts with the others. It serves that query and describes it in `query_revision`. Correctly spelled queries are never altered; see [search › Query revision](./domains/search.md#query-revision-typo-tolerance).
- `meta.engine` tells you which engine served a given response.

---

## 9. Identifiers

Every primary resource nests its external identifiers under an `identifiers{}` object (never duplicated at the top level). Families in the corpus: **DOI, ORCID, ROR, ISSN / eISSN, ISBN-13, Scopus, OpenAlex, Wikidata, Handle, PMID, PMCID, arXiv, SciELO, OpenLibrary, LCCN, OCLC** and more (per entity). Every primary resource also exposes `_links.self`.

**DOI resolution.** `GET /{doi}` (also `/doi.org/{doi}` and `/https://doi.org/{doi}`) resolves a DOI to its publication and returns the publication payload with the parent work embedded.

---

## 10. HTTP status & error codes

| HTTP | When | `code` (examples) |
|---|---|---|
| 200 | success | — |
| 400 | validation failure (bad param), malformed JSON body or path encoding, a full-text page beyond 100,000 matches | `VALIDATION_ERROR` (+ `errors[]` with `path`/`msg`/`location` on parameter failures) |
| 401 | missing/invalid key on a gated endpoint | `UNAUTHORIZED` |
| 404 | resource / parent id not found | `NOT_FOUND` (+ domain codes like `COURSE_NOT_FOUND`, `INSTRUCTOR_NOT_FOUND`) |
| 429 | rate limit exceeded | `RATE_LIMITED` |
| 413 | request body over 16 kB | `VALIDATION_ERROR` |
| 500 | unexpected server error (message masked) | `INTERNAL_ERROR` (+ domain `*_FAILED` codes) |
| 503 | a query exceeded its time budget, or the request exceeded 5 s | `REQUEST_TIMEOUT` |
| 502 | **from nginx, not the API** — the application is down or restarting | none; body is HTML |
| 504 | **from nginx, not the API** — no answer within the proxy's 30 s ceiling | none; body is HTML |

`code` values are stable — branch UI logic on `code`, show `message` to users. The last two rows are the exception: they are produced by the reverse proxy before the request reaches the application, so they carry no envelope and no `code` — see [Gateway errors](#gateway-errors). Nested listings **404** when the parent id does not exist (e.g. `/venues/{id}/works`, `/works/{id}/citations`, `/persons/{id}/collaborators`, `/courses/{id}/instructors`); an existing parent with no children is an empty 200. A browser origin that is not on the CORS allow-list gets a normal response without CORS headers (the browser then blocks it), never a 500.

**Caching.** Responses are cached in Redis per endpoint for between 1 minute and 48 hours (statistics the longest, search the shortest), so a change made by the data pipeline can take that long to appear.

---

## 11. How to read the domain chapters

Each file in [`domains/`](./domains/) documents one domain: an intro, then per-endpoint sections with **query parameters**, **example requests**, a **structurally-complete example response**, a **complete field inventory**, and **notes/caveats**. Cross-links use relative paths.

Suggested reading order for a frontend build: [works](./domains/works.md) → [publications](./domains/publications.md) → [persons](./domains/persons.md) → [search](./domains/search.md) → [venues](./domains/venues.md) → [institutions](./domains/institutions.md) → [subjects](./domains/subjects.md) → [citations](./domains/citations.md) → [collaborations](./domains/collaborations.md) → [metrics](./domains/metrics.md) → [courses](./domains/courses.md) / [instructors](./domains/instructors.md) / [signatures](./domains/signatures.md) / [bibliographies](./domains/bibliographies.md) → [dashboard](./domains/dashboard.md) / [security](./domains/security.md) / [system](./domains/system.md).
