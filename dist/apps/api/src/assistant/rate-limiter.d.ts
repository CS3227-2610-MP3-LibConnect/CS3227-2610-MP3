export type MemberAssistantRateLimiter = {
    reserve(memberId: string): boolean;
    getTrackedMemberCount(): number;
};
export type MemberAssistantRateLimiterOptions = {
    now?: () => number;
    maxMembers?: number;
};
/**
 * Creates bounded, process-local fixed-window quotas for member assistant calls.
 * Counters reset when the process restarts and do not coordinate across multiple
 * processes; the production deployment is expected to run one Express process.
 */
export declare function createMemberAssistantRateLimiter({ now, maxMembers }?: MemberAssistantRateLimiterOptions): MemberAssistantRateLimiter;
