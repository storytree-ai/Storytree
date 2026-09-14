# Batched red attribution — feasibility probe, 2026-09-14

**Arc** `batched-test-authoring-arc` · **increment** `batched-test-authoring-arc-inc-01` ·
**measured on** Windows 11, Bun 1.4.0, Node 24.15.0 (tsx 4.22.4), vitest 3.2.6.

**The question.** When the red author writes a cluster of tests in one slice, can the spine's red
still be attributed to one named test — which test went red, and why — and on which runners? The arc
names its own trap: batch the authoring and "red" can become "the suite is red", satisfied by one
genuine failure beside ten hollow tests (ADR-0020's non-forgeability). This probe measures what the
runners can actually tell the spine before any design is chosen. It builds nothing.

**The prior decision it measures.** ADR-0265 (proposed 2026-07-29, filed on `verification-integrity-arc`,
which has since closed) already recorded that CONFIRM_RED observes one red per file, and escalated two
forks to the owner: WHAT to observe — (a) give the assert-oracle report per-test identity, (b) parse
per-test results from runner output, (c) declare falsifiability in the spec — and WHAT TO DO with a
contract that is green on arrival: refuse, warn, or record. No edge joined it to this arc;
`library related batched-test-authoring-arc --unlinked` surfaced it. This probe prices fork 3 — route (b)
works on all three runners within the limits in §4, and route (a)'s channel also runs under bun (§7) —
and runs straight into fork 4 (§5.5). ADR-0265 D5 also scopes §6: per-test red is the WEAKER bar. It
catches a test that is green against nothing, never one that is green against a plausible wrong
implementation; that stays the mutation rung's (ADR-0447).

## Outcome

1. **Attribution survives batching wherever the cluster's test file LOADS, on all three proof
   runners.** `node --test` (through a reporter module), `bun test --reporter=junit` and
   `vitest --reporter=json` each report every test by name, with its outcome and its error. From that
   report alone a mechanical checker named which test went red and why, REFUSED a cluster with hollow
   tests passing beside real reds, and ADVANCED the same cluster without them — identically on bun and
   node (§5).
2. **It does not survive where the file fails to load, on any of the three.** A static import of a
   symbol that does not exist yet — today's net-new "structural red" — collapses the whole cluster into
   ONE file-level failure: node emits a synthetic row named after the file, vitest reports the file with
   zero test results, and bun writes **no junit report at all**. No test is attributable, and a hollow
   test in that file is invisible. 76 of the 144 real-buildable nodes declare that red. They keep the
   one-at-a-time shape unless the owed ADR changes the shape of their red (§5.3 measures two
   alternatives).
3. **The arc's "enabling constraint" is a mutation-rung fact, not a red-observation fact.** "Per-test
   attribution exists on bun and not on `node --test`" comes from `packages/cli/src/mutation-diff.ts:489`:
   no Stryker runner with per-test KILL attribution exists for `node --test`. The node test runner itself
   reports per test, and says more about WHY a test failed than bun's junit does (it carries
   `ERR_ASSERTION` and the skip/todo flags). `packages/orchestrator`'s gap is post-green test STRENGTH, a
   different question from red ATTRIBUTION — the two problems do not share a root.
4. **Today's gate has no per-test attribution on any route, batched or not.** It runs one command and
   reads one exit code; the `testId` it passes is the unit id, and the real resolver ignores it. Driven
   with the production observer over the probe clusters, `nextPhase` advanced a cluster with four hollow
   tests passing beside three real reds, and signed a green forged by one dummy assertion followed by
   `process.exit(0)` — ADR-0211's own stated limit, reproduced (§3). Per-test completeness refuses both.
5. **A bulk review point between red and green is mechanically feasible — with one fork no mechanism
   settles.** Seven checks, each measured against the hollow shapes it catches (§6), and none asks a model
   anything; red-time attribution and ADR-0126's static substance check catch DIFFERENT hollow shapes, so
   neither alone is enough. But the check that makes batching safe — every test fails before any code
   exists — also REFUSES a legitimate guard-rail contract that an empty implementation already satisfies
   (G1, measured on both runners), and at red time nothing distinguishes it from a hollow test (§5.5).
   That is ADR-0265's fork 4, recorded as the owner's on 2026-07-29 and never answered; it is now put to
   him as `oq-batched-red-test-passes-before-code-exists`.

## 1. What the observer does today — read from the code

- **One command, one exit code.** CONFIRM_RED is `spec.testExecutor.run(spec.testId)`
  (`packages/orchestrator/src/prove-it-gate.ts:242`; CONFIRM_GREEN `:280`). In a real build
  `testId: spec.id` — the UNIT id (`resolve-prove-spec.ts:878`) — and the resolver's command is
  `(): ShellCommand => realProofCmd`, which ignores it (`resolve-prove-spec.ts:725`).
  `ShellTestExecutor.run` maps exit 0 to green and anything else to red (`shell-test-executor.ts:229-264`).
  "The spine observes one named test" holds only in the sense that one unit's command is run.
- **The command's scope is the proof route's.** The census below is the production classifier
  (`classifyProofRoute`) run over every story spec `loadNodeSpec` parses; 144 carry a `real:` block.

  | Runner that observes the red | Scope | Nodes | Structural / assertion red |
  |---|---|---:|---|
  | `node --test` — default route | one file | 49 | 31 / 18 |
  | `node --test` — declared: own file, direct suite, package suite | file or suite | 8 | 2 / 6 |
  | vitest — `pnpm exec vitest run <file>` | one file | 43 | 15 / 28 |
  | vitest — `pnpm --filter <pkg> test` | whole package suite | 8 | 3 / 5 |
  | bun — `pnpm --filter <pkg> test` (35), declared `bun test <file>` (1) | suite (35), one file (1) | 36 | 25 / 11 |

  So `node --test` observes 57 reds, vitest 51 and bun 36. **35 of the 36 bun-observed reds are
  whole-package suites.** The 36th, `node-build-refusal-observation-envelope`, runs `bun test` over its
  own single file — yet the classifier files it `suite-scoped` and stamps a "runs a package script, which
  is a whole suite" disclosure, because `bun` sits in its `PACKAGE_MANAGERS` set (`proof-route.ts:170`).
  And 44 of the 49 default-route observations run `node --import tsx --test` over a file inside a bun
  package: the observing runner is chosen by the proof route, not by the package's own test script.
  *(`NODE_BUILD_REGISTRY` / `realBuildableNodeIds()` hold only the 5 hand-registered nodes; the 144 come
  from the specs. A census over the registry reads a population of 5.)*
- **The assert-oracle counts per PROCESS.** The ADR-0211 guard writes one assertion count per process
  (`assert-oracle-guard.mjs`). Over the eight-test cluster below it read **5** at red and **6** at green:
  one number for the whole file. The measured red kind (`kindBasis: "oracle-count"`) is wired only for the
  two single-file node bases (`resolve-prove-spec.ts:722-724`). Even one test file runs in a CHILD
  process under `node --test` — `NODE_TEST_CONTEXT=child-v8` inside the test — and its events are relayed
  to the parent, which is why a child that exits early leaves a synthetic row (§4).

## 2. The probe

A scratch package outside the repo (`"type": "module"`, like every workspace package) holding one
cluster of eight tests in the house convention (`node:test` + `node:assert/strict`, a static `.js`
import of the subject), run against several subject shapes:

- **three real contract tests** — `add-sums`, `clamp-bounds`, `parse-port-refuses-garbage`;
- **four hollow shapes** — H1 an empty body; H2 `assert.ok(true)`; H3 an assertion the skeleton already
  satisfies (`typeof add === "function"`); H4 a call to the subject with no assertion;
- **one wrong-kind red** — W1 a typo that reds with `TypeError` before its assertion runs, and can never
  go green.

Subject shapes: **S1** a non-throwing skeleton (every symbol exists and returns `undefined`); **S2** a
throwing skeleton (`throw new Error("not implemented")`); **S3** the subject module absent; **S4** one of
the three symbols exported; **S5** the subject absent, with every test importing it dynamically; **S6**
implemented. Positive controls **P1/P2**: the three real tests alone, against S1 and S6. Evasion shapes
**E1–E6** in §5.4, and a legitimate guard-rail **G1** in §5.5. Sources and commands are in Appendix A.

⚠ **Without `"type": "module"` the probe measures the wrong thing.** tsx then loads `.ts` as CommonJS,
and a missing named export becomes `undefined` instead of a link error — S4 silently became a loadable
cluster. Bun, which is stricter, disagreed, and that disagreement is how the first run was caught.

## 3. Negative control — the production observer on batched clusters

A script (Appendix A.5) built each command with `realProofCommand`, wired `beforeRun`, `verifyGreen` and
`measureRedKind` exactly as `resolve-prove-spec.ts:697-736` does for an oracle-accounted default route,
ran `ShellTestExecutor`, and asked `nextPhase`:

| Cluster | Exit | Oracle count | Observation | `nextPhase`, declared structural | declared assertion |
|---|---:|---:|---|---|---|
| S1: 3 real reds, 4 hollow passes, 1 TypeError | 1 | 5 | red, runtime (measured) | refused — wrong kind | **ADVANCE** |
| S2: the same tests, throwing skeleton | 1 | 3 | red, runtime (measured) | refused — wrong kind | **ADVANCE** |
| S3: the same tests, subject absent | 1 | 0 | red, compile (measured) | **ADVANCE** | refused — wrong kind |
| E5 at green: `process.exit(0)` before a wrong assertion | 0 | 0 | red — oracle veto | CONFIRM_GREEN refused | |
| E6 at green: one dummy assertion, `process.exit(0)`, a wrong assertion | 0 | 1 | **green** | CONFIRM_GREEN → **GATE** | |

S1 and S3 are today's gate accepting a cluster whose hollow tests it cannot see — for each declared red
kind, the realistic batch shape advances. E6 is the forged green ADR-0211 names as its honest limit ("one
dummy `assert.equal(1, 1)` then `process.exit(0)`"): reproduced, and signable.

## 4. What each runner reports per test (Q1)

Every cell was observed, not read from documentation.

| | `node --test` + reporter module | `bun test --reporter=junit` | `vitest --reporter=json` |
|---|---|---|---|
| A row per test, with its title path | ✓ `name` + `nesting`; children arrive before their suite, so the path is rebuilt from event order | ✓ nested `<testsuite>` then `<testcase>` | ✓ `ancestorTitles` + `title` |
| Outcome | ✓ pass / fail, with `skip` and `todo` flags | ✓ `<failure>`, `<skipped/>`, `<skipped message="TODO"/>` | ✓ `status` (skip / todo not exercised) |
| Why it failed | ✓ `details.error.cause` `name` + `code` (`ERR_ASSERTION`, `ERR_MODULE_NOT_FOUND`) | ✓ `failure type="AssertionError"` + message — ⚠ **no message** for a dynamic-import resolve failure (`<failure type="Error" />`) | ✓ `failureMessages` text (`AssertionError: …`, `TypeError: …`) |
| Where the test is | ⚠ under tsx every test reports `line: 1` and a column into the transformed output; `testNumber` is declaration order | ✓ the real source line | not examined |
| Assertions per test | ✗ none | ✗ `assertions="0"` on every row — it counts `expect()` calls, not `node:assert` | not examined |
| The file fails to load | ✗ one synthetic row named after the file (`test failed`); the real error survives only as `#` comment lines in the TAP output | ✗ "Unhandled error between tests", and **no junit is written** | ✗ file `status: "failed"` with the message, 0 test results |
| A test calls `process.exit(n)` | ✗ one synthetic file row whose pass/fail mirrors `n`; rows for tests that had ALREADY finished are lost too | ✗ no junit is written; exit code `n` | not examined |

Four traps any consumer has to handle:

- **Node's failing `todo` is a `test:fail` event that does not fail the run.** The run's own summary
  counted it under `todo`, not `failed`. A reader keyed on the event type alone would count it a real red.
- **Duplicate titles** come back as two rows from both runners, so a join on the title is ambiguous.
  Refuse them, or key on position (bun's line, node's `testNumber`).
- **`.only` is safe as the proof commands are written today, and a trap if a flag is ever added.** With
  no flag both runners run every test (node prints `'only' and 'runOnly' require the --test-only
  command-line option.`). With one, `node --test-only` drops the other tests without emitting skip rows,
  and **`bun test --only` ignores `node:test`'s `test.only`, ran 0 tests and exited 0**, writing no junit.
  Proof-command flags are spine-owned, so this is a wiring hazard rather than a leaf vector.
- **Bun's console output omits passing tests** when stdout is redirected, so it cannot tell "passed" from
  "never ran". Read the junit report, never the console.

## 5. Can CONFIRM_RED name which test went red, and why? (Q2)

### 5.1 The checker

`attribute.mjs` (Appendix A.4) joins two things: the EXPECTED tests, from ADR-0126's production static
read (`analyzeObservedTests`), and the runner's per-test report. It classifies each declared test and
decides the cluster: ADVANCE only if the report exists, every declared test appears exactly once, no
undeclared row was reported, and every test is individually red with an assertion — or, at green,
individually green. Its output matched a hand-derived expectation on all 32 runs in §5.2–§5.5, and it is not a
blanket refusal: the positive controls ADVANCED on both runners, at red and at green.

### 5.2 The cluster under each subject shape

Bun and node gave the same classification in every cell except the one footnoted.

| Test | ADR-0126 static | S1 non-throwing skeleton | S2 throwing skeleton | S3 absent, static import | S5 absent, dynamic import | S6 implemented |
|---|---|---|---|---|---|---|
| `add-sums` | vouches | red — assertion | red — wrong kind (`Error`) | not reported | red — structural¹ | green |
| `clamp-bounds` | vouches | red — assertion | red — wrong kind (`Error`) | not reported | red — structural¹ | green |
| `parse-port-refuses-garbage` | vouches | red — assertion | red — assertion | not reported | red — structural¹ | green |
| H1 empty body | HOLLOW | **passed at red** | **passed at red** | not reported | **passed at red** | green |
| H2 `assert.ok(true)` | HOLLOW | **passed at red** | **passed at red** | not reported | **passed at red** | green |
| H3 already satisfied | vouches | **passed at red** | **passed at red** | not reported | red — structural¹ | green |
| H4 calls, asserts nothing | HOLLOW | **passed at red** | red — wrong kind (`Error`) | not reported | red — structural¹ | green |
| W1 typo → `TypeError` | vouches | red — wrong kind | red — wrong kind | not reported | red — structural¹ | red — `TypeError` |
| **Suite exit code** | | 1 | 1 | 1 | 1 | 1 |
| **Checker** | | REFUSE (5 of 8) | REFUSE (7 of 8) | REFUSE — collapsed | REFUSE (8 of 8) | REFUSE — W1 |

¹ node reads `ERR_MODULE_NOT_FOUND` from the error code; bun's junit carries `type="Error"` with no
message, so on bun the checker can only call it a wrong-kind `Error`.

**P1** (the three real tests against S1) → 3 × red — assertion → **ADVANCE** on both runners. **P2**
(against S6) → 3 × green → **ADVANCE** on both. **S4** behaved exactly like S3: the one symbol that
existed bought nothing, because a missing named export fails the whole module link.

### 5.3 What the table says

- **The exit code is 1 in every column.** "The suite is red" was true of every cluster, including those
  whose hollow tests would have passed straight through — the arc's caveat, measured.
- **Only a loadable file is attributable.** S3/S4 is the shape of every net-new unit's red today, and it
  yields nothing per test on any runner.
- **The non-throwing skeleton is the only subject shape under which red-time attribution separates every
  hollow shape from the real tests.** The throwing skeleton hides H4 behind the same `Error` the real tests
  throw, and turns two real tests into wrong-kind reds — a false refusal under an assertion-kind rule.
- **A per-test dynamic import restores the rows but not the discrimination.** H3 and H4 go red for the
  same structural reason as the real tests; only H1 and H2 surface, and ADR-0126 already catches both. On
  bun the structural kind cannot even be read from the report.
- **At green every hollow test passes.** The red observation is the only runtime moment a hollow test is
  visible, which is why a review point has to sit between red and green rather than after green.
- **H3 is caught ONLY by red-time attribution; H1, H2 and H4 are also caught statically.** The two
  checks are complementary.
- **Per-test completeness also closes ADR-0211's documented limit.** E6's forged green is refused on both
  runners because its declared tests never reported — the "maximal cross-check" ADR-0211 deferred
  ("require that every vouching test the spine parsed actually completed").

Arc end-state item 5, in miniature: a hollow test beside a real red does not advance under per-test
attribution (S1, both runners), where today's gate advances it (§3).

### 5.4 Evasion shapes

| Shape | node | bun | Checker |
|---|---|---|---|
| E1 two tests, one title — one red, one hollow | two rows | two rows | REFUSE — title not unique |
| E2 `test.skip`, options `{ skip: true }`, `test.todo`, runtime `t.skip()` | all four flagged | all four `<skipped>` | REFUSE — not run. The options form **vouches** statically, ADR-0126's known blind spot; only the runtime report catches it |
| E3 `test.only` beside a real red and a hollow pass, no flag | all three run | all three run | REFUSE — hollow at red |
| E4 `process.exit(1)` mid-run | synthetic file row | no junit | REFUSE — declared tests not reported |
| E5 `process.exit(0)` at green | synthetic file PASS row | no junit, exit 0 | REFUSE — declared tests not reported (the oracle vetoes it too) |
| E6 a dummy assertion, then `process.exit(0)`, at green | synthetic file PASS row | no junit, exit 0 | REFUSE — where today's oracle signs it (§3) |

### 5.5 A legitimate guard-rail reads exactly like a hollow test at red

G1 (Appendix A.1) puts the two real contract tests `add-sums` and `parse-port-refuses-garbage` beside one
legitimate guard-rail, `parse-port-accepts-a-valid-port: a well-formed port never throws` — a property the
finished code must keep.

| Test | ADR-0126 static | Against S1, at red | Against S6, at green |
|---|---|---|---|
| `add-sums` | vouches | red — assertion | green |
| `parse-port-refuses-garbage` | vouches | red — assertion | green |
| G1 `parse-port-accepts-a-valid-port` | vouches | **passed at red** | green |
| **Checker** | | **REFUSE**, on both runners | ADVANCE, on both runners |

At red, G1's row is H3's row: substantive to the static read, passing against a subject that implements
nothing. What separates them is what the assertion MEANS, and no mechanical check reads meaning
(ADR-0563 D1). So C4 cannot be both strict against hollow tests and silent on guard-rails. The ways out
are ADR-0265's fork 4 — refuse every early pass, let the contract declare a guard-rail, or record without
refusing — and they are put to the owner as `oq-batched-red-test-passes-before-code-exists`. The cost is
not hypothetical: `map-server-memo` carried four contracts green against its null implementation, and
proving them took three hand-built wrong implementations (ADR-0265, Context).

## 6. What a bulk review point between red and green can check mechanically (Q3)

Each check is a refusal reason, never a score, and none asks a model anything (ADR-0447 D2, ADR-0563 D1).

| Check | What it compares | Catches (measured) | Available on |
|---|---|---|---|
| C1 report present | the per-test report exists | S3, S4, E4–E6 on bun | node, bun, vitest |
| C2 complete and unambiguous | every declared test reported exactly once; no undeclared row; unique title paths | S3/S4 collapse, E1, E4–E6 | node, bun, vitest |
| C3 ran | no declared test skipped or todo | E2, all four forms | node, bun |
| C4 individually red | every declared test failed | H1–H4 against a non-throwing subject; E3 — and it FALSE-REFUSES G1, a legitimate guard-rail (§5.5) | node, bun, vitest |
| C5 right kind, per test | each red is the declared kind (`ERR_ASSERTION` / `AssertionError` for an assertion red) | W1; H4 under a throwing skeleton | node (code), bun (type), vitest (text) |
| C6 static substance (ADR-0126) | each test holds a substantive assertion | H1, H2, H4 — even when they are red | any runner (static) |
| C7 contract naming (ADR-0122) | each of the cluster's contracts is named by a vouching test | a dropped contract | any runner (static) |

Which single check refuses which shape:

| | C2 | C3 | C4 | C5 | C6 |
|---|:-:|:-:|:-:|:-:|:-:|
| H1 empty body | | | ✓ | | ✓ |
| H2 constant assertion | | | ✓ | | ✓ |
| H3 asserts what already holds | | | ✓ | | |
| H4 calls, asserts nothing — non-throwing skeleton | | | ✓ | | ✓ |
| H4 under a throwing skeleton | | | | ✓ | ✓ |
| W1 wrong-kind red | | | | ✓ | |
| E1 duplicate title | ✓ | | | | |
| E2 options-form skip | | ✓ | | | |
| E6 dummy assertion + `exit(0)` | ✓ | | | | |
| G1 legitimate guard-rail | | | refuses it — WRONGLY | | |

- **Per-test red is the weaker bar (ADR-0265 D5).** C4 catches a test that is green against NOTHING. A
  test green against a plausible WRONG implementation passes every check in this section; that stronger
  bar is the mutation rung's.
- **What C4 does with a test that passes before code exists is not mechanical** — see §5.5 and
  `oq-batched-red-test-passes-before-code-exists`.
- **Not mechanical, and not attempted:** whether an assertion is RELEVANT to its contract. ADR-0447
  routes test strength to mutation testing after green — reachable for the bun and vitest packages, not
  `packages/orchestrator` (ADR-0563 D3).
- **Not available from either runner:** an assertion count per test (an "it asserted before it failed"
  kind basis per test). Extending the guard to attribute counts to tests is possible in principle and was
  not built here.
- **C5's false-refusal surface, not measured at scale:** a real test whose first failing operation
  dereferences a stub's return (`add(2, 3).toFixed()`) reds with a `TypeError` before its assertion runs.
  That fails loud and closed, never as a forged pass.

## 7. On which runners

- **`node --test` — yes, today.** A reporter module (Appendix A.3) gives per-test outcome, title path,
  error name and code, and skip / todo flags. It is the richest channel measured on why a test failed.
- **bun — yes, with three caveats.** `--reporter=junit` gives per-test rows and error types. It writes
  nothing when the file fails to load or the process exits (so a consumer must fail closed on a missing
  report), it loses the message for resolve errors, and it counts no `node:assert` calls. Only one bun
  observation is per-file today (§1): per-test observation on bun needs a single-file bun route as well as
  a reporter.
- **vitest — yes, on the two shapes measured.** `--reporter=json` gives rows with ancestry and failure
  text; a load failure collapses the file. Skip, todo and exit shapes were not exercised.
- **The ADR-0211 assert-oracle guard also works under `bun test --preload`** — measured, not inferred.
  The count read 5, matching node. Vector A (reassign `assert.equal`) → `TypeError: Attempted to assign to
  readonly property.`, exit 1. Vector B (`process.exit(0)` at import) → report `{"assertions":0}`. Vector C
  (`process.removeAllListeners("exit")`, then `exit(0)`) → no report. Without the guard all three exited 0.
  The route classifier treats `bun` as a package manager (suite-scoped, unaccounted); that is wiring, not
  capability.

**Where attribution cannot be made:** any unit whose red is a load failure — on every runner, which is
today's net-new static-import red. Those units keep the one-at-a-time shape until a decision changes the
shape of their red.

## 8. What this probe does not establish

- Deeper describe nesting, or one leaf title under two different describes. The join key must be the full
  title path; one level of nesting was measured.
- Linux or CI; bun's `--parallel`, `--concurrent`, `--randomize` or `--retry`; node's `--test-concurrency`.
- vitest's skip, todo and exit behaviour.
- C5's false-refusal rate on real tests.
- **Who would author a skeleton.** A stub the spine generates from the test's own imports stays outside
  the model's write scope, leaving ADR-0020 §2's time-sliced walls untouched; a model-authored one needs a
  source-scoped delegation of its own. Choosing is the owed ADR's job, not this probe's.
- Whether each of the 44 default-route nodes in bun packages can load under `node --import tsx --test` —
  a separate, known trap that was not re-measured.

## 9. What the evidence supports next

Parked on the arc in the same landing:

1. **Decide the batched observation contract — the ADR the arc owes.** A per-test report replaces the
   exit code for a cluster: C1–C3 as preconditions, C4 and C5 as the red, C6 and C7 as the static half,
   completeness plus every test individually green as the green. Settle the net-new red — keep
   one-at-a-time, a spine-generated non-throwing skeleton, or per-test dynamic import — against §5.2, and
   name each runner's report channel. It waits on the owner's answer to
   `oq-batched-red-test-passes-before-code-exists` — what C4 does with a test that passes before code
   exists — and should supersede ADR-0265 rather than leave its forks open.
2. **Observe a cluster per test in the spine, with the review point between red and green.** A per-test
   seam on the observer, the node reporter and bun junit wiring (including a single-file bun route the
   classifier describes truthfully), and the end-state-5 test: a hollow test beside a real red does not
   advance, and a clean cluster does. It writes `shell-test-observer` and `prove-it-gate`, so it waits on
   item 1 and on those capabilities being free.
3. **Brief the red author for a cluster and let the green author iterate against it.** It needs item 2,
   and `inner-loop-exit-arc-inc-03`'s feedback tools for the Codex leaf.

## Appendix A — reproduce

Paths are shown as `<worktree>` (the checkout the probe ran from) and `<scratch>` (a directory outside
the repo). `<tsx>` is `import.meta.resolve("tsx")` evaluated inside `packages/orchestrator`. Nothing else
differs from what ran.

### A.1 Fixtures

`<scratch>/run/package.json`:

```json
{ "name": "batched-red-probe", "private": true, "type": "module" }
```

`cluster.test.ts` — used by S1–S4 and S6:

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { add, clamp, parsePort } from "./subject.js";

describe("probe-cluster", () => {
  test("add-sums: add returns the sum of its operands", () => {
    assert.equal(add(2, 3), 5);
  });

  test("clamp-bounds: clamp pins a value inside [lo, hi]", () => {
    assert.equal(clamp(15, 0, 10), 10);
    assert.equal(clamp(-5, 0, 10), 0);
  });

  test("parse-port-refuses-garbage: parsePort throws on a non-numeric port", () => {
    assert.throws(() => parsePort("abc"), /not a port/);
  });

  // H1 — no assertion at all.
  test("hollow-empty: a test with no body", () => {});

  // H2 — a constant-only assertion (ADR-0126's documented hollow shape).
  test("hollow-tautology: asserts a constant", () => {
    assert.ok(true);
  });

  // H3 — substantive-looking, but already satisfied before any implementation exists.
  test("hollow-already-true: asserts something the skeleton already satisfies", () => {
    assert.equal(typeof add, "function");
  });

  // H4 — exercises the subject and asserts nothing about it.
  test("hollow-call-no-assert: calls the subject and asserts nothing", () => {
    add(2, 3);
  });

  // W1 — red, but for a reason that is not the contract (a typo'd member → TypeError).
  test("wrong-kind-red: a typo reds with a TypeError, not an assertion", () => {
    const subject: Record<string, unknown> = { add };
    const typo = subject["ad"] as (a: number, b: number) => number;
    assert.equal(typo(2, 3), 5);
  });
});
```

`cluster-dynamic.test.ts` (S5) is the same eight tests, with the static import replaced by
`const load = async () => await import("./subject.js");` and each test that touches the subject opening
with `const { add } = await load();` (or `clamp` / `parsePort`). The positive controls' `clean.test.ts`
is the first three tests of `cluster.test.ts`.

`subject.ts` per shape — S1 non-throwing skeleton:

```ts
export function add(a: number, b: number): number {
  void a;
  void b;
  return undefined as unknown as number;
}

export function clamp(value: number, lo: number, hi: number): number {
  void value;
  void lo;
  void hi;
  return undefined as unknown as number;
}

export function parsePort(text: string): number {
  void text;
  return undefined as unknown as number;
}
```

S2 is the same with each body `throw new Error("not implemented: <name>")`. S3 and S5 have no
`subject.ts`. S4 exports only an implemented `add`. S6:

```ts
export function add(a: number, b: number): number {
  return a + b;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function parsePort(text: string): number {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`not a port: ${text}`);
  }
  return n;
}
```

The evasion files, each beside the S1 subject unless noted (imports as in `cluster.test.ts`):

```ts
// E1 evade-dup.test.ts
test("add-sums: add returns the sum of its operands", () => { assert.equal(add(2, 3), 5); });
test("add-sums: add returns the sum of its operands", () => { assert.ok(true); });

// E2 evade-skip.test.ts
test("add-sums: add returns the sum of its operands", () => { assert.equal(add(2, 3), 5); });
test.skip("clamp-bounds: skipped by the modifier form", () => { assert.equal(clamp(15, 0, 10), 10); });
test("parse-port-refuses-garbage: skipped by the options form", { skip: true }, () => {
  assert.throws(() => parsePort("abc"), /not a port/);
});
test.todo("todo-modifier: a todo test whose body would fail", () => { assert.equal(add(1, 1), 2); });
test("skip-at-runtime: skipped by t.skip() inside the body", (t) => { t.skip("host-conditional"); });

// E3 evade-only.test.ts
test.only("add-sums: marked only", () => { assert.equal(add(2, 3), 5); });
test("clamp-bounds: not marked only", () => { assert.equal(clamp(15, 0, 10), 10); });
test("hollow-tautology: not marked only", () => { assert.ok(true); });

// E4 evade-exit.test.ts
test("add-sums: add returns the sum of its operands", () => { assert.equal(add(2, 3), 5); });
test("exits-the-process: calls process.exit(1) mid-run", () => { process.exit(1); });
test("clamp-bounds: never reached", () => { assert.equal(clamp(15, 0, 10), 10); });
test("hollow-tautology: never reached", () => { assert.ok(true); });

// E5 evade-exit0.test.ts — beside the S6 subject
test("exits-zero: calls process.exit(0) before the rest run", () => { process.exit(0); });
test("add-sums: a wrong expectation that would fail if it ran", () => { assert.equal(add(2, 3), 6); });

// E6 evade-exit0-dummy.test.ts — beside the S6 subject
test("dummy: one real assertion so the count floor reads at least one", () => { assert.equal(1, 1); });
test("exits-zero: calls process.exit(0) before the rest run", () => { process.exit(0); });
test("add-sums: a wrong expectation that would fail if it ran", () => { assert.equal(add(2, 3), 6); });
```

G1 `guardrail.test.ts`, beside S1 at red and S6 at green:

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { add, parsePort } from "./subject.js";

describe("probe-cluster", () => {
  test("add-sums: add returns the sum of its operands", () => {
    assert.equal(add(2, 3), 5);
  });

  test("parse-port-refuses-garbage: parsePort throws on a non-numeric port", () => {
    assert.throws(() => parsePort("abc"), /not a port/);
  });

  test("parse-port-accepts-a-valid-port: a well-formed port never throws", () => {
    assert.doesNotThrow(() => parsePort("8080"));
  });
});
```

### A.2 Runs

Per scenario directory, with the test file and `subject.ts` copied in:

```bash
bun test --reporter=junit --reporter-outfile=bun.junit.xml ./cluster.test.ts
node --import "<tsx>" --test \
  --test-reporter=tap --test-reporter-destination=node.tap \
  --test-reporter="file:///<scratch>/reporters/jsonl-reporter.mjs" --test-reporter-destination=node.jsonl \
  --test-reporter=junit --test-reporter-destination=node.junit.xml \
  ./cluster.test.ts
node "<worktree>/apps/studio/node_modules/vitest/vitest.mjs" run --globals --root . \
  --reporter=json --outputFile=vitest.json     # the vitest cluster uses expect(), no imports
# the oracle, one count per process:
STORYTREE_PROOF_REPORT="$PWD/oracle" node --import "<tsx>" \
  --import "file:///<worktree>/packages/orchestrator/src/proof/assert-oracle-guard.mjs" --test ./cluster.test.ts
STORYTREE_PROOF_REPORT="$PWD/rep" bun test \
  --preload "<worktree>/packages/orchestrator/src/proof/assert-oracle-guard.mjs" ./cluster.test.ts
```

The checker runs from `<worktree>/packages/orchestrator`, so the static read resolves its parser:

```bash
node --import "<tsx>" <scratch>/attribute.mjs <dir>/cluster.test.ts <dir>/node.jsonl node-jsonl red
node --import "<tsx>" <scratch>/attribute.mjs <dir>/cluster.test.ts <dir>/bun.junit.xml bun-junit red
```

### A.3 The node reporter module

```js
export default async function* jsonlReporter(source) {
  for await (const event of source) {
    const { type } = event;
    if (!["test:pass", "test:fail", "test:diagnostic", "test:summary"].includes(type)) continue;
    const d = event.data ?? {};
    const out = { type };
    for (const key of ["name", "nesting", "file", "line", "column", "testNumber", "skip", "todo", "success", "counts"]) {
      if (d[key] !== undefined) out[key] = d[key];
    }
    if (type === "test:diagnostic") out.message = d.message;
    const details = d.details;
    if (details !== undefined) {
      out.testType = details.type;
      const err = details.error;
      if (err !== undefined) {
        out.failureType = err.failureType;
        out.errorCode = err.code;
        const cause = err.cause;
        if (cause !== undefined && cause !== null) {
          out.causeName = cause.name ?? cause.constructor?.name;
          out.causeCode = cause.code;
          const msg = typeof cause.message === "string" ? cause.message : String(cause);
          out.causeMessage = msg.split("\n")[0];
        }
      }
    }
    yield `${JSON.stringify(out)}\n`;
  }
}
```

### A.4 The checker — `attribute.mjs`

```js
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const W = "<worktree>";
const { analyzeObservedTests } = await import(
  `file:///${W}/packages/orchestrator/src/proof/contract-coverage.ts`
);

const [testFile, reportFile, format, phaseArg] = process.argv.slice(2);
const phase = phaseArg === "green" ? "green" : "red";
const pathKey = (ancestors, name) => [...ancestors, name].join(" > ");

// 1. EXPECTED: the leaf tests the static read observes (a container of other tests is a suite).
const observed = analyzeObservedTests(readFileSync(testFile, "utf8"));
const containers = new Set(
  observed.flatMap((t) => t.ancestors.map((_, i) => pathKey(t.ancestors.slice(0, i), t.ancestors[i]))),
);
const expected = observed.filter((t) => !containers.has(pathKey(t.ancestors, t.name)));

// 2. REPORTED: normalise either report into { ancestors, name, outcome, errorName, errorCode, message }.
function fromNodeJsonl(text) {
  const pending = new Map(); // nesting -> rows awaiting their parent suite (node emits children first)
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const e = JSON.parse(line);
    if (e.type !== "test:pass" && e.type !== "test:fail") continue;
    const n = e.nesting ?? 0;
    const children = pending.get(n + 1) ?? [];
    for (const c of children) c.ancestors.unshift(e.name);
    pending.set(n + 1, []);
    const level = pending.get(n) ?? [];
    if (e.testType !== "suite") {
      const outcome = e.todo !== undefined ? "todo" : e.skip !== undefined ? "skip" : e.type === "test:pass" ? "pass" : "fail";
      level.push({ ancestors: [], name: e.name, outcome, errorName: e.causeName, errorCode: e.causeCode, message: e.causeMessage ?? "" });
    }
    level.push(...children);
    pending.set(n, level);
  }
  return pending.get(0) ?? [];
}

function decode(s) {
  return s.replace(/&#10;/g, "\n").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function attr(attrs, key) {
  const m = new RegExp(`\\b${key}="([^"]*)"`).exec(attrs);
  return m === null ? undefined : decode(m[1]);
}
function fromBunJunit(text) {
  const rows = [];
  const suites = [];
  let current = null;
  const tag = /<(\/?)(testsuite|testcase|failure|skipped)\b([^>]*?)(\/?)>/g;
  for (let m = tag.exec(text); m !== null; m = tag.exec(text)) {
    const [, closing, name, attrs, selfClosing] = m;
    if (name === "testsuite") {
      if (closing === "/") suites.pop();
      else suites.push(attr(attrs, "name") ?? "");
    } else if (name === "testcase") {
      if (closing === "/") { current = null; continue; }
      // suites[0] is bun's per-FILE wrapper; the describe path starts below it.
      current = { ancestors: suites.slice(1), name: attr(attrs, "name") ?? "", outcome: "pass", errorName: undefined, errorCode: undefined, message: "" };
      rows.push(current);
      if (selfClosing === "/") current = null;
    } else if (name === "failure" && closing !== "/" && current !== null) {
      current.outcome = "fail";
      current.errorName = attr(attrs, "type");
      current.message = (attr(attrs, "message") ?? "").split("\n")[0];
    } else if (name === "skipped" && closing !== "/" && current !== null) {
      current.outcome = attr(attrs, "message") === "TODO" ? "todo" : "skip";
    }
  }
  return rows;
}

const reportPresent = existsSync(reportFile);
const rows = !reportPresent ? [] : format === "bun-junit" ? fromBunJunit(readFileSync(reportFile, "utf8")) : fromNodeJsonl(readFileSync(reportFile, "utf8"));

// 3. JOIN on the full title path, and classify each expected test.
const reportedByKey = new Map();
for (const r of rows) {
  const k = pathKey(r.ancestors, r.name);
  reportedByKey.set(k, [...(reportedByKey.get(k) ?? []), r]);
}
const expectedCount = new Map();
for (const t of expected) {
  const k = pathKey(t.ancestors, t.name);
  expectedCount.set(k, (expectedCount.get(k) ?? 0) + 1);
}

function classify(r) {
  if (r.outcome === "skip") return "NOT RUN (skipped)";
  if (r.outcome === "todo") return "NOT RUN (todo)";
  if (phase === "green") return r.outcome === "pass" ? "GREEN" : `RED (${r.errorName ?? "unknown"})`;
  if (r.outcome === "pass") return "HOLLOW AT RED (passed with nothing implemented)";
  if (r.errorCode === "ERR_ASSERTION" || r.errorName === "AssertionError") return "RED (assertion)";
  if (r.errorCode === "ERR_MODULE_NOT_FOUND" || /Cannot find module|Export named/.test(r.message)) return "RED (structural)";
  return `RED (wrong kind: ${r.errorName ?? "unknown"}${r.message ? ` — ${r.message.slice(0, 60)}` : ""})`;
}

const lines = [];
const statuses = [];
for (const t of expected) {
  const k = pathKey(t.ancestors, t.name);
  const reported = reportedByKey.get(k) ?? [];
  let status;
  if ((expectedCount.get(k) ?? 0) > 1 || reported.length > 1) status = "AMBIGUOUS (title not unique)";
  else if (reported.length === 0) status = "MISSING (never reported)";
  else status = classify(reported[0]);
  statuses.push(status);
  lines.push(`  ${status.padEnd(48)} static:${t.skipped ? "skipped" : t.vouches ? "vouches" : "HOLLOW "}  ${t.name}`);
}
const unexpected = rows.filter((r) => !expectedCount.has(pathKey(r.ancestors, r.name)));
for (const r of unexpected) {
  const synthetic = r.name === basename(testFile) ? " — a synthetic FILE-level row: the runner lost per-test attribution" : "";
  lines.push(`  UNEXPECTED ROW (${r.outcome})${synthetic}  ${pathKey(r.ancestors, r.name)}`);
}

// 4. The cluster decision. Every condition is a refusal reason, never a score.
const refusals = [];
if (!reportPresent) refusals.push("no per-test report was written");
if (unexpected.length > 0) refusals.push(`${unexpected.length} reported row(s) match no declared test`);
const wanted = phase === "green" ? ["GREEN"] : ["RED (assertion)"];
const off = statuses.filter((s) => !wanted.includes(s)).length;
if (off > 0) refusals.push(`${off} of ${statuses.length} declared test(s) are not ${wanted[0]}`);
const substance = expected.filter((t) => !t.skipped && !t.vouches).length;

console.log(`${basename(testFile)} via ${format} [${phase}] — ${rows.length} per-test row(s), report ${reportPresent ? "present" : "ABSENT"}`);
console.log(lines.join("\n"));
console.log(`  → attribution verdict: ${refusals.length === 0 ? "ADVANCE" : `REFUSE — ${refusals.join("; ")}`}`);
console.log(`  → static substance (ADR-0126) alone would flag ${substance} of ${expected.length}`);
```

### A.5 The negative control

Run from `<worktree>` as `node --import "<tsx>" --input-type=module -` with `PROBE_RUN_DIR` set:

```js
const W = "<worktree>";
const O = `file:///${W}/packages/orchestrator/src`;
const { realProofCommand } = await import(`${O}/resolve-prove-spec.ts`);
const { ShellTestExecutor } = await import(`${O}/shell-test-executor.ts`);
const { nextPhase } = await import(`${O}/phase-machine.ts`);
const oa = await import(`${O}/proof/oracle-accounting.ts`);
const R = process.env.PROBE_RUN_DIR;
const cases = [
  ["red-skel-return", "cluster.test.ts", "CONFIRM_RED"],
  ["red-skel-throw", "cluster.test.ts", "CONFIRM_RED"],
  ["red-absent", "cluster.test.ts", "CONFIRM_RED"],
  ["evade-exit0", "evade-exit0.test.ts", "CONFIRM_GREEN"],
  ["evade-exit0-dummy", "evade-exit0-dummy.test.ts", "CONFIRM_GREEN"],
];
for (const [scenario, testFile, phase] of cases) {
  const workspace = `${R}/${scenario}`;
  const real = { testFile, sourceFile: "subject.ts", scope: { testGlobs: ["*.test.ts"], sourceGlobs: ["subject.ts"] } };
  const base = realProofCommand(real, workspace);
  const reportPath = oa.allocateOracleReportPath("batched-red-probe", scenario);
  const cmd = { ...base.command, env: { ...(base.command.env ?? {}), [oa.PROOF_REPORT_ENV]: reportPath } };
  const measurable = base.route.accounting === "oracle" && (base.route.basis === "default-node-test" || base.route.basis === "custom-node-test-own-file");
  const resolver = { command: () => cmd, beforeRun: () => oa.resetOracleReport(reportPath), verifyGreen: (out) => oa.verifyOracleExercised(reportPath, out) };
  if (measurable) resolver.measureRedKind = () => oa.classifyRedByOracle(reportPath);
  const obs = await new ShellTestExecutor(resolver).run(scenario);
  const { originalProcessResult, ...shown } = obs;
  console.log(`\n## ${scenario} [${phase}] route=${base.route.basis} exit=${originalProcessResult?.exitCode} assertions=${oa.readAssertionCount(reportPath)}`);
  console.log("  observation:", JSON.stringify(shown));
  if (phase === "CONFIRM_RED") {
    console.log("  nextPhase, node declares structural:", JSON.stringify(nextPhase(phase, obs, "structural")));
    console.log("  nextPhase, node declares assertion: ", JSON.stringify(nextPhase(phase, obs, "assertion")));
  } else {
    console.log("  nextPhase:", JSON.stringify(nextPhase(phase, obs)));
  }
}
```

### A.6 The route census

For every `stories/**/*.md`, `loadNodeSpec(file).buildConfig?.real` was classified with
`classifyProofRoute(real, { workspaceRoot: "<worktree>" })`; a `pnpm --filter <pkg> test` command's
runner was read from that package's own `scripts.test`, and a default route's from the package holding
its `testFile`. 340 files, 337 parsed, 144 with a `real:` block, none under a retired path.
