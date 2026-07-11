---
id: "terminal-repo-picker"
tier: story
title: "The embedded terminal opens in a repo the user picks — thread the selected working directory through the Electron main"
outcome: "The desktop user SELECTS a repo (e.g. their storytree checkout) through a native directory dialog, and the embedded terminal spawns there instead of the app's serve root — the selection is validated, persisted across relaunches, and resolved into the pty's cwd inside the Electron MAIN process, so the byte-locked TerminalDock renderer stays arg-free and the terminal simply opens where the user chose."
status: proposed
proof_mode: UAT
# uat_witness ABSENT → human (ADR-0040 fail-closed signpost): the whole-story UAT — "the user picks a repo
# in the native dialog and the real terminal opens there, surviving a relaunch" — needs the native OS
# dialog, a real node-pty in the member's checkout, userData persistence across an app restart, and the
# picker's appearance, all operator-attested (ADR-0070 / ADR-0174). The machine-driven story UAT node
# stays WITHHELD; the crown derives from the three capabilities' signed verdicts plus the operator's
# attestation of the opens-in-the-picked-repo / fail-closed-gate / survives-relaunch / looks-right legs.
# Capabilities, roots-first. THREE machine-provable caps over a NEW `desktopRepo` bridge, each its own
# suite (the pty-session-manager ↔ terminal-dock-panel precedent this story mirrors): repo-selection (the
# backend validate/persist/resolve lifecycle, apps/desktop node:test over injected DirProbe +
# SelectionStore ports), repo-picker-panel (the renderer picker control, apps/studio vitest over a mocked
# desktopRepo bridge's pick/get), and terminal-repo-gate (the fail-closed renderer WRAPPER that renders the
# byte-locked TerminalDock only when a valid repo is ready, apps/studio vitest over the bridge's
# ready/onChanged + a mocked TerminalDock). All three share the `desktopRepo` WIRE SHAPE (pick/get, plus
# ready/onChanged) as a cross-boundary contract, not a code edge — so none depends_on another (three
# roots). The real node:fs / userData adapters + the ipc handlers (including repo:ready/repo:changed) + the
# native dialog + the preload bridge + the TreeView mount (now the gate swapping in for the bare dock) +
# the .repo-picker / .terminal-gate CSS + threading resolveCwd into the terminal spawn are operator-
# attested GLUE within this story (ADR-0158), witnessed under the Story UAT, NOT capabilities.
capabilities: [repo-selection, repo-picker-panel, terminal-repo-gate]
# Story-level cross-story edges (ADR-0010 §4 / ADR-0074). This story OWNS NO package — it is a VIRTUAL
# story (like embedded-terminal / terminal-chat): its net-new code is CO-LOCATED inside two surface
# packages other stories own, AND it builds atop a prior feature story's delivered outcome. All three
# edges are declared `depends_on` AND annotated `artifact_edges` (ADR-0166 — deliberate non-import /
# co-located-source / build-atop edges, not @storytree/* package imports):
#   - desktop — the repo-selection module lives in apps/desktop/src/backend/, and the real node:fs /
#               userData adapters + the ipc handlers + the native dialog + the `desktopRepo` preload
#               bridge are desktop-surface glue. Co-located source, no NEW @storytree/* runtime import →
#               an artifact edge (the embedded-terminal precedent).
#   - studio  — the RepoPicker control lives in apps/studio/src/components/. The desktop renders the
#               COMPILED studio dist (ADR-0090 d.4), so the picker is a `studio` frontend component.
#               Co-located source, no NEW @storytree/* frontend import → an artifact edge.
#   - embedded-terminal — this story BUILDS ATOP the delivered embedded terminal (ADR-0174): the glue
#               threads `resolveCwd(serveRoot)` into embedded-terminal's EXISTING pty spawn in
#               `main.ts`, and the Story UAT leg 3 opens THAT terminal in the picked repo. The picker has
#               no meaning without the terminal, so its UAT needs embedded-terminal's outcome as a
#               precondition (the cross-story-dependency test → yes). The gate cap ALSO wraps embedded-
#               terminal's co-located `TerminalDock` (a same-package `studio` co-located import — no NEW
#               @storytree/* package import; a virtual story owns no package) → a co-located-source +
#               BUILD-ATOP edge, declared `depends_on` and annotated `artifact_edges` — the
#               website-experience → website /
#               spawn-visibility → chat-subagent-spawn precedent. Acyclic: embedded-terminal does not
#               point back. (See "Cross-story boundary" + "Open modeling calls" — this edge is a
#               DIVERGENCE from the follow-on brief's suggested [desktop, studio]; flagged for the owner.)
# NO edge to notice-board / drive-machinery / forest-world: the picker adds no observer code; the
# terminal's Claude Code is still watched through the ALREADY-EXISTING seams with zero new coupling.
depends_on: [desktop, studio, embedded-terminal]
artifact_edges: [desktop, studio, embedded-terminal]
# Deciding ADRs (ADR-0037 §2): 0174 (the WHAT — the embedded LOCAL terminal this extends; cloud/web
# working-dir DEFERRED there, so this story is local-only too); 0070 (the two-stage frontend-builder
# proof — the picker's geometry/behaviour machine-proven, its appearance operator-attested); 0158 (glue
# is un-asserted code WITHIN a story — the main adapters / ipc / dialog / preload bridge / mount / CSS /
# the resolveCwd→spawn thread); 0010 (the organism model + the splitting-rule that tiers the three caps
# across the bridge); 0057 (the spec-borne proof config making each cap inner-loop buildable); 0004 (the
# agent boundary — the picker is the INTERACTIVE surface only; the prove-it-gate leaf sdk-author.ts is
# UNTOUCHED, and the renderer never imports @storytree/agent).
decisions: [174, 70, 158, 10, 57, 4]
---

# The embedded terminal opens in a repo the user picks — thread the selected working directory through the Electron main

**Outcome —** The desktop user **selects a repo** (e.g. their `storytree` checkout) through a **native
directory dialog**, and the embedded terminal **spawns there** instead of the app's serve root — the
selection is **validated**, **persisted** across relaunches, and **resolved** into the pty's `cwd` inside
the Electron **main** process, so the byte-locked `TerminalDock` renderer stays arg-free and the terminal
simply opens where the user chose.

This story is a follow-on of **[ADR-0174](../../docs/decisions/0174-interactive-builds-run-in-an-in-app-terminal-not-the-in-app.md)**
and the delivered **[`embedded-terminal`](../embedded-terminal/story.md)** story (owner-directed
2026-07-11): the app already embeds a real local terminal (xterm.js in the renderer over a node-pty in the
Electron main), but it always opens in the app's serve root. The owner's ask is small and concrete —
**let the user pick their repo, and start the terminal there.** The design is settled: thread the working
directory through the **Electron main**, never the renderer.

## The journey (why this is ONE story — the journey-principle)

The consumer is the desktop user; their goal is **to open the embedded terminal in a repo they pick**.
Finishing "a selection can be validated and persisted" leaves the user immediately needing "a control to
pick it" and then "the terminal actually opens there" — these are not separate value deliveries, they are
one continuous journey (the journey-principle: if finishing the first unit's journey leads the consumer
straight to needing the next, they are the same journey). The outcome states the value in one sentence
without conjunctions: *the embedded terminal opens in a repo the user picks.* So this story's **net-new**
is the repo selection (a backend validate/persist/resolve lifecycle + a renderer picker control, joined
by glue); the terminal it opens is the already-delivered `embedded-terminal`.

**Why a NEW story, not more capabilities on `embedded-terminal`.** `embedded-terminal` delivered its
bounded journey — *a real terminal runs Claude Code in-app, watched by the existing seams* — and landed
(its crown awaiting the owner's live/look attestations). Opening in the serve root was its CORRECT spec,
not a defect, so this is NOT a `defects-amend-the-owning-story` case (no contract of
`embedded-terminal` is violated). "Open it where I pick" is a distinct, self-contained subsequent
journey with its own coherent UAT — a legitimate follow-on story that builds atop the delivered terminal,
exactly as `website-experience` follows `website` and `spawn-visibility` follows `chat-subagent-spawn`.

## Why the working directory is resolved in the MAIN, not the renderer (the load-bearing design wall)

`apps/studio/src/components/TerminalDock.tsx` is a **signed source** — it anchors the `terminal-dock-panel`
`--real` crown, so a source-drift byte-change there would break that verdict (ADR-0057 / the signed-source
byte-lock). Its `.terminal-dock*` CSS is also the surface of a sibling chip (the terminal focus-fix + look
polish). So this story does **NOT** touch `TerminalDock.tsx` or `.terminal-dock*` CSS: the renderer's
`spawn()` call stays **arg-free**, and the cwd is resolved in the Electron **main** (operator-attested
GLUE, freely editable). `PtySpawnOptions.cwd` already exists and `pty-session-manager.create` already
reads it (`apps/desktop/src/backend/pty-session-manager.ts`), so main defaults the pty `cwd` to
`repo-selection.resolveCwd(serveRoot)` on spawn — no change to the pty manager, no change to the
renderer. This is the exact seam that keeps this feature and the sibling focus-fix chip collision-free.

## What this story is NOT (the walls — encode from the ADRs)

- **It touches the interactive runtime, NOT the proof runtime (ADR-0174 / ADR-0004).** The prove-it-gate
  (`packages/orchestrator`) and `ClaudeAgentAuthor` (`packages/agent/src/sdk-author.ts`) are **UNTOUCHED**.
  Signed `--real` verdicts still come only from the deterministic spine driving the leaf. This story
  changes where the *interactive* terminal opens, never how the *proof* runs. It does NOT license
  gate-landing as a substitute for the crown (the caps stay `unregistered` unless driven `--real`).
- **It does NOT touch the signed terminal source (ADR-0057 byte-lock).** `TerminalDock.tsx` /
  `pty-session-manager.ts` stay byte-identical, and `.terminal-dock*` CSS is untouched (the sibling chip
  owns it). The picker mounts OUTSIDE the dock in a NEW `.repo-picker*` namespace, and the cwd is
  threaded in main. Any change that dirtied those signed sources would be source-drift, refused.
- **LOCAL pty ONLY (ADR-0174 Scope).** This picks a **local** directory for the **local** embedded
  terminal. **Cloud / backing-container web terminals** and their per-user working directory are
  explicitly **DEFERRED** by ADR-0174 as a separate, separately-costed decision. Do NOT scope a
  cloud/web working-dir into this story.
- **It selects a directory, it does not manage repos (slow growth).** This validates + persists + resolves
  ONE selected working directory for the terminal. It does NOT clone, add, list, or switch between
  multiple repos, does NOT compose the build command (the ADR-0174 map-spawn re-point is a separate
  follow-on), and does NOT reach the prove-it-gate. One picked cwd, nothing more.

## Capabilities (3)

Listed roots-first. All three are independent roots (see the within-story graph): they sit across the NEW
`desktopRepo` contextBridge and prove different observables in different suites — the
`pty-session-manager` (desktop) ↔ `terminal-dock-panel` (studio) split this story mirrors, plus a third
renderer WRAPPER over a different slice of the same bridge.

| # | capability | outcome | proof | depends on |
|---|------------|---------|-------|------------|
| 1 | [`repo-selection`](repo-selection.md) | The Electron-main repo selection module validates a candidate directory over an injected `DirProbe`, persists a valid selection over an injected `SelectionStore`, reads it back, and resolves the terminal's cwd to the selected dir (else a fallback) — failing closed on a bad/absent path, never throwing, all over injected ports so the whole lifecycle is proven headlessly with no `node:fs` and no Electron. | integration-test (apps/desktop node:test, red→green over injected fake ports) | — |
| 2 | [`repo-picker-panel`](repo-picker-panel.md) | The renderer repo picker reflects the current selection on mount over the `desktopRepo` bridge, opens the native picker on click and updates the shown selection on a resolved path, leaves it unchanged on a cancelled pick, and degrades honestly to a disabled "repo picker unavailable" state where the bridge is absent (the studio-standalone case). | integration-test (apps/studio vitest jsdom, red→green over a mocked desktopRepo bridge) | — |
| 3 | [`terminal-repo-gate`](terminal-repo-gate.md) | The renderer wrapper renders the byte-locked `<TerminalDock>` ONLY when a valid repo cwd is ready over the bridge's `ready`/`onChanged` (else a fail-closed "Select a repository to start the terminal" gate in a `.terminal-gate` namespace), keys the dock on the cwd so it remounts a fresh pty on a repo change, forwards the `seed` prop through, and degrades to rendering TerminalDock directly (never calling the bridge) where it is absent — a thin client wrapping TerminalDock without touching it. | integration-test (apps/studio vitest jsdom, red→green over the mocked bridge + a mocked TerminalDock) | — |

## Operator-attested glue (un-asserted connective code WITHIN this story — ADR-0158, NOT capabilities)

These pieces have **no isolatable red→green seam** — a `node:test` that opened a real native dialog, wrote
a real userData file, or drove a real Electron window would be the live-native trap the machine caps
deliberately avoid (repo-selection is Electron-free and fs-free by construction; repo-picker-panel mocks
the bridge). They are witnessed under the Story UAT's operator-attested legs (ADR-0070), exactly as
`embedded-terminal` models its real-pty adapter and its `desktopTerminal` preload bridge:

- **The real adapters + the pty-cwd thread in the Electron main** (`apps/desktop/electron/main.ts`): the
  concrete `DirProbe` (a `node:fs` implementation of `exists` / `isDirectory` / `isGitRepo`) and
  `SelectionStore` (a JSON file under `app.getPath("userData")`) wired into a `repo-selection` instance;
  `ipcMain.handle("dialog:pickDirectory")` → `dialog.showOpenDialog({ properties: ["openDirectory"] })` →
  validate + persist through the cap → return the chosen path (or `null` on cancel/invalid);
  `ipcMain.handle("repo:get")` → `repo-selection.current()`; and **threading the terminal spawn cwd
  default to `repo-selection.resolveCwd(serveRoot)`** in the EXISTING `terminal:spawn` handler. The
  manager (embedded-terminal's cap) and its spawn signature are UNCHANGED — main just supplies a
  resolved `cwd` in the `PtySpawnOptions` it already passes.
- **The `desktopRepo` contextBridge** (`apps/desktop/electron/preload.ts`): a NEW
  `contextBridge.exposeInMainWorld("desktopRepo", { pick, get, ready, onChanged })` bridging renderer →
  `ipcRenderer.invoke("dialog:pickDirectory" | "repo:get" | "repo:ready")` (+ the `repo:changed`
  subscription `onChanged` wraps) → main — the EXACT pattern of the existing `desktopAuth` / `desktopApply`
  / `desktopTerminal` bridges. Its mere presence (`window.desktopRepo`) is how the renderer feature-detects
  the desktop host (the `desktopApply`-presence precedent), driving cap 2's (picker) and cap 3's (gate)
  honest absent-bridge degradation. The `pick`/`get` half serves the picker; the `ready`/`onChanged` half
  serves the gate (see the gate glue bullet below).
- **The picker mount in `apps/studio/src/components/TreeView.tsx`**: mounting `<RepoPicker/>` near the
  terminal dock in the `.world-frame` (where `<TerminalDock/>` sits today, TreeView.tsx ~L2168) — a glue
  mount of an already-proven component, exactly the dock-slot-swap precedent. It mounts OUTSIDE the
  byte-locked `TerminalDock`; the exact placement (a control above the dock, a dock header button, …) is
  a layout call surfaced under "Open modeling calls", witnessed under UAT leg 5, not asserted in CI.
- **New `.repo-picker*` CSS in `apps/studio/src/index.css`**: the picker's appearance, in a NEW namespace
  that never touches `.terminal-dock*` (the sibling chip's surface). The look is the operator-attested UAT
  leg 5 (ADR-0070), never a machine visual verdict.
- **The `<TerminalRepoGate/>` swap in `apps/studio/src/components/TreeView.tsx` + the fail-closed
  `ready`/`onChanged` bridge glue.** The gate ([`terminal-repo-gate`](terminal-repo-gate.md)) REPLACES the
  bare `<TerminalDock/>` mount near the terminal dock (the map frame) with `<TerminalRepoGate/>` — a glue
  mount swap of an already-proven wrapper around the byte-locked dock (the dock-slot-swap precedent; the
  gate IMPORTS and RENDERS TerminalDock, never edits it, and forwards the existing `seed` prop). The real
  `ready`/`onChanged` seam is desktop glue: the preload EXTENDS the `desktopRepo` contextBridge (alongside
  the picker's `pick`/`get`) with `ready(): Promise<string|null>` (over `ipcRenderer.invoke("repo:ready")`
  → the byte-locked `repo-selection`'s `resolveCwd`/`current`) and `onChanged(cb)` (a
  `webContents.send("repo:changed", cwd)` subscription the main fires when a selection is validated +
  persisted) — so `ready` returns a cwd ONLY for a VALID selection (the fail-closed contract) and
  `onChanged` fires the new cwd on a change. Plus the NEW `.terminal-gate*` CSS (the gate message's
  appearance, a namespace that never touches `.terminal-dock*` / `.repo-picker*`). The exact placement +
  the look + the real fail-closed behaviour are operator-attested (UAT legs 5, 6), not asserted in CI.

## Within-story dependency graph

Authored from the intended data-flow; re-derive from the real imports/calls when the units are built
(ADR-0010 §3) and correct if the code disagrees. The graph is acyclic; **all three capabilities are
roots** (no in-story edge).

- `repo-selection` — a root. A self-contained Electron-main module over injected `DirProbe` +
  `SelectionStore` ports; it imports no other in-story unit and no `electron` / `node:fs`.
- `repo-picker-panel` — a root. It consumes the `desktopRepo` bridge **WIRE SHAPE** (`pick` / `get`),
  whose validate/persist SEMANTICS the `repo-selection` module implements (via the main-side adapters) —
  but it imports **nothing** from `repo-selection` (they are across the contextBridge AND across
  packages). This is the `terminal-dock-panel` ↔ `pty-session-manager` relationship exactly: they share
  the wire shape as a CONTRACT across the boundary, not a code edge, so there is **no `depends_on` edge**.
- `terminal-repo-gate` — a root. The renderer WRAPPER consumes a DIFFERENT slice of the same `desktopRepo`
  bridge wire shape (`ready` / `onChanged`) than the picker (`pick` / `get`) and renders the co-located
  `<TerminalDock>` — but it imports **nothing** from `repo-selection` or `repo-picker-panel`. Its one
  import beyond React is the same-package `./TerminalDock` (embedded-terminal's studio component, covered
  by the story's `studio` / `embedded-terminal` `artifact_edges`), which is a same-package co-located
  import, NOT an in-story capability edge. So it is the third root — **no `depends_on` edge** either way.

The three roots are joined only by the **operator-attested glue** above (the preload `desktopRepo` bridge —
now carrying `ready` / `onChanged` alongside `pick` / `get` — + the main-side dialog/adapters + the
`resolveCwd`→spawn thread + the TreeView swap of the bare dock for the gate) — witnessed integrated under
the Story UAT, exactly as `embedded-terminal`'s independent roots are joined by its main-side glue.

## Cross-story boundary (ADR-0010 §4 / ADR-0074)

Authored from the intended consumed seams (re-verify against the real imports when built). This story
OWNS no package (a VIRTUAL story — the `embedded-terminal` / `terminal-chat` precedent): its net-new code
is co-located inside two SURFACE packages other stories own, and it builds atop a prior feature story.

- **`desktop`** — the surface this glue ships on. The [`repo-selection`](repo-selection.md) module lives
  in `apps/desktop/src/backend/`, and the real node:fs/userData adapters + the ipc handlers + the native
  dialog + the `desktopRepo` preload bridge are `desktop`-surface glue. Co-located source, **no new
  `@storytree/*` runtime import** → an **artifact edge** (ADR-0166), declared and annotated.
- **`studio`** — the renderer surface the picker lives in. The desktop renders the **compiled** studio
  dist (ADR-0090 d.4), so [`repo-picker-panel`](repo-picker-panel.md) is a `studio` frontend component
  (`apps/studio/src/components/RepoPicker.tsx`). It is a **thin client** — no `@storytree/agent` /
  `@storytree/drive` / model import (the `apps/studio/src` `modelPathBoundary.test.ts` wall) — so this
  edge is also an **artifact edge**, declared and annotated.
- **`embedded-terminal`** — the delivered feature this story BUILDS ATOP. The glue threads
  `repo-selection.resolveCwd(serveRoot)` into `embedded-terminal`'s EXISTING pty spawn (`main.ts`'s
  `terminal:spawn` handler), and the Story UAT leg 3 opens THAT terminal in the picked repo — so this
  story's UAT needs `embedded-terminal`'s delivered outcome (a working embedded terminal) as a
  precondition (the cross-story-dependency test → **yes**). The [`terminal-repo-gate`](terminal-repo-gate.md)
  cap ALSO wraps `embedded-terminal`'s co-located `TerminalDock` — importing `{ TerminalDock,
  TerminalDockSeed }` from the SAME `studio` package (a same-package co-located import, covered by the
  `studio` co-located-source edge), **not** a new `@storytree/*` package import (a virtual story owns no
  package). So this is a co-located-source + **build-atop** edge, declared `depends_on` and annotated
  `artifact_edges` — the `website-experience → website` / `spawn-visibility → chat-subagent-spawn`
  precedent. **Acyclic:** `embedded-terminal` does not depend on this story. *(This edge DIVERGES from the
  follow-on brief's suggested `[desktop, studio]` — see "Open modeling calls".)*

**No edge to `notice-board` / `drive-machinery` / `forest-world`.** The picker adds no observer code; the
terminal's Claude Code is still watched through the ALREADY-EXISTING presence-hook / noticeboard-claim /
store-verdict seams with zero new coupling (the ADR-0174 premise). This story picks a directory; it draws
no edge to the observer organisms.

## Story UAT

The integrated acceptance walkthrough that proves the whole feature meets its outcome end-to-end.
Minimal-first (one coherent journey: with no repo the terminal is gated → pick a repo → the terminal opens
there → change the repo and it reopens → it survives a relaunch → the picker looks right and degrades
honestly standalone), defect-driven thereafter (each real failure earns a permanent regression case, never
speculative breadth).

> **Per-leg witness (ADR-0106 / ADR-0070).** The mechanics legs are covered by the three capabilities'
> signed `--real` verdicts (the validate/persist/resolve lifecycle over fake ports; the picker
> reflect/pick/cancel/degrade over the mocked bridge; the gate's gate/show/reopen/degrade/forward-seed
> LOGIC over the mocked bridge + a mocked TerminalDock). The experiential legs — the native OS directory
> dialog, a REAL node-pty opening in the picked repo, the REAL terminal refusing to run until a repo is
> picked and REOPENING in the new one, userData persistence across a real app relaunch, and the picker's /
> gate's **look** — are `witness: human` (operator-attested, ADR-0070): an automated CI run cannot open the
> native dialog, spawn a real pty in a chosen checkout, watch the real terminal fail closed, restart the
> app, or judge the appearance. The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed
> signpost), so the machine-driven whole-story UAT node stays WITHHELD; the crown derives from the
> per-cap signed verdicts plus the operator's attestations.

**Goal —** A desktop user opens the app, picks their `storytree` checkout in a native dialog, and the
embedded terminal opens in that repo — the selection surviving a relaunch, the picker reading right, and
the studio-standalone build degrading honestly.

1. **The repo selection lifecycle is honest over validate → persist → resolve.** _(witness: machine)_
   Over injected fake `DirProbe` + `SelectionStore` ports, `repo-selection` accepts a valid git dir,
   rejects a missing/non-dir/non-git path with a typed reason (no throw), persists a valid selection and
   not an invalid one, reads it back via `current()`, and `resolveCwd(fallback)` returns the selected dir
   when valid else the fallback. **Success —** [`repo-selection`](repo-selection.md)'s signed verdict (the
   backend lifecycle, no real fs).
2. **The renderer picker reflects, picks, cancels, and degrades honestly.** _(witness: machine)_ Over a
   mocked `desktopRepo` bridge, the picker reflects the current selection on mount, calls `pick()` on
   click and updates the shown selection on a resolved path, leaves it unchanged on a cancelled (null)
   pick, and renders a disabled "repo picker unavailable" state where the bridge is absent — never calling
   the bridge, never hanging, never crashing. **Success —** [`repo-picker-panel`](repo-picker-panel.md)'s
   signed verdict (geometry + wiring, the bridge mocked).
3. **The embedded terminal opens in the picked repo.** _(witness: human)_ The member clicks "Choose
   repo…", picks their `storytree` checkout in the native OS dialog, expands the terminal, and `pwd` /
   `cd` shows the terminal opened in the chosen repo (not the serve root). **Success —** a real node-pty
   spawned in the picked directory, driven interactively in-app. *(operator-attested — the native dialog +
   a real native pty; an agent should not spawn it unattended.)*
4. **The selection survives an app relaunch.** _(witness: human)_ The member quits and reopens the app;
   the previously-picked repo is still selected and the terminal reopens there (the userData persistence).
   **Success —** the selection is durable across the process restart. *(operator-attested — a real app
   restart + a real userData file.)*
5. **The picker reads right and the studio-standalone build degrades honestly.** _(witness: human)_ The
   repo picker reads and sits well beside the terminal dock, and the hosted/dev studio (a plain browser,
   no `desktopRepo` bridge) shows the honest disabled "unavailable" state. **Success —** the owner's
   two-stage visual verdict (ADR-0070): the picker look is witnessed, never machine-asserted.
6. **The fail-closed gate holds end-to-end.** _(witness: human)_ With NO repo selected the gate shows
   ("Select a repository to start the terminal") and the embedded terminal WILL NOT run; the member picks a
   repo and the terminal opens there; the member changes the repo and the terminal REOPENS (a fresh pty) in
   the new one. **Success —** the real terminal is genuinely refused until a valid repo is selected and
   reopens on a change — the fail-closed experience the gate's signed verdict proves only in wiring
   (gate/show/reopen over the mocked bridge + mocked dock). *(operator-attested — a real bridge + a real
   node-pty failing closed and reopening; an agent should not drive it unattended.)*

End state — the desktop user picks a repo and the embedded terminal opens there (and refuses to run until
they do), the selection lifecycle / the renderer picker / the fail-closed gate signed under their suites,
the native-dialog / opens-in-the-picked-repo / fail-closed / survives-relaunch / look legs
operator-attested — the interactive terminal opening where the user chose, while the prove-it-gate leaf,
the signed terminal sources, and the observability seams are untouched.

## Proof

The story is proven when that walkthrough passes — the mechanics legs (1, 2) green under two of the
capabilities' signed `--real` verdicts, and the gate's gate/show/reopen/degrade/forward-seed LOGIC green
under [`terminal-repo-gate`](terminal-repo-gate.md)'s signed verdict (with each cap's contracts green
underneath), and the experiential legs (3, 4, 5, 6) operator-attested. Per ADR-0020, `healthy` is only
ever DERIVED from signed verdicts; nothing here is authored healthy. All three capabilities are
proof-wired (each carries a `proof:` block with a `real:` arm — a NET-NEW red→green: a new
module/component tested first against an injected fake/mock) so the spine can drive their offline suites
red→green under its own gate; the story's machine-driven UAT node is WITHHELD (its `uat_witness` is absent
→ human, ADR-0040), so driving those capabilities to signed verdicts is what makes this layer buildable,
and the crown additionally awaits the operator's attestations (legs 3, 4, 5, 6) — including, per the
`embedded-terminal` build-atop edge, that the terminal itself works.

## Open modeling calls (for the owner / orchestrator)

None re-opens the settled design (ADR-0174 + the follow-on chip settled the WHAT — pick a repo, open the
terminal there, cwd resolved in main; owner-directed, no new ADR reserved). Four items are **surfaced**,
not decided here:

1. **The `embedded-terminal` dependency edge (a DIVERGENCE from the follow-on brief, flagged).** The brief
   suggested modelling this as a sibling of `embedded-terminal` with `depends_on: [desktop, studio]`. This
   spec DIVERGES to `[desktop, studio, embedded-terminal]` because the honest cross-story-dependency test
   returns **yes**: UAT leg 3 ("the terminal opens in the picked repo") needs `embedded-terminal`'s
   delivered outcome as a precondition, and the glue threads `resolveCwd` into that terminal's spawn. The
   corpus precedent is `website-experience → website` (a follow-on's artifact edge to the prior feature it
   builds atop) and `spawn-visibility → chat-subagent-spawn`. The edge is acyclic and `embedded-terminal`
   is already built + landed, so the prerequisite is satisfied. **If the owner prefers the pure
   sibling-of-embedded-terminal framing**, dropping `embedded-terminal` from both `depends_on` and
   `artifact_edges` is a one-line frontmatter edit — but the machine caps stay independently buildable
   either way (the edge gates the healthy ROLLUP, not the per-cap Build).
2. **`isGitRepo` required vs advisory (a validation-strictness call).** This spec makes a valid selection
   require `exists && isDirectory && isGitRepo`, so a non-repo directory is rejected with a typed reason
   (the feature is a *repo* picker). If the owner would rather allow ANY directory (open a terminal
   anywhere), relaxing `repo-selection` to `exists && isDirectory` and treating `isGitRepo` as advisory is
   a minimal-to-green change — the contract `rsel-rejects-invalid-path-with-reason` would then only pin
   missing/non-dir rejection. Flagged for the owner; the spec's default is the stricter, repo-picker-true
   reading.
3. **The `<RepoPicker/>` placement (a layout call, operator-attested glue).** Whether the picker sits as a
   control above the terminal dock, a button in a (new, non-`.terminal-dock`) header strip, or elsewhere
   in `.world-frame` is a layout/glue choice witnessed under UAT leg 5 — NOT a machine capability (there
   is no isolatable red→green in where an already-proven control mounts). The wall to hold: it mounts
   OUTSIDE `TerminalDock` and uses `.repo-picker*` CSS, never `.terminal-dock*`.
4. **The `node-build.test.ts` snapshot companion edit (REQUIRED, outside `stories/**`).** Authoring these
   three `real:`-armed caps makes `buildableNodeIds()` discover them (spec-borne, ADR-0057), which
   `packages/cli/src/node-build.test.ts`'s REAL-buildable snapshot regex + its per-story discovery comment
   pin exactly (the known "node-build snapshot trap"). The orchestrator must add `repo-picker-panel`,
   `repo-selection`, AND `terminal-repo-gate` (alphabetically — `terminal-repo-gate` slots between
   `terminal-dock-seed` and `transcript-reset`) to that regex + a per-story `terminal-repo-picker` comment,
   or `pnpm -r test` goes red. This is a `packages/cli` test edit — **outside the story-author's
   `stories/**` fence** — flagged here so it lands with the caps. (No cap declares `addDeps`: `apps/*` is
   not a `resolveAddDepsGroup` target, and this feature adds no new package dep — node:fs and the native
   dialog are Electron-main built-ins, and the studio components add no new studio dep.)
