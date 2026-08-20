---
status: accepted
decided: 2026-08-21
amends: [38, 40, 97, 296]
arc: forest-status-provenance-arc
---
# ADR-0395: Brown records provenance; missing proof stays on the greenfield rung

## Status

accepted (2026-08-21) — decided/directed by the owner in conversation on 2026-08-21. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** [ADR-0038](0038-story-world-vocabulary-recalibration.md),
[ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md),
[ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md), and
[ADR-0296](0296-the-world-renders-no-unhealthy-state-withdrawn-from-the-pict.md). Their standing
decisions remain current: growth carries lifecycle, only signed proof paints green, genuine
brownfield adoption runs brown → proposed → green, and `unhealthy` remains outside the rendered
vocabulary. This ADR narrows the brown rung to provenance and replaces their generic
missing-proof → brown fallback.

## Context

The forest had made `mapped` do two jobs. It was the provenance state for an existing brownfield
system brought under Storytree, and it was also the display fallback for any built unit whose signed
proof was absent. That second job was introduced as a conservative anti-hand-painting rule: a missing
verdict must never leave a unit green. It then spread through the legend as the shorter claim “brown
means unproven.”

Capability-layer coverage exposed the mismatch. Storytree is a greenfield project, but capabilities
authored after their implementations landed were labelled `mapped` merely because registration came
later than code. The map consequently showed brown plants for greenfield work. Story crowns made the
problem sharper: `art-factory` rendered brown with no brown capability at all because one proposed
capability withheld the crown's pass and exposed the story's old `mapped` baseline.

Those are different facts:

- provenance asks whether this behaviour was inherited and deliberately adopted as an existing
  system;
- proof asks whether its current obligations have a signed pass; and
- registration order says only when the work hierarchy learned the unit's name.

Registration order cannot rewrite provenance. The owner directed the correction on 2026-08-21:
Storytree's greenfield work without current signed proof belongs on the already-existing `proposed`
rung, not on the brownfield rung.

## Decision

1. **Brown records provenance, exclusively.** `mapped` means a genuinely existing brownfield unit is
   being brought into the initiative and has not yet entered or completed its adoption process. “The
   implementation landed before its story/capability file was authored” is not sufficient: code built
   as part of this greenfield project remains greenfield. Retrospective registration changes no
   provenance.

2. **Greenfield without a signed pass is proposed amber.** A greenfield story or capability renders
   `proposed` when it has no current signed pass, whether it is not started, in progress, already
   implemented, newly registered, offline from the proof store, or withheld by an unmet proof
   obligation. `building` continues to fold to `proposed`. A signed pass remains the only source of
   green; this changes no proof bar and opens no hand-painted-green path.

3. **Proof removal reveals provenance; it does not invent it.** A missing or failing verdict removes
   green and falls through to the unit's honest authored rung. Thus a genuine `mapped` brownfield unit
   remains brown, while a greenfield `proposed` unit remains amber. The defensive legacy case of an
   authored `healthy` with no signed pass falls to `proposed`, never `mapped`; `healthy` remains
   non-authorable in ordinary work. With `unhealthy` still withdrawn from the picture, an authored
   `unhealthy` also folds to `proposed`; a signed failure remains explicit on the node panel and never
   selects brown by itself.

4. **Brownfield adoption keeps its three-rung process.** ADR-0097's brown → proposed → green ladder
   stands for genuinely brownfield material. Entering adoption flips the story to `proposed`; covered
   capabilities green from signed adopted gates; remaining work stays amber until signed. The ladder
   is not a generic route for greenfield code that happened to be registered late.

5. **Correct the current world in two independent implementation lanes after this decision lands.**
   The presentation lane changes `worldStatus` / `provenStatus`, the legend, and their tests so the
   fallback follows this decision. The work-hierarchy lane audits every currently brown Storytree
   story and capability, reclassifies greenfield retrospective units to `proposed`, and leaves
   `mapped` only where the provenance claim is true. It does not manufacture verdicts or run an Adopt
   ceremony to disguise a classification error.

## Consequences

**Good.**

- Brown once again answers one useful question: “is this inherited brownfield work?”
- Amber consistently answers “greenfield work is not currently proven,” including code registered
  after implementation.
- Green remains exactly as strict as before: only a signed pass paints it.
- Offline under-claiming remains conservative without falsifying provenance.
- The current `art-factory` contradiction — a brown island over zero brown capabilities — has an
  honest correction path.

**Costs / accepted.**

- `proposed` now spans both not-yet-built and already-built-but-unsigned greenfield work. The node
  panel's build/proof detail carries that distinction; colour does not.
- Existing retrospective specs that used `mapped` as shorthand for “tests existed before this spec”
  require a bounded corpus audit. This is a classification correction, not proof work.
- A genuine brownfield unit and a genuine brownfield unit whose latest proof failed can both be brown;
  the panel verdict remains the failure signal while `unhealthy` stays visually withdrawn.

## References

- `asset:lifecycle-status` — the authoritative status glossary already defines `mapped` as inherited
  brownfield awaiting adoption; this decision makes the forest fallback obey that meaning.
- [ADR-0038](0038-story-world-vocabulary-recalibration.md) — growth/lifecycle vocabulary; corrected
  here so brown names provenance rather than generic absence of proof.
- [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) — signed-verdict green and
  offline under-claiming; the anti-hand-painting wall stands.
- [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) — the genuine
  brownfield adoption ladder, now explicitly scoped by provenance.
- [ADR-0296](0296-the-world-renders-no-unhealthy-state-withdrawn-from-the-pict.md) — failure remains
  outside the world vocabulary but no longer invents brownfield provenance.
- `apps/studio/src/lib/worldStatus.ts` — the presentation fold to change after this ADR lands.
- `apps/studio/src/components/WorldLegend.tsx` — the owner-facing vocabulary to change with it.
- `stories/**` — the disk-canonical provenance classifications to audit in the separate hierarchy lane.
