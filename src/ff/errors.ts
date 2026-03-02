export class FlutterFlowApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
    readonly request?: {
      method?: string;
      url?: string;
      retryAfter?: string;
    }
  ) {
    super(message);
    this.name = "FlutterFlowApiError";
  }
}
