import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { BookRecord } from '../../../../packages/shared/src/domain/records.js';
import { LibraryRepository, UserRepository } from '../storage/repositories.js';
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
const searchSchema = z.object({
  q: z.string().trim().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(1024).optional(),
}).strict();
const cursorSchema = z.object({ q: z.string(), title: z.string(), isbn: z.string() }).strict();
const copyIdSchema = z.string().trim().min(1).max(128).refine((value) => !value.includes('/'), 'Copy ID cannot contain a slash.');

type Cursor = z.infer<typeof cursorSchema>;

function parseCursor(encoded: string | undefined, query: string): Cursor | undefined {
  if (!encoded) return undefined;
  try {
    const value = cursorSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
    if (value.q !== query) throw new Error('Cursor does not match this search.');
    return value;
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'The pagination cursor is invalid for this search.', { cursor: 'Use a cursor returned for the same search query.' });
  }
}

function encodeCursor(cursor: Cursor | null): string | null {
  return cursor ? Buffer.from(JSON.stringify(cursor)).toString('base64url') : null;
}

function toJson(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJson(item)]));
  }
  return value;
}

export function createCatalogRouter(repository: LibraryRepository, users: UserRepository): Router {
  const router = Router();
  const authenticatedLibrarian = [requireActiveActor(users), requireLibrarian];

  router.get('/books', async (request, response) => {
    const query = parseRequest(searchSchema, request.query);
    const cursor = parseCursor(query.cursor, query.q);
    const page = await repository.searchBooksByTitlePrefix(query.q, query.limit, cursor);
    const next = page.nextCursor ? { ...page.nextCursor, q: query.q } : null;
    response.json(toJson({ items: page.items, page: { limit: query.limit, nextCursor: encodeCursor(next) } }));
  });

  router.get('/books/:isbn/copies', async (request, response) => {
    const isbn = parseRequest(isbnSchema, request.params.isbn);
    const book = await repository.getBook(isbn);
    const copies = await repository.copiesForBook(book.isbn);
    response.json(toJson({ isbn: book.isbn, items: copies }));
  });

  router.get('/books/:isbn', async (request, response) => {
    const isbn = parseRequest(isbnSchema, request.params.isbn);
    const book = await repository.getBook(isbn);
    const copies = await repository.copiesForBook(book.isbn);
    const availableCount = copies.filter((copy) => copy.status === 'AVAILABLE').length;
    const byStatus = Object.fromEntries(copies.reduce((counts, copy) => counts.set(copy.status, (counts.get(copy.status) ?? 0) + 1), new Map<string, number>()));
    response.json(toJson({ book, copies, availability: { totalCopies: copies.length, availableCount, byStatus } }));
  });

  router.post('/books', ...authenticatedLibrarian, async (request, response) => {
    const input = parseRequest(createBookSchema, request.body);
    const book = await repository.createBook(input, request.actor!);
    response.status(201).json(toJson(book));
  });

  router.patch('/books/:isbn', ...authenticatedLibrarian, async (request, response) => {
    const isbn = parseRequest(isbnSchema, request.params.isbn);
    const rawPatch = parseRequest(updateBookSchema, request.body);
    const patch = Object.fromEntries(Object.entries(rawPatch).filter(([, value]) => value !== undefined)) as Partial<Pick<BookRecord, 'title' | 'author' | 'publicationYear' | 'publisher' | 'category' | 'synopsis'>>;
    const book = await repository.updateBook(isbn, patch, request.actor!);
    response.json(toJson(book));
  });

  router.delete('/books/:isbn', ...authenticatedLibrarian, async (request, response) => {
    const isbn = parseRequest(isbnSchema, request.params.isbn);
    await repository.deleteBook(isbn, request.actor!);
    response.status(204).end();
  });

  router.post('/books/:isbn/copies', ...authenticatedLibrarian, async (request, response) => {
    const isbn = parseRequest(isbnSchema, request.params.isbn);
    const { shelfLocation } = parseRequest(createCopySchema, request.body);
    const copy = await repository.createCopy({ copyId: randomUUID(), isbn, shelfLocation }, request.actor!);
    response.status(201).json(toJson(copy));
  });

  router.get('/copies/:copyId', async (request, response) => {
    const copyId = parseRequest(copyIdSchema, request.params.copyId);
    const copy = await repository.getCopy(copyId);
    response.json(toJson(copy));
  });

  router.patch('/copies/:copyId', ...authenticatedLibrarian, async (request, response) => {
    const copyId = parseRequest(copyIdSchema, request.params.copyId);
    const { shelfLocation } = parseRequest(updateCopySchema, request.body);
    const copy = await repository.updateCopy(copyId, shelfLocation, request.actor!);
    response.json(toJson(copy));
  });

  router.delete('/copies/:copyId', ...authenticatedLibrarian, async (request, response) => {
    const copyId = parseRequest(copyIdSchema, request.params.copyId);
    await repository.deleteCopy(copyId, request.actor!);
    response.status(204).end();
  });

  return router;
}
