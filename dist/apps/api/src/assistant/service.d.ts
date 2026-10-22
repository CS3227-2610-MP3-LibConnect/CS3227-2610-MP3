import type { SoCLlmClient } from '../integrations/soclaas/client.js';
import { classifyMemberAssistantIntent } from './faq.js';
export type MemberAssistantActor = {
    accountType: 'MEMBER';
    userId: string;
    memberId: string;
};
type Capacity = {
    openLoanCount: number;
    remainingSlots: number;
};
export declare class MemberAssistantServiceError extends Error {
    readonly code = "AI_INVALID_RESPONSE";
    constructor();
}
export type MemberAssistantPersonalizedIntent = Exclude<ReturnType<typeof classifyMemberAssistantIntent>, null>;
export declare class MemberAssistantCapacityUnavailableError extends Error {
    readonly code = "AI_MEMBER_DATA_UNAVAILABLE";
    readonly intent: MemberAssistantPersonalizedIntent;
    constructor(intent: MemberAssistantPersonalizedIntent);
}
export type MemberAssistantServiceDependencies = {
    workflows: {
        memberBorrowCapacity(actor: MemberAssistantActor): Promise<Capacity>;
    };
    socClient: Pick<SoCLlmClient, 'complete'>;
};
export declare function createMemberAssistantService(dependencies: MemberAssistantServiceDependencies): {
    answer(input: {
        actor: MemberAssistantActor;
        question: string;
        history?: unknown;
    }): Promise<{
        answer: string;
    }>;
};
export {};
