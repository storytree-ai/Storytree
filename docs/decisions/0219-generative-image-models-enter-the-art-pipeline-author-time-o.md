---
status: accepted
decided: 2026-07-20
amends: [214, 217]
arc: grounded-art-machinery-arc
---
# ADR-0219: Generative image models enter the art pipeline author-time only, bridged to checkable vector

## Status

accepted (2026-07-20) — decided/directed by the owner in conversation on 2026-07-20, after looking at
increments 5–7 glued onto the island. Design-time alignment IS the ratification (ADR-0110); no second
end-of-flow ask. This ADR is the formal record of the "Direction update (2026-07-20)" already carried in
the `grounded-art-machinery-arc` end state; the arc note flagged that the ADR would be authored by the
driver session as the next increment, and this is it. The LOOK verdict on any produced render remains
separate and the owner's (ADR-0070 stage 2), still outstanding.

**Currency (2026-08-02).** [ADR-0230](0230-swappable-sprite-art-sheet-render-mode-take-adr-0219-s-parke.md)
took D3's raster fork, [ADR-0237](0237-chapter-2-is-a-scripted-mode-of-the-real-app-share-product-u.md)
made the same product renderer available to Chapter 2, and
[ADR-0274](0274-pixellab-animates-organic-growth-over-the-app-owned-svg-isla.md) permitted
selective PixelLab-generated tree and plant tracks inside the app-owned animation system while the
island and coast remain app-native SVG.
[ADR-0280](0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md) then narrowed the
model's ROLE for Chapter 2's organic art: our own code owns skeleton, camera and growth, and a
generative model supplies individual component assets and textures rather than a whole frame, a
growth track or a silhouette.
[ADR-0282](0282-the-act-2-intro-regrows-the-whole-forest-app-native-one-focu.md) then set the scale
rule that follows from that — the forest at large renders app-native at any story count, and a
per-frame raster track is affordable for at most one focused tree.
D1's author-time-only boundary, committed-assets source of truth, 2.5D posture and owner-held LOOK
verdict all stand and are strengthened by each of those amendments.

## Context

This arc's end-state eye test was **fidelity to the existing look**: ADR-0214 D4 made "improving the
art" a hard non-goal and ADR-0217 D7 kept "fidelity to the existing look is the metric." Increments 4–7
proved that framing's machinery half — the station-3 draw-order pass, real-hole apertures, baked
buildings, baked stones — but they also proved its blind spot, recorded increment after increment:
**every LOOK finding still came from a human looking at a render, with the checker green throughout.**
Fidelity gave the owner nothing positive to attest against, only "is this worse than before."

Two owner acts converted the eye test from *don't regress* into *reach THIS*:

1. **A named aesthetic target.** The owner generated `docs/research/grounded-art-concept/cosy-island-concept.png`
   with **nano-banana** (Google Gemini image generation) — a **cosy garden of a few well-placed hero
   objects** (a shingled cottage with a lavender bed and stone path, one big autumn tree, a small gazebo,
   grass tufts) on a soft green island against the pink hex ground — and named it the direction. That
   reopens the exact question ADR-0217 D8 anticipated ("concept art designs the FACTORY, not the
   instance"): *where does a generative image tool actually fit*, without becoming the free-form-vector
   consumption that produced the nineteen defective buildings (D2).

2. **A negative verdict on "more rendered."** Increment 6 (#832) drove the UAT markers as baked
   isometric standing-stones; the owner rejected them (2026-07-20) as *"messy and noisy rather than
   cosy."* More rendering is not cosier — the look direction is a genuine owner call, not a fidelity
   metric, and increment 7 (#835) replaced the stones with soft flat tall flowers, which the owner
   attested.

Four questions were live. This ADR settles all four by owner direction: (a) may a generative model
enter the pipeline at all, and where; (b) how does raster concept art become physically-sound isometric
geometry without the "vector soup" that auto-tracing yields; (c) is the cosy look reached with baked
vector or with raster sprites; and (d) — a constraint the owner wanted parked so it stops being
re-litigated — is the shipped map ever real 3D.

## Decision

**A generative image model is adopted as an AUTHOR-TIME input to the art factory only, reached through
an explicit raster→checkable-vector bridge; the produced look is baked vector; and the shipped map
stays 2.5D isometric.** In four parts.

1. **Generative entry, AUTHOR-TIME ONLY.** Google Gemini image generation ("nano-banana", SDK
   `@google/genai`) is adopted as an author-time concept/asset tool — **never** in the deterministic
   build or the runtime, **never** fetched per-instance.
   *(Amended by [ADR-0280](0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md),
   2026-08-01, on the model's ROLE only: for Chapter 2 organic art a generative model supplies
   individual COMPONENT assets and textures — a leaf blade, a bark texture, a flower — which our code
   then places, lights, composes and animates. It does not author a whole frame, a growth track, a
   pose sequence or a silhouette. The author-time-only boundary here is unchanged and strengthened.
   Noted in place per ADR-0139.)* It informs an object type's KIT once
   (ADR-0217 D8), never inlined (D2). Cost is tens of dollars for a full authoring burst
   (research-confirmed); commercial shipping is licensed (we own the output; SynthID is invisible and
   moot once the asset is re-authored to vector); output is non-deterministic (no seed), so the
   committed **re-authored** asset is the source of truth, not the raster. Prefer the paid tier / Vertex
   for design-defining work (no training on our data, IP indemnity). **The API key is owner-provided;
   Claude never enters credentials.**

2. **The bridge (raster → sound iso).** No converter turns raster into structure — auto-tracing yields
   "vector soup" that carries every physical mistake into the graph. The reliable path is:
   nano-banana for **mood / palette / parts-reference** → lock a **style bible** → block the asset in a
   **LIGHT ortho / parametric substrate** (the "3D as ground rules", **NEVER shipped**) to buy correct
   iso projection, occlusion and one consistent light → **re-author** a structured, parametric,
   **CHECKABLE vector** asset against it → the existing checker (ADR-0217 stations 1–3). This is our
   part-tree doctrine with an explicit correctness rig bolted onto the front, not a new mechanism.
   **Amended by
   [ADR-0225](0225-generative-3d-produces-the-bridge-blocking-substrate-via-a-v.md):** the LIGHT
   ortho/parametric blocking substrate is now **generator-produced** — a reputable generative-3D model
   produces the block, reached through a vendor-swappable author-time adapter (NVIDIA Edify first;
   Gemini is view-only per that ADR's verification, so it stays image-reference only) — rather than
   hand-built. The rest of this bridge stands unchanged: thrown-away maquette, re-author to checkable
   vector, checker governs.

3. **Look fork RESOLVED: baked VECTOR first,** reusing ADR-0218's fenced baked-art node family
   (`baked-def` / `baked-use` / `BakedPaintNode`) — cohesive shaded iso informed by the concept, not
   raster sprites. A literal-painterly **raster** layer is a bigger, later fork and is **not taken
   now**; if it is ever wanted it is its own ADR. **That fork is now TAKEN by
   [ADR-0230](0230-swappable-sprite-art-sheet-render-mode-take-adr-0219-s-parke.md):** the raster-sprite
   look layer entered as a prototype-scoped `artStyle` toggle and, after the owner's LOOK verdict,
   Storybook became the clean-route default with Vector preserved as an explicit option. ADR-0237
   extended that shared renderer to Chapter 2. ADR-0274 further permits selectively generated,
   registered frame tracks for tree and plant growth while retaining the app-native SVG island; the
   app still owns time, semantics, replay and reduced motion. None of these amendments reverses D1
   author-time-only or D4 2.5D-isometric.

4. **PARKED — do NOT reopen: the game is 2.5D ISOMETRIC and stays that way.** Real 3D / R3F is **Act 1
   only**. "3D" in this arc is an **authoring substrate** (decision 2's light ortho rig), never a
   shipped map renderer. Act 2 animation (the forest growing on demo data, fast-forward, each asset
   mutating state) is done by **us** in a real-time 2D system — lightweight GSAP/SVG for "just enough";
   Rive is a heavier, separately-scoped call — **never** Google video (Veo produces fixed one-off clips,
   not data-driven animation).

**Import-time rule — key the background GLOBALLY, never flood-fill from the edges (2026-08-02,
measured).** A generated component arrives on a background, and the import step that removes it is
ours. It must key the background by COLOUR across the whole cell, over a chroma value that cannot
occur in the art. It must not flood-fill inward from the edges or corners: a fill seeded at the
border cannot reach background that the art encloses, so sky between branches survives as opaque
paint and the delivered asset reads as though the model drew solid gaps it never drew. Measured on
the 2026-07-30 Nano Banana tree-growth spike, whose packaging script removes only corner-connected
near-white background: **3,691 px** of enclosed background are left opaque across its 3x3 source
sheet — **0** in the three sprout cells, where nothing is enclosed yet, and **1,496** and **1,136**
in the two mature cells, where the crown closes around the sky. **219 px** of that survives the
downsample into the delivered 96 px frames, concentrated in the same mature cells. The defect is in
our import, not in the return: a global colour key clears it on the already-delivered asset at zero
generation cost. This rule now governs every component import under
[ADR-0280](0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md) D3, which makes a
generative model the supplier of components rather than of whole frames. (The spike directory the
measurement was taken from is a working-tree artifact and is not committed to `main`; the rule, not
the directory, is the durable part.)

**And the aesthetic non-goal is amended.** The end-state eye test now has a **named target** — the cosy
concept — replacing ADR-0214 D4 / ADR-0217 D7's "improving the art is a non-goal / fidelity is the
metric." This is **design-time DIRECTION** (the owner names the target), NOT the model reinterpreting:
ADR-0214 D4's never-reinterpret rule **stands**, because the concept image goes TO an author and is
never parsed into our code (D2). The metric shifts from "matches what exists" to "moves toward the
directed target," judged by the owner.

Rejected: any per-instance or runtime call to the generative model; auto-tracing raster into the
scene-graph as geometry (vector soup); any asset-owned semantic timeline or unregistered frame drift;
shipping real 3D / R3F as the map renderer; Google video for Act 2; and any machine-signed look
verdict.

## Consequences

- **Good — a positive target.** The eye test becomes "reach the cosy concept," which the owner can
  attest against, instead of "don't regress," which it never really could. The arc's machinery-first
  ladder is unchanged: a gap between a render and the cosy target that is physically sound is a KIT or
  PALETTE gap, so the machinery is improved rather than the model tier climbed.
- **Good — the look fork costs no new paint path.** Baked-vector-first reuses ADR-0218's single fenced
  family; nothing new punctures the colour-is-class invariant (ADR-0093), and the runtime still
  performs no geometry (ADR-0217 D4).
- **Cost — a new author-time dependency and a real bill.** Adopting `@google/genai` and an
  owner-provided key, at tens of dollars per authoring burst. Non-determinism is handled structurally:
  the committed re-authored vector asset — not the raster — is what the build and checker see, so the
  prove-it-gate's reproducibility is untouched.
- **Cost — the bridge's light 3D substrate is net-new authoring tooling** and is NOT built here. It is a
  future increment; decision 2 fixes its shape (a correctness rig, never shipped) so it cannot drift
  into being a runtime renderer. **Amended by
  [ADR-0225](0225-generative-3d-produces-the-bridge-blocking-substrate-via-a-v.md):** that increment is
  now specified — a generative-3D model produces the block through a vendor-swappable author-time
  adapter (NVIDIA Edify first). It stays author-time-only tooling and the adapter BUILD is still a later
  increment; ADR-0225 records the decision and the verified vendor strategy, not the build.
- **Parked, deliberately.** Decision 4 closes off three recurring scope debates (R3F-for-the-map, "3D"
  as a shipped thing, Google video for Act 2) so later increments do not re-open them.
- **Deferred — the SDK adoption is a LATER increment.** Adopting `@google/genai` and generating NEW
  assets needs the owner's API key. This ADR's increment (grounded-art inc 8) records the decision and
  locks a D2-safe **style bible** read from the EXISTING concept image; the first cosy render uses that
  concept purely as a style reference (no SDK, no key), and generative authoring lands once the key is
  provided.
- **Unresolved, honestly.** Whether any produced render actually reads cosy is the owner's LOOK verdict
  (ADR-0070 stage 2) and is not given by this ADR. Every look finding in this arc came from a human
  looking at a render; that discipline is unchanged.

## References

- [ADR-0225](0225-generative-3d-produces-the-bridge-blocking-substrate-via-a-v.md) — **amends this
  ADR.** Decision 2's hand-built light-3D blocking substrate becomes **generator-produced** (a reputable
  generative-3D model, reached through a vendor-swappable author-time adapter — NVIDIA Edify first,
  Google/Gemini image-reference only after a mesh-export verification); every other invariant here —
  author-time only, thrown-away maquette, re-author to checkable vector, baked-vector look D3,
  2.5D-isometric D4 — stands. Read it before relying on decision 2.
- [ADR-0230](0230-swappable-sprite-art-sheet-render-mode-take-adr-0219-s-parke.md) — **amends this
  ADR.** Takes D3's parked raster-sprite fork; its owner-attested Storybook sheet is now the
  clean-route default and Vector remains selectable.
- [ADR-0237](0237-chapter-2-is-a-scripted-mode-of-the-real-app-share-product-u.md) and
  [ADR-0274](0274-pixellab-animates-organic-growth-over-the-app-owned-svg-isla.md) — extend the
  author-time raster posture to Chapter 2 and selective registered organic-growth tracks over the
  app-native SVG island while preserving app-owned semantics, deterministic playback, 2.5D
  rendering and the human LOOK boundary.
- [ADR-0214](0214-ground-ai-authored-art-in-a-physical-model-csg-over-svg-not.md) — **amended**: D4's
  "improving the art is a hard non-goal" becomes a named aesthetic DIRECTION (the cosy concept). D4's
  **never-reinterpret rule stands** — the concept informs an author, never our code (ADR-0217 D2).
- [ADR-0217](0217-art-factories-are-per-object-type-parametric-kit-explicit-dr.md) — **amended**: D7's
  "fidelity to the existing look is the metric" is superseded by the directed cosy target; D8's "concept
  art designs the FACTORY, not the instance" gains the concrete generative-entry mechanism (nano-banana,
  author-time, bridged) and the D2 no-inlining rule governs it. D1 (one factory per object type, no
  connecting factory) is untouched.
- [ADR-0218](0218-baked-art-carries-resolved-paint-into-the-shared-scene-via-a.md) — the fenced
  baked-art family is the vehicle for decision 3's baked-vector look; reused as-is, not changed.
- [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) — colour-is-class and
  the single baked exception ADR-0218 carved; decision 3 stays inside that fence.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) /
  [ADR-0159](0159-frontend-builder-proves-stage-1-through-the-inner-loop-visua.md) — the look is
  operator-attested, stage 2; renders land default-off until the owner signs.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment
  is ratification; this ADR is born accepted.
- [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) /
  [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md) — the world is a
  function of live data and parts bake but islands compose live; why a generative model never runs
  per-instance.
- `docs/research/grounded-art-concept/` — the concept image + README (the aesthetic target) and
  `style-bible.md` (the D2-safe bridge step-2 style bible this increment locks).
- `asset:isometric-art-geometry-libraries` (techstack) — the geometry-library survey; standing verdict
  is nothing adopted. Read before adding any dependency.
