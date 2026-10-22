import { apiRequest } from './base.js';

export type FineStatus = 'OUTSTANDING' | 'PAID' | 'WAIVED';
export type FineView = 'outstanding' | 'history';

export interface MemberFine {
  fineId: string;
  loanId: string;
  memberId: string;
  bookTitle: string;
  amountMinorUnits: number;
  currency: 'SGD';
  reason: string;
  status: 'OUTSTANDING' | 'PAID' | 'WAIVED';
  issuedDateTime: string;
  paidDateTime: string | null;
  waivedDateTime: string | null;
}

export interface MemberFinePage {
  items: MemberFine[];
  page: { limit: number; nextCursor: string | null };
}

export const fineApi = {
  listFines(view: FineView, cursor?: string, limit = 20): Promise<MemberFinePage> {
    const query = new URLSearchParams({ view, limit: String(limit) });
    if (cursor) query.set('cursor', cursor);
    return apiRequest(`/member/fines?${query.toString()}`);
  },
  payFine(fineId: string): Promise<{ success: boolean }> {
    return apiRequest(`/member/fines/${encodeURIComponent(fineId)}/pay`, { method: 'POST' });
  },
};
