import { apiRequest } from './base.js';

export interface BorrowCapacity {
  activeLoanCount: number;
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

export interface BorrowOutcome {
  copyId: string;
  success: boolean;
  reason?: string;
  loan?: unknown;
}

export const borrowApi = {
  addCopy(copyId: string): Promise<BorrowCopyDetails> {
    return apiRequest('/member/borrow-items', {
      method: 'POST',
      body: JSON.stringify({ copyId }),
    });
  },
  confirm(copyIds: string[]): Promise<{ outcomes: BorrowOutcome[] }> {
    return apiRequest('/member/loans', {
      method: 'POST',
      body: JSON.stringify({ copyIds }),
    });
  },
  capacity(): Promise<BorrowCapacity> {
    return apiRequest('/member/borrow-capacity');
  },
};
