import { FlutterFlowApiError } from "./errors.js";

export interface HttpClientOptions {
  token: string;
  timeoutMs: number;
}

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  private authorizationHeader(): string {
    const token = this.options.token?.trim();
    if (!token) {
      throw new Error(
        "Missing FLUTTERFLOW_API_TOKEN. Remote FlutterFlow API commands are unavailable until this env var is set."
      );
    }
    return `Bearer ${token}`;
  }

  async requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: this.authorizationHeader(),
          "Content-Type": "application/json",
          ...(init.headers ?? {})
        }
      });

      const bodyText = await response.text();

      if (!response.ok) {
        throw new FlutterFlowApiError(`FlutterFlow API request failed (${response.status})`, response.status, bodyText, {
          method: String(init.method ?? "GET").toUpperCase(),
          url,
          retryAfter: response.headers.get("retry-after") ?? undefined
        });
      }

      if (!bodyText) {
        return {} as T;
      }

      return JSON.parse(bodyText) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async requestText(url: string, init: RequestInit = {}): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: this.authorizationHeader(),
          ...(init.headers ?? {})
        }
      });
      const bodyText = await response.text();

      if (!response.ok) {
        throw new FlutterFlowApiError(`FlutterFlow API request failed (${response.status})`, response.status, bodyText, {
          method: String(init.method ?? "GET").toUpperCase(),
          url,
          retryAfter: response.headers.get("retry-after") ?? undefined
        });
      }

      return bodyText;
    } finally {
      clearTimeout(timeout);
    }
  }
}
