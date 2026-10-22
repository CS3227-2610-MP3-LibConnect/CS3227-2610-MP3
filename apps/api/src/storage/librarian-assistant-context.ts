import { BookCopyRecordSchema, LoanRecordSchema, UserRecordSchema } from '../../../../packages/shared/src/domain/records.js';
import { StorageError } from './repositories.js';
import { toIso, type PendingReportContext } from '../ai/librarian-assistant-contracts.js';

function recordData(snapshot: { exists: boolean; data(): Record<string, unknown> | undefined }, message: string): Record<string, unknown> {
  if (!snapshot.exists || !snapshot.data()) throw new StorageError('NOT_FOUND', message);
  return snapshot.data() as Record<string, unknown>;
}

export class LibrarianAssistantContext {
  constructor(private readonly db: any) {}

  async loadPendingReports(loanIds: string[]): Promise<PendingReportContext[]> {
    const contexts = await Promise.all(loanIds.map((loanId) => this.loadPendingReport(loanId)));
    return contexts;
  }

  private async loadPendingReport(loanId: string): Promise<PendingReportContext> {
    const loanSnapshot = await this.db.collection('loans').doc(loanId).get();
    let loan;
    try {
      loan = LoanRecordSchema.parse({ ...recordData(loanSnapshot, 'The pending report was not found.'), loanId });
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError('CONFLICT', 'The pending report is invalid or stale.');
    }
    if (loan.status !== 'PENDING_CLOSE' || !['RETURNED', 'LOST'].includes(loan.closureReportType ?? '')) {
      throw new StorageError('CONFLICT', 'The loan is no longer awaiting closure review.');
    }

    const copySnapshot = await this.db.collection('bookCopies').doc(loan.copyId).get();
    let copy;
    try {
      copy = BookCopyRecordSchema.parse({ ...recordData(copySnapshot, 'The pending report copy was not found.'), copyId: loan.copyId });
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError('CONFLICT', 'The pending report copy is invalid or stale.');
    }
    if (copy.status !== 'IN_TRANSIT' || copy.isbn !== loan.isbn) throw new StorageError('CONFLICT', 'The pending report copy is not awaiting closure review.');

    const members = await this.db.collection('users').where('memberId', '==', loan.memberId).limit(1).get();
    const memberSnapshot = members.docs?.[0];
    if (!memberSnapshot) throw new StorageError('CONFLICT', 'The pending report member is no longer available.');
    let member;
    try {
      member = UserRecordSchema.parse({ ...memberSnapshot.data(), userId: memberSnapshot.id });
    } catch {
      throw new StorageError('CONFLICT', 'The pending report member is invalid.');
    }
    if (member.accountType !== 'MEMBER' || member.memberId !== loan.memberId) throw new StorageError('CONFLICT', 'The pending report member relationship is invalid.');

    return {
      loanId: loan.loanId,
      memberId: loan.memberId,
      copyId: loan.copyId,
      isbn: loan.isbn,
      bookTitle: loan.bookTitle,
      dueDate: toIso(loan.dueDate),
      closureReportType: loan.closureReportType as 'RETURNED' | 'LOST',
      closureReportedDateTime: toIso(loan.closureReportedDateTime),
      copyStatus: 'IN_TRANSIT',
      memberAccountStatus: member.accountStatus,
    };
  }
}
