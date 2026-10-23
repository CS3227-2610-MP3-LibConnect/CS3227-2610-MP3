# Reflections

## General reflections

### Writing requirements before implementation

I began by documenting the application's general context, requirements, and user stories in `Overview.md`. I built the application's foundation with authentication, login and registration pages, and placeholder pages, then developed the features on top of that base.

For each feature I owned, I wrote a requirements document: authentication requirements under `PlanDraft/Specs/Auth` and member requirements under `PlanDraft/Specs/Member`. I then used an Codex to refine the flow and phrasing of each document, checking that the original points were retained. From the refined requirements, Codex created an SDD plan using the `$sdd-plan` skill.

I chose this process after a student shared during a tutorial that they had tried to use SDD through command-line prompts. Their first iteration produced many bugs and an outdated-looking interface. I thought a detailed document would give Codex a clearer and safer basis for producing the SDD materials. That proved useful: Codex captured my requirements more accurately, and the implementation had relatively few bugs.

The `$sdd-plan` skill creates a design document in `specdocs/<feature-name>/`, and `$sdd-propose` then proposes the tasks to complete. After checking that the documents reflect my intentions, I use `$sdd-apply` to implement the specifications.

I wrote skills to help generate the specifications. They are brief compared with toolkits available online, so I carefully reviewed their output to make sure it retained the right requirements. Overall, the skills have been effective. The guardrails I added also encourage the agent to ask for clarification instead of making assumptions. Because I supplied many of those clarifications during specification generation, the resulting specifications needed few changes afterward.

As I had used a different workflow from my teammate, I have left the files for my agent, skills and workflow under .agents/skills/junhong_skill_archive/ instead of workflows/ so as to reduce confusion between the files. 

### Verification and guardrails

During code generation, I used a sequential multi-agent workflow with test-driven development. A tester subagent first wrote a test and confirmed that it failed. A coder then implemented the requirement, and a verifier checked that the test passed, following the red-green loop. Finally, `$sdd-apply` checked that the requirements were met and marked the task complete. I also performed another verification pass after implementation.

Before a commit, the `$yeet` skill invokes `$code-reviewer` for a further check. It looks for issues such as unused imports and verifies that completed tasks are accurately marked as complete. This gives the process another opportunity to catch mistakes I may have missed.

The project also showed me how important guardrails are in multi-agent workflows. When I first wrote the `$multiagent-orchestrator` skill, the orchestrator modified plans before asking permission, and only asked after making the changes. This exposed a safeguard I had overlooked. Since specifications are version-controlled, an agent should follow their contracts and plans rather than change them to fit the code it generated.

### Making the workflow more efficient

Later in development, I found that the sequential orchestrator workflow with TDD could be slow. Each task required an explorer, tester, coder, and verifier to finish in sequence before the task could be marked complete. The workflow was very safe and gave assurance that the code followed the specifications, and the generated code achieved its target functionality. Still, I thought there could be a more efficient approach.

My first optimization was to share context across the generator and verifier workflow. An explorer was spawned at the start of every task to find relevant information. I changed the approach so that an explorer could gather the relevant information at the start of a task and write it to a temporary file. The subsequent tester, coder, and verifier could then use that shared source. I did not collect concrete statistics on the time or token savings. Those measurements could vary with factors such as task complexity and how much context the explorer needed to find.

I also implemented task parallelization. `$sdd-propose` can group tasks so that tasks in the same group can run in parallel. This was intended to let an agent team finish work sooner than a sequential workflow. I did not get to test this optimization as I introduced it late in development, after the features had already been implemented, and the remaining feature revisions could not use the new workflow because their tasks were not parallelizable.

### Designing the member assistant

When designing the member chatbot, I used the `$ai-security-review` skill, created by Jiali, to help review its guardrails. I also documented additional guardrails in [the member assistant specification](../../PlanDraft/Specs/Member/completed/AiAssistant.md). That specification informed the FAQ content in `faq.ts`, which the agent uses as context alongside [the application overview](../../Overview.md) when answering member queries.

## Improving the member chatbot

During implementation, I encountered several cases where the chatbot gave a misleading or unsuitable answer. These examples helped shape the guardrails I added to its behavior.

### Inferring what a member means

The chatbot sometimes assumed the member's intent and answered as though an unsupported feature existed. For example, when asked, “How can I order a book?”, it explained that ordering in LibConnect meant reserving an item with no copies available. However, LibConnect does not support ordering, so this answer could give members the wrong impression.

I allowed the chatbot to infer a member's likely intent, but added a guardrail requiring it to state its assumption before answering. This makes the interpretation visible to the member instead of presenting it as a supported feature.

### Avoiding unsuitable responses

The chatbot also sometimes returned a response that did not address the request. For example, when asked, “Can you help me borrow a book?”, it replied only with “My Loans.”

To address this, I introduced a validation step. The chatbot reviews the member's prompt alongside its generated response. If the response is inappropriate, it generates another one.

### Preventing invented facts

When asked, “Can I not pay my fines?”, the chatbot replied with “My Fines” only in one instance. In another instance, it claimed that unpaid fines could prevent borrowing or reservations. It directed the member to the My Fines page to check their balance and account status. The restrictions it described were not established facts, so the answer risked misleading the member.

I added guardrails against inventing facts. When the chatbot does not have the information needed to answer, it should direct the member to ask library staff for clarification.

## AI Security

### What are the different attack surfaces and different types of prompt injection you have considered?

Libby's attack surface includes the member's browser panel and chat history, the authenticated Express endpoint, the server-side SoCLaaS adapter, and the context assembled from FAQ guidance, `Overview.md`, and member data. A caller could put forged instructions or another member's identity in the request, try to exceed request limits, or ask Libby to ignore her read-only scope. Indirect injection could be embedded in catalog or other supplied text, while prior conversation turns can contain misleading content. I treated prompts and application text as untrusted data; they must not change the assistant's identity, permissions, or the server's authorization decisions.

The SoCLaaS API key authenticates the server to the model service; it does not grant Libby access to the production database. The model has no tools or direct Firestore access. The server reads any needed member facts, limits the data sent to the model, and enforces member identity and access.

### What security features have been implemented and how are they tested?

The server derives member identity from the authenticated session, validates the question and history, and selects only the facts needed for a recognized personal loan question. Libby has no tools or direct Firestore access and cannot borrow, reserve, pay fines, or update account data. The service also bounds request size and history, applies per-member and process rate limits, limits provider time and retries, validates provider output, and maps provider failures to a safe assistant error. Focused tests use a fake SoC client and cover injection attempts, ownership isolation, malformed responses, provider failure, quotas, and client behavior; they do not depend on live credentials. Member workflow ownership and state rules are also covered in the API, storage, client, and emulator test groups.

### What limits have been applied to the AI agents?

Libby answers questions about catalog information, availability, borrowing guidance, reservations, navigation, and the signed-in member's own active-loan facts. She cannot choose the member identity or access unrelated records. Requests are limited to 2,000 characters and 10 previous turns, with five requests per user per minute and a global process limit of 60 per minute, plus a 15-second provider deadline including one retry. We chose these low request limits because we do not expect LibConnect to have a large user base initially; they can be raised as expected traffic and capacity increase. The assistant is read-only, uses approved and server-selected context, and should refer a member to staff when the available sources do not establish an answer. A provider outage disables the assistant rather than unrelated API features.

### Did you make use of approval gates and human-oversight? How did you ensure that they are not compromised?

Libby does not change state, so her member-facing workflow has no AI approval action to bypass. Members must use the normal application flows, where the server checks identity, role, ownership, and business rules. 

Another safeguard is limiting the production data that reaches Libby. The model has no direct database access. Only when the server classifies a question as asking about the signed-in member's borrowing count or capacity does it fetch that member's data, and it sends only the derived active-loan count and remaining slots to the model. The model cannot choose a member identity or request broader records.

## Spec-Driven Development

### What should a good specification make clear before implementation begins?

A specification should identify the user and goal, supported and excluded behavior, data and authorization boundaries, contracts with existing code, validation and limits, failure handling, and observable acceptance criteria. My design for Libby made clear that the session is the source of member identity, when loan facts may enter context, that the feature is read-only, how unavailable data is handled, and how the panel integrates with shared member navigation. These details gave implementation and tests a common contract.

### How can you tell whether a spec is precise enough for an agent to build from?

A spec is precise enough for an agent to build from when the agent can derive concrete behavior and tests without making policy decisions on the user’s behalf. For the member assistant, the design specifies the question and history limits, how active-loan counts are defined, how missing data should be handled, and how to respond to ambiguous wording. When the source material did not establish a policy, such as the consequences of unpaid fines, the spec instructed the assistant to acknowledge the uncertainty and refer the member to library staff rather than guess.

I reviewed each generated spec against this standard. When I found gaps, I added or clarified requirements to make the spec more complete before implementation.

### How should changes to requirements flow through the spec, implementation, and tests?

I designed the `$sdd-revise` skill to record specification changes in a dated amendments section, making it easier to see what changed and why. When a requirement changes, the design and acceptance criteria is updated first, then  the task checklist is revised before changing the implementation and focused tests to match the updated contract. For example, the member assistant’s later refinements—handling ambiguous intent, checking response relevance, filtering internal labels, grounding answers in approved sources, and loading the complete overview—followed this process. Keeping the amendments, task status, and verification evidence aligned makes the evolution of the feature easier to understand and review.

### How can tests show that the software meets the intent of the spec, rather than only matching its wording?

Tests should demonstrate the intended user and security outcome, not merely assert that a particular phrase appears. For example, ownership tests should show that a request cannot use prompt text to retrieve someone else's loan facts; missing-data tests should distinguish unknown from zero; and injection tests should verify that untrusted text neither exposes secrets nor creates a state change. Boundary cases, fake-provider failures, and client-level behavior help check the complete outcome. I also found it useful to map tests back to acceptance criteria and review whether each test would catch a real violation of the requirement.

## Basic Multi-Agent SE

### Which parts of a software task would benefit from specialized agents, such as an analyst, architect, developer, or tester?

An analyst can turn the member's needs and existing policy into scenarios; an architect can identify trust boundaries and integration contracts; a developer can implement the server and client pieces; and an independent tester can probe role, ownership, injection, and failure cases. A reviewer can then trace the result back to the spec. The role split also matters across the team. 

I find specialized agents effective when each has a clearly defined role. Because agents do not share memory, a poisoned context in one agent is less likely to affect the others—provided each agent works from the same trusted sources, such as the approved specification and Overview.md. Those sources give each agent a common basis for checking its work and help limit the spread of incorrect or malicious instructions.

### How to build and test the specialized agents well?

Each agent needs a narrow responsibility, the approved specification and relevant repository context, explicit acceptance criteria, and clear ownership of files or outputs. In my workflow, the tester first wrote a failing test, the coder implemented the task, and a verifier checked the result; `$sdd-apply` and a later review then checked completion. The test-first sequence exposed mismatches early, while independent review remained necessary because an agent can faithfully implement an incomplete or mistaken interpretation. Parallel work also needs tasks with genuinely separate dependencies and surfaces. However, I introduced task grouping late and did not get to evaluate its efficiency on suitable feature work.

### What information must one agent pass to the next so that important context is not lost?

Handoffs should include the user story and role, scope boundaries, approved decisions and assumptions, data and API contracts, relevant files, acceptance criteria, risks, and exact commands and results. For Libby, a critical handoff is that the authenticated session alone determines member identity, personal facts are included only for recognized questions, and the model has no mutation tools. The design and task documents provide a durable record; a temporary shared context note can also save repeated repository exploration, though it should point back to the authoritative spec.

### If one agent writes the spec, another implements it, and a third reviews it, where could an error or malicious instruction slip through?

An analyst might encode an unsupported policy as a requirement; an implementer might treat untrusted catalog text or a prompt as instructions, trust client-supplied identity, or fetch excess data; and a reviewer might miss the gap or accept tests that only confirm the implementation's own assumptions. A malicious instruction could also be hidden in repository content, test fixtures, or conversation history. 

Therefore I have taken extra care to always review the generated documents, and not just trust the generated specs blindly. I will read through the specs to ensure that the specs really do reflect my intended design and plans, before allowing agenets to build the feature. 

### What evidence should each agent leave behind so a person can verify its work?

After a feature is implemented, the `$document-feature` skill is invoked to create a document describing what was built and how it works. This gives future developers a clear record of the implementation.

In hindsight, I think I could have improve traceability by asking each agent to leave more focused evidence. The explorer could record which files and sources it identified as relevant, so we can see what context informed the work. The tester could list the tests created from the spec and explain what each one verifies. The coder could summarize the files changed and the purpose of each change, with a diff available for review. The reviewer could record their comments, whether the implementation meets the task requirements, and the evidence supporting that conclusion.
These handoff records would help human developers verify each stage of the workflow. If they reveal recurring gaps, we can refine the relevant skills to improve the agents’ work.