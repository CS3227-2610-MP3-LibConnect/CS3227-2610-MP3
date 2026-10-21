const defaultLostBookFineMinorUnits = 2000;

export function getLostBookFineMinorUnits(): number {
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

export { defaultLostBookFineMinorUnits };
