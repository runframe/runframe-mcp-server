import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RunframeClient } from '../client.js';
import { toolError } from '../server.js';

export function registerServiceTools(server: McpServer, client: RunframeClient) {
  server.registerTool('runframe_list_services', {
    description: 'List all services in your organization.',
    inputSchema: {
      search: z.string().optional().describe('Search by name'),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params) => {
    try {
      const query = new URLSearchParams();
      if (params.limit != null) query.set('limit', String(params.limit));
      if (params.offset != null) query.set('offset', String(params.offset));
      if (params.search) query.set('search', params.search);
      const data = await client.get(`/api/v1/services?${query}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_list_services'); }
  });

  server.registerTool('runframe_get_service', {
    description: 'Get details of a specific service.',
    inputSchema: {
      id: z.string().describe('Public service key (for example SER-00001)'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params) => {
    try {
      const data = await client.get(`/api/v1/services/${encodeURIComponent(params.id)}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_get_service'); }
  });
}
