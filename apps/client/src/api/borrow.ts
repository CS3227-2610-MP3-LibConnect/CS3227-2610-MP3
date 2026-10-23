import { apiRequest } from './base.js';

export interface BorrowCapacity {
  openLoanCount: number;
  remainingSlots: number;
}

export interface BorrowCopyDetails {
  copy: {
    copyId: string;
    isbn: string;
    shelfLocation: string;
    status: string;
  };
  book: {
    isbn: string;
    title: string;
    author: string | string[];
    category: string;
  };
}

export interface BorrowReceipt {
  loanId: string;
  copyId: string;
  bookTitle: string;
  status: 'ACTIVE';
  isRenewed: false;
}

export interface MemberLoan {
  loanId: string;
  bookTitle: string;
  dueDate: string;
  status: string;
  isRenewed: boolean;
  closureReportType?: 'RETURNED' | 'LOST';
}

type TimestampLike = {
  seconds?: number;
  nanoseconds?: number;
  _seconds?: number;
  _nanoseconds?: number;
};

function normalizeDueDate(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const timestamp = value as TimestampLike;
    const seconds = timestamp.seconds ?? timestamp._seconds;
    const nanoseconds = timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0;
    if (
      typeof seconds === 'number' &&
      Number.isFinite(seconds) &&
      typeof nanoseconds === 'number' &&
      Number.isFinite(nanoseconds)
    ) {
      return new Date(seconds * 1000 + nanoseconds / 1_000_000).toISOString();
    }
  }
  throw new Error('Loan due date is invalid.');
}

function mapMemberLoan(value: unknown): MemberLoan {
  if (!value || typeof value !== 'object') throw new Error('Loan record is invalid.');
  const loan = value as Record<string, unknown>;
  if (
    typeof loan.loanId !== 'string' ||
    typeof loan.bookTitle !== 'string' ||
    typeof loan.status !== 'string' ||
    typeof loan.isRenewed !== 'boolean'
  ) {
    throw new Error('Loan record is invalid.');
  }
  const closureReportType =
    loan.closureReportType === 'RETURNED' || loan.closureReportType === 'LOST'
      ? loan.closureReportType
      : undefined;
  return {
    loanId: loan.loanId,
    bookTitle: loan.bookTitle,
    dueDate: normalizeDueDate(loan.dueDate),
    status: loan.status,
    isRenewed: loan.isRenewed,
    closureReportType,
  };
}

export const borrowApi = {
  async listLoans(): Promise<MemberLoan[]> {
    const result = await apiRequest<{ loans: unknown[] }>('/member/loans');
    return result.loans.map(mapMemberLoan);
  },
  async renewLoan(loanId: string): Promise<MemberLoan> {
    const result = await apiRequest<{ loan: unknown }>(
      `/member/loans/${encodeURIComponent(loanId)}/renew`,
      {
        method: 'POST',
      },
    );
    return mapMemberLoan(result.loan);
  },
  reportClosure(loanId: string, reportType: 'RETURNED' | 'LOST'): Promise<{ success: boolean }> {
    return apiRequest(`/member/loans/${encodeURIComponent(loanId)}/closure-report`, {
      method: 'POST',
      body: JSON.stringify({ reportType }),
    });
  },
  addCopy(copyId: string): Promise<BorrowCopyDetails> {
    return apiRequest('/member/borrow-items', {
      method: 'POST',
      body: JSON.stringify({ copyId }),
    });
  },
  confirm(copyIds: string[]): Promise<{ loans: BorrowReceipt[] }> {
    return apiRequest('/member/loans', {
      method: 'POST',
      body: JSON.stringify({ copyIds }),
    });
  },
  capacity(): Promise<BorrowCapacity> {
    return apiRequest('/member/borrow-capacity');
  },
};
