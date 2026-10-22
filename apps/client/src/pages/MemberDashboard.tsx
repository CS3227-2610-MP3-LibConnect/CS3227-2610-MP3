import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { catalogApi, type BookFilters, type Page } from '../api/catalog.js';
import { notificationsApi, type NotificationPage, type NotificationPreview, type NotificationRecord } from '../api/notifications.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { useAuth } from '../auth/AuthContext.js';

export interface MemberSearchValues {
  title?: string;
  author?: string;
  publisher?: string;
  category?: string;
  isbn?: string;
  publicationYear?: string;
  publicationYearFrom?: string;
  publicationYearTo?: string;
}

type CatalogBook = Record<'isbn' | 'title' | 'category' | 'synopsis', string>;

const emptySearchValues: MemberSearchValues = {
  title: '', author: '', publisher: '', category: '', isbn: '',
  publicationYear: '', publicationYearFrom: '', publicationYearTo: '',
};

function parseYear(value: string, label: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) throw new RangeError(`Enter a valid year for ${label}.`);
  const year = Number(trimmed);
  if (!Number.isSafeInteger(year) || year > 9999) throw new RangeError(`Enter a valid year for ${label}.`);
  return year;
}

export function buildMemberBookFilters(
  values: MemberSearchValues,
  options: { advancedSearchExpanded?: boolean } = {},
): BookFilters {
  const filters: BookFilters = {};
  const fields = options.advancedSearchExpanded === false
    ? ['title'] as const
    : ['title', 'author', 'publisher', 'category', 'isbn'] as const;
  for (const field of fields) {
    const value = values[field]?.trim();
    if (value) filters[field] = value;
  }

  if (options.advancedSearchExpanded === false) return filters;

  const exactYear = parseYear(values.publicationYear ?? '', 'publication year');
  const yearFrom = parseYear(values.publicationYearFrom ?? '', 'start year');
  const yearTo = parseYear(values.publicationYearTo ?? '', 'end year');
  const hasRangeBound = yearFrom !== undefined || yearTo !== undefined;
  if (exactYear !== undefined && hasRangeBound) {
    throw new RangeError('Choose either exact year or a range.');
  }
  if (hasRangeBound && (yearFrom === undefined || yearTo === undefined)) {
    throw new RangeError('A year range requires both a start year and an end year.');
  }
  if (yearFrom !== undefined && yearTo !== undefined) {
    if (yearFrom > yearTo) throw new RangeError('The start year cannot exceed the end year.');
    filters.publicationYearFrom = yearFrom;
    filters.publicationYearTo = yearTo;
  } else if (exactYear !== undefined) {
    filters.publicationYear = exactYear;
  }
  return filters;
}

export function MemberDashboard() {
  const { user, logout } = useAuth();
  const advancedSearchRef = useRef<HTMLDetailsElement>(null);
  const [values, setValues] = useState<MemberSearchValues>(emptySearchValues);
  const [submittedFilters, setSubmittedFilters] = useState<BookFilters>({});
  const [page, setPage] = useState<Page<CatalogBook> | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [rangeError, setRangeError] = useState('');
  const [notificationPreview, setNotificationPreview] = useState<NotificationPreview | null>(null);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [notificationError, setNotificationError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<NotificationRecord[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [detailNotification, setDetailNotification] = useState<NotificationRecord | null>(null);
  const [detailNotificationId, setDetailNotificationId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [readError, setReadError] = useState(false);
  const historyRequestInFlight = useRef(false);
  const readRequestsRef = useRef(new Set<string>());
  const detailRequestSequence = useRef(0);
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const historyDialogRef = useRef<HTMLElement>(null);
  const detailTriggerRef = useRef<HTMLElement>(null);
  const detailDialogRef = useRef<HTMLElement>(null);
  const focusRestoreRef = useRef<HTMLElement | null>(null);
  const requestSequence = useRef(0);

  const loadFirstPage = async (filters: BookFilters) => {
    const sequence = ++requestSequence.current;
    setPage(null);
    setSearchError('');
    setInitialLoading(true);
    setMoreLoading(false);
    setMoreError(false);
    try {
      const result = await catalogApi.listBooks(filters) as Page<CatalogBook>;
      if (requestSequence.current === sequence) setPage(result);
    } catch {
      if (requestSequence.current === sequence) setSearchError('We could not search the catalog. Please try again.');
    } finally {
      if (requestSequence.current === sequence) setInitialLoading(false);
    }
  };

  const loadNextPage = async () => {
    if (!page?.page.nextCursor || moreLoading) return;
    const sequence = requestSequence.current;
    setMoreLoading(true);
    setMoreError(false);
    try {
      const result = await catalogApi.listBooks({
        ...submittedFilters,
        cursor: page.page.nextCursor,
        limit: page.page.limit,
      }) as Page<CatalogBook>;
      if (requestSequence.current !== sequence) return;
      setPage((current) => {
        if (!current) return result;
        const seenIsbns = new Set(current.items.map((book) => book.isbn));
        const additions = result.items.filter((book) => {
          if (seenIsbns.has(book.isbn)) return false;
          seenIsbns.add(book.isbn);
          return true;
        });
        return {
          items: [...current.items, ...additions],
          page: result.page,
        };
      });
    } catch {
      if (requestSequence.current === sequence) setMoreError(true);
    } finally {
      if (requestSequence.current === sequence) setMoreLoading(false);
    }
  };

  useEffect(() => {
    if (user?.accountType === 'MEMBER') void loadFirstPage({});
  }, [user?.accountType]);

  const loadNotificationPreview = async () => {
    setNotificationLoading(true);
    setNotificationError(false);
    try {
      setNotificationPreview(await notificationsApi.getPreview());
    } catch {
      setNotificationError(true);
    } finally {
      setNotificationLoading(false);
    }
  };

  const loadHistoryPage = async (cursor?: string) => {
    if (historyRequestInFlight.current || (cursor === undefined && historyItems.length > 0)) return;
    historyRequestInFlight.current = true;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const result = await notificationsApi.list({ limit: 20, ...(cursor ? { cursor } : {}) }) as NotificationPage;
      setHistoryItems((current) => {
        const known = new Set(current.map((item) => item.notificationId));
        return cursor ? [...current, ...result.items.filter((item) => !known.has(item.notificationId))] : result.items;
      });
      setHistoryCursor(result.page.nextCursor);
    } catch {
      setHistoryError(true);
    } finally {
      historyRequestInFlight.current = false;
      setHistoryLoading(false);
    }
  };

  const openHistory = () => {
    historyTriggerRef.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    setHistoryOpen(true);
    if (!historyItems.length && !historyLoading) void loadHistoryPage();
  };

  const syncNotification = (notification: NotificationRecord) => {
    setNotificationPreview((current) => current && ({
      ...current,
      items: current.items.map((item) => item.notificationId === notification.notificationId ? notification : item),
    }));
    setHistoryItems((current) => current.map((item) => item.notificationId === notification.notificationId ? notification : item));
  };

  const openNotificationDetail = async (notificationId: string, trigger?: HTMLElement) => {
    if (trigger) detailTriggerRef.current = trigger;
    const sequence = ++detailRequestSequence.current;
    setDetailNotificationId(notificationId);
    setDetailNotification(null);
    setDetailError(false);
    setReadError(false);
    setDetailLoading(true);
    try {
      const { notification } = await notificationsApi.get(notificationId);
      if (detailRequestSequence.current !== sequence) return;
      setDetailNotification(notification);
      if (!notification.read && !readRequestsRef.current.has(notificationId)) {
        readRequestsRef.current.add(notificationId);
        try {
          await notificationsApi.markRead(notificationId);
          const readNotification = { ...notification, read: true };
          if (detailRequestSequence.current === sequence) setDetailNotification(readNotification);
          syncNotification(readNotification);
        } catch {
          if (detailRequestSequence.current === sequence) setReadError(true);
        } finally {
          readRequestsRef.current.delete(notificationId);
        }
      }
    } catch {
      if (detailRequestSequence.current === sequence) setDetailError(true);
    } finally {
      if (detailRequestSequence.current === sequence) setDetailLoading(false);
    }
  };

  const retryMarkRead = async () => {
    if (!detailNotification || detailNotification.read || readRequestsRef.current.has(detailNotification.notificationId)) return;
    const id = detailNotification.notificationId;
    const sequence = detailRequestSequence.current;
    readRequestsRef.current.add(id);
    setReadError(false);
    try {
      await notificationsApi.markRead(id);
      const readNotification = { ...detailNotification, read: true };
      if (detailRequestSequence.current === sequence) setDetailNotification(readNotification);
      syncNotification(readNotification);
    } catch {
      if (detailRequestSequence.current === sequence) setReadError(true);
    } finally {
      readRequestsRef.current.delete(id);
    }
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>, dialog: 'history' | 'detail') => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (detailNotification || detailLoading || detailError) closeDetailDialog();
      else if (dialog === 'history') closeHistoryDialog();
      return;
    }
    if (event.key !== 'Tab') return;
    if (dialog === 'history' && (detailNotification || detailLoading || detailError)) {
      event.preventDefault();
      detailDialogRef.current?.focus();
      return;
    }
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !event.currentTarget.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };

  const closeHistoryDialog = () => {
    focusRestoreRef.current = historyTriggerRef.current;
    setHistoryOpen(false);
  };
  const closeDetailDialog = () => {
    detailRequestSequence.current += 1;
    focusRestoreRef.current = detailTriggerRef.current;
    setDetailLoading(false);
    setDetailNotification(null);
    setDetailNotificationId(null);
    setDetailError(false);
    setReadError(false);
  };

  useEffect(() => {
    if (historyOpen) historyDialogRef.current?.focus();
  }, [historyOpen]);
  useEffect(() => {
    if (detailLoading || detailError || detailNotification) detailDialogRef.current?.focus();
  }, [detailLoading, detailError, detailNotification]);
  useEffect(() => {
    const target = focusRestoreRef.current;
    if (!target || detailLoading || detailError || detailNotification) return;
    if (detailTriggerRef.current === target || !historyOpen) {
      target.focus();
      focusRestoreRef.current = null;
    }
  }, [detailLoading, detailError, detailNotification, historyOpen]);

  useEffect(() => {
    if (user?.accountType === 'MEMBER') void loadNotificationPreview();
  }, [user?.accountType]);

  if (!user || user.accountType !== 'MEMBER') return null;

  const books = page?.items ?? [];
  const notification = detailNotification;

  const updateValue = (field: keyof MemberSearchValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (field === 'publicationYear') setRangeError('');
    if (field === 'publicationYearFrom' || field === 'publicationYearTo') setRangeError('');
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const filters = buildMemberBookFilters(values, {
        advancedSearchExpanded: advancedSearchRef.current?.open ?? false,
      });
      setRangeError('');
      setSubmittedFilters(filters);
      void loadFirstPage(filters);
    } catch (error) {
      setRangeError(error instanceof Error ? error.message : 'Check the publication year filters.');
    }
  };

  const clearSearch = () => {
    setValues(emptySearchValues);
    setRangeError('');
    setSubmittedFilters({});
    void loadFirstPage({});
  };

  const hasRange = Boolean(values.publicationYearFrom || values.publicationYearTo);
  const hasExactYear = Boolean(values.publicationYear);

  return (
    <main className="dashboard-page member-dashboard-page">
      <MemberNavigation onLogout={logout} />
      <section className="member-dashboard-content" aria-labelledby="member-greeting">
        <p className="eyebrow">YOUR LIBRARY, CONNECTED</p>
        <h1 id="member-greeting">Welcome back, {user.name}</h1>
        <section className="member-notifications" aria-labelledby="member-notifications-heading" aria-busy={notificationLoading}>
          <div className="member-notifications-heading">
            <h2 id="member-notifications-heading">Notifications</h2>
            <button className="text-button" type="button" ref={historyTriggerRef} onClick={openHistory}>View All Notifications</button>
          </div>
          {notificationLoading && <p role="status">Loading notifications…</p>}
          {!notificationLoading && notificationError && (
            <div className="member-notification-error" role="alert">
              <p>We could not load your notifications. Please try again.</p>
              <button className="text-button" type="button" onClick={() => void loadNotificationPreview()}>Try again</button>
            </div>
          )}
          {!notificationLoading && !notificationError && notificationPreview?.items.length === 0 && (
            <p className="member-notification-empty">No notifications yet.</p>
          )}
          {!notificationLoading && !notificationError && notificationPreview && notificationPreview.items.length > 0 && (
            <div className="member-notification-list">
              {notificationPreview.items.map((notification) => (
                <button type="button" className={`member-notification member-notification-button ${notification.read ? 'member-notification-read' : 'member-notification-unread'}`} key={notification.notificationId} onClick={(event: MouseEvent<HTMLButtonElement>) => void openNotificationDetail(notification.notificationId, event.currentTarget)} aria-label={`${notification.notificationType}, ${notification.read ? 'read' : 'unread'}: ${notification.message}`}>
                  <div className="member-notification-meta">
                    <span>{notification.notificationType}</span>
                    <span>{notification.read ? 'Read' : 'Unread'}</span>
                  </div>
                  <p className="member-notification-message">{notification.message}</p>
                </button>
              ))}
            </div>
          )}
        </section>
        {historyOpen && (
          <div className="member-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeHistoryDialog(); }}>
            <section className="member-notification-dialog" ref={historyDialogRef} role="dialog" aria-modal="true" aria-labelledby="notification-history-title" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, 'history')}>
              <div className="member-dialog-heading"><h2 id="notification-history-title">All notifications</h2><button className="text-button" type="button" onClick={() => closeHistoryDialog()} aria-label="Close notification history">Close</button></div>
              <div className="member-notification-history-scroll" onScroll={(event) => { const el = event.currentTarget; if (historyCursor && !historyLoading && el.scrollHeight - el.scrollTop - el.clientHeight < 80) void loadHistoryPage(historyCursor); }}>
                {historyItems.map((notification) => (
                  <button type="button" className={`member-notification member-notification-button ${notification.read ? 'member-notification-read' : 'member-notification-unread'}`} key={notification.notificationId} onClick={(event: MouseEvent<HTMLButtonElement>) => void openNotificationDetail(notification.notificationId, event.currentTarget)}>
                    <span className="member-notification-meta"><span>{notification.notificationType}</span><span>{notification.read ? 'Read' : 'Unread'}</span></span><span className="member-notification-message">{notification.message}</span>
                  </button>
                ))}
                {historyLoading && <p role="status">Loading notification history…</p>}
                {historyError && <div role="alert"><p>We could not load notification history.</p><button className="text-button" type="button" onClick={() => void loadHistoryPage(historyCursor ?? undefined)}>Try again</button></div>}
                {!historyLoading && !historyError && historyItems.length === 0 && <p>No notifications yet.</p>}
              </div>
            </section>
          </div>
        )}
        {(detailLoading || detailError || detailNotification) && (
          <div className="member-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetailDialog(); }}>
            <section className="member-notification-dialog member-notification-detail-dialog" ref={detailDialogRef} role="dialog" aria-modal="true" aria-labelledby="notification-detail-title" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, 'detail')}>
              <div className="member-dialog-heading"><h2 id="notification-detail-title">Notification details</h2><button className="text-button" type="button" onClick={() => closeDetailDialog()}>Close</button></div>
              {detailLoading && <p role="status">Loading notification…</p>}
              {detailError && <div role="alert"><p>We could not load this notification.</p><button className="text-button" type="button" onClick={() => { if (detailNotificationId) void openNotificationDetail(detailNotificationId); }}>Try again</button></div>}
              {notification && <div className="member-notification-detail">
                <p>{notification.message}</p><dl><dt>Type</dt><dd>{notification.notificationType}</dd><dt>Received</dt><dd>{new Date(notification.createdAt).toLocaleString()}</dd><dt>Reference type</dt><dd>{notification.referenceType ?? 'None'}</dd><dt>Reference ID</dt><dd>{notification.referenceId ?? 'None'}</dd></dl>
                {readError && <div role="alert"><p>We could not mark this notification as read. It remains unread.</p><button className="text-button" type="button" onClick={() => void retryMarkRead()}>Retry mark as read</button></div>}
              </div>}
            </section>
          </div>
        )}
        <form className="member-search-form" aria-label="Search the catalog" onSubmit={submitSearch}>
          <label className="field member-title-search">
            <span>Title contains</span>
            <input name="title" type="search" value={values.title} onChange={(event) => updateValue('title', event.target.value)} placeholder="Search book titles" />
          </label>
          <details className="member-advanced-search" ref={advancedSearchRef}>
            <summary>Advanced search</summary>
            <div className="member-filter-grid">
              <label className="field"><span>Author contains</span><input name="author" value={values.author} onChange={(event) => updateValue('author', event.target.value)} /></label>
              <label className="field"><span>Publisher contains</span><input name="publisher" value={values.publisher} onChange={(event) => updateValue('publisher', event.target.value)} /></label>
              <label className="field"><span>Category contains</span><input name="category" value={values.category} onChange={(event) => updateValue('category', event.target.value)} /></label>
              <label className="field"><span>Exact ISBN</span><input name="isbn" value={values.isbn} onChange={(event) => updateValue('isbn', event.target.value)} /></label>
              <label className="field"><span>Exact publication year</span><input name="publicationYear" type="number" min="0" max="9999" step="1" inputMode="numeric" value={values.publicationYear} disabled={hasRange} onChange={(event) => updateValue('publicationYear', event.target.value)} /></label>
              <fieldset className="member-year-range" disabled={hasExactYear} aria-describedby={rangeError ? 'member-year-error' : undefined}>
                <legend>Publication year range</legend>
                <label className="field"><span>From year</span><input name="publicationYearFrom" type="number" min="0" max="9999" step="1" inputMode="numeric" value={values.publicationYearFrom} onChange={(event) => updateValue('publicationYearFrom', event.target.value)} /></label>
                <label className="field"><span>To year</span><input name="publicationYearTo" type="number" min="0" max="9999" step="1" inputMode="numeric" value={values.publicationYearTo} onChange={(event) => updateValue('publicationYearTo', event.target.value)} /></label>
              </fieldset>
            </div>
          </details>
          {rangeError && <p id="member-year-error" className="form-error" role="alert">{rangeError}</p>}
          {searchError && <p className="form-error" role="alert">{searchError}</p>}
          <div className="member-search-actions">
            <button className="primary-button" type="submit">Search</button>
            <button className="text-button" type="button" onClick={clearSearch}>Clear filters</button>
          </div>
        </form>
        <section className="member-catalog-results" aria-label="Catalog results" aria-busy={initialLoading || moreLoading}>
          {initialLoading && <p role="status">Loading catalog…</p>}
          {!initialLoading && searchError && (
            <div className="member-result-error" role="alert">
              <p>{searchError}</p>
              <button className="text-button" type="button" onClick={() => void loadFirstPage(submittedFilters)}>Try again</button>
            </div>
          )}
          {!initialLoading && !searchError && page && books.length === 0 && (
            <p className="member-result-message">No books match these filters.</p>
          )}
          {books.length > 0 && (
            <div className="member-book-grid">
              {books.map((book) => (
                <Link className="member-book-card" to={`/member/books/${encodeURIComponent(book.isbn)}`} key={book.isbn}>
                  <div className="member-book-card-content">
                    <h2>{book.title}</h2>
                    <p className="member-book-category">{book.category}</p>
                    <p className="member-book-synopsis">{book.synopsis}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {!initialLoading && !searchError && page?.page.nextCursor && (
            <div className="member-pagination">
              {moreError && <p className="form-error" role="alert">Could not load more books.</p>}
              <button className="primary-button" type="button" onClick={() => void loadNextPage()} disabled={moreLoading}>
                {moreLoading ? 'Loading books…' : moreError ? 'Try again' : 'Load more books'}
              </button>
            </div>
          )}
          {!initialLoading && !searchError && page && books.length > 0 && !page.page.nextCursor && (
            <p className="member-result-message">End of results. You’ve seen all matching books.</p>
          )}
        </section>
        <span className="sr-only" aria-live="polite">{page ? `${page.items.length} catalog results loaded.` : ''}</span>
        <span className="sr-only" data-filter-count={Object.keys(submittedFilters).length} />
      </section>
    </main>
  );
}
