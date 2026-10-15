import { db } from './firebase.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Refusing to seed: FIRESTORE_EMULATOR_HOST must be set.');
}

const timestamp = new Date();
await db.collection('books').doc('9780000000002').set({
  isbn: '9780000000002',
  title: 'Local Emulator Seed Book',
  author: ['LibConnect Development Team'],
  publicationYear: 2026,
  publisher: 'Local Seed Data',
  category: 'Development',
  synopsis: 'A sample record for local emulator development.',
  createdAt: timestamp,
  updatedAt: timestamp,
});
console.info('Seeded one sample book into the Firestore emulator.');
