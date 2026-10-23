import { randomUUID } from 'node:crypto';

export const APPROVED_SOCLAAS_MODEL = 'gemma4:26b';
export const SOCLAAS_TIMEOUT_MS = 8_000;
export const SOCLAAS_RETRY_DELAY_MS = 250;
export const SOCLAAS_MAX_RETRIES = 1;
export const SOCLAAS_PER_USER_LIMIT = 5;
export const SOCLAAS_GLOBAL_LIMIT = 60;
export const SOCLAAS_RATE_WINDOW_MS = 60_000;
export const SOCLAAS_CIRCUIT_FAILURE_THRESHOLD = 5;
export const SOCLAAS_CIRCUIT_COOLDOWN_MS = 30_000;
export const SOCLAAS_MAX_REQUEST_BYTES = 16 * 1024;

export type SoCLlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type SoCLlmRequest = {
  feature: 'member-assistant' | 'librarian-assistant';
  actorId?: string;
  messages: SoCLlmMessage[];
  model?: never;
};

export type SoCLlmResult = {
  content: string;
  model: string;
  correlationId?: string;
};

export type SoCLlmAuditMetadata = {
  actorReference: string;
  feature: SoCLlmRequest['feature'];
  model: string;
  timestamp: string;
  correlationId: string;
  resultCategory: 'success' | 'configuration' | 'rate_limited' | 'unavailable' | 'malformed';
  retryCount: number;
};

export type SoCLlmClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  audit?: (metadata: SoCLlmAuditMetadata) => void;
};

export type SoCLlmErrorCode = 'CONFIGURATION' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'MALFORMED';

export class SoCLlmError extends Error {
  readonly code: SoCLlmErrorCode;
  readonly retryable: boolean;
  readonly retryCount: number;

  constructor(code: SoCLlmErrorCode, message: string, retryable = false, retryCount = 0) {
    super(message);
    this.name = 'SoCLlmError';
    this.code = code;
    this.retryable = retryable;
    this.retryCount = retryCount;
  }
}

class SlidingWindowLimiter {
  private readonly timestamps = new Map<string, number[]>();

  constructor(private readonly now: () => number) {}

  consume(key: string, limit: number): boolean {
    const cutoff = this.now() - SOCLAAS_RATE_WINDOW_MS;
    const current = (this.timestamps.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (current.length >= limit) {
      this.timestamps.set(key, current);
      return false;
    }
    current.push(this.now());
    this.timestamps.set(key, current);
    return true;
  }
}

function validBaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function errorStatus(error: unknown): number | null {
  return error instanceof Response ? error.status : null;
}

async function readBoundedResponseBody(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const normalizedLength = contentLength.trim();
    if (!/^\d+$/.test(normalizedLength) || Number(normalizedLength) > maxBytes) {
      throw new Error('Provider response is too large or malformed.');
    }
  }

  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error('Malformed provider response.');
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) throw new Error('Provider response is too large.');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  return new TextDecoder().decode(
    Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk)),
      totalBytes,
    ),
  );
}

export class SoCLlmClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string | null;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly audit: (metadata: SoCLlmAuditMetadata) => void;
  private readonly userLimiter: SlidingWindowLimiter;
  private readonly globalLimiter: SlidingWindowLimiter;
  private retryableFailures: number[] = [];
  private circuitOpenedAt: number | null = null;

  constructor(options: SoCLlmClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.SOCLAAS_API_KEY;
    this.baseUrl = validBaseUrl(options.baseUrl ?? process.env.SOCLAAS_BASE_URL);
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.audit =
      options.audit ?? ((metadata) => console.info('ai.assistant', JSON.stringify(metadata)));
    this.userLimiter = new SlidingWindowLimiter(this.now);
    this.globalLimiter = new SlidingWindowLimiter(this.now);
  }

  async complete(request: SoCLlmRequest): Promise<SoCLlmResult> {
    if (
      !request ||
      typeof request.actorId !== 'string' ||
      !request.actorId.trim() ||
      request.feature !== 'librarian-assistant' ||
      !Array.isArray(request.messages) ||
      request.messages.length === 0
    ) {
      throw new SoCLlmError('MALFORMED', 'The AI request is invalid.');
    }
    const correlationId = randomUUID();
    const timestamp = new Date(this.now()).toISOString();
    const baseAudit = {
      actorReference: request.actorId,
      feature: request.feature,
      model: APPROVED_SOCLAAS_MODEL,
      timestamp,
      correlationId,
    } as const;
    const configurationError = this.configurationError();
    if (configurationError) {
      this.audit({ ...baseAudit, resultCategory: 'configuration', retryCount: 0 });
      throw configurationError;
    }
    const requestBytes = Buffer.byteLength(
      JSON.stringify({
        model: APPROVED_SOCLAAS_MODEL,
        messages: request.messages,
        reasoning_effort: 'none',
      }),
      'utf8',
    );
    if (requestBytes > SOCLAAS_MAX_REQUEST_BYTES) {
      this.audit({ ...baseAudit, resultCategory: 'malformed', retryCount: 0 });
      throw new SoCLlmError('MALFORMED', 'The AI request is too large.');
    }
    if (
      !this.globalLimiter.consume('global', SOCLAAS_GLOBAL_LIMIT) ||
      !this.userLimiter.consume(request.actorId, SOCLAAS_PER_USER_LIMIT)
    ) {
      this.audit({ ...baseAudit, resultCategory: 'rate_limited', retryCount: 0 });
      throw new SoCLlmError('RATE_LIMITED', 'The AI request limit was reached.');
    }
    if (this.isCircuitOpen()) {
      this.audit({ ...baseAudit, resultCategory: 'unavailable', retryCount: 0 });
      throw new SoCLlmError('UNAVAILABLE', 'The AI provider is temporarily unavailable.');
    }

    let retryCount = 0;
    while (true) {
      try {
        const result = await this.callProvider(request.messages, correlationId);
        this.audit({ ...baseAudit, resultCategory: 'success', retryCount });
        return { content: result, model: APPROVED_SOCLAAS_MODEL, correlationId };
      } catch (error) {
        const status = errorStatus(error);
        const retryable =
          status === 429 ||
          (status !== null && status >= 500 && status <= 599) ||
          error instanceof TypeError ||
          (error instanceof DOMException && error.name === 'AbortError');
        if (!retryable || retryCount >= SOCLAAS_MAX_RETRIES) {
          if (retryable) this.recordRetryableFailure();
          const mapped = new SoCLlmError(
            'UNAVAILABLE',
            'The AI provider is unavailable.',
            retryable,
            retryCount,
          );
          this.audit({ ...baseAudit, resultCategory: 'unavailable', retryCount });
          throw mapped;
        }
        retryCount += 1;
        await this.sleep(SOCLAAS_RETRY_DELAY_MS);
      }
    }
  }

  private configurationError(): SoCLlmError | null {
    if (!this.apiKey || !this.baseUrl)
      return new SoCLlmError('CONFIGURATION', 'The AI provider is not configured.');
    return null;
  }

  private isCircuitOpen(): boolean {
    if (this.circuitOpenedAt === null) return false;
    if (this.now() - this.circuitOpenedAt >= SOCLAAS_CIRCUIT_COOLDOWN_MS) {
      this.circuitOpenedAt = null;
      this.retryableFailures = [];
      return false;
    }
    return true;
  }

  private recordRetryableFailure(): void {
    const cutoff = this.now() - SOCLAAS_RATE_WINDOW_MS;
    this.retryableFailures = this.retryableFailures.filter((timestamp) => timestamp > cutoff);
    this.retryableFailures.push(this.now());
    if (this.retryableFailures.length >= SOCLAAS_CIRCUIT_FAILURE_THRESHOLD)
      this.circuitOpenedAt = this.now();
  }

  private async callProvider(messages: SoCLlmMessage[], correlationId: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SOCLAAS_TIMEOUT_MS);
    try {
      const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
        },
        body: JSON.stringify({ model: APPROVED_SOCLAAS_MODEL, messages, reasoning_effort: 'none' }),
        signal: controller.signal,
      });
      if (!response.ok) throw response;
      let body: unknown;
      try {
        body = JSON.parse(await readBoundedResponseBody(response, SOCLAAS_MAX_REQUEST_BYTES));
      } catch {
        throw new Error('Malformed provider response.');
      }
      const content = (body as { choices?: Array<{ message?: { content?: unknown } }> })
        ?.choices?.[0]?.message?.content;
      if (
        typeof content !== 'string' ||
        content.trim().length === 0 ||
        content.length > SOCLAAS_MAX_REQUEST_BYTES
      )
        throw new Error('Malformed provider response.');
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export type SoCLlmAdapterErrorCode = 'CONFIGURATION_ERROR' | 'PROVIDER_UNAVAILABLE';

export class SoCLlmAdapterError extends Error {
  readonly code: SoCLlmAdapterErrorCode;

  constructor(code: SoCLlmAdapterErrorCode) {
    super(
      code === 'CONFIGURATION_ERROR'
        ? 'The AI service is not configured.'
        : 'The AI service is temporarily unavailable.',
    );
    this.name = 'SoCLlmAdapterError';
    this.code = code;
  }
}

type MemberAdapterEnvironment = {
  SOCLAAS_BASE_URL?: string;
  SOCLAAS_API_KEY?: string;
  SOCLAAS_MODEL?: string;
};

type MemberAdapterOptions = {
  env?: MemberAdapterEnvironment;
  fetch?: typeof fetch;
};

const MEMBER_TOTAL_DEADLINE_MS = 15_000;
const MEMBER_RETRY_DELAY_MS = 100;

function memberAdapterConfiguration(
  env: MemberAdapterEnvironment,
): { endpoint: string; apiKey: string; model: string } | null {
  const baseUrl = env.SOCLAAS_BASE_URL?.trim();
  const apiKey = env.SOCLAAS_API_KEY?.trim();
  const model = env.SOCLAAS_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) return null;
  try {
    const parsed = new URL(baseUrl);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      return null;
    return { endpoint: `${baseUrl.replace(/\/+$/, '')}/chat/completions`, apiKey, model };
  } catch {
    return null;
  }
}

function validMemberRequest(request: SoCLlmRequest): boolean {
  return (
    Boolean(request) &&
    request.feature === 'member-assistant' &&
    Array.isArray(request.messages) &&
    request.messages.length > 0 &&
    request.messages.every(
      (message) =>
        message &&
        (message.role === 'system' || message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string',
    )
  );
}

function memberAdapterFailure(): SoCLlmAdapterError {
  return new SoCLlmAdapterError('PROVIDER_UNAVAILABLE');
}

export function createSoCLlmClient(
  options: MemberAdapterOptions = {},
): Pick<SoCLlmClient, 'complete'> {
  const env = options.env ?? process.env;
  const fetcher = options.fetch ?? globalThis.fetch;
  return {
    async complete(request: SoCLlmRequest): Promise<SoCLlmResult> {
      const config = memberAdapterConfiguration(env);
      if (!config) throw new SoCLlmAdapterError('CONFIGURATION_ERROR');
      if (!validMemberRequest(request)) throw memberAdapterFailure();

      const controller = new AbortController();
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        deadlineTimer = setTimeout(() => {
          controller.abort();
          reject(memberAdapterFailure());
        }, MEMBER_TOTAL_DEADLINE_MS);
      });
      const startedAt = Date.now();
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (Date.now() - startedAt >= MEMBER_TOTAL_DEADLINE_MS) throw memberAdapterFailure();
          try {
            const response = await Promise.race([
              fetcher(config.endpoint, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${config.apiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: config.model,
                  messages: request.messages,
                  reasoning_effort: 'none',
                }),
                signal: controller.signal,
              }),
              deadline,
            ]);
            if (!response.ok) {
              if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
                await Promise.race([
                  new Promise<void>((resolve) => setTimeout(resolve, MEMBER_RETRY_DELAY_MS)),
                  deadline,
                ]);
                continue;
              }
              throw memberAdapterFailure();
            }
            let body: unknown;
            try {
              body = JSON.parse(
                await Promise.race([
                  readBoundedResponseBody(response, SOCLAAS_MAX_REQUEST_BYTES),
                  deadline,
                ]),
              );
            } catch {
              throw memberAdapterFailure();
            }
            const choices = (body as { choices?: unknown })?.choices;
            const model = (body as { model?: unknown })?.model;
            if (
              !Array.isArray(choices) ||
              !choices[0] ||
              typeof choices[0] !== 'object' ||
              typeof model !== 'string' ||
              !model
            )
              throw memberAdapterFailure();
            const message = (choices[0] as { message?: unknown }).message;
            if (
              !message ||
              typeof message !== 'object' ||
              (message as { role?: unknown }).role !== 'assistant' ||
              typeof (message as { content?: unknown }).content !== 'string'
            )
              throw memberAdapterFailure();
            return { content: (message as { content: string }).content, model };
          } catch (error) {
            if (error instanceof SoCLlmAdapterError) throw error;
            if (controller.signal.aborted || attempt > 0) throw memberAdapterFailure();
            await Promise.race([
              new Promise<void>((resolve) => setTimeout(resolve, MEMBER_RETRY_DELAY_MS)),
              deadline,
            ]);
          }
        }
        throw memberAdapterFailure();
      } finally {
        if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      }
    },
  };
}
