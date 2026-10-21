import type { MemberAssistantRateLimiter } from '../assistant/rate-limiter.js';
import { type MemberAssistantActor } from '../assistant/service.js';
export declare function createMemberAssistantRouter(service: {
    answer(input: {
        actor: MemberAssistantActor;
        question: string;
        history?: unknown;
    }): Promise<{
        answer: string;
    }>;
}, limiter: Pick<MemberAssistantRateLimiter, 'reserve'>, users: any): import("express-serve-static-core").Router;
