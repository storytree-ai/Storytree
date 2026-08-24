# The first decision-source drain — 28 anchors, 16 findings, a 6% real-falsification rate

`grounded-decisions-arc` increment 04, run 2026-08-24 against the live store at
`3c770753` (`origin/main`).

This is the evidence ADR-0424's Consequences turn on: the arc's end-state condition 4 asked
that the sweep be run at least once over the whole current set and its findings drained. It
has been. **Read the false-positive decomposition before touching the ceiling** — the headline
rate is high, and the reason it is high is not the reason a reader expects.

---

## What was run

| | |
|---|---|
| Scope | `adr list --current` — **379** accepted, non-superseded decisions (369 at chartering; re-counted, not reused) |
| Seeded | **28** bound anchors across **15** decisions, all at `symbol` grain |
| Findings, first sweep | **16** — 15 spans MOVED, 1 UNLOCATABLE |
| Real falsifications located | **1** |
| False positives | **15** |
| **False-positive rate** | **15/16 = 93.75%** |
| Ceiling after the drain | **0**, unchanged — the drain returned the instrument to a clean sweep |

The sweep is `decision-source-drift`, the sixth `check:verification-decay` instrument
(`packages/cli/src/decision-source-decay.ts`), landed by increment 02.

> ⚠ **The first two rows are the aperture of THIS EXERCISE, and 15-of-379 is NOT a coverage
> metric.** ADR-0424 D4 forbids one, and forbids it permanently: most accepted decisions have no
> code span to point at — decisions about escalation, register, ownership, who decides — so the
> grounded share is low and correctly so. **A low grounded share is not a finding and is not
> something to fix.** If it ever became a target, authors would attach spans to satisfy the number
> and we would have built a green check that verified nothing, on purpose. The instrument itself
> emits no denominator (`measureDecisionSweep` deliberately carries no total), and neither this
> document nor anything derived from it may supply one. The number that matters below is the
> false-positive RATE, whose denominator is findings — never decisions.

## How the anchors were bound

Every `boundHash` is `hashSpan(locateSpanIn(...).span)` — the repo's own compute
(`packages/orchestrator/src/proof/anchor-compute.ts`, `packages/cli/src/decision-source-decay.ts`),
applied through the same locator the sweep uses. Computing a hash any other way manufactures its
own false positives on the first sweep.

**The bind MOMENT was ADR-0424 D2's, made computable:** the earliest commit on `main` at or after
the decision's `decided` date at which the anchored span exists — the first moment the claim could
have been true of that code. Binding at HEAD instead would have made the first sweep vacuous by
construction: every anchor fresh, zero findings, and no rate to report.

Each of the 28 was hand-attested against the decision's own prose. That step is not optional:
a mechanical pass that anchored every backticked identifier a decision's body names against every
file it cites produced **795 candidate anchors across 200 decisions, 361 of them already moved** —
and most were coincidental collisions (`#origin`, `#now`, `#next`, `#result`). Auto-anchoring is
how this instrument would be made worthless in one landing.

## The one real falsification

**ADR-0206** — `packages/library/src/uat-test-criteria.ts#uatTestCriterionId`.

Its "Stored ids and signed data" clause called `<story>#uat-<n>` "the attestation join key" and
named `uatTestCriterionId` as its constructor, in the present tense. The symbol is now
`@deprecated ADR-0253`, aliased to `legacyUatTestId`, and documented in its own source as a
*"Migration-only positional key constructor. Never a current proof identity."* ADR-0253 replaced
the positional key with an authored `criterionId`. The rename ADR-0206 decided is untouched and
the stored keys are still not renamed — what moved is which identity is CURRENT. **Corrected in
place** (ADR-0139), then rebound.

## The 15 false positives, decomposed

ADR-0424's Consequences pre-commit the remedy for noise — *a better gate, never a raised
ceiling* — so the decomposition is the actionable part, not the rate.

### (a) Ordinary evolution — 11 findings

The claim is still true; the symbol changed for reasons the claim does not rest on. Added struct
fields, delegation to a new helper, a `satisfies` annotation, an unrelated branch:

- ADR-0011 `run-turn.ts#runTurn` — one added `stopReason` field
- ADR-0087 `proof-config.ts#scopeGlobBoundIssue` — roots widened by ADR-0092, a widening
  ADR-0087's own prose already carries in place
- ADR-0104 `shell-test-executor.ts#runShellCommand` — ADR-0421 added a `shell: true` branch
- ADR-0121 `node-build.ts#buildNodeReal` — refactored; still takes no claim of its own
- ADR-0126 ×3 (`analyzeObservedTests`, `extractVouchingTestNames`, `matchTestCall`)
- ADR-0142 `claim-store.ts#releaseClaimsBySession` — ADR-0346 added a promotion call
- ADR-0166 `boundaries.ts#redundantDeclaredEdges` — return type moved to `satisfies`
- ADR-0176 `db-control.ts#ensureLiveDb` — a status probe and a remote refusal added
- ADR-0206 `uat-test-criteria.ts#parseUatTestCriteria` — delegation refactor

### (b) Self-implementation drift — 3 findings — **this is a defect in ADR-0424 D2**

ADR-0196 (×1) and ADR-0211 (×2) drifted because **the decision's own directed change landed after
the decision was accepted.** Verified, not inferred: the commits touching each anchored file since
its bind point name the decision's own number —
`61bd45f3 fix(orchestrator): close the in-process forged-green hole in the prove-it-gate (ADR-0211)`.

This is not an artifact of retro-binding. **It is what D2 will do going forward.** D2 says bind at
the green flip; a decision is routinely accepted before the code it directs is written, so binding
at the flip freezes a hash of the *pre-decision* code and guarantees a drift finding the moment the
decision is implemented — a finding whose correct drain is always "rebind, nothing is wrong".

The owner fork this belongs to is already open and is **not** answered here:
`oq-acceptance-has-four-doors-where-should-a-decision-s-code`. Its context has been appended with
this measurement, because it narrows the answer: whichever door is chosen, the freeze cannot
usefully happen at the flip itself.

### (c) A bad anchor — 1 finding

**ADR-0103** `commands.ts#syncCorpusCommand` — UNLOCATABLE. The decision's whole subject
(`sync-corpus`, `check:corpus-sync`) was DELETED by ADR-0302 D4, and ADR-0103 already carries a
prominent in-place Correction saying exactly that. The decision is honest; the anchor was the
error, authored from a mechanical candidate list without first reading the decision's Correction.
**Refuted** — the anchor was removed and `sources` set to `[]`, which is the honest three-state
value: somebody looked, and this decision grounds nothing.

---

## Why the rate is high, measured

The dominant cause is **claim/span granularity mismatch, not the locator.** At `symbol` grain the
sweep compares an entire declaration; a claim usually rests on a few lines inside it.

Line-survival of each drifted span — how much of the anchored symbol survived byte-identically
between bind and HEAD, i.e. how much room a narrower anchor had to land on:

```
  100%  adr-0011  run-turn.ts#runTurn                        (47/47)
   67%  adr-0087  proof-config.ts#scopeGlobBoundIssue        (12/18)
   88%  adr-0104  shell-test-executor.ts#runShellCommand     (49/56)
   68%  adr-0121  node-build.ts#buildNodeReal                (51/75)
   85%  adr-0126  contract-coverage.ts#analyzeObservedTests  (23/27)
   40%  adr-0126  contract-coverage.ts#extractVouchingTestNames (2/5)
   50%  adr-0126  contract-coverage.ts#matchTestCall          (4/8)
  100%  adr-0142  claim-store.ts#releaseClaimsBySession      (22/22)
   94%  adr-0166  boundaries.ts#redundantDeclaredEdges       (29/31)
  100%  adr-0176  db-control.ts#ensureLiveDb                 (10/10)
   40%  adr-0196  friction-lifecycle.ts#lifecycleOf           (2/5)
   13%  adr-0206  uat-test-criteria.ts#parseUatTestCriteria  (2/16)
    0%  adr-0206  uat-test-criteria.ts#uatTestCriterionId     (0/3)   ← the REAL falsification
   95%  adr-0211  prove-it-gate.ts#proveUnit               (111/117)
   91%  adr-0211  shell-test-executor.ts#ShellTestExecutor   (21/23)

  mean line-survival: 69%
```

Three anchors survived **100%** — every bound line still present verbatim, the drift purely
additive elsewhere in the symbol. And the single real falsification sits at **0%**, the lowest of
all fifteen: the span whose decision was actually false is the one that was wholly replaced.
That is suggestive, not a discriminator — `parseUatTestCriteria` at 13% was an ordinary refactor.

**Existence proof that a narrower grain removes the noise.** ADR-0104's claim is the per-node
proof-timeout override. Re-anchored at `quote` grain with both context fields, bracketing the one
claim-bearing line:

```
prefix: "// SIGKILL, not the default SIGTERM: a wedged process ignoring a catchable signal must still die.\n"
exact:  "      timeout: cmd.timeoutMs ?? DEFAULT_PROOF_TIMEOUT_MS,"
suffix: "\n      killSignal:"
```

That line is byte-identical between the bind commit and HEAD. **Re-anchored this way the finding
disappears** — the anchor reads fresh, correctly, because nothing the claim rests on moved.

## What this says about the described-change gate

All 16 findings classified `drifted-undescribed`, and that is honest rather than a defect:
nothing writes a `ChangeEvent` against a decision anchor today, so no described change explains
any drift. The gate is therefore **currently inert** — it cannot separate `stale` from
`drifted-undescribed`, so it removed none of these 15 false positives and the measured rate says
nothing about how good it is. Do not read 93.75% as a verdict on the described-change gate; read
it as a verdict on the grain. The gate becomes measurable only once the rebind verb
(`grounded-decisions-arc-inc-03`) records a described change when a curator rebinds.

## Recommendations, in the order they pay

1. **Author at `quote` grain with BOTH context fields when the claim rests on specific lines**;
   reserve bare `symbol` grain for claims about a whole declaration's existence or signature.
   Measured to remove the noise on the one case tested end-to-end, and 3 of 15 spans survived
   100% intact, so it had somewhere to land.
2. **Do not freeze at the green flip.** Self-implementation drift is structural, not incidental.
   Evidence appended to `oq-acceptance-has-four-doors-where-should-a-decision-s-code`.
3. **Never auto-anchor.** 795 mechanical candidates, 361 already drifted, mostly garbage.
4. **A bind verb should refuse to freeze a span that does not locate at HEAD.** That single
   refusal would have caught the ADR-0103 bad anchor at authoring time. A note for inc-03.
5. **The ceiling stays 0.** It did not need raising and must not be raised: the population drained
   to zero. ADR-0269 4(f) would want the decomposition at the number; there is no new number.

## Blind spot found, and it is the arc's own motivating case

ADR-0011's Consequences claimed `packages/agent` holds "the supported live harness adapters:
Claude per ADR-0030, with Cursor admitted by ADR-0177", and its Correction paragraph said the
pivot trigger "has now fired: Cursor is admitted as the first second live harness". **Both were
false.** ADR-0198 DELETED the Cursor leaf to the last import on 2026-07-16
(`cffd7f45 Retire the Cursor leaf so live builds cannot bill via CURSOR_API_KEY`), and ADR-0232
admits Codex in its place. Four passages corrected in place.

**The sweep did not find this.** ADR-0011's three anchors were `PhaseAuthor` (fresh), `runTurn`
(drifted, unrelated) and `runStep` (fresh) — none of them the evidence for the Cursor claim. This
is ADR-0424's own stated blind spot arriving on the canonical instance: *"a claim anchored to the
WRONG span fails to drift when it should, which no sweep can see."*

But the mechanism is vindicated by the counterfactual, and it is exact. Had ADR-0011 been anchored
to `packages/agent/src/cursor-author.ts` at the moment ADR-0177 made the claim, the file's deletion
would surface today as UNLOCATABLE — *"this claim's evidence is code the sweep can no longer
find"*. **The instrument works. What it depends on is an anchor taken when the claim is made** —
which is the whole of ADR-0424 D2, and the reason the open door question matters more than the
false-positive rate does.

---

## Reproducing

The bind, drain and measurement ran as one-shot scripts inside `packages/cli` (deleted after —
the binding VERB is `grounded-decisions-arc-inc-03`, which waits on the owner). Anchors are live
store rows, so nothing here is reproducible from the checkout alone:

```bash
pnpm db:up
pnpm check:verification-decay
storytree library artifact adr-0206 --raw sources --pg
```
