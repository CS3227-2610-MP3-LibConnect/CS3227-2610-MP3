const defaultLostBookFineMinorUnits = 2000;
const defaultOverdueFineMinorUnits = 500;
const defaultOverdueGraceHours = 72;
const overdueFinePolicyKey = 'sgd-fixed-500-after-72h-v1';
export function getLostBookFineMinorUnits() {
    const configured = process.env.LOST_BOOK_FINE_MINOR_UNITS;
    if (configured === undefined || configured === '') {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('LOST_BOOK_FINE_MINOR_UNITS must be configured in production.');
        }
        return defaultLostBookFineMinorUnits;
    }
    if (!/^\d+$/.test(configured)) {
        throw new Error('LOST_BOOK_FINE_MINOR_UNITS must be a positive integer number of minor currency units.');
    }
    const amount = Number(configured);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new Error('LOST_BOOK_FINE_MINOR_UNITS must be a positive safe integer.');
    }
    return amount;
}
export function getOverdueFinePolicy() {
    const configuredKey = process.env.OVERDUE_FINE_POLICY_KEY;
    const configuredAmount = process.env.OVERDUE_FINE_MINOR_UNITS;
    const configuredGrace = process.env.OVERDUE_FINE_GRACE_HOURS;
    if (configuredKey !== undefined && configuredKey !== overdueFinePolicyKey) {
        throw new Error(`The overdue policy key must match ${overdueFinePolicyKey}.`);
    }
    if (process.env.NODE_ENV === 'production' && (configuredKey !== overdueFinePolicyKey || configuredAmount === undefined || configuredGrace === undefined)) {
        throw new Error('OVERDUE_FINE_POLICY_KEY, OVERDUE_FINE_MINOR_UNITS, and OVERDUE_FINE_GRACE_HOURS must be configured in production.');
    }
    const amount = configuredAmount === undefined ? defaultOverdueFineMinorUnits : Number(configuredAmount);
    const graceHours = configuredGrace === undefined ? defaultOverdueGraceHours : Number(configuredGrace);
    if (!Number.isSafeInteger(amount) || amount !== defaultOverdueFineMinorUnits || !Number.isSafeInteger(graceHours) || graceHours !== defaultOverdueGraceHours) {
        throw new Error(`The overdue policy must match ${overdueFinePolicyKey}.`);
    }
    return { policyKey: overdueFinePolicyKey, amountMinorUnits: amount, graceHours };
}
export { defaultLostBookFineMinorUnits, defaultOverdueFineMinorUnits, defaultOverdueGraceHours, overdueFinePolicyKey };
//# sourceMappingURL=fines.js.map