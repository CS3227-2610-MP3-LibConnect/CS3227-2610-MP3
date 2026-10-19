import { type AccountType } from './AuthContext.js';
export declare function ProtectedRoute({ children, accountType }: {
    children: React.ReactNode;
    accountType?: AccountType;
}): string | number | bigint | boolean | import("react").JSX.Element | Iterable<import("react").ReactNode> | Promise<string | number | bigint | boolean | import("react").ReactPortal | import("react").ReactElement<unknown, string | import("react").JSXElementConstructor<any>> | Iterable<import("react").ReactNode>>;
