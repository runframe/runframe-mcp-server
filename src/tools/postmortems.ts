import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RunframeClient } from '../client.js';
import { toolError } from '../server.js';

export function registerPostmortemTools(server: McpServer, client: RunframeClient) {

  // ── get ──────────────────────────────────────────────────────────────
  server.registerTool('runframe_get_postmortem', {
    description: 'Get the postmortem for a resolved incident.',
    inputSchema: {
      incident_id: z.string().describe('Incident number (e.g. INC-2026-001) or UUID'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params) => {
    try {
      const data = await client.get(`/api/v1/postmortems?incident_id=${encodeURIComponent(params.incident_id)}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_get_postmortem'); }
  });

  // ── create ───────────────────────────────────────────────────────────
  server.registerTool('runframe_create_postmortem', {
    description: 'Create a post-mortem for a resolved incident. Required fields depend on your org\'s configured level.',
    inputSchema: {
      incident_id: z.string().describe('Incident number (e.g. INC-2026-001) or UUID'),
      summary: z.string().optional().describe('What happened'),
      root_cause: z.string().optional().describe('Root cause analysis'),
      resolution: z.string().optional().describe('How it was fixed'),
      // Nested objects use camelCase to match the Runframe API contract
      impact: z.object({
        duration: z.string().optional(),
        usersAffected: z.string().optional(),
        servicesAffected: z.array(z.string()).optional(),
        revenueImpact: z.string().optional(),
      }).optional().describe('Impact details'),
      timeline: z.array(z.object({
        timestamp: z.string(),
        description: z.string(),
      })).optional().describe('Timeline of events'),
      action_items: z.array(z.object({
        text: z.string(),
        ownerId: z.string().optional(),
        dueDate: z.string().optional(),
        status: z.enum(['pending', 'in_progress', 'completed']).default('pending'),
      })).optional().describe('Follow-up action items'),
      contributing_factors: z.string().optional(),
      detection_path: z.string().optional(),
      monitoring_gaps: z.string().optional(),
      response_timeline: z.object({
        timeToAcknowledge: z.string().optional(),
        timeToIdentify: z.string().optional(),
        timeToResolve: z.string().optional(),
      }).optional(),
      five_whys: z.string().optional(),
      executive_summary: z.string().optional(),
      prevented_recurrence: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async (params) => {
    try {
      // Strip undefined fields — the API ignores unknown keys but shouldn't receive them
      const body = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null)
      );
      const data = await client.post('/api/v1/postmortems', body);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_create_postmortem'); }
  });
}
