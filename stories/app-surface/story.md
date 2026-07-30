---
id: "app-surface"
tier: story
title: "The shared app surface — Studio's real forest scene and deterministic full-island growth"
outcome: "The real shared app lets an operator witness one planted full island grow from registered local PixelLab-authored frames under app-owned deterministic progress, navigation and reduced-motion settlement without changing the clean forest route."
status: proposed
proof_mode: UAT
# Mixed witness: deterministic model/view, Studio adoption, art/selector parity, semantic replay,
# stylesheet loading, reduced-motion equivalence and the query-gated host are machine legs. The
# visible scene/motion verdict remains operator-attested under ADR-0070.
arc: chapter2-real-app-surface-arc
capabilities: [app-surface-world-view, studio-app-surface-adapter, semantic-growth-replay-view, semantic-growth-studio-demo, pixellab-island-growth-track, pixellab-island-growth-app-witness]
# The framework-bearing package sits immediately above @storytree/forest-world and imports it.
# Studio's consuming-surface edge is declared consumer-side in stories/studio/story.md.
depends_on: [forest-world]
consumed_by: []
decisions: [273, 237, 219, 93, 213, 215, 230, 70]
---

# The shared app surface — Studio's real forest scene and deterministic full-island growth

**Outcome —** The real shared app lets an operator witness one planted full island grow from
registered local PixelLab-authored frames under app-owned deterministic progress, navigation and
reduced-motion settlement without changing the clean forest route.

This story carries the landed extraction and semantic-replay increments of
`chapter2-real-app-surface-arc`, then extends that same still-open consumer journey under owner-ratified
ADR-0273 and `chapter2-pixellab-island-growth-arc`: the existing public player receives one bounded,
registered full-island sprite track and its real consumer stages the hosted acceptance witness. It
still does **not** claim
ADR-0237's whole app surface: `WorldLegend`, inspector/detail presentation, `ChatPanel`, the camera
shell/controller, bulk `TreeView` chrome/layout and bulk product CSS remain Studio-owned.

## Journey and split

The consumer is the Studio operator. Open the existing forest map and find the same world scene,
sprite policy and existing arrival/trail behaviour supplied through the shared package rather than
privately rendered by `apps/studio`; then open the explicit witness flag and walk that same product
surface through:

`empty → land → proposed story → claimed/presence → signed proof → healthy`.

The ADR-0273 successor then uses that same player and consumer to walk one complete island from
formation through rooted hero-tree and foliage growth to the retained mature scene. PixelLab supplies
author-time appearance only; app-owned progress, frame selection, controls, accessibility and final
state remain the product journey.

The fold is owner-directed after ADR-0192's packages-forward gate exposed the standalone-successor
shape as false ownership: a new story could not claim either the existing `packages/app-surface`
building or the existing Studio host. The package-owning `app-surface` story is the honest home, and
it already carries the frozen Studio-host grandfather entry. Within this story the work remains
sequential and independently provable: typed scene → Studio adoption → semantic replay/motion →
query-gated witness host.

## Design floor

- **Move the real scene implementation.** The existing React `SceneView`, its semantic SVG/DOM
  identity, sprite manifest/resolver/sizing/fallback and current trail/arrival selectors move into
  `@storytree/app-surface`. No parallel shared renderer is created.
- **Stay above the framework-neutral core.** `@storytree/forest-world` remains the world/scene
  computation root; React and sprite policy never move down into it.
- **Separate world presentation from authority.** The shared view receives deterministic typed
  `WorldPresentationModel` data plus separate `WorldPresentationEvents`. It performs no fetch,
  store access, subscription, clock selection or live mutation. `TreeView` remains the controller.
- **Preserve ADR-0230.** Clean/default remains Storybook, explicit `?artStyle=vector` remains Vector,
  unknown explicit values fail safely to Vector, and an uncovered sprite kind uses the per-node
  Vector fallback. Sizing, ground-contact anchors and painter-Y ordering stay unchanged.
- **Keep the boundary narrow.** Legend, inspector, chat, camera shell/controller, bulk chrome/layout
  and bulk CSS stay in Studio for later extraction. This story moves only the world-scene slice and
  any scene-local styling inseparable from that mapper.
- **Motion belongs to the shared product.** The public semantic-growth view accepts exactly six
  supplied `WorldPresentationModel` frames, delegates each to `WorldSceneView`, and loads its own
  app-owned transform/opacity stylesheet. Consumers never animate product DOM themselves.
- **Replay is semantic and deterministic.** Next, Back, restart and Replay select stable frame keys;
  time may interpolate but never creates/skips a state. Claimed/presence remains distinct from proof,
  and healthy presentation appears only last.
- **Reduced motion preserves meaning.** `prefers-reduced-motion` reaches the same six semantic states
  without spatial travel, orbit, scale sweep or delayed hidden content.
- **Host only the witness.** Exact query flag `semanticGrowth=demo` mounts one static representative
  fixture plus Back/Next/Replay in Studio. The clean route stays unchanged; the host is not a Chapter
  2 controller, production route, live-data adapter or permanent navigation entry.
- **Add one bounded author-time art track, not another runtime.** ADR-0273 permits versioned local
  PixelLab-authored full-island PNGs plus provenance/anchor metadata inside the existing player.
  Runtime vendor calls, asset clocks, website-local UI/rendering/animation, unbounded sheet families,
  artifact sync and broader chrome extraction remain out.

## Capabilities

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`app-surface-world-view`](app-surface-world-view.md) | A deterministic typed world model/events seam and the real React scene mapper, sprite policy and existing trail/arrival selectors live in the shared package. | — |
| 2 | [`studio-app-surface-adapter`](studio-app-surface-adapter.md) | `TreeView` folds its existing world state/actions into the shared model and mounts the shared world view while surrounding product UI stays in Studio. | `app-surface-world-view` |
| 3 | [`semantic-growth-replay-view`](semantic-growth-replay-view.md) | The shared view plays the six supplied semantic frames with deterministic Next/Back/Replay and app-owned normal/reduced motion. | `studio-app-surface-adapter` |
| 4 | [`semantic-growth-studio-demo`](semantic-growth-studio-demo.md) | An explicit Studio query flag mounts one representative six-frame fixture and its controls solely to stage the operator witness. | `semantic-growth-replay-view` |
| 5 | [`pixellab-island-growth-track`](pixellab-island-growth-track.md) | A registered local full-island frame track maps app-owned normalized progress to planted frames with deterministic navigation, reduced-motion settlement and retained final state. | `semantic-growth-replay-view` |
| 6 | [`pixellab-island-growth-app-witness`](pixellab-island-growth-app-witness.md) | The exact query-gated real Studio consumer stages that product track while clean and unknown-query routes stay unchanged. | `semantic-growth-studio-demo`, `pixellab-island-growth-track` |

Dependency graph: `app-surface-world-view → studio-app-surface-adapter →
semantic-growth-replay-view → semantic-growth-studio-demo`; ADR-0273 adds
`semantic-growth-replay-view → pixellab-island-growth-track` and
`[semantic-growth-studio-demo, pixellab-island-growth-track] →
pixellab-island-growth-app-witness`.

The model and view remain one deep package capability: the model is the view's narrow interface,
not an independent consumer journey. Studio adoption is a second leaf because it has its own
isolatable integration red→green in the `apps/studio` host. Semantic replay begins only after that
landed extraction history, and the demo host follows only after the public player is green.

## Ownership and scaffold

Before the first leaf, scaffold `packages/app-surface` and register
`repo-manifest.json` ownership (`app-surface → app-surface`). It depends on
`@storytree/forest-world` and the minimum React/browser dependencies. Package metadata, test tooling
and manifest/root registration are orchestrator glue.

The adapter and flag-gated witness demo are deliberately hosted in `apps/studio` under the same
frozen `app-surface` hosted-story entry. `TreeView` retains Studio effects, camera/controller state
and live actions while importing the public shared view. The real consuming edge is declared by
`studio.depends_on: [app-surface]`; no new hosted story or register exception is introduced.

## UAT Test Criteria

**Goal —** The real shared app preserves its clean forest while an exact witness mode grows one
registered full island at a planted anchor through deterministic, reversible app-owned progress and
equivalent reduced-motion settlement, ready for the owner's LOOK judgment.

1. **The world presentation is deterministic and authority-free.** _(witness: machine)_
   _(proof-gate: app-surface#gate-1)_ Fold and render the same representative world fixture twice.
   **Success —** models and semantic renders are equal; the view has no fetch/store/clock authority
   and reports only typed world events.
2. **TreeView is the real first consumer.** _(witness: machine)_
   _(proof-gate: app-surface#gate-2)_ Render real `TreeView` with loaded, selected, claimed, proven,
   arrival and reveal-plan state. **Success —** it mounts the public shared world view, routes the
   selection event through the existing controller, and retains no second private scene mapper.
   Legend/inspector/chat/camera remain unchanged Studio siblings. *(Scope corrected 2026-07-26,
   ADR-0209 D8. The witness stays `machine` — every condition above compiles — but the walk as
   written OVERSTATES what gate-2 observes today. The bound suite is green (105 files / 947 tests,
   run 2026-07-26), and within it only `asa-treeview-mounts-one-shared-world-view`
   (`apps/studio/src/components/TreeViewShell.test.tsx:68`) speaks to this leg — and it is a
   SOURCE-TEXT assertion over `apps/studio/src/components/TreeView.tsx` (it imports `WorldSceneView`
   from `@storytree/app-surface`, renders `<WorldSceneView`, and no longer imports `SceneView` from
   `./SceneView.js`), not a render carrying selected/claimed/proven/arrival/reveal-plan state; no
   test anywhere drives a selection event through the controller. Three of this leaf's four declared
   contracts — `asa-treeview-folds-world-state-into-shared-model`,
   `asa-world-events-reach-existing-studio-controller`, `asa-studio-scene-regressions-stay-green` —
   have no test-name binding. Recorded as a COVERAGE gap and left as one: no binding was invented and
   no observe gate was minted over unproven ground (ADR-0097 §2).)*
3. **Art and existing selector policy survive.** _(witness: machine)_
   _(proof-gate: app-surface#gate-1)_ Exercise default, Vector, unknown and partially covered
   Storybook cases plus the moved selector fixtures. **Success —** art resolution/fallback, sizing,
   anchors/depth order, `trailRevealPlan` and `arrivalGrowPlan` match their existing behaviour.
4. **The hosted full-island growth reads as one coherent product surface.**
   _(witness: human)(detail: app-surface#uat-4)_ Stand up and verify the clean forest-map deep-link plus
   exact PixelLab-island witness deep-link. Walk forward, Back and Replay through island formation,
   rooted hero-tree growth, foliage/ground detail and the retained mature scene at representative
   desktop and mobile sizes; sample reduced motion. **Success —** the owner judges that the complete
   island stays planted, grows convincingly and preserves the attractive PixelLab direction at full
   composition scale. Determinism, anchoring, route isolation, vendor absence and performance remain
   compiled/machine-observed sibling legs rather than being laundered into this judgment. An agent
   never signs this leg.
5. **The semantic walk exposes exactly six honest states.** _(witness: machine)_
   _(proof-gate: app-surface#gate-3)_ Mount the public semantic-growth view with six representative
   `WorldPresentationModel` frames and advance from empty to healthy. **Success —** observed keys are
   exactly `empty`, `land`, `proposed`, `claimed`, `signed-proof`, `healthy`; claim/presence never
   carries bloom/verdict identity and healthy presentation appears only in the final frame.
6. **Back, Replay and reduced motion preserve semantics.** _(witness: machine)_
   _(proof-gate: app-surface#gate-3)_ Walk backward and replay the same action trace in full and
   reduced motion. **Success —** frame keys and semantic snapshots are deterministic; the public
   view itself loads the app-owned motion stylesheet; `prefers-reduced-motion` removes spatial
   travel/orbit/delayed hidden content without changing any semantic state.
7. **The witness deep-link is isolated from clean Studio.** _(witness: machine)_
   _(proof-gate: app-surface#gate-4)_ Exercise clean Studio and
   `?semanticGrowth=demo#/tree`. **Success —** clean Studio mounts no demo and retains its current
   controller/selection/arrival/chrome behaviour; the flagged route mounts exactly one public
   six-frame player with Back/Next/Replay, reusing Studio's resolved Storybook default or explicit
   Vector fallback without a second resolver.
8. **The full-island art is local, provenanced and planted.** _(witness: machine)_
   _(proof-gate: app-surface#gate-5)_ Validate the checked-in manifest and decode every referenced
   frame/layer. **Success —** prompt/model/generation/licence metadata, frame dimensions/count/order,
   normalization offsets, world/island anchor, tree root, sockets, mature footprint and painter slots
   are complete; all URLs are local; every frame shares the planted coordinate system.
9. **Progress, navigation and reduced motion select one deterministic track.** _(witness: machine)_
   _(proof-gate: app-surface#gate-5)_ Exercise boundary progress values plus repeated Next, Back and
   Replay traces in full and reduced motion. **Success —** equal cue/progress selects equal frame and
   anchor; reduced motion immediately chooses the equivalent settled frame; the mature island is the
   retained product scene; no timer, random value, remount or asset clock affects output.
10. **The real consumer preserves the clean route and has no runtime PixelLab dependency.**
    _(witness: machine)_(proof-gate: app-surface#gate-6)_ Exercise clean, near-miss and exact witness
    queries while auditing source, dependencies and representative requests. **Success —** only the
    exact flag mounts one public product player/mapper; ordinary Studio remains unchanged; every frame
    comes from the local app-surface asset set; no PixelLab client, hostname, credential or runtime
    model call exists.
11. **The hosted deep-link is viewable and stays inside its recorded browser budget.**
    _(witness: machine)_ Open the deployed real-app witness at representative desktop and mobile
    viewports and capture its request/decode/frame-pacing evidence. **Success —** the URL serves the
    real app, the complete island and controls remain visible, compressed/decode memory and frame
    pacing are recorded against the declared budget, no vendor request occurs, and supporting
    screenshots or inspection export identify the witnessed commit. This machine-observable leg is
    separate from the owner-held LOOK judgment in leg 4.

## Reliability Gates

1. **The shared world-view suite is green** _(gate: observe)_
   _(covers: app-surface-world-view)_
   `pnpm --filter @storytree/app-surface test`.
2. **The Studio adoption suite is green** _(gate: observe)_
   _(covers: studio-app-surface-adapter)_
   `pnpm --filter studio test`.
3. **The semantic-growth replay suite is green** _(gate: observe)_
   _(covers: semantic-growth-replay-view)_
   `pnpm --filter @storytree/app-surface test`.
4. **The query-gated Studio witness-host suite is green** _(gate: observe)_
   _(covers: semantic-growth-studio-demo)_
   `pnpm --filter studio test`.
5. **The registered full-island track suite is green** _(gate: observe)_
   _(covers: pixellab-island-growth-track)_
   `pnpm --filter @storytree/app-surface test`.
6. **The real-consumer witness and clean-route suite is green** _(gate: observe)_
   _(covers: pixellab-island-growth-app-witness)_
   `pnpm --filter studio test`.

The combined operator-held scene/motion leg stays separate. `healthy` remains derived from signed
evidence; authored status stays `proposed`.

## Ready successors

Once this story is green, the explicit successors are:

1. **Complete ADR-0237's presentation extraction:** migrate the real legend, inspector, chat
   presentation, camera shell/controller boundary, bulk product CSS and remaining Studio chrome into
   the shared package without recreating them.
2. **Add the Chapter 2 read-only controller and artifact rail:** supply staged fictional frames,
   visitor-paced intent and semantic camera targets, sync the shared artifact into the web boundary,
   then retire website-local Chapter 2 product UI/rendering/animation.
3. **Adopt, bound or reject the PixelLab technique after the hosted verdict:** observed full-island
   gaps define any finite follow-on; replacements stay behind the same registered semantic slots and
   capability-count mapping never expands into a sheet-per-count family.

Every successor reuses this world view, semantic motion, current Storybook assets and Vector
fallback. None may add a website-local renderer, product animation fork or privileged live data.
