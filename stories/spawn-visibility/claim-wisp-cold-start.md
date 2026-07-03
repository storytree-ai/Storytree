---
id: "claim-wisp-cold-start"
tier: capability
story: spawn-visibility
title: "The claim wisp survives a cold-start — a softer per-read budget so a fresh claim is not dropped at 4s"
outcome: "The advisory reader gains a per-read budget (a timeout override and/or a single retry-once on cold-start) so the `inFlightClaims` read survives a DB cold-start that exceeds 4s and the fresh claim is not dropped — WITHOUT slowing the other four overlay reads or letting `/api/tree` hang."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [138, 33, 137]
# Node-borne proof config (ADR-0057 keystone). EDIT-EXISTING (editsExisting: true): advisory.ts already
# exists at HEAD (createAdvisoryReader, the shared overlay reader with a single timeoutMs ?? 4_000
# applied to every read). This increment EDITS it to give the claims read a SOFTER per-read budget — a
# per-read timeout override on the AdvisoryRead call and/or a single retry-once on a cold-start-shaped
# failure — WITHOUT changing the shared 4s the other four reads use. The leaf authors a NEW failing
# test injecting a slow fn (resolves after >4s but under the softened budget) — RED at HEAD because
# createAdvisoryReader nulls at 4s (the claim is dropped; the assertion that the claim survives fails
# at runtime — never a type-only red) — then EDITS advisory.ts (green). SINGLE LITERAL source file
# (advisory.ts) → default node:test proof, NO proofCommand needed; but a suite proofCommand is declared
# anyway to catch a regression in advisory.test.ts's existing cases across the same file. `install:
# true` + a typecheck wall (fresh worktree, ADR-0031 §2). Scope stays within apps/desktop/src/backend
# (ADR-0087) — backend-entry.ts's inFlightClaims WIRING (which read gets the softer budget) is the
# consumer; the advisory reader is the isolatable unit proven here. NOTE: advisory.ts uses fake/real
# timers — the test drives the slow fn deterministically (a controllable delayed promise), never a real
# multi-second wall-clock wait.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
  real:
    testFile: "apps/desktop/src/backend/advisory.test.ts"
    sourceFile: "apps/desktop/src/backend/advisory.ts"
    scope:
      testGlobs: ["apps/desktop/src/backend/advisory.test.ts"]
      sourceGlobs: ["apps/desktop/src/backend/advisory.ts"]
    editsExisting: true
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "desktop", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "desktop", "typecheck"]
---

# The claim wisp survives a cold-start — a softer per-read budget

**Outcome —** The advisory reader gains a per-read budget (a timeout override and/or a single
retry-once on cold-start) so the `inFlightClaims` read survives a DB cold-start that exceeds 4s and the
fresh claim is not dropped — WITHOUT slowing the other four overlay reads or letting `/api/tree` hang.

**Depends on —** nothing in-story (a root — the map-wisp arc, FIX 2b, couples to no other capability in
this story). Cross-story it edits `desktop-build-mount`'s advisory reader
(`apps/desktop/src/backend/advisory.ts`) consumed by `backend-entry.ts`'s `inFlightClaims` read, and
serves `wisp-as-story-claim`'s claim-wisp layer + `notice-board`'s claim primitive.

> **Proof status (honest) — `proposed`, EDIT-EXISTING, a narrow budget softening.** The 2026-07-03
> Phase-3 walk found the fresh claim wisp never lit: `createAdvisoryReader`
> (`apps/desktop/src/backend/advisory.ts`) applies a single 4s timeout to EVERY overlay read, and a DB
> cold-start (which can far exceed 4s) makes the `inFlightClaims` read time out and return null — the
> just-taken claim is silently dropped before the wisp can light. This capability gives the CLAIMS read
> a softer budget, leaving the other four reads' 4s untouched. Status stays `proposed` — `healthy` is
> only ever DERIVED from signed verdicts (ADR-0020), never authored.

## Guidance

PRESERVE THE ADVISORY CONTRACT — NULL ON FAILURE, NEVER A HANG (ADR-0033): every overlay read is
ADVISORY — null on ANY genuine failure (stopped DB, missing table, real timeout), never a throw, so a
down DB leaves the forest under-claiming rather than hanging `/api/tree`. This fix MUST preserve that:
a genuinely failing/absent claims read still returns null. What changes is ONLY the cold-start budget —
a claims read that is merely SLOW (a cold-start warming up) gets more room to succeed; a claims read
that genuinely fails still nulls. Get this wrong — making the claims read throw, or removing the
null-on-failure arm — and you reopen the exact `/api/tree` hang the advisory pattern exists to prevent.

ONLY THE CLAIMS READ GETS THE SOFTER BUDGET (the load-bearing scoping wall): the other four overlay
reads (verdicts / activity / presence / and the fifth) KEEP their 4s. A blanket raise of the shared
`timeoutMs` would make a slow verdicts/activity read hold `/api/tree` longer on every poll — the risk
the CLAUDE.md fix note calls out ("do not blanket-raise the shared 4s, which would risk hanging
/api/tree"). The softening is targeted: a per-read `timeoutMs` override passed on the `inFlightClaims`
`AdvisoryRead` call, and/or a single retry-once on a cold-start-shaped failure, applied to that ONE
read. The reader stays a shared factory; the claims read opts into the softer budget at its call site.

THE BUDGET SHAPE IS THE LEAF'S CALL, BOUNDED BY THE CONTRACTS (an-example-carries-its-discriminator):
the contracts pin the OUTCOME, not the mechanism. A per-read `timeoutMs` override (e.g. `claims` reads
with a larger budget), a single retry-once on cold-start (re-race the fn once before nulling), or both,
are all acceptable — the leaf chooses the MINIMAL one that passes. Do NOT over-build: no exponential
backoff, no per-read config surface beyond what `inFlightClaims` needs, no change to the other four
reads. The retry (if chosen) is ONCE — a second cold-start-shaped failure nulls, so a genuinely down DB
still nulls promptly and `/api/tree` never hangs on an unbounded retry loop.

DETERMINISTIC, NO WALL-CLOCK WAIT (the test discipline): `advisory.ts` races `fn()` against a
`setTimeout`. The test injects a CONTROLLABLE slow fn (a promise resolved on demand / a fake-timer-
advanced delay), never a real multi-second sleep — the proof runs in milliseconds and is deterministic.
The existing `advisory.test.ts` cases (the null-on-failure, the log-once-per-streak) stay green.

## Integration test

**Goal —** Prove the `inFlightClaims` read survives a slow-but-under-budget cold-start (returns the
claim, not null) via the softened per-read budget; that the other four reads keep their 4s (a slow
non-claims read still nulls at 4s); and that a genuinely failing claims read still returns null (the
advisory contract intact) — offline, over the real `createAdvisoryReader` with an injected slow fn and
controllable timers.

Exercised against its **real in-story collaborator** — the real `createAdvisoryReader`; the read `fn`
injected as a controllable slow/failing double (ADR-0010 §5). No real DB, no wall-clock wait.

The integration test would:

1. Build the reader; run the `inFlightClaims` read with an injected fn that resolves AFTER 4s but under
   the softened budget → assert the read returns the claim (NOT null) — the per-read override / retry
   let it survive the cold-start.
2. Run a NON-claims overlay read (e.g. `verdicts`) with the same slow fn → assert it STILL nulls at 4s
   (the shared budget is untouched for the other four reads) — `/api/tree` never waits longer for them.
3. Run the `inFlightClaims` read with an injected fn that GENUINELY fails (throws / never resolves
   within even the softened budget) → assert it returns null (never a throw), the ADR-0033 advisory
   contract preserved; and if a retry-once is used, assert the retry fires at most ONCE (no unbounded
   loop).

## Contracts (3)

1. **`cwc-claims-read-survives-cold-start`** — a slow-but-under-budget claims read returns the claim
   - **asserts —** the `inFlightClaims` read given a fn that resolves after 4s but within the softened
     budget returns the claim (NOT null) — the per-read timeout override and/or the single retry-once
     let a cold-starting DB's claim survive, so the fresh wisp is not dropped (ADR-0138). At HEAD this
     nulls at 4s (the RED).
   - **covers —** `apps/desktop/src/backend/advisory.ts` (the per-read budget / retry arm)
   - **proven by —** `apps/desktop/src/backend/advisory.test.ts` (net-new case, injected slow fn,
     controllable timers).
2. **`cwc-only-the-claims-read-gets-the-softer-budget`** — the other four reads keep their 4s
   - **asserts —** a NON-claims overlay read (verdicts / activity / presence / the fifth) given the
     same slow fn STILL nulls at the shared 4s budget — the softening is targeted to the `inFlightClaims`
     read at its call site, never a blanket raise of the shared `timeoutMs`, so `/api/tree` never waits
     longer for the other reads.
   - **covers —** `apps/desktop/src/backend/advisory.ts` (the shared-budget arm, unchanged for the
     other reads)
   - **proven by —** `apps/desktop/src/backend/advisory.test.ts`.
3. **`cwc-still-null-on-genuine-failure`** — the advisory null-on-failure contract is preserved
   - **asserts —** a GENUINELY failing/absent `inFlightClaims` read (throws, or never resolves within
     even the softened budget) still returns null — never a throw, so a down DB leaves the forest
     under-claiming rather than hanging `/api/tree` (ADR-0033); and any retry-once fires at most ONCE
     (a genuinely down DB nulls promptly, no unbounded loop).
   - **covers —** `apps/desktop/src/backend/advisory.ts` (the null-on-failure arm + the bounded retry)
   - **proven by —** `apps/desktop/src/backend/advisory.test.ts`.

## Guidance — the edit-existing slice that earns the signed verdict

The brownfield rung toward `healthy` (ADR-0057 §3, EDIT-EXISTING): `advisory.ts` already landed
(`createAdvisoryReader`, one `timeoutMs ?? 4_000` for every read). This increment EDITS it to give the
claims read a softer per-read budget, test-first.

- **The new test —** net-new cases in `apps/desktop/src/backend/advisory.test.ts` (the desktop suite;
  the existing file, extended). Inject a controllable slow/failing `fn`; drive the timers
  deterministically (fake timers / an on-demand-resolved promise); NO real DB, NO wall-clock sleep.
  Name each test for its contract id (`cwc-…`) so `storytree coverage` reports 3/3 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** `advisory.ts` EXISTS, so the red is a RUNTIME
  assertion, not module-not-found: run the claims read with a fn resolving after 4s and assert the
  claim survives (not null). At HEAD the reader nulls at 4s → the claim is dropped → red. ASSERT THE
  CLAIM SURVIVES, never just that the reader runs.
- **The GREEN —** EDIT `advisory.ts`: add a per-read `timeoutMs` override on the `AdvisoryRead`
  signature (or a `retryOnce` option) and/or apply it at the `inFlightClaims` call site in
  `backend-entry.ts` (the consumer wiring — the softer budget for that ONE read), leaving the shared 4s
  for the other four. After it, the claims-read-survives + other-reads-keep-4s + null-on-genuine-failure
  assertions hold, and `pnpm --filter desktop test` + typecheck stay green.

Rules:

- **Preserve null-on-failure** — a genuinely failing claims read still returns null, never a throw
  (`cwc-still-null-on-genuine-failure`, ADR-0033). `/api/tree` never hangs.
- **Scope the softening to the claims read** — the other four reads keep their 4s
  (`cwc-only-the-claims-read-gets-the-softer-budget`); never blanket-raise the shared `timeoutMs`.
- **Bounded retry** — if a retry-once is used, it fires at most ONCE; no unbounded loop, no exponential
  backoff.
- **Edit, don't fork** — the existing null-on-failure + log-once-per-streak behaviour is untouched
  except for the additive per-read budget; the existing `advisory.test.ts` cases stay green.
- **Deterministic proof** — controllable timers / on-demand promises, never a real multi-second wait.
