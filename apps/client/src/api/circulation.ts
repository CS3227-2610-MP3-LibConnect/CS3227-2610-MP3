import { apiRequest } from './base.js';

export type ClosureReportType = 'RETURNED' | 'LOST';
export type ReturnDisposition = 'AVAILABLE' | 'DAMAGED' | 'RESERVED';

export interface LoanSummary {
  loanId: string;
  memberId: string;
  copyId: string;
  isbn: string;
  bookTitle: string;
  borrowDateTime: string;
  dueDate: string;
  returnDateTime: string | null;
  closureReportType: ClosureReportType | null;
  closureReportedDateTime: string | null;
  closureReviewedDateTime: string | null;
  closureReviewDecision: 'CONFIRMED' | 'REJECTED' | null;
  status: string;
  isRenewed: boolean;
}

export interface CirculationCopy {
  copyId: string;
  isbn: string;
  shelfLocation: string;
  status: string;
  reservationId: string | null;
}

export interface ReservationSummary {
  reservationId: string;
  memberId: string;
  isbn: string;
  copyId: string | null;
  reservationDateTime: string;
  expiryDate: string | null;
  status: string;
}

export interface FineSummary {
  fineId: string;
  loanId: string;
  memberId: string;
  bookTitle: string;
  amountMinorUnits: number;
  currency: string;
  reason: string;
  status: 'OUTSTANDING' | 'PAID' | 'WAIVED';
  issuedDateTime: string;
  paidDateTime: string | null;
  waivedDateTime: string | null;
}

export interface NotificationSummary {
  notificationId: string;
  notificationType: string;
  referenceType: string | null;
  referenceId: string | null;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface PendingCloseItem {
  loan: LoanSummary;
  copy: CirculationCopy;
}
export interface ReturnPreview {
  loan: LoanSummary;
  copy: CirculationCopy;
  earliestReservation: ReservationSummary | null;
  allowedDispositions: ReturnDisposition[];
}
export interface TransitionSummary {
  loan: LoanSummary;
  copy: CirculationCopy;
  reservation?: ReservationSummary;
  fine?: {
    fineId: string;
    loanId: string;
    amountMinorUnits: number;
    currency: string;
    status: string;
  };
  notification?: { notificationId: string; notificationType: string; referenceId: string | null };
}

export const circulationApi = {
  createLoan(memberId: string, copyId: string): Promise<TransitionSummary> {
    return apiRequest('/librarian/loans', {
      method: 'POST',
      body: JSON.stringify({ memberId, copyId }),
    });
  },
  pendingClose(
    limit = 20,
    cursor?: string,
  ): Promise<{ items: PendingCloseItem[]; page: { limit: number; nextCursor: string | null } }> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set('cursor', cursor);
    return apiRequest(`/librarian/loans/pending-close?${query.toString()}`);
  },
  returnPreview(loanId: string): Promise<ReturnPreview> {
    return apiRequest(`/librarian/loans/${encodeURIComponent(loanId)}/return-preview`);
  },
  review(
    loanId: string,
    decision: 'CONFIRM' | 'REJECT',
    disposition?: ReturnDisposition,
  ): Promise<TransitionSummary> {
    return apiRequest(`/librarian/loans/${encodeURIComponent(loanId)}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, ...(disposition ? { disposition } : {}) }),
    });
  },
};

export const reservationsFinesApi = {
  reservations(
    filters: { isbn?: string; status?: string; limit?: number; cursor?: string } = {},
  ): Promise<{ items: ReservationSummary[]; page: { limit: number; nextCursor: string | null } }> {
    const query = new URLSearchParams({ limit: String(filters.limit ?? 20) });
    if (filters.isbn) query.set('isbn', filters.isbn);
    if (filters.status) query.set('status', filters.status);
    if (filters.cursor) query.set('cursor', filters.cursor);
    return apiRequest(`/librarian/reservations?${query.toString()}`);
  },
  fines(
    filters: {
      status?: string;
      memberId?: string;
      loanId?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<{ items: FineSummary[]; page: { limit: number; nextCursor: string | null } }> {
    const query = new URLSearchParams({ limit: String(filters.limit ?? 20) });
    if (filters.status) query.set('status', filters.status);
    if (filters.memberId) query.set('memberId', filters.memberId);
    if (filters.loanId) query.set('loanId', filters.loanId);
    if (filters.cursor) query.set('cursor', filters.cursor);
    return apiRequest(`/librarian/fines?${query.toString()}`);
  },
  waiveFine(
    fineId: string,
  ): Promise<{ fine: FineSummary; notification: NotificationSummary | null }> {
    return apiRequest(`/librarian/fines/${encodeURIComponent(fineId)}/waive`, {
      method: 'POST',
      body: '{}',
    });
  },
  sendMessage(
    memberId: string,
    message: string,
    idempotencyKey: string,
  ): Promise<{ notification: NotificationSummary }> {
    return apiRequest('/librarian/notifications', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ memberId, message }),
    });
  },
};
