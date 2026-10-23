import { apiRequest } from './base.js';

export interface MemberAccount {
  userId: string;
  memberId: string;
  name: string;
  email: string;
  accountStatus: 'ACTIVE' | 'INACTIVE';
  registrationDateTime: string;
}

export interface MemberPage {
  items: MemberAccount[];
  page: { limit: number; nextCursor: string | null };
}

export const memberAccountsApi = {
  list(
    options: { status?: MemberAccount['accountStatus']; limit?: number; cursor?: string } = {},
  ): Promise<MemberPage> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/librarian/members${suffix}`);
  },
  get(userId: string): Promise<{ member: MemberAccount }> {
    return apiRequest(`/librarian/members/${encodeURIComponent(userId)}`);
  },
  updateStatus(
    userId: string,
    status: MemberAccount['accountStatus'],
  ): Promise<{ member: MemberAccount }> {
    return apiRequest(`/librarian/members/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
};
