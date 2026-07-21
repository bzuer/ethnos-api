# Ethnos_API — Consolidated Endpoint Diagnostic & Reconstruction Guide

Scope: all 78 endpoints across 16 domains, plus 5 cross-cutting lenses (envelope/DTO, pagination, query-correctness, redundancy/dead-code, validation/security). Every claim below is grounded in the per-domain and lens evidence (live curl probes against `localhost:1211`, live MariaDB/Manticore queries, EXPLAINs, and code reads at `file:line`).

Runtime facts assumed throughout: `NODE_ENV=production`, Express 5.2.1, express-validator 7.3.2, `SEARCH_BACKEND=manticore` (pinned), `REQUEST_TIMEOUT_MS=5000`, `DB_QUERY_TIMEOUT_MS=6000`.

---

## 1. Executive Summary

### Overall health

The API's read path is structurally intact — type-sourcing after the `works.work_type` drop is clean everywhere (`p.type AS work_type`; no residual `w.work_type`), envelopes are centralized and mostly uniform, and access-key gating on `/dashboard/*`, `/security/*`, `/health/readiness`, `/health/metrics` is correct. But it is riddled with **systemic** (not one-off) defects: an entire class of endpoints times out under normal use, a hydration-SELECT pattern zeroes real metrics across four surfaces, two pagination counts are fabricated, and large swaths of code are dead or duplicated. 34 of 78 endpoints are fully healthy; the other 44 are degraded, broken, or empty.

### Endpoint counts by status

| Status | Count | Meaning |
|---|---:|---|
| ok | 34 | Correct data, correct envelope, edges correct |
| degraded | 34 | Returns data but has a confirmed defect (wrong field, missing filter, intermittent 503, pagination drift) |
| broken | 6 | Cannot return correct data (deterministic 503, inverted logic, unreachable success path) |
| empty-data | 4 | Correct code, returns empty solely because the backing table has no rows |
| **Total** | **78** | |

### Finding counts by severity (CONFIRMED + ADJUSTED verdicts)

| Severity | Count (approx) | Notes |
|---|---:|---|
| Critical | 5 | All timeout/pagination-integrity, spanning 5 services |
| High | ~26 | ~24 unique; 2–3 lens items restate domain items |
| Medium | ~47 | |
| Low | ~61 | |
| Info | ~34 | Mostly dead-code / cosmetic / positive |

REFUTED (do not action): the prior `cited_by_min` 503 on `/works` + `/works/showcase`; the "`/search/popular` permanently broken / never caches" claim. UNVERIFIED items are flagged inline and excluded from the counts.

### The 8 most important SYSTEMIC problems

1. **No statement-budget discipline → timeout cascade.** 11 of 18 services carry **zero** server-side `max_statement_time`; even budgeted services bound only the COUNT and leave the heavy page/data query unbounded. Six unrelated endpoints across five services deterministically 503 at exactly 5.00s. Compounded by an **inverted budget**: `withTimeout`'s default (`DB_QUERY_TIMEOUT_MS=6000` → `max_statement_time=6`) exceeds `REQUEST_TIMEOUT_MS=5000`, so every default-budget query (all venues, all org-detail, all person-detail) can never gracefully degrade before the 503.

2. **Metric-fidelity bug: hydration SELECTs omit the metric columns the DTO reads.** `/search/persons`, the persons block of `/search/global`, `/persons?search=`, and `/signatures/{id}/persons` all return `works_count=0` / `latest_publication_year=null` for persons that have real values in the DB. Separately, `/persons/{id}` always returns empty `subject_expertise` and `top_collaborators` due to a `.then(([results]) => results)` destructure that binds `results` to row[0], which the DTO's `Array.isArray` guard then discards.

3. **Fabricated / mismatched pagination counts.** `/metrics/institutions` and `/metrics/collaborations` compute `total = data.length + offset` (414,655 qualifying orgs reported as page-size, `hasNext` always false — unpageable). `/subjects/{id}/works` and `/signatures/{id}/works` serve fan-out rows (per-publication / per-authorship) while `pagination.total` uses `COUNT(DISTINCT work_id)`, so served rows contain duplicate work_ids and disagree with `total`.

4. **Envelope/DTO non-uniformity.** A split validation-error contract (venues/search/courses emit `{field:null,...}` with no `meta`, everyone else emits express-validator's real shape with `meta.request`); `_links` only in the organizations domain; persons duplicate identifiers at top level; `first_author` is a string on `/works` but an object on `/publications`; `pagination_total_exact` and the engine-label location applied unevenly; 3–4 incompatible collaboration DTO shapes; per-DTO re-declared coercion helpers with divergent null/boolean semantics.

5. **Massive redundancy & dead code.** `/works?q=` ≡ `/search/works?q=` ≡ `/search/advanced?q=` (byte-identical); `/venues/search` ⊂ `/venues?search=`; `/persons?search=` ≡ `/search/persons?q=`; each `/metrics/*` duplicates a domain listing. Dead MariaDB full-text fallback branches referencing dropped columns (`subjects_search`/`authors_search`) recur verbatim in 4 services; disabled roots (`/signatures`, `/subjects`) retain ~150 lines of unreachable code; 6 dead DTO exports; inert security stubs.

6. **Empty-string optional-param contract violation.** 12 of 15 data modules use bare `.optional()`, so `param=` returns **400** instead of being treated as absent (violating the mandated `optional({values:'falsy'})`), and it is inconsistent even within a single endpoint (`/works?language=` → 400 but `/works?type=` → 200).

7. **Security & validation exposure.** Raw DB error message + driver code leak to unauthenticated clients in production (`res.error` has no prod masking; 8 controllers use it); the honeypot returns 500 (`res.fail is not a function`, mount-order bug) making it fingerprintable; the localhost rate-limit bypass is spoofable via `X-Forwarded-For: 127.0.0.1`; access keys passed as query-string aliases are logged verbatim by morgan; the entire `/security/*` surface is inert telemetry (audit reports protected groups as unprotected; stub `getBlockedIPs`/`unblockIP`).

8. **Data-starvation vs code.** `courses`=1 row, `course_instructors`=1, `course_bibliography`=0, `programs`=1 (empty). This makes ~9 bibliography/course/subject/instructor endpoints return empty by **content**, not by bug. Separate infra gaps: `works.reference_count` has no index (full-table filesort on `sort_by=references_count`); the Manticore works/persons indexes are stale (~21% works, ~15% persons), deflating full-text totals.

---

## 2. Endpoint Status Matrix (all 78)

| Path | Method | Domain | Status | Headline issue |
|---|---|---|---|---|
| /works | GET | works | degraded | `venue_id`/`has_files` silently ignored; `sort_by=references_count` cold-cache 503 (no index); filtered-count fallback reports all-works estimate |
| /works/showcase | GET | works | degraded | Strict subset of /works; drops q/author/subject/venue_name; shares references_count filesort |
| /works/{id} | GET | works | ok | Fully hydrated; edges correct |
| /publications | GET | publications | degraded | Unbounded page query → HTTP 503 on `language=pt`, `peer_reviewed=false`, `has_files`, unfiltered `sort_by=cited_by_count/references_count` |
| /publications/{id} | GET | publications | ok | Correct; work/siblings/files/citations all present |
| /{doi} (+/doi.org, +https) | GET | publications | ok | All 3 URL forms resolve; unknown DOI 404 |
| /persons | GET | persons | degraded | `affiliation`/`country` ignored; empty params → 400; search path zeroes metrics |
| /persons/{id} | GET | persons | degraded | `subject_expertise` & `top_collaborators` ALWAYS empty (destructure bug); `open_access_works` hardcoded null |
| /persons/{id}/works | GET | persons | ok | Sort/citation/role/year filters correct |
| /persons/{id}/signatures | GET | persons | ok | Correct (0-or-1-row listing) |
| /venues | GET | venues | degraded | Empty params → 400; `type` enum excludes SOURCE_BOOK (90% of venues) + OTHER |
| /venues/{id} | GET | venues | degraded | `publication_summary` zeroes when `include_yearly=false` despite 27k works |
| /venues/{id}/works | GET | venues | ok | Nonexistent venue → 200 empty (swagger says 404) |
| /venues/search | GET | venues | degraded | Strict subset of `/venues?search=`; `type=` empty → 400 |
| /venues/statistics | GET | venues | ok | By-type breakdown omits SOURCE_BOOK/OTHER (accounts for only 9% of venues) |
| /institutions | GET | institutions | ok | Cache-key drift; `sort_by=relevance` w/o term mislabels meta |
| /institutions/{id} | GET | institutions | degraded | `recent_works` authors never hydrated (author_string null, preview []) |
| /institutions/{id}/works | GET | institutions | ok | `type` length-only validated (bad type → 200 empty); list query unbudgeted |
| /institutions/{id}/funded-works | GET | institutions | ok | Deep offset ~2.8s (unbudgeted list) |
| /search/works | GET | search | ok | Empty-q browse estimate lacks `pagination_total_exact` flag |
| /search/advanced | GET | search | degraded | `facets` ALWAYS `{}`; engine hardcoded "MariaDB"; type/lang/year unvalidated |
| /search/global | GET | search | degraded | Embedded persons `works_count=0`/`latest_year=null` |
| /search/persons | GET | search | degraded | `works_count`/`latest_publication_year` hardcoded 0/null for all rows |
| /search/autocomplete | GET | search | ok | Short-q branch returns divergent envelope; engine hardcoded |
| /search/popular | GET | search | degraded | Cold-cache 503 (unbounded numbers-cross-join); self-heals via 6h cache |
| /search/health | GET | search | ok | Correct; MariaDB-fallback branch advertises dropped indexes |
| /works/{id}/citations | GET | citations | degraded | `type=` empty → 400; nonexistent id → 200 (not 404) |
| /works/{id}/references | GET | citations | degraded | `pagination.total` counts raw rows; unresolved refs vanish on early pages |
| /works/{id}/metrics | GET | citations | **broken** | HTTP 503 for EVERY work — unbounded full-table `MIN(year) GROUP BY` derived table |
| /works/{id}/network | GET | citations | degraded | `depth>=2` → HTTP 503 (recursive CTE OR-join, no budget); depth=1 ok |
| /collaborations/top | GET | collaborations | **broken** | Always HTTP 503 — unbounded global authorships self-join (15.8M rows) |
| /persons/{id}/collaborators | GET | collaborations | degraded | `sort_by` inert; `span_years`/`avg_citations` always 0; 404 for zero-collab person |
| /persons/{id}/network | GET | collaborations | degraded | `depth` a no-op; central node name placeholder; `network_density` hardcoded; nonexistent→200 |
| /subjects/statistics | GET | subjects | **broken** | Always HTTP 503 — unbounded full-table aggregations over subjects⋈work_subjects (15.8M) |
| /subjects/{id}/children | GET | subjects | **broken** | Large parents (224 children) → HTTP 503; aggregation computed before LIMIT |
| /subjects/{id}/works | GET | subjects | degraded | Multi-manifestation fan-out; grouped rows ≠ COUNT(DISTINCT) |
| /subjects/{id}/courses | GET | subjects | empty-data | course_bibliography=0 rows |
| /subjects/{id} | GET | subjects | ok | Heaviest leaf ~4.1s (near 5s ceiling); dead course_bibliography join |
| /subjects/{id}/hierarchy | GET | subjects | ok | Raw rows (bypasses DTO); nonexistent→200 not 404 |
| /signatures/{id} | GET | signatures | ok | Correct |
| /signatures/{id}/persons | GET | signatures | degraded | `works_count=0`/`latest_year=null` + null identifiers (SELECT omits columns) |
| /signatures/{id}/works | GET | signatures | degraded | One row per authorship; duplicate work_ids; total=COUNT(DISTINCT) ≠ served |
| /signatures/search | GET | signatures | ok | Returns raw rows (bypasses DTO); leading-wildcard LIKE |
| /signatures/statistics | GET | signatures | ok | Response fields drift from own swagger |
| /courses | GET | courses | ok | `subject_count` hardcoded 0 (never selected) |
| /courses/{id} | GET | courses | degraded | Double-format bug zeroes top-level metrics/instructors_preview/source_file/statistics |
| /courses/{id}/instructors | GET | courses | ok | Nonexistent course → 200 not 404 |
| /courses/{id}/bibliographies | GET | courses | empty-data | course_bibliography=0 rows |
| /courses/{id}/subjects | GET | courses | empty-data | Derived through empty course_bibliography |
| /courses/statistics | GET | courses | ok | `avg_credits` emitted as string |
| /instructors | GET | instructors | ok | Empty params → 400 |
| /instructors/{id} | GET | instructors | ok | `program_ids` dropped on detail (present on list) |
| /instructors/{id}/courses | GET | instructors | ok | Empty params → 400 |
| /instructors/{id}/subjects | GET | instructors | empty-data | course_bibliography=0 rows |
| /instructors/{id}/statistics | GET | instructors | ok | No instructor-membership gate (200 for any person) |
| /instructors/statistics | GET | instructors | ok | Correct |
| /bibliographies | GET | bibliography | degraded | `instructor_id=X` → HTTP 500 (`ci.canonical_person_id` out of scope) |
| /bibliographies/analyses | GET | bibliography | ok | Empty arrays (data); MAX(year) vs MAX(id) picker inconsistency |
| /bibliographies/statistics | GET | bibliography | ok | All-null aggregates (data) |
| /works/{id}/bibliographies | GET | bibliography | ok | Empty (data); correctly uses worksController path |
| /instructors/{id}/bibliographies | GET | bibliography | degraded | `year_from`/`year_to` → HTTP 500 (count query filters `pub.year` without joining publications) |
| /metrics/annual | GET | metrics | degraded | Cold 503 (~12s stats query, no budget); hardcoded 0 fields; garbage future years first |
| /metrics/venues | GET | metrics | degraded | `unique_authors`/`open_access_*` hardcoded 0/null |
| /metrics/institutions | GET | metrics | degraded | `total = length+offset` → unpageable (414,655 orgs, hasNext always false) |
| /metrics/persons | GET | metrics | degraded | List filesort over ~5M rows (~4.2s, at 5s boundary); `min_works` ignored |
| /metrics/collaborations | GET | metrics | degraded | Inverted budget cold 503; fabricated `total`; undocumented `total_works>=30` floor |
| / | GET | system-health | degraded | Root banner advertises dropped ft_works_content/ft_works_metadata; backend is Manticore |
| /health/liveness | GET | system-health | ok | Public, correct |
| /health/readiness | GET | system-health | ok | Key-gated, correct |
| /health/metrics | GET | system-health | ok | Real monitoring data (proves data exists that /dashboard ignores) |
| /dashboard/overview | GET | system-health | degraded | `search_performance`/`system_health` hardcoded stubs; `engine_status`="MariaDB" |
| /dashboard/performance | GET | system-health | degraded | Constant stub: `chart_data` always []; `hours` has no effect |
| /dashboard/search-trends | GET | system-health | ok | Real data; popular-terms SQL unbudgeted (cold risk) |
| /dashboard/alerts | GET | system-health | degraded | Alerts fed all-zero stub metrics; can never fire |
| /security/audit | GET | security | **broken** | Reports protected groups as UNPROTECTED (guard `.name===''` so match never fires) |
| /security/headers | GET | security | ok | Accurate; CORS block is a hand-maintained duplicate of app.js |
| /security/stats | GET | security | degraded | Reports rate-limit CONFIG as "violations"; `blocked_ips` always [] |
| /security/unblock/{ip} | POST | security | **broken** | Success path unreachable (getBlockedIPs()=[] → every IP 404s; unblockIP() no-op) |

---

## 3. Findings by Severity

### 3.1 CRITICAL (5 confirmed)

**C1 — `/works/{id}/metrics` returns HTTP 503 for every work** · citations · performance/timeout
- Evidence: `curl /works/2136169/metrics` and `/works/9673/metrics` both HTTP 503 @5.00s; nonexistent id → 404 @6ms. Isolated at DB: `SET STATEMENT max_statement_time=6 FOR SELECT w.id, pub_year.year FROM works w LEFT JOIN (SELECT p.work_id, MIN(p.year) FROM publications p GROUP BY p.work_id) pub_year ...` → ERROR 1969; the same full query with that one derived table removed returns instantly (cites=36, refs=21). MariaDB materializes the full 7.38M-row publications GROUP BY instead of pushing the workId key through. No `max_statement_time` anywhere in the service.
- Location: `src/services/citations.service.js:297-318`
- Fix: replace the outer `pub_year` full-table GROUP BY with a per-work correlated `MIN(p.year)` or read `works.latest_publication_year`.

**C2 — `/collaborations/top` always times out** · collaborations · performance/timeout
- Evidence: three probes all HTTP 503 @5.00s (`?limit=3`, `?year_from=2020&year_to=2023`, `?min_collaborations=20`). Direct DB: the global `authorships a1 JOIN authorships a2` self-join computing every co-author pair over 15.8M rows with `SET STATEMENT max_statement_time=12` → ERROR 1969.
- Location: `src/services/collaborations.service.js:272-299`
- Fix: bound to the top-N persons by `total_works` (like `/metrics/collaborations`), or drop the endpoint.

**C3 — `/subjects/statistics` always times out** · subjects · performance/timeout
- Evidence: two consecutive probes HTTP 503 @5.00s. Direct DB (8s budget): `SELECT COUNT(*),...,COUNT(DISTINCT ws.work_id) FROM subjects s LEFT JOIN work_subjects ws ON s.id=ws.subject_id` → ERROR 1969. Three unbounded full-table aggregations over subjects (169K) ⋈ work_subjects (15.8M).
- Location: `src/services/subjects.service.js:482-526`

**C4 — `/metrics/institutions` pagination is fabricated (unpageable)** · metrics · wrong-count
- Evidence: `metrics.service.js:248` `const total = institutions.length + parseInt(offset);`. Live: `?limit=2` → total=2/totalPages=1/hasNext=false; `?limit=2&page=2` → total=4/hasNext=false (never true). DB truth: `COUNT(*) FROM organizations WHERE publication_count>0` = 414,655. Clients cannot discover further pages.
- Location: `src/services/metrics.service.js:248`

**C5 — 11 of 18 services set no statement budget → deterministic 503 cascade** · query-correctness lens · missing-statement-budget
- Evidence: six live probes 503 @5.00s across five services (`/works/{id}/metrics`, `/works/{id}/network?depth=2`, `/subjects/statistics`, `/collaborations/top`, `/publications?language=pt`, `/metrics/annual`). `for f in src/services/*.js; do grep -q withTimeout $f || echo $f; done` → autocomplete, bibliography, citations, courses, instructors, search, searchEngine, signatures, subjects (+cache/homepageStats) have zero `withTimeout`. `citations.service.js` issues every query raw. `publications.service.js:562` wraps only the COUNT while the page query at 576-589 is raw.
- Location: `src/services/{citations,subjects,collaborations,publications,metrics,autocomplete}.service.js` (see per-domain locations)

### 3.2 HIGH (~26 confirmed/adjusted)

**Timeout / performance (unbounded queries)**

- **H1 `/publications` low-selectivity 503** — Only the COUNT is budgeted (`publications.service.js:562`); the page query (`576-589`, `ORDER BY ${orderClause} LIMIT ? OFFSET ?`) is raw. `?language=pt` EXPLAIN: `Using temporary; Using filesort` over 732,714 rows → HTTP 503 @5.00s on `language=pt`, `peer_reviewed=false`, `has_files=true/false`, unfiltered `sort_by=cited_by_count/references_count`. Contrast: same sort + selective filter → 200 @22ms. `src/services/publications.service.js:576-589`.
- **H2 `/works/{id}/network` depth≥2 503** — Recursive CTE OR-join (`cited_work_id=cn.source OR citing_work_id=cn.target`) over 85.9M `work_references` rows, no budget. `depth=2`/`depth=3` → HTTP 503 @5.00s; `depth=1` → 200 @10ms. `src/services/citations.service.js:446-450`.
- **H3 `/subjects/{id}/children` large-parent 503** — Per-child `work_subjects` aggregation (+ dead `course_bibliography` join) computed before LIMIT. Parent 365301 (224 children) → HTTP 503 @5.00s; 1-child parent → 200 @5ms. `src/services/subjects.service.js:202-220`.
- **H4 `/metrics/annual` cold 503 (ADJUSTED from critical)** — Per-group `COUNT(DISTINCT work_id)` + INNER JOIN works for `AVG(citation_count)` over large year buckets, no budget; DB-timed 12.13s (no filter) / 5.9s (2020–2022). Cold requests 503; results DO cache after the ~12s background completion (timeout middleware sends 503 but does not cancel the handler). `src/services/metrics.service.js:43-73`.
- **H5 `/metrics/persons` filesort at 5s boundary (ADJUSTED)** — `ORDER BY total_works DESC, total_citations DESC, id ASC` filesort over ~5M rows = 4.19s at DB, no budget; cold 503, warm 4.29s, deep offset 503. The COUNT is fast (0.46s). `src/services/metrics.service.js:301-324`.
- **H6 `/metrics/collaborations` inverted budget cold 503 (ADJUSTED)** — Heavy self-join bounded at `DB_QUERY_TIMEOUT_MS=6000` > `REQUEST_TIMEOUT_MS=5000`, so it can never self-limit before the 503. Cold 503; warm 1.95s; results cache. `src/services/metrics.service.js:399-427`.
- **H7 Inverted `withTimeout` default budget (lens)** — `db.js` `DEFAULT_MS = DB_QUERY_TIMEOUT_MS` (6000) → `SET STATEMENT max_statement_time=6`, above the 5s request ceiling. Every venues query (`venues.service.js:473-474` and 13 more sites), all org-detail enrichment (`organizations.service.js:293-388`), and all person-detail queries (`persons.service.js:21-119`) use the default → the graceful-degrade path is dead. Only works/publications (2000ms) and org-list (2500ms) chose sub-5s. `src/utils/db.js:1-12`.

**Metric-fidelity (hydration SELECT omits columns / bad destructure)**

- **H8 `/persons/{id}` empty subject_expertise & top_collaborators** — `.then(([results]) => results)` at `persons.service.js:116,129` binds `results` to row[0]; `person.dto.js:271-272` feed that object into formatters whose `if(!Array.isArray(items)) return []` guards (dto:131,144) discard it. Live: id 3589585 returns both `[]` while DB yields 10 real subjects and 10 real collaborators. Contrast `recent_works` (service:56, not destructured) is populated. `src/services/persons.service.js:116,129`.
- **H9 `/search/persons` metrics hardcoded 0/null** — Hydration SELECT (`persons.service.js:675`) omits `total_works`/`latest_publication_year`; both Manticore (`:684`) and MariaDB (`:744-745`) paths pass `{works_count:0, latest_publication_year:null}`. Live: ids 1396157/1452014 → 0/null though DB has 47/16 and 2025. `src/services/persons.service.js:675`.
- **H10 `/search/global` persons block inherits H9** — Reuses `searchPersons`; `persons.results[0]` (id 1396157) → `works_count=0`. `src/services/persons.service.js:684`.
- **H11 `/signatures/{id}/persons` metrics hardcoded 0/null** — SELECT (`signatures.service.js:171-183`) fetches only id/name/orcid/is_verified while `formatMetrics` reads `total_works`/`latest_publication_year`. Live: sig 3292 persons → 0/null though DB has total_works=1, latest=2025. `src/services/signatures.service.js:171-183`.

**Broken joins / pagination integrity**

- **H12 `/subjects/{id}/works` multi-manifestation fan-out** — LEFT JOINs publications without a latest-picker and GROUP BYs on `pub.year/pub.type`, so a work fans into one row per year/type while `total=COUNT(DISTINCT w.id)`. Subject 337350: `total=33872` but grouped rows = 33974; work 9002135 → 19 rows, 2849813 → 13. `src/services/subjects.service.js:305-338`.
- **H13 `/signatures/{id}/works` one row per authorship** — No DISTINCT/GROUP BY on `a.work_id` while count uses `COUNT(DISTINCT a.work_id)`. Sig 3292: 100-row page = 82 unique (18 dup ids); raw 11661 vs distinct 10885; work 22414074 appears twice (two distinct persons). `src/services/signatures.service.js:299-343`.
- **H14 `/metrics/collaborations` fabricated total** — `metrics.service.js:458` `total = collaborations.length + parseInt(offset)`; feeds totalPages/hasNext and `summary.total_collaboration_pairs`. `src/services/metrics.service.js:458`.
- **H15 lens wrong-count (restates C4/H14 + H12/H13)** — Confirms the same two fabricated-total sites and the two fan-out sites as a systemic class. `src/services/metrics.service.js:248,458`; `subjects.service.js:305-351`; `signatures.service.js:299-343`.

**Broken behavior / SQL 500s**

- **H16 `/courses/{id}` double-format zeroes summary** — `getCourseById` returns an already-formatted list item; `formatCourseDetails` (`course.dto.js:30`) re-runs `formatCourseListItem` on it, reading top-level `instructor_count`/`instructors`/`source_file` that now live nested. Live: detail metrics.instructor_count=0, instructors_preview=[], source_file=null, statistics=null for the SAME course the list shows instructor_count=1 (DB confirms 1). `src/services/courses.service.js:144,259`; `src/dto/course.dto.js:30,34,35`.
- **H17 `/bibliographies?instructor_id=X` → HTTP 500** — Outer WHERE appends `AND ci.canonical_person_id = ?` but `ci` is joined only inside the `bm` subquery. Server log: `Unknown column 'ci.canonical_person_id' in 'WHERE'`. `src/services/bibliography.service.js:125-128`.
- **H18 `/instructors/{id}/bibliographies?year_from|year_to` → HTTP 500** — Count query appends `pub.year` predicates but never joins publications. Live: `ER_BAD_FIELD_ERROR "Unknown column 'pub.year' in 'WHERE'"`. Main query joins pub (via MAX(p2.id)) so only the COUNT breaks. `src/services/instructors.service.js:432-441`.
- **H19 `/persons/{id}/network` depth is a no-op** — Only direct (level-1) collaborators are ever computed; `depth=2`/`depth=3` return byte-identical node maps; `second_degree_collaborator` never produced though swagger documents it. `src/services/collaborations.service.js:164-216`.

**Collaborations dead/fabricated data**

- **H20 `/collaborations/top` fallback race is dead** — `REQUEST_TIMEOUT_MS=5000 < COLLAB_QUERY_TIMEOUT_MS=8000`, so the 5s middleware aborts before the 8s race; `_getTopCollaborationsFallback` never runs (and `COLLAB_FORCE_FALLBACK=false`). `src/services/collaborations.service.js:255-312`.
- **H21 `/collaborations/top` fallback fabricates partnerships** — When forced, it loops sequential persons by id and pushes `{collaboration_count: max(min,3)+i}` with no verification the two ever co-authored — a data-integrity trap since flipping `COLLAB_FORCE_FALLBACK` to "fix" the 503 would serve fabricated partnerships under `status:success`. `src/services/collaborations.service.js:387-425`.

**Security / validation**

- **H22 `/security/audit` inverts reality** — Reports `dashboard_protected=false`, `health_protected=false` though both ARE protected (live: `/dashboard/overview`, `/health/readiness`, `/health/metrics` all 401 without key). `src/routes/security.js:141-153`.
- **H23 root cause: guard name match never fires** — `hasGuardInStack` matches layers by literal `'requireInternalAccessKey'`, but `createAccessKeyGuard` returns an anonymous arrow (`.name===''`). Node introspection: `requireInternalAccessKey.name === ""`. `src/routes/security.js:141-148` / `src/middleware/accessKey.js:64`.
- **H24 `/security/stats` reports config as violations** — `data.violations` is the rate-limit configuration; `total_violations=7` merely counts the 7 config keys; `blocked_ips` always []. `src/routes/security.js:211-220` / `src/middleware/rateLimiting.js:115-123`.
- **H25 res.error() leaks raw DB errors in production (lens)** — No prod masking: `curl /instructors/11111/bibliographies?year_from=2000` → 500 `{"message":"Unknown column 'pub.year' in 'WHERE'","code":"ER_BAD_FIELD_ERROR"}`. The domain `ERROR_CODES` are shadowed by `err.code`. 8 controllers use `res.error`; only bibliography+subjects mask via `handleError()`. `src/middleware/responseFormatter.js:95-116`.

### 3.3 MEDIUM (~47 confirmed)

Grouped by theme; each row: endpoint · summary · location.

**Missing/ignored filters & params**
- `/works` · `venue_id` collected but never consumed (returns default browse) · controller:67 vs service:380,655-670
- `/works` · `has_files` collected but never consumed · controller:70 vs service:436-635
- `/persons` · `affiliation` & `country` validated/collected but never applied (total unchanged) · persons.service.js:201-365
- `/metrics/persons` · documented `min_works` neither validated nor consumed · metrics.service.js:287

**Empty-string optional-param → 400 (should be absent)** — see lens M-uniformity (finding below); domain instances: `/persons` (persons.js:29-57), `/venues` + `/venues/search` (venues.js:135-159, 320-323), `/works/{id}/citations` (citations.js:30-34), `/instructors` (instructors.js:19-42).

**Wrong / stale fields**
- `/venues/{id}` · `publication_summary` (total_works_count/open_access/percentage/trend) collapses to 0/null when `include_yearly=false` despite 27,282 works · venue.dto.js:152-174 coupled to venues.service.js:702-705
- `/venues` · `type` enum excludes SOURCE_BOOK (165,520; 90%) + OTHER (321) — dominant type unfilterable · venues.js:136-138
- `/institutions/{id}` · `recent_works` authors never hydrated (author_string null, preview []) · organizations.service.js:332-348
- `/metrics/annual` · `unique_organizations`/`total_downloads` hardcoded 0 (swagger advertises them) · metrics.service.js:53-54
- `/dashboard/overview` · `engine_status` hardcoded "MariaDB" while backend is Manticore · dashboard.js:55-62
- `/dashboard/overview` · `search_performance`/`system_health` all-zero stubs though real data served by /health/metrics · dashboard.js:44-53,102-125
- `/` root · banner advertises dropped ft_works_content/ft_works_metadata; "institutions search disabled" · app.js:202,209,251
- `/security/audit` · `security_protected` hardcoded true (never verified) · security.js:153
- `/security/stats` · `blocked_ips`=[] / `total_blocked`=0 (getBlockedIPs stub) · rateLimiting.js:125

**Pagination / count**
- `/works/{id}/references` · `pagination.total` counts all raw rows; payload splits resolved/unresolved so total never matches served items; unresolved refs vanish on early pages · citations.service.js:197-247

**Collaborations correctness**
- `/collaborations/top` · count subquery has no budget · collaborations.service.js:323-342
- `/persons/{id}/collaborators` · `sort_by` validated/echoed but never applied (hardcoded ORDER BY collaboration_count DESC) · collaborations.service.js:47
- `/persons/{id}/collaborators` · `collaboration_span_years`/`avg_citations_together` always 0; swagger `open_access_percentage` never emitted · collaborations.dto.js:16-20
- `/persons/{id}/network` · no existence check → nonexistent id returns 200 lone central node · collaborations.service.js:164-172
- `/persons/{id}/network` · central node name placeholder `Person {id}` not `preferred_name` · collaborations.service.js:193-200

**Timeouts (medium)**
- `/works` + `/works/showcase` · `sort_by=references_count` full-table filesort (no index on works.reference_count); cold-cache 503 risk, warm ~1.6s · works.service.js:89-91 + missing DB index
- `/search/popular` · unbounded numbers-cross-join (>20s); cold 503 then self-heals via 6h cache; thundering-herd on expiry · autocomplete.service.js:256-315
- `/subjects/{id}` · aggregation scales with work_subjects volume; heaviest leaf ~4.1s (near 5s ceiling) + dead course_bibliography join · subjects.service.js:165-185
- `/citations` `/works/{id}/metrics` · redundancy (re-derives counts already served) — ADJUSTED · citations.service.js:279-336
- `/dashboard/search-trends` · popular-terms SQL unbudgeted (ERROR 1969 in bounded repro) · autocomplete.service.js:274-294

**Search**
- `/search/advanced` · `facets` always `{}` though swagger documents years/work_types/languages/venues/authors · search.js:538-541

**Lens — envelope/DTO (5 medium)**
- Validation-error contract split: venues/search/courses lose field name + omit meta; everyone else preserves path/value + meta.request · validation.js:79-88 + enhancedValidationHandler vs controllers
- `_links` emitted only by organizations domain; absent on works/publications/persons/venues/subjects/courses/instructors/signatures · organization.dto.js:106,257-261
- Persons duplicate every identifier at top level AND inside `identifiers{}` (contradicts org/venue convention) · person.dto.js:113-119,254-260
- `meta` keys + `pagination_total_exact` applied unevenly; nested `{id}/works` sub-listings bare except institutions; engine label at meta.performance.engine vs meta.engine vs meta.source vs none · per-service meta assembly
- `first_author` string on /works but object `{person_id,name}` on /publications · work.dto.js:65-66 vs publication.dto.js:174

**Lens — query-correctness (3 medium)**
- `sort_by=references_count` full-table filesort (EXPLAIN type=ALL, rows=4699022) — no index on works.reference_count · works.service.js:89-91
- Latest-publication picker inconsistent across services (MAX(p2.id) vs MAX(year) vs MAX(id) vs bare join) → same work shows different type/year per endpoint · bibliography.service.js:59,101,364,417; subjects/citations bare joins
- `getSubjectHierarchy` N+1: one unbounded aggregation query per ancestor level · subjects.service.js:243-275

**Lens — redundancy (2 medium)**
- `/works?q=` ≡ `/search/works?q=` ≡ `/search/advanced?q=` triplicate (all → worksService.getWorks; advanced adds empty facets shell) · search.js:536-555
- Dead MariaDB full-text fallback branches MATCH dropped `subjects_search`/`authors_search` in 4 services · works.service.js:674-793, publications.service.js:527-536, autocomplete.service.js:111-128, persons.service.js:696-747

**Lens — validation/security (4 medium)**
- Honeypot returns 500 (`res.fail is not a function`) not the intended 404, because honeypotMiddleware is mounted before responseFormatter → fingerprintable · app.js:127 + rateLimiting.js:97-113
- Localhost rate-limit bypass spoofable: `X-Forwarded-For:127.0.0.1` skips the limiter (isLocalRequest keys off client-controlled req.ip under trust proxy:1) · rateLimiting.js:27-43 + app.js:18
- Access keys via query-string aliases logged verbatim by morgan (winston masking covers only meta, not the URL) · app.js:134-138 + accessKey.js:4,33-37
- Empty-string optional params non-uniformly 400 in 12/15 modules, inconsistent within endpoints (works?language=→400 but works?type=→200) · routes/{bibliography,instructors,collaborations,subjects,metrics,signatures,citations,courses,dashboard}.js + mixed persons/venues/works

### 3.4 LOW (~61 confirmed) — grouped

**Envelope / not-found contract (200 instead of documented 404)**
- `/venues/{id}/works`, `/subjects/{id}/hierarchy`, `/courses/{id}/instructors`, `/works/{id}/citations`, `/works/{id}/references`, `/persons/{id}/collaborators` (404 for zero-collab), `/instructors/{id}/bibliographies` (200 for unknown id). Locations: venues.controller.js:203; subjects.service.js:266,273; courses.service.js:265-327; citations.controller.js:33-39,84-90; collaborations.service.js:76-79; instructors.service.js:355.

**Missing/loose validation (low)**
- `/venues/search` `type=` empty → 400 · venues.js:320-323
- `/institutions/{id}/works` & `/funded-works` `type` length-only (not enum) → bad type 200/empty · organizations.js:43
- `/instructors/{id}/courses` (`semester=`,`role=`) and `/instructors/{id}/subjects` (`vocabulary=`) empty → 400 · instructors.js:44-79
- `/venues` page cap 1000 (swagger says min:1 no max) · validation.js:~101 vs venues.js:24-29

**Wrong/missing fields (low)**
- `/persons/{id}` `open_access_works` hardcoded null · persons.service.js:53,143
- `/persons` default limit 10 but swagger says 20 · pagination.js:24 vs persons.js:79
- `/institutions/{id}` `program_ids` — wait, that's instructors. `/instructors/{id}` `program_ids` dropped on detail (present on list) · instructors.service.js:140-163
- `/signatures/{id}/persons` `name_signature`/scopus/wikidata/openalex/lattes/url all null (not selected) · signatures.service.js:171-183
- `/metrics/venues` `unique_authors`/`open_access_*` hardcoded 0/null · metrics.service.js:125-129
- `/metrics/annual` garbage future years (up to 2088) surfaced first (no upper clamp) · metrics.service.js:28,59
- `/venues/statistics` type breakdown omits SOURCE_BOOK/OTHER (9% of venues counted) · venues.service.js:940-943
- `/persons/{id}/network` `network_density` hardcoded "moderate" · collaborations.service.js:227

**Contract drift (low)**
- `/publications` swagger describes ft_works_content/ft_works_metadata + work_type filter · publications.js:125-133
- `/publications` `work_type` param silently ignored (controller reads only `type`) · publications.controller.js:73; service.js:446
- `/publications` Manticore works index stale (~21.5%) deflating full-text totals · publications.service.js:515-526
- `/institutions` list cache key v6 vs documented v5; `/institutions/{id}` v5 vs v4 · organizations.service.js:167,258
- `/institutions` `sort_by=relevance` w/o term mislabels meta.sort but orders by publication_count · organizations.service.js:61-69,182-191
- `/search/works` empty-q browse estimate lacks `pagination_total_exact=false` · works.service.js:549-554
- `/search/advanced` engine hardcoded "MariaDB"; type/lang/year unvalidated · search.js:550-553,571-606
- `/search/autocomplete` short-q divergent envelope · search.js:730-741
- `/signatures/statistics` response fields ≠ own swagger JSDoc · signatures.js:28-43
- `/instructors/{id}/statistics` no instructor-membership gate (200 for any person) · instructors.service.js:471-487
- `/metrics/collaborations` `min_collaborations` bounds disagree (validator 1..50, swagger min2/default3, code default2) + undocumented `total_works>=30` floor · metrics.service.js:376

**Performance (low, unbudgeted but bounded today)**
- `/institutions/{id}/works` & `/funded-works` list query unbudgeted (deep offset ~2.8s) · organizations.service.js:539-556,627-645
- `/signatures/{id}/works` list+count unbudgeted, no `pagination_total_exact` · signatures.service.js:335-343
- `/metrics/institutions` timespan aggregation unbudgeted · metrics.service.js:211-223
- `/bibliographies` wrapped COUNT + inline full-publications MAX(year) unbudgeted · bibliography.service.js:59-62,211

**Redundancy / dead-code (low)**
- `/subjects/{id}/children` `courses_count` join against empty course_bibliography (dead weight) · subjects.service.js:214
- `/courses/{id}` `cb`/`cb2` duplicate self-join · courses.service.js:134-136
- `/venues/search` strict subset of `/venues?search=` (identical LIKE) · venues.service.js:454 vs 568
- `/persons?search=` ≡ `/search/persons?q=`; `/metrics/venues`≡`/venues?sortBy=works_count`; `/metrics/institutions`≡`/institutions?sort_by=works_count` · search.service.js:91; metrics.service.js:105-272
- `/works` vs `/works/showcase` overlap (both → _getWorksVitrine) · works.service.js:403-405,430
- Disabled roots `/signatures`+`/subjects` retain dead getAllSignatures/getSubjects code · signatures.service.js:9-115; subjects.controller.js:10-40
- `bibliography.getWorkBibliography` (controller:48/service:230) unreachable (no route) · bibliography module
- 6 dead DTO exports (metrics.dto x4, dashboard.dto x2) · metrics.dto.js:150-215; dashboard.dto.js:105-145
- Dead fields/params/codes: venues `open_access_status`, course `statistics`, search `include_facets`, publications `filters.work_type`, `ERROR_CODES.DASHBOARD_SUMMARY_FAILED` · see redundancy map
- Inert `/security` stubs getBlockedIPs/unblockIP/getViolationStats · rateLimiting.js:115-126
- Stale docs advertising dropped indexes · app.js:202,251,456; search.js:96,651; publications.js:131-132
- 4 duplicated SQL patterns (latest-pub picker x8 services, author hydration x9, full-publications MAX(year) x4, overlapping searchEngine id-resolvers)
- `/collaborations/top` vs `/persons/{id}/collaborators` inconsistent "collaboration" definition (AUTHOR-only vs all roles) · collaborations.service.js:34-49 vs 284-285

**Lens — envelope (5 low): year vs publication_year naming; author name/count key drift; 3-4 collaboration DTO shapes; instructors expose person_id not id; error-value exposure inconsistency.**

**Lens — query (3 low): dead fulltext fallback branches; cache-key versioning inconsistency (orgs drift, instructors/signatures unversioned); Manticore count deflation (stale index).**

**Lens — validation/security (2 low): two divergent validation-error errors[] shapes (one always field:null); request-timeout middleware sends 503 without cancelling handler → unauthenticated DoS-amplification on open unbudgeted endpoints.**

### 3.5 INFO (~34 confirmed) — condensed

Data-driven emptiness (proven content, not code): `/subjects/{id}/courses`, `/courses/{id}/bibliographies`, `/courses/{id}/subjects`, `/instructors/{id}/subjects`, `/works/{id}/bibliographies`, `/bibliographies/analyses`, `/bibliographies/statistics`, `/bibliographies` (course_bibliography=0). Positive: `/security/unblock` IP validation is correct/doubly enforced. Cosmetic: `/courses` `subject_count` structurally 0, `/courses/statistics` `avg_credits` string, `/subjects/{id}` `subject_type`/`term_pt`/`term_es` never exposed, `/works` filtered-count reports all-works estimate, venue `works_count` stored-vs-live disagreement, per-DTO duplicated coercion helpers with divergent semantics, `/works/{id}/network` and `/persons/{id}/network` shared "network" verb (disambiguate, not merge), `type` filter values POSITIVE/NEGATIVE/SELF on citations always zero (data uniformly NEUTRAL), OA count > total_works on `/metrics/institutions` (documented scope mismatch), MariaDB fallback dead-code copies + stale swagger prose.

---

## 4. Cross-Cutting Analysis

### 4.1 Envelope & DTO uniformity
The skeleton is genuinely centralized (`responseFormatter` → `responseBuilder`), giving uniform `{status,data,pagination?,meta?}` / `{status,message,timestamp,code,errors?}`, ISO-8601 dates, and `undefined→null`. The documented naming contracts that matter are honored (work listings → `cited_by_count`/`references_count`; publication listings → `citation_count`/`reference_count`; venue `name`+`abbreviated_name` always paired). But six systemic divergences remain: (1) **two incompatible validation-error shapes** — venues/search/courses lose the field name (`field:null`) and omit `meta`; (2) **`_links` only on organizations**; (3) **persons duplicate identifiers** at top level; (4) **uneven `meta`** (engine label at three different keys or absent; `pagination_total_exact` on 6 of 17 listings); (5) **`first_author` type divergence** (string vs object); (6) **3–4 collaboration DTO shapes** and **per-DTO coercion helpers** with divergent null/boolean rules. There is no shared meta-builder or author sub-DTO.

### 4.2 Pagination
The pagination lens returned only a probe (no substantive findings), but pagination integrity failures surface across domains: fabricated totals (`length+offset`) on `/metrics/institutions` + `/metrics/collaborations` (unpageable), row-multiplicity ≠ count-basis on `/subjects/{id}/works` + `/signatures/{id}/works` (duplicate ids per page), and inconsistent shapes within domains (offset-style `{total,limit,offset,pages}` vs hand-rolled `{page,limit,total,totalPages,hasNext,hasPrev}` in persons/signatures). The 2s-budget + `pagination_total_exact` best-effort-count convention is applied only on works/publications/institutions; the equally JOIN-heavy persons/venues/subjects/signatures listings run unbudgeted counts and never set the flag.

### 4.3 Query correctness
Type-sourcing is clean (no `w.work_type`). The dominant defect is **time-budget discipline**, not join errors: 11/18 services have no budget, budgeted services leave the page query raw, and the default budget (6s) exceeds the request ceiling (5s). Two count bugs (fabricated totals; fan-out vs `COUNT(DISTINCT)`) and one missing index (`works.reference_count` → full-table filesort) round out correctness. The **latest-publication picker is inconsistent** (`MAX(p2.id)` in 8 services, `MAX(year)`/`MAX(id)` mixed in bibliography, bare joins in subjects/citations) so a multi-manifestation work can display a different type/year per endpoint. Manticore routing is consistent (q/author/subject → Manticore; venue → MariaDB `ft_venues_search`) but the shared stale index inflates full-text `total` relative to what hydrates.

### 4.4 Redundancy & dead code
Confirmed endpoint triplicate (`/works?q=` ≡ `/search/works` ≡ `/search/advanced`), subset (`/venues/search` ⊂ `/venues?search=`), overlaps (`/persons?search=` ≡ `/search/persons`; each `/metrics/*` ≡ a domain listing). Dead code: identical MariaDB fulltext fallbacks in 4 services referencing dropped columns; disabled-root support code; `bibliography.getWorkBibliography`; 6 DTO exports; assorted dead fields/params/codes; inert security stubs; stale docs. Four SQL patterns are hand-copied and should be shared helpers.

### 4.5 Validation & security
Access-key gating and rate-limit wiring are correct. But seven cross-cutting defects: raw DB error info-disclosure in production (`res.error` no masking, 8 controllers), broken honeypot (500, fingerprintable), spoofable localhost bypass (XFF), query-string key logging, empty-string optional-param 400 non-uniformity (12/15 modules), two validation-error shapes, and a request-timeout middleware that 503s without cancelling the handler (DoS amplification on open unbudgeted endpoints).

---

## 5. Redundancy & Dead-Code Map (definitive)

**Duplicative endpoints (merge / alias):**
| Endpoints | Verdict | Recommendation |
|---|---|---|
| `/works?q=` ≡ `/search/works?q=` ≡ `/search/advanced?q=` | Byte-identical (total 28437, id 5801955) | Collapse `/search/works` + `/search/advanced` into thin documented aliases of `/works?q=`; drop the empty-facets shell |
| `/works` vs `/works/showcase` | Showcase strict subset (drops fulltext) | Make showcase a documented preset of `/works` |
| `/venues/search?q=` ⊂ `/venues?search=` | Identical LIKE clause | Deprecate `/venues/search` in favour of `/venues?search=` |
| `/persons?search=` ≡ `/search/persons?q=` | Same `searchPersons` | Consolidate |
| `/metrics/venues` ≡ `/venues?sortBy=works_count` | Probed identical | Back `/metrics/*` by domain services or document as ranking presets |
| `/metrics/institutions` ≡ `/institutions?sort_by=works_count` | Probed identical | (as above) |
| `/metrics/persons` ≈ `/persons` by total_works | Overlap | (as above) |
| `/metrics/collaborations` ≈ `/collaborations/top` | Overlap; the metrics one is the bounded/correct version | Keep bounded metrics variant; fix or drop `/collaborations/top` |
| `/works/{id}/metrics` re-derives `/citations` + `/references` totals | Within-domain | Share a helper instead of re-running the heavy join |

**Disabled endpoints (keep disabled, remove dead support):** `GET /signatures` (404) → remove `getAllSignatures`/`getSignaturesFallback` + controller (signatures.service.js:9-115). `GET /subjects` (404) → remove `getSubjects` service+controller (~150 lines).

**Name collision (keep both, distinct):** `/works/{id}/network` (citation graph) vs `/persons/{id}/network` (co-authorship graph).

**Dead code paths (remove):**
- MariaDB fulltext fallback else-branches in works/publications/autocomplete/persons services (MATCH dropped `subjects_search`/`authors_search`).
- `bibliography.controller.getWorkBibliography` + `bibliography.service.getWorkBibliography` (no route).
- 6 DTO exports: `metrics.dto` formatDashboardSummary/formatTimeSeriesData/formatDistributionData/calculateTrendDirection; `dashboard.dto` formatMetricsSummary/formatActivityFeed.
- Security stubs `getBlockedIPs()=>[]`, `unblockIP()=>true`, `getViolationStats` (returns config).
- `emptyMetrics()`/`emptyHealthStatus()` placeholder wiring in dashboard.js (makes overview/performance/alerts constant).

**Unused fields / params / codes (remove):** venues `open_access_status`; course `statistics` (always null); search `include_facets`; publications `filters.work_type`; `ERROR_CODES.DASHBOARD_SUMMARY_FAILED`; subjects `subject_type`/`term_pt`/`term_es` (never selected — expose or note absent).

**Duplicated SQL → shared helpers:** latest-publication `MAX(p2.id)` correlated subquery (8 services, ~17 sites); author-string hydration (~9 services); full-publications `MAX(year)` derived table (bibliography ×4); overlapping `fetchWorkIdsForMatch`/`fetchWorkIdsForFilters`.

**Stale docs (update to Manticore):** app.js:202/251/456; search.js:96/651; publications.js:131-132.

---

## 6. Content vs Code (empty endpoints)

**Empty because DATA is empty** (base tables: `courses`=1, `course_instructors`=1, `course_bibliography`=0, `programs`=1 empty). These are code-correct; they will populate automatically when the operator loads course/bibliography data:
- `/subjects/{id}/courses` — joins empty `course_bibliography`
- `/courses/{id}/bibliographies` — `course_bibliography`=0
- `/courses/{id}/subjects` — derived through `course_bibliography`
- `/instructors/{id}/subjects` — derived through `course_bibliography`
- `/works/{id}/bibliographies` — `course_bibliography`=0
- `/bibliographies`, `/bibliographies/analyses`, `/bibliographies/statistics` — `course_bibliography`=0
- `/instructors/{id}/bibliographies` — empty by data (BUT also carries a code bug on `year_from`/`year_to`, see H18)
- `/bibliographies` also carries a code bug on `instructor_id` (H17)

**Empty/broken because CODE** (would return data if fixed):
- `/persons/{id}` empty `subject_expertise`/`top_collaborators` — destructure bug (H8), data exists
- `/search/persons`, `/search/global` persons, `/persons?search=`, `/signatures/{id}/persons` zeroed metrics — SELECT omits columns (H9–H11), data exists
- `/institutions/{id}` empty `recent_works` authors — no hydration (M), data exists
- `/works/{id}/metrics`, `/collaborations/top`, `/subjects/statistics`, `/subjects/{id}/children` — 503, never return (C1–C3, H3), data exists
- `/dashboard/overview`/`performance`/`alerts` zeros — hardcoded stubs (M), real monitoring data exists (proven by `/health/metrics`)
- `/metrics/venues` `unique_authors`/OA, `/metrics/annual` `unique_organizations`/downloads — hardcoded 0/null

**Note:** `programs` table is empty by data (documented in CLAUDE.md); no endpoint currently surfaces it, so no code action needed there.

---

## 7. Prioritized Reconstruction Roadmap

### P0 — Fix broken (restore correctness/availability)
1. **Add a shared statement-budget wrapper and fix the inverted default.** Set the default `withTimeout` budget below the request ceiling (e.g. `min(DB_QUERY_TIMEOUT_MS, REQUEST_TIMEOUT_MS-500)`), and wrap every heavy read — including the page/data query, not just the COUNT. Files: `src/utils/db.js:1-12`; then apply to `citations.service.js` (all queries), `subjects.service.js:482-526,202-220,165-185`, `collaborations.service.js:272-342`, `publications.service.js:576-589`, `metrics.service.js:43-73,301-324,399-427`, `autocomplete.service.js:274-294`. (C5, H1, H4–H7)
2. **Rewrite the timeout heavy queries to be index-friendly.** `/works/{id}/metrics`: replace the full-table `MIN(year) GROUP BY` with a correlated `MIN(p.year)` or `works.latest_publication_year` (`citations.service.js:297-318`). `/works/{id}/network`: bound the recursive CTE and/or cap fan-out before LIMIT (`citations.service.js:446-450`). `/collaborations/top`: bound to top-N persons like `/metrics/collaborations` (`collaborations.service.js:272-299`). `/subjects/statistics` + `/subjects/{id}/children`: pre-aggregate or drop per-row work_subjects counts, remove the dead course_bibliography join (`subjects.service.js:214,482-526,202-220`). (C1–C3, H2, H3)
3. **Fix the two SQL 500s.** `/bibliographies?instructor_id=`: force full mode and either join `ci` in the outer query or push the predicate into the `bm` subquery (`bibliography.service.js:125-128`). `/instructors/{id}/bibliographies?year_from|year_to`: add the `publications` join to the count query or drop the `pub.year` predicate from it (`instructors.service.js:432-441`). (H17, H18)
4. **Fix the metric-fidelity bugs.** `/persons/{id}` destructure: change `.then(([results]) => results)` → `.then((results) => results)` at `persons.service.js:116,129`. Add `total_works, latest_publication_year` to the hydration SELECTs and stop hardcoding 0/null in `persons.service.js:675,684,744-745` and `signatures.service.js:171-183`; hydrate `recent_works` authors in `organizations.service.js:332-348`. Bump the affected cache-key versions to invalidate frozen bad results. (H8–H11, M)
5. **Fix pagination integrity.** Replace `total = data.length + offset` with a real budgeted COUNT in `metrics.service.js:248,458`. Add `DISTINCT`/`GROUP BY a.work_id` (or dedup) so served rows match `COUNT(DISTINCT)` in `subjects.service.js:305-338` and `signatures.service.js:299-343`. Fix `/works/{id}/references` total to reflect the split (`citations.service.js:197-247`). (C4, H12–H15, M)
6. **Fix `/courses/{id}` double-format** — stop re-running `formatCourseListItem` over an already-formatted object (`course.dto.js:30,34,35`; `courses.service.js:144,259`). (H16)
7. **Fix the security domain.** Make the guard nameable (name the arrow in `accessKey.js:64` or check by reference/marker) so `/security/audit` reports truth; stop hardcoding `security_protected` (`security.js:141-153`). Either wire `/security/stats` + `/security/unblock` to the real limiter store or drop them (`rateLimiting.js:115-126`). Relabel `violations` vs config. (H22–H24)
8. **Fix `/persons/{id}/network` depth** — implement second-degree traversal or document depth as fixed=1 and drop the param (`collaborations.service.js:164-216`). (H19)
9. **Production error masking** — route the 8 `res.error` controllers through the masking `handleError()` path so raw DB messages/codes never reach clients in production (`responseFormatter.js:95-116`). (H25)

### P1 — Unify conventions
1. **Empty-string optional params:** switch every bare `.optional()` to `optional({values:'falsy'})` across routes/{bibliography,instructors,collaborations,subjects,metrics,signatures,citations,courses,dashboard,persons,venues,works}.js. (M/L uniformity)
2. **Single validation-error path:** retire `enhancedValidationHandler`/`handleValidationErrors` and route venues/search/courses through the controller `res.fail(errors.array())` path (fix `error.param`→`error.path`), so field name + `meta.request` are always present. (M envelope, L)
3. **Shared meta-builder + shared coercion helpers:** one engine-label key, uniform `pagination_total_exact` on every listing, import the single `helpers.js` coercion functions everywhere (remove per-DTO copies). (M/Info envelope)
4. **DTO normalization:** add `_links` to all primary resources (or drop from orgs for consistency); expose identifiers only in `identifiers{}` for persons; unify `first_author` shape; unify nested `year`→`publication_year`; one collaboration DTO shape; instructors expose `id`. (M/L envelope)
5. **Security hardening:** mount honeypot after `responseFormatter` (or guard `res.fail`) (`app.js:127`); derive `isLocalRequest` from the raw socket peer not `req.ip` (`rateLimiting.js:27-43`); strip key aliases from logged URLs (`app.js:134-138`); make the timeout middleware cancel/abort the handler+query. (M/L security)
6. **Existence guards:** return 404 (not 200) for nonexistent parents on `/venues/{id}/works`, `/courses/{id}/instructors`, `/subjects/{id}/hierarchy`, citations/collaborations nested endpoints; add instructor-membership gate to `/instructors/{id}/statistics`. (L)

### P2 — Suppress redundancy
1. Merge the works/search triplicate and the `/venues/search`, `/persons?search=`, `/metrics/*` overlaps into aliases or presets backed by the domain services (see §5 table).
2. Delete the 4 dead MariaDB fulltext fallback branches, the disabled-root dead code, `bibliography.getWorkBibliography`, the 6 dead DTO exports, dead fields/params/codes, and the stale docs.
3. Extract shared SQL helpers: latest-publication picker (standardize on `MAX(p2.id)`), author-string hydration, and unify the two `searchEngine` id-resolvers.
4. Standardize cache-key versioning (fix org drift; add version prefixes to instructors/signatures per-entity keys).

### P3 — Fill gaps
1. **Add index** on `works.reference_count` to kill the `sort_by=references_count` full-table filesort (P0-adjacent for that sort). Requires operator DDL in `database/required_objects.sql` + snapshot regen.
2. **Wire real data into dashboards:** back `/dashboard/overview`/`performance`/`alerts` with `monitoring.getMetrics()` (already serving `/health/metrics`); compute `/metrics/annual` `unique_organizations`/downloads and `/metrics/venues` `unique_authors`/OA or remove the fields.
3. **Populate or remove `/search/advanced` facets;** implement `/metrics/persons` `min_works`; add `venues.type` SOURCE_BOOK/OTHER to filter enum + statistics breakdown; expose `subjects.subject_type`.
4. **Operator/content tasks (out of API scope):** Manticore works/persons reindex (stale ~21%/~15%); load `courses`/`course_bibliography`/`programs` data to activate the ~9 content-empty bibliography/course endpoints.

---

*Evidence basis: 16 adversarially re-verified per-domain reports (every critical/high re-run against live API + MariaDB + Manticore) and 5 cross-cutting lens reports. All `file:line` anchors and command/output evidence are carried verbatim from those inputs; no findings were invented.*
