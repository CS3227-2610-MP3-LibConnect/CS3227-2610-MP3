const WINDOW_MS = 60_000;
const MEMBER_REQUEST_LIMIT = 5;
const GLOBAL_REQUEST_LIMIT = 60;
const DEFAULT_MAX_MEMBERS = 10_000;
/**
 * Creates bounded, process-local fixed-window quotas for member assistant calls.
 * Counters reset when the process restarts and do not coordinate across multiple
 * processes; the production deployment is expected to run one Express process.
 */
export function createMemberAssistantRateLimiter({ now = Date.now, maxMembers = DEFAULT_MAX_MEMBERS } = {}) {
    if (!Number.isInteger(maxMembers) || maxMembers < 1) {
        throw new RangeError('maxMembers must be a positive integer');
    }
    const memberWindows = new Map();
    let globalWindowStart;
    let globalCount = 0;
    function pruneExpiredMembers(windowStart) {
        for (const [memberId, window] of memberWindows) {
            if (window.windowStart !== windowStart)
                memberWindows.delete(memberId);
        }
    }
    return {
        reserve(memberId) {
            if (typeof memberId !== 'string' || memberId.length === 0)
                return false;
            const currentTime = now();
            const windowStart = Math.floor(currentTime / WINDOW_MS) * WINDOW_MS;
            pruneExpiredMembers(windowStart);
            if (globalWindowStart !== windowStart) {
                globalWindowStart = windowStart;
                globalCount = 0;
            }
            const memberWindow = memberWindows.get(memberId);
            const memberCount = memberWindow?.windowStart === windowStart ? memberWindow.count : 0;
            // Check both limits before recording either reservation. JavaScript runs
            // this synchronous section to completion, so same-process calls cannot
            // interleave between the checks and increments.
            if (globalCount >= GLOBAL_REQUEST_LIMIT || memberCount >= MEMBER_REQUEST_LIMIT)
                return false;
            if (!memberWindow && memberWindows.size >= maxMembers)
                return false;
            if (memberWindow?.windowStart === windowStart) {
                memberWindow.count += 1;
            }
            else {
                memberWindows.set(memberId, { windowStart, count: 1 });
            }
            globalCount += 1;
            return true;
        },
        getTrackedMemberCount() {
            return memberWindows.size;
        },
    };
}
//# sourceMappingURL=rate-limiter.js.map