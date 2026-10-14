# Instructors — course teaching staff and their teaching/authorship profiles

The instructors domain exposes the subset of **persons** who appear in `course_instructors`, i.e. people who teach at least one course. An instructor is a `persons` row surfaced through `persons → course_instructors → courses` and enriched with teaching aggregates. The rich statistics endpoint also cross-references the person's own authorship record (`authorships`, `signatures`) and their courses' bibliographies (`course_bibliography → work_subjects → subjects`). Every query is plain MariaDB. This domain is the teaching-staff counterpart of [courses](./courses.md) and overlaps with [persons](./persons.md) (an instructor is always a person) and [bibliographies](./bibliographies.md) (the works assigned as course readings).

All endpoints are public and governed by the shared rate limiter. Envelope, pagination (`page`/`limit` or `offset`/`limit`, default page size 10, an explicit `offset` is served as given), error codes and `meta` conventions follow [00-conventions](../00-conventions.md).

> Course data is a single seed record: one instructor (`person_id=11111`) teaching one course, and an empty `course_bibliography` (measured 2026-10-14). The bibliography-derived listings and sub-arrays are therefore empty today; loading is operator-side — see [../API_ISSUES.md](../API_ISSUES.md).

---

## `GET /instructors`

List instructors (persons teaching at least one course), ranked by number of courses taught. Cached 30 minutes.

**Query parameters** (all optional)

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `page` | integer | 1 | 1..1000 | Page number. |
| `limit` | integer | 10 | 1..100 | Page size. |
| `offset` | integer | — | ≥ 0 | Rows to skip; takes precedence over `page`. |
| `role` | string | — | length 1–100 | Exact, case-insensitive match on `course_instructors.role` (`PROFESSOR`, `ASSISTANT`, `TA`, `GUEST`). |
| `program_id` | integer | — | ≥ 1 | Exact match on `courses.program_id`. |
| `year_from` | integer | — | 1900 .. next year | Keep instructors teaching a course with `year >=` this. |
| `year_to` | integer | — | 1900 .. next year | Keep instructors teaching a course with `year <=` this. |
| `search` | string | — | length 2–200 | `LIKE %v%` across `preferred_name` / `given_names` / `family_name`. |

Out-of-range values return **400 `VALIDATION_ERROR`** with the express-validator `errors[]` array. Ordering is fixed at `courses_taught DESC, preferred_name ASC`; there is no sort parameter.

**Example requests**

```
GET /instructors?limit=3
GET /instructors?role=PROFESSOR&program_id=1&year_from=2025&year_to=2026
GET /instructors?search=Cruz
GET /instructors?offset=0&limit=1
```

**Example response**

```json
{
  "status": "success",
  "data": [
    {
      "id": 11111,
      "person_id": 11111,
      "preferred_name": "Bruno Cesar Cunha Cruz",
      "given_names": "Bruno Cesar Cunha",
      "family_name": "Cruz",
      "identifiers": { "orcid": "0000-0001-8652-2333", "lattes_id": null, "scopus_id": null },
      "is_verified": true,
      "teaching_metrics": {
        "courses_taught": 1,
        "programs_count": 1,
        "teaching_span": { "earliest_year": 2026, "latest_year": 2026 }
      },
      "roles": ["PROFESSOR"],
      "program_ids": [1],
      "_links": { "self": "/instructors/11111", "person": "/persons/11111" }
    }
  ],
  "pagination": { "page": 1, "limit": 3, "total": 1, "totalPages": 1, "hasNext": false, "hasPrev": false },
  "meta": {
    "filters": { "role": null, "program_id": null, "year_from": null, "year_to": null, "search": null },
    "request": { "method": "GET", "path": "/instructors?limit=3" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields**

| field (dot-path) | type | notes |
|---|---|---|
| `data[].id` | integer | Same value as `person_id` (`persons.id`). |
| `data[].person_id` | integer | `persons.id`. |
| `data[].preferred_name` / `given_names` / `family_name` | string \| null | Name parts. |
| `data[].identifiers.orcid` | string \| null | ORCID iD. |
| `data[].identifiers.lattes_id` | string \| null | Lattes CV id. |
| `data[].identifiers.scopus_id` | string \| null | Scopus author id. |
| `data[].is_verified` | boolean | `persons.is_verified`. |
| `data[].teaching_metrics.courses_taught` | integer | Distinct courses taught; primary sort key. |
| `data[].teaching_metrics.programs_count` | integer | Distinct programs. |
| `data[].teaching_metrics.teaching_span.earliest_year` / `latest_year` | integer \| null | `MIN` / `MAX(courses.year)`. |
| `data[].roles` | string[] | Distinct `course_instructors.role` values. |
| `data[].program_ids` | integer[] | Distinct program ids. |
| `data[]._links.self` | string | `/instructors/{id}`. |
| `data[]._links.person` | string | `/persons/{id}`, the full person record. |
| `meta.filters` | object | Echo of the five filters (`null` when unset). |

`pagination.total` is an exact `COUNT(DISTINCT person)`.

---

## `GET /instructors/statistics`

Corpus-wide instructor aggregates plus a top-instructors leaderboard. No parameters, no pagination. Cached 1 hour.

**Example response**

```json
{
  "status": "success",
  "data": {
    "total_instructors": 1,
    "total_courses_taught": 1,
    "programs_with_instructors": 1,
    "avg_courses_per_instructor": "1.0000",
    "role_distribution": [
      { "role": "PROFESSOR", "instructor_count": 1, "assignment_count": 1 }
    ],
    "top_instructors": [
      { "preferred_name": "Bruno Cesar Cunha Cruz", "courses_taught": 1, "programs_count": 1, "earliest_year": 2026, "latest_year": 2026 }
    ]
  },
  "meta": { "request": { "method": "GET", "path": "/instructors/statistics" } }
}
```

**Fields**

| field (dot-path) | type | notes |
|---|---|---|
| `data.total_instructors` | integer | Distinct instructors. |
| `data.total_courses_taught` | integer | Distinct courses that have an instructor. |
| `data.programs_with_instructors` | integer | Distinct programs. |
| `data.avg_courses_per_instructor` | string | Mean of each instructor's distinct-course count, as a decimal **string** (e.g. `"1.0000"`); parse before display. |
| `data.role_distribution[]` | array | `{ role, instructor_count (distinct instructors), assignment_count (rows) }`. |
| `data.top_instructors[]` | array | Top 10 by `courses_taught`: `{ preferred_name, courses_taught, programs_count, earliest_year, latest_year }`. |

---

## `GET /instructors/{id}`

Single-instructor detail. Returns **404 `INSTRUCTOR_NOT_FOUND`** when the person id is not in `course_instructors`; a person who exists but teaches nothing is not an instructor. Cached 1 hour.

**Path parameters:** `id` (integer ≥ 1, a `persons.id`).

**Example requests**

```
GET /instructors/11111
GET /instructors/99999999999   # -> 404 INSTRUCTOR_NOT_FOUND
```

**Example response**

```json
{
  "status": "success",
  "data": {
    "id": 11111,
    "person_id": 11111,
    "preferred_name": "Bruno Cesar Cunha Cruz",
    "given_names": "Bruno Cesar Cunha",
    "family_name": "Cruz",
    "identifiers": { "orcid": "0000-0001-8652-2333", "lattes_id": null, "scopus_id": null },
    "is_verified": true,
    "teaching_metrics": {
      "courses_taught": 1,
      "programs_count": 1,
      "teaching_span": { "earliest_year": 2026, "latest_year": 2026 },
      "bibliography_contributed": 0
    },
    "roles": ["PROFESSOR"],
    "program_ids": [1],
    "_links": { "self": "/instructors/11111", "person": "/persons/11111" },
    "created_at": "2026-07-18T20:52:01.000Z"
  },
  "meta": { "request": { "method": "GET", "path": "/instructors/11111" } }
}
```

**Fields:** the list-item shape plus:

| field (dot-path) | type | notes |
|---|---|---|
| `data.teaching_metrics.bibliography_contributed` | integer | Distinct `course_bibliography` works across the courses taught. |
| `data.created_at` | string(date-time) \| null | `persons.created_at`, ISO 8601. |

**404 envelope:** `{ "status": "error", "message": "Instructor not found with ID {id}", "code": "INSTRUCTOR_NOT_FOUND", "timestamp": "...", "meta": { "request": … } }`. For a person who is not an instructor, use [persons](./persons.md).

---

## `GET /instructors/{id}/courses`

Courses taught by the instructor, ordered `year DESC, semester, name`. An unknown or non-instructor id returns HTTP 200 with an empty page, not 404. Cached 30 minutes.

**Query parameters** (all optional)

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `page` / `limit` / `offset` | integer | 1 / 10 / — | page 1..1000, limit 1..100, offset ≥ 0 | Pagination. |
| `year_from` / `year_to` | integer | — | 1900 .. next year | Bounds on `courses.year`. |
| `program_id` | integer | — | ≥ 1 | Exact `courses.program_id`. |
| `semester` | string | — | length 1–20 | Exact `courses.semester`. |
| `role` | string | — | length 1–100 | Exact instructor role in the course. |

**Example response**

```json
{
  "status": "success",
  "data": [
    {
      "id": 11111,
      "code": "B11111C",
      "name": "Social Anthropology",
      "credits": 1,
      "program_id": 1,
      "semester": "1",
      "year": 2026,
      "role": "PROFESSOR",
      "metrics": { "bibliography_count": 0, "co_instructors_count": 0 }
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1, "hasNext": false, "hasPrev": false },
  "meta": {
    "instructor_id": 11111,
    "filters": { "year_from": null, "year_to": null, "program_id": null, "semester": null, "role": null },
    "request": { "method": "GET", "path": "/instructors/11111/courses" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields**

| field (dot-path) | type | notes |
|---|---|---|
| `data[].id` | integer | `courses.id`; follow to [`/courses/{id}`](./courses.md). |
| `data[].code` / `name` | string \| null | Course code and title. |
| `data[].credits` / `program_id` / `year` | integer \| null | Course attributes. |
| `data[].semester` | string \| null | e.g. `"1"`. |
| `data[].role` | string \| null | The instructor's role in this course. |
| `data[].metrics.bibliography_count` | integer | Distinct bibliography works for the course. |
| `data[].metrics.co_instructors_count` | integer | Distinct other instructors on the course. |
| `meta.instructor_id` / `meta.filters` | — | Echo of the path id and filters. |

---

## `GET /instructors/{id}/statistics`

Combined teaching and authorship analytics for one instructor. Returns **404 `INSTRUCTOR_NOT_FOUND`** when the person does not exist or is not in `course_instructors`. No parameters, no pagination. Cached 30 minutes.

**Example response** (the analytical arrays are empty because this instructor has no bibliography or authorships)

```json
{
  "status": "success",
  "data": {
    "person": {
      "id": 11111,
      "preferred_name": "Bruno Cesar Cunha Cruz",
      "given_names": "Bruno Cesar Cunha",
      "family_name": "Cruz",
      "identifiers": { "orcid": "0000-0001-8652-2333", "lattes_id": null, "scopus_id": null },
      "is_verified": true,
      "created_at": "2026-07-18T20:52:01.000Z"
    },
    "teaching_profile": {
      "courses_taught": 1,
      "programs_count": 1,
      "bibliography_items_used": 0,
      "unique_collaborators": 0,
      "teaching_span": { "start_year": 2026, "end_year": 2026, "span_years": 1 },
      "teaching_roles": ["PROFESSOR"]
    },
    "authorship_profile": {
      "works_authored": 0,
      "unique_signatures": 1,
      "publication_span": { "first_year": null, "latest_year": null }
    },
    "signatures": [ { "id": 11111, "signature": "CRUZ B C C", "works_with_signature": 0 } ],
    "recent_authored_works": [],
    "bibliography_usage_patterns": [],
    "most_used_authors_in_courses": [],
    "subject_expertise": [],
    "teaching_collaborators": [],
    "combined_statistics": {
      "total_academic_span_years": 1,
      "academic_productivity_ratio": "0.00",
      "bibliography_diversity_score": 0
    }
  },
  "meta": { "request": { "method": "GET", "path": "/instructors/11111/statistics" } }
}
```

**Fields: `person`**

| field (dot-path) | type | notes |
|---|---|---|
| `data.person.id` / names / `identifiers.{orcid,lattes_id,scopus_id}` / `is_verified` / `created_at` | — | From `persons`. |

**Fields: `teaching_profile`**

| field (dot-path) | type | notes |
|---|---|---|
| `courses_taught` / `programs_count` | integer | Distinct courses / programs. |
| `bibliography_items_used` | integer | Distinct bibliography works across the instructor's courses. |
| `unique_collaborators` | integer | Distinct co-instructors. |
| `teaching_span.{start_year,end_year,span_years}` | integer \| null | `span_years = end - start + 1`. |
| `teaching_roles` | string[] | Distinct roles. |

**Fields: `authorship_profile`** (from the `persons` metric columns)

| field (dot-path) | type | notes |
|---|---|---|
| `works_authored` | integer | `persons.total_works`. |
| `unique_signatures` | integer | `1` if `persons.signature_id` is set, else `0`. |
| `publication_span.{first_year,latest_year}` | integer \| null | `persons.first/latest_publication_year`. |

**Fields: arrays**

| field (dot-path) | element shape / notes |
|---|---|
| `signatures[]` | `{ id, signature, works_with_signature }`: the person's signature, with the number of distinct works the person contributed to. |
| `recent_authored_works[]` | Up to 10 distinct works the person contributed to (any role): `{ id, title, year, work_type, language, open_access, signature_text }`. `year`, `work_type` and `open_access` come from the work's latest publication; works without a year come last. `signature_text` is the person's current signature. |
| `bibliography_usage_patterns[]` | Per reading type: `{ reading_type, works_count, courses_count }`. |
| `most_used_authors_in_courses[]` | Top 15 contributors (any role) of the works in the instructor's bibliographies: `{ person_id, author_name, usage_count, courses_count }`. |
| `subject_expertise[]` | Per vocabulary: `{ vocabulary, subjects_count, works_count, courses_count }`. |
| `teaching_collaborators[]` | Top 10 co-instructors: `{ collaborator_id, collaborator_name, shared_courses }`. |

**Fields: `combined_statistics`**

| field (dot-path) | type | notes |
|---|---|---|
| `total_academic_span_years` | integer | Larger of the teaching span and the publication span. |
| `academic_productivity_ratio` | string | `(works_authored / courses_taught).toFixed(2)`, e.g. `"0.00"`. |
| `bibliography_diversity_score` | integer | Number of reading-type groups in `bibliography_usage_patterns`. |

Until 2026-10-14 this payload also carried `person.name_variations` (always `[]`), `authorship_profile.confirmed_authorships` (a copy of `works_authored`), `author_string` / `first_author_name` / `authors_array` on `most_used_authors_in_courses[]` (copies of `author_name`) and `combined_statistics.signature_consistency_score` (a person has one signature, so it was just that signature's work count). They were removed.

---

## `GET /instructors/{id}/subjects`

Subject expertise derived from the works in the instructor's course bibliographies (`course_bibliography → work_subjects → subjects`), ordered `courses_count DESC, works_count DESC`. An unknown id returns HTTP 200 with an empty page. Cached 30 minutes.

**Query parameters**

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `page` / `limit` / `offset` | integer | 1 / 10 / — | page 1..1000, limit 1..100, offset ≥ 0 | Pagination. |
| `vocabulary` | string | — | length 2–100 | Exact match on `subjects.vocabulary`. |

**Example response** (empty today)

```json
{
  "status": "success",
  "data": [],
  "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0, "hasNext": false, "hasPrev": false },
  "meta": {
    "instructor_id": 11111,
    "filters": { "vocabulary": null },
    "request": { "method": "GET", "path": "/instructors/11111/subjects" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields**

| field (dot-path) | type | notes |
|---|---|---|
| `data[].id` / `term` / `vocabulary` / `parent_id` | — | Subject attributes; see [subjects](./subjects.md). |
| `data[].expertise_metrics.courses_count` | integer | Distinct courses using the subject. |
| `data[].expertise_metrics.works_count` | integer | Distinct works carrying the subject. |
| `data[].expertise_metrics.avg_relevance` | string \| null | Average `work_subjects.relevance_score`, as a string with two decimals. |

---

## `GET /instructors/{id}/bibliographies`

Works used as bibliography across the instructor's courses, one row per work. Ordered `used_in_courses DESC, publication_year DESC`, then work id. An unknown id returns HTTP 200 with an empty page. Cached 30 minutes.

**Query parameters**

| param | type | default | accepted values / bounds | effect |
|---|---|---|---|---|
| `page` / `limit` / `offset` | integer | 1 / 10 / — | page 1..1000, limit 1..100, offset ≥ 0 | Pagination. |
| `reading_type` | string | — | length 1–50 | Keep only bibliography entries of this type (`REQUIRED`, `RECOMMENDED`, `SUPPLEMENTARY`; case-insensitive). |
| `year_from` / `year_to` | integer | — | 1900 .. next year | Bounds on the year of the work's latest publication. |

**Example response** (empty today)

```json
{
  "status": "success",
  "data": [],
  "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0, "hasNext": false, "hasPrev": false },
  "meta": {
    "instructor_id": 11111,
    "filters": { "reading_type": null, "year_from": null, "year_to": null },
    "request": { "method": "GET", "path": "/instructors/11111/bibliographies" },
    "pagination_extras": { "offset": 0 }
  }
}
```

**Fields**

| field (dot-path) | type | notes |
|---|---|---|
| `data[].work_id` | integer | `works.id`; see [works](./works.md). |
| `data[].title` | string \| null | Work title. |
| `data[].publication_year` | integer \| null | Year of the work's latest publication (highest `publications.id`). |
| `data[].language` | string \| null | `works.language`. |
| `data[].document_type` | string \| null | `type` of that latest publication. |
| `data[].open_access` | boolean | Open-access flag of that latest publication. |
| `data[].reading_type` | string \| null | Highest-priority reading type the work has across the instructor's courses (`REQUIRED` > `RECOMMENDED` > `SUPPLEMENTARY`). |
| `data[].reading_types` | string[] | Every distinct reading type, in the same priority order. |
| `data[].author_count` | integer | Distinct contributors (people) on the work. |
| `data[].authors` | string[] | Contributor names, one per person, ordered by role (`AUTHOR` first), then position. |
| `data[].first_author_name` | string \| null | First entry of `authors`: the first `AUTHOR` when the work has one. |
| `data[].usage_metrics.used_in_courses` | integer | Distinct courses of this instructor using the work; primary sort key. |

With `reading_type`, only the matching entries count toward `reading_types` and `used_in_courses`.

---

## Cross-endpoint summary

| Endpoint | 404 on unknown id? | Pagination | Cache |
|---|---|---|---|
| `GET /instructors` | n/a | yes | 30 min |
| `GET /instructors/statistics` | n/a | no | 1 h |
| `GET /instructors/{id}` | yes (`INSTRUCTOR_NOT_FOUND`) | no | 1 h |
| `GET /instructors/{id}/courses` | no (empty page) | yes | 30 min |
| `GET /instructors/{id}/statistics` | yes (gates on membership) | no | 30 min |
| `GET /instructors/{id}/subjects` | no (empty page) | yes | 30 min |
| `GET /instructors/{id}/bibliographies` | no (empty page) | yes | 30 min |

Decimal-string fields to parse client-side: `avg_courses_per_instructor`, `combined_statistics.academic_productivity_ratio`, `expertise_metrics.avg_relevance`.
