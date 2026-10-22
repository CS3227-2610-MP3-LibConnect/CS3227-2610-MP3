import { db } from './firebase.js';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Refusing to read local seed: FIRESTORE_EMULATOR_HOST must be set.');
}
const snapshot = await db.collection('books').doc('9780000000002').get();
if (!snapshot.exists)
    throw new Error('Seed book is missing; run npm run seed first.');
console.info(JSON.stringify({ isbn: snapshot.id, title: snapshot.get('title') }));
