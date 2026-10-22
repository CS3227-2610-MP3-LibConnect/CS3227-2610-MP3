import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

const boundedId = z.string().trim().min(1).max(128).refine((value) => !value.includes('/'), 'Identifiers cannot contain a slash.');
const isbn = z.string().trim().min(1).max(32).regex(/^[0-9Xx-]+$/, 'ISBN may contain digits, X, and hyphens only.');
const cursor = z.string().trim().min(1).max(1024);

export const reservationStatus = z.enum(['PENDING', 'FULFILLED', 'CANCELLED', 'EXPIRED']);
export const fineStatus = z.enum(['OUTSTANDING', 'PAID', 'WAIVED']);

export const reservationListQuerySchema = z.object({
  isbn: isbn.optional(),
  status: reservationStatus.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: cursor.optional(),
}).strict();

export const fineListQuerySchema = z.object({
  status: fineStatus.optional(),
  memberId: boundedId.optional(),
  loanId: boundedId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: cursor.optional(),
}).strict();

export const reservationIdSchema = z.object({ reservationId: boundedId }).strict();
export const fineIdSchema = z.object({ fineId: boundedId }).strict();
export const emptyBodySchema = z.object({}).strict();
export const librarianMessageSchema = z.object({
  memberId: boundedId,
  message: z.string().trim().min(1).max(2_000),
}).strict();

export const memberReservationCreateSchema = z.object({ isbn }).strict();
export const memberReservationListQuerySchema = z.object({
  status: reservationStatus.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: cursor.optional(),
}).strict();
export const memberFineListQuerySchema = z.object({
  status: fineStatus.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: cursor.optional(),
}).strict();
export const memberNotificationListQuerySchema = z.object({
  unread: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: cursor.optional(),
}).strict();

export const memberIntegrationContract = Object.freeze({
  reservationCreate: 'POST /api/v1/member/reservations',
  reservationCancel: 'POST /api/v1/member/reservations/:reservationId/cancel',
  finePay: 'POST /api/v1/member/fines/:fineId/pay',
  notificationList: 'GET /api/v1/member/notifications',
  notificationRead: 'POST /api/v1/member/notifications/:notificationId/read',
  authorization: 'server-loaded active member and owning memberId only',
  noPartialWrite: 'duplicate, foreign, stale, and invalid-state requests commit no mutation',
});

export const idempotencyKeySchema = z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9._~-]+$/, 'Idempotency-Key contains unsupported characters.');

export const reservationCursorSchema = z.object({
  filterKey: z.string().length(64).regex(/^[0-9a-f]{64}$/),
  lastReservationDateTime: z.string().datetime(),
  lastReservationId: boundedId,
}).strict();

export const fineCursorSchema = z.object({
  filterKey: z.string().length(64).regex(/^[0-9a-f]{64}$/),
  lastIssuedDateTime: z.string().datetime(),
  lastFineId: boundedId,
}).strict();

function toJson(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJson(item)]));
  return value;
}

export function safeReservation(reservation: any) {
  if (!reservation) return null;
  return toJson({
    reservationId: reservation.reservationId,
    memberId: reservation.memberId,
    isbn: reservation.isbn,
    copyId: reservation.copyId ?? null,
    reservationDateTime: reservation.reservationDateTime,
    expiryDate: reservation.expiryDate ?? null,
    status: reservation.status,
  });
}

export function safeFine(fine: any) {
  if (!fine) return null;
  return toJson({
    fineId: fine.fineId,
    loanId: fine.loanId,
    memberId: fine.memberId,
    bookTitle: fine.bookTitle,
    amountMinorUnits: fine.amountMinorUnits,
    currency: fine.currency,
    reason: fine.reason,
    status: fine.status,
    issuedDateTime: fine.issuedDateTime,
    paidDateTime: fine.paidDateTime ?? null,
    waivedDateTime: fine.waivedDateTime ?? null,
  });
}

export function safeNotification(notification: any) {
  if (!notification) return null;
  return toJson({
    notificationId: notification.notificationId,
    recipientUserId: notification.recipientUserId,
    notificationType: notification.notificationType,
    referenceType: notification.referenceType,
    referenceId: notification.referenceId,
    message: notification.message,
    createdAt: notification.createdAt,
    read: notification.read,
  });
}

export function safeLibrarianNotification(notification: any) {
  if (!notification) return null;
  return toJson({
    notificationId: notification.notificationId,
    notificationType: notification.notificationType,
    referenceType: notification.referenceType,
    referenceId: notification.referenceId,
    message: notification.message,
    createdAt: notification.createdAt,
    read: notification.read,
  });
}

export function filterKey(kind: 'reservations' | 'fines', filters: Record<string, unknown>): string {
  const normalized = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''));
  return `${kind}:${JSON.stringify(normalized)}`;
}

export { boundedId, isbn, toJson };
