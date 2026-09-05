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

### What it says

> **Finding 4 — on files the leaf authored ENTIRELY, its tests kill 72.1% of seeded faults across
> the whole file, and 79.9% of the faults they actually reach, over 58 pairs and 6,197 mutants.**
>
> That is the clean reading, and it is the one to quote. It says a signed green in this repo is
> backed by a test that constrains behaviour rather than merely executing it — not perfectly, and
> the survivors are worth a look, but this is not a corpus of tests that pass whatever the code
> does. Reach of 90.3% says the leaf's test genuinely exercises the file the leaf wrote.
>
> **The edits-existing subset reads 27.9% / 53.5% at 52.0% reach, and that is a LOWER BOUND, not a
> second finding.** Those 41 pairs carry 17,064 of the 23,261 mutants — nearly three times the
> net-new subset — because whole-file mutation over a file the leaf only partly wrote counts every
> pre-existing line against a test that was never asked to cover it. Pooling the two subsets gives
> **39.7%**, a number that is true of neither and should not be quoted as "the leaf's tests score
> 40%".

The per-pair rows below are the evidence, ordered strongest first. `k/s/t/n` is
killed / survived / timeout / no-coverage.

**99 of 108 pairs scored** (9 could not be run — listed below).

| subset | pairs | mutants | score (whole file) | score (covered only) | reach |
|---|---:|---:|---:|---:|---:|
| **all scored** | 99 | 23261 | 39.7% | 63.7% | 62.2% |
| net-new | 58 | 6197 | 72.1% | 79.9% | 90.3% |
| edits-existing *(lower bound)* | 41 | 17064 | 27.9% | 53.5% | 52.0% |

Mean of per-pair whole-file scores: **60.1%** over 96 pair(s) that generated any mutant.

| unit | shape | mutants | score | covered | reach | k/s/t/n | test file since proof |
|---|---|---:|---:|---:|---:|---|---|
| `colour-by-subagent` | net-new | 13 | 100.0% | 100.0% | 100.0% | 13/0/0/0 | edited |
| `gate-ci-parity` | net-new | 167 | 100.0% | 100.0% | 100.0% | 167/0/0/0 | edited |
| `green-gate` | net-new | 170 | 100.0% | 100.0% | 100.0% | 170/0/0/0 | edited |
| `take-claim-at-spawn` | net-new | 8 | 100.0% | 100.0% | 100.0% | 8/0/0/0 | edited |
| `uat-machine-gate-resolution` | edits | 60 | 100.0% | 100.0% | 100.0% | 60/0/0/0 | edited |
| `terminal-boundary-observations` | net-new | 312 | 98.4% | 98.4% | 100.0% | 307/3/2/0 | edited |
| `leaf-slice-spawn-observations` | net-new | 73 | 95.9% | 95.9% | 100.0% | 70/3/0/0 | edited |
| `render-claim-as-wisp` | net-new | 23 | 95.7% | 95.7% | 100.0% | 22/1/0/0 | edited |
| `witnessable-verdict` | net-new | 69 | 95.7% | 95.7% | 100.0% | 66/3/0/0 | same |
| `transcript-occupancy-ingest` | net-new | 45 | 95.6% | 95.6% | 100.0% | 43/2/0/0 | edited |
| `library-selection-card` | net-new | 22 | 95.5% | 95.5% | 100.0% | 21/1/0/0 | edited |
| `criterion-detail-hash-anchor` | net-new | 15 | 93.3% | 93.3% | 100.0% | 14/1/0/0 | same |
| `deploy-health-signal` | net-new | 75 | 93.3% | 95.9% | 97.3% | 70/3/0/2 | edited |
| `review-refresh-feed` | net-new | 15 | 93.3% | 100.0% | 93.3% | 14/0/0/1 | edited |
| `decision-point-playback` | net-new | 194 | 92.8% | 92.8% | 100.0% | 180/14/0/0 | edited |
| `graduation-park-lease` | net-new | 91 | 90.1% | 90.1% | 100.0% | 82/8/1/0 | same |
| `agent-ref-descent` | net-new | 111 | 90.1% | 91.7% | 98.2% | 100/9/0/2 | edited |
| `story-author-detail-authority` | net-new | 10 | 90.0% | 90.0% | 100.0% | 9/1/0/0 | edited |
| `library-dive-body` | net-new | 19 | 89.5% | 89.5% | 100.0% | 17/2/0/0 | edited |
| `library-lifecycle-shelf` | edits | 102 | 88.2% | 90.0% | 98.0% | 90/10/0/2 | edited |
| `build-spawn-capture` | net-new | 47 | 87.2% | 87.2% | 100.0% | 41/6/0/0 | edited |
| `r3f-world-spike` | net-new | 252 | 86.9% | 88.0% | 98.8% | 219/29/1/3 | edited |
| `builder-role` | edits | 129 | 86.8% | 87.5% | 99.2% | 112/14/2/1 | edited |
| `node-resolve-report` | net-new | 62 | 85.5% | 86.9% | 98.4% | 53/8/0/1 | edited |
| `revisit-link-metadata` | net-new | 39 | 84.6% | 91.7% | 92.3% | 33/3/0/3 | same |
| `dogfood-probe-mrfuze9m` | net-new | 17 | 82.4% | 82.4% | 100.0% | 14/3/0/0 | same |
| `multi-adapter-replay` | net-new | 107 | 82.2% | 85.4% | 96.3% | 88/15/0/4 | edited |
| `pty-session-manager` | edits | 166 | 81.9% | 85.5% | 95.8% | 136/21/2/7 | edited |
| `act2-beat-director` | net-new | 194 | 81.4% | 82.7% | 98.5% | 158/33/0/3 | edited |
| `collapsed-suggestion-view` | net-new | 49 | 79.6% | 84.8% | 93.9% | 39/7/0/3 | edited |
| `transcript-occupancy-extraction` | net-new | 132 | 79.5% | 82.0% | 97.0% | 105/23/0/4 | edited |
| `web-experience-sync` | edits | 164 | 79.3% | 79.8% | 99.4% | 130/33/0/1 | edited |
| `experience-rollout-guardrails` | net-new | 441 | 77.6% | 90.7% | 85.5% | 342/32/3/64 | edited |
| `ambient-integration` | net-new | 128 | 77.3% | 79.2% | 97.7% | 99/26/0/3 | edited |
| `repo-picker-panel` | net-new | 35 | 77.1% | 77.1% | 100.0% | 27/8/0/0 | edited |
| `map-boot-independence` | edits | 260 | 75.4% | 92.5% | 81.5% | 196/16/0/48 | edited |
| `desktop-launch-preconditions` | net-new | 28 | 75.0% | 75.0% | 100.0% | 21/7/0/0 | edited |
| `backend-chat-reset-route` | net-new | 19 | 73.7% | 73.7% | 100.0% | 14/4/1/0 | same |
| `traversal-event-vocabulary` | net-new | 81 | 72.8% | 78.7% | 92.6% | 59/16/0/6 | edited |
| `brokered-local-uat-signing` | net-new | 119 | 72.3% | 74.8% | 96.6% | 86/29/0/4 | edited |
| `transcript-session-correlation` | net-new | 173 | 71.1% | 78.3% | 90.8% | 123/33/1/16 | edited |
| `noticeboard-cli` | net-new | 543 | 71.1% | 74.5% | 95.4% | 386/132/0/25 | edited |
| `traversal-session-query` | net-new | 261 | 70.1% | 76.9% | 91.2% | 183/55/0/23 | edited |
| `hosted-story-landlord-rule` | edits | 759 | 69.8% | 72.8% | 95.9% | 530/196/2/31 | edited |
| `packages-forward-refusal` | edits | 759 | 69.8% | 72.8% | 95.9% | 530/196/2/31 | edited |
| `cloud-sql-admin-rest` | net-new | 72 | 69.4% | 69.4% | 100.0% | 50/22/0/0 | edited |
| `criterion-detail-pointer` | net-new | 90 | 68.9% | 73.8% | 93.3% | 62/22/0/6 | edited |
| `repo-selection` | net-new | 47 | 68.1% | 78.0% | 87.2% | 32/9/0/6 | same |
| `orientation-runner-telemetry` | net-new | 96 | 66.7% | 69.6% | 95.8% | 64/28/0/4 | edited |
| `terminal-repo-gate` | edits | 49 | 65.3% | 65.3% | 100.0% | 32/17/0/0 | edited |
| `hud-chrome` | edits | 67 | 64.2% | 70.5% | 91.0% | 43/18/0/6 | edited |
| `multi-session-tabs` | edits | 593 | 63.7% | 65.9% | 96.8% | 378/190/6/19 | edited |
| `seed-opens-new-tab` | edits | 593 | 63.7% | 65.9% | 96.8% | 378/190/6/19 | edited |
| `terminal-dock-panel` | edits | 593 | 63.7% | 65.9% | 96.8% | 378/190/6/19 | edited |
| `local-backend-boot` | net-new | 315 | 62.9% | 69.7% | 90.2% | 198/51/35/31 | edited |
| `accept-reject-suggestion-api` | net-new | 76 | 61.8% | 70.1% | 88.2% | 47/13/7/9 | edited |
| `member-suggest-write-policy` | edits | 147 | 61.2% | 79.6% | 76.9% | 90/23/0/34 | edited |
| `shared-forest-connection` | edits | 143 | 59.4% | 63.0% | 94.4% | 85/49/1/8 | edited |
| `traversal-trace-sink` | net-new | 188 | 59.0% | 70.3% | 84.0% | 111/47/0/30 | edited |
| `boot-read-routes` | net-new | 190 | 58.4% | 61.3% | 95.3% | 111/64/6/9 | edited |
| `library-retire-standalone-page` | edits | 115 | 58.3% | 72.8% | 80.0% | 67/25/0/23 | edited |
| `inline-comment-thread` | net-new | 45 | 55.6% | 55.6% | 100.0% | 25/20/0/0 | edited |
| `uat-detail-kind` | edits | 20 | 55.0% | 55.0% | 100.0% | 11/9/0/0 | edited |
| `write-broker` | net-new | 62 | 54.8% | 58.6% | 93.5% | 34/14/10/4 | ? |
| `library-typed-edges` | edits | 304 | 52.6% | 59.0% | 89.1% | 160/111/0/33 | edited |
| `library-top-drawer` | edits | 72 | 51.4% | 52.1% | 98.6% | 37/34/0/1 | edited |
| `chat-panel` | net-new | 314 | 49.0% | 63.1% | 77.7% | 154/90/0/70 | ? |
| `uat-bound-command-adoption` | edits | 358 | 43.6% | 67.8% | 64.2% | 156/74/0/128 | edited |
| `library-dag-canvas` | edits | 102 | 43.1% | 45.4% | 95.1% | 44/53/0/5 | edited |
| `library-overview` | net-new | 65 | 43.1% | 51.9% | 83.1% | 28/26/0/11 | edited |
| `library-open-overlay` | net-new | 12 | 41.7% | 100.0% | 41.7% | 5/0/0/7 | edited |
| `uat-machine-proof-binding` | edits | 432 | 40.5% | 57.2% | 70.8% | 175/131/0/126 | edited |
| `review-mode-toggle` | net-new | 24 | 37.5% | 37.5% | 100.0% | 9/15/0/0 | edited |
| `chat-sse-mount` | net-new | 106 | 34.9% | 38.1% | 91.5% | 37/22/38/9 | edited |
| `boundhash-on-verdict` | edits | 49 | 34.7% | 77.3% | 44.9% | 17/5/0/27 | edited |
| `suggestion-edit-store` | net-new | 103 | 31.1% | 82.1% | 37.9% | 32/7/0/64 | edited |
| `block-position-comment-anchor` | edits | 136 | 28.7% | 65.0% | 44.1% | 39/21/0/76 | edited |
| `library-process-flow` | edits | 282 | 20.6% | 38.2% | 53.9% | 58/94/0/130 | edited |
| `leaf-tool-surface` | edits | 216 | 19.4% | 27.8% | 69.9% | 42/109/0/65 | same |
| `drift-reads-store` | edits | 146 | 19.2% | 49.1% | 39.0% | 28/29/0/89 | edited |
| `verified-attribution` | edits | 169 | 18.3% | 54.4% | 33.7% | 31/26/0/112 | edited |
| `map-payload-cache` | edits | 260 | 18.1% | 26.7% | 67.7% | 47/129/0/84 | edited |
| `owned-turn-loop` | edits | 41 | 17.1% | 35.0% | 48.8% | 7/12/1/21 | same |
| `leaf-slices-observer-activation` | edits | 1059 | 13.6% | 24.3% | 55.9% | 144/370/78/467 | edited |
| `library-open-trigger` | edits | 65 | 12.3% | 16.7% | 73.8% | 8/40/0/17 | edited |
| `change-event-store` | edits | 124 | 11.3% | 87.5% | 12.9% | 14/2/0/108 | edited |
| `map-server-memo` | edits | 1608 | 10.1% | 39.3% | 25.8% | 163/246/6/1193 | edited |
| `model-runtime-seam` | edits | 31 | 9.7% | 30.0% | 32.3% | 3/7/0/21 | same |
| `library-lifecycle-wire` | edits | 304 | 9.5% | 18.1% | 52.6% | 29/131/0/144 | edited |
| `library-drawer-shell` | net-new | 72 | 8.3% | 100.0% | 8.3% | 6/0/0/66 | edited |
| `library-permanent-lens` | edits | 72 | 8.3% | 12.8% | 65.3% | 6/41/0/25 | edited |
| `compositor-pan-transform` | edits | 3860 | 7.8% | 20.8% | 37.4% | 300/1129/13/2418 | edited |
| `library-finder` | net-new | 102 | 2.0% | 3.8% | 52.0% | 2/51/0/49 | edited |
| `arc-explicit-id-fidelity` | edits | 2553 | 0.0% | 0.0% | 0.2% | 0/4/0/2549 | edited |
| `library-category-shelf` | edits | 102 | 0.0% | 0.0% | 3.9% | 0/4/0/98 | edited |
| `terminal-capture-activation` | net-new | 59 | 0.0% | 0.0% | 1.7% | 0/1/0/58 | edited |
| `tree-view` | net-new | 0 | n/a (no mutants) | n/a (no mutants) | n/a (no mutants) | 0/0/0/0 | edited |
| `uat-criterion-detail` | edits | 0 | n/a (no mutants) | n/a (no mutants) | n/a (no mutants) | 0/0/0/0 | edited |
| `verdict-glyphs` | net-new | 0 | n/a (no mutants) | n/a (no mutants) | n/a (no mutants) | 0/0/0/0 | edited |

**Could not be run:**

- `act2-regrow-camera-zoom-out` — stryker produced no report (exit 1): 18:56:02 (11692) INFO DryRunExecutor No tests were found
- `change-store-pg` — packages/orchestrator declares a test script Stryker cannot drive: node --import ../../scripts/tsx-cache-off.mjs --import tsx --test "src/**/*.test.ts"
- `claim-store-work-time` — stryker produced no report (exit 1): 18:56:13 (32544) INFO DryRunExecutor No tests were found
- `gate-emits-change` — packages/orchestrator declares a test script Stryker cannot drive: node --import ../../scripts/tsx-cache-off.mjs --import tsx --test "src/**/*.test.ts"
- `live-author-accounting-override` — packages/orchestrator declares a test script Stryker cannot drive: node --import ../../scripts/tsx-cache-off.mjs --import tsx --test "src/**/*.test.ts"
- `semantic-growth-replay-view` — stryker produced no report (exit 1): 18:56:16 (29440) ERROR Stryker Unexpected error occurred while running Stryker Error: Unable to parse C:\code\storytree\.claude\worktrees\friendly-brattain-1a6904\packages\app-surface\src\semantic-growth.css. No parser registered for .css!
- `semantic-growth-studio-demo` — stryker produced no report (exit 1): 18:56:30 (6000) ERROR DryRunExecutor One or more tests failed in the initial test run:
- `source-drift` — packages/orchestrator declares a test script Stryker cannot drive: node --import ../../scripts/tsx-cache-off.mjs --import tsx --test "src/**/*.test.ts"
- `verdict-line` — packages/orchestrator declares a test script Stryker cannot drive: node --import ../../scripts/tsx-cache-off.mjs --import tsx --test "src/**/*.test.ts"

### Reading the nine that could not be run

They are two clean classes, and neither is a statement about a test:

- **Five pairs in `packages/orchestrator`** (`change-store-pg`, `gate-emits-change`,
  `live-author-accounting-override`, `source-drift`, `verdict-line`). That package's `test` script
  is `node --import tsx --test`, which is neither `bun test` nor `vitest run`, so Stryker has no
  runner for it. This is the SAME limit `check:mutation-diff` carries — the runner choice here is
  its own `runnerFor`, deliberately, so the two cannot drift apart. Closing it means a Stryker
  runner for `node:test`, which is its own piece of work and is not chartered here.
- **Four pairs where Stryker could not complete**, each for its own reason, all now named in the
  artifact rather than reported as a bare failure:
  - `act2-regrow-camera-zoom-out` — `No tests were found`. Its declared test file is
    `worldCamera.act2Bottom.node.ts`, and `apps/studio`'s vitest `include` is
    `src/**/*.test.{ts,tsx}`. The spine ran it directly (`node --import tsx --test`), so the file is
    a real proof; it is simply not part of the studio's standing suite.
  - `claim-store-work-time` — `No tests were found`, for a different reason: its declared test is
    `claim-store-release-by-branch.live.test.ts`, which registers nothing without a live database.
  - `semantic-growth-replay-view` — `No parser registered for .css!`. Its declared `real.sourceFile`
    is `packages/app-surface/src/semantic-growth.css`. Stryker mutates code, not stylesheets.
  - `semantic-growth-studio-demo` — `One or more tests failed in the initial test run`. Its declared
    test (`TreeViewShell.test.tsx`) does not pass inside the sandbox against unmutated source, so no
    mutant can be scored against it.

⚠ **None of these nine is evidence of a weak test, and none should be folded into a percentage.**
They are the instrument reporting its own range, which is the same discipline
`check:mutation-diff` applies when it refuses to score a mutant it could not witness.

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
