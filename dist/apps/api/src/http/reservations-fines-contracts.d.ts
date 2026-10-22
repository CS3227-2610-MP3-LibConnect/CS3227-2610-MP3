import { z } from 'zod';
declare const boundedId: z.ZodString;
declare const isbn: z.ZodString;
export declare const reservationStatus: z.ZodEnum<{
    PENDING: "PENDING";
    FULFILLED: "FULFILLED";
    CANCELLED: "CANCELLED";
    EXPIRED: "EXPIRED";
}>;
export declare const fineStatus: z.ZodEnum<{
    OUTSTANDING: "OUTSTANDING";
    PAID: "PAID";
    WAIVED: "WAIVED";
}>;
export declare const reservationListQuerySchema: z.ZodObject<{
    isbn: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        PENDING: "PENDING";
        FULFILLED: "FULFILLED";
        CANCELLED: "CANCELLED";
        EXPIRED: "EXPIRED";
    }>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    cursor: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const fineListQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        OUTSTANDING: "OUTSTANDING";
        PAID: "PAID";
        WAIVED: "WAIVED";
    }>>;
    memberId: z.ZodOptional<z.ZodString>;
    loanId: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    cursor: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const reservationIdSchema: z.ZodObject<{
    reservationId: z.ZodString;
}, z.core.$strict>;
export declare const fineIdSchema: z.ZodObject<{
    fineId: z.ZodString;
}, z.core.$strict>;
export declare const emptyBodySchema: z.ZodObject<{}, z.core.$strict>;
export declare const librarianMessageSchema: z.ZodObject<{
    memberId: z.ZodString;
    message: z.ZodString;
}, z.core.$strict>;
export declare const memberReservationCreateSchema: z.ZodObject<{
    isbn: z.ZodString;
}, z.core.$strict>;
export declare const memberReservationListQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        PENDING: "PENDING";
        FULFILLED: "FULFILLED";
        CANCELLED: "CANCELLED";
        EXPIRED: "EXPIRED";
    }>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    cursor: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const memberFineListQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        OUTSTANDING: "OUTSTANDING";
        PAID: "PAID";
        WAIVED: "WAIVED";
    }>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    cursor: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const memberNotificationListQuerySchema: z.ZodObject<{
    unread: z.ZodOptional<z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    cursor: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const memberIntegrationContract: Readonly<{
    reservationCreate: "POST /api/v1/member/reservations";
    reservationCancel: "POST /api/v1/member/reservations/:reservationId/cancel";
    finePay: "POST /api/v1/member/fines/:fineId/pay";
    notificationList: "GET /api/v1/member/notifications";
    notificationRead: "POST /api/v1/member/notifications/:notificationId/read";
    authorization: "server-loaded active member and owning memberId only";
    noPartialWrite: "duplicate, foreign, stale, and invalid-state requests commit no mutation";
}>;
export declare const idempotencyKeySchema: z.ZodString;
export declare const reservationCursorSchema: z.ZodObject<{
    filterKey: z.ZodString;
    lastReservationDateTime: z.ZodString;
    lastReservationId: z.ZodString;
}, z.core.$strict>;
export declare const fineCursorSchema: z.ZodObject<{
    filterKey: z.ZodString;
    lastIssuedDateTime: z.ZodString;
    lastFineId: z.ZodString;
}, z.core.$strict>;
declare function toJson(value: unknown): unknown;
export declare function safeReservation(reservation: any): unknown;
export declare function safeFine(fine: any): unknown;
export declare function safeNotification(notification: any): unknown;
export declare function safeLibrarianNotification(notification: any): unknown;
export declare function filterKey(kind: 'reservations' | 'fines', filters: Record<string, unknown>): string;
export { boundedId, isbn, toJson };
