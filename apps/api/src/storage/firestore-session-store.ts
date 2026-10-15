import { createHash } from 'node:crypto';
import session from 'express-session';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    accountType?: 'MEMBER' | 'LIBRARIAN';
  }
}

type StoredSession = {
  userId: string;
  accountType: 'MEMBER' | 'LIBRARIAN';
  cookie: Record<string, unknown>;
  expiresAt: Timestamp;
};

const defaultMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const maxAllowedAgeMs = 30 * 24 * 60 * 60 * 1000;

function configuredMaxAge(): number {
  const value = Number(process.env.SESSION_MAX_AGE_MS ?? defaultMaxAgeMs);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maxAllowedAgeMs) {
    throw new Error(`SESSION_MAX_AGE_MS must be an integer between 1 and ${maxAllowedAgeMs}.`);
  }
  return value;
}

function sessionDocumentId(sid: string): string {
  return createHash('sha256').update(sid, 'utf8').digest('hex');
}

function expiryFor(value: session.SessionData, maxAge: number): Date {
  const requested = value.cookie.expires ? new Date(value.cookie.expires) : new Date(Date.now() + maxAge);
  const ceiling = Date.now() + maxAge;
  return new Date(Math.min(requested.getTime(), ceiling));
}

export class FirestoreSessionStore extends session.Store {
  private readonly sessions;
  private readonly maxAge: number;

  constructor(private readonly db: Firestore) {
    super();
    this.sessions = db.collection('sessions');
    this.maxAge = configuredMaxAge();
  }

  get(sid: string, callback: (err?: unknown, session?: session.SessionData | null) => void): void {
    void this.sessions.doc(sessionDocumentId(sid)).get().then(async (snapshot) => {
      if (!snapshot.exists) return callback(null, null);
      const data = snapshot.data() as StoredSession;
      if (!(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() <= Date.now()) {
        await snapshot.ref.delete();
        return callback(null, null);
      }
      const cookie = new session.Cookie();
      Object.assign(cookie, data.cookie, {
        expires: typeof data.cookie.expires === 'string' ? new Date(data.cookie.expires) : data.cookie.expires,
      });
      const restored = { userId: data.userId, accountType: data.accountType, cookie } as session.SessionData;
      callback(null, restored);
    }).catch(callback);
  }

  set(sid: string, value: session.SessionData, callback?: (err?: unknown) => void): void {
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
    const stored: StoredSession = {
      userId,
      accountType,
      cookie: {
        originalMaxAge: value.cookie.originalMaxAge,
        maxAge: value.cookie.maxAge,
        expires: value.cookie.expires?.toISOString() ?? null,
        httpOnly: value.cookie.httpOnly,
        path: value.cookie.path,
        domain: value.cookie.domain,
        secure: value.cookie.secure,
        sameSite: value.cookie.sameSite,
      },
      expiresAt: Timestamp.fromDate(expiresAt),
    };
    void this.sessions.doc(sessionDocumentId(sid)).set(stored).then(() => callback?.(), callback);
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    void this.sessions.doc(sessionDocumentId(sid)).delete().then(() => callback?.(), callback);
  }

  touch(sid: string, value: session.SessionData, callback?: (err?: unknown) => void): void {
    const expiresAt = expiryFor(value, this.maxAge);
    void this.sessions.doc(sessionDocumentId(sid)).update({ expiresAt: Timestamp.fromDate(expiresAt) })
      .then(() => callback?.(), (error: unknown) => {
        // A concurrent sign-out may have removed the record; touching it must not recreate it.
        if ((error as { code?: number }).code === 5) callback?.();
        else callback?.(error);
      });
  }

  async destroyForUser(userId: string): Promise<void> {
    const records = await this.sessions.where('userId', '==', userId).get();
    for (let offset = 0; offset < records.docs.length; offset += 450) {
      const batch = this.db.batch();
      records.docs.slice(offset, offset + 450).forEach((record) => batch.delete(record.ref));
      await batch.commit();
    }
  }
}
