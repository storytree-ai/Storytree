---
id: "attempt-count-follows-the-unit"
tier: contract
story: drive-machinery
capability: work-verdict-event-log
arc: inner-loop-exit-arc
title: "A unit's attempt count and landing obligation read across every increment it was filed under"
outcome: "The durable attempt ledger folds a unit's whole history, so a retry filed under a new increment neither resets the consecutive-failure count nor hides a pending landing obligation, and ADR-0563 D5's relabel finding fires from that history."
status: proposed
proof_mode: contract-test
depends_on: []
decisions: [575, 563]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/orchestrator", "test"]
  scope:
    testGlobs: ["packages/orchestrator/src/proof/inner-loop-ledger.test.ts", "packages/orchestrator/src/store/pg-work-store.test.ts"]
    sourceGlobs: ["packages/orchestrator/src/proof/inner-loop-ledger.ts"]
  real:
    testFile: "packages/orchestrator/src/proof/inner-loop-ledger.test.ts"
    sourceFile: "packages/orchestrator/src/proof/inner-loop-ledger.ts"
    scope:
      testGlobs: ["packages/orchestrator/src/proof/inner-loop-ledger.test.ts", "packages/orchestrator/src/store/pg-work-store.test.ts"]
      sourceGlobs: ["packages/orchestrator/src/proof/inner-loop-ledger.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: node
      args:
        - "--import"
        - "./scripts/tsx-cache-off.mjs"
        - "--import"
        - "./packages/orchestrator/node_modules/tsx/dist/loader.mjs"
        - "--test"
        - "packages/orchestrator/src/proof/inner-loop-ledger.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "typecheck"]
---

# A unit's attempt count and landing obligation read across every increment it was filed under

**Outcome —** The durable attempt ledger folds a unit's whole history, so a retry filed under a new
increment neither resets the consecutive-failure count nor hides a pending landing obligation, and
ADR-0563 D5's relabel finding fires from that history.

## Proof walkthrough

Every event below is built with the file's existing helpers, extended to take the increment id
(`attempt("r1", "A")`, `pass("r1", "A")`, `grant("r3", "A", 2)`, `adjudication("r1", "land", "A")`
or an equivalent shape), stored with `stored(doc, seq)`, and folded with the NEW two-argument call
`foldInnerLoopLedger(events, "unit")`:

1. Three attempts under increment `A` (`r1`–`r3`) and a fourth under increment `B` (`r4`): the ledger
   reports `consecutiveFailures === 4`, `policy.disposition === "stop-and-decide"`,
   `policy.mintedPerAttempt === true` and `policy.increments` deep-equal to `["A", "B"]`. Today the
   same history read for increment `B` reports one failure and `proceed` — the bypass itself.
2. Six attempts alternating between `A` and `B`, then a grant bound to the sixth run and filed under
   that run's increment: the fold throws the existing owner-ceiling error (`/ceiling/`), because the
   count is the unit's, not the increment's.
3. An attempt and a signed pass under `A`, then an attempt under `B`: the fold throws
   `/unresolved signed pass r1 blocks another attempt/`.
4. An attempt, a signed pass and a `land` adjudication under `A`, with nothing after: the policy reads
   `signed`. Append two attempts under `B` (`r2`, `r3`): the fold does NOT throw; it reports
   `consecutiveFailures === 2`, `policy.disposition === "proceed"`, `policy.mintedPerAttempt === false`
   and an empty `unresolvedSignedRuns`.
5. Attempts under `A` then `B`: `ledger.attempts` deep-equals
   `[{ runId: "r1", incrementId: "A", signed: false }, { runId: "r2", incrementId: "B", signed: false }]`.
6. An attempt `r1` under `A` and a signed pass for `r1` filed under `B`: the fold throws an error whose
   message contains `filed under increment`. The same holds for a grant or an adjudication whose
   increment differs from its run's attempt.

Before the source change, every step fails with an assertion: the two-argument call leaves the old
fold scoping to an `undefined` increment, so it skips every row and reads an empty ledger (no count,
no throw, no attempts). After it, all six pass.

## Guidance

**Decided by ADR-0575 D2** (read it: `storytree library artifact adr-0575`), implementing ADR-0563
D4/D5. `foldInnerLoopLedger` currently scopes its rows to ONE `(unitId, incrementId)` pair and skips
every other increment's rows (`parseLedgerEvents` / `looseLedgerScope`). A retry filed under a second
increment therefore reads zero prior failures, so attempt three's decision point and the owner ceiling
(`ATTEMPT_CEILING`, 6) can be walked past, and `decideAttempt`'s `mintedPerAttempt` can never fire
from durable history, because every attempt the fold hands it carries the one increment it was scoped
to. The store read in `pg-work-store.ts` already returns every row; the scoping is the fold's alone.

**The API change, exactly.**
- `foldInnerLoopLedger(events, unitId)` and `readInnerLoopLedger(store, unitId)` — the increment
  parameter is REMOVED, not ignored. A parameter that no longer scopes anything would read as if it did.
- `InnerLoopAttempt` gains `readonly incrementId: string`, taken from the attempt event.
- `looseLedgerScope` scopes by unit alone: a row whose `unitId` is another non-blank string is skipped
  before strict parsing; a row with a missing or blank `unitId` still reaches the strict validator and
  throws, and so does a row for THIS unit with a missing or blank `incrementId`.
- `decideAttempt` receives each attempt's OWN `incrementId`, never one supplied by the caller.
- The durable identity (`innerLoopEventId`) and `appendInnerLoopEvent` do not change.

**The loop's boundaries.** A signed pass still resets the count and extinguishes a live grant, as
today. A `rework` or `refuse` adjudication still reopens the policy after the adjudicated attempt, as
today. A landing adjudication (`land`, `land-and-measure`, `land-and-declare-gap`) CLOSES the loop:
with nothing after it the policy still reads `signed`, and a later attempt — under any increment —
opens a fresh loop whose count starts from that attempt, instead of throwing "landed signed pass …
closes the attempt loop" forever. `decideAttempt` receives only the current loop's attempts, so its
`mintedPerAttempt` reports a relabel inside one loop and never across a landing.

**An event binds its run's increment.** A `signed-pass`, `grant` or `adjudication` names a run that
already has an attempt; it must carry that attempt's `incrementId`. A mismatch throws, naming the run
and both increments, with `filed under increment` in the message. Run ids stay unique across the
unit's whole history, so the existing duplicate-attempt refusal now also catches the same run filed
under two increments.

**Existing tests to update (they are in your write scope).** Every call in
`inner-loop-ledger.test.ts` moves to the two-argument form, and `ledger.attempts` assertions gain
`incrementId`. **Keep every existing test's title byte-for-byte, even where its wording could be
tightened — change only its body.** This proof is observed per test, and a test counts as NEW exactly
when its title was not in the file before you started; a new test that already passes before the
source changes is refused (ADR-0572 D1). The first attempt (run `real-mu40l2p8`) failed closed at
CONFIRM_RED on exactly that: it renamed `fold rejects malformed selected or ambiguous-scope
inner-loop rows`, whose assertions still pass against the current source, and the renamed test was
refused as an early pass. A pre-existing test may pass or fail at red; only green holds it. The test titled `a landing adjudication closes the loop instead of silently reopening
it` asserts the behaviour this contract reverses: replace it with the step-4 test rather than keeping
both. In `packages/orchestrator/src/store/pg-work-store.test.ts`, the two calls
`readInnerLoopLedger(fresh, "u1", "inc")` and `foldInnerLoopLedger(written, "u1", "inc")` move to the
two-argument form; change nothing else in that file. The package typecheck runs before signing, so a
leftover three-argument call refuses the verdict even though the proof passes.

**Out of scope.** Do not change `packages/orchestrator/src/proof/inner-loop-exit.ts`,
`packages/proof-protocol`, `pg-work-store.ts` or the SQL schema. Nothing yet records attempts from a
paid build; that is `production-builds-enforce-the-inner-loop-exit`, which lands after this. A retry
filed under a new increment immediately AFTER a `rework` or `refuse` adjudication still counts (the
count is the unit's), but `mintedPerAttempt` does not report it, because the reopened attempt sits
outside the policy window; that is recorded as a known limit, not built here.

## Contracts (4)

1. **`a-relabelled-retry-keeps-the-count`** — the consecutive-failure count and the owner ceiling read across every increment a unit's attempts were filed under.
   - **asserts —** walkthrough steps 1 and 2: three failures under `A` and a fourth under `B` fold to `consecutiveFailures === 4`, `policy.disposition === "stop-and-decide"`, `policy.mintedPerAttempt === true` and `policy.increments` equal to `["A", "B"]`; six failures spanning `A` and `B` make a grant on the sixth run throw the owner-ceiling error. Test titles are STATIC strings beginning `a-relabelled-retry-keeps-the-count: `, and each executes a real assertion.
   - **covers —** `packages/orchestrator/src/proof/inner-loop-ledger.ts` (`foldInnerLoopLedger`, `parseLedgerEvents`, `looseLedgerScope`).
   - **proven by —** authored additions to `packages/orchestrator/src/proof/inner-loop-ledger.test.ts` through the declared focused REAL proof.
2. **`a-landing-obligation-follows-the-unit`** — an unresolved signed pass blocks another attempt on its unit whichever increment the attempt is filed under.
   - **asserts —** walkthrough step 3: an attempt and signed pass under `A` followed by an attempt under `B` throws `/unresolved signed pass r1 blocks another attempt/`. Test titles begin `a-landing-obligation-follows-the-unit: `.
   - **covers —** `packages/orchestrator/src/proof/inner-loop-ledger.ts` (`foldInnerLoopLedger`).
   - **proven by —** authored additions to `packages/orchestrator/src/proof/inner-loop-ledger.test.ts`.
3. **`a-landed-pass-starts-a-fresh-count`** — a landing adjudication closes the loop, and later work on the same unit starts a fresh count instead of being refused forever.
   - **asserts —** walkthrough step 4: attempt, signed pass and `land` adjudication under `A` read `policy.disposition === "signed"`; two later attempts under `B` fold without throwing to `consecutiveFailures === 2`, `policy.disposition === "proceed"`, `policy.mintedPerAttempt === false` and `unresolvedSignedRuns` equal to `[]`. Test titles begin `a-landed-pass-starts-a-fresh-count: `.
   - **covers —** `packages/orchestrator/src/proof/inner-loop-ledger.ts` (`foldInnerLoopLedger`).
   - **proven by —** authored additions to `packages/orchestrator/src/proof/inner-loop-ledger.test.ts`; the reversed test `a landing adjudication closes the loop instead of silently reopening it` is replaced.
4. **`every-ledger-event-keeps-its-own-increment`** — each attempt reports the increment it was filed under, and an event that binds a run must carry that run's increment.
   - **asserts —** walkthrough steps 5 and 6: `ledger.attempts` carries each attempt's `incrementId`; a signed pass, a grant and an adjudication each filed under a different increment from their run's attempt each throw an error containing `filed under increment`. Test titles begin `every-ledger-event-keeps-its-own-increment: `.
   - **covers —** `packages/orchestrator/src/proof/inner-loop-ledger.ts` (`InnerLoopAttempt`, `foldInnerLoopLedger`).
   - **proven by —** authored additions to `packages/orchestrator/src/proof/inner-loop-ledger.test.ts`.
