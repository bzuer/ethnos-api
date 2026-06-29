process.env.NODE_ENV = process.env.NODE_ENV === 'test' ? 'production' : (process.env.NODE_ENV || 'production');
process.env.PORT = process.env.PORT || '1210';

const { describe, test, after, before } = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.INTEGRATION_BASE_URL || `http://localhost:${process.env.PORT || '1210'}`;
const ACCESS_KEY = (
  process.env.INTEGRATION_ACCESS_KEY
  || process.env.API_KEY
  || process.env.INTERNAL_ACCESS_KEY
  || process.env.SECURITY_ACCESS_KEY
  || process.env.API_ACCESS_KEY
  || process.env.ETHNOS_API_KEY
  || process.env.ETHNOS_API_ACCESS_KEY
  || process.env.API_SECRET_KEY
  || process.env.ETHNOS_API_KEY_2
  || ''
);

const fetchJson = async (path, { headers = {} } = {}) => {
  const url = `${BASE_URL}${path}`;
  const started = Date.now();
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      ...(ACCESS_KEY ? { 'x-access-key': ACCESS_KEY } : {}),
      ...headers
    }
  });
  const duration = Date.now() - started;
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  return { status: res.status, body, duration, url };
};

const assertSuccess = (result, label) => {
  assert.equal(
    result.status,
    200,
    `${label} expected 200 but got ${result.status} (${result.duration}ms) body=${JSON.stringify(result.body).slice(0, 200)}`
  );
  assert.equal(result.body?.status, 'success', `${label} envelope must be success`);
  return result.body;
};

const fetchRaw = async (path, { headers = {} } = {}) => {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { headers: { accept: 'application/json', ...headers } });
  let body = null;
  try { body = await res.json(); } catch (_) { body = null; }
  return { status: res.status, body, url };
};

describe('Integration smoke (real DB)', () => {
  before(async () => {
    const health = await fetchJson('/health/liveness');
    if (health.status !== 200) {
      throw new Error(
        `Integration smoke requires a running API at ${BASE_URL}. Set INTEGRATION_BASE_URL to override. Received status ${health.status}.`
      );
    }
    if (!ACCESS_KEY) {
      throw new Error(
        'Integration smoke requires an access key. Set INTEGRATION_ACCESS_KEY (or any of API_KEY / INTERNAL_ACCESS_KEY / ETHNOS_API_KEY / ETHNOS_API_KEY_2).'
      );
    }
  });

  describe('Open access and optional key', () => {
    test('GET /works without key returns 200 (public access)', async () => {
      const result = await fetchRaw('/works?limit=1');
      assert.equal(result.status, 200, `expected 200, got ${result.status}`);
      assert.equal(result.body?.status, 'success');
    });

    test('GET /metrics/annual without key returns 200 (public access)', async () => {
      const result = await fetchRaw('/metrics/annual?limit=1');
      assert.equal(result.status, 200, `expected 200, got ${result.status}`);
      assert.equal(result.body?.status, 'success');
    });

    test('GET /dashboard/overview without key stays gated (401)', async () => {
      const result = await fetchRaw('/dashboard/overview');
      assert.equal(result.status, 401, `expected 401, got ${result.status}`);
      assert.equal(result.body?.code, 'UNAUTHORIZED');
    });

    test('GET /health/liveness stays public', async () => {
      const result = await fetchRaw('/health/liveness');
      assert.equal(result.status, 200);
      assert.equal(result.body?.status, 'success');
    });

    test('GET /docs.json stays public', async () => {
      const result = await fetchRaw('/docs.json');
      assert.equal(result.status, 200);
    });

    test('GET /metrics/annual with key returns 200', async () => {
      const body = assertSuccess(await fetchJson('/metrics/annual?limit=1'), 'metrics/annual with key');
      assert.ok(Array.isArray(body.data));
    });
  });

  describe('Core listings', () => {
    test('GET /works returns match_mode any_publication and exposes publication_id', async () => {
      const body = assertSuccess(await fetchJson('/works?limit=3'), 'GET /works');
      assert.ok(Array.isArray(body.data), 'data must be array');
      assert.equal(body.meta?.match_mode, 'any_publication');
      if (body.data.length > 0) {
        const work = body.data[0];
        assert.ok('publication_id' in work, 'work must expose publication_id');
        assert.ok('publications_count' in work, 'work must expose publications_count');
      }
    });

    test('GET /works fills the requested page with publication-bearing works', async () => {
      const limit = 50;
      const body = assertSuccess(await fetchJson(`/works?limit=${limit}`), 'GET /works?limit=50');
      assert.equal(body.data.length, limit, 'first page must fill to the requested limit');
      assert.ok(body.data.every((w) => w.publication_id), 'every listed work must carry a publication_id');
      assert.ok('pagination_total_exact' in (body.meta || {}), 'meta must surface pagination_total_exact');
    });

    test('GET /works enforces the 1..100 limit bound', async () => {
      const ok = assertSuccess(await fetchJson('/works?limit=100'), 'GET /works?limit=100');
      assert.equal(ok.data.length, 100, 'limit=100 must be accepted and fill');
      const tooBig = await fetchJson('/works?limit=101');
      assert.equal(tooBig.status, 400, 'limit=101 must be rejected');
      assert.equal(tooBig.body?.code, 'VALIDATION_ERROR');
    });

    test('GET /works/showcase fills to the requested limit', async () => {
      const limit = 50;
      const body = assertSuccess(await fetchJson(`/works/showcase?limit=${limit}`), 'GET /works/showcase?limit=50');
      assert.equal(body.data.length, limit, 'showcase first page must fill to the requested limit');
      assert.ok(body.data.every((w) => w.publication_id), 'every showcase work must carry a publication_id');
    });

    test('GET /search/works free-text q returns ranked matches', async () => {
      const body = assertSuccess(await fetchJson('/search/works?q=social&limit=5'), 'GET /search/works?q');
      assert.ok(Array.isArray(body.data), 'data must be array');
      assert.ok(body.pagination.total > 0, 'free-text q must return matches');
      assert.equal(body.meta?.search_type, 'fulltext');
      assert.equal(body.meta?.performance?.match_mode, 'any_publication');
      if (body.data.length > 0) {
        assert.ok('cited_by_count' in body.data[0], 'search result must expose cited_by_count');
      }
    });

    test('GET /works/:id embeds publications[]', async () => {
      const list = assertSuccess(await fetchJson('/works?limit=1'), 'GET /works for /works/:id probe');
      const workId = list.data?.[0]?.id;
      if (!workId) return;
      const body = assertSuccess(await fetchJson(`/works/${workId}`), `GET /works/${workId}`);
      assert.equal(body.data.id, workId);
      assert.ok(Array.isArray(body.data.publications), 'publications must be array');
      assert.ok(!('publication' in body.data), 'legacy publication block must be gone');
      assert.ok('primary_publication_id' in body.data, 'primary_publication_id must be present');
      assert.ok('primary_publication' in body.data, 'primary_publication must be present');
      assert.ok('files' in body.data && Array.isArray(body.data.files), 'work-level files[] must be present');
      assert.ok(body.data.file_summary && typeof body.data.file_summary === 'object', 'file_summary block must be present');
      assert.ok('year_range' in body.data, 'year_range must be present');
      assert.ok('venues' in body.data && Array.isArray(body.data.venues), 'venues aggregation must be present');
      if (body.data.publications.length > 0) {
        const head = body.data.publications[0];
        assert.ok(head._links && head._links.self, 'each publication entry must expose _links.self');
        assert.ok('is_primary' in head, 'each publication entry must expose is_primary');
      }
    });

    test('GET /publications exposes identifiers+files', async () => {
      const list = assertSuccess(await fetchJson('/publications?limit=1'), 'GET /publications for /publications/:id probe');
      const publicationId = list.data?.[0]?.id;
      if (!publicationId) return;
      const body = assertSuccess(await fetchJson(`/publications/${publicationId}`), `GET /publications/${publicationId}`);
      assert.equal(body.data.id, publicationId);
      assert.ok(body.data.identifiers, 'identifiers block');
      assert.equal(typeof body.data.has_scimag_file, 'boolean');
      assert.equal(typeof body.data.has_libgen_file, 'boolean');
    });

    test('GET /publications with filter-only path', async () => {
      const body = assertSuccess(await fetchJson('/publications?venue=culture&limit=2'), 'GET /publications?venue');
      assert.ok(Array.isArray(body.data));
    });

    test('GET /publications list hydrates venue + source + license', async () => {
      const body = assertSuccess(await fetchJson('/publications?limit=3'), 'GET /publications');
      assert.ok(Array.isArray(body.data));
      const withVenue = (body.data || []).find((p) => p.venue && p.venue.id);
      if (withVenue) {
        assert.ok(withVenue.venue.name, 'venue.name populated');
        assert.ok('type' in withVenue.venue, 'venue.type key present');
        assert.ok('issn' in withVenue.venue, 'venue.issn key present');
        assert.ok('openalex_id' in withVenue.venue, 'venue.openalex_id key present');
        assert.ok('source' in withVenue, 'publication exposes source');
        assert.ok('license_url' in withVenue, 'publication exposes license_url');
        assert.ok('publisher' in withVenue, 'publication exposes publisher field');
      }
    });

    test('GET /institutions exposes organizations base-table surface', async () => {
      const body = assertSuccess(await fetchJson('/institutions?limit=5'), 'GET /institutions');
      assert.ok(Array.isArray(body.data));
      assert.equal(body.meta?.source, 'organizations');
      assert.equal(body.meta?.sort?.by, 'works_count', 'default sort field is works_count');
      assert.equal(body.meta?.sort?.order, 'DESC', 'default sort order is DESC');
      if (body.data.length >= 2) {
        const works = body.data.map((o) => o.metrics?.works_count ?? 0);
        for (let i = 1; i < works.length; i += 1) {
          assert.ok(works[i - 1] >= works[i], `institutions must order by works_count DESC (got ${works.join(', ')})`);
        }
        const first = body.data[0];
        assert.ok('identifiers' in first, 'list item exposes grouped identifiers block');
        assert.ok('metrics' in first, 'list item exposes metrics block');
        assert.ok('location' in first, 'list item exposes location block');
        assert.ok(!('ror_id' in first), 'identifiers are not duplicated at top level');
      }
    });

    test('GET /institutions filters by type', async () => {
      const body = assertSuccess(await fetchJson('/institutions?type=FUNDER&limit=3'), 'GET /institutions?type=FUNDER');
      assert.ok(Array.isArray(body.data));
      for (const org of body.data) {
        assert.equal(org.type, 'FUNDER', 'type filter restricts to FUNDER');
      }
    });

    test('GET /institutions/:id exposes grouped detail blocks', async () => {
      const list = assertSuccess(await fetchJson('/institutions?limit=1'), 'institutions list for detail');
      if (!list.data.length) return;
      const id = list.data[0].id;
      const body = assertSuccess(await fetchJson(`/institutions/${id}`), `GET /institutions/${id}`);
      const org = body.data;
      assert.equal(org.id, id);
      for (const block of ['identifiers', 'names', 'metrics', 'funding_role', 'production_summary', 'relationships', '_links']) {
        assert.ok(block in org, `detail exposes ${block} block`);
      }
      assert.ok(Array.isArray(org.names.acronyms), 'names.acronyms is an array');
      assert.ok(Array.isArray(org.names.alternative_names), 'names.alternative_names is an array');
      assert.equal(typeof org.names.aliases_count, 'number', 'names.aliases_count is numeric');
      assert.equal(org.names.aliases_count, org.names.acronyms.length + org.names.alternative_names.length, 'aliases_count derives from name arrays');
      assert.equal(org._links.works, `/institutions/${id}/works`);
    });

    test('GET /institutions?q=USP resolves via acronym', async () => {
      const body = assertSuccess(await fetchJson('/institutions?q=USP&limit=5'), 'GET /institutions?q=USP');
      assert.ok(Array.isArray(body.data));
      assert.ok(body.data.length > 0, 'acronym search returns matches');
      const hasUsp = body.data.some((o) => Array.isArray(o.acronyms) && o.acronyms.includes('USP'));
      assert.ok(hasUsp, 'an org with the USP acronym surfaces for q=USP');
    });

    test('GET /institutions/:id/works honours the work sort contract', async () => {
      const list = assertSuccess(await fetchJson('/institutions?limit=1&sort_by=works_count'), 'institutions list for works');
      if (!list.data.length) return;
      const id = list.data[0].id;
      const body = assertSuccess(
        await fetchJson(`/institutions/${id}/works?sort_by=cited_by_count&limit=5`),
        `GET /institutions/${id}/works`
      );
      assert.ok(Array.isArray(body.data));
      assert.equal(body.meta?.match_mode, 'affiliation');
      assert.equal(body.meta?.sort?.by, 'cited_by_count');
      const cites = body.data.map((w) => w.cited_by_count ?? 0);
      for (let i = 1; i < cites.length; i += 1) {
        assert.ok(cites[i - 1] >= cites[i], `works ordered by cited_by_count DESC (got ${cites.join(', ')})`);
      }
    });

    test('GET /institutions/:id/funded-works returns funder corpus', async () => {
      const funders = assertSuccess(await fetchJson('/institutions?type=FUNDER&limit=1'), 'funder list for funded-works');
      if (!funders.data.length) return;
      const id = funders.data[0].id;
      const body = assertSuccess(await fetchJson(`/institutions/${id}/funded-works?limit=3`), 'GET funded-works');
      assert.ok(Array.isArray(body.data));
      assert.equal(body.meta?.match_mode, 'funder');
    });

    test('GET /venues exposes venues base-table surface', async () => {
      const body = assertSuccess(await fetchJson('/venues?limit=5'), 'GET /venues');
      assert.ok(Array.isArray(body.data));
      assert.equal(body.meta?.source, 'venues');
      assert.equal(body.meta?.sort?.by, 'score', 'default sort field is score (total_score)');
      assert.equal(body.meta?.sort?.order, 'DESC', 'default sort order is DESC');
      if (body.data.length >= 2) {
        const scores = body.data.map((v) => v.ranking?.score ?? 0);
        for (let i = 1; i < scores.length; i += 1) {
          assert.ok(scores[i - 1] >= scores[i], `venues must be ordered by total_score DESC (got ${scores.join(', ')})`);
        }
      }
      if (body.data.length > 0) {
        const venue = body.data[0];
        assert.ok(venue.identifiers && typeof venue.identifiers === 'object', 'identifiers block');
        assert.ok('issn' in venue.identifiers && 'openalex_id' in venue.identifiers, 'identifiers keys');
        assert.ok(venue.indexing && typeof venue.indexing === 'object', 'indexing block');
        assert.equal(typeof venue.indexing.is_in_doaj, 'boolean');
        assert.equal(typeof venue.indexing.is_in_scielo, 'boolean');
        assert.equal(typeof venue.indexing.is_indexed_in_scopus, 'boolean');
        assert.ok(venue.metrics && typeof venue.metrics === 'object', 'metrics block');
        assert.ok('impact_factor' in venue.metrics && 'h_index' in venue.metrics, 'metrics keys');
        assert.ok(venue.ranking && typeof venue.ranking === 'object', 'ranking block');
        assert.ok('score' in venue.ranking, 'ranking.score');
        assert.ok(venue.ranking.components && typeof venue.ranking.components === 'object', 'ranking.components');
        const comps = venue.ranking.components;
        for (const k of ['subject', 'oa', 'impact', 'llm']) {
          assert.ok(k in comps, `ranking.components.${k}`);
        }
        assert.ok(!('authorship' in comps) && !('affiliation' in comps) && !('citation' in comps) && !('snip' in comps), 'legacy ranking components removed');
        if (typeof venue.ranking.score === 'number') {
          const sum = ['subject', 'oa', 'impact', 'llm'].reduce((s, k) => s + (Number(comps[k]) || 0), 0);
          assert.ok(Math.abs(sum - venue.ranking.score) < 0.01, 'ranking components sum to score');
        }
        assert.ok('language' in venue, 'venue language field present');
        assert.ok(Array.isArray(venue.subjects), 'subjects array');
        assert.ok(!('terms' in venue), 'terms removed');
        assert.ok(!('keywords' in venue), 'keywords removed');
        assert.ok(!('legacy_metrics' in venue), 'legacy_metrics removed');
        assert.ok(!('issn' in venue), 'top-level issn removed');
        assert.ok(!('open_access_percentage' in venue), 'top-level open_access_percentage removed');
        assert.ok(!('global_ranking_score' in venue), 'top-level global_ranking_score removed');
      }
    });

    test('GET /venues/:id embeds yearly_stats and top_authors', async () => {
      const list = assertSuccess(await fetchJson('/venues?sortBy=works_count&sortOrder=DESC&limit=1'), 'list for detail probe');
      const venueId = list.data?.[0]?.id;
      if (!venueId) return;
      const body = assertSuccess(await fetchJson(`/venues/${venueId}`), `GET /venues/${venueId}`);
      assert.equal(body.data.id, venueId);
      assert.ok(Array.isArray(body.data.subjects), 'detail.subjects array');
      assert.ok(Array.isArray(body.data.yearly_stats), 'detail.yearly_stats array');
      assert.ok(Array.isArray(body.data.top_authors), 'detail.top_authors array');
      assert.ok(body.data.publication_summary, 'publication_summary block');
      assert.ok(Array.isArray(body.data.publication_summary.publication_trend), 'publication_trend array');
      assert.equal(typeof body.data.publication_summary.total_works_count, 'number', 'publication_summary.total_works_count');
      assert.equal(typeof body.data.publication_summary.open_access_works_count, 'number', 'publication_summary.open_access_works_count');
      const oaPct = body.data.publication_summary.open_access_percentage;
      assert.ok(oaPct === null || (typeof oaPct === 'number' && oaPct >= 0 && oaPct <= 100), 'open_access_percentage in [0,100] or null');
    });

    test('GET /persons', async () => {
      const body = assertSuccess(await fetchJson('/persons?limit=2'), 'GET /persons');
      assert.ok(Array.isArray(body.data));
    });
  });

  describe('Signatures and collaborations', () => {
    test('GET /signatures/1/works does not hit v_works_by_signature', async () => {
      const result = await fetchJson('/signatures/1/works?limit=2');
      assert.ok(result.status === 200 || result.status === 404, `unexpected status ${result.status}`);
      if (result.status === 200) {
        assert.equal(result.body?.status, 'success');
      }
    });

    test('GET /persons/:id/collaborators', async () => {
      const body = assertSuccess(await fetchJson('/persons/1/collaborators?limit=2'), 'GET collaborators');
      assert.ok(body.data);
    });
  });

  describe('Metrics', () => {
    test('GET /metrics/annual', async () => {
      const body = assertSuccess(await fetchJson('/metrics/annual?limit=3'), 'metrics/annual');
      assert.ok(Array.isArray(body.data));
    });

    test('GET /metrics/venues', async () => {
      const body = assertSuccess(await fetchJson('/metrics/venues?limit=3'), 'metrics/venues');
      assert.ok(Array.isArray(body.data));
    });

    test('GET /metrics/institutions', async () => {
      const body = assertSuccess(await fetchJson('/metrics/institutions?limit=3'), 'metrics/institutions');
      assert.ok(Array.isArray(body.data));
    });

    test('GET /metrics/persons', async () => {
      const body = assertSuccess(await fetchJson('/metrics/persons?limit=3'), 'metrics/persons');
      assert.ok(Array.isArray(body.data));
    });

    test('GET /metrics/collaborations', async () => {
      const body = assertSuccess(await fetchJson('/metrics/collaborations?limit=3'), 'metrics/collaborations');
      assert.ok(Array.isArray(body.data));
    });
  });

  describe('DOI resolver', () => {
    test('GET /{doi}', async () => {
      const result = await fetchJson('/10.36920/esa-v29n1-6');
      if (result.status === 200) {
        assert.equal(result.body?.status, 'success');
        assert.ok(result.body.data?.id);
        assert.ok(result.body.data?.work, 'DOI resolver must embed work block');
      } else {
        assert.equal(result.status, 404, `unexpected status ${result.status}`);
      }
    });
  });

  after(() => {});
});
