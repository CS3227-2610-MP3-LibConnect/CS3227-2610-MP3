import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireActiveActor, requireLibrarian } from '../http/auth.js';
import { ApiError, parseRequest } from '../http/errors.js';
const requiredText = z.string().trim().min(1).max(500);
const isbnSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[0-9Xx-]+$/, 'ISBN may contain digits, X, and hyphens only.');
const bookFields = {
  title: requiredText,
  author: z.union([requiredText, z.array(requiredText).min(1).max(20)]),
  publicationYear: z.number().int().min(0).max(9999),
  publisher: requiredText,
  category: requiredText,
  synopsis: z.string().max(10_000),
};
const createBookSchema = z.object({ isbn: isbnSchema, ...bookFields }).strict();
const updateBookSchema = z
  .object(bookFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one editable field is required.');
const createCopySchema = z.object({ shelfLocation: requiredText }).strict();
const updateCopySchema = z.object({ shelfLocation: requiredText }).strict();
const paginationFields = {
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(1024).optional(),
};
const publicationYearRangeBoundSchema = z
  .string()
  .regex(/^\d+$/, 'Publication year bounds must contain digits only.')
  .transform(Number)
  .pipe(z.number().int().min(0).max(9999));
const publicationYearSchema = z
  .string()
  .regex(/^\d+$/, 'Publication year must contain digits only.')
  .transform(Number)
  .pipe(z.number().int().min(0).max(9999));
const bookSearchSchema = z
  .object({
    ...paginationFields,
    title: z.string().trim().min(1).max(200).optional(),
    author: z.string().trim().min(1).max(200).optional(),
    publisher: z.string().trim().min(1).max(200).optional(),
    category: z.string().trim().min(1).max(200).optional(),
    isbn: isbnSchema.optional(),
    publicationYear: publicationYearSchema.optional(),
    publicationYearFrom: publicationYearRangeBoundSchema.optional(),
    publicationYearTo: publicationYearRangeBoundSchema.optional(),
  })
  .strict()
  .refine((filters) => {
    const hasFrom = filters.publicationYearFrom !== undefined;
    const hasTo = filters.publicationYearTo !== undefined;
    return (
      hasFrom === hasTo &&
      !(filters.publicationYear !== undefined && hasFrom) &&
      !(hasFrom && filters.publicationYearFrom > filters.publicationYearTo)
    );
  }, 'Provide both publication-year bounds in ascending order, and do not combine a range with an exact year.');
const copySearchSchema = z
  .object({
    ...paginationFields,
    shelfLocation: z.string().trim().min(1).max(200).optional(),
    isbn: isbnSchema.optional(),
    copyId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .refine((value) => !value.includes('/'))
      .optional(),
    status: z
      .enum(['AVAILABLE', 'IN_TRANSIT', 'ON_LOAN', 'DAMAGED', 'LOST', 'RESERVED'])
      .optional(),
  })
  .strict();
const cursorSchema = z
  .object({
    kind: z.enum(['book', 'copy']),
    filterKey: z
      .string()
      .length(64)
      .regex(/^[0-9a-f]{64}$/),
    lastId: z.string().min(1).max(128),
  })
  .strict();
const copyIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine((value) => !value.includes('/'), 'Copy ID cannot contain a slash.');
const copyStatuses = ['AVAILABLE', 'IN_TRANSIT', 'ON_LOAN', 'DAMAGED', 'LOST', 'RESERVED'];
function parseCursor(encoded, secret, expectedKind) {
  if (!encoded) return undefined;
  try {
    const [payload, signature] = encoded.split('.');
    if (!payload || !signature) throw new Error('Invalid cursor shape.');
    const expectedSignature = createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('base64url');
    const actualBytes = Buffer.from(signature, 'base64url');
    const expectedBytes = Buffer.from(expectedSignature, 'base64url');
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes))
      throw new Error('Invalid cursor signature.');
    const value = cursorSchema.parse(
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    );
    if (value.kind !== expectedKind) throw new Error('Cursor endpoint kind does not match.');
    return value;
  } catch {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'The pagination cursor is invalid for this search.',
      { cursor: 'Use a cursor returned for the same search query.' },
    );
  }
}
function encodeCursor(cursor, secret) {
  if (!cursor) return null;
  const payload = Buffer.from(JSON.stringify(cursor)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
  return `${payload}.${signature}`;
}
function toJson(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJson(item)]));
  }
  return value;
}
export function createCatalogRouter(repository, users, cursorSecret) {
  if (!cursorSecret || cursorSecret.length < 32)
    throw new Error('A cursor signing secret of at least 32 characters is required.');
  const router = Router();
  const activeActor = requireActiveActor(users);
  const authenticatedLibrarian = [activeActor, requireLibrarian];
  router.get(
    '/librarian/inventory/summary',
    ...authenticatedLibrarian,
    async (request, response) => {
      const summary = await repository.inventorySummary(request.actor);
      response.json(toJson(summary));
    },
  );
  router.get('/books', activeActor, async (request, response) => {
    const query = parseRequest(bookSearchSchema, request.query);
    const { limit, cursor: encodedCursor, ...filters } = query;
    const page = await repository.searchBooks(
      filters,
      limit,
      parseCursor(encodedCursor, cursorSecret, 'book'),
    );
    response.json(
      toJson({
        items: page.items,
        page: { limit, nextCursor: encodeCursor(page.nextCursor, cursorSecret) },
      }),
    );
  });
  router.get('/books/:isbn/copies', activeActor, async (request, response) => {
    const isbn = parseRequest(isbnSchema, request.params.isbn);
    const { status } = parseRequest(
      z.object({ status: z.enum(copyStatuses).optional() }).strict(),
      request.query,
    );
    const book = await repository.getBook(isbn);
    const copies = await repository.copiesForBook(book.isbn, status);
    response.json(toJson({ isbn: book.isbn, items: copies }));
  });
  router.get('/books/:isbn', activeActor, async (request, response) => {
    const isbn = parseRequest(isbnSchema, request.params.isbn);
    const book = await repository.getBook(isbn);
    const copies = await repository.copiesForBook(book.isbn);
    const availableCount = copies.filter((copy) => copy.status === 'AVAILABLE').length;
    const byStatus = Object.fromEntries(
      copyStatuses.map((status) => [
        status,
        copies.filter((copy) => copy.status === status).length,
      ]),
    );
    response.json(
      toJson({
        book,
        copies,
        availability: { totalCopies: copies.length, availableCount, byStatus },
      }),
    );
  });
  router.post('/books', ...authenticatedLibrarian, async (request, response) => {
    const input = parseRequest(createBookSchema, request.body);
    const book = await repository.createBook(input, request.actor);
    response.status(201).json(toJson(book));
  });
  router.patch('/books/:isbn', ...authenticatedLibrarian, async (request, response) => {
    const isbn = parseRequest(isbnSchema, request.params.isbn);
    const rawPatch = parseRequest(updateBookSchema, request.body);
    const patch = Object.fromEntries(
      Object.entries(rawPatch).filter(([, value]) => value !== undefined),
    );
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
    const copy = await repository.createCopy(
      { copyId: randomUUID(), isbn, shelfLocation },
      request.actor,
    );
    response.status(201).json(toJson(copy));
  });
  router.get('/copies', activeActor, async (request, response) => {
    const query = parseRequest(copySearchSchema, request.query);
    const { limit, cursor: encodedCursor, ...filters } = query;
    const page = await repository.searchCopies(
      filters,
      limit,
      parseCursor(encodedCursor, cursorSecret, 'copy'),
    );
    response.json(
      toJson({
        items: page.items,
        page: { limit, nextCursor: encodeCursor(page.nextCursor, cursorSecret) },
      }),
    );
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
