---
status: accepted
decided: 2026-07-24
amends: [93, 213, 215, 230]
arc: chapter2-real-app-surface-arc
---
# ADR-0237: Chapter 2 is a scripted mode of the real app — share product UI, art and semantic motion

## Status

accepted (2026-07-24) — decided/directed by the owner in conversation on 2026-07-24. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md):** its
shared scene graph and artifacts-not-source boundary stand, but Decision 4's **"shared = the LOOK
only"** ceiling is narrowed for Chapter 2. Chapter 2 now consumes a parent-built artifact containing
the real app's product presentation as well as the scene graph; it may not keep a separate
string-SVG product renderer or reconstruct studio chrome.

**Amends [ADR-0213](0213-act-2-experience-one-continuous-orchestrator-led-walk.md):** its continuous,
visitor-paced walk, principles, staged fictional data, diagrams and progressive disclosure stand.
Its Phase Z **token re-creation of studio chrome** and its website-owned product-surface assumption do
not. Chapter 2 is inside the real app surface from its first product frame; Phase Z reveals the
remaining real chrome rather than crossfading into an imitation.

**Amends [ADR-0215](0215-public-website-story-frame-two-act-experience-is-the-entire.md):** its
two-act frame, experience-is-the-site shape, fictional-data boundary, a11y fallback and replay-only
posture stand. D4's parent-built artifact is broadened from the framework-neutral world core to the
shared browser product surface described here. No private data or live-store access crosses.

**Amends [ADR-0230](0230-swappable-sprite-art-sheet-render-mode-take-adr-0219-s-parke.md):** its
author-time-only generation, ground anchors, painter ordering, graceful vector fallback, 2.5D
isometric posture and operator-held LOOK verdict stand. Its **studio-only / public-site-untouched**
scope is reversed for Chapter 2: the owner-attested Storybook sheet and the same sprite renderer the
app uses are the first Chapter 2 art substrate.

**Amended by
[ADR-0273](0273-pixellab-island-growth-is-a-selective-standard-shared-app-sp.md) (2026-07-30).**
D5's infrastructure-first ordering has been satisfied by the landed shared-surface iterations.
One bounded PixelLab full-island frame track may now enter as registered local appearance assets;
the shared app still owns semantic state, timing, deterministic playback, anchors, painter order and
reduced motion, and the owner still holds the LOOK verdict.

## Context

The repository already contains two materially different versions of the product:

- the actual studio renders the forest through the shared React
  [`SceneView`](../../packages/app-surface/src/SceneView.tsx), mounted by
  [`TreeView`](../../apps/studio/src/components/TreeView.tsx), the app's
  [`WorldLegend`](../../apps/studio/src/components/WorldLegend.tsx), chat/inspector chrome and the
  owner-attested Storybook sprite sheet; while
- Chapter 2 builds a separate string-SVG world in
  [`web/src/lib/worldSvg.ts`](../../web/src/lib/worldSvg.ts), orchestrates it in
  [`web/src/scripts/act2-walkthrough.ts`](../../web/src/scripts/act2-walkthrough.ts), and hand-builds
  a studio-looking finale in
  [`web/src/scripts/act2-studio.ts`](../../web/src/scripts/act2-studio.ts).

That split is no longer an acceptable implementation of "the real app UI." It makes the public
experience a second product renderer which can look plausible while showing yesterday's art,
interactions and semantics. The divergence is concrete on 2026-07-24: Storybook is now the app's
signed-off default under ADR-0230, but Chapter 2 still walks the older vector/string-SVG surface.
Improving the Chapter 2 imitation would deepen the maintenance fork and spend animation work on
pixels the app cannot reuse.

The owner set the stronger boundary in conversation: **all of Chapter 2, except diagrams and
educational visualisations, comes from in-game / in-app content.** The owner then accepted an
intentionally rough island-growth motion mock as enough to settle sequence feasibility and directed
the arc to land infrastructure first; coherent production art, animation frames and further effects
are sourced or authored after the first real iteration. The mock is not a shippable visual target.

Three forces remain load-bearing:

1. **The public boundary stays real.** The website remains a diorama over deterministic fictional
   data; it does not connect to the private corpus, store, backend or operable app actions
   (ADR-0056/0066/0215).
2. **One component must mean one product.** Reusing scene data while duplicating the mapper, CSS,
   sprite policy or chrome is not reuse at the level a visitor sees. Product presentation must have
   one implementation consumed by the studio and Chapter 2.
3. **Animation is a product capability, not website decoration.** If Chapter 2 can show an island
   grow, a wisp orbit or proof turn a story green, the real app must own and be able to play that
   same semantic transition. Chapter 2 may choose the timing and sequence; it may not animate a
   private reconstruction.

## Decision

**Chapter 2 is a scripted, read-only mode of the actual Storytree app surface.** It supplies staged
data and a visitor-paced script to the same product presentation the studio uses. Seven decisions
make that enforceable.

### D1 — One parent-side product-surface implementation

Extract the browser presentation currently trapped inside `apps/studio` into one parent-side shared
surface, provisionally `@storytree/app-surface`. The exact internal component split may follow the
existing seams, but the artifact owns the product pixels and behaviours Chapter 2 shows:

- the React scene mapper and its semantic DOM identity;
- sprite-sheet resolution, sizing, anchors, assets and graceful vector fallback;
- map camera, depth ordering and product motion;
- the real legend, world chrome and story inspector presentation;
- the orchestrator chat presentation; and
- their product tokens and reduced-motion rules.

The studio becomes one consumer of that surface instead of its private owner. The website consumes
the built/synced browser artifact through the existing generated-artifact rail; it never imports
private checkout source across the submodule boundary. This is a framework-bearing presentation
package above the framework-neutral `@storytree/forest-world` root, never code folded back into that
root.

### D2 — Controllers differ; product presentation does not

The shared surface accepts a deterministic typed presentation model and event callbacks. Two
controllers adapt into it:

- the **studio controller** folds live API/store data and real app actions; and
- the **Chapter 2 controller** folds site-owned fictional frames, scripted chat messages, permitted
  read-only inspection and semantic camera targets.

Components that currently mix presentation with effects (notably `TreeView`, `ChatPanel` and their
API hooks) split into a reusable view and a surface-owned controller/adapter. Chapter 2 never stubs
network calls inside a live component and never receives an operable mutation callback. Fictional
data is honest; fake product markup is not.

### D3 — The visitor is inside the app from Chapter 2's first product frame

The Act 1-to-2 transformation remains website-owned. Diagrams, guiding-principle visualisations,
anchored teaching callouts and narration remain website-owned. Once Chapter 2 shows product content,
however, the shared app surface is already mounted.

Progressive disclosure hides real surface regions until the walk earns them. The diagram phase may
cover or mask the shared surface; it does not replace it. The island walk then reveals the real map.
The current Phase Z crossfade into re-created studio chrome retires: Z progressively reveals the
actual legend, forest context, inspector and remaining chrome around the surface already on screen.

### D4 — Semantic transitions are shared app behaviour

Chapter 2 advances domain-shaped presentation frames — for example:

`empty → land present → story proposed → work claimed/present → signed proof → story healthy`.

The shared surface decides how those deltas move. The first motion vocabulary is deliberately small:

- transform/opacity staging for ground, islands and standing objects;
- the real map camera's pan/zoom interpolation;
- the real wisp's orbit/glow;
- real dependency-path reveals;
- proposed-to-healthy sprite crossfade plus the real proof bloom; and
- ordinary product UI disclosure transitions.

Ground-contact anchors and painter-Y ordering stay the 2.5D occlusion model. Time affects motion only,
never semantic state. Back/replay re-applies the same frame deterministically; reduced motion shows
the same state changes without spatial travel.

The Chapter 2 controller may choose when a semantic frame is applied and which camera target is
requested. It may not select product DOM nodes and animate them directly.

### D5 — Infrastructure first; source production art after the honest first iteration

The first landed visual iteration uses the current owner-attested Storybook sheet and existing vector
fallbacks. It proves one island growing from nothing through proposed, live-work and proven states on
the shared surface. It is allowed to look like a prototype; it is not allowed to fork the renderer.

After that real iteration was witnessed, the observed gaps earned the bounded art work authorized by
ADR-0273: one complete-island PixelLab track, curated into canonical committed local assets behind
the same app-owned semantic slots. Purchased packs, commissioned work and the existing author-time
generative pipeline remain compatible sources; no runtime vendor call or asset-owned state model is
introduced.

Frame sequences or cutout layers are added to the art manifest only when an object's silhouette must
deform. Camera motion, translation, scale, orbit, path reveal, glow and state crossfade do not earn
new raster frames. Animated WebP/video clips are not the state model: the surface must retain replay,
reduced-motion and semantic control.

### D6 — Drift fails closed

The generated-artifact gate expands to hold the shared surface, its CSS/tokens, sprite manifests and
required assets byte-fresh in the web submodule. A Chapter 2 boundary check fails when website-owned
code implements product UI or product art instead of consuming the shared surface. In particular,
the migrated Chapter 2 path may not own a substitute world mapper, legend, inspector, chat shell,
studio frame, sprite resolver or product animation rules.

The old website mapper may survive for a non-product use only if a remaining consumer is named and
proved. It is not reachable from Chapter 2 after migration.

### D7 — What stands

- The experience remains 2.5D isometric. R3F/real 3D does not return.
- Chapter 2 remains staged/fictional and read-only; no live/private data crosses.
- The visitor-paced continuous walk, principles, diagrams, plain-language narration, inspectability,
  a11y fallback and operator-held LOOK proof stand.
- Act 1 and the physical Act 1-to-2 transformation remain website experience content.
- The app surface is reusable product code, not a screen recording, video, iframe of a privileged
  deployment or screenshot sequence.

## Consequences

**Good.**

- Every Chapter 2 product improvement is an app improvement; there is no animated marketing fork.
- A visitor who later opens Storytree sees the same art, controls and semantic behaviour they were
  taught.
- Phase Z becomes simpler and stronger: it reveals context around the real surface instead of
  attempting a convincing crossfade into a copy.
- Storybook and later replacement art flow to both consumers through one manifest and one renderer.
- The rough first iteration produces a concrete art brief rather than guessing the full asset roster
  before the real composition exists.

**Costs / risks.**

- The web bundle deliberately gains a React/browser product-surface artifact, its CSS and its art
  assets. Bundle size and lazy-loading need measurement; correctness of reuse wins over preserving the
  smaller duplicate renderer.
- `TreeView` and chat currently mix data/effects with presentation. Splitting controller from view is
  real product refactoring and must retain app behaviour, not merely make the website compile.
- Shared UI can accidentally expose operable actions or live fetches. The typed read-only controller
  seam must fail closed, and Chapter 2 gets no live adapter.
- CSS/assets must cross the submodule sync rail without URL or font drift.
- The first infrastructure visual is explicitly not the final LOOK. It still needs operator
  witnessing under ADR-0070; an agent cannot turn "structurally shared" into "looks good."

**Rejected.**

- Polishing `act2-studio.ts` or the Chapter 2 string-SVG mapper until it resembles the app.
- An iframe, recording, fixed video, screenshot carousel or privileged live-studio embed.
- Sourcing a complete animation art set before one real shared-surface island exposes what is needed.
- Adding a general game engine or returning to R3F for these transitions.
- Treating a larger sprite sheet as the animation architecture. Assets supply pixels; the shared
  semantic transition system supplies behaviour.

## References

- [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) — shared scene
  graph and parent-built artifact rail; amended here above the look-only ceiling.
- [ADR-0213](0213-act-2-experience-one-continuous-orchestrator-led-walk.md) — current Act 2
  choreography; amended here at its product-surface and Phase Z substrate.
- [ADR-0215](0215-public-website-story-frame-two-act-experience-is-the-entire.md) — public site
  frame and fictional-data boundary; preserved and broadened to this artifact.
- [ADR-0230](0230-swappable-sprite-art-sheet-render-mode-take-adr-0219-s-parke.md) — current
  Storybook sprite renderer/art; amended from studio-only to shared with Chapter 2.
- [ADR-0273](0273-pixellab-island-growth-is-a-selective-standard-shared-app-sp.md) — selective
  full-island PixelLab track, registered as local appearance assets under this ADR's shared app-owned
  semantic transition system.
- [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) /
  [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) — the public
  grounding and no-private-data boundary that stands.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) /
  [ADR-0159](0159-frontend-builder-proves-stage-1-through-the-inner-loop-visua.md) — machine proof
  for behaviour, owner proof for appearance.
- [ADR-0219](0219-generative-image-models-enter-the-art-pipeline-author-time-o.md) — author-time
  generative entry and 2.5D-isometric permanence.
- [`SceneView`](../../packages/app-surface/src/SceneView.tsx) and its typed
  [`WorldSceneView`](../../packages/app-surface/src/WorldSceneView.tsx),
  [`TreeView`](../../apps/studio/src/components/TreeView.tsx),
  [`WorldLegend`](../../apps/studio/src/components/WorldLegend.tsx),
  [`ChatPanel`](../../apps/studio/src/components/ChatPanel.tsx) — the actual app surface to
  separate from its live controllers.
- [`sprite-sheet.ts`](../../packages/app-surface/src/sprite-sheet.ts) and
  [`apps/studio/public/art-sheets/storybook/`](../../apps/studio/public/art-sheets/storybook/) —
  the current canonical sprite contract/assets.
- [`worldSvg.ts`](../../web/src/lib/worldSvg.ts),
  [`act2-walkthrough.ts`](../../web/src/scripts/act2-walkthrough.ts),
  [`act2-studio.ts`](../../web/src/scripts/act2-studio.ts) — the Chapter 2-local product
  implementations retired from that path by this decision.
- Arc `chapter2-real-app-surface-arc` — the initiative and increment log for this migration.
