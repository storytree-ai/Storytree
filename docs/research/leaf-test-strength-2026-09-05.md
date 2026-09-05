# How strong are the tests the leaf writes and the spine accepts?

**Taken 2026-09-05.** `verdict-accuracy-arc` increment 1. Instrument:
`packages/cli/src/leaf-test-strength.ts` (+ `.run.ts`), run as `pnpm leaf-test-strength`.

This document BANKS A READING and adjudicates nothing. No gate rung is added, no threshold is set,
and no guidance changes on the strength of anything below — that is the arc's stated posture
("measure first, decide never", after `spine-wall-measurement-arc`). If a number here is bad, it is
an owner fork to be opened on the evidence, not a decision to be taken inside the increment that
produced it.

---

## The question, and why it is not already answered

The prove-it-gate makes red→green non-forgeable: the spine observes a test failing, then the same
test passing, and signs a verdict over the result. What that attests is that **a** wrong answer was
caught. It does not attest that the test would catch a **different** wrong answer — that the test
constrains behaviour rather than merely executing it.

Mutation testing is the standard instrument for that question, and this repo already owns the
machinery: `@stryker-mutator/core` is a dependency, and `check:mutation-diff` is a declared gate
step. What did not exist was the **population** — a way to say which tests in this repo were
actually written by a leaf under a spine-observed red→green, as opposed to written by a session by
hand.

`check:mutation-diff` does not answer this. It scores what a **branch changed**, which is a
different subject: it cannot tell a leaf-authored test from a hand-written one, and it never looks
at a test whose branch has already landed.

---

## Resolving the population — the bulk of the work

### The route that does not exist

A verdict row (`events.verdict`) names a `unitId`, a `runId` and a `commitSha`. **It does not name a
file.** The field designed to close that gap is ADR-0016's binding anchor, `boundHash` — the
content hash (`hashSpan`) of the span the verdict proved. The schema marks it optional and tells a
reader to key off its *presence*, never its absence.

> **Finding 1 — `boundHash` is stamped on ZERO of the 665 stored verdicts.**
>
> Not "mostly absent on older rows". Absent on all of them, from the first verdict (2026-06-10) to
> the last (2026-08-31). The schema comment predicted exactly this — *"every current caller until
> gate-emits-change wires it carries none"* — and the wiring never landed. So the span-level route
> to a proved file is unavailable for the whole corpus, and the number of verdicts this reading had
> to drop for want of one is **all of them, had `boundHash` been the only route**.

This is reported first because it is the finding with the longest reach: nothing in the verdict
history today can say *which bytes* a green proved, so every downstream question that needs a span
— drift, staleness, a false-pass probe (this arc's increment 2) — has to reach for a weaker proxy
or wire the anchor first.

### The route that does exist, and what it costs

A `--real` build resolves its node's own `proof:` block. The `real:` arm of that block declares
exactly two paths:

- `real.testFile` — the only file phase `AUTHOR_TEST` may write;
- `real.sourceFile` — the implementation file named in the leaf brief, which phase `IMPLEMENT`
  writes under its own scope.

Those two paths **are** the leaf's authoring surface for that build: the phase machine's write walls
are constructed from them, so a leaf physically could not have written elsewhere. Resolving
`unitId → spec → real arm` therefore names the pair a leaf wrote — at **file grain** rather than
span grain.

What that costs, stated rather than hidden:

1. **File grain cannot separate the leaf's bytes from later edits** by other sessions to the same
   file. Measured below, per pair, from git.
2. **A re-proof of the same unit re-uses the same pair**, so the population is deduped by unit: a
   unit proved four times contributes one test file, not four.
3. **For an `editsExisting` unit the file is not all the leaf's**, which is why the reading is split
   by authoring shape below rather than pooled into one figure.

### The population, with its denominators

| | verdicts | |
|---|---:|---|
| stored in `events.verdict` | **665** | every row, 2026-06-10 → 2026-08-31 |
| carrying a `boundHash` | **0** | Finding 1 |
| **resolved to a leaf pair** | **178** | the population |
| excluded — `not-a-pass` | 2 | two `operator-attested` fails; a failed verdict says nothing about test strength |
| excluded — `no-observed-red` | 439 | 419 `adopted` (brownfield go-green — no leaf authored them) + 20 `operator-attested` passes |
| excluded — `spec-missing` | 8 | the unit id resolves to no spec on disk |
| excluded — `no-proof-config` | 10 | a spec exists but declares no `proof:` block and the registry has no entry |
| excluded — `no-real-arm` | 28 | a proof config exists but is dry-run/live-smoke only, so it names no authored file pair |

Those six rows sum to 665 exactly.

At **unit** grain, the 224 pass-with-an-observed-red verdicts cover 148 distinct units, which split:

| bucket | units | note |
|---|---:|---|
| **resolved to a leaf pair** | **108** | the scored population |
| `spec-missing` | 8 | see below — two of these are a reader limit, not a retirement |
| `no-proof-config` | 8 | all in the `model-judged-uat` / `model-uat-witness` families |
| `no-real-arm` | 24 | proved through a registry/spec command with no `real:` arm |

**The eight `spec-missing` units are not one thing, and two of them are a limit of this reader:**
`library#gate-4` and `library#gate-5` are *reliability gates*, which live inside a story's
`## Reliability Gates` prose rather than in a spec file of their own, and are proved by **borrowing**
another node's `real:` arm (`seed-corpus-scripts` and `event-sourced-store-seam` respectively).
`findNodeSpecFile` resolves `stories/<story>/<id>.md` and `stories/<id>/story.md`, so it cannot see
them. Closing that gap means teaching the reader the gate-borrows-an-arm indirection; it is a known
hole, named, not a silent drop. The other six (`library-focus-subgraph`, `library-lens-minimise`,
`terminal-dock-seed`, `transcript-occupancy-activation`, `uat-detail-seed-sync`,
`window-occupancy-vocabulary`) have no spec of their own; four are still *mentioned* inside sibling
specs, two are absent from `stories/` entirely — the ordinary residue of units that were folded or
renamed after they were proved.

### How stale the population is

The reading mutates the files **as they stand now**, not as the leaf left them. For each pair, git
was asked whether the test file has been touched since the commit of the *earliest* verdict that
admitted it (the earliest, not the latest: a unit re-proved after an edit would otherwise report
itself fresh precisely because it was edited).

| | pairs |
|---|---:|
| test file **touched** since its first proof | 93 |
| test file **unchanged** since its first proof | 10 |
| **unknowable** — the proof commit is not in this checkout's history | 5 |

> **Finding 2 — 93 of 108 leaf-authored test files have been edited since the verdict that admitted
> them.**
>
> So this is a reading about *the tests that stand today in the files a leaf was scoped to author*,
> which is the honest description of it. It is not a reading about the exact bytes any leaf emitted;
> that reading is unavailable in this corpus and will stay unavailable until `boundHash` is wired.
> The "unknowable" five are a third state and are counted as one — the proof ran on a branch whose
> commit was squashed away, so git cannot answer, and that is not the same as "unchanged".

---

## Method — how the mutation reading is taken

For each of the 108 pairs, **one Stryker run**:

- `mutate: [<the pair's sourceFile>]` — exactly one file;
- the test set narrowed to `[<the pair's testFile>]` — exactly one file.

**Isolation is the measurement, not an optimisation.** Running the pair's package suite would credit
the leaf's test with kills made by every other test in the package, which is the opposite of the
question being asked. With one test file running, every `Killed` was killed by the authored test, so
no `killedBy` attribution is needed to say so.

The runner is chosen from the project's own `test` script through `check:mutation-diff`'s own
`runnerFor`, never re-derived: `bun test` projects get the bun plugin, `vitest run` projects get the
vitest plugin with a narrowed config that **extends** the project's own (dropping the spread would
drop `apps/studio`'s React plugin and its `self`→globalThis setup file, and every test would then
fail for reasons unrelated to the mutant).

**A `Timeout` is not counted as a kill.** Stryker's own headline figure credits one; this reading
does not, because `check:mutation-diff` already refuses that credit — it maps every `Timeout` to
`unproven`, *"the suite hung rather than asserting… this cannot be credited to the branch's own
tests"*. A reading that silently disagreed with the rung beside it would be the harder number to
trust. Timeouts stay visible in every tally, so the lenient figure is recomputable by anyone who
wants it.

`CompileError` / `RuntimeError` / `Ignored` mutants are **excluded from every denominator** rather
than scored either way — they say nothing about the test. Any figure whose denominator is zero
reports an absence (`n/a`), never a 0%: the arc's end state requires that "we measured and they are
weak" and "we could not measure" read differently, and a 0% that is really an absence is exactly
that confusion.

### Three figures, because one would be two different claims wearing one hat

> **Finding 3 — a whole-file mutation score run with one test file reports a catastrophic near-0%
> when the test simply does not reach the code, and that is indistinguishable from a weak test
> unless coverage is reported beside it.**
>
> Measured on the pair `arc-explicit-id-fidelity`, whose spec declares
> `packages/cli/src/cli.test.ts` against `packages/arc/src/arc.ts` — a test in **another package**
> that exercises the CLI **out of process**:
>
> ```
> 0.0% of 2553 mutant(s) killed   (killed 0 / survived 4 / timeout 0 / NoCoverage 2549)
> ```
>
> Read as a mutation score that is a five-alarm result about a test. It is not a result about the
> test at all: the test never executes 2549 of those mutants. Of the 4 it does reach it kills none —
> which is the only honest sentence available, over a denominator of 4.

So each pair reports three numbers, and the aggregate pools all three:

```
score        = killed / (killed + survived + timeout + noCoverage)   the whole file
covered      = killed / (killed + survived + timeout)                what the test executes
reach        = (killed + survived + timeout) / all four              the instrument's range
```

**`reach` is an instrument figure, never a quality one.** A low reach says *this pair's declared
test does not exercise this source in-process* — a fact about the declared pair. It is the same
distinction `check:mutation-diff` draws when it refuses to score an `unproven` mutant as either a
pass or a survivor.

(Note for anyone re-taking this: `NoCoverage` statuses appear in the reports even though the
generated config sets `coverageAnalysis: "off"`. The reading takes the statuses the report actually
carries rather than the ones the config implies.)

### The split that stops the headline being wrong

Mutation is scoped to the whole source file, because with no `boundHash` there is no span to scope
to. That is exactly right for a **net-new** pair — the leaf authored the whole file, so every mutant
sits in code its test was meant to cover. It is **not** right for an `editsExisting` pair: there the
leaf added a regression test for one behaviour in a file that already existed, and every mutant in
the pre-existing remainder is scored against a test that was never asked to cover it.

The two subsets therefore measure different things, and a pooled figure over both is a number that
is true of neither. They are reported separately: the net-new subset is the clean reading of
leaf-test strength; **the edits-existing subset is a lower bound and is labelled as one.**

Of the 108 pairs, 47 are `editsExisting` and 61 are net-new. (62 of 108 also declare their own
`proofCommand`, meaning the spine's green for that unit was a whole suite rather than the one file;
that is recorded per pair as `suiteOracle` and does not change what is being measured here — the
authored test — but it does mean a weak score there is a statement about the authored test alone,
not about what the spine actually observed.)

---

## The reading

<!-- READING -->

---

## Re-taking this over a different body of work

This is what the arc's end state 3 needs when the owner's real codebase engagement arrives. The
instrument takes no arguments about *which* corpus it reads: it reads `events.verdict` and the
`stories/` tree of the checkout it runs in.

```bash
pnpm db:up                                   # the population comes from the live store
pnpm leaf-test-strength --population         # denominators only — seconds, no mutants
pnpm leaf-test-strength --score              # the full reading — hours; writes incrementally
pnpm leaf-test-strength --score --limit 20   # a bounded prefix, in unit-id order
pnpm leaf-test-strength --markdown           # re-render the banked reading as the table above
```

`--score` writes `reports/leaf-test-strength.json` (gitignored) after **every** pair, so an
interrupted run is a partial reading rather than a lost one. `--markdown` re-renders whatever is
banked — **the table above is that command's output, not a transcription**, so the doc's numbers
stay checkable against the artifact instead of drifting from it.

Budget, measured on this box (12 logical cores, `concurrency: 4`, sharing the machine with another
session's gate): about **1.2–1.4 minutes per pair**, dominated by the `apps/studio` vitest pairs at
~250 s each against ~20–40 s for a bun pair. 108 pairs is therefore a ~2–3 hour background run, not
an inner-loop command.

To point it at another engagement, three things have to be true of that work, and they are the same
three that make it a storytree engagement at all:

1. the work was driven as `--real` builds, so `events.verdict` holds spine-observed red→green rows;
2. each unit's spec carries a `proof:` block with a `real:` arm, so `unitId` resolves to a file pair;
3. the checkout the instrument runs in is the one those paths refer to.

Nothing else is configured. If `boundHash` is wired before that engagement, the resolution can be
tightened from file grain to span grain **without changing the reading's shape** — the population
step gains a route, the scoring step gains a narrower `mutate`, and every denominator above keeps
its meaning.

---

## What this does NOT establish

- **Not a quality bar.** No threshold is set here and none should be read into the numbers. ADR-0447
  already holds that the mutation rung's verdict is never a percentage.
- **Not a statement about the spine.** A weak authored test is not a forged green: the spine
  genuinely observed the red and the green. It is a statement about how much a green *implies*.
- **Not a false-pass measurement.** Whether a signed green was later contradicted by a fix inside the
  span it bound is this arc's increment 2, and is deliberately separate.
- **Not comparable to `check:mutation-diff`'s numbers.** Different population (landed leaf-authored
  files vs a branch's changed spans), different scoping (whole file vs changed lines), different
  test set (one authored file vs the covering set). The two answer different questions and their
  percentages are not interchangeable.
