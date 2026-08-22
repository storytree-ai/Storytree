---
id: "app-surface-world-view"
tier: capability
story: app-surface
arc: chapter2-real-app-surface-arc
title: "A deterministic typed world model delegates to the real shared SceneView"
outcome: "A compact `WorldSceneView` accepts a deterministic typed `WorldPresentationModel` plus separate optional `WorldPresentationEvents`, derives the relocated SceneView context without live authority, and delegates the representative semantic scene and event callbacks to the already-green shared renderer."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [237, 93, 230, 70]
# NET-NEW missing seam only. AUTHOR_TEST writes WorldSceneView.test.tsx against the missing wrapper;
# IMPLEMENT authors WorldSceneView.tsx. SceneView, sprite manifest/resolver/sizing/fallback and
# trail/arrival selectors are ALREADY relocated with 103 green package tests. They remain the
# package proofCommand's reliability regression evidence, not behaviours this test must recreate.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/app-surface", "test"]
  scope:
    testGlobs: ["packages/app-surface/src/WorldSceneView.test.tsx"]
    sourceGlobs: ["packages/app-surface/src/WorldSceneView.tsx"]
  # ADR-0353 — the READ-ONLY coverage surface: where THIS capability's contract tests actually live.
  # The `real:` arm below is the WRITE fence for the one net-new wrapper leaf (WorldSceneView), which
  # is why contract 4 — the §5 honesty wall on the ALREADY-RELOCATED shared `SceneView` this wrapper
  # delegates to — cannot live inside it. `SceneView.test.tsx` is part of the 103 green package tests
  # the `proofCommand` above already reruns as regression evidence; this block is only what lets the
  # sweep LOOK there. Declaring it widens the aperture; it moves no write fence and adds no leaf.
  coverage:
    testGlobs:
      - "packages/app-surface/src/SceneView.test.tsx"
  real:
    testFile: "packages/app-surface/src/WorldSceneView.test.tsx"
    sourceFile: "packages/app-surface/src/WorldSceneView.tsx"
    scope:
      testGlobs: ["packages/app-surface/src/WorldSceneView.test.tsx"]
      sourceGlobs: ["packages/app-surface/src/WorldSceneView.tsx"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/app-surface", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/app-surface", "typecheck"]
---

# A deterministic typed world model delegates to the real shared SceneView

**Outcome —** A compact `WorldSceneView` accepts a deterministic typed
`WorldPresentationModel` plus separate optional `WorldPresentationEvents`, derives the relocated
`SceneView` context without live authority, and delegates the representative semantic scene and
event callbacks to the already-green shared renderer.

## Proof status and boundary

The first real-build attempts proved the original authored leaf was too broad: Codex reached a
genuine `CONFIRM_GREEN` red, while Claude exhausted 16 turns trying to author one oversized test.
The infrastructure beneath the missing seam is already present and independently green:
`SceneView`, sprite manifest/resolver/sizing/fallback, and `trailRevealPlan` /
`arrivalGrowPlan` have **103 passing package tests**.

This leaf therefore authors only the missing typed wrapper. The package proof command reruns those
103 tests as regression evidence after the new pair greens; `WorldSceneView.test.tsx` does not copy
their fixture matrix or re-prove every sprite, sizing, trail and arrival contract.

## Guidance

- Define one plain-data `WorldPresentationModel` containing exactly:
  - the `SceneNode` scene;
  - selected and emphasized story ids;
  - hidden statuses;
  - arrival ids;
  - the existing trail reveal plan;
  - the resolved sprite sheet; and
  - art scale.
- Normalize set-like inputs deterministically: stable, duplicate-free ids/statuses and stable
  defaults. Equal plain inputs must yield deeply equal models. Time and randomness are absent.
- Define `WorldPresentationEvents` separately. Its selection callbacks are optional so the same
  wrapper admits Studio's operable controller and a later Chapter 2 read-only controller without a
  fake mutation.
- `WorldSceneView` translates that model/events pair into the existing `SceneCtx`, then renders the
  already-relocated `SceneView`. It does not reproduce `renderNode`, sprite resolution/sizing,
  trail/arrival selection or any other renderer logic.
- The source imports only public browser-safe seams from this package and
  `@storytree/forest-world`. It imports no `apps/studio` module, API/store client, subscription,
  promise, clock, random source or DOM animation authority.
- Keep the story boundary unchanged: legend, inspector, chat, camera shell/controller, bulk CSS,
  six-state replay and reduced-motion visual proof remain later increments.

## Integration test

One compact `WorldSceneView.test.tsx` proves the missing seam:

1. Build the model twice from equal plain inputs, including unordered/duplicated set-like values.
   Assert deeply equal normalized output and stable defaults.
2. Render one representative semantic scene through `WorldSceneView`. Assert one existing semantic
   scene marker survives delegation, then activate one selectable node and assert the optional
   event callback receives its id.
3. Inspect/import the wrapper source boundary and assert it has no Studio-private or live-authority
   import. The package proof command then observes the existing 103 renderer/sprite/sizing/trail
   tests still green.

## Contracts (4)

1. **`aswv-equal-plain-inputs-normalize-deterministically`**
   - **asserts —** equal scene/model inputs normalize to deeply equal output; selected/emphasized
     ids, hidden statuses and arrival ids are stable and duplicate-free, with deterministic defaults.
2. **`aswv-delegates-one-semantic-scene-and-event`**
   - **asserts —** `WorldSceneView` preserves one representative semantic marker from the relocated
     `SceneView`, and a selectable node reports its id through the separate optional events seam.
3. **`aswv-wrapper-has-no-private-or-live-authority`**
   - **asserts —** `WorldSceneView.tsx` imports no Studio-private module or network/store/
     subscription/clock authority and contains no duplicate scene/sprite/trail renderer.
4. **`aswv-claim-wisp-never-painted-as-proven-green`** — the shared `SceneView` this wrapper delegates
   to never paints a CLAIM as the proven-green bloom: no bloom or verdict class reaches any claim-family
   wisp, in any grade, on departure, or under a green build band (the ADR-0138 §5 honesty wall, at the
   rendered-DOM tier)
   - **asserts —** rendering through the real `SceneView` and querying the produced DOM, in three
     directions. **(a) Class-level:** a `proving` claim renders `.world-claim-wisp.state-proving` which
     itself carries neither `world-bloom` nor `verdict-pass`, and whose subtree contains no
     `.world-bloom`, no `.bloom-ring` / `.bloom-spark` / `.bloom-crown` / `.bloom-plant`, and no
     `.verdict-pass` — `proving` being the at-risk in-flight hue that must not read as the proven-green
     bloom (ADR-0045). **(b) Under a GREEN band (ADR-0212):** a `work` claim folded with phase `GATE`
     renders `.world-claim-wisp.band-green` that STILL carries `state-proving` (the intent hue survives;
     green is expressed as motion, never as colour), whose own class attribute matches neither `bloom`
     nor `verdict`, and whose subtree holds no `.world-bloom` and no `[class*="verdict-"]`. **(c) Across
     the whole claim family (ADR-0200 D7):** the hover (`exploring`), queue (`waiting`) and departing
     wisps each carry neither `world-bloom` nor `verdict-pass`, and the hover and departing subtrees
     hold no bloom-part class. One-directional by design: the CONVERSE (a bloom reaching for claim
     styling) is not this contract's claim and remains uncovered here.
   - **covers —** `packages/app-surface/src/SceneView.tsx` (the claim / hover / queue / departing wisp
     renderers) — the already-relocated shared renderer this capability's wrapper delegates to, not the
     wrapper itself.
   - **proven by —** `packages/app-surface/src/SceneView.test.tsx` — three tests, one per direction:
     *"§5 HONESTY WALL: a claim wisp is NEVER painted as the proven-green bloom (class-level)"*,
     *"ADR-0212 honesty wall: a GREEN build band never paints the claim body as a proof"*, and
     *"§5 HONESTY WALL extended: hover / queue / departing wisps never carry bloom/verdict classes
     (ADR-0200 D7)"*. All three sit in the 103 already-green package tests the declared
     `pnpm --filter @storytree/app-surface test` command reruns, and are reached by the ADR-0353 sweep
     via the `proof.coverage.testGlobs` surface declared above, since the `real:` arm's write fence is
     the net-new `WorldSceneView` leaf.
   - **note — declared for CITATION, on the capability that already stands for the shared renderer.**
     This contract exists so a lower-tier citation of the wall (the ADR-0294 D2 deletion of
     `wisp-as-story-claim#uat-7`) can name a contract id instead of a free-form test title. It is
     declared here because this story already treats `app-surface-world-view` as the node standing for
     the relocated shared `SceneView` — the story's own legacy-UAT table routes `SceneView.test.tsx`
     under this capability — and because no other `app-surface` capability owns the renderer (the three
     that name `SceneView.test.tsx` in their globs own the organic-growth tracks and the SVG land, not
     the claim layer). It adds no leaf and moves no write fence: the tests are standing, green, and
     older than this declaration. Unlike contracts 1–3 it carries `covers —` / `proven by —` bullets,
     the render-core house shape, because a citation is only resolvable if the binding is written down.
