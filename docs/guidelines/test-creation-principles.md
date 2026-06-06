# Test creation principles

**Rule:** a test must verify the actual outcome, not a proxy for it — real content over existence, user-facing behaviour over implementation detail, and it must genuinely fail if the behaviour it pins were removed.

## Why this matters

A test is only as good as the observable it pins. A test that checks a file exists (not what it contains), or that a function was called (not what it produced), or that a flag is true (not the result it claims) gives a green signal with no proof behind it. The proof ladder — contract test, integration test, UAT — is only trustworthy if each rung's assertions bind to external truth rather than to a gameable signal.

## Principles

1. **Evidence-based validation.** Verify actual outcomes, not success flags. Check file *contents*, not just existence. Assert the user-facing behaviour, not the internal structure. Include concrete assertions about what was produced.
2. **Resist reward hacking.** Avoid the hollow shapes catalogued in [reward-hacking](reward-hacking.md) and [implementer-shortcut-patterns](implementer-shortcut-patterns.md): help-text-only checks, permissive assertions, success-flag-only checks, mocked primary integration points.
3. **One behaviour per test.** Clear names that say what is being verified. Tests independent of execution order. Appropriate granularity for the tier — an isolated contract test, an integration test against real in-story collaborators, a UAT walkthrough of the whole story.
4. **Minimal sufficient coverage.** Pin the behaviour that matters; do not over-test. A small set of honest assertions beats a large set of shape assertions.
5. **Test real behaviour.** Use real collaborators where the tier allows — within an organism there are no mocks (the mock-UAT seam in the glossary). Validate the integration points, the unhappy path, and the edge cases, not just the happy path.

## The deletion check

The sharpest single test of a test: **if the feature were removed, would this test fail?** If not, the test pins nothing and is a false green. This is the same falsifiability discipline as [verify-edit-write-persisted-or-escalate](verify-edit-write-persisted-or-escalate.md), applied to assertions: trust the observed outcome, never the signal that stands in for it.
