import { createInterface } from 'node:readline/promises';
import { RunframeClient } from './client.js';

function generateConfig(apiKey: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        runframe: {
          command: 'npx',
          args: ['-y', '@runframe/mcp-server'],
          env: {
            RUNFRAME_API_KEY: apiKey,
          },
        },
      },
    },
    null,
    2
  );
}

export async function runSetup(apiUrl: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });

  try {
    console.error('');
    console.error('  Runframe MCP Server');
    console.error('');
    console.error('  Get your API key at: https://runframe.io/settings');
    console.error('');

    const key = (await rl.question('  Paste your API key (or press Enter to skip): ')).trim();

    let validKey = '';

    if (key) {
      if (!key.startsWith('rf_')) {
        console.error('  Invalid format — API keys start with "rf_". Showing config with placeholder.');
      } else {
        // Validate against the API
        const client = new RunframeClient({ apiKey: key, apiUrl });
        try {
          const result = await client.get<{ valid: boolean; scopes: string[]; organizationName: string }>(
            '/api/v1/auth/verify'
          );
          console.error('');
          console.error(`  ✓ Connected to ${result.organizationName} (scopes: ${result.scopes.join(', ')})`);
          validKey = key;
        } catch {
          console.error('  ✗ Could not verify key. Showing config with your key — double-check it at https://runframe.io/settings');
          validKey = key;
        }
      }
    } else {
      console.error('  Skipped — you can add your key later.');
    }

    const configKey = validKey || 'YOUR_API_KEY';

    console.error('');
    console.error('  Add to your MCP client:');
    console.error('');
    console.error('  Claude Code:');
    console.error(`    claude mcp add runframe -e RUNFRAME_API_KEY=${configKey} -- npx -y @runframe/mcp-server`);
    console.error('');
    console.error('  Cursor (~/.cursor/mcp.json) or VS Code (.vscode/mcp.json):');
    for (const line of generateConfig(configKey).split('\n')) {
      console.error(`  ${line}`);
    }
    if (!validKey) {
      console.error('');
      console.error('  Replace YOUR_API_KEY with your key from https://runframe.io/settings');
    }
    console.error('');
    console.error('  Docs: https://github.com/RunFrame/runframe-mcp-server');
    console.error('');
  } finally {
    rl.close();
  }
}
