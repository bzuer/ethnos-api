# Search Filter Fixes — Completed

## Problems & Resolution

### P1 — `author` filter missing on `/search/works` and `/search/advanced` ✓
- **Root cause**: `author` param not declared in route, not passed through controller/service/Sphinx
- **Fix**: Added `author` query param validation, Swagger docs, controller extraction, service passthrough, and Sphinx `@author_string` MATCH in both `searchWorkIds` and `searchWorks` methods
- **Files**: `routes/search.js`, `controllers/search.controller.js`, `services/search.service.js`, `services/sphinx.service.js`, `services/works.service.js`

### P2 — `subject` filter missing ✓
- **Root cause**: Same as P1 for `subjects_string`
- **Fix**: Added `subject` query param → `@subjects_string` MATCH clause in Sphinx
- **Files**: Same as P1

### P3 — `/search/advanced` filters not applied effectively ✓
- **Root cause**: `searchWithFacets` ran `searchWorks` and `getFacets` in parallel via `Promise.all` on a shared Sphinx connection. `SHOW META` in `searchWorks` was returning metadata from concurrent `getFacets` queries, giving wrong totals.
- **Fix**: Changed to sequential execution — `searchWorks` first, then `getFacets`. Also added `author`, `subject`, and `type→work_type` alias to the advanced handler.
- **Files**: `services/sphinx.service.js` (`searchWithFacets`), `routes/search.js` (advanced handler)

### P4 — `scope` param inert — FRONTEND ONLY
- Backend endpoints exist and work (`/search/persons`, `/search/global`, `/venues/search`)

### P5 — `year` single field vs range — FRONTEND ONLY
- Backend already supports `year_from` + `year_to`

### P6 — `peer_reviewed`/`open_access` not exposed — FRONTEND ONLY
- Backend already supports these filters

### P7 — Duplicate remapping — FRONTEND ONLY
- Backend accepts both `type` and `work_type`

### P8 — `include_facets` on `/search/works` never returns facets ✓
- **Root cause**: Facet fetch was gated on `worksResult.performance.engine` containing "SPHINX" — failed when MariaDB fallback was used
- **Fix**: Removed engine check; facets are attempted whenever `include_facets=true`, Sphinx is enabled, and query >= 2 chars
- **Files**: `services/search.service.js`

## Files Modified
- `src/routes/search.js` — validation, swagger docs, advanced handler (author, subject, type alias)
- `src/controllers/search.controller.js` — pass author/subject filters
- `src/services/search.service.js` — cache key with author/subject, filter passthrough, relaxed facets condition
- `src/services/sphinx.service.js` — `@author_string`/`@subjects_string` MATCH in searchWorkIds + searchWorks; sequential execution in searchWithFacets
- `src/services/works.service.js` — pass author/subject to Sphinx searchWorkIds; MariaDB fallback author/subject filtering
- `tests/search.test.js` — new tests for author, subject, facets, advanced filters
- `docs/swagger.json`, `docs/swagger.yaml` — regenerated

## Verified Results (port 1210)
- `/search/works?q=sociology` → 480508 results
- `/search/works?q=sociology&author=geertz` → 66 results ✓
- `/search/works?q=learning&subject=computer+science` → 13400 results ✓
- `/search/works?q=sociology&include_facets=true` → facets with years, work_types, languages, venues, authors ✓
- `/search/advanced?q=sociology&author=geertz` → 66 results ✓
- `/search/advanced?q=sociology&work_type=BOOK` → 8744 results ✓
- `/search/advanced?q=sociology&type=BOOK` → 8744 results (alias) ✓
- `/search/advanced?q=sociology&subject=education` → 72402 results ✓
