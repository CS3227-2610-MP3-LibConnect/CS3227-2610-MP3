import { Router } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireActiveActor } from '../http/auth.js';
import { ApiError, parseRequest } from '../http/errors.js';
import { StorageError } from '../storage/repositories.js';

const listQuerySchema = z.object({
  view: z.enum(['outstanding', 'history']).default('outstanding'),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(50)).optional().transform((value) => value ?? 20),
  cursor: z.string().min(1).max(1024).optional(),
}).strict();
const cursorSchema = z.object({
  memberId: z.string().min(1).max(128),
  view: z.literal('history'),
  issuedDateTimeSeconds: z.number().int().safe(),
  issuedDateTimeNanoseconds: z.number().int().min(0).max(999_999_999),
  fineId: z.string().min(1).max(128).refine((value) => !value.includes('/')),
}).strict();
const fineIdSchema = z.string().trim().min(1).max(128).refine((value) => !value.includes('/'), 'Fine ID cannot contain a slash.');
const emptyBodySchema = z.object({}).strict();

function requireMember(request: any, _response: any, next: (error?: unknown) => void) {
  if (!request.actor || request.actor.accountType !== 'MEMBER')
    return next(new ApiError(403, 'FORBIDDEN', 'Active member access is required.'));
  return next();
}

function serialize(value: any): any {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

function parseCursor(encoded: string | undefined, memberId: string, view: string) {
  if (encoded === undefined) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error();
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    if (Buffer.from(decoded, 'utf8').toString('base64url') !== encoded) throw new Error();
    const parsed = cursorSchema.parse(JSON.parse(decoded));
    if (parsed.memberId !== memberId || parsed.view !== view) throw new Error();
    return parsed;
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.', { cursor: 'Use a valid cursor returned for this member and view.' });
  }
}

function encodeCursor(cursor: any) {
  return cursor ? Buffer.from(JSON.stringify(cursor)).toString('base64url') : null;
}

export function createMemberFinesRouter(repository: any, workflows: any, users: any) {
  const router = Router();
  const activeMember = [requireActiveActor(users), requireMember];

  router.get('/fines', ...activeMember, async (request: any, response: any) => {
    const { view, limit, cursor: encodedCursor } = parseRequest(listQuerySchema, request.query);
    const cursor = parseCursor(encodedCursor, request.actor.memberId, view);
    const page = await repository.memberFines(request.actor, view, limit, cursor);
    response.json(serialize({ items: page.items, page: { limit, nextCursor: encodeCursor(page.nextCursor) } }));
  });

  router.post('/fines/:fineId/pay', ...activeMember, async (request: any, response: any) => {
    const fineId = parseRequest(fineIdSchema, request.params.fineId);
    parseRequest(emptyBodySchema.optional(), request.body);
    try {
      await workflows.payFine(fineId, request.actor);
      response.json({ success: true });
    } catch (error: any) {
      if (error instanceof StorageError && error.code === 'FORBIDDEN')
        throw new ApiError(403, 'FORBIDDEN', 'This fine cannot be accessed by the current member.');
      if (error instanceof StorageError && error.code === 'CONFLICT')
        throw new ApiError(409, 'CONFLICT', 'This fine is no longer outstanding. Refresh the fine list and try again.');
      if (error instanceof StorageError && error.code === 'NOT_FOUND')
        throw new ApiError(404, 'NOT_FOUND', 'The requested fine was not found.');
      throw error;
    }
  });

  return router;
}
