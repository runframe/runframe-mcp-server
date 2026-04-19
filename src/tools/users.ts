import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RunframeClient } from '../client.js';
import { toolError } from '../server.js';

export function registerUserTools(server: McpServer, client: RunframeClient) {
  server.registerTool('runframe_find_user', {
    description: 'Search users by name or email so agents can resolve a person before filtering incidents by assignee or resolver.',
    inputSchema: {
      search: z.string().min(1).describe('Name or email search string'),
      include_inactive: z.boolean().default(false).describe('Include inactive users in search results for historical assignee or resolver lookups'),
      is_active: z.boolean().optional().describe('Optional active-state filter. Omit to search both active and inactive users.'),
      limit: z.number().min(1).max(100).default(10).describe('Maximum matches to return (default 10, max 100)'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params) => {
    try {
      const query = new URLSearchParams();
      query.set('search', params.search);
      query.set('limit', String(params.limit ?? 10));
      query.set('offset', '0');
      if (params.is_active !== undefined) query.set('is_active', String(params.is_active));
      else if (!params.include_inactive) query.set('is_active', 'true');
      const data = await client.get(`/api/v1/users?${query}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_find_user'); }
  });
}
