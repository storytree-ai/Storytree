---
status: accepted
decided: 2026-07-21
amends: [217]
arc: grounded-art-machinery-arc
---
# ADR-0224: Station 4 realized: render-look-refine as a bounded quorum revert-only look guard

## Status

accepted (2026-07-21) — decided/directed by the owner in conversation on 2026-07-21, after the
Station-4 look-judge benchmark (PR #849 / #851) cleared the go/no-go bar. Design-time alignment IS the
ratification (ADR-0110); no second end-of-flow ask.

## Context

[ADR-0217](0217-art-factories-are-per-object-type-parametric-kit-explicit-dr.md) decision 6 designed
Station 4 — "render, look, refine, bounded at three passes, with an independent before/after judge
empowered to revert" — but deliberately did not commit to building it. It named the risk: BlindTest puts
SOTA VLMs at ~58% on absolute geometry, so a naive vision gate is unreliable, and increment 4 prescribed
a benchmark *before* any build ("near 50% means keep the human in the loop and say so").

That benchmark ran (docs/research/grounded-art-station4-look-judge-benchmark/): 10 labelled before/after
pairs drawn from the owner's own called-out defects, reproduced by mutation-testing the bake pipeline,
judged by 30 independent blind pairwise VLM judgments. Result: **90% overall agreement, 100% (9/9) on the
depth-order class the factory exists to protect, 96% (23/24) on every visible defect, with zero false
reverts on visible pairs** — far above both the ~50% chance floor and the ~58% absolute-geometry ceiling.
The design's escape from that ceiling held: pairwise same-object before/after is a categorically more
reliable regime than absolute scoring. The single false revert across all 30 judgments landed on a
sub-threshold (near-invisible) pair; a 2-of-3 quorum erases it while still catching every visible pair.

The owner directed the build on the strength of that evidence.

## Decision

**Build Station 4 as the factory's look guard: a bounded render→look→refine loop whose judge is
pairwise, revert-only, run as a quorum, and injected as a seam.** This amends ADR-0217 decision 6 from a
design into a realized component and pins the shape the benchmark derived.

1. **The judge is a seam, not a hard-wired model — exactly like station 1's artist and station 5's owner.**
   `LookJudge` is `(before, after) → { worse: 'before' | 'after' | 'neither', reason? }`. The factory's
   zero-dependency core carries the seam, the loop, and a scripted judge for tests; the real VLM judge is
   *injected by the author-time caller* (the orchestrator that spawns judges), so no model dependency
   enters the pure package. The benchmark already proved a real judge works end-to-end in this exact
   injected shape.
2. **Revert-only is the safety property, kept literal.** The loop reverts an edit only when the judge
   names the *edited* render worse. "neither"/abstain and "the before was worse" both KEEP the edit. A
   wrong revert costs an improvement (recoverable); a wrong approval would ship a defect — so the cheap
   error is the only one the loop can make.
3. **Quorum, not a lone judge.** The real judge is a `quorumJudge` of N independent judges; the edit is
   reverted only if at least `threshold` of them independently call it worse (the shipped default is 2 of
   3). This is the guardrail the benchmark's one false revert demanded — under it, that false revert
   disappears while every visible regression is still caught.
4. **Bounded, and a guard not a gate.** The loop runs at most `maxPasses` (default 3, per D6). Station 2's
   programmatic checker remains the gate (ADR-0217 D6); Station 4 only *guards* against a refine pass
   making an asset worse. It does **not** replace the owner's stage-2 look attestation
   ([ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) /
   [ADR-0159](0159-frontend-builder-proves-stage-1-through-the-inner-loop-visua.md)) — it catches
   *regressions* inside the loop; the human still signs off *taste*.

Rejected: a single-judge auto-revert (the benchmark caught it false-reverting on a sub-threshold pair);
treating abstain as revert (would throw away good work on invisible differences); a machine-signed look
*approval* (never — the judge can only condemn, and the owner still attests).

## Consequences

- **Good:** the factory's blind spot — increments 4/5 flagged the look machinery as "0% built and
  untested" — is now closed with a proven component. Look regressions inside a refine pass are caught by
  machinery, not only by whoever happens to be looking.
- **Good:** the deterministic core (seam + quorum + bounded loop + revert/abstain semantics) is
  offline-testable with a scripted judge, so it rides the art-factory `observe` gate (ADR-0222) like the
  rest of the factory. The non-deterministic VLM call stays behind the seam, exactly where stations 1 and
  5 already put their model/human boundaries.
- **Cost / watch:** the real judge is model calls at author time (not free, not deterministic). The
  quorum multiplies that cost by N. This is acceptable because Station 4 is author-time (D4: the runtime
  performs no geometry), run when authoring an asset, not per frame.
- **Cost:** the central bet is still measured on our own n (30 judgments, our assets, a frontier model on
  the pairwise task — the config that would ship). The benchmark's Limitations stand; Station 4 does not
  claim to have resolved them, only to have cleared the go/no-go bar with the guardrails in place.

## References

- [ADR-0217](0217-art-factories-are-per-object-type-parametric-kit-explicit-dr.md) — **amends** D6: the
  Station-4 design this realizes; its "advisor, never a gate" and "bounded at three passes" stand.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) /
  [ADR-0159](0159-frontend-builder-proves-stage-1-through-the-inner-loop-visua.md) — the operator-attested
  look (stage 2), which Station 4 does not replace.
- [ADR-0222](0222-split-the-art-factory-into-its-own-story-forest-world-gains.md) — the art-factory story
  whose `observe` gate the new machinery rides.
- `docs/research/grounded-art-station4-look-judge-benchmark/` — the benchmark that cleared the bar (the
  90% / 100% / 96% result, the quorum analysis, the Limitations).
- `packages/procedural-architecture/src/refine.ts` — the realized machinery (seam, `quorumJudge`,
  bounded `refine` loop) + `refine.test.ts`.
