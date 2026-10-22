import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

const boundedId = z.string().trim().min(1).max(128).refine((value) => !value.includes('/'), 'Identifiers cannot contain a slash.');

export const loanIdSchema = boundedId;
export const createLoanRequestSchema = z.object({ memberId: boundedId, copyId: boundedId }).strict();
export const closureReportRequestSchema = z.object({ reportType: z.enum(['RETURNED', 'LOST']) }).strict();
export const pendingCloseQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(1024).optional(),
}).strict();
export const returnPreviewParamsSchema = z.object({ loanId: loanIdSchema }).strict();
export const reviewRequestSchema = z.object({
  decision: z.enum(['CONFIRM', 'REJECT']),
  disposition: z.enum(['AVAILABLE', 'DAMAGED', 'RESERVED']).optional(),
}).strict().superRefine((input, context) => {
  if (input.decision === 'REJECT' && input.disposition !== undefined) {
    context.addIssue({ code: 'custom', path: ['disposition'], message: 'Rejected reports do not accept a disposition.' });
  }
});

function toJson(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJson(item)]));
  }
  return value;
}

export function safeLoan(loan: any) {
  return toJson({
    loanId: loan.loanId,
    memberId: loan.memberId,
    copyId: loan.copyId,
    isbn: loan.isbn,
    bookTitle: loan.bookTitle,
    borrowDateTime: loan.borrowDateTime,
    dueDate: loan.dueDate,
    returnDateTime: loan.returnDateTime ?? null,
    closureReportType: loan.closureReportType ?? null,
    closureReportedDateTime: loan.closureReportedDateTime ?? null,
    closureReviewedDateTime: loan.closureReviewedDateTime ?? null,
    closureReviewDecision: loan.closureReviewDecision ?? null,
    status: loan.status,
    isRenewed: loan.isRenewed,
  });
}

export function safeCopy(copy: any) {
  return toJson({
    copyId: copy.copyId,
    isbn: copy.isbn,
    shelfLocation: copy.shelfLocation,
    status: copy.status,
    reservationId: copy.reservationId ?? null,
  });
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
  });
}

export function safeNotification(notification: any) {
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

export function safeTransitionSummary(result: any) {
  return {
    loan: safeLoan(result.loan),
    copy: safeCopy(result.copy),
    ...(result.reservation ? { reservation: safeReservation(result.reservation) } : {}),
    ...(result.fine ? { fine: safeFine(result.fine) } : {}),
    ...(result.notification ? { notification: safeNotification(result.notification) } : {}),
  };
}
