# Defect-history re-injection — 2026-08-29

**Increment:** `defect-history-reinjection` · **Decision:** ADR-0474 (D4, D5, D6, D7)

The cheapest experiment on the arc and the one with no synthetic-equivalence problem: every mine is a
defect this factory genuinely shipped, harvested from the agent-memory record written when it was
found. Re-inject at HEAD, run the suite that should catch it, count.

---

## 1. The harvest, and what the memory tier is actually made of

All **269** memory files were classified — a sweep, not a sample.

| bucket | count | share |
|---|---|---|
| **A — re-injectable code defect** (names a file/symbol and a reconstructible edit) | **23** | **8.6%** |
| B — real code defect, not re-injectable (moved, or needs a GPU / live race / vendor state) | 1 | 0.4% |
| C — **process trap** (shell quoting, PATH, worktree mechanics, CLI invocation, ceremony, cost) | **167** | **62.1%** |
| D — arc/status record carrying no defect | 78 | 29.0% |

**The yield is 8.6%, and that is the increment's first finding.** ADR-0474 D6 called the ~200 memory
files "the FIRST mine source" on the strength of their being real defects. Most of them are not
defects at all: **five out of eight memories record a process trap** — something that fought a
session, not something wrong with the code. The memory tier is overwhelmingly a record of *how this
factory is hard to operate*, not of *what this factory got wrong*. That is worth knowing before
anyone budgets against it again as a defect corpus.

All 23 bucket-A target paths **still exist today**, so the corpus has not rotted out from under the
record.

**Three of the 23 were never fixed at all** — the harvest flags them present at HEAD:
`classifyWideningTarget` consulting the alias environment but never the interface environment;
`isMutableSource` implementing two of the three exclusions its own docstring claims; and
`library artifact <id> --set` silently behaving as a read when the `edit` verb is omitted. These are
documented, live, and uninstrumented. The third one **bit this session** — see §4.

---

## 2. The measurement

Seven mines, chosen to span packages and to include both defects with a named expected catcher and
defects the memory recorded as caught by nothing in particular.

Protocol: assert the owning suite is GREEN first; apply the edit; **verify it landed by re-reading
the file from disk**; run the owning package suite; revert; verify the revert. The verdict is the
suite's exit code — no model judged anything (ADR-0474 D4).

| mine | the historical defect (and its memory) | owning suite | verdict |
|---|---|---|---|
| R1 | a cheap pre-filter narrower than the matcher it guards — `cheap-prefilter-narrower-than-its-matcher` | `context-traversal-transcript` | **CAUGHT** |
| R2 | "already rendered" inferred from a string `body`, blind to a kind whose content field is also `body` — `gate-and-wire-can-disagree-honestly` | `library` | **CAUGHT** |
| R3 | a probe that returns null on any git error, collapsing "not a repo" into "wrong branch" — `runtime-worktree-registration-lost-not-drifted` | `desktop` | **CAUGHT** |
| R4 | a drift check with no completion signal, so a delivered increment reads as one never started — `drifted-increment-may-be-already-delivered` | `arc` | **CAUGHT** |
| R5 | a merge-base anchor that goes blind under CI's shallow checkout — `ci-shallow-checkout-breaks-merge-base-anchors` | `cli` | **CAUGHT** |
| R6 | an animation cursor accumulating frame deltas instead of anchoring to wall-clock — `regrow-cursor-is-wall-clock-anchored` | `studio` | **CAUGHT** |
| R7 | a last-event-wins rollup letting a `building` event un-prove a signed pass — `crown-green-rule-adr0416-adr0443-built` | `orchestrator` | **CAUGHT** |

**Catch rate: 7 of 7. The not-caught list is empty.**

All seven baselines were green, all seven mines verified as applied, all seven reverted clean, and
the closing control showed an unchanged tree.

---

## 3. What the 7/7 actually measures — and it is not what it looks like

A 100% catch rate reads as "the factory catches its own historical defects." **It does not support
that claim**, and the reason is mechanical rather than a caveat about sample size.

Each mine was re-injected **at the exact site whose fix installed a regression test for it**. Checked
with `git log -S` against three of the seven, the catching test and the fix landed in **the same
commit**:

| mine | the commit that carries both the fix and the test that caught the re-injection |
|---|---|
| R7 | `0397e191 feat(proof): build ADR-0416 + ADR-0443 — durable green, undertaken-only caps, the vacuity floor` |
| R4 | `47eb2334 feat(arc): the arc domain owns its own package and story` |
| R3 | `ad563af9 fix(desktop): name a lost worktree registration instead of a branch-pin failure` |

The failing test names give it away without the archaeology: R7's are titled *"(ADR-0416 D3/D4 —
proof is durable)"*, and R3's asserts against `/registration/i` — the fix's own wording.

So the honest statement of the result is:

> **Regression-test retention at the original defect site is ~100%.** When this factory fixes a
> defect it writes a test, that test stays, and it still fires years later.

That is a genuinely good property and nobody had measured it. But it is **not** evidence that the
factory would catch a novel defect, and it is not what ADR-0474's motivating exhibit was about.

**The exhibit and the measurement are consistent, and together they locate the real gap.**
`story-baseline.ts` reproduced `criterion-binding.ts`'s exact anchor defect in code written *after*
that defect was found and fixed. A regression test guards **the site it was written for**, not the
next place someone makes the same mistake. So:

- the same defect **at the original site** → caught, 7/7;
- the same defect **class in a new site** → not caught, and the exhibit is the proof.

Re-injection at original sites can only ever measure the first of those, which is why it returns 100%.

---

## 4. The instrument's own near-miss, recorded because it is the fault class under study

Increment 1's live-store mine was first applied with
`storytree library artifact adr-0447 --set dependsOn=@file --pg`. That **exits 0, prints a full
artifact render, and writes nothing** — the `edit` verb was missing. The rung then reported
`PASS — no dependsOn cycle`, which without a read-back would have been recorded as an UNQUALIFIED
rung: a false finding manufactured by an instrument that never planted its defect.

This is bucket-A entry 19, `library-set-without-edit-verb-is-a-silent-read` — one of the three
defects the harvest found **still live at HEAD**. It has a documented incident (a scripted batch
silently no-opped six field writes while logging six successes), it has no instrument, and it cost
this measurement a wrong answer within an hour of the harvest naming it.

Both harnesses in this arc therefore verify every mine by re-reading from disk or from the store
before scoring. It caught two further non-landing mines in increment 1 (§5.2 there).

---

## 5. The capture–recapture estimate (ADR-0474 D7) — published as degenerate

D7 asks for `remaining unknown ≈ M·N/n`. With **n = 7 caught of N = 7 seeded**, `N/n = 1`, so the
estimator returns `M` — exactly the number of independently-found defects. **That is a tautology, not
an estimate**, and it carries no information about what remains.

The assumption it rests on — that seeded and natural defects are equally detectable — is not merely
uncertain here, it is **violated in a known direction and by construction**. Every seeded defect was
placed at the one location in the repo guaranteed to have a test watching it, because the harvest
selects on *"was found and fixed"* and this factory's fixes ship tests. Seeded defects were therefore
maximally detectable; natural ones, by definition, are the ones nothing was watching.

Per this increment's own instruction — *"If the assumption looks badly violated here, say so and
publish the catch rate alone"* — **the catch rate stands and the extrapolation is withdrawn.**

ADR-0474 anticipated a bias and named `ingest-merge.ts` (worst mutation score, no defect) as the
counterexample. The bias that actually materialised is a different and larger one: **selection on
"was fixed" is selection on "has a test."**

---

## 6. Recommendation to `adopt-what-the-experiments-earned`

**Adoption candidate 2 — a standing re-injection suite over the harvested mine set — is REFUSED.**

The increment's own decision rule settles it: *"If it was high, the finding is that the memory tier
is already doing this job and NOTHING should be built."* It was 7/7.

The stronger reason is §3. A standing re-injection suite would re-apply defects at sites where a
regression test already exists and already passes — **it would be a second instrument measuring what
the first one already measures, at the same place, and it would report 100% forever.** A permanent
green that cannot go red is the vacuous-green class this whole arc exists to detect, rebuilt
deliberately.

**The residue worth keeping costs nothing to keep:**

1. **A measured property of the factory:** when it fixes a defect it writes a test, and that test is
   still there and still fires. Regression-test retention ~100% over seven defects spanning seven
   packages. Nothing measured this before.
2. **A measured property of the memory tier:** 8.6% of it is code-defect history; 62% is process
   traps. Anyone budgeting against "~200 recorded defects" should budget against ~23.
3. **Three named, live, uninstrumented defects** the harvest surfaced as never fixed — one of which
   corrupted this arc's own measurement before it was caught. These are ordinary bug reports, not
   qualification machinery, and they belong on whatever arc owns each surface.
4. **The real gap is now located, and it is not re-injection.** The defect class that survives is the
   same mistake made in a NEW site. Re-injection at original sites is structurally blind to it;
   mutation testing on new code is not, and that is `test-strength-beyond-red-green-arc`'s subject,
   behind its own open owner question. Nothing here should reach for it (ADR-0474 D8).
