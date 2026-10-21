import { randomUUID } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { StorageError } from './repositories.js';
import { getLostBookFineMinorUnits } from '../config/fines.js';
function requireActive(actor) {
    if (actor.accountStatus !== 'ACTIVE')
        throw new StorageError('FORBIDDEN', 'Account is inactive.');
}
function requireLibrarian(actor) {
    requireActive(actor);
    if (actor.accountType !== 'LIBRARIAN')
        throw new StorageError('FORBIDDEN', 'Librarian access is required.');
}
function mustExist(value) {
    if (!value)
        throw new StorageError('NOT_FOUND', 'Record was not found.');
    return value;
}
function snapshotData(snapshot) {
    return snapshot.exists ? snapshot.data() : undefined;
}
function eligibleReservationQuery(db, isbn) {
    return db.collection('reservations')
        .where('isbn', '==', isbn)
        .where('status', '==', 'PENDING')
        .where('copyId', '==', null)
        .where('expiryDate', '==', null)
        .orderBy('reservationDateTime')
        .orderBy(FieldPath.documentId())
        .limit(1);
}
export class LibraryWorkflows {
    db;
    constructor(db) {
        this.db = db;
    }
    async createLoan(input, actor) {
        requireLibrarian(actor);
        if (!input || typeof input.memberId !== 'string' || typeof input.copyId !== 'string' || input.memberId.includes('/') || input.copyId.includes('/'))
            throw new StorageError('INVALID', 'A member ID and copy ID are required.');
        const loanId = randomUUID();
        const copyRef = this.db.collection('bookCopies').doc(input.copyId);
        const loanRef = this.db.collection('loans').doc(loanId);
        const memberQuery = this.db.collection('users').where('memberId', '==', input.memberId).limit(1);
        let result;
        await this.db.runTransaction(async (tx) => {
            const [copySnap, loanSnap, memberSnap] = await Promise.all([tx.get(copyRef), tx.get(loanRef), tx.get(memberQuery)]);
            const copy = { ...mustExist(snapshotData(copySnap)), copyId: copySnap.id };
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
            const loan = {
                loanId, memberId: input.memberId, copyId: input.copyId, isbn: copy.isbn, bookTitle: book.title,
                borrowDateTime: now, dueDate: Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000),
                returnDateTime: null, closureReportType: null, closureReportedDateTime: null,
                closureReviewedDateTime: null, closureReviewDecision: null, closureReviewedByUserId: null,
                status: 'ACTIVE', isRenewed: false,
            };
            tx.create(loanRef, loan);
            tx.update(copyRef, { status: 'ON_LOAN', reservationId: null, updatedAt: now });
            if (reservationRef)
                tx.update(reservationRef, { status: 'FULFILLED', updatedAt: now });
            result = {
                loan,
                copy: { ...copy, status: 'ON_LOAN', reservationId: null, updatedAt: now },
                ...(reservation ? { reservation: { ...reservation, status: 'FULFILLED', reservationId: reservationRef.id } } : {}),
            };
        });
        return result;
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
            tx.update(loanRef, {
                status: 'PENDING_CLOSE', closureReportType: reportType, closureReportedDateTime: now,
                closureReviewDecision: null, closureReviewedByUserId: null,
            });
            tx.update(copyRef, { status: 'IN_TRANSIT', updatedAt: now });
        });
    }
    async reviewClosure(loanId, decision, returnDisposition, actor) {
        requireLibrarian(actor);
        if (decision !== 'CONFIRM' && decision !== 'REJECT')
            throw new StorageError('INVALID', 'Unsupported closure decision.');
        if (decision === 'REJECT' && returnDisposition !== undefined)
            throw new StorageError('INVALID', 'Rejected reports do not accept a return disposition.');
        const loanRef = this.db.collection('loans').doc(loanId);
        let result;
        await this.db.runTransaction(async (tx) => {
            const loanSnapshot = await tx.get(loanRef);
            const loan = { ...mustExist(snapshotData(loanSnapshot)), loanId: loanSnapshot.id };
            if (loan.status !== 'PENDING_CLOSE' || !(loan.closureReportType === 'RETURNED' || loan.closureReportType === 'LOST'))
                throw new StorageError('CONFLICT', 'Loan has no pending closure report.');
            const copyRef = this.db.collection('bookCopies').doc(String(loan.copyId));
            const copySnapshot = await tx.get(copyRef);
            const copy = { ...mustExist(snapshotData(copySnapshot)), copyId: copySnapshot.id };
            if (copy.status !== 'IN_TRANSIT')
                throw new StorageError('CONFLICT', 'Copy is not awaiting closure review.');
            const now = Timestamp.now();
            const reviewMetadata = { closureReviewedDateTime: now, closureReviewDecision: decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED', closureReviewedByUserId: actor.userId };
            if (decision === 'REJECT') {
                const updatedLoan = { ...loan, status: 'ACTIVE', closureReportType: null, closureReportedDateTime: null, ...reviewMetadata };
                const updatedCopy = { ...copy, status: 'ON_LOAN', updatedAt: now };
                tx.update(loanRef, { status: 'ACTIVE', closureReportType: null, closureReportedDateTime: null, ...reviewMetadata });
                tx.update(copyRef, { status: 'ON_LOAN', updatedAt: now });
                result = { loan: updatedLoan, copy: updatedCopy };
                return;
            }
            if (loan.closureReportType === 'LOST') {
                if (returnDisposition !== undefined)
                    throw new StorageError('INVALID', 'Lost reports do not accept a return disposition.');
                const amountMinorUnits = getLostBookFineMinorUnits();
                const fineRef = this.db.collection('fines').doc(`lost-${loanId}`);
                const existingFineSnapshot = await tx.get(fineRef);
                if (existingFineSnapshot.exists) {
                    const existingFine = existingFineSnapshot.data();
                    if (existingFine?.loanId !== loanId || existingFine?.status !== 'OUTSTANDING' || existingFine?.amountMinorUnits !== amountMinorUnits)
                        throw new StorageError('CONFLICT', 'A conflicting lost-book fine already exists.');
                }
                const updatedLoan = { ...loan, status: 'CLOSED_LOST', ...reviewMetadata };
                const updatedCopy = { ...copy, status: 'LOST', reservationId: null, updatedAt: now };
                const fine = existingFineSnapshot.exists ? { ...existingFineSnapshot.data(), fineId: fineRef.id } : {
                    fineId: fineRef.id, loanId, memberId: loan.memberId, bookTitle: loan.bookTitle,
                    amountMinorUnits, currency: 'SGD', reason: 'Lost book',
                    status: 'OUTSTANDING', issuedDateTime: now, paidDateTime: null, waivedDateTime: null,
                };
                tx.update(loanRef, { status: 'CLOSED_LOST', ...reviewMetadata });
                tx.update(copyRef, { status: 'LOST', updatedAt: now });
                if (!existingFineSnapshot.exists)
                    tx.create(fineRef, fine);
                result = { loan: updatedLoan, copy: updatedCopy, fine };
                return;
            }
            if (!['AVAILABLE', 'DAMAGED', 'RESERVED'].includes(returnDisposition))
                throw new StorageError('INVALID', 'A return disposition is required for a returned report.');
            const reservationQuery = await tx.get(eligibleReservationQuery(this.db, loan.isbn));
            const earliestDocument = reservationQuery.docs[0];
            const earliest = earliestDocument ? { ...earliestDocument.data(), reservationId: earliestDocument.id, ref: earliestDocument.ref } : undefined;
            if (returnDisposition === 'RESERVED' && !earliest)
                throw new StorageError('CONFLICT', 'No pending reservation is available to assign.');
            let notification;
            let updatedReservation;
            let updatedCopy;
            if (earliest && returnDisposition === 'RESERVED') {
                const recipientQuery = this.db.collection('users').where('memberId', '==', earliest.memberId).limit(1);
                const recipientSnapshot = await tx.get(recipientQuery);
                const recipient = recipientSnapshot.docs[0];
                if (!recipient || recipient.get('accountType') !== 'MEMBER' || recipient.get('accountStatus') !== 'ACTIVE')
                    throw new StorageError('CONFLICT', 'Reservation member account is not active.');
                const expiry = Timestamp.fromMillis(now.toMillis() + 15 * 24 * 60 * 60 * 1000);
                const notificationRef = this.db.collection('notifications').doc(`reservation-ready-${earliest.reservationId}`);
                const notificationSnapshot = await tx.get(notificationRef);
                notification = notificationSnapshot.exists ? { ...notificationSnapshot.data(), notificationId: notificationRef.id } : {
                    notificationId: notificationRef.id, recipientUserId: recipient.id, notificationType: 'RESERVATION_READY',
                    referenceType: 'RESERVATION', referenceId: earliest.reservationId,
                    message: `Your reserved copy of ${String(loan.bookTitle)} is ready for collection.`, createdAt: now, read: false,
                };
                updatedReservation = { ...earliest, copyId: copyRef.id, expiryDate: expiry, updatedAt: now };
                updatedCopy = { ...copy, status: 'RESERVED', reservationId: earliest.reservationId, updatedAt: now };
                tx.update(earliest.ref, { copyId: copyRef.id, expiryDate: expiry, updatedAt: now });
                if (!notificationSnapshot.exists)
                    tx.create(notificationRef, notification);
            }
            if (!updatedCopy)
                updatedCopy = { ...copy, status: returnDisposition, reservationId: null, updatedAt: now };
            const updatedLoan = { ...loan, status: 'CLOSED_RETURNED', returnDateTime: now, ...reviewMetadata };
            tx.update(loanRef, { status: 'CLOSED_RETURNED', returnDateTime: now, ...reviewMetadata });
            tx.update(copyRef, { status: updatedCopy.status, reservationId: updatedCopy.reservationId, updatedAt: now });
            result = {
                loan: updatedLoan,
                copy: updatedCopy,
                ...(updatedReservation ? { reservation: updatedReservation } : {}),
                ...(notification ? { notification } : {}),
            };
        });
        return result;
    }
    async listPendingClose(options, actor) {
        requireLibrarian(actor);
        const limit = Math.max(1, Math.min(50, Number(options?.limit ?? 20)));
        let query = this.db.collection('loans')
            .where('status', '==', 'PENDING_CLOSE')
            .orderBy('borrowDateTime')
            .orderBy(FieldPath.documentId());
        const cursor = options?.cursor;
        if (cursor) {
            const cursorDate = new Date(cursor.lastBorrowDateTime);
            if (Number.isNaN(cursorDate.valueOf()))
                throw new StorageError('INVALID', 'The pending-queue cursor is stale or invalid.');
            query = query.startAfter(Timestamp.fromDate(cursorDate), cursor.lastLoanId);
        }
        const snapshot = await query.limit(limit + 1).get();
        const page = snapshot.docs.slice(0, limit).map((document) => ({ ...document.data(), loanId: document.id }));
        const items = await Promise.all(page.map(async (loan) => {
            const copySnapshot = await this.db.collection('bookCopies').doc(String(loan.copyId)).get();
            return { loan, copy: { ...mustExist(snapshotData(copySnapshot)), copyId: copySnapshot.id } };
        }));
        const last = page.at(-1);
        const hasMore = snapshot.docs.length > limit;
        return { items, nextCursor: hasMore && last ? { lastBorrowDateTime: last.borrowDateTime.toDate().toISOString(), lastLoanId: last.loanId } : null };
    }
    async returnPreview(loanId, actor) {
        requireLibrarian(actor);
        const loanSnap = await this.db.collection('loans').doc(loanId).get();
        const loan = { ...mustExist(snapshotData(loanSnap)), loanId: loanSnap.id };
        if (loan.status !== 'PENDING_CLOSE' || loan.closureReportType !== 'RETURNED')
            throw new StorageError('CONFLICT', 'Loan is not awaiting return verification.');
        const copySnap = await this.db.collection('bookCopies').doc(String(loan.copyId)).get();
        const copy = { ...mustExist(snapshotData(copySnap)), copyId: copySnap.id };
        if (copy.status !== 'IN_TRANSIT')
            throw new StorageError('CONFLICT', 'Copy is not awaiting closure review.');
        const reservations = await eligibleReservationQuery(this.db, loan.isbn).get();
        const earliestDocument = reservations.docs[0];
        const earliest = earliestDocument ? { ...earliestDocument.data(), reservationId: earliestDocument.id } : null;
        return { loan, copy, earliestReservation: earliest, allowedDispositions: ['AVAILABLE', 'DAMAGED', ...(earliest ? ['RESERVED'] : [])] };
    }
    async processReturn(loanId, disposition, actor) {
        return this.reviewClosure(loanId, 'CONFIRM', disposition, actor);
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