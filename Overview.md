Below is a cleaned-up version of the brief, followed by gaps and inconsistencies to resolve. I’ve kept workflows out as requested.

## Refined project brief

# LibConnect

## Application context

LibConnect is a web-based library management platform for tracking the library’s book catalog, physical book copies, loans, fines, reservations, and notifications.

The application has two user roles: **Members** and **Librarians**. It will be developed using **React with TypeScript** for the frontend, **Express.js** for the backend, and **Firestore** for data storage.

## User stories

### New User

- As a **new user**, I want to register for a member or librarian account so that I can access the features available to that account type.

### Member

#### Catalog and reservations

- As a **member**, I want to view the library’s catalog so that I can find books the library holds.
- As a **member**, I want to view the availability of a book’s individual copies so that I can decide whether to borrow or reserve one.
- As a **member**, I want to reserve a book when no copies are available so that I can collect one when it becomes available.

#### Loans and returns

- As a **member**, I want to borrow an available book copy so that I can take it out of the library.
- As a **member**, I want to report a borrowed book copy as returned so that the library can verify its return.
- As a **member**, I want to report a borrowed book copy as lost so that the library can review the report.

#### Fines and notifications

- As a **member**, I want to pay fines for overdue or lost books so that I can settle what I owe.
- As a **member**, I want to receive and view system-generated and librarian-issued notifications so that I can stay informed about my library activity.

#### Account management

- As a **member**, I want to update my name, email address, and password so that my account details stay current.

### Librarian

#### Catalog and inventory

- As a **librarian**, I want to create, view, update, and delete book records so that the catalog stays accurate.
- As a **librarian**, I want to create, view, update, and delete book-copy records so that I can manage the library’s inventory and copy statuses.

#### Loans and returns

- As a **librarian**, I want to create loans for members and view existing loans so that I can manage lending activity.
- As a **librarian**, I want to verify copies reported as returned and update their status to **AVAILABLE**, **RESERVED** or **DAMAGED** so that the inventory reflects their condition.
- As a **librarian**, I want to review lost-copy reports and accept or reject them so that confirmed losses are reflected in the inventory.

#### Fines, reservations, and notifications

- As a **librarian**, I want to view and update issued fines so that I can waive them when appropriate.
- As a **librarian**, I want to notify members about overdue loans, unpaid fines, and available reservations so that they know when to take action or collect a book.

#### Member account support

- As a **librarian**, I want to view member accounts and update their account status so that I can activate or deactivate accounts when needed.
- As a **librarian**, I want to help a member reset their password so that they can regain access to their account.

### Librarian Manager

A **Librarian Manager** is a librarian with additional account-management permissions.

#### Librarian account support

- As a **Librarian Manager**, I want to view librarian accounts and update their account status so that I can activate or deactivate librarian accounts as needed.
- As a **Librarian Manager**, I want to help a librarian reset their password so that they can regain access to their account.

#### Account management

- As a **librarian**, I want to update my name, email address, and password so that my account details stay current.

## Data model

The classes below describe the main data entities. Field types and validation rules should be defined in the implementation or a separate technical specification.

### Book

A **Book** represents a title in the catalog, identified by its ISBN. A book may have multiple physical copies.

- `isbn`: ISBN that identifies the book title
- `title`: title of the book
- `author`: author or authors
- `publicationYear`: year of publication
- `publisher`: publisher’s name
- `category`: genre or category
- `synopsis`: short description of the book

### BookCopy
A **BookCopy** represents a physical copy of a book.

- `copyId`: unique identifier for the physical copy
- `isbn`: ISBN of the corresponding `Book`
- `shelfLocation`: location of the copy in the library
- `status`: current status of the copy; one of:
  - `AVAILABLE`: the copy is available to be borrowed
  - `IN_TRANSIT`: the copy is awaiting verification after being reported as returned or lost
  - `ON_LOAN`: the copy is currently loaned to a member
  - `DAMAGED`: the copy is damaged and unavailable to be borrowed
  - `LOST`: the copy has been confirmed as lost
  - `RESERVED`: the copy is reserved for a member and is unavailable to be borrowed.

### Loan

A **Loan** represents the lending of one book copy to one member.

- `loanId`: unique identifier for the loan
- `memberId`: identifier of the member who borrowed the copy
- `copyId`: identifier of the borrowed `BookCopy`
- `borrowDateTime`: date and time the loan was created
- `dueDate`: date the loan is due
- `returnDateTime`: date and time the return was confirmed, if applicable
- `status`: loan status; one of:
  - `ACTIVE`: the copy has not been returned or reported lost
  - `PENDING_CLOSE`: the member has reported the copy as returned or lost, pending librarian review
  - `CLOSED_RETURNED`: the return has been confirmed
  - `CLOSED_LOST`: the loss has been confirmed
- `isRenewed`: whether the loan has been renewed

The due date is currently specified as 30 days after the borrow date. Confirm whether this is a fixed rule or a configurable policy.

### Fine

A **Fine** represents an amount owed by a member, such as for an overdue loan or a lost copy.

- `fineId`: unique identifier for the fine
- `loanId`: identifier of the related loan
- `memberId`: identifier of the member who owes the fine
- `bookTitle`: title associated with the fine, if stored as a snapshot
- `amount`: amount owed
- `reason`: reason the fine was issued
- `status`: fine status; one of:
  - `OUTSTANDING`: the fine has not been paid or waived
  - `PAID`: the fine has been paid
  - `WAIVED`: the fine has been waived
- `issuedDateTime`: date and time the fine was issued

### Notification

A **Notification** represents a message for a member.

- `notificationId`: unique identifier for the notification
- `recipientUserId`: identifier of the intended recipient
- `notificationType`: category of notification; one of: 
    - `OVERDUE_ALERT` : to remind users of overdue loans
    - `RESERVATION_REMINDER` : to notify users that a copy of their reserved book is available
<!-- TODO: Fill in descriptors for referenceId -->
- `referenceId`: 
- `message`: notification text
- `createdAt`: date and time the notification was created
- `read`: whether the recipient has read the notification

### Reservation

A **Reservation** represents a member’s request for a book title when no copies are available.

- `reservationId`: unique identifier for the reservation
- `memberId`: identifier of the member who made the reservation
- `isbn`: ISBN of the reserved book
- `copyId`: identifier of the book copy reserved for the reservation, initialised to null.
- `reservationDateTime`: date and time the reservation was created
- `expiryDate`: the date after which the reservation expires and the status of the book will be updated from `RESERVED` to `AVAILABLE`. this is set to 15 days after an available copy is found and tagged to this reservation
- `status`: reservation status; one of:
  - `PENDING`: awaiting availability or fulfilment
  - `FULFILLED`: fulfilled
  - `CANCELLED`: cancelled by the member
  - `EXPIRED`: member did not collect the reservation by expiryDate

When a copy of the book is available, it will be reserved for the earliest reservation made for the book, and the `copyId` will be updated to that of the reserved book copy. The `expiryDate` will be set to 15 days from when a copy of the book is reserved for the reservation.

### User

A **User** represents an account in the application. It is an abstract base type for members and librarians.

- `userId`: unique identifier for the user
- `name`: user’s name
- `email`: registered email address
- `passwordHash`: password hash
- `registrationDateTime`: date and time the account was created
- `accountType`: one of `MEMBER` or `LIBRARIAN`
- `accountStatus`: one of:
  - `ACTIVE`: the user can sign in
  - `INACTIVE`: the user cannot sign in

New member accounts are active by default. New librarian accounts are inactive until activated by an authorized master account.

#### Member

A **Member** is a user who can use member features.

- `memberId`: identifier for the member

#### Librarian

A **Librarian** is a user who can use librarian features.

- `employeeId`: identifier for the librarian in the organization
- `isManager` : defines if the account will be granted priviledges to activate / deactivate other librarian accounts

All librarian accounts have the `isManager` field set to `false` by default, except one account which is created specfically for the purpose of librarian account management. 

## Development context

LibConnect will be developed by two developers. The assigned development areas are documented in:

- [Jun Hong’s responsibilities](./Developer_Responsibilities/junhong.md)
- [Jiali’s responsibilities](./Developer_Responsibilities/jiali.md)

<!-- TODO: include the link to your md file below -->
You are to assist in the development of the features specified in [this markdown file]()

Keep the full project scope in mind when developing individual features. Design interfaces and shared code so that the separately developed parts can be integrated.
