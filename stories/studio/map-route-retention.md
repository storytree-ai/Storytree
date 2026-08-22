---
id: "map-route-retention"
tier: capability
story: studio
arc: studio-map-responsiveness-arc
title: "A live forest map survives SPA route changes"
outcome: "An operator returns to the same live forest map after a SPA hash-route transition."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [240]
# BROWNFIELD R1: RouteView currently emits TreeView only for a tree route, so another hash route
# unmounts it. AUTHOR_TEST first proves the App-level lifetime and safe parking; IMPLEMENT changes
# only the existing App/CSS composition, not TreeView or the hash router.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/App.route-retention.test.tsx", "apps/desktop/e2e/session-survival.e2e.mjs", "packages/cli/src/node-build.test.ts"]
    sourceGlobs: ["apps/studio/src/App.tsx", "apps/studio/src/index.css"]
  real:
    testFile: "apps/studio/src/App.route-retention.test.tsx"
    sourceFile: "apps/studio/src/App.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/App.route-retention.test.tsx", "apps/desktop/e2e/session-survival.e2e.mjs", "packages/cli/src/node-build.test.ts"]
      sourceGlobs: ["apps/studio/src/App.tsx", "apps/studio/src/index.css"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The focused App proof is Vitest + jsdom. The Electron companion separately observes the real pty bridge.
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/App.route-retention.test.tsx"
---

# A live forest map survives SPA route changes

**Outcome —** An operator returns to the same live forest map after a SPA hash-route transition.

## Why this is one capability

The journey is one return: enter the forest, leave through an ordinary Studio hash route, and return
without paying for a new map or losing the live interaction state. Retaining the first map instance,
making it inert while another route is current, and restoring its existing full-bleed viewport are
parts of that one observable return. Splitting them would leave either an interactive hidden world or
a retained map whose geometry changes on re-entry.

This is ADR-0240 decision 2's first behaviour-preserving stage only: retain an already-open map across
SPA routes. It is App-level composition around the existing `TreeView`; it does not change TreeView's
controller, the hash router, terminal ownership, or the existing `studio → app-surface` package seam.
Shared use or sequencing alone creates no `depends_on` edge.

## Guidance

- **Stay lazy until a map is requested.** A cold non-tree deep link must render its document, asset,
  editor, or Members surface without mounting or fetching the forest behind it. The first `#/tree` or
  `#/tree/<focus>` route creates the map; a cold tree deep link retains the router's current focus
  semantics. After that first tree route, non-tree routes park the same instance rather than destroy it.
- **Retain live state, not a screenshot.** A route change alone must not issue another tree request,
  rebuild the world/scene, or reset the camera. The world, camera transform, open map affordances, and
  terminal dock/session presentation are the same live instance when the operator returns. This does
  not give the App ownership of terminal sessions; it only removes the route-driven presentation teardown.
- **Park safely without collapsing geometry.** On a non-tree route, the retained map is visually
  hidden, absent from the accessibility tree and sequential focus order, and unable to receive pointer,
  wheel, keyboard, or focus input. Parking is a visibility/input change, never a layout disappearance:
  its stable app-stage layer keeps the world and terminal viewport dimensions nonzero and stable while
  hidden.
  In particular, it must not use a geometry-collapsing `display: none` state that makes the live pty
  refit to a 2×1 terminal. Visual concealment alone is insufficient: a parked world must not intercept
  input, expose stale SVG controls to assistive technology, or change the retained viewport's measure.
- **Restore real map geometry.** On a tree route, the active map keeps the existing full-bleed viewport:
  edge-to-edge content with no document padding ring, scrolling container, or HUD headroom changing the
  world frame's measured geometry. Parking does not collapse that live geometry before reactivation;
  non-tree routes retain their ordinary layout and HUD clearance.
- **Keep the implementation boundary small.** The only implementation surface is
  `apps/studio/src/App.tsx` plus `apps/studio/src/index.css`. Any local composition that meets these
  lifetime, accessibility, and geometry contracts is valid, provided the parked live layer remains in a
  stable app-stage and keeps its dimensions; it must not become a viewport-fixed overlay or a collapsed
  layout. No storage mechanism is prescribed.
- **Prove the App composition.** Add `apps/studio/src/App.route-retention.test.tsx`, mounting the real
  App with controlled Studio API responses and hash changes. Its test titles carry every contract id
  below. Keep `apps/desktop/e2e/session-survival.e2e.mjs` as the real Electron companion: update it only
  where its old expectation requires TreeView/dock detachment, while retaining its proof that the same
  pty session and scrollback survive the route change. In that Electron walk, record the live terminal
  body's nonzero dimensions before parking and require exactly stable nonzero dimensions while parked,
  so a hidden route cannot silently refit the live pty to 2×1. *(This read: keep the generic real-build
  catalog companion `packages/cli/src/node-build.test.ts` in lockstep so its exact buildable-capability
  catalog includes `map-route-retention`, calling that catalog assertion discoverability regression
  evidence. That is now false: ADR-0341 D4 replaced the hand-maintained catalogue with one DERIVED from the
  specs on disk, so authoring this spec IS the registration and there is no list to append to. The file
  stays in `scope.testGlobs`/`real.scope.testGlobs` for the derivation test itself, which is unaffected.
  Corrected in place per ADR-0139.)*

## Integration test

1. Start the real App on a non-tree hash deep link with controlled membership/corpus responses. Assert
   the routed surface renders while no TreeView instance or tree request exists.
2. Navigate to a focused tree hash. Assert the first and only map instance mounts, performs its one
   tree load, retains the existing focus path, and presents the full-bleed world viewport.
3. Establish observable live map state, then navigate to a document or Members hash without reload.
   Assert the current route renders normally while the map stays mounted but is hidden, non-interactive,
   inaccessible to focus and assistive technology, and dimensionally stable rather than layout-collapsed.
4. Return to a tree hash. Assert the same map instance and live world/camera state return without a
   second tree request or reconstructed world, and its active viewport is again full-bleed.
5. In the Electron companion, record the visible terminal body's nonzero bounds, then run the existing
   terminal route-away-and-back walk. Assert its hidden parked bounds remain exactly stable and nonzero
   (never the 2×1 pty refit caused by a collapsed layout), and that the original session and scrollback
   remain available without a duplicate spawn.
6. Run the generic real-build catalog regression and assert its exact buildable-capability catalog names
   `map-route-retention`; this keeps the authored capability visible to the real-build path.

## Contracts

1. **`map-route-retention-stays-lazy-for-hash-deep-links`**
   - **asserts —** a cold non-tree deep link renders its routed surface without mounting or fetching the
     map; a cold `#/tree` or `#/tree/<focus>` deep link mounts the first map only when that route is
     current and preserves the existing focus meaning.
2. **`map-route-retention-keeps-one-live-tree-instance`**
   - **asserts —** after the first tree entry, a tree → non-tree → tree SPA transition retains one
     TreeView instance and does not issue another tree load or rebuild the forest solely because the
     hash changed.
3. **`map-route-retention-restores-live-world-and-terminal-state`**
   - **asserts —** returning to the tree exposes the retained camera/world state and the same terminal
     session presentation; the Electron regression observes original pty scrollback without a duplicate
     session spawn.
4. **`map-route-retention-parks-the-map-outside-input-and-a11y`**
   - **asserts —** while a non-tree route is current, the retained map is visually and semantically
     hidden, cannot receive pointer/wheel/keyboard input, and cannot be reached by sequential focus;
     the current routed surface is the sole interactive content.
5. **`map-route-retention-parking-preserves-live-geometry`**
   - **asserts —** parking leaves the live map and terminal viewport in a stable app-stage with a
     nonzero, dimensionally stable layout. The Electron companion compares the terminal body's pre-park
     bounds with its parked bounds and rejects a geometry collapse that would refit the live pty to 2×1.
6. **`map-route-retention-reactivates-the-full-bleed-world`**
   - **asserts —** an active tree route restores the existing edge-to-edge world-frame geometry without
     a padding ring, document scroll container, or fixed-HUD offset altering the map viewport, while
     non-tree routes retain their normal layout.

## Explicitly outside this increment

- Client payload caching or persistence, stale-paint reconciliation, version stamps, local storage,
  service workers, cache headers, ETags, server memoization, or server-side invalidation.
- Boot de-serialisation or changes to the membership/corpus load gate; the first map starts only under
  the current honest boot conditions.
- Polling, activity, revalidation, or pause/resume policy while the map is parked.
- Any change to TreeView, the hash-router parser, terminal-session ownership, server APIs, or the shared
  `@storytree/app-surface` scene model.
- LOD, density, culling, scene-graph redesign, SVG/Canvas/WebGL renderer choices, visual-performance
  claims, or owner-visible world-detail decisions. ADR-0240 deliberately sequences those later.
