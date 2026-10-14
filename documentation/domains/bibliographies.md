# Bibliographies — course reading lists over the works corpus

This domain exposes **course-reading assignments**: the works that academic courses assign as reading. Each bibliography row is one `(course_id, work_id)` pair from the `course_bibliography` base table, enriched with course metadata (`courses`), work metadata (`works`) and the work's latest publication. The latest publication is the one with the highest `publications.id`, the same picker used across the API. On the filtered path, rows also carry author and instructor names. Every query is plain MariaDB with a fixed sort. The domain relates to [courses](./courses.md), [works](./works.md) / [publications](./publications.md) (the assigned readings) and [instructors](./instructors.md). Envelope, pagination (`page`/`limit` or `offset`/`limit`, default page size 10, an explicit `offset` is served as given), rate limiting and error codes follow [../00-conventions.md](../00-conventions.md).

> `course_bibliography` is empty (0 rows, measured 2026-10-14), so all three endpoints return empty arrays and zero/`null` statistics today; loading is operator-side — see [../API_ISSUES.md](../API_ISSUES.md). The populated shapes below come from the service SQL and the DTO.

---

## `GET /bibliographies`

List bibliography entries, one row per `(course_id, work_id)`. Public. Cached 30 minutes (`bibliography:list:v2:{filters}`).

**Query parameters** (all optional)

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `page` | integer | 1 | ≥ 1 | Page number. |
| `limit` | integer | 10 | 1..100; > 100 → 400 `VALIDATION_ERROR` | Page size. |
| `offset` | integer | — | ≥ 0 | Rows to skip; takes precedence over `page`. |
| `course_id` | integer | — | ≥ 1 | Filter on `cb.course_id`. |
| `work_id` | integer | — | ≥ 1 | Filter on `cb.work_id`. |
| `instructor_id` | integer | — | ≥ 1 | Keep rows whose course has this instructor (`course_instructors.canonical_person_id`). |
| `reading_type` | string | — | 1..50 chars | Exact, case-insensitive match: `REQUIRED`, `RECOMMENDED` or `SUPPLEMENTARY`. |
| `week_number` | integer | — | ≥ 1 | Filter on `cb.week_number`. |
| `year_from` / `year_to` | integer | — | 1900..2030 | Bounds on `courses.year`. |
| `program_id` | integer | — | ≥ 1 | Filter on `courses.program_id`. |
| `search` | string | — | 1..255 chars | `LIKE` across `works.title`, `courses.name`, `courses.code`. |
| `light` | boolean | auto | `true` / `false` / `1` / `0` | `true` or `1` forces the lightweight query, which leaves `author_count` and `instructors` `null`. |

The sort is fixed at `courses.year DESC, semester, week_number, reading_type, title`, then course id and work id.

**Light mode is the default.** Light mode switches on whenever none of `course_id`, `instructor_id`, `search` is supplied, so a bare `GET /bibliographies` returns `author_count` and `instructors` as `null`. Pass at least one of those three filters (and not `light=true`) to populate them.

**Example requests**

```
GET /bibliographies
GET /bibliographies?limit=3
GET /bibliographies?course_id=11111                   # non-light path: author_count + instructors populated
GET /bibliographies?program_id=1&reading_type=REQUIRED&year_from=2020&year_to=2026
GET /bibliographies?search=cultures&instructor_id=11111&page=2&limit=25
GET /bibliographies?offset=5&limit=2
```

**Example response** (live, empty)

```json
{
  "status": "success",
  "data": [],
  "pagination": { "page": 1, "limit": 3, "total": 0, "totalPages": 0, "hasNext": false, "hasPrev": false },
  "meta": {
    "source": "course_bibliography",
    "request": { "method": "GET", "path": "/bibliographies?limit=3" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Example `data[]` element** (populated shape, illustrative values)

```json
{
  "course_id": 11111,
  "work_id": 22519667,
  "reading_type": "REQUIRED",
  "week_number": 3,
  "notes": "read chapters 1-2",
  "course_code": "B11111C",
  "course_name": "Social Anthropology",
  "course_year": 2026,
  "semester": "1",
  "program_id": 1,
  "title": "The Interpretation of Cultures",
  "publication_year": 1973,
  "open_access": false,
  "language": "en",
  "document_type": "BOOK",
  "author_count": 1,
  "first_author_name": "Clifford Geertz",
  "instructors": "Bruno Cesar Cunha Cruz",
  "authors": ["Clifford Geertz"]
}
```

**Fields (`data[]`):** every element carries all keys; in light mode `author_count` and `instructors` are `null`.

| field | type | notes |
|---|---|---|
| `course_id` | integer \| null | FK `courses.id`. |
| `work_id` | integer \| null | FK `works.id`; link to [/works/{id}](./works.md). |
| `reading_type` | string \| null | `REQUIRED`, `RECOMMENDED` or `SUPPLEMENTARY`. |
| `week_number` | integer \| null | Course week the reading is assigned to. |
| `notes` | string \| null | `course_bibliography.notes`. |
| `course_code` / `course_name` / `course_year` / `semester` / `program_id` | — | From `courses`. |
| `title` | string \| null | `works.title`. |
| `publication_year` | integer \| null | Year of the work's latest publication. |
| `open_access` | boolean \| null | Open-access flag of that publication. |
| `language` | string \| null | `works.language` (ISO 639-1). |
| `document_type` | string \| null | `type` of that publication (`ARTICLE`, `BOOK`, `CHAPTER`, `THESIS`, `CONFERENCE`, `CONFERENCE_PAPER`, `REPORT`, `DATASET`, `PREPRINT`, `REVIEW`, `EDITORIAL`, `OTHER`). |
| `author_count` | integer \| null | Distinct contributors (people) on the work; `null` in light mode. |
| `first_author_name` | string \| null | First entry of `authors`: the first `AUTHOR` when the work has one. |
| `instructors` | string \| null | `"; "`-separated distinct instructor names for the course; `null` in light mode or when the course has none. |
| `authors` | string[] | Contributor names, one per person, ordered by role (`AUTHOR` first), then position; `[]` when none. |

**Notes:** `pagination.total` is an exact count of the listed rows. `meta.source` is always `"course_bibliography"`.

---

## `GET /bibliographies/analyses`

Aggregate analytics over course bibliographies: most-reused works, per-year trends, and reading-type / document-type distributions. Returns a single object under `data`, with no pagination. Column names are raw SQL output. Cached 1 hour.

**Query parameters** (all optional)

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `year_from` / `year_to` | integer | — | 1900..2030 | Bounds on `courses.year`, applied to all four aggregations. |
| `program_id` | integer | — | ≥ 1 | `courses.program_id =`, applied to all four. |
| `reading_type` | string | — | 1..50 chars | `cb.reading_type =`, applied to all four. |
| `limit` | integer | 20 | 1..100 | Caps `most_used_works` only. |

**Example requests**

```
GET /bibliographies/analyses
GET /bibliographies/analyses?limit=50
GET /bibliographies/analyses?program_id=1&year_from=2018&year_to=2026
GET /bibliographies/analyses?reading_type=REQUIRED
```

**Example response** (live, empty)

```json
{
  "status": "success",
  "data": {
    "most_used_works": [],
    "trends_by_year": [],
    "reading_type_distribution": [],
    "document_type_distribution": []
  },
  "meta": { "request": { "method": "GET", "path": "/bibliographies/analyses" } }
}
```

**Populated element shapes** (illustrative values)

```json
{
  "most_used_works": [
    {
      "id": 22519667,
      "title": "The Interpretation of Cultures",
      "publication_year": 1973,
      "open_access": false,
      "document_type": "BOOK",
      "used_in_courses": 5,
      "used_in_programs": 2,
      "reading_types": ["REQUIRED", "RECOMMENDED"]
    }
  ],
  "trends_by_year": [
    { "year": 2026, "works_count": 40, "courses_count": 12, "programs_count": 3, "avg_publication_year": "1998.4000" }
  ],
  "reading_type_distribution": [
    { "reading_type": "REQUIRED", "count": 120, "unique_works": 95, "courses": 30 }
  ],
  "document_type_distribution": [
    { "document_type": "ARTICLE", "usage_count": 200, "unique_works": 180, "courses_count": 45 }
  ]
}
```

**Fields**

| field | type | notes |
|---|---|---|
| `most_used_works[]` | array | Ordered `used_in_courses DESC, used_in_programs DESC`; capped at `limit`. |
| `most_used_works[].id` / `title` | — | From `works`. |
| `most_used_works[].publication_year` / `open_access` / `document_type` | — | From the work's latest publication (`open_access` coerced to boolean). |
| `most_used_works[].used_in_courses` / `used_in_programs` | integer | Distinct courses / programs. |
| `most_used_works[].reading_types` | string[] | Distinct reading types for the work. |
| `trends_by_year[]` | array | Per `courses.year`, `year DESC`, fixed at 10 rows: `{ year, works_count, courses_count, programs_count, avg_publication_year }`. |
| `trends_by_year[].avg_publication_year` | string \| null | Mean year of each entry's latest publication, as a decimal string. |
| `reading_type_distribution[]` | array | `{ reading_type, count (rows), unique_works, courses }`, `count DESC`, all types. |
| `document_type_distribution[]` | array | Per latest-publication type: `{ document_type, usage_count (rows), unique_works, courses_count }`, `usage_count DESC`, fixed at 10 rows. |

The count keys differ between blocks (`courses` vs `courses_count`, `count` vs `usage_count`); the table above is authoritative per block.

---

## `GET /bibliographies/statistics`

Global rollup counts over course bibliographies. Returns a single object under `data`. No parameters. Cached 1 hour.

**Example response** (live)

```json
{
  "status": "success",
  "data": {
    "total_bibliography_entries": 0,
    "unique_works": 0,
    "courses_with_bibliography": 0,
    "programs_with_bibliography": 0,
    "avg_works_per_course": null,
    "max_works_per_course": null,
    "reading_type_distribution": [],
    "year_range": {
      "earliest_course_year": null,
      "latest_course_year": null,
      "earliest_publication_year": null,
      "latest_publication_year": null,
      "avg_publication_year": null
    }
  },
  "meta": { "request": { "method": "GET", "path": "/bibliographies/statistics" } }
}
```

**Fields (`data`)**

| field | type | notes |
|---|---|---|
| `total_bibliography_entries` | integer | `COUNT(*)` of `course_bibliography` rows. |
| `unique_works` | integer | Distinct `work_id`. |
| `courses_with_bibliography` | integer | Distinct `course_id`. |
| `programs_with_bibliography` | integer | Distinct `program_id`. |
| `avg_works_per_course` | string \| null | Decimal string: the plain mean of each course's work count over the courses that have a bibliography. `null` when empty. |
| `max_works_per_course` | integer \| null | Largest entry count on one course. |
| `reading_type_distribution[]` | array | `{ reading_type, count, percentage }`, `count DESC`; `percentage` is a two-decimal string. |
| `year_range.earliest_course_year` / `latest_course_year` | integer \| null | `MIN` / `MAX(courses.year)` over the courses that have bibliography entries. |
| `year_range.earliest_publication_year` / `latest_publication_year` | integer \| null | `MIN` / `MAX` year of each entry's latest publication (highest `publications.id`), the same publication the listing displays. |
| `year_range.avg_publication_year` | string \| null | Mean of those years over the entries, as a decimal string. |

**Note:** `reading_type_distribution` here is `{ reading_type, count, percentage }`, unlike the block of the same name in `/analyses`; do not share a renderer between them.
