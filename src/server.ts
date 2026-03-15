import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RunframeClient } from './client.js';
import { RunframeApiError } from './client.js';
import { VERSION } from './types.js';
import { registerIncidentTools } from './tools/incidents.js';
import { registerOncallTools } from './tools/oncall.js';
import { registerServiceTools } from './tools/services.js';
import { registerPostmortemTools } from './tools/postmortems.js';
import { registerTeamTools } from './tools/teams.js';

export function createServer(client: RunframeClient): McpServer {
  const server = new McpServer({
    name: 'runframe',
    version: VERSION,
  });

  registerIncidentTools(server, client);
  registerOncallTools(server, client);
  registerServiceTools(server, client);
  registerPostmortemTools(server, client);
  registerTeamTools(server, client);

  return server;
}

/**
 * Standard MCP error response with actionable message
 */
export function toolError(error: unknown, toolName: string) {
  if (error instanceof RunframeApiError) {
    let hint = '';
    if (error.code === 'timeout') hint = ' The Runframe API did not respond in time. Try again.';
    else if (error.status === 404) hint = ' The requested resource was not found. Verify the ID is correct.';
    else if (error.status === 403) hint = ' Check your API key scopes.';
    else if (error.status === 429) {
      const retryIn = error.retryAfter ? ` Retry after ${error.retryAfter}s.` : ' Wait and retry.';
      hint = ` Rate limited.${retryIn}`;
    }

    return {
      isError: true as const,
      content: [{ type: 'text' as const, text: `Error: ${error.message}${hint}` }],
    };
  }

  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: `Error in ${toolName}: ${error instanceof Error ? error.message : 'Unknown error'}` }],
  };
}
