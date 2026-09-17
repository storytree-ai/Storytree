---
id: "node-verbs-dispatch"
tier: contract
story: drive-machinery
capability: build-drive-cli
arc: inner-loop-exit-arc
title: "Dispatch the node attempts, grant and adjudicate verbs over the attempt ledger"
outcome: "`storytree node attempts|grant|adjudicate` reach the orchestrator's ledger verbs through the real CLI dispatch: each refuses a missing unit or flag and a write without the live store, a grant or adjudication is recorded exactly as the verbs admit it with the strength signal read from the unit's own package, and a unit's attempts read back with the entry state they leave it in."
status: proposed
proof_mode: contract-test
depends_on: [orchestrator-records-its-calls, build-entry-refuses-before-spend]
decisions: [576, 575, 563]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/node-verbs-dispatch.test.ts"]
    sourceGlobs: ["packages/cli/src/commands.ts", "packages/cli/src/at-path.ts", "packages/cli/src/main.ts"]
  real:
    testFile: "packages/cli/src/node-verbs-dispatch.test.ts"
    sourceFile: "packages/cli/src/commands.ts"
    scope:
      testGlobs: ["packages/cli/src/node-verbs-dispatch.test.ts"]
      sourceGlobs: ["packages/cli/src/commands.ts", "packages/cli/src/at-path.ts", "packages/cli/src/main.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: bun
      args:
        - "test"
        - "--preload"
        - "./scripts/tsx-cache-off.mjs"
        - "--timeout"
        - "300000"
        - "./packages/cli/src/node-verbs-dispatch.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/cli", "typecheck"]
---

# Dispatch the node attempts, grant and adjudicate verbs over the attempt ledger

**Outcome —** `storytree node attempts|grant|adjudicate` reach the orchestrator's ledger verbs through
the real CLI dispatch. Each refuses a missing unit or flag and a write without the live store. A grant
or adjudication is recorded exactly as the verbs admit it, with the strength signal read from the
unit's own package, and a unit's attempts read back with the entry state they leave it in.

## Proof walkthrough

**Every case goes through `run([...], deps)` from `./commands.js`**, the function `main` calls. A unit
test of a verb function cannot see a verb the dispatch never routes to, a flag the parser rejects, or a
seam nobody supplies; only the dispatch can.

**Fixtures.**
- **The ledger** is an `InMemoryStore` filled through `appendInnerLoopEvent` from
  `@storytree/orchestrator`. Increments are `inc-a` and `inc-b`; runs are `r1`…`r4`.
- **The throwing ledger** is an `InMemoryStore` subclass whose `readEvents` throws
  `new Error("ledger-down-marker")`.
- **The fixture repo** is a temp directory holding `stories/` and `packages/`:
  - `stories/fix-story/story.md`, in the shape `fixtureStories` writes in
    `packages/drive/src/real-chain-fixture.ts`;
  - three capability specs in `stories/fix-story/`, each in the shape that file's `capSpec` writes,
    except that `testFile` and `sourceFile` (and both scopes' globs) sit under a named package:
    `cap-bun` → `packages/pkg-bun/src/cap-bun.ts`, `cap-node` → `packages/pkg-node/src/cap-node.ts`,
    and `cap-orphan` → `packages/pkg-missing/src/cap-orphan.ts`;
  - `packages/pkg-bun/package.json` = `{"name":"pkg-bun","scripts":{"test":"bun test src/"}}`;
  - `packages/pkg-node/package.json` = `{"name":"pkg-node","scripts":{"test":"node --test"}}`;
  - no `packages/pkg-missing/` at all.

  Each test that needs it builds its own and removes it in a `finally`.
- **The deps** are `{ store: new InMemoryStore(), writable: true, attemptLedger: <ledger>, storiesDir: <fixture>/stories, actor: "orchestrator@example.com" }`
  unless a step says otherwise.
- **"The inner-loop docs"** means
  `(await ledger.readEvents()).filter((e) => e.kind === INNER_LOOP_EVENT_KIND).map((e) => e.doc)`.
- **The usage lines** — `<u>` is the unit id given, or the literal `<unit-id>`:
  - ATTEMPTS: `storytree node attempts <u> --pg`
  - GRANT: `storytree node grant <u> --attempts <n> --kind <changed-input|fixed-defect|new-observation|revised-test> --difference <text|@file> --pg`
  - ADJUDICATE: `storytree node adjudicate <u> --run <run-id> [--objection test-quality|rule-violation|surviving-mutants --statement <text|@file> --decision <rule> --survivors <n>] --pg`
- **The live-store refusal body** is exactly
  `the attempt ledger lives in the live store — rerun with --pg (bring the DB up first: pnpm db:up)`.

Every envelope below is asserted with `assert.deepEqual` on the whole `{ ok, body, next }`, unless a
step says "contains".

1. **The node area exposes the verbs, and their flags are declared and classified.**
   - `run(["node", "zzz"], { store })` deep-equals `{ ok: false, body: 'unknown node command "zzz". try: storytree node build <id> --dry-run | storytree node resolve <id> | storytree node log <id> --pg | storytree node walls --pg | storytree node attempts <id> --pg | storytree node grant <id> --pg | storytree node adjudicate <id> --run <run-id> --pg', next: ["storytree node resolve <id>", "storytree node log <id> --pg", "storytree node walls --pg", "storytree node build <id> --dry-run", "storytree node attempts <id> --pg"] }`.
   - `CLI_OPTIONS` declares `attempts`, `difference`, `run`, `objection`, `decision` and `survivors`,
     each deep-equal to `{ type: "string" }`. Read them through `(CLI_OPTIONS as Record<string, unknown>)[flag]`.
   - `LITERAL_FLAGS` has `attempts`, `run`, `objection`, `decision` and `survivors`, and `PROSE_FLAGS`
     has none of them. `PROSE_FLAGS` has `difference`, and `LITERAL_FLAGS` does not.
   - For each of `attempts`, `grant` and `adjudicate`, `run(["node", <sub>], deps)` deep-equals
     `{ ok: false, body: "node <sub> needs a unit id", next: [<that sub's usage line with <unit-id>>] }`.
2. **`node attempts` renders the fold and the entry state it leaves.**
   - With no `attemptLedger` in deps, and again with `attemptLedger: null`,
     `run(["node", "attempts", "cap-bun"], …)` deep-equals
     `{ ok: false, body: <the live-store refusal>, next: ["storytree node attempts cap-bun --pg"] }`.
   - It is a READ: with `writable: false` and a ledger holding `r1`, it returns `ok: true`.
   - An empty ledger gives `{ ok: true, body: "cap-bun: no recorded attempts", next: [] }`.
   - For each history below, let `lines` be `readNodeAttempts(ledger, "cap-bun")`'s `lines`
     (`./inner-loop-verbs.js`), and `state` be `renderInnerLoopEntryState(<the state named>)`
     (`@storytree/drive`). The envelope deep-equals
     `{ ok: true, body: [...lines, ...state.lines].join("\n"), next: [...state.next] }`:
     - `r1`, `r2` under `inc-a`: `{ state: "attempt-failed", unitId: "cap-bun", runId: "r2", consecutiveFailures: 2, remainingGrantCount: 0 }`;
     - `r1`–`r3` under `inc-a`: the same with `runId: "r3"` and `consecutiveFailures: 3`, whose `next`
       is the grant command;
     - `r1`–`r3` with a `fixed-defect` grant of 2 on `r3`: `runId: "r3"`, `consecutiveFailures: 3`,
       `remainingGrantCount: 2`;
     - `r1` with a signed pass on `r1`: `{ state: "signed", unitId: "cap-bun", runId: "r1" }`.
   - `r1`, a signed pass on `r1`, and a `land` adjudication of `r1` (`mayRefuse: false`,
     `escalates: false`, `reason: "landed"`) give `{ ok: true, body: lines.join("\n"), next: [] }`: no
     entry state.
   - The throwing ledger gives `ok: false`, a body containing `ledger-down-marker`, and
     `next` deep-equal to `["pnpm db:probe"]`.
3. **`node grant` records through the grant verb.** The ledger holds `r1`–`r3` under `inc-a`
   unless a step says otherwise.
   - Omitting each of `--attempts`, `--kind` and `--difference` in turn (the other two present, plus
     `--pg`) gives `{ ok: false, body: "node grant needs --attempts <n>, --kind <kind> and --difference <text|@file>: a grant records how many further attempts, which kind of difference, and what will be different (ADR-0563 D4)", next: [<GRANT usage with cap-bun>] }`,
     and the ledger gains no inner-loop event.
   - The verb's own refusals reach the envelope as its reason, with `next` deep-equal to
     `["storytree node attempts cap-bun --pg"]`:
     - over `r1`, `r2` only: body `grant is early: the decision point is three failures`;
     - `--kind better-spec`: body contains `"a better spec" does not count as different (ADR-0563 D4)`;
     - `--attempts two`: body contains `grants nothing`.

     None of them appends an inner-loop event.
   - **The recorded grant.** A temp file holds exactly `the fixture's defect is fixed`.
     `run(["node", "grant", "cap-bun", "--attempts", "2", "--kind", "fixed-defect", "--difference", "@" + <that path>, "--pg"], deps)`
     deep-equals `{ ok: true, body: <three lines>, next: ["storytree node attempts cap-bun --pg"] }`,
     where the three lines, joined by `"\n"`, are:
     - `granted: cap-bun — 2 further attempt(s), fixed-defect, bound to run r3 under increment inc-a`
     - `difference: the fixture's defect is fixed`
     - `` `policy: ${ledger.policy.disposition} — ${ledger.policy.reason}` `` for
       `ledger = await readInnerLoopLedger(<ledger>, "cap-bun")` read after the call.

     The ledger gained exactly one inner-loop event. Its doc deep-equals
     `{ event: "grant", unitId: "cap-bun", incrementId: "inc-a", runId: "r3", attempts: 2, kind: "fixed-defect", difference: "the fixture's defect is fixed" }`,
     and its `actor` is `orchestrator@example.com`.
4. **`node adjudicate` records through the landing ruler, with the unit's own strength signal.** Each
   case uses a fresh ledger: `r1` under `inc-a`, `r2` under `inc-b`, and a signed pass on `r2`, all
   for the unit named. `--run r2` and `--pg` are passed unless a step says otherwise.
   - Omitting `--run` gives `{ ok: false, body: "node adjudicate needs --run <run-id>: the signed run it adjudicates (ADR-0576 D3)", next: [<ADJUDICATE usage with cap-bun>] }`.
   - Each of `--statement "x"`, `--decision "ADR-0232 D5"` and `--survivors 2`, passed alone with no
     `--objection`, gives `{ ok: false, body: "--statement, --decision and --survivors qualify an --objection: pass --objection test-quality|rule-violation|surviving-mutants with them", next: [<ADJUDICATE usage with cap-bun>] }`.
   - `--run r1` (unsigned) gives `{ ok: false, body: "run r1 holds no unresolved signed pass for cap-bun — nothing to adjudicate (ADR-0576 D3)", next: ["storytree node attempts cap-bun --pg"] }`.
   - `--objection test-quality` with no `--statement` gives
     `{ ok: false, body: "the objection states no statement", next: ["storytree node attempts cap-bun --pg"] }`.

   None of these refusals appends an inner-loop event.
   - **The recorded adjudications.** In each case below the envelope deep-equals
     `{ ok: true, body: [`adjudicated: <unit> run r2 under increment inc-b — <disposition>`, `reason: ${expected.reason}`].join("\n"), next: ["storytree node attempts <unit> --pg"] }`,
     where `expected = adjudicateLanding({ unitId: <unit>, signed: true, objection, strengthSignalAvailable: <the literal shown> })`
     is computed by the test, and `expected.disposition` is the one shown. The last inner-loop doc's
     `event`, `runId`, `incrementId` and `disposition` are `adjudication`, `r2`, `inc-b` and that
     disposition.

     | unit | flags | strength signal | disposition |
     |---|---|---|---|
     | `cap-bun` | none | `true` | `land` |
     | `cap-bun` | `--objection test-quality --statement "the asserts are thin"` | `true` | `land-and-measure` |
     | `cap-node` | `--objection test-quality --statement "the asserts are thin"` | `false` | `land-and-declare-gap` |
     | `cap-bun` | `--objection rule-violation --statement "it bypasses the fence" --decision "ADR-0232 D5"` | `true` | `refuse` |
     | `cap-bun` | `--objection surviving-mutants --statement "two mutants live" --survivors 2` | `true` | `rework` |

     For `refuse`, the last doc's `namedRule` is `ADR-0232 D5`.
5. **A write needs the live store.** Over the step 3 ledger (`r1`–`r3` under `inc-a`) and the step 4
   ledger (`r1` under `inc-a`, `r2` under `inc-b`, a signed pass on `r2`):
   - `run(["node", "grant", "cap-bun", "--attempts", "2", "--kind", "fixed-defect", "--difference", "a fixed defect", "--pg"], …)`
     with `writable: false`, and again with `writable: true` but no `attemptLedger`, gives
     `{ ok: false, body: <the live-store refusal>, next: [<GRANT usage with cap-bun>] }`;
   - `run(["node", "adjudicate", "cap-bun", "--run", "r2", "--pg"], …)` with `writable: false`, and
     again with no `attemptLedger`, gives `{ ok: false, body: <the live-store refusal>, next: [<ADJUDICATE usage with cap-bun>] }`;
   - `run(["node", "grant", "cap-bun", "--attempts", "2", "--kind", "fixed-defect", "--difference", "@" + <a path that does not exist>, "--pg"], deps)`
     returns `ok: false` with a body containing `--difference "@` and `could not be read`: the `@path`
     boundary refuses before any verb runs.

   In every case the ledger gains no inner-loop event.
6. **The strength signal reads the unit's own package.** Assert
   `typeof Commands.unitStrengthSignalReach` is `"function"` before calling it.
   `Commands.unitStrengthSignalReach(<fixture>/stories)` returns a function that gives:
   - `true` for `cap-bun` (its package's test script runs under Bun);
   - `false` for `cap-node` (`node --test`);
   - `false` for `fix-story` (a story, with no real source file);
   - `false` for `cap-orphan` (its package has no `package.json`);
   - `false` for `no-such-unit` and for `fix-story#gate-1` (no spec at all).

**At red** — before the source change — every step fails on an assertion. The parser rejects
`--attempts` and its siblings as unknown options, so each flagged `run` returns
`bad arguments: …`. `node attempts|grant|adjudicate` without flags returns
`unknown node command`. `CLI_OPTIONS` and the two flag sets lack the new names, and
`unitStrengthSignalReach` is not a function. After the change, every step passes.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (6)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

Attempt 1 (run real-mu46sjol) exhausted 60 IMPLEMENT turns navigating commands.ts without running the proof; attempt 2 changes the turn budget (120) and adds these anchors — the contract is unchanged.

**Where the wiring goes.** Line numbers are approximate, as of this spec's commit; search for the
quoted text if they have moved.
- `packages/cli/src/commands.ts`:
  - the `@storytree/orchestrator` import block at ~49, which already imports `loadNodeSpec` and
    `findNodeSpecFile`; the `@storytree/drive` imports around
    `import { loadWorkHierarchyIndex } from "@storytree/drive";` at ~266; `type Envelope` from
    `./envelope.js` at ~244; the local `repoRoot()` at ~519;
  - `RunDeps` at ~2193, with its `uatStore` field (the seam precedent) at ~2323;
  - `refuseMemoryStore` at ~2713, which ends just above the `// build workflow` banner at ~2731.
    Module-scope helpers belong there, near `nodeStoryBuildOpts` at ~2761;
  - `CLI_OPTIONS` at ~3088, with `"revise-test": { type: "string" },` at ~3132;
  - `run` at ~3397, its `const [area, sub, third, fourth] = positionals;` at ~3462, and the
    `if (area === "node") {` arm at ~3509;
  - **the sibling verb to copy is `node log`**, `if (sub === "log") {` at ~3515: a node sub-verb that
    refuses without a unit id, refuses when its store seam (`deps.workLog`) is null, then reads and
    renders;
  - `node walls` at ~3548, then `if (sub !== "build") {` (the unknown-node-command refusal) at ~3583.
- `packages/cli/src/main.ts`: `buildStore` at ~85, with its return type's
  `uatStore: UatVerdictStoreLike | null;` at ~92, `uatStore: work,` in the `--pg` branch at ~134, and
  `uatStore: null,` in the door branch at ~168 and the lazy branch at ~209; then `main`'s destructure
  (`uatStore,` at ~508) and its `deps` bag (`uatStore,` at ~527). `type Store` is already imported at
  ~7.
- `packages/cli/src/at-path.ts`: `PROSE_FLAGS` at ~48, with `"evidence",` at ~97; `LITERAL_FLAGS` at
  ~116, with `"revise-test",` at ~184.
- **Signatures attempt 1 had to look up:**
  - `resolveBuildConfig(spec)` returns `{ config: NodeBuildConfig; source } | null`
    (`packages/orchestrator/src/resolve-prove-spec.ts` ~503). `NodeBuildConfig.real?` is a
    `RealProofConfig` carrying `sourceFile` (`packages/orchestrator/src/proof-config.ts` ~23, ~92).
  - `findNodeSpecFile(storiesDir, unitId): string | null` (~249) and `loadNodeSpec(file)` (~164), in
    `packages/orchestrator/src/node-spec.ts`.
  - `InnerLoopLedger` (~19) and `appendInnerLoopEvent` (~206), in
    `packages/orchestrator/src/proof/inner-loop-ledger.ts`.
  - `LandingObjection` (~66), `AdjudicateLandingSpec` (~84), `LandingAdjudication` (~116) and
    `adjudicateLanding` (~150), in `packages/orchestrator/src/proof/inner-loop-exit.ts`.
  - `recordNodeGrant` (~109), `recordNodeAdjudication` (~219), `readNodeAttempts` (~281) and
    `strengthSignalFromTestScript` (~316), in `packages/cli/src/inner-loop-verbs.ts`;
    `renderInnerLoopEntryState` (~320), in `packages/drive/src/inner-loop-entry.ts`.
  - `Envelope` is `{ ok, body, next, doctrine? }` (`packages/drive/src/envelope.ts` ~8). `Store` (~110)
    and `InMemoryStore` (~214) are in `packages/storage-protocol/src/store.ts`. `capSpec` (~65) and
    `fixtureStories` (~98) are in `packages/drive/src/real-chain-fixture.ts`.
- **Order of work.** Make the first compiling edit (the flags in `CLI_OPTIONS` and `at-path.ts`), then
  call `run_proof` at once and iterate against its failures, one verb at a time. Add the `RunDeps`
  seam and its `main.ts` wiring in the same pass, because no test reaches `main.ts`.

**Decided by ADR-0576 D3** (`storytree library artifact adr-0576`): the orchestrator's grant and
adjudication are recorded by `node`-area verbs, and `node attempts` reads the fold and the entry state
D8 renders. The pure verbs already exist in `packages/cli/src/inner-loop-verbs.ts` (built by
`orchestrator-records-its-calls`), and the entry state in `packages/drive/src/inner-loop-entry.ts`
(built by `build-entry-refuses-before-spend`). This unit is the dispatch that reaches them, and the
production strength-signal composition the verbs module left to its caller.

- **The flags** (`packages/cli/src/commands.ts`, `CLI_OPTIONS`). Directly after
  `"revise-test": { type: "string" },` add six string flags, with a comment naming ADR-0576 D3:
  `attempts`, `difference`, `run`, `objection`, `decision`, `survivors`. `--kind` and `--statement`
  are already declared, and are reused.
- **The classification** (`packages/cli/src/at-path.ts`).
  - `LITERAL_FLAGS` gains `attempts`, `run`, `objection`, `decision` and `survivors`, directly after
    `"revise-test",`, with a comment: a count, a run id, an objection enum, a decision reference and a
    count, none of them a durable prose record.
  - `PROSE_FLAGS` gains `difference`, directly after `"evidence",`, with a comment: the grant's
    recorded difference is durable prose on the ledger, and ADR-0563 D4 makes the recording the
    decision.
  - The exhaustiveness sweep in `at-path.test.ts` then stays green. Do not edit that file.
- **The store seam** (`RunDeps` in `commands.ts`). Directly after `uatStore`, add
  `readonly attemptLedger?: Store | null;`, documented as the attempt ledger (ADR-0576 D3): the live
  `PgWorkStore` when `--pg`, and null or absent otherwise, where every ledger verb refuses. It is
  typed `Store` because `recordNodeGrant` and `recordNodeAdjudication` take one; `uatStore` is the
  precedent, but its narrower type does not fit them.
- **The composition root** (`packages/cli/src/main.ts`). `buildStore`'s return type gains
  `attemptLedger: Store | null`. Its `--pg` branch returns `attemptLedger: work`, the same
  `PgWorkStore` instance it already passes as `uatStore`. Its door and lazy branches return
  `attemptLedger: null`. `main` destructures it and puts it in the `deps` bag beside `uatStore`. No
  test reaches `main.ts`; each of these lines holds only an identifier or `null`.
- **The dispatch.** In the `area === "node"` arm, directly before `if (sub !== "build") {`, add
  `if (sub === "attempts" || sub === "grant" || sub === "adjudicate") return nodeLedgerCommand(sub, third, values, deps);`,
  and extend the unknown-command refusal below it to exactly the body and `next` of walkthrough step 1.
  Define `nodeLedgerCommand` at module scope, near `nodeStoryBuildOpts`. It imports
  `readNodeAttempts`, `recordNodeGrant`, `recordNodeAdjudication`, `strengthSignalFromTestScript` and
  `type StrengthSignalReach` from `./inner-loop-verbs.js`, and `renderInnerLoopEntryState` and
  `type InnerLoopEntryState` from `@storytree/drive`. The checks run in this order for each verb:
  - **`attempts`:**
    1. no unit: `node attempts needs a unit id`;
    2. no ledger: the live-store refusal. A read needs no `writable`;
    3. `readNodeAttempts(ledger, unitId)`. A refusal gives `{ ok: false, body: reason, next: ["pnpm db:probe"] }`;
    4. otherwise derive the entry state from the returned ledger: the first unresolved signed run gives
       `signed`; else, when `consecutiveFailures > 0`, the LATEST attempt gives `attempt-failed` with the
       ledger's `consecutiveFailures` and `remainingGrantCount`; else there is none. The body is the
       lines then the state's lines, joined by `"\n"`, and `next` is the state's `next`, or `[]`. The
       strings come from the renderer and are never re-typed (ADR-0576 D8).
  - **`grant`:**
    1. no unit;
    2. any of `--attempts`, `--kind`, `--difference` absent: the one flags refusal;
    3. `deps.writable !== true`, or no ledger: the live-store refusal;
    4. `recordNodeGrant(ledger, { unitId, attempts: Number(values.attempts), kind, difference, actor })`,
       passing `actor: deps.actor` only when it is defined;
    5. a refusal gives `{ ok: false, body: reason, next: [<ATTEMPTS usage>] }`; success gives the three
       lines of walkthrough step 3, with the run and increment read from `result.event` and the policy
       from `result.ledger.policy`.
  - **`adjudicate`:**
    1. no unit;
    2. no `--run`: the run refusal;
    3. any of `--statement`, `--decision`, `--survivors` given without `--objection`: the qualifier
       refusal;
    4. `deps.writable !== true`, or no ledger: the live-store refusal;
    5. `recordNodeAdjudication(ledger, input, unitStrengthSignalReach(storiesDir))`. `input` carries
       `objection` only when `--objection` is given, as
       `{ kind, statement: values.statement ?? "", decision?, survivors?: Number(values.survivors) }`
       with each optional key present only when its flag is. `actor` is passed as for a grant.
       `storiesDir` is `deps.storiesDir ?? path.join(repoRoot(), "stories")`, the expression the
       `build` arm already uses;
    6. a refusal gives `{ ok: false, body: reason, next: [<ATTEMPTS usage>] }`; success gives the two
       lines of walkthrough step 4.

  **Why `writable` as well as the seam:** the session tool runner calls
  `run(argv, { ...deps, writable: false })`, which keeps every seam. A write guarded by the seam alone
  would let a read-only session record a grant.
- **The strength signal** (ADR-0576 D3, the composition `orchestrator-records-its-calls` left to this
  unit). Export `unitStrengthSignalReach(storiesDir: string): StrengthSignalReach` from `commands.ts`.
  For a unit id it finds the spec (`findNodeSpecFile`), loads it (`loadNodeSpec`), takes
  `resolveBuildConfig(spec)?.config.real?.sourceFile` (`@storytree/orchestrator`; add the import),
  matches `^packages/<dir>/`, reads `<path.dirname(storiesDir)>/packages/<dir>/package.json`, and
  returns `strengthSignalFromTestScript(<its scripts.test>)`. Any missing link or thrown error returns
  `false`: a false reach declares a gap, which is the honest direction. A true one would claim an
  instrument that cannot run. Keep it one straight pipeline inside one `try`, with no guard whose
  removal changes no outcome.
- **Traps from the plan, as they bear on this unit.**
  - **Trap 2: keep every existing test title byte-for-byte.** This unit's test file is NEW, and no
    existing test file is in its scope. `at-path.test.ts`, `cli-areas.test.ts` and
    `cli-read-verbs.test.ts` must stay green unchanged in the package suite.
  - **`CLI_READ_VERBS` needs no row (checked, not assumed).** `node` is listed in
    `AREAS_WITHOUT_CORPUS_READS` in `packages/context-traversal-capture/src/observe-cli.ts`, and
    `cli-read-verbs.test.ts`'s `VERB_SOURCES` scans no `node` arm. These verbs read the work store,
    never the corpus. Do not touch that file.
  - **Trap 8: `better-spec`.** The dispatch never validates a grant's kind or content itself. It passes
    them to `recordNodeGrant`, which refuses with ADR-0563 D4's reason.
  - **The verbs fail closed.** A refusal from either module is the envelope's body, never swallowed and
    never reworded.
- **The red is an assertion red, reviewed per test.** The node declares `editsExisting`.
  - `run` and `CLI_OPTIONS` exist at HEAD, so import them by name from `./commands.js`. Reach
    `unitStrengthSignalReach` only through `import * as Commands from "./commands.js"`: a named import
    of a missing export fails to link, which is a structural red of the wrong kind (ADR-0057 C).
  - **Every test must FAIL at red on an `assert` call, never on a `TypeError`.** Assert on each whole
    envelope with `assert.deepEqual`. Never dereference a field that exists only on success. Assert
    `typeof Commands.unitStrengthSignalReach === "function"` before calling it.
  - Use flat `test(...)` calls from `node:test`, with no `describe`. Each title is ONE static string
    literal beginning `<contract-id>: `, with no concatenation, no template and no `.each`. Loops over
    cases go INSIDE a test.
  - Assert with `node:assert/strict`.
- **The test's imports all exist today.**
  - `InMemoryStore` from `@storytree/storage-protocol`;
  - `INNER_LOOP_EVENT_KIND` from `@storytree/proof-protocol`;
  - `appendInnerLoopEvent`, `readInnerLoopLedger` and `adjudicateLanding` from `@storytree/orchestrator`;
  - `renderInnerLoopEntryState` from `@storytree/drive`;
  - `readNodeAttempts` from `./inner-loop-verbs.js`;
  - `LITERAL_FLAGS` and `PROSE_FLAGS` from `./at-path.js`;
  - `run` and `CLI_OPTIONS` from `./commands.js`, plus the `Commands` namespace.
- **The mutation rung scores the added lines.** `check:mutation-diff` mutates every expression on the
  lines this branch adds to `commands.ts` and `at-path.ts` (`main.ts` is a script entry point, and
  exempt). So pin every refusal and success envelope whole, as the walkthrough does, and pin each new
  flag's classification by name in this test file.
- **Before signing.** The `@storytree/cli` typecheck and the whole `@storytree/cli` suite run as the
  backstop, including `at-path.test.ts`'s exhaustiveness sweep, `cli-areas.test.ts` and the live
  contract-coverage sweep.

**Declared, not observed by this test.** The `main.ts` wiring (the `--pg` branch's `attemptLedger:
work`, the two `null`s, the destructure and the `deps` bag) is confirmed by reading: `main` opens a real
pool, and no hermetic test reaches it.

## Out of scope

- `nodeHelp`, `buildHelp` and the Library's documented commands. The plan owes the help text as
  landing glue.
- Any change to `packages/cli/src/inner-loop-verbs.ts`, `packages/drive/src/inner-loop-entry.ts`,
  `packages/orchestrator/src/proof/inner-loop-ledger.ts`, `inner-loop-exit.ts`,
  `packages/proof-protocol/src/inner-loop-event.ts` or `pg-work-store.ts`.
- `--increment` on the build entries: `node-build-names-its-increment`,
  `gate-real-build-names-its-increment` and `story-real-chain-names-its-increment`.
- A `CLI_READ_VERBS` row (see Traps).

## Contracts (6)

1. **`node-area-exposes-the-ledger-verbs`** — the node area names the three ledger verbs, declares and classifies their flags, and refuses each verb without a unit id.
   - **asserts —** `run(["node", "zzz"])` refuses with a body and `next` naming `node attempts`, `node grant` and `node adjudicate` beside the existing verbs. `CLI_OPTIONS` declares `attempts`, `difference`, `run`, `objection`, `decision` and `survivors` as string flags. `LITERAL_FLAGS` holds `attempts`, `run`, `objection`, `decision` and `survivors` and `PROSE_FLAGS` none of them, while `PROSE_FLAGS` holds `difference` and `LITERAL_FLAGS` does not. `run(["node", <sub>])` for each verb refuses `node <sub> needs a unit id` with that verb's usage line. Test titles begin `node-area-exposes-the-ledger-verbs: `.
   - **covers —** the `node` arm's routing and unknown-command refusal, and `CLI_OPTIONS` (`packages/cli/src/commands.ts`); `LITERAL_FLAGS` and `PROSE_FLAGS` (`packages/cli/src/at-path.ts`).
   - **proven by —** `packages/cli/src/node-verbs-dispatch.test.ts`, through the declared focused bun REAL proof.
2. **`node-attempts-renders-the-fold-and-its-entry-state`** — `node attempts` reads the unit's ledger lines and the entry state they leave it in, refusing without the live store.
   - **asserts —** with no ledger seam or a null one, `node attempts cap-bun` refuses with the live-store body and its usage line. With `writable: false` it still reads. An empty ledger renders `cap-bun: no recorded attempts` with no `next`. Two or three unsigned attempts, and three under a live grant, render `readNodeAttempts`' lines then the `attempt-failed` state for the latest run, with that state's `next`. A signed pass renders the `signed` state and its adjudicate command. A landed unit renders the lines alone. A ledger that cannot be read refuses quoting the error, with `pnpm db:probe`. Test titles begin `node-attempts-renders-the-fold-and-its-entry-state: `.
   - **covers —** `nodeLedgerCommand`'s `attempts` branch (`packages/cli/src/commands.ts`).
   - **proven by —** `packages/cli/src/node-verbs-dispatch.test.ts`.
3. **`node-grant-dispatch-records-the-grant`** — `node grant` refuses a missing flag, parses the rest, and records exactly what the grant verb admits.
   - **asserts —** omitting `--attempts`, `--kind` or `--difference` refuses with the one flags body and the grant usage, appending nothing. The verb's own refusals (an early grant, `better-spec`, a non-numeric count) reach the body with the attempts command as `next`, appending nothing. A grant of `--attempts 2 --kind fixed-defect --difference @<file>` records one grant doc bound to `r3` and `inc-a` with the file's text as its difference and the deps' actor, and renders the granted, difference and policy lines. Test titles begin `node-grant-dispatch-records-the-grant: `.
   - **covers —** `nodeLedgerCommand`'s `grant` branch (`packages/cli/src/commands.ts`).
   - **proven by —** `packages/cli/src/node-verbs-dispatch.test.ts`.
4. **`node-adjudicate-dispatch-records-the-ruling`** — `node adjudicate` refuses a missing run or a stray objection qualifier, and records the landing ruler's result with the unit's own strength signal.
   - **asserts —** omitting `--run` refuses with the run body. `--statement`, `--decision` or `--survivors` without `--objection` refuses with the qualifier body. An unsigned run and an objection with no statement reach the body as the verb's reasons. For no objection, a `test-quality` objection on a Bun-tested and a Node-tested unit, a `rule-violation` naming a decision, and `surviving-mutants` with 2 survivors, the body names the unit, run, increment and `adjudicateLanding`'s own disposition and reason under the strength signal that unit's package gives, and the recorded doc carries that disposition, with `namedRule` for `refuse`. Test titles begin `node-adjudicate-dispatch-records-the-ruling: `.
   - **covers —** `nodeLedgerCommand`'s `adjudicate` branch (`packages/cli/src/commands.ts`).
   - **proven by —** `packages/cli/src/node-verbs-dispatch.test.ts`.
5. **`node-ledger-writes-need-the-live-store`** — a grant or adjudication refuses unless the dispatch is writable and holds the ledger, so a read-only session can never record one.
   - **asserts —** a complete `node grant` and a complete `node adjudicate`, each with `writable: false` and again with no `attemptLedger`, refuse with the live-store body and their own usage line, and the ledger gains no inner-loop event. An unreadable `--difference @path` refuses at the `@path` boundary before any verb runs. Test titles begin `node-ledger-writes-need-the-live-store: `.
   - **covers —** the write guard in `nodeLedgerCommand` and `RunDeps.attemptLedger` (`packages/cli/src/commands.ts`).
   - **proven by —** `packages/cli/src/node-verbs-dispatch.test.ts`.
6. **`unit-strength-signal-reads-its-package`** — a unit's strength signal is true only when its spec's real source file sits in a package whose test script the mutation rung can run.
   - **asserts —** `unitStrengthSignalReach(<fixture>/stories)` returns `true` for a unit whose package tests under Bun, and `false` for one tested by `node --test`, a story with no real source file, a unit whose package has no `package.json`, an unknown unit, and a gate id. Test titles begin `unit-strength-signal-reads-its-package: `.
   - **covers —** `unitStrengthSignalReach` (`packages/cli/src/commands.ts`).
   - **proven by —** `packages/cli/src/node-verbs-dispatch.test.ts`.
