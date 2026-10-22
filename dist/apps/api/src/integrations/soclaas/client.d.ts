export declare const APPROVED_SOCLAAS_MODEL = "gemma4:26b";
export declare const SOCLAAS_TIMEOUT_MS = 8000;
export declare const SOCLAAS_RETRY_DELAY_MS = 250;
export declare const SOCLAAS_MAX_RETRIES = 1;
export declare const SOCLAAS_PER_USER_LIMIT = 5;
export declare const SOCLAAS_GLOBAL_LIMIT = 60;
export declare const SOCLAAS_RATE_WINDOW_MS = 60000;
export declare const SOCLAAS_CIRCUIT_FAILURE_THRESHOLD = 5;
export declare const SOCLAAS_CIRCUIT_COOLDOWN_MS = 30000;
export declare const SOCLAAS_MAX_REQUEST_BYTES: number;
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
export declare class SoCLlmError extends Error {
    readonly code: SoCLlmErrorCode;
    readonly retryable: boolean;
    readonly retryCount: number;
    constructor(code: SoCLlmErrorCode, message: string, retryable?: boolean, retryCount?: number);
}
export declare class SoCLlmClient {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly fetcher;
    private readonly now;
    private readonly sleep;
    private readonly audit;
    private readonly userLimiter;
    private readonly globalLimiter;
    private retryableFailures;
    private circuitOpenedAt;
    constructor(options?: SoCLlmClientOptions);
    complete(request: SoCLlmRequest): Promise<SoCLlmResult>;
    private configurationError;
    private isCircuitOpen;
    private recordRetryableFailure;
    private callProvider;
}
export type SoCLlmAdapterErrorCode = 'CONFIGURATION_ERROR' | 'PROVIDER_UNAVAILABLE';
export declare class SoCLlmAdapterError extends Error {
    readonly code: SoCLlmAdapterErrorCode;
    constructor(code: SoCLlmAdapterErrorCode);
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
export declare function createSoCLlmClient(options?: MemberAdapterOptions): Pick<SoCLlmClient, 'complete'>;
export {};
