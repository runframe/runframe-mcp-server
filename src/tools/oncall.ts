import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RunframeClient } from '../client.js';
import { toolError } from '../server.js';

function normalizeOncallData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;

  const value = data as Record<string, unknown>;
  const summary = value.summary;
  const services = Array.isArray(value.services) ? value.services : [];

  return {
    ...(value.organizationId ? { organizationId: value.organizationId } : {}),
    timestamp: value.timestamp ?? null,
    summary: summary && typeof summary === 'object'
      ? {
          totalServices: (summary as Record<string, unknown>).totalServices ?? (summary as Record<string, unknown>).total_services ?? 0,
          servicesWithCoverage: (summary as Record<string, unknown>).servicesWithCoverage ?? (summary as Record<string, unknown>).services_with_coverage ?? 0,
          servicesWithoutCoverage: (summary as Record<string, unknown>).servicesWithoutCoverage ?? (summary as Record<string, unknown>).services_without_coverage ?? 0,
          coveragePercentage: (summary as Record<string, unknown>).coveragePercentage ?? (summary as Record<string, unknown>).coverage_percentage ?? 0,
        }
      : null,
    services: services.map((service) => {
      if (!service || typeof service !== 'object') return service;
      const serviceValue = service as Record<string, unknown>;
      const engineers = Array.isArray(serviceValue.onCallEngineers)
        ? serviceValue.onCallEngineers
        : Array.isArray(serviceValue.on_call_engineers)
          ? serviceValue.on_call_engineers
          : [];
      const primary = serviceValue.primaryOnCall ?? serviceValue.primary_on_call;

      return {
        serviceId: serviceValue.serviceId ?? serviceValue.service_id ?? null,
        serviceName: serviceValue.serviceName ?? serviceValue.service_name ?? null,
        serviceDescription: serviceValue.serviceDescription ?? serviceValue.service_description ?? null,
        teamId: serviceValue.teamId ?? serviceValue.team_id ?? null,
        teamName: serviceValue.teamName ?? serviceValue.team_name ?? null,
        teamDescription: serviceValue.teamDescription ?? serviceValue.team_description ?? null,
        onCallEngineers: engineers.map((engineer) => {
          if (!engineer || typeof engineer !== 'object') return engineer;
          const engineerValue = engineer as Record<string, unknown>;
          return {
            shiftId: engineerValue.shiftId ?? engineerValue.shift_id ?? null,
            id: engineerValue.id ?? null,
            name: engineerValue.name ?? null,
            email: engineerValue.email ?? null,
            slackUserId: engineerValue.slackUserId ?? engineerValue.slack_user_id ?? null,
            role: engineerValue.role ?? null,
            scheduleId: engineerValue.scheduleId ?? engineerValue.schedule_id ?? null,
            scheduleName: engineerValue.scheduleName ?? engineerValue.schedule_name ?? null,
            shiftStartsAt: engineerValue.shiftStartsAt ?? engineerValue.shift_starts_at ?? null,
            shiftEndsAt: engineerValue.shiftEndsAt ?? engineerValue.shift_ends_at ?? null,
          };
        }),
        hasCoverage: serviceValue.hasCoverage ?? serviceValue.has_coverage ?? false,
        primaryOnCall: primary && typeof primary === 'object'
          ? {
              id: (primary as Record<string, unknown>).id ?? null,
              name: (primary as Record<string, unknown>).name ?? null,
              role: (primary as Record<string, unknown>).role ?? null,
            }
          : null,
        schedules: Array.isArray(serviceValue.schedules) ? serviceValue.schedules : [],
      };
    }),
  };
}

export function registerOncallTools(server: McpServer, client: RunframeClient) {
  server.registerTool('runframe_get_current_oncall', {
    description: 'Get the current on-call coverage. Returns a stable camelCase MCP payload even if the upstream V1 API shape changes.',
    inputSchema: {
      team_id: z.string().uuid().optional().describe('Filter by team. If omitted, returns on-call for all teams.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params) => {
    try {
      const query = new URLSearchParams();
      if (params.team_id) query.set('team_id', params.team_id);
      const data = await client.get(`/api/v1/on-call/current?${query}`);
      const normalized = normalizeOncallData(data);
      return { content: [{ type: 'text' as const, text: JSON.stringify(normalized, null, 2) }] };
    } catch (error) { return toolError(error, 'runframe_get_current_oncall'); }
  });
}
