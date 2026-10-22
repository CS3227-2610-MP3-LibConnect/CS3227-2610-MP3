export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
  };
}

export class ApiClientError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;

  constructor(status: number, payload?: ApiErrorPayload) {
    super(payload?.error?.message ?? `Request failed (${status}).`);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = payload?.error?.code;
    this.fields = payload?.error?.fields;
  }
}
