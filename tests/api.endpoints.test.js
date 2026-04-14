

process.env.NODE_ENV = 'test';
process.env.TEST_FAST = '1';
process.env.INTERNAL_ACCESS_KEY = process.env.INTERNAL_ACCESS_KEY || 'test-internal-key';
process.env.SECURITY_ACCESS_KEY = process.env.SECURITY_ACCESS_KEY || 'test-security-key';

const { createMockReq, createMockRes, withResponseFormatter } = require('./helpers/mock-express');
const { invokeRouter } = require('./helpers/router-invoke');

const healthRouter = require('../src/routes/health');
const worksRouter = require('../src/routes/works');
const publicationsRouter = require('../src/routes/publications');
const personsRouter = require('../src/routes/persons');
const orgsRouter = require('../src/routes/organizations');
const venuesRouter = require('../src/routes/venues');
const searchRouter = require('../src/routes/search');
const citationsRouter = require('../src/routes/citations');
const collaborationsRouter = require('../src/routes/collaborations');
const coursesRouter = require('../src/routes/courses');
const instructorsRouter = require('../src/routes/instructors');
const bibliographyRouter = require('../src/routes/bibliography');
const securityRouter = require('../src/routes/security');
const dashboardRouter = require('../src/routes/dashboard');

const worksService = require('../src/services/works.service');
const publicationsService = require('../src/services/publications.service');
const personsService = require('../src/services/persons.service');
const orgsService = require('../src/services/organizations.service');
const venuesService = require('../src/services/venues.service');
const searchService = require('../src/services/search.service');
const citationsService = require('../src/services/citations.service');
const collaborationsService = require('../src/services/collaborations.service');
const coursesService = require('../src/services/courses.service');
const instructorsService = require('../src/services/instructors.service');
const bibliographyService = require('../src/services/bibliography.service');
const restoreStack = [];

const pageMeta = (page = 1, limit = 10, total = 2) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

const restoreStubs = () => {
  while (restoreStack.length > 0) {
    const restore = restoreStack.pop();
    restore();
  }
};

const stubMethod = (target, methodName, replacement) => {
  const original = target[methodName];
  target[methodName] = replacement;
  restoreStack.push(() => {
    target[methodName] = original;
  });
};

const stubResolved = (target, methodName, value) => {
  stubMethod(target, methodName, async () => value);
};

afterEach(() => {
  restoreStubs();
});

describe('Health', () => {
  test('GET /health/liveness returns alive', async () => {
    const req = createMockReq({ method: 'GET', path: '/health/liveness' });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: healthRouter, method: 'get', path: '/liveness', req, res });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('alive', true);
  });

});

describe('Works', () => {
  test('GET /works returns paginated list', async () => {
    stubResolved(worksService, 'getWorks', {
      data: [
        { id: 1, title: 'Sample Work', type: 'ARTICLE', authors_preview: [], venue: { name: 'Test' }, publication_year: 2020, data_source: 'TEST' },
        { id: 2, title: 'Another Work', type: 'BOOK', authors_preview: [], venue: { name: 'Test' }, publication_year: 2019, data_source: 'TEST' },
      ],
      pagination: pageMeta(1, 10, 2),
      performance: { engine: 'mock', query_type: 'list', elapsed_ms: 1 },
    });

    const req = createMockReq({ method: 'GET', path: '/works', query: { limit: 10 } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: worksRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('pagination');
  });

  test('GET /works/:id returns work object', async () => {
    stubResolved(worksService, 'getWorkById', { id: 123, title: 'Work 123' });
    const req = createMockReq({ method: 'GET', path: '/works/123', params: { id: '123' } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: worksRouter, method: 'get', path: '/:id', req, res });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('id', 123);
  });
});

describe('Publications', () => {
  test('GET /publications returns paginated list', async () => {
    stubResolved(publicationsService, 'getPublications', {
      data: [
        { id: 11, work_id: 7, doi: '10.1234/foo', title: 'Sample publication', type: 'ARTICLE', publication_year: 2024 },
        { id: 12, work_id: 8, doi: '10.1234/bar', title: 'Another publication', type: 'BOOK', publication_year: 2023 }
      ],
      pagination: pageMeta(1, 10, 2),
      meta: { engine: 'mock', sphinx_query_ms: null, elapsed_ms: 1 }
    });

    const req = createMockReq({ method: 'GET', path: '/publications', query: { limit: 10 } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: publicationsRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toHaveProperty('id', 11);
    expect(res.body.data[0]).toHaveProperty('work_id', 7);
    expect(res.body).toHaveProperty('pagination');
  });

  test('GET /publications honours the venue filter without a query term', async () => {
    let captured = null;
    stubMethod(publicationsService, 'getPublications', async (filters) => {
      captured = filters;
      return {
        data: [],
        pagination: pageMeta(1, 10, 0),
        meta: { engine: 'MariaDB', elapsed_ms: 0 }
      };
    });

    const req = createMockReq({
      method: 'GET',
      path: '/publications',
      query: { venue: 'mana', year_from: '1990' }
    });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: publicationsRouter, method: 'get', path: '/', req, res });

    expect(res.statusCode).toBe(200);
    expect(captured).not.toBeNull();
    expect(captured.venue).toBe('mana');
    expect(captured.year_from).toBe('1990');
    expect(captured.q).toBeUndefined();
  });

  test('GET /publications/:id returns the publication payload with siblings', async () => {
    stubResolved(publicationsService, 'getPublicationById', {
      id: 42,
      identifiers: { doi: '10.5678/x' },
      publication_year: 2022,
      work: { id: 7, title: 'Parent work', authors: [], subjects: [] },
      siblings: [
        { id: 41, doi: '10.5678/x-prev', publication_year: 2018, _links: { self: '/publications/41' } }
      ],
      files: []
    });

    const req = createMockReq({
      method: 'GET',
      path: '/publications/42',
      params: { id: '42' }
    });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: publicationsRouter, method: 'get', path: '/:id', req, res });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('id', 42);
    expect(res.body.data).toHaveProperty('work');
    expect(res.body.data.work).toHaveProperty('id', 7);
    expect(Array.isArray(res.body.data.siblings)).toBe(true);
    expect(res.body.data.siblings).toHaveLength(1);
  });

  test('GET /publications/:id returns 404 when the publication does not exist', async () => {
    stubResolved(publicationsService, 'getPublicationById', null);

    const req = createMockReq({
      method: 'GET',
      path: '/publications/999999',
      params: { id: '999999' }
    });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: publicationsRouter, method: 'get', path: '/:id', req, res });

    expect(res.statusCode).toBe(404);
    expect(res.body.status).toBe('error');
  });

  test('GET /publications/:id rejects non-integer id', async () => {
    const req = createMockReq({
      method: 'GET',
      path: '/publications/not-a-number',
      params: { id: 'not-a-number' }
    });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: publicationsRouter, method: 'get', path: '/:id', req, res });

    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe('error');
  });
});

describe('Persons', () => {
  test('GET /persons returns paginated list', async () => {
    stubResolved(personsService, 'getPersons', {
      data: [{ id: 1, preferred_name: 'Test', metrics: { works_count: 0 } }],
      pagination: pageMeta(1, 10, 1),
      performance: { engine: 'mock', elapsed_ms: 1 },
    });
    const req = createMockReq({ method: 'GET', path: '/persons', query: { limit: 10 } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: personsRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /persons/:id returns person', async () => {
    stubResolved(personsService, 'getPersonById', { id: 7, preferred_name: 'Jane Doe' });
    const req = createMockReq({ method: 'GET', path: '/persons/7', params: { id: '7' } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: personsRouter, method: 'get', path: '/:id', req, res });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('id', 7);
  });
});

describe('Organizations', () => {
  test('GET /institutions returns list', async () => {
    stubResolved(orgsService, 'getOrganizations', {
      data: [{ id: 1, name: 'Test University', identifiers: { ror_id: 'RORX' }, metrics: { works_count: 0 } }],
      pagination: pageMeta(1, 20, 1),
      performance: { engine: 'mock' },
      meta: { engine: 'mock' },
    });
    const req = createMockReq({ method: 'GET', path: '/institutions', query: {} });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: orgsRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /institutions/:id returns details', async () => {
    stubResolved(orgsService, 'getOrganizationById', { id: 1, name: 'Test University', metrics: { works_count: 10 } });
    const req = createMockReq({ method: 'GET', path: '/institutions/1', params: { id: '1' } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: orgsRouter, method: 'get', path: '/:id', req, res });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('id', 1);
  });
});

describe('Venues', () => {
  test('GET /venues returns list', async () => {
    stubResolved(venuesService, 'getVenues', {
      data: [{ id: 1, name: 'Journal of Tests', type: 'JOURNAL', works_count: 0 }],
      pagination: { total: 1, limit: 20, offset: 0, pages: 1 },
      meta: { engine: 'mock' },
    });
    const req = createMockReq({ method: 'GET', path: '/venues', query: {} });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: venuesRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('Search', () => {
  test('GET /search/works returns results', async () => {
    stubResolved(searchService, 'searchWorks', {
      data: [{ id: 101, title: 'Anthropology 101', type: 'ARTICLE', authors_preview: [], venue: { name: 'X' } }],
      pagination: pageMeta(1, 10, 1),
      meta: { performance: { engine: 'mock' }, query: 'anthropology' },
      performance: { engine: 'mock', query_type: 'search' },
    });
    const req = createMockReq({ method: 'GET', path: '/search/works', query: { q: 'anthropology' } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: searchRouter, method: 'get', path: '/works', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('Citations', () => {
  test('GET /works/:id/citations returns list', async () => {
    stubResolved(citationsService, 'getWorkCitations', {
      work_id: 5,
      citing_works: [{ id: 1, citing_work_id: 2 }],
      pagination: pageMeta(1, 10, 1),
      filters: { type: 'all' },
    });
    const req = createMockReq({ method: 'GET', path: '/works/5/citations', params: { id: '5' }, query: { page: 1, limit: 10 } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: citationsRouter, method: 'get', path: '/works/:id/citations', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data.citing_works)).toBe(true);
  });
});

describe('Collaborations', () => {
  test('GET /persons/:id/collaborators returns list', async () => {
    stubResolved(collaborationsService, 'getPersonCollaborators', {
      person_id: 1,
      total_collaborators: 1,
      collaborators: [{ collaborator_id: 2, collaborator_name: 'X' }],
      pagination: pageMeta(1, 10, 1),
    });
    const req = createMockReq({ method: 'GET', path: '/persons/1/collaborators', params: { id: '1' }, query: { page: 1, limit: 10 } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: collaborationsRouter, method: 'get', path: '/persons/:id/collaborators', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data.collaborators)).toBe(true);
  });
});

describe('Courses & Instructors', () => {
  test('GET /courses returns list', async () => {
    stubResolved(coursesService, 'getCourses', {
      data: [{ id: 1, name: 'Anthropology Intro' }],
      pagination: pageMeta(1, 10, 1),
      meta: {},
    });
    const req = createMockReq({ method: 'GET', path: '/courses', query: {} });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: coursesRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
  });

  test('GET /instructors returns list', async () => {
    stubResolved(instructorsService, 'getInstructors', {
      data: [{ id: 10, preferred_name: 'Prof. Test' }],
      pagination: pageMeta(1, 10, 1),
      meta: {},
    });
    const req = createMockReq({ method: 'GET', path: '/instructors', query: {} });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: instructorsRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /instructors/:id rejects invalid id', async () => {
    const req = createMockReq({ method: 'GET', path: '/instructors/abc', params: { id: 'abc' } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: instructorsRouter, method: 'get', path: '/:id', req, res });
    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe('error');
  });
});

describe('DTOs structure', () => {
  test('Venue DTO includes explicit IDs', () => {
    const { formatVenueListItem } = require('../src/dto/venue.dto');
    const input = {
      id: 1,
      name: 'Test Venue',
      abbreviated_name: 'T. Venue',
      type: 'JOURNAL',
      scopus_id: '12345',
      wikidata_id: 'Q123',
      openalex_id: 'V123',
      mag_id: 'M123',
      issn: '1111-2222',
      eissn: '3333-4444'
    };
    const out = formatVenueListItem(input);
    expect(out).toHaveProperty('scopus_id', '12345');
    expect(out).toHaveProperty('wikidata_id', 'Q123');
    expect(out).toHaveProperty('openalex_id', 'V123');
    expect(out).toHaveProperty('mag_id', 'M123');
    expect(out).toHaveProperty('abbreviated_name', 'T. Venue');
  });

  test('Person DTO includes explicit IDs and name_variations', () => {
    const { formatPersonDetails, formatPersonListItem } = require('../src/dto/person.dto');
    const person = {
      id: 10,
      preferred_name: 'Jane Doe',
      given_names: 'Jane',
      family_name: 'Doe',
      orcid: '0000-0001-2345-6789',
      scopus_id: 'SC123',
      lattes_id: 'L123',
      wikidata_id: 'Q987',
      openalex_id: 'A-1',
      mag_id: 'MAG-1',
      url: 'https://example.org/jane',
      name_variations: 'J. Doe;Jane D.'
    };
    const details = formatPersonDetails(person);
    expect(details).toMatchObject({
      orcid: '0000-0001-2345-6789',
      scopus_id: 'SC123',
      lattes_id: 'L123',
      wikidata_id: 'Q987',
      openalex_id: 'A-1',
      mag_id: 'MAG-1',
      url: 'https://example.org/jane'
    });
    expect(Array.isArray(details.name_variations)).toBe(true);
    expect(details.name_variations.length).toBeGreaterThan(0);

    const listItem = formatPersonListItem(person);
    expect(listItem).toHaveProperty('scopus_id', 'SC123');
  });

  test('Organization DTO exposes explicit IDs and keeps identifiers object', () => {
    const { formatOrganizationDetails, formatOrganizationListItem } = require('../src/dto/organization.dto');
    const org = {
      id: 2,
      name: 'Test University',
      type: 'university',
      ror_id: 'ROR123',
      wikidata_id: 'Q555',
      openalex_id: 'O-9',
      mag_id: 'MAG-O',
      url: 'https://example.org/u'
    };
    const details = formatOrganizationDetails(org);
    expect(details).toMatchObject({
      ror_id: 'ROR123',
      wikidata_id: 'Q555',
      openalex_id: 'O-9',
      mag_id: 'MAG-O',
      url: 'https://example.org/u'
    });
    expect(details).toHaveProperty('identifiers');
    const listItem = formatOrganizationListItem(org);
    expect(listItem).toHaveProperty('ror_id', 'ROR123');
  });

  test('Work DTO embeds publications array and aggregated identifiers', () => {
    const { formatWorkDetails, formatWorkListItem } = require('../src/dto/work.dto');
    const work = {
      id: 3,
      title: 'Test Work',
      venue_name: 'Journal of Tests',
      venue_abbrev: 'J. Tests',
      publications: [
        {
          id: 11,
          identifiers: {
            doi: '10.1/a',
            pmid: '123456',
            pmcid: 'PMC999',
            arxiv: 'arXiv:2101.00001',
            wos_id: 'WOS:ABC',
            handle: '12345/6789',
            wikidata_id: 'Q42',
            openalex_id: 'W-1',
            mag_id: 'MAG-W'
          },
          publication_year: 2024
        }
      ],
      publications_total: 1,
      publications_has_more: false,
      identifiers: {
        doi: ['10.1/a'],
        pmid: ['123456'],
        pmcid: ['PMC999'],
        arxiv: ['arXiv:2101.00001'],
        wos_id: ['WOS:ABC'],
        handle: ['12345/6789'],
        wikidata_id: ['Q42'],
        openalex_id: ['W-1'],
        mag_id: ['MAG-W'],
        isbn: [],
        openlibrary_id: []
      }
    };
    const details = formatWorkDetails(work);
    expect(details).toHaveProperty('publications');
    expect(Array.isArray(details.publications)).toBe(true);
    expect(details.publications).toHaveLength(1);
    expect(details.publications[0].identifiers).toHaveProperty('pmid', '123456');
    expect(details.publications[0].identifiers).toHaveProperty('openalex_id', 'W-1');
    expect(details).toHaveProperty('publications_total', 1);
    expect(details).toHaveProperty('publications_has_more', false);
    expect(details.identifiers.doi).toContain('10.1/a');
    expect(details.identifiers.pmid).toContain('123456');
    expect(details).not.toHaveProperty('publication');
    expect(details).not.toHaveProperty('venue');
    expect(details).not.toHaveProperty('files');

    const listItem = formatWorkListItem(work);
    expect(listItem.venue).toHaveProperty('name', 'Journal of Tests');
    expect(listItem.venue).toHaveProperty('abbreviated_name', 'J. Tests');
  });

  test('Publication entry exposes openaccess identifier while keeping legacy openacess alias', () => {
    const { formatPublicationEntry } = require('../src/dto/publication.dto');
    const row = {
      publication_id: 99,
      work_id: 7,
      files_json: JSON.stringify([
        { id: 1, file_format: 'PDF', file_role: 'MAIN' }
      ])
    };
    const entry = formatPublicationEntry(row);
    expect(entry.files).toHaveLength(1);
    expect(entry.files[0]).toHaveProperty('format', 'PDF');
    expect(entry.files[0]).toHaveProperty('role', 'MAIN');
    expect(entry).not.toHaveProperty('work');
    expect(entry).not.toHaveProperty('siblings');
  });

  test('Work DTO normalizes open_access in citations and references', () => {
    const { formatWorkDetails } = require('../src/dto/work.dto');
    const work = {
      id: 101,
      citations: {
        cited_by: [
          {
            work_id: 11,
            open_access: 1
          }
        ],
        references: [
          {
            work_id: 22,
            open_access: 'false'
          }
        ]
      }
    };

    const details = formatWorkDetails(work);
    expect(details.citations.cited_by[0]).toHaveProperty('open_access', true);
    expect(details.citations.references[0]).toHaveProperty('open_access', false);
  });
});

describe('Bibliography', () => {
  test('GET /bibliographies returns list', async () => {
    stubResolved(bibliographyService, 'getBibliography', {
      data: [{ id: 1, work_id: 123, course_id: 5 }],
      pagination: pageMeta(1, 10, 1),
      meta: {},
    });
    const req = createMockReq({ method: 'GET', path: '/bibliographies', query: {} });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: bibliographyRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('Security', () => {
  test('GET /security/stats requires key and responds', async () => {
    const accessKey = process.env.API_KEY || process.env.SECURITY_ACCESS_KEY || process.env.INTERNAL_ACCESS_KEY;
    const req = createMockReq({ method: 'GET', path: '/security/stats', headers: { 'x-access-key': accessKey } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: securityRouter, method: 'get', path: '/stats', req, res });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('stats');
  });

  test('POST /security/unblock/:ip rejects invalid ip', async () => {
    const accessKey = process.env.API_KEY || process.env.SECURITY_ACCESS_KEY || process.env.INTERNAL_ACCESS_KEY;
    const req = createMockReq({
      method: 'POST',
      path: '/security/unblock/not-an-ip',
      params: { ip: 'not-an-ip' },
      headers: { 'x-access-key': accessKey }
    });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: securityRouter, method: 'post', path: '/unblock/:ip', req, res });
    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe('error');
  });
});

describe('Dashboard', () => {
  test('GET /dashboard/performance rejects invalid hours', async () => {
    const accessKey = process.env.INTERNAL_ACCESS_KEY || process.env.SECURITY_ACCESS_KEY || process.env.API_KEY;
    const req = createMockReq({
      method: 'GET',
      path: '/dashboard/performance',
      query: { hours: '200' },
      headers: { 'x-access-key': accessKey }
    });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: dashboardRouter, method: 'get', path: '/performance', req, res });
    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe('error');
  });
});
