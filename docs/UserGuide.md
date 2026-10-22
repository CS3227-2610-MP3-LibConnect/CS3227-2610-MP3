# LibConnect User Guide

## Table of contents

- [Getting to the librarian dashboard](#getting-to-the-librarian-dashboard)
- [Catalog and inventory](#catalog-and-inventory)
  - [Find a book](#find-a-book)
  - [Add or edit a book](#add-or-edit-a-book)
  - [Manage physical copies](#manage-physical-copies)
- [Loans and return/loss reviews](#loans-and-returnloss-reviews)
  - [Create a loan](#create-a-loan)
  - [Review a returned or lost report](#review-a-returned-or-lost-report)
- [Reservations, fines, and messages](#reservations-fines-and-messages)
  - [Review reservations](#review-reservations)
  - [Review or waive a fine](#review-or-waive-a-fine)
  - [Send a member message](#send-a-member-message)
- [Member account support](#member-account-support)
- [Manager-only librarian administration](#manager-only-librarian-administration)
  - [Activate or deactivate a librarian](#activate-or-deactivate-a-librarian)
  - [Reset another librarian's password](#reset-another-librarians-password)
- [Review assistant](#review-assistant)
  - [Summarize reports](#summarize-reports)
  - [Prepare and send a follow-up draft](#prepare-and-send-a-follow-up-draft)
- [Errors and refreshes](#errors-and-refreshes)
- [Privacy and safe use](#privacy-and-safe-use)

This guide covers the librarian and librarian-manager tools in Jiali's feature
area. Sign in through the normal LibConnect login page first. Librarian tools
require an active librarian account; manager tools additionally require manager
privilege. If an account is inactive, the server denies protected operations.

## Getting to the librarian dashboard

After signing in, open the librarian dashboard. It links to:

- **Catalog & inventory**
- **Loans & reviews**
- **Reservations & fines**
- **Member accounts**
- **Review assistant**
- **Manage librarian accounts** (managers only)

Use **Sign out** when finished. The server, rather than the browser, decides
which tools your account may use.

## Catalog and inventory

Open **Catalog & inventory** to maintain the catalog and physical copies.

### Find a book

Use any combination of title, author, publisher, category, ISBN, or exact
publication year, then select **Search**. Select a book to view its metadata,
availability, and physical copies. The availability panel shows the total number
of copies, available copies, and counts by status.

### Add or edit a book

1. Select **Add a book**.
2. Enter the ISBN, title, author, publication year, publisher, category, and
   optional synopsis.
3. Select **Create book**.

To change a book, select it, choose **Edit book**, update the editable fields,
and choose **Save book**. The ISBN identifies the record and is not changed by
the edit form.

### Manage physical copies

With a book selected:

1. Choose **Add copy** and enter its shelf location.
2. Choose **Edit** beside a copy to change only its shelf location.
3. Choose **Delete** to remove a copy, then confirm the prompt.

Copy status is controlled by lending, return review, reservations, and loss
workflows. Do not interpret the catalog page as a place to manually change a
copy from `ON_LOAN`, `IN_TRANSIT`, `RESERVED`, or `LOST`.

## Loans and return/loss reviews

Open **Loans & reviews**.

### Create a loan

1. In **Create a loan**, enter the member ID and copy ID.
2. Choose **Create loan**.

The member must be active. The copy must be available, or reserved for that
same member and still within its pickup period. A successful loan moves the copy
to **On loan** and assigns a 30-day due date.

### Review a returned or lost report

1. In **Pending reports**, select **Review** for the report.
2. For a returned book, choose an allowed disposition:
   - **Available**: return the copy to the lending pool;
   - **Damaged**: keep it out of circulation; or
   - **Reserved**: assign it to the earliest eligible pending reservation.
3. For a lost book, review the details; the server applies the configured lost-
   book fine and marks the copy lost when confirmed.
4. Choose **Confirm report** or **Reject report**, then confirm the prompt.

Rejecting either report restores the loan to active and the copy to on loan.
Confirming a returned report closes the loan. Confirming a lost report closes
the loan, marks the copy lost, and issues the server-policy fine. A reserved
return creates a pickup expiry and reservation-ready notification.

## Reservations, fines, and messages

Open **Reservations & fines**.

### Review reservations

Filter the reservation queue by ISBN and/or reservation status, then choose
**Apply filters**. The queue shows reservation ID, member ID, ISBN, status, and
pickup expiry. Assignment occurs during an eligible confirmed return review;
the page is for visibility into the queue.

### Review or waive a fine

Filter fines by fine status and optionally member ID. The amount and reason are
server-calculated. For an outstanding fine, choose **Waive** and confirm the
prompt. A successful waiver changes the status to **Waived** and creates a
notification for the member. Paid or already-waived fines cannot be waived
again.

### Send a member message

1. Enter the member ID in **Member ID**.
2. Enter a plain-text message of up to 2,000 characters.
3. Select **Send message** and confirm the prompt.

Messages can be sent only to active members. If a request is retried, the
application's idempotency protection prevents the same confirmed message from
being created twice.

## Member account support

Open **Member accounts** to help with account access.

1. Optionally filter by **Active** or **Inactive** status.
2. Select **View details** to inspect the safe account details.
3. Choose **Activate account** or **Deactivate account**, then confirm.

Activation does not sign the member in automatically. Deactivation preserves
the member's loans, reservations, fines, and notifications, but revokes active
sessions. An inactive member cannot use protected member operations until
reactivated.

## Manager-only librarian administration

Managers can open **Manage librarian accounts**.

### Activate or deactivate a librarian

Choose **Activate account** or **Deactivate account** for the target librarian,
then confirm. A newly registered librarian is inactive until a manager
activates the account. The last active manager cannot be deactivated through
the ordinary page.

### Reset another librarian's password

1. Choose **Reset password** for another librarian.
2. Enter a password of at least eight non-whitespace characters.
3. Enter it again in **Confirm new password**.
4. Tick the confirmation statement and choose **Confirm password reset**.

The old password stops working and the target's sessions are revoked after a
successful reset. A manager cannot use this action to reset their own password;
they must use the account's self-service password flow.

The **Open reset form** link provides the same reset operation as a native form
when JavaScript is unavailable.

## Review assistant

Open **Review assistant** to work with pending return and loss reports.

### Summarize reports

1. Select one or more pending reports, up to 20.
2. Choose **Summarize selected reports**.
3. Read the generated summary, report facts, suggested review action, and any
   uncertainty.

The summary is advisory. Verify the report in **Loans & reviews** before
confirming or rejecting anything.

### Prepare and send a follow-up draft

1. Choose **Prepare draft** beside a pending report.
2. Read the generated message, rationale, and warning.
3. Edit the message in **Reviewed message** as needed.
4. Choose **Confirm and send reviewed message**, then confirm the prompt.

The draft is not saved as a notification until you explicitly confirm the send.
The assistant cannot confirm a report, change a copy or account status, waive a
fine, choose a recipient, or send a message by itself. Sending still goes
through the normal active-member notification workflow.

## Errors and refreshes

If a page shows an error, read the message, correct the input if needed, and
choose **Refresh** before retrying. A conflict usually means that another
operation changed the record; refresh the queue and review the current state.

The application disables duplicate actions while a request is in progress. A
success message means the server confirmed the operation; a failed request does
not claim that a change was made.

## Privacy and safe use

- Treat member IDs, account details, loan information, and generated text as
  private library data.
- Do not put passwords, session information, or unnecessary personal details
  into messages or AI prompts.
- Treat AI summaries and drafts as suggestions, not approvals or facts. Check
  the underlying record before taking a consequential action.
