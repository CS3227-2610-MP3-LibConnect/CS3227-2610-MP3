export type SoCLlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type SoCLlmRequest = {
  feature: 'member-assistant' | 'librarian-assistant';
  messages: SoCLlmMessage[];
  model?: never;
};

export type SoCLlmResult = {
  content: string;
  model: string;
};

export interface SoCLlmClient {
  complete(request: SoCLlmRequest): Promise<SoCLlmResult>;
}

export type SoCLlmAdapterErrorCode = 'CONFIGURATION_ERROR' | 'PROVIDER_UNAVAILABLE';

export class SoCLlmAdapterError extends Error {
  readonly code: SoCLlmAdapterErrorCode;

  constructor(code: SoCLlmAdapterErrorCode) {
    super(code === 'CONFIGURATION_ERROR'
      ? 'The AI service is not configured.'
      : 'The AI service is temporarily unavailable.');
    this.name = 'SoCLlmAdapterError';
    this.code = code;
  }
}

type SoCLlmEnvironment = {
  SOCLAAS_BASE_URL?: string;
  SOCLAAS_API_KEY?: string;
  SOCLAAS_MODEL?: string;
};

type SoCLlmClientOptions = {
  env?: SoCLlmEnvironment;
  fetch?: typeof fetch;
};

const TOTAL_DEADLINE_MS = 15_000;
const RETRY_DELAY_MS = 100;

function configuration(env: SoCLlmEnvironment): { endpoint: string; apiKey: string; model: string } | null {
  const baseUrl = env.SOCLAAS_BASE_URL?.trim();
  const apiKey = env.SOCLAAS_API_KEY?.trim();
  const model = env.SOCLAAS_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) return null;

  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      return null;
    }
    return { endpoint: `${baseUrl.replace(/\/+$/, '')}/chat/completions`, apiKey, model };
  } catch {
    return null;
  }
}

function isValidRequest(request: SoCLlmRequest): boolean {
  return Boolean(request)
    && (request.feature === 'member-assistant' || request.feature === 'librarian-assistant')
    && Array.isArray(request.messages)
    && request.messages.length > 0
    && request.messages.every((message) => message
      && (message.role === 'system' || message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string');
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function safeFailure(): SoCLlmAdapterError {
  return new SoCLlmAdapterError('PROVIDER_UNAVAILABLE');
}

export function createSoCLlmClient(options: SoCLlmClientOptions = {}): SoCLlmClient {
  const env = options.env ?? process.env;
  const fetcher = options.fetch ?? globalThis.fetch;
  // Resolve configuration lazily so an unavailable AI provider never prevents API startup.
  return {
    async complete(request: SoCLlmRequest): Promise<SoCLlmResult> {
      const config = configuration(env);
      if (!config) throw new SoCLlmAdapterError('CONFIGURATION_ERROR');
      if (!isValidRequest(request)) throw safeFailure();

      const controller = new AbortController();
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        deadlineTimer = setTimeout(() => {
          controller.abort();
          reject(safeFailure());
        }, TOTAL_DEADLINE_MS);
      });
      const startedAt = Date.now();

      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (Date.now() - startedAt >= TOTAL_DEADLINE_MS) throw safeFailure();
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
              if (attempt === 0 && isRetryableStatus(response.status)) {
                await Promise.race([
                  new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS)),
                  deadline,
                ]);
                continue;
              }
              throw safeFailure();
            }

            let body: unknown;
            try {
              body = await Promise.race([response.json(), deadline]);
            } catch {
              throw safeFailure();
            }
            if (!body || typeof body !== 'object') throw safeFailure();
            const choices = (body as { choices?: unknown }).choices;
            const model = (body as { model?: unknown }).model;
            if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object'
              || typeof model !== 'string' || model.length === 0) throw safeFailure();
            const message = (choices[0] as { message?: unknown }).message;
            if (!message || typeof message !== 'object'
              || (message as { role?: unknown }).role !== 'assistant'
              || typeof (message as { content?: unknown }).content !== 'string') throw safeFailure();

            return { content: (message as { content: string }).content, model };
          } catch (error) {
            if (error instanceof SoCLlmAdapterError) throw error;
            if (controller.signal.aborted || attempt > 0) throw safeFailure();
            // Network/transport failures are transient once; never surface the thrown detail.
            await Promise.race([
              new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS)),
              deadline,
            ]);
          }
        }
        throw safeFailure();
      } finally {
        if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      }
    },
  };
}
