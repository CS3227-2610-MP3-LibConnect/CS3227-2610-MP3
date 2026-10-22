# AI Security Review: <task-id>

## Scope and assumptions

- Feature and roles:
- Intended capabilities:
- Sensitive data:
- Irreversible or externally visible actions:

## Trust boundaries and data flow

| Boundary | Attacker-controlled input | Possible impact | Required control | Evidence |
|---|---|---|---|---|
| Prompt/context |  |  |  |  |
| Tool call |  |  |  |  |
| Handoff/memory |  |  |  |  |
| Permission/egress |  |  |  |  |
| External workflow |  |  |  |  |

## Findings

### [S1] <short title>

- Severity: `MUST-FIX | SHOULD-FIX | RESIDUAL-RISK`
- Boundary:
- Attack path or precondition:
- Impact:
- Enforcement location:
- Regression test or verification:
- Human decision:

## Test plan

- Direct injection:
- Indirect injection from stored or retrieved content:
- Multi-turn or obfuscated escalation:
- Cross-role and cross-user denial:
- Malformed output and tool arguments:
- Rate limits, timeout, and provider failure:
- Safe logging and secret scanning:

## Release gates

- Model cannot authorize protected writes or external side effects:
- Tools are allowlisted, schema-validated, authenticated, authorized, and logged:
- Human approval is required for consequential actions:
- Residual risks are accepted by:
