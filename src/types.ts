export const VERSION = '0.1.7';

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
