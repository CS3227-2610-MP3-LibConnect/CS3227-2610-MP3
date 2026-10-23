import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { requireActiveActor, requireLibrarian } from '../http/auth.js';
import {
  memberCursorSchema,
  memberListQuerySchema,
  memberStatusRequestSchema,
  memberUserIdSchema,
  safeMemberAccount,
} from '../http/member-account-contracts.js';
import { ApiError, parseRequest } from '../http/errors.js';

function parseCursor(encoded: string | undefined, secret: string) {
  if (!encoded) return undefined;
  try {
    const parts = encoded.split('.');
    if (parts.length !== 2) throw new Error('Invalid cursor shape.');
    const [payload, signature] = parts;
    const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
    const actualBytes = Buffer.from(signature, 'base64url');
    const expectedBytes = Buffer.from(expected, 'base64url');
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes))
      throw new Error('Invalid cursor signature.');
    return memberCursorSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'The pagination cursor is invalid.', {
      cursor: 'Use a cursor returned by this endpoint.',
    });
  }
}

function encodeCursor(cursor: any, secret: string) {
  if (!cursor) return null;
  const payload = Buffer.from(JSON.stringify(cursor)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
  return `${payload}.${signature}`;
}

export function createLibrarianMemberRouter(accounts: any, users: any, cursorSecret: string) {
  if (!cursorSecret || cursorSecret.length < 32)
    throw new Error('A member cursor secret of at least 32 characters is required.');
  const router = Router();
  const activeActor = requireActiveActor(users);
  const authenticatedLibrarian = [activeActor, requireLibrarian];

  router.get('/members', ...authenticatedLibrarian, async (request, response) => {
    const query = parseRequest(memberListQuerySchema, request.query);
    const result = await accounts.listMembers(
      {
        status: query.status,
        limit: query.limit,
        cursor: parseCursor(query.cursor, cursorSecret),
      },
      request.actor,
    );
    response.json({
      items: result.items.map(safeMemberAccount),
      page: { limit: query.limit, nextCursor: encodeCursor(result.nextCursor, cursorSecret) },
    });
  });

  router.get('/members/:userId', ...authenticatedLibrarian, async (request, response) => {
    const userId = parseRequest(memberUserIdSchema, request.params.userId);
    const member = await accounts.getMember(userId, request.actor);
    response.json({ member: safeMemberAccount(member) });
  });

  router.patch('/members/:userId/status', ...authenticatedLibrarian, async (request, response) => {
    const userId = parseRequest(memberUserIdSchema, request.params.userId);
    const { status } = parseRequest(memberStatusRequestSchema, request.body);
    const member = await accounts.updateMemberStatus(userId, status, request.actor);
    response.json({ member: safeMemberAccount(member) });
  });

  return router;
}
