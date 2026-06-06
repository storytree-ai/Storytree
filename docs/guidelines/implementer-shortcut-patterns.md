# Implementer shortcut patterns

**Rule:** an automated test's contract is the *observable* the production code must produce — not a signature, a return type, or the fact that a control-flow path was entered. An implementation that satisfies a test's shape via a shortcut while leaving the real contract obligation un-implemented is defective even when every contract test and integration test passes green.

## Why this matters

When the owned loop works at the leaf, it is rewarded for green tests. If the test's assertions pin *shape* but not *depth*, the owned loop can earn green with a hollow implementation, and the breakage stays invisible until the story's UAT runs the canonical journey end-to-end against real collaborators — the slowest, most expensive feedback channel. This is the "test green, production red" defect class. It is the inverse of [test-fixtures-mirror-production-failure-modes](test-fixtures-mirror-production-failure-modes.md): there the *fixture* is sterile; here the *implementation* is hollow. Walk both diagnostics when a UAT fails on a previously-green capability.

## The five sub-patterns

1. **Help-text narrowing** — the test invokes a command's `--help` (or another always-present formatter path) and asserts the help text mentions a feature, instead of running the canonical invocation through the real dispatch → logic → output chain. The help path is present by construction whenever a flag is declared; the business logic never runs.

2. **TODO-and-exit stub on the production arm** — the implementation wires a test-only seam (an env var, an injected fixture) but leaves the production branch (the path real users hit) as a TODO + error-exit. The contract test passes through the fixture seam; UAT hits the production branch and crashes. A test seam is for *isolation*, not production *deferral*.

3. **Discarded typed parameter** — a function accepts a typed collaborator (a runtime, an executor) in its signature, suppresses the unused-parameter warning, then never invokes it. The shape is right and the return value is well-formed, but it contains no real work. UAT discovers empty output.

4. **Mock shipped in the production path** — a test mock is reachable from the shipped artifact, gated only by a runtime flag rather than excluded from production builds. Any caller that sets the flag silently bypasses the real implementation. Mocks belong in test-only scope, never reachable from what runs in production. (See the no-mocks-within-an-organism rule in the glossary: `mock-UAT seam`.)

5. **Silent fallback to fake data** — a resource-acquisition path (clone, fetch, load) silently substitutes a placeholder when the real resource is missing and returns success. Downstream consumers cannot distinguish real from fake without inspecting contents. Fail loud with a typed error naming the failure; let the caller decide to abort, retry, or escalate.

## What to do

Per implementation seam, in order:

1. **Shape vs depth.** Do the assertions observe the chain's *terminal* effect (real output, real invocation, real content), or an intermediate shape (signature matches, return is non-null, env var was read, directory exists)? Terminal is fine; intermediate continues to step 2.
2. **Production-path coverage.** Does *any* contract or integration test exercise the real production branch (under a stub seam where real dependencies are out of reach)? If not, that branch is green-but-broken by construction.
3. **Name the shortcut.** If the implementation matches one of the five above, apply the corresponding discipline: wire the production arm, consume the parameter, exclude the mock, fail loud. A sixth pattern that fits the class but none of the five is worth surfacing for the operator.

When deciding whether to wire the production arm now or defer it, name both sides per [assess-tradeoffs-by-naming-both-sides](assess-tradeoffs-by-naming-both-sides.md). The default is to wire it: the upfront cost is paid once; UAT-only catch of every future regression is paid forever on the slowest channel.
