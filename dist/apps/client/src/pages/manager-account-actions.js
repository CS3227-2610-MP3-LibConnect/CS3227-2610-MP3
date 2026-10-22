export function readableAccountStatus(status) {
    return status === 'ACTIVE' ? 'Active' : 'Inactive';
}
export function nextAccountStatus(status) {
    return status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
}
export function statusChangeDetails(account) {
    const nextStatus = nextAccountStatus(account.accountStatus);
    return {
        nextStatus,
        action: nextStatus === 'ACTIVE' ? 'activate' : 'deactivate',
        confirmationMessage: `Confirm ${nextStatus === 'ACTIVE' ? 'activate' : 'deactivate'} account for ${account.name}? The account will become ${readableAccountStatus(nextStatus)}.`,
        successMessage: `${account.name}'s account is now ${readableAccountStatus(nextStatus)}.`,
    };
}
export function isSelfDeactivation(targetUserId, currentUserId, nextStatus) {
    return targetUserId === currentUserId && nextStatus === 'INACTIVE';
}
export function isSelfPasswordReset(targetUserId, currentUserId) {
    return targetUserId === currentUserId;
}
export function passwordResetDetails(name) {
    return {
        heading: `Reset password for ${name}`,
        explanation: 'The old password will stop working and the target may need to sign in again.',
        confirmationLabel: `I understand that ${name}'s old password will stop working.`,
        successMessage: `Password reset for ${name} completed.`,
    };
}
//# sourceMappingURL=manager-account-actions.js.map