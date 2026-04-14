process.env.NODE_ENV = process.env.NODE_ENV === 'test' ? 'production' : (process.env.NODE_ENV || 'production');
process.env.PORT = process.env.PORT || '1210';

const { describe, test, after, before } = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.INTEGRATION_BASE_URL || `http://localhost:${process.env.PORT || '1210'}`;
const ACCESS_KEY = process.env.INTEGRATION_ACCESS_KEY || '';

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

describe('Integration smoke (real DB)', () => {
  before(async () => {
    const health = await fetchJson('/health/liveness');
    if (health.status !== 200) {
      throw new Error(
        `Integration smoke requires a running API at ${BASE_URL}. Set INTEGRATION_BASE_URL to override. Received status ${health.status}.`
      );
    }
  });

  describe('Core listings', () => {
    test('GET /works returns match_mode any_publication', async () => {
      const body = assertSuccess(await fetchJson('/works?limit=3'), 'GET /works');
      assert.ok(Array.isArray(body.data), 'data must be array');
      assert.equal(body.meta?.match_mode, 'any_publication');
    });

    test('GET /works/:id embeds publications[]', async () => {
      const body = assertSuccess(await fetchJson('/works/5'), 'GET /works/5');
      assert.equal(body.data.id, 5);
      assert.ok(Array.isArray(body.data.publications), 'publications must be array');
      assert.ok(!('publication' in body.data), 'legacy publication block must be gone');
    });

    test('GET /publications exposes identifiers+files', async () => {
      const body = assertSuccess(await fetchJson('/publications/5'), 'GET /publications/5');
      assert.equal(body.data.id, 5);
      assert.ok(body.data.identifiers, 'identifiers block');
      assert.equal(typeof body.data.has_scimag_file, 'boolean');
      assert.equal(typeof body.data.has_libgen_file, 'boolean');
    });

    test('GET /publications with filter-only path', async () => {
      const body = assertSuccess(await fetchJson('/publications?venue=culture&limit=2'), 'GET /publications?venue');
      assert.ok(Array.isArray(body.data));
    });

    test('GET /institutions does not hit legacy views', async () => {
      const body = assertSuccess(await fetchJson('/institutions?limit=2'), 'GET /institutions');
      assert.ok(Array.isArray(body.data));
    });

    test('GET /venues', async () => {
      const body = assertSuccess(await fetchJson('/venues?limit=2'), 'GET /venues');
      assert.ok(Array.isArray(body.data));
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

  describe('Metrics (requires access key)', () => {
    test('GET /metrics/annual', { skip: !ACCESS_KEY }, async () => {
      const body = assertSuccess(await fetchJson('/metrics/annual?limit=3'), 'metrics/annual');
      assert.ok(Array.isArray(body.data));
    });

    test('GET /metrics/venues', { skip: !ACCESS_KEY }, async () => {
      const body = assertSuccess(await fetchJson('/metrics/venues?limit=3'), 'metrics/venues');
      assert.ok(Array.isArray(body.data));
    });

    test('GET /metrics/institutions', { skip: !ACCESS_KEY }, async () => {
      const body = assertSuccess(await fetchJson('/metrics/institutions?limit=3'), 'metrics/institutions');
      assert.ok(Array.isArray(body.data));
    });

    test('GET /metrics/persons', { skip: !ACCESS_KEY }, async () => {
      const body = assertSuccess(await fetchJson('/metrics/persons?limit=3'), 'metrics/persons');
      assert.ok(Array.isArray(body.data));
    });

    test('GET /metrics/collaborations', { skip: !ACCESS_KEY }, async () => {
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
