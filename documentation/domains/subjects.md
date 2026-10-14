# Subjects — controlled-vocabulary terms, their hierarchy, and tagged works

This domain exposes the controlled-vocabulary **subject** terms that classify works: keywords, discipline names and topic labels. It is backed by the MariaDB base table `subjects` (247,543 rows, measured 2026-10-14). The table has a self-referential `parent_id` hierarchy: 6,345 child rows hang under only 527 parents, and the deepest chain has four levels. Every `works_count` is read verbatim from the denormalized, operator-maintained `subjects.total_works` column, never from a request-time `work_subjects` join. There is no subject term search: no endpoint looks subjects up by text. The works `subject` filter (`/works`, `/search/works`, `/publications`) matches the subject terms indexed in Manticore, not the `subjects` table. Subjects relate outward to [works](./works.md) (via `work_subjects`), [venues](./venues.md) (via `venue_subjects`), and [courses](./courses.md) (via course bibliographies).

The root collection listing (`GET /subjects`) is **disabled**; only the six endpoints below are mounted. Envelope, pagination (`page`/`limit` or `offset`/`limit`, default page size 10, an explicit `offset` is served as given), rate limiting and error codes follow [../00-conventions.md](../00-conventions.md).

> Course data is not loaded (`course_bibliography` is empty, measured 2026-10-14), so `courses_count`, `used_in_courses` and `GET /subjects/{id}/courses` are always `0` / empty today — see [../API_ISSUES.md](../API_ISSUES.md).

---

## `GET /subjects/statistics`

Structural and work-linkage rollup over the whole `subjects` table. No parameters. Cached 1 hour (`subjects:statistics:v3`).

**Example request**

```
GET /subjects/statistics
```

**Example response** (measured 2026-10-14; `top_subjects` trimmed to 3 of 20)

```json
{
  "status": "success",
  "data": {
    "total_subjects": 247543,
    "root_subjects": 241198,
    "child_subjects": 6345,
    "vocabularies_count": 6,
    "typed_subjects": 246368,
    "subjects_with_works": 246956,
    "total_work_subject_relations": 85046227,
    "vocabulary_distribution": [
      { "vocabulary": "OpenLibrary", "subject_count": 139367, "root_count": 137885, "works_count": 1771435 },
      { "vocabulary": "Keyword",     "subject_count": 102668, "root_count": 102668, "works_count": 47059762 },
      { "vocabulary": "OpenAlex",    "subject_count": 4783,   "root_count": 4,      "works_count": 31085083 },
      { "vocabulary": "Scopus",      "subject_count": 328,    "root_count": 328,    "works_count": 4996891 },
      { "vocabulary": "SCImago",     "subject_count": 304,    "root_count": 304,    "works_count": 86531 },
      { "vocabulary": "MohrSiebeck", "subject_count": 93,     "root_count": 9,      "works_count": 46525 }
    ],
    "top_subjects": [
      { "id": 341907,  "term": "Political science", "vocabulary": "Keyword",  "subject_type": "General",    "works_count": 2974596 },
      { "id": 341885,  "term": "Sociology",         "vocabulary": "Keyword",  "subject_type": "ProperNoun", "works_count": 2379205 },
      { "id": 2035503, "term": "Psychology",        "vocabulary": "OpenAlex", "subject_type": "Field",      "works_count": 1714321 }
    ],
    "meta": {
      "work_linkage_available": true,
      "source": "subjects.total_works (operator-maintained denormalized aggregate)"
    }
  },
  "meta": { "request": { "method": "GET", "path": "/subjects/statistics" } }
}
```

**Fields**

| field (dot-path) | type | notes |
|---|---|---|
| data.total_subjects | int | Total rows in `subjects`. |
| data.root_subjects | int | Rows with `parent_id IS NULL`. |
| data.child_subjects | int | Rows with `parent_id IS NOT NULL`. |
| data.vocabularies_count | int | Distinct `vocabulary` values. |
| data.typed_subjects | int | Rows carrying a non-empty `subject_type`. |
| data.subjects_with_works | int | Rows with `total_works > 0`. |
| data.total_work_subject_relations | int | `SUM(total_works)` over all subjects. A work tagged with N subjects is counted N times; this is not a distinct count of works. |
| data.vocabulary_distribution[] | array | One entry per vocabulary, ordered by `subject_count` DESC. |
| data.vocabulary_distribution[].vocabulary | string | Observed values: `OpenLibrary`, `Keyword`, `OpenAlex`, `Scopus`, `SCImago`, `MohrSiebeck`. |
| data.vocabulary_distribution[].subject_count | int | Subjects in that vocabulary. |
| data.vocabulary_distribution[].root_count | int | Root subjects in that vocabulary. OpenAlex carries the deep tree, with only 4 roots. |
| data.vocabulary_distribution[].works_count | int | `SUM(total_works)` for that vocabulary. |
| data.top_subjects[] | array | Top 20 subjects by `total_works` DESC, tie-broken by `term` ASC. |
| data.top_subjects[].id | int | Subject id. |
| data.top_subjects[].term | string \| null | Term label. |
| data.top_subjects[].vocabulary | string \| null | As above. |
| data.top_subjects[].subject_type | string \| null | e.g. `General`, `ProperNoun`, `Field`, `Subfield`, `SubjectArea`, `Topic`. |
| data.top_subjects[].works_count | int | `subjects.total_works`. |
| data.meta.work_linkage_available | bool | Always `true`; a provenance flag, not a runtime signal. |
| data.meta.source | string | Fixed provenance string. |

**Notes:** `data.meta` is nested inside `data`, separate from the envelope-level `meta.request`. There is no pagination block. A cold call measured 0.6 s.

---

## `GET /subjects/{id}`

Single subject-term detail. Cached 1 hour (`subject:v2:{id}`). Returns **404** when the id does not exist.

**Path parameters**

| param | type | notes |
|---|---|---|
| id | integer ≥ 1 | Subject id (required). A non-integer or `< 1` value returns 400 `VALIDATION_ERROR`. |

**Example requests**

```
GET /subjects/341907          # root subject "Political science"
GET /subjects/337471          # a child subject (has a parent)
GET /subjects/99999999999     # -> 404 Subject not found
```

**Example response** (a child subject, which shows the populated parent fields)

```json
{
  "status": "success",
  "data": {
    "id": 337471,
    "_links": { "self": "/subjects/337471" },
    "term": "French Urban and Social Studies",
    "vocabulary": "OpenAlex",
    "subject_type": "Topic",
    "term_pt": null,
    "term_es": null,
    "parent_id": 365301,
    "created_at": "2025-11-03T12:59:25.000Z",
    "works_count": 104653,
    "courses_count": 0,
    "children_count": 0,
    "parent_term": "Sociology and Political Science",
    "parent_vocabulary": "OpenAlex",
    "avg_relevance_score": null
  },
  "meta": { "request": { "method": "GET", "path": "/subjects/337471" } }
}
```

For a root subject (e.g. `341907`), `parent_id`, `parent_term` and `parent_vocabulary` are all `null`.

**Fields**

| field (dot-path) | type | notes |
|---|---|---|
| data.id | int | Subject id. |
| data._links.self | string | `/subjects/{id}`. |
| data.term | string \| null | Primary term label (usually English). |
| data.vocabulary | string \| null | One of the vocabularies listed under `/subjects/statistics`. |
| data.subject_type | string \| null | e.g. `General`, `ProperNoun`, `Field`, `Subfield`, `SubjectArea`, `Topic`. |
| data.term_pt | string \| null | Portuguese label; null for many subjects. |
| data.term_es | string \| null | Spanish label; null for many subjects. |
| data.parent_id | int \| null | Parent subject; null on roots. |
| data.created_at | string(ISO 8601) \| null | Row creation timestamp. |
| data.works_count | int | `subjects.total_works`. |
| data.courses_count | int | Always `0`. |
| data.children_count | int | Count of subjects whose `parent_id` is this id. |
| data.parent_term | string \| null | Parent's term; null on roots. |
| data.parent_vocabulary | string \| null | Parent's vocabulary; null on roots. Present only on this endpoint. |
| data.avg_relevance_score | number \| null | Always `null`. The underlying `work_subjects.relevance_score` is a uniform placeholder, so no averaging scan is run. |

**Notes:** the 404 envelope carries `code: "NOT_FOUND"` and `meta.request`.

---

## `GET /subjects/{id}/children`

Direct children (one level down) of the subject, ordered by `works_count` DESC, then `term` ASC. Paginated. Cached 30 minutes (`subject:{id}:children:v3:{filters}`).

**Path parameters:** `id` (integer ≥ 1, required).

**Query parameters:** pagination only.

| param | type | default | bounds | effect |
|---|---|---|---|---|
| page | int | 1 | ≥ 1 | Page number. |
| limit | int | 10 | 1–100 | Page size. |
| offset | int | — | ≥ 0 | Rows to skip; when present it takes precedence over `page` and is served as given. |

**Example requests**

```
GET /subjects/365301/children?limit=3
GET /subjects/365301/children?offset=3&limit=2
GET /subjects/341907/children            # a leaf subject -> data: []
```

**Example response**

```json
{
  "status": "success",
  "data": [
    {
      "id": 337471,
      "term": "French Urban and Social Studies",
      "vocabulary": "OpenAlex",
      "subject_type": "Topic",
      "parent_id": 365301,
      "created_at": "2025-11-03T12:59:25.000Z",
      "works_count": 104653,
      "courses_count": 0,
      "children_count": 0,
      "parent_term": null,
      "_links": { "self": "/subjects/337471" }
    }
  ],
  "pagination": { "page": 1, "limit": 3, "total": 224, "totalPages": 75, "hasNext": true, "hasPrev": false },
  "meta": {
    "request": { "method": "GET", "path": "/subjects/365301/children?limit=3" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields** (list-item shape)

| field (dot-path) | type | notes |
|---|---|---|
| data[].id | int | Child subject id. |
| data[].term | string \| null | Term label. |
| data[].vocabulary | string \| null | As above. |
| data[].subject_type | string \| null | As above. |
| data[].parent_id | int \| null | Equals the requested `{id}`. |
| data[].created_at | string(ISO) \| null | Row creation timestamp. |
| data[].works_count | int | Child's `total_works`; drives the sort. |
| data[].courses_count | int | Always `0`. |
| data[].children_count | int | The child's own number of children. |
| data[].parent_term | string \| null | Always `null` here; the detail endpoint resolves it. |
| data[]._links.self | string | `/subjects/{id}`. |

**Notes:** `pagination.total` is exact. A non-existent parent id returns HTTP 200 with an empty page, not 404. A leaf subject returns `data: []` with `total: 0`; only 527 subjects have children, so most calls return empty.

---

## `GET /subjects/{id}/hierarchy`

Ancestor chain from the root down to the requested subject, walking `parent_id`. Returns a flat array, root first and the requested subject last, without pagination. Cached 1 hour (`subject:{id}:hierarchy:v2`). Returns **404** when the id does not exist.

**Path parameters:** `id` (integer ≥ 1, required).

**Example requests**

```
GET /subjects/337350/hierarchy     # 4-level chain
GET /subjects/341907/hierarchy     # a root -> single-element array
```

**Example response**

```json
{
  "status": "success",
  "data": [
    { "id": 2035488, "term": "Social Sciences",                 "vocabulary": "OpenAlex", "parent_id": null,    "works_count": 255 },
    { "id": 2650982, "term": "Social Sciences",                 "vocabulary": "OpenAlex", "parent_id": 2035488, "works_count": 0 },
    { "id": 365301,  "term": "Sociology and Political Science", "vocabulary": "OpenAlex", "parent_id": 2650982, "works_count": 0 },
    { "id": 337350,  "term": "Asian Studies and History",       "vocabulary": "OpenAlex", "parent_id": 365301,  "works_count": 34679 }
  ],
  "meta": { "request": { "method": "GET", "path": "/subjects/337350/hierarchy" } }
}
```

**Fields:** nodes carry only these five keys. They have no `_links`, `subject_type`, `created_at` or `parent_term`, unlike the list and detail shapes.

| field (dot-path) | type | notes |
|---|---|---|
| data[].id | int | Node subject id. |
| data[].term | string | Term label. |
| data[].vocabulary | string | As above. |
| data[].parent_id | int \| null | `null` only on the first element (the root). |
| data[].works_count | int | `total_works` for that node; intermediate nodes can be `0`. |

---

## `GET /subjects/{id}/works`

Works tagged with this subject (via `work_subjects`), newest work id first. Cached 30 minutes (`subject:{id}:works:v3:{filters}`); degraded pages are not cached. Every filter is applied while selecting the page of work ids, so a page is never emptied by filtering after pagination.

**Path parameters:** `id` (integer ≥ 1, required).

**Query parameters**

| param | type | default | bounds | effect |
|---|---|---|---|---|
| page | int | 1 | ≥ 1 | Page number. |
| limit | int | 10 | 1–100 | Page size. |
| offset | int | — | ≥ 0 | Rows to skip; takes precedence over `page`. |
| min_relevance | float | — | ≥ 0 | Keep tags with `work_subjects.relevance_score >= value`. The score is a uniform `1.00` today, so a value ≤ 1 keeps every work and a value > 1 keeps none. |
| year_from | int | — | 1900–2030 | Keep works with at least one publication whose `year >=` this. |
| year_to | int | — | 1900–2030 | Keep works with at least one publication whose `year <=` this. |
| document_type | string | — | len 1–50 | Keep works with at least one publication of this `type` (`ARTICLE`, `BOOK`, `CHAPTER`, `THESIS`, …). |
| language | string | — | len 2–10 | Exact match on `works.language` (ISO 639-1, e.g. `en`, `pt`). |

`year_from`, `year_to` and `document_type` must all hold for the **same** publication. Ordering is fixed at `work_id DESC`, and the endpoint has no `sort_by`.

**Totals and degradation**

| case | `pagination.total` | `meta.pagination_total_exact` |
|---|---|---|
| No filter | `subjects.total_works` (exact) | `true` |
| Filtered, count finishes within its 2 s budget | exact `COUNT(*)` under the filters | `true` |
| Filtered, count exceeds its budget | the stored unfiltered `total_works` | `false` |
| The page selection itself exceeds its statement budget | the stored unfiltered `total_works`, with `data: []`, `meta.page_degraded: true` and a `meta.note` | `false` |

On multi-million-work subjects a filtered count usually exhausts its budget. Measured 2026-10-14: `/subjects/2035503/works?language=pt` took 2.0 s and reported `total: 1714321, pagination_total_exact: false`. The count outcome is cached per subject and filter set (10 minutes for an estimate, 1 hour for an exact count), so later pages of the same filter skip that wait. A filter that matches almost nothing on such a subject (e.g. `language=zz` on `341907`) can exhaust the page budget instead; that took 4.5 s and returned a degraded page. Treat `pagination_total_exact: false` as "no usable total" and stop paging on `data.length < limit`, unless `page_degraded` is set. A degraded page means: narrow the filters or request a shallower page.

**Example requests**

```
GET /subjects/345590/works?limit=3
GET /subjects/2035503/works?language=pt&limit=3
GET /subjects/341907/works?document_type=ARTICLE&year_from=2020&year_to=2024&limit=3
GET /subjects/2539705/works?year_from=2020&limit=2     # small subject: exact filtered total (93)
```

**Example response** (unfiltered)

```json
{
  "status": "success",
  "data": [
    {
      "id": 22447193,
      "title": "An Alu insertion polymorphism in a baboon hybrid zone",
      "publication_year": 1999,
      "language": "en",
      "document_type": "ARTICLE",
      "open_access": true,
      "relevance_score": 1,
      "assigned_by": "AUTHOR",
      "used_in_courses": 0
    }
  ],
  "pagination": { "page": 1, "limit": 3, "total": 6, "totalPages": 2, "hasNext": true, "hasPrev": false },
  "meta": {
    "pagination_total_exact": true,
    "request": { "method": "GET", "path": "/subjects/345590/works?limit=3" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Example response** (degraded page)

```json
{
  "status": "success",
  "data": [],
  "pagination": { "page": 1, "limit": 3, "total": 2974596, "totalPages": 991532, "hasNext": true, "hasPrev": false },
  "meta": {
    "pagination_total_exact": false,
    "page_degraded": true,
    "note": "These filters exceeded the statement budget on this subject; narrow them or page less deep.",
    "request": { "method": "GET", "path": "/subjects/341907/works?language=zz&limit=3" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields**

| field (dot-path) | type | notes |
|---|---|---|
| data[].id | int | Work id (link to [`/works/{id}`](./works.md)). |
| data[].title | string \| null | Work title. |
| data[].publication_year | int \| null | `MAX(year)` over the work's publications. When `year_*` / `document_type` filters are set, only the publications that satisfy them count. |
| data[].language | string \| null | `works.language` (ISO 639-1). |
| data[].document_type | string \| null | `type` of the newest (highest id) of those publications. |
| data[].open_access | bool \| null | `true` if any of those publications is open access. |
| data[].relevance_score | number \| null | `work_subjects.relevance_score`; a uniform placeholder `1` today. |
| data[].assigned_by | string \| null | Provenance of the tag, e.g. `AUTHOR`. |
| data[].used_in_courses | int | Always `0`. |

**Notes:** a non-existent subject id returns HTTP 200 with an empty page and `total: 0`, not 404. Unfiltered pages measured under 10 ms even on the 2.97M-work subject `341907`.

---

## `GET /subjects/{id}/courses`

Courses whose bibliography includes a work tagged with this subject, one row per course. Ordered by `works_with_subject` DESC, then course `year` DESC, then course id. Cached 30 minutes (`subject:{id}:courses:v2:{filters}`).

**Path parameters:** `id` (integer ≥ 1, required).

**Query parameters**

| param | type | default | bounds | effect |
|---|---|---|---|---|
| page | int | 1 | ≥ 1 | Page number. |
| limit | int | 10 | 1–100 | Page size. |
| offset | int | — | ≥ 0 | Rows to skip; takes precedence over `page`. |
| year_from | int | — | 1900–2030 | Lower bound (inclusive) on `courses.year`. |
| year_to | int | — | 1900–2030 | Upper bound (inclusive) on `courses.year`. |
| program_id | int | — | ≥ 1 | Restrict to courses in this program. |
| reading_type | string | — | len 1–50 | Keep only bibliography entries of this type (`REQUIRED`, `RECOMMENDED`, `SUPPLEMENTARY`; case-insensitive). The row's `reading_type` / `reading_types` then reflect only those entries. |

**Example requests**

```
GET /subjects/341907/courses
GET /subjects/341907/courses?year_from=2020&reading_type=REQUIRED
```

**Example response** (empty today)

```json
{
  "status": "success",
  "data": [],
  "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0, "hasNext": false, "hasPrev": false },
  "meta": {
    "request": { "method": "GET", "path": "/subjects/341907/courses" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields** (populated-row shape, from the DTO)

| field (dot-path) | type | notes |
|---|---|---|
| data[].id | int | Course id. |
| data[].program_id | int \| null | Owning program. |
| data[].code | string \| null | Course code. |
| data[].name | string \| null | Course name. |
| data[].credits | number \| null | Credit value. |
| data[].semester | string \| null | Semester label. |
| data[].year | int \| null | Course year. |
| data[].reading_type | string \| null | Highest-priority reading type among the course's matching entries (`REQUIRED` > `RECOMMENDED` > `SUPPLEMENTARY`). |
| data[].reading_types | string[] | Every distinct reading type among those entries, in the same priority order. |
| data[].works_with_subject | int | `COUNT(DISTINCT work_id)` in the course tagged with this subject. |
| data[].instructor_count | int | Distinct instructors (`canonical_person_id`) on the course. |

**Notes:** `pagination.total` is `COUNT(DISTINCT course)`, matching the one-row-per-course listing. A non-existent subject id returns HTTP 200 with an empty page. See the [courses domain](./courses.md).

---

## `GET /subjects` (disabled)

The root collection listing is intentionally not mounted. A request falls through to the global 404 handler and returns the generic not-found envelope, without `meta.request`:

```json
{ "status": "error", "message": "Can't find /subjects on this server!", "timestamp": "...", "code": "NOT_FOUND" }
```

To discover subjects, use `GET /subjects/statistics` (`top_subjects`), the `subjects[]` carried by work and venue payloads, or navigate with `/subjects/{id}/children` and `/subjects/{id}/hierarchy`.

---

## Domain-wide caveats (quick reference)

| Concern | Behavior |
|---|---|
| `works_count` everywhere | Read from `subjects.total_works`; never a live join. |
| Course fields | `courses_count` and `used_in_courses` are always `0`; `/subjects/{id}/courses` is empty until course data loads. |
| `avg_relevance_score` (detail) | Always `null`. |
| `relevance_score` (works) | Uniform placeholder `1`, so `min_relevance` keeps all (≤ 1) or nothing (> 1). |
| Existence 404 | Only `/subjects/{id}` and `/subjects/{id}/hierarchy` return 404 for an unknown id. `/children`, `/works` and `/courses` return HTTP 200 with an empty page. |
| `parent_term` | Populated on detail, always `null` on `/children`, absent on `/hierarchy`. |
| `/works` totals | Exact when unfiltered; filtered totals are exact only when `meta.pagination_total_exact` is `true`. |
