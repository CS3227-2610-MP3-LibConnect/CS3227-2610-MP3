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
export class SoCLlmError extends Error {
    code;
    retryable;
    retryCount;
    constructor(code, message, retryable = false, retryCount = 0) {
        super(message);
        this.name = 'SoCLlmError';
        this.code = code;
        this.retryable = retryable;
        this.retryCount = retryCount;
    }
}
class SlidingWindowLimiter {
    now;
    timestamps = new Map();
    constructor(now) {
        this.now = now;
    }
    consume(key, limit) {
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
function validBaseUrl(value) {
    if (!value)
        return null;
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
            return null;
        return url.toString().replace(/\/$/, '');
    }
    catch {
        return null;
    }
}
function errorStatus(error) {
    return error instanceof Response ? error.status : null;
}
async function readBoundedResponseBody(response, maxBytes) {
    const contentLength = response.headers.get('content-length');
    if (contentLength !== null) {
        const normalizedLength = contentLength.trim();
        if (!/^\d+$/.test(normalizedLength) || Number(normalizedLength) > maxBytes) {
            throw new Error('Provider response is too large or malformed.');
        }
    }
    if (!response.body)
        return '';
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (!(value instanceof Uint8Array))
                throw new Error('Malformed provider response.');
            totalBytes += value.byteLength;
            if (totalBytes > maxBytes)
                throw new Error('Provider response is too large.');
            chunks.push(value);
        }
    }
    catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    }
    finally {
        reader.releaseLock();
    }
    return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes));
}
export class SoCLlmClient {
    apiKey;
    baseUrl;
    fetcher;
    now;
    sleep;
    audit;
    userLimiter;
    globalLimiter;
    retryableFailures = [];
    circuitOpenedAt = null;
    constructor(options = {}) {
        this.apiKey = options.apiKey ?? process.env.SOCLAAS_API_KEY;
        this.baseUrl = validBaseUrl(options.baseUrl ?? process.env.SOCLAAS_BASE_URL);
        this.fetcher = options.fetcher ?? fetch;
        this.now = options.now ?? Date.now;
        this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
        this.audit = options.audit ?? ((metadata) => console.info('ai.assistant', JSON.stringify(metadata)));
        this.userLimiter = new SlidingWindowLimiter(this.now);
        this.globalLimiter = new SlidingWindowLimiter(this.now);
    }
    async complete(request) {
        if (!request || typeof request.actorId !== 'string' || !request.actorId.trim()
            || request.feature !== 'librarian-assistant' || !Array.isArray(request.messages) || request.messages.length === 0) {
            throw new SoCLlmError('MALFORMED', 'The AI request is invalid.');
        }
        const correlationId = randomUUID();
        const timestamp = new Date(this.now()).toISOString();
        const baseAudit = { actorReference: request.actorId, feature: request.feature, model: APPROVED_SOCLAAS_MODEL, timestamp, correlationId };
        const configurationError = this.configurationError();
        if (configurationError) {
            this.audit({ ...baseAudit, resultCategory: 'configuration', retryCount: 0 });
            throw configurationError;
        }
        const requestBytes = Buffer.byteLength(JSON.stringify({ model: APPROVED_SOCLAAS_MODEL, messages: request.messages, reasoning_effort: 'none' }), 'utf8');
        if (requestBytes > SOCLAAS_MAX_REQUEST_BYTES) {
            this.audit({ ...baseAudit, resultCategory: 'malformed', retryCount: 0 });
            throw new SoCLlmError('MALFORMED', 'The AI request is too large.');
        }
        if (!this.globalLimiter.consume('global', SOCLAAS_GLOBAL_LIMIT) || !this.userLimiter.consume(request.actorId, SOCLAAS_PER_USER_LIMIT)) {
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
            }
            catch (error) {
                const status = errorStatus(error);
                const retryable = status === 429 || (status !== null && status >= 500 && status <= 599) || error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError');
                if (!retryable || retryCount >= SOCLAAS_MAX_RETRIES) {
                    if (retryable)
                        this.recordRetryableFailure();
                    const mapped = new SoCLlmError('UNAVAILABLE', 'The AI provider is unavailable.', retryable, retryCount);
                    this.audit({ ...baseAudit, resultCategory: 'unavailable', retryCount });
                    throw mapped;
                }
                retryCount += 1;
                await this.sleep(SOCLAAS_RETRY_DELAY_MS);
            }
        }
    }
    configurationError() {
        if (!this.apiKey || !this.baseUrl)
            return new SoCLlmError('CONFIGURATION', 'The AI provider is not configured.');
        return null;
    }
    isCircuitOpen() {
        if (this.circuitOpenedAt === null)
            return false;
        if (this.now() - this.circuitOpenedAt >= SOCLAAS_CIRCUIT_COOLDOWN_MS) {
            this.circuitOpenedAt = null;
            this.retryableFailures = [];
            return false;
        }
        return true;
    }
    recordRetryableFailure() {
        const cutoff = this.now() - SOCLAAS_RATE_WINDOW_MS;
        this.retryableFailures = this.retryableFailures.filter((timestamp) => timestamp > cutoff);
        this.retryableFailures.push(this.now());
        if (this.retryableFailures.length >= SOCLAAS_CIRCUIT_FAILURE_THRESHOLD)
            this.circuitOpenedAt = this.now();
    }
    async callProvider(messages, correlationId) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), SOCLAAS_TIMEOUT_MS);
        try {
            const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId },
                body: JSON.stringify({ model: APPROVED_SOCLAAS_MODEL, messages, reasoning_effort: 'none' }),
                signal: controller.signal,
            });
            if (!response.ok)
                throw response;
            let body;
            try {
                body = JSON.parse(await readBoundedResponseBody(response, SOCLAAS_MAX_REQUEST_BYTES));
            }
            catch {
                throw new Error('Malformed provider response.');
            }
            const content = body?.choices?.[0]?.message?.content;
            if (typeof content !== 'string' || content.trim().length === 0 || content.length > SOCLAAS_MAX_REQUEST_BYTES)
                throw new Error('Malformed provider response.');
            return content;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
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
const MEMBER_TOTAL_DEADLINE_MS = 15_000;
const MEMBER_RETRY_DELAY_MS = 100;
function memberAdapterConfiguration(env) {
    const baseUrl = env.SOCLAAS_BASE_URL?.trim();
    const apiKey = env.SOCLAAS_API_KEY?.trim();
    const model = env.SOCLAAS_MODEL?.trim();
    if (!baseUrl || !apiKey || !model)
        return null;
    try {
        const parsed = new URL(baseUrl);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash)
            return null;
        return { endpoint: `${baseUrl.replace(/\/+$/, '')}/chat/completions`, apiKey, model };
    }
    catch {
        return null;
    }
}
function validMemberRequest(request) {
    return Boolean(request)
        && request.feature === 'member-assistant'
        && Array.isArray(request.messages)
        && request.messages.length > 0
        && request.messages.every((message) => message
            && (message.role === 'system' || message.role === 'user' || message.role === 'assistant')
            && typeof message.content === 'string');
}
function memberAdapterFailure() {
    return new SoCLlmAdapterError('PROVIDER_UNAVAILABLE');
}
export function createSoCLlmClient(options = {}) {
    const env = options.env ?? process.env;
    const fetcher = options.fetch ?? globalThis.fetch;
    return {
        async complete(request) {
            const config = memberAdapterConfiguration(env);
            if (!config)
                throw new SoCLlmAdapterError('CONFIGURATION_ERROR');
            if (!validMemberRequest(request))
                throw memberAdapterFailure();
            const controller = new AbortController();
            let deadlineTimer;
            const deadline = new Promise((_resolve, reject) => {
                deadlineTimer = setTimeout(() => {
                    controller.abort();
                    reject(memberAdapterFailure());
                }, MEMBER_TOTAL_DEADLINE_MS);
            });
            const startedAt = Date.now();
            try {
                for (let attempt = 0; attempt < 2; attempt += 1) {
                    if (Date.now() - startedAt >= MEMBER_TOTAL_DEADLINE_MS)
                        throw memberAdapterFailure();
                    try {
                        const response = await Promise.race([
                            fetcher(config.endpoint, {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ model: config.model, messages: request.messages, reasoning_effort: 'none' }),
                                signal: controller.signal,
                            }),
                            deadline,
                        ]);
                        if (!response.ok) {
                            if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
                                await Promise.race([new Promise((resolve) => setTimeout(resolve, MEMBER_RETRY_DELAY_MS)), deadline]);
                                continue;
                            }
                            throw memberAdapterFailure();
                        }
                        let body;
                        try {
                            body = JSON.parse(await Promise.race([readBoundedResponseBody(response, SOCLAAS_MAX_REQUEST_BYTES), deadline]));
                        }
                        catch {
                            throw memberAdapterFailure();
                        }
                        const choices = body?.choices;
                        const model = body?.model;
                        if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object'
                            || typeof model !== 'string' || !model)
                            throw memberAdapterFailure();
                        const message = choices[0].message;
                        if (!message || typeof message !== 'object'
                            || message.role !== 'assistant'
                            || typeof message.content !== 'string')
                            throw memberAdapterFailure();
                        return { content: message.content, model };
                    }
                    catch (error) {
                        if (error instanceof SoCLlmAdapterError)
                            throw error;
                        if (controller.signal.aborted || attempt > 0)
                            throw memberAdapterFailure();
                        await Promise.race([new Promise((resolve) => setTimeout(resolve, MEMBER_RETRY_DELAY_MS)), deadline]);
                    }
                }
                throw memberAdapterFailure();
            }
            finally {
                if (deadlineTimer !== undefined)
                    clearTimeout(deadlineTimer);
            }
        },
    };
}
//# sourceMappingURL=client.js.map