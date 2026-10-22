import { z } from 'zod';

const boundedId = z.string().trim().min(1).max(128).refine((value) => !value.includes('/'), 'Identifiers cannot contain a slash.');
const plainText = (maximum: number) => z.string().trim().min(1).max(maximum).refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value), 'Text contains unsupported control characters.').refine((value) => !/<\/?[a-z][^>]*>/i.test(value), 'HTML-like output is not supported.');
const nullablePlainText = (maximum: number) => plainText(maximum).nullable();

export const assistantPurposeSchema = z.enum(['RETURN_FOLLOW_UP', 'LOSS_FOLLOW_UP']);
export const assistantSourceTypeSchema = z.literal('PENDING_REPORT');

export const pendingReportsSummaryRequestSchema = z.object({
  loanIds: z.array(boundedId).min(1).max(20),
}).strict().superRefine((input, context) => {
  if (new Set(input.loanIds).size !== input.loanIds.length) context.addIssue({ code: 'custom', path: ['loanIds'], message: 'Loan IDs must be unique.' });
});

export const notificationDraftRequestSchema = z.object({
  sourceType: assistantSourceTypeSchema,
  sourceId: boundedId,
  purpose: assistantPurposeSchema,
}).strict();

export const summaryModelOutputSchema = z.object({
  summary: plainText(4_000),
  items: z.array(z.object({
    loanId: boundedId,
    reportType: z.enum(['RETURNED', 'LOST']),
    facts: plainText(1_000),
    action: z.enum(['VERIFY_RETURN', 'VERIFY_LOSS', 'CONTACT_MEMBER', 'REVIEW_MANUALLY', 'NO_ACTION']),
  }).strict()).min(1).max(20),
  uncertainty: nullablePlainText(500),
}).strict();

export const draftModelOutputSchema = z.object({
  message: plainText(2_000),
  rationale: plainText(500),
  warning: nullablePlainText(500),
}).strict();

export type PendingReportsSummaryRequest = z.infer<typeof pendingReportsSummaryRequestSchema>;
export type NotificationDraftRequest = z.infer<typeof notificationDraftRequestSchema>;
export type SummaryModelOutput = z.infer<typeof summaryModelOutputSchema>;
export type DraftModelOutput = z.infer<typeof draftModelOutputSchema>;

export type PendingReportContext = {
  loanId: string;
  memberId: string;
  copyId: string;
  isbn: string;
  bookTitle: string;
  dueDate: string;
  closureReportType: 'RETURNED' | 'LOST';
  closureReportedDateTime: string;
  copyStatus: 'IN_TRANSIT';
  memberAccountStatus: 'ACTIVE' | 'INACTIVE';
};

export type SummaryResponse = {
  summary: string;
  items: Array<PendingReportContext & { facts: string; action: SummaryModelOutput['items'][number]['action'] }>;
  uncertainty: string | null;
  advisory: true;
  requiresHumanApproval: true;
};

export type NotificationDraftResponse = {
  message: string;
  rationale: string;
  warning: string | null;
  sourceType: 'PENDING_REPORT';
  sourceId: string;
  loanId: string;
  memberId: string;
  purpose: NotificationDraftRequest['purpose'];
  notificationType: 'LIBRARIAN_MESSAGE';
  referenceType: null;
  referenceId: null;
  advisory: true;
  requiresHumanApproval: true;
};

export function toIso(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  if (Number.isNaN(date.valueOf())) throw new Error('Invalid timestamp.');
  return date.toISOString();
}

export function assistantPromptText(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}
