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
export declare class SoCLlmAdapterError extends Error {
    readonly code: SoCLlmAdapterErrorCode;
    constructor(code: SoCLlmAdapterErrorCode);
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
export declare function createSoCLlmClient(options?: SoCLlmClientOptions): SoCLlmClient;
export {};
