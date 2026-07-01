---
id: "review-mode-toggle"
tier: capability
story: library-review
title: "A View ↔ Review mode switch that turns commenting and suggesting on"
outcome: "The studio renders a View ↔ Review mode switch (a word-processor-style toggle) on a library topic: View is the read posture (no commenting/suggesting affordances); flipping to Review turns ON the commenting + suggesting affordances. The toggle's state drives whether the Review affordances are shown — proven by behaviour, the appearance operator-attested."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone). NET-NEW (no editsExisting): the leaf authors a vitest
# jsdom component test importing a NOT-YET-EXISTING component from a NEW source file under
# apps/studio/src/components (red = module-not-found at HEAD), then writes that one component (green).
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the GEOMETRY/BEHAVIOUR ONLY (View is
# read-only; flipping to Review exposes the commenting+suggesting affordances; the mode state toggles) —
# the toggle's APPEARANCE (does it read as a word-processor mode switch) is the story's operator-attested
# UAT leg 1 (the look is witnessed, never a machine visual verdict; do NOT add a visual assertion here).
#
# CRITICAL — apps/studio is VITEST + jsdom (@testing-library/react), NOT node:test. The default
# `node --test` real proof cannot run a `.test.tsx`. So this cap declares a `real.proofCommand` running
# the ONE test file under vitest (cwd = apps/studio). install: true (fresh-worktree tsx + tsc + vitest,
# ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio/src (a studio frontend component).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/ReviewToggle.test.tsx"
    sourceFile: "apps/studio/src/components/ReviewToggle.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/ReviewToggle.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/ReviewToggle.tsx"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is vitest (jsdom), not node:test — run the ONE test file under vitest.
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/ReviewToggle.test.tsx"
---

# A View ↔ Review mode switch that turns commenting and suggesting on

**Outcome —** The studio renders a View ↔ Review mode switch (a word-processor-style toggle) on a
library topic: View is the read posture (no commenting/suggesting affordances); flipping to Review
turns ON the commenting + suggesting affordances. The toggle's state drives whether the Review
affordances are shown — proven by behaviour, the appearance operator-attested.

**Depends on —** nothing (within `library-review`). The toggle is a self-contained behavioural
component whose state (View vs Review) is the signal the comment-thread + suggestion surfaces (caps 7,
8) read to decide whether to show their affordances. It holds no backend seam of its own.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. There is no mode switch
> today (the studio always shows the right-panel comment form in `CommentPanel.tsx`). This capability
> adds the View ↔ Review toggle and the mode state it exposes. Its appearance inside the studio is the
> story's operator-attested UAT leg 1 (ADR-0070 — the look is witnessed, never a machine visual verdict).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the TOGGLE AS A WHOLE — a behavioural
React component that holds a two-state mode (View / Review), renders the switch, and exposes the mode so
the surrounding surface shows or hides the commenting + suggesting affordances — spanning the switch
render, the state transition, and the affordance-gating signal, exercised in jsdom, not a single
isolated assertion. It is the MODE half of the word-processor model; the affordances it gates are caps
7 (`inline-comment-thread`) and 8 (`collapsed-suggestion-view`).

THE MODE MODEL (the word-processor switch — ADR-0140). Two states: **View** (the read posture — the
document renders, no commenting/suggesting affordances) and **Review** (commenting + suggesting turned
on). The toggle defaults to View (reading is the common case). Flipping to Review exposes the
affordances; flipping back to View hides them. This mirrors a word processor's mode switch — the user
deliberately enters the collaboration posture.

THE TOGGLE GATES, IT DOES NOT IMPLEMENT (the seam to caps 7/8). The toggle's job is the MODE STATE and
the switch UI. WHETHER a comment thread renders in-flow (cap 7) or a suggestion shows its controls (cap
8) is THOSE caps' job — they read the mode (a prop / a small context the toggle owns) and gate their
affordances on it. This cap proves "View hides the affordances, Review shows them" at the toggle's
surface (the affordance presence is observable via a rendered marker / the children it gates); the
affordances' own behaviour is proven in caps 7/8.

THE TWO-STAGE PROOF (frontend-builder, ADR-0070). This `real:` arm proves the GEOMETRY/BEHAVIOUR ONLY —
the toggle renders, flips View↔Review, and gates the affordances — over jsdom on fake timers. The
toggle's APPEARANCE (does it read as a clean word-processor mode switch, ADR-0113 §9) is the story's
operator-attested UAT leg 1 — witnessed by the owner, NEVER a machine visual verdict here. Do NOT author
a visual/appearance assertion in this cap's tests.

OFFLINE-TESTABLE IN JSDOM (the `BuildSection.test.tsx` / chat-panel discipline). `@vitest-environment
jsdom`, `@testing-library/react` for render/`fireEvent`. No backend seam to mock (the toggle holds no
`api` call) — the test renders the toggle, asserts the default View posture, fires the switch, and
asserts the Review affordances become visible (and hide again on flip-back). No real `fetch`, no socket,
no DB, no Electron.

## Integration test

**Goal —** Prove that the mode toggle defaults to View (no commenting/suggesting affordances shown),
flips to Review on the switch (the affordances appear), and flips back to View (the affordances hide) —
entirely in jsdom, no backend.

The integration test exercises this capability against its own composition (no backend seam) — the
render, the mode state, and the affordance-gating signal are all real. It would:

1. Render `<ReviewToggle>` (wrapping a marker child / the affordance slot it gates) in jsdom. Assert
   the default posture is **View** — the switch reads "View" and the commenting/suggesting affordance
   slot is NOT shown.
2. Fire the switch (click / keyboard). Assert the mode flips to **Review** — the switch reads "Review"
   and the commenting/suggesting affordance slot IS shown (the gated children render).
3. Fire the switch again. Assert it flips back to **View** and the affordance slot hides again — the
   toggle is a genuine two-state switch, not one-way.
4. Assert the mode is exposed to the gated children (a prop / context value reads `'review'` in Review
   and `'view'` in View) — the signal caps 7/8 consume to gate their own affordances.

## Contracts (3)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest
jsdom, `apps/studio/src/components/ReviewToggle.test.tsx`). None exist yet; each is the assertion a
contract test WILL prove once authored (re-cite at real `file:line` when built). Per ADR-0122 each
contract id leads a distinctly-named test so `storytree coverage review-mode-toggle` reports 3/3. None
is an APPEARANCE assertion — the look is the story's operator-attested UAT leg 1 (ADR-0070).

1. **`rmt-defaults-to-view-read-only`** — the toggle defaults to View with no commenting/suggesting affordances
   - **asserts —** on first render the mode is View, the switch reads "View", and the
     commenting/suggesting affordance slot is not shown — reading is the default posture.
   - **covers —** `apps/studio/src/components/ReviewToggle.tsx` (the default + View render) *(provisional path)*
2. **`rmt-review-shows-the-affordances`** — flipping to Review exposes the commenting + suggesting affordances
   - **asserts —** firing the switch flips the mode to Review, the switch reads "Review", and the gated
     affordance slot becomes visible (the children render) — Review turns collaboration on.
   - **covers —** `apps/studio/src/components/ReviewToggle.tsx` (the flip-to-Review + affordance gating) *(provisional path)*
3. **`rmt-flips-back-to-view`** — the switch is two-way and exposes the mode to its children
   - **asserts —** firing the switch from Review flips back to View and hides the affordances again, and
     the mode value exposed to the gated children reads `'review'` in Review and `'view'` in View — the
     signal caps 7/8 consume.
   - **covers —** `apps/studio/src/components/ReviewToggle.tsx` (the two-way flip + exposed mode) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the toggle as a new component,
test-first.

- **The new test —** `apps/studio/src/components/ReviewToggle.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react` — the studio package convention, the `BuildSection.test.tsx` /
  `ChatPanel.test.tsx` shape; NO real `fetch`/socket/DB/Electron). Import `{ ReviewToggle }` from
  `"./ReviewToggle"`. Name each test for its contract id (`rmt-…`) so `storytree coverage` reports 3/3
  (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `ReviewToggle.tsx`
  does not exist at HEAD, so the test fails module-not-found (the net-new missing-symbol red, ADR-0057).
- **The GREEN —** write `apps/studio/src/components/ReviewToggle.tsx`: a behavioural component holding a
  two-state mode (View / Review), rendering the switch, and exposing the mode (a prop / small context)
  so its gated children show or hide. WIRING it into the studio's topic surface (DocView / AssetView)
  and the appearance are witnessed under the story's UAT leg 1 (operator-attested, ADR-0070), not
  asserted in CI. After it, the import resolves, the assertions hold, and `pnpm --filter studio test` +
  `pnpm --filter studio typecheck` stay green.

Rules:

- **Two-state, View by default** — reading is the default posture; the user deliberately enters Review.
- **Gate, don't implement** — the toggle exposes the mode; caps 7/8 gate their own affordances on it.
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove the flip + the gating
  signal; the look is the story's UAT leg 1. Do not author a visual verdict.
- **No backend seam** — the toggle holds no `api` call; it is pure mode state + render.
