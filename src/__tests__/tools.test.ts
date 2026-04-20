//
// Tool execution tests using a mock client that captures HTTP calls.
// Verifies every tool builds the correct URL, method, and request body.
// No network calls.
//
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from '../server.js';
import { RunframeClient } from '../client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// ── Mock client that records calls ───────────────────────────────────────

interface CapturedCall {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

class MockRunframeClient extends RunframeClient {
  calls: CapturedCall[] = [];
  mockResponse: unknown = {};

  constructor() {
    super({ apiKey: 'rf_test_key', apiUrl: 'https://mock.runframe.io' });
  }

  override async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    options?: { headers?: Record<string, string> }
  ): Promise<T> {
    this.calls.push({ method, path, body, headers: options?.headers });
    return this.mockResponse as T;
  }

  reset(response: unknown = {}) {
    this.calls = [];
    this.mockResponse = response;
  }

  lastCall(): CapturedCall {
    return this.calls[this.calls.length - 1];
  }
}

// ── Test helper ──────────────────────────────────────────────────────────

async function setupServer(mockClient: MockRunframeClient) {
  const server = createServer(mockClient as unknown as RunframeClient);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientTransport);
  return { mcpClient: client, server };
}

async function callTool(mcpClient: Client, name: string, args: Record<string, unknown> = {}) {
  return mcpClient.callTool({ name, arguments: args });
}

// ── Incident tools ───────────────────────────────────────────────────────

describe('incident tools', () => {
  let mock: MockRunframeClient;
  let mcpClient: Client;

  beforeEach(async () => {
    mock = new MockRunframeClient();
    mock.reset({ items: [], total: 0, has_more: false, next_offset: null });
    const setup = await setupServer(mock);
    mcpClient = setup.mcpClient;
  });

  describe('runframe_list_incidents', () => {
    it('builds correct URL with no filters', async () => {
      await callTool(mcpClient, 'runframe_list_incidents', {});
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'GET');
      assert.ok(call.path.startsWith('/api/v1/incidents?'));
    });

    it('includes status filters as repeated params', async () => {
      await callTool(mcpClient, 'runframe_list_incidents', {
        status: ['resolved', 'closed'],
      });
      const call = mock.lastCall();
      assert.ok(call.path.includes('status=resolved'));
      assert.ok(call.path.includes('status=closed'));
    });

    it('includes severity filters', async () => {
      await callTool(mcpClient, 'runframe_list_incidents', {
        severity: ['SEV0', 'SEV1'],
      });
      const call = mock.lastCall();
      assert.ok(call.path.includes('severity=SEV0'));
      assert.ok(call.path.includes('severity=SEV1'));
    });

    it('includes team_name filter', async () => {
      const teamName = 'Platform';
      await callTool(mcpClient, 'runframe_list_incidents', { team_name: teamName });
      const call = mock.lastCall();
      assert.ok(call.path.includes('team_name=Platform'));
    });

    it('includes pagination params', async () => {
      await callTool(mcpClient, 'runframe_list_incidents', { limit: 50, offset: 10 });
      const call = mock.lastCall();
      assert.ok(call.path.includes('limit=50'));
      assert.ok(call.path.includes('offset=10'));
    });

    it('includes assignee, resolver, and date range filters', async () => {
      await callTool(mcpClient, 'runframe_list_incidents', {
        assigned_to: 'alex@runframe.io',
        resolved_by: 'casey@runframe.io',
        created_after: '2026-04-01T00:00:00.000Z',
        resolved_before: '2026-04-30T23:59:59.999Z',
      });
      const call = mock.lastCall();
      assert.ok(call.path.includes('assigned_to=alex%40runframe.io'));
      assert.ok(call.path.includes('resolved_by=casey%40runframe.io'));
      assert.ok(call.path.includes('created_after=2026-04-01T00%3A00%3A00.000Z'));
      assert.ok(call.path.includes('resolved_before=2026-04-30T23%3A59%3A59.999Z'));
    });

    it('handles offset=0 correctly (not dropped)', async () => {
      await callTool(mcpClient, 'runframe_list_incidents', { limit: 20, offset: 0 });
      const call = mock.lastCall();
      assert.ok(call.path.includes('offset=0'), `offset=0 should be included but got: ${call.path}`);
    });
  });

  describe('runframe_get_incident', () => {
    it('uses incident number in URL', async () => {
      mock.reset({ id: '123', incident_number: 'INC-2026-001' });
      await callTool(mcpClient, 'runframe_get_incident', { id: 'INC-2026-001' });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'GET');
      assert.strictEqual(call.path, '/api/v1/incidents/INC-2026-001');
    });

    it('encodes special characters in id', async () => {
      mock.reset({});
      await callTool(mcpClient, 'runframe_get_incident', { id: 'test/id' });
      const call = mock.lastCall();
      assert.ok(call.path.includes('test%2Fid'));
    });
  });

  describe('runframe_create_incident', () => {
    it('POSTs to correct endpoint with full body', async () => {
      mock.reset({ id: 'new-id', incident_number: 'INC-2026-033' });
      const serviceKey = 'SER-00001';
      await callTool(mcpClient, 'runframe_create_incident', {
        title: 'Redis Cache Storm',
        description: 'Cache eviction on prod-03',
        severity: 'SEV1',
        service_ids: [serviceKey],
      });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'POST');
      assert.strictEqual(call.path, '/api/v1/incidents');
      assert.strictEqual(call.body?.title, 'Redis Cache Storm');
      assert.strictEqual(call.body?.description, 'Cache eviction on prod-03');
      assert.strictEqual(call.body?.severity, 'SEV1');
      assert.deepStrictEqual(call.body?.service_ids, [serviceKey]);
    });

    it('sends Idempotency-Key header when provided', async () => {
      mock.reset({ id: 'new-id' });
      await callTool(mcpClient, 'runframe_create_incident', {
        title: 'Redis Cache Storm',
        service_ids: ['SER-00001'],
        idempotency_key: 'incident-create-001',
      });
      const call = mock.lastCall();
      assert.strictEqual(call.headers?.['Idempotency-Key'], 'incident-create-001');
      assert.strictEqual(call.body?.idempotency_key, undefined);
    });

    it('rejects more than 50 service_ids before sending request', async () => {
      mock.reset({ id: 'new-id' });
      const result = await callTool(mcpClient, 'runframe_create_incident', {
        title: 'Redis Cache Storm',
        service_ids: Array.from({ length: 51 }, (_, i) => `SER-${String(i + 1).padStart(5, '0')}`),
      });

      assert.strictEqual(result.isError, true);
      assert.strictEqual(mock.calls.length, 0);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      assert.ok(text.includes('50'), text);
    });
  });

  describe('runframe_update_incident', () => {
    it('PATCHes to correct endpoint, excludes id from body', async () => {
      mock.reset({ id: '123' });
      await callTool(mcpClient, 'runframe_update_incident', {
        id: 'INC-2026-001',
        title: 'Updated title',
        severity: 'SEV0',
        assigned_to: 'alex@runframe.io',
      });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'PATCH');
      assert.strictEqual(call.path, '/api/v1/incidents/INC-2026-001');
      assert.strictEqual(call.body?.title, 'Updated title');
      assert.strictEqual(call.body?.severity, 'SEV0');
      assert.strictEqual(call.body?.assigned_to, 'alex@runframe.io');
      assert.strictEqual(call.body?.id, undefined, 'id should not be in body');
    });

    it('rejects empty update payload before sending request', async () => {
      mock.reset({ id: '123' });
      const result = await callTool(mcpClient, 'runframe_update_incident', {
        id: 'INC-2026-001',
      });

      assert.strictEqual(result.isError, true);
      assert.strictEqual(mock.calls.length, 0);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      assert.ok(text.includes('At least one field must be provided for update'), text);
    });
  });

  describe('runframe_change_incident_status', () => {
    it('POSTs status and comment, excludes id from body', async () => {
      mock.reset({ id: '123', status: 'Investigating' });
      await callTool(mcpClient, 'runframe_change_incident_status', {
        id: 'INC-2026-001',
        status: 'investigating',
        comment: 'Looking into it',
      });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'POST');
      assert.strictEqual(call.path, '/api/v1/incidents/INC-2026-001/status');
      assert.strictEqual(call.body?.status, 'investigating');
      assert.strictEqual(call.body?.comment, 'Looking into it');
      assert.strictEqual(call.body?.id, undefined);
    });
  });

  describe('runframe_acknowledge_incident', () => {
    it('POSTs to acknowledge endpoint with empty body', async () => {
      mock.reset({ acknowledged: true });
      await callTool(mcpClient, 'runframe_acknowledge_incident', { id: 'INC-2026-001' });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'POST');
      assert.strictEqual(call.path, '/api/v1/incidents/INC-2026-001/acknowledge');
      assert.deepStrictEqual(call.body, {});
    });
  });

  describe('runframe_add_incident_event', () => {
    it('POSTs comment to events endpoint, excludes id from body', async () => {
      mock.reset({ event_id: 'evt-1' });
      await callTool(mcpClient, 'runframe_add_incident_event', {
        id: 'INC-2026-001',
        comment: 'Root cause identified: memory leak in worker pool',
      });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'POST');
      assert.strictEqual(call.path, '/api/v1/incidents/INC-2026-001/events');
      assert.strictEqual(call.body?.comment, 'Root cause identified: memory leak in worker pool');
      assert.strictEqual(call.body?.id, undefined);
    });
  });

  describe('runframe_escalate_incident', () => {
    it('POSTs to escalate endpoint with empty body', async () => {
      mock.reset({ escalated: true });
      await callTool(mcpClient, 'runframe_escalate_incident', { id: 'INC-2026-001' });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'POST');
      assert.strictEqual(call.path, '/api/v1/incidents/INC-2026-001/escalate');
      assert.deepStrictEqual(call.body, {});
    });
  });

  describe('runframe_page_someone', () => {
    it('POSTs to page endpoint with email, channels, and message', async () => {
      mock.reset({ sent: true });
      await callTool(mcpClient, 'runframe_page_someone', {
        incident_id: 'INC-2026-001',
        email: 'alex@runframe.io',
        channels: ['email'],
        message: 'Need eyes on this ASAP',
      });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'POST');
      assert.strictEqual(call.path, '/api/v1/incidents/INC-2026-001/page');
      assert.strictEqual(call.body?.email, 'alex@runframe.io');
      assert.deepStrictEqual(call.body?.channels, ['email']);
      assert.strictEqual(call.body?.message, 'Need eyes on this ASAP');
    });

    it('supports multiple delivery channels', async () => {
      mock.reset({ sent: true });
      await callTool(mcpClient, 'runframe_page_someone', {
        incident_id: 'INC-2026-001',
        email: 'alex@runframe.io',
        channels: ['slack', 'email'],
      });
      const call = mock.lastCall();
      assert.deepStrictEqual(call.body?.channels, ['slack', 'email']);
    });
  });
});

// ── On-call tools ────────────────────────────────────────────────────────

describe('oncall tools', () => {
  let mock: MockRunframeClient;
  let mcpClient: Client;

  beforeEach(async () => {
    mock = new MockRunframeClient();
    mock.reset({ on_call: { services: [] } });
    const setup = await setupServer(mock);
    mcpClient = setup.mcpClient;
  });

  describe('runframe_get_current_oncall', () => {
    it('calls correct endpoint with no team filter', async () => {
      await callTool(mcpClient, 'runframe_get_current_oncall', {});
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'GET');
      assert.ok(call.path.startsWith('/api/v1/on-call/current'));
    });

    it('includes team_name when provided', async () => {
      const teamName = 'Platform';
      await callTool(mcpClient, 'runframe_get_current_oncall', { team_name: teamName });
      const call = mock.lastCall();
      assert.ok(call.path.includes(`team_name=${encodeURIComponent(teamName)}`));
    });

    it('returns the latest snake_case on-call payload unchanged', async () => {
      mock.reset({
        timestamp: '2026-04-19T12:30:00.000Z',
        summary: {
          total_services: 1,
          services_with_coverage: 1,
          services_without_coverage: 0,
          coverage_percentage: 100,
        },
        services: [{
          service_key: 'SER-00001',
          service_name: 'Payments API',
          service_description: null,
          team_name: 'Platform',
          team_description: null,
          on_call_engineers: [],
          has_coverage: true,
          primary_on_call: null,
          schedule_names: [],
        }],
      });

      const result = await callTool(mcpClient, 'runframe_get_current_oncall', {});
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      const parsed = JSON.parse(text);
      assert.strictEqual(parsed.summary.total_services, 1);
      assert.strictEqual(parsed.services[0].service_key, 'SER-00001');
      assert.strictEqual(parsed.services[0].has_coverage, true);
    });
  });
});

// ── Service tools ────────────────────────────────────────────────────────

describe('service tools', () => {
  let mock: MockRunframeClient;
  let mcpClient: Client;

  beforeEach(async () => {
    mock = new MockRunframeClient();
    mock.reset({ items: [], total: 0 });
    const setup = await setupServer(mock);
    mcpClient = setup.mcpClient;
  });

  describe('runframe_list_services', () => {
    it('builds correct URL with search param', async () => {
      await callTool(mcpClient, 'runframe_list_services', { search: 'payment' });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'GET');
      assert.ok(call.path.includes('search=payment'));
    });

    it('handles offset=0 correctly', async () => {
      await callTool(mcpClient, 'runframe_list_services', { limit: 10, offset: 0 });
      const call = mock.lastCall();
      assert.ok(call.path.includes('offset=0'));
    });
  });

  describe('runframe_get_service', () => {
    it('GETs service by public service_key', async () => {
      mock.reset({ service_key: 'SER-00001', name: 'Payment API' });
      const serviceKey = 'SER-00001';
      await callTool(mcpClient, 'runframe_get_service', { id: serviceKey });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'GET');
      assert.strictEqual(call.path, `/api/v1/services/${serviceKey}`);
    });
  });
});

// ── Postmortem tools ─────────────────────────────────────────────────────

describe('postmortem tools', () => {
  let mock: MockRunframeClient;
  let mcpClient: Client;

  beforeEach(async () => {
    mock = new MockRunframeClient();
    mock.reset({});
    const setup = await setupServer(mock);
    mcpClient = setup.mcpClient;
  });

  describe('runframe_get_postmortem', () => {
    it('GETs postmortem with incident_number query param', async () => {
      await callTool(mcpClient, 'runframe_get_postmortem', { incident_number: 'INC-2026-012' });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'GET');
      assert.strictEqual(call.path, '/api/v1/postmortems?incident_number=INC-2026-012');
    });
  });

  describe('runframe_create_postmortem', () => {
    it('POSTs full postmortem with all fields', async () => {
      mock.reset({ id: 'pm-1' });
      await callTool(mcpClient, 'runframe_create_postmortem', {
        incident_number: 'INC-2026-012',
        summary: 'Payment outage for 20 minutes',
        root_cause: 'Connection pool exhausted',
        resolution: 'Restarted connection pool, deployed fix',
        impact: {
          duration: '20 minutes',
          users_affected: '500 users',
          services_affected: ['Checkout API'],
          revenue_impact: '$2000',
        },
        timeline: [
          { timestamp: '2026-03-14T15:00:00Z', description: 'Alert fired' },
          { timestamp: '2026-03-14T15:20:00Z', description: 'Resolved' },
        ],
        action_items: [
          { text: 'Add connection pool monitoring', owner_email: 'owner@example.com', due_date: '2026-04-30', status: 'pending' },
        ],
        contributing_factors: 'No alerting on pool size',
        detection_path: 'Synthetic monitor',
        monitoring_gaps: 'Missing pool saturation alert',
        response_timeline: {
          time_to_acknowledge: '2m',
          time_to_identify: '5m',
          time_to_resolve: '20m',
        },
        five_whys: 'Why? Because pool was exhausted.',
        executive_summary: 'Brief outage, fast recovery.',
      });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'POST');
      assert.strictEqual(call.path, '/api/v1/postmortems');
      assert.strictEqual(call.body?.incident_number, 'INC-2026-012');
      assert.strictEqual(call.body?.summary, 'Payment outage for 20 minutes');
      assert.strictEqual(call.body?.root_cause, 'Connection pool exhausted');
      assert.ok(Array.isArray(call.body?.timeline));
      assert.ok(Array.isArray(call.body?.action_items));
      assert.strictEqual(call.body?.action_items?.[0]?.owner_email, 'owner@example.com');
    });

    it('works with incident_number only (minimum)', async () => {
      mock.reset({ id: 'pm-2' });
      await callTool(mcpClient, 'runframe_create_postmortem', { incident_number: 'INC-2026-012' });
      const call = mock.lastCall();
      assert.strictEqual(call.body?.incident_number, 'INC-2026-012');
    });
  });
});

// ── Team tools ───────────────────────────────────────────────────────────

describe('team tools', () => {
  let mock: MockRunframeClient;
  let mcpClient: Client;

  beforeEach(async () => {
    mock = new MockRunframeClient();
    mock.reset({ items: [] });
    const setup = await setupServer(mock);
    mcpClient = setup.mcpClient;
  });

  describe('runframe_list_teams', () => {
    it('includes search when provided', async () => {
      await callTool(mcpClient, 'runframe_list_teams', { search: 'platform' });
      const call = mock.lastCall();
      assert.ok(call.path.includes('search=platform'));
    });

    it('GETs teams with pagination', async () => {
      await callTool(mcpClient, 'runframe_list_teams', { limit: 50, offset: 10 });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'GET');
      assert.ok(call.path.includes('limit=50'));
      assert.ok(call.path.includes('offset=10'));
    });

    it('handles offset=0', async () => {
      await callTool(mcpClient, 'runframe_list_teams', { offset: 0 });
      const call = mock.lastCall();
      assert.ok(call.path.includes('offset=0'));
    });
  });

  describe('runframe_get_escalation_policy', () => {
    it('GETs escalation policy with severity', async () => {
      mock.reset({ policy: { levels: [] } });
      await callTool(mcpClient, 'runframe_get_escalation_policy', { severity: 'SEV1' });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'GET');
      assert.strictEqual(call.path, '/api/v1/escalation-policies?severity=SEV1');
    });
  });
});

// ── User tools ───────────────────────────────────────────────────────────

describe('user tools', () => {
  let mock: MockRunframeClient;
  let mcpClient: Client;

  beforeEach(async () => {
    mock = new MockRunframeClient();
    mock.reset({ items: [], total: 0, has_more: false, next_offset: null });
    const setup = await setupServer(mock);
    mcpClient = setup.mcpClient;
  });

  describe('runframe_find_user', () => {
    it('GETs users with search and pagination defaults', async () => {
      await callTool(mcpClient, 'runframe_find_user', { search: 'alex' });
      const call = mock.lastCall();
      assert.strictEqual(call.method, 'GET');
      assert.ok(call.path.startsWith('/api/v1/users?'));
      assert.ok(call.path.includes('search=alex'));
      assert.ok(call.path.includes('is_active=true'));
      assert.ok(call.path.includes('limit=10'));
      assert.ok(call.path.includes('offset=0'));
    });

    it('can include inactive users for historical email lookups', async () => {
      await callTool(mcpClient, 'runframe_find_user', {
        search: 'alex',
        include_inactive: true,
        limit: 100,
      });
      const call = mock.lastCall();
      assert.ok(call.path.includes('search=alex'));
      assert.ok(!call.path.includes('is_active=true'));
      assert.ok(call.path.includes('limit=100'));
    });

    it('passes is_active when provided', async () => {
      await callTool(mcpClient, 'runframe_find_user', { search: 'alex', is_active: false, limit: 100 });
      const call = mock.lastCall();
      assert.ok(call.path.includes('is_active=false'));
      assert.ok(call.path.includes('limit=100'));
    });
  });
});

// ── Error handling across tools ──────────────────────────────────────────

describe('tool error handling', () => {
  it('returns isError when API call fails', async () => {
    const mock = new MockRunframeClient();
    // Override request to throw
    mock.request = async () => { throw new Error('Network failure'); };
    const server = createServer(mock as unknown as RunframeClient);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const mcpClient = new Client({ name: 'test', version: '1.0.0' });
    await mcpClient.connect(clientTransport);

    const result = await callTool(mcpClient, 'runframe_list_incidents', {});
    assert.strictEqual(result.isError, true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(text.includes('Network failure'));

    await mcpClient.close();
    await server.close();
  });
});

// ── Response format ──────────────────────────────────────────────────────

describe('response format', () => {
  it('returns JSON-stringified data in text content', async () => {
    const mock = new MockRunframeClient();
    const mockData = { id: '123', title: 'Test Incident', status: 'New' };
    mock.reset(mockData);
    const server = createServer(mock as unknown as RunframeClient);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const mcpClient = new Client({ name: 'test', version: '1.0.0' });
    await mcpClient.connect(clientTransport);

    const result = await callTool(mcpClient, 'runframe_get_incident', { id: 'INC-2026-001' });
    assert.strictEqual(result.isError, undefined);
    const content = result.content as Array<{ type: string; text: string }>;
    assert.strictEqual(content[0].type, 'text');
    const parsed = JSON.parse(content[0].text);
    assert.strictEqual(parsed.id, '123');
    assert.strictEqual(parsed.title, 'Test Incident');

    await mcpClient.close();
    await server.close();
  });
});
