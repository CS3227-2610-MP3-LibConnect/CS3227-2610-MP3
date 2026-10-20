import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireActiveActor, requireLibrarian } from '../http/auth.js';
import { ApiError, parseRequest } from '../http/errors.js';
const requiredText = z.string().trim().min(1).max(500);
const isbnSchema = z.string().trim().min(1).max(32).regex(/^[0-9Xx-]+$/, 'ISBN may contain digits, X, and hyphens only.');
const bookFields = {
    title: requiredText,
    author: z.union([requiredText, z.array(requiredText).min(1).max(20)]),
    publicationYear: z.number().int().min(0),
    publisher: requiredText,
    category: requiredText,
    synopsis: z.string().max(10_000),
};
const createBookSchema = z.object({ isbn: isbnSchema, ...bookFields }).strict();
const updateBookSchema = z.object(bookFields).partial().strict().refine((value) => Object.keys(value).length > 0, 'At least one editable field is required.');
const createCopySchema = z.object({ shelfLocation: requiredText }).strict();
const updateCopySchema = z.object({ shelfLocation: requiredText }).strict();
const paginationFields = {
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(1024).optional(),
};
const publicationYearRangeBoundSchema = z.string().regex(/^\d+$/, 'Publication year bounds must contain digits only.')
    .transform(Number).pipe(z.number().int().min(0).max(9999));
const publicationYearSchema = z.string().regex(/^\d+$/, 'Publication year must contain digits only.')
    .transform(Number).pipe(z.number().int().min(0).max(9999));
const bookSearchSchema = z.object({
    ...paginationFields,
    title: z.string().trim().min(1).max(200).optional(),
    author: z.string().trim().min(1).max(200).optional(),
    publisher: z.string().trim().min(1).max(200).optional(),
    category: z.string().trim().min(1).max(200).optional(),
    isbn: isbnSchema.optional(),
    publicationYear: publicationYearSchema.optional(),
    publicationYearFrom: publicationYearRangeBoundSchema.optional(),
    publicationYearTo: publicationYearRangeBoundSchema.optional(),
}).strict().refine((filters) => {
    const hasFrom = filters.publicationYearFrom !== undefined;
    const hasTo = filters.publicationYearTo !== undefined;
    return hasFrom === hasTo
        && !(filters.publicationYear !== undefined && hasFrom)
        && !(hasFrom && filters.publicationYearFrom > filters.publicationYearTo);
}, 'Provide both publication-year bounds in ascending order, and do not combine a range with an exact year.');
const copySearchSchema = z.object({
    ...paginationFields,
    shelfLocation: z.string().trim().min(1).max(200).optional(),
    isbn: isbnSchema.optional(),
    copyId: z.string().trim().min(1).max(128).refine((value) => !value.includes('/')).optional(),
    status: z.enum(['AVAILABLE', 'IN_TRANSIT', 'ON_LOAN', 'DAMAGED', 'LOST', 'RESERVED']).optional(),
}).strict();
const cursorSchema = z.object({ filterKey: z.string().max(512), lastId: z.string().min(1).max(128) }).strict();
const copyIdSchema = z.string().trim().min(1).max(128).refine((value) => !value.includes('/'), 'Copy ID cannot contain a slash.');
function parseCursor(encoded) {
    if (!encoded)
        return undefined;
    try {
        const value = cursorSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
        return value;
    }
    catch {
        throw new ApiError(400, 'VALIDATION_ERROR', 'The pagination cursor is invalid for this search.', { cursor: 'Use a cursor returned for the same search query.' });
    }
}
function encodeCursor(cursor) {
    return cursor ? Buffer.from(JSON.stringify(cursor)).toString('base64url') : null;
}
function toJson(value) {
    if (value instanceof Timestamp)
        return value.toDate().toISOString();
    if (Array.isArray(value))
        return value.map(toJson);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJson(item)]));
    }
    return value;
}
export function createCatalogRouter(repository, users) {
    const router = Router();
    const activeActor = requireActiveActor(users);
    const authenticatedLibrarian = [activeActor, requireLibrarian];
    router.get('/books', activeActor, async (request, response) => {
        const query = parseRequest(bookSearchSchema, request.query);
        const { limit, cursor: encodedCursor, ...filters } = query;
        const page = await repository.searchBooks(filters, limit, parseCursor(encodedCursor));
        response.json(toJson({ items: page.items, page: { limit, nextCursor: encodeCursor(page.nextCursor) } }));
    });
    router.get('/books/:isbn/copies', activeActor, async (request, response) => {
        const isbn = parseRequest(isbnSchema, request.params.isbn);
        const { status } = parseRequest(z.object({ status: z.enum(['AVAILABLE', 'IN_TRANSIT', 'ON_LOAN', 'DAMAGED', 'LOST', 'RESERVED']).optional() }).strict(), request.query);
        const book = await repository.getBook(isbn);
        const copies = await repository.copiesForBook(book.isbn, status);
        response.json(toJson({ isbn: book.isbn, items: copies }));
    });
    router.get('/books/:isbn', activeActor, async (request, response) => {
        const isbn = parseRequest(isbnSchema, request.params.isbn);
        const book = await repository.getBook(isbn);
        const copies = await repository.copiesForBook(book.isbn);
        const availableCount = copies.filter((copy) => copy.status === 'AVAILABLE').length;
        const byStatus = Object.fromEntries(copies.reduce((counts, copy) => counts.set(copy.status, (counts.get(copy.status) ?? 0) + 1), new Map()));
        response.json(toJson({ book, copies, availability: { totalCopies: copies.length, availableCount, byStatus } }));
    });
    router.post('/books', ...authenticatedLibrarian, async (request, response) => {
        const input = parseRequest(createBookSchema, request.body);
        const book = await repository.createBook(input, request.actor);
        response.status(201).json(toJson(book));
    });
    router.patch('/books/:isbn', ...authenticatedLibrarian, async (request, response) => {
        const isbn = parseRequest(isbnSchema, request.params.isbn);
        const rawPatch = parseRequest(updateBookSchema, request.body);
        const patch = Object.fromEntries(Object.entries(rawPatch).filter(([, value]) => value !== undefined));
        const book = await repository.updateBook(isbn, patch, request.actor);
        response.json(toJson(book));
    });
    router.delete('/books/:isbn', ...authenticatedLibrarian, async (request, response) => {
        const isbn = parseRequest(isbnSchema, request.params.isbn);
        await repository.deleteBook(isbn, request.actor);
        response.status(204).end();
    });
    router.post('/books/:isbn/copies', ...authenticatedLibrarian, async (request, response) => {
        const isbn = parseRequest(isbnSchema, request.params.isbn);
        const { shelfLocation } = parseRequest(createCopySchema, request.body);
        const copy = await repository.createCopy({ copyId: randomUUID(), isbn, shelfLocation }, request.actor);
        response.status(201).json(toJson(copy));
    });
    router.get('/copies', activeActor, async (request, response) => {
        const query = parseRequest(copySearchSchema, request.query);
        const { limit, cursor: encodedCursor, ...filters } = query;
        const page = await repository.searchCopies(filters, limit, parseCursor(encodedCursor));
        response.json(toJson({ items: page.items, page: { limit, nextCursor: encodeCursor(page.nextCursor) } }));
    });
    router.get('/copies/:copyId', activeActor, async (request, response) => {
        const copyId = parseRequest(copyIdSchema, request.params.copyId);
        const copy = await repository.getCopy(copyId);
        response.json(toJson(copy));
    });
    router.patch('/copies/:copyId', ...authenticatedLibrarian, async (request, response) => {
        const copyId = parseRequest(copyIdSchema, request.params.copyId);
        const { shelfLocation } = parseRequest(updateCopySchema, request.body);
        const copy = await repository.updateCopy(copyId, shelfLocation, request.actor);
        response.json(toJson(copy));
    });
    router.delete('/copies/:copyId', ...authenticatedLibrarian, async (request, response) => {
        const copyId = parseRequest(copyIdSchema, request.params.copyId);
        await repository.deleteCopy(copyId, request.actor);
        response.status(204).end();
    });
    return router;
}
