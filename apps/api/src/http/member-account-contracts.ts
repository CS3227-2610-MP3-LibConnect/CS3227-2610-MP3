import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

const boundedId = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine((value) => !value.includes('/'), 'Identifiers cannot contain a slash.');

export const memberUserIdSchema = boundedId;

export const memberListQuerySchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().trim().min(1).max(1024).optional(),
  })
  .strict();

export const memberStatusRequestSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE']),
  })
  .strict();

export const memberCursorSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE']).nullable(),
    lastRegistrationDateTime: z.string().datetime(),
    lastUserId: boundedId,
  })
  .strict();

function toJson(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJson(item)]));
  return value;
}

export function safeMemberAccount(member: any) {
  if (!member) return null;
  return toJson({
    userId: member.userId,
    memberId: member.memberId,
    name: member.name,
    email: member.email,
    accountStatus: member.accountStatus,
    registrationDateTime: member.registrationDateTime,
  });
}

export { boundedId, toJson };
