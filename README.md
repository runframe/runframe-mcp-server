# runframe-mcp-server

[![CI](https://github.com/runframe/runframe-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/runframe/runframe-mcp-server/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@runframe/mcp-server)](https://npmjs.com/package/@runframe/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-≥20-brightgreen)](https://nodejs.org)

**[Runframe](https://runframe.io)** is the complete incident lifecycle platform for engineering teams, covering incident response, on-call, and status pages. This MCP server lets you manage those workflows from your IDE or AI agent.

17 tools covering incidents, on-call, services, postmortems, teams, and people lookup. Requires Node.js 20+.

## Why Use This

- **Stay in your editor** — acknowledge incidents, page responders, and write postmortems without switching to a browser
- **Let agents handle the routine** — AI agents can triage, escalate, and update incidents autonomously using scoped API keys
- **Zero infrastructure** — runs via `npx`, no server to deploy for local use

## How It Works

```
Your IDE / Agent
    ↓ (stdio or HTTP)
MCP Server (this package)
    ↓ (HTTPS, scoped API key)
Runframe API
```

The server is stateless. It translates MCP tool calls into Runframe API requests, scoped by your API key permissions. No data is stored locally.

## Examples

Ask your agent:

- *"Acknowledge incident INC-2026-001"* → calls `runframe_acknowledge_incident`
- *"Who is on call right now?"* → calls `runframe_get_current_oncall`
- *"Create a postmortem for the database outage"* → calls `runframe_create_postmortem`
- *"Page the backend team lead about the API latency spike"* → calls `runframe_page_someone`
- *"List all open SEV1 incidents"* → calls `runframe_list_incidents` with severity filter
- *"Find Alex so I can check their open incidents"* → calls `runframe_find_user`

## Install

Get your API key from [Runframe Settings](https://runframe.io/settings), then add to your agent:

**Claude Code:**

```bash
claude mcp add runframe -e RUNFRAME_API_KEY=rf_your_key_here -- npx -y @runframe/mcp-server
```

**Cursor** (`~/.cursor/mcp.json`) · **VS Code** (`.vscode/mcp.json`) · **Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "runframe": {
      "command": "npx",
      "args": ["-y", "@runframe/mcp-server"],
      "env": { "RUNFRAME_API_KEY": "rf_your_key_here" }
    }
  }
}
```

**Other MCP clients:** Add the JSON config above to your client's MCP config file.

**Interactive setup wizard:**

```bash
npx @runframe/mcp-server --setup
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RUNFRAME_API_KEY` | Yes | — | API key (starts with `rf_`) |
| `RUNFRAME_API_URL` | No | `https://runframe.io` | API base URL |
| `MCP_ACCESS_TOKEN` | HTTP only | — | Bearer token for HTTP transport. Comma-separated for rotation (`new_token,old_token`). |

## Transports

**stdio** (default) — used by MCP clients like Claude Code and Cursor. No network exposure. This is what the install commands above configure.

**Streamable HTTP** — for containerized or remote deployments. Requires `MCP_ACCESS_TOKEN` for bearer auth:

```bash
RUNFRAME_API_KEY=rf_... \
  MCP_ACCESS_TOKEN=your_token \
  npx @runframe/mcp-server --transport http --port 3100 --host 127.0.0.1
```

## Security Model

Responsibility is split across three boundaries:

- **Runframe API** handles authorization and scopes via `RUNFRAME_API_KEY`.
- **This MCP server** handles process isolation (stdio) and bearer-token validation (HTTP). It also enforces method filtering, Host/Origin checks on localhost, declared Content-Length validation (1 MB limit), 8 KB header limit, and 15s upstream timeout.
- **Your reverse proxy** handles TLS, rate limiting, and streamed-body enforcement if you expose HTTP mode to a network.

The server stores nothing. It is a pass-through to the Runframe API.

## Tools

### Incidents (9)

| Tool | Scopes | Description |
|------|--------|-------------|
| `runframe_list_incidents` | `incidents:read` | List incidents with filters and pagination |
| `runframe_get_incident` | `incidents:read` | Get incident by ID or number |
| `runframe_create_incident` | `incidents:write` | Create an incident |
| `runframe_update_incident` | `incidents:write` | Update title, description, severity, or assignment |
| `runframe_change_incident_status` | `incidents:write` | Move to a new status (new, investigating, fixing, monitoring, resolved, closed) |
| `runframe_acknowledge_incident` | `incidents:write` | Acknowledge (auto-assigns, tracks SLA) |
| `runframe_add_incident_event` | `incidents:write` | Add a timeline entry |
| `runframe_escalate_incident` | `incidents:write` | Escalate to the next policy level |
| `runframe_page_someone` | `incidents:write` | Page a responder via Slack or email |

### On-call (1)

| Tool | Scopes | Description |
|------|--------|-------------|
| `runframe_get_current_oncall` | `oncall:read` | Who is on call right now |

### Services (2)

| Tool | Scopes | Description |
|------|--------|-------------|
| `runframe_list_services` | `services:read` | List services |
| `runframe_get_service` | `services:read` | Get service details |

### Postmortems (2)

| Tool | Scopes | Description |
|------|--------|-------------|
| `runframe_create_postmortem` | `postmortems:write` | Create a postmortem |
| `runframe_get_postmortem` | `postmortems:read` | Get postmortem for an incident |

### Teams (2)

| Tool | Scopes | Description |
|------|--------|-------------|
| `runframe_list_teams` | `teams:read` | List teams |
| `runframe_get_escalation_policy` | `oncall:read` | Get escalation policy for a severity level |

### Users (1)

| Tool | Scopes | Description |
|------|--------|-------------|
| `runframe_find_user` | `users:read` | Search users by name or email, with optional inactive-user support for historical lookups |

## Direct API alignment

This MCP server follows the public Runframe direct API contract.

- Incident create requires `service_ids` containing public service keys like `SER-00001`, not internal UUIDs.
- Incident IDs in tools may be either UUIDs or incident numbers like `INC-2026-001`.
- `runframe_create_incident` accepts an optional `idempotency_key`, which is forwarded as the `Idempotency-Key` header for retry-safe creates.
- Use `runframe_list_services` to discover valid `service_key` values before creating incidents.
- Use `runframe_find_user` to resolve a person name before filtering incidents by `assigned_to` or `resolved_by`.
- Set `include_inactive=true` on `runframe_find_user` when you need to resolve former employees in historical incident queries.
- Use `runframe_list_teams` with `search` to resolve a team name before filtering incidents by `team_id`.

## Docker

The Docker image runs HTTP transport by default on port 3100:

```bash
docker build -t runframe-mcp-server .
docker run -e RUNFRAME_API_KEY=rf_... -e MCP_ACCESS_TOKEN=your_token -p 3100:3100 runframe-mcp-server
```

## Deploying HTTP Mode

HTTP mode is meant for private networks. If you put it on the internet:

- Run behind TLS (nginx, Caddy, cloud LB). This server does not do TLS.
- Use a reverse proxy for rate limiting and request buffering.
- Prefer private subnets or VPNs over public exposure.
- Rotate `MCP_ACCESS_TOKEN` regularly. Pass old and new tokens comma-separated for zero-downtime swaps.

### Rate limiting

The Runframe API enforces rate limits server-side. If you hit a limit, tools return a 429 error with a retry hint. For HTTP transport deployments, your reverse proxy can add additional request-level throttling.

### Token rotation

`MCP_ACCESS_TOKEN` accepts comma-separated tokens:

1. Set `MCP_ACCESS_TOKEN=new_token,old_token`
2. Update clients to `new_token`
3. Drop the old one: `MCP_ACCESS_TOKEN=new_token`

## Limitations

- Read-only for schedules — you can query on-call and escalation policies but not modify them via MCP
- Requires a [Runframe](https://runframe.io) account and API key

## Contributing

Issues and PRs welcome at [github.com/runframe/runframe-mcp-server](https://github.com/runframe/runframe-mcp-server).

## License

MIT — [Runframe](https://runframe.io) · [npm](https://npmjs.com/package/@runframe/mcp-server)
