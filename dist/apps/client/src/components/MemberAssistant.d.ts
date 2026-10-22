import { type ReactNode } from 'react';
interface AssistantContextValue {
    isOpen: boolean;
    open(): void;
    close(): void;
}
export declare function MemberAssistantProvider({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
export declare function useMemberAssistant(): AssistantContextValue;
export {};
