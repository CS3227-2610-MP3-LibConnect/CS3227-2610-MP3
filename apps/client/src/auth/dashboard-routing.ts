import type { AccountType } from './AuthContext.js';

export function dashboardPathFor(accountType: AccountType): string {
  return accountType === 'MEMBER' ? '/member/dashboard' : '/librarian/dashboard';
}

export function postLoginPathFor(accountType: AccountType, requestedPath?: string): string {
  const dashboardPath = dashboardPathFor(accountType);
  if (requestedPath === '/' || requestedPath === dashboardPath) return requestedPath;
  return dashboardPath;
}
