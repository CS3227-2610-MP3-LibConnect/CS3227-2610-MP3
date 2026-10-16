import { db, firebaseProjectId } from './firebase.js';

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
      shelfLocation: `SEED-${String(bookIndex + 1).padStart(2, '0')}-${String(copyNumber).padStart(2, '0')}`,
      status: 'AVAILABLE',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
}

await batch.commit();
console.info(
  `Seeded ${books.length} books and ${books.length * 3} book copies into Firestore project ${firebaseProjectId} at emulator ${process.env.FIRESTORE_EMULATOR_HOST}.`,
);
