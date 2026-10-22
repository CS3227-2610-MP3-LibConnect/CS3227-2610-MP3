import { apiRequest } from './base.js';

export interface MemberProfileSummary {
  userId: string;
  name: string;
  email: string;
  accountType: 'MEMBER';
  accountStatus: 'ACTIVE' | 'INACTIVE';
  memberId?: string;
}

export interface MemberProfileResponse {
  user: MemberProfileSummary;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export const memberProfileApi = {
  get(): Promise<MemberProfileResponse> {
    return apiRequest<MemberProfileResponse>('/member/profile');
  },

  updateName(name: string): Promise<MemberProfileResponse> {
    return apiRequest<MemberProfileResponse>('/member/profile/name', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

  updateEmail(email: string): Promise<MemberProfileResponse> {
    return apiRequest<MemberProfileResponse>('/member/profile/email', {
      method: 'PATCH',
      body: JSON.stringify({ email }),
    });
  },

  changePassword(input: ChangePasswordInput): Promise<MemberProfileResponse> {
    return apiRequest<MemberProfileResponse>('/member/profile/password', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
};
