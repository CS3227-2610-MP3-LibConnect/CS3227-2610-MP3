import { db, firebaseProjectId } from './firebase.js';
import { createHash, randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { hash } from 'argon2';
import {
  UserRecordSchema,
  canonicalizeEmail,
  canonicalizeIdentity,
} from '../../../../packages/shared/src/domain/records.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Refusing to seed: FIRESTORE_EMULATOR_HOST must be set.');
}

const books = [
  {
    isbn: '9780140328721',
    title: 'Matilda',
    author: ['Roald Dahl'],
    publicationYear: 1988,
    publisher: 'Puffin Books',
    category: "Children's fiction",
    synopsis: 'A bright young reader discovers she has an extraordinary gift.',
  },
  {
    isbn: '9780061120084',
    title: 'To Kill a Mockingbird',
    author: ['Harper Lee'],
    publicationYear: 1960,
    publisher: 'J. B. Lippincott & Co.',
    category: 'Fiction',
    synopsis: 'A story of justice and childhood in a small Alabama town.',
  },
  {
    isbn: '9780451524935',
    title: '1984',
    author: ['George Orwell'],
    publicationYear: 1949,
    publisher: 'Secker & Warburg',
    category: 'Dystopian fiction',
    synopsis: 'A citizen struggles under an authoritarian surveillance state.',
  },
  {
    isbn: '9780743273565',
    title: 'The Great Gatsby',
    author: ['F. Scott Fitzgerald'],
    publicationYear: 1925,
    publisher: "Charles Scribner's Sons",
    category: 'Classic fiction',
    synopsis: 'A mysterious host pursues an idealized past in 1920s New York.',
  },
  {
    isbn: '9780316769488',
    title: 'The Catcher in the Rye',
    author: ['J. D. Salinger'],
    publicationYear: 1951,
    publisher: 'Little, Brown and Company',
    category: 'Coming-of-age fiction',
    synopsis: 'A teenager recounts several days away from his school in New York.',
  },
];

const timestamp = new Date();
const batch = db.batch();
const now = Timestamp.fromDate(timestamp);
const memberId = `seed-member-${randomUUID()}`;
const memberUserId = `seed-user-${randomUUID()}`;
const librarianUserId = `seed-librarian-${randomUUID()}`;
const employeeId = `seed-employee-${randomUUID()}`;
const passwordHash = await hash(randomUUID());
const users = [
  UserRecordSchema.parse({
    userId: memberUserId,
    name: 'Seed Member',
    email: `${memberUserId}@example.test`,
    emailCanonical: canonicalizeEmail(`${memberUserId}@example.test`),
    passwordHash,
    registrationDateTime: now,
    accountType: 'MEMBER',
    accountStatus: 'ACTIVE',
    authVersion: 0,
    memberId,
  }),
  UserRecordSchema.parse({
    userId: librarianUserId,
    name: 'Seed Librarian',
    email: `${librarianUserId}@example.test`,
    emailCanonical: canonicalizeEmail(`${librarianUserId}@example.test`),
    passwordHash,
    registrationDateTime: now,
    accountType: 'LIBRARIAN',
    accountStatus: 'ACTIVE',
    authVersion: 0,
    employeeId,
    employeeIdCanonical: canonicalizeIdentity(employeeId),
    isManager: false,
  }),
];
const identityKeyId = (kind: string, value: string) =>
  `${kind}_${createHash('sha256').update(value, 'utf8').digest('hex')}`;
for (const user of users) {
  batch.set(db.collection('users').doc(user.userId), user);
  for (const [kind, value] of [
    ['EMAIL', user.emailCanonical],
    ...(user.memberId ? [['MEMBER_ID', canonicalizeIdentity(user.memberId)]] : []),
    ...(user.employeeId ? [['EMPLOYEE_ID', canonicalizeIdentity(user.employeeId)]] : []),
  ] as Array<[string, string]>) {
    batch.set(db.collection('identityKeys').doc(identityKeyId(kind, value)), {
      kind,
      canonicalValue: value,
      ownerUserId: user.userId,
      createdAt: now,
    });
  }
}
const seededLoans = books.slice(0, 3).map((book, index) => {
  const loanId = `seed-loan-${index + 1}`;
  const copyId = `seed-${book.isbn}-01`;
  const borrowDateTime = Timestamp.fromDate(
    new Date(timestamp.getTime() - (40 + index) * 86400000),
  );
  const dueDate = Timestamp.fromDate(new Date(timestamp.getTime() - (10 + index) * 86400000));
  const loan = {
    loanId,
    memberId,
    copyId,
    isbn: book.isbn,
    bookTitle: book.title,
    borrowDateTime,
    dueDate,
    returnDateTime: null,
    closureReportType: null,
    closureReportedDateTime: null,
    closureReviewedDateTime: null,
    closureReviewDecision: null,
    closureReviewedByUserId: null,
    status: 'ACTIVE',
    isRenewed: false,
  } as const;
  batch.set(db.collection('loans').doc(loanId), loan);
  batch.set(db.collection('bookCopies').doc(copyId), {
    copyId,
    isbn: book.isbn,
    shelfLocation: `SEED-${String(index + 1).padStart(2, '0')}-01`,
    status: 'ON_LOAN',
    createdAt: now,
    updatedAt: now,
  });
  return loan;
});

const seededFines = seededLoans.map((loan, index) => {
  const fineId = `seed-fine-${index + 1}`;
  batch.set(db.collection('fines').doc(fineId), {
    fineId,
    loanId: loan.loanId,
    memberId,
    bookTitle: loan.bookTitle,
    amountMinorUnits: 500 + index * 250,
    currency: 'SGD',
    reason: 'Overdue loan',
    status: 'OUTSTANDING',
    issuedDateTime: now,
    paidDateTime: null,
    waivedDateTime: null,
  });
  return fineId;
});

const reservationId = 'seed-reservation-1';
batch.set(db.collection('reservations').doc(reservationId), {
  reservationId,
  memberId,
  isbn: books[3].isbn,
  copyId: null,
  reservationDateTime: now,
  expiryDate: null,
  status: 'PENDING',
  updatedAt: now,
});

const notificationRecords = [
  {
    notificationType: 'OVERDUE_ALERT',
    referenceType: 'LOAN',
    referenceId: seededLoans[0].loanId,
    message: 'A seeded loan is overdue.',
  },
  {
    notificationType: 'RESERVATION_READY',
    referenceType: 'RESERVATION',
    referenceId: reservationId,
    message: 'Your seeded reservation is ready.',
  },
  {
    notificationType: 'FINE_ISSUED',
    referenceType: 'FINE',
    referenceId: seededFines[0],
    message: 'A seeded fine was issued.',
  },
  {
    notificationType: 'FINE_UPDATED',
    referenceType: 'FINE',
    referenceId: seededFines[1],
    message: 'A seeded fine was updated.',
  },
  {
    notificationType: 'LIBRARIAN_MESSAGE',
    referenceType: null,
    referenceId: null,
    message: 'A seeded message from the librarian.',
  },
] as const;

for (const record of notificationRecords) {
  const notificationId = `seed-notification-${record.notificationType.toLowerCase()}`;
  batch.set(db.collection('notifications').doc(notificationId), {
    notificationId,
    recipientUserId: memberUserId,
    ...record,
    createdAt: now,
    read: false,
  });
}

for (const [bookIndex, book] of books.entries()) {
  batch.set(db.collection('books').doc(book.isbn), {
    ...book,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  for (let copyNumber = 1; copyNumber <= 3; copyNumber += 1) {
    const copyId = `seed-${book.isbn}-${String(copyNumber).padStart(2, '0')}`;
    batch.set(db.collection('bookCopies').doc(copyId), {
      copyId,
      isbn: book.isbn,
      shelfLocation:
        copyNumber === 1 && bookIndex < 3
          ? null
          : `SEED-${String(bookIndex + 1).padStart(2, '0')}-${String(copyNumber).padStart(2, '0')}`,
      status: copyNumber === 1 && bookIndex < 3 ? 'ON_LOAN' : 'AVAILABLE',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
}

await batch.commit();
console.info(
  `Seeded ${users.length} role accounts, ${books.length} books, ${books.length * 3} book copies, 3 loans, 3 fines, and ${notificationRecords.length} notifications into Firestore project ${firebaseProjectId} at emulator ${process.env.FIRESTORE_EMULATOR_HOST}.`,
);
