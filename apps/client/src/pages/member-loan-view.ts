import type { MemberLoan } from '../api/borrow.js';

export type LoanView = 'active' | 'past';

export function loansForView(loans: MemberLoan[], view: LoanView): MemberLoan[] {
  return loans.filter((loan) => (loan.status === 'ACTIVE') === (view === 'active'));
}

function singaporeCalendarDay(timestamp: number): { year: number; month: number; day: number } | null {
  if (!Number.isFinite(timestamp)) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)
    ? { year, month, day }
    : null;
}

function singaporeNextDayStart(day: { year: number; month: number; day: number }): number {
  // Singapore has no daylight-saving transitions and uses UTC+08:00.
  return Date.UTC(day.year, day.month - 1, day.day + 1) - 8 * 60 * 60 * 1000;
}

export function isBeforeSingaporeDueDateCutoff(dueDate: string, now = Date.now()): boolean {
  const dueTimestamp = Date.parse(dueDate);
  const dueDay = singaporeCalendarDay(dueTimestamp);
  if (!dueDay || !Number.isFinite(now)) return false;
  return now < singaporeNextDayStart(dueDay);
}

export function isOverdueActiveLoan(loan: MemberLoan, now = Date.now()): boolean {
  const dueTime = Date.parse(loan.dueDate);
  if (loan.status !== 'ACTIVE' || !Number.isFinite(dueTime) || !Number.isFinite(now)) return false;
  return !isBeforeSingaporeDueDateCutoff(loan.dueDate, now);
}

export function loanCardTreatment(loan: MemberLoan, now = Date.now()): { overdue: boolean; showDisabledReturn: boolean } {
  return { overdue: isOverdueActiveLoan(loan, now), showDisabledReturn: loan.status === 'ACTIVE' };
}

export function formatLoanDueDate(dueDate: string): string {
  const timestamp = Date.parse(dueDate);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString() : 'Date unavailable';
}
