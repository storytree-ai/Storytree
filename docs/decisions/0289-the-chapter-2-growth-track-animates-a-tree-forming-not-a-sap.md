---
status: accepted
decided: 2026-08-02
amends: [280]
arc: chapter2-code-generated-organic-art-arc
---
# ADR-0289: The Chapter 2 growth track animates a tree FORMING, not a sapling maturing; the owned skeleton stands on measurement

## Status

accepted (2026-08-02) — decided/directed by the owner in conversation on 2026-08-02. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends [ADR-0280](0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md).**
D1's prefix invariant, declared camera and authored pacing all stand — this narrows only what the
track is required to DEPICT, and adds a measured basis for the skeleton clause D1 already asserts.
D2, D2a, D3 and D4 are untouched. ADR-0280 is not superseded and its arc is not closed.

## Context

Two things arrived on 2026-08-02, one from a measurement and one from the owner.

**The ecosystem was never checked.** ADR-0280 D1 asserts that code owns the skeleton, but that clause
was decided without anyone testing what Blender's own ecosystem already offers. The owner raised it
directly — had we hand-rolled space colonisation and reinvented a wheel? The challenge was fair: we
had admitted Blender as a *renderer* (D2a) and never looked at it as a source of *content*.

The test is `docs/research/chapter2-blender-ecosystem-spike-2026-08-02/`. Three tree generators sit
in the official `extensions.blender.org` repo — `sapling_tree_gen` (Weber & Penn 1995, bundled until
Blender 4.1, an extension since 4.2), `space_colonization_tree_generator` (the very algorithm we
hand-rolled), and `easy_tree`. Sapling was integrated as a first-class skeleton source and compared
against ours with every other stage held identical.

**The result did not favour the borrowed skeleton, for a structural reason.** Sapling generates one
*finished* tree; re-running it with smaller parameters to obtain younger stages reshuffles it, which
is the morph failure D1's prefix invariant exists to prevent. So growth must be synthesised over a
mature form — and *a prefix of a mature skeleton is not a juvenile*. It is the mature tree with
pieces missing, and the early frames are decided by whatever that form happens to carry low down,
which is not something the generator was asked to control. Sapling's default tree has its lowest
lateral at 37% of apex height and reads as a bare pole for frames 2–9; the `small_maple` preset
(10%) repairs the height ramp but yields a trunkless sprawling shrub. Our space-colonisation skeleton
was *grown* over 27 iterations with a birth index per node, so every prefix is a tree that genuinely
existed at that age.

**The owner then re-scoped the requirement**, looking at those same frames:

> "these updated trees look worse - look like mutated plants with bubbles; the main cause is we seem
> to be added the greenary at the trunk for some reason, and we losing the overall upside down pair
> shape of the tree. honestly we dont really need it to start off as a sapling, we just want to
> animate the tree forming, its top down view anyway so minor details dont really matter that much."

That last sentence is the load-bearing one, and it removes a requirement nobody had written down.
The track had been held to a botanical standard — a cotyledon seedling opening, blade-to-cloud leaf
handoff, age-dependent secondary growth — inherited from exp-16's hand-drawn reference rather than
from any stated product need. At the size the island actually renders, that standard is not being
paid for.

## Decision

**D1 — The growth track depicts a tree FORMING, not a sapling maturing.** The requirement is that
the tree *assembles* legibly and continuously into its mature silhouette. It is NOT required that
frame 0 be a botanically plausible seedling, nor that intermediate frames be plausible trees of a
given age. Fidelity effort is spent on the mature read and on the continuity of the assembly;
per-stage botanical realism is explicitly not a goal at this render size.

ADR-0280 D1's prefix invariant is UNCHANGED and is not weakened by this: continuity is what makes
the assembly read as forming rather than morphing, and it remains forbidden to freeze the tree to
buy per-frame connectedness. What is relaxed is the *staging* — which prefixes we open on and how
young the first one has to look.

**D2 — Two named silhouette defects are the next iteration's target.** Both from the owner's read of
the spike frames, and both are ours, not the skeleton's:

- **Foliage is attaching at the trunk.** Canopy mass appears against the bole instead of only on the
  outer shell. The cloud canopy rides the outer orders of live shoot, which on a dense borrowed
  skeleton puts seats on low interior branches.
- **The inverted-pear silhouette is being lost.** The tree should read narrow at the base and broad
  and rounded above. `small_maple` sprawls wide and low and reads as a shrub.

**D3 — The owned skeleton stands, now on a measurement rather than on an untested assumption.**
ADR-0280 D1's skeleton clause is confirmed, not amended. `--skeleton sapling --sap-preset <species>`
is retained in the generator as a re-runnable comparison so the question stays answered rather than
open; `--skeleton space-colonisation` remains the default and is byte-unchanged.

**D4 — No tool purchase yet.** The Grove (€99 / €199 / €799 perpetual) was priced and declined for
now: the measurement says the skeleton is not the bottleneck, and the two D2 defects live in our own
canopy code, which no external generator would touch. Should we later buy, the owner's preferred
candidate is **AnyTree** (`https://superhivemarket.com/products/anytree`), not The Grove. Any
purchase remains an owner action.

## Consequences

**Good.**

- The next iteration is aimed at two concrete, owner-named silhouette defects instead of at
  botanical fidelity that nobody is buying.
- Work the relaxed standard makes optional — the cotyledon opening, the blade-to-cloud handoff, the
  age-dependent leaf flush — was a meaningful share of the generator's complexity.
  **Corrected in place 2026-08-03 (ADR-0139); the decision is unchanged.** This bullet said that
  machinery "can be simplified rather than defended", which now misdescribes the generator: D1's
  licence was taken on 2026-08-03 and the leaf blades, the blade-to-cloud handoff, the age-dependent
  flush, the cotyledon organ and the third material were DELETED outright rather than simplified.
  One canopy mechanism now serves the whole track.
- The ecosystem question is closed with evidence and is cheap to re-open: the comparison is one flag.
- The scale-convention fork (ADR-0280's open art-direction question — one camera at the mature extent
  versus per-stage framing) was expected to DEFLATE, on the grounds that its whole force was a ~18 px
  opening frame and that the fork "may dissolve rather than need deciding".
  **Corrected in place 2026-08-03 (ADR-0139); the decision is unchanged — this was a prediction, and
  rendering the fork for the first time answered it the other way.** Both halves were wrong. The
  premise that exp-16 opens small and grows into the frame was never measured and is false: across
  its 19 frames exp-16 sits at 91–99% of mature height from frame 03 and is NON-monotone (it shrinks
  between f03 and f12), so its convention is closer to a constant apparent height with growth reading
  as width and density. The divergence from a fixed camera is therefore the whole MIDDLE of the
  track, not the opening — the fork is BROADER than this bullet assumed, and it does not dissolve.
  It remains undecided, but on a different axis than taste.
  **Corrected again in place 2026-08-03 (ADR-0139); the decision is still unchanged — the blocker
  this bullet recorded has been DISCHARGED.** As first written, the bullet said that magnifying the
  early frames exposed a mid-stage character weakness (a smooth mass with a bare leader, against
  exp-16's leafy whip), that the fixed camera was HIDING that weakness rather than causing it, and
  that the fork was therefore **blocked on mid-stage character**. The v5 increment closed the
  weakness at its cause: the gap was in the SKELETON and not the canopy — nothing could branch below
  z=0.80 while the bole ran to 0.90, so every branch in the track was born within a tenth of the
  leader's own tip — and a third attractor ring below the bole break drops the f09 foliage floor from
  45% to 32%. Under `eased`, v5's f04 and f09 read as leafy whips carrying tufts up the stem and
  standing on a visible root fan. **The fork is NOT blocked: it is a live owner choice, and the
  increment that discharged the blocker makes no recommendation either way.** `fixed` is still what
  ships, as the default of an undecided fork rather than as a retained mitigation. What survives
  unchanged from the correction above is the premise fix — exp-16 holds 91–99% of its mature height
  from f03 and is non-monotone — so the divergence is still the whole MIDDLE of the track. One defect
  the fork would still surface is recorded rather than tuned: at f00 the canopy sits below a bare
  leader tip, invisible under the delivered 16 px `fixed` frame and a stick with a bobble at 77 px
  under `eased`. Evidence:
  `docs/research/chapter2-code-only-art-2026-08-01/blender-hero-v1/README.md` §5 and
  `framing-fork.png`, re-rendered on the v5 frames.

**Bad, or at least owed.**

- **This licenses a less botanically honest tree**, and that is a real loss against exp-16, whose
  charm is partly that its mid stages read as a real young tree. The bet is that the render size
  makes it invisible. If the owner's LOOK later says the growth reads as mechanical assembly, this
  decision is the first place to re-examine.
- **The relaxation is stated for the current render size and top-down framing.** It does not
  generalise to a larger hero render or a closer camera, and should be re-tested if either changes.
- The spike's crown-quality comparison is not fully conclusive: skeleton-adjacent constants (22 cloud
  seats, blade gates, `LEAF_LEN`) were held fixed and were tuned around our own node density, so part
  of `small_maple`'s blobby crown is that rather than the skeleton. The structural findings survive
  re-tuning; the aesthetic comparison does not entirely.
- Geometry nodes + `Trim Curve` — the bundled, free, native prefix-growth route — remains untested.
  It is the one ecosystem thread that could still plausibly beat us, and this ADR does not close it.
- Sapling's nine species presets are an unpursued opportunity for FOREST SPECIES VARIETY, which does
  not depend on solving growth. Not claimed here; recorded so it is not lost.

## References

- [ADR-0280](0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md) — the amended decision.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment is ratification.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the LOOK verdict remains the owner's; nothing here is attested.
- `docs/research/chapter2-blender-ecosystem-spike-2026-08-02/` — the spike, its evidence sheets and the five integration defects.
- `docs/research/chapter2-code-only-art-2026-08-01/blender-hero-v1/blender_tree.py` — `--skeleton`, `--sap-preset`, `--framing`.
