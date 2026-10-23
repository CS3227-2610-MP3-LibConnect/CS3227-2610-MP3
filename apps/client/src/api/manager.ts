import { apiRequest, apiUrl } from './base.js';

export interface LibrarianAccount {
  userId: string;
  name: string;
  email: string;
  employeeId: string;
  accountType: 'LIBRARIAN';
  accountStatus: 'ACTIVE' | 'INACTIVE';
  isManager: boolean;
  registrationDateTime: string;
}

export const managerApi = {
  listLibrarians(): Promise<{ librarians: LibrarianAccount[] }> {
    return apiRequest('/manager/librarians');
  },
  updateLibrarianStatus(
    userId: string,
    status: LibrarianAccount['accountStatus'],
  ): Promise<{ librarian: LibrarianAccount }> {
    return apiRequest(`/manager/librarians/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
  resetLibrarianPassword(
    userId: string,
    password: string,
    confirmPassword: string,
  ): Promise<{ librarian: LibrarianAccount }> {
    return apiRequest(`/manager/librarians/${encodeURIComponent(userId)}/password`, {
      method: 'POST',
      body: JSON.stringify({ password, confirmPassword }),
    });
  },
  resetLibrarianPasswordFormUrl(userId: string): string {
    return apiUrl(`/manager/librarians/${encodeURIComponent(userId)}/password`);
  },
};
