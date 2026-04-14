# Ethnos API - Release v1.0.0

**Release Date:** 2026-04-14
**API Version:** 2.0.0
**Runtime:** Node.js >= 18 (tested on v24.14.0)
**Branch:** main
**Commit:** bb04b2a

---

## Overview

First formal release of the Ethnos.app Academic Bibliography API, an academic bibliographic system built with Node.js/Express, backed by MariaDB and Sphinx full-text search. The system provides comprehensive endpoints for managing academic works, persons, organizations, venues, bibliographies, citations, collaborations, courses, instructors, and full-text search.

## Codebase Summary

| Component          | Count  |
|--------------------|--------|
| Source files        | 79     |
| Lines of code      | 25,282 |
| Route modules      | 17     |
| Controllers        | 13     |
| Services           | 21     |
| DTOs               | 13     |
| Middleware modules  | 9      |
| Utility modules     | 3      |
| Test files          | 14 (12 active, 2 disabled) |
| Test lines          | 2,754  |
| API paths           | 79     |
| API operations      | 79     |
| Total commits       | 73     |

## Database

| Object         | Count |
|----------------|-------|
| Base tables     | 38    |
| Views           | 11    |
| Stored procedures | 72  |
| Functions       | 12    |

## Dependencies

- **Production:** 21 packages
- **Development:** 2 packages (cross-env, supertest)
- **Vulnerabilities:** 0 (npm audit clean)

### Core Stack

| Package              | Version   | Purpose                          |
|----------------------|-----------|----------------------------------|
| express              | ^4.18.2   | HTTP framework                   |
| sequelize            | ^6.37.7   | ORM / query interface            |
| mysql2               | ^3.15.2   | MariaDB driver (primary)         |
| mariadb              | ^3.2.0    | MariaDB driver (native)          |
| redis                | ^4.6.7    | Cache layer                      |
| helmet               | ^7.0.0    | HTTP security headers            |
| express-rate-limit   | ^6.10.0   | Rate limiting                    |
| express-validator    | ^7.3.0    | Request validation               |
| xss                  | ^1.0.15   | XSS sanitization                 |
| swagger-jsdoc        | ^6.2.8    | OpenAPI documentation generation |
| swagger-ui-express   | ^5.0.0    | Swagger UI                       |
| winston              | ^3.10.0   | Logging                          |

## Endpoint Coverage

### Active Domains (17 route modules)

- **Works** - CRUD, showcase, bibliography relationships
- **Persons** - Person records with signature associations
- **Organizations** - Institutional data
- **Venues** - Publication venues with abbreviations
- **Bibliographies** - Bibliography management and relationships
- **Citations** - Work references (unified `work_references` table)
- **Collaborations** - Collaboration tracking with cached views
- **Courses** - Course management with bibliography links
- **Instructors** - Instructor management with bibliography links
- **Search** - Full-text search via Sphinx (`/search/works`, `/search/advanced`)
- **Metrics** - System metrics and Sphinx health
- **Health** - Liveness, readiness, and metrics probes
- **Dashboard** - Homepage statistics
- **Security** - Key validation endpoints
- **Sphinx** - Direct Sphinx management endpoints
- **Signatures** - Disabled at root, nested routes active
- **Subjects** - Disabled at root, nested routes active

### Special Routes

- **DOI Resolution:** `/{doi}`, `/doi.org/{doi}`, `/https://doi.org/{doi}`
- **OpenAPI:** `/docs`, `/docs.json`, `/docs.yaml`

## Infrastructure

| Service    | Role                        |
|------------|-----------------------------|
| MariaDB    | Primary database            |
| Redis      | Caching layer               |
| Sphinx     | Full-text search engine     |
| systemd    | Process management (user unit) |

- **Port:** 1211 (production), 3000 (test)
- **Environment:** `/etc/node-backend.env`
- **Sphinx config:** `/var/run/ethnos-api/sphinx.conf` (generated from template)
- **Sphinx data:** `/var/lib/ethnos-api/sphinx`

## Test Suite

- **Framework:** Node.js test runner + Supertest
- **Active tests:** 12 test files covering endpoints, works, persons, organizations, venues, search, health, bibliographies, citations, collaborations, courses, instructors
- **Disabled tests:** signatures, subjects (corresponding to disabled root endpoints)
- **Helpers:** 6 utility modules (auth, expectations, http-client, mock-express, router-invoke, test-app)

## Security Posture

### Implemented Protections

- Helmet with Content Security Policy
- CORS with origin allowlist
- XSS sanitization middleware (express-mongo-sanitize + xss)
- Access key authentication (multi-header support)
- Input validation (express-validator)
- Rate limiting enabled by default (600 req/min per IP, configurable via env)
- Request timeout (30s default)
- Error handler with production/development mode separation
- Honeypot path detection

### Resolved Issues (v1.0.0)

| Severity | Issue | Resolution |
|----------|-------|------------|
| Medium | Rate limiting disabled by default | Default flipped to enabled; disable via `RATE_LIMIT_DISABLED=true` |
| Medium | CSP `unsafe-inline` for scripts/styles | Removed; CSP now blocks inline scripts and styles |
| Medium | Access key timing attack (`!==`) | Replaced with `crypto.timingSafeEqual` + length check |
| Low | Request timeout disabled (0) | Set to 30s default |
| Low | Deprecated `mysql` package | Removed; only `mysql2` and `mariadb` remain |
| Low | Missing CSP directives | Added `form-action` and `base-uri` directives |

## Build and Deploy

```bash
npm install          # Install dependencies
npm run build        # Build
npm run dev          # Development mode
npm test             # Run test suite
npm run docs:generate # Generate OpenAPI docs

# Production
scripts/manage.sh start    # Start all infrastructure + API
scripts/manage.sh status   # Check infrastructure status
scripts/manage.sh restart  # Full restart with verification
scripts/manage.sh deploy   # Full deploy with reindex + tests
```

## Changelog (Dec 2025 - Apr 2026)

- **2025-12-29** - Initial commit
- **2026-01-01** - Public release v0.0.3
- **2026-01-08** - Works payload alignment, process runner
- **2026-03-12** - Repository cleanup, deprecated files removed, .gitignore hardened
- **2026-03-17** - DOI resolution endpoint added
- **2026-03-24** - PORT integer parsing fix, systemd service path updates
- **2026-03-26 to 2026-04-06** - Batch development iterations (services, middleware, infrastructure)
- **2026-04-07** - Sphinx query parallelization and shared helper extraction

## Files

- `CLAUDE.md` - Project instructions and conventions
- `docs/swagger.json` - OpenAPI 2.0 specification
- `docs/swagger.yaml` - OpenAPI YAML format
- `database/data.schema.sql` - Production database schema
- `database/schema.sql` - Reference schema
- `scripts/manage.sh` - Unified infrastructure management
- `scripts/maintenance/` - SQL maintenance routines with execution order
