import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiClientError } from '../api/errors.js';
import { catalogApi } from '../api/catalog.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { useAuth } from '../auth/AuthContext.js';
export function MemberBookDetail() {
    const { user, logout } = useAuth();
    const { isbn = '' } = useParams();
    const [result, setResult] = useState(null);
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
            const response = await catalogApi.getBook(isbn);
            if (requestSequence.current === sequence)
                setResult(response);
        }
        catch (cause) {
            if (requestSequence.current === sequence) {
                if (cause instanceof ApiClientError && cause.status === 404)
                    setNotFound(true);
                else
                    setError(true);
            }
        }
        finally {
            if (requestSequence.current === sequence)
                setLoading(false);
        }
    }, [isbn]);
    useEffect(() => {
        void loadBook();
        return () => { requestSequence.current += 1; };
    }, [loadBook]);
    if (!user || user.accountType !== 'MEMBER')
        return null;
    return (_jsxs("main", { className: "dashboard-page member-dashboard-page", children: [_jsx(MemberNavigation, { onLogout: logout }), _jsxs("section", { className: "member-detail-content", "aria-labelledby": "book-detail-heading", "aria-busy": loading, children: [_jsx(Link, { className: "member-detail-back", to: "/member/dashboard", children: "Back to catalog" }), loading && _jsx("p", { role: "status", children: "Loading book details\u2026" }), !loading && notFound && (_jsxs("div", { className: "member-detail-message", children: [_jsx("h1", { id: "book-detail-heading", children: "Book not found" }), _jsxs("p", { children: ["We could not find a book with ISBN ", isbn, "."] })] })), !loading && error && (_jsxs("div", { className: "member-detail-message", role: "alert", children: [_jsx("h1", { id: "book-detail-heading", children: "Could not load book details" }), _jsx("p", { children: "Please check your connection and try again." }), _jsx("button", { className: "primary-button", type: "button", onClick: () => void loadBook(), children: "Try again" })] })), !loading && result && (_jsxs("article", { className: "member-book-detail", children: [_jsx("p", { className: "eyebrow", children: "BOOK DETAILS" }), _jsx("h1", { id: "book-detail-heading", children: result.book.title }), _jsxs("dl", { className: "member-book-metadata", children: [_jsxs("div", { children: [_jsx("dt", { children: "ISBN" }), _jsx("dd", { children: result.book.isbn })] }), _jsxs("div", { children: [_jsx("dt", { children: "Author" }), _jsx("dd", { children: Array.isArray(result.book.author) ? result.book.author.join(', ') : result.book.author })] }), _jsxs("div", { children: [_jsx("dt", { children: "Publication year" }), _jsx("dd", { children: result.book.publicationYear })] }), _jsxs("div", { children: [_jsx("dt", { children: "Publisher" }), _jsx("dd", { children: result.book.publisher })] }), _jsxs("div", { children: [_jsx("dt", { children: "Category" }), _jsx("dd", { children: result.book.category })] })] }), _jsxs("section", { "aria-labelledby": "book-synopsis-heading", children: [_jsx("h2", { id: "book-synopsis-heading", children: "Synopsis" }), _jsx("p", { children: result.book.synopsis || 'No synopsis is available.' })] }), _jsxs("section", { "aria-labelledby": "copy-availability-heading", children: [_jsx("h2", { id: "copy-availability-heading", children: "Copy availability" }), _jsxs("p", { children: [result.availability.availableCount, " of ", result.availability.totalCopies, " copies available"] }), result.copies.length === 0 ? _jsx("p", { children: "No physical copies are listed for this title." }) : (_jsx("ul", { className: "member-copy-list", children: result.copies.map((copy) => (_jsxs("li", { children: [_jsxs("span", { children: [_jsx("strong", { children: "Shelf location:" }), " ", copy.shelfLocation] }), _jsxs("span", { children: [_jsx("strong", { children: "Status:" }), " ", copy.status.replaceAll('_', ' ')] })] }, copy.copyId))) }))] })] }))] })] }));
}
//# sourceMappingURL=MemberBookDetail.js.map