import { createHash } from 'node:crypto';
import session from 'express-session';
import { Timestamp } from 'firebase-admin/firestore';
const defaultMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const maxAllowedAgeMs = 30 * 24 * 60 * 60 * 1000;
const revocationJobCollection = 'sessionRevocationJobs';
const revocationWorkerIntervalMs = 30_000;
const revocationRetryBaseMs = 30_000;
const revocationRetryMaxMs = 15 * 60_000;
function configuredMaxAge() {
    const value = Number(process.env.SESSION_MAX_AGE_MS ?? defaultMaxAgeMs);
    if (!Number.isSafeInteger(value) || value <= 0 || value > maxAllowedAgeMs) {
        throw new Error(`SESSION_MAX_AGE_MS must be an integer between 1 and ${maxAllowedAgeMs}.`);
    }
    return value;
}
function sessionDocumentId(sid) {
    return createHash('sha256').update(sid, 'utf8').digest('hex');
}
function expiryFor(value, maxAge) {
    const requested = value.cookie.expires ? new Date(value.cookie.expires) : new Date(Date.now() + maxAge);
    const ceiling = Date.now() + maxAge;
    return new Date(Math.min(requested.getTime(), ceiling));
}
export class FirestoreSessionStore extends session.Store {
    db;
    sessions;
    maxAge;
    constructor(db) {
        super();
        this.db = db;
        this.sessions = db.collection('sessions');
        this.maxAge = configuredMaxAge();
    }
    get(sid, callback) {
        void this.sessions.doc(sessionDocumentId(sid)).get().then(async (snapshot) => {
            if (!snapshot.exists)
                return callback(null, null);
            const data = snapshot.data();
            if (!(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() <= Date.now()) {
                await snapshot.ref.delete();
                return callback(null, null);
            }
            const cookie = new session.Cookie();
            Object.assign(cookie, data.cookie, {
                expires: typeof data.cookie.expires === 'string' ? new Date(data.cookie.expires) : data.cookie.expires,
            });
            const restored = { userId: data.userId, accountType: data.accountType, cookie };
            callback(null, restored);
        }).catch(callback);
    }
    set(sid, value, callback) {
        const userId = value.userId;
        const accountType = value.accountType;
        if (typeof userId !== 'string' || !userId || (accountType !== 'MEMBER' && accountType !== 'LIBRARIAN')) {
            callback?.(new Error('Only authenticated user sessions can be persisted.'));
            return;
        }
        const expiresAt = expiryFor(value, this.maxAge);
        if (expiresAt.getTime() <= Date.now()) {
            this.destroy(sid, callback ?? (() => undefined));
            return;
        }
        const stored = {
            userId,
            accountType,
            cookie: Object.fromEntries(Object.entries({
                originalMaxAge: value.cookie.originalMaxAge,
                maxAge: value.cookie.maxAge,
                expires: value.cookie.expires?.toISOString() ?? null,
                httpOnly: value.cookie.httpOnly,
                path: value.cookie.path,
                domain: value.cookie.domain,
                secure: value.cookie.secure,
                sameSite: value.cookie.sameSite,
            }).filter(([, fieldValue]) => fieldValue !== undefined)),
            expiresAt: Timestamp.fromDate(expiresAt),
        };
        void this.sessions.doc(sessionDocumentId(sid)).set(stored).then(() => callback?.(), callback);
    }
    destroy(sid, callback) {
        void this.sessions.doc(sessionDocumentId(sid)).delete().then(() => callback?.(), callback);
    }
    touch(sid, value, callback) {
        const expiresAt = expiryFor(value, this.maxAge);
        void this.sessions.doc(sessionDocumentId(sid)).update({ expiresAt: Timestamp.fromDate(expiresAt) })
            .then(() => callback?.(), (error) => {
            // A concurrent sign-out may have removed the record; touching it must not recreate it.
            if (error.code === 5)
                callback?.();
            else
                callback?.(error);
        });
    }
    async destroyForUser(userId) {
        const records = await this.sessions.where('userId', '==', userId).get();
        for (let offset = 0; offset < records.docs.length; offset += 450) {
            const batch = this.db.batch();
            records.docs.slice(offset, offset + 450).forEach((record) => batch.delete(record.ref));
            await batch.commit();
        }
    }
    async enqueueRevocation(userId) {
        const jobRef = this.db.collection(revocationJobCollection).doc(sessionDocumentId(userId));
        await this.db.runTransaction(async (tx) => {
            const snapshot = await tx.get(jobRef);
            const previous = snapshot.exists ? snapshot.data() : undefined;
            tx.set(jobRef, {
                userId,
                status: 'PENDING',
                attempts: typeof previous?.attempts === 'number' ? previous.attempts : 0,
                nextAttemptAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                ...(previous?.createdAt ? {} : { createdAt: Timestamp.now() }),
            }, { merge: true });
        });
    }
    async drainRevocationJobs(limit = 20) {
        const snapshot = await this.db.collection(revocationJobCollection)
            .where('status', '==', 'PENDING')
            .limit(limit)
            .get();
        for (const job of snapshot.docs) {
            const data = job.data();
            if (data.nextAttemptAt instanceof Timestamp && data.nextAttemptAt.toMillis() > Date.now())
                continue;
            try {
                await this.destroyForUser(data.userId);
                await job.ref.delete();
            }
            catch {
                const attempts = (typeof data.attempts === 'number' ? data.attempts : 0) + 1;
                const retryDelay = Math.min(revocationRetryMaxMs, revocationRetryBaseMs * (2 ** Math.min(attempts - 1, 5)));
                await job.ref.set({
                    status: 'PENDING',
                    attempts,
                    nextAttemptAt: Timestamp.fromMillis(Date.now() + retryDelay),
                    updatedAt: Timestamp.now(),
                }, { merge: true });
            }
        }
    }
    startRevocationWorker() {
        const drain = () => void this.drainRevocationJobs().catch(() => undefined);
        drain();
        const timer = setInterval(drain, revocationWorkerIntervalMs);
        timer.unref?.();
        return () => clearInterval(timer);
    }
}
