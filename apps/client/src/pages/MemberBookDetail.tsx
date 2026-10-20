import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiClientError } from '../api/errors.js';
import { catalogApi, type CopyStatus } from '../api/catalog.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { useAuth } from '../auth/AuthContext.js';

interface BookDetails {
  isbn: string;
  title: string;
  author: string | string[];
  publicationYear: number;
  publisher: string;
  category: string;
  synopsis: string;
}

interface BookCopy {
  copyId: string;
  shelfLocation: string | null;
  status: CopyStatus;
}

interface BookDetailResponse {
  book: BookDetails;
  copies: BookCopy[];
  availability: {
    totalCopies: number;
    availableCount: number;
    byStatus: Partial<Record<CopyStatus, number>>;
  };
}

export function MemberBookDetail() {
  const { user, logout } = useAuth();
  const { isbn = '' } = useParams<{ isbn: string }>();
  const [result, setResult] = useState<BookDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const requestSequence = useRef(0);

  const loadBook = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setResult(null);
    setNotFound(false);
    setError(false);
    try {
      const response = await catalogApi.getBook(isbn) as BookDetailResponse;
      if (requestSequence.current === sequence) setResult(response);
    } catch (cause) {
      if (requestSequence.current === sequence) {
        if (cause instanceof ApiClientError && cause.status === 404) setNotFound(true);
        else setError(true);
      }
    } finally {
      if (requestSequence.current === sequence) setLoading(false);
    }
  }, [isbn]);

  useEffect(() => {
    void loadBook();
    return () => { requestSequence.current += 1; };
  }, [loadBook]);

  if (!user || user.accountType !== 'MEMBER') return null;

  return (
    <main className="dashboard-page member-dashboard-page">
      <MemberNavigation onLogout={logout} />
      <section className="member-detail-content" aria-labelledby="book-detail-heading" aria-busy={loading}>
        <Link className="member-detail-back" to="/member/dashboard">Back to catalog</Link>
        {loading && <p role="status">Loading book details…</p>}
        {!loading && notFound && (
          <div className="member-detail-message">
            <h1 id="book-detail-heading">Book not found</h1>
            <p>We could not find a book with ISBN {isbn}.</p>
          </div>
        )}
        {!loading && error && (
          <div className="member-detail-message" role="alert">
            <h1 id="book-detail-heading">Could not load book details</h1>
            <p>Please check your connection and try again.</p>
            <button className="primary-button" type="button" onClick={() => void loadBook()}>Try again</button>
          </div>
        )}
        {!loading && result && (
          <article className="member-book-detail">
            <p className="eyebrow">BOOK DETAILS</p>
            <h1 id="book-detail-heading">{result.book.title}</h1>
            <dl className="member-book-metadata">
              <div><dt>ISBN</dt><dd>{result.book.isbn}</dd></div>
              <div><dt>Author</dt><dd>{Array.isArray(result.book.author) ? result.book.author.join(', ') : result.book.author}</dd></div>
              <div><dt>Publication year</dt><dd>{result.book.publicationYear}</dd></div>
              <div><dt>Publisher</dt><dd>{result.book.publisher}</dd></div>
              <div><dt>Category</dt><dd>{result.book.category}</dd></div>
            </dl>
            <section aria-labelledby="book-synopsis-heading">
              <h2 id="book-synopsis-heading">Synopsis</h2>
              <p>{result.book.synopsis || 'No synopsis is available.'}</p>
            </section>
            <section aria-labelledby="copy-availability-heading">
              <h2 id="copy-availability-heading">Copy availability</h2>
              <p>{result.availability.availableCount} of {result.availability.totalCopies} copies available</p>
              {result.copies.length === 0 ? <p>No physical copies are listed for this title.</p> : (
                <ul className="member-copy-list">
                  {result.copies.map((copy) => (
                    <li key={copy.copyId}>
                      <span><strong>Shelf location:</strong> {copy.shelfLocation ?? 'Not on shelf'}</span>
                      <span><strong>Status:</strong> {copy.status.replaceAll('_', ' ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </article>
        )}
      </section>
    </main>
  );
}
