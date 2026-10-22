# Reflection

## Table of contents

1. [AI security](#ai-security)
2. [Spec Driven Development](#spec-driven-development)
3. [Basic Multi Agent Software Engineering](#basic-multi-agent-software-engineering)
4. [Evidence used for this reflection](#evidence-used-for-this-reflection)

This project was my first serious experience with specification driven development
(SDD), and it was my first time coordinating several active coding agents
for one software project. My main responsibility was the librarian and
librarian manager part of LibConnect. This included manager account listing and
activation/deactivation, librarian password reset, catalog and inventory
management, loan return/loss review, reservations, fines, notifications,
member account support, and the librarian manager AI assistant.

For each feature, I keep the same rules consistent across the specification, server authorization,
database workflow, client UI, tests, and agent evidence. That was the main
lesson I took from this project. I consider a feature unfinished when its
happy path works without clear authority, failure cases, tests,
and review history are also clear.

## AI security

The AI assistant is a server mediated librarian feature. It can summarize
pending return/loss reports and prepare a notification draft. Consequential
actions remain outside its authority. It cannot confirm a return, confirm a
loss, change a copy or account status, waive a fine, create a notification, or
send a message. The final action still goes through
the normal authorized server route after a librarian reviews the draft and
explicitly confirms it.

Before implementing the assistant, I created the project local
`ai-security-review` skill. I embedded it in the agent workflow so the
specification analyst, implementer, and reviewer followed the same security
procedure for AI, authentication, and agent workflow changes. The skill
defines trust boundaries, untrusted input categories, prompt injection tests,
data minimization, output validation, rate limits, safe logging, human approval,
and residual risk recording. It also requires a security review artifact and
clear verification evidence. This made AI security a requirement that moved
between agents through the workflow rather than a final checklist.

The skill begins by forcing the agent to define scope and assumptions. It asks
the reviewer to identify the user roles, intended AI capabilities, trusted and
untrusted inputs, tools, data stores, external services, egress channels,
sensitive data, irreversible actions, and development surfaces. It then builds
a compact threat model for each boundary. Each boundary records the attacker
controlled input, possible impact, required control, and evidence needed to
verify the control. This helped me see that the browser, model context, model
output, provider adapter, approval UI, skills, handoffs, logs, and terminals
all needed separate security consideration.

The skill also separates three related threats. Jailbreaking comes from a
user trying to bypass the model's role constraints. Prompt injection comes
from untrusted content trying to change model behavior. A coding agent attack
uses repository text, skills, handoffs, tool output, or external content to
influence an agent's permissions or workflow. For each finding, the reviewer
records its severity, attack path, impact, enforcement location, regression
test, residual risk, and required human decision. This structure made the
security review actionable instead of leaving it as a list of general warnings.

The skill recommends defense in depth. The input layer bounds size and rate
and preserves provenance. The instruction layer defines a narrow role and
forbidden authority. The tool layer uses allowlists, typed schemas, and
server authorization. The output layer rejects malformed or unsafe actions.
The operational layer adds quotas, timeouts, retries, circuit breakers, safe
logging, and human review. It also requires benign adversarial canaries,
deterministic fake model responses, cross role and cross user denial tests,
malformed output tests, provider failure tests, and checks for duplicate model
calls inside database transactions.

For the agent workflow, the skill checks whether each agent receives only the
context and permissions needed for its role. It also checks that external
content, skills, MCP responses, handoffs, summaries, and commit messages stay
untrusted. Destructive, external, sensitive, and public actions need the
appropriate approval gate. Evidence must record the specification version,
changed files, verification results, unresolved risks, and human approval.
Embedding these checks into the workflow meant that the analyst considered
security before implementation, the implementer carried the controls into
code and tests, and the reviewer checked the exact implementation against the
same security contract.

### Attack surfaces I considered

I treated the whole path around the model as an attack surface. The prompt is
one boundary. The other boundaries were.

- The browser can submit loan IDs, source IDs, purposes, role fields, manager
  fields, approval fields, and stale UI state. A malicious client could try to
  use these fields to request another member's data or to make an AI response
  look approved.
- Firestore records and stored library text can contain untrusted content. A
  book title, synopsis, notification, or member related text could contain
  instructions aimed at the model.
- The server sends selected context to the SoC LLM. This creates risks of
  prompt injection, unnecessary personal data disclosure, provider key
  exposure, quota abuse, and provider error leakage.
- Model output returns to the application. The model could produce malformed
  JSON, unsupported IDs, invented facts, HTML, an action like field, or a fake
  recipient. Treating this output as authorization would create a confused
  deputy.
- The draft UI is another boundary. A user could edit a draft, submit it twice,
  or try to skip the visible review step and call the notification command
  directly.
- The development workflow is also an AI related attack surface. Repository
  text, skills, handoffs, generated summaries, tool output, and agent messages
  can contain instructions that look authoritative even though they are only
  data. I called this instruction laundering in the security review.

I tested several types of prompt injection rather than assuming that one
``ignore previous instructions`` test was enough. The security plan included
direct requests to reveal context, switch persona, approve an action, or call a
tool, indirect injections inside catalog or notification text, staged or
multi turn escalation, encoded or multilingual attempts, and model output
fields that tried to introduce a tool call, recipient, status, or approval.
The initial design deliberately has no model initiated tool dispatcher. This
reduced the number of ways a prompt could turn into an application action.

### Controls I implemented and how I tested them

The assistant uses a fixed server side model named `gemma4`, version 26B. The
browser has no control over the model, provider, or credentials. The server reloads the authenticated
actor and the referenced records, verifies that the actor is an active
librarian, and checks that reports are still in the required pending state. It
rejects client supplied roles, manager flags, recipient IDs, approval
flags, timestamps, or state values.

The context sent to the model is request scoped and minimized. It contains only
the facts needed for the selected pending reports. Passwords, session IDs,
emails, provider credentials, raw Firestore documents, and unrelated members'
records are excluded. Stored text is delimited and treated as data rather than
instructions. The returned summary is limited to 4,000 characters and the
draft to 2,000 characters. Both are plain text.

The output is parsed against strict schemas and checked against the current
server loaded reports. Unsupported IDs, incompatible report types, extra
authority fields, HTML, overlong text, malformed JSON, and attempted approval
or send instructions are rejected or converted to a generic unavailable/no-
result response. Drafts are ephemeral. Sending is a separate normal
notification command with its own authorization, active member check, message
limit, explicit confirmation, and idempotency key.

I also applied operational limits. The assistant allows five requests per user per minute, sixty
globally per minute, a maximum of twenty reports per summary, an eight second
provider timeout, one 250 ms retry for safe transient failures, and a circuit
that opens after five retryable failures in a sixty second window. Provider
responses are bounded before JSON parsing, including a streaming cap when a
content length is unavailable. Missing configuration and provider failures
disable only the assistant routes and return generic errors. The rest of the
API remains available.

The tests covered contracts, context loading, service behavior, routes, the
client API, UI labels and confirmation behavior, direct and indirect injection
canaries, cross member isolation, forged tool and approval output, provider
timeouts and failures, rate limits, circuit behavior, bounded response bodies,
and secret pattern scans. The implementation initially passed the existing
133 test regression suite. The independent review still found two real
problems. Successful calls incorrectly cleared the rolling circuit breaker
window, and provider responses were fully buffered before the size check. I
fixed both issues, added regression tests, and the follow up review reported
24/24 focused AI tests and 135/135 full regression tests passing.

These controls leave model trustworthiness unresolved. They make its influence
bounded. Stored text can still affect the wording of a response, a librarian
can still over trust a convincing draft, and operational metadata differs from
a complete durable AI audit record. The emulator evidence was also
unavailable for the final AI implementation run. I recorded these as residual
risks instead of claiming that the tests solved them.

### Approval and human oversight

There were two separate kinds of approval. At the product level, a human had
to approve the specification, checklist, handoff, implementation stage, and
review disposition. At runtime, the librarian has to review and explicitly
confirm any notification send through the existing server route. A model
response, a passing test, a handoff, or an agent message serves as evidence
only. Human approval comes from an explicit human decision.

I kept these gates separate by recording them in task artifacts and by making
the reviewer inspect the exact implementation from a clean worktree. The
first independent review was allowed to fail the implementation even though
the tests were mostly green. This was important because it showed that human
oversight was more than a checkbox after automation had already decided that
the feature was acceptable.

## Spec Driven Development

Before this project, I thought of a specification mainly as a description of
what a feature should do. After using SDD, I think a useful specification must
also describe what the system must refuse to do and how someone can prove both
parts.

A good specification should make these points clear before implementation.

- the user visible scope and explicit non scope;
- the actors and their permissions;
- which inputs are trusted and which are attacker controlled;
- the records, ownership rules, and valid state transitions;
- server side behavior, response shapes, validation errors, and failure cases;
- limits, retries, idempotency, privacy, and audit requirements;
- dependencies on existing features;
- acceptance criteria and a test matrix; and
- the approval gates and unresolved decisions that require a human.

The librarian AI specification became a good test of whether I had made a
specification precise enough. It fixed the model, the two allowed assistant
operations, the pending report source, the maximum number of reports, the
rate limits, timeout, retry and circuit behavior, output bounds, data that must
remain outside model context, and the fact that the assistant was read only.
It also mapped acceptance criteria A-1 to A-18 and tests
T-1 to T-20. Because these details were written down, the implementer could
build without inventing policy while coding, and the reviewer could identify an actual
rolling window bug instead of arguing about what the intended behavior was.

I learned to judge precision with one question. Could another agent implement
this without asking me questions such as “Who is allowed to do this?”, “What should
happen if the record changes between selection and execution?”, or “Is this
model response allowed to trigger a write?” If the answer is no, the specification
needs more detail. A list of endpoints needs more detail. For example, “librarians can
send notifications” is incomplete until it says how the recipient is resolved,
what member status is required, what happens on retry, which fields the client
controls, and how a duplicate request is handled.

Requirement changes should flow through the same chain as the original
requirement. The chain is user decision, canonical specification, task checklist, handoff,
implementation, tests, and evidence. A requirement change must enter through
this chain rather than appearing first as an unrecorded code change. During the project I used `PlanDraft/Specs/` as the
canonical specification directory and kept task copies, handoffs,
implementation reports, security reviews, and review reports under
`workflow/tasks/`. This made it easier to see whether a change was an approved
amendment or an agent silently expanding scope.

Tests should demonstrate the intent of the specification and go beyond repeating
its wording. A test that checks only for HTTP 200 leaves open whether the right
member's data was used or that no write occurred. The stronger tests checked
invariants and attack cases. A client supplied manager flag cannot grant
access; a stale pending report cannot be summarized as current; a notification
cannot be sent to an inactive member; a model cannot add a recipient or
approval; and five interleaved provider failures still open the circuit. These
tests are closer to the reason behind the requirement than to its surface
syntax.

My honest criticism of SDD is that it adds real overhead. I had to maintain
several related documents, keep versions and approvals straight, and stop at
gates even when the code looked ready. At first this felt slower than coding
directly. It became valuable when the project grew. The documents reduced
repeated explanations, exposed missing policy decisions, and gave the reviewer
something more precise than my own summary to check. SDD left some ambiguity
in place. It made that ambiguity visible early enough to discuss.

## Basic Multi Agent Software Engineering

The project used three practical roles. The specification analyst investigated
requirements and wrote the feature contract, acceptance criteria, security
constraints, and test matrix. The implementer performed the SDD preflight,
changed the application and tests task by task, and recorded verification. The
reviewer/tester started from a separate worktree or clean checkout, inspected
the exact implementation, ran independent checks, and wrote findings. I was
the human orchestrator who selected the next task, checked the artifacts,
recorded approvals, and decided whether the next role was allowed to proceed.

These roles were useful for different reasons. The analyst was best at finding
missing decisions before code existed. The implementer was focused on fitting
the approved behavior into the existing Express, Firestore, React, and test
structure. The reviewer was able to challenge assumptions that the implementer
had become used to. For the AI assistant, this separation directly exposed
the circuit breaker and response buffering defects that I had missed during
implementation.

The agents needed more than a short prompt to work well. Each handoff passed
the task ID, exact specification version, checklist, scope and non scope,
trusted and untrusted inputs, authorization rules, selected skills, allowed
files and permissions, dependencies, test matrix, known risks, and the exact
commit or diff to review. The next agent also needed to know what remained
unfinished, such as unavailable emulator evidence or a pending human approval.
Without that information, a later agent could mistake “untested”
for “passed.”

There were several places where an error or malicious instruction could slip
through. A vague requirement could become an unsafe design. An agent could
treat a generated summary or handoff as permission. Repository text or a
retrieved catalog record could contain prompt injection. An implementer could
rewrite the spec to match the code. A reviewer could rely on the previous
agent's report instead of checking the exact diff. Even the phrase “approved”
could be misleading if it was written by an agent rather than a person.

The controls were explicit role boundaries, separate artifacts, separate
worktrees where practical, clean checkout review, server side authorization,
human only approval states, and a rule that passing tests are evidence rather
than permission. The reviewer was allowed to write findings and had to leave
production code unchanged. The implementer was required to stop before dispatching
the next stage. This limited the damage from an incorrect or overconfident
agent.

Each agent left evidence that a person could verify. The evidence included the specification, ordered
tasks, handoff, implementation report, security review, review report, factual
execution logs, changed file list, commands and results, exact reviewed commit,
open risks, and approval state. The evidence was especially useful when the
first AI review returned `FAIL`; the original finding was preserved, the fix
was recorded separately, and the follow up review changed the disposition to
`PASS WITH RESIDUAL RISK` without turning that verdict into merge approval.

Managing many active agents was the most difficult organizational part for me.
I had to track which agent was analysing, implementing, reviewing, waiting for
approval, or blocked by an environment issue. Reusing stable task IDs and
keeping one artifact chain per feature helped. I also learned that a “multi
agent” setup still needs independent checks. If the same context, branch,
or summary is copied everywhere, agents can repeat the same mistake. The
reviewer's separate worktree and requirement to inspect the implementation
directly were therefore more important than simply having more agents.

Overall, this project made me more cautious about automation. Agents are good
at producing code, tests, and structured evidence quickly. They leave decisions
about requirement legitimacy, risk acceptance, and merge readiness to people.
Those remained human decisions. My main
improvement for a future project would be to establish the task dashboard and
approval status tracking earlier, because I spent too much time reconstructing
which artifact was current. I would also plan independent review time earlier
instead of treating it as the final step after implementation.
