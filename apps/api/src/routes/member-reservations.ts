import { Router } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireActiveActor } from '../http/auth.js';
import { ApiError, parseRequest } from '../http/errors.js';

const isbnSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[0-9Xx-]+$/, 'ISBN may contain digits, X, and hyphens only.');
const reservationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine((value) => !value.includes('/'), 'Reservation ID cannot contain a slash.');
const createReservationSchema = z.object({ isbn: isbnSchema }).strict();
const listQuerySchema = z
  .object({
    view: z.enum(['pending', 'history']).default('pending'),
    limit: z.preprocess(
      (value) =>
        value === undefined
          ? 20
          : typeof value === 'string' && /^\d+$/.test(value)
            ? Number(value)
            : value,
      z.number().int().min(1).max(50),
    ),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
const cursorSchema = z
  .object({
    memberId: z.string().min(1),
    view: z.enum(['pending', 'history']),
    reservationDateTimeSeconds: z.number().int().safe(),
    reservationDateTimeNanoseconds: z.number().int().min(0).max(999_999_999),
    reservationId: z
      .string()
      .min(1)
      .max(128)
      .refine((value) => !value.includes('/')),
  })
  .strict();

function parseCursor(encoded: string | undefined, memberId: string, view: 'pending' | 'history') {
  if (encoded === undefined) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error();
    const bytes = Buffer.from(encoded, 'base64url');
    if (bytes.toString('base64url') !== encoded) throw new Error();
    const parsed = cursorSchema.parse(JSON.parse(bytes.toString('utf8')));
    if (parsed.memberId !== memberId || parsed.view !== view) throw new Error();
    return parsed;
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.', {
      cursor: 'Use a valid cursor returned for this member and view.',
    });
  }
}

function serialize(value: any): any {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

function encodeCursor(cursor: any) {
  return cursor ? Buffer.from(JSON.stringify(cursor)).toString('base64url') : null;
}

function requireMember(request, _response, next) {
  if (!request.actor || request.actor.accountType !== 'MEMBER') {
    return next(new ApiError(403, 'FORBIDDEN', 'Active member access is required.'));
  }
  return next();
}

export function createMemberReservationRouter(repository, workflows, users) {
  const router = Router();
  const activeMember = [requireActiveActor(users), requireMember];

  router.get('/reservations/by-isbn/:isbn', ...activeMember, async (request, response) => {
    const isbn = parseRequest(isbnSchema, request.params.isbn);
    response.json(await workflows.memberReservation(isbn, request.actor));
  });

  router.get('/reservations', ...activeMember, async (request, response) => {
    const { view, limit, cursor: encodedCursor } = parseRequest(listQuerySchema, request.query);
    const cursor = parseCursor(encodedCursor, request.actor.memberId, view);
    const page = await repository.memberReservations(request.actor, view, limit, cursor);
    response.json(
      serialize({ items: page.items, page: { limit, nextCursor: encodeCursor(page.nextCursor) } }),
    );
  });

  router.post('/reservations', ...activeMember, async (request, response) => {
    const { isbn } = parseRequest(createReservationSchema, request.body);
    response.status(201).json(await workflows.createMemberReservation(isbn, request.actor));
  });

  router.delete('/reservations/:reservationId', ...activeMember, async (request, response) => {
    const reservationId = parseRequest(reservationIdSchema, request.params.reservationId);
    await workflows.cancelMemberReservation(reservationId, request.actor);
    response.status(204).end();
  });

  return router;
}
