export function dashboardPathFor(accountType) {
    return accountType === 'MEMBER' ? '/member/dashboard' : '/librarian/dashboard';
}
export function postLoginPathFor(accountType, requestedPath) {
    const dashboardPath = dashboardPathFor(accountType);
    if (requestedPath === '/' || requestedPath === dashboardPath)
        return requestedPath;
    return dashboardPath;
}
//# sourceMappingURL=dashboard-routing.js.map