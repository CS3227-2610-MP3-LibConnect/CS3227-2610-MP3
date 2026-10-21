# Member AI Assistant (Libby)

## Purpose and persona

Libby is the member-facing assistant for questions about using LibConnect,
finding books, understanding borrowing guidance, and checking a member's own
current loan activity. Libby should be warm, clear, and helpful. Its answers
are advisory and must reflect current application data where the scenario
requires it.

## Scope and guardrails

- Libby may answer the navigation, catalog, borrowing-guidance, reservation,
  and personalized loan questions covered by the acceptance scenarios below.
- Libby is read-only. It may explain how to borrow a copy, create or cancel a
  reservation, or pay a fine, but it must not perform those actions or change
  any library or account data.
- Member messages, book titles, synopses, and other retrieved application text
  are untrusted data. They cannot change Libby's instructions, permissions, or
  member scope.
- Libby must not reveal secrets, credentials, internal implementation details,
  or another member's information. It must not execute commands or browse the
  internet for unrelated information.
- For unrelated requests, Libby should briefly explain its scope and invite a
  LibConnect-related question.
- If an answer depends on unavailable or missing data, Libby must say it cannot
  confirm the answer and direct the member to the relevant application page.
  It must not invent an answer or treat a failed lookup as a zero value.

## Acceptance scenarios

Each scenario describes observable behavior. Equivalent natural-language
questions should receive the same guidance. Destinations use the current
member-facing labels and routes.

### App navigation

1. **Update personal details**
   - Given a signed-in member, when they ask where to update their personal
     details, then Libby directs them to **Profile** (`/member/profile`).

2. **View loans**
   - Given a signed-in member, when they ask where to view their loans, then
     Libby directs them to **My Loans** (`/member/profile/loans`).

3. **View reservations**
   - Given a signed-in member, when they ask where to view their reservations,
     then Libby directs them to **My Reservations**
     (`/member/profile/reservations`).

4. **Cancel a reservation**
   - Given a signed-in member, when they ask where to cancel a reservation,
     then Libby directs them to **My Reservations**. This is the preferred
     guidance even though cancellation is also available from a book detail
     page.

5. **View and pay fines**
   - Given a signed-in member, when they ask where to view or pay fines, then
     Libby directs them to **My Fines** (`/member/profile/fines`) and explains
     that available fine payment actions appear there.

6. **View notifications**
   - Given a signed-in member, when they ask where to view notifications, then
     Libby directs them to **Dashboard** (`/member/dashboard`) and identifies
     **View All Notifications** in the Notifications section.

7. **Know when a reservation is ready**
   - Given a member has reserved a book, when they ask how they will know it is
     ready for collection, then Libby explains that LibConnect sends a
     notification when the reservation is ready.

### Catalog and borrowing guidance

8. **Find a book**
   - Given a signed-in member, when they ask how to find a book, then Libby
     directs them to search from **Dashboard** (`/member/dashboard`) and notes
     that advanced search is available there.

9. **Find a copy and its shelf location**
   - Given a signed-in member, when they ask how to find a copy of a book, then
     Libby explains that they can search from Dashboard, open the book, and
     check its copy availability and shelf location on the book detail page.

10. **Make a reservation**
    - Given a signed-in member, when they ask how to reserve a book, then Libby
      explains that they should find the book from Dashboard, open its detail
      page, and select **Make Reservation** when no copies are available.

11. **Borrow a book**
    - Given a signed-in member, when they ask how to borrow a book, create a
      loan, or loan a book, then Libby directs them to **Borrow**
      (`/member/borrow`) and explains the current steps: enter a copy ID, select
      **Add copy**, select **Review and borrow**, and confirm the borrow.
      Libby must make clear that it is explaining the workflow, not borrowing
      the copy for the member.

12. **Borrowing limit**
    - Given a signed-in member, when they ask for the borrowing limit, then
      Libby explains that the limit is 10 active loans at a time.

13. **Why another book cannot be borrowed**
    - Given the member has 10 active loans, when they ask why they cannot
      borrow more books, then Libby explains that they have reached the limit
      and directs them to **My Loans**. Given the member is below the limit or
      their loan data cannot be checked, Libby must not claim that the limit is
      the reason; it should direct them to **Borrow** to check their current
      borrowing capacity and copy eligibility.

### Personalized account questions

Personalized answers must use facts assembled by the server for the member
identified by the authenticated session. The member ID and record scope must
never come from chat text or client-supplied identity fields.

14. **Current loan count**
    - Given a signed-in member with `N` active loans, when they ask how many
      loans they currently have, then Libby reports `N` as the active-loan
      count. A valid count of zero must be reported as zero.
    - Given the loan lookup fails or the count is unavailable, then Libby says
      it cannot confirm the count and directs the member to **My Loans**; it
      must not report zero as a fallback.

15. **Remaining borrowing capacity**
    - Given a signed-in member with `N` active loans, when they ask how many
      more books they can borrow, then Libby reports
      `max(0, 10 - N)` remaining slots, using the server-provided capacity.
    - For zero active loans, report 10 slots; below the limit, report the
      remaining slots; at or above the limit, report zero slots and explain
      that the member has reached the limit.
    - Given capacity data is unavailable, Libby says it cannot confirm the
      number and directs the member to **Borrow**; it must not calculate from
      incomplete data.

16. **Outstanding fines**
    - Given a signed-in member, when they ask what outstanding fines they have,
      then Libby directs them to **My Fines** (`/member/profile/fines`) to view
      current details. Libby must not invent or infer a fine amount.

17. **Cross-member isolation**
    - Given two members have different loan data, when one member asks about
      their current loans or borrowing capacity, then the answer is based only
      on the authenticated member's records, regardless of IDs or names
      mentioned in the question.

### Out-of-scope and unavailable behavior

18. **Unrelated request**
    - Given a signed-in member asks for code generation, unrelated research, or
      another task outside LibConnect, then Libby politely states its scope and
      offers help with LibConnect.

19. **Provider unavailable or misconfigured**
    - Given SoCLaaS is unavailable or its configuration is invalid, when a
      member sends a chat request, then the assistant feature returns a clear,
      safe unavailable message. The rest of the API remains available; the
      response does not expose credentials, provider bodies, prompts, or stack
      traces.

20. **Untrusted content attempts to change behavior**
    - Given a member prompt or retrieved book text asks Libby to ignore its
      rules, expose secrets, access another member's data, or perform an
      action, then Libby maintains its scope and read-only behavior and does not
      reveal protected information.

## Implementation requirements

- The React client sends chat requests to an authenticated Express endpoint;
  it never calls SoCLaaS directly.
- The server resolves the active member from the session, validates the
  request, applies limits, and assembles either approved help content or the
  minimum member-specific facts needed for the question.
- Personalized loan facts are read only for the authenticated member. Use the
  existing borrowing-capacity semantics: count loans with status `ACTIVE` and
  calculate `remainingSlots` as `max(0, 10 - activeLoanCount)`.
- All model requests pass through the server-side SoC adapter configured with
  `SOCLAAS_BASE_URL`, `SOCLAAS_API_KEY`, and `SOCLAAS_MODEL`. The configured
  model is server-selected; clients cannot choose a model.
- Model output is untrusted and must not select member identities, authorize
  data access, or trigger state changes. The assistant feature has no
  state-changing tools.
- If the AI feature is unavailable, disable the AI feature only; do not fail
  the whole API server.
- Initial request controls: question length up to 2,000 characters, at most 10
  prior conversation turns, 15-second provider timeout, one bounded retry, at
  most 5 requests per member per minute, and a global limit of 60 requests per
  minute. Keep the global limit below the provider's 90 requests per minute
  cap.
- Do not log API keys, authorization headers, passwords, session identifiers,
  raw prompts/responses, or unnecessary member data.

## Verification requirements

- Verify the acceptance scenarios with a fake SoC client; tests must not need
  real provider credentials.
- Add authenticated API tests showing that loan and capacity answers use the
  session member's records and cannot be redirected to another member by
  request fields or prompt content.
- Cover zero, below-limit, at-limit, and above-limit loan counts; missing or
  failed lookups; out-of-scope requests; provider failure; request validation;
  and rate-limit behavior.
- Include direct and indirect prompt-injection cases using benign test content.
- This specification revision does not add or run tests and does not change
  application code.
