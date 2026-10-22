export type ManagedAccountStatus = 'ACTIVE' | 'INACTIVE';
export declare function readableAccountStatus(status: ManagedAccountStatus): string;
export declare function nextAccountStatus(status: ManagedAccountStatus): ManagedAccountStatus;
export declare function statusChangeDetails(account: {
    accountStatus: ManagedAccountStatus;
    name: string;
}): {
    readonly nextStatus: ManagedAccountStatus;
    readonly action: "activate" | "deactivate";
    readonly confirmationMessage: `Confirm activate account for ${string}? The account will become ${string}.` | `Confirm deactivate account for ${string}? The account will become ${string}.`;
    readonly successMessage: `${string}'s account is now ${string}.`;
};
export declare function isSelfDeactivation(targetUserId: string, currentUserId: string | undefined, nextStatus: ManagedAccountStatus): boolean;
export declare function isSelfPasswordReset(targetUserId: string, currentUserId: string | undefined): boolean;
export declare function passwordResetDetails(name: string): {
    readonly heading: `Reset password for ${string}`;
    readonly explanation: "The old password will stop working and the target may need to sign in again.";
    readonly confirmationLabel: `I understand that ${string}'s old password will stop working.`;
    readonly successMessage: `Password reset for ${string} completed.`;
};
