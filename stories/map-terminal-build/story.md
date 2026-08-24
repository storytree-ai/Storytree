---
id: "map-terminal-build"
tier: story
title: "Clicking Build on the forest map seeds a runnable command into the embedded terminal — on the desktop, instead of an in-app dispatch"
outcome: "Clicking Build on a node or story on the forest map — on the desktop, where the embedded terminal exists — composes the corresponding `storytree … build <id> --real --store pg` command and SEEDS it pre-filled (never auto-run) into the embedded terminal, ready for the user to run as their own real Claude Code — instead of dispatching an in-app SDK-driven build; where the terminal bridge is absent (hosted/dev studio, a plain browser) the existing dispatch is unchanged."
status: retired
proof_mode: UAT
# RETIRED by ADR-0404 (2026-08-21), in the arc `retire-ui-build-dispatch-arc`. This whole story is a
# behaviour of the forest map's **Build** button, and that button is gone: dispatching a build is a
# CLI verb now (`storytree node build` / `storytree story build`), so there is no click left to
# re-point at the terminal. The seed was only ever a nicer way to reach the command line — you now
# start there, which is the same destination by a shorter road.
#
# Both capabilities retired with it, and their `real:` proof arms were REMOVED rather than repointed:
# `compose-build-command` was proven by `apps/studio/src/lib/buildCommand.ts` and
# `map-build-seeds-terminal` by `apps/studio/src/components/BuildSection.tsx`, and ADR-0404 D4 deleted
# both files. A proof binding naming a deleted target is exactly what `contract-binding-drift` and the
# coverage drain's `unbound` axis fire on, so retiring is the sanctioned drain (ADR-0252 D3 forbids
# raising a ceiling instead). Contracts and prose are kept as authored history.
#
# NOT retired with it — the dock still does its half. `TerminalDock` still ACCEPTS a `seed` and opens
# a fresh tab for one (`terminal-tabs` / `seed-opens-new-tab`, ADR-0186); only the map-side PRODUCER
# is gone. Anything that wants to pre-fill the terminal can still do so.
# uat_witness ABSENT → human (ADR-0040 fail-closed signpost): the story-level crown still rests on an
# owner judgment, so the machine-driven story UAT node stays WITHHELD. Re-adjudicated 2026-07-25
# (ADR-0209 D8): the human residue is NARROWER than first authored. It is NOT "the pre-fill lands in the
# native shell" (a harness statement — the Electron `_electron` harness already drives the real
# `window.desktopTerminal` bridge, see leg 4) and NOT "the bridge-absent surface is unchanged" (already a
# signed contract — `mbt-without-bridge-dispatches-as-today`; the story leg that restated it was leg 5,
# deleted by the ADR-0294 D2 pass on 2026-08-20). What genuinely had no compiler was the owner's acceptance
# of the INVOCATION FORM the composer emitted (leg 6). ALL SEVEN ORDINALS ARE NOW BURNED: legs 4, 6 and 7
# were deleted 2026-08-24 under ADR-0396 D1 (the retired-story disposition), so this story declares ZERO
# UAT criteria and there is no attestation left to wait on. (This block ended "the owner's verdict on a
# real, BILLED, PR-opening run (leg 7). The crown derives from the two capabilities' signed verdicts …
# plus those two attestations" — leg 7 had already flipped to `machine` on 2026-08-13 under ADR-0348 D2/D3,
# and both capabilities are themselves retired, so nothing rolls up here at all. Corrected in place per
# ADR-0139.)
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

This story is the build follow-on of **ADR-0174**
(owner-directed 2026-07-09, born accepted per ADR-0110 — design-time alignment IS the ratification), whose
**map-spawn re-point clause** (amends ADR-0137)
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
  `useState` + a prop pass-through, so it was witnessed under UAT leg 4, not asserted in CI. (Re-adjudicated
  2026-07-25: leg 4 became `witness: machine`, so the glue was witnessable by the Electron harness
  end-to-end rather than only by an operator's eye — it stayed un-asserted glue in CI either way.
  **Nothing witnesses it now**: leg 4 was deleted 2026-08-24 under ADR-0396 D1, and the glue itself went
  with `BuildSection.tsx` under ADR-0404 D4 — there is no wire left to witness. Corrected in place per
  ADR-0139.) (Both
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

**⚠ THIS STORY DECLARES NO UAT CRITERIA. Ordinals 1–7 are all BURNED** — 1, 2, 3 and 5 by the ADR-0294
D2 pass (2026-08-20), and 4, 6 and 7 by the ADR-0396 D1 retired-story disposition (2026-08-24). **Read
every dated blockquote below as HISTORY, not as a live posture.** Each records honestly what was
decided at the time and is kept under ADR-0396 D3, but every present-tense claim about a surviving
leg, its witness tag, its binding or its redness has been overtaken by the deletion — the note above
the (now empty) list is the current statement, and it is the one to trust. Corrected in place per
ADR-0139 rather than rewriting the record of what each pass actually found.

The integrated acceptance walkthrough that proved the whole re-point met its outcome end-to-end was
minimal-first (one coherent journey: on the desktop, click Build → a runnable command appears
pre-filled in the terminal → the user runs it as real Claude Code; off the desktop, Build is
unchanged), defect-driven thereafter. It is dissolved: the **Build** button it walked was deleted by
ADR-0404 D4.

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
> spend + outward-facing). **RE-TRIAGED 2026-08-13 (ADR-0357): leg 7 FLIPPED to `machine`.** Only leg 6
> was ever a no-compiler claim; leg 7's stated basis was spend + outward-facing, both withdrawn by
> ADR-0348 D2/D3, and the leg's own prose had already recorded that it "dissolves the moment the spend
> and the PR do". It is now bound to the model-driven gate 1 under "Reliability Gates", leaving ONE
> human leg on this story. The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed
> signpost), so the machine-driven whole-story UAT node stays WITHHELD; the crown derives from the per-cap
> signed verdicts plus the operator's attestations (legs 6, 7). Per ADR-0209 §6 every re-adjudicated leg
> returns to UNSTAMPED until judged — a `machine` tag here asserts which witness is RIGHT, never that the
> proof exists.
>
> **ADR-0294 D2/D4 pass, 2026-08-20 — four legs are DELETED, and the one surviving machine journey leg is
> declared UNBOUND.** The paragraph above states the deletion criterion and then does not act on it: legs
> 1, 2, 3 and 5 each restated proof that already exists one rung down and named it in their own success
> clauses, which is exactly ADR-0294 D2's case. Leg 1's composition is proven by the capability
> [`compose-build-command`](compose-build-command.md) at `apps/studio/src/lib/buildCommand.test.ts` —
> `cbc-composes-story-real-build`, `cbc-composes-node-real-build`, `cbc-embeds-the-unit-id-verbatim`. Leg
> 2's fresh-tab pre-fill is proven by `terminal-tabs`' consumed capability
> [`seed-opens-new-tab`](../terminal-tabs/seed-opens-new-tab.md) at
> `apps/studio/src/components/TerminalDock.test.tsx` — `son-seed-opens-a-fresh-tab`,
> `son-seed-never-touches-active-session`, `son-pre-spawn-seed-writes-on-resolve`,
> `son-token-bump-opens-another-fresh-tab`, `son-prefills-without-trailing-newline`,
> `son-absent-seed-is-a-no-op`. Legs 3 and 5 are BOTH proven by the capability
> [`map-build-seeds-terminal`](map-build-seeds-terminal.md) at
> `apps/studio/src/components/BuildSection.test.tsx` — `mbt-desktop-build-seeds-not-dispatches`,
> `mbt-seeds-scoped-command`, `mbt-without-bridge-dispatches-as-today`, `mbt-adopt-path-unaffected` — and
> leg 5's own text already said so, calling itself "the same assertion leg 3 already carries … not a second
> obligation", which makes it a restatement of a restatement. All four were checked against those tests'
> ACTUAL assertions, not their file existence (ADR-0294 D2's honesty wall). Ordinals **1**, **2**, **3**
> and **5** are BURNED, not renumbered. This story now carries **TWO** `machine` legs (4, 7) and ONE
> `human` leg (6).
>
> **Leg 4 is BOUND to `map-terminal-build#gate-2` (2026-08-22), and RED until it is driven.** Until then
> it stood unbound, and this paragraph read: *"**No gate is minted for it** — answering an unbound leg with
> a freshly minted check is the rubber stamp ADR-0097 §2 forbids and the exact reflex ADR-0294's end state
> point 4 names. What binds it is a real instrument: that spec landing AND a standing `observe` gate
> reading what it persists, or ADR-0295 D1's model-driven executor, already the shape of gate 1."* That
> sentence named the two honest instruments and then took NEITHER; gate 2 below takes the second. It is
> not the minted rubber stamp the same sentence forbids, and the difference is decidable rather than a
> matter of taste: a drive-witness gate cannot exit 0 without a `pass` drive record for THIS criterion's
> CURRENT revision, at a commit in HEAD's ancestry, inside 90 days. So the leg is now honestly RED rather
> than unprovable — and the unbound state it left behind was never local to leg 4, because `runAdopt`
> resolves EVERY real machine leg before signing any, so this one leg refused the story's whole
> UAT-signing pass, bound sibling leg 7 included. **Binding is not driving.** No drive has been run for
> leg 4 and none is implied here; ADR-0405 D4 leaves a red check red rather than re-driving to chase a
> pass.
>
> **Legs 3 and 4's `(witness:)` tags were LINE-BROKEN and therefore parsed as `either`, not `machine`.**
> `_(witness:` ended one line and `machine)_` began the next, so `parseUatTestCriteria` fell back to the
> undecided `either` and both were invisible to every machine-leg census — this story held HALF the
> corpus's four such legs. Leg 3 is deleted above; leg 4's tag was rejoined in the same change, with no
> change to its authored claim.

**Goal —** A desktop user on the forest map clicks Build on a node or story; the corresponding `storytree
… build <id> --real --store pg` command appears **pre-filled** (expanded, un-run) in the embedded terminal;
the user reviews it and presses Enter to run a real build as their own Claude Code — instead of an in-app
SDK-driven dispatch. Where the terminal is absent, clicking Build dispatches the in-app build exactly as
before.

> **~~Legs 4, 6 and 7.~~ DELETED 2026-08-24 under ADR-0396 D1. This story now declares NO UAT test
> criteria, and every ordinal 1–7 is BURNED.** `map-terminal-build` is `status: retired` (ADR-0404,
> 2026-08-21): the forest map's **Build** button is gone, dispatching a build is a CLI verb, and this
> whole story was a behaviour of that click. A retired story has withdrawn its outcome, so its
> acceptance steps are obligations against a journey nobody will run and no instrument will ever
> discharge (ADR-0396 D1). Legs 1, 2, 3 and 5 were already burned by the ADR-0294 D2 pass on
> 2026-08-20; these three complete the set. All three keys are recorded `superseded` in
> [`stories/uat-legacy-dispositions.json`](../uat-legacy-dispositions.json), and no
> `map-terminal-build#uat-n` key can ever denote a second criterion.
>
> **This is the CLEAN case of the three stories in this pass** — ADR-0437's fence never engages,
> because none of the three held a signed verdict in `events.verdict` or any attestation (`proven=–`
> across the board, verified live 2026-08-24). No proof was destroyed and no green was lost.
>
> **What each leg carried, kept here rather than lost with it (ADR-0396 D3):**
>
> - **Leg 4** (`uatc_865913dcc84077215e5b7175`, machine, gate 2) was the INTEGRATED walk over the real
>   `window.desktopTerminal` bridge — the only leg that exercised the ADR-0158 TreeView `seed` glue
>   that all three capability verdicts stopped short of. Its `_electron` spec was never written; it was
>   bound to gate 2 on 2026-08-22 and honestly RED, never driven. The glue it named went with
>   `BuildSection.tsx` under ADR-0404 D4, so there is nothing left to walk.
> - **Leg 6** (`uatc_a011b79159dd94012486cb91`) was this story's LAST `human` leg — the owner's
>   acceptance of the invocation FORM, specifically the `pnpm ` prefix the composer emitted. Its
>   witness-basis was genuine (no compiler decides which prefix the owner wants on his own shell) and
>   it never dissolved under a harness or cheaper spend; it dissolved because
>   `apps/studio/src/lib/buildCommand.ts` was deleted with the capability `compose-build-command`, so
>   there is no composer and no emitted prefix to accept. See open modeling call 1 below, corrected in
>   the same change.
> - **Leg 7** (`uatc_00996f29a26216200b5a5c92`, machine, gate 1) was the billed run — pressing Enter on
>   the pre-filled command in the native shell and reaching the build's own end state. It has the
>   richest drive history in this pass and it is worth reading correctly: ONE `pass` record
>   (2026-08-13 @`d9a6e594`, `claude-code`) at revision `uatr1:dd5f5524dcb94f70`, then TEN `fail`
>   records between 2026-08-20 and 2026-08-21 at the CURRENT revision `uatr1:047bf26a3a172de9`. The
>   pass is bound to a superseded revision and never counted toward `proven`; the ten fails are the
>   honest record of a journey that stopped working before the story was retired.
>
> **The drive rows all STAY** (ADR-0437 D3). `events.uat_drive` is append-only history of what was
> actually walked and when; because `rollupCriterionStatus` walks corpus→verdict, rows naming a deleted
> criterion simply stop being looked up and no rung reds. They are the reason a later reader can
> reconstruct that leg 7 was driven eleven times.

**This story declares NO UAT test criteria.** Ordinals 1–7 are all burned — 1, 2, 3 and 5 by the
ADR-0294 D2 pass (2026-08-20), and 4, 6 and 7 by the ADR-0396 D1 disposition (2026-08-24). Under
ADR-0294 D5 a story may declare zero criteria and green honestly on the ADR-0085 own-proof union;
here both capabilities are retired too, so nothing is claimed at any tier.

End state — on the desktop, a Build click on the forest map composes the right `pnpm storytree … build
--real --store pg` command and seeds it pre-filled (un-run) into the embedded terminal for the user to run
as real Claude Code; off the desktop, the existing dispatch is unchanged. The two caps' behaviours are
signed under the studio suite (the dock-side fresh-tab seed handling by `terminal-tabs`'
seed-opens-new-tab). **The story asserts none of this any more** — it is `status: retired` (ADR-0404), the
Build button and both capabilities' proof targets are deleted, and all seven UAT ordinals are burned as of
2026-08-24 (ADR-0396 D1). The paragraph is kept as the authored description of the journey, not as a live
end state. *(It continued "the integrated real-bridge pre-fill machine-observable in the Electron harness
(leg 4, not yet written), the billed run model-driven under gate 1 below (leg 7), and only the invocation
form left operator-attested (leg 6) — the prove-it-gate leaf and the spine untouched, the app composing
intent while the real tool runs the build", and before 2026-08-13 named legs 6 and 7 together as
operator-attested. All three legs are gone; corrected in place per ADR-0139.)*

## Reliability Gates

> ⚠ **BOTH GATES ARE NOW UNCLAIMED BY ANY CRITERION (2026-08-24, ADR-0396 D6 / ADR-0437 D6), and
> neither may be deleted or renumbered.** Gate 1 bound leg 7 and gate 2 bound leg 4; both legs were
> deleted under ADR-0396 D1. Gate ids are minted from 1-based POSITION, so removing one silently
> re-points already-signed verdicts and surviving `(proof-gate:)` bindings — `terminal-tabs` gates 1
> and 3 are the standing precedent for retained-but-unclaimed gates. **Expect both commands to exit 1
> on the DECLARATION now, not on the product**: `uat-drive-witness.check.ts` resolves the criterion id
> in the story first, so it reports *"story declares no criterion `uatc_…`"*. That is the honest
> consequence of an unclaimed drive-witness gate and is not a defect to chase — it is also why no drive
> can ever produce a record for either again.

**Gate 1 is the story's FIRST gate (2026-08-13, ADR-0348 D2/D3 / ADR-0357).** Gate ids are positional
(`asset:edit-story-uat-criteria` step 2), so anything added later APPENDS as gate 2 — never inserted,
never renumbered, or already-signed verdicts and surviving `(proof-gate:)` bindings are silently
re-pointed. It carries no `(covers:)`: it proves a JOURNEY, not a capability, and adding it to a
`(covers:)` list would let an observe-and-sign `adopt` pass green a capability that never went red
(ADR-0085 / ADR-0097).

**The gate neither drives nor spends.** The drive is deliberately out-of-band —
`pnpm --filter @storytree/drive exec node --import tsx src/uat-drive.run.ts map-terminal-build <criterion-id>`
spawns a fresh subscription-funded session that walks the authored journey against the real packaged app
and appends a record to `events.uat_drive`; ADR-0010 §5 keeps that off every gate path. The gate is the
cheap standing WITNESS of that persisted artifact, and the spine still mints the verdict over the exit
code IT watched, so ADR-0295 D2's *no model signs its own verdict* holds with the signing path
unchanged. It goes red — honestly — when no `pass` record exists for the criterion's CURRENT
`revision-id`, when the driven commit is not in HEAD's ancestry, or when the newest record is older than
90 days (the ADR-0016 ageing floor).

1. **UAT leg 7 — "pressing Enter runs a real, billed build from the seeded command" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts map-terminal-build uatc_00996f29a26216200b5a5c92`.
   Witnesses that a model pressed Enter on the pre-filled command UNMODIFIED in the native shell and
   observed the real build it names run to its own end state — for a story-scope seed, through the
   auto-merging PR (ADR-0136). It does NOT witness leg 6: whether this is the invocation FORM the owner
   wants is a value call with no compiler and stays `human`.
   **The walk IS a real build**, so the driver needs `STORYTREE_UAT_DRIVE_TIMEOUT_MIN` raised well past
   its 30-minute default; a cut-off run emits no report and is recorded as a MISS.

**Gate 2 is NEW (2026-08-22, `machine-uat-signing-gap-arc-inc-02`) and was APPENDED — gate 1 kept its
ordinal.** Gate ids are positional (`asset:edit-story-uat-criteria` step 2), so inserting or renumbering
would silently re-point already-signed verdicts and surviving `(proof-gate:)` bindings. It carries no
`(covers:)`: it proves a JOURNEY, not a capability. It is the same neither-drives-nor-spends witness gate 1
is, on the same honesty terms, and it is RED until a drive is run — which is the point rather than a
defect. It exists because leg 4's unbound state was never local to leg 4: `runAdopt` resolves EVERY real
machine leg before signing any, so one unbound leg refused this story's whole UAT-signing pass, bound leg 7
included.

2. **UAT leg 4 — "clicking Build drops a runnable command into the REAL terminal, pre-filled and NOT run" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts map-terminal-build uatc_865913dcc84077215e5b7175`.
   Witnesses that a model clicked Build on a node or story in the REAL desktop app and observed the
   composed command travel the TreeView `seed` glue to the real `window.desktopTerminal` bridge, land in a
   fresh tab, and sit there UN-EXECUTED — the integrated walk over the real seam that the three capability
   verdicts all stop short of. It does NOT witness leg 6 (the invocation FORM is a value call with no
   compiler and stays `human`), and it does not witness leg 7, which has gate 1 above.

## Proof

**The story declares NO UAT criteria and there is no walkthrough left to pass.** It is `status: retired`
(ADR-0404) and both its capabilities retired with it, so nothing is claimed at any tier. *(This read "The
story is proven when that walkthrough passes — leg 4 green under a still-to-be-written Electron
`_electron` spec over the real bridge, leg 7 green under the model-driven gate 1 above, and the ONE
owner-judgment leg (6) operator-attested." All three legs were deleted on 2026-08-24 under ADR-0396 D1;
corrected in place per ADR-0139.)* The mechanics that stood as legs 1, 2, 3 and 5 are proven one
rung down and no longer sit here as story criteria: composition under this story's
[`compose-build-command`](compose-build-command.md), the desktop seed branch and the bridge-absent
dispatch under its [`map-build-seeds-terminal`](map-build-seeds-terminal.md), and the dock's fresh-tab
pre-fill under `terminal-tabs`' consumed [`seed-opens-new-tab`](../terminal-tabs/seed-opens-new-tab.md) —
each capability's own contracts green underneath. *(This sentence enumerated legs 1, 2, 3 and 5 as story
criteria; the ADR-0294 D2 pass deleted them on 2026-08-20. It earlier read "and the two owner-judgment legs
(6, 7) operator-attested"; that half was corrected in place per ADR-0139 when ADR-0348 D2/D3's triage
flipped leg 7 on 2026-08-13 — leg 7 was never an owner judgment, as its own prose said.)* Per
ADR-0020, `healthy` is only ever DERIVED from signed verdicts; nothing here is authored healthy. Both
capabilities are proof-wired (each carries a `proof:` block with a `real:` arm — a NET-NEW red→green for the
composer, edit-existing red→green for the button re-point) so the spine can drive their studio vitest suites
red→green under its own gate; the
story's machine-driven UAT node is WITHHELD (its `uat_witness` is absent → human, ADR-0040), so driving
those capabilities to signed verdicts is what makes the re-point buildable, and the crown additionally
awaits the operator's ONE attestation (leg 6 — legs 4 and 5 were re-adjudicated to `machine` on
2026-07-25, ADR-0209 D8, and leg 7 on 2026-08-13, ADR-0357).

## Open modeling calls (for the owner / orchestrator)

None is a story-shape fork (ADR-0174 settled the WHAT — the map click composes the command and seeds the
terminal; owner-directed, no ADR reserved). Three items are **surfaced for the orchestrator's build**, not
decided here:

1. **The `pnpm ` prefix on the seeded command (orchestrator-settled from a verified fact; operator-attested
   at UAT leg 6).** ADR-0174's text writes bare `storytree … build <id> --real`, but the orchestrator
   verified the embedded terminal spawns the platform shell (PowerShell on Windows) at the pinned-main
   runtime worktree root (ADR-0181; `apps/desktop/electron/main.ts` `cwd: serveRoot`), where a bare
   `storytree` is not on `PATH` but `pnpm storytree …` IS the documented, runnable invocation (CLAUDE.md).
   So `compose-build-command` composed `pnpm storytree … build <id> --real --store pg` — the RUNNABLE form
   (ADR-0174's whole point is a command the user can actually run). **MOOT since 2026-08-24 — checked
   BEFORE the deletion, not after (ADR-0396's Consequences).** This item read "This stays
   operator-attested at UAT leg 6 — the leg the 2026-07-25 re-adjudication split out precisely to carry
   this one no-compiler call", and leg 6 was deleted under ADR-0396 D1. **The deletion does not ANSWER
   this call and must not be read as answering it.** The call dissolves because its SUBJECT is gone:
   `compose-build-command` was retired with this story and ADR-0404 D4 deleted
   `apps/studio/src/lib/buildCommand.ts`, so no composer emits a prefix for the owner to accept or
   reject. If a Build-shaped affordance ever composes a command again, the prefix question returns with
   it and belongs to whichever live story owns that composer. Corrected in place per ADR-0139.
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
