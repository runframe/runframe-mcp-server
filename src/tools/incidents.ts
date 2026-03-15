//
// 9 incident-management tools registered on the MCP server (resolve removed; change_incident_status added).
// Schemas are cast to `any` in the inputSchema config to prevent TS2589
// (excessive type-instantiation depth) from the SDK's dual Zod v3/v4 compat layer.
// Runtime validation still works — the SDK validates inputs against these schemas at call time.
//
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RunframeClient } from '../client.js';
import { toolError } from '../server.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function registerIncidentTools(server: McpServer, client: RunframeClient) {

  // ── list ────────────────────────────────────────────────────────────
  server.registerTool('runframe_list_incidents', {
    description: 'List incidents filtered by status, severity, or team. Returns paginated results.',
    inputSchema: {
      status: z.array(z.string()).optional().describe('Filter by status name. Default statuses: new, investigating, fixing, resolved, closed (may vary by organization)'),
      severity: z.array(z.string()).optional().describe('Filter by severity: SEV0-SEV4'),
      team_id: z.string().uuid().optional().describe('Filter by team UUID'),
      limit: z.number().min(1).max(100).default(20).describe('Results per page (max 100)'),
      offset: z.number().min(0).default(0).describe('Pagination offset'),
    } as any,
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params: any) => {
    try {
      const query = new URLSearchParams();
      if (params.limit != null) query.set('limit', String(params.limit));
      if (params.offset != null) query.set('offset', String(params.offset));
      params.status?.forEach((s: string) => query.append('status', s));
      params.severity?.forEach((s: string) => query.append('severity', s));
      if (params.team_id) query.set('team_id', params.team_id);
      const data = await client.get(`/api/v1/incidents?${query}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_list_incidents'); }
  });

  // ── get ─────────────────────────────────────────────────────────────
  server.registerTool('runframe_get_incident', {
    description: 'Get full incident details including timeline, participants, and affected services.',
    inputSchema: {
      id: z.string().describe('Incident number (e.g. INC-2026-001) or UUID'),
    } as any,
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params: any) => {
    try {
      const data = await client.get(`/api/v1/incidents/${encodeURIComponent(params.id)}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_get_incident'); }
  });

  // ── create ──────────────────────────────────────────────────────────
  server.registerTool('runframe_create_incident', {
    description: 'Create a new incident from an alert or detection. Assignment happens automatically based on on-call schedules.',
    inputSchema: {
      title: z.string().max(200).describe('Incident title (required, max 200 chars)'),
      description: z.string().optional().describe('Detailed description'),
      severity: z.string().optional().describe('SEV0-SEV4, defaults to org setting'),
      team_id: z.string().uuid().optional().describe('Owning team UUID'),
      service_ids: z.array(z.string().uuid()).optional().describe('Affected service UUIDs'),
    } as any,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async (params: any) => {
    try {
      const data = await client.post('/api/v1/incidents', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_create_incident'); }
  });

  // ── update (fields only — use change_incident_status for status transitions) ─
  server.registerTool('runframe_update_incident', {
    description: 'Update incident fields: title, description, severity, or assignment. For status changes use runframe_change_incident_status instead.',
    inputSchema: {
      id: z.string().describe('Incident number (e.g. INC-2026-001) or UUID'),
      title: z.string().max(200).optional(),
      description: z.string().optional(),
      severity: z.string().optional(),
      assigned_to: z.string().uuid().optional(),
    } as any,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (params: any) => {
    try {
      const { id, ...body } = params;
      const data = await client.patch(`/api/v1/incidents/${encodeURIComponent(id)}`, body);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_update_incident'); }
  });

  // ── change status ─────────────────────────────────────────────────────
  server.registerTool('runframe_change_incident_status', {
    description: 'Transition an incident to a new status. Valid statuses: new, investigating, fixing, resolved, closed. Validates allowed transitions. For acknowledging (which also auto-assigns and tracks SLA), use runframe_acknowledge_incident instead.',
    inputSchema: {
      id: z.string().describe('Incident number (e.g. INC-2026-001) or UUID'),
      status: z.string().describe('Target status name: new, investigating, fixing, resolved, closed'),
      comment: z.string().max(500).optional().describe('Reason for the status change'),
    } as any,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params: any) => {
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
    } as any,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (params: any) => {
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
    } as any,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async (params: any) => {
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
    } as any,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, async (params: any) => {
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
    description: 'Page a specific person about an incident. Sends a real notification via the chosen channel. Urgency is automatically derived from incident severity. To notify via both Slack and email, call this tool twice with each channel.',
    inputSchema: {
      incident_id: z.string().describe('Incident number (e.g. INC-2026-001) or UUID'),
      user_id: z.string().uuid().describe('UUID of person to page'),
      channel: z.enum(['slack', 'email']).default('slack').describe('Notification channel (default: slack)'),
      message: z.string().max(500).optional().describe('Custom message to include'),
    } as any,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, async (params: any) => {
    try {
      const data = await client.post(`/api/v1/incidents/${encodeURIComponent(params.incident_id)}/page`, {
        user_id: params.user_id,
        channel: params.channel,
        message: params.message,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_page_someone'); }
  });
}
