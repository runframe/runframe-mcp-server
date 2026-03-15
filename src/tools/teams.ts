import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RunframeClient } from '../client.js';
import { toolError } from '../server.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function registerTeamTools(server: McpServer, client: RunframeClient) {
  server.registerTool('runframe_list_teams', {
    description: 'List all teams in your organization.',
    inputSchema: {
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    } as any,
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params: any) => {
    try {
      const query = new URLSearchParams();
      if (params.limit != null) query.set('limit', String(params.limit));
      if (params.offset != null) query.set('offset', String(params.offset));
      const data = await client.get(`/api/v1/teams?${query}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_list_teams'); }
  });

  server.registerTool('runframe_get_escalation_policy', {
    description: 'Get the escalation policy for a team.',
    inputSchema: {
      team_id: z.string().uuid().describe('Team UUID'),
    } as any,
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params: any) => {
    try {
      const data = await client.get(`/api/v1/escalation-policies?team_id=${encodeURIComponent(params.team_id)}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_get_escalation_policy'); }
  });
}
