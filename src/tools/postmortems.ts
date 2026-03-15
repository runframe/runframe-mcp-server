import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RunframeClient } from '../client.js';
import { toolError } from '../server.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function registerPostmortemTools(server: McpServer, client: RunframeClient) {

  // ── get ──────────────────────────────────────────────────────────────
  server.registerTool('runframe_get_postmortem', {
    description: 'Get the postmortem for a resolved incident.',
    inputSchema: {
      incident_id: z.string().describe('Incident number (e.g. INC-2026-001) or UUID'),
    } as any,
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params: any) => {
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
    } as any,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async (params: any) => {
    try {
      const { incident_id, summary, root_cause, resolution, impact, timeline, action_items, contributing_factors, detection_path, monitoring_gaps, response_timeline, five_whys, executive_summary, prevented_recurrence } = params;
      const body: Record<string, unknown> = { incident_id };
      if (summary != null) body.summary = summary;
      if (root_cause != null) body.root_cause = root_cause;
      if (resolution != null) body.resolution = resolution;
      if (impact != null) body.impact = impact;
      if (timeline != null) body.timeline = timeline;
      if (action_items != null) body.action_items = action_items;
      if (contributing_factors != null) body.contributing_factors = contributing_factors;
      if (detection_path != null) body.detection_path = detection_path;
      if (monitoring_gaps != null) body.monitoring_gaps = monitoring_gaps;
      if (response_timeline != null) body.response_timeline = response_timeline;
      if (five_whys != null) body.five_whys = five_whys;
      if (executive_summary != null) body.executive_summary = executive_summary;
      if (prevented_recurrence != null) body.prevented_recurrence = prevented_recurrence;
      const data = await client.post('/api/v1/postmortems', body);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_create_postmortem'); }
  });
}
