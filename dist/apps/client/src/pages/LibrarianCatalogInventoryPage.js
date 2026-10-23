import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/base.js';
import { catalogApi } from '../api/catalog.js';
import { useAuth } from '../auth/AuthContext.js';
const statuses = ['AVAILABLE', 'IN_TRANSIT', 'ON_LOAN', 'DAMAGED', 'LOST', 'RESERVED'];
const emptyBook = {
    isbn: '', title: '', author: '', publicationYear: new Date().getFullYear(), publisher: '', category: '', synopsis: '',
};
function authorText(author) {
    return Array.isArray(author) ? author.join(', ') : author;
}
export function bookFormValues(book) {
    return {
        isbn: book.isbn, title: book.title, author: authorText(book.author), publicationYear: book.publicationYear,
        publisher: book.publisher, category: book.category, synopsis: book.synopsis ?? '',
    };
}
function displayError(caught, fallback) {
    return caught instanceof ApiClientError ? caught.message : fallback;
}
export function validateBookForm(values, editing) {
    const errors = {};
    if (!editing && !values.isbn.trim())
        errors.isbn = 'ISBN is required.';
    if (!values.title.trim())
        errors.title = 'Title is required.';
    if (!values.author.trim())
        errors.author = 'Author is required.';
    if (!Number.isInteger(values.publicationYear) || values.publicationYear < 0 || values.publicationYear > 9999)
        errors.publicationYear = 'Enter a whole year from 0 to 9999.';
    if (!values.publisher.trim())
        errors.publisher = 'Publisher is required.';
    if (!values.category.trim())
        errors.category = 'Category is required.';
    if (values.synopsis.length > 10000)
        errors.synopsis = 'Synopsis must be 10,000 characters or fewer.';
    return errors;
}
function FieldError({ id, message }) {
    return message ? _jsx("span", { className: "field-error", id: id, children: message }) : null;
}
function BookForm({ values, editing, pending, onChange, onSubmit, onCancel }) {
    const errors = validateBookForm(values, editing);
    const describedBy = (field) => errors[field] ? `${field}-error` : undefined;
    return _jsxs("form", { className: "catalog-form", onSubmit: onSubmit, "aria-labelledby": "book-form-title", children: [_jsx("h2", { id: "book-form-title", children: editing ? 'Edit book metadata' : 'Add a book' }), !editing && _jsxs("label", { className: "field", children: ["ISBN", _jsx("input", { value: values.isbn, onChange: (event) => onChange('isbn', event.target.value), required: true, maxLength: 32, "aria-invalid": Boolean(errors.isbn), "aria-describedby": describedBy('isbn') }), " ", _jsx(FieldError, { id: "isbn-error", message: errors.isbn })] }), _jsxs("label", { className: "field", children: ["Title", _jsx("input", { value: values.title, onChange: (event) => onChange('title', event.target.value), required: true, maxLength: 500, "aria-invalid": Boolean(errors.title), "aria-describedby": describedBy('title') }), " ", _jsx(FieldError, { id: "title-error", message: errors.title })] }), _jsxs("label", { className: "field", children: ["Author", _jsx("input", { value: values.author, onChange: (event) => onChange('author', event.target.value), required: true, maxLength: 500, "aria-invalid": Boolean(errors.author), "aria-describedby": describedBy('author') }), " ", _jsx(FieldError, { id: "author-error", message: errors.author })] }), _jsxs("label", { className: "field", children: ["Publication year", _jsx("input", { type: "number", min: "0", max: "9999", step: "1", value: values.publicationYear, onChange: (event) => onChange('publicationYear', Number(event.target.value)), required: true, "aria-invalid": Boolean(errors.publicationYear), "aria-describedby": describedBy('publicationYear') }), " ", _jsx(FieldError, { id: "publicationYear-error", message: errors.publicationYear })] }), _jsxs("label", { className: "field", children: ["Publisher", _jsx("input", { value: values.publisher, onChange: (event) => onChange('publisher', event.target.value), required: true, maxLength: 500, "aria-invalid": Boolean(errors.publisher), "aria-describedby": describedBy('publisher') }), " ", _jsx(FieldError, { id: "publisher-error", message: errors.publisher })] }), _jsxs("label", { className: "field", children: ["Category", _jsx("input", { value: values.category, onChange: (event) => onChange('category', event.target.value), required: true, maxLength: 500, "aria-invalid": Boolean(errors.category), "aria-describedby": describedBy('category') }), " ", _jsx(FieldError, { id: "category-error", message: errors.category })] }), _jsxs("label", { className: "field", children: ["Synopsis", _jsx("textarea", { value: values.synopsis, onChange: (event) => onChange('synopsis', event.target.value), maxLength: 10000, "aria-invalid": Boolean(errors.synopsis), "aria-describedby": describedBy('synopsis') }), " ", _jsx(FieldError, { id: "synopsis-error", message: errors.synopsis })] }), _jsxs("div", { className: "catalog-form-actions", children: [_jsx("button", { className: "primary-button compact-button", type: "submit", disabled: pending || Object.keys(errors).length > 0, children: pending ? 'Saving…' : editing ? 'Save book' : 'Create book' }), _jsx("button", { className: "text-button compact-button", type: "button", onClick: onCancel, disabled: pending, children: "Cancel" })] })] });
}
function CopyRow({ copy, pending, onEdit, onDelete }) {
    return _jsxs("tr", { children: [_jsx("th", { scope: "row", children: copy.copyId }), _jsx("td", { children: copy.shelfLocation }), _jsx("td", { children: _jsx("span", { className: `status-pill status-${copy.status.toLowerCase()}`, children: copy.status.replace('_', ' ') }) }), _jsxs("td", { className: "account-actions", children: [_jsx("button", { className: "text-button compact-button", type: "button", disabled: pending, onClick: () => onEdit(copy), children: "Edit shelf" }), _jsx("button", { className: "text-button compact-button", type: "button", disabled: pending, onClick: () => onDelete(copy), children: "Delete copy" })] })] });
}
export function LibrarianCatalogInventoryPage() {
    const { logout } = useAuth();
    const [books, setBooks] = useState([]);
    const [detail, setDetail] = useState(null);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [selectedIsbn, setSelectedIsbn] = useState(null);
    const [search, setSearch] = useState({ title: '', author: '', publisher: '', category: '', isbn: '', publicationYear: '' });
    const [bookForm, setBookForm] = useState(emptyBook);
    const [editing, setEditing] = useState(false);
    const [showBookForm, setShowBookForm] = useState(false);
    const [copyShelf, setCopyShelf] = useState('');
    const [editingCopy, setEditingCopy] = useState(null);
    const [showCopyForm, setShowCopyForm] = useState(false);
    const [pending, setPending] = useState(false);
    const requestSequence = useRef(0);
    const loadCatalog = useCallback(async (isbn = selectedIsbn) => {
        const requestId = ++requestSequence.current;
        setLoading(true);
        setError(null);
        try {
            const filters = { ...search, publicationYear: search.publicationYear ? Number(search.publicationYear) : undefined, limit: 20 };
            const [booksPage, inventorySummary] = await Promise.all([catalogApi.listBooks(filters), catalogApi.inventorySummary()]);
            if (requestId !== requestSequence.current)
                return;
            setBooks(booksPage.items);
            setSummary(inventorySummary);
            const nextIsbn = isbn && booksPage.items.some((book) => book.isbn === isbn) ? isbn : booksPage.items[0]?.isbn ?? null;
            setSelectedIsbn(nextIsbn);
            if (nextIsbn) {
                setDetailLoading(true);
                const nextDetail = await catalogApi.getBook(nextIsbn);
                if (requestId === requestSequence.current)
                    setDetail(nextDetail);
            }
            else {
                setDetail(null);
            }
        }
        catch (caught) {
            if (requestId === requestSequence.current)
                setError(displayError(caught, 'Catalog data could not be loaded.'));
        }
        finally {
            if (requestId === requestSequence.current) {
                setLoading(false);
                setDetailLoading(false);
            }
        }
    }, [search, selectedIsbn]);
    useEffect(() => { void loadCatalog(); }, []);
    function selectBook(isbn) {
        const requestId = ++requestSequence.current;
        setSelectedIsbn(isbn);
        setDetailLoading(true);
        setError(null);
        void catalogApi.getBook(isbn).then((nextDetail) => {
            if (requestId === requestSequence.current)
                setDetail(nextDetail);
        }).catch((caught) => {
            if (requestId === requestSequence.current)
                setError(displayError(caught, 'Book details could not be loaded.'));
        }).finally(() => {
            if (requestId === requestSequence.current)
                setDetailLoading(false);
        });
    }
    function openCreate() {
        setBookForm({ ...emptyBook });
        setEditing(false);
        setShowBookForm(true);
        setError(null);
        setSuccess(null);
    }
    function openEdit(bookToEdit) {
        setBookForm(bookFormValues(bookToEdit));
        setEditing(true);
        setShowBookForm(true);
        setError(null);
        setSuccess(null);
    }
    async function submitBook(event) {
        event.preventDefault();
        const errors = validateBookForm(bookForm, editing);
        if (Object.keys(errors).length > 0)
            return;
        setPending(true);
        setError(null);
        setSuccess(null);
        try {
            const payload = { ...bookForm, isbn: bookForm.isbn.trim(), title: bookForm.title.trim(), author: bookForm.author.trim(), publisher: bookForm.publisher.trim(), category: bookForm.category.trim() };
            const saved = editing && selectedIsbn ? await catalogApi.updateBook(selectedIsbn, (({ isbn: _isbn, ...patch }) => patch)(payload)) : await catalogApi.createBook(payload);
            setShowBookForm(false);
            setSelectedIsbn(saved.isbn);
            setSuccess(editing ? 'Book metadata saved.' : 'Book created.');
            await loadCatalog(saved.isbn);
        }
        catch (caught) {
            setError(displayError(caught, 'The book could not be saved.'));
        }
        finally {
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
        }
        catch (caught) {
            setError(displayError(caught, 'The book could not be deleted.'));
        }
        finally {
            setPending(false);
        }
    }
    function startCopyEdit(copy) { setEditingCopy(copy); setShowCopyForm(true); setCopyShelf(copy.shelfLocation); setError(null); setSuccess(null); }
    async function saveCopy(event) {
        event.preventDefault();
        if (!detail || !copyShelf.trim()) {
            setError('Shelf location is required.');
            return;
        }
        setPending(true);
        setError(null);
        setSuccess(null);
        try {
            if (editingCopy)
                await catalogApi.updateCopy(editingCopy.copyId, copyShelf.trim());
            else
                await catalogApi.createCopy(detail.book.isbn, copyShelf.trim());
            setEditingCopy(null);
            setShowCopyForm(false);
            setCopyShelf('');
            setSuccess(editingCopy ? 'Copy shelf location saved.' : 'Copy added.');
            await loadCatalog(detail.book.isbn);
        }
        catch (caught) {
            setError(displayError(caught, 'The copy could not be saved.'));
        }
        finally {
            setPending(false);
        }
    }
    async function deleteCopy(copy) {
        if (!window.confirm(`Delete copy ${copy.copyId} from ${copy.shelfLocation}?`))
            return;
        setPending(true);
        setError(null);
        setSuccess(null);
        try {
            await catalogApi.deleteCopy(copy.copyId);
            setSuccess('Copy deleted.');
            await loadCatalog(detail?.book.isbn);
        }
        catch (caught) {
            setError(displayError(caught, 'The copy could not be deleted.'));
        }
        finally {
            setPending(false);
        }
    }
    return _jsxs("main", { className: "dashboard-page", children: [_jsxs("header", { className: "dashboard-header", children: [_jsxs(Link, { className: "brand-lockup", to: "/librarian/dashboard", "aria-label": "LibConnect home", children: [_jsx("span", { className: "brand-mark", "aria-hidden": "true", children: "L" }), _jsx("span", { children: "LibConnect" })] }), _jsxs("nav", { className: "dashboard-actions", "aria-label": "Catalog navigation", children: [_jsx(Link, { className: "text-button", to: "/librarian/dashboard", children: "Dashboard" }), _jsx("button", { className: "text-button", onClick: () => void logout(), children: "Sign out" })] })] }), _jsxs("section", { className: "catalog-panel", "aria-labelledby": "catalog-title", children: [_jsxs("div", { className: "catalog-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "LIBRARIAN TOOLS" }), _jsx("h1", { id: "catalog-title", children: "Catalog & inventory" }), _jsx("p", { className: "muted", children: "Maintain book metadata and physical copies while circulation controls status." })] }), _jsx("button", { className: "primary-button compact-button", type: "button", onClick: openCreate, children: "Add a book" })] }), summary && _jsxs("div", { className: "summary-grid", "aria-label": "Inventory summary", children: [[['Titles', summary.totalTitles], ['Copies', summary.totalCopies], ['Available', summary.availableCopies]].map(([label, value]) => _jsxs("div", { className: "summary-card", children: [_jsx("span", { children: label }), _jsx("strong", { children: value })] }, String(label))), _jsxs("div", { className: "summary-card", children: [_jsx("span", { children: "In use" }), _jsx("strong", { children: summary.totalCopies - summary.availableCopies })] })] }), success && _jsx("p", { className: "form-success", role: "status", children: success }), error && _jsx("p", { className: "form-error", role: "alert", children: error }), _jsxs("form", { className: "catalog-search", onSubmit: (event) => { event.preventDefault(); void loadCatalog(selectedIsbn); }, "aria-label": "Search catalog", children: [_jsxs("label", { className: "field", children: ["Title", _jsx("input", { value: search.title, onChange: (event) => setSearch({ ...search, title: event.target.value }), maxLength: 200 })] }), _jsxs("label", { className: "field", children: ["Author", _jsx("input", { value: search.author, onChange: (event) => setSearch({ ...search, author: event.target.value }), maxLength: 200 })] }), _jsxs("label", { className: "field", children: ["Publisher", _jsx("input", { value: search.publisher, onChange: (event) => setSearch({ ...search, publisher: event.target.value }), maxLength: 200 })] }), _jsxs("label", { className: "field", children: ["Category", _jsx("input", { value: search.category, onChange: (event) => setSearch({ ...search, category: event.target.value }), maxLength: 200 })] }), _jsxs("label", { className: "field", children: ["ISBN", _jsx("input", { value: search.isbn, onChange: (event) => setSearch({ ...search, isbn: event.target.value }), maxLength: 32 })] }), _jsxs("label", { className: "field", children: ["Year", _jsx("input", { type: "number", min: "0", max: "9999", value: search.publicationYear, onChange: (event) => setSearch({ ...search, publicationYear: event.target.value }) })] }), _jsx("button", { className: "primary-button compact-button", type: "submit", disabled: loading, children: "Search" })] }), _jsxs("div", { className: "catalog-layout", children: [_jsxs("section", { "aria-labelledby": "book-list-title", children: [_jsxs("div", { className: "section-heading", children: [_jsx("h2", { id: "book-list-title", children: "Books" }), _jsx("button", { className: "text-button compact-button", type: "button", onClick: () => void loadCatalog(selectedIsbn), disabled: loading, children: "Refresh" })] }), loading ? _jsx("p", { className: "muted", "aria-live": "polite", children: "Loading catalog\u2026" }) : books.length === 0 ? _jsx("p", { className: "empty-state", children: "No books match this search." }) : _jsx("div", { className: "book-list", children: books.map((bookItem) => _jsxs("button", { className: `book-list-item${bookItem.isbn === selectedIsbn ? ' selected' : ''}`, type: "button", onClick: () => selectBook(bookItem.isbn), children: [_jsx("strong", { children: bookItem.title }), _jsx("span", { children: authorText(bookItem.author) }), _jsxs("small", { children: [bookItem.isbn, " \u00B7 ", bookItem.publicationYear] })] }, bookItem.isbn)) })] }), _jsx("section", { className: "catalog-detail", "aria-labelledby": "book-detail-title", children: detailLoading ? _jsx("p", { className: "muted", "aria-live": "polite", children: "Loading book details\u2026" }) : detail ? _jsxs(_Fragment, { children: [_jsxs("div", { className: "section-heading", children: [_jsxs("div", { children: [_jsx("h2", { id: "book-detail-title", children: detail.book.title }), _jsxs("p", { className: "muted", children: [detail.book.isbn, " \u00B7 ", authorText(detail.book.author)] })] }), _jsxs("div", { className: "account-actions", children: [_jsx("button", { className: "text-button compact-button", type: "button", onClick: () => openEdit(detail.book), disabled: pending, children: "Edit book" }), _jsx("button", { className: "text-button compact-button", type: "button", onClick: () => void deleteBook(), disabled: pending, children: "Delete book" })] })] }), _jsxs("dl", { className: "book-metadata", children: [_jsxs("div", { children: [_jsx("dt", { children: "Publisher" }), _jsx("dd", { children: detail.book.publisher })] }), _jsxs("div", { children: [_jsx("dt", { children: "Category" }), _jsx("dd", { children: detail.book.category })] }), _jsxs("div", { children: [_jsx("dt", { children: "Year" }), _jsx("dd", { children: detail.book.publicationYear })] }), _jsxs("div", { children: [_jsx("dt", { children: "Synopsis" }), _jsx("dd", { children: detail.book.synopsis || 'No synopsis provided.' })] })] }), _jsxs("div", { className: "availability-box", children: [_jsx("strong", { children: "Availability" }), _jsxs("span", { children: [detail.availability.availableCount, " of ", detail.availability.totalCopies, " available"] }), _jsx("div", { className: "status-counts", children: statuses.map((status) => _jsxs("span", { children: [status.replace('_', ' '), ": ", detail.availability.byStatus[status] ?? 0] }, status)) })] }), _jsxs("div", { className: "section-heading", children: [_jsx("h3", { children: "Physical copies" }), _jsx("button", { className: "text-button compact-button", type: "button", onClick: () => { setEditingCopy(null); setShowCopyForm(true); setCopyShelf(''); }, disabled: pending, children: "Add copy" })] }), showCopyForm ? _jsxs("form", { className: "copy-form", onSubmit: (event) => void saveCopy(event), children: [_jsxs("label", { className: "field", children: ["Shelf location", _jsx("input", { value: copyShelf, onChange: (event) => setCopyShelf(event.target.value), required: true, maxLength: 500, autoFocus: true })] }), _jsxs("div", { className: "catalog-form-actions", children: [_jsx("button", { className: "primary-button compact-button", type: "submit", disabled: pending, children: pending ? 'Saving…' : editingCopy ? 'Save shelf' : 'Add copy' }), _jsx("button", { className: "text-button compact-button", type: "button", onClick: () => { setEditingCopy(null); setShowCopyForm(false); setCopyShelf(''); }, disabled: pending, children: "Cancel" })] })] }) : null, _jsx("div", { className: "account-table-wrap", children: _jsxs("table", { className: "account-table", children: [_jsxs("caption", { className: "sr-only", children: ["Current physical copies for ", detail.book.title] }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Copy" }), _jsx("th", { scope: "col", children: "Shelf" }), _jsx("th", { scope: "col", children: "Status" }), _jsx("th", { scope: "col", children: _jsx("span", { className: "sr-only", children: "Actions" }) })] }) }), _jsx("tbody", { children: detail.copies.length === 0 ? _jsx("tr", { children: _jsx("td", { colSpan: 4, className: "empty-state", children: "No physical copies yet." }) }) : detail.copies.map((copy) => _jsx(CopyRow, { copy: copy, pending: pending, onEdit: startCopyEdit, onDelete: (target) => void deleteCopy(target) }, copy.copyId)) })] }) })] }) : _jsx("p", { className: "empty-state", children: "Select a book to inspect its copies and availability." }) })] })] }), showBookForm && _jsx("div", { className: "catalog-form-shell", children: _jsx(BookForm, { values: bookForm, editing: editing, pending: pending, onChange: (field, value) => setBookForm({ ...bookForm, [field]: value }), onSubmit: (event) => void submitBook(event), onCancel: () => setShowBookForm(false) }) })] });
}
//# sourceMappingURL=LibrarianCatalogInventoryPage.js.map