import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
const id = z.string().trim().min(1);
const timestamp = z.instanceof(Timestamp);
const requiredText = z.string().trim().min(1);
export const AccountType = z.enum(['MEMBER', 'LIBRARIAN']);
export const AccountStatus = z.enum(['ACTIVE', 'INACTIVE']);
export const CopyStatus = z.enum(['AVAILABLE', 'IN_TRANSIT', 'ON_LOAN', 'DAMAGED', 'LOST', 'RESERVED']);
export const LoanStatus = z.enum(['ACTIVE', 'PENDING_CLOSE', 'CLOSED_RETURNED', 'CLOSED_LOST']);
export const ClosureReportType = z.enum(['RETURNED', 'LOST']);
export const ReservationStatus = z.enum(['PENDING', 'FULFILLED', 'CANCELLED', 'EXPIRED']);
export const FineStatus = z.enum(['OUTSTANDING', 'PAID', 'WAIVED']);
export const NotificationType = z.enum(['OVERDUE_ALERT', 'RESERVATION_READY', 'FINE_ISSUED', 'FINE_UPDATED', 'LIBRARIAN_MESSAGE']);
export const NotificationReferenceType = z.enum(['LOAN', 'RESERVATION', 'FINE']);
export const UserRecordSchema = z.object({
    userId: id,
    name: requiredText,
    email: z.string().trim().email(),
    emailCanonical: z.string().min(1),
    passwordHash: z.string().min(1),
    registrationDateTime: timestamp,
    accountType: AccountType,
    accountStatus: AccountStatus,
    authVersion: z.number().int().nonnegative().default(0),
    memberId: id.optional(),
    employeeId: id.optional(),
    employeeIdCanonical: z.string().min(1).optional(),
    isManager: z.boolean().optional(),
}).superRefine((user, context) => {
    if (user.accountType === 'MEMBER' && !user.memberId)
        context.addIssue({ code: 'custom', path: ['memberId'], message: 'Members require memberId.' });
    if (user.accountType === 'LIBRARIAN' && (!user.employeeId || user.isManager === undefined))
        context.addIssue({ code: 'custom', path: ['employeeId'], message: 'Librarians require employeeId and isManager.' });
});
export const BookRecordSchema = z.object({
    isbn: id, title: requiredText, author: z.union([requiredText, z.array(requiredText).min(1)]),
    publicationYear: z.number().int().min(0), publisher: requiredText, category: requiredText,
    synopsis: z.string(), createdAt: timestamp, updatedAt: timestamp,
});
export const BookCopyRecordSchema = z.object({
    copyId: id, isbn: id, shelfLocation: z.union([requiredText, z.null()]), status: CopyStatus,
    reservationId: id.nullable().optional(), createdAt: timestamp, updatedAt: timestamp,
});
export const LoanRecordSchema = z.object({
    loanId: id, memberId: id, copyId: id, isbn: id, bookTitle: requiredText,
    borrowDateTime: timestamp, dueDate: timestamp, returnDateTime: timestamp.nullable(),
    closureReportType: ClosureReportType.nullable(), closureReportedDateTime: timestamp.nullable(),
    closureReviewedDateTime: timestamp.nullable(), status: LoanStatus, isRenewed: z.boolean(),
}).superRefine((loan, context) => {
    if (loan.status === 'PENDING_CLOSE' && (!loan.closureReportType || !loan.closureReportedDateTime))
        context.addIssue({ code: 'custom', path: ['closureReportType'], message: 'Pending closure requires report type and report time.' });
});
export const ReservationRecordSchema = z.object({
    reservationId: id, memberId: id, isbn: id, copyId: id.nullable(), reservationDateTime: timestamp,
    expiryDate: timestamp.nullable(), status: ReservationStatus, updatedAt: timestamp.optional(),
});
export const FineRecordSchema = z.object({
    fineId: id, loanId: id, memberId: id, bookTitle: requiredText,
    amountMinorUnits: z.number().int().positive().safe(), currency: z.literal('SGD'), reason: requiredText,
    status: FineStatus, issuedDateTime: timestamp, paidDateTime: timestamp.nullable(), waivedDateTime: timestamp.nullable(),
});
export const NotificationRecordSchema = z.object({
    notificationId: id, recipientUserId: id, notificationType: NotificationType,
    referenceType: NotificationReferenceType.nullable(), referenceId: id.nullable(),
    message: requiredText, createdAt: timestamp, read: z.boolean(),
}).superRefine((notification, context) => {
    if ((notification.referenceType === null) !== (notification.referenceId === null))
        context.addIssue({ code: 'custom', path: ['referenceId'], message: 'Reference type and ID must be both set or both null.' });
});
export const IdentityKeyRecordSchema = z.object({ kind: z.enum(['EMAIL', 'MEMBER_ID', 'EMPLOYEE_ID']), ownerUserId: id, canonicalValue: z.string().min(1), createdAt: timestamp });
export function canonicalizeEmail(email) {
    return email.trim().toLowerCase();
}
export function canonicalizeIdentity(value) {
    return value.trim().toLowerCase();
}
//# sourceMappingURL=records.js.map