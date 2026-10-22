import { Router } from 'express';
import { z } from 'zod';
import { requireActiveActor } from '../http/auth.js';
import { ApiError, parseRequest } from '../http/errors.js';
import { MemberAssistantCapacityUnavailableError } from '../assistant/service.js';
const turnSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(1_000),
}).strict();
const chatRequestSchema = z.object({
    question: z.string().trim().min(1).max(2_000),
    history: z.array(turnSchema).max(10).optional(),
}).strict();
const rateLimitedError = new ApiError(429, 'AI_RATE_LIMITED', 'The assistant request limit has been reached. Please try again shortly.');
const unavailableError = new ApiError(503, 'AI_UNAVAILABLE', 'The assistant is temporarily unavailable. Please try again later.');
const memberLoanDataUnavailableError = new ApiError(503, 'AI_MEMBER_DATA_UNAVAILABLE', 'Your member loan data is temporarily unavailable. Please check My Loans (/member/profile/loans).');
const borrowingCapacityUnavailableError = new ApiError(503, 'AI_MEMBER_DATA_UNAVAILABLE', 'Your borrowing capacity is temporarily unavailable. Please check Borrow (/member/borrow).');
function requireMember(request, _response, next) {
    if (!request.actor || request.actor.accountType !== 'MEMBER' || !request.actor.memberId) {
        return next(new ApiError(403, 'FORBIDDEN', 'Active member access is required.'));
    }
    return next();
}
export function createMemberAssistantRouter(service, limiter, users) {
    const router = Router();
    router.post('/assistant/chat', requireActiveActor(users), requireMember, async (request, response) => {
        const body = parseRequest(chatRequestSchema, request.body);
        const actor = request.actor;
        // Reserve synchronously before entering the service, so rejected requests
        // cannot perform member data lookups or make provider calls.
        if (!limiter.reserve(actor.memberId))
            throw rateLimitedError;
        try {
            const result = await service.answer({ actor, question: body.question, history: body.history });
            if (!result || typeof result.answer !== 'string' || !result.answer.trim()) {
                throw unavailableError;
            }
            response.json({ answer: result.answer });
        }
        catch (error) {
            if (error instanceof MemberAssistantCapacityUnavailableError) {
                throw error.intent === 'loan-count' ? memberLoanDataUnavailableError : borrowingCapacityUnavailableError;
            }
            // Keep provider, configuration, storage, and malformed-service details out
            // of the public API response.
            throw unavailableError;
        }
    });
    return router;
}
//# sourceMappingURL=member-assistant.js.map