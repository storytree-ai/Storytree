---
id: "embedded-terminal"
tier: story
title: "The desktop app embeds a real local terminal — run Claude Code in-app, watched by the existing seams"
outcome: "The desktop app embeds a real local terminal — xterm.js in the renderer over a node-pty pseudo-terminal in the Electron main — docked with the same collapse/resize affordance the retired chat had, so the user runs REAL Claude Code in-app as their interactive build surface, and the observability layer watches that session through the existing presence-hook / noticeboard-claim / store-verdict seams exactly as it watches any Claude Code session — no new observer code required."
status: proposed
proof_mode: UAT
# uat_witness ABSENT → human (ADR-0040 fail-closed signpost). RE-ADJUDICATED 2026-07-26 (ADR-0209 §8
# corpus-wide migration, owner-directed 2026-07-25): the whole-story UAT resolves to SIX `machine` legs
# and TWO `human` legs; no leg is model-judged (nothing here turns on semantic judgment of prose or
# artifacts, so the model rung genuinely does not apply). The native-module, live-store and structural
# legs are `machine` — a real node-pty, a real xterm and a real claim row are all machine-observable
# through the EXISTING Electron `_electron` harness plus one live-gated spec; unharnessed, native, live
# and expensive are COSTS, never judgment gaps (`human-witness-is-a-judgment-gap-not-cost`). Exactly ONE
# leg stays `human`: driving the REAL PAID Claude Code subscription interactively (the owner's honesty
# wall — metered spend the proof spine must never burn unattended). The terminal's FEEL was a second
# human leg until ADR-0348 D6 (2026-08-11) DELETED it — a user EXPERIENCE property is not a user
# ACCEPTANCE criterion; the intent is carried in "What this story is NOT". The machine-driven story UAT
# node stays WITHHELD; the crown derives from the two capabilities' signed verdicts plus that one
# attestation.
# Capabilities, roots-first. TWO machine-provable caps on OPPOSITE sides of the contextBridge, each its
# own suite (the chat-sse-mount ↔ chat-panel precedent): pty-session-manager (the backend pty lifecycle,
# apps/desktop node:test over an injected fake pty) and terminal-dock-panel (the renderer xterm dock,
# apps/studio vitest over a mocked xterm + mocked bridge). They share the desktopTerminal WIRE SHAPE as a
# cross-boundary contract, not a code edge — so neither depends_on the other (both roots). The Electron
# main pty wiring + the preload bridge + the node-pty/xterm deps + the TreeView dock-slot swap are
# operator-attested GLUE within this story (ADR-0158), witnessed under the Story UAT, NOT capabilities.
capabilities: [pty-session-manager, terminal-dock-panel]
# Story-level cross-story edges (ADR-0010 §4 / ADR-0074). This story OWNS NO package — it is a VIRTUAL
# story (like app-guide / headless-orchestrator): its net-new code is CO-LOCATED inside two surface
# packages other stories own. So both edges are declared `depends_on` AND annotated `artifact_edges`
# (ADR-0166 — deliberate non-import / co-located-source edges, not @storytree/* package imports):
#   - desktop — the pty-session-manager module lives in apps/desktop/src/backend/, and the terminal's
#               Electron-main pty wiring + the `desktopTerminal` preload bridge + the node-pty dep are
#               desktop-surface glue. This story extends the `desktop` surface's package with co-located
#               source; it adds no NEW @storytree/* runtime import, so it is an artifact edge, not a
#               package-import edge. (Boundaries Rule 4 SKIPS a virtual story; artifact_edges keeps the
#               non-blocking ADR-0115 drift report clean — the app-guide precedent.)
#   - studio  — the xterm.js TerminalDock component lives in apps/studio/src/components/. The desktop
#               renders the COMPILED studio dist (ADR-0090 d.4), so the renderer terminal is a `studio`
#               frontend component, exactly as app-guide's caps edit apps/studio/src. Co-located
#               source, no NEW @storytree/* frontend import (xterm.js is a third-party dep, not a
#               cross-story edge) → an artifact edge.
# NO edge to notice-board / drive-machinery / forest-world: the observability layer watches the
# terminal's Claude Code through the ALREADY-EXISTING hook/CLI/store seams with ZERO new coupling — the
# whole ADR-0174 premise ("nothing new is required to observe it"). This story builds a terminal, not an
# observer; it consumes only the two surfaces its code sits in.
depends_on: [desktop, studio]
artifact_edges: [desktop, studio]
# Deciding ADRs (ADR-0037 §2): 0174 (the WHAT — embed a real local terminal, retire the in-app
# INTERACTIVE orchestrator/chat as the build surface; local pty NOW, cloud DEFERRED); 0175 (the chat
# SSE/dock/continuity/inspect infra stays DORMANT for a future app-guide, NOT deleted); 0070 (the
# two-stage frontend-builder proof — geometry/behaviour machine-proven, appearance operator-attested);
# 0158 (glue is un-asserted code WITHIN a story — the main pty wiring / preload bridge / deps / mount
# swap); 0010 (the organism model + the splitting-rule that tiers the two caps across the bridge); 0057
# (the spec-borne proof config making each cap inner-loop buildable); 0004 (the agent boundary — the
# terminal is the INTERACTIVE surface only; the prove-it-gate runtime binding is UNTOUCHED, and the
# renderer never imports @storytree/agent); 0142 (the presence claim + story wisp — the CLI seam that
# lights a wisp for the terminal's Claude Code session).
decisions: [174, 175, 70, 158, 10, 57, 4, 142]
---

# The desktop app embeds a real local terminal — run Claude Code in-app, watched by the existing seams

**Outcome —** The desktop app embeds a **real local terminal** — xterm.js in the renderer over a
**node-pty** pseudo-terminal in the Electron **main** process — docked with the SAME collapse/resize
affordance the retired chat had, so the user runs **real Claude Code in-app** as their interactive build
surface, and the observability layer watches that session through the **existing** presence-hook /
noticeboard-claim / store-verdict seams exactly as it watches any Claude Code session — **no new observer
code required**.

This story is the build follow-on of **ADR-0174**
(owner-directed 2026-07-09, born accepted per ADR-0110 — design-time alignment IS the ratification): the
desktop's value is the **observability layer over Claude Code** (the forest map, the wisps, session
presence, signed verdicts), **not** a re-implementation of Claude Code. The app grew a *second* in-app
**interactive** orchestrator (the SSE chat widget) that re-implemented, at strictly-worse fidelity,
affordances real Claude Code already ships — a permanent maintenance treadmill. ADR-0174 retires that
chat as the interactive build surface and gives the app a **terminal**: let the user run the real thing,
and keep the app pointed at what it is uniquely good at — **watching**.

## The journey (why this is ONE story — the journey-principle)

The consumer is the desktop user; their goal is **to run real Claude Code inside the app and have the map
watch it**. Finishing "a pty-backed terminal exists" leaves the user immediately needing "a visible
terminal in the dock" and then "run Claude Code in it and see the wisp light" — these are not separate
value deliveries, they are one continuous journey (the journey-principle: if finishing the first unit's
journey leads the consumer straight to needing the next, they are the same journey). The outcome states
the value in one sentence: *the user runs real Claude Code in an embedded local terminal, watched by the
existing seams.* The "watched by the seams" is not a second thing to BUILD — it is the pre-existing
observability layer, exercised in the UAT, requiring zero new code (ADR-0174's central premise). So this
story's **net-new** is the terminal (a backend pty lifecycle + a renderer xterm dock, joined by glue);
the watching rides for free.

## What this story is NOT (the walls — encode from the ADRs)

- **It replaces the interactive orchestrator, NOT the prove-it-gate (ADR-0174 CRITICAL scoping note).**
  Signed `--real` verdicts still come **only** from the deterministic spine driving the selected
  `PhaseAuthor` — `ClaudeAgentAuthor` is the compatibility default and `--runtime codex` opts into
  `CodexPhaseAuthor` — through the `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`
  walk (`packages/orchestrator/src/prove-it-gate.ts` etc.) — i.e. `story build --real` /
  `node build --real`. The selected live leaf is **entirely separate** from the interactive surface and
  is
  **UNTOUCHED** by this story. Whether a human fires `story build --real` **from this terminal** or a
  headless job fires it, the proof path is identical. This story changes the *interactive runtime*, never
  the *proof runtime* (ADR-0020 / ADR-0030 / ADR-0011 / ADR-0091 all untouched). It also does NOT license
  gate-landing as a substitute for the crown — hand-editing in the terminal + `pnpm gate` + a PR does NOT
  produce a signed `--real` verdict (the caps stay `unregistered` — the known "gate-land skips `--real`
  verdicts" trap; ADR-0174 Consequences).
- **LOCAL pty ONLY (ADR-0174 Scope).** This is the *local* embedded terminal. **Cloud / backing-container
  web terminals** (Cloud-Shell / Gitpod-Ona / Codespaces-style per-user compute running Claude Code
  server-side) are explicitly **DEFERRED as a separate, separately-costed decision** — they raise their
  own hard questions (per-user compute + provisioning, idle-timeout, whose Claude Code billing funds a
  member's session) this story does NOT settle. Consequently hosted studio members stay
  watch-and-comment only until cloud terminals land (ADR-0174 redirects ADR-0117's member-build threads
  to that future decision). Do NOT scope cloud terminals into this story.
- **Repurpose, don't delete the chat infra (ADR-0175).** Retiring the interactive orchestrator leaves its
  SSE transport, dock/resize UI, cross-turn continuity, read-only CI/git inspect surface, and the SDK
  session engine (`packages/agent/src/headless-orchestrator.ts`) in the tree. **ADR-0175** repurposes
  them into a future `app-guide` help/setup agent — so this story does NOT delete them and does NOT
  touch their behaviour. Concretely: `ChatDock.tsx` / `ChatPanel.tsx` stay in the studio bundle,
  behaviourally **DORMANT** (their vitest suites stay green). The terminal dock takes the interactive
  dock SLOT; the chat components are not ripped out.
- **The terminal's FEEL is design intent, not a UAT leg (ADR-0348 D6, 2026-08-11).** It used to be
  story UAT leg 7 and was DELETED: a user EXPERIENCE property is not a user ACCEPTANCE criterion, and
  the owner's feedback on it comes from USING the terminal, not from a gate. The intent stands and is
  recorded here — **colours, glyph rendering, the dock chrome and the terminal body should read as ONE
  coherent terminal inside the native shell, not a web widget imitating a terminal.** Leg 6
  machine-proves the mechanics underneath it (scrollback retention, reflow on resize, control keys,
  a session surviving collapse/expand); none of those is the felt claim, and no leg carries the felt
  claim now. The honest cost, stated rather than hidden: nothing records whether anyone has looked.

## Capabilities (2)

Listed roots-first. Both are independent roots (see the within-story graph): they sit on OPPOSITE sides
of the `desktopTerminal` contextBridge and prove different observables in different suites — the
`chat-sse-mount` (desktop) ↔ `chat-panel` (studio) precedent, here inside ONE story.

| # | capability | outcome | proof | depends on |
|---|------------|---------|-------|------------|
| 1 | [`pty-session-manager`](pty-session-manager.md) | The Electron-main pty lifecycle manager spawns / writes-input / resizes / disposes / routes-data for one or more terminal sessions over an INJECTED pty factory, isolating sessions and failing closed on an unknown/disposed id. | integration-test (apps/desktop node:test, red→green over a fake pty) | — |
| 2 | [`terminal-dock-panel`](terminal-dock-panel.md) | The renderer xterm.js terminal mounts in a collapse/resize dock (the same affordance ChatDock had), spawns over the `desktopTerminal` bridge on open, pipes bridge data into the terminal and terminal input back to the bridge, resizes with the dock, and degrades honestly to a disabled "terminal unavailable here" state where the bridge is absent. | integration-test (apps/studio vitest jsdom, red→green over a mocked xterm + mocked bridge) | — |

## Operator-attested glue (un-asserted connective code WITHIN this story — ADR-0158, NOT capabilities)

These pieces have **no isolatable red→green seam at the CAPABILITY tier** — a `node:test` that spawned a
real node-pty (a native module) or drove a real Electron window would be the live-native trap the machine
caps deliberately avoid (the pty-session-manager is Electron-free and pty-native-free by construction; the
terminal-dock-panel mocks xterm + the bridge). They are witnessed under the **Story UAT**, exactly as the
`desktop` story models its `backend-entry.ts` sidecar wiring and its `desktopAuth` preload:

> **Glue-ness is a TIERING call, not a witness kind (corrected 2026-07-26, ADR-0209 §8).** This section
> previously read as if "glue" implied `witness: human`. It does not. A piece is glue because it has no
> isolatable capability-tier red→green; the Story-UAT leg that witnesses it is classified on its own
> merits, and the integrated Electron `_electron` Playwright harness (`apps/desktop/e2e/`) DOES drive a
> real node-pty and a real renderer end-to-end. So most of this glue is witnessed by `machine` UAT legs
> (1, 4, 6, 8) — "no CI leg exists for it yet" was never a reason to call a claim human
> (`human-witness-is-a-judgment-gap-not-cost`).

- **The real node-pty adapter + the pty IPC in the Electron main** (`apps/desktop/electron/main.ts`): the
  concrete `node-pty` implementation of the pty-session-manager's injected `PtyPort`, the
  `ipcMain.handle("terminal:spawn" | "terminal:write" | "terminal:resize" | "terminal:dispose")`
  handlers driving the manager, and the `webContents.send("terminal:data" | "terminal:exit", …)` stream
  back to the renderer. The manager (cap 1) is the provable core; this is the real-pty binding.
  *(ADR-0189 adds the re-attach slice: `ipcMain.handle("terminal:list")` — the manager's live sessions
  FILTERED to the currently-selected repo's cwd, the per-repo ownership policy — and
  `ipcMain.handle("terminal:snapshot")` relaying the manager's serialized screen state
  `{ data, cols, rows }` (ADR-0190 — the headless-terminal serialization, replacing the ADR-0189 raw
  buffered scrollback); window-close / app-quit keep `disposeAllTerminals` — with unmount no longer a
  kill, the app lifecycle is the reap.)*
- **The `desktopTerminal` contextBridge** (`apps/desktop/electron/preload.ts`): a NEW
  `contextBridge.exposeInMainWorld("desktopTerminal", { spawn, write, resize, dispose, onData, onExit })`
  bridging renderer → `ipcRenderer.invoke`/`.on` → main — the EXACT pattern of the existing `desktopAuth`
  / `desktopApply` bridges. Its mere presence (`window.desktopTerminal`) is how the renderer
  feature-detects the desktop host (the `desktopApply`-presence precedent), driving cap 2's honest
  absent-bridge degradation. *(ADR-0189 adds `list` / `snapshot` members, and makes the preload's
  `onData`/`onExit` relays SINGLE-CONSUMER — one `ipcRenderer.on` registered at preload eval whose
  callback each `onData(cb)` call REPLACES — so a dock that unmounts and remounts across route changes
  never stacks duplicate listeners (N-times-repeated output after N route trips).)*
- **The native-module build wiring**: `node-pty` added to `apps/desktop/package.json` `dependencies` and
  `--external:node-pty` added to the `build:electron` esbuild (the `@napi-rs/keyring` precedent — a native
  module kept external from the CJS main bundle); `@xterm/headless` (+ `@xterm/addon-serialize`) added to
  `apps/desktop/package.json` `dependencies` (ADR-0190 — the pure-JS headless screen model the manager
  serializes for `snapshot`; no native rebuild surface, esbuild bundles them); and `@xterm/xterm`
  (+ `@xterm/addon-fit`) added to `apps/studio/package.json` `dependencies` (a new studio frontend dep).
  *(None of these deps can be declared via a cap `real.addDeps` arm — `resolveAddDepsGroup` only targets
  `packages/*`, never `apps/*`; verified `workspacePackageForSource("apps/studio/src/x.ts") → null`. So the
  deps are a glue prerequisite the orchestrator supplements BEFORE driving each cap's `--real` build; each
  cap's `install: true` then picks them up in the fresh worktree.)*
- **The dock-slot swap in `apps/studio/src/components/TreeView.tsx`**: mounting the terminal in the
  `.world-frame` where `<ChatDock onReloadTree={…}/>` used to sit. The terminal dock takes the interactive
  dock slot; ChatDock's component + tests stay in the tree DORMANT (ADR-0175). *(RESOLVED by the build,
  recorded 2026-07-26: the disposition chosen was **UNMOUNT** — `TreeView` mounts `<TerminalRepoGate …
  repoControl={<RepoPicker/>}/>` and imports only `TerminalDockSeed` as a type; `<ChatDock/>` is rendered
  nowhere in `apps/studio/src` outside `ChatDock*.test.tsx`, whose vitest suites stay green. The old "Open
  modeling calls" item asking unmount-vs-hide-vs-flag is closed below.)* There is no isolatable red→green
  in mounting an already-proven component, so it stays glue at the capability tier — but the mount IS
  observable in the integrated harness, so UAT leg 1 asserts it in CI rather than attesting it.

## Within-story dependency graph

Authored from the intended data-flow; re-derive from the real imports/calls when the units are built
(ADR-0010 §3) and correct if the code disagrees. The graph is acyclic; **both capabilities are roots**
(no in-story edge).

- `pty-session-manager` — a root. A self-contained Electron-main module over an injected `PtyPort`; it
  imports no other in-story unit.
- `terminal-dock-panel` — a root. It consumes the `desktopTerminal` bridge **WIRE SHAPE** (`spawn` /
  `write` / `resize` / `dispose` / `onData` / `onExit`), whose lifecycle SEMANTICS the
  `pty-session-manager` implements — but it imports **nothing** from the manager (they are across the
  contextBridge AND across packages). This is the `chat-panel` ↔ `chat-sse-mount` relationship exactly:
  they share the wire shape as a CONTRACT across the boundary, not a code edge, so there is **no
  `depends_on` edge**. A soft BUILD ordering (author the manager's wire shape first so the panel authors
  to the same verbs) is a convenience, not a data-flow dependency.

The two roots are joined only by the **operator-attested glue** above (the preload bridge + the main pty
wiring) — witnessed integrated under the Story UAT, exactly as the `desktop` story's independent
`credential-broker` and `local-backend-boot` roots are joined by glue.

## Cross-story boundary (ADR-0010 §4 / ADR-0074)

Authored from the intended consumed seams (re-verify against the real imports when built). This story
OWNS no package (a VIRTUAL story — the app-guide / headless-orchestrator precedent): its net-new code
is co-located inside two SURFACE packages other stories own.

- **`desktop`** — the surface this terminal SHIPS ON. The [`pty-session-manager`](pty-session-manager.md)
  module lives in `apps/desktop/src/backend/`, and the real-pty Electron-main wiring + the
  `desktopTerminal` preload bridge + the `node-pty` dep are `desktop`-surface glue (above). This story
  extends the `desktop` surface's package with co-located source; it adds **no new `@storytree/*` runtime
  import**, so the edge is an **artifact edge** (ADR-0166), declared in `depends_on` and annotated in
  `artifact_edges`. (The blocking boundary Rule 4 skips a virtual story; the annotation keeps the
  non-blocking ADR-0115 drift report clean, the app-guide pattern.)
- **`studio`** — the renderer surface the xterm component lives in. The desktop renders the **compiled**
  studio dist (ADR-0090 d.4), so the [`terminal-dock-panel`](terminal-dock-panel.md) is a `studio`
  frontend component (`apps/studio/src/components/TerminalDock.tsx`), exactly as `app-guide`'s caps
  edit `apps/studio/src`. It is a **thin client** — no `@storytree/agent` / `@storytree/drive` / model
  import (the `apps/studio/src` `modelPathBoundary.test.ts` wall); `xterm.js` is a third-party dep, not a
  cross-story `@storytree/*` edge — so this edge is also an **artifact edge**, declared and annotated.

**No edge to `notice-board` / `drive-machinery` / `forest-world`.** The observability layer watches the
terminal's Claude Code through the ALREADY-EXISTING seams — the presence hook (`scripts/presence-hook.sh`
declares a session on `SessionStart`), the CLI seam (`storytree noticeboard declare --node <story> --pg`
takes the work-time claim and lights the story wisp, ADR-0142), the store seam (`story build --real
--store pg` writes verdicts) — with **zero new coupling**. This story adds no observer code, so it draws
no edge to the observer organisms (ADR-0174: "nothing new is required to observe it").

## UAT Test Criteria

The integrated acceptance walkthrough that proves the whole embedded terminal meets its outcome
end-to-end. Minimal-first (one coherent journey: open the app → a real terminal sits in the dock → run
Claude Code in it → the map lights a wisp for it), defect-driven thereafter (each real failure earns a
permanent regression case, never speculative breadth).

> **Per-leg witness (ADR-0209 §1 / ADR-0106 / ADR-0070).** **RE-ADJUDICATED 2026-07-26** under the
> ADR-0209 §8 corpus-wide migration (owner-directed 2026-07-25). Three classified kinds are available:
> `machine` (deterministic, spine-observed proof), `model` (rubric-bound semantic judgment by an eligible
> read-only judge), `human` (irreducible operator judgment). That pass resolved this story to six
> `machine` legs and two `human` legs; no leg is model-judged — nothing here turns on semantic judgment
> of prose or artifacts, so the model rung genuinely does not apply.
>
> **NARROWED 2026-08-11 (ADR-0348 D6): the one EXPERIENCE leg is DELETED, so the story now carries six
> `machine` legs and ONE `human` leg (seven).** The deleted leg — *"it READS as one coherent terminal"*
> (old leg 7) — asked whether this surface is any GOOD, not whether the journey achieved its goal, and
> a gate that waits on that verdict waits forever. Its design intent is carried in "What this story is
> NOT" above. Ordinals are BURNED, not renumbered — position 7 is simply absent, so every surviving leg
> keeps the number it has always had and no signed verdict or `(proof-gate:)` binding is silently
> re-pointed. **This story's ordinals are unusually load-bearing** (see the attestation note below: a
> signed row already points at `#uat-5`), which is exactly why nothing is renumbered here.
>
> **RE-TRIAGED 2026-08-13 (ADR-0357): leg 5 FLIPPED to `machine`, so this story now carries SEVEN
> `machine` legs and NO `human` leg.** The sentence that stood here — *"The one surviving human leg (5)
> is a genuine ACCEPTANCE claim about real metered spend, not a look"* — is corrected in place per
> ADR-0139: real metered spend is precisely the basis ADR-0348 D2 withdrew, and ADR-0357 D1's second
> basis does not reach this leg either, because the `_electron` harness that already reads the pty's
> main-held screen for legs 1, 4 and 6 reads a `claude` session's screen the same way. Leg 5 is bound
> to the model-driven gate 1 under "Reliability Gates".
>
> **ADR-0294 D2/D4 pass, 2026-08-20 — the two wiring legs are DELETED, and the four survivors are declared
> UNBOUND.** Old legs **2** and **3** restated proof that already exists one rung down and named it in
> their own success clauses. Leg 2's pty lifecycle is proven by the capability
> [`pty-session-manager`](pty-session-manager.md) at
> `apps/desktop/src/backend/pty-session-manager.test.ts` — `psm-spawns-and-routes-data`,
> `psm-forwards-input-and-resize`, `psm-disposes-and-tears-down`, `psm-isolates-multiple-sessions`,
> `psm-fails-closed-on-unknown-session`. Leg 3's renderer wiring is proven by the capability
> [`terminal-dock-panel`](terminal-dock-panel.md) at `apps/studio/src/components/TerminalDock.test.tsx` —
> `tdp-spawns-on-open-and-writes-data`, `tdp-forwards-input-to-bridge`, `tdp-resizes-with-the-dock`,
> `tdp-toggles-visibility-keeping-terminal-mounted`, `tdp-degrades-when-bridge-absent`. Both were checked
> against those tests' ACTUAL assertions, not their file existence (ADR-0294 D2's honesty wall). Ordinals
> **2** and **3** are BURNED, not renumbered, so no surviving leg moves and no binding is re-pointed. This
> story now carries **FIVE** `machine` legs (1, 4, 5, 6, 8) and no `human` leg. *(This paragraph read "The
> wiring legs (2, 3) are covered by the two capabilities' signed `--real` verdicts … those two tags are
> unchanged" — which was the deletion criterion being stated and then not acted on; corrected in place per
> ADR-0139.)*
>
> **The four survivors are BOUND as of 2026-08-22 (gates 2–5).** Until
> then they stood unbound, and this paragraph read: *"**No gate is minted for any of them.** Answering an
> unbound leg with a freshly minted check is the rubber stamp ADR-0097 §2 forbids … What binds them is a
> real instrument: the `_electron` walk persisting a signed verdict, or ADR-0295 D1's model-driven
> executor — already the shape of gate 1 below, which is how leg 5 is bound."* It named the two honest
> instruments and took neither; gates 2–5 take the second, one per leg. The rubber-stamp objection is
> SATISFIED rather than overridden, and the test is decidable rather than a matter of taste: a
> drive-witness gate cannot exit 0 without a `pass` drive record for that criterion's CURRENT revision, at
> a commit in HEAD's ancestry, inside 90 days. **Why now:** the unbound state was never local to these
> four. `runAdopt` resolves EVERY real machine leg before signing any, with no partial verdict set, so
> four unbound legs refused this story's whole UAT-signing pass and stranded bound leg 5, which has a gate
> and could otherwise be signed. **Binding is not driving** — and ADR-0405 D4 leaves a red check red
> rather than re-driving to chase a pass.
>
> **WHICH legs have actually been driven is deliberately recorded NOWHERE in this file — ask
> `uat-drive-witness.check.ts`, or `events.uat_drive`.** This paragraph used to end *"no drive has been run
> for legs 1, 4, 6 or 8"*, and each of those legs said the same inside its own item. That could not stay
> true and could not be corrected either, which is the point: **every word inside a criterion's item is
> hashed into its `revision-id` annotation** (`canonicalUatCriterionContent` strips only the ordinal and the
> identity tags), and **a drive record binds the revision it drove** — so driving a leg falsifies its own
> status sentence, and correcting that sentence un-witnesses the drive that falsified it. Measured
> 2026-08-24: legs 1 and 4 each held a passing drive record while their own prose said no drive had been
> run, and the witness checks exited 0 against a story asserting the opposite. Status now lives only where
> it can be true — in the store. Corrected in place per ADR-0139; the rule generalises, so a criterion's
> item states the JOURNEY and the BINDING and never its own proof state.
>
> Legs **1, 4 and 6** are `machine` through the **existing** Electron `_electron` Playwright harness
> (`apps/desktop/e2e/`), which already launches the app offline, satisfies the repo gate by pre-writing
> the userData `repo-selection.json`, spawns a **REAL node-pty**, types into it, and reads the main-held
> serialized screen state back through `desktopTerminal.snapshot` (`session-survival.e2e.mjs` — the
> renderer-independent observable, since xterm paints to a WebGL canvas where available and DOM text
> would pass or fail by GPU availability). A real native module, a real renderer and a real shell are all
> machine-observable there; leg **8** is `machine` too, on a SECOND, live-gated spec (see below). These
> four were previously tagged `human`; that was a conservative mis-tag, not an irreducible judgment
> (`human-witness-is-a-judgment-gap-not-cost` — a machine-observable success that is merely native,
> live, expensive or unharnessed is never labelled `human`). In particular, leg 1 previously justified
> itself as *"operator-attested glue, not a CI leg"* — glue-ness is a capability-TIERING call and the
> absence of a harness is a cost; neither makes a DOM-structural claim irreducible.
>
> Two legs stayed `human` after that pass: driving the **REAL PAID Claude Code subscription**
> interactively (leg 5 — real metered spend the proof spine must never burn unattended, and a judgment
> about a third-party interactive product's affordances rather than about our pty; it sits behind the
> owner's explicit honesty wall) and the terminal's **FEEL** (old leg 7). **ADR-0348 D6 deleted the
> second on 2026-08-11**, so exactly **ONE** leg stays `human`: leg 5. The story-level `uat_witness` is
> absent → human (the ADR-0040 fail-closed signpost), so the machine-driven whole-story UAT node stays
> WITHHELD.
>
> **Nothing here is green.** Per ADR-0209 §6 a substantive criterion change invalidates the old green, so
> every leg below is UNSTAMPED and earns green only under its newly-declared witness. Legs 1, 4, 6 and 8
> carry seed-canonical `uat-criterion` detail artifacts (ADR-0209 §5) because their one-line titles cannot
> convey the stub boundary, the false-pass trap, or the renderer-independent observable; leg 5 is fully
> specified by its own prose and its model-driven gate, so per the owner's narrower bar it gets no
> artifact. *(This read "the remaining legs are fully specified by their capability contracts or by short,
> self-contained attestation prose". The capability-specified legs were 2 and 3, which the ADR-0294 D2
> pass deleted on 2026-08-20; corrected in place per ADR-0139. No detail artifact was orphaned — neither
> deleted leg carried a `(detail:` pointer.)*
>
> **Two `machine` legs have no spec at HEAD** (legs 6 and 8 — leg 1's and leg 4's observables are already
> driven by `session-survival.e2e.mjs`). Tagging them `machine` with no spec yet is the correct, honest
> state: the tag states which KIND of witness is right, never that the proof exists. Stub recipes naming
> the harness are recorded in "Open modeling calls".

> **A SIGNED ATTESTATION ROW POINTS AT `#uat-5` AND NO LONGER MATCHES THE CLAIM THERE — READ THIS BEFORE
> READING LEG 5 (recorded 2026-07-26; migration residue, not an authoring defect in these legs; the
> remedy is an OPEN OWNER CALL, deliberately NOT made here).**
>
> The live store holds exactly one attestation against this story: `events.attestation` seq 8, `test_id:
> embedded-terminal#uat-5`, `outcome: pass`, `witness: human`, signer `hua.mick@gmail.com`, relayed by
> session `clever-chatelet-76014c`, at **2026-07-16** (verified by direct query, not inferred). It was
> granted against the claim that stood at **position 5 BEFORE the 2026-07-26 re-adjudication** — *"It
> reads and behaves like a real terminal"* (scrollback, colours, resize reflow, keys, the collapse/resize
> dock). Its stored note records the walk the owner actually did: selecting text in the embedded terminal,
> `Ctrl+C` copying it without a spurious interrupt, `Ctrl+V` pasting it back, PowerShell as the Windows
> default shell; the owner's words were *"this works"*.
>
> **That is NOT the claim now at position 5.** The ADR-0209 §8 re-adjudication (PR #904) split the old
> fused leg and RENUMBERED, so position 5 now carries *"Real Claude Code runs interactively in the
> embedded terminal"* — the REAL PAID subscription run. The feel claim the owner signed moved to
> `#uat-7` ("It READS as one coherent terminal"), where it stayed UNSIGNED; the mechanics half moved to
> `machine` leg **6** and is likewise unsigned; the clipboard round trip the note actually describes has
> no leg at all (open modeling call 5 below). **So this row must NOT be read as vouching for leg 5's paid
> interactive Claude Code run — that run has never been attested.** Leg 5 is **UNSTAMPED**, exactly like
> every other re-adjudicated leg here (ADR-0209 §6), and nothing on this page is green.
>
> **UPDATED 2026-08-11: `#uat-7` NO LONGER EXISTS.** ADR-0348 D6 deleted the feel claim as an EXPERIENCE
> property rather than an acceptance criterion, and the ordinal was BURNED rather than reused, so no leg
> sits at position 7 and the intent it stated now lives in "What this story is NOT". This is a fact about
> what the corpus holds, not a resolution of the call below — it REMOVES one of the three options and
> settles none of the others.
>
> **The remedy is the owner's to choose, and is not chosen here.** Three honest options were named
> without preference: (i) leave the row as it is and let this note carry the correction; ~~(ii) the owner
> re-signs the feel claim at its new id `#uat-7`~~ — **no longer available**, since ADR-0348 D6 deleted
> that claim from the story tier entirely; or (iii) the row is invalidated or superseded as pointing at a
> retired claim. No agent may pick between the two that remain — granting the row forward would be an
> agent restoring green it was never given (`agent-never-self-exempts`), and discarding it would destroy
> real signed state. **This note is a prerequisite of BOTH surviving options, not an election of (i):**
> the mismatch has to be visible here whatever the owner then decides, and writing it down settles
> nothing. Note in particular that ADR-0348 D7's supersession ruling reaches `agent` leg 1 ONLY and is
> deliberately not generalised here.
>
> **This is `wisp-as-story-claim`'s open call, actually occurred.** That story's open modeling call 1 asks
> whether an owner attestation carries forward onto a SPLIT leg. Here the situation is strictly worse than
> that hypothetical: there the split legs are NARROWER than the signed one, so carry-forward is at least
> arguable; here the **id was reused for a different claim**, so the stored row silently denotes something
> the owner never looked at. The general call belongs with that story's item 1 and is **not decided here**.
>
> **Cause, stated factually:** leg renumbering by the ADR-0209 §8 re-adjudication in PR #904. That
> migration's brief specified the prior-attestation check as a TEXT search of the story's own files; the
> record lives in Postgres, so the re-adjudication truthfully reported "no prior owner attestation is
> recorded in this story's files" and the id collision went unseen. A live-store probe entered the brief
> only later in the migration.

**Goal —** A desktop user opens the app, finds a real terminal in the dock, runs real Claude Code in it,
and watches a wisp light on the forest map for that Claude Code session — the interactive surface being
the real tool, the observability layer watching it through the existing seams with no new code.

1. **A terminal sits in the dock.** _(witness: machine)(detail: embedded-terminal#uat-1)_ _(proof-gate: embedded-terminal#gate-2)_ The member opens the desktop app; with a valid _(criterion-id: uatc_a311ba8bd853bebf8a1eb587)_ _(revision-id: uatr1:2d5bb671415b992f)_ _(previous-revision-id: uatr1:408ffa9b4ece425f)_
   repo selected (the `terminal-repo-picker` gate — satisfied in the harness by pre-writing the userData
   `repo-selection.json`, as `session-survival.e2e.mjs` already does), a terminal panel sits in the same
   `.world-frame` dock slot the chat occupied. **Success —** in the real Electron renderer the forest page
   exposes the shared `[aria-label="expand bottom panel"]` toggle; expanding it and selecting its Terminal
   tab renders a live `.terminal-dock` with its session panel, and NO chat dock (`.chat-dock`) is rendered
   anywhere in the app — the dormant chat
   is not a second interactive surface, while `ChatDock`/`ChatPanel` and their vitest suites stay in the
   tree (ADR-0175). *(Presence, placement and the single-interactive-surface property are DOM-structural
   observables in the integrated harness. Mounting the dock stays glue at the capability tier — no
   isolatable red→green in swapping which already-proven component mounts — but that is a tiering call,
   not a witness kind.)* **BOUND to `embedded-terminal#gate-2` (2026-08-22).** This read *"**UNBOUND —
   fails closed (ADR-0294 D4, 2026-08-20)** … No gate is minted to host it — that is the rubber stamp
   ADR-0097 §2 bans"*, and every fact it stated still holds: the `_electron` walk persists no artifact an
   `observe` gate can read. `session-survival.e2e.mjs` still runs under no reliability gate, and a
   gate pointed at it would sign only the half it reaches. What gate 2 binds is the OTHER instrument "The four survivors" names —
   ADR-0295 D1's model-driven executor, the shape of gate 1 — which hands a model this leg's authored
   journey VERBATIM against the real packaged app and cannot exit 0 without a recorded `pass` drive for the
   criterion's CURRENT revision. That is the line between it and a minted rubber stamp: it cannot pass
   without a walk that happened. **Whether one HAS happened is deliberately not written here** — ask
   `uat-drive-witness.check.ts`, whose answer is the live `events.uat_drive` record. Corrected in place
   (ADR-0139): this previously ended *"— RED until driven … **Binding is not driving** — no drive has
   been run for this leg and ADR-0405 D4 leaves a red check red"*, which was true when written and had
   become FALSE by 2026-08-24 without anyone being able to say so — every word of this span is hashed
   into the `revision-id` annotation a drive record binds, so correcting a status sentence un-witnesses the very
   drive that falsified it.
4. **A REAL pty hosts a real interactive shell in the member's checkout.** _(witness: machine)(detail: embedded-terminal#uat-4)_ _(proof-gate: embedded-terminal#gate-3)_ The dock _(criterion-id: uatc_4a73475c396b1635baf9f5d1)_ _(revision-id: uatr1:40c31cda973d85be)_ _(previous-revision-id: uatr1:48f17b365ad85672)_
   spawns a REAL node-pty in the selected repo; typed input reaches the real shell and its output comes
   back, and a full-screen interactive program (alternate screen buffer, redraw on keypress) drives the
   same session — the property that makes an interactive TUI work at all. **Success —** a line command
   round-trips through the real shell and an interactive full-screen program renders and responds, read
   back from the main-held serialized screen state (`desktopTerminal.snapshot`) — NOT the mocked
   xterm/mocked bridge [`terminal-dock-panel`](terminal-dock-panel.md) signs. *(`session-survival.e2e.mjs`
   already spawns the real pty, types `echo survival-probe` and reads it back this way, so the
   native-module half of this leg is harnessed today; only the interactive-program assertion is net-new.
   This sentence read "the mocked xterm/mocked bridge capability 3 signs"; the capability is named
   directly here because the ADR-0294 D2 pass deleted the story leg that carried the same ordinal.)*
   **BOUND to `embedded-terminal#gate-3` (2026-08-22).** This read *"**UNBOUND —
   fails closed (ADR-0294 D4, 2026-08-20)** … No gate is minted to host it — that is the rubber stamp
   ADR-0097 §2 bans"*, and every fact it stated still holds: the `_electron` walk persists no artifact an
   `observe` gate can read. The interactive-program assertion is still net-new. What gate 3 binds is the OTHER instrument "The four survivors" names —
   ADR-0295 D1's model-driven executor, the shape of gate 1 — which hands a model this leg's authored
   journey VERBATIM against the real packaged app and cannot exit 0 without a recorded `pass` drive for the
   criterion's CURRENT revision. That is the line between it and a minted rubber stamp: it cannot pass
   without a walk that happened. **Whether one HAS happened is deliberately not written here** — ask
   `uat-drive-witness.check.ts`, whose answer is the live `events.uat_drive` record. Corrected in place
   (ADR-0139): this previously ended *"— RED until driven … **Binding is not driving** — no drive has
   been run for this leg and ADR-0405 D4 leaves a red check red"*, which was true when written and had
   become FALSE by 2026-08-24 without anyone being able to say so — every word of this span is hashed
   into the `revision-id` annotation a drive record binds, so correcting a status sentence un-witnesses the very
   drive that falsified it.
5. **Real Claude Code runs interactively in the embedded terminal.** _(witness: machine)_ _(proof-gate: embedded-terminal#gate-1)_ The member types _(criterion-id: uatc_855b0712c20d7cf71a4cc78a)_ _(revision-id: uatr1:9aa066aeebca3ef6)_ _(previous-revision-id: uatr1:8dc44ae2214f9202)_
   `claude` and drives a real session in-app — its own turn knobs, slash commands, permission modes, plan
   mode, MCP and skills all working (ADR-0174: the terminal's Claude Code has all of it for free).
   **Success —** real Claude Code, not an imitation of it, observed running as the interactive build
   surface. *(FLIPPED `human` → `machine` 2026-08-13 under ADR-0348 D2, by the source-reading triage
   ADR-0357 mandates. The old note gave two reasons and NEITHER survives. The first was **real metered
   subscription spend** — withdrawn by ADR-0348 D2, and `asset:human-witness-is-a-judgment-gap-not-cost`
   names cost as the most seductive false premise; the leaf is subscription-funded against a maxTurns
   brake, not a paid meter, and the UAT driver is itself such a session. The second was that *"all of
   Claude Code's affordances work" is a judgment about a third-party interactive product* — but that is
   a claim about our SURFACE, and every clause of it is observable in the pty: legs 1, 4 and 6 already
   read the main-held serialized screen through `desktopTerminal.snapshot` in the `_electron` harness,
   which is the same instrument that reads a `claude` session's TUI. The honest residue is that this is
   the ONE leg here whose journey needs a real subscription session inside the terminal rather than a
   plain shell, which is why its gate is model-driven and out-of-band rather than a standing spec.
   **Read the `#uat-5` attestation note above before reading this leg** — that 2026-07-16 row is a
   `witness: human` row against the LEGACY POSITIONAL id and already did not vouch for the claim here;
   this flip changes the claim's witness and decides nothing about the owner's open remedy call.)*
6. **Scrollback, reflow and keys behave like a real terminal.** _(witness: machine)(detail: embedded-terminal#uat-6)_ _(proof-gate: embedded-terminal#gate-4)_ Over the REAL xterm _(criterion-id: uatc_43d8956b3d08b704da13ce47)_ _(revision-id: uatr1:7a9c238acc7c0dd1)_ _(previous-revision-id: uatr1:550e90f662dc2ef8)_
   and REAL pty in the integrated harness: output beyond the viewport is retained in scrollback (the dock
   constructs xterm at scrollback 5000, aligned with the main-held headless screen model, ADR-0190);
   resizing the dock RESIZES the pty and reflows the session (the serialized screen returns at the new
   geometry with content rewrapped, not truncated); control keys reach the shell (Ctrl+C interrupts a
   running command); and collapsing/expanding the dock keeps the SAME session live. **Success —** the
   terminal's mechanics asserted against a real renderer and a real shell. *([`terminal-dock-panel`](terminal-dock-panel.md)'s
   suite pins the same WIRING over a MOCKED xterm — `tdp-resizes-with-the-dock`, `tdp-ctrl-c-copies-selection-ctrl-v-pastes`,
   `tdp-toggles-visibility-keeping-terminal-mounted`, `tdp-constructs-with-aligned-scrollback` — but a mock
   cannot exhibit reflow or scrollback retention, so this leg is the real-renderer half, not a
   restatement. That is also why the ADR-0294 D2 pass did NOT delete it: the duplication is partial, and
   the un-duplicated half is the whole point.)* **BOUND to `embedded-terminal#gate-4` (2026-08-22).** This read *"**UNBOUND —
   fails closed (ADR-0294 D4, 2026-08-20)** … No gate is minted to host it — that is the rubber stamp
   ADR-0097 §2 bans"*, and every fact it stated still holds: the `_electron` walk persists no artifact an
   `observe` gate can read. There is still no spec at HEAD. What gate 4 binds is the OTHER instrument "The four survivors" names —
   ADR-0295 D1's model-driven executor, the shape of gate 1 — which hands a model this leg's authored
   journey VERBATIM against the real packaged app and cannot exit 0 without a recorded `pass` drive for the
   criterion's CURRENT revision. That is the line between it and a minted rubber stamp: it cannot pass
   without a walk that happened. **Whether one HAS happened is deliberately not written here** — ask
   `uat-drive-witness.check.ts`, whose answer is the live `events.uat_drive` record. Corrected in place
   (ADR-0139): this previously ended *"— RED until driven … **Binding is not driving** — no drive has
   been run for this leg and ADR-0405 D4 leaves a red check red"*. It was true when written, and its
   siblings on legs 1 and 4 had silently become FALSE — every word of this span is hashed into the
   `revision-id` annotation a drive record binds, so a status sentence here can only ever be corrected by
   un-witnessing the drive that falsified it. This leg is rewritten BEFORE its first drive so that
   drive is never invalidated by a later correction.
8. **The existing observability seams watch a session started in the terminal — a wisp lights.** _(criterion-id: uatc_bdc148e9f00088bac6269e04)_ _(revision-id: uatr1:cc9033ea3d855940)_ _(previous-revision-id: uatr1:0ae1976ca6a09cef)_
   _(witness: machine)(detail: embedded-terminal#uat-8)_ _(proof-gate: embedded-terminal#gate-5)_ A session started in the embedded terminal takes its claim through the EXISTING
   CLI seam — `pnpm storytree noticeboard declare --working-on "<what>" --node pty-session-manager --pg`, run in the terminal's real
   pty (ADR-0142) — and the map paints a wisp for it with NO new observer code, proving the ADR-0174
   premise end-to-end. **Success —** the declare writes a `work`-grade row to `events.node_claim` for that
   session; the desktop's own `/api/activity` read reports it (`claimsToActivity`); and the rendered scene
   carries exactly one claim-wisp keyed to that session (ADR-0212: wisp count encodes SESSIONS, the build
   wisp folded into the claim body). *(Live-gated — it needs the REAL backend sidecar and a reachable
   store, which the offline `_electron` mode stubs away (`STORYTREE_DESKTOP_E2E=1` skips the sidecar and
   `harness.mjs` stubs every `/api/*` call), so this needs a SECOND, live-gated spec that SKIPs on absent
   preconditions rather than failing. Live and expensive are costs, not judgment gaps. The wisp's LOOK is
   `wisp-as-story-claim`'s own leg and is not re-judged here.)* **Corrected 2026-07-26:** this leg
   previously credited the `SessionStart` **presence hook** with declaring. ADR-0200 D3 RETIRED presence
   rows and made the hook's `start` mode pure and offline — it prints the anchor nudge and touches no
   store (`packages/cli/src/ambient-presence-entry.ts`); the claim is taken by the explicit `declare`
   (or `storytree worktree create --node`), and the statusline only heartbeats an existing claim. A
   machine leg written from the old prose would have asserted a write that correctly no longer happens.
   **BOUND to `embedded-terminal#gate-5` (2026-08-22).** This read *"**UNBOUND —
   fails closed (ADR-0294 D4, 2026-08-20)** … No gate is minted to host it — that is the rubber stamp
   ADR-0097 §2 bans"*, and every fact it stated still holds: the `_electron` walk persists no artifact an
   `observe` gate can read. The live-gated spec described above still does not exist, and binding this to an
   offline suite that never reaches a store would still assert the opposite of what the leg claims — gate 5
   is not that: the drive runs against a real sidecar and a reachable store, or it reports a fail. What gate 5 binds is the OTHER instrument "The four survivors" names —
   ADR-0295 D1's model-driven executor, the shape of gate 1 — which hands a model this leg's authored
   journey VERBATIM against the real packaged app and cannot exit 0 without a recorded `pass` drive for the
   criterion's CURRENT revision. That is the line between it and a minted rubber stamp: it cannot pass
   without a walk that happened. **Whether one HAS happened is deliberately not written here** — ask
   `uat-drive-witness.check.ts`, whose answer is the live `events.uat_drive` record. Corrected in place
   (ADR-0139): this previously ended *"— RED until driven … **Binding is not driving** — no drive has
   been run for this leg and ADR-0405 D4 leaves a red check red"*. It was true when written, and its
   siblings on legs 1 and 4 had silently become FALSE — every word of this span is hashed into the
   `revision-id` annotation a drive record binds, so a status sentence here can only ever be corrected by
   un-witnessing the drive that falsified it. This leg is rewritten BEFORE its first drive so that
   drive is never invalidated by a later correction.

End state — the desktop app embeds a real local terminal that runs real Claude Code in-app as the
interactive build surface: the pty lifecycle and the renderer dock signed under their suites, the dock
mount / the real pty / the terminal mechanics / the wisp seam machine-observed in the integrated harness,
and the paid interactive Claude Code session model-driven under gate 1 below — the interactive
runtime becoming the real tool while the prove-it-gate leaf and the observability seams are untouched.
*(This sentence read "and exactly ONE leg operator-attested — the paid interactive Claude Code session";
corrected in place per ADR-0139 when ADR-0348 D2's triage flipped leg 5 on 2026-08-13. This story now
carries NO human leg.)* Whether the terminal FEELS coherent is no longer an acceptance obligation
(ADR-0348 D6); that intent is recorded under "What this story is NOT" and answered by the owner using
the app.

## Reliability Gates

**Gate 1 is the story's FIRST gate (2026-08-13, ADR-0348 D2 / ADR-0357).** Gate ids are positional
(`asset:edit-story-uat-criteria` step 2), so anything added later APPENDS as gate 2 — never inserted,
never renumbered, or already-signed verdicts and surviving `(proof-gate:)` bindings are silently
re-pointed. It carries no `(covers:)`: it proves a JOURNEY, not a capability, and adding it to a
`(covers:)` list would let an observe-and-sign `adopt` pass green a capability that never went red
(ADR-0085 / ADR-0097).

**The gate neither drives nor spends.** The drive is deliberately out-of-band —
`pnpm --filter @storytree/drive exec node --import tsx src/uat-drive.run.ts embedded-terminal <criterion-id>`
spawns a fresh subscription-funded session that walks the authored journey against the real packaged
app and appends a record to `events.uat_drive`. ADR-0010 §5 keeps that off every gate path, exactly as
`dogfood-probe.run.ts` is. The gate is the cheap standing WITNESS of that persisted artifact, and the
spine still mints the verdict over the exit code IT watched, so ADR-0295 D2's *no model signs its own
verdict* holds with the signing path unchanged. A leg is model-driven exactly when the observe gate it
names runs `uat-drive-witness.check.ts` — the binding is self-describing, so nothing needs a second
registry (`packages/drive/src/uat-drive.ts`, `isModelDrivenGate`). It goes red — honestly, not
spuriously — when no `pass` record exists for the criterion's CURRENT `revision-id`, when the driven
commit is not in HEAD's ancestry, or when the newest record is older than 90 days (the ADR-0016 ageing
floor).

1. **UAT leg 5 — "real Claude Code runs interactively in the embedded terminal" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts embedded-terminal uatc_855b0712c20d7cf71a4cc78a`.
   Witnesses that a model launched the REAL packaged app, typed `claude` into the embedded terminal's
   REAL pty, and observed a genuine interactive Claude Code session — its own turn knobs, slash
   commands, permission modes, plan mode, MCP and skills — through the main-held serialized screen
   (`desktopTerminal.snapshot`), the same renderer-independent observable legs 1, 4 and 6 read.

**Gates 2–5 are NEW (2026-08-22, `machine-uat-signing-gap-arc-inc-02`) and were APPENDED — gate 1 kept its
ordinal.** Gate ids are positional (`asset:edit-story-uat-criteria` step 2), so inserting or renumbering
would silently re-point already-signed verdicts and surviving `(proof-gate:)` bindings. None carries a
`(covers:)`: each proves a JOURNEY, not a capability. They are the same neither-drives-nor-spends witness
gate 1 is, on the same honesty terms, and all four are RED until a drive is run — which is the point, not
a defect. See "The four survivors" above for why binding them was the honest move rather than the rubber
stamp ADR-0097 §2 bans.

2. **UAT leg 1 — "a terminal sits in the dock" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts embedded-terminal uatc_a311ba8bd853bebf8a1eb587`.
   Witnesses that a model opened the REAL packaged app with a valid repo selected and observed the forest
   page expose the shared expand-bottom-panel control; expanding it and selecting its Terminal tab render
   a live `.terminal-dock` with its session panel in the `.world-frame` dock slot the chat occupied, and
   NO `.chat-dock` rendered anywhere in the app — the single-interactive-surface property, not merely the
   dock's presence.
3. **UAT leg 4 — "a REAL pty hosts a real interactive shell in the member's checkout" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts embedded-terminal uatc_4a73475c396b1635baf9f5d1`.
   Witnesses that a model observed the dock spawn a REAL node-pty in the selected repo, a line command
   round-trip through the real shell, AND a full-screen interactive program (alternate screen buffer,
   redraw on keypress) render and respond in the same session — read back from the main-held serialized
   screen (`desktopTerminal.snapshot`), never the mocked xterm [`terminal-dock-panel`](terminal-dock-panel.md)
   signs. The interactive-program half is the part no existing harness reaches.
4. **UAT leg 6 — "scrollback, reflow and keys behave like a real terminal" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts embedded-terminal uatc_43d8956b3d08b704da13ce47`.
   Witnesses that a model observed, over a REAL xterm and a REAL pty: output beyond the viewport retained
   in scrollback, a dock resize RESIZING the pty and reflowing the session (content rewrapped at the new
   geometry, not truncated), Ctrl+C reaching the shell and interrupting a running command, and
   collapse/expand keeping the SAME session live. A mock cannot exhibit reflow or scrollback retention,
   which is why this is not a restatement of the capability's suite.
5. **UAT leg 8 — "the existing observability seams watch a session started in the terminal — a wisp lights" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts embedded-terminal uatc_bdc148e9f00088bac6269e04`.
   Witnesses that a model ran `pnpm storytree noticeboard declare --working-on "<what>" --node pty-session-manager --pg` in the
   terminal's real pty and observed a `work`-grade row written to `events.node_claim` for that session, the
   desktop's own `/api/activity` read report it (`claimsToActivity`), and the rendered scene carry exactly
   ONE claim-wisp keyed to that session (ADR-0212). **Live-gated:** the walk needs the REAL backend sidecar
   and a reachable store, so a drive attempted without them reports a fail naming that — never a pass. The
   wisp's LOOK is `wisp-as-story-claim`'s own leg and is not re-judged here.

## Proof

The story is proven when that walkthrough passes — the wiring legs (2, 3) green under the two
capabilities' signed `--real` verdicts (with each cap's contracts green underneath), the integrated legs
(1, 4, 6, 8) green under spine-observed specs in the Electron `_electron` harness plus one live-gated
spec, and leg 5 green under the model-driven gate 1 above. Per ADR-0209 §6 this re-adjudication leaves
every leg UNSTAMPED — nothing below is green, and two machine legs (6, 8) have no spec at HEAD; a
`machine` tag states which witness is right, never that the proof exists. Per ADR-0020, `healthy` is only ever DERIVED from
signed verdicts; nothing here is authored healthy. Both capabilities are proof-wired (each carries a
`proof:` block with a `real:` arm — a NET-NEW red→green: a new module/component tested first against an
injected fake/mock) so the spine can drive their offline suites red→green under its own gate; the story's
machine-driven UAT node is WITHHELD (its `uat_witness` is absent → human, ADR-0040), so driving those
capabilities to signed verdicts is what makes the terminal layer buildable, and the crown additionally
awaits the FIVE integrated machine legs (1, 4, 5, 6, 8) — leg 5 through gate 1's model-driven witness
since the 2026-08-13 ADR-0357 triage, so this story now awaits NO operator attestation.

## Open modeling calls (for the owner / orchestrator)

None is a story-shape fork (ADR-0174 settled the WHAT — embed a local terminal, retire the interactive
chat; owner-directed, no ADR reserved). The first two items are **CLOSED** (kept as the record of how
they resolved); items 3 and 4 are **surfaced for the orchestrator's build** by the 2026-07-26 witness
re-adjudication, not decided here:

1. ~~**The ChatDock dock-slot disposition.**~~ **CLOSED 2026-07-26 — resolved by the build.** The
   disposition chosen was **UNMOUNT**: `TreeView` renders `<TerminalRepoGate … repoControl={<RepoPicker/>}/>`
   in `.world-frame` and imports only `TerminalDockSeed` as a type; `<ChatDock/>` appears nowhere in
   `apps/studio/src` outside `ChatDock.test.tsx` / `ChatDock.reload.test.tsx`, whose suites stay green.
   The ADR-0175 wall held — the components, the SSE transport, continuity and inspect infra are all still
   in the tree, behaviourally untouched. The "not a second interactive surface" property is now asserted
   in CI under UAT leg 1 rather than attested.
2. ~~**The `node-build.test.ts` snapshot companion edit.**~~ **CLOSED — landed.** Both
   `pty-session-manager` and `terminal-dock-panel` are present in the REAL-buildable snapshot regex in
   `packages/cli/src/node-build.test.ts` with their per-story discovery comment.
3. **Two `machine` legs have no spec at HEAD (a build obligation, not a re-tag).** Legs 6 and 8 are
   correctly classified but undischarged; a `machine` tag is a statement about the RIGHT witness, never a
   claim that proof exists (ADR-0209 §6 — both are UNSTAMPED). Stub recipes, so the tag is cheap rather
   than speculative:
   - **Leg 6** — extend the existing `_electron` harness (`apps/desktop/e2e/`, the `session-survival.e2e.mjs`
     pattern: real pty, repo gate pre-satisfied, read back via `desktopTerminal.snapshot` — never DOM text,
     which the WebGL renderer makes GPU-dependent). Emit more rows than the viewport and assert retention;
     drive the dock's resize edge and assert the serialized screen returns at the new geometry with content
     REWRAPPED; send Ctrl+C to a running command and assert the interrupt; collapse/expand and assert the
     same `sessionId` from `desktopTerminal.list()`.
   - **Leg 8** — a SECOND, live-gated spec: launch WITHOUT `STORYTREE_DESKTOP_E2E` and WITHOUT the
     harness's `/api/*` stubs so the real sidecar spawns (the `desktop#uat-4` precedent), run the declare
     inside the real pty, then assert the claim row, the `/api/activity` payload and exactly one
     claim-wisp for that session id. Gate it on a reachable store and SKIP — never fail — when the
     preconditions are absent (the live-store-test pattern); a SKIP is an honest non-result, not a pass.
4. **Leg 6's reflow assertion may need a main-side capability check first (surfaced, not settled).** The
   renderer-independent observable is the main-held `@xterm/headless` screen model (ADR-0190). Whether
   `snapshot()` after a resize genuinely exhibits REWRAP — rather than the headless model being resized
   without reflowing historical rows — should be probed before the spec is authored; if it does not, the
   honest options are to assert reflow on a different real observable or to narrow leg 6's reflow clause
   to what the seam can actually show. Narrowing the CLAIM is legitimate; silently re-tagging it `human`
   because the observable is awkward is not.
5. **The OS-clipboard round trip has no UAT leg (surfaced, deliberately NOT added).**
   `terminal-dock-panel`'s contract 12 (`tdp-ctrl-c-copies-selection-ctrl-v-pastes`) proves the handler
   over a mocked clipboard, and the cap file used to describe the physical clipboard as "the story's
   operator-attested UAT leg" — but no story leg covers it, and it would be MACHINE-observable in the
   `_electron` harness if one did (that mis-description is corrected in the cap file). Adding a leg for it
   now would be speculative breadth (`uat-proves-the-goal-not-the-surface`) — the goal is running Claude
   Code in a real terminal, not covering the clipboard surface. Recorded so a future copy/paste defect
   earns a permanent regression leg (defect-driven), rather than the gap being hidden on a human rung.
6. **The signed `#uat-5` attestation now points at a DIFFERENT claim than the one witnessed (an OWNER
   call; recorded 2026-07-26).** The load-bearing statement is the marked note in the UAT witness preamble
   above — read it there, since that is where a reader forms a belief about what leg 5 means. In short:
   `events.attestation` seq 8 (`embedded-terminal#uat-5`, pass, human, signer `hua.mick@gmail.com`,
   2026-07-16) was given for the pre-#904 position-5 claim *"It reads and behaves like a real terminal"*;
   the ADR-0209 §8 re-adjudication renumbered, so position 5 now carries the REAL PAID interactive Claude
   Code run, which has never been attested, while the feel claim moved to unsigned `#uat-7` — and
   `#uat-7` was then DELETED outright by ADR-0348 D6 on 2026-08-11 (an experience property, not an
   acceptance criterion; the ordinal is burned, not reused). Leg 5 stays
   UNSTAMPED and the row vouches for neither claim. Options, none chosen: annotate only; or the row is
   invalidated/superseded. *(The third option — the owner re-signs at `#uat-7` — died with the leg; that
   is a mechanical consequence of the deletion, not a decision taken here.)* This is `wisp-as-story-claim`'s open modeling call 1
   (does an attestation carry forward onto a SPLIT leg?) having actually happened — and worse, since the
   ID was reused rather than merely narrowed. Cause: leg renumbering in PR #904, whose brief checked for
   prior attestations by TEXT search of `stories/**` while the record lives in Postgres.
