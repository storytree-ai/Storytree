---
status: accepted
decided: 2026-08-03
amends: [289]
arc: chapter2-code-generated-organic-art-arc
---
# ADR-0293: The Chapter 2 growth track grows the wood first and flushes the leaves after

## Status

accepted (2026-08-03) — decided/directed by the owner in conversation on 2026-08-03, on looking at
the v5 track (PR #1103). Design-time alignment IS the ratification (ADR-0110); no second
end-of-flow ask.

**Amends [ADR-0289](0289-the-chapter-2-growth-track-animates-a-tree-forming-not-a-sap.md).**
D1 said the track animates a tree FORMING rather than a sapling maturing, and used that to retire
the seedling apparatus. This continues in the same direction and narrows it once more: it fixes the
ORDER in which the tree forms. D1's licence, D2's two named defects, D3's skeleton settlement and
D4's decline of a tool purchase are untouched, as is all of ADR-0280 — in particular D1's prefix
invariant, declared camera and authored pacing, and D4's ceiling clause, under which this increment
is a ceiling demonstration and an honest "not good enough" is an accepted outcome. None of those is
touched by this decision.

## Context

Five increments of this track (v1 through v5) grew wood and leaves TOGETHER from frame zero. That
was never argued for; it fell out of v1 and survived because every subsequent increment was aimed at
something else — colour fragmentation, then the crown's shape, then the root flare. Each increment
made the simultaneous version better, and v5's own README recorded the track as closing on exp-16 on
every axis it had measured.

The owner looked at the delivered v5 track and said:

> "looks much nicer, but the leaves forming while the truck grows looks really ugly, can we just grow
> the truck and branches and the put the leaves on?"

The important part is what the sentence is NOT about. It is not about the canopy's colour, its
shape, where it sits, or how much of it there is — all of which the last three increments worked on
and all of which the owner has now seen and called nicer. It is about SEQUENCE. A tree whose leaves
appear at the same rate as its wood never shows its own structure: the trunk and the branching are
inside a green mass from the first frame, so the thing the track is supposed to be animating —
a tree forming — is the one thing a viewer cannot watch.

This also explains a gap the last three increments kept measuring and never closing. exp-16's crown
is 51% green; ours reached 70%, and the recorded reading was "you see fewer limbs running through
our canopy". Under simultaneous growth there is no frame in which the limbs are visible at all, so
there was never a moment where the structure could register. Sequencing the phases addresses the
same complaint from the other end, without touching the canopy rules.

*(Corrected in place 2026-08-03 per ADR-0139; the DECISION is untouched and the paragraph's argument
survives, but the number it argues from was the wrong instrument. The v7 increment measured that
crown GREEN FRACTION mixes two independent causes — `measure()` scored green on `G > R and G > B`,
which exp-16's own warm highlight band (173,167,114) and darkest foliage band (92,90,46) both fail,
so 27% of its "non-green" crown is foliage. By nearest family the gap was BARK: 670 px of exp-16's
mature crown against 206 — and the v8 increment then CLOSED it, to 631 px (15.3% of crown against
exp-16's 15.7%), by opening the lower canopy geometrically rather than by any shading change
(corrected again 2026-08-03, same rule, the decision still untouched). This paragraph's claim that
sequencing addresses the complaint "from the other end" is also now measured rather than argued, and
the answer is that it did NOT move the mature frame — at the final frame the two tracks are the same
tree, which the v6 increment then recorded. What sequencing bought is watchability of the wood phase,
which is what D1 actually claims.)*

## Decision

**The track has TWO phases. The wood extends and branches alone; the leaves flush onto a tree that
is already a tree.**

1. **The canopy's onset moves, and nothing else does.** The canopy weight scalar that already gated
   the clouds (`con`) is re-keyed from "on at the first frame" to "zero until the wood phase is
   over, then a smooth ramp to full". The skeleton, its birth iterations, the camera, the pacing
   rule, the canopy's own rules (outer orders, the crown floor, the seats, the cloud sizing) and the
   root system are all untouched. This is a staging change and is deliberately confined to one
   scalar.

2. **The flush is keyed on the reveal iteration, not on tree height.** The skeleton is fully alive
   at `NMAX_BIRTH` and `AGE_TAIL` carries further iterations of pure secondary growth, so a
   height-keyed flush would necessarily finish before the last part of the track exists. `LEAF_ON`
   and `LEAF_FULL` are reveal iterations.

3. **Where the phase boundary sits is an art-direction choice with a rendered answer**, so it is a
   FLAG (`--leaf-on` / `--leaf-full`) and the owner picks from pictures — the same treatment
   `--framing` gets. The committed default is whichever the owner picks; until then it is the
   middle of the three rendered options.

4. **The authored pacing is left to re-allocate the frame budget itself.** ADR-0280 D1 places frames
   at equal silhouette-change arc length, so moving the flush later automatically moves frames to
   where the change now is. The phase split is therefore expressed once, as an onset, and the number
   of frames each phase gets is measured rather than authored a second time.

5. **`measure.py --monotone` remains binding and is not weakened for this.** Foliage area sits at
   zero through the wood phase and then increases; a non-decreasing sequence that starts at zero is
   still non-decreasing. If a staging choice ever fails that check it is the staging that gives way,
   not the check.

## Consequences

**Good.**

- The thing the track exists to show — a tree forming — becomes watchable. The trunk, the buttress
  and the branching all have frames in which they are the subject.
- It costs one scalar. Every mechanism the previous four increments built and measured survives
  unchanged, including the crown floor, the seat sampling and the root system.
- The frame budget rebalances itself through the existing pacing rule rather than through a second
  authored number.
- It is a plausible answer to the crown-structure gap that three increments measured and none
  closed, reached from the other side: the limbs get frames of their own instead of competing with
  foliage for the same ones.
  **Corrected in place 2026-08-03 (ADR-0139); the decision is unchanged.** This was a prediction, and
  measurement answered it no: sequencing did not move the mature frame at all (the Context correction
  above records it), and the gap was closed on 2026-08-03 by canopy GEOMETRY instead — the v8
  increment's height-scaled lobe radius took in-crown bark 206 → 631 px against exp-16's 670. The
  wood phase's watchability is what this decision actually bought, and it is what D1 claims.

**Bad, or at least owed.**

- **The young-canopy apparatus was suspected dead and is NOT — measured, not assumed.**
  `N_CLOUD_YOUNG` / `YOUNG_PREFIX` (seats for the juvenile prefix), `CLOUD_FLOOR_YOUNG`,
  `CLOUD_ORDERS_YOUNG` and the `mat` easing all exist to make ONE canopy mechanism serve a sapling
  and a mature crown, and if leaves only ever appear on a nearly-grown tree none of them has
  anything left to serve. Rather than delete on suspicion, the `--no-render` plan now PRINTS the
  answer (`mat`, `con`, and how many live lobes sit on juvenile seats). At the delivered staging the
  first leafy frame carries **`mat` = 0.69**, and `mat` climbs 0.69 → 1.00 across the flush — so the
  shell easing is shaping most of the leafing-out, not a vestige. The seats are the weak case: a
  juvenile seat owns exactly ONE live lobe, on four frames (f09-f12). Nothing is deleted here, and
  the case for deleting the SEATS specifically is now a measurement someone can re-run rather than
  an argument. ADR-0289 D1's precedent still governs if it ever goes to zero.
- **The flush shows bare twig tips, and there is no length lever.** In a two-phase track the twigs
  reach full length in the wood phase and the clouds then grow outward from inside them, so through
  the flush every outer twig stands proud of the foliage arriving on it. The only lever is RADIUS —
  a sub-pixel twig is an absent twig at 128 px — and `WOOD_HIDE` was deepened 0.32 → 0.78 for it,
  which cleans the late frames. It does NOT clean the middle of the flush, because the same `con`
  that keeps the clouds small there also keeps the taper shallow. The residue reads as a tree in
  bud-break; whether that is a defect or a feature is a LOOK call and is left to the owner rather
  than tuned blind.
- **The opening frames get thinner, not just barer.** Under the delivered fixed camera the first
  frames were already small, and a bare twig has far less silhouette than a green tuft. This
  sharpens the open scale-convention fork (ADR-0289's corrected bullet) rather than settling it, and
  may make it the more urgent of the two open owner calls.
- **The mid-stage character work in PR #1103 is partly re-scoped by this.** The third attractor ring
  that gave the whip somewhere to put leaves is MORE load-bearing now, not less — it is what makes
  the wood phase a branching structure rather than a pole. But the measurement that justified it,
  the f09 foliage floor, no longer applies at f09, because there is no foliage there. The gap it
  closed was real; the number that recorded it is now a number about a different track.
- Nothing here is owner-attested beyond the staging direction itself. The LOOK verdict on the
  delivered track remains the owner's (ADR-0070) and ADR-0280 D4's honest "not good enough" is still
  an accepted outcome for the arc.

## References

- [ADR-0289](0289-the-chapter-2-growth-track-animates-a-tree-forming-not-a-sap.md) — amended here;
  the staging relaxation this continues.
- [ADR-0280](0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md) — D1's prefix
  invariant, declared camera and authored pacing, all untouched; D4's ceiling clause.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — why this is born accepted.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the LOOK verdict
  is the owner's.
- `docs/research/chapter2-code-only-art-2026-08-01/blender-hero-v1/blender_tree.py` — `LEAF_ON` /
  `LEAF_FULL` and the `con` flush; `docs/research/.../README.md` for the rendered comparison.
