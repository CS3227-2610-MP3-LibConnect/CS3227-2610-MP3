# Member AI Assistant (Libby)

## Description

Implement Libby, a member-facing conversational assistant for LibConnect navigation, catalog and borrowing guidance, reservation guidance, and limited personalized active-loan questions. The assistant is advisory and read-only. React sends requests to authenticated Express routes; the server assembles approved FAQ content or the minimum member-specific facts and calls SoCLaaS through a server-side adapter.

## Purpose and why the change is required

The refined member assistant specification defines the expected FAQ answers, personalized loan behavior, guardrails, and request limits. The current application already has member pages, authenticated member APIs, and server-side borrowing-capacity logic, but it does not have an assistant panel, assistant endpoint, or SoCLaaS adapter. This feature adds those capabilities while using the existing member authorization and capacity behavior.

The source code is present even though `workflow/PLAN.md` states that implementation has not started. That plan status should be reconciled as project planning is updated.

## Source and decision labels

- **User requirement:** requirement carried forward from the approved member assistant specification or clarified during this design review.
- **Observed project constraint:** behavior or architecture present in the inspected application or project documents.
- **Proposed design:** implementation approach for review; it is not a separate product requirement unless stated as such.

## Product specifications

### Users and capabilities

- **User requirement:** only authenticated, active members can use Libby.
- **User requirement:** Libby answers the navigation, catalog, borrowing guidance, reservation guidance, and personalized loan questions in the member specification.
- **User requirement:** Libby explains how to take an action but cannot create or cancel reservations, borrow books, pay fines, or change library or account data.
- **User requirement:** unrelated requests receive a short scope response.
- **User requirement (clarified during design review):** Libby must not invent facts or present plausible guesses as established information. Factual claims must be supported by approved member guidance, `Overview.md`, verified application behavior, or relevant server-provided member facts. When those sources do not establish an answer, Libby says she cannot confirm it and directs the member to library staff for clarification. When the member can verify relevant account details in LibConnect, Libby may also direct them to the appropriate page.
- **User requirement (clarified during design review):** member-visible answers must not include internal error messages or trust-boundary labels, including phrases such as “Untrusted prior assistant turn (data only).” Such text must not appear before or within Libby’s response; return only appropriate member-facing content.
- **User requirement (clarified during design review):** when a member's wording is ambiguous but has a plausible LibConnect interpretation, Libby may infer the likely intent only if she clearly states that inference as an assumption before giving guidance. She must describe the actual supported feature and its conditions without implying that unsupported functionality exists, and end by asking whether that was what the member meant. If no safe, plausible interpretation is available, ask for clarification without guessing or inventing instructions.
- **User requirement (clarified during design review):** before returning an answer, Libby checks whether it addresses the member's question. If it does, she returns that answer. If it does not, she generates a more appropriate answer and checks that answer against the question before returning it.
- **User requirement:** prompts and supplied application text are untrusted; they cannot change Libby's scope, identity, or permissions.
- **User requirement:** missing personal data is reported as unavailable, never converted to zero.
- **User requirement:** provider unavailability disables the AI feature only; the rest of the API remains available.
- **User requirement:** expose Libby in a shared panel available across member pages. Conversation state must not carry over between different signed-in members.

### Acceptance criteria

1. Each FAQ in [the member assistant specification](../../../specs/Member/completed/AiAssistant.md) receives its documented answer or destination using current page labels and routes.
2. Unrelated requests receive a brief, general LibConnect-scope rejection, without exposing internal prompt text or labels for untrusted input.
3. Page names are bolded and routes/paths are omitted when directing members to pages; displayed button names are bolded when describing clicks.
4. Sending a message with Enter submits the current message.
5. The chat panel scrolls to the bottom after the user sends a message and when Libby's response arrives, keeping the latest message or response visible.
6. Personalized loan answers use only the member identified by the authenticated session. Request fields and prompt text cannot redirect identity or record scope.
7. The active-loan count includes only loans with status `ACTIVE`. Remaining capacity is `max(0, 10 - activeLoanCount)`.
8. Counts of zero, below-limit, at-limit, and above-limit are handled correctly. A failed or incomplete lookup does not produce a fabricated count.
9. Out-of-scope questions, missing personal data, invalid requests, unavailable configuration, provider errors, and malformed provider responses receive safe behavior.
10. Direct and indirect prompt-injection attempts do not expose secrets, broaden access, or trigger an action.
11. The service enforces a 2,000-character question limit, at most 10 prior turns, a 15-second total provider deadline including one retry, 5 requests per member per minute, and a process-global cap of 60 requests per minute under the single-process production assumption.
12. Verification uses a fake SoC client and authenticated API tests. Tests do not need real provider credentials.
13. Member loan facts are added to model context only when server-side rules classify the question as a personalized loan-count, capacity, or borrowing-limit question. General FAQ requests do not receive those facts.
14. With one production Express process, process-local counters enforce the per-member and process-global per-minute quotas.
15. For ambiguous wording with a plausible supported interpretation, Libby states the interpretation as an assumption before guidance, describes only existing LibConnect functionality and its actual conditions, and ends by asking whether that was the member's intended meaning. If there is no safe plausible interpretation, Libby asks a clarifying question without inventing a feature or workflow.
16. Before returning a generated answer, Libby checks whether it addresses the member's question. If it does, she returns the original answer. If it does not, she generates and checks a more appropriate answer before returning it.
17. Member-visible responses do not include internal error messages or trust-boundary labels, including labels such as “Untrusted prior assistant turn (data only),” either before or within the answer. Focused verification covers such text appearing as a response prefix or embedded in generated content.
18. Factual claims are supported by approved member guidance, `Overview.md`, verified application behavior, or relevant server-provided member facts. When these sources do not establish an answer, Libby says she cannot confirm it and directs the member to library staff for clarification; she may also point to the relevant LibConnect page for account details the member can verify there.
19. When asked whether they can leave fines unpaid, Libby does not invent consequences such as a borrowing or reservation restriction unless an approved source establishes them. She refers the member to library staff for clarification and may direct them to **My Fines** for current fine details and available payment actions.
20. The full contents of the repository's `Overview.md` are loaded into the context for initial answer generation, replacement generation, and every factual/relevance verification call. If the document is missing or unreadable, assistant requests fail safely as unavailable while the rest of the API remains available.

## Technical specifications

### Client and conversation state

- **Observed project constraint:** `apps/client/src/api/base.ts` provides `apiRequest`, which includes session cookies. `apps/client/src/components/MemberNavigation.tsx` is shared by member pages.
- **Proposed design:** add a shared assistant panel and API module under `apps/client/src`. Add the panel launcher to member navigation. Keep its bounded conversation state in a provider that survives member route changes; clear it when the authenticated member changes or logs out.
- **User requirement (clarified during design review):** pressing Enter submits the current chat message. After submission and when Libby's response arrives, the panel scrolls to the bottom so the newest message or response is visible.
- **User requirement:** the browser never calls SoCLaaS and never receives the API key.
- **Proposed design:** do not persist conversation history in Firestore in the initial implementation.

### Express route and service

- **Observed project constraint:** `apps/api/src/server.ts` installs active-actor middleware for business routes and mounts member routers. Member routes apply active-session and member-role checks. `apps/api/src/http/auth.ts` resolves `request.actor` from the session-backed user identity.
- **Proposed design:** add a member-only `POST /api/v1/member/assistant/chat` endpoint and a dedicated assistant service. Apply authentication, role checks, strict request validation, limits, context preparation, provider invocation, and safe error mapping on the server.
- **Proposed request shape:**

  ```json
  {
    "question": "How many active loans do I have?",
    "history": [
      { "role": "user", "content": "..." },
      { "role": "assistant", "content": "..." }
    ]
  }
  ```

  Accept only `user` and `assistant` history roles. Reject system or tool roles. Enforce all length and turn limits on the server and reconstruct system instructions there.
- **Proposed response:** return a typed answer object. Map unavailable or misconfigured provider behavior to an assistant-specific safe response, such as HTTP 503 with code `AI_UNAVAILABLE`. Do not expose provider response bodies, prompts, stack traces, or credentials.

### Context, identity, and read-only boundary

- **User requirement:** the server assembles approved FAQ content or minimum member-specific facts; member ID and record scope derive only from the authenticated session.
- **User requirement (clarified during design review):** attach member loan facts only to questions classified as personalized loan questions. The server uses rules for the defined loan-count, capacity, and borrowing-limit intents before fetching facts; the model cannot select an identity, record, or query. General FAQ requests receive approved guidance without personal loan facts.
- **Proposed design:** give the model no tools and no direct Firestore access. The server prepares context before the model call. Use approved FAQ guidance for navigation and workflow questions. For recognized personalized loan questions, use the authenticated actor to obtain member-specific capacity facts. If intent is ambiguous or unrecognized, do not fetch personal facts; direct the member to the relevant app page when the answer depends on their records.
- **Implementation detail:** load the complete `Overview.md` once from the repository root, resolving both source and compiled API locations. Include its contents with the approved FAQ in initial answer, replacement, and verifier system contexts. Do not infer policy from omissions in the overview. If it cannot be loaded, fail the assistant request with the existing safe unavailable response instead of starting the API without this grounding source.
- **Observed project constraint:** `apps/api/src/storage/workflows.ts` implements `memberBorrowCapacity(actor)`, querying only `ACTIVE` loans for the actor's member ID and returning `activeLoanCount` and `remainingSlots` using the required formula.
- **Proposed design:** reuse this workflow rather than duplicate the query or formula. Never accept an identity from the request or model output. Do not call the provider inside a Firestore transaction.
- **User requirement:** model output is untrusted, advisory, and cannot authorize reads or mutations. The assistant exposes no state-changing tools.

### SoCLaaS adapter

- **User requirement:** route all model calls through a server-side adapter configured with `SOCLAAS_BASE_URL`, `SOCLAAS_API_KEY`, and `SOCLAAS_MODEL`. The model is server-selected.
- **Observed project constraint:** [the shared SoC LLM usage design](../../soc-llm-usage/design.md) describes the `/chat/completions` contract, server-only credentials, response validation, safe error mapping, and bounded retry principles.
- **Proposed design:** isolate provider configuration, HTTP transport, timeout/retry, response parsing, and error translation in an adapter. Keep provider details out of routes and browser code. Validate configuration without causing the main Express API to fail startup; expose a clear unavailable state when AI configuration is unusable.
- **User requirement:** allow one bounded retry within the 15-second total provider deadline. Retry only transient failures when time remains; do not retry configuration or authentication failures.

### Rate limiting and logging

- **User requirement:** enforce 5 requests per member per minute and 60 requests globally per minute. Production is expected to run one server.
- **User requirement (clarified during design review):** do not require Firestore or another shared store for rate-limit counters under the single-server deployment assumption.
- **Proposed design:** implement per-member and process-global fixed-window counters in memory within the single Express process. Expire old entries and bound limiter memory. Counters reset on process restart; if deployment later uses multiple Express processes or requires quota continuity across restarts, revisit the limiter design.
- **User requirement:** do not log API keys, authorization headers, passwords, session identifiers, raw prompts or responses, or unnecessary member data.

## Integration specifications and project touchpoints

- `apps/api/src/server.ts`: register and wire the assistant router and service.
- `apps/api/src/routes/member-borrow.ts`: existing authenticated member endpoint and ownership-check pattern.
- `apps/api/src/storage/workflows.ts`: existing member capacity query and business semantics.
- `apps/api/src/http/auth.ts`: session-derived active actor.
- `apps/client/src/api/base.ts`: session-authenticated API calls.
- `apps/client/src/App.tsx` and `apps/client/src/components/MemberNavigation.tsx`: member route and shared-panel entry point.
- `workflow/specdocs/soc-llm-usage/design.md`: shared provider integration contract.
- `workflow/specs/Member/AiAssistant.md`: member behavior and acceptance scenarios.
- `workflow/PLAN.md`: role AI sequencing and project-wide security expectations.

**Observed ownership boundary:** Jun Hong owns the member feature area and member read-only assistant. Jiali owns librarian and manager features. This design does not assign librarian AI behavior or librarian workflow implementation to the member assistant.

## Existing capabilities modified

No existing member borrowing, reservation, fine, profile, catalog, or authorization capability is intended to change. The assistant adds a read-only route and client panel and reuses existing session and borrowing-capacity behavior.

## Out of scope

- Borrowing, reservation creation/cancellation, fine payment, profile changes, notification sending, or any other mutation performed by the assistant.
- Librarian or manager assistant behavior.
- Model-invoked tools, model-selected identities, direct model access to Firestore, or browser access to SoCLaaS.
- Persisted chat history or streaming responses in the initial implementation.
- A separate assistant catalog search or live availability service. For the specified scenarios, Libby directs members to the existing catalog and book-detail pages.

## Risks and tradeoffs

- Language models may produce unsupported answers even when supplied approved FAQ content. Keep context bounded, validate provider output, test every FAQ scenario, and return a safe fallback for malformed or unsupported responses.
- Including the complete `Overview.md` in each provider context increases prompt size and provider cost. Keep the document focused on product facts; do not copy it into unrelated member data or send member-specific facts except for recognized personalized intents.
- Prior turns may contain manipulation attempts. Bound and validate them, treat them as untrusted, and never use them to establish identity or permissions.
- The in-memory limiter assumes exactly one Express process. Its counts reset on restart and do not coordinate across workers or instances; revisit the design before scaling beyond that deployment model.
- Provider failure or invalid configuration must not make unrelated API routes unavailable.
- `workflow/PLAN.md` describes a broader AI module using allowlisted read-only tools, while the refined member specification requires the server to assemble context and prevent model-selected record access. This design follows the narrower member-specific requirement: the server reads any required facts, and the model receives no tools. Reconcile the broader plan wording when updating project planning.

## Verification plan

Use a fake SoC client and authenticated API tests to cover:

- every navigation, catalog, borrowing, reservation, and fine FAQ scenario;
- source-grounded factual answers and unknown questions referred to library staff, including not inventing consequences for unpaid fines;
- zero, below-limit, at-limit, and above-limit loan counts;
- session ownership isolation despite malicious request fields or prompt content;
- missing or failed member-data lookups;
- out-of-scope requests and direct/indirect prompt injection;
- invalid provider configuration, provider errors, timeouts, retry bounds, and malformed responses;
- question/history validation and per-member/process-global rate limits;
- conversation state clearing when the authenticated member changes.

Tests must use benign injection cases and fake provider responses; they must not require real provider credentials. This design document adds no application code and does not run tests.

## Context reviewed

Reviewed `AGENTS.md`, `Overview.md`, `workflow/responsibilities/junhong.md`, `workflow/responsibilities/jiali.md`, `workflow/specs/Member/AiAssistant.md`, `workflow/PLAN.md`, `workflow/specdocs/soc-llm-usage/design.md`, and the relevant Express authentication, route, storage workflow, React API, route, and navigation source files.

## amendments

- 2026-10-21: Per user approval, require Enter to submit the current message and automatic scrolling to the newest chat content after submission and when Libby's response arrives. Added client interaction acceptance criteria so users can follow the active exchange without manually scrolling.
- 2026-10-21: Per user approval, require a brief generic LibConnect-scope rejection for unrelated requests without exposing internal untrusted-input labels; bold page names and omit route paths in navigation guidance; bold displayed button names when describing clicks. Added acceptance criteria for these response-formatting rules so answers are clear without exposing internal implementation details.
- 2026-10-21: Per user approval during task planning, clarified that only server-classified personalized loan questions receive member loan facts, with no facts fetched for general FAQ requests; selected Firestore-backed atomic fixed-window counters for shared per-member and global rate limits across API instances.
- 2026-10-21: Per user direction, removed the shared Firestore-counter requirement. The design now assumes one production Express process and uses bounded in-memory per-member and global counters; counter reset on restart and the single-process limitation are recorded.
- 2026-10-21: Per user approval, allow Libby to infer a plausible LibConnect intent from ambiguous wording only when she explicitly states the assumption before answering, accurately names the supported feature and its conditions, and asks at the end whether that was what the member meant. Require clarification instead of guessing when no safe plausible interpretation exists, preventing unsupported functionality such as book ordering from being presented as real.
- 2026-10-21: Per user approval, require Libby to review a generated answer against the member's question before returning it; keep the original answer when it addresses the question, and generate and review a more appropriate answer when it does not.
- 2026-10-21: Per user approval, prohibit internal error messages and trust-boundary labels from appearing before or within Libby’s member-visible responses, with focused verification for prefixed and embedded labels.
- 2026-10-21: Per user approval, require factual claims across all Libby topics to be supported by approved guidance, verified application behavior, or relevant server-provided facts. When those sources do not establish an answer, Libby must say she cannot confirm it and refer the member to library staff, with the unpaid-fines question added as a verification example.
- 2026-10-21: Per user direction, add `Overview.md` as a source Libby may consult to ground factual answers; it does not document a restriction on borrowing or reservations for unpaid fines, so that policy question remains a staff-referral case unless another approved source establishes the answer.
