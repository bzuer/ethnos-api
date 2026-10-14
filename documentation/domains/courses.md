# Courses — teaching syllabi, reading lists, and instructor rosters

The `courses` domain exposes academic course records (syllabi) and three satellite relations: the instructor roster, the reading list (bibliography), and the subjects derived from that reading list. It is backed entirely by MariaDB: `courses`, `course_instructors` and `course_bibliography`, joined through to `persons`, `works`, `publications`, `work_subjects` and `subjects`. Manticore is not involved; the only text filter is a plain SQL `LIKE`. Each course references a `program_id` in `programs` (degree programs by institution), but no program endpoint exists, so `program_id` is exposed as a bare integer. Bibliography rows link to `works` (see [./works.md](./works.md)) and instructors are `persons` (see [./persons.md](./persons.md)); the same course→work reading-list relation also surfaces in the [./bibliographies.md](./bibliographies.md) domain.

Envelope, pagination (`page`/`limit` or `offset`/`limit`, default page size 10, an explicit `offset` is served as given and echoed in `meta.pagination_extras.offset`), rate limiting and error codes follow [../00-conventions.md](../00-conventions.md). No access key is required.

> Course data is a single seed record: `courses`, `course_instructors` and `programs` hold one row each and `course_bibliography` is empty (measured 2026-10-14). Bibliography and subject listings are therefore empty today; loading is operator-side — see [../API_ISSUES.md](../API_ISSUES.md).

---

## `GET /courses`

List courses with instructor and bibliography rollup counts and an instructor-name preview. The sort is fixed (`year DESC, semester, name`). Cached 30 minutes.

**Query parameters**

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `page` | integer | 1 | ≥ 1 | Page number. |
| `limit` | integer | 10 | 1..100 | Page size. |
| `offset` | integer | — | ≥ 0 | Rows to skip; takes precedence over `page`. |
| `search` | string | — | 1..100 chars | Case-insensitive `LIKE %v%` over `courses.name` **or** `courses.code`. |
| `program_id` | integer | — | ≥ 1 | Exact match on `program_id`. |
| `year` | integer | — | 1000..next year | Exact match on the academic `year`. |
| `semester` | string | — | 1..20 chars | Exact match on the semester label (`1`, `2`, `SUMMER`, `WINTER`, `YEAR_LONG`). |

A value outside these bounds (e.g. `limit=500`, `page=abc`, `year=abc`, `program_id=0`) returns **400 `VALIDATION_ERROR`** with the express-validator `errors[]` array.

**Example requests**

```
GET /courses
GET /courses?limit=3
GET /courses?search=anthro
GET /courses?year=2026&semester=1
GET /courses?offset=0&limit=20&program_id=1
```

**Example response**

```json
{
  "status": "success",
  "data": [
    {
      "id": 11111,
      "_links": { "self": "/courses/11111" },
      "code": "B11111C",
      "name": "Social Anthropology",
      "credits": 1,
      "program_id": 1,
      "semester": "1",
      "year": 2026,
      "metrics": { "instructor_count": 1, "bibliography_count": 0 },
      "instructors_preview": ["Bruno Cesar Cunha Cruz"],
      "created_at": "2026-07-18T20:46:20.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 3, "total": 1, "totalPages": 1, "hasNext": false, "hasPrev": false },
  "meta": {
    "filters": { "program_id": null, "year": null, "semester": null, "search": null },
    "request": { "method": "GET", "path": "/courses?limit=3" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields (list item)**

| field (dot-path) | type | notes |
|---|---|---|
| `id` | integer | Course id. |
| `_links.self` | string | `/courses/{id}`. |
| `code` | string \| null | Course code, e.g. `"B11111C"`. |
| `name` | string \| null | Course name. |
| `credits` | integer \| null | Credit count. A stored `0` surfaces as `null`. |
| `program_id` | integer \| null | FK into `programs`; no program object is embedded. |
| `semester` | string \| null | Semester label, e.g. `"1"`. A string, not an integer. |
| `year` | integer \| null | Academic year. |
| `metrics.instructor_count` | integer | Distinct instructors on the course. |
| `metrics.bibliography_count` | integer | Distinct bibliography works on the course. |
| `instructors_preview` | string[] | Up to 3 distinct instructor `preferred_name`s, alphabetical. |
| `created_at` | string(date-time) \| null | ISO 8601. |

**Meta:** `meta.filters` echoes `program_id`, `year`, `semester` and `search` (`null` when absent).

**Notes**
- List rows carry no `metrics.subject_count`; it appears only on the detail endpoint.
- `pagination.total` is an exact `COUNT(DISTINCT course)`.

---

## `GET /courses/statistics`

Aggregate course counts plus year and semester distributions. No parameters, no pagination. Cached 1 hour (`courses:statistics`).

**Example response**

```json
{
  "status": "success",
  "data": {
    "total_courses": 1,
    "programs_count": 1,
    "earliest_year": 2026,
    "latest_year": 2026,
    "semesters_count": 1,
    "avg_credits": "1.0000",
    "courses_with_credits": 1,
    "year_distribution": [ { "year": 2026, "course_count": 1, "program_count": 1 } ],
    "semester_distribution": [ { "semester": "1", "course_count": 1 } ]
  },
  "meta": { "request": { "method": "GET", "path": "/courses/statistics" } }
}
```

**Fields**

| field (dot-path) | type | notes |
|---|---|---|
| `total_courses` | integer | `COUNT(*)` of courses. |
| `programs_count` | integer | Distinct `program_id`. |
| `earliest_year` / `latest_year` | integer \| null | `MIN(year)` / `MAX(year)`. |
| `semesters_count` | integer | Distinct `semester`. |
| `avg_credits` | string \| null | `AVG(credits)` as a decimal **string** (e.g. `"1.0000"`); `null` when no course has credits. Parse before display. |
| `courses_with_credits` | integer | Courses with non-null `credits`. |
| `year_distribution[]` | array | Ten most recent years, `year DESC`: `{ year, course_count, program_count }`. |
| `semester_distribution[]` | array | Every semester label: `{ semester, course_count }`. |

---

## `GET /courses/{id}`

Full course detail: base fields plus embedded bibliography, instructor and derived-subject lists, each with a statistics block. Returns **404 `COURSE_NOT_FOUND`** for an unknown id. Cached 30 minutes.

**Path parameters:** `id` (integer ≥ 1).

**Query parameters**

| param | type | default | accepted values | effect |
|---|---|---|---|---|
| `include_bibliography` | boolean | `true` | `true` / `false` / `1` / `0` | `false`/`0` omits `bibliography` and `bibliography_statistics`. |
| `include_instructors` | boolean | `true` | `true` / `false` / `1` / `0` | `false`/`0` omits `instructors` and `instructor_statistics`. |
| `include_subjects` | boolean | `true` | `true` / `false` / `1` / `0` | `false`/`0` omits `subjects` and `subject_statistics`. |
| `bibliography_limit` | integer | 50 | 1..100 | Cap on embedded bibliography rows. |
| `instructors_limit` | integer | 20 | 1..100 | Cap on embedded instructor rows. |
| `subjects_limit` | integer | 30 | 1..100 | Cap on embedded subject rows. |

Any other value (e.g. `bibliography_limit=-5`, `include_instructors=maybe`) returns **400 `VALIDATION_ERROR`**.

**Example requests**

```
GET /courses/11111
GET /courses/11111?include_bibliography=0&include_subjects=false
GET /courses/11111?instructors_limit=1&bibliography_limit=100
```

**Example response**

```json
{
  "status": "success",
  "data": {
    "id": 11111,
    "_links": { "self": "/courses/11111" },
    "code": "B11111C",
    "name": "Social Anthropology",
    "credits": 1,
    "program_id": 1,
    "semester": "1",
    "year": 2026,
    "metrics": { "instructor_count": 1, "bibliography_count": 0, "subject_count": 0 },
    "instructors_preview": ["Bruno Cesar Cunha Cruz"],
    "created_at": "2026-07-18T20:46:20.000Z",
    "source_file": null,
    "bibliography": [],
    "instructors": [
      {
        "person_id": 11111,
        "preferred_name": "Bruno Cesar Cunha Cruz",
        "given_names": "Bruno Cesar Cunha",
        "family_name": "Cruz",
        "role": "PROFESSOR",
        "identifiers": { "orcid": "0000-0001-8652-2333" },
        "is_verified": true
      }
    ],
    "subjects": [],
    "bibliography_statistics": { "by_type": {}, "by_week": [] },
    "instructor_statistics": { "by_role": { "PROFESSOR": 1 } },
    "subject_statistics": { "by_vocabulary": {} }
  },
  "meta": {
    "includes": { "bibliography": true, "instructors": true, "subjects": true },
    "limits": { "bibliography": 50, "instructors": 20, "subjects": 30 },
    "request": { "method": "GET", "path": "/courses/11111" }
  }
}
```

**Fields: base** (superset of the list item)

| field (dot-path) | type | notes |
|---|---|---|
| `id`, `_links.self`, `code`, `name`, `credits`, `program_id`, `semester`, `year`, `created_at`, `instructors_preview` | — | As in the list item. |
| `metrics.instructor_count` / `metrics.bibliography_count` | integer | As in the list item. |
| `metrics.subject_count` | integer | Distinct subjects carried by the course's bibliography works (detail only). |
| `source_file` | string \| null | Provenance filename of the ingested syllabus. |

**Fields: `bibliography[]`** (same shape as [`/courses/{id}/bibliographies`](#get-coursesidbibliographies) items)

**Fields: `instructors[]`** (same shape as [`/courses/{id}/instructors`](#get-coursesidinstructors) items)

**Fields: `subjects[]`** (same shape as [`/courses/{id}/subjects`](#get-coursesidsubjects) items)

**Fields: statistics blocks**

| field (dot-path) | type | notes |
|---|---|---|
| `bibliography_statistics.by_type` | object map | `{ reading_type: { count, first_week, last_week } }`; `{}` when empty. |
| `bibliography_statistics.by_week[]` | array | `[{ week_number, count, reading_types }]`; `reading_types` is a comma-joined string. |
| `instructor_statistics.by_role` | object map | `{ role: count }`, e.g. `{ "PROFESSOR": 1 }`. |
| `subject_statistics.by_vocabulary` | object map | `{ vocabulary: { unique_subjects, works_covered } }`; `{}` when empty. |

**Meta:** `meta.includes` reflects the include flags applied; `meta.limits` echoes the effective caps.

**Notes:** a block whose `include_*` flag is off is omitted entirely, not emptied. The embedded arrays are capped previews; use the nested listings below to paginate.

---

## `GET /courses/{id}/instructors`

Paginated instructor roster for a course, sorted by `role, preferred_name`. Returns **404 `COURSE_NOT_FOUND`** when the course does not exist. Cached 30 minutes.

**Query parameters**

| param | type | default | effect |
|---|---|---|---|
| `page` / `limit` / `offset` | integer | 1 / 10 / — | Pagination; `page` ≥ 1, `limit` 1..100, `offset` ≥ 0 (400 otherwise). |
| `role` | string | — | Case-insensitive match on `course_instructors.role`: `PROFESSOR`, `ASSISTANT`, `TA` or `GUEST` (400 otherwise). |

**Example response**

```json
{
  "status": "success",
  "data": [
    {
      "person_id": 11111,
      "preferred_name": "Bruno Cesar Cunha Cruz",
      "given_names": "Bruno Cesar Cunha",
      "family_name": "Cruz",
      "role": "PROFESSOR",
      "identifiers": { "orcid": "0000-0001-8652-2333" },
      "is_verified": true
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1, "hasNext": false, "hasPrev": false },
  "meta": {
    "course_id": 11111,
    "filters": { "role": null },
    "request": { "method": "GET", "path": "/courses/11111/instructors" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields (item)**

| field (dot-path) | type | notes |
|---|---|---|
| `person_id` | integer | `canonical_person_id` (falls back to `person_id`); see [persons](./persons.md) and [instructors](./instructors.md). |
| `preferred_name` / `given_names` / `family_name` | string \| null | Name parts. |
| `role` | string \| null | e.g. `PROFESSOR`. |
| `identifiers.orcid` | string \| null | ORCID iD. |
| `is_verified` | boolean | `persons.is_verified`. |

**404 envelope** (`GET /courses/99999999999/instructors`)

```json
{
  "status": "error",
  "message": "Course not found with ID 99999999999",
  "timestamp": "2026-10-14T05:20:22.086Z",
  "code": "COURSE_NOT_FOUND",
  "meta": { "request": { "method": "GET", "path": "/courses/99999999999/instructors" } }
}
```

This is the only nested course listing with an existence guard.

---

## `GET /courses/{id}/subjects`

Subjects derived from the course's bibliography works (`course_bibliography → work_subjects → subjects`), sorted by `work_count DESC, term`. An unknown course id returns HTTP 200 with an empty page. Cached 30 minutes.

**Query parameters**

| param | type | default | effect |
|---|---|---|---|
| `page` / `limit` / `offset` | integer | 1 / 10 / — | Pagination; `page` ≥ 1, `limit` 1..100, `offset` ≥ 0 (400 otherwise). |
| `vocabulary` | string | — | Exact match on `subjects.vocabulary` (1..50 characters). |

**Example response** (empty today)

```json
{
  "status": "success",
  "data": [],
  "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0, "hasNext": false, "hasPrev": false },
  "meta": {
    "course_id": 11111,
    "filters": { "vocabulary": null },
    "request": { "method": "GET", "path": "/courses/11111/subjects" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields (item)**

| field (dot-path) | type | notes |
|---|---|---|
| `id` | integer | Subject id (see [subjects](./subjects.md)). |
| `term` | string \| null | Subject term. |
| `vocabulary` | string \| null | Controlled vocabulary, e.g. `Keyword`. |
| `parent_id` | integer \| null | Parent subject. |
| `work_count` | integer | Distinct works in the course bibliography carrying the subject. |

---

## `GET /courses/{id}/bibliographies`

Paginated reading list for a course, sorted by `week_number, reading_type, title`. An unknown course id returns HTTP 200 with an empty page. Cached 30 minutes.

**Query parameters**

| param | type | default | effect |
|---|---|---|---|
| `page` / `limit` / `offset` | integer | 1 / 10 / — | Pagination; `page` ≥ 1, `limit` 1..100, `offset` ≥ 0 (400 otherwise). |
| `reading_type` | string | — | Case-insensitive: `REQUIRED`, `RECOMMENDED` or `SUPPLEMENTARY` (400 otherwise). |
| `week_number` | integer | — | Exact match on the syllabus week (0..1000; 400 otherwise). |

**Example response** (empty today)

```json
{
  "status": "success",
  "data": [],
  "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0, "hasNext": false, "hasPrev": false },
  "meta": {
    "course_id": 11111,
    "filters": { "reading_type": null, "week_number": null },
    "request": { "method": "GET", "path": "/courses/11111/bibliographies" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields (item)**

| field (dot-path) | type | notes |
|---|---|---|
| `work_id` | integer | FK to `works`; see [works](./works.md). |
| `title` | string \| null | Work title. |
| `publication_year` | integer \| null | Year of the work's latest publication (highest `publications.id`). |
| `language` | string \| null | `works.language` (ISO 639-1). |
| `document_type` | string \| null | `type` of that latest publication. |
| `open_access` | boolean | `true` if that latest publication is open access. |
| `reading_type` | string \| null | `REQUIRED`, `RECOMMENDED` or `SUPPLEMENTARY`. |
| `week_number` | integer \| null | Syllabus week. |
| `notes` | string \| null | Instructor note. |
| `authors_preview` | string[] | **Every** contributor name on the work (not capped), one per person, ordered by role (`AUTHOR` first), then position. |
| `author_count` | integer | Number of names in `authors_preview` (distinct people). |
| `first_author_name` | string \| null | First entry of `authors_preview`: the first `AUTHOR` when the work has one. |
