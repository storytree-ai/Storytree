---
id: "app-surface"
tier: story
title: "The shared world scene — Studio's real forest renderer crosses the app-surface seam"
outcome: "Studio's TreeView renders its existing forest scene through one framework-bearing `@storytree/app-surface` world view over a deterministic typed world-presentation model and event callbacks, reusing the real React scene mapper, sprite manifest/resolver/sizing/fallback and current trail/arrival selectors while Storybook remains default and Vector remains the fallback."
status: proposed
proof_mode: UAT
# Mixed witness: deterministic model/view, Studio adoption, art policy and existing selector parity
# are machine legs; the final visual-parity regression remains operator-attested under ADR-0070.
#
# RE-ADJUDICATED 2026-07-26 (ADR-0209 D8 — see `## UAT Test Criteria`). The tags are UNCHANGED at
# 3 machine (legs 1–3) / 1 human (leg 4); leg 4 was tested against
# `human-witness-is-a-judgment-gap-not-cost` rather than inherited, and stays human on the
# NO-COMPILER basis alone (an ADR-0070 stage-2 appearance verdict has no oracle). ZERO splits: the
# one compiled rider leg 4 also asserted — "no duplicate/placeholder renderer" — already has a
# machine leg here (leg 2), so leg 4 now references its sibling instead of restating it. Two facts
# corrected in this pass, neither visible from the witness tags: (a) leg 2's walk overstated what
# gate-2 observes today, and 3 of `studio-app-surface-adapter`'s 4 declared contracts have no
# test-name binding — recorded as a coverage gap, NOT repaired (ADR-0097 §2); (b) `app-surface#uat-4`
# already carries an operator-attested `fail` in `events.verdict` that was signed against a DIFFERENT,
# broader leg 4 on an unmerged branch — see the leg's RECORD note. Nothing here goes green and the
# owner signs nothing; per ADR-0209 §6 a tag records which witness is RIGHT, never that a proof exists.
#
# STORE/DISK DIVERGENCE, recorded 2026-07-25/26: `events.verdict` holds `app-surface#gate-1..gate-4`
# and `#uat-1,2,3,5,6,7` (adopted, spine-signed) — a SEVEN-leg / FOUR-gate shape that exists only on
# the unmerged branch `claude/app-surface-f0e166` (commit 9377e897). This authored story carries FOUR
# legs and TWO gates. Leg ids are positional, so store rows and this file are not interchangeable.
arc: chapter2-real-app-surface-arc
capabilities: [app-surface-world-view, studio-app-surface-adapter]
# The framework-bearing package sits immediately above @storytree/forest-world and imports it.
# Studio's consuming-surface edge is declared consumer-side in stories/studio/story.md.
depends_on: [forest-world]
consumed_by: []
decisions: [237, 93, 213, 215, 230, 70]
---

# The shared world scene — Studio's real forest renderer crosses the app-surface seam

**Outcome —** Studio's `TreeView` renders its existing forest scene through one framework-bearing
`@storytree/app-surface` world view over a deterministic typed world-presentation model and event
callbacks, reusing the real React scene mapper, sprite manifest/resolver/sizing/fallback and current
trail/arrival selectors while Storybook remains default and Vector remains the fallback.

This is the infrastructure-first minimum of `chapter2-real-app-surface-arc`. It establishes the
first real product-presentation seam Chapter 2 will later consume. It does **not** claim ADR-0237's
whole app surface: `WorldLegend`, inspector/detail presentation, `ChatPanel`, the camera
shell/controller, bulk `TreeView` chrome/layout and bulk product CSS remain Studio-owned.

## Journey and split

The consumer is the Studio operator. Open the existing forest map and find the same world scene,
sprite policy and existing arrival/trail behaviour, now supplied through the shared package rather
than privately rendered by `apps/studio`. Typed world model → shared world view → TreeView adoption
shares one precondition (the same world fixture/live fold) and one observable (the scene and its
world-event callbacks), so it is one story.

The six-state island sequence is a different journey and proof observable:

`empty → land → proposed story → claimed/presence → signed proof → healthy`.

It adds deterministic replay, shared new motion, reduced-motion equivalence and a visible-motion
operator witness. That successor depends on this typed world seam. Combining it here would make the
minimum extraction carry a second motion/LOOK proof, so the splitting rule fires. The existing
`trailRevealPlan` / `arrivalGrowPlan` selectors move now only because the existing `SceneView`
already consumes them; this story does not broaden or reinterpret them.

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
- **No new island animation.** Existing arrival/trail selector behaviour stays. Six-state replay,
  new product motion, reduced-motion visual treatment, Chapter 2 timing and production art are out.

## Capabilities

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`app-surface-world-view`](app-surface-world-view.md) | A deterministic typed world model/events seam and the real React scene mapper, sprite policy and existing trail/arrival selectors live in the shared package. | — |
| 2 | [`studio-app-surface-adapter`](studio-app-surface-adapter.md) | `TreeView` folds its existing world state/actions into the shared model and mounts the shared world view while surrounding product UI stays in Studio. | `app-surface-world-view` |

Dependency graph: `app-surface-world-view → studio-app-surface-adapter`.

The model and view remain one deep package capability: the model is the view's narrow interface,
not an independent consumer journey. Studio adoption is a second leaf because it has its own
isolatable integration red→green in the `apps/studio` host.

## Ownership and scaffold

Before the first leaf, scaffold `packages/app-surface` and register
`repo-manifest.json` ownership (`app-surface → app-surface`). It depends on
`@storytree/forest-world` and the minimum React/browser dependencies. Package metadata, test tooling
and manifest/root registration are orchestrator glue.

The adapter is deliberately hosted in `apps/studio`; register that hosted seam. `TreeView` retains
Studio effects, camera/controller state and live actions while importing the public shared view.
The real consuming edge is declared by `studio.depends_on: [app-surface]`.

## UAT Test Criteria

**Goal —** Studio shows the same forest scene through the shared world package, with deterministic
controller/view separation and existing sprite/arrival/trail policy intact.

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
4. **The hosted Studio world scene has not visually regressed.**
   _(witness: human)(detail: app-surface#uat-4)_ Stand up a verified forest-map deep-link — staging,
   not the reason this leg is human. Walk the default Storybook scene, select a story and observe the
   existing arrival/trail treatment, then repeat with `?artStyle=vector`. **Success —** the world
   scene READS as the same owner-attested Studio scene it did before the renderer moved out of
   `apps/studio`. Surrounding chrome is not migrated or re-attested here. *(Re-adjudicated 2026-07-26,
   ADR-0209 D8. HUMAN on the **NO-COMPILER** basis and that basis alone: whether a re-hosted renderer
   still LOOKS like the scene the owner already attested is an ADR-0070 stage-2 appearance verdict
   with no oracle — not spend, not liveness, not a native-shell or missing-harness gap, none of which
   would keep a leg on this rung. NARROWED: "with no duplicate/placeholder renderer" was REMOVED from
   the success condition. That half compiles and is already leg 2's ("retains no second private scene
   mapper"), asserted by `asa-treeview-mounts-one-shared-world-view`
   (`apps/studio/src/components/TreeViewShell.test.tsx:68`), so this leg points at its sibling instead
   of restating it — restating a compiled fact here would launder it into an owner's signature. No
   split was minted for the same reason. The `?artStyle=vector` repeat likewise asks only how the
   Vector scene LOOKS; that its art resolution/fallback RESOLVES correctly is leg 3's compiled claim.)*
   *(RECORD — signed state, checked 2026-07-26 and deliberately left untouched: `app-surface#uat-4`
   ALREADY carries an operator-attested verdict in `events.verdict` — outcome `fail`, signer
   `hua.mick@gmail.com`, `2026-07-25T14:43:09Z`, commit `9377e897`, no note. It was **not** signed
   against the walk above. At `9377e897` — the unmerged branch `claude/app-surface-f0e166` — this story
   carried SEVEN legs and `#uat-4` was a FUSED scene + six-state-motion + Back/Replay + reduced-motion
   leg. Leg ids are positional and the store keys on `unit_id`, so that row now reads as an owner fail
   against this narrower leg, which the owner never walked in this form. This pass changed no store
   state. A fresh signature is required, and it must be taken against THIS text.)*

## Reliability Gates

1. **The shared world-view suite is green** _(gate: observe)_
   _(covers: app-surface-world-view)_
   `pnpm --filter @storytree/app-surface test`.
2. **The Studio adoption suite is green** _(gate: observe)_
   _(covers: studio-app-surface-adapter)_
   `pnpm --filter studio test`.

The operator-held parity leg stays separate. `healthy` remains derived from signed evidence; authored
status stays `proposed`.

## Ready successors

Once this story is green, the arc has two explicit successor journeys:

1. **Complete ADR-0237's presentation extraction** with `depends_on: [app-surface]`: migrate the
   real legend, inspector, chat presentation, camera shell/controller boundary, bulk product CSS and
   remaining Studio chrome into the shared package without recreating them.
2. **Prove semantic island growth on the shared world view** with `depends_on: [app-surface]`: drive
   all six semantic states, make replay deterministic, prove reduced motion reaches the same states
   without spatial travel, and stage the operator-held visible-motion witness.

Both must reuse this world view, current Storybook assets and Vector fallback. Neither may add a
website-local renderer or final production art. Artifact sync and the Chapter 2 read-only controller
follow when the shared surface slice they require exists.
