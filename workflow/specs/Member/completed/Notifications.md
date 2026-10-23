# Member Notifications

## Purpose and access

Show a member the system-generated and librarian-issued notifications
addressed to their account. Members may view only their own notifications;
the server must enforce recipient ownership using the authenticated session.

Notifications use the shared `Notification` fields: `notificationId`,
`recipientUserId`, `notificationType`, optional `referenceType` and
`referenceId`, `message`, `createdAt`, and `read`. Supported types are
`OVERDUE_ALERT`, `RESERVATION_READY`, `FINE_ISSUED`, `FINE_UPDATED`, and
`LIBRARIAN_MESSAGE`. Read state is the boolean `read` field (`false` is
unread, `true` is read).

## Dashboard preview

Place a notifications section on the member dashboard below the welcome
message and above the search bar. Show notification cards in descending
`createdAt` order. Each card shows its notification type and a compact
preview of its message; truncate long previews with an ellipsis.

Choose cards for the preview as follows:

- If there are two or more unread notifications, show all unread
  notifications and no read notifications.
- If there is exactly one unread notification, show it and the most recently
  created read notification, if one exists.
- If there are no unread notifications, show up to the two most recently
  created read notifications.
- If there are no notifications, show a clear empty state.

Unread and read cards must have visibly distinct styles. Include **View All
Notifications** to open the full list.

## Full list and notification details

- **View All Notifications** opens a scrollable dialog listing all of the
  member's notifications, both read and unread, newest first.
- Each notification in the dashboard preview or full list can be opened.
  Opening it displays the complete message and available type, creation time,
  and reference details in a detail dialog.
- Closing a dialog does not change read state. When the member opens an
  unread notification, mark it read (`read: true`) and update its visual
  style in every currently visible list. Opening an already read notification
  does not need to write an update.
- Do not provide a member action to edit or delete notifications.

## Loading, updates, and errors

- Load only notifications belonging to the authenticated member. Use the
  server response as the source of truth for list contents and read state.
- While a notification is being marked read, prevent duplicate updates for
  that notification. Update the UI after the server confirms the change.
- If loading the preview, full list, or notification detail fails, show a
  useful error state and allow retry. Do not display another member's data
  as a fallback.
- If marking a notification read fails, show an error message and keep it
  visibly unread so the member can retry.
- Render notification messages as text. Do not interpret message content as
  markup or executable content.

## Scope

This feature displays and marks notifications as read. Creating notifications
and deciding when they are issued are owned by the system and librarian
notification workflows. A notification's optional reference is display
context only; it does not grant access to the referenced loan, reservation,
or fine.
