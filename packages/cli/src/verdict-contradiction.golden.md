# Has a signed GREEN ever been contradicted by later history?

**Taken 2026-09-06.** `verdict-accuracy-arc` increment 2. Instrument: `packages/cli/src/verdict-contradiction.ts` (+ `.run.ts`), run as `pnpm verdict-contradiction`.

## ⚠ Read this before quoting any number below

**This is a SMOKE TEST, not a precision figure.** It establishes whether the phenomenon exists and roughly how often. It does not measure a false-pass RATE, and no number in it should be quoted as one.

The reason is in the method and cannot be engineered away. Classifying a commit as a fix rather than a refactor or a feature is unreliable in both directions: a message saying "fix" may be a rename, and a real regression may land with no such word. The heuristic here is deliberately biased to OVER-report — commits it cannot classify at all stay in the shortlist rather than being dropped — so the widest rungs are upper bounds and the shortlist is a reading list, not a result. **The cases are the useful output; the counts are context for them.**

No LLM judge is used, deliberately. `docs/research/benchmark-landscape-2026-09-04.md` records the published finding that LLM judges cannot detect false completion (AUROC ≤0.65) where programmatic state checks can, which is the whole reason the spine is deterministic.

This document BANKS A READING and adjudicates nothing — no gate rung is added, no threshold is set, and no guidance changes on the strength of anything below (the arc's posture: "measure first, decide never"). If a case here is a genuine false pass, that is an owner fork to be opened on the evidence, not a decision taken inside the increment that found it.

## The population, and the premise that had to be re-scoped first

> **Finding 1 — the increment's own method selects an empty set, and this run re-confirmed it.** `boundHash` — ADR-0016's binding anchor, the field that would say WHICH BYTES a verdict proved — is stamped on **0 of 665** stored verdicts. The increment as authored says "for each `--real` verdict with a `boundHash`, resolve the span it bound"; there are none, on any row, and a content hash of a span as it stood at proof time cannot be back-filled afterwards. Span grain is unavailable for this entire corpus. (Increment 1 measured this first; it is re-measured here rather than inherited.)

So the reading below is taken at **declared-proof-pair grain** instead: a unit's `real.testFile` and `real.sourceFile`, the two paths the phase machine builds its write walls from, resolved the same way `leaf-test-strength.ts` resolves them. That is coarser than a span, and the ladder below exists because of it.

| | count | |
|---|---:|---|
| verdicts in `events.verdict` | 665 | every row |
| carrying a `boundHash` | 0 | Finding 1 |
| resolved to a declared proof pair | 178 | the population |
| distinct units those cover | 108 | deduped — a unit proved four times counts once |
| units whose proof commit is not in this checkout | 5 | a THIRD state: the proof ran on a branch since squashed away, so git cannot answer |
| **units history could be walked for** | **4** | the denominator for every rate below |

## The ladder

Each rung is a strict subset of the one above it. The widest admits everything, including commits that could not be classified; the narrowest is small enough to read by hand. `units` matters as much as `commits`: forty commits over three units is a different claim from forty over forty.

| rung | rows | distinct commits | units | units as share of the denominator | admits |
|---|---:|---:|---:|---:|---|
| `touched-source` | 2 | 2 | 2 | 50.0% | landed after the verdict and touched the file the verdict's unit was scoped to implement |
| `co-changed-pair` | 2 | 2 | 2 | 50.0% | ...and also touched that unit's declared test file, so the proof's own oracle had to move |
| `oracle-grew` | 2 | 2 | 2 | 50.0% | ...and ADDED lines to that test file, so a case was written that the original proof did not have |
| `fix-shaped-or-unclassified` | 1 | 1 | 1 | 25.0% | ...and reads as a repair, or could not be classified at all — THE SHORTLIST, to be hand-read |

**`rows` is not a count of distinct events, and the gap is large.** Units share files — three terminal units all declare the same studio component as their source file — so one commit is counted once per unit it reaches. Read `distinct commits` as the number of things that happened and `rows` as the number of (unit, commit) pairs. This is a property of file grain, not a defect of the walk, and it is one more reason the span-level anchor would be worth having.

Set aside before the ladder starts: **1** spine re-proof commits (`storytree real build …`). Those touch the proved pair by construction every time a unit is re-proved, and they are not contradictions — re-proving a unit means the leaf wrote a NEW test which the spine watched go red against the CURRENT source, and that red is about the new test, not about the old code being broken. Left in, they would have dominated the shortlist.

### What the test file is worth

The increment's fallback option was file grain alone — "did a later fix touch that FILE". Taken on its own that reading returns **1** commits over **1** units. The ladder's shortlist is **1**, because it also requires the unit's own declared test file to have been touched and to have grown. Both are reported: the narrowing is shown, not asserted.

### How the classifier read the widest rung

| class | commits |
|---|---:|
| `re-proof` | 0 |
| `fix-shaped` | 1 |
| `feature` | 1 |
| `refactor` | 0 |
| `test-only` | 0 |
| `housekeeping` | 0 |
| `unclassified` | 0 |

`unclassified` is not noise and is not dropped: this repo's history carries a large minority of commits with no conventional-commit prefix, and treating them as noise would silently discard the biggest unexamined bucket. They stay in the shortlist.

## The shortlist — the useful output

**1 commits over 1 units.** Ordered by lines added to the proved test file — the crudest available proxy for how much the oracle had to grow. Each row is a CANDIDATE to read, never a confirmed false pass.

| unit | +test lines | class | commit | subject |
|---|---:|---|---|---|
| `alpha` | 12 | fix-shaped | `11111111` | fix(alpha): repair the thing |

## Re-running this over other work

The arc's end state 3 requires that both instruments attach to a real engagement without new design. This one needs three things and nothing else: verdict rows in `events.verdict` carrying a `unitId` and a `commitSha`; specs under `stories/**` whose `proof:` blocks declare a `real:` arm; and a git history containing those commits. `pnpm verdict-contradiction` against a checkout and store satisfying those re-takes the whole reading. Two limits travel with it, both structural: history is followed by PATH, so a renamed file reads as an absent one; and where a proof commit is not an ancestor of `HEAD` the walk is over-wide rather than wrong, which is the direction this instrument is biased in anyway.
