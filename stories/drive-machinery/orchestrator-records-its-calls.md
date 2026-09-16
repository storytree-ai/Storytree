---
id: "orchestrator-records-its-calls"
tier: contract
story: drive-machinery
capability: build-drive-cli
arc: inner-loop-exit-arc
title: "Record the orchestrator's grants and adjudications, and read a unit's attempts"
outcome: "A grant of further attempts and the adjudication of a signed pass reach the attempt ledger only when the attempt policy and the landing ruler admit them, bound to the run and increment the ledger already holds, and a unit's fold reads back as plain lines."
status: proposed
proof_mode: contract-test
depends_on: [attempt-count-follows-the-unit]
decisions: [576, 575, 563]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/inner-loop-verbs.test.ts"]
    sourceGlobs: ["packages/cli/src/inner-loop-verbs.ts"]
  real:
    testFile: "packages/cli/src/inner-loop-verbs.test.ts"
    sourceFile: "packages/cli/src/inner-loop-verbs.ts"
    scope:
      testGlobs: ["packages/cli/src/inner-loop-verbs.test.ts"]
      sourceGlobs: ["packages/cli/src/inner-loop-verbs.ts"]
    install: true
    editsExisting: false
    proofCommand:
      file: bun
      args:
        - "test"
        - "--preload"
        - "./scripts/tsx-cache-off.mjs"
        - "--timeout"
        - "300000"
        - "./packages/cli/src/inner-loop-verbs.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/cli", "typecheck"]
---

# Record the orchestrator's grants and adjudications, and read a unit's attempts

**Outcome —** A grant of further attempts and the adjudication of a signed pass reach the attempt
ledger only when the attempt policy and the landing ruler admit them, bound to the run and increment
the ledger already holds, and a unit's fold reads back as plain lines.

## Proof walkthrough

**Fixtures.** Every ledger is an `InMemoryStore` filled through `appendInnerLoopEvent` from
`@storytree/orchestrator`, using the protocol's own event shapes: `attempt`, `signed-pass`, `grant`
and `adjudication`. The unit is `u1`, the increments are `inc-a` and `inc-b`, and the runs are
`r1`…`r6`. The **throwing ledger** is an `InMemoryStore` subclass whose `readEvents` throws
`new Error("ledger-down-marker")`. The **orphan ledger** holds one `grant` on run `r9` with no attempt,
so folding it throws `grant references no recorded attempt: r9`. "The inner-loop events" means
`(await store.readEvents()).filter((e) => e.kind === INNER_LOOP_EVENT_KIND)`.

1. **A grant's content is judged before anything is read.** Each call below goes to the throwing
   ledger, returns `ok: false`, and its `reason` never contains `ledger-down-marker`:
   - `kind: "vibes"`: the reason contains `changed-input`, `fixed-defect`, `new-observation` and
     `revised-test`.
   - `kind: "better-spec"`, `attempts: 1`, `difference: "a new fixture"`: the reason equals
     `decideAttempt`'s reason for that grant over three unsigned attempts. It contains
     `"a better spec" does not count as different (ADR-0563 D4)`.
   - `difference: "   "`: the reason contains `the grant states no difference`.
   - `attempts` of `0`, `-1` and `1.5`: each reason contains `grants nothing`.

   The same `better-spec` grant, sent to a real ledger holding two failed attempts and then to one
   holding six, still returns that same D4 reason. It is never a schema error, and neither ledger
   gains an inner-loop event.
2. **The fold's refusals.** Each call sends the valid grant
   `{ unitId: "u1", attempts: 1, kind: "fixed-defect", difference: "a fixed defect" }` and returns
   `ok: false`. In every real-ledger case, the count of inner-loop events is unchanged:
   - an empty ledger: the reason contains `u1` and `no recorded attempt`;
   - `r1` and `r2` under `inc-a`: the reason contains `grant is early: the decision point is three failures`;
   - `r1`–`r3`, a grant of 2 on `r3`, then `r4`: the reason contains `grant overlaps a live grant`;
   - `r1`–`r6`: the reason contains `grant exceeds the owner ceiling of 6 failures`;
   - the throwing ledger: the reason contains `ledger-down-marker`;
   - the orphan ledger: the reason contains `grant references no recorded attempt: r9`.
3. **A valid grant binds the latest failed run and that run's own increment.** The ledger holds
   `r1` and `r2` under `inc-a` and `r3` under `inc-b`. Send the grant
   `{ unitId: "u1", attempts: 2, kind: "changed-input", difference: "a new fixture", actor: "orchestrator@example.com" }`.
   - It returns `ok: true`.
   - `result.event` deep-equals
     `{ event: "grant", unitId: "u1", incrementId: "inc-b", runId: "r3", attempts: 2, kind: "changed-input", difference: "a new fixture" }`.
   - `result.ledger.remainingGrantCount` is `2` and `result.ledger.policy.disposition` is `"granted"`,
     and a fresh `readInnerLoopLedger(store, "u1")` agrees.
   - Exactly one inner-loop event was added, and its `actor` is `orchestrator@example.com`.
4. **Adjudicate refuses without an unresolved signed pass.** Every call returns `ok: false`. The
   `reach` spy is never called, and no real ledger gains an inner-loop event.
   - These go to the throwing ledger, and none of their reasons contains the marker:
     - an objection of kind `vibes`: the reason contains `test-quality`, `rule-violation` and
       `surviving-mutants`;
     - a `test-quality` objection with statement `"  "`: the reason contains `statement`;
     - a `surviving-mutants` objection with `survivors` of `-1`, then `1.5`: each reason contains
       `survivors`.
   - A ledger holding only the unsigned attempt `r1`: run `r1` gives a reason containing `r1` and
     `unresolved signed pass`, and run `r9` gives one containing `r9` and `unresolved signed pass`.
   - `r1`, a signed pass on `r1`, and a `land` adjudication of `r1`: run `r1` gives a reason
     containing `unresolved signed pass`.
   - The throwing ledger with a valid input: the reason contains `ledger-down-marker`.
5. **Adjudicate records exactly what the ruler returns.** Each case uses a fresh ledger: `r1` under
   `inc-a`, `r2` under `inc-b`, and a signed pass on `r2`. It adjudicates run `r2`. The `reach` spy
   returns the stated boolean and records every unit id it is asked about. The cases:

   | objection | reach | disposition |
   |---|---|---|
   | none | `true` | `land` |
   | `test-quality` | `true` | `land-and-measure` |
   | `test-quality` | `false` | `land-and-declare-gap` (with `escalates: true`) |
   | `rule-violation`, decision `ADR-0232 D5` | `true` | `refuse` |
   | `rule-violation`, no decision | `true` | `land-and-measure`, carrying `inadmissible` |
   | `surviving-mutants`, `survivors: 2` | `true` | `rework` |
   | `surviving-mutants`, `survivors: 0` | `true` | `land` |

   In every case:
   - `result.adjudication` deep-equals
     `adjudicateLanding({ unitId: "u1", signed: true, objection, strengthSignalAvailable })`, which
     the test computes itself;
   - `result.event` deep-equals
     `{ event: "adjudication", unitId: "u1", incrementId: "inc-b", runId: "r2", disposition, mayRefuse, escalates, reason }`,
     plus `inadmissible` exactly when the adjudication carries one, and `namedRule: "ADR-0232 D5"`
     exactly for `refuse`;
   - the spy was asked about `"u1"`;
   - a fresh fold no longer lists `r2` in `unresolvedSignedRuns`, and its last adjudication carries
     that disposition.

   Separately, `strengthSignalFromTestScript` returns `runnerFor(script) !== null` for four inputs:
   `"bun test --timeout 300000 src/"` (true), `"vitest run"` (true),
   `'node --import tsx --test "src/**/*.test.ts"'` (false) and `undefined` (false).
6. **Attempts render the fold.**
   - An empty ledger gives `ok: true` with `lines` deep-equal to `["u1: no recorded attempts"]`.
   - `r1` under `inc-a`, `r2` under `inc-b`, and a signed pass on `r2`: `lines[0]` equals
     `` `u1: 2 attempt(s), 0 consecutive failure(s) — policy signed: ${ledger.policy.reason}` ``.
     The lines include `"  r1  increment inc-a  unsigned"`, `"  r2  increment inc-b  signed"` and
     `"  owed: storytree node adjudicate u1 --run r2 --pg"`.
   - After a `land` adjudication of `r2`, the lines include `"  adjudicated r2: land"` and no line
     containing `owed:`.
   - `r1`–`r3` with a grant of 2 on `r3`: the lines include `"  live grant: 2 attempt(s) remain"`.
   - The throwing ledger gives `ok: false` with a reason containing `ledger-down-marker`. The orphan
     ledger gives one containing `grant references no recorded attempt: r9`.

Before the source exists, the test file cannot load, because it imports the missing module. That is
this net-new unit's structural red. After it, every step passes.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (5)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

**Decided by ADR-0576 D3** (`storytree library artifact adr-0576`), implementing ADR-0563 D1–D4. The
build records only what the spine observed: an attempt and a signed pass. The orchestrator's own two
calls, a grant and an adjudication, are recorded by the `node` verbs, and this unit is their pure core.

- **The module.** A NEW `packages/cli/src/inner-loop-verbs.ts` exports:
  - `type InnerLoopVerbRefusal = { readonly ok: false; readonly reason: string }`;
  - `recordNodeGrant(store: Store, input: NodeGrantInput): Promise<NodeGrantResult>`, where
    `NodeGrantInput` is `{ unitId: string; attempts: number; kind: string; difference: string; actor?: string }`,
    all fields readonly, and `NodeGrantResult` is
    `{ ok: true; event: InnerLoopEventDoc; ledger: InnerLoopLedger } | InnerLoopVerbRefusal`;
  - `recordNodeAdjudication(store: Store, input: NodeAdjudicateInput, reach: StrengthSignalReach): Promise<NodeAdjudicateResult>`,
    where:
    - `NodeAdjudicateInput` is
      `{ unitId: string; runId: string; objection?: { kind: string; statement: string; decision?: string; survivors?: number }; actor?: string }`;
    - `StrengthSignalReach` is `(unitId: string) => boolean`;
    - `NodeAdjudicateResult` is
      `{ ok: true; adjudication: LandingAdjudication; event: InnerLoopEventDoc } | InnerLoopVerbRefusal`;
  - `readNodeAttempts(store: Pick<Store, "readEvents">, unitId: string): Promise<NodeAttemptsResult>`,
    where `NodeAttemptsResult` is `{ ok: true; ledger: InnerLoopLedger; lines: string[] } | InnerLoopVerbRefusal`;
  - `strengthSignalFromTestScript(testScript: string | undefined): boolean`, which is exactly
    `runnerFor(testScript) !== null` (`./mutation-diff.js`). ADR-0576 D3 reads the strength signal
    from the one classifier that owns it. The production composition that maps a unit to its
    package's test script belongs to the dispatch unit, which injects the result as `reach`.

  Every refusal is a returned value. No verb throws, and a store error becomes a refusal quoting its
  message.

- **The grant, in this order.**
  1. A `kind` outside `decideAttempt`'s five (`changed-input`, `fixed-defect`, `new-observation`,
     `revised-test`, `better-spec`) refuses before anything else, with
     `unknown grant kind "<kind>" — expected changed-input, fixed-defect, new-observation or revised-test`.
     `better-spec` passes this check on purpose, so that step 2 refuses it with ADR-0563 D4's reason.
  2. **The content is judged by `decideAttempt`, over a history AT the decision point:**
     `decideAttempt({ unitId, attempts: <ATTEMPT_DECISION_POINT unsigned attempts under one increment>, grant })`.
     A `refused` disposition refuses with exactly that `reason`.
     - Why a synthetic history: `decideAttempt` checks the ceiling and the early count BEFORE the
       grant's content, so over the unit's real history an early or at-ceiling `better-spec` grant
       would come back `proceed` or `escalate`. It would then reach the event schema.
     - Content is a property of the grant alone. The count is the fold's to judge, in step 5.
     - This happens before any read, which is why step 1 of the walkthrough sends it to a throwing
       ledger.
  3. Read `store.readEvents()` once and fold it with `foldInnerLoopLedger(events, unitId)`. A throw
     from either refuses with `the attempt ledger could not be read: <message>`.
  4. No recorded attempt refuses with `<unitId> has no recorded attempt for a grant to bind`.
  5. Build the candidate `grant` doc from the ledger's LATEST attempt: its `runId`, and its
     `incrementId` (trap 7 below). **Judge the candidate against the fold BEFORE appending it.**
     - Fold `[...events, { id: innerLoopEventId(candidate), kind: INNER_LOOP_EVENT_KIND, type: "created", doc: candidate, seq: <one past the highest seq read> }]`
       for the unit.
     - A throw refuses with exactly its message. That is the fold's reason for an early, overlapping
       or at-ceiling grant.
     - The order matters: `appendInnerLoopEvent` validates the schema but never folds. An appended
       grant the fold rejects cannot be removed, and it would make every later read of the unit
       throw.
  6. Append with `appendInnerLoopEvent(store, candidate, input.actor)`, passing the actor only when
     it is supplied. A throw refuses quoting the message. On success, return the stored doc and a
     re-read ledger.

- **The adjudication, in this order.**
  1. Validate the objection, when one is supplied, before any read:
     - a kind other than `test-quality`, `rule-violation` or `surviving-mutants` refuses, naming the
       three;
     - a blank `statement` refuses, naming `statement`;
     - a `survivors` value that is not a whole number of zero or more refuses, naming `survivors`.
  2. Read and fold, as the grant does.
  3. If `runId` is not in `ledger.unresolvedSignedRuns`, refuse with
     `run <runId> holds no unresolved signed pass for <unitId> — nothing to adjudicate (ADR-0576 D3)`.
  4. Call `reach(unitId)`, then `adjudicateLanding({ unitId, signed: true, objection, strengthSignalAvailable })`.
     `objection` carries only the keys that were supplied (`exactOptionalPropertyTypes`).
  5. Append `{ event: "adjudication", unitId, incrementId, runId, disposition, mayRefuse, escalates, reason }`:
     - `incrementId` is the increment of that run's attempt, read from `ledger.attempts`;
     - `inadmissible` is added only when the adjudication carries one;
     - `namedRule` is the trimmed `decision`, added only when the disposition is `refuse`.

     The protocol refuses a `refuse` without a `namedRule`, and a `namedRule` on any other disposition.

  **Record the ruler's result as it is returned; never second-guess it.** A `rule-violation` naming
  no decision is not refused here. `adjudicateLanding` rules it an opinion wearing a rule's clothes
  (ADR-0563 D2), and the resulting inadmissible landing is what gets recorded. A `refuse` needs a
  named decision, and that requirement is the ruler's to enforce. The verb never adjudicates on its
  own, and a missing objection records `land`.

- **Attempts.** Read and fold as above, refusing the same way. The lines, in order:
  - with no attempts, the single line `<unitId>: no recorded attempts`;
  - otherwise, a first line
    `<unitId>: <attempts.length> attempt(s), <consecutiveFailures> consecutive failure(s) — policy <policy.disposition>: <policy.reason>`;
  - one line per attempt: `  <runId>  increment <incrementId>  <signed|unsigned>`;
  - one line per adjudication: `  adjudicated <runId>: <disposition>`;
  - when `remainingGrantCount > 0`: `  live grant: <remainingGrantCount> attempt(s) remain`;
  - one line per unresolved signed run: `  owed: storytree node adjudicate <unitId> --run <runId> --pg`.

  Every indented line starts with two spaces, and the fields inside it are separated by two spaces.

- **Traps from the plan, as they bear on this unit.**
  - **Trap 7: a grant carries its bound run's increment.** It comes from the ledger, never from an
    input. The fold throws `filed under increment` otherwise, and step 3 of the walkthrough puts the
    latest run under a different increment to catch exactly that.
  - **Trap 8: `better-spec` is not in the protocol's kind enum.** Validated after the schema, it would
    refuse as a zod error instead of ADR-0563 D4's reason.
  - **Appends fail closed.** A failed append is a refusal the caller sees. Do not copy the advisory
    usage and scope appends in `node-build.ts`, which swallow failures.
  - **Keep existing test titles byte-for-byte.** No existing test file is in this unit's scope; edit
    none.
  - **Each new refusal sits after every existing cheap refusal.** That constraint binds the dispatch
    unit that wires these verbs into `commands.ts`, not this module. Nothing here is registered.

- **The test file.** `packages/cli/src/inner-loop-verbs.test.ts` is NEW.
  - **This is a net-new unit, so its red is STRUCTURAL.** Import the verbs BY NAME in a static
    top-level `import { … } from "./inner-loop-verbs.js"`. At red, the file then fails to load and
    executes no assertion. A net-new red that runs an assertion is refused as the wrong kind of red,
    so do not reach the module through a dynamic `import()` inside a test.
  - Use flat `test(...)` calls from `node:test`, with no `describe`. Each title is ONE static string
    literal beginning `<contract-id>: `, with no concatenation, no template and no `.each`.
  - Loops over cases go INSIDE a test.
  - Assert with `node:assert/strict`; the proof counts those assertions.
  - Every test must pass at green.
  - Other available imports:
    - `InMemoryStore` and `type StoreEvent` from `@storytree/storage-protocol`;
    - `INNER_LOOP_EVENT_KIND` from `@storytree/proof-protocol`;
    - `appendInnerLoopEvent`, `readInnerLoopLedger`, `foldInnerLoopLedger`, `decideAttempt`,
      `adjudicateLanding` and `ATTEMPT_DECISION_POINT` from `@storytree/orchestrator`;
    - `runnerFor` from `./mutation-diff.js`.
- **Before signing.** The `@storytree/cli` typecheck and the whole `@storytree/cli` suite run as the
  backstop. That suite includes the live contract-coverage sweep, which counts this spec's contracts
  as covered only when a vouching test title names each contract id.

## Out of scope

- The `node attempts|grant|adjudicate` dispatch, their `CLI_OPTIONS`, `@path` classification in
  `packages/cli/src/at-path.ts`, `--pg` gating, and the production `reach` composition (unit → spec →
  package test script → `strengthSignalFromTestScript`). They belong to the later `node-verbs-dispatch`
  unit.
- ADR-0576 D8's entry state and its renderer, which live in `build-entry-refuses-before-spend`. The
  attempts lines here render only the fold.
- Any change to `packages/orchestrator/src/proof/inner-loop-ledger.ts`, `inner-loop-exit.ts`,
  `packages/proof-protocol/src/inner-loop-event.ts` or `pg-work-store.ts`.
- An owner-grant event above the ceiling. ADR-0576's closing section defers it until an owner answer
  first asks for more attempts on the same unit.

## Contracts (5)

1. **`node-grant-refuses-an-inadmissible-grant`** — the grant verb refuses a grant the attempt policy or the fold would refuse, and appends nothing.
   - **asserts —** `recordNodeGrant` refuses an unknown kind naming the four protocol kinds. Before any ledger read, it refuses a `better-spec`, blank-difference or non-positive or non-integer grant with `decideAttempt`'s reason at the decision point, never a schema error, whatever the unit's count. After the read, it refuses a unit with no recorded attempt, and an early, overlapping or at-ceiling grant with the fold's own message. It refuses an unreadable or corrupt ledger quoting the error. In every refusal the ledger gains no inner-loop event. Test titles begin `node-grant-refuses-an-inadmissible-grant: `.
   - **covers —** `recordNodeGrant` (`packages/cli/src/inner-loop-verbs.ts`).
   - **proven by —** `packages/cli/src/inner-loop-verbs.test.ts`, through the declared focused bun REAL proof.
2. **`node-grant-binds-the-latest-failed-run`** — an admissible grant is appended bound to the unit's latest failed run and to the increment that run was filed under.
   - **asserts —** with `r1` and `r2` under `inc-a` and `r3` under `inc-b`, `recordNodeGrant` returns `ok: true`. Its event deep-equals `{ event: "grant", unitId: "u1", incrementId: "inc-b", runId: "r3", attempts: 2, kind: "changed-input", difference: "a new fixture" }`, and its ledger and a fresh read both report `remainingGrantCount` 2 and policy `granted`. Exactly one inner-loop event was added, carrying the supplied actor. Test titles begin `node-grant-binds-the-latest-failed-run: `.
   - **covers —** `recordNodeGrant` (`packages/cli/src/inner-loop-verbs.ts`).
   - **proven by —** `packages/cli/src/inner-loop-verbs.test.ts`.
3. **`node-adjudicate-refuses-without-an-unresolved-signed-pass`** — the adjudicate verb refuses a malformed objection before reading, and a run that holds no unresolved signed pass after.
   - **asserts —** `recordNodeAdjudication` refuses an unknown objection kind naming the three kinds, a blank statement, and a negative or non-integer `survivors`, before any ledger read. It refuses a run with no attempt, an unsigned run and an already-adjudicated run, each with a reason naming the run and `unresolved signed pass`. It refuses an unreadable ledger quoting the error. In every refusal it calls `reach` never and appends nothing. Test titles begin `node-adjudicate-refuses-without-an-unresolved-signed-pass: `.
   - **covers —** `recordNodeAdjudication` (`packages/cli/src/inner-loop-verbs.ts`).
   - **proven by —** `packages/cli/src/inner-loop-verbs.test.ts`.
4. **`node-adjudicate-records-the-landing-ruler`** — an unresolved signed pass is adjudicated by `adjudicateLanding` with the injected strength signal, and exactly that result is recorded against the run's increment.
   - **asserts —** for no objection, `test-quality` with and without reach, `rule-violation` with and without a named decision, and `surviving-mutants` with 2 and with 0 survivors, the result's adjudication deep-equals `adjudicateLanding`'s own output. The recorded event carries the run's increment, the disposition, `mayRefuse`, `escalates` and `reason`, plus `inadmissible` exactly when present and `namedRule` exactly for `refuse`. `reach` is asked about the unit, and the run leaves `unresolvedSignedRuns`. `strengthSignalFromTestScript` equals `runnerFor(script) !== null` for a bun script, a vitest script, the orchestrator's node script and `undefined`. Test titles begin `node-adjudicate-records-the-landing-ruler: `.
   - **covers —** `recordNodeAdjudication` and `strengthSignalFromTestScript` (`packages/cli/src/inner-loop-verbs.ts`).
   - **proven by —** `packages/cli/src/inner-loop-verbs.test.ts`.
5. **`node-attempts-renders-the-fold`** — a unit's ledger reads back as a summary line, one line per attempt and adjudication, the live grant, and each owed adjudication command.
   - **asserts —** `readNodeAttempts` returns `["u1: no recorded attempts"]` for an empty ledger. For a history, it returns the summary line carrying the attempt count, the consecutive failures, the policy disposition and the policy's reason, then `  <run>  increment <increment>  signed|unsigned` per attempt, `  adjudicated <run>: <disposition>` per adjudication, `  live grant: <n> attempt(s) remain` while a grant is live, and `  owed: storytree node adjudicate <unit> --run <run> --pg` per unresolved signed run. It refuses an unreadable or corrupt ledger quoting the error. Test titles begin `node-attempts-renders-the-fold: `.
   - **covers —** `readNodeAttempts` (`packages/cli/src/inner-loop-verbs.ts`).
   - **proven by —** `packages/cli/src/inner-loop-verbs.test.ts`.
