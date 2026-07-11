---
id: "terminal-repo-gate"
tier: capability
story: terminal-repo-picker
title: "The terminal repo gate — renders the embedded terminal ONLY when a valid repo is selected, reopens it (fresh pty) on a repo change, forwards the seed, degrades honestly where the bridge is absent"
outcome: "The studio frontend's `TerminalRepoGate` WRAPPER renders the byte-locked `<TerminalDock>` ONLY when a valid repo cwd is selected over the `desktopRepo` bridge's `ready`/`onChanged`, and otherwise renders a fail-closed GATED CHROME — terminal-styled, with a clear reason ('No repository selected — choose one to start the terminal', so the block is never silent) — that surfaces an INJECTED `repoControl` as a prominent select affordance so a new user is forced to pick before the terminal runs; once a repo IS ready it forwards that same `repoControl` into TerminalDock's `headerRight` slot (the repo gear in the dock's own header, off the map), KEYS the inner TerminalDock on the cwd so it remounts a fresh pty when the selection CHANGES, and FORWARDS TerminalDock's `seed` prop straight through; where the bridge is ABSENT it renders `<TerminalDock>` directly (its own honest disabled state) without ever calling `ready`/`onChanged` or rendering `repoControl` — a THIN CLIENT that imports no `@storytree/agent`/`@storytree/drive` and holds no model path, wrapping the byte-locked TerminalDock (and injecting, never importing, the repo control) without touching either signed source."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDITS-EXISTING RE-PROVE (owner-directed 2026-07-12
# terminal-repo-picker UX refinement): TerminalRepoGate.tsx + its test ALREADY EXIST at HEAD (signed by
# PR #702). The leaf reads the existing source + 5 tests and RESTRUCTURES the gate's rendering — the
# no-repo branch grows from a bare message into a terminal-styled GATED CHROME carrying a clear reason +
# an INJECTED `repoControl` (a new optional prop) as the select affordance, and the ready branch forwards
# that same `repoControl` into TerminalDock's `headerRight` (the gear). The reds are BEHAVIOUR-assertion
# reds (the new contracts fail against the current bare-message / no-headerRight gate), NOT net-new
# missing-symbol reds. The test `vi.mock`s `./TerminalDock` (extended to RECORD its `headerRight` prop
# alongside `seed`) and injects a STUB `repoControl` so it asserts on the PROPS/placement the gate drives
# (dock rendered? keyed to which cwd? which seed? repoControl in the gate vs. forwarded as headerRight?)
# WITHOUT a real xterm.js Terminal and WITHOUT a real RepoPicker — the dock is the terminal-dock-panel
# crown and the picker is the repo-picker-panel crown, neither re-proven here.
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the BEHAVIOUR ONLY (gate-when-no-repo,
# offer-repo-control-in-gate, show-when-ready, place-repo-control-in-header, reopen-on-repo-change,
# seed-forwarding, honest absent-bridge degradation) over a MOCKED `desktopRepo` bridge + a MOCKED
# TerminalDock + a STUB repoControl — the gate's APPEARANCE (the gated chrome reads right, the gear sits
# well in the header, the terminal sits well when it opens) is the story's operator-attested UAT (the
# look is witnessed, never a machine visual verdict; do NOT add a visual/pixel assertion here). The gated
# chrome mounts in the `.terminal-gate` CSS namespace and MUST NOT touch `.terminal-dock*` (the
# byte-locked TerminalDock's surface) or modify `TerminalDock.tsx` (its signed `--real` source, now
# extended by the sibling terminal-dock-panel re-prove with the `headerRight` slot this gate feeds). SCOPE
# = apps/studio/src (the gate is a studio frontend wrapper; the desktop renders the COMPILED studio dist,
# ADR-0090 d.4). This cap adds NO new dep and declares NO `addDeps` (resolveAddDepsGroup targets
# packages/*, never apps/*: workspacePackageForSource("apps/studio/src/x.tsx") → null). Its ONLY import
# beyond React is the co-located `./TerminalDock` (TerminalDock + TerminalDockSeed) — a same-package
# apps/studio co-located import, covered by the story's existing `embedded-terminal` artifact_edge, NOT a
# new @storytree/* dependency. The `repoControl` is INJECTED as a prop (never imported), so the gate draws
# NO code edge to `repo-picker-panel` — the three caps stay independent roots (the TreeView glue wires
# `<RepoPicker/>` in).
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
    # RE-PROVE (ADR-0057 §3 expansion C): TerminalRepoGate.tsx + its test ALREADY EXIST at HEAD (signed
    # by PR #702) — this arm is driven `editsExisting` for the owner's 2026-07-12 UX refinement. The leaf
    # reads the existing source + 5 tests, RESTRUCTURES the no-repo branch into a gated chrome carrying a
    # clear reason + the injected `repoControl`, forwards `repoControl` into TerminalDock's `headerRight`
    # on the ready branch, and adds the contracts below — behaviour-assertion reds, NOT missing-symbol.
    # Preserves gate/show/reopen/degrade/seed behaviour + the existing contracts.
    editsExisting: true
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

> **Proof status (honest) — BUILT & SIGNED (PR #702), re-proving the UX refinement.** The fail-closed
> gate landed under its signed `--real` verdict (the terminal refuses to run until a valid repo is
> selected, and reopens on a change). This `editsExisting` re-prove (owner-directed 2026-07-12) makes the
> gate no longer a BARE MESSAGE: the block now carries a clear reason (so it is never silent — item 1) and
> an INJECTED `repoControl` as the select affordance (so a new user is forced to pick — item 3), and once
> ready that same control is forwarded as the repo GEAR in TerminalDock's `headerRight` (off the map —
> item 2). The selection LIFECYCLE it reflects (validate/persist/resolve, whose `ready`/`onChanged` events
> it consumes) is [`repo-selection`](repo-selection.md); the CONTROL injected in is
> [`repo-picker-panel`](repo-picker-panel.md)'s `RepoPicker` (wired by the TreeView glue, never imported
> here); the real `desktopRepo` bridge extension (`apps/desktop/electron/preload.ts` + the main-side
> `repo:ready` / `repo:changed` IPC), the native dialog, and the userData persistence are the story's
> operator-attested GLUE. THIS capability is the renderer gate wrapper, proven offline against a mocked
> bridge + a mocked TerminalDock + a stub repoControl. Its *appearance* is the story's operator-attested
> UAT (ADR-0070 — the look is witnessed, never a machine visual verdict).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the WRAPPER AS A WHOLE — a behavioural React
component that, on mount over a present bridge, reads the current selection (`ready()`), renders a
terminal-styled GATED CHROME (a clear reason + the injected `repoControl` as the select affordance) while
there is no valid cwd, swaps to a keyed `<TerminalDock>` once a cwd resolves — forwarding that same
`repoControl` into the dock's `headerRight` (the repo gear) and the `seed` prop straight through — re-keys
the dock (a fresh pty) when `onChanged` fires with a new cwd, and — where the bridge is absent — renders
`<TerminalDock>` directly without ever touching the bridge or the control. It spans the gate-when-no-repo
AND the offer-repo-control-in-gate AND the show-when-ready AND the place-repo-control-in-header AND the
reopen-on-change AND the seed-forwarding AND the absent-bridge degradation, exercised against its mocked
seams (the bridge + the mocked TerminalDock + a stub repoControl) — an integration test of the wrapper's
behaviour, not a single isolated assertion.

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
dock-panel crown stays intact. On the READY branch the gate now ALSO forwards the injected `repoControl`
into TerminalDock's NEW `headerRight` slot (the sibling terminal-dock-panel re-prove adds it) — the repo
gear lives in the dock's own header, so the control is no longer a pill floating over the map (the owner's
item 2). The gate passes `headerRight` and `seed` through as props; it still never edits TerminalDock.

THE GATED CHROME CARRIES A CLEAR REASON — NEVER A SILENT BLOCK (item 1, owner-directed). The no-repo branch
is NOT a bare one-liner: it renders a terminal-styled `.terminal-gate` chrome with a CLEAR reason that
covers BOTH the new-user (never-selected) and the stale/invalid-persisted cases honestly — `ready()`
resolves `null` for both (the byte-locked `repo-selection.resolveCwd` fails closed to its fallback on a
now-invalid persisted path), so ONE honest message serves both: e.g. "No repository selected — choose one
to start the terminal." The block is thus never silent, on every path the terminal is withheld
(`trg-gates-when-no-repo`). (The main-side fail-close — `terminal:spawn` returning an empty sessionId — is
belt-and-suspenders the gate makes unreachable through the UI; its own honest message is the sibling
`terminal-dock-panel` contract `tdp-shows-message-on-empty-session`, not this cap.)

THE INJECTED `repoControl` — A PROP, NEVER AN IMPORT (items 2 + 3; the no-code-edge wall). The gate takes an
OPTIONAL `repoControl?: React.ReactNode` prop and PLACES it in two spots: in the no-repo gated chrome as the
prominent SELECT affordance (so a new user is forced to pick before the terminal runs — item 3), and once
ready as TerminalDock's `headerRight` gear (item 2). It is INJECTED (the TreeView glue wires
`<RepoPicker/>` in), NOT imported — so the gate draws NO code edge to `repo-picker-panel` and the two stay
independent roots (the `depends_on: []` graph is unchanged). The gate does not interpret the control (it
owns no `pick`/`get`; the control reaches the bridge itself); the gate's job is placement + gating. Where
the bridge is ABSENT the gate renders NEITHER a gate NOR the control — just `<TerminalDock>` directly
(standalone has no repo concept). Proven by `trg-offers-repo-control-in-gate` (in the gate) +
`trg-places-repo-control-in-header-when-ready` (forwarded as headerRight). The control's APPEARANCE (a
prominent button in the gate, a compact gear in the header) is `.repo-picker*` CSS glue, operator-attested
(the story's UAT leg 5), NEVER asserted here.

KEY THE DOCK ON THE CWD SO A REPO CHANGE REOPENS A FRESH PTY (the load-bearing remount). TerminalDock
spawns its pty once on first expand and keeps that session across folds (see `TerminalDock.tsx`). To reopen
the terminal in a DIFFERENT repo, the gate renders `<TerminalDock key={cwd} … />`: when `onChanged` moves
the cwd from repo A to repo B, the React `key` changes, React UNMOUNTS the old dock (disposing its pty) and
MOUNTS a fresh one — a new pty in the new repo. This keying is the whole mechanism by which a selection
change reopens the terminal; it is asserted by `trg-reopens-on-repo-change`.

FORWARD THE `seed` PROP STRAIGHT THROUGH (load-bearing — the map-build-seeds-terminal feature depends on
it). PR #696 threads a build command into the terminal via TerminalDock's `seed` prop
(`TerminalDockSeed { command; token }`). The gate is the mount point, so it MUST forward that seed to the
dock or the seed feature breaks. On the valid-repo render the gate passes the seed AND the `repoControl`
(as `headerRight`) through: `<TerminalDock key={cwd} {...(repoControl ? { headerRight: repoControl } : {})}
{...(seed ? { seed } : {})} />` (each spread only when present, honouring `exactOptionalPropertyTypes`).
Asserted by `trg-forwards-seed-to-terminal` (seed) + `trg-places-repo-control-in-header-when-ready`
(headerRight).

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

**Goal —** Prove that the `TerminalRepoGate`, over a mocked `desktopRepo` bridge (`ready` / `onChanged`), a
MOCKED `./TerminalDock` (recording its `seed` AND `headerRight` props), and a STUB `repoControl`, renders
the fail-closed gated chrome (a clear reason + the repoControl select affordance) when no valid repo is
ready, renders TerminalDock keyed to the cwd once a repo is ready (forwarding the repoControl as
`headerRight`), re-keys TerminalDock (a fresh mount) when the selection changes, renders TerminalDock
directly without touching the bridge or the control where the bridge is absent, and forwards the `seed`
prop through to the dock. Entirely in jsdom: the bridge is mocked, `./TerminalDock` is `vi.mock`ed to a
prop-recording double (no real xterm.js), `repoControl` is a stub node with a testid (no real RepoPicker),
fake timers drive the async `ready()` resolution, no real socket / dialog / IPC / Electron.

The integration test exercises this capability against its **real collaborator shapes** — the mocked
`desktopRepo` bridge (scripted as a double, exactly as `ChatPanel.test.tsx` scripts `../api`), a
`vi.mock`ed `./TerminalDock` that records the props it receives (rendered-or-not, its `key`/remount, its
`seed`, its `headerRight`), and a stub `repoControl` node. No stubs within the gate's own composition (the
mount, the `ready` read, the `onChanged` subscription, the keyed render, the control placement, the
degradation are all real).

The integration test would:

1. `vi.mock("./TerminalDock")` with a double that records each mount and the props it received — including
   RENDERING `props.headerRight` so a stub inside it is findable (so the test can assert whether the dock
   rendered, under which `cwd` key, with which `seed`, and whether the repoControl was forwarded as
   `headerRight`). Install a scripted `window.desktopRepo` whose `ready()` and `onChanged(cb)` are scripted
   per case. Render `<TerminalRepoGate repoControl={<div data-testid="repo-control"/>} />` in jsdom on fake
   timers.
2. With `ready()` resolving `null` → assert the gated chrome (a clear reason message) is shown, the
   repoControl stub renders WITHIN the gate (not inside a dock), and the mocked TerminalDock did NOT render
   — the fail-closed gate (`trg-gates-when-no-repo`) + the offered control (`trg-offers-repo-control-in-gate`).
3. With `ready()` resolving `/home/me/storytree` → assert the mocked TerminalDock DID render (keyed to that
   cwd), the gate reason is not shown (`trg-shows-terminal-when-ready`), and the repoControl stub was
   forwarded as the dock's `headerRight` (findable inside the dock mock) — the header gear
   (`trg-places-repo-control-in-header-when-ready`).
4. After mounting with repo A ready, fire the scripted `onChanged` callback with repo B → assert
   TerminalDock re-mounts keyed to B (the double records a NEW mount / a distinct `key`) — reopen-on-change
   (`trg-reopens-on-repo-change`).
5. Render with `window.desktopRepo` ABSENT (delete the mock) → assert the gate renders TerminalDock
   DIRECTLY, renders NO gate reason and NO repoControl, NEVER calls `ready` / `onChanged`, does NOT hang,
   and does NOT crash — the honest absent-bridge degrade (`trg-degrades-when-bridge-absent`).
6. With a valid repo ready AND a `seed` prop passed to `<TerminalRepoGate seed={…}/>` → assert the mocked
   TerminalDock received that EXACT seed object — seed-forwarding (`trg-forwards-seed-to-terminal`).

## Contracts (7)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest
jsdom, `apps/studio/src/components/TerminalRepoGate.test.tsx`), the `desktopRepo` bridge mocked/scripted,
`./TerminalDock` `vi.mock`ed to a prop-recording double (rendering its `headerRight`), and `repoControl` a
stub node. Contracts 1, 3, 4, 5 (re-numbered 1, 4, 6, 5 below) landed under PR #702's signed verdict;
contracts 2 (`trg-offers-repo-control-in-gate`) and 3 (`trg-places-repo-control-in-header-when-ready`) are
the owner's UX refinement added in this `editsExisting` re-prove (author their tests against the existing
5, do NOT drop them). Per ADR-0122 (`storytree coverage`), each contract id is the lead of a
distinctly-named test (`it("<id>: …")`), so `storytree coverage terminal-repo-gate` reports **7/7** — name
each test EXACTLY its contract id (the prior build's leaf-renamed tests read 3/5; reconcile the names this
time). None is an APPEARANCE assertion — the look is the story's operator-attested UAT (ADR-0070).

1. **`trg-gates-when-no-repo`** — with no valid repo ready a terminal-styled gated chrome with a clear reason is shown and TerminalDock is NOT rendered
   - **asserts —** with the bridge present and `ready()` resolving `null`, `<TerminalRepoGate/>` renders the
     fail-closed gated chrome carrying a CLEAR reason (a message that names why the terminal is unavailable
     and to choose a repo — never silent, covering new-user AND stale-selection since both resolve `null`)
     in the `.terminal-gate` namespace, and the mocked `TerminalDock` does NOT render — the terminal is
     refused until a valid repo is selected (item 1).
   - **covers —** `apps/studio/src/components/TerminalRepoGate.tsx` (the no-repo gated-chrome branch) *(provisional path)*
2. **`trg-offers-repo-control-in-gate`** — the no-repo gate surfaces the injected repoControl as the select affordance
   - **asserts —** with `ready()` resolving `null` and a `repoControl` stub passed to
     `<TerminalRepoGate repoControl={…}/>`, the stub renders WITHIN the gated chrome (findable, not inside a
     dock, since no dock renders) — so a new user is forced to pick before the terminal runs (item 3).
   - **covers —** `apps/studio/src/components/TerminalRepoGate.tsx` (the repoControl-in-gate placement) *(provisional path)*
3. **`trg-places-repo-control-in-header-when-ready`** — once ready the repoControl is forwarded as TerminalDock's headerRight gear
   - **asserts —** with `ready()` resolving a path and a `repoControl` stub passed, the mocked `TerminalDock`
     receives that stub as its `headerRight` prop (findable inside the dock mock, which renders headerRight)
     — the repo control lives as a gear in the dock's own header, off the map (item 2).
   - **covers —** `apps/studio/src/components/TerminalRepoGate.tsx` (the headerRight forwarding) *(provisional path)*
4. **`trg-shows-terminal-when-ready`** — a valid repo ready renders TerminalDock (keyed to the cwd), not the gate
   - **asserts —** with `ready()` resolving a path (e.g. `/home/me/storytree`), the mocked `TerminalDock`
     renders (keyed to that cwd) and the gate reason is NOT shown — the terminal opens once a repo is ready.
   - **covers —** `apps/studio/src/components/TerminalRepoGate.tsx` (the ready render branch) *(provisional path)*
5. **`trg-forwards-seed-to-terminal`** — a `seed` prop is forwarded straight through to TerminalDock
   - **asserts —** with a valid repo ready and a `seed` prop passed to `<TerminalRepoGate seed={…}/>`, the
     mocked `TerminalDock` receives that EXACT seed object — the map-build-seeds-terminal feed still reaches
     the dock through the gate.
   - **covers —** `apps/studio/src/components/TerminalRepoGate.tsx` (the seed pass-through) *(provisional path)*
6. **`trg-reopens-on-repo-change`** — an `onChanged` to a new cwd re-keys TerminalDock (a fresh mount / pty)
   - **asserts —** after mounting with repo A ready, firing the scripted `onChanged` with repo B re-renders
     `TerminalDock` keyed to repo B — a distinct `key` / a fresh mount recorded by the double (the fresh-pty
     remount); a change to `null` reverts to the gated chrome — the terminal reopens in the new repo (or is
     re-gated) when the selection changes.
   - **covers —** `apps/studio/src/components/TerminalRepoGate.tsx` (the onChanged→re-key path) *(provisional path)*
7. **`trg-degrades-when-bridge-absent`** — an absent desktopRepo bridge renders TerminalDock directly, never calls the bridge, renders no control
   - **asserts —** with `window.desktopRepo` ABSENT (the studio-standalone case), the gate renders
     `TerminalDock` DIRECTLY (which shows its own honest disabled state), renders NO gate reason and NO
     repoControl, NEVER calls `ready` / `onChanged`, does NOT hang on a promise that never arrives, and does
     NOT crash the surrounding surface — the honest absent-bridge degrade.
   - **covers —** `apps/studio/src/components/TerminalRepoGate.tsx` (the absent-bridge branch) *(provisional path)*

## Guidance — the edits-existing slice that re-earns the signed verdict

The re-prove rung (ADR-0057 §3 expansion C, EDITS-EXISTING): `TerminalRepoGate.tsx` + its test EXIST at
HEAD (PR #702). Edit them additively, test-first — the reds are behaviour-assertion reds, NOT
missing-symbol.

- **The edited test —** `apps/studio/src/components/TerminalRepoGate.test.tsx` (`@vitest-environment jsdom`,
  the existing suite). EXTEND the `vi.mock("./TerminalDock")` double to RENDER `props.headerRight` (so an
  injected stub is findable inside the dock), keep the mount/unmount-recording + `data-seed`. Pass a
  `repoControl={<div data-testid="repo-control"/>}` stub in the relevant renders. ADD the two new tests
  (`trg-offers-repo-control-in-gate`, `trg-places-repo-control-in-header-when-ready`) and update the
  no-repo test to assert the CLEAR reason (a message, not the old exact "Select a repository…" string is
  fine — assert it names choosing a repo) + the repoControl-in-gate. Name each test EXACTLY its contract id
  (`trg-…`) so `storytree coverage terminal-repo-gate` reports 7/7 (ADR-0122) — reconcile any leaf-renamed
  titles to the contract ids (the prior build read 3/5).
- **The RED the spine observes (before IMPLEMENT) —** the two new tests FAIL against the current gate: it
  renders a bare message with no repoControl and forwards no `headerRight` (behaviour-assertion reds, not
  module-not-found). The existing 5 stay green until the restructure.
- **The GREEN —** EDIT `apps/studio/src/components/TerminalRepoGate.tsx` additively: add an optional
  `repoControl?: React.ReactNode` prop; keep reading `window.desktopRepo` through the LOCAL
  `DesktopRepoGateBridge` cast (`ready` / `onChanged`, never a global augmentation — the picker owns that);
  on `cwd === null` render the `.terminal-gate` gated chrome with a CLEAR reason + `{repoControl}` as the
  select affordance (wrap it so glue CSS can style it, e.g. a `.terminal-gate-actions` container); on a
  valid cwd render `<TerminalDock key={cwd} {...(repoControl ? { headerRight: repoControl } : {})}
  {...(seed ? { seed } : {})} />`; on an absent bridge render `<TerminalDock {...(seed ? { seed } : {})} />`
  directly (no gate, no control, no bridge call). Import `{ TerminalDock, TerminalDockSeed }` from
  `"./TerminalDock"`; do NOT import RepoPicker (it is injected). NO `@storytree/agent`, NO
  `@storytree/drive`, NO model path (the `modelPathBoundary.test.ts` wall stays green). After it, the
  assertions hold and `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay green. WIRING the
  TreeView glue to inject `<RepoPicker/>` as `repoControl` (dropping the floating pill) + the `.terminal-gate`
  / `.repo-picker` CSS (the gated-chrome + gear looks) + the real preload/main `ready` / `onChanged` glue +
  the fail-closed-in-the-real-app experience are witnessed under the Story UAT, not asserted in CI.

Rules:

- **Thin client — no agent, no drive, no model path** (ADR-0004 / ADR-0108 d.1). The gate's only backend
  seam is `window.desktopRepo` (read via a local cast); it imports no agent/drive/model code. The
  `modelPathBoundary.test.ts` guard pins this repo-wide; the gate must not breach it.
- **Wrap the byte-locked terminal, never modify it** (ADR-0057 signed-source byte-lock). IMPORT and RENDER
  `TerminalDock`, passing its `headerRight` / `seed` props; do NOT modify `TerminalDock.tsx` and do NOT use
  any `.terminal-dock*` selector — the gate is a SEPARATE component in a NEW `.terminal-gate` namespace. A
  dirtied signed source is source-drift, refused. (`TerminalDock.tsx`'s `headerRight` slot is added by the
  SIBLING `terminal-dock-panel` re-prove — its own signed edit, not this gate's.) `RepoPicker.tsx` /
  `pty-session-manager.ts` / `repo-selection.ts` stay byte-locked too.
- **Inject the repo control, never import it** (the no-code-edge wall). The `repoControl` is a `ReactNode`
  prop the TreeView glue wires (`<RepoPicker/>`); the gate does NOT import `repo-picker-panel` and does NOT
  call `pick`/`get` — so no in-story code edge (`depends_on: []` holds). Place it (gate select affordance /
  header gear); the control reaches the bridge itself.
- **Never a second global `Window.desktopRepo` augmentation** (the TS-conflict wall). `RepoPicker` already
  augments `Window.desktopRepo` (`pick` / `get`); the gate declares a LOCAL `DesktopRepoGateBridge` and
  reads the bridge via a local cast — a second conflicting `declare global` is a TS error.
- **Assert wiring, never the look** (ADR-0070). Prove the gate/offer-control/show/place-control-in-header/
  reopen/degrade/forward-seed behaviour over the mocked bridge + mocked dock + stub repoControl; the gate's
  appearance (the gated chrome, the prominent select button, the compact header gear) is the story's
  operator-attested UAT. Do NOT author a visual/pixel assertion here; the gate author signs no visual verdict.
- **Fail closed, never hang** — no valid repo renders the gate (the terminal will not run); an absent
  bridge renders TerminalDock directly (its own honest state), never a bridge call, never a hung promise,
  never a crash (`trg-gates-when-no-repo` / `trg-degrades-when-bridge-absent`).
- **One selected cwd, nothing more (slow growth)** — gate/reopen the terminal on ONE selected cwd. Do NOT
  implement the validate/persist lifecycle (that is `repo-selection`'s), do NOT open the native dialog or
  own the picker control (that is `repo-picker-panel` + main glue), do NOT clone/add/list/switch repos, do
  NOT compose the build command, do NOT offer a "clone fresh" option (explicitly DEFERRED), do NOT reach
  cloud/web working directories (DEFERRED, ADR-0174), do NOT add signing/build/PR (the interactive surface,
  never the gate leaf).
