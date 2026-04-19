import { VERSION } from './types.js';
import type { RunframeConfig, ApiErrorResponse, RequestOptions } from './types.js';

const REQUEST_TIMEOUT_MS = 15_000;

export class RunframeClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: RunframeConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.apiUrl.replace(/\/$/, '');
  }

  async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': `runframe-mcp-server/${VERSION}`,
      ...(options?.headers ?? {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new RunframeApiError(
          `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${method} ${path}`,
          0,
          'timeout'
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new RunframeApiError(
        `HTTP ${response.status}: non-JSON response from ${method} ${path}`,
        response.status,
        'parse_error'
      );
    }

    if (!response.ok) {
      const error = data as ApiErrorResponse;
      const message = error?.error?.message ?? `HTTP ${response.status}`;
      const retryAfter = response.headers.get('Retry-After') ?? undefined;
      throw new RunframeApiError(message, response.status, error?.error?.code ?? 'unknown', retryAfter);
    }

    return (data as { data: T }).data;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body: Record<string, unknown>, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  patch<T>(path: string, body: Record<string, unknown>, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }
}

export class RunframeApiError extends Error {
  public retryAfter?: string;

  constructor(
    message: string,
    public status: number,
    public code: string,
    retryAfter?: string
  ) {
    super(message);
    this.name = 'RunframeApiError';
    this.retryAfter = retryAfter;
  }
}
