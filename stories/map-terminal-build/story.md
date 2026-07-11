---
id: "map-terminal-build"
tier: story
title: "Clicking Build on the forest map seeds a runnable command into the embedded terminal — on the desktop, instead of an in-app dispatch"
outcome: "Clicking Build on a node or story on the forest map — on the desktop, where the embedded terminal exists — composes the corresponding `storytree … build <id> --real --store pg` command and SEEDS it pre-filled (never auto-run) into the embedded terminal, ready for the user to run as their own real Claude Code — instead of dispatching an in-app SDK-driven build; where the terminal bridge is absent (hosted/dev studio, a plain browser) the existing dispatch is unchanged."
status: proposed
proof_mode: UAT
# uat_witness ABSENT → human (ADR-0040 fail-closed signpost): the whole-story UAT — "does clicking Build
# put a RUNNABLE command in the terminal, pre-filled and un-run, in the native shell" — is appearance +
# native-shell + live behaviour, operator-attested (ADR-0070 / ADR-0174). The machine-driven story UAT
# node stays WITHHELD; the crown derives from the three capabilities' signed verdicts plus the operator's
# attestation of the pre-fill-reads-right and bridge-absent-unchanged legs.
# Capabilities, roots-first (a capability appears after everything it depends on). THREE machine-provable
# caps: compose-build-command (a pure string builder — the command a Build click should run) and
# terminal-dock-seed (the dock accepts + pre-fills a seed) are independent ROOTS; map-build-seeds-terminal
# (the desktop Build button seeds instead of dispatching) is the capstone that IMPORTS the composer — its
# one within-story depends_on edge. The dock-seed and the button-re-point are joined by the TreeView glue
# (a `seed` state + a `seedTerminal` setter), NOT a code import — so they are separate roots joined by
# glue (the embedded-terminal / chat-panel ↔ chat-sse-mount pattern), exactly as within embedded-terminal.
capabilities: [compose-build-command, terminal-dock-seed, map-build-seeds-terminal]
# Story-level cross-story edges (ADR-0010 §4 / ADR-0074). This story OWNS NO package — it is a VIRTUAL
# story (like embedded-terminal / terminal-chat): its net-new code is CO-LOCATED inside the `studio`
# surface and extends a component `embedded-terminal` authored. Both edges are declared `depends_on` AND
# annotated `artifact_edges` (ADR-0166 — deliberate non-import / co-located-source edges, not
# @storytree/* package imports):
#   - studio  — the composer (apps/studio/src/lib/buildCommand.ts, NET-NEW) and the Build-button re-point
#               (apps/studio/src/components/BuildSection.tsx) + the TreeView seed glue live in the studio
#               surface. The desktop renders the COMPILED studio dist (ADR-0090 d.4), so the re-pointed
#               Build affordance is a `studio` frontend change, exactly as terminal-chat's caps edit
#               apps/studio/src. Co-located source, NO new @storytree/* frontend import → an artifact edge.
#   - embedded-terminal — this story EXTENDS the `TerminalDock` component embedded-terminal authored
#               (apps/studio/src/components/TerminalDock.tsx): terminal-dock-seed adds the `seed` prop, and
#               the whole story consumes the `window.desktopTerminal` bridge embedded-terminal's glue
#               injects. A follow-on that extends a prior story's co-located component — NO @storytree/*
#               import (TerminalDock is a co-located studio component, not a package) → an artifact edge.
# NO edge to `desktop`: this story adds NO apps/desktop code — it only feature-detects the ALREADY-EXISTING
# `window.desktopTerminal` bridge (embedded-terminal's glue), which is not a package import. NO edge to
# `terminal-chat` (the dormant chat panel is untouched) or the prove-it-gate/spine (untouched — this
# changes only WHERE the click sends its intent).
depends_on: [embedded-terminal, studio]
artifact_edges: [embedded-terminal, studio]
# Deciding ADRs (ADR-0037 §2): 0174 (the WHAT — the map-spawn re-point clause: the click composes the
# command and injects it into the embedded terminal, not the in-app SDK author; amends ADR-0137); 0137
# (the forest-map click-a-node-to-build affordance being re-pointed); 0070 (the two-stage frontend-builder
# proof — behaviour machine-proven, the native-shell pre-fill operator-attested); 0158 (the TreeView seed
# wiring is glue — un-asserted connective code WITHIN the story, witnessed under the Story UAT); 0010 (the
# organism model + the splitting-rule tiering the three caps); 0057 (the spec-borne proof config making
# each cap inner-loop buildable); 0004 (the thin-client boundary — the terminal is the interactive surface;
# the prove-it-gate leaf sdk-author.ts is UNTOUCHED and the renderer imports no @storytree/agent).
decisions: [174, 137, 70, 158, 10, 57, 4]
---

# Clicking Build on the forest map seeds a runnable command into the embedded terminal

**Outcome —** Clicking **Build** on a node or story on the forest map — **on the desktop, where the
embedded terminal exists** — composes the corresponding `storytree … build <id> --real --store pg`
command and **seeds it pre-filled (never auto-run) into the embedded terminal**, ready for the user to run
as their own **real Claude Code** — instead of dispatching an in-app SDK-driven build. Where the terminal
bridge is **absent** (hosted/dev studio, a plain browser) the existing dispatch is **unchanged**.

This story is the build follow-on of **[ADR-0174](../../docs/decisions/0174-interactive-builds-run-in-an-in-app-terminal-not-the-in-app.md)**
(owner-directed 2026-07-09, born accepted per ADR-0110 — design-time alignment IS the ratification), whose
**map-spawn re-point clause** (amends [ADR-0137](../../docs/decisions/0137-chat-is-the-full-session-orchestrator-it-spawns-the-inner-lo.md))
reads:

> The forest-map "click-a-node-to-build" affordance no longer calls the in-app SDK author or dispatches a
> headless build from the chat. Instead it composes the corresponding command (`storytree story build
> <id> --real …` / `storytree node build <id> …`) and injects it into the embedded terminal (or opens a
> seeded terminal tab pre-filled with it), where the user's Claude Code — or a bare storytree invocation —
> runs it. The map stays the launch surface; the runtime behind the click becomes the terminal, not the
> chat session.

The embedded terminal itself already landed ([`embedded-terminal`](../embedded-terminal/story.md), PR
#690). This story wires the map's Build click INTO it: on the desktop, the click composes the command and
pre-fills it into the terminal (the user reviews and runs it as the real tool); off the desktop, nothing
changes. It keeps the app pointed at what it is uniquely good at — **watching** — while the real Claude
Code, in the terminal, does the building.

## The journey (why this is ONE story — the journey-principle)

The consumer is the desktop user on the forest map; their goal is **to click Build and have a runnable
build command land in the terminal, ready to fire**. Finishing "the command string is composed" leaves the
user immediately needing "the terminal can accept and pre-fill it" and then "the Build button actually
routes the click to the terminal instead of dispatching in-app" — these are not separate value deliveries,
they are one continuous journey (the journey-principle: if finishing the first unit's journey leads the
consumer straight to needing the next, they are the same journey). The outcome states the value in one
sentence: *clicking Build drops a runnable, pre-filled build command into the embedded terminal on the
desktop.* The desktop-only / bridge-absent-unchanged qualifier is a SCOPE CONDITION (where the terminal
exists), not a second outcome. So this story's **net-new** is: a command composer + a dock that pre-fills a
seed + a Build button that seeds on the desktop, joined by a little TreeView glue.

## What this story is NOT (the walls — encode from the ADRs)

- **It re-points the INTERACTIVE dispatch, NOT the prove-it-gate (ADR-0174 CRITICAL scoping note).** Signed
  `--real` verdicts still come **only** from the deterministic spine driving `ClaudeAgentAuthor`
  (`packages/agent/src/sdk-author.ts`) through the `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN →
  GATE` walk (`packages/orchestrator/*`). This story changes only WHERE the map's Build **click** sends its
  intent — into the terminal (where the user's real Claude Code runs the command) instead of the in-app
  build-registry → SDK author. The command it seeds (`storytree … build --real --store pg`) drives the
  SAME proof path when the user runs it; whether a human fires it from this terminal or a headless job
  fires it, the proof runtime is identical. The prove-it-gate leaf (`sdk-author.ts`) and the whole
  `packages/orchestrator` spine are **UNTOUCHED** (ADR-0020 / ADR-0030 / ADR-0091 stand).
- **Desktop-only — the in-app dispatch is RETAINED as the bridge-absent fallback, NOT deleted.** The
  embedded terminal exists only where `window.desktopTerminal` is present (the Electron desktop). Where it
  is absent — the hosted studio (members are watch-and-comment only until cloud terminals land, ADR-0174),
  the dev studio in a plain browser, any non-desktop surface — there is no terminal to seed, so the
  EXISTING `api.build` → build-registry → `ClaudeAgentAuthor` dispatch stays exactly as today. This is a
  feature-detected re-point, not a wholesale retirement of the in-app build path (the dispatch machinery in
  `apps/studio/server` / `packages/drive` is unchanged and still serves the fallback + capability `--live`
  smokes + `desktop-build-mount`'s routed dispatch). Cloud/web terminals are DEFERRED (ADR-0174).
- **Pre-fill, NEVER auto-run.** The command is written to the pty WITHOUT a trailing newline, so it sits at
  the prompt un-executed until the user presses Enter. A seeded `story build --real --store pg` opens a
  **billed, outward-facing auto-merging PR** (ADR-0136); a `node build --real` spends the subscription and
  parks a `claude/real/<unit>-<run>` branch. A human must fire it deliberately — a click composes the
  intent, it does not spend money. This is the load-bearing safety wall
  ([`terminal-dock-seed`](terminal-dock-seed.md)'s `tds-prefills-without-trailing-newline`).
- **The Build button only — the Adopt path is untouched.** A `mapped` story's go-green is Adopt
  (observe-and-sign its reliability gates, ADR-0085), a different command shape (`storytree adopt <id>
  --pg`) and a different owner call. This story re-points only the **Build** button (story `goGreen ===
  'build'` and buildable capability `scope === 'node'`). Whether Adopt should also seed a terminal is a
  deliberate follow-on surfaced in "Open modeling calls" — NOT scoped here.
- **Thin client — no model path.** The composed command is a STRING; the app runs NOTHING. No cap imports
  `@storytree/agent` / `@storytree/drive` or holds a model path (`apps/studio/src/modelPathBoundary.test.ts`
  stays green). The terminal — the real Claude Code — is what runs the build.

## Capabilities (3)

Listed roots-first (a capability appears after everything it depends on).

| # | capability | outcome | proof | depends on |
|---|------------|---------|-------|------------|
| 1 | [`compose-build-command`](compose-build-command.md) | A pure `composeBuildCommand({ unitId, scope })` returns the exact `storytree story build <id> --real --store pg` / `storytree node build <id> --real --store pg` a Build click should run — the CLI equivalents of the in-app dispatch (ADR-0144). | integration-test (studio vitest, NET-NEW red→green) | — |
| 2 | [`terminal-dock-seed`](terminal-dock-seed.md) | `TerminalDock` gains an optional `seed?: { command; token }` prop: a new seed expands the dock, ensures a session, and PRE-FILLS the command (no trailing newline, async-safe, token-re-seedable); absent the prop it is byte-identical. | integration-test (studio vitest jsdom, editsExisting red→green) | — |
| 3 | [`map-build-seeds-terminal`](map-build-seeds-terminal.md) | On the desktop (bridge present + an `onSeedTerminal` callback), a Build click calls `onSeedTerminal(composeBuildCommand({ unitId, scope }))` and does NOT POST `api.build`; bridge-absent keeps the existing dispatch; Adopt untouched. | integration-test (studio vitest jsdom, editsExisting red→green) | `compose-build-command` |

## Operator-attested glue (un-asserted connective code WITHIN this story — ADR-0158, NOT a capability)

The **TreeView seed wiring** has no isolatable red→green seam — it is the connective state that carries a
composed command from the Build button to the dock. It is witnessed under the Story UAT's operator-
attested legs (ADR-0070), exactly as embedded-terminal models its Electron-main pty wiring and preload
bridge as glue:

- **`apps/studio/src/components/TreeView.tsx`** — hold a `seed` state (`{ command: string; token: number }
  | undefined`) plus a `seedTerminal(command)` setter that bumps the token; pass `seed` to
  `<TerminalDock seed={seed}/>` (the dock mount at ~L2149) and thread `onSeedTerminal={seedTerminal}` down
  through `StoryPanel` to `<BuildSection onSeedTerminal={…}/>` (~L4329). This is the wire between the two
  glue-joined roots (`terminal-dock-seed` and `map-build-seeds-terminal`) — un-asserted connective code
  within the story: there is no isolatable red→green in a `useState` + a prop pass-through, so it is
  witnessed under UAT legs 4/5, not asserted in CI. (Both endpoints ARE proven: the button calls
  `onSeedTerminal` — `map-build-seeds-terminal`'s signed verdict; the dock pre-fills a `seed` —
  `terminal-dock-seed`'s signed verdict. The glue is only the wire between them.)

## Within-story dependency graph

Authored from the intended data-flow + the real imports/calls (re-derive when built, ADR-0010 §3, and
correct if the code disagrees). The graph is acyclic; **`compose-build-command` and `terminal-dock-seed`
are independent roots**.

- `compose-build-command` — a root. A self-contained pure helper; imports nothing.
- `terminal-dock-seed` — a root. The dock receives the command as an opaque `string` in its `seed` prop;
  it imports neither the composer nor the Build button. It consumes the story's TreeView `seed` glue — a
  wire, not a code edge — so it takes no in-story `depends_on`.
- `map-build-seeds-terminal` → `compose-build-command`. The Build button IMPORTS `composeBuildCommand` to
  build the string it seeds — a real code edge, so in the shared `--real` worktree it builds AFTER the
  composer commits `buildCommand.ts` (its import then resolves). It does **NOT** `depends_on`
  `terminal-dock-seed`: it calls `onSeedTerminal(command)`, a prop the TreeView glue wires to the dock's
  `seed` — `BuildSection` imports no `TerminalDock`, and its proof mocks `onSeedTerminal` as a spy, so
  there is neither a code edge nor a proof-precondition between them. The button PRODUCES a command; the
  dock CONSUMES it; they are joined by glue, not a data-flow dependency (the embedded-terminal "two roots
  joined by glue" pattern — see the note below).

> **Graph call (a deliberate divergence, honestly recorded).** An earlier decomposition sketch listed
> `map-build-seeds-terminal` as `depends_on: [compose-build-command, terminal-dock-seed]`. The
> `terminal-dock-seed` edge is dropped: it is neither a code import (BuildSection never imports TerminalDock),
> a shared-file sequencing edge (different files: `BuildSection.tsx` vs `TerminalDock.tsx`), nor a
> proof-precondition (`map-build-seeds-terminal`'s vitest proof mocks `onSeedTerminal`). Per the
> real-prerequisites-only rule, the honest within-story graph is two roots (composer, dock-seed) plus one
> import edge (button → composer); the dock-seed ↔ button relationship is the TreeView glue, witnessed under
> the Story UAT. This mirrors `embedded-terminal` exactly (its two caps are both roots, joined by the
> preload-bridge glue). The seam design is unchanged — the button still seeds the dock through the glue;
> only the edge's HONESTY is sharpened.

The three caps are joined into the delivered journey by the **operator-attested TreeView glue** above —
witnessed integrated under the Story UAT, exactly as embedded-terminal's two roots are joined by its
preload-bridge glue.

## Cross-story boundary (ADR-0010 §4 / ADR-0074)

Authored from the intended consumed seams (re-verify against the real imports when built). This story OWNS
no package (a VIRTUAL story — the embedded-terminal / terminal-chat precedent): its net-new code is
co-located inside the `studio` surface and extends a component `embedded-terminal` authored.

- **`studio`** — the surface the re-point lives on. The NET-NEW composer
  (`apps/studio/src/lib/buildCommand.ts`), the Build-button re-point
  (`apps/studio/src/components/BuildSection.tsx`), and the TreeView seed glue
  (`apps/studio/src/components/TreeView.tsx`) are all `studio` frontend code. The desktop renders the
  **compiled** studio dist (ADR-0090 d.4), so the re-pointed Build affordance is a `studio` change, exactly
  as `terminal-chat`'s caps edit `apps/studio/src`. Thin clients — no `@storytree/agent` / `@storytree/drive`
  / model import (the `modelPathBoundary.test.ts` wall); `composeBuildCommand` is a local pure helper, not
  a cross-story `@storytree/*` edge. So this is co-located source with **no new `@storytree/*` import** → an
  **artifact edge** (ADR-0166), declared in `depends_on` and annotated in `artifact_edges`.
- **`embedded-terminal`** — the story this one EXTENDS. [`terminal-dock-seed`](terminal-dock-seed.md) adds
  the `seed` prop to the `TerminalDock` component embedded-terminal authored
  (`apps/studio/src/components/TerminalDock.tsx`), and the whole story consumes the `window.desktopTerminal`
  bridge embedded-terminal's Electron-main glue injects (feature-detected, exactly as `TerminalDock` and
  `StoreBanner` feature-detect their bridges). A follow-on extending a prior story's co-located component —
  **no `@storytree/*` import** (TerminalDock is a co-located studio component, not a package; the bridge is
  a `window` global, not an import) → an **artifact edge**, declared and annotated.

**No edge to `desktop`.** This story adds NO `apps/desktop` code — it only feature-detects the
already-existing `window.desktopTerminal` bridge (embedded-terminal's glue), which is a `window` global,
not a package import. **No edge to `terminal-chat`** (the dormant chat panel is untouched, ADR-0175) or to
the prove-it-gate / spine (untouched — this changes only WHERE the click sends its intent, never how a
signed verdict is produced).

## Story UAT

The integrated acceptance walkthrough that proves the whole re-point meets its outcome end-to-end.
Minimal-first (one coherent journey: on the desktop, click Build → a runnable command appears pre-filled in
the terminal → the user runs it as real Claude Code; off the desktop, Build is unchanged), defect-driven
thereafter (each real failure earns a permanent regression case, never speculative breadth).

> **Per-leg witness (ADR-0106 / ADR-0070).** The mechanics legs are covered by the three capabilities'
> signed `--real` verdicts (the command composes per scope; the dock expands + pre-fills a seed without a
> newline; the desktop Build click seeds instead of dispatching, the bridge-absent path unchanged, Adopt
> untouched — all over mocked seams). The experiential legs — the pre-fill actually landing in the REAL
> terminal, reading like a command the user typed, un-run until Enter, and then launching a real build in
> the native shell; and the bridge-absent surface still dispatching in-app — are `witness: human`
> (operator-attested, ADR-0070): an automated CI run cannot drive the real `window.desktopTerminal` bridge,
> run the paid build, or judge the native-shell feel. The story-level `uat_witness` is absent → human (the
> ADR-0040 fail-closed signpost), so the machine-driven whole-story UAT node stays WITHHELD; the crown
> derives from the per-cap signed verdicts plus the operator's attestations (legs 4, 5).

**Goal —** A desktop user on the forest map clicks Build on a node or story; the corresponding `storytree
… build <id> --real --store pg` command appears **pre-filled** (expanded, un-run) in the embedded terminal;
the user reviews it and presses Enter to run a real build as their own Claude Code — instead of an in-app
SDK-driven dispatch. Where the terminal is absent, clicking Build dispatches the in-app build exactly as
before.

1. **The Build command composes correctly for the unit's scope.** _(witness: machine)_ A story-scope Build
   composes `storytree story build <id> --real --store pg`; a node-scope Build composes `storytree node
   build <id> --real --store pg`; the unit id is embedded verbatim. **Success —**
   [`compose-build-command`](compose-build-command.md)'s signed verdict (a pure red→green).
2. **The terminal dock accepts a seed and pre-fills it without running it.** _(witness: machine)_ A new
   seed expands the dock, ensures a session, and writes the command as a pre-fill with NO trailing newline;
   a pre-spawn seed is written once the session resolves; a token bump re-seeds; an absent seed leaves the
   dock byte-identical. **Success —** [`terminal-dock-seed`](terminal-dock-seed.md)'s signed verdict
   (behaviour over the mocked xterm + bridge).
3. **On the desktop, the Build button seeds the terminal instead of dispatching in-app.** _(witness:
   machine)_ With the bridge present + a callback, a Build click seeds the composed command and does NOT
   POST `api.build`; with the bridge absent (or no callback) it dispatches `api.build` as today; the Adopt
   path is untouched. **Success —** [`map-build-seeds-terminal`](map-build-seeds-terminal.md)'s signed
   verdict (the branch over a mocked bridge + spy).
4. **Clicking Build drops a runnable command into the REAL terminal, pre-filled and NOT run.** _(witness:
   human)_ In the desktop app, the member clicks Build on a node/story; the composed `storytree … build
   --real --store pg` command appears in the expanded embedded terminal, cursor at the end, **nothing
   executed**; the command reads like one the member typed; pressing Enter launches a real build (real
   Claude Code, or a bare storytree run) in the native shell. **Success —** the owner's two-stage verdict
   (ADR-0070): the pre-fill reads right and runs, witnessed inside the native shell — never machine-
   asserted. *(operator-attested — a real bridge + a paid, PR-opening build; an agent must not fire it
   unattended.)*
5. **Where the terminal is absent, clicking Build is unchanged.** _(witness: human)_ On the hosted / dev
   studio (a plain browser, no `window.desktopTerminal`), clicking Build POSTs the in-app build and polls
   to a verdict exactly as before — no regression, no seed attempted. **Success —** the existing in-app
   dispatch, operator-attested on a bridge-absent surface. *(operator-attested — needs the running studio
   without the desktop bridge.)*

End state — on the desktop, a Build click on the forest map composes the right `storytree … build --real
--store pg` command and seeds it pre-filled (un-run) into the embedded terminal for the user to run as real
Claude Code; off the desktop, the existing dispatch is unchanged. The three caps' behaviours are signed
under the studio suite, the native-shell pre-fill + the bridge-absent fallback operator-attested — the
prove-it-gate leaf and the spine untouched, the app composing intent while the real tool runs the build.

## Proof

The story is proven when that walkthrough passes — the mechanics legs (1, 2, 3) green under the three
capabilities' signed `--real` verdicts (with each cap's contracts green underneath), and the experiential
legs (4, 5) operator-attested. Per ADR-0020, `healthy` is only ever DERIVED from signed verdicts; nothing
here is authored healthy. All three capabilities are proof-wired (each carries a `proof:` block with a
`real:` arm — a NET-NEW red→green for the composer, edit-existing red→green for the dock-seed and the
button re-point) so the spine can drive their studio vitest suites red→green under its own gate; the
story's machine-driven UAT node is WITHHELD (its `uat_witness` is absent → human, ADR-0040), so driving
those capabilities to signed verdicts is what makes the re-point buildable, and the crown additionally
awaits the operator's attestations (legs 4, 5).

## Open modeling calls (for the owner / orchestrator)

None is a story-shape fork (ADR-0174 settled the WHAT — the map click composes the command and seeds the
terminal; owner-directed, no ADR reserved). Three items are **surfaced for the orchestrator's build**, not
decided here:

1. **The `pnpm ` prefix on the seeded command (orchestrator-settled from a verified fact; operator-attested
   at UAT leg 4).** ADR-0174's text writes bare `storytree … build <id> --real`, but the orchestrator
   verified the embedded terminal spawns the platform shell (PowerShell on Windows) at the pinned-main
   runtime worktree root (ADR-0181; `apps/desktop/electron/main.ts` `cwd: serveRoot`), where a bare
   `storytree` is not on `PATH` but `pnpm storytree …` IS the documented, runnable invocation (CLAUDE.md).
   So `compose-build-command` composes `pnpm storytree … build <id> --real --store pg` — the RUNNABLE form
   (ADR-0174's whole point is a command the user can actually run). This stays operator-attested at UAT leg
   4: the pre-fill is editable, and if the owner keeps a global `storytree` bin, dropping `pnpm ` is a
   one-token edit to that one function + its `cbc-*` contracts.
2. **An Adopt re-point (a deliberate follow-on, NOT scoped here).** This story re-points only the Build
   button. A `mapped` story's Adopt (`api.adopt`, observe-and-sign) could similarly seed a `storytree adopt
   <id> --pg` command into the terminal — a different command shape and a different owner call. It is left
   as a follow-on: pick it up only if the owner asks, mirroring this story's compose→seed pattern for the
   adopt shape.
3. **The `node-build.test.ts` REAL-buildable snapshot companion edit (REQUIRED, outside `stories/**`).**
   Authoring these three `real:`-armed caps makes `buildableNodeIds()` discover them (spec-borne, ADR-0057),
   which the `packages/cli/src/node-build.test.ts` REAL-buildable snapshot regex + its per-story discovery
   comment pin exactly (the known "node-build snapshot trap"). The orchestrator must add
   `compose-build-command`, `map-build-seeds-terminal`, and `terminal-dock-seed` (alphabetically:
   `compose-build-command` after `colour-by-subagent`; `map-build-seeds-terminal` after
   `local-credential-wiring`; `terminal-dock-seed` after `terminal-dock-panel`) to that regex + a per-story
   comment, or `pnpm -r test` goes red. This is a `packages/cli` test edit — outside the story-author's
   `stories/**` fence — flagged here so it lands with the caps.
