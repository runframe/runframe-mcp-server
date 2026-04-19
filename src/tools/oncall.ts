import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RunframeClient } from '../client.js';
import { toolError } from '../server.js';

export function registerOncallTools(server: McpServer, client: RunframeClient) {
  server.registerTool('runframe_get_current_oncall', {
    description: 'Get the current on-call coverage.',
    inputSchema: {
      team_id: z.string().uuid().optional().describe('Filter by team. If omitted, returns on-call for all teams.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params) => {
    try {
      const query = new URLSearchParams();
      if (params.team_id) query.set('team_id', params.team_id);
      const data = await client.get(`/api/v1/on-call/current?${query}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_get_current_oncall'); }
  });
}
