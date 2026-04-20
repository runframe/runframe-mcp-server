//
// 9 incident-management tools registered on the MCP server.
//
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RunframeClient } from '../client.js';
import { toolError } from '../server.js';

const SeveritySchema = z.enum(['SEV0', 'SEV1', 'SEV2', 'SEV3', 'SEV4']);

const CreateIncidentBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).optional(),
  severity: SeveritySchema.optional(),
  service_ids: z.array(z.string().min(1)).min(1).max(50),
}).strict();

const UpdateIncidentBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
  severity: SeveritySchema.optional(),
  assigned_to: z.string().email().optional(),
}).refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  { message: 'At least one field must be provided for update' }
);

export function registerIncidentTools(server: McpServer, client: RunframeClient) {

  // ── list ────────────────────────────────────────────────────────────
  server.registerTool('runframe_list_incidents', {
    description: 'List incidents filtered by status, severity, or team. Returns paginated results.',
    inputSchema: {
      status: z.array(z.string()).optional().describe('Filter by status name. Default statuses: new, investigating, fixing, monitoring, resolved, closed (may vary by organization)'),
      severity: z.array(SeveritySchema).optional().describe('Filter by severity: SEV0-SEV4'),
      assigned_to: z.string().email().optional().describe('Filter by current assignee email'),
      resolved_by: z.string().email().optional().describe('Filter by resolver email'),
      team_name: z.string().min(1).optional().describe('Filter by exact team name'),
      created_after: z.string().datetime().optional().describe('Only incidents created at or after this ISO timestamp'),
      created_before: z.string().datetime().optional().describe('Only incidents created at or before this ISO timestamp'),
      resolved_after: z.string().datetime().optional().describe('Only incidents resolved at or after this ISO timestamp'),
      resolved_before: z.string().datetime().optional().describe('Only incidents resolved at or before this ISO timestamp'),
      limit: z.number().min(1).max(100).default(20).describe('Results per page (max 100)'),
      offset: z.number().min(0).default(0).describe('Pagination offset'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params) => {
    try {
      const query = new URLSearchParams();
      if (params.limit != null) query.set('limit', String(params.limit));
      if (params.offset != null) query.set('offset', String(params.offset));
      params.status?.forEach((s) => query.append('status', s));
      params.severity?.forEach((s) => query.append('severity', s));
      if (params.assigned_to) query.set('assigned_to', params.assigned_to);
      if (params.resolved_by) query.set('resolved_by', params.resolved_by);
      if (params.team_name) query.set('team_name', params.team_name);
      if (params.created_after) query.set('created_after', params.created_after);
      if (params.created_before) query.set('created_before', params.created_before);
      if (params.resolved_after) query.set('resolved_after', params.resolved_after);
      if (params.resolved_before) query.set('resolved_before', params.resolved_before);
      const data = await client.get(`/api/v1/incidents?${query}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_list_incidents'); }
  });

  // ── get ─────────────────────────────────────────────────────────────
  server.registerTool('runframe_get_incident', {
    description: 'Get full incident details including timeline, participants, and affected services.',
    inputSchema: {
      id: z.string().describe('Incident number (e.g. INC-2026-001) or UUID'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params) => {
    try {
      const data = await client.get(`/api/v1/incidents/${encodeURIComponent(params.id)}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_get_incident'); }
  });

  // ── create ──────────────────────────────────────────────────────────
  server.registerTool('runframe_create_incident', {
    description: 'Create a new incident from an alert or detection. Assignment happens automatically based on on-call schedules.',
    inputSchema: {
      title: z.string().min(1).max(200).describe('Incident title (required, 1-200 chars)'),
      description: z.string().max(10000).optional().describe('Detailed description (max 10000 chars)'),
      severity: SeveritySchema.optional().describe('SEV0-SEV4, defaults to SEV2'),
      service_ids: z.array(z.string().min(1)).min(1).max(50).describe('Affected public service keys (for example SER-00001). Discover keys via runframe_list_services. Max 50 items.'),
      idempotency_key: z.string().optional().describe('Optional retry-safe idempotency key for create requests. Same key + same payload replays the original response.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async (params) => {
    try {
      const { idempotency_key, ...rawBody } = params;
      const body = CreateIncidentBodySchema.parse(rawBody);
      const data = await client.post('/api/v1/incidents', body, {
        headers: idempotency_key ? { 'Idempotency-Key': idempotency_key } : undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_create_incident'); }
  });

  // ── update (fields only — use change_incident_status for status transitions) ─
  server.registerTool('runframe_update_incident', {
    description: 'Update incident fields: title, description, severity, or assignment. For status changes use runframe_change_incident_status instead.',
    inputSchema: {
      id: z.string().describe('Incident number (e.g. INC-2026-001) or UUID'),
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(10000).optional(),
      severity: SeveritySchema.optional(),
      assigned_to: z.string().email().optional().describe('Email of engineer to assign'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (params) => {
    try {
      const { id, ...rawBody } = params;
      const body = UpdateIncidentBodySchema.parse(rawBody);
      const data = await client.patch(`/api/v1/incidents/${encodeURIComponent(id)}`, body);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_update_incident'); }
  });

  // ── change status ─────────────────────────────────────────────────────
  server.registerTool('runframe_change_incident_status', {
    description: 'Transition an incident to a new status. Valid statuses: new, investigating, fixing, monitoring, resolved, closed. Validates allowed transitions. For acknowledging (which also auto-assigns and tracks SLA), use runframe_acknowledge_incident instead.',
    inputSchema: {
      id: z.string().describe('Incident number (e.g. INC-2026-001) or UUID'),
      status: z.string().describe('Target status name: new, investigating, fixing, monitoring, resolved, closed'),
      comment: z.string().max(500).optional().describe('Reason for the status change'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    try {
      const { id, ...body } = params;
      const data = await client.post(`/api/v1/incidents/${encodeURIComponent(id)}/status`, body);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_change_incident_status'); }
  });

  // ── acknowledge ─────────────────────────────────────────────────────
  server.registerTool('runframe_acknowledge_incident', {
    description: 'Acknowledge an incident. This is a distinct action from status change: it auto-assigns the incident to you, stamps the acknowledgement time, and resolves the acknowledge SLA. Idempotent — safe to call multiple times.',
    inputSchema: {
      id: z.string().describe('Incident number (e.g. INC-2026-001) or UUID'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (params) => {
    try {
      const data = await client.post(`/api/v1/incidents/${encodeURIComponent(params.id)}/acknowledge`, {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_acknowledge_incident'); }
  });

  // ── add event ───────────────────────────────────────────────────────
  server.registerTool('runframe_add_incident_event', {
    description: 'Add a timeline entry to an incident (log what happened).',
    inputSchema: {
      id: z.string().describe('Incident number (e.g. INC-2026-001) or UUID'),
      message: z.string().describe('What happened'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async (params) => {
    try {
      const { id, ...body } = params;
      const data = await client.post(`/api/v1/incidents/${encodeURIComponent(id)}/events`, body);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_add_incident_event'); }
  });

  // ── escalate ────────────────────────────────────────────────────────
  server.registerTool('runframe_escalate_incident', {
    description: 'Escalate an incident to the next level in the escalation policy. Sends real notifications.',
    inputSchema: {
      id: z.string().describe('Incident number (e.g. INC-2026-001) or UUID'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, async (params) => {
    try {
      const data = await client.post(`/api/v1/incidents/${encodeURIComponent(params.id)}/escalate`, {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_escalate_incident'); }
  });

  // ── page someone ────────────────────────────────────────────────────
  // Urgency is derived from incident severity in the backend — not passed by the caller.
  // To page via both Slack and email, call this tool twice with different channels
  // (same pattern the UI uses).
  server.registerTool('runframe_page_someone', {
    description: 'Page a specific person about an incident. Prefer email as the public identifier, or use user_id when needed. Sends a real notification via the chosen channel. Urgency is automatically derived from incident severity. To notify via both Slack and email, call this tool twice with each channel.',
    inputSchema: {
      incident_id: z.string().describe('Incident number (e.g. INC-2026-001) or UUID'),
      email: z.string().email().optional().describe('Preferred public identifier for the person to page'),
      user_id: z.string().uuid().optional().describe('Internal UUID of the person to page'),
      channel: z.enum(['slack', 'email']).default('slack').describe('Notification channel (default: slack)'),
      message: z.string().max(500).optional().describe('Custom message to include'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, async (params) => {
    try {
      if ((params.email && params.user_id) || (!params.email && !params.user_id)) {
        throw new Error('Provide exactly one of email or user_id');
      }

      const data = await client.post(`/api/v1/incidents/${encodeURIComponent(params.incident_id)}/page`, {
        email: params.email,
        user_id: params.user_id,
        channel: params.channel,
        message: params.message,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_page_someone'); }
  });
}
