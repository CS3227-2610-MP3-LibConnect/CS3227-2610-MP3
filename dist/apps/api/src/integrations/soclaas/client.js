export class SoCLlmAdapterError extends Error {
    code;
    constructor(code) {
        super(code === 'CONFIGURATION_ERROR'
            ? 'The AI service is not configured.'
            : 'The AI service is temporarily unavailable.');
        this.name = 'SoCLlmAdapterError';
        this.code = code;
    }
}
const TOTAL_DEADLINE_MS = 15_000;
const RETRY_DELAY_MS = 100;
function configuration(env) {
    const baseUrl = env.SOCLAAS_BASE_URL?.trim();
    const apiKey = env.SOCLAAS_API_KEY?.trim();
    const model = env.SOCLAAS_MODEL?.trim();
    if (!baseUrl || !apiKey || !model)
        return null;
    try {
        const parsed = new URL(baseUrl);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
            return null;
        }
        return { endpoint: `${baseUrl.replace(/\/+$/, '')}/chat/completions`, apiKey, model };
    }
    catch {
        return null;
    }
}
function isValidRequest(request) {
    return Boolean(request)
        && (request.feature === 'member-assistant' || request.feature === 'librarian-assistant')
        && Array.isArray(request.messages)
        && request.messages.length > 0
        && request.messages.every((message) => message
            && (message.role === 'system' || message.role === 'user' || message.role === 'assistant')
            && typeof message.content === 'string');
}
function isRetryableStatus(status) {
    return status === 429 || status >= 500;
}
function safeFailure() {
    return new SoCLlmAdapterError('PROVIDER_UNAVAILABLE');
}
export function createSoCLlmClient(options = {}) {
    const env = options.env ?? process.env;
    const fetcher = options.fetch ?? globalThis.fetch;
    // Resolve configuration lazily so an unavailable AI provider never prevents API startup.
    return {
        async complete(request) {
            const config = configuration(env);
            if (!config)
                throw new SoCLlmAdapterError('CONFIGURATION_ERROR');
            if (!isValidRequest(request))
                throw safeFailure();
            const controller = new AbortController();
            let deadlineTimer;
            const deadline = new Promise((_resolve, reject) => {
                deadlineTimer = setTimeout(() => {
                    controller.abort();
                    reject(safeFailure());
                }, TOTAL_DEADLINE_MS);
            });
            const startedAt = Date.now();
            try {
                for (let attempt = 0; attempt < 2; attempt += 1) {
                    if (Date.now() - startedAt >= TOTAL_DEADLINE_MS)
                        throw safeFailure();
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
                                    new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS)),
                                    deadline,
                                ]);
                                continue;
                            }
                            throw safeFailure();
                        }
                        let body;
                        try {
                            body = await Promise.race([response.json(), deadline]);
                        }
                        catch {
                            throw safeFailure();
                        }
                        if (!body || typeof body !== 'object')
                            throw safeFailure();
                        const choices = body.choices;
                        const model = body.model;
                        if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object'
                            || typeof model !== 'string' || model.length === 0)
                            throw safeFailure();
                        const message = choices[0].message;
                        if (!message || typeof message !== 'object'
                            || message.role !== 'assistant'
                            || typeof message.content !== 'string')
                            throw safeFailure();
                        return { content: message.content, model };
                    }
                    catch (error) {
                        if (error instanceof SoCLlmAdapterError)
                            throw error;
                        if (controller.signal.aborted || attempt > 0)
                            throw safeFailure();
                        // Network/transport failures are transient once; never surface the thrown detail.
                        await Promise.race([
                            new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS)),
                            deadline,
                        ]);
                    }
                }
                throw safeFailure();
            }
            finally {
                if (deadlineTimer !== undefined)
                    clearTimeout(deadlineTimer);
            }
        },
    };
}
//# sourceMappingURL=client.js.map