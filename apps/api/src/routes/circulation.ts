import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireActiveActor, requireLibrarian } from '../http/auth.js';
import { ApiError, parseRequest } from '../http/errors.js';
import {
  closureReportRequestSchema,
  createLoanRequestSchema,
  loanIdSchema,
  pendingCloseQuerySchema,
  returnPreviewParamsSchema,
  reviewRequestSchema,
  safeCopy,
  safeLoan,
  safeReservation,
  safeTransitionSummary,
} from '../http/circulation-contracts.js';

const cursorSchema = z.object({
  lastBorrowDateTime: z.string().datetime(),
  lastLoanId: loanIdSchema,
}).strict();

function parseCursor(encoded: string | undefined, secret: string) {
  if (!encoded) return undefined;
  try {
    const [payload, signature] = encoded.split('.');
    if (!payload || !signature) throw new Error('Invalid cursor shape.');
    const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
    const actualBytes = Buffer.from(signature, 'base64url');
    const expectedBytes = Buffer.from(expected, 'base64url');
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) throw new Error('Invalid cursor signature.');
    return cursorSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'The pagination cursor is invalid.', { cursor: 'Use a cursor returned by this endpoint.' });
  }
}

function encodeCursor(cursor: any, secret: string) {
  if (!cursor) return null;
  const payload = Buffer.from(JSON.stringify(cursor)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
  return `${payload}.${signature}`;
}

export function createCirculationRouter(workflows: any, users: any, cursorSecret: string) {
  if (!cursorSecret || cursorSecret.length < 32) throw new Error('A circulation cursor secret of at least 32 characters is required.');
  const router = Router();
  const activeActor = requireActiveActor(users);
  const authenticatedLibrarian = [activeActor, requireLibrarian];

  router.post('/librarian/loans', ...authenticatedLibrarian, async (request, response) => {
    const input = parseRequest(createLoanRequestSchema, request.body);
    const result = await workflows.createLoan(input, request.actor);
    response.status(201).json(safeTransitionSummary(result));
  });

  router.get('/librarian/loans/pending-close', ...authenticatedLibrarian, async (request, response) => {
    const query = parseRequest(pendingCloseQuerySchema, request.query);
    const result = await workflows.listPendingClose({ limit: query.limit, cursor: parseCursor(query.cursor, cursorSecret) }, request.actor);
    response.json({
      items: result.items.map((item: any) => ({ loan: safeLoan(item.loan), copy: safeCopy(item.copy) })),
      page: { limit: query.limit, nextCursor: encodeCursor(result.nextCursor, cursorSecret) },
    });
  });

  router.get('/librarian/loans/:loanId/return-preview', ...authenticatedLibrarian, async (request, response) => {
    const { loanId } = parseRequest(returnPreviewParamsSchema, request.params);
    const result = await workflows.returnPreview(loanId, request.actor);
    response.json({
      loan: safeLoan(result.loan),
      copy: safeCopy(result.copy),
      earliestReservation: safeReservation(result.earliestReservation),
      allowedDispositions: result.allowedDispositions,
    });
  });

  router.post('/librarian/loans/:loanId/review', ...authenticatedLibrarian, async (request, response) => {
    const loanId = parseRequest(loanIdSchema, request.params.loanId);
    const input = parseRequest(reviewRequestSchema, request.body);
    const result = await workflows.reviewClosure(loanId, input.decision, input.disposition, request.actor);
    response.json(safeTransitionSummary(result));
  });

  router.post('/member/loans/:loanId/closure-report', activeActor, async (request, response) => {
    const loanId = parseRequest(loanIdSchema, request.params.loanId);
    const { reportType } = parseRequest(closureReportRequestSchema, request.body);
    await workflows.reportClosure(loanId, reportType, request.actor);
    response.status(204).end();
  });

  return router;
}
