---
id: "build-entry-refuses-before-spend"
tier: contract
story: drive-machinery
capability: build-drive-cli
arc: inner-loop-exit-arc
title: "Resolve a paid build's increment and preflight its units against the attempt ledger before spend"
outcome: "A paid REAL entry can resolve the increment it was handed and preflight every unit it will drive against the attempt ledger from injected read handles, refusing a missing or closed increment, a unit past its decision point or ceiling, an unresolved signed pass, a rebuild under a landed increment and a mispaired grant, and it renders every outcome through one typed entry state."
status: proposed
proof_mode: contract-test
depends_on: [attempt-count-follows-the-unit]
decisions: [576, 575, 563]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/inner-loop-entry.test.ts"]
    sourceGlobs: ["packages/drive/src/inner-loop-entry.ts", "packages/drive/src/index.ts"]
  real:
    testFile: "packages/drive/src/inner-loop-entry.test.ts"
    sourceFile: "packages/drive/src/inner-loop-entry.ts"
    scope:
      testGlobs: ["packages/drive/src/inner-loop-entry.test.ts"]
      sourceGlobs: ["packages/drive/src/inner-loop-entry.ts", "packages/drive/src/index.ts"]
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
        - "./packages/drive/src/inner-loop-entry.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# Resolve a paid build's increment and preflight its units against the attempt ledger before spend

**Outcome —** A paid REAL entry can resolve the increment it was handed and preflight every unit it
will drive against the attempt ledger from injected read handles. It refuses a missing or closed
increment, a unit past its decision point or ceiling, an unresolved signed pass, a rebuild under a
landed increment and a mispaired grant. It renders every outcome through one typed entry state.

## Proof walkthrough

**Fixtures.**
- **The corpus** is an `InMemoryStore` holding these rows, each written with `upsertDoc`:
  - `inc-proposal`, `inc-ready`, `inc-active` and `inc-closed`, each of kind `increment` with doc
    `{ kind: "increment", arcRef: "asset:some-arc", status: <that status> }`;
  - `inc-nostatus`, the same doc without `status`;
  - `some-arc`, of kind `arc` with doc `{ kind: "arc" }`.
- **Every ledger** is a separate `InMemoryStore` filled with `appendInnerLoopEvent` from
  `@storytree/orchestrator`. Units are `u1`, `u2` and `u3`, increments `inc-a` and `inc-b`, and runs
  `r1`…`r6`.
  - A **grant of N on rK** is `{ event: "grant", unitId, incrementId, runId: "rK", attempts: N, kind, difference: "a new fixture" }`.
    Its kind is `changed-input` unless a step names another.
  - A **land** adjudication is `{ event: "adjudication", …, disposition: "land", mayRefuse: false, escalates: false, reason: "landed" }`.
  - A **rework** adjudication is `{ …, disposition: "rework", mayRefuse: true, escalates: false, reason: "mutants survived" }`.
- **The throwing handles** are `{ getDoc: async () => { throw new Error("corpus-down-marker"); } }`
  and `{ readEvents: async () => { throw new Error("ledger-down-marker"); } }`.
- **The orphan ledger** holds one grant on `r9` for `u1` with no attempt, so folding `u1` throws
  `grant references no recorded attempt: r9`.
- **"Refused with kind K"** means the call returns `ok: false` and `state.state === "refused"`, and
  that `state.refusals` holds exactly the refusals listed, in order.

1. **The increment.** `resolveBuildIncrement(corpus, id)`:
   - `undefined`, `""` and `"   "` are each refused with one `increment-missing` refusal whose reason
     contains `--increment`.
   - `"no-such-increment"` is refused with `increment-unknown`. The reason contains
     `no-such-increment` and `--increment`.
   - `"some-arc"` is refused with `increment-wrong-kind`. The reason contains `some-arc`, `arc` and
     `--increment`.
   - `"inc-closed"` is refused with `increment-closed`. The reason contains `inc-closed`, `closed` and
     `--increment`.
   - For each of those four refusals, `renderInnerLoopEntryState(state).next` deep-equals
     `["storytree arc list --pg"]`.
   - `"inc-proposal"`, `"inc-ready"` and `"inc-active"` return `{ ok: true, incrementId, status }`
     with their own status. `"inc-nostatus"` returns status `"proposal"`.
   - The throwing corpus is refused with `increment-unreadable`. The reason contains
     `corpus-down-marker` and `--increment`, and the rendered `next` deep-equals `["pnpm db:probe"]`.
2. **The attempt policy, one unit.** Each call is
   `preflightInnerLoop({ ledger, incrementId: "inc-a", unitIds: ["u1"] })` unless a step says
   otherwise.
   - **Empty ledger:** `{ ok: true }`, with `warnings` deep-equal to `[]`, and
     `ledgers.get("u1").attempts` deep-equal to `[]`.
   - **`r1`, `r2` under `inc-a`:** `ok: true`, and `ledgers.get("u1").consecutiveFailures === 2`.
   - **`r1`–`r3`:** refused with kind `decision-point`, with `unitId: "u1"`. Its reason equals
     `readInnerLoopLedger(ledger, "u1")`'s `policy.reason`, which contains `STOP and decide`. The
     rendered `next` deep-equals
     `["storytree node grant u1 --attempts <n> --kind <changed-input|fixed-defect|new-observation|revised-test> --difference <text|@file> --pg"]`.
   - **`r1`–`r3` with a grant of 2 on `r3`:** `ok: true`.
   - **`r1`–`r6`:** refused with kind `owner-ceiling`, with `unitId: "u1"`. Its reason is the fold's
     `policy.reason`, which contains `ceiling`, and the rendered `next` deep-equals `[]`.
   - **`r1` with a signed pass on `r1`:** refused with kind `unresolved-signed-pass`, with
     `unitId: "u1"` and `runId: "r1"`. The reason contains `r1` and `ADR-0563 D1`. The rendered `next`
     deep-equals `["storytree node adjudicate u1 --run r1 --pg"]`.
   - **`r1`, a signed pass and a land adjudication, all under `inc-a`:**
     - requesting `inc-a` is refused with kind `landed-under-increment`, with `unitId: "u1"`. The
       reason contains `inc-a` and `ADR-0576 D4`, and the rendered `next` contains
       `storytree arc list --pg`;
     - requesting `inc-b` returns `ok: true` with `warnings` deep-equal to `[]`.
   - **The same history with a rework adjudication in place of land:** requesting `inc-a` returns
     `ok: true`.
   - **Refusal order.** `r1` under `inc-a` is signed and landed, then `r2` is attempted and signed
     under `inc-b`, which leaves its pass unresolved. Requesting `inc-a` is refused with exactly one
     refusal: kind `unresolved-signed-pass` with `runId: "r2"`.
   - **Relabel, a warning only.** With `r1`, `r2` under `inc-a`, requesting `inc-b` returns `ok: true`
     with exactly one warning. That warning contains `ADR-0563 D5`, `u1`, `inc-a` and `inc-b`.
     Requesting `inc-a` returns `warnings` deep-equal to `[]`.
   - **The orphan ledger:** refused with kind `ledger-unreadable`, with `unitId: "u1"`. The reason
     contains `grant references no recorded attempt: r9`.
   - **The throwing ledger:** refused with exactly one `ledger-unreadable` refusal and no `unitId`.
     The reason contains `ledger-down-marker`, and the rendered `next` deep-equals `["pnpm db:probe"]`.
3. **A live grant pairs with the run's shape.**
   - `r1`–`r3` with a grant of 1 on `r3` of kind `revised-test`:
     - `revise: true` returns `ok: true`;
     - with `revise` omitted, the call is refused with kind `grant-kind-mismatch` and `unitId: "u1"`.
       The reason contains `revised-test`, `--revise-test` and `ADR-0576 D6`.
   - `r1`–`r3` with a grant of 1 on `r3` of kind `fixed-defect`:
     - `revise: true` is refused with kind `grant-kind-mismatch`. The reason contains
       `fixed-defect`, `--revise-test` and `ADR-0576 D6`;
     - `revise: false` returns `ok: true`.
   - `r1` alone, with no grant: both `revise: true` and `revise: false` return `ok: true`.
4. **Several units: one read, and every refusal named.**
   - The ledger is wrapped so `readEvents` counts its calls and delegates. It holds nothing for `u1`,
     `r1`–`r3` for `u2`, and `r1` plus a signed pass on `r1` for `u3`.
   - With `unitIds: ["u1", "u2", "u3"]`, the call is refused with two refusals, in this order:
     `decision-point` for `u2`, then `unresolved-signed-pass` for `u3` with `runId: "r1"`.
     `readEvents` was called exactly once.
   - The rendered `lines` has two entries, the first containing `u2` and the second `u3`. `next`
     deep-equals
     `["storytree node grant u2 --attempts <n> --kind <changed-input|fixed-defect|new-observation|revised-test> --difference <text|@file> --pg", "storytree node adjudicate u3 --run r1 --pg"]`.
   - With the call counter reset to zero, `unitIds: ["u1"]` returns `ok: true` with
     `ledgers.size === 1`, and `readEvents` was called exactly once.
   - The throwing ledger with `unitIds: ["u1", "u2"]` is refused with exactly ONE `ledger-unreadable`
     refusal, and that refusal has no `unitId`.
5. **One entry state, one renderer.** `renderInnerLoopEntryState` returns `{ lines, next }`.
   - `{ state: "signed", unitId: "u1", runId: "r7" }` gives one line containing `u1`, `r7` and
     `ADR-0563 D1`. `next` deep-equals `["storytree node adjudicate u1 --run r7 --pg"]`.
   - `{ state: "attempt-failed", unitId: "u1", runId: "r7", consecutiveFailures, remainingGrantCount }`
     always gives ONE line containing `u1`, `r7` and `<consecutiveFailures> consecutive failure(s)`:
     - `(1, 0)`: the line contains `another attempt may proceed under the same increment`, and `next`
       is `[]`;
     - `(3, 0)`: the line contains `ADR-0563 D4`, and `next` deep-equals the `u1` grant command above;
     - `(4, 1)`: the line contains `1 granted attempt(s) remain`, and `next` is `[]`;
     - `(6, 0)`: the line contains `owner` and `ADR-0563 D4`, and `next` is `[]`.
   - `{ state: "not-attempted", unitId: "u2" }` gives one line containing `not attempted` and `u2`.
     `next` is `[]`.
   - A hand-built refused state holds `{ kind: "increment-closed", reason: "x" }` and
     `{ kind: "landed-under-increment", unitId: "u1", reason: "y" }`. It gives two lines, and `next`
     deep-equals `["storytree arc list --pg"]`, deduplicated.
   - `import * as Drive from "./index.js"`: `Drive.resolveBuildIncrement`, `Drive.preflightInnerLoop`
     and `Drive.renderInnerLoopEntryState` are each the very function imported from
     `./inner-loop-entry.js`.

Before the source exists, the test file cannot load, because it imports the missing module. That is
this net-new unit's structural red. After it, every step passes.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (5)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

**Decided by ADR-0576** (`storytree library artifact adr-0576`): D1 (every refusal before the
database, through injectable read handles, fail-closed), D2 (what an unknown increment is), D4 (no
rebuild under a landed increment), D6 (grant pairing) and D8 (one entry state, one renderer). It
implements ADR-0575 D1 and ADR-0563 D1/D4/D5. This module is PURE over its two injected read handles.
Wiring it into `nodeBuild`, `storyBuild` and the gate build driver is later units' work.

- **The module.** A NEW `packages/drive/src/inner-loop-entry.ts` exports the following. All fields
  are `readonly`, and optional keys are absent, never `undefined` (`exactOptionalPropertyTypes`).
  - `type InnerLoopRefusalKind`: `"increment-missing" | "increment-unknown" | "increment-wrong-kind" | "increment-closed" | "increment-unreadable" | "ledger-unreadable" | "unresolved-signed-pass" | "landed-under-increment" | "owner-ceiling" | "decision-point" | "grant-kind-mismatch"`.
  - `interface InnerLoopRefusal { kind: InnerLoopRefusalKind; reason: string; unitId?: string; runId?: string }`.
    `runId` is carried only by `unresolved-signed-pass`.
  - `type InnerLoopEntryState`, the D8 union:
    - `{ state: "refused"; refusals: readonly InnerLoopRefusal[] }`
    - `{ state: "attempt-failed"; unitId: string; runId: string; consecutiveFailures: number; remainingGrantCount: number }`
    - `{ state: "signed"; unitId: string; runId: string }`
    - `{ state: "not-attempted"; unitId: string }`

    Also `type InnerLoopRefusedState = Extract<InnerLoopEntryState, { state: "refused" }>`.
  - `resolveBuildIncrement(corpus: Pick<Store, "getDoc">, incrementId: string | undefined)`, which
    returns
    `Promise<{ ok: true; incrementId: string; status: "proposal" | "ready" | "active" } | { ok: false; state: InnerLoopRefusedState }>`.
  - `preflightInnerLoop(input: { ledger: Pick<Store, "readEvents">; incrementId: string; unitIds: readonly string[]; revise?: boolean })`,
    which returns
    `Promise<{ ok: true; warnings: readonly string[]; ledgers: ReadonlyMap<string, InnerLoopLedger> } | { ok: false; state: InnerLoopRefusedState }>`.
    `revise` is true for a `--revise-test` run.
  - `renderInnerLoopEntryState(state: InnerLoopEntryState): { lines: readonly string[]; next: readonly string[] }`.
- **The barrel.** Add ONE line to `packages/drive/src/index.ts`,
  `export * from "./inner-loop-entry.js";`, directly after `export * from "./stale-existence-claim.js";`.
  A short comment above it is welcome. The barrel is `export *` throughout, so every exported name
  here must be unique across the drive package. A duplicate is a typecheck error, and it silently
  drops the name at runtime, which walkthrough step 5's identity check would catch.
- **Resolving the increment (D2, D1).**
  - A blank or absent id is `increment-missing`: `a paid REAL build needs --increment <id>: the increment this attempt is filed under (ADR-0575 D1)`.
  - Otherwise `corpus.getDoc(id)`. A throw is `increment-unreadable`: `--increment "<id>" could not be looked up: <message> (ADR-0576 D1)`.
  - `null` is `increment-unknown`: `--increment "<id>" names no row in the Library (ADR-0576 D2)`.
  - A row whose `kind` is not `increment` is `increment-wrong-kind`: `--increment "<id>" names a <kind>, not an increment (ADR-0576 D2)`.
  - A doc whose `status` is `closed` is `increment-closed`: `--increment "<id>" is closed, and a closed increment is never reopened, so work filed under it would be filed nowhere (ADR-0576 D2)`.
  - Otherwise pass. An absent status is `proposal`, the schema's default.
- **The preflight (ADR-0563 D4/D5, ADR-0576 D1/D4/D6).**
  - **Read the ledger ONCE per call:** `ledger.readEvents()` with no filter, whatever the number of
    units (plan trap 9: `PgWorkStore.readEvents()` reads all five event tables). A throw is ONE
    `ledger-unreadable` refusal with no `unitId`:
    `the attempt ledger could not be read: <message> (ADR-0576 D1)`.
  - Then for each unit, in `unitIds` order, `foldInnerLoopLedger(events, unitId)`, taking the FIRST
    refusal that applies, in this order:
    1. **The fold throws:** `ledger-unreadable` with the unit,
       `the attempt ledger for <unitId> could not be folded: <message> (ADR-0576 D1)`.
    2. **`unresolvedSignedRuns` is non-empty:** `unresolved-signed-pass`, with the unit and the first
       such run,
       `<unitId> holds an unresolved signed pass on run <runId>: a signed verdict is a pass and lands (ADR-0563 D1), so adjudicate it before another attempt`.
    3. **Landed under this increment:** one of `ledger.adjudications` has disposition `land`,
       `land-and-measure` or `land-and-declare-gap` AND an `incrementId` equal to the requested one.
       The refusal is `landed-under-increment`,
       `<unitId> already landed a signed pass under increment <incrementId>: new work on a landed unit names a new increment (ADR-0576 D4)`.
       A `rework` or `refuse` adjudication never triggers this.
    4. **`policy.disposition === "escalate"`:** `owner-ceiling`, whose reason is `policy.reason`.
    5. **`policy.disposition === "stop-and-decide"`:** `decision-point`, whose reason is `policy.reason`.
    6. **A grant is live (`remainingGrantCount > 0`) and its kind does not match the run.** The fold
       does NOT expose the live grant's kind. Read it from the events already in hand: the LAST
       `grant` event, by `seq`, for this unit. Grants cannot overlap, so while one is live it is
       always the latest.
       - A `revised-test` grant with `revise` not true refuses:
         `<unitId> holds a live revised-test grant, so this attempt must be a --revise-test run (ADR-0576 D6)`.
       - Any other kind with `revise` true refuses:
         `<unitId> holds a live <kind> grant, and a --revise-test run consumes only a revised-test grant (ADR-0576 D6)`.
  - Any unit refusing makes the whole call refuse, with one refusal per refusing unit in `unitIds`
    order. The warnings are then dropped.
  - **The relabel warning is never a refusal** (ADR-0575 D2; `mintedPerAttempt` warns). A passing unit
    warns when its policy is NOT `signed` and `policy.increments` contains an id other than the
    requested one. The warning reads
    `<unitId>: its open loop was filed under <policy.increments joined ", ">, and this build names <incrementId> — ADR-0563 D5: a retry reuses its own increment`.
    The `signed` exclusion matters. After a landing, the fold still reports the landed loop's
    increments, and naming a NEW increment is exactly what D4 demands, so warning there would be
    false.
  - On success, `ledgers` maps every unit id to its fold.
- **The renderer (D8): the only place these strings live.** Entries never re-type them.
  - **refused:** one line per refusal, `refused before spend (<kind>): <unitId> — <reason>`, or
    `refused before spend (<kind>): <reason>` when there is no unit. `next` is deduplicated in
    first-seen order:
    - `increment-missing`, `increment-unknown`, `increment-wrong-kind`, `increment-closed` and
      `landed-under-increment` give `storytree arc list --pg`;
    - `increment-unreadable` and `ledger-unreadable` give `pnpm db:probe`;
    - `decision-point` gives
      `storytree node grant <unitId> --attempts <n> --kind <changed-input|fixed-defect|new-observation|revised-test> --difference <text|@file> --pg`,
      with only the unit id substituted;
    - `unresolved-signed-pass` gives `storytree node adjudicate <unitId> --run <runId> --pg`;
    - `owner-ceiling` and `grant-kind-mismatch` give nothing.
  - **attempt-failed:** one line,
    `attempt failed: <unitId> run <runId> — <n> consecutive failure(s); <step>`. The step is the first
    of these that applies:
    - `n >= ATTEMPT_CEILING`: `at or above the ceiling of <ATTEMPT_CEILING>, the next call is the owner's (ADR-0563 D4)`,
      with `next` `[]`;
    - `remainingGrantCount > 0`: `<remainingGrantCount> granted attempt(s) remain`, with `next` `[]`;
    - `n >= ATTEMPT_DECISION_POINT`: `at the decision point: record a grant before another attempt (ADR-0563 D4)`,
      with `next` holding the grant command for the unit;
    - otherwise: `another attempt may proceed under the same increment`, with `next` `[]`.
  - **signed:** one line,
    `signed: <unitId> run <runId> — a signed verdict is a pass and lands (ADR-0563 D1); adjudicate it before this unit is built again`.
    `next` is `[<the adjudicate command>]`.
  - **not-attempted:** one line, `not attempted: <unitId> — an earlier unit halted the run`, with
    `next` `[]`.
- **Traps from the plan, as they bear on this unit.**
  - **Each new refusal sits after every existing cheap refusal.** That binds the entries that will
    call these functions: after mode, runtime, pi, budget, codex max-turns, revise-test mode, signer,
    spec load, real config, stale claim, db proof env, add-deps and the revision read. It shapes this
    module only in that every function here is a pure read, callable wherever the entry places it.
  - **Reads fail CLOSED (D1).** A handle that throws refuses and quotes its error. It is never treated
    as an empty ledger or an unknown increment. The attempt APPEND, which also fails closed, is
    `real-lifecycle-records-its-attempt`'s.
  - **Keep existing test titles byte-for-byte.** No existing test file is in this unit's scope; edit
    none.
  - **`better-spec` is not in the protocol's kind enum**, so no stored grant can carry it. The pairing
    check reads only kinds the protocol admits.
- **The test file.** `packages/drive/src/inner-loop-entry.test.ts` is NEW.
  - **This is a net-new unit, so its red is STRUCTURAL.** Import the three functions BY NAME in a
    static top-level `import { … } from "./inner-loop-entry.js"`. At red, the file then fails to load
    and executes no assertion. Reach the module through the barrel ONLY for step 5's identity check,
    never instead of that named import. A net-new red that runs an assertion is refused as the wrong
    kind of red.
  - Use flat `test(...)` calls from `node:test`, with no `describe`. Each title is ONE static string
    literal beginning `<contract-id>: `, with no concatenation, no template and no `.each`.
  - Loops over cases go INSIDE a test.
  - Assert with `node:assert/strict`.
  - Other imports:
    - `InMemoryStore` from `@storytree/storage-protocol`;
    - `appendInnerLoopEvent` and `readInnerLoopLedger` from `@storytree/orchestrator`;
    - `* as Drive` from `./index.js`.
- **Before signing.** The `@storytree/drive` typecheck and the whole `@storytree/drive` suite run as
  the backstop.

## Out of scope

- Calling any of this from `nodeBuild`, `storyBuild` or `driveBuildTestsGate`. Also out of scope:
  registering `--increment`, and building the production read handles (the corpus store the prompt
  render opens, and a `PgWorkStore` over a read pool with no `applySchema`). Those are the later
  `node-build-names-its-increment`, `story-real-chain-names-its-increment` and
  `gate-real-build-names-its-increment` units.
- Recording an attempt or a signed pass (`real-lifecycle-records-its-attempt`), and recording grants
  or adjudications (`orchestrator-records-its-calls`).
- Any change to `packages/orchestrator/src/proof/inner-loop-ledger.ts`, `inner-loop-exit.ts`,
  `packages/proof-protocol/src/inner-loop-event.ts` or `pg-work-store.ts`. The live grant's kind is
  read from the events in hand precisely so the fold stays untouched.

## Contracts (5)

1. **`a-paid-build-names-a-live-increment`** — a build's increment resolves only to an existing, unclosed increment row, and every other answer is a named refusal.
   - **asserts —** `resolveBuildIncrement` refuses an absent or blank id (`increment-missing`), an id with no row (`increment-unknown`), a row of another kind (`increment-wrong-kind`) and a closed increment (`increment-closed`), each with a reason naming `--increment` and a rendered `next` of `storytree arc list --pg`. It refuses a throwing corpus handle (`increment-unreadable`), quoting the error, with a `next` of `pnpm db:probe`. It resolves `proposal`, `ready` and `active` rows with their status, and a row with no status as `proposal`. Test titles begin `a-paid-build-names-a-live-increment: `.
   - **covers —** `resolveBuildIncrement` (`packages/drive/src/inner-loop-entry.ts`).
   - **proven by —** `packages/drive/src/inner-loop-entry.test.ts`, through the declared focused bun REAL proof.
2. **`the-attempt-policy-refuses-before-spend`** — one unit's ledger admits an attempt only below the decision point or under a live grant, with no unresolved signed pass and no landing under the requested increment, and a relabel only warns.
   - **asserts —** `preflightInnerLoop` passes an empty ledger and one or two consecutive failures. It passes three failures with a live grant. It refuses three failures with no grant (`decision-point`, rendering the `node grant` command) and six (`owner-ceiling`), each with the fold's own policy reason. It refuses an unresolved signed pass (`unresolved-signed-pass`, carrying the run and rendering `node adjudicate <unit> --run <run>`). It refuses a request under an increment that already carries a landing adjudication (`landed-under-increment`, ADR-0576 D4), but passes the same unit under a new increment, or after a rework. It orders an unresolved signed pass ahead of a landing, and a fold that throws or a read that throws refuses as `ledger-unreadable`, quoting the error. An open loop filed under another increment passes with one ADR-0563 D5 warning, and no warning follows a landing. Test titles begin `the-attempt-policy-refuses-before-spend: `.
   - **covers —** `preflightInnerLoop` (`packages/drive/src/inner-loop-entry.ts`).
   - **proven by —** `packages/drive/src/inner-loop-entry.test.ts`.
3. **`a-live-grant-pairs-with-the-run-shape`** — while a grant is live, only a run of its shape may proceed, and below the decision point either run may.
   - **asserts —** under a live `revised-test` grant, `preflightInnerLoop` passes a `revise: true` run and refuses any other as `grant-kind-mismatch`. Under a live grant of another kind, it refuses a `revise: true` run as `grant-kind-mismatch` and passes a plain one. Each refusal names the grant's kind, `--revise-test` and `ADR-0576 D6`. With no grant below the decision point, both shapes pass. Test titles begin `a-live-grant-pairs-with-the-run-shape: `.
   - **covers —** `preflightInnerLoop` (`packages/drive/src/inner-loop-entry.ts`).
   - **proven by —** `packages/drive/src/inner-loop-entry.test.ts`.
4. **`a-multi-unit-preflight-reads-once-and-refuses-whole`** — a preflight over several units reads the ledger once, and any refusing unit refuses the whole call with every refusing unit named.
   - **asserts —** over units `u1`, `u2` and `u3`, where `u2` is at the decision point and `u3` holds an unresolved signed pass, `preflightInnerLoop` calls `readEvents` exactly once and refuses with a `decision-point` refusal for `u2` then an `unresolved-signed-pass` refusal for `u3`. It renders two lines and `next` holding the `u2` grant command then the `u3` adjudicate command. A passing call maps each unit to its fold. A throwing read over several units is exactly one `ledger-unreadable` refusal with no unit. Test titles begin `a-multi-unit-preflight-reads-once-and-refuses-whole: `.
   - **covers —** `preflightInnerLoop` (`packages/drive/src/inner-loop-entry.ts`).
   - **proven by —** `packages/drive/src/inner-loop-entry.test.ts`.
5. **`one-entry-state-renders-every-outcome`** — the refused, attempt-failed, signed and not-attempted entry states render through one function, and the drive barrel exports it.
   - **asserts —** `renderInnerLoopEntryState` renders a signed state as one line naming the unit, the run and `ADR-0563 D1`, with the `node adjudicate` command as `next`. It renders an attempt-failed state as one line naming the count, with the step and `next` chosen by the ceiling, a live grant, the decision point, or neither, in that order. It renders a not-attempted state as one line with no `next`, and a refused state as one line per refusal with `next` deduplicated. `resolveBuildIncrement`, `preflightInnerLoop` and `renderInnerLoopEntryState` are exported through `packages/drive/src/index.ts` as the same functions. Test titles begin `one-entry-state-renders-every-outcome: `.
   - **covers —** `renderInnerLoopEntryState` (`packages/drive/src/inner-loop-entry.ts`) and its re-export in `packages/drive/src/index.ts`.
   - **proven by —** `packages/drive/src/inner-loop-entry.test.ts`.
