import express from 'express';
import session from 'express-session';
import { db, firebaseProjectId } from './storage/firebase.js';
import { FirestoreSessionStore } from './storage/firestore-session-store.js';
import { LibraryRepository, UserRepository } from './storage/repositories.js';
import { createCatalogRouter } from './routes/catalog.js';
import { createAuthRouter } from './routes/auth.js';
import { createManagerRouter } from './routes/manager.js';
import { createCirculationRouter } from './routes/circulation.js';
import { createReservationsFinesRouter } from './routes/reservations-fines.js';
import { createLibrarianMemberRouter } from './routes/librarian-members.js';
import { AccountStorage } from './storage/accounts.js';
import { LibraryWorkflows } from './storage/workflows.js';
import { requireActiveActor } from './http/auth.js';
import { originProtection } from './http/origin-protection.js';
import { apiErrorHandler, notFoundHandler } from './http/errors.js';
import { resolveApiOrigin, validateOrigin } from './config/origins.js';
const port = Number(process.env.PORT ?? 3000);
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32)
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
const clientOrigin = process.env.CLIENT_ORIGIN;
if (!clientOrigin)
    throw new Error('CLIENT_ORIGIN must be configured.');
const validatedClientOrigin = validateOrigin('CLIENT_ORIGIN', clientOrigin);
const apiOrigin = resolveApiOrigin({ nodeEnv: process.env.NODE_ENV, apiOrigin: process.env.API_ORIGIN, port });
const sessionStore = new FirestoreSessionStore(db);
sessionStore.startRevocationWorker();
const app = express();
app.disable('x-powered-by');
app.use(originProtection(validatedClientOrigin, apiOrigin));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(express.json({ limit: '16kb' }));
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
};
app.use(session({
    store: sessionStore,
    secret: sessionSecret,
    name: 'libconnect.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
        ...cookieOptions,
        maxAge: Number(process.env.SESSION_MAX_AGE_MS ?? 7 * 24 * 60 * 60 * 1000),
    },
}));
app.get('/health', async (_request, response) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            db.listCollections(),
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error('Firestore health check timed out.')), 5000);
            }),
        ]);
        response.json({ status: 'ok', storage: 'connected', projectId: firebaseProjectId });
    }
    catch {
        response.status(503).json({ status: 'unavailable', storage: 'disconnected' });
    }
    finally {
        if (timeout)
            clearTimeout(timeout);
    }
});

const userRepository = new UserRepository(db);
const libraryRepository = new LibraryRepository(db);
const accountStorage = new AccountStorage(db, sessionStore);
const libraryWorkflows = new LibraryWorkflows(db);
app.use('/api/v1/auth', createAuthRouter(accountStorage, userRepository, cookieOptions, clientOrigin));
const requireBusinessActor = requireActiveActor(userRepository);
app.use('/api/v1', (request, response, next) => {
    if (request.path === '/auth' || request.path.startsWith('/auth/'))
        return next();
    return requireBusinessActor(request, response, next);
});
app.use('/api/v1', createCatalogRouter(libraryRepository, userRepository, sessionSecret));
app.use('/api/v1', createCirculationRouter(libraryWorkflows, userRepository, sessionSecret));
app.use('/api/v1', createReservationsFinesRouter(libraryWorkflows, userRepository, sessionSecret));
app.use('/api/v1/librarian', createLibrarianMemberRouter(accountStorage, userRepository, sessionSecret));
app.use('/api/v1/manager', createManagerRouter(accountStorage, userRepository));
app.use(notFoundHandler);
app.use(apiErrorHandler);
app.listen(port, () => {
    console.info(`LibConnect API listening on port ${port}`);
});
