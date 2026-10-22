# Member AI Assistant (Libby)

Libby is a read-only assistant available to signed-in members from the shared member navigation. It answers LibConnect navigation and workflow questions and a small set of personalized active-loan questions. It cannot borrow or reserve books, cancel reservations, pay fines, or modify library/account records.

## Request flow

```mermaid
sequenceDiagram
    actor Member
    participant Client as React panel
    participant API as Express member route
    participant Service as Assistant service
    participant Workflow as LibraryWorkflows
    participant SoC as SoCLaaS adapter

    Member->>Client: Ask a question
    Client->>API: POST /api/v1/member/assistant/chat (session cookie)
    API->>API: Validate body, active member, rate quotas
    API->>Service: question, bounded history, session actor
    opt Server classifies a personalized loan question
        Service->>Workflow: memberBorrowCapacity(actor)
        Workflow-->>Service: openLoanCount, remainingSlots
    end
    Service->>SoC: answer prompt + approved FAQ + full Overview.md + optional loan facts
    SoC-->>Service: draft answer
    Service->>Service: remove internal markers, routes, and URLs; format known UI labels
    Service->>SoC: verify factual support and question relevance
    alt Relevant and supported
        SoC-->>Service: { supported: true, relevant: true }
        Service-->>API: sanitized answer unchanged
    else Irrelevant draft
        SoC-->>Service: relevant: false
        Service->>SoC: generate a replacement from trusted context and the same question
        SoC-->>Service: replacement draft
        Service->>SoC: verify replacement support and relevance
        alt Replacement is relevant and supported
            Service-->>API: sanitized replacement
        else Unsupported, irrelevant, or verifier failure
            Service-->>API: fixed staff-referral fallback
        end
    else Unsupported, malformed, or verifier failure
        Service-->>API: fixed staff-referral fallback
    end
    API-->>Client: { answer }
    Client-->>Member: Render supported bold labels and inert text
```

The route is implemented by `createMemberAssistantRouter` in `apps/api/src/routes/member-assistant.ts` and mounted at `/api/v1/member` in `apps/api/src/server.ts`. It applies the existing session-backed `requireActiveActor` middleware and then requires an active `MEMBER` actor with a member ID. The member identity is always `request.actor`; the body schema is strict and does not accept an identity, role, prompt instruction, or model field.

The client uses `assistantApi.chat` in `apps/client/src/api/assistant.ts`, which calls `apiRequest` and therefore sends the session cookie. The `MemberAssistantProvider` in `apps/client/src/components/MemberAssistant.tsx` lives above the application routes so chat state survives page navigation. `MemberNavigation` supplies the launcher across member pages. The provider holds at most 20 messages in memory, sends at most 10 prior turns, and clears the conversation when the authenticated member changes or logs out. It does not persist history. `AssistantChatPanel` submits when Enter is pressed; Shift+Enter inserts a newline, and IME composition is left undisturbed. A message-list effect scrolls the panel to the bottom whenever messages change, including the user's submission and Libby's response. Assistant answers render only `**bold**` spans as `<strong>`; all remaining content stays escaped React text, so arbitrary HTML is inert.

## Server behavior

`apps/api/src/assistant/faq.ts` contains approved workflow guidance and conservative server-side rules that classify loan-count, remaining-capacity, and borrowing-block questions. The service loads the complete root `Overview.md` once and includes it with this guidance in the initial answer, replacement, and verifier contexts, alongside trusted member facts when the question matches a recognized personalized intent. The same document is supplied to factual and relevance checks, so Overview-only facts can be checked before an answer is returned. Factual claims must come from those provided sources or verified application behavior; explicit Overview facts can establish product scope and data-model details, but policies must not be inferred from omissions. When the file is missing or unreadable, assistant requests return the safe unavailable error while the rest of the API remains available. When the sources do not establish an answer, the assistant must say it cannot confirm the fact and refer the member to library staff; unpaid-fine borrowing or reservation consequences are not inferred. A plausible interpretation of ambiguous wording must be stated as an assumption before conditional guidance, and the answer must end by asking whether that interpretation was intended. For example, “order a book” may be interpreted as a reservation only when the member's wording makes that a plausible assumption; the answer must clarify LibConnect has reservations, not an ordering feature, and that reservations are for titles with no available copies.

Only recognized personalized intents call `LibraryWorkflows.memberBorrowCapacity(actor)` from `apps/api/src/storage/workflows.ts`. That workflow counts the actor's `ACTIVE` and `PENDING_CLOSE` loans and returns `max(0, 10 - openLoanCount)` remaining slots. Other FAQ and ambiguous questions do not load or send member loan facts.

Before output, the service replaces any answer containing known internal trust/error markers with the generic LibConnect-scope rejection. It removes route paths and URLs and bolds known page and button labels. The service then uses a second SoCLaaS completion to check a strict JSON verdict containing exactly boolean `supported` and `relevant` fields. The review receives the current question, candidate answer, approved context, and only the relevant member facts; it does not receive prior conversation history. A supported, relevant answer is returned after sanitization. An irrelevant answer is regenerated using the same trusted context and question, then checked again; only a supported and relevant replacement is returned. Unsupported answers, malformed verdicts, provider errors, and failed replacement checks produce a fixed cannot-confirm/library-staff fallback. The model-based verifier is a guardrail, not a formal proof of truth.

`apps/api/src/assistant/service.ts` bounds the question and history, labels message/history content as untrusted, builds the server-owned model context, and rejects empty or oversized model answers. If a required loan lookup fails or returns inconsistent facts, it throws a typed data-unavailable error; the API maps this to HTTP 503 `AI_MEMBER_DATA_UNAVAILABLE` with a safe My Loans or Borrow destination. Provider/configuration and malformed-answer failures map to a generic HTTP 503 `AI_UNAVAILABLE`; quota violations use HTTP 429 `AI_RATE_LIMITED`. Errors do not include provider bodies, credentials, or storage details.

No model tools are sent or exposed. The model cannot select a member, query records, or authorize an action. The assistant has no write path. Application text and conversation content remain untrusted prompt data; prompt instructions do not replace route authentication or server authorization.

## SoCLaaS and quotas

`apps/api/src/integrations/soclaas/client.ts` reads `SOCLAAS_BASE_URL`, `SOCLAAS_API_KEY`, and `SOCLAAS_MODEL` on the server. It requires an HTTPS base URL and sends the configured model to `/chat/completions` with Bearer authentication. It validates the response shape and maps errors to fixed safe messages. Configuration is resolved lazily, so missing AI configuration disables assistant requests without preventing the API from starting. One transient retry may occur within the shared 15-second request deadline.

The service resolves `Overview.md` from the source or compiled project layout at runtime. Keep that file in the project root in deployed packages. Its full contents are sent with each answer-generation, replacement, and verification completion, increasing prompt size and provider cost; keep the document focused on stable project facts.

`apps/api/src/assistant/rate-limiter.ts` uses synchronous in-memory fixed windows: 5 requests per member per minute and 60 per process per minute. Expired member entries are pruned, and the member map is bounded to 10,000 entries by default; a full map denies new member reservations until entries expire. Counters reset on restart and do not coordinate across processes. The limiter counts incoming chat requests, while answer checking may make up to four sequential provider completions for one request. Each completion has its own 15-second adapter deadline, so the longest replacement path can approach 60 seconds plus overhead; no route-level or browser fetch deadline is configured. This adds provider latency and cost. This matches the approved one-production-process assumption; revisit the limiter before scaling to multiple processes or requiring continuity through restarts.

## Verification

Run:

```text
npm run build
npm test
```

The standard test command includes five assistant suites:

- `tests/member-api/member-ai-soclaas-client.test.mjs` — configured request, malformed response, safe errors, retries, deadline, fake transport.
- `tests/member-api/member-ai-rate-limiter.test.mjs` — per-member/global thresholds, concurrent reservations, expiry and bounded state.
- `tests/member-api/member-ai-assistant-service.test.mjs` — FAQ guidance, personalized facts and loan-count boundaries, data failures, untrusted input.
- `tests/member-api/member-ai-assistant-api.test.mjs` — session authorization, strict validation, error mapping, ownership and quota behavior.
- `tests/client/client-member-assistant.test.mjs` — authenticated API call, route persistence, logout/account change, safe text/error rendering, bold-label formatting with inert HTML, Enter submission, and scrolling after user/assistant messages.

The latest apply run passed `npm run build` and `npm test` (309 tests, 0 failures). The focused member assistant service suite passed 30 tests for source grounding, staff referral, unpaid fines, response formatting, ambiguous assumptions, relevance review, replacement verification, and safe fallbacks. Builds emit the repository's existing Vite chunk-size advisory; tests emit a Node `punycode` deprecation notice.

## Current limits

The service checks factual support and relevance with a second model completion and fails closed when the verdict is unsupported, malformed, or unavailable; a model can still judge a claim incorrectly, so this is not a formal guarantee of truth. The output sanitizer covers known internal markers and known UI labels, routes, and URLs; personalized facts are deterministic server inputs, but their phrasing still depends on the model. A replacement path can take up to four sequential provider calls, increasing latency and cost; each call has a 15-second deadline. The in-memory quota counters assume one server process, count chat requests rather than provider completions, and reset at restart. The assistant does not have a live catalog search or availability lookup; it directs members to the existing catalog and book detail pages.
