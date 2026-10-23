import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/base.js';
import {
  catalogApi,
  type BookCopyRecord,
  type BookDetail,
  type BookRecord,
  type CopyStatus,
  type InventorySummary,
} from '../api/catalog.js';
import { useAuth } from '../auth/AuthContext.js';

const statuses: CopyStatus[] = [
  'AVAILABLE',
  'IN_TRANSIT',
  'ON_LOAN',
  'DAMAGED',
  'LOST',
  'RESERVED',
];

type BookFormValues = Omit<BookRecord, 'createdAt' | 'updatedAt'>;

const emptyBook: BookFormValues = {
  isbn: '',
  title: '',
  author: '',
  publicationYear: new Date().getFullYear(),
  publisher: '',
  category: '',
  synopsis: '',
};

function authorText(author: string | string[]): string {
  return Array.isArray(author) ? author.join(', ') : author;
}

export function bookFormValues(book: BookRecord): BookFormValues {
  return {
    isbn: book.isbn,
    title: book.title,
    author: authorText(book.author),
    publicationYear: book.publicationYear,
    publisher: book.publisher,
    category: book.category,
    synopsis: book.synopsis ?? '',
  };
}

function displayError(caught: unknown, fallback: string): string {
  return caught instanceof ApiClientError ? caught.message : fallback;
}

export function validateBookForm(values: BookFormValues, editing: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!editing && !values.isbn.trim()) errors.isbn = 'ISBN is required.';
  if (!values.title.trim()) errors.title = 'Title is required.';
  if (!values.author.trim()) errors.author = 'Author is required.';
  if (
    !Number.isInteger(values.publicationYear) ||
    values.publicationYear < 0 ||
    values.publicationYear > 9999
  )
    errors.publicationYear = 'Enter a whole year from 0 to 9999.';
  if (!values.publisher.trim()) errors.publisher = 'Publisher is required.';
  if (!values.category.trim()) errors.category = 'Category is required.';
  if (values.synopsis.length > 10000)
    errors.synopsis = 'Synopsis must be 10,000 characters or fewer.';
  return errors;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span className="field-error" id={id}>
      {message}
    </span>
  ) : null;
}

function BookForm({
  values,
  editing,
  pending,
  onChange,
  onSubmit,
  onCancel,
  error,
}: {
  values: BookFormValues;
  editing: boolean;
  pending: boolean;
  onChange: (field: keyof BookFormValues, value: string | number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  error?: string | null;
}) {
  const errors = validateBookForm(values, editing);
  const describedBy = (field: string) => (errors[field] ? `${field}-error` : undefined);
  return (
    <form className="catalog-form" onSubmit={onSubmit} aria-labelledby="book-form-title">
      <h2 id="book-form-title">{editing ? 'Edit book metadata' : 'Add a book'}</h2>
      {!editing && (
        <label className="field">
          ISBN
          <input
            value={values.isbn}
            onChange={(event) => onChange('isbn', event.target.value)}
            required
            maxLength={32}
            aria-invalid={Boolean(errors.isbn)}
            aria-describedby={describedBy('isbn')}
          />{' '}
          <FieldError id="isbn-error" message={errors.isbn} />
        </label>
      )}
      <label className="field">
        Title
        <input
          value={values.title}
          onChange={(event) => onChange('title', event.target.value)}
          required
          maxLength={500}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={describedBy('title')}
        />{' '}
        <FieldError id="title-error" message={errors.title} />
      </label>
      <label className="field">
        Author
        <input
          value={values.author}
          onChange={(event) => onChange('author', event.target.value)}
          required
          maxLength={500}
          aria-invalid={Boolean(errors.author)}
          aria-describedby={describedBy('author')}
        />{' '}
        <FieldError id="author-error" message={errors.author} />
      </label>
      <label className="field">
        Publication year
        <input
          type="number"
          min="0"
          max="9999"
          step="1"
          value={values.publicationYear}
          onChange={(event) => onChange('publicationYear', Number(event.target.value))}
          required
          aria-invalid={Boolean(errors.publicationYear)}
          aria-describedby={describedBy('publicationYear')}
        />{' '}
        <FieldError id="publicationYear-error" message={errors.publicationYear} />
      </label>
      <label className="field">
        Publisher
        <input
          value={values.publisher}
          onChange={(event) => onChange('publisher', event.target.value)}
          required
          maxLength={500}
          aria-invalid={Boolean(errors.publisher)}
          aria-describedby={describedBy('publisher')}
        />{' '}
        <FieldError id="publisher-error" message={errors.publisher} />
      </label>
      <label className="field">
        Category
        <input
          value={values.category}
          onChange={(event) => onChange('category', event.target.value)}
          required
          maxLength={500}
          aria-invalid={Boolean(errors.category)}
          aria-describedby={describedBy('category')}
        />{' '}
        <FieldError id="category-error" message={errors.category} />
      </label>
      <label className="field">
        Synopsis
        <textarea
          value={values.synopsis}
          onChange={(event) => onChange('synopsis', event.target.value)}
          maxLength={10000}
          aria-invalid={Boolean(errors.synopsis)}
          aria-describedby={describedBy('synopsis')}
        />{' '}
        <FieldError id="synopsis-error" message={errors.synopsis} />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="catalog-form-actions">
        <button
          className="primary-button compact-button"
          type="submit"
          disabled={pending || Object.keys(errors).length > 0}
        >
          {pending ? 'Saving…' : editing ? 'Save book' : 'Create book'}
        </button>
        <button
          className="text-button compact-button"
          type="button"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function CopyRow({
  copy,
  pending,
  onEdit,
  onDelete,
}: {
  copy: BookCopyRecord;
  pending: boolean;
  onEdit: (copy: BookCopyRecord) => void;
  onDelete: (copy: BookCopyRecord) => void;
}) {
  return (
    <tr>
      <th scope="row">{copy.copyId}</th>
      <td>{copy.shelfLocation}</td>
      <td>
        <span className={`status-pill status-${copy.status.toLowerCase()}`}>
          {copy.status.replace('_', ' ')}
        </span>
      </td>
      <td className="account-actions">
        <button
          className="text-button compact-button"
          type="button"
          disabled={pending}
          onClick={() => onEdit(copy)}
        >
          Edit shelf
        </button>
        <button
          className="text-button compact-button"
          type="button"
          disabled={pending}
          onClick={() => onDelete(copy)}
        >
          Delete copy
        </button>
      </td>
    </tr>
  );
}

export function LibrarianCatalogInventoryPage() {
  const { logout } = useAuth();
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedIsbn, setSelectedIsbn] = useState<string | null>(null);
  const [search, setSearch] = useState({
    title: '',
    author: '',
    publisher: '',
    category: '',
    isbn: '',
    publicationYear: '',
  });
  const [bookForm, setBookForm] = useState<BookFormValues>(emptyBook);
  const [editing, setEditing] = useState(false);
  const [showBookForm, setShowBookForm] = useState(false);
  const [copyShelf, setCopyShelf] = useState('');
  const [editingCopy, setEditingCopy] = useState<BookCopyRecord | null>(null);
  const [showCopyForm, setShowCopyForm] = useState(false);
  const [pending, setPending] = useState(false);
  const requestSequence = useRef(0);
  const bookFormShell = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showBookForm)
      bookFormShell.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [showBookForm, editing]);

  const loadCatalog = useCallback(
    async (isbn = selectedIsbn) => {
      const requestId = ++requestSequence.current;
      setLoading(true);
      setError(null);
      try {
        const filters = {
          ...search,
          publicationYear: search.publicationYear ? Number(search.publicationYear) : undefined,
          limit: 20,
        };
        const [booksPage, inventorySummary] = await Promise.all([
          catalogApi.listBooks<BookRecord>(filters),
          catalogApi.inventorySummary(),
        ]);
        if (requestId !== requestSequence.current) return;
        setBooks(booksPage.items);
        setSummary(inventorySummary);
        const nextIsbn =
          isbn && booksPage.items.some((book) => book.isbn === isbn)
            ? isbn
            : (booksPage.items[0]?.isbn ?? null);
        setSelectedIsbn(nextIsbn);
        if (nextIsbn) {
          setDetailLoading(true);
          const nextDetail = await catalogApi.getBook(nextIsbn);
          if (requestId === requestSequence.current) setDetail(nextDetail);
        } else {
          setDetail(null);
        }
      } catch (caught) {
        if (requestId === requestSequence.current)
          setError(displayError(caught, 'Catalog data could not be loaded.'));
      } finally {
        if (requestId === requestSequence.current) {
          setLoading(false);
          setDetailLoading(false);
        }
      }
    },
    [search, selectedIsbn],
  );

  useEffect(() => {
    void loadCatalog();
  }, []);

  function selectBook(isbn: string) {
    const requestId = ++requestSequence.current;
    setSelectedIsbn(isbn);
    setDetailLoading(true);
    setError(null);
    void catalogApi
      .getBook(isbn)
      .then((nextDetail) => {
        if (requestId === requestSequence.current) setDetail(nextDetail);
      })
      .catch((caught) => {
        if (requestId === requestSequence.current)
          setError(displayError(caught, 'Book details could not be loaded.'));
      })
      .finally(() => {
        if (requestId === requestSequence.current) setDetailLoading(false);
      });
  }

  function openCreate() {
    setBookForm({ ...emptyBook });
    setEditing(false);
    setShowBookForm(true);
    setError(null);
    setSuccess(null);
  }

  function openEdit(bookToEdit: BookRecord) {
    setBookForm(bookFormValues(bookToEdit));
    setEditing(true);
    setShowBookForm(true);
    setError(null);
    setSuccess(null);
  }

  async function submitBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateBookForm(bookForm, editing);
    if (Object.keys(errors).length > 0) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        ...bookForm,
        isbn: bookForm.isbn.trim(),
        title: bookForm.title.trim(),
        author: bookForm.author.trim(),
        publisher: bookForm.publisher.trim(),
        category: bookForm.category.trim(),
      };
      const saved =
        editing && selectedIsbn
          ? await catalogApi.updateBook(
              selectedIsbn,
              (({ isbn: _isbn, ...patch }) => patch)(payload),
            )
          : await catalogApi.createBook(payload);
      setShowBookForm(false);
      setSelectedIsbn(saved.isbn);
      setSuccess(editing ? 'Book metadata saved.' : 'Book created.');
      await loadCatalog(saved.isbn);
    } catch (caught) {
      setError(displayError(caught, 'The book could not be saved.'));
    } finally {
      setPending(false);
    }
  }

  async function deleteBook() {
    if (!detail || !window.confirm(`Delete book “${detail.book.title}” (${detail.book.isbn})?`))
      return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      await catalogApi.deleteBook(detail.book.isbn);
      setSelectedIsbn(null);
      setDetail(null);
      setSuccess('Book deleted.');
      await loadCatalog(null);
    } catch (caught) {
      setError(displayError(caught, 'The book could not be deleted.'));
    } finally {
      setPending(false);
    }
  }

  function startCopyEdit(copy: BookCopyRecord) {
    setEditingCopy(copy);
    setShowCopyForm(true);
    setCopyShelf(copy.shelfLocation);
    setError(null);
    setSuccess(null);
  }

  async function saveCopy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !copyShelf.trim()) {
      setError('Shelf location is required.');
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingCopy) await catalogApi.updateCopy(editingCopy.copyId, copyShelf.trim());
      else await catalogApi.createCopy(detail.book.isbn, copyShelf.trim());
      setEditingCopy(null);
      setShowCopyForm(false);
      setCopyShelf('');
      setSuccess(editingCopy ? 'Copy shelf location saved.' : 'Copy added.');
      await loadCatalog(detail.book.isbn);
    } catch (caught) {
      setError(displayError(caught, 'The copy could not be saved.'));
    } finally {
      setPending(false);
    }
  }

  async function deleteCopy(copy: BookCopyRecord) {
    if (!window.confirm(`Delete copy ${copy.copyId} from ${copy.shelfLocation}?`)) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      await catalogApi.deleteCopy(copy.copyId);
      setSuccess('Copy deleted.');
      await loadCatalog(detail?.book.isbn);
    } catch (caught) {
      setError(displayError(caught, 'The copy could not be deleted.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Link className="brand-lockup" to="/librarian/dashboard" aria-label="LibConnect home">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <span>LibConnect</span>
        </Link>
        <nav className="dashboard-actions" aria-label="Catalog navigation">
          <Link className="text-button" to="/librarian/dashboard">
            Dashboard
          </Link>
          <button className="text-button" onClick={() => void logout()}>
            Sign out
          </button>
        </nav>
      </header>
      <section className="catalog-panel" aria-labelledby="catalog-title">
        <div className="catalog-heading">
          <div>
            <p className="eyebrow">LIBRARIAN TOOLS</p>
            <h1 id="catalog-title">Catalog &amp; inventory</h1>
            <p className="muted">
              Maintain book metadata and physical copies while circulation controls status.
            </p>
          </div>
          <button className="primary-button compact-button" type="button" onClick={openCreate}>
            Add a book
          </button>
        </div>
        {summary && (
          <div className="summary-grid" aria-label="Inventory summary">
            {[
              ['Titles', summary.totalTitles],
              ['Copies', summary.totalCopies],
              ['Available', summary.availableCopies],
            ].map(([label, value]) => (
              <div className="summary-card" key={String(label)}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
            <div className="summary-card">
              <span>In use</span>
              <strong>{summary.totalCopies - summary.availableCopies}</strong>
            </div>
          </div>
        )}
        {success && (
          <p className="form-success" role="status">
            {success}
          </p>
        )}
        {error && !showBookForm && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <form
          className="catalog-search"
          onSubmit={(event) => {
            event.preventDefault();
            void loadCatalog(selectedIsbn);
          }}
          aria-label="Search catalog"
        >
          <label className="field">
            Title
            <input
              value={search.title}
              onChange={(event) => setSearch({ ...search, title: event.target.value })}
              maxLength={200}
            />
          </label>
          <label className="field">
            Author
            <input
              value={search.author}
              onChange={(event) => setSearch({ ...search, author: event.target.value })}
              maxLength={200}
            />
          </label>
          <label className="field">
            Publisher
            <input
              value={search.publisher}
              onChange={(event) => setSearch({ ...search, publisher: event.target.value })}
              maxLength={200}
            />
          </label>
          <label className="field">
            Category
            <input
              value={search.category}
              onChange={(event) => setSearch({ ...search, category: event.target.value })}
              maxLength={200}
            />
          </label>
          <label className="field">
            ISBN
            <input
              value={search.isbn}
              onChange={(event) => setSearch({ ...search, isbn: event.target.value })}
              maxLength={32}
            />
          </label>
          <label className="field">
            Year
            <input
              type="number"
              min="0"
              max="9999"
              value={search.publicationYear}
              onChange={(event) => setSearch({ ...search, publicationYear: event.target.value })}
            />
          </label>
          <button className="primary-button compact-button" type="submit" disabled={loading}>
            Search
          </button>
        </form>
        <div className="catalog-layout">
          <section aria-labelledby="book-list-title">
            <div className="section-heading">
              <h2 id="book-list-title">Books</h2>
              <button
                className="text-button compact-button"
                type="button"
                onClick={() => void loadCatalog(selectedIsbn)}
                disabled={loading}
              >
                Refresh
              </button>
            </div>
            {loading ? (
              <p className="muted" aria-live="polite">
                Loading catalog…
              </p>
            ) : books.length === 0 ? (
              <p className="empty-state">No books match this search.</p>
            ) : (
              <div className="book-list">
                {books.map((bookItem) => (
                  <button
                    className={`book-list-item${bookItem.isbn === selectedIsbn ? ' selected' : ''}`}
                    type="button"
                    key={bookItem.isbn}
                    onClick={() => selectBook(bookItem.isbn)}
                  >
                    <strong>{bookItem.title}</strong>
                    <span>{authorText(bookItem.author)}</span>
                    <small>
                      {bookItem.isbn} · {bookItem.publicationYear}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="catalog-detail" aria-labelledby="book-detail-title">
            {detailLoading ? (
              <p className="muted" aria-live="polite">
                Loading book details…
              </p>
            ) : detail ? (
              <>
                <div className="section-heading">
                  <div>
                    <h2 id="book-detail-title">{detail.book.title}</h2>
                    <p className="muted">
                      {detail.book.isbn} · {authorText(detail.book.author)}
                    </p>
                  </div>
                  <div className="account-actions">
                    <button
                      className="text-button compact-button"
                      type="button"
                      onClick={() => openEdit(detail.book)}
                      disabled={pending}
                    >
                      Edit book
                    </button>
                    <button
                      className="text-button compact-button"
                      type="button"
                      onClick={() => void deleteBook()}
                      disabled={pending}
                    >
                      Delete book
                    </button>
                  </div>
                </div>
                <dl className="book-metadata">
                  <div>
                    <dt>Publisher</dt>
                    <dd>{detail.book.publisher}</dd>
                  </div>
                  <div>
                    <dt>Category</dt>
                    <dd>{detail.book.category}</dd>
                  </div>
                  <div>
                    <dt>Year</dt>
                    <dd>{detail.book.publicationYear}</dd>
                  </div>
                  <div>
                    <dt>Synopsis</dt>
                    <dd>{detail.book.synopsis || 'No synopsis provided.'}</dd>
                  </div>
                </dl>
                <div className="availability-box">
                  <strong>Availability</strong>
                  <span>
                    {detail.availability.availableCount} of {detail.availability.totalCopies}{' '}
                    available
                  </span>
                  <div className="status-counts">
                    {statuses.map((status) => (
                      <span key={status}>
                        {status.replace('_', ' ')}: {detail.availability.byStatus[status] ?? 0}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="section-heading">
                  <h3>Physical copies</h3>
                  <button
                    className="text-button compact-button"
                    type="button"
                    onClick={() => {
                      setEditingCopy(null);
                      setShowCopyForm(true);
                      setCopyShelf('');
                    }}
                    disabled={pending}
                  >
                    Add copy
                  </button>
                </div>
                {showCopyForm ? (
                  <form className="copy-form" onSubmit={(event) => void saveCopy(event)}>
                    <label className="field">
                      Shelf location
                      <input
                        value={copyShelf}
                        onChange={(event) => setCopyShelf(event.target.value)}
                        required
                        maxLength={500}
                        autoFocus
                      />
                    </label>
                    <div className="catalog-form-actions">
                      <button
                        className="primary-button compact-button"
                        type="submit"
                        disabled={pending}
                      >
                        {pending ? 'Saving…' : editingCopy ? 'Save shelf' : 'Add copy'}
                      </button>
                      <button
                        className="text-button compact-button"
                        type="button"
                        onClick={() => {
                          setEditingCopy(null);
                          setShowCopyForm(false);
                          setCopyShelf('');
                        }}
                        disabled={pending}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
                <div className="account-table-wrap">
                  <table className="account-table">
                    <caption className="sr-only">
                      Current physical copies for {detail.book.title}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Copy</th>
                        <th scope="col">Shelf</th>
                        <th scope="col">Status</th>
                        <th scope="col">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.copies.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="empty-state">
                            No physical copies yet.
                          </td>
                        </tr>
                      ) : (
                        detail.copies.map((copy) => (
                          <CopyRow
                            key={copy.copyId}
                            copy={copy}
                            pending={pending}
                            onEdit={startCopyEdit}
                            onDelete={(target) => void deleteCopy(target)}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="empty-state">Select a book to inspect its copies and availability.</p>
            )}
          </section>
        </div>
      </section>
      {showBookForm && (
        <div className="catalog-form-shell" ref={bookFormShell}>
          <BookForm
            values={bookForm}
            editing={editing}
            pending={pending}
            error={error}
            onChange={(field, value) =>
              setBookForm({ ...bookForm, [field]: value } as BookFormValues)
            }
            onSubmit={(event) => void submitBook(event)}
            onCancel={() => setShowBookForm(false)}
          />
        </div>
      )}
    </main>
  );
}
