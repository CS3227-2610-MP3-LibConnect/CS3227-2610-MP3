import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT;
if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID or GCLOUD_PROJECT must be set.');
}
const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (process.env.NODE_ENV === 'production' && isEmulator) {
    throw new Error('Production must not use the Firestore emulator.');
}
const app = getApps()[0] ?? initializeApp({
    projectId,
    ...(isEmulator ? {} : { credential: applicationDefault() }),
});
export const db = getFirestore(app);
export const firebaseProjectId = projectId;
//# sourceMappingURL=firebase.js.map