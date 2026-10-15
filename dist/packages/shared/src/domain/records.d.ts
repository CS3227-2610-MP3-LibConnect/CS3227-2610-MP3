import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
export declare const AccountType: z.ZodEnum<{
    MEMBER: "MEMBER";
    LIBRARIAN: "LIBRARIAN";
}>;
export declare const AccountStatus: z.ZodEnum<{
    ACTIVE: "ACTIVE";
    INACTIVE: "INACTIVE";
}>;
export declare const CopyStatus: z.ZodEnum<{
    AVAILABLE: "AVAILABLE";
    IN_TRANSIT: "IN_TRANSIT";
    ON_LOAN: "ON_LOAN";
    DAMAGED: "DAMAGED";
    LOST: "LOST";
    RESERVED: "RESERVED";
}>;
export declare const LoanStatus: z.ZodEnum<{
    ACTIVE: "ACTIVE";
    PENDING_CLOSE: "PENDING_CLOSE";
    CLOSED_RETURNED: "CLOSED_RETURNED";
    CLOSED_LOST: "CLOSED_LOST";
}>;
export declare const ClosureReportType: z.ZodEnum<{
    LOST: "LOST";
    RETURNED: "RETURNED";
}>;
export declare const ReservationStatus: z.ZodEnum<{
    PENDING: "PENDING";
    FULFILLED: "FULFILLED";
    CANCELLED: "CANCELLED";
    EXPIRED: "EXPIRED";
}>;
export declare const FineStatus: z.ZodEnum<{
    OUTSTANDING: "OUTSTANDING";
    PAID: "PAID";
    WAIVED: "WAIVED";
}>;
export declare const NotificationType: z.ZodEnum<{
    OVERDUE_ALERT: "OVERDUE_ALERT";
    RESERVATION_READY: "RESERVATION_READY";
    FINE_ISSUED: "FINE_ISSUED";
    FINE_UPDATED: "FINE_UPDATED";
    LIBRARIAN_MESSAGE: "LIBRARIAN_MESSAGE";
}>;
export declare const NotificationReferenceType: z.ZodEnum<{
    LOAN: "LOAN";
    RESERVATION: "RESERVATION";
    FINE: "FINE";
}>;
export declare const UserRecordSchema: z.ZodObject<{
    userId: z.ZodString;
    name: z.ZodString;
    email: z.ZodString;
    emailCanonical: z.ZodString;
    passwordHash: z.ZodString;
    registrationDateTime: z.ZodInstanceOf<Timestamp>;
    accountType: z.ZodEnum<{
        MEMBER: "MEMBER";
        LIBRARIAN: "LIBRARIAN";
    }>;
    accountStatus: z.ZodEnum<{
        ACTIVE: "ACTIVE";
        INACTIVE: "INACTIVE";
    }>;
    memberId: z.ZodOptional<z.ZodString>;
    employeeId: z.ZodOptional<z.ZodString>;
    employeeIdCanonical: z.ZodOptional<z.ZodString>;
    isManager: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const BookRecordSchema: z.ZodObject<{
    isbn: z.ZodString;
    title: z.ZodString;
    author: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>;
    publicationYear: z.ZodNumber;
    publisher: z.ZodString;
    category: z.ZodString;
    synopsis: z.ZodString;
    createdAt: z.ZodInstanceOf<Timestamp>;
    updatedAt: z.ZodInstanceOf<Timestamp>;
}, z.core.$strip>;
export declare const BookCopyRecordSchema: z.ZodObject<{
    copyId: z.ZodString;
    isbn: z.ZodString;
    shelfLocation: z.ZodString;
    status: z.ZodEnum<{
        AVAILABLE: "AVAILABLE";
        IN_TRANSIT: "IN_TRANSIT";
        ON_LOAN: "ON_LOAN";
        DAMAGED: "DAMAGED";
        LOST: "LOST";
        RESERVED: "RESERVED";
    }>;
    reservationId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodInstanceOf<Timestamp>;
    updatedAt: z.ZodInstanceOf<Timestamp>;
}, z.core.$strip>;
export declare const LoanRecordSchema: z.ZodObject<{
    loanId: z.ZodString;
    memberId: z.ZodString;
    copyId: z.ZodString;
    isbn: z.ZodString;
    bookTitle: z.ZodString;
    borrowDateTime: z.ZodInstanceOf<Timestamp>;
    dueDate: z.ZodInstanceOf<Timestamp>;
    returnDateTime: z.ZodNullable<z.ZodInstanceOf<Timestamp>>;
    closureReportType: z.ZodNullable<z.ZodEnum<{
        LOST: "LOST";
        RETURNED: "RETURNED";
    }>>;
    closureReportedDateTime: z.ZodNullable<z.ZodInstanceOf<Timestamp>>;
    closureReviewedDateTime: z.ZodNullable<z.ZodInstanceOf<Timestamp>>;
    status: z.ZodEnum<{
        ACTIVE: "ACTIVE";
        PENDING_CLOSE: "PENDING_CLOSE";
        CLOSED_RETURNED: "CLOSED_RETURNED";
        CLOSED_LOST: "CLOSED_LOST";
    }>;
    isRenewed: z.ZodBoolean;
}, z.core.$strip>;
export declare const ReservationRecordSchema: z.ZodObject<{
    reservationId: z.ZodString;
    memberId: z.ZodString;
    isbn: z.ZodString;
    copyId: z.ZodNullable<z.ZodString>;
    reservationDateTime: z.ZodInstanceOf<Timestamp>;
    expiryDate: z.ZodNullable<z.ZodInstanceOf<Timestamp>>;
    status: z.ZodEnum<{
        PENDING: "PENDING";
        FULFILLED: "FULFILLED";
        CANCELLED: "CANCELLED";
        EXPIRED: "EXPIRED";
    }>;
    updatedAt: z.ZodOptional<z.ZodInstanceOf<Timestamp>>;
}, z.core.$strip>;
export declare const FineRecordSchema: z.ZodObject<{
    fineId: z.ZodString;
    loanId: z.ZodString;
    memberId: z.ZodString;
    bookTitle: z.ZodString;
    amountMinorUnits: z.ZodNumber;
    currency: z.ZodLiteral<"SGD">;
    reason: z.ZodString;
    status: z.ZodEnum<{
        OUTSTANDING: "OUTSTANDING";
        PAID: "PAID";
        WAIVED: "WAIVED";
    }>;
    issuedDateTime: z.ZodInstanceOf<Timestamp>;
    paidDateTime: z.ZodNullable<z.ZodInstanceOf<Timestamp>>;
    waivedDateTime: z.ZodNullable<z.ZodInstanceOf<Timestamp>>;
}, z.core.$strip>;
export declare const NotificationRecordSchema: z.ZodObject<{
    notificationId: z.ZodString;
    recipientUserId: z.ZodString;
    notificationType: z.ZodEnum<{
        OVERDUE_ALERT: "OVERDUE_ALERT";
        RESERVATION_READY: "RESERVATION_READY";
        FINE_ISSUED: "FINE_ISSUED";
        FINE_UPDATED: "FINE_UPDATED";
        LIBRARIAN_MESSAGE: "LIBRARIAN_MESSAGE";
    }>;
    referenceType: z.ZodNullable<z.ZodEnum<{
        LOAN: "LOAN";
        RESERVATION: "RESERVATION";
        FINE: "FINE";
    }>>;
    referenceId: z.ZodNullable<z.ZodString>;
    message: z.ZodString;
    createdAt: z.ZodInstanceOf<Timestamp>;
    read: z.ZodBoolean;
}, z.core.$strip>;
export declare const IdentityKeyRecordSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        EMAIL: "EMAIL";
        MEMBER_ID: "MEMBER_ID";
        EMPLOYEE_ID: "EMPLOYEE_ID";
    }>;
    ownerUserId: z.ZodString;
    canonicalValue: z.ZodString;
    createdAt: z.ZodInstanceOf<Timestamp>;
}, z.core.$strip>;
export type UserRecord = z.infer<typeof UserRecordSchema>;
export type BookRecord = z.infer<typeof BookRecordSchema>;
export type BookCopyRecord = z.infer<typeof BookCopyRecordSchema>;
export type LoanRecord = z.infer<typeof LoanRecordSchema>;
export type ReservationRecord = z.infer<typeof ReservationRecordSchema>;
export type FineRecord = z.infer<typeof FineRecordSchema>;
export type NotificationRecord = z.infer<typeof NotificationRecordSchema>;
export declare function canonicalizeEmail(email: string): string;
export declare function canonicalizeIdentity(value: string): string;
