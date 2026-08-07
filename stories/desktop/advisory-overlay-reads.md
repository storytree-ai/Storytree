---
id: "advisory-overlay-reads"
tier: capability
story: desktop
title: "The sidecar's overlay reads fail to a bounded, logged null — a down store under-claims the forest instead of hanging it"
outcome: "Every overlay read the sidecar makes fails to a bounded, logged null rather than to a throw or a hang."
status: mapped
proof_mode: integration-test
depends_on: [local-backend-boot]
decisions: [33]
# A brownfield capability over already-implemented, already-tested code (the arc that authored it:
# capability-layer-coverage-arc increment 2, 2026-08-07). The `proof:` block is spec-borne (ADR-0057);
# there is deliberately NO `real:` arm — the desktop's advisory-read helper is `mapped`, so its green
# path is Adopt (ADR-0085 / ADR-0094, which removed the ADR-0092 brownfield arm), not a fail-closed
# `--real` Build. The one proving file is desktop-resident, so the package suite is the whole command.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
---

# The sidecar's overlay reads fail to a bounded, logged null — a down store under-claims the forest instead of hanging it

**Outcome —** Every overlay read the sidecar makes fails to a bounded, logged null rather than to a throw
or a hang.

*(Two clauses were folded INTO that sentence rather than demoted, because each is load-bearing on the
one outcome and none of the three stands alone: "logged" is the OBSERVABILITY half — one stderr line per
NEW failure, deduplicated per failing streak — proven by contract 2; "bounded" is the per-read TIMEOUT
budget with its opt-in single retry, proven by contracts 3, 4 and 5. Drop either word and the outcome
describes a helper that already existed before this module was extracted.)*

**Depends on —** [`local-backend-boot`](local-backend-boot.md).

> **Proof status (honest) — `mapped` (real passing offline tests, observational; NOT `healthy`).** The
> whole helper is covered by REAL, passing, offline tests in ONE colocated file:
> `apps/desktop/src/backend/advisory.test.ts` (11 tests), part of the `desktop` suite, which I ran on
> 2026-08-07 — **249 tests, 249 pass, 0 fail, 0 skipped**. Nothing in it touches a database, a network,
> or a wall clock: the read function and the log sink are INJECTED, and the two cold-start budget tests
> drive `setTimeout` through `node:test`'s mock timers against a hand-resolved deferred, so the timeout,
> the retry and the dedupe state are all deterministic. storytree's own prove-it-gate did NOT drive this
> red→green, so it is brownfield `mapped`.
>
> **What is NOT proven here, named rather than implied.** The FIVE real call sites live in
> `apps/desktop/electron/backend-entry.ts` (`:403`, `:419`, `:424`, `:493`, `:513`, `:516`, `:850`) —
> operator-attested glue, outside this capability. So the helper's CONTRACT is fully proven while the
> per-site decisions are not: in particular, that the claims read is the ONE site opting into the softer
> budget (`:493`) and that `sessionClaims` (`:516`) and the four others take the shared default are
> facts about the glue, asserted nowhere. Contract 4 proves the helper HONOURS a per-call override and
> withholds it from every other read; it does not prove which site passes one. The deliberately
> UNWRAPPED read at `backend-entry.ts:523` is likewise a glue decision, recorded in that file's own
> comment and not pinned here.
>
> **No reliability gate `(covers:)` this capability.** The story's existing gate-1 names
> `credential-broker` only. Extending an already-signed gate's `(covers:)` list changes what a signed
> verdict claims, so it is a deliberate, id-aware edit for the owner — a stated gap, not a hidden one.

## Guidance

**WHY THIS IS A CAPABILITY AND NOT PART OF [`local-backend-boot`](local-backend-boot.md)** (the
splitting-rule, ADR-0010 — the fold was tested before this was authored, and BOTH triggers fire against
it):

- **The fused outcome cannot be stated without a conjunction.** `local-backend-boot` delivers "composes
  a local studio backend from the organism drivers and serves it on `127.0.0.1` `/api/*`". Adding "and
  degrades its overlay reads to bounded, logged nulls" is a second outcome joined by a conjunction —
  trigger 1.
- **The proofs share neither precondition nor observable.** `local-backend-boot`'s precondition is a
  mounted `/api/*` handler over injected drivers, and its observable is a real envelope body.
  This helper's precondition is a read function and a clock; its observable is a `null`, a log line, and
  a timer that fired or did not — trigger 2.
- **It is not part of the composition it protects.** The five overlay reads this wraps live in
  `backend-entry.ts`, not in `local-backend.ts`; the backend RECEIVES seams that are already
  advisory-wrapped. This module is the CI-provable core extracted OUT of operator-attested glue (its own
  header says so), which is the move that earns capability-hood here — the same move
  [`desktop-launch-preconditions`](desktop-launch-preconditions.md) made for the launch gate.

**The deletion test earns the boundary** (deep-modules). Delete `createAdvisoryReader` and, at each of
the seven call sites, a timeout race + a try/catch + a per-name dedupe map + a bounded retry all
reappear by hand. It is a narrow surface (`advisory(name, fn, opts?)`) over a real hidden lifecycle with
its own state — not a pass-through.

**THE ADVISORY CONTRACT IS ADR-0033 AND IT IS OLDER THAN THIS MODULE.** Each overlay read — verdicts,
activity, presence, claims — answers `null` on ANY failure: stopped DB, missing table, timeout. Never a
throw. The consequence is deliberate: a down store leaves the forest **under-claiming** rather than
hanging `/api/tree`. That half was already true when the reads were inline. What the extraction ADDED,
and what makes this a unit worth naming, is the other two words in the outcome.

**BOUNDED IS ABOUT THE POLL, NOT ABOUT ONE READ.** The forest polls, and every tree render re-runs all
five reads. So an unchanged failure logs **once per failing streak**, not once per poll — otherwise one
down DB becomes a log torrent and the signal is worse than silence. The dedupe state is a per-read-name
map of the last failure MESSAGE: a success clears the entry (so a re-failure after recovery is a new
streak and logs again — the operator sees the overlay went down AGAIN, not silence), and a CHANGED cause
mid-streak logs too (a timeout turning into a missing-table error is new information, not a repeat).

**LOGGED IS WHAT MAKES A FAILING OVERLAY DISTINGUISHABLE FROM AN EMPTY ONE** — and that is the whole
reason the module exists. Before it, an advisory `null` was indistinguishable from a genuinely empty
overlay, so a silently-stale forest looked like a correct one. One stderr line per new failure, naming
the READ and the CAUSE, is what lets an operator inspecting the sidecar output tell them apart (stderr
is inherited by the Electron main). The sink is injected (`log`), defaulting to `console.error`, which is
what keeps the contract offline-provable.

**THE PER-READ BUDGET IS TARGETED, AND THAT TARGETING IS THE CONTRACT.** A slow DB cold-start was
dropping a fresh claim wisp at the shared 4s. The fix is a per-CALL override (`timeoutMs`, and an opt-in
`retryOnce`) that the claims read alone passes — deliberately NOT a raise of the shared default, which
would make a slow verdicts or activity read hold `/api/tree` longer on EVERY poll. The retry is bounded
to exactly one re-race, so a genuinely down DB still nulls promptly and no unbounded loop can form.

**Why the `depends_on` edge.** The route-level proof composes the REAL `createLocalBackend` — the
capability [`local-backend-boot`](local-backend-boot.md) delivers — over a real `node:http` server, and
asserts the advisory shape ON THE WIRE (`200 { builds: null }`, never a 500). This helper's own contract
would be provable without that; but the claim that a failing read reaches the CLIENT as an
under-claiming 200 needs the backend's delivered outcome as a precondition, which is exactly the
dependency test. Note the direction: `local-backend-boot` does not depend on this — it takes its seams
already wrapped.

## Integration test

**Goal —** Prove that a failing overlay read is simultaneously invisible to the forest as an error and
visible to the operator as a cause: the route answers the honest under-claiming shape rather than a 500,
while the failure lands in the log naming which read broke and why.

Real collaborators, no stubs between them: `apps/desktop/src/backend/advisory.test.ts:257` (passing)
builds the `backend-entry.ts` composition in miniature — a `LocalBackendDeps["backend"]` whose
`inFlightBuilds` seam is a real `advisory()` wrapping a read that throws `connection refused` — hands it
to the REAL `createLocalBackend`, and serves it on a REAL `node:http` server on `127.0.0.1`. A real
`fetch` to `/api/activity` then asserts **`200`, not a 500**, with `{ builds: null }` as the body, AND
that the captured log carries both `in-flight-builds` and `connection refused`. Two real collaborators
(the helper + the local backend) wired over a real transport; only the failing store read is a double,
which is the design — the failure mode under test IS the double.

Underneath, 10 more tests cover the helper's own lifecycle: the null-and-log core, the silent happy
path, all four dedupe behaviours (repeat, per-name, streak reset, changed cause), the timeout arm, both
halves of the targeted cold-start budget, and the bounded retry. `mapped` (observational); the
prove-it-gate did not drive it.

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). Every contract here has a REAL passing test (`proven by`).

1. **`a-failing-read-answers-null-and-a-succeeding-one-is-silent`** — the ADR-0033 contract, unchanged, plus the named cause
   - **asserts —** a read that THROWS returns `null` (never a throw of its own) and emits exactly ONE log line carrying both the read's NAME and the underlying failure message; a read that SUCCEEDS returns its value and logs NOTHING, so there is no noise on the healthy path.
   - **covers —** `apps/desktop/src/backend/advisory.ts:76-95`
   - **proven by —** `apps/desktop/src/backend/advisory.test.ts:28` and `:48` (REAL, passing)
2. **`an-unchanged-failure-is-named-once-per-streak-not-once-per-poll`** — the bound that keeps the signal readable
   - **asserts —** the SAME failure repeating three times (the poll cadence over a down DB) logs exactly ONCE; dedupe is PER READ NAME, so a second overlay failing still surfaces its own line; a SUCCESS clears the streak, so a re-failure after recovery logs again rather than staying silent; and a CHANGED failure message mid-streak logs, because a timeout turning into a missing-table error is new information rather than a repeat.
   - **covers —** `apps/desktop/src/backend/advisory.ts:51,86-93`
   - **proven by —** `apps/desktop/src/backend/advisory.test.ts:60`, `:75`, `:90`, `:107` (REAL, passing)
3. **`a-read-that-outlives-its-budget-is-a-failure-not-a-hang`** — `/api/tree` can never be held open by one slow seam
   - **asserts —** a read that never settles is raced against its timeout and resolves `null` once the budget fires, logging a line that names the read and says it TIMED OUT — the timeout is an advisory failure like any other, never a hang; and the timer is cleared in `finally` on every exit, so a fast read leaves no live timer behind.
   - **covers —** `apps/desktop/src/backend/advisory.ts:61-74`
   - **proven by —** `apps/desktop/src/backend/advisory.test.ts:123` and `:212` (REAL, passing)
4. **`one-read-may-soften-its-own-budget-without-slowing-the-others`** — the cold-start fix is targeted, never a blanket raise
   - **asserts —** a read passing a per-call `timeoutMs` larger than the shared default SURVIVES a cold start that resolves past the shared budget but within its own (the fresh claim is returned, not dropped, and nothing is logged because a survived cold-start is not a failure); a read passing NO override, given the same slow start, still nulls at the shared default and logs the timeout. The override is per-call, so it cannot make a slow verdicts or activity read hold `/api/tree` longer on every poll.
   - **covers —** `apps/desktop/src/backend/advisory.ts:26-32,58`
   - **proven by —** `apps/desktop/src/backend/advisory.test.ts:183` and `:212` (REAL, passing)
5. **`the-retry-is-bounded-to-exactly-one-re-race`** — a genuinely down store still nulls promptly
   - **asserts —** with `retryOnce`, a read that fails every time invokes the read function exactly TWICE — the retry fires at most once and there is no unbounded loop — then falls through to the null-on-failure arm with ONE log line for the streak. So the cold-start tolerance cannot turn a down DB into a stalled route.
   - **covers —** `apps/desktop/src/backend/advisory.ts:80-85`
   - **proven by —** `apps/desktop/src/backend/advisory.test.ts:237` (REAL, passing)
6. **`the-route-answers-the-under-claiming-shape-on-the-wire`** — the advisory contract survives all the way to the client
   - **asserts —** a real `createLocalBackend` whose overlay seam is an advisory read over a THROWING store, served on a real `node:http` server, answers `GET /api/activity` with **HTTP 200** and `{ builds: null }` — never a 500, never a 404 — while the operator-visible log names the read and the cause. The forest under-claims; it does not error.
   - **covers —** `apps/desktop/src/backend/advisory.ts:46-96`
   - **proven by —** `apps/desktop/src/backend/advisory.test.ts:257` (REAL, passing)
