import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireActiveActor, requireLibrarian } from '../http/auth.js';
import { ApiError, parseRequest } from '../http/errors.js';
import {
  emptyBodySchema,
  fineCursorSchema,
  fineIdSchema,
  fineListQuerySchema,
  idempotencyKeySchema,
  librarianMessageSchema,
  reservationCursorSchema,
  reservationIdSchema,
  reservationListQuerySchema,
  safeFine,
  safeLibrarianNotification,
  safeReservation,
} from '../http/reservations-fines-contracts.js';

function parseCursor(encoded: string | undefined, secret: string, schema: z.ZodTypeAny) {
  if (!encoded) return undefined;
  try {
    const [payload, signature] = encoded.split('.');
    if (!payload || !signature) throw new Error('Invalid cursor shape.');
    const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
    const actualBytes = Buffer.from(signature, 'base64url');
    const expectedBytes = Buffer.from(expected, 'base64url');
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) throw new Error('Invalid cursor signature.');
    return schema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
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

export function createReservationsFinesRouter(workflows: any, users: any, cursorSecret: string) {
  if (!cursorSecret || cursorSecret.length < 32) throw new Error('A cursor signing secret of at least 32 characters is required.');
  const router = Router();
  const activeActor = requireActiveActor(users);
  const authenticatedLibrarian = [activeActor, requireLibrarian];

  router.get('/librarian/reservations', ...authenticatedLibrarian, async (request, response) => {
    const query = parseRequest(reservationListQuerySchema, request.query);
    const result = await workflows.listReservations({
      isbn: query.isbn,
      status: query.status,
      limit: query.limit,
      cursor: parseCursor(query.cursor, cursorSecret, reservationCursorSchema),
    }, request.actor);
    response.json({ items: result.items.map(safeReservation), page: { limit: query.limit, nextCursor: encodeCursor(result.nextCursor, cursorSecret) } });
  });

  router.get('/librarian/reservations/:reservationId', ...authenticatedLibrarian, async (request, response) => {
    const { reservationId } = parseRequest(reservationIdSchema, request.params);
    const reservation = await workflows.getLibrarianReservation(reservationId, request.actor);
    response.json({ reservation: safeReservation(reservation) });
  });

  router.get('/librarian/fines', ...authenticatedLibrarian, async (request, response) => {
    const query = parseRequest(fineListQuerySchema, request.query);
    const result = await workflows.listFines({
      status: query.status,
      memberId: query.memberId,
      loanId: query.loanId,
      limit: query.limit,
      cursor: parseCursor(query.cursor, cursorSecret, fineCursorSchema),
    }, request.actor);
    response.json({ items: result.items.map(safeFine), page: { limit: query.limit, nextCursor: encodeCursor(result.nextCursor, cursorSecret) } });
  });

  router.get('/librarian/fines/:fineId', ...authenticatedLibrarian, async (request, response) => {
    const { fineId } = parseRequest(fineIdSchema, request.params);
    const fine = await workflows.getLibrarianFine(fineId, request.actor);
    response.json({ fine: safeFine(fine) });
  });

  router.post('/librarian/fines/:fineId/waive', ...authenticatedLibrarian, async (request, response) => {
    const { fineId } = parseRequest(fineIdSchema, request.params);
    parseRequest(emptyBodySchema, request.body);
    const result = await workflows.waiveFine(fineId, request.actor);
    response.json({ fine: safeFine(result.fine), notification: safeLibrarianNotification(result.notification) });
  });

  router.post('/librarian/notifications', ...authenticatedLibrarian, async (request, response) => {
    const input = parseRequest(librarianMessageSchema, request.body);
    const idempotencyKey = parseRequest(idempotencyKeySchema, request.get('Idempotency-Key'));
    const result = await workflows.sendLibrarianMessage(input, request.actor, idempotencyKey);
    response.status(201).json({ notification: safeLibrarianNotification(result.notification) });
  });

  return router;
}
