import { createHash, randomUUID } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { LoanRecordSchema, ReservationRecordSchema } from '../../../../packages/shared/src/domain/records.js';
import { StorageError } from './repositories.js';
import { getLostBookFineMinorUnits, getOverdueFinePolicy } from '../config/fines.js';
function requireActive(actor) {
    if (!actor || actor.accountStatus !== 'ACTIVE')
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
function withId(snapshot, field) {
    return snapshot.exists ? { ...snapshot.data(), [field]: snapshot.id } : undefined;
}
function requireMember(actor) {
    requireActive(actor);
    if (actor.accountType !== 'MEMBER' || typeof actor.memberId !== 'string' || !actor.memberId.trim())
        throw new StorageError('FORBIDDEN', 'Member access is required.');
}
function hashValue(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}
function assertNotificationReferenceType(notificationType, referenceType) {
    const valid = referenceType === 'LOAN' ? notificationType === 'OVERDUE_ALERT'
        : referenceType === 'RESERVATION' ? notificationType === 'RESERVATION_READY'
            : referenceType === 'FINE' ? ['FINE_ISSUED', 'FINE_UPDATED'].includes(notificationType)
                : false;
    if (!valid)
        throw new StorageError('INVALID', 'Reference type does not match the notification type.');
}
async function validateNotificationInTransaction(tx, db, notification, recordOverride) {
    if ((notification.referenceType === null) !== (notification.referenceId === null))
        throw new StorageError('INVALID', 'Reference type and ID must be paired.');
    if (!notification.referenceType || !notification.referenceId) {
        if (notification.notificationType !== 'LIBRARIAN_MESSAGE')
            throw new StorageError('INVALID', 'This notification type requires a reference.');
        return;
    }
    assertNotificationReferenceType(notification.notificationType, notification.referenceType);
    const collection = { LOAN: 'loans', RESERVATION: 'reservations', FINE: 'fines' }[notification.referenceType];
    const referenceSnapshot = recordOverride ? undefined : await tx.get(db.collection(collection).doc(notification.referenceId));
    const record = recordOverride ?? snapshotData(referenceSnapshot);
    if (!record || record.memberId === undefined)
        throw new StorageError('INVALID', 'Notification reference does not exist.');
    const recipientSnapshot = await tx.get(db.collection('users').where('memberId', '==', record.memberId).limit(1));
    if (recipientSnapshot.docs[0]?.id !== notification.recipientUserId)
        throw new StorageError('INVALID', 'Reference belongs to another notification recipient.');
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
function nextSingaporeDayStart(dueDate) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(dueDate.toDate());
    const part = (type) => parts.find((value) => value.type === type)?.value;
    const year = Number(part('year'));
    const month = Number(part('month'));
    const day = Number(part('day'));
    return Date.UTC(year, month - 1, day + 1) - 8 * 60 * 60 * 1000;
}
export class LibraryWorkflows {
    db;
    constructor(db) {
        this.db = db;
    }
    async memberLoans(actor) {
        requireMember(actor);
        const snapshot = await this.db.collection('loans')
            .where('memberId', '==', actor.memberId)
            .orderBy('borrowDateTime', 'desc')
            .get();
        return snapshot.docs.map((doc) => {
            const loan = LoanRecordSchema.parse({ ...doc.data(), loanId: doc.id });
            return {
                loanId: loan.loanId,
                bookTitle: loan.bookTitle,
                dueDate: loan.dueDate,
                status: loan.status,
                closureReportType: loan.closureReportType,
                returnDateTime: loan.returnDateTime,
                isRenewed: loan.isRenewed,
            };
        });
    }
    async renewMemberLoan(loanId, actor) {
        requireMember(actor);
        const userRef = this.db.collection('users').doc(actor.userId);
        const loanRef = this.db.collection('loans').doc(loanId);
        return this.db.runTransaction(async (tx) => {
            const user = snapshotData(await tx.get(userRef));
            if (!user || user.accountType !== 'MEMBER' || user.accountStatus !== 'ACTIVE' || user.memberId !== actor.memberId)
                throw new StorageError('FORBIDDEN', 'Active member access is required.');
            const loan = mustExist(snapshotData(await tx.get(loanRef)));
            if (loan.memberId !== actor.memberId)
                throw new StorageError('FORBIDDEN', 'Members may renew only their own loans.');
            if (loan.status !== 'ACTIVE' || loan.isRenewed !== false || !(loan.dueDate instanceof Timestamp))
                throw new StorageError('CONFLICT', 'Loan is no longer eligible for renewal.');
            const now = Timestamp.now();
            if (now.toMillis() >= nextSingaporeDayStart(loan.dueDate))
                throw new StorageError('CONFLICT', 'Loan is no longer eligible for renewal.');
            const renewed = {
                ...loan,
                dueDate: Timestamp.fromMillis(loan.dueDate.toMillis() + 30 * 24 * 60 * 60 * 1000),
                isRenewed: true,
            };
            tx.update(loanRef, { dueDate: renewed.dueDate, isRenewed: true });
            return LoanRecordSchema.parse({ ...renewed, loanId });
        });
    }
    async memberReservation(isbn, actor) {
        requireMember(actor);
        const snapshot = await this.db.collection('reservations')
            .where('memberId', '==', actor.memberId)
            .where('isbn', '==', isbn)
            .where('status', '==', 'PENDING')
            .limit(1)
            .get();
        const doc = snapshot.docs[0];
        return doc ? ReservationRecordSchema.parse({ ...doc.data(), reservationId: doc.id }) : null;
    }
    async createMemberReservation(isbn, actor) {
        requireMember(actor);
        const now = Timestamp.now();
        const reservationId = randomUUID();
        const userRef = this.db.collection('users').doc(actor.userId);
        const bookRef = this.db.collection('books').doc(isbn);
        const reservationRef = this.db.collection('reservations').doc(reservationId);
        const copiesQuery = this.db.collection('bookCopies').where('isbn', '==', isbn).where('status', '==', 'AVAILABLE');
        const pendingQuery = this.db.collection('reservations')
            .where('memberId', '==', actor.memberId).where('isbn', '==', isbn).where('status', '==', 'PENDING');
        return this.db.runTransaction(async (tx) => {
            const [userSnap, bookSnap, availableCopies, pendingReservations] = await Promise.all([
                tx.get(userRef), tx.get(bookRef), tx.get(copiesQuery), tx.get(pendingQuery),
            ]);
            const user = mustExist(snapshotData(userSnap));
            if (user.accountType !== 'MEMBER' || user.accountStatus !== 'ACTIVE' || user.memberId !== actor.memberId)
                throw new StorageError('FORBIDDEN', 'Active member access is required.');
            mustExist(snapshotData(bookSnap));
            if (pendingReservations.size > 0)
                throw new StorageError('CONFLICT', 'A pending reservation already exists for this title.');
            if (availableCopies.size > 0)
                throw new StorageError('CONFLICT', 'A copy is available to borrow.');
            const reservation = ReservationRecordSchema.parse({
                reservationId, memberId: actor.memberId, isbn, status: 'PENDING',
                reservationDateTime: now, copyId: null, expiryDate: null,
            });
            tx.create(reservationRef, reservation);
            tx.update(userRef, { updatedAt: now });
            tx.update(bookRef, { updatedAt: now });
            return reservation;
        });
    }
    async cancelMemberReservation(reservationId, actor) {
        requireMember(actor);
        const reservationRef = this.db.collection('reservations').doc(reservationId);
        return this.db.runTransaction(async (tx) => {
            const reservation = mustExist(snapshotData(await tx.get(reservationRef)));
            if (reservation.memberId !== actor.memberId)
                throw new StorageError('FORBIDDEN', 'Members may access only their own reservations.');
            if (reservation.status !== 'PENDING')
                throw new StorageError('CONFLICT', 'Only a pending reservation can be cancelled.');
            let copyRef;
            if (reservation.copyId) {
                copyRef = this.db.collection('bookCopies').doc(String(reservation.copyId));
                const copy = snapshotData(await tx.get(copyRef));
                if (!copy || copy.status !== 'RESERVED' || copy.reservationId !== reservationId)
                    throw new StorageError('CONFLICT', 'Reservation copy linkage is inconsistent.');
            }
            const now = Timestamp.now();
            tx.update(reservationRef, { status: 'CANCELLED', updatedAt: now });
            if (copyRef)
                tx.update(copyRef, { status: 'AVAILABLE', reservationId: null, updatedAt: now });
        });
    }
    async memberBorrowCapacity(actor) {
        requireMember(actor);
        const openLoans = await this.db.collection('loans')
            .where('memberId', '==', actor.memberId)
            .where('status', 'in', ['ACTIVE', 'PENDING_CLOSE'])
            .get();
        const openLoanCount = openLoans.size;
        return { openLoanCount, remainingSlots: Math.max(0, 10 - openLoanCount) };
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
        if (!Array.isArray(copyIds) || copyIds.length < 1 || copyIds.length > 10
            || copyIds.some((copyId) => typeof copyId !== 'string' || !copyId.trim() || copyId.includes('/'))
            || new Set(copyIds).size !== copyIds.length) {
            throw new StorageError('INVALID', 'One to ten unique copy IDs are required.');
        }
        const userRef = this.db.collection('users').doc(actor.userId);
        const copyRefs = copyIds.map((copyId) => this.db.collection('bookCopies').doc(copyId));
        const loanIds = copyIds.map(() => randomUUID());
        const loanRefs = loanIds.map((loanId) => this.db.collection('loans').doc(loanId));
        const openLoansQuery = this.db.collection('loans')
            .where('memberId', '==', actor.memberId)
            .where('status', 'in', ['ACTIVE', 'PENDING_CLOSE']);
        return this.db.runTransaction(async (tx) => {
            const [userSnap, openLoansSnap, ...copySnapshots] = await Promise.all([
                tx.get(userRef), tx.get(openLoansQuery), ...copyRefs.map((copyRef) => tx.get(copyRef)),
            ]);
            const user = mustExist(snapshotData(userSnap));
            if (user.accountType !== 'MEMBER' || user.accountStatus !== 'ACTIVE' || user.memberId !== actor.memberId)
                throw new StorageError('FORBIDDEN', 'Active member access is required.');
            if (openLoansSnap.size + copyIds.length > 10) {
                const remainingSlots = Math.max(0, 10 - openLoansSnap.size);
                throw new StorageError('CONFLICT', `Member may borrow only ${remainingSlots} additional ${remainingSlots === 1 ? 'copy' : 'copies'}.`);
            }
            const copies = copySnapshots.map((copySnapshot) => mustExist(snapshotData(copySnapshot)));
            for (const copy of copies) {
                if (copy.status !== 'AVAILABLE')
                    throw new StorageError('CONFLICT', 'Every selected copy must still be available to borrow.');
            }
            const isbns = [...new Set(copies.map((copy) => String(copy.isbn)))];
            const bookSnapshots = await Promise.all(isbns.map((isbn) => tx.get(this.db.collection('books').doc(isbn))));
            const booksByIsbn = new Map(isbns.map((isbn, index) => [isbn, mustExist(snapshotData(bookSnapshots[index]))]));
            const now = Timestamp.now();
            const loans = copies.map((copy, index) => LoanRecordSchema.parse({
                loanId: loanIds[index], memberId: actor.memberId, copyId: copyIds[index], isbn: copy.isbn,
                bookTitle: booksByIsbn.get(String(copy.isbn)).title,
                borrowDateTime: now, dueDate: Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000),
                returnDateTime: null, closureReportType: null, closureReportedDateTime: null,
                closureReviewedDateTime: null, closureReviewDecision: null, closureReviewedByUserId: null,
                status: 'ACTIVE', isRenewed: false,
            }));
            tx.update(userRef, { updatedAt: now });
            for (let index = 0; index < copies.length; index += 1) {
                tx.update(copyRefs[index], { status: 'ON_LOAN', shelfLocation: null, reservationId: null, updatedAt: now });
                tx.create(loanRefs[index], loans[index]);
            }
            return loans;
        });
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
                const recipientSnapshot = await tx.get(this.db.collection('users').where('memberId', '==', loan.memberId).limit(1));
                const recipient = recipientSnapshot.docs[0];
                if (!recipient || recipient.get('accountType') !== 'MEMBER')
                    throw new StorageError('CONFLICT', 'The fine member account cannot receive a notification.');
                const notificationRef = this.db.collection('notifications').doc(`fine-issued-${fineRef.id}`);
                const notificationSnapshot = await tx.get(notificationRef);
                const notification = notificationSnapshot.exists ? { ...notificationSnapshot.data(), notificationId: notificationRef.id } : {
                    notificationId: notificationRef.id, recipientUserId: recipient.id, notificationType: 'FINE_ISSUED',
                    referenceType: 'FINE', referenceId: fineRef.id,
                    message: `A lost-book fine of SGD ${(Number(fine.amountMinorUnits) / 100).toFixed(2)} was issued.`, createdAt: now, read: false,
                };
                if (notificationSnapshot.exists && (notification.recipientUserId !== recipient.id || notification.referenceType !== 'FINE' || notification.referenceId !== fineRef.id || notification.notificationType !== 'FINE_ISSUED'))
                    throw new StorageError('CONFLICT', 'A conflicting fine notification already exists.');
                await validateNotificationInTransaction(tx, this.db, notification, fine);
                tx.update(loanRef, { status: 'CLOSED_LOST', ...reviewMetadata });
                tx.update(copyRef, { status: 'LOST', updatedAt: now });
                if (!existingFineSnapshot.exists) tx.create(fineRef, fine);
                if (!notificationSnapshot.exists) tx.create(notificationRef, notification);
                result = { loan: updatedLoan, copy: updatedCopy, fine, notification };
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
                if (!recipient || recipient.get('accountType') !== 'MEMBER')
                    throw new StorageError('CONFLICT', 'Reservation member account cannot receive a notification.');
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
                if (notificationSnapshot.exists && (notification.recipientUserId !== recipient.id || notification.referenceType !== 'RESERVATION' || notification.referenceId !== earliest.reservationId || notification.notificationType !== 'RESERVATION_READY'))
                    throw new StorageError('CONFLICT', 'A conflicting reservation notification already exists.');
                await validateNotificationInTransaction(tx, this.db, notification, earliest);
                tx.update(earliest.ref, { copyId: copyRef.id, expiryDate: expiry, updatedAt: now });
                if (!notificationSnapshot.exists) tx.create(notificationRef, notification);
            }
            if (!updatedCopy) updatedCopy = { ...copy, status: returnDisposition, reservationId: null, updatedAt: now };
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
            if (Number.isNaN(cursorDate.valueOf())) throw new StorageError('INVALID', 'The pending-queue cursor is stale or invalid.');
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
        if (copy.status !== 'IN_TRANSIT') throw new StorageError('CONFLICT', 'Copy is not awaiting closure review.');
        const reservations = await eligibleReservationQuery(this.db, loan.isbn).get();
        const earliestDocument = reservations.docs[0];
        const earliest = earliestDocument ? { ...earliestDocument.data(), reservationId: earliestDocument.id } : null;
        return { loan, copy, earliestReservation: earliest, allowedDispositions: ['AVAILABLE', 'DAMAGED', ...(earliest ? ['RESERVED'] : [])] };
    }
    async processReturn(loanId, disposition, actor) {
        return this.reviewClosure(loanId, 'CONFIRM', disposition, actor);
    }
    async payFine(fineId, actor) {
        requireMember(actor);
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
    async listReservations(options, actor) {
        requireLibrarian(actor);
        const limit = Math.max(1, Math.min(50, Number(options?.limit ?? 20)));
        const filters = { isbn: options?.isbn, status: options?.status };
        const filterKey = hashValue(JSON.stringify({ kind: 'reservations', filters }));
        let query = this.db.collection('reservations');
        if (filters.isbn !== undefined)
            query = query.where('isbn', '==', filters.isbn);
        if (filters.status !== undefined)
            query = query.where('status', '==', filters.status);
        query = query.orderBy('reservationDateTime').orderBy(FieldPath.documentId());
        if (options?.cursor) {
            if (options.cursor.filterKey !== filterKey)
                throw new StorageError('INVALID', 'Cursor does not match this reservation search.');
            const cursorDate = new Date(options.cursor.lastReservationDateTime);
            if (Number.isNaN(cursorDate.valueOf()))
                throw new StorageError('INVALID', 'The reservation cursor is stale or invalid.');
            query = query.startAfter(Timestamp.fromDate(cursorDate), options.cursor.lastReservationId);
        }
        const snapshot = await query.limit(limit + 1).get();
        const documents = snapshot.docs.slice(0, limit);
        const items = documents.map((document) => withId(document, 'reservationId'));
        const last = items.at(-1);
        return {
            items,
            nextCursor: snapshot.docs.length > limit && last ? {
                filterKey,
                lastReservationDateTime: last.reservationDateTime.toDate().toISOString(),
                lastReservationId: last.reservationId,
            } : null,
        };
    }
    async getLibrarianReservation(reservationId, actor) {
        requireLibrarian(actor);
        const snapshot = await this.db.collection('reservations').doc(reservationId).get();
        return withId(snapshot, 'reservationId') ?? (() => { throw new StorageError('NOT_FOUND', 'Record was not found.'); })();
    }
    async listFines(options, actor) {
        requireLibrarian(actor);
        const limit = Math.max(1, Math.min(50, Number(options?.limit ?? 20)));
        const filters = { status: options?.status, memberId: options?.memberId, loanId: options?.loanId };
        const filterKey = hashValue(JSON.stringify({ kind: 'fines', filters }));
        let query = this.db.collection('fines');
        for (const [field, value] of Object.entries(filters)) {
            if (value !== undefined)
                query = query.where(field, '==', value);
        }
        query = query.orderBy('issuedDateTime', 'desc').orderBy(FieldPath.documentId(), 'desc');
        if (options?.cursor) {
            if (options.cursor.filterKey !== filterKey)
                throw new StorageError('INVALID', 'Cursor does not match this fine search.');
            const cursorDate = new Date(options.cursor.lastIssuedDateTime);
            if (Number.isNaN(cursorDate.valueOf()))
                throw new StorageError('INVALID', 'The fine cursor is stale or invalid.');
            query = query.startAfter(Timestamp.fromDate(cursorDate), options.cursor.lastFineId);
        }
        const snapshot = await query.limit(limit + 1).get();
        const documents = snapshot.docs.slice(0, limit);
        const items = documents.map((document) => withId(document, 'fineId'));
        const last = items.at(-1);
        return {
            items,
            nextCursor: snapshot.docs.length > limit && last ? {
                filterKey,
                lastIssuedDateTime: last.issuedDateTime.toDate().toISOString(),
                lastFineId: last.fineId,
            } : null,
        };
    }
    async getLibrarianFine(fineId, actor) {
        requireLibrarian(actor);
        const snapshot = await this.db.collection('fines').doc(fineId).get();
        return withId(snapshot, 'fineId') ?? (() => { throw new StorageError('NOT_FOUND', 'Record was not found.'); })();
    }
    async waiveFine(fineId, actor) {
        requireLibrarian(actor);
        const ref = this.db.collection('fines').doc(fineId);
        let result;
        await this.db.runTransaction(async (tx) => {
            const fineSnapshot = await tx.get(ref);
            const fine = { ...mustExist(snapshotData(fineSnapshot)), fineId: ref.id };
            if (fine.status !== 'OUTSTANDING')
                throw new StorageError('CONFLICT', 'Only an outstanding fine can be waived.');
            const recipientSnapshot = await tx.get(this.db.collection('users').where('memberId', '==', fine.memberId).limit(1));
            const recipient = recipientSnapshot.docs[0];
            if (!recipient || recipient.get('accountType') !== 'MEMBER')
                throw new StorageError('CONFLICT', 'The fine member account cannot receive a notification.');
            const notificationRef = this.db.collection('notifications').doc(`fine-updated-${fine.fineId}`);
            const notificationSnapshot = await tx.get(notificationRef);
            const now = Timestamp.now();
            const notification = notificationSnapshot.exists ? { ...notificationSnapshot.data(), notificationId: notificationRef.id } : {
                notificationId: notificationRef.id, recipientUserId: recipient.id, notificationType: 'FINE_UPDATED',
                referenceType: 'FINE', referenceId: fine.fineId,
                message: `Your fine for ${String(fine.bookTitle)} was waived.`, createdAt: now, read: false,
            };
            if (notificationSnapshot.exists && (notification.recipientUserId !== recipient.id || notification.referenceType !== 'FINE' || notification.referenceId !== fine.fineId || notification.notificationType !== 'FINE_UPDATED'))
                throw new StorageError('CONFLICT', 'A conflicting fine notification already exists.');
            await validateNotificationInTransaction(tx, this.db, notification, fine);
            tx.update(ref, { status: 'WAIVED', waivedDateTime: now });
            if (!notificationSnapshot.exists)
                tx.create(notificationRef, notification);
            result = { fine: { ...fine, status: 'WAIVED', waivedDateTime: now }, notification };
        });
        return result;
    }
    async sendLibrarianMessage(input, actor, idempotencyKey) {
        requireLibrarian(actor);
        if (!input?.memberId || !input?.message || !idempotencyKey)
            throw new StorageError('INVALID', 'A member ID, message, and idempotency key are required.');
        const payloadHash = hashValue(JSON.stringify({ memberId: input.memberId, message: input.message }));
        const idempotencyId = hashValue(`${actor.userId}:${idempotencyKey}`);
        const idempotencyRef = this.db.collection('notificationIdempotency').doc(idempotencyId);
        const now = Timestamp.now();
        let result;
        await this.db.runTransaction(async (tx) => {
            const idempotencySnapshot = await tx.get(idempotencyRef);
            if (idempotencySnapshot.exists) {
                const record = idempotencySnapshot.data();
                const createdAt = record.createdAt instanceof Timestamp ? record.createdAt : now;
                if (createdAt.toMillis() + 7 * 24 * 60 * 60 * 1000 > now.toMillis()) {
                    if (record.payloadHash !== payloadHash)
                        throw new StorageError('CONFLICT', 'The idempotency key was already used for a different message.');
                    const existingNotification = await tx.get(this.db.collection('notifications').doc(String(record.notificationId)));
                    const notification = withId(existingNotification, 'notificationId');
                    if (!notification)
                        throw new StorageError('CONFLICT', 'The idempotency record has no matching notification.');
                    result = { notification };
                    return;
                }
            }
            const recipientSnapshot = await tx.get(this.db.collection('users').where('memberId', '==', input.memberId).limit(1));
            const recipient = recipientSnapshot.docs[0];
            if (!recipient || recipient.get('accountType') !== 'MEMBER' || recipient.get('accountStatus') !== 'ACTIVE')
                throw new StorageError('FORBIDDEN', 'Messages may be sent only to active members.');
            const notificationRef = this.db.collection('notifications').doc(`librarian-message-${idempotencyId}-${randomUUID()}`);
            const notification = {
                notificationId: notificationRef.id, recipientUserId: recipient.id, notificationType: 'LIBRARIAN_MESSAGE',
                referenceType: null, referenceId: null, message: input.message, createdAt: now, read: false,
            };
            await validateNotificationInTransaction(tx, this.db, notification);
            tx.create(notificationRef, notification);
            tx.set(idempotencyRef, {
                payloadHash, notificationId: notificationRef.id, createdAt: now,
                expiresAt: Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000),
            });
            result = { notification };
        });
        return result;
    }
    async processOverdue(now = Timestamp.now(), limit = 100) {
        const policy = getOverdueFinePolicy();
        const boundedLimit = Math.max(1, Math.min(100, Number(limit)));
        const cutoff = Timestamp.fromMillis(now.toMillis() - policy.graceHours * 60 * 60 * 1000);
        const cursorRef = this.db.collection('workerState').doc('overdue');
        const cursorSnapshot = await cursorRef.get();
        const cursor = snapshotData(cursorSnapshot);
        let dueQuery = this.db.collection('loans').where('status', '==', 'ACTIVE').where('dueDate', '<=', cutoff)
            .orderBy('dueDate').orderBy(FieldPath.documentId());
        if (cursor?.lastDueDate instanceof Timestamp && typeof cursor.lastLoanId === 'string' && cursor.lastLoanId.length > 0)
            dueQuery = dueQuery.startAfter(cursor.lastDueDate, cursor.lastLoanId);
        const due = await dueQuery.limit(boundedLimit).get();
        let issued = 0;
        for (const candidate of due.docs) {
            const didIssue = await this.db.runTransaction(async (tx) => {
                const loanSnapshot = await tx.get(candidate.ref);
                const loan = { ...mustExist(snapshotData(loanSnapshot)), loanId: candidate.id };
                if (loan.status !== 'ACTIVE' || !(loan.dueDate instanceof Timestamp) || loan.dueDate.toMillis() > cutoff.toMillis())
                    return false;
                const fineRef = this.db.collection('fines').doc(`overdue-${loan.loanId}`);
                const notificationRef = this.db.collection('notifications').doc(`overdue-alert-${loan.loanId}`);
                const [fineSnapshot, notificationSnapshot, recipientSnapshot] = await Promise.all([
                    tx.get(fineRef), tx.get(notificationRef), tx.get(this.db.collection('users').where('memberId', '==', loan.memberId).limit(1)),
                ]);
                const recipient = recipientSnapshot.docs[0];
                if (!recipient || recipient.get('accountType') !== 'MEMBER')
                    throw new StorageError('CONFLICT', 'The overdue loan member account cannot receive a notification.');
                const fine = fineSnapshot.exists ? { ...fineSnapshot.data(), fineId: fineRef.id } : {
                    fineId: fineRef.id, loanId: loan.loanId, memberId: loan.memberId, bookTitle: loan.bookTitle,
                    amountMinorUnits: policy.amountMinorUnits, currency: 'SGD', reason: 'Overdue loan', status: 'OUTSTANDING',
                    issuedDateTime: now, paidDateTime: null, waivedDateTime: null,
                };
                if (fine.loanId !== loan.loanId || fine.memberId !== loan.memberId || fine.amountMinorUnits !== policy.amountMinorUnits || fine.currency !== 'SGD')
                    throw new StorageError('CONFLICT', 'A conflicting overdue fine already exists.');
                const notification = notificationSnapshot.exists ? { ...notificationSnapshot.data(), notificationId: notificationRef.id } : {
                    notificationId: notificationRef.id, recipientUserId: recipient.id, notificationType: 'OVERDUE_ALERT',
                    referenceType: 'LOAN', referenceId: loan.loanId,
                    message: `Your loan for ${String(loan.bookTitle)} is overdue. A fine of SGD ${(policy.amountMinorUnits / 100).toFixed(2)} was issued.`, createdAt: now, read: false,
                };
                if (notificationSnapshot.exists && (notification.recipientUserId !== recipient.id || notification.notificationType !== 'OVERDUE_ALERT' || notification.referenceType !== 'LOAN' || notification.referenceId !== loan.loanId))
                    throw new StorageError('CONFLICT', 'A conflicting overdue notification already exists.');
                await validateNotificationInTransaction(tx, this.db, notification, loan);
                if (!fineSnapshot.exists)
                    tx.create(fineRef, fine);
                if (!notificationSnapshot.exists)
                    tx.create(notificationRef, notification);
                return !fineSnapshot.exists || !notificationSnapshot.exists;
            });
            if (didIssue)
                issued += 1;
        }
        const last = due.docs.at(-1);
        if (due.docs.length < boundedLimit || !last) {
            await cursorRef.delete();
        }
        else {
            const lastDueDate = last.get('dueDate');
            if (lastDueDate instanceof Timestamp)
                await cursorRef.set({ lastDueDate, lastLoanId: last.id, updatedAt: now });
            else
                await cursorRef.delete();
        }
        return { examined: due.size, issued, policyKey: policy.policyKey };
    }
    async expireReservations(now = Timestamp.now(), limit = 100) {
        const due = await this.db.collection('reservations').where('status', '==', 'PENDING').where('expiryDate', '<=', now).orderBy('expiryDate').limit(Math.min(100, Math.max(1, Number(limit)))).get();
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
