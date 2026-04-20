#!/usr/bin/env node
import { RunframeClient } from './client.js';
import { createServer } from './server.js';
import { runSetup } from './setup.js';
import { startStdio } from './transports/stdio.js';
import { startHttp } from './transports/http.js';

async function main() {
  // Parse CLI args
  const args = process.argv.slice(2);
  const transportArg = args.includes('--transport') ? args[args.indexOf('--transport') + 1] : 'stdio';
  const portArg = args.includes('--port') ? parseInt(args[args.indexOf('--port') + 1]) : 3100;
  const hostArg = args.includes('--host') ? args[args.indexOf('--host') + 1] : '127.0.0.1';

  const apiUrl = process.env.RUNFRAME_API_URL ?? 'https://runframe.io';

  // --setup: interactive wizard, then exit
  if (args.includes('--setup')) {
    await runSetup(apiUrl);
    process.exit(0);
  }

  // Validate API key
  const apiKey = process.env.RUNFRAME_API_KEY;
  if (!apiKey) {
    console.error('');
    console.error('  Runframe MCP Server');
    console.error('');
    console.error('  1. Get your API key at: https://runframe.io/settings');
    console.error('');
    console.error('  2. Add to your MCP client:');
    console.error('');
    console.error('     Claude Code:');
    console.error('       claude mcp add runframe -e RUNFRAME_API_KEY=rf_your_key_here -- npx -y @runframe/mcp-server');
    console.error('');
    console.error('     Cursor (~/.cursor/mcp.json) or VS Code (.vscode/mcp.json):');
    console.error('       { "mcpServers": { "runframe": {');
    console.error('           "command": "npx",');
    console.error('           "args": ["-y", "@runframe/mcp-server"],');
    console.error('           "env": { "RUNFRAME_API_KEY": "rf_your_key_here" }');
    console.error('       } } }');
    console.error('');
    console.error('  Or run: npx @runframe/mcp-server --setup');
    console.error('');
    process.exit(1);
  }
  if (!apiKey.startsWith('rf_')) {
    console.error('Error: Invalid API key format. Keys start with "rf_".');
    process.exit(1);
  }

  const client = new RunframeClient({ apiKey, apiUrl });

  // Verify key on startup
  try {
    const verify = await client.get<{ valid: boolean; scopes: string[]; organization_name: string }>(
      '/api/v1/auth/verify'
    );
    console.error(`[runframe-mcp] Authenticated: ${verify.organization_name} (scopes: ${verify.scopes.join(', ')})`);
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const status = (error as { status: number }).status;
      if (status === 401 || status === 403) {
        console.error('Error: API key is invalid or revoked. Check your key at https://runframe.io/settings');
      } else {
        console.error(`Error: Runframe API returned HTTP ${status}. The service may be temporarily unavailable.`);
      }
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: Could not reach Runframe API at ${apiUrl}. Check RUNFRAME_API_URL and your network connection. (${message})`);
    }
    process.exit(1);
  }

  // Start transport
  if (transportArg === 'http') {
    const accessToken = process.env.MCP_ACCESS_TOKEN;
    if (!accessToken) {
      console.error('Error: MCP_ACCESS_TOKEN is required for HTTP transport. Set a static token shared across all instances.');
      process.exit(1);
    }
    // HTTP: pass factory so each request gets a fresh server (avoids concurrency issues)
    await startHttp(() => createServer(client), portArg, hostArg, accessToken);
  } else {
    // stdio: single server instance (one client, one connection)
    const server = createServer(client);
    await startStdio(server);
  }
}

main().catch((error) => {
  console.error('[runframe-mcp] Fatal error:', error);
  process.exit(1);
});
