---
id: "map-terminal-build"
tier: story
title: "Clicking Build on the forest map seeds a runnable command into the embedded terminal — on the desktop, instead of an in-app dispatch"
outcome: "Clicking Build on a node or story on the forest map — on the desktop, where the embedded terminal exists — composes the corresponding `storytree … build <id> --real --store pg` command and SEEDS it pre-filled (never auto-run) into the embedded terminal, ready for the user to run as their own real Claude Code — instead of dispatching an in-app SDK-driven build; where the terminal bridge is absent (hosted/dev studio, a plain browser) the existing dispatch is unchanged."
status: proposed
proof_mode: UAT
# uat_witness ABSENT → human (ADR-0040 fail-closed signpost): the story-level crown still rests on an
# owner judgment, so the machine-driven story UAT node stays WITHHELD. Re-adjudicated 2026-07-25
# (ADR-0209 D8): the human residue is NARROWER than first authored. It is NOT "the pre-fill lands in the
# native shell" (a harness statement — the Electron `_electron` harness already drives the real
# `window.desktopTerminal` bridge, see leg 4) and NOT "the bridge-absent surface is unchanged" (already a
# signed contract, see leg 5). What genuinely has no compiler is the owner's acceptance of the INVOCATION
# FORM the composer emits (leg 6) and the owner's verdict on a real, BILLED, PR-opening run (leg 7). The
# crown derives from the two capabilities' signed verdicts (plus the consumed terminal-tabs
# seed-opens-new-tab verdict for the dock side) plus those two attestations.
# Capabilities, roots-first (a capability appears after everything it depends on). TWO machine-provable
# caps: compose-build-command (a pure string builder — the command a Build click should run) is the ROOT;
# map-build-seeds-terminal (the desktop Build button seeds instead of dispatching) is the capstone that
# IMPORTS the composer — its one within-story depends_on edge. The dock's HANDLING of the seed (accept +
# pre-fill) is NOT a cap of this story: it was originally `terminal-dock-seed` here, but ADR-0186 re-decided
# it (a seed opens a FRESH tab, never the active session) and `terminal-tabs`' seed-opens-new-tab SUPERSEDED
# it — so this story now owns only the composer + the button re-point, feeding the seed to the (now
# multi-session) dock through the unchanged TreeView `seed` glue.
capabilities: [compose-build-command, map-build-seeds-terminal]
# Story-level cross-story edges (ADR-0010 §4 / ADR-0074). This story OWNS NO package — it is a VIRTUAL
# story (like embedded-terminal / app-guide): its net-new code is CO-LOCATED inside the `studio`
# surface and extends a component `embedded-terminal` authored. Both edges are declared `depends_on` AND
# annotated `artifact_edges` (ADR-0166 — deliberate non-import / co-located-source edges, not
# @storytree/* package imports):
#   - studio  — the composer (apps/studio/src/lib/buildCommand.ts, NET-NEW) and the Build-button re-point
#               (apps/studio/src/components/BuildSection.tsx) + the TreeView seed glue live in the studio
#               surface. The desktop renders the COMPILED studio dist (ADR-0090 d.4), so the re-pointed
#               Build affordance is a `studio` frontend change, exactly as app-guide's caps edit
#               apps/studio/src. Co-located source, NO new @storytree/* frontend import → an artifact edge.
#   - embedded-terminal — this story consumes the `TerminalDock` component embedded-terminal authored
#               (apps/studio/src/components/TerminalDock.tsx): the TreeView `seed` glue mounts it as
#               `<TerminalDock seed={seed}/>`, and the story feature-detects + consumes the
#               `window.desktopTerminal` bridge embedded-terminal's glue injects. (The dock's OWN seed
#               handling is no longer this story's — terminal-dock-seed was superseded by terminal-tabs'
#               seed-opens-new-tab, ADR-0186.) A follow-on over a prior story's co-located component — NO
#               @storytree/* import (TerminalDock is a co-located studio component, not a package) → an
#               artifact edge.
# NO edge to `desktop`: this story adds NO apps/desktop code — it only feature-detects the ALREADY-EXISTING
# `window.desktopTerminal` bridge (embedded-terminal's glue), which is not a package import. NO edge to
# `app-guide` (the dormant chat panel is untouched) or the prove-it-gate/spine (untouched — this
# changes only WHERE the click sends its intent).
depends_on: [embedded-terminal, studio]
artifact_edges: [embedded-terminal, studio]
# Deciding ADRs (ADR-0037 §2): 0174 (the WHAT — the map-spawn re-point clause: the click composes the
# command and injects it into the embedded terminal, not the in-app SDK author; amends ADR-0137); 0137
# (the forest-map click-a-node-to-build affordance being re-pointed); 0070 (the two-stage frontend-builder
# proof — behaviour machine-proven, the native-shell pre-fill operator-attested); 0158 (the TreeView seed
# wiring is glue — un-asserted connective code WITHIN the story, witnessed under the Story UAT); 0010 (the
# organism model + the splitting-rule tiering the two caps); 0057 (the spec-borne proof config making
# each cap inner-loop buildable); 0004 (the thin-client boundary — the terminal is the interactive
# surface; the prove-it-gate runtime binding is UNTOUCHED and the renderer imports no
# @storytree/agent).
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
exists), not a second outcome. So this story's **net-new** is: a command composer + a Build button that
seeds on the desktop, joined by a little TreeView glue — the dock's HANDLING of the seed is delivered
separately (`terminal-tabs`' seed-opens-new-tab: a seed opens a fresh tab, ADR-0186; originally this
story's `terminal-dock-seed`, now superseded).

## What this story is NOT (the walls — encode from the ADRs)

- **It re-points the INTERACTIVE dispatch, NOT the prove-it-gate (ADR-0174 CRITICAL scoping note).** Signed
  `--real` verdicts still come **only** from the deterministic spine driving the selected
  `PhaseAuthor` — `ClaudeAgentAuthor` is the compatibility default and `--runtime codex` opts into
  `CodexPhaseAuthor` — through the `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`
  walk (`packages/orchestrator/*`). This story changes only WHERE the map's Build **click** sends its
  intent — into the terminal (where the user's real Claude Code runs the command) instead of the in-app
  build-registry → SDK author. The command it seeds (`storytree … build --real --store pg`) drives the
  SAME proof path when the user runs it; whether a human fires it from this terminal or a headless job
  fires it, the proof path and spine authority are identical. The prove-it-gate runtime binding and
  the whole `packages/orchestrator` spine are **UNTOUCHED** (ADR-0020 / ADR-0030 / ADR-0091 stand).
- **Desktop-only — the in-app dispatch is RETAINED as the bridge-absent fallback, NOT deleted.** The
  embedded terminal exists only where `window.desktopTerminal` is present (the Electron desktop). Where it
  is absent — the hosted studio (members are watch-and-comment only until cloud terminals land, ADR-0174),
  the dev studio in a plain browser, any non-desktop surface — there is no terminal to seed, so the
  EXISTING `api.build` → build-registry dispatch stays on its Claude compatibility default. Codex is
  available only when `--runtime codex` is selected explicitly. This is a
  feature-detected re-point, not a wholesale retirement of the in-app build path (the dispatch machinery in
  `apps/studio/server` / `packages/drive` is unchanged and still serves the fallback + capability `--live`
  smokes + `desktop-build-mount`'s routed dispatch). Cloud/web terminals are DEFERRED (ADR-0174).
- **Pre-fill, NEVER auto-run.** The command is written to the pty WITHOUT a trailing newline, so it sits at
  the prompt un-executed until the user presses Enter. A seeded `story build --real --store pg` opens a
  **billed, outward-facing auto-merging PR** (ADR-0136); a `node build --real` spends the subscription and
  parks a `claude/real/<unit>-<run>` branch. A human must fire it deliberately — a click composes the
  intent, it does not spend money. This is the load-bearing safety wall, preserved verbatim through the
  ADR-0186 re-decision ([`terminal-tabs`' seed-opens-new-tab](../terminal-tabs/seed-opens-new-tab.md)'s
  `son-prefills-without-trailing-newline`, which superseded the original `terminal-dock-seed`'s
  `tds-prefills-without-trailing-newline`).
- **The Build button only — the Adopt path is untouched.** A `mapped` story's go-green is Adopt
  (observe-and-sign its reliability gates, ADR-0085), a different command shape (`storytree adopt <id>
  --pg`) and a different owner call. This story re-points only the **Build** button (story `goGreen ===
  'build'` and buildable capability `scope === 'node'`). Whether Adopt should also seed a terminal is a
  deliberate follow-on surfaced in "Open modeling calls" — NOT scoped here.
- **Thin client — no model path.** The composed command is a STRING; the app runs NOTHING. No cap imports
  `@storytree/agent` / `@storytree/drive` or holds a model path (`apps/studio/src/modelPathBoundary.test.ts`
  stays green). The terminal — the real Claude Code — is what runs the build.

## Capabilities (2)

Listed roots-first (a capability appears after everything it depends on).

| # | capability | outcome | proof | depends on |
|---|------------|---------|-------|------------|
| 1 | [`compose-build-command`](compose-build-command.md) | A pure `composeBuildCommand({ unitId, scope })` returns the exact `storytree story build <id> --real --store pg` / `storytree node build <id> --real --store pg` a Build click should run — the CLI equivalents of the in-app dispatch (ADR-0144). | integration-test (studio vitest, NET-NEW red→green) | — |
| 2 | [`map-build-seeds-terminal`](map-build-seeds-terminal.md) | On the desktop (bridge present + an `onSeedTerminal` callback), a Build click calls `onSeedTerminal(composeBuildCommand({ unitId, scope }))` and does NOT POST `api.build`; bridge-absent keeps the existing dispatch; Adopt untouched. | integration-test (studio vitest jsdom, editsExisting red→green) | `compose-build-command` |

> **A third cap, `terminal-dock-seed`, was superseded (ADR-0186).** This story originally carried a
> `terminal-dock-seed` cap (the dock accepts a `seed` prop and pre-fills the command into the ACTIVE
> session). The owner surfaced the flaw — that active session is normally the user's own interactive Claude
> Code, so the write corrupts it — and ADR-0186 re-decided the behaviour: a seed opens a **fresh tab**,
> never the active session. [`terminal-tabs`' seed-opens-new-tab](../terminal-tabs/seed-opens-new-tab.md)
> **superseded** `terminal-dock-seed` (the five `tds-*` "writes to the active session" contracts replaced by
> the `son-*` "opens a fresh tab" contracts), so this story no longer owns a dock-seed cap; the load-bearing
> no-trailing-newline safety wall is preserved verbatim in `son-prefills-without-trailing-newline`.

## Operator-attested glue (un-asserted connective code WITHIN this story — ADR-0158, NOT a capability)

The **TreeView seed wiring** has no isolatable red→green seam — it is the connective state that carries a
composed command from the Build button to the dock. It is witnessed under the Story UAT's operator-
attested legs (ADR-0070), exactly as embedded-terminal models its Electron-main pty wiring and preload
bridge as glue:

- **`apps/studio/src/components/TreeView.tsx`** — hold a `seed` state (`{ command: string; token: number }
  | undefined`) plus a `seedTerminal(command)` setter that bumps the token; pass `seed` to
  `<TerminalDock seed={seed}/>` (the dock mount at ~L2149) and thread `onSeedTerminal={seedTerminal}` down
  through `StoryPanel` to `<BuildSection onSeedTerminal={…}/>` (~L4329). This is the wire between the Build
  button (`map-build-seeds-terminal`, this story's cap) and the dock (now `terminal-tabs`' multi-session
  `TerminalDock`) — un-asserted connective code within the story: there is no isolatable red→green in a
  `useState` + a prop pass-through, so it is witnessed under UAT leg 4, not asserted in CI. (Re-adjudicated
  2026-07-25: leg 4 became `witness: machine`, so this glue is now witnessable by the Electron harness
  end-to-end rather than only by an operator's eye — it stays un-asserted glue in CI either way.) (Both
  endpoints ARE proven: the button calls `onSeedTerminal` — `map-build-seeds-terminal`'s signed verdict;
  the dock opens a fresh tab and pre-fills the `seed` — `terminal-tabs`' seed-opens-new-tab signed verdict,
  ADR-0186. The glue is only the wire between them.)

## Within-story dependency graph

Authored from the intended data-flow + the real imports/calls (re-derive when built, ADR-0010 §3, and
correct if the code disagrees). The graph is acyclic; **`compose-build-command` is the sole root**.

- `compose-build-command` — the root. A self-contained pure helper; imports nothing.
- `map-build-seeds-terminal` → `compose-build-command`. The Build button IMPORTS `composeBuildCommand` to
  build the string it seeds — a real code edge, so in the shared `--real` worktree it builds AFTER the
  composer commits `buildCommand.ts` (its import then resolves). It does **NOT** import `TerminalDock`: it
  calls `onSeedTerminal(command)`, a prop the TreeView glue wires to the (now multi-session) dock's `seed`
  — `BuildSection` imports no `TerminalDock`, and its proof mocks `onSeedTerminal` as a spy. The button
  PRODUCES a command; the dock (`terminal-tabs`' seed-opens-new-tab) CONSUMES it; they are joined by glue,
  not a data-flow dependency.

> **Graph call (the dock-seed cap moved out — ADR-0186).** This story originally carried a third cap,
> `terminal-dock-seed` (the dock accepts + pre-fills a seed into the ACTIVE session), as an independent root
> joined to the Build button by the TreeView glue. ADR-0186 re-decided that behaviour — a seed opens a
> **fresh tab**, never the active session — and [`terminal-tabs`' seed-opens-new-tab](../terminal-tabs/seed-opens-new-tab.md)
> **superseded** it, so the dock's seed handling is no longer this story's. What remains is the honest
> two-cap graph: the pure composer (a root) and the Build-button re-point that imports it (one edge). The
> button never imported `TerminalDock` — it calls `onSeedTerminal`, wired to the dock through the TreeView
> glue; that wire is unchanged, only the dock on its far end became multi-session.

The two caps are joined to the (now `terminal-tabs`) dock by the **operator-attested TreeView glue** above —
witnessed integrated under the Story UAT, exactly as embedded-terminal's roots are joined by its
preload-bridge glue.

## Cross-story boundary (ADR-0010 §4 / ADR-0074)

Authored from the intended consumed seams (re-verify against the real imports when built). This story OWNS
no package (a VIRTUAL story — the embedded-terminal / app-guide precedent): its net-new code is
co-located inside the `studio` surface and extends a component `embedded-terminal` authored.

- **`studio`** — the surface the re-point lives on. The NET-NEW composer
  (`apps/studio/src/lib/buildCommand.ts`), the Build-button re-point
  (`apps/studio/src/components/BuildSection.tsx`), and the TreeView seed glue
  (`apps/studio/src/components/TreeView.tsx`) are all `studio` frontend code. The desktop renders the
  **compiled** studio dist (ADR-0090 d.4), so the re-pointed Build affordance is a `studio` change, exactly
  as `app-guide`'s caps edit `apps/studio/src`. Thin clients — no `@storytree/agent` / `@storytree/drive`
  / model import (the `modelPathBoundary.test.ts` wall); `composeBuildCommand` is a local pure helper, not
  a cross-story `@storytree/*` edge. So this is co-located source with **no new `@storytree/*` import** → an
  **artifact edge** (ADR-0166), declared in `depends_on` and annotated in `artifact_edges`.
- **`embedded-terminal`** — the story whose `TerminalDock` component this one consumes
  (`apps/studio/src/components/TerminalDock.tsx`): the TreeView `seed` glue mounts it as `<TerminalDock
  seed={seed}/>`, and the whole story consumes the `window.desktopTerminal` bridge embedded-terminal's
  Electron-main glue injects (feature-detected, exactly as `TerminalDock` and `StoreBanner` feature-detect
  their bridges). (The dock's OWN seed handling moved to [`terminal-tabs`' seed-opens-new-tab](../terminal-tabs/seed-opens-new-tab.md)
  under ADR-0186; the originally-here `terminal-dock-seed` cap is superseded.) A follow-on over a prior
  story's co-located component — **no `@storytree/*` import** (TerminalDock is a co-located studio
  component, not a package; the bridge is a `window` global, not an import) → an **artifact edge**,
  declared and annotated.

**No edge to `desktop`.** This story adds NO `apps/desktop` code — it only feature-detects the
already-existing `window.desktopTerminal` bridge (embedded-terminal's glue), which is a `window` global,
not a package import. **No edge to `app-guide`** (the dormant chat panel is untouched, ADR-0175) or to
the prove-it-gate / spine (untouched — this changes only WHERE the click sends its intent, never how a
signed verdict is produced).

## UAT Test Criteria

The integrated acceptance walkthrough that proves the whole re-point meets its outcome end-to-end.
Minimal-first (one coherent journey: on the desktop, click Build → a runnable command appears pre-filled in
the terminal → the user runs it as real Claude Code; off the desktop, Build is unchanged), defect-driven
thereafter (each real failure earns a permanent regression case, never speculative breadth).

> **Per-leg witness (ADR-0106 / ADR-0070), re-adjudicated 2026-07-25 (ADR-0209 D8).** Legs 1–3 are covered
> by signed `--real` verdicts over MOCKED seams — two from this story's caps (the command composes per
> scope; the desktop Build click seeds instead of dispatching, the bridge-absent path unchanged, Adopt
> untouched) and one CONSUMED from `terminal-tabs` (the dock opens a fresh tab + pre-fills the seed without
> a newline — leg 2, ADR-0186; originally this story's `terminal-dock-seed`, superseded). Leg 4 — the
> INTEGRATED walk over the real bridge, which is the only leg that exercises the ADR-0158 TreeView glue —
> is now `witness: machine`: its former basis ("an automated CI run cannot drive the real
> `window.desktopTerminal` bridge") was a HARNESS statement, and it is false today —
> `apps/desktop/e2e/session-survival.e2e.mjs` already drives that bridge and a real pty offline in CI. Leg
> 5 is now `witness: machine` too: its only stated basis named a harness, and its assertion is already the
> signed contract `mbt-without-bridge-dispatches-as-today`, so it REFERENCES that verdict rather than
> restating a compiled fact as an unrepeatable signature. What survives as `witness: human` are the two
> clauses that were fused inside the old leg 4 and have no compiler at all: the owner's acceptance of the
> INVOCATION FORM (leg 6, a value call) and the owner's verdict on a real, BILLED, PR-opening run (leg 7,
> spend + outward-facing). The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed
> signpost), so the machine-driven whole-story UAT node stays WITHHELD; the crown derives from the per-cap
> signed verdicts plus the operator's attestations (legs 6, 7). Per ADR-0209 §6 every re-adjudicated leg
> returns to UNSTAMPED until judged — a `machine` tag here asserts which witness is RIGHT, never that the
> proof exists.

**Goal —** A desktop user on the forest map clicks Build on a node or story; the corresponding `storytree
… build <id> --real --store pg` command appears **pre-filled** (expanded, un-run) in the embedded terminal;
the user reviews it and presses Enter to run a real build as their own Claude Code — instead of an in-app
SDK-driven dispatch. Where the terminal is absent, clicking Build dispatches the in-app build exactly as
before.

1. **The Build command composes correctly for the unit's scope.** _(witness: machine)_ A story-scope Build _(criterion-id: uatc_b07259986f069bd596907ee9)_ _(revision-id: uatr1:230deb354c1673c3)_
   composes `pnpm storytree story build <id> --real --store pg`; a node-scope Build composes `pnpm
   storytree node build <id> --real --store pg`; the unit id is embedded verbatim. **Success —**
   [`compose-build-command`](compose-build-command.md)'s signed verdict (a pure red→green).
   *(Scope note, 2026-07-25: witness UNCHANGED. The prose said bare `storytree …`, but the landed composer
   — `apps/studio/src/lib/buildCommand.ts:15` — emits the `pnpm ` prefix, exactly as open modeling call 1
   settled and as the three passing `cbc-*` tests assert. Corrected in place: had this leg been executed
   as written it would have understated the command it is meant to pin.)*
2. **The terminal dock accepts the seed and pre-fills it without running it.** _(witness: machine)_ A new _(criterion-id: uatc_a70068a45105d3afc6f8255a)_ _(revision-id: uatr1:e0ff90f034b580c5)_
   seed opens a **fresh tab** (never the active Claude Code session — ADR-0186), switches to it, and writes
   the command as a pre-fill with NO trailing newline; a pre-spawn seed is written once the new tab's
   session resolves; a token bump opens another fresh tab; an absent seed leaves the dock byte-identical.
   **Success —** [`terminal-tabs`' seed-opens-new-tab](../terminal-tabs/seed-opens-new-tab.md)'s signed
   verdict (behaviour over the mocked xterm + bridge) — a consumed dependency, not a cap of this story
   (originally this story's `terminal-dock-seed`, superseded by the ADR-0186 re-decision).
3. **On the desktop, the Build button seeds the terminal instead of dispatching in-app.** _(witness: _(criterion-id: uatc_130790b19621b3789ac8e97e)_ _(revision-id: uatr1:ed78096936ee28e8)_
   machine)_ With the bridge present + a callback, a Build click seeds the composed command and does NOT
   POST `api.build`; with the bridge absent (or no callback) it dispatches `api.build` as today; the Adopt
   path is untouched. **Success —** [`map-build-seeds-terminal`](map-build-seeds-terminal.md)'s signed
   verdict (the branch over a mocked bridge + spy).
4. **Clicking Build drops a runnable command into the REAL terminal, pre-filled and NOT run.** _(witness: _(criterion-id: uatc_865913dcc84077215e5b7175)_ _(revision-id: uatr1:bebdddf8150ee479)_
   machine)(detail: map-terminal-build#uat-4)_ The INTEGRATED walk over the real seam rather than a mocked
   one: in the desktop app the member clicks Build on a node/story; the composed command travels the
   TreeView `seed` glue to the real `window.desktopTerminal` bridge, lands in a fresh tab, and sits there
   **un-executed**. This is the only leg that exercises the glue legs 1–3 all stop short of (the `seed`
   state + prop pass-through, un-asserted by design per ADR-0158). **Success —** an Electron `_electron`
   spec asserting the composed command's text in the main-held `desktopTerminal.snapshot()` AND that no
   execution occurred. *(Re-adjudicated 2026-07-25, ADR-0209 D8 — was `human`, justified by "an automated
   CI run cannot drive the real `window.desktopTerminal` bridge". That is a HARNESS statement, and it is
   FALSE today: `apps/desktop/e2e/session-survival.e2e.mjs` already drives that bridge and a real pty
   offline in CI, reading `desktopTerminal.list()`/`snapshot()`. The two genuinely no-compiler clauses
   fused into this leg — whether the command reads like one the member would type, and whether pressing
   Enter runs a real billed build — are SPLIT OUT to legs 6 and 7. Deliberately UNBOUND: this story
   declares no reliability gate, so the binding gap is recorded rather than rubber-stamped over absent
   machinery (ADR-0097 §2). That gap is PRE-EXISTING — no leg here was bound before this pass.)*
5. **Where the terminal is absent, clicking Build is unchanged.** _(witness: machine)_ On a bridge-absent _(criterion-id: uatc_1a746f62e0b216cf0850e273)_ _(revision-id: uatr1:12179a95a334c5a7)_
   surface (the hosted / dev studio in a plain browser, no `window.desktopTerminal`), clicking Build POSTs
   the in-app build and polls to a verdict exactly as before — no regression, no seed attempted.
   **Success —** [`map-build-seeds-terminal`](map-build-seeds-terminal.md)'s signed verdict, contract
   `mbt-without-bridge-dispatches-as-today` (`apps/studio/src/components/BuildSection.test.tsx:671`,
   verified passing 2026-07-25) — the same assertion leg 3 already carries; this leg is its real-surface
   fidelity, not a second obligation. *(Re-adjudicated 2026-07-25, ADR-0209 D8 — was `human`, whose ONLY
   stated reason was "needs the running studio without the desktop bridge". That names a harness, not a
   judgment: no success condition here lacks a compiler. Because the machine half is ALREADY covered by
   the contract above, this leg REFERENCES that verdict instead of being split — restating a compiled
   fact as a human success condition would launder it into an unrepeatable signature.)*
6. **The seeded command is the invocation the owner actually wants.** _(witness: human)(detail: map-terminal-build#uat-6)_ _(criterion-id: uatc_a011b79159dd94012486cb91)_ _(revision-id: uatr1:5d6b5456e5a878fa)_ _(previous-revision-id: uatr1:776452095f26ccde)_
   Shown the pre-filled command, the owner accepts its FORM — specifically the
   `pnpm ` prefix the composer emits (`pnpm storytree story build <id> --real --store pg`), which
   ADR-0174's own text does not write and which open modeling call 1 explicitly left to the owner.
   **Success —** the owner's substantive acceptance of the invocation form. *(Split out of the old leg 4
   by this pass. Human on a NO-COMPILER basis: whether the command RUNS compiles — anyone can execute it —
   but whether this is the invocation the owner wants on their shell is an owner value call no code can
   decide. This basis dissolves under neither a new harness nor cheaper spend; it is discharged only when
   the owner settles the prefix.)*
7. **Pressing Enter runs a real, billed build from the seeded command.** _(witness: human)(detail: map-terminal-build#uat-7)_ _(criterion-id: uatc_00996f29a26216200b5a5c92)_ _(revision-id: uatr1:4078c6a341e1688e)_ _(previous-revision-id: uatr1:57583a6171feb4ca)_
   The owner presses Enter on the pre-filled command in the native shell; a
   real build runs as their own Claude Code and — for a story-scope seed — opens the auto-merging PR
   (ADR-0136). **Success —** the owner's verdict that the seeded command launched the build they intended.
   *(Split out of the old leg 4 by this pass. Human on a SPEND + OUTWARD-FACING basis: real metered
   subscription spend and an auto-merging PR that leaves the repo; an agent must never fire it unattended.
   That basis is honest but NARROW, and it is stated so it can be retired honestly: it dissolves the
   moment the spend and the PR do — the same walk against a `--dry-run` seed carries no judgment a machine
   could not make, and would belong on leg 4.)*

End state — on the desktop, a Build click on the forest map composes the right `pnpm storytree … build
--real --store pg` command and seeds it pre-filled (un-run) into the embedded terminal for the user to run
as real Claude Code; off the desktop, the existing dispatch is unchanged. The two caps' behaviours are
signed under the studio suite (the dock-side fresh-tab seed handling by `terminal-tabs`'
seed-opens-new-tab), the integrated real-bridge pre-fill machine-observable in the Electron harness (leg 4,
not yet written), and only the invocation form and the billed run left operator-attested (legs 6, 7) — the
prove-it-gate leaf and the spine untouched, the app composing intent while the real tool runs the build.

## Proof

The story is proven when that walkthrough passes — the mechanics legs (1, 3) green under this story's two
capabilities' signed `--real` verdicts, leg 2 under `terminal-tabs`' consumed seed-opens-new-tab verdict
and leg 5 under this story's own `mbt-without-bridge-dispatches-as-today` (with each cap's contracts green
underneath), leg 4 green under a still-to-be-written Electron `_electron` spec over the real bridge, and
the two owner-judgment legs (6, 7) operator-attested. Per
ADR-0020, `healthy` is only ever DERIVED from signed verdicts; nothing here is authored healthy. Both
capabilities are proof-wired (each carries a `proof:` block with a `real:` arm — a NET-NEW red→green for the
composer, edit-existing red→green for the button re-point) so the spine can drive their studio vitest suites
red→green under its own gate; the
story's machine-driven UAT node is WITHHELD (its `uat_witness` is absent → human, ADR-0040), so driving
those capabilities to signed verdicts is what makes the re-point buildable, and the crown additionally
awaits the operator's attestations (legs 6, 7 — legs 4 and 5 were re-adjudicated to `machine` on
2026-07-25, ADR-0209 D8).

## Open modeling calls (for the owner / orchestrator)

None is a story-shape fork (ADR-0174 settled the WHAT — the map click composes the command and seeds the
terminal; owner-directed, no ADR reserved). Three items are **surfaced for the orchestrator's build**, not
decided here:

1. **The `pnpm ` prefix on the seeded command (orchestrator-settled from a verified fact; operator-attested
   at UAT leg 6).** ADR-0174's text writes bare `storytree … build <id> --real`, but the orchestrator
   verified the embedded terminal spawns the platform shell (PowerShell on Windows) at the pinned-main
   runtime worktree root (ADR-0181; `apps/desktop/electron/main.ts` `cwd: serveRoot`), where a bare
   `storytree` is not on `PATH` but `pnpm storytree …` IS the documented, runnable invocation (CLAUDE.md).
   So `compose-build-command` composes `pnpm storytree … build <id> --real --store pg` — the RUNNABLE form
   (ADR-0174's whole point is a command the user can actually run). This stays operator-attested at UAT leg
   6 — the leg the 2026-07-25 re-adjudication split out precisely to carry this one no-compiler call: the
   pre-fill is editable, and if the owner keeps a global `storytree` bin, dropping `pnpm ` is a one-token
   edit to that one function + its `cbc-*` contracts.
2. **An Adopt re-point (a deliberate follow-on, NOT scoped here).** This story re-points only the Build
   button. A `mapped` story's Adopt (`api.adopt`, observe-and-sign) could similarly seed a `storytree adopt
   <id> --pg` command into the terminal — a different command shape and a different owner call. It is left
   as a follow-on: pick it up only if the owner asks, mirroring this story's compose→seed pattern for the
   adopt shape.
3. **The `node-build.test.ts` REAL-buildable snapshot companion edit (DONE, historical).** Authoring these
   `real:`-armed caps made `buildableNodeIds()` discover them (spec-borne, ADR-0057), which the
   `packages/cli/src/node-build.test.ts` REAL-buildable snapshot regex + its per-story discovery comment pin
   exactly (the known "node-build snapshot trap"). `compose-build-command` (after `colour-by-subagent`) and
   `map-build-seeds-terminal` (after `local-credential-wiring`) sit in that regex. The third cap,
   `terminal-dock-seed`, was added then **removed** when `terminal-tabs`' seed-opens-new-tab superseded it
   (ADR-0186) and its spec was retired — the same `packages/cli` test edit, outside the `stories/**` fence,
   lands its removal from the regex + the map-terminal-build discovery comment.
