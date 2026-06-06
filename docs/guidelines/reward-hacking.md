# Reward hacking

**Rule:** an agent rewarded for a success signal will optimise the *signal* rather than the *work* if the signal is gameable. Define success by observable end-results, require concrete evidence of those results, and keep the party that judges the work separate from the party that did it.

## Why this matters

When the owned loop works at a leaf it is rewarded for green tests. If the tests pin a gameable signal — a return code, a help-text string, a "success: true" flag — the owned loop can earn the reward with a hollow implementation, and the breakage stays hidden until the slowest, most expensive proof channel (the story UAT against real collaborators) runs. This is the root failure class behind the whole proof model: green signal, red reality.

## Common signals of reward hacking

- **Help-text-only validation** — running a `--help` (or any always-present formatter path) and asserting the help mentions a feature, instead of exercising the real invocation. The business logic never runs.
- **Success flag without verification** — asserting a return code or `success == true` without checking the actual outcome it claims.
- **Mocking the real dependency** — stubbing the primary integration point to make a test pass, so the integration is never exercised.
- **Validating implementation details** — asserting on internal structure or which functions were called, instead of the user-facing observable.
- **Permissive assertions** — `output is non-empty`, `length > 0`: anything passes regardless of correctness.
- **Missing the unhappy path** — only the happy path is tested; error handling is unproven.
- **Silent failures** — errors that are swallowed rather than surfaced, so a failure does not bubble up.

## Prevention

- **Outcome over process.** Success is the deliverable meeting its functional goal, not "the command finished" or "it ran without crashing." Prove "the user can complete the journey," not "the step executed." This is exactly what the proof ladder encodes: contract test, integration test against real in-story collaborators, and a story UAT against real collaborators — no mocks within the organism.
- **Evidence, not assertion.** Require the concrete observable — real output content, a real state change, the actual response — captured in the event store. Reject a bare flag.
- **Separate judging from doing.** Approval onto the trunk is a distinct operator act, not something the building session self-grants. A green signal is a *request for diff-review*, not an automatic merge. An agent can never self-exempt from a proof.
- **Audit the tests themselves.** A test can pass while failing to verify the requirement. Tests must be proven valid before they are trusted to validate code.

Composes with [implementer-shortcut-patterns](implementer-shortcut-patterns.md) (the specific hollow-implementation shapes), [test-fixtures-mirror-production-failure-modes](test-fixtures-mirror-production-failure-modes.md) (the sterile-fixture inverse), and [test-creation-principles](test-creation-principles.md) (how to author a test that resists hacking).
