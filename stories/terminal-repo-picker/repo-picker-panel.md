---
id: "repo-picker-panel"
tier: capability
story: terminal-repo-picker
title: "The renderer repo picker — reflects the current selection, opens the native picker on click, degrades honestly where the bridge is absent"
outcome: "The studio frontend adds a repo picker control that reflects the current selection on mount over the `desktopRepo` bridge, opens the native picker on click and updates the shown selection on a resolved path, leaves the selection unchanged on a cancelled (null) pick, and degrades honestly to a disabled 'repo picker unavailable' state where the bridge is absent (the studio-standalone case) — a THIN CLIENT that imports no `@storytree/agent`/`@storytree/drive` and holds no model path, mounted OUTSIDE the byte-locked TerminalDock in its own `.repo-picker` namespace."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors a
# vitest jsdom component test that imports a NOT-YET-EXISTING component from a NEW source file under
# apps/studio/src/components (red = module-not-found against the source that does not exist at HEAD), then
# writes that one new component (green). FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the
# BEHAVIOUR ONLY (reflect-on-mount, pick-updates-selection, cancel-keeps-selection, honest absent-bridge
# degradation) over a MOCKED `desktopRepo` bridge — the picker's APPEARANCE ("reads and sits right beside
# the terminal dock") is the story's operator-attested UAT leg 5 (the look is witnessed, never a machine
# visual verdict; do NOT add a visual/pixel assertion here). It mounts in a NEW `.repo-picker` CSS
# namespace and MUST NOT touch `.terminal-dock*` (the byte-locked TerminalDock's surface, a sibling chip's
# territory). The proof command is the studio VITEST suite, NOT node:test — the studio convention
# (apps/studio/src/components/*.test.tsx are @vitest-environment jsdom, vi.mock the seams,
# @testing-library/react, fake timers). SCOPE = apps/studio/src (the picker is a studio frontend component;
# the desktop renders the COMPILED studio dist, ADR-0090 d.4). This cap adds NO new dep and declares NO
# `addDeps` (resolveAddDepsGroup targets packages/*, never apps/*: verified
# workspacePackageForSource("apps/studio/src/x.ts") → null).
#
# CRITICAL — the real arm declares an explicit `proofCommand` (the vitest-runner-mismatch correction, the
# terminal-dock-panel / chat-panel / credential-broker precedent): the studio suite is VITEST + jsdom, NOT
# node:test. resolveProveSpec's DEFAULT real proof command is `node --import tsx --test <testFile>`
# (node:test), which CANNOT run a vitest jsdom `.test.tsx`. So this cap MUST declare a `real.proofCommand`
# that runs the ONE test file under VITEST: `pnpm --filter studio exec vitest run
# src/components/RepoPicker.test.tsx` (cwd is apps/studio, so the path is package-relative). The spine's
# CONFIRM observation and the leaf's run_proof both ride this ONE command (the one-oracle property), so
# red→green is observed under vitest.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/RepoPicker.test.tsx"
    sourceFile: "apps/studio/src/components/RepoPicker.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/RepoPicker.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/RepoPicker.tsx"]
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
        - "src/components/RepoPicker.test.tsx"
---

# The renderer repo picker — reflects the current selection, opens the native picker on click, degrades honestly where the bridge is absent

**Outcome —** The studio frontend adds a **repo picker** control that **reflects** the current selection on
mount over the `desktopRepo` bridge, **opens the native picker** on click and **updates** the shown
selection on a resolved path, **leaves it unchanged** on a cancelled (null) pick, and **degrades honestly**
to a disabled "repo picker unavailable" state where the bridge is absent (the studio-standalone case). It
is a **thin client**: it imports no `@storytree/agent` / `@storytree/drive` and holds no model path,
mounted OUTSIDE the byte-locked `TerminalDock` in its own `.repo-picker` namespace.

**Depends on —** nothing (within `terminal-repo-picker`). The picker is a self-contained component whose
ONLY backend seam is the `window.desktopRepo` bridge (the `BuildSection` / `ChatPanel` precedent — a
self-contained component over one seam, a clean jsdom unit). It sits on the OPPOSITE side of the
contextBridge from [`repo-selection`](repo-selection.md) and imports nothing from it — they share the
bridge WIRE SHAPE (`pick` / `get`) as a cross-boundary contract, not a code edge (the
`terminal-dock-panel` ↔ `pty-session-manager` precedent), so there is no in-story edge either way.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. It is the renderer half of
> the repo picker — the control the user actually clicks to choose their repo. The selection LIFECYCLE it
> drives (over the bridge) is [`repo-selection`](repo-selection.md); the real `desktopRepo` bridge
> (`apps/desktop/electron/preload.ts`), the native dialog, and the userData persistence are the story's
> operator-attested GLUE. THIS capability adds the renderer picker, proven offline against a mocked
> bridge. Its *appearance* ("reads and sits right beside the terminal dock") is the story's
> operator-attested UAT leg 5 (ADR-0070 — the look is witnessed, never a machine visual verdict).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the PICKER AS A WHOLE — a behavioural React
component that, on mount, reads the current selection over the bridge and reflects it (a path or a "default
checkout" label), opens the native picker on click and updates the shown selection on a resolved path,
leaves it unchanged on a cancelled pick, and renders an honest disabled state where the bridge is absent.
It spans the mount + reflect AND the pick-and-update AND the cancel path AND the absent-bridge degradation,
exercised against its one mocked seam — an integration test of the component's behaviour, not a single
isolated assertion.

WHY THIS IS A SEPARATE CAPABILITY FROM `repo-selection` (the splitting-rule, ADR-0010): the picker and the
selection module sit on OPPOSITE sides of the contextBridge and prove DIFFERENT observables in DIFFERENT
suites. `repo-selection` (the backend) proves the validate/persist/resolve LIFECYCLE — a module over
injected ports (proof scope `apps/desktop`, `node:test`). THIS proves the FRONTEND — a React control that
reflects, picks, cancels, and degrades (proof scope `apps/studio/src`, vitest jsdom, a mocked bridge).
They share the bridge wire shape (`pick` / `get`) as a CONTRACT across the boundary, not a code edge: the
picker never imports the selection module, the module never imports the picker — exactly why the picker is
a `studio` unit and the selection module is a `desktop` unit.

THE PICKER IS A THIN CLIENT — NO AGENT, NO DRIVE, NO MODEL PATH (ADR-0004 / ADR-0108 d.1). The picker asks
the bridge to pick a directory and shows the returned path; it **never imports `@storytree/agent` and
never imports `@storytree/drive`** (both are on the `apps/studio/src` model-path FORBIDDEN list, enforced
by `apps/studio/src/modelPathBoundary.test.ts`). The agent/filesystem boundary is the Electron main (the
bridge + the native dialog + node:fs) — the renderer is downstream of `window.desktopRepo`. So the picker
adds NO new cross-story `@storytree/*` edge and NO model-path breach. (This is the interactive surface,
never the prove-it-gate leaf — the picker composes no signing/build/PR; ADR-0174 / ADR-0091.)

THE BRIDGE IS THE ONLY SEAM (the `desktopApply`-presence + `BuildSection` precedent). The picker reaches
the selection ONLY through `window.desktopRepo`, a NEW contextBridge the desktop preload exposes (the story
glue), whose shape mirrors `desktopAuth` / `desktopApply` / `desktopTerminal`:
- `pick(): Promise<string | null>` — open the native directory dialog (the Electron main drives
  `dialog.showOpenDialog` → `repo-selection.select`), resolving the chosen VALIDATED path or `null` (the
  user cancelled, or picked an invalid dir).
- `get(): Promise<string | null>` — the current persisted selection (the main drives
  `repo-selection.current`), or null.
The test `vi.mock`s / installs a scripted `window.desktopRepo` and drives every observable through it — no
real IPC, no real dialog, no real Electron. Its **absence** (`window.desktopRepo === undefined`, the
studio-standalone case) is what drives the honest disabled state — the same feature-detect the shared
`StoreBanner` uses on `window.desktopApply` and the `TerminalDock` uses on `window.desktopTerminal`.

MOUNTS OUTSIDE THE BYTE-LOCKED TERMINALDOCK, IN A NEW `.repo-picker` NAMESPACE (the signed-source
byte-lock wall). `TerminalDock.tsx` anchors the `terminal-dock-panel` `--real` crown and MUST stay
byte-identical, and its `.terminal-dock*` CSS is a sibling chip's surface — so this picker is a SEPARATE
`RepoPicker` component with its OWN `.repo-picker*` CSS, never a modification of `TerminalDock` and never a
`.terminal-dock*` selector. Mounting `<RepoPicker/>` beside the dock in `TreeView` is operator-attested
glue (the story's leg 5), not asserted here.

DEGRADE HONESTLY WHERE THE BRIDGE IS ABSENT (slow growth, the honest-failure discipline). The picker ships
inside BOTH the native desktop (bridge present) and the standalone studio (`window.desktopRepo` absent —
the desktop preload is not loaded). In studio-standalone the picker must render an honest disabled "repo
picker unavailable" state — never call `pick`/`get`, never hang waiting on a promise that never arrives,
never crash the surrounding studio (the `StoreBanner` store-unreachable / `TerminalDock` absent-bridge
precedent). A load-bearing observable, not polish.

## No new cross-story edge (the boundary call — ADR-0010 §4 / ADR-0074)

The picker CONSUMES the `desktopRepo` bridge shape, but consuming a bridge shape is **not** a package
import and is **not** a new `depends_on`:

- **No `@storytree/*` frontend import.** The picker imports React and reaches the selection only through
  `window.desktopRepo` — it imports no `@storytree/agent`/`@storytree/drive` (the model-path wall) and no
  other organism. The bridge shape is declared LOCALLY (a small interface over `window.desktopRepo`), the
  same move `TerminalDock` makes for the `desktopTerminal` wire and `chat-panel` makes for the SSE wire.
- **No new dep in `apps/studio/package.json`.** The picker uses only React + existing studio primitives —
  it adds no new third-party or `@storytree/*` dependency. So this cap adds NO new package-import edge and
  declares NO `addDeps`.
- **The cross-boundary contract is the bridge shape.** The `pick` / `get` verbs are the seam both the
  renderer (here) and the Electron-main glue author to — a CONTRACT across the process boundary, enforced
  by both sides authoring the same shape, not by a code edge.

So `depends_on: []` (within-story) and the story's `desktop`/`studio`/`embedded-terminal` `artifact_edges`
(co-located source / build-atop, no import) are the correct, honest graph — the terminal-dock-panel
precedent.

## Integration test

**Goal —** Prove that the repo picker, over a mocked `desktopRepo` bridge, reflects the current selection
on mount, opens the picker on click and updates the shown selection on a resolved path, leaves it
unchanged on a cancelled pick, and renders an honest disabled state where the bridge is absent. Entirely
in jsdom: the bridge is mocked, fake timers drive transitions, no real socket / dialog / IPC / Electron.

The integration test exercises this capability against its **real collaborator shape** — the mocked
`desktopRepo` bridge, scripted as a double exactly as `ChatPanel.test.tsx` scripts `../api`. No stubs
within the component's own composition (the mount, the reflect, the pick handling, the degradation are all
real).

The integration test would:

1. Install a scripted `window.desktopRepo` mock whose `get()` resolves `/home/me/storytree` and whose
   `pick()` is scripted per case. Render `<RepoPicker/>` in jsdom on fake timers.
2. On mount → assert `get()` was called once and the resolved path is reflected in the control (and, with
   `get()` resolving null, a "default checkout" label is shown instead) — the reflect-on-mount.
3. Click "Choose repo…" with `pick()` scripted to resolve `/home/me/other-repo` → assert `pick()` was
   called and the shown selection updated to `/home/me/other-repo` — the pick-and-update.
4. Click "Choose repo…" with `pick()` scripted to resolve `null` (the user cancelled or picked an invalid
   dir) → assert the shown selection is UNCHANGED (still the prior value) and the control did not error —
   the cancel path.
5. Render with `window.desktopRepo` ABSENT (delete the mock) → assert the component renders an honest
   disabled "repo picker unavailable" state, NEVER calls `pick`/`get`, does NOT hang, and does NOT crash —
   the honest absent-bridge degradation.

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest
jsdom, `apps/studio/src/components/RepoPicker.test.tsx`), the `desktopRepo` bridge mocked/scripted. None
exist yet; each is the assertion a contract test WILL prove against the real picker once authored
(provisional path — re-cite at real `file:line` when built). Per ADR-0122 (`storytree coverage`), each
contract id is the lead of a distinctly-named test, so the coverage check reports 4/4. None is an
APPEARANCE assertion — the look is the story's operator-attested UAT leg 5 (ADR-0070).

1. **`rpp-reflects-current-on-mount`** — on mount the picker reads and reflects the current selection over the bridge
   - **asserts —** mounting `<RepoPicker/>` calls `desktopRepo.get()` once and reflects the resolved path
     in the control; when `get()` resolves null, a "default checkout" label is shown instead — the
     reflect-on-mount. The component's ONLY backend seam is the bridge (ADR-0004) — it imports no
     agent/drive/model code.
   - **covers —** `apps/studio/src/components/RepoPicker.tsx` (mount + reflect) *(provisional path)*
2. **`rpp-pick-updates-selection`** — clicking Choose calls the bridge pick and updates the shown selection on a resolved path
   - **asserts —** clicking "Choose repo…" calls `desktopRepo.pick()` and, on a resolved path, updates the
     shown selection to that path — the pick-and-update wiring.
   - **covers —** `apps/studio/src/components/RepoPicker.tsx` (pick handler) *(provisional path)*
3. **`rpp-cancelled-pick-keeps-selection`** — a cancelled (null) pick leaves the selection unchanged
   - **asserts —** clicking "Choose repo…" when `pick()` resolves `null` (cancelled / invalid) leaves the
     shown selection UNCHANGED and does not error — the honest cancel path.
   - **covers —** `apps/studio/src/components/RepoPicker.tsx` (the null-pick guard) *(provisional path)*
4. **`rpp-degrades-when-bridge-absent`** — an absent desktopRepo bridge renders an honest disabled state, never calls the bridge
   - **asserts —** with `window.desktopRepo` ABSENT (the studio-standalone case), the component renders an
     honest disabled "repo picker unavailable" state, NEVER calls `pick`/`get`, does NOT hang on a promise
     that never arrives, and does NOT crash the surrounding surface — the honest absent-bridge degradation.
   - **covers —** `apps/studio/src/components/RepoPicker.tsx` (the absent-bridge disabled state) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the repo picker as a new
component, test-first.

- **The new test —** `apps/studio/src/components/RepoPicker.test.tsx` (`@vitest-environment jsdom`, vitest
  + `@testing-library/react`, the studio convention — `vi.hoisted` + install a scripted
  `window.desktopRepo`, fake timers, exactly as `ChatPanel.test.tsx` / `BuildSection.test.tsx` do; NO real
  socket/dialog/IPC/Electron). Import `{ RepoPicker }` from `"./RepoPicker"`. Name each test for its
  contract id (`rpp-…`) so `storytree coverage repo-picker-panel` reports 4/4 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `RepoPicker.tsx` does
  not exist at HEAD, so the test fails module-not-found (the net-new missing-symbol red, ADR-0057). Assert
  reflect-on-mount, pick-and-update, the cancel path, and the honest absent-bridge state.
- **The GREEN —** write `apps/studio/src/components/RepoPicker.tsx`: a behavioural React component that
  reaches the selection only through `window.desktopRepo` (a locally-declared bridge interface), reflects
  `get()` on mount, calls `pick()` on click and updates the shown selection on a resolved path, keeps it on
  a null pick, and renders the honest disabled state where the bridge is absent — in its own `.repo-picker`
  CSS namespace, NEVER touching `.terminal-dock*` or `TerminalDock.tsx`. NO `@storytree/agent`, NO
  `@storytree/drive`, NO model path (the `modelPathBoundary.test.ts` wall stays green). After it, the
  import resolves, the assertions hold, and `pnpm --filter studio test` + `pnpm --filter studio typecheck`
  stay green. MOUNTING `<RepoPicker/>` into `TreeView` beside the dock + the native-dialog run + the picker
  look are witnessed under the Story UAT (legs 3, 5), not asserted in CI.

Rules:

- **Thin client — no agent, no drive, no model path** (ADR-0004 / ADR-0108 d.1). The picker's only backend
  seam is `window.desktopRepo`; it imports no agent/drive/model code and declares the bridge shape locally.
  The `modelPathBoundary.test.ts` guard pins this repo-wide; the picker must not breach it.
- **Never touch the byte-locked terminal surface** (ADR-0057 signed-source byte-lock). Do NOT modify
  `TerminalDock.tsx` or use any `.terminal-dock*` selector — the picker is a SEPARATE component in a NEW
  `.repo-picker` namespace. A dirtied signed source is source-drift, refused.
- **Assert wiring, never the look** (ADR-0070). Prove the reflect/pick/cancel/degrade behaviour over the
  mocked bridge; the picker's appearance is the story's UAT leg 5. Do NOT author a visual/pixel assertion
  here; the picker author signs no visual verdict.
- **Fail closed, never hang** — an absent bridge renders an honest disabled state, never a call, never a
  hung promise, never a crash (`rpp-degrades-when-bridge-absent`).
- **Renderer picker only (slow growth)** — render + wire the picker over the bridge shape. Do NOT implement
  the validate/persist lifecycle (that is `repo-selection`'s), do NOT open the native dialog (that is glue
  in main), do NOT manage multiple repos, do NOT reach cloud/web working directories (DEFERRED, ADR-0174),
  do NOT add signing/build/PR (the interactive surface, never the gate leaf).
