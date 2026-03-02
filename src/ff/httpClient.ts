import { FlutterFlowApiError } from "./errors.js";

export interface HttpClientOptions {
  token: string;
  timeoutMs: number;
  minIntervalMs: number;
}

export class HttpClient {
  private static gate: Promise<void> = Promise.resolve();
  private static nextAllowedAt = 0;

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

  private async waitForGlobalPacing(): Promise<void> {
    const minIntervalMs = Math.max(0, Math.trunc(this.options.minIntervalMs || 0));
    if (minIntervalMs <= 0) {
      return;
    }

    HttpClient.gate = HttpClient.gate
      .catch(() => undefined)
      .then(async () => {
        const now = Date.now();
        const waitMs = Math.max(0, HttpClient.nextAllowedAt - now);
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        HttpClient.nextAllowedAt = Date.now() + minIntervalMs;
      });

    await HttpClient.gate;
  }

  async requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    await this.waitForGlobalPacing();
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
    await this.waitForGlobalPacing();
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
