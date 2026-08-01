---
status: accepted
decided: 2026-08-01
amends: [274]
arc: chapter2-pixellab-organic-growth-arc
---
# ADR-0277: Occlusion-registered cutouts are retained for small plants, not the hero tree

## Status

accepted (2026-08-01) — decided/directed by the owner in conversation on 2026-08-01.
Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends
[ADR-0274](0274-pixellab-animates-organic-growth-over-the-app-owned-svg-isla.md).**
ADR-0274 still allows bounded PixelLab-authored organic tracks over the app-owned SVG island, and
other coherent whole-tree pose treatments remain comparison candidates. This decision narrows one
specific assembly: the Experiment 8 cutout trunk plus occlusion-registered raster canopy is not a
hero-tree solution. Its registered cutout/pose technique is retained only for the small ground plants
that repeatedly passed the owner's visual comparison.

## Context

Round 1 and Round 2 separated the strengths of the layered cutout treatment from its weaknesses. The
strongest reusable signal was consistent: ferns, flowers and other small plants grew convincingly
from fixed ground sockets. Their compact scale and independent silhouettes suit short registered
pose sequences.

The assembled hero tree did not earn the same result. The original cutout canopy placed leaves
incorrectly and left a visible trunk gap. Experiment 8 replaced the free-floating leaf clusters with
authored canopy poses on a fixed registration plate, aligned them to an explicit crown socket and
added an opaque overlap collar to hide the join. After the owner reported a disconnected canopy and a
green blob behind the trunk, the author/import pass removed the low repeated source mass and placed a
narrower leaf skirt and wood bridge at the true runtime contact. The revised hosted witness still
looked disconnected to the owner.

That result answers the bounded experiment. Occlusion registration can make the pixels overlap
deterministically, but deterministic overlap does not make a separately authored trunk and crown read
as one organism. Further collar iteration would polish the wrong composition. The positive plant
evidence does not need to be discarded with the failed tree assembly.

## Decision

### D1 — This is a technique-specific narrowing, not a general PixelLab-tree rejection

The rejected technique is the Experiment 8 family: a cutout trunk and branches joined to a separately
authored raster canopy by crown-socket registration, painter-order seam hiding and an opaque overlap
collar. That assembly is not used for the Chapter 2 hero tree.

ADR-0274 otherwise remains current. A coherent whole-tree PixelLab pose sequence, an app-native tree
treatment or another bounded candidate may still be compared. This ADR neither selects the final
hero tree nor rejects the existing pose-to-pose whole-tree evidence.

### D2 — Registered cutout/pose tracks are retained for small ground plants

The technique may supply ferns, flowers, grasses and other small ground details attached to declared
app-owned sockets. Each accepted plant track has a fixed transparent canvas, fixed pose order and
dimensions, one stable ground socket, author/import-time crop normalization, a declared painter slot,
prompt/model/job provenance and an asset/decode budget.

This selects the technique for the Chapter 2 small-plant art direction. It does not by itself switch
the clean route, complete the story, accept the held island control or waive proof and owner LOOK for
the composed scene.

### D3 — Positive trunk evidence does not rescue the rejected assembly

The cutout trunk motion remains useful comparison evidence, but it is not permission to attach
another separate raster crown and repeat the same join. Reusing that motion would require a later
whole-tree treatment to demonstrate visual continuity without recreating the rejected collar seam.

### D4 — The shared app continues to own behaviour

For retained plant tracks the app owns semantic state, normalized progress, deterministic pose
selection, timing, easing, holds, Next, Back, Replay, reduced-motion settlement, ground sockets,
painter order and the final retained scene. PixelLab remains author-time only: no vendor request,
credential, model call, per-play generation, asset timer or runtime position correction enters the
browser, build artifact or deployed environment.

### D5 — Experiment 8 is preserved as rejected hero-tree evidence

The hosted `organic-canopy-occlusion` witness is not adopted as a complete composition or hero-tree
technique. Its fixed crown socket, registered canopy poses, seam hiding and opaque overlap collar did
not remove the owner-visible disconnection after one focused correction. Characteristic failures are
floating canopy, visible seam, trunk gap, halo, canopy skate, pasted-on crown and opaque blob.

The small plants in the same witness remain positive evidence and support D2. The island formation
treatment was a held Round 1 control and receives no new adoption claim from this verdict.

### D6 — The arc stays active

`chapter2-pixellab-organic-growth-arc` must still resolve the hero tree and whole composition. Its end
state combines the app-native island, a separately selected coherent hero tree and the retained small
plant tracks in the real shared app. Plant-technique selection is one decided component, not arc
closure or clean-route adoption.

### D7 — Explicitly rejected

- The Experiment 8 cutout-trunk plus occlusion-registered-canopy assembly as the hero tree.
- Free-floating canopy clusters, a raster crown attached by runtime offsets, or further overlap-collar
  iteration presented as the answer to the disconnected-tree verdict.
- Treating mechanical overlap as visual success when the result still reads as a seam, gap, blob or
  pasted-on crown.
- Reading this decision as rejection of every PixelLab-authored whole-tree pose candidate.
- Reading plant selection as approval of the held island control, the complete Experiment 8 mock or
  any sibling hero-tree treatment.

## Consequences

**Good.**

- The technique is retained where the owner consistently sees value instead of being rejected
  wholesale.
- Small plant tracks stay compact, independently replaceable and controllable through stable ground
  sockets.
- Work stops on a mechanically registered collar that still looks visually disconnected.
- ADR-0274's SVG-island, camera and one-app-runtime direction remains available to other coherent
  whole-tree candidates.

**Costs and risks.**

- The hero tree remains unresolved; the provisional pose-to-pose lead is comparison evidence, not a
  final selection.
- The strongest cutout trunk motion may not be reusable without recreating the rejected join.
- Raster plants still require provenance, decode limits, socket registration and desktop/mobile
  composition proof.
- The final scene may reveal a style seam between app-native land, the future hero tree and retained
  plant sprites; the owner keeps the LOOK verdict.

## References

- [ADR-0274](0274-pixellab-animates-organic-growth-over-the-app-owned-svg-isla.md) — broader
  PixelLab-organic-track direction, amended but still current.
- [ADR-0273](0273-pixellab-island-growth-is-a-selective-standard-shared-app-sp.md) — rejected
  full-island PixelLab substrate.
- [ADR-0219](0219-generative-image-models-enter-the-art-pipeline-author-time-o.md) — author-time
  generation boundary.
- [ADR-0230](0230-swappable-sprite-art-sheet-render-mode-take-adr-0219-s-parke.md) — replaceable local
  sprite posture.
- [ADR-0237](0237-chapter-2-is-a-scripted-mode-of-the-real-app-share-product-u.md) — real shared-app
  product surface and app-owned semantics.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — owner-held visual
  verdict.
- Arc `chapter2-pixellab-organic-growth-arc` — active initiative carrying the selection evidence.
- PR #1054 / `?organicGrowth=organic-canopy-occlusion#/tree` — held Experiment 8 evidence.
