---
status: accepted
decided: 2026-07-26
amends: [209]
load_bearing: true
arc: model-uat-promotion
---
# ADR-0247: Retire the model UAT witness tier — the witness split is human or machine

## Status

accepted (2026-07-26) — decided/directed by the owner in conversation on 2026-07-26. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**PARTLY NARROWED — read this before decision 1 (corrected in place 2026-08-03, ADR-0139).** Amended by
[ADR-0295](0295-the-uat-driver-s-own-verdict-is-the-witness-model-driven-uat.md): a UAT criterion may
now be witnessed by **the model that DROVE it** — a headless/browser run of the journey — and that is
the default. So decision 1's clause *"no independent read-only model judge in the UAT path"* is no
longer true as written. What remains true, and is the part to carry forward: the witness split is still
**binary (`human` | `machine`)**, there is still no `model` witness *kind*, no capability tier, no
eligibility registry and no escalation ladder — a model driver produces a `machine` outcome. ADR-0295
revives none of ADR-0209's rubric-judge machinery, so **decisions 2–6 below (including the retirement
worklist in decision 5) STAND and are still live work.** The measured reason for the narrowing: this
ADR's null result was gathered on a population of criteria already shrunk toward what a package suite
can assert (ADR-0294).

Amends [ADR-0209](0209-tier-model-judged-uat-below-irreducible-human-witness.md): its decisions 1–4 (the
`model` witness kind, the capability tiers, the independent judge, the escalation ladder) are
REVERSED. Its decisions 5–7 (per-criterion detail artifacts, verdict anchoring to a detail revision,
the concise Studio row) STAND UNCHANGED and are load-bearing today. Its decision 8 (explicit
migration) is COMPLETE — this ADR records its result and collects the retirement it made possible.
A partial reversal is an `amends` edge, never `supersedes` (ADR-0139); ADR-0209 keeps its `accepted`
status for the parts that still hold.

## Context

ADR-0209 added a third UAT witness kind, `model` — rubric-bound semantic judgment by an eligible
read-only model judge — sitting between deterministic `machine` proof and irreducible `human`
judgment. Its premise was that the corpus carried far too many human-witness legs (a probe found
~97), that many needed semantic evaluation but not a person, and that a third rung would drain the
owner's attestation queue without laundering model judgment as deterministic proof.

Decision 8 required that premise be tested before bulk adoption: a three-story pilot, then an
explicit corpus-wide migration, with no untagged criterion inheriting a model default. That
migration is now finished. **Twenty-six stories were adjudicated leg by leg, and they produced zero
model legs.**

The result is not an artifact of incurious authors. Every story was briefed with the governing rule
(`human-witness-is-a-judgment-gap-not-cost`) and explicitly instructed to hunt for model-judgeable
work. Two cases are decisive because they were the most likely places for the tier to earn its keep
and still produced none: `uat-attestation`, the story that BUILDS the attestation machinery, and
`feedback-graduation`, whose entire subject matter is judgment. The migration's own increment log
records the finding restated at every step, twenty-six times.

What the sweep found instead is that legs sort cleanly into two piles. A success condition either has
a compiler — a row exists, a status is 403, a projection is pure, a parity suite is green — or it is a
look/feel, lived-experience, real-spend, outward-facing, or provenance call that only the operator can
make. The cases that *looked* like a third thing consistently collapsed into one of the two on
inspection: `studio-cloud`'s "the owner sees the friend's build bloom" turned out to be `verdictBloom`,
a pure function of outcome and age; its provenance clause turned out to be a field comparison the
broker already enforces. Neither needed a rubric or a judge.

The runtime picture also moved underneath the original decision. ADR-0209 named Fable as the only
admitted frontier judge and treated its availability as a hard dependency. The owner's judgment in
conversation on 2026-07-26 is that the split was never really three-way — work is either done by the
operator or done by AI — and that AI browser control has improved enough that the machine side keeps
absorbing what once looked like it needed a human. That cuts against a middle rung on both sides: the
machine rung grows, and the human rung stays what it always was.

Meanwhile the tier's cost is real and ongoing. It is also structurally unreachable as built:
`packages/proof-protocol/src/enums.ts` declares `UatWitness = z.enum(["human","machine"])`,
`packages/library/src/uat-test-criteria.ts` hard-throws on `"model"`, and
`witness-resolution.ts` resolves to a binary. So the corpus has been carrying the vocabulary,
the packages, and the stories of a tier that no leg uses and no code path can express.

## Decision

1. **Retire the `model` UAT witness kind. The witness split is binary: `human` or `machine`.**
   ADR-0209 D1–D4 are reversed. There is no third rung, no capability tier (`advanced`/`frontier`),
   no independent read-only model judge in the UAT path, and no model-tier escalation ladder. A
   criterion is `machine` when its success condition has a compiler — including when the harness does
   not exist yet, per `human-witness-is-a-judgment-gap-not-cost` — and `human` when the judgment is
   irreducible. This does not restrict models from doing work elsewhere in the system; it removes
   `model` as a WITNESS KIND that signs a UAT verdict.

2. **This is a retirement, not a deletion — the tier can be brought back.** The owner's direction was
   explicitly reversible ("can always bring it back"). The decision record, the reasoning, and the
   26-story evidence base stay in the log, and the implementing code stays in git history. Reviving
   the tier means a new ADR that supersedes this one, not an archaeology exercise. Accordingly, no
   code is deleted as part of ratifying this ADR; retirement lands as scoped follow-on increments
   (below), each provable on its own.

3. **Keep ADR-0209 D5–D7 exactly as they are.** Per-criterion detail artifacts, verdict anchoring to
   an artifact revision, and the concise Studio row were justified independently of the model tier and
   are load-bearing now: 73 seed detail artifacts exist, the `uat-criterion` kind is seed-canonical and
   reconciled, and the migration used the insufficiency clause as its most valuable output. Nothing
   here weakens the ADR-0055 seed-canonical exception those decisions extended.

4. **Retire the `either` compatibility parse state.** ADR-0209 D8 made this conditional on exactly one
   event: "only that completed migration retires the compatibility parse state." The migration is
   complete and the corpus now holds **zero** `either` legs (measured against `main` by parsing every
   `stories/*/story.md`: 42 human / 214 machine / 0 model / 0 either, across 256 legs). The condition
   is met. `either` may therefore be removed from `UAT_TEST_CRITERION_WITNESSES` and from
   `resolveWitness`'s undecided branch, so an untagged leg is REFUSED at parse rather than silently
   resolving to `human`. This is a fail-closed tightening and lands as its own increment with its own
   red→green.

5. **The following become dead and are retired in scoped follow-ons, not here.** Each keeps its
   history and each retirement is its own provable unit:
   - `packages/model-uat`, `packages/model-judged-uat`, `packages/model-uat-pilot` — the tier's
     schema, judge, and pilot machinery;
   - the `model-uat-witness`, `model-judged-uat` and `model-uat-pilot` stories;
   - `stories/*/story.md` prose that describes a three-kind witness or a model tier.
   `uat-criterion-detail` and `uat-detail-studio` are NOT in this list — they implement D5–D7 and stay.

6. **Record what the sweep proved, so the premise is not silently re-litigated.** The 26-story result
   is the evidence for this decision and belongs with it, not only in the arc log: a corpus-wide,
   leg-by-leg, adversarially-briefed adjudication found no criterion that a rubric-bound model judge
   would serve better than either existing rung.

## Consequences

**Good.**

- The witness vocabulary matches how the work actually sorts, as measured rather than as predicted.
  Two rungs, each with a clear test: does the success condition have a compiler?
- A large, unreachable concept leaves the corpus — schema, packages, stories, and prose that no leg
  used and no code path could express. Onboarding no longer has to learn a tier that never fires.
- The Fable-availability hard dependency in the UAT path disappears.
- Retiring `either` closes the exact hole this migration fell into: an untagged leg currently resolves
  to `human` by fail-closed default and is invisible to a tag-keyed search, which is how five legs in
  `binding-staleness` went unadjudicated through a sweep that believed itself complete.
- The decision is cheaply reversible, so it can be revisited if model judgment later earns a case.

**Cost / watch.**

- Retirement work is real: three packages, three stories, and scattered prose. Each is a follow-on
  increment, so the corpus carries dead-but-live material until they land — the same
  overtaken-while-green trap ADR-0139 exists to prevent. The `librarian-curator` should treat this as
  a live worklist, not a completed cleanup.
- ADR-0209 stays `accepted` while decisions 1–4 of its body are dead. That is the canonical trap
  (ADR-0011 §5). The `amends` edge here is the machine-readable record; the body must also be
  corrected in place so a reader of ADR-0209 alone is not misled.
- The evidence is a null result over the corpus AS IT STANDS. It shows no CURRENT leg needs a model
  judge; it does not prove no future one could. Reversal is by a superseding ADR, not by quiet
  re-introduction.
- Removing `either` will refuse any untagged leg at parse. That is intended, but it means a
  half-authored story fails loudly where it used to degrade quietly — the sequencing matters, since
  the refusal must not land while any untagged leg still exists.

## References

- [ADR-0209](0209-tier-model-judged-uat-below-irreducible-human-witness.md) — the decision this
  amends: D1–D4 reversed, D5–D7 stand, D8 complete.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — owner-directed design-time alignment IS
  ratification; this ADR is born `accepted`.
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — a partial
  reversal is an `amends` edge, never `supersedes`.
- [ADR-0106](0106-the-adopt-pass-resolves-each-uat-leg-s-witness-machine-only.md) — the per-test witness resolution and
  the fail-closed `either` → `human` default this ADR retires.
- [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) §2 — never mint a
  gate to host a leg; why unbound machine legs are the honest end state.
- `asset:human-witness-is-a-judgment-gap-not-cost` — the rule the migration applied leg by leg.
- `packages/proof-protocol/src/enums.ts`, `packages/library/src/uat-test-criteria.ts`,
  `packages/library/src/witness-resolution.ts` — where the binary is already enforced.
- The `model-uat-promotion` arc increment log (increments 7–31) — the per-story evidence base.
