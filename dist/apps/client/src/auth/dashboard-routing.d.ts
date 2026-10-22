import type { AccountType } from './AuthContext.js';
export declare function dashboardPathFor(accountType: AccountType): string;
export declare function postLoginPathFor(accountType: AccountType, requestedPath?: string): string;
