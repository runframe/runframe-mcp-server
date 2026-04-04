export const VERSION = '0.1.5';

export interface RunframeConfig {
  apiKey: string;
  apiUrl: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details?: Record<string, unknown>;
  };
}
