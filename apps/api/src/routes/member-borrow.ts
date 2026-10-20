import { Router } from 'express';
import { z } from 'zod';
import { requireActiveActor } from '../http/auth.js';
import { ApiError, parseRequest } from '../http/errors.js';

const copyIdSchema = z.string().trim().min(1).max(128)
    .refine((value) => !value.includes('/'), 'Copy ID cannot contain a slash.');
const addCopySchema = z.object({ copyId: copyIdSchema }).strict();
const confirmBorrowSchema = z.object({
    copyIds: z.array(copyIdSchema).min(1).max(10).refine((copyIds) => new Set(copyIds).size === copyIds.length, 'Copy IDs must be unique.'),
}).strict();
const closureReportSchema = z.object({
    reportType: z.enum(['RETURNED', 'LOST']),
}).strict();
const loanIdSchema = z.string().min(1).max(128)
    .refine((value) => value.trim().length > 0 && !value.includes('/'), 'Loan ID must be nonempty and cannot contain a slash.');
const emptyBodySchema = z.object({}).strict();

function memberLoanSummary(loan) {
    return {
        loanId: loan.loanId,
        bookTitle: loan.bookTitle,
        dueDate: loan.dueDate,
        status: loan.status,
        isRenewed: loan.isRenewed,
        closureReportType: loan.closureReportType,
        returnDateTime: loan.returnDateTime,
    };
}

function requireMember(request, _response, next) {
    if (!request.actor || request.actor.accountType !== 'MEMBER') {
        return next(new ApiError(403, 'FORBIDDEN', 'Active member access is required.'));
    }
    return next();
}

function mapWorkflowError(error) {
    if (error?.code === 'NOT_FOUND') {
        return new ApiError(404, 'NOT_FOUND', error.message);
    }
    return error;
}

export function createMemberBorrowRouter(workflows, users) {
    const router = Router();
    const activeMember = [requireActiveActor(users), requireMember];

    router.get('/loans', ...activeMember, async (request, response) => {
        response.json({ loans: await workflows.memberLoans(request.actor) });
    });

    router.get('/borrow-capacity', ...activeMember, async (request, response) => {
        response.json(await workflows.memberBorrowCapacity(request.actor));
    });

    router.post('/borrow-items', ...activeMember, async (request, response) => {
        const { copyId } = parseRequest(addCopySchema, request.body);
        try {
            response.json(await workflows.checkMemberBorrowCopy(copyId, request.actor));
        }
        catch (error) {
            throw mapWorkflowError(error);
        }
    });

    router.post('/loans', ...activeMember, async (request, response) => {
        const { copyIds } = parseRequest(confirmBorrowSchema, request.body);
        const outcomes = await workflows.confirmMemberBorrow(copyIds, request.actor);
        response.status(201).json({ outcomes });
    });

    router.post('/loans/:loanId/renew', ...activeMember, async (request, response) => {
        const loanId = parseRequest(loanIdSchema, request.params.loanId);
        if (request.body !== undefined) {
            parseRequest(emptyBodySchema, request.body);
        }
        try {
            const loan = await workflows.renewMemberLoan(loanId, request.actor);
            response.json({ loan: memberLoanSummary(loan) });
        }
        catch (error) {
            throw mapWorkflowError(error);
        }
    });

    router.post('/loans/:loanId/closure-report', ...activeMember, async (request, response) => {
        const { reportType } = parseRequest(closureReportSchema, request.body);
        try {
            await workflows.reportClosure(request.params.loanId, reportType, request.actor);
            response.json({ success: true });
        }
        catch (error) {
            throw mapWorkflowError(error);
        }
    });

    return router;
}
