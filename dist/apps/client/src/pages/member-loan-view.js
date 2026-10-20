export function loansForView(loans, view) {
    return loans.filter((loan) => view === 'active'
        ? loan.status === 'ACTIVE' || loan.status === 'PENDING_CLOSE'
        : loan.status === 'CLOSED_RETURNED' || loan.status === 'CLOSED_LOST');
}
function singaporeCalendarDay(timestamp) {
    if (!Number.isFinite(timestamp))
        return null;
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
function singaporeNextDayStart(day) {
    // Singapore has no daylight-saving transitions and uses UTC+08:00.
    return Date.UTC(day.year, day.month - 1, day.day + 1) - 8 * 60 * 60 * 1000;
}
export function isBeforeSingaporeDueDateCutoff(dueDate, now = Date.now()) {
    const dueTimestamp = Date.parse(dueDate);
    const dueDay = singaporeCalendarDay(dueTimestamp);
    if (!dueDay || !Number.isFinite(now))
        return false;
    return now < singaporeNextDayStart(dueDay);
}
export function isOverdueActiveLoan(loan, now = Date.now()) {
    const dueTime = Date.parse(loan.dueDate);
    if (loan.status !== 'ACTIVE' || !Number.isFinite(dueTime) || !Number.isFinite(now))
        return false;
    return !isBeforeSingaporeDueDateCutoff(loan.dueDate, now);
}
export function loanCardTreatment(loan, now = Date.now()) {
    return { overdue: isOverdueActiveLoan(loan, now), showReportAction: loan.status === 'ACTIVE' };
}
export function formatLoanDueDate(dueDate) {
    const timestamp = Date.parse(dueDate);
    return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString() : 'Date unavailable';
}
//# sourceMappingURL=member-loan-view.js.map