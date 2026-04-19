import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer as createHttpServer, type Server } from 'http';
import { timingSafeEqual } from 'crypto';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'DELETE']);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const MAX_REQUEST_BODY_BYTES = 1_048_576; // 1 MB
const MAX_HEADER_SIZE = 8_192; // 8 KB (stricter than Node.js 16 KB default)

function parseTokens(tokenEnv: string): string[] {
  return tokenEnv.split(',').map(t => t.trim()).filter(Boolean);
}

function validateToken(authHeader: string, validTokens: string[]): boolean {
  for (const token of validTokens) {
    const expected = `Bearer ${token}`;
    if (authHeader.length === expected.length &&
        timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

export async function startHttp(
  createMcpServer: () => McpServer,
  port: number,
  host: string,
  accessToken: string
): Promise<Server> {
  const isLocal = LOCAL_HOSTS.has(host);
  const validTokens = parseTokens(accessToken);

  const httpServer = createHttpServer(
    { maxHeaderSize: MAX_HEADER_SIZE },
    async (req, res) => {
      try {
        // Method filter — only accept methods the MCP spec uses
        if (!ALLOWED_METHODS.has(req.method ?? '')) {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        // Request body size limit
        const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
        if (contentLength > MAX_REQUEST_BODY_BYTES) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request body too large' }));
          return;
        }

        // Path check — safe fallback if Host header is missing or malformed
        let pathname: string;
        try {
          const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`);
          pathname = url.pathname;
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad request: malformed URL' }));
          return;
        }

        if (pathname !== '/mcp') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found. Use /mcp endpoint.' }));
          return;
        }

        // Auth check — constant-time comparison to prevent timing attacks
        const authHeader = req.headers.authorization;
        if (!authHeader || !validateToken(authHeader, validTokens)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }

        // Host + Origin validation for DNS rebinding protection (local deployments)
        if (isLocal) {
          // Validate Host header
          if (req.headers.host) {
            try {
              const hostHeader = new URL(`http://${req.headers.host}`);
              if (!LOCAL_HOSTS.has(hostHeader.hostname)) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Forbidden: invalid host' }));
                return;
              }
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Bad request: malformed Host header' }));
              return;
            }
          }

          // Validate Origin header
          if (req.headers.origin) {
            try {
              const origin = new URL(req.headers.origin);
              if (!LOCAL_HOSTS.has(origin.hostname)) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Forbidden: invalid origin' }));
                return;
              }
            } catch {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Forbidden: malformed origin' }));
              return;
            }
          }
        }

        // Create a fresh server + transport per request to avoid concurrency issues
        const server = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless — no session affinity needed
        });

        await server.connect(transport);

        try {
          await transport.handleRequest(req, res);
        } finally {
          await Promise.allSettled([transport.close(), server.close()]);
        }
      } catch {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
    }
  );

  return new Promise<Server>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.off('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      httpServer.off('error', onError);
      console.error(`[runframe-mcp] HTTP server listening on ${host}:${port}`);
      resolve(httpServer);
    };

    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(port, host);
  });
}
