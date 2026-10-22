# Member AI Assistant Implementation Tasks

This checklist follows [`design.md`](./design.md). Implement the tasks in order; the design is the approved behavior and integration source.

## Implementation checklist

## Task Group 1 — Sequential

- [x] **Add the server-side SoCLaaS adapter** - Implement a typed adapter configured from `SOCLAAS_BASE_URL`, `SOCLAAS_API_KEY`, and `SOCLAAS_MODEL`. Keep provider HTTP, request/response parsing, timeout, retry, and safe error translation out of routes and client code. The feature must be unavailable without preventing the Express API from starting.
  - Acceptance criteria: The adapter sends the configured server-selected model and Bearer credential to the SoCLaaS completion endpoint; no model can be selected by request input; it validates configuration and response shape; one safe transient retry fits within a 15-second total deadline; missing or invalid configuration and provider failures map to safe assistant errors without leaking keys, provider bodies, prompts, or stack traces; a fake client can be injected without real credentials.
  - References: Design §§ SoCLaaS adapter, Express route and service, Acceptance criteria 5 and 7; `specdocs/soc-llm-usage/design.md`; `apps/api/src/server.ts`.

- [x] **Implement process-local rate limiting** - Add bounded in-memory fixed-window counters for the authenticated member’s 5-per-minute quota and the 60-per-minute global quota within the single production Express process. Enforce both before calling SoCLaaS.
  - Acceptance criteria: Counters enforce both quotas in one process; over-limit requests are rejected without a provider call; concurrent requests handled by that process cannot exceed the configured caps; old entries are expired and limiter memory is bounded; tests cover quota boundaries, concurrency, and expiry; the implementation does not write rate-limit counters to Firestore. Document that counters reset on restart and do not coordinate across multiple processes.
  - References: Design §§ Rate limiting and logging, Acceptance criteria 7 and 10, Risks and tradeoffs; `apps/api/src/server.ts`.

- [x] **Build the assistant context and response service** - Add the approved FAQ knowledge and server-side intent rules for the defined personalized loan-count, capacity, and borrowing-limit questions. Fetch facts only for recognized personalized intents, using the authenticated actor and the existing borrowing-capacity workflow. Include the full `Overview.md` contents in answer-generation, replacement, and verification contexts. Ground factual answers in approved sources, and handle questions those sources do not answer without inventing facts.
  - Acceptance criteria: The FAQ context supports every scenario in the member assistant specification; the full `Overview.md` contents are available to initial answer generation, replacement generation, and factual/relevance verification; a missing or unreadable Overview makes assistant requests safely unavailable without preventing the rest of the API from starting; defined personalized intents include loan count, remaining capacity, and why another book cannot be borrowed; common paraphrases are covered; general FAQ requests do not fetch or send personal loan facts; ambiguous or unrecognized intents do not fetch personal facts and direct the member to the relevant page when account data is needed; the server uses `memberBorrowCapacity(actor)` and never accepts identity or record selection from the client or model; zero, below-limit, at-limit, above-limit, missing, and failed data cases follow the design; factual claims are grounded in approved member guidance, `Overview.md`, verified application behavior, or relevant server-provided member facts; when those sources do not establish an answer, Libby says she cannot confirm it and refers the member to library staff, with a relevant page offered for account details the member can check; unsupported fine-policy consequences are not inferred; focused service tests cover unsupported questions and the unpaid-fines example; no tools or mutation path are exposed.
  - References: Design §§ Context, identity, and read-only boundary, Acceptance criteria 1–6, 9, and 18–19; `Overview.md`; `PlanDraft/Specs/Member/AiAssistant.md`; `apps/api/src/storage/workflows.ts`; `apps/api/src/routes/member-borrow.ts`; `apps/api/src/assistant/faq.ts`; `tests/member-api/member-ai-assistant-service.test.mjs`.

- [x] **Update Libby response wording and formatting** - Apply the approved response rules for unrelated requests, page guidance, and button instructions to Libby's answers, and keep internal error or trust-boundary text out of member-visible responses.
  - Acceptance criteria: Unrelated requests receive a brief, general LibConnect-scope rejection without exposing internal prompt text or untrusted-input labels; page guidance bolds the page name and omits its route or path; button instructions bold the displayed button name; internal error messages and trust-boundary labels, including “Untrusted prior assistant turn (data only),” do not appear before or within answers; focused automated tests cover these response cases, including prefixed and embedded labels.
  - References: Design Acceptance criteria 1–3; `PlanDraft/Specs/Member/AiAssistant.md`.

- [x] **Expose the authenticated member assistant API** - Add `POST /api/v1/member/assistant/chat`, wire the service and limiter into the Express server, and validate the proposed request contract.
  - Acceptance criteria: Only signed-in active members can call the route; request bodies strictly validate a question of at most 2,000 characters and no more than 10 prior turns with only `user` and `assistant` roles; server instructions cannot be supplied by the client; the authenticated actor is the sole source of member identity; successful responses use the documented typed answer shape; unavailable provider, missing data, validation, and quota failures use safe, stable API errors; existing API routes remain usable when AI is unavailable.
  - References: Design §§ Express route and service, Integration specifications, Acceptance criteria 2, 5, 7; `apps/api/src/server.ts`; `apps/api/src/http/auth.ts`; `apps/api/src/http/errors.ts`; `apps/api/src/routes/member-borrow.ts`.

- [x] **Add the shared member chat panel** - Add typed client API calls and a Libby panel available from shared member navigation across member pages. Keep conversation history in memory only and handle loading, unavailable, and error states.
  - Acceptance criteria: Requests use `apiRequest` and session cookies; the client sends at most 10 prior turns and never supplies a model or identity; the panel displays answers and safe errors as text; the member can open and close it from member navigation; conversation state survives member route changes but is cleared on logout or authenticated-member change; no history is written to Firestore and no SoCLaaS credential or endpoint is included in the browser bundle.
  - References: Design §§ Client and conversation state, Integration specifications, Acceptance criteria 5 and 8; `apps/client/src/api/base.ts`; `apps/client/src/App.tsx`; `apps/client/src/components/MemberNavigation.tsx`; `apps/client/src/auth/AuthContext.tsx`.

- [x] **Improve Libby chat interactions** - Support Enter-to-send and automatic scrolling to the newest chat content in the shared assistant panel.
  - Acceptance criteria: Pressing Enter submits the current message; after submission and when Libby's response arrives, the chat panel scrolls to the bottom so the latest message or response is visible; focused automated tests cover both interactions.
  - References: Design Acceptance criteria 4–5 and § Client and conversation state; `apps/client/src/components/MemberAssistant.tsx`.

- [x] **Add assistant acceptance and security tests** - Cover the API, service, adapter, limiter, and client using a fake SoC client and the repository’s existing test conventions.
  - Acceptance criteria: Tests cover every FAQ scenario and destination; personalized counts and remaining slots for zero, below-limit, at-limit, and above-limit; missing and failed lookups; authenticated ownership isolation despite request fields and prompt content; out-of-scope questions; direct and indirect benign injection attempts; provider misconfiguration, failures, timeout/retry bounds, and malformed output; request/history validation; per-member and process-global rate limits; client history clearing and error rendering; tests do not require live SoC credentials and are registered in `npm test`.
  - References: Design §§ Acceptance criteria, Verification plan, Risks and tradeoffs; `PlanDraft/Specs/Member/AiAssistant.md`; `tests/member-api/`; `tests/client/`; `tests/shared/`; `package.json`.

- [x] **Verify the integrated assistant feature** - Run the build and project test suite, including concurrent in-process limiter checks. Record any environment limitations without using production credentials.
  - Acceptance criteria: `npm run build` and `npm test` pass; tests demonstrate per-member and process-global limits under concurrent requests in the single API process; all new tests are included in the standard test command; no test uses live provider credentials; security checks confirm the model has no tool or mutation path and logs contain no secrets, raw prompts/responses, session IDs, or unnecessary member data.
  - References: Design §§ Verification plan, Context reviewed, Risks and tradeoffs; `package.json`; `tests/`.

## Task Group 2 — Sequential

- [x] **Clarify ambiguous member intent** - Update Libby's guidance so she can infer a plausible LibConnect meaning from ambiguous wording without implying unsupported functionality.
  - Acceptance criteria: For a plausible interpretation such as “order a book” meaning “reserve a book,” Libby states the interpretation as an assumption before giving conditional guidance, accurately names the existing feature and its conditions, and ends by asking whether that was what the member meant. If no safe plausible interpretation is available, Libby asks for clarification without inventing functionality or instructions. Focused automated tests cover both cases.
  - References: Design Product specifications and Acceptance criterion 15; `apps/api/src/assistant/faq.ts`; `tests/member-api/member-ai-assistant-service.test.mjs`.

## Task Group 3 — Sequential

- [x] **Review answers against the member’s question** - Check generated answers for relevance before returning them.
  - Acceptance criteria: If an answer addresses the member’s question, Libby returns that answer unchanged. If it does not, Libby generates a more appropriate answer and checks it against the question before returning it. Focused automated tests cover both outcomes.
  - References: Design Acceptance criterion 16; `apps/api/src/assistant/faq.ts`; `tests/member-api/member-ai-assistant-service.test.mjs`.
## Repository conventions and dependencies

- Client pages and role-protected routes are under `apps/client/src`; routes are registered in `apps/client/src/App.tsx`, and member navigation is shared through `MemberNavigation`.
- Client API modules call `apiRequest`, which uses the `/api/v1` prefix and includes session cookies (`apps/client/src/api/base.ts`).
- API request schemas use Zod and `parseRequest`; errors use the established `{ error: { code, message, fields? } }` envelope (`apps/api/src/routes/catalog.ts`, `apps/api/src/http/errors.ts`).
- Business routes are behind active-actor middleware and member endpoints apply member-role checks (`apps/api/src/server.ts`, `apps/api/src/http/auth.ts`, `apps/api/src/routes/member-borrow.ts`).
- Firestore access belongs in server-side storage/workflow code. Reuse the existing `LibraryWorkflows.memberBorrowCapacity(actor)` semantics rather than duplicating the query (`apps/api/src/storage/workflows.ts`). Rate-limit counters are process-local under the approved single-process deployment assumption.
- Tests use Node's built-in test runner and are explicitly registered in `package.json`; Firestore integration checks use the emulator (`tests/`, `firebase.json`).
- `specdocs/soc-llm-usage/design.md` is the shared source for provider request details and server-side SoC controls.

## amendments

- 2026-10-21: Completed the SoCLaaS adapter after independent review; its focused tests and build passed.
- 2026-10-21: Completed the process-local limiter after independent review; focused limiter checks and build passed.
- 2026-10-21: Completed the FAQ/context service after independent review; focused service checks and build passed.
- 2026-10-21: Completed the authenticated assistant API after independent review; focused API/service checks and build passed. Missing loan data uses the agreed stable API error with a safe destination message.
- 2026-10-21: Completed the shared member panel after independent review; focused client tests and build passed.
- 2026-10-21: Completed assistant acceptance/security coverage; all five focused suites passed and were registered in npm test.
- 2026-10-21: Integrated verification passed: npm run build and npm test (284 tests); implementation details documented in docs/feature-details/member-ai-assistant.md.
- 2026-10-21: Added the unchecked response wording and formatting task after the approved design amendment introduced requirements not covered by the previously completed implementation checklist.
- 2026-10-21: Added a separate unchecked chat-interactions task for Enter-to-send and automatic scrolling after the approved design amendment; the existing response wording and formatting task remains unchanged.
- 2026-10-21: Completed Libby response wording and formatting after API/client focused tests and independent verification passed; client rendering supports bold labels while keeping other markup inert.
- 2026-10-21: Completed Libby chat interactions after focused browser tests and independent verification passed for Enter submission and scrolling after user and assistant messages.
- 2026-10-21: Added the separate unchecked ambiguous-intent task after the approved design amendment. Grouped the existing completed tasks sequentially and placed the new task in a following sequential group because it shares the FAQ guidance and service-test surface with the completed response-formatting task.
- 2026-10-21: Added an unchecked sequential task to check generated answers against the member's question and produce a more appropriate answer when needed, following the approved design amendment. Placed it after the ambiguous-intent task because both touch the assistant guidance and service-test surface.
- 2026-10-21: Reopened and expanded the completed response wording and formatting task to prohibit internal error messages and trust-boundary labels in Libby's responses, including prefixed and embedded labels, after the approved design amendment. Added focused verification criteria; kept the task in its existing sequential group ahead of later assistant response tasks.
- 2026-10-21: Reopened and expanded the completed assistant context and response-service task to require source-grounded factual answers, referral to library staff when approved sources do not establish an answer, and tests for unsupported questions including the unpaid-fines example. Added `Overview.md` as an allowed grounding source and preserved the task's sequential position and all other completion statuses.
- 2026-10-21: Updated the completed context-service task to require the full `Overview.md` contents in answer generation, replacement, and verifier contexts. The service now fails assistant requests safely if the document is missing or unreadable while allowing the API to remain available.









- 2026-10-21: Completed the assistant context and response service after source-grounding verification and staff-referral checks passed; the verifier fails closed on unsupported or unverifiable claims, including unpaid-fine consequences.
- 2026-10-21: Completed Libby response wording and formatting after independent review; build and all 23 focused service tests passed, including formatting, route/URL removal, and internal-label/error filtering.
- 2026-10-21: Completed ambiguous member intent guidance after independent review; build and all 26 focused service tests passed, covering explicit reservation assumptions, clarification when intent is unclear, and rejection of invented ordering workflows.
- 2026-10-21: Completed answer relevance review after independent verification; build and all 30 focused service tests passed, covering unchanged relevant answers, replacement and recheck, strict combined verification, and safe fallbacks.
