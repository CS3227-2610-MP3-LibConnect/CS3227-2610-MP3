export type ManagedAccountStatus = 'ACTIVE' | 'INACTIVE';

export function readableAccountStatus(status: ManagedAccountStatus): string {
  return status === 'ACTIVE' ? 'Active' : 'Inactive';
}

export function nextAccountStatus(status: ManagedAccountStatus): ManagedAccountStatus {
  return status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
}

export function statusChangeDetails(account: {
  accountStatus: ManagedAccountStatus;
  name: string;
}) {
  const nextStatus = nextAccountStatus(account.accountStatus);
  return {
    nextStatus,
    action: nextStatus === 'ACTIVE' ? 'activate' : 'deactivate',
    confirmationMessage: `Confirm ${nextStatus === 'ACTIVE' ? 'activate' : 'deactivate'} account for ${account.name}? The account will become ${readableAccountStatus(nextStatus)}.`,
    successMessage: `${account.name}'s account is now ${readableAccountStatus(nextStatus)}.`,
  } as const;
}

export function isSelfDeactivation(
  targetUserId: string,
  currentUserId: string | undefined,
  nextStatus: ManagedAccountStatus,
): boolean {
  return targetUserId === currentUserId && nextStatus === 'INACTIVE';
}

export function isSelfPasswordReset(
  targetUserId: string,
  currentUserId: string | undefined,
): boolean {
  return targetUserId === currentUserId;
}

export function passwordResetDetails(name: string) {
  return {
    heading: `Reset password for ${name}`,
    explanation: 'The old password will stop working and the target may need to sign in again.',
    confirmationLabel: `I understand that ${name}'s old password will stop working.`,
    successMessage: `Password reset for ${name} completed.`,
  } as const;
}
