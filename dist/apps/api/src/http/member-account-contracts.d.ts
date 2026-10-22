import { z } from 'zod';
declare const boundedId: z.ZodString;
export declare const memberUserIdSchema: z.ZodString;
export declare const memberListQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        ACTIVE: "ACTIVE";
        INACTIVE: "INACTIVE";
    }>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    cursor: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const memberStatusRequestSchema: z.ZodObject<{
    status: z.ZodEnum<{
        ACTIVE: "ACTIVE";
        INACTIVE: "INACTIVE";
    }>;
}, z.core.$strict>;
export declare const memberCursorSchema: z.ZodObject<{
    status: z.ZodNullable<z.ZodEnum<{
        ACTIVE: "ACTIVE";
        INACTIVE: "INACTIVE";
    }>>;
    lastRegistrationDateTime: z.ZodString;
    lastUserId: z.ZodString;
}, z.core.$strict>;
declare function toJson(value: unknown): unknown;
export declare function safeMemberAccount(member: any): unknown;
export { boundedId, toJson };
