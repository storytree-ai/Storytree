---
id: "terminal-repo-gate"
tier: capability
story: terminal-repo-picker
title: "The terminal repo gate — renders the embedded terminal ONLY when a valid repo is selected, reopens it (fresh pty) on a repo change, forwards the seed, degrades honestly where the bridge is absent"
outcome: "The studio frontend adds a thin `TerminalRepoGate` WRAPPER that renders the byte-locked `<TerminalDock>` ONLY when a valid repo cwd is selected over the `desktopRepo` bridge's `ready`/`onChanged`, otherwise renders a fail-closed gate ('Select a repository to start the terminal') in a NEW `.terminal-gate` namespace; it KEYS the inner TerminalDock on the cwd so it remounts a fresh pty when the selection CHANGES, FORWARDS TerminalDock's `seed` prop straight through, and where the bridge is ABSENT renders `<TerminalDock>` directly (its own honest disabled state) without ever calling `ready`/`onChanged` — a THIN CLIENT that imports no `@storytree/agent`/`@storytree/drive` and holds no model path, wrapping the byte-locked TerminalDock without touching it."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors a
# vitest jsdom component test that imports a NOT-YET-EXISTING wrapper from a NEW source file under
# apps/studio/src/components (red = module-not-found against the source that does not exist at HEAD), then
# writes that one new wrapper component (green). The test `vi.mock`s `./TerminalDock` so it asserts on the
# PROPS the gate passes (rendered? keyed to which cwd? which seed?) WITHOUT a real xterm.js Terminal — the
# dock's own behaviour is already the terminal-dock-panel crown, not re-proven here.
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the BEHAVIOUR ONLY (gate-when-no-repo,
# show-when-ready, reopen-on-repo-change, honest absent-bridge degradation, seed-forwarding) over a MOCKED
# `desktopRepo` bridge + a MOCKED TerminalDock — the gate's APPEARANCE ("the gate message reads right, the
# terminal sits well when it opens") is the story's operator-attested UAT (the look is witnessed, never a
# machine visual verdict; do NOT add a visual/pixel assertion here). The gate message mounts in a NEW
# `.terminal-gate` CSS namespace and MUST NOT touch `.terminal-dock*` (the byte-locked TerminalDock's
# surface, a sibling chip's territory) or modify `TerminalDock.tsx` (its signed `--real` source). SCOPE =
# apps/studio/src (the gate is a studio frontend wrapper; the desktop renders the COMPILED studio dist,
# ADR-0090 d.4). This cap adds NO new dep and declares NO `addDeps` (resolveAddDepsGroup targets
# packages/*, never apps/*: workspacePackageForSource("apps/studio/src/x.tsx") → null). Its ONLY import
# beyond React is the co-located `./TerminalDock` (TerminalDock + TerminalDockSeed) — a same-package
# apps/studio co-located import, covered by the story's existing `embedded-terminal` artifact_edge, NOT a
# new @storytree/* dependency.
#
# CRITICAL — the real arm declares an explicit `proofCommand` (the vitest-runner-mismatch correction, the
# repo-picker-panel / terminal-dock-panel / chat-panel precedent): the studio suite is VITEST + jsdom, NOT
# node:test. resolveProveSpec's DEFAULT real proof command is `node --import tsx --test <testFile>`
# (node:test), which CANNOT run a vitest jsdom `.test.tsx`. So this cap MUST declare a `real.proofCommand`
# that runs the ONE test file under VITEST: `pnpm --filter studio exec vitest run
# src/components/TerminalRepoGate.test.tsx` (cwd is apps/studio, so the path is package-relative). The
# spine's CONFIRM observation and the leaf's run_proof both ride this ONE command (the one-oracle
# property), so red→green is observed under vitest.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/TerminalRepoGate.test.tsx"
    sourceFile: "apps/studio/src/components/TerminalRepoGate.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/TerminalRepoGate.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/TerminalRepoGate.tsx"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is vitest (jsdom), not node:test — so the default `node --test` real proof
    # cannot run this `.test.tsx`. Run the ONE test file under vitest (cwd = apps/studio).
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/TerminalRepoGate.test.tsx"
---

# The terminal repo gate — renders the embedded terminal ONLY when a valid repo is selected, reopens it (fresh pty) on a repo change, forwards the seed, degrades honestly where the bridge is absent

**Outcome —** The studio frontend adds a thin **`TerminalRepoGate`** WRAPPER that renders the byte-locked
`<TerminalDock>` **only when a valid repo cwd is selected** over the `desktopRepo` bridge's `ready` /
`onChanged`, otherwise renders a **fail-closed gate** ("Select a repository to start the terminal") in a
NEW `.terminal-gate` namespace. It **keys** the inner TerminalDock on the cwd so it **remounts a fresh
pty** when the selection **changes**, **forwards** TerminalDock's `seed` prop straight through, and where
the bridge is **absent** renders `<TerminalDock>` **directly** (its own honest disabled state) without
ever calling `ready` / `onChanged`. It is a **thin client**: it imports no `@storytree/agent` /
`@storytree/drive` and holds no model path, **wrapping** the byte-locked TerminalDock without touching it.

**Depends on —** nothing (within `terminal-repo-picker`). The gate is a self-contained wrapper whose
backend seam is the `window.desktopRepo` bridge (the `ready` / `onChanged` verbs) and whose only rendered
child is the co-located `<TerminalDock>`. It sits on the OPPOSITE side of the contextBridge from
[`repo-selection`](repo-selection.md) and imports nothing from it; it consumes a DIFFERENT slice of the
`desktopRepo` bridge (`ready` / `onChanged`) than [`repo-picker-panel`](repo-picker-panel.md) (`pick` /
`get`) and imports nothing from it either. All three caps share the `desktopRepo` bridge WIRE SHAPE as a
cross-boundary contract, not a code edge (the `terminal-dock-panel` ↔ `pty-session-manager` precedent), so
there is no in-story edge — this is the story's **third root**.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. It is the fail-closed
> WRAPPER around the embedded terminal — the piece that makes the terminal refuse to run until the user
> has selected a valid repo, and reopens it in the new repo when the selection changes. The selection
> LIFECYCLE it reflects (validate/persist/resolve, whose `ready`/`onChanged` events it consumes) is
> [`repo-selection`](repo-selection.md); the CONTROL the user clicks to choose a repo is
> [`repo-picker-panel`](repo-picker-panel.md); the real `desktopRepo` bridge extension
> (`apps/desktop/electron/preload.ts` + the main-side `repo:ready` / `repo:changed` IPC), the native
> dialog, and the userData persistence are the story's operator-attested GLUE. THIS capability adds the
> renderer gate wrapper, proven offline against a mocked bridge and a mocked TerminalDock. Its
> *appearance* is the story's operator-attested UAT (ADR-0070 — the look is witnessed, never a machine
> visual verdict).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the WRAPPER AS A WHOLE — a behavioural React
component that, on mount over a present bridge, reads the current selection (`ready()`), renders the gate
message while there is no valid cwd, swaps to a keyed `<TerminalDock>` once a cwd resolves, re-keys the
dock (a fresh pty) when `onChanged` fires with a new cwd, forwards the `seed` prop through, and — where the
bridge is absent — renders `<TerminalDock>` directly without ever touching the bridge. It spans the
gate-when-no-repo AND the show-when-ready AND the reopen-on-change AND the absent-bridge degradation AND
the seed-forwarding, exercised against its mocked seams (the bridge + the mocked TerminalDock) — an
integration test of the wrapper's behaviour, not a single isolated assertion.

WHY THIS IS A SEPARATE CAPABILITY FROM `repo-picker-panel` AND `repo-selection` (the splitting-rule,
ADR-0010): the three caps prove DIFFERENT observables against DIFFERENT seams. `repo-selection` (the
backend) proves the validate/persist/resolve LIFECYCLE over injected ports (`apps/desktop`, `node:test`).
`repo-picker-panel` (the picker) proves the CONTROL — reflect/pick/cancel/degrade over the bridge's `pick`
/ `get` (`apps/studio/src`, vitest jsdom, a mocked bridge). THIS gate proves the WRAPPER — gate/show/
reopen/degrade/forward-seed over the bridge's `ready` / `onChanged` **and** a mocked TerminalDock
(`apps/studio/src`, vitest jsdom). The gate's proof does not share a common observable with the picker's
(the picker asserts what `pick`/`get` did to the shown selection; the gate asserts whether — and how —
TerminalDock is rendered), so by the splitting-rule they are distinct capabilities. They share the
`desktopRepo` bridge wire shape as a CONTRACT across the boundary, not a code edge: the gate never imports
the picker or the selection module, and neither imports the gate.

THE GATE IS A THIN CLIENT — NO AGENT, NO DRIVE, NO MODEL PATH (ADR-0004 / ADR-0108 d.1). The gate asks the
bridge whether a repo is ready and renders the dock accordingly; it **never imports `@storytree/agent` and
never imports `@storytree/drive`** (both are on the `apps/studio/src` model-path FORBIDDEN list, enforced
by `apps/studio/src/modelPathBoundary.test.ts`). The agent/filesystem boundary is the Electron main (the
bridge + the native dialog + node:fs); the renderer is downstream of `window.desktopRepo`. So the gate
adds NO new cross-story `@storytree/*` edge and NO model-path breach. (This is the interactive surface,
never the prove-it-gate leaf — the gate composes no signing/build/PR; ADR-0174 / ADR-0091.)

THE BRIDGE EXTENSION IS THE ONLY BACKEND SEAM (the `desktopApply`-presence + `TerminalDock`-degrade
precedent). The gate reaches the selection ONLY through a NEW slice of the `window.desktopRepo`
contextBridge, extending the `pick` / `get` the picker uses. Its shape (the verbs THIS cap consumes):
- `ready(): Promise<string | null>` — the current VALID repo cwd, or `null` when none is selected. Read
  once on mount to decide gate-vs-terminal.
- `onChanged(cb: (cwd: string | null) => void): void` — fires when the selection CHANGES, with the new
  cwd (a path to reopen the terminal in, or `null` to fall back to the gate).
These sit ALONGSIDE the existing `pick` / `get` (the picker's verbs) on the SAME `desktopRepo` bridge — the
real `ready` / `onChanged` handlers (the desktop preload + the Electron-main `repo:ready` / `repo:changed`
IPC, driven off the byte-locked `repo-selection`) are the story's operator-attested GLUE, NOT part of this
cap. The test `vi.mock`s / installs a scripted `window.desktopRepo` with `ready` + `onChanged` and drives
every observable through it — no real IPC, no real Electron. Its ABSENCE (`window.desktopRepo ===
undefined`, the studio-standalone case) drives the honest degrade below.

IMPLEMENTATION WALL — READ `window.desktopRepo` THROUGH A **LOCAL CAST**, NEVER A GLOBAL AUGMENTATION (the
TS-conflict wall). `repo-picker-panel`'s `RepoPicker` already augments the global `Window.desktopRepo` with
the `pick` / `get` shape (`declare global { interface Window { desktopRepo?: … } }`, the `TerminalDock` /
`desktopTerminal` precedent). A SECOND global augmentation of `Window.desktopRepo` with a different
(`ready` / `onChanged`) shape is a TypeScript conflict error. So this cap MUST:
- declare a LOCAL `interface DesktopRepoGateBridge { ready(): Promise<string | null>; onChanged(cb:
  (cwd: string | null) => void): void }` (only the verbs it consumes), and
- read the bridge through a local cast — `(window as unknown as { desktopRepo?: DesktopRepoGateBridge })
  .desktopRepo` — NOT a global `declare global`.
This keeps the gate's view of the bridge self-contained and collision-free with the picker's global
augmentation. "Bridge absent" is exactly `(window as …).desktopRepo === undefined`.

WRAPS THE BYTE-LOCKED TERMINALDOCK — IMPORTS IT, NEVER MODIFIES IT (the signed-source byte-lock wall).
`TerminalDock.tsx` anchors the `terminal-dock-panel` `--real` crown and MUST stay byte-identical, and its
`.terminal-dock*` CSS is a sibling chip's surface. So the gate is a SEPARATE `TerminalRepoGate` component
that IMPORTS `{ TerminalDock, TerminalDockSeed }` from `"./TerminalDock"` (a same-package apps/studio
co-located import) and RENDERS it — it never edits `TerminalDock.tsx` and never writes a `.terminal-dock*`
selector. The gate message uses its OWN `.terminal-gate*` CSS namespace (authored as story glue, ADR-0158;
this cap only NAMES the namespace, it does not assert CSS). Wrapping (not modifying) is why the terminal-
dock-panel crown stays intact.

KEY THE DOCK ON THE CWD SO A REPO CHANGE REOPENS A FRESH PTY (the load-bearing remount). TerminalDock
spawns its pty once on first expand and keeps that session across folds (see `TerminalDock.tsx`). To reopen
the terminal in a DIFFERENT repo, the gate renders `<TerminalDock key={cwd} … />`: when `onChanged` moves
the cwd from repo A to repo B, the React `key` changes, React UNMOUNTS the old dock (disposing its pty) and
MOUNTS a fresh one — a new pty in the new repo. This keying is the whole mechanism by which a selection
change reopens the terminal; it is asserted by `trg-reopens-on-repo-change`.

FORWARD THE `seed` PROP STRAIGHT THROUGH (load-bearing — the map-build-seeds-terminal feature depends on
it). PR #696 threads a build command into the terminal via TerminalDock's `seed` prop
(`TerminalDockSeed { command; token }`). The gate is now the mount point, so it MUST forward that seed to
the dock or the seed feature breaks. On the valid-repo render the gate passes the seed through:
`<TerminalDock key={cwd} {...(seed ? { seed } : {})} />` (spread only when present, honouring
`exactOptionalPropertyTypes`). Asserted by `trg-forwards-seed-to-terminal`.

DEGRADE HONESTLY WHERE THE BRIDGE IS ABSENT (slow growth, the honest-failure discipline). The gate ships
inside BOTH the native desktop (bridge present) and the standalone studio (`window.desktopRepo` absent — no
desktop preload). In studio-standalone there is no repo concept to gate on, so the gate renders
`<TerminalDock>` DIRECTLY and lets the dock show its OWN honest "terminal unavailable here" disabled state
(it has no `desktopTerminal` bridge either) — the gate must NEVER call `ready` / `onChanged` when the
bridge is absent, never hang on a promise that never arrives, and never crash the surrounding studio (the
`TerminalDock` / `StoreBanner` absent-bridge precedent). A load-bearing observable, not polish
(`trg-degrades-when-bridge-absent`).

## No new cross-story edge (the boundary call — ADR-0010 §4 / ADR-0074)

The gate CONSUMES the `desktopRepo` bridge shape and IMPORTS the co-located `TerminalDock`, but neither is
a new `depends_on`:

- **No `@storytree/*` frontend import.** The gate imports React and the co-located `./TerminalDock`, and
  reaches the selection only through `window.desktopRepo` — it imports no `@storytree/agent` /
  `@storytree/drive` (the model-path wall) and no other organism. The bridge shape is declared LOCALLY (a
  small interface over `window.desktopRepo`, read via a local cast).
- **The `./TerminalDock` import is a same-package co-located import, not a new edge.** `TerminalDock` is
  embedded-terminal's studio component, co-located in `apps/studio/src/components/` — the SAME package
  (`studio`) this gate lives in. Importing it is a same-package import, already covered by the story's
  `studio` co-located-source `artifact_edge` AND its `embedded-terminal` build-atop `artifact_edge`
  (ADR-0166); it is NOT a new `@storytree/*` package dependency. This cap's TerminalDock import makes that
  build-atop edge a concrete co-located source import (where the story previously only threaded
  `resolveCwd` via glue) — the SAME edge, not a new one.
- **No new dep in `apps/studio/package.json`.** The gate uses only React + the co-located dock — it adds no
  new third-party or `@storytree/*` dependency. So this cap adds NO new package-import edge and declares NO
  `addDeps` (`apps/*` is not a `resolveAddDepsGroup` target).
- **The cross-boundary contract is the bridge shape.** The `ready` / `onChanged` verbs are the seam both
  the renderer (here) and the Electron-main glue author to — a CONTRACT across the process boundary,
  enforced by both sides authoring the same shape, not by a code edge.

So `depends_on: []` (within-story) and the story's `desktop` / `studio` / `embedded-terminal`
`artifact_edges` (co-located source / build-atop, no new `@storytree/*` import) are the correct, honest
graph — the terminal-dock-panel precedent.

## Integration test

**Goal —** Prove that the `TerminalRepoGate`, over a mocked `desktopRepo` bridge (`ready` / `onChanged`)
and a MOCKED `./TerminalDock`, renders the fail-closed gate message when no valid repo is ready, renders
TerminalDock keyed to the cwd once a repo is ready, re-keys TerminalDock (a fresh mount) when the selection
changes, renders TerminalDock directly without touching the bridge where the bridge is absent, and forwards
the `seed` prop through to the dock. Entirely in jsdom: the bridge is mocked, `./TerminalDock` is `vi.mock`
ed to a prop-recording double (no real xterm.js), fake timers drive the async `ready()` resolution, no real
socket / dialog / IPC / Electron.

The integration test exercises this capability against its **real collaborator shapes** — the mocked
`desktopRepo` bridge (scripted as a double, exactly as `ChatPanel.test.tsx` scripts `../api`) and a
`vi.mock`ed `./TerminalDock` that records the props it receives (rendered-or-not, its `key`/remount, its
`seed`). No stubs within the gate's own composition (the mount, the `ready` read, the `onChanged`
subscription, the keyed render, the degradation are all real).

The integration test would:

1. `vi.mock("./TerminalDock")` with a double that records each mount and the props it received (so the test
   can assert whether it rendered, under which `cwd` key, and with which `seed`). Install a scripted
   `window.desktopRepo` whose `ready()` and `onChanged(cb)` are scripted per case. Render
   `<TerminalRepoGate/>` in jsdom on fake timers.
2. With `ready()` resolving `null` → assert the gate message ("Select a repository to start the terminal")
   is shown and the mocked TerminalDock did NOT render — the fail-closed gate (`trg-gates-when-no-repo`).
3. With `ready()` resolving `/home/me/storytree` → assert the mocked TerminalDock DID render (keyed to that
   cwd) and the gate message is not shown — show-when-ready (`trg-shows-terminal-when-ready`).
4. After mounting with repo A ready, fire the scripted `onChanged` callback with repo B → assert
   TerminalDock re-mounts keyed to B (the double records a NEW mount / a distinct `key`) — reopen-on-change
   (`trg-reopens-on-repo-change`).
5. Render with `window.desktopRepo` ABSENT (delete the mock) → assert the gate renders TerminalDock
   DIRECTLY, NEVER calls `ready` / `onChanged`, does NOT hang, and does NOT crash — the honest
   absent-bridge degrade (`trg-degrades-when-bridge-absent`).
6. With a valid repo ready AND a `seed` prop passed to `<TerminalRepoGate seed={…}/>` → assert the mocked
   TerminalDock received that EXACT seed object — seed-forwarding (`trg-forwards-seed-to-terminal`).

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest
jsdom, `apps/studio/src/components/TerminalRepoGate.test.tsx`), the `desktopRepo` bridge mocked/scripted
and `./TerminalDock` `vi.mock`ed to a prop-recording double. None exist yet; each is the assertion a
contract test WILL prove against the real gate once authored (provisional path — re-cite at real
`file:line` when built). Per ADR-0122 (`storytree coverage`), each contract id is the lead of a
distinctly-named test, so `storytree coverage terminal-repo-gate` reports **5/5**. None is an APPEARANCE
assertion — the look is the story's operator-attested UAT (ADR-0070).

1. **`trg-gates-when-no-repo`** — with no valid repo ready the gate message is shown and TerminalDock is NOT rendered
   - **asserts —** with the bridge present and `ready()` resolving `null`, `<TerminalRepoGate/>` renders the
     fail-closed gate message ("Select a repository to start the terminal") and the mocked `TerminalDock`
     does NOT render — the terminal is refused until a valid repo is selected.
   - **covers —** `apps/studio/src/components/TerminalRepoGate.tsx` (the no-repo gate branch) *(provisional path)*
2. **`trg-shows-terminal-when-ready`** — a valid repo ready renders TerminalDock (keyed to the cwd), not the gate
   - **asserts —** with `ready()` resolving a path (e.g. `/home/me/storytree`), the mocked `TerminalDock`
     renders (keyed to that cwd) and the gate message is NOT shown — the terminal opens once a repo is ready.
   - **covers —** `apps/studio/src/components/TerminalRepoGate.tsx` (the ready render branch) *(provisional path)*
3. **`trg-reopens-on-repo-change`** — an `onChanged` to a new cwd re-keys TerminalDock (a fresh mount / pty)
   - **asserts —** after mounting with repo A ready, firing the scripted `onChanged` with repo B re-renders
     `TerminalDock` keyed to repo B — a distinct `key` / a fresh mount recorded by the double (the fresh-pty
     remount) — the terminal reopens in the new repo when the selection changes.
   - **covers —** `apps/studio/src/components/TerminalRepoGate.tsx` (the onChanged→re-key path) *(provisional path)*
4. **`trg-degrades-when-bridge-absent`** — an absent desktopRepo bridge renders TerminalDock directly, never calls the bridge
   - **asserts —** with `window.desktopRepo` ABSENT (the studio-standalone case), the gate renders
     `TerminalDock` DIRECTLY (which shows its own honest disabled state), NEVER calls `ready` / `onChanged`,
     does NOT hang on a promise that never arrives, and does NOT crash the surrounding surface — the honest
     absent-bridge degrade.
   - **covers —** `apps/studio/src/components/TerminalRepoGate.tsx` (the absent-bridge branch) *(provisional path)*
5. **`trg-forwards-seed-to-terminal`** — a `seed` prop is forwarded straight through to TerminalDock
   - **asserts —** with a valid repo ready and a `seed` prop passed to `<TerminalRepoGate seed={…}/>`, the
     mocked `TerminalDock` receives that EXACT seed object — the map-build-seeds-terminal feed still reaches
     the dock through the gate.
   - **covers —** `apps/studio/src/components/TerminalRepoGate.tsx` (the seed pass-through) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the gate as a new wrapper
component, test-first.

- **The new test —** `apps/studio/src/components/TerminalRepoGate.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react`, the studio convention — `vi.hoisted` + `vi.mock("./TerminalDock")` to
  a prop-recording double + install a scripted `window.desktopRepo` with `ready` / `onChanged`, fake
  timers, exactly as `ChatPanel.test.tsx` / `BuildSection.test.tsx` script their seams; NO real
  socket/dialog/IPC/Electron). Import `{ TerminalRepoGate }` from `"./TerminalRepoGate"`. Name each test
  for its contract id (`trg-…`) so `storytree coverage terminal-repo-gate` reports 5/5 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `TerminalRepoGate.tsx`
  does not exist at HEAD, so the test fails module-not-found (the net-new missing-symbol red, ADR-0057).
  Assert gate-when-no-repo, show-when-ready, reopen-on-change, the absent-bridge degrade, and
  seed-forwarding.
- **The GREEN —** write `apps/studio/src/components/TerminalRepoGate.tsx`: a behavioural React wrapper that
  reads `window.desktopRepo` through a LOCAL cast to a locally-declared `DesktopRepoGateBridge` (never a
  global augmentation — the picker owns that), reads `ready()` on mount, subscribes to `onChanged`, renders
  the `.terminal-gate` gate message while the cwd is null, renders `<TerminalDock key={cwd} {...(seed ? {
  seed } : {})} />` once a cwd resolves (re-keying on a change → a fresh pty), and where the bridge is
  absent renders `<TerminalDock>` directly without ever calling the bridge. Import `{ TerminalDock,
  TerminalDockSeed }` from `"./TerminalDock"`. NO `@storytree/agent`, NO `@storytree/drive`, NO model path
  (the `modelPathBoundary.test.ts` wall stays green). After it, the import resolves, the assertions hold,
  and `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay green. SWAPPING the bare
  `<TerminalDock/>` mount in `TreeView` for `<TerminalRepoGate/>` + the real preload/main `ready` /
  `onChanged` glue + the `.terminal-gate` CSS + the fail-closed-in-the-real-app experience are witnessed
  under the Story UAT, not asserted in CI.

Rules:

- **Thin client — no agent, no drive, no model path** (ADR-0004 / ADR-0108 d.1). The gate's only backend
  seam is `window.desktopRepo` (read via a local cast); it imports no agent/drive/model code. The
  `modelPathBoundary.test.ts` guard pins this repo-wide; the gate must not breach it.
- **Wrap the byte-locked terminal, never modify it** (ADR-0057 signed-source byte-lock). IMPORT and RENDER
  `TerminalDock`; do NOT modify `TerminalDock.tsx` and do NOT use any `.terminal-dock*` selector — the gate
  is a SEPARATE component in a NEW `.terminal-gate` namespace. A dirtied signed source is source-drift,
  refused. `RepoPicker.tsx` / `pty-session-manager.ts` / `repo-selection.ts` stay byte-locked too.
- **Never a second global `Window.desktopRepo` augmentation** (the TS-conflict wall). `RepoPicker` already
  augments `Window.desktopRepo` (`pick` / `get`); the gate declares a LOCAL `DesktopRepoGateBridge` and
  reads the bridge via a local cast — a second conflicting `declare global` is a TS error.
- **Assert wiring, never the look** (ADR-0070). Prove the gate/show/reopen/degrade/forward-seed behaviour
  over the mocked bridge + mocked dock; the gate's appearance is the story's operator-attested UAT. Do NOT
  author a visual/pixel assertion here; the gate author signs no visual verdict.
- **Fail closed, never hang** — no valid repo renders the gate (the terminal will not run); an absent
  bridge renders TerminalDock directly (its own honest state), never a bridge call, never a hung promise,
  never a crash (`trg-gates-when-no-repo` / `trg-degrades-when-bridge-absent`).
- **One selected cwd, nothing more (slow growth)** — gate/reopen the terminal on ONE selected cwd. Do NOT
  implement the validate/persist lifecycle (that is `repo-selection`'s), do NOT open the native dialog or
  own the picker control (that is `repo-picker-panel` + main glue), do NOT clone/add/list/switch repos, do
  NOT compose the build command, do NOT offer a "clone fresh" option (explicitly DEFERRED), do NOT reach
  cloud/web working directories (DEFERRED, ADR-0174), do NOT add signing/build/PR (the interactive surface,
  never the gate leaf).
