---
id: "app-surface"
tier: story
title: "The shared app surface — Studio's real forest scene and semantic island growth"
outcome: "Studio renders its real forest through `@storytree/app-surface` and can stage a deterministic six-state island-growth replay whose normal-motion and reduced-motion modes reach identical honest semantic states with the current Storybook and Vector art policy intact."
status: proposed
proof_mode: UAT
# Mixed witness: deterministic model/view, Studio adoption, art/selector parity, semantic replay,
# stylesheet loading, reduced-motion equivalence and the query-gated host are machine legs. The
# visible scene/motion verdict remains operator-attested under ADR-0070.
arc: chapter2-real-app-surface-arc
capabilities: [app-surface-world-view, studio-app-surface-adapter, semantic-growth-replay-view, semantic-growth-studio-demo]
# The framework-bearing package sits immediately above @storytree/forest-world and imports it.
# Studio's consuming-surface edge is declared consumer-side in stories/studio/story.md.
depends_on: [forest-world]
consumed_by: []
decisions: [237, 93, 213, 215, 230, 70]
---

# The shared app surface — Studio's real forest scene and semantic island growth

**Outcome —** Studio renders its real forest through `@storytree/app-surface` and can stage a
deterministic six-state island-growth replay whose normal-motion and reduced-motion modes reach
identical honest semantic states with the current Storybook and Vector art policy intact.

This story carries the landed extraction increment of `chapter2-real-app-surface-arc` plus its
owner-directed next increment: the real Studio scene first crossed the shared package boundary,
then that same package grows the reusable semantic island behaviour Chapter 2 will later drive. It
still does **not** claim
ADR-0237's whole app surface: `WorldLegend`, inspector/detail presentation, `ChatPanel`, the camera
shell/controller, bulk `TreeView` chrome/layout and bulk product CSS remain Studio-owned.

## Journey and split

The consumer is the Studio operator. Open the existing forest map and find the same world scene,
sprite policy and existing arrival/trail behaviour supplied through the shared package rather than
privately rendered by `apps/studio`; then open the explicit witness flag and walk that same product
surface through:

`empty → land → proposed story → claimed/presence → signed proof → healthy`.

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
- **No new art or downstream controller.** Reuse the current Storybook assets, Vector fallback and
  existing transforms. Production art, website-local UI/rendering/animation, artifact sync, Chapter
  2 pacing/controller work and broader chrome extraction remain out.

## Capabilities

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`app-surface-world-view`](app-surface-world-view.md) | A deterministic typed world model/events seam and the real React scene mapper, sprite policy and existing trail/arrival selectors live in the shared package. | — |
| 2 | [`studio-app-surface-adapter`](studio-app-surface-adapter.md) | `TreeView` folds its existing world state/actions into the shared model and mounts the shared world view while surrounding product UI stays in Studio. | `app-surface-world-view` |
| 3 | [`semantic-growth-replay-view`](semantic-growth-replay-view.md) | The shared view plays the six supplied semantic frames with deterministic Next/Back/Replay and app-owned normal/reduced motion. | `studio-app-surface-adapter` |
| 4 | [`semantic-growth-studio-demo`](semantic-growth-studio-demo.md) | An explicit Studio query flag mounts one representative six-frame fixture and its controls solely to stage the operator witness. | `semantic-growth-replay-view` |

Dependency graph: `app-surface-world-view → studio-app-surface-adapter →
semantic-growth-replay-view → semantic-growth-studio-demo`.

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

**Goal —** Studio shows the same forest scene through the shared world package and stages one
deterministic, reversible six-state island-growth walk whose reduced-motion rendering preserves the
same honest semantic states.

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
4. **The hosted Studio scene and six transitions read as one coherent product surface.**
   _(witness: human)(detail: app-surface#uat-4)_ Stand up and verify the clean forest-map deep-link plus
   `?semanticGrowth=demo#/tree`. Walk the default Storybook scene, select a story and observe its
   existing arrival/trail treatment; then walk forward, Back and Replay through all six demo states,
   sample `?semanticGrowth=demo&artStyle=vector#/tree`, and enable the operating-system
   reduced-motion setting. **Success —** the operator judges the original shared scene visually
   unregressed; transform/opacity movement is legible; claim/proof/healthy changes are honest;
   replay is coherent; reduced motion is calm without losing a state. The no-duplicate-renderer,
   art-resolution and exact-state claims remain compiled sibling legs 2, 3 and 5–7 rather than being
   laundered into the human judgment. Surrounding chrome is not migrated or re-attested; an agent
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
3. **Source or author production art only after witnessing this shared iteration:** observed gaps
   define the art brief; replacements stay behind the same manifest/semantic slots.

Every successor reuses this world view, semantic motion, current Storybook assets and Vector
fallback. None may add a website-local renderer, product animation fork or privileged live data.
