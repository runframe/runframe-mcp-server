import { readFileSync } from 'node:fs';

export const VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
).version as string;

export interface RunframeConfig {
  apiKey: string;
  apiUrl: string;
}

export interface RequestOptions {
  headers?: Record<string, string>;
}

export interface ApiErrorResponse {
  error: {
    message: string;
    code: string;
    userMessage?: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    requestId?: string;
    timestamp?: string;
  };
}
