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
//# sourceMappingURL=client.js.map