orchestrator modified plans before asking for permission. it did ask for permission after making the changes. need to enforce guardrails to prevent this in the future.


orchestrator-subagent workflow with TDD integrated runs quite slowly.
maybe future implementation can spawn multiple test writers first, let them write all the tests, and then one dedicated coder writes the code sequentially. after coder completes writing, coder moves on to next task, spawn a checker to check the code, and fix it if needed. improves efficiency by not having to wait for test writer at the start of each task, and wait for verifier to verify at the end of each task before moving on. but overall time save should be not that much more.