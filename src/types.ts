export const VERSION = '0.1.3';

export interface RunframeConfig {
  apiKey: string;
  apiUrl: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  has_more: boolean;
  next_offset: number | null;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details?: Record<string, unknown>;
  };
}
