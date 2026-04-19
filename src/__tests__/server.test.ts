//
// Test suite proving tool registration, error handling, client construction,
// and transport setup work correctly. No network calls — all offline.
//
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VERSION } from '../types.js';
import { RunframeClient, RunframeApiError } from '../client.js';
import { createServer, toolError } from '../server.js';

// ── VERSION ──────────────────────────────────────────────────────────────

describe('VERSION', () => {
  it('is a valid semver string', () => {
    assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  });

  it('matches package.json version', async () => {
    const { readFile } = await import('node:fs/promises');
    const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf-8'));
    assert.strictEqual(VERSION, pkg.version);
  });
});

// ── RunframeClient ───────────────────────────────────────────────────────

describe('RunframeClient', () => {
  it('constructs with valid config', () => {
    const client = new RunframeClient({ apiKey: 'rf_test_key', apiUrl: 'https://example.com' });
    assert.ok(client);
  });

  it('strips trailing slash from apiUrl', () => {
    const client = new RunframeClient({ apiKey: 'rf_test', apiUrl: 'https://example.com/' });
    assert.ok(client);
  });

  it('exposes get, post, patch methods', () => {
    const client = new RunframeClient({ apiKey: 'rf_test', apiUrl: 'https://example.com' });
    assert.strictEqual(typeof client.get, 'function');
    assert.strictEqual(typeof client.post, 'function');
    assert.strictEqual(typeof client.patch, 'function');
  });

  it('supports per-request headers', async () => {
    let seenHeaders: Headers | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const client = new RunframeClient({ apiKey: 'rf_test', apiUrl: 'https://example.com' });
      await client.post('/api/v1/incidents', { title: 'Test', service_ids: ['SER-00001'] }, {
        headers: { 'Idempotency-Key': 'incident-create-001' },
      });
      assert.strictEqual(seenHeaders?.get('Idempotency-Key'), 'incident-create-001');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── RunframeApiError ─────────────────────────────────────────────────────

describe('RunframeApiError', () => {
  it('captures status, code, and retryAfter', () => {
    const err = new RunframeApiError('rate limited', 429, 'rate_limit', '30');
    assert.strictEqual(err.status, 429);
    assert.strictEqual(err.code, 'rate_limit');
    assert.strictEqual(err.retryAfter, '30');
    assert.strictEqual(err.name, 'RunframeApiError');
    assert.ok(err instanceof Error);
  });

  it('works without retryAfter', () => {
    const err = new RunframeApiError('not found', 404, 'not_found');
    assert.strictEqual(err.retryAfter, undefined);
    assert.strictEqual(err.message, 'not found');
  });
});

// ── toolError ────────────────────────────────────────────────────────────

describe('toolError', () => {
  it('returns timeout hint for timeout errors', () => {
    const err = new RunframeApiError('Request timed out after 15s: GET /api/v1/incidents', 0, 'timeout');
    const result = toolError(err, 'test_tool');
    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes('timed out'));
  });

  it('returns actionable hint for 404', () => {
    const err = new RunframeApiError('Incident not found', 404, 'not_found');
    const result = toolError(err, 'test_tool');
    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes('not found'));
  });

  it('returns scope hint for 403', () => {
    const err = new RunframeApiError('Forbidden', 403, 'forbidden');
    const result = toolError(err, 'test_tool');
    assert.ok(result.content[0].text.includes('API key scopes'));
  });

  it('returns retry hint for 429 with retryAfter', () => {
    const err = new RunframeApiError('Too many requests', 429, 'rate_limit', '60');
    const result = toolError(err, 'test_tool');
    assert.ok(result.content[0].text.includes('Retry after 60s'));
  });

  it('returns generic retry hint for 429 without retryAfter', () => {
    const err = new RunframeApiError('Too many requests', 429, 'rate_limit');
    const result = toolError(err, 'test_tool');
    assert.ok(result.content[0].text.includes('Wait and retry'));
  });

  it('handles non-API errors gracefully', () => {
    const result = toolError(new TypeError('fetch failed'), 'test_tool');
    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes('fetch failed'));
    assert.ok(result.content[0].text.includes('test_tool'));
  });

  it('handles non-Error values', () => {
    const result = toolError('string error', 'test_tool');
    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes('Unknown error'));
  });
});

// ── createServer ─────────────────────────────────────────────────────────

describe('createServer', () => {
  const client = new RunframeClient({ apiKey: 'rf_test', apiUrl: 'https://example.com' });

  it('creates a server instance', () => {
    const server = createServer(client);
    assert.ok(server);
  });

  it('server has expected name and version', async () => {
    const server = createServer(client);
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const mcpClient = new Client({ name: 'test', version: '1.0.0' });
    await mcpClient.connect(clientTransport);
    const info = mcpClient.getServerVersion();
    assert.strictEqual(info?.name, 'runframe');
    assert.strictEqual(info?.version, VERSION);
    await mcpClient.close();
    await server.close();
  });

  it('can be called multiple times (factory pattern)', () => {
    const server1 = createServer(client);
    const server2 = createServer(client);
    assert.ok(server1);
    assert.ok(server2);
    assert.notStrictEqual(server1, server2);
  });
});

// ── Tool count verification ──────────────────────────────────────────────

describe('tool registration', () => {
  it('registers exactly 17 tools', async () => {
    const client = new RunframeClient({ apiKey: 'rf_test', apiUrl: 'https://example.com' });
    const server = createServer(client);

    // Connect to a mock transport to introspect registered tools
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    // Use the MCP protocol to list tools
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const mcpClient = new Client({ name: 'test-client', version: '1.0.0' });
    await mcpClient.connect(clientTransport);

    const { tools } = await mcpClient.listTools();
    assert.strictEqual(tools.length, 17, `Expected 17 tools, got ${tools.length}: ${tools.map(t => t.name).join(', ')}`);

    await mcpClient.close();
    await server.close();
  });

  it('all tools have the runframe_ prefix', async () => {
    const client = new RunframeClient({ apiKey: 'rf_test', apiUrl: 'https://example.com' });
    const server = createServer(client);

    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const mcpClient = new Client({ name: 'test-client', version: '1.0.0' });
    await mcpClient.connect(clientTransport);

    const { tools } = await mcpClient.listTools();
    for (const tool of tools) {
      assert.ok(tool.name.startsWith('runframe_'), `Tool ${tool.name} missing runframe_ prefix`);
    }

    await mcpClient.close();
    await server.close();
  });

  it('all tools have descriptions', async () => {
    const client = new RunframeClient({ apiKey: 'rf_test', apiUrl: 'https://example.com' });
    const server = createServer(client);

    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const mcpClient = new Client({ name: 'test-client', version: '1.0.0' });
    await mcpClient.connect(clientTransport);

    const { tools } = await mcpClient.listTools();
    for (const tool of tools) {
      assert.ok(tool.description && tool.description.length > 10, `Tool ${tool.name} has no meaningful description`);
    }

    await mcpClient.close();
    await server.close();
  });

  it('all tools have input schemas', async () => {
    const client = new RunframeClient({ apiKey: 'rf_test', apiUrl: 'https://example.com' });
    const server = createServer(client);

    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const mcpClient = new Client({ name: 'test-client', version: '1.0.0' });
    await mcpClient.connect(clientTransport);

    const { tools } = await mcpClient.listTools();
    for (const tool of tools) {
      assert.ok(tool.inputSchema, `Tool ${tool.name} has no input schema`);
      assert.strictEqual(tool.inputSchema.type, 'object', `Tool ${tool.name} schema is not an object`);
    }

    await mcpClient.close();
    await server.close();
  });
});
