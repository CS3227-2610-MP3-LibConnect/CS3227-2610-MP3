export type NotificationType = 'OVERDUE_ALERT' | 'RESERVATION_READY' | 'FINE_ISSUED' | 'FINE_UPDATED' | 'LIBRARIAN_MESSAGE';
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
    page: {
        limit: number;
        nextCursor: string | null;
    };
}
export interface NotificationHistoryOptions {
    limit?: number;
    cursor?: string;
}
export interface NotificationDetail {
    notification: NotificationRecord;
}
export declare const notificationsApi: {
    getPreview(): Promise<NotificationPreview>;
    list(options?: NotificationHistoryOptions): Promise<NotificationPage>;
    get(notificationId: string): Promise<NotificationDetail>;
    markRead(notificationId: string): Promise<void>;
};
