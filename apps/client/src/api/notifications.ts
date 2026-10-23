import { apiRequest } from './base.js';

export type NotificationType =
  'OVERDUE_ALERT' | 'RESERVATION_READY' | 'FINE_ISSUED' | 'FINE_UPDATED' | 'LIBRARIAN_MESSAGE';

export type NotificationReferenceType = 'LOAN' | 'RESERVATION' | 'FINE';

/** Notification record as serialized by the member API. */
export interface NotificationRecord {
  notificationId: string;
  recipientUserId: string;
  notificationType: NotificationType;
  referenceType: NotificationReferenceType | null;
  referenceId: string | null;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface NotificationPreview {
  items: NotificationRecord[];
}

export interface NotificationPage {
  items: NotificationRecord[];
  page: { limit: number; nextCursor: string | null };
}

export interface NotificationHistoryOptions {
  limit?: number;
  cursor?: string;
}

export interface NotificationDetail {
  notification: NotificationRecord;
}

function queryString(options: NotificationHistoryOptions): string {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.cursor !== undefined) params.set('cursor', options.cursor);
  return params.toString();
}

export const notificationsApi = {
  getPreview(): Promise<NotificationPreview> {
    return apiRequest('/member/notifications/preview');
  },
  list(options: NotificationHistoryOptions = {}): Promise<NotificationPage> {
    const query = queryString(options);
    return apiRequest(`/member/notifications${query ? `?${query}` : ''}`);
  },
  get(notificationId: string): Promise<NotificationDetail> {
    return apiRequest(`/member/notifications/${encodeURIComponent(notificationId)}`);
  },
  markRead(notificationId: string): Promise<void> {
    return apiRequest(`/member/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'PATCH',
    });
  },
};
