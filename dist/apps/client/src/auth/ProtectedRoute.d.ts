import { type AccountType } from './AuthContext.js';
export declare function ProtectedRoute({ children, accountType, managerOnly }: {
    children: React.ReactNode;
    accountType?: AccountType;
    managerOnly?: boolean;
}): string | number | bigint | boolean | import("react").JSX.Element | Iterable<import("react").ReactNode> | Promise<string | number | bigint | boolean | import("react").ReactPortal | import("react").ReactElement<unknown, string | import("react").JSXElementConstructor<any>> | Iterable<import("react").ReactNode>>;
