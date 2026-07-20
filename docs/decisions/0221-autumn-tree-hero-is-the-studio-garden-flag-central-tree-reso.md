---
status: accepted
decided: 2026-07-20
amends: [218]
arc: grounded-art-machinery-arc
---
# ADR-0221: Autumn-tree hero is the studio garden-flag central tree, resolving ADR-0218's deferred tree call

## Status

accepted (2026-07-20) — decided/directed by the owner in conversation on 2026-07-20. The owner, having
look-attested the four inc-10 heroes (the `autumn-tree` hero among them, arc #843), directed that when
the studio garden-island flag is on, the island's central tree be the **`autumn-tree` hero** — not the
R3F `story-tree`, and not the pond the owner had been weighing. Design-time alignment IS the
ratification (ADR-0110); the LOOK verdict on the composed island is separate and remains the owner's
(ADR-0070 stage 2), taken at inc 11's Unit 6.

## Context

[ADR-0218](0218-baked-art-carries-resolved-paint-into-the-shared-scene-via-a.md) opened the fenced
baked-art seam (`SceneBakedDef`/`SceneBakedUse`) so paint-carrying isometric solids could enter the
shared scene-graph, and drove the standing-stones through it as the first consumer. It **explicitly
DEFERRED the central tree** (Consequences → "the central tree"): the tree is the other big standing
object the owner named, but (a) the owner was actively weighing REPLACING it with a pond, so a tree
factory might be deleted, and (b) unlike the stones, R3F RENDERS the tree (`story-tree`), so baking it
forces either an R3F placeholder or the factory exposing its 3D part-tree for R3F to re-derive — a real
cross-surface cost. "Both are the owner's calls; this ADR's fenced mechanism is what a future tree
increment would build on, but the tree decision is not taken."

Grounded-art increment 11 composes the four attested heroes into one whole `studio` garden-island to
match `docs/research/grounded-art-concept/cosy-island-concept.png`, whose centrepiece is a big autumn
tree. That forces the deferred call: what stands at the island's centre on the garden path?

Two facts collapse ADR-0218's tree cost for THIS scope:
1. **The garden is studio-only and flag-gated.** The island composition rides an OPTIONAL `garden` field
   with the same byte-identical absence lock as `parcels`/`uatCriteria`; the public website's fold never
   sends it. So the composed island — hero tree included — exists only in the studio 2.5D SVG renderer.
2. **R3F never sees it.** The R3F mapper (`world-to-3d.ts`) is a whitelist that skips non-core kinds, and
   the garden rides the baked-art family R3F already skips (ADR-0218 finding 2). The website's R3F
   `story-tree` is untouched. So the "baking the tree costs R3F a re-derivation" problem does not arise:
   nothing asks R3F to render the hero tree.

## Decision

**On the studio garden-flag path only, the `autumn-tree` hero (a baked-vector `baked-use`, ADR-0218)
replaces the procedural central tree. Everywhere else is untouched.**

- The DEFAULT island (flag off) renders BYTE-FOR-BYTE as today — the same procedural `buildTree`, the
  same `story-tree` on R3F. The owner's open pond question for the default island is **not settled** by
  this ADR; it remains a live, separate call.
- The garden-flag path suppresses the procedural central tree and places the `autumn-tree` hero at the
  tree spot through the re-lit ADR-0218 seam (one `baked-def`, one `baked-use`), under the shared sun
  (`KIT_LIGHT_ANGLE` 135°, which the style bible confirms is the concept's light direction).
- This is an APPLICATION of ADR-0218's mechanism, not a new mechanism: no new node family, no
  `SceneNodeBase` change, no R3F work beyond keeping the skip-coverage test exhaustive.

Rejected: baking the tree into the DEFAULT island (would force the R3F re-derivation ADR-0218 priced and
pre-empt the owner's pond call); a pond on the garden path (the owner directed the hero tree here);
adding the hero tree to R3F (nothing on the flag path is a website concern).

## Consequences

- **Good:** the concept island's centrepiece is reproducible with the attested hero and the existing
  fenced seam — zero new mechanism, zero R3F regression, zero website change (the absence lock holds).
- **Good:** the deferred call ADR-0218 recorded is now resolved *for the scope that needs it* (the
  garden flag) without over-committing — the default island and the pond question stay open, exactly the
  owner's stated posture.
- **Bounded / honest:** this does NOT settle the default island's central tree. If the owner later
  chooses the pond (or the hero tree) for the DEFAULT island, that is a further decision; the garden
  flag path already demonstrates the hero tree in place, which informs but does not pre-empt it.
- **Cost:** none beyond inc 11's already-scoped work — the hero tree is one more `baked-use` on a path
  that is already emitting baked heroes.

## References

- [ADR-0218](0218-baked-art-carries-resolved-paint-into-the-shared-scene-via-a.md) — **amended**: its
  deferred central-tree call is resolved for the studio garden-flag path (flag-only, studio-only); its
  fenced `baked-def`/`baked-use` mechanism and R3F-skip contract are the vehicle, unchanged.
- [ADR-0217](0217-art-factories-are-per-object-type-parametric-kit-explicit-dr.md) — the arc's design; the
  `autumn-tree` hero is a per-type factory module baked at build time (D4).
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the composed
  island's LOOK is operator-attested, stage 2 (inc 11 Unit 6); this ADR is the design decision, not the
  look verdict.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time owner
  direction is ratification; born accepted.
- `packages/procedural-architecture/baked/kit.json` (`heroes[]`, id `autumn-tree`) — the consumed hero;
  `packages/forest-world/src/scene.ts` — the garden field + the re-lit seam.
