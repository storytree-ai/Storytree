---
status: accepted
decided: 2026-06-22
amends: [66]
---
# ADR-0093: Shared forest-world render core for studio and the public website

## Status

accepted (flipped from proposed 2026-06-22 under [ADR-0084](0084-agents-may-flip-an-adr-green.md), the
agent green flip — the decision is made and the prose below supports it) — designed 2026-06-22 by the
orchestrator session at the owner's request. After the session hand-ported the studio's current map look
(the relaxed Townscaper mesh + Chaikin-smoothed coastline) into the public website, the owner said: *"I
like the idea of sourcing everything from studio, so every time we update studio it flows into the
website."* Offered "spec it (ADR + shared core)" vs a quick sync pipe vs leaving it manual, the owner
chose **spec it**. This ADR **resolves [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
Open call #4** ("a shared render core for studio + web — leverage vs. coupling, a follow-on decision,
not this ADR") in favour of **leverage**.

The *direction* — one shared core — was decided here; the **render-extraction strategy** (§Open call 1)
was the load-bearing fork, and **the owner resolved it 2026-06-22: strategy C — share the geometry
*plus* a framework-agnostic scene-graph, with a thin per-surface mapper (studio → React; website → SVG
strings)**. This ADR originally *recommended* the cheaper option B (share the web's string-SVG renderer
directly); the owner chose **C** for the cleanest separation — the studio keeps native React rendering
and interactivity rather than being pushed onto `innerHTML` + event delegation, and neither surface is
coupled to the other's framework. The three remaining open calls (§Open calls 2–4) are resolved inline
below in line with that choice. Implementation is then the work — extracted, proven, and landed in
slow-growth units (the core + studio mapper first; the web sync + drift gate next), not by this ADR; it
decides the shape.

## Context

Two render engines draw the **same forest-world metaphor**:

- the **studio** forest world ([ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md))
  — a large React component (`apps/studio/src/components/TreeView.tsx`) wired to the **live store**,
  with rich chrome on top (solar layout, the Shared-Islands panel, building stamps, the settings gear,
  per-node hover/click/focus);
- the **public website** demo — a pure, build-time engine (`web/src/lib/world.ts` +
  `worldSvg.ts`) that emits **string SVG** from **fictional** "Cohoot" data, in a separate *public*
  repo (the `web/` submodule).

They were deliberately **independent**: [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
Decision 3 set the boundary as *"the public site consumes parent-built artifacts, never private
source,"* and [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) plus the
web repo's "original visual language" kept the site decoupled from the private internals.

That independence has a cost, and it bit concretely **2026-06-22**: the owner wanted the studio's
current look on the site, and it had to be **hand-ported** (this session re-implemented the mesh
substrate + smoothed coast in the web repo from first principles). Every studio look change otherwise
drifts from the site or demands another manual port. [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
foresaw exactly this (Consequences: *"Two render engines exist … graduating the web engine parent-side
invites — but this ADR does not decide — a shared render core consumed by both: real leverage, real
coupling"*; Open call #4). The owner now chooses the leverage.

The forces that shape *how*:

- **The studio render is React + live data + a superset of features;** the web render is pure
  string-SVG + fictional data + a **subset** of the world (just islands/trees/flora/coast/roads). The
  shareable thing is the **pure world render** — geometry and shapes — not the data, the store, or the
  framework chrome.
- **The boundary still holds** ([ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
  Decision 3 / [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md)): the
  public site must consume a parent-built **artifact**, never private source or live data. A shared
  core therefore lives **parent-side**; the site consumes its output; the fictional demo data stays in
  the web repo.
- **The web engine is, conveniently, already pure and at parity.** This session brought
  `web/src/lib/{world,worldSvg}.ts` to the studio's current look — a clean, framework-agnostic
  string-SVG renderer. That makes it the natural seed of a shared core rather than a throwaway.

## Decision

Adopt **one shared forest-world render core**, parent-side, consumed by both surfaces — resolving
[ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) Open call #4 for
leverage.

1. **Extract the pure render core into a parent package, `packages/forest-world`** (resolving §Open
   call 2 — chosen over the `packages/web-engine` [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
   Decision 2 named, because the core is shared studio+web, not web-only; role-not-position per
   [ADR-0078](0078-rename-root-ports-role-not-position.md)). Under **strategy C** it holds
   two pure layers: the deterministic **geometry** (`buildWorld` / the relaxed Townscaper mesh / the
   Chaikin coast / ranking / territory growth) → a `World`, and a **framework-agnostic scene-graph**
   builder (`World` → a tree of typed *drawables*: island cells, living tree, dead/withered tree,
   sapling, flora, conifer, signpost, bloom, wisp, roads, plates/labels — each carrying its resolved
   primitive geometry plus a semantic kind / variant / *already-folded* visual status, and **no class
   strings, no live data**). Pure, browser-safe, deterministic, **data-in → scene-out**; no store, no
   React, no framework render. It defines its **own minimal input contract** (story / capability /
   dependency shapes) so it depends on nothing — a foundational root organism
   ([ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md) /
   [ADR-0075](0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md)); each surface adapts its
   own data to that contract. Seeded from the studio's canonical geometry (the studio wins every
   constant divergence) and the website's already-pure string-SVG render (now at parity). It earns
   inner-loop proofs parent-side ([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) /
   [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md)) — determinism,
   ranking, mesh/coast invariants, **scene-graph correctness** — the dogfood
   [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) Decision 2 wanted.

   > **Correction (2026-07-02) — how the extraction landed (function names, not the decision).** The
   > core ships both pure layers, but not under the names sketched above: the geometry kernel is
   > module-level (`substrate` / `coast` / `ranking` / `hex` / `rng` / `sizing`) — there is **no
   > `buildWorld` and no `World` type in the package** — and the scene-graph builder is
   > **`buildScene` over the core's OWN minimal `SceneInput` contract** (the "own minimal input
   > contract" clause above, taken literally). World-assembly (`buildWorld`) stayed **surface-side
   > studio chrome** (`apps/studio/src/components/TreeView.tsx`), per Decision 4's look-only line;
   > each surface adapts its own data to `SceneInput`. And since
   > [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md) (which amends
   > this ADR) the scene-graph feeds a **third** mapper — `packages/forest-world-r3f` (typed 3D
   > instance descriptors) — a peer of the two mappers decided here.

2. **The studio renders FROM the core through a thin React mapper** ([ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md)
   refactors): its world layer becomes a walk of the core's scene-graph emitting React `<g>`/`<path>`/
   `<circle>` with the studio's own class names + per-node handlers, with the studio's chrome — panels,
   solar, building stamps, settings, live-store wiring, interactivity — layered **on top**. Because the
   mapper renders React natively, the studio keeps its existing per-node hover/click/focus (it is **not**
   forced onto `innerHTML` + event delegation — the reason the owner chose C over B; §Open call 4). The
   studio stays the **canonical source of the look**: a change lands there first.

3. **The site consumes the core's ARTIFACT, not its source** (boundary intact; resolving §Open call 3
   for sync-into-submodule). The public submodule takes the **built output** of the shared core via a
   sync step + a drift gate (`check:web-engine`, the [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) /
   [ADR-0052](0052-render-delegatable-agents-to-claude-agents-subagent-files.md) generated-view +
   drift pattern, at submodule-bump granularity like the existing `check:web-grounding`) — chosen over
   publishing a private package, matching [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
   Decision 3/6. The site's render becomes a **thin string-SVG mapper** over the synced scene-graph
   (it absorbs today's `web/src/lib/worldSvg.ts`, keeping its `tw-*` classes + `data-id` event
   delegation); the site keeps its **fictional Cohoot data** and its thin page shell. A studio look
   change thus **flows** to the site through one core — no hand-port.

4. **Shared = the LOOK only** (geometry + shapes). Never the live data, the store, the corpus, or the
   studio's interactive/feature chrome. This is the precise line that keeps
   [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md)'s decoupling intact
   (no private data crosses) while sharing the rendering logic.

5. **The wasteland mock rides the same flow.** The website-only "failing story → barren, dead-tree
   wasteland" prototype built this session **graduates into the core/studio** once the owner is happy,
   then flows back to the site as core output — the prototype → graduate → flow model the owner
   endorsed, rather than a permanent site-only fork.

## Consequences

**Good.**
- One **source of truth** for the look: studio changes flow to the site automatically — the owner's
  ask — and the two surfaces can never visually drift.
- No more hand-ports (this session's manual mesh port becomes the last one).
- The demo engine, untested today, becomes a proven parent-side core
  ([ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) Decision 2's
  inner-loop dogfood, now shared).

**Bad / costs.**
- **Re-couples public ↔ private at the render layer.** Mitigated by Decision 3/4 (artifacts-not-source,
  look-only, no data), but a real publish/sync edge now exists with freshness + tooling cost — the same
  trade [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) Open call #1
  flagged, now taken for the render core.
- **A studio render refactor** ([ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md)):
  moving its world layer onto a core-driven render (and its per-node interactivity onto event
  delegation, which the website already uses) is the load-bearing effort — surfaced as Open call 1.
- **Discipline cost:** the core must stay framework-agnostic and a strict **subset** API so the
  studio's extras never leak into the site bundle.

## Open modeling calls — RESOLVED

All four were resolved 2026-06-22 (call 1 by the owner; calls 2–4 follow from that choice and the
recommendations below). The original options are kept for the record.

1. **Render strategy — the load-bearing fork. → RESOLVED: (C), by the owner 2026-06-22.**
   (A) Share **geometry only** (layout/mesh/coast → data); each surface keeps its own shape render →
   layout flows, shapes stay duplicated (*partial* flow).
   (B) Share **geometry + framework-agnostic string-SVG shapes** (the web's `worldSvg.ts` becomes the
   shared renderer; the studio renders it via `innerHTML` + event delegation) → **everything flows**; a
   real but bounded studio refactor.
   (C) Share **geometry + a scene-graph** description; each surface has a thin mapper (React / SVG
   string) → everything flows, cleanest separation, most work.
   This ADR *recommended* (B) as the cheapest path to full flow; **the owner chose (C)** so the studio
   keeps native React rendering + its rich per-node interactivity (no `innerHTML` + forced event
   delegation) and neither surface is coupled to the other's framework — full flow with the cleanest
   separation, at the cost of the extra scene-graph layer + two thin mappers. (C) folds the website's
   already-pure string-SVG render in as the *web mapper*, so the extra cost is bounded.
2. **Package identity. → RESOLVED: `packages/forest-world`** — a new foundational root organism that
   depends on nothing (it owns its own minimal input contract), chosen over the web-only-sounding
   `packages/web-engine` ([ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
   Decision 2) because the core is shared studio+web; role-not-position
   ([ADR-0078](0078-rename-root-ports-role-not-position.md)), under
   [ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md) organism boundaries
   / the no-cycle rule (studio + web consume it; it consumes neither).
3. **Sync mechanism + cadence. → RESOLVED: sync-into-submodule + drift gate.** Build-artifact synced
   into the submodule on the core's change (a script + `check:web-engine` drift gate at bump time)
   rather than a published package the web repo depends on — matches
   [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) Decision 3/6 and the
   existing `check:web-grounding` granularity, and avoids publishing a private package.
4. **Studio interactivity under a shared render. → RESOLVED by (C): no change forced.** The studio's
   per-node hover/click/focus stays React — the scene-graph mapper emits React elements the studio
   binds handlers to directly, so it never moves to `innerHTML` + `data-id` event delegation. (The
   website mapper keeps using delegation, which the scene-graph supports by also carrying `data-id`.)
   This was the deciding factor in the owner's choice of (C) over (B).

## References

- [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) — the website-wiring
  ADR this **amends**: Open call #4 (the shared core, resolved here), Decision 2 (engine graduation),
  Decision 3 (the artifacts-not-source boundary).
- [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) — the studio forest
  world; the canonical render that becomes the core's source and refactors to consume it.
- [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) — the decoupling /
  `data-grounds` boundary this preserves (look shared, data never).
- [ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md) — organism boundaries / no-cycle rule for the new package.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) / [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md)
  — the inner-loop proofs the shared core earns.
- [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) / [ADR-0052](0052-render-delegatable-agents-to-claude-agents-subagent-files.md)
  — the generated-view + drift-gate pattern the `check:web-engine` sync reuses.
- [ADR-0050](0050-adr-number-allocation.md) — how this ADR's number (0093) was allocated.
- `web/src/lib/world.ts`, `web/src/lib/worldSvg.ts` — the pure string-SVG render brought to studio
  parity 2026-06-22 (the seed of the shared core); `apps/studio/src/components/TreeView.tsx` — the
  studio render to share.
