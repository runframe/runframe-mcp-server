//
// Tests proving HTTP transport security hardening is deliberate:
// method filtering, auth rejection, Host/Origin validation, body size limits,
// multi-token rotation, and error message safety.
//
// Each suite starts and stops its own server to avoid port leaks.
//
import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import type { Server } from 'node:http';
import { createServer as createMcpServer } from '../server.js';
import { RunframeClient } from '../client.js';
import { startHttp } from '../transports/http.js';

const TEST_TOKEN = 'test_secure_token_abcdef123456';
const TEST_HOST = '127.0.0.1';

async function startTestServer(token: string = TEST_TOKEN): Promise<{ port: number; server: Server }> {
  const client = new RunframeClient({ apiKey: 'rf_test', apiUrl: 'https://example.com' });
  const port = 10000 + Math.floor(Math.random() * 50000);
  const server = await startHttp(() => createMcpServer(client), port, TEST_HOST, token);
  return { port, server };
}

function makeRequest(port: number, options: {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Request timed out')), 5000);
    const req = http.request({
      hostname: TEST_HOST,
      port,
      method: options.method ?? 'POST',
      path: options.path ?? '/mcp',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { clearTimeout(timeout); resolve({ status: res.statusCode ?? 0, body: data }); });
    });
    req.on('error', (err) => { clearTimeout(timeout); reject(err); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

describe('HTTP method filtering', async () => {
  const { port, server } = await startTestServer();
  after(() => server.close());

  it('rejects PUT with 405', async () => {
    const res = await makeRequest(port, { method: 'PUT', headers: { Authorization: `Bearer ${TEST_TOKEN}` } });
    assert.strictEqual(res.status, 405);
  });

  it('rejects PATCH with 405', async () => {
    const res = await makeRequest(port, { method: 'PATCH', headers: { Authorization: `Bearer ${TEST_TOKEN}` } });
    assert.strictEqual(res.status, 405);
  });

  it('rejects OPTIONS with 405', async () => {
    const res = await makeRequest(port, { method: 'OPTIONS', headers: { Authorization: `Bearer ${TEST_TOKEN}` } });
    assert.strictEqual(res.status, 405);
  });
});

describe('HTTP auth rejection', async () => {
  const { port, server } = await startTestServer();
  after(() => server.close());

  it('rejects missing auth with 401', async () => {
    const res = await makeRequest(port, { headers: {} });
    assert.strictEqual(res.status, 401);
  });

  it('rejects wrong token with 401', async () => {
    const res = await makeRequest(port, { headers: { Authorization: `Bearer ${'x'.repeat(TEST_TOKEN.length)}` } });
    assert.strictEqual(res.status, 401);
  });

  it('rejects short token with 401', async () => {
    const res = await makeRequest(port, { headers: { Authorization: 'Bearer short' } });
    assert.strictEqual(res.status, 401);
  });

  it('rejects Basic auth with 401', async () => {
    const res = await makeRequest(port, { headers: { Authorization: 'Basic dXNlcjpwYXNz' } });
    assert.strictEqual(res.status, 401);
  });

  it('rejects empty Bearer with 401', async () => {
    const res = await makeRequest(port, { headers: { Authorization: 'Bearer ' } });
    assert.strictEqual(res.status, 401);
  });
});

describe('HTTP path validation', async () => {
  const { port, server } = await startTestServer();
  after(() => server.close());

  it('rejects non-/mcp paths with 404', async () => {
    const res = await makeRequest(port, { path: '/api/v1/incidents', headers: { Authorization: `Bearer ${TEST_TOKEN}` } });
    assert.strictEqual(res.status, 404);
  });

  it('rejects root path with 404', async () => {
    const res = await makeRequest(port, { path: '/', headers: { Authorization: `Bearer ${TEST_TOKEN}` } });
    assert.strictEqual(res.status, 404);
  });
});

describe('HTTP Host header validation', async () => {
  const { port, server } = await startTestServer();
  after(() => server.close());

  it('rejects non-local Host with 403', async () => {
    const res = await makeRequest(port, { headers: { Authorization: `Bearer ${TEST_TOKEN}`, Host: 'evil.com:1234' } });
    assert.strictEqual(res.status, 403);
  });

  it('allows localhost Host', async () => {
    const res = await makeRequest(port, { headers: { Authorization: `Bearer ${TEST_TOKEN}`, Host: `localhost:${port}` } });
    assert.notStrictEqual(res.status, 403);
  });

  it('allows 127.0.0.1 Host', async () => {
    const res = await makeRequest(port, { headers: { Authorization: `Bearer ${TEST_TOKEN}`, Host: `127.0.0.1:${port}` } });
    assert.notStrictEqual(res.status, 403);
  });
});

describe('HTTP Origin header validation', async () => {
  const { port, server } = await startTestServer();
  after(() => server.close());

  it('rejects non-local Origin with 403', async () => {
    const res = await makeRequest(port, { headers: { Authorization: `Bearer ${TEST_TOKEN}`, Origin: 'https://evil.com' } });
    assert.strictEqual(res.status, 403);
  });

  it('rejects malformed Origin with 403', async () => {
    const res = await makeRequest(port, { headers: { Authorization: `Bearer ${TEST_TOKEN}`, Origin: 'not-a-url' } });
    assert.strictEqual(res.status, 403);
  });

  it('allows localhost Origin', async () => {
    const res = await makeRequest(port, { headers: { Authorization: `Bearer ${TEST_TOKEN}`, Origin: 'http://localhost:3000' } });
    assert.notStrictEqual(res.status, 403);
  });
});

describe('HTTP body size limit', async () => {
  const { port, server } = await startTestServer();
  after(() => server.close());

  it('rejects oversized Content-Length with 413', async () => {
    const res = await makeRequest(port, { headers: { Authorization: `Bearer ${TEST_TOKEN}`, 'Content-Length': '2000000' }, body: '{}' });
    assert.strictEqual(res.status, 413);
  });
});

describe('HTTP error message safety', async () => {
  const { port, server } = await startTestServer();
  after(() => server.close());

  it('does not leak token in 401 response', async () => {
    const wrong = 'y'.repeat(TEST_TOKEN.length);
    const res = await makeRequest(port, { headers: { Authorization: `Bearer ${wrong}` } });
    assert.strictEqual(res.status, 401);
    assert.ok(!res.body.includes(TEST_TOKEN));
    assert.ok(!res.body.includes(wrong));
  });

  it('does not leak stack traces', async () => {
    const res = await makeRequest(port, { headers: { Authorization: `Bearer ${TEST_TOKEN}` }, body: 'not-json' });
    assert.ok(!res.body.includes('at '));
    assert.ok(!res.body.includes('node_modules'));
  });
});

describe('HTTP multi-token rotation', async () => {
  const TOKEN_OLD = 'old_rotation_token_abcdef';
  const TOKEN_NEW = 'new_rotation_token_abcdef';
  const { port, server } = await startTestServer(`${TOKEN_NEW},${TOKEN_OLD}`);
  after(() => server.close());

  it('accepts new token', async () => {
    const res = await makeRequest(port, { headers: { Authorization: `Bearer ${TOKEN_NEW}` } });
    assert.notStrictEqual(res.status, 401);
  });

  it('accepts old token during rotation', async () => {
    const res = await makeRequest(port, { headers: { Authorization: `Bearer ${TOKEN_OLD}` } });
    assert.notStrictEqual(res.status, 401);
  });

  it('rejects invalid token', async () => {
    const res = await makeRequest(port, { headers: { Authorization: 'Bearer invalid_token_xxxxxxx' } });
    assert.strictEqual(res.status, 401);
  });
});
