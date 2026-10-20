import { randomUUID } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { LoanRecordSchema } from '../../../../packages/shared/src/domain/records.js';
import { StorageError } from './repositories.js';
function requireActive(actor) {
    if (actor.accountStatus !== 'ACTIVE')
        throw new StorageError('FORBIDDEN', 'Account is inactive.');
}
function requireLibrarian(actor) {
    requireActive(actor);
    if (actor.accountType !== 'LIBRARIAN')
        throw new StorageError('FORBIDDEN', 'Librarian access is required.');
}
function requireMember(actor) {
    if (!actor || actor.accountStatus !== 'ACTIVE' || actor.accountType !== 'MEMBER' || typeof actor.memberId !== 'string' || !actor.memberId.trim())
        throw new StorageError('FORBIDDEN', 'Active member access is required.');
}
function mustExist(value) {
    if (!value)
        throw new StorageError('NOT_FOUND', 'Record was not found.');
    return value;
}
function snapshotData(snapshot) {
    return snapshot.exists ? snapshot.data() : undefined;
}
function parseSgdMinorUnits(amount) {
    if (!amount || !/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.test(amount.trim())) {
        throw new StorageError('INVALID', 'Enter a positive fine amount in SGD with up to two decimal places.');
    }
    const [whole, fraction = ''] = amount.trim().split('.');
    const minorUnits = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0)
        throw new StorageError('INVALID', 'Fine amount must be a positive SGD amount.');
    return minorUnits;
}
export class LibraryWorkflows {
    db;
    constructor(db) {
        this.db = db;
    }
    async memberBorrowCapacity(actor) {
        requireMember(actor);
        const activeLoans = await this.db.collection('loans')
            .where('memberId', '==', actor.memberId)
            .where('status', '==', 'ACTIVE')
            .get();
        const activeLoanCount = activeLoans.size;
        return { activeLoanCount, remainingSlots: Math.max(0, 10 - activeLoanCount) };
    }
    async checkMemberBorrowCopy(copyId, actor) {
        requireMember(actor);
        const copy = mustExist(snapshotData(await this.db.collection('bookCopies').doc(copyId).get()));
        if (copy.status !== 'AVAILABLE')
            throw new StorageError('CONFLICT', 'Copy is not available to borrow.');
        const book = mustExist(snapshotData(await this.db.collection('books').doc(String(copy.isbn)).get()));
        return { copy, book };
    }
    async confirmMemberBorrow(copyIds, actor) {
        requireMember(actor);
        const outcomes = [];
        for (const copyId of copyIds) {
            try {
                const now = Timestamp.now();
                const loanId = randomUUID();
                const userRef = this.db.collection('users').doc(actor.userId);
                const copyRef = this.db.collection('bookCopies').doc(copyId);
                const loanRef = this.db.collection('loans').doc(loanId);
                const activeLoansQuery = this.db.collection('loans')
                    .where('memberId', '==', actor.memberId)
                    .where('status', '==', 'ACTIVE');
                const loan = await this.db.runTransaction(async (tx) => {
                    const [userSnap, copySnap, activeLoansSnap] = await Promise.all([
                        tx.get(userRef), tx.get(copyRef), tx.get(activeLoansQuery),
                    ]);
                    const user = mustExist(snapshotData(userSnap));
                    if (user.accountType !== 'MEMBER' || user.accountStatus !== 'ACTIVE' || user.memberId !== actor.memberId)
                        throw new StorageError('FORBIDDEN', 'Active member access is required.');
                    const copy = mustExist(snapshotData(copySnap));
                    if (copy.status !== 'AVAILABLE')
                        throw new StorageError('CONFLICT', 'Copy is no longer available to borrow.');
                    if (activeLoansSnap.size >= 10)
                        throw new StorageError('CONFLICT', 'Member has reached the 10 active-loan limit.');
                    const bookSnap = await tx.get(this.db.collection('books').doc(String(copy.isbn)));
                    const book = mustExist(snapshotData(bookSnap));
                    const record = LoanRecordSchema.parse({
                        loanId, memberId: actor.memberId, copyId, isbn: copy.isbn, bookTitle: book.title,
                        borrowDateTime: now, dueDate: Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000),
                        returnDateTime: null, closureReportType: null, closureReportedDateTime: null,
                        closureReviewedDateTime: null, status: 'ACTIVE', isRenewed: false,
                    });
                    // Updating the member record makes concurrent transactions for this member conflict and retry.
                    tx.update(userRef, { updatedAt: now });
                    tx.update(copyRef, { status: 'ON_LOAN', reservationId: null, updatedAt: now });
                    tx.create(loanRef, record);
                    return record;
                });
                outcomes.push({ copyId, success: true, loan });
            }
            catch (error) {
                if (!(error instanceof StorageError))
                    throw error;
                outcomes.push({ copyId, success: false, reason: error.message });
            }
        }
        return outcomes;
    }
    async createLoan(input, actor) {
        requireLibrarian(actor);
        const loanId = input.loanId ?? randomUUID();
        const copyRef = this.db.collection('bookCopies').doc(input.copyId);
        const loanRef = this.db.collection('loans').doc(loanId);
        const memberQuery = this.db.collection('users').where('memberId', '==', input.memberId).limit(1);
        await this.db.runTransaction(async (tx) => {
            const [copySnap, loanSnap, memberSnap] = await Promise.all([tx.get(copyRef), tx.get(loanRef), tx.get(memberQuery)]);
            const copy = mustExist(snapshotData(copySnap));
            if (loanSnap.exists)
                throw new StorageError('CONFLICT', 'Loan identifier already exists.');
            const member = memberSnap.docs[0]?.data();
            if (!member || member.accountType !== 'MEMBER' || member.accountStatus !== 'ACTIVE')
                throw new StorageError('INVALID', 'An active member is required.');
            const status = copy.status;
            if (status !== 'AVAILABLE' && status !== 'RESERVED')
                throw new StorageError('CONFLICT', 'Copy is not lendable.');
            let reservationRef;
            let reservation;
            if (status === 'RESERVED') {
                const reservationId = String(copy.reservationId ?? '');
                if (!reservationId)
                    throw new StorageError('CONFLICT', 'Reserved copy has no linked reservation.');
                reservationRef = this.db.collection('reservations').doc(reservationId);
                const reservationSnap = await tx.get(reservationRef);
                reservation = mustExist(snapshotData(reservationSnap));
                if (reservation.status !== 'PENDING' || reservation.copyId !== input.copyId || reservation.isbn !== copy.isbn || reservation.memberId !== input.memberId || !(reservation.expiryDate instanceof Timestamp) || reservation.expiryDate.toMillis() <= Date.now()) {
                    throw new StorageError('CONFLICT', 'Copy is reserved for a different member or the pickup period has ended.');
                }
            }
            const now = Timestamp.now();
            const bookSnap = await tx.get(this.db.collection('books').doc(String(copy.isbn)));
            const book = mustExist(snapshotData(bookSnap));
            tx.create(loanRef, {
                loanId, memberId: input.memberId, copyId: input.copyId, isbn: copy.isbn, bookTitle: book.title,
                borrowDateTime: now, dueDate: Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000),
                returnDateTime: null, closureReportType: null, closureReportedDateTime: null,
                closureReviewedDateTime: null, status: 'ACTIVE', isRenewed: false,
            });
            tx.update(copyRef, { status: 'ON_LOAN', reservationId: null, updatedAt: now });
            if (reservationRef)
                tx.update(reservationRef, { status: 'FULFILLED', updatedAt: now });
        });
        return loanId;
    }
    async reportClosure(loanId, reportType, actor) {
        requireActive(actor);
        if (reportType !== 'RETURNED' && reportType !== 'LOST')
            throw new StorageError('INVALID', 'Unsupported closure report type.');
        if (actor.accountType !== 'MEMBER' || !actor.memberId)
            throw new StorageError('FORBIDDEN', 'Member access is required.');
        const loanRef = this.db.collection('loans').doc(loanId);
        await this.db.runTransaction(async (tx) => {
            const loan = mustExist(snapshotData(await tx.get(loanRef)));
            if (loan.memberId !== actor.memberId)
                throw new StorageError('FORBIDDEN', 'Loan belongs to another member.');
            if (loan.status !== 'ACTIVE')
                throw new StorageError('CONFLICT', 'Only an active loan can be reported.');
            const copyRef = this.db.collection('bookCopies').doc(String(loan.copyId));
            const copy = mustExist(snapshotData(await tx.get(copyRef)));
            if (copy.status !== 'ON_LOAN')
                throw new StorageError('CONFLICT', 'Copy state does not match the active loan.');
            const now = Timestamp.now();
            tx.update(loanRef, { status: 'PENDING_CLOSE', closureReportType: reportType, closureReportedDateTime: now });
            tx.update(copyRef, { status: 'IN_TRANSIT', updatedAt: now });
        });
    }
    async reviewClosure(loanId, decision, returnDisposition, actor, lossFineSgd) {
        requireLibrarian(actor);
        if (decision !== 'CONFIRM' && decision !== 'REJECT')
            throw new StorageError('INVALID', 'Unsupported closure decision.');
        if (!['AVAILABLE', 'DAMAGED', 'RESERVED'].includes(returnDisposition))
            throw new StorageError('INVALID', 'Unsupported return disposition.');
        const loanRef = this.db.collection('loans').doc(loanId);
        await this.db.runTransaction(async (tx) => {
            const loan = mustExist(snapshotData(await tx.get(loanRef)));
            if (loan.status !== 'PENDING_CLOSE' || !(loan.closureReportType === 'RETURNED' || loan.closureReportType === 'LOST'))
                throw new StorageError('CONFLICT', 'Loan has no pending closure report.');
            const copyRef = this.db.collection('bookCopies').doc(String(loan.copyId));
            const copy = mustExist(snapshotData(await tx.get(copyRef)));
            if (copy.status !== 'IN_TRANSIT')
                throw new StorageError('CONFLICT', 'Copy is not awaiting closure review.');
            const now = Timestamp.now();
            if (decision === 'REJECT') {
                tx.update(loanRef, { status: 'ACTIVE', closureReportType: null, closureReportedDateTime: null, closureReviewedDateTime: now });
                tx.update(copyRef, { status: 'ON_LOAN', updatedAt: now });
                return;
            }
            if (loan.closureReportType === 'LOST') {
                const amountMinorUnits = parseSgdMinorUnits(lossFineSgd);
                const fineRef = this.db.collection('fines').doc(randomUUID());
                tx.update(loanRef, { status: 'CLOSED_LOST', closureReviewedDateTime: now });
                tx.update(copyRef, { status: 'LOST', updatedAt: now });
                tx.create(fineRef, {
                    fineId: fineRef.id, loanId, memberId: loan.memberId, bookTitle: loan.bookTitle,
                    amountMinorUnits, currency: 'SGD', reason: 'Lost book',
                    status: 'OUTSTANDING', issuedDateTime: now, paidDateTime: null, waivedDateTime: null,
                });
                return;
            }
            await this.applyReturnDisposition(tx, loanRef, loan, copyRef, returnDisposition, now);
        });
    }
    async returnPreview(loanId, actor) {
        requireLibrarian(actor);
        const loanSnap = await this.db.collection('loans').doc(loanId).get();
        const loan = mustExist(snapshotData(loanSnap));
        if (loan.status !== 'PENDING_CLOSE' || loan.closureReportType !== 'RETURNED')
            throw new StorageError('CONFLICT', 'Loan is not awaiting return verification.');
        const reservations = await this.db.collection('reservations').where('isbn', '==', loan.isbn).where('status', '==', 'PENDING').orderBy('reservationDateTime').orderBy(FieldPath.documentId()).limit(1).get();
        const earliest = reservations.docs[0];
        return { loanId, earliestReservation: earliest ? { reservationId: earliest.id, ...earliest.data() } : null, dispositions: ['AVAILABLE', 'DAMAGED', ...(earliest ? ['RESERVED'] : [])] };
    }
    async processReturn(loanId, disposition, actor) {
        requireLibrarian(actor);
        if (!['AVAILABLE', 'DAMAGED', 'RESERVED'].includes(disposition))
            throw new StorageError('INVALID', 'Unsupported return disposition.');
        const loanRef = this.db.collection('loans').doc(loanId);
        await this.db.runTransaction(async (tx) => {
            const loan = mustExist(snapshotData(await tx.get(loanRef)));
            if (loan.status !== 'PENDING_CLOSE' || loan.closureReportType !== 'RETURNED')
                throw new StorageError('CONFLICT', 'Loan is not awaiting return verification.');
            const copyRef = this.db.collection('bookCopies').doc(String(loan.copyId));
            const copy = mustExist(snapshotData(await tx.get(copyRef)));
            const now = Timestamp.now();
            await this.applyReturnDisposition(tx, loanRef, loan, copyRef, disposition, now, copy);
        });
    }
    async applyReturnDisposition(tx, loanRef, loan, copyRef, disposition, now, knownCopy) {
        const copy = knownCopy ?? mustExist(snapshotData(await tx.get(copyRef)));
        if (copy.status !== 'IN_TRANSIT')
            throw new StorageError('CONFLICT', 'Copy is not awaiting return verification.');
        const query = this.db.collection('reservations').where('isbn', '==', loan.isbn).where('status', '==', 'PENDING').orderBy('reservationDateTime').orderBy(FieldPath.documentId());
        const reservationQuery = await tx.get(query);
        const earliest = reservationQuery.docs[0];
        if (disposition === 'RESERVED' && !earliest)
            throw new StorageError('CONFLICT', 'No pending reservation is available to assign.');
        let reservedNotification;
        if (disposition === 'RESERVED' && earliest) {
            const reservation = earliest.data();
            const recipientQuery = this.db.collection('users').where('memberId', '==', reservation.memberId).limit(1);
            const recipientSnapshot = await tx.get(recipientQuery);
            const recipient = recipientSnapshot.docs[0];
            if (!recipient)
                throw new StorageError('CONFLICT', 'Reservation member account was not found.');
            reservedNotification = { ref: this.db.collection('notifications').doc(randomUUID()), recipientUserId: recipient.id, reservationId: earliest.id };
        }
        tx.update(loanRef, { status: 'CLOSED_RETURNED', returnDateTime: now, closureReviewedDateTime: now });
        if (disposition === 'RESERVED' && earliest && reservedNotification) {
            const expiry = Timestamp.fromMillis(now.toMillis() + 15 * 24 * 60 * 60 * 1000);
            tx.update(copyRef, { status: 'RESERVED', reservationId: reservedNotification.reservationId, updatedAt: now });
            tx.update(earliest.ref, { copyId: copyRef.id, expiryDate: expiry, updatedAt: now });
            tx.create(reservedNotification.ref, {
                notificationId: reservedNotification.ref.id, recipientUserId: reservedNotification.recipientUserId,
                notificationType: 'RESERVATION_READY', referenceType: 'RESERVATION', referenceId: reservedNotification.reservationId,
                message: `Your reserved copy of ${String(loan.bookTitle)} is ready for collection.`, createdAt: now, read: false,
            });
        }
        else {
            tx.update(copyRef, { status: disposition, reservationId: null, updatedAt: now });
        }
    }
    async payFine(fineId, actor) {
        requireActive(actor);
        if (actor.accountType !== 'MEMBER' || !actor.memberId)
            throw new StorageError('FORBIDDEN', 'Member access is required.');
        const ref = this.db.collection('fines').doc(fineId);
        await this.db.runTransaction(async (tx) => {
            const fine = mustExist(snapshotData(await tx.get(ref)));
            if (fine.memberId !== actor.memberId)
                throw new StorageError('FORBIDDEN', 'Fine belongs to another member.');
            if (fine.status !== 'OUTSTANDING')
                throw new StorageError('CONFLICT', 'Only an outstanding fine can be paid.');
            tx.update(ref, { status: 'PAID', paidDateTime: Timestamp.now() });
        });
    }
    async waiveFine(fineId, actor) {
        requireLibrarian(actor);
        const ref = this.db.collection('fines').doc(fineId);
        await this.db.runTransaction(async (tx) => {
            const fine = mustExist(snapshotData(await tx.get(ref)));
            if (fine.status !== 'OUTSTANDING')
                throw new StorageError('CONFLICT', 'Only an outstanding fine can be waived.');
            tx.update(ref, { status: 'WAIVED', waivedDateTime: Timestamp.now() });
        });
    }
    async expireReservations(now = Timestamp.now(), limit = 100) {
        const due = await this.db.collection('reservations').where('status', '==', 'PENDING').where('expiryDate', '<=', now).orderBy('expiryDate').limit(limit).get();
        let expired = 0;
        for (const candidate of due.docs) {
            const didExpire = await this.db.runTransaction(async (tx) => {
                const reservationSnap = await tx.get(candidate.ref);
                const reservation = snapshotData(reservationSnap);
                if (!reservation || reservation.status !== 'PENDING' || !(reservation.expiryDate instanceof Timestamp) || reservation.expiryDate.toMillis() > now.toMillis() || !reservation.copyId)
                    return false;
                const copyRef = this.db.collection('bookCopies').doc(String(reservation.copyId));
                const copy = mustExist(snapshotData(await tx.get(copyRef)));
                if (copy.status !== 'RESERVED' || copy.reservationId !== candidate.id)
                    return false;
                tx.update(candidate.ref, { status: 'EXPIRED', updatedAt: now });
                tx.update(copyRef, { status: 'AVAILABLE', reservationId: null, updatedAt: now });
                return true;
            });
            if (didExpire)
                expired += 1;
        }
        return { examined: due.size, expired };
    }
}
export async function validateNotificationReference(db, input) {
    if ((input.referenceType === null) !== (input.referenceId === null))
        throw new StorageError('INVALID', 'Reference type and ID must be paired.');
    if (!input.referenceType || !input.referenceId)
        return;
    const collection = { LOAN: 'loans', RESERVATION: 'reservations', FINE: 'fines' }[input.referenceType];
    const snapshot = await db.collection(collection).doc(input.referenceId).get();
    const record = mustExist(snapshotData(snapshot));
    const allowedType = input.referenceType === 'LOAN' ? input.notificationType === 'OVERDUE_ALERT'
        : input.referenceType === 'RESERVATION' ? input.notificationType === 'RESERVATION_READY'
            : ['FINE_ISSUED', 'FINE_UPDATED'].includes(input.notificationType);
    if (!allowedType)
        throw new StorageError('INVALID', 'Reference type does not match the notification type.');
    if (record.memberId) {
        const recipient = await db.collection('users').where('memberId', '==', record.memberId).limit(1).get();
        if (recipient.docs[0]?.id !== input.recipientUserId)
            throw new StorageError('INVALID', 'Reference does not belong to the notification recipient.');
    }
}
//# sourceMappingURL=workflows.js.map