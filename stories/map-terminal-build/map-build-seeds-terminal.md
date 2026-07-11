---
id: "map-build-seeds-terminal"
tier: capability
story: map-terminal-build
title: "On the desktop, the map Build button SEEDS the terminal instead of dispatching in-app — bridge-absent keeps the existing dispatch"
outcome: "`BuildSection`'s Build control gains an optional `onSeedTerminal?: (command: string) => void` callback and feature-detects `window.desktopTerminal` exactly as TerminalDock does. When the bridge is PRESENT and `onSeedTerminal` is provided, clicking Build calls `onSeedTerminal(composeBuildCommand({ unitId, scope }))` and does NOT POST `api.build` (no in-app dispatch, no poll). When the bridge is ABSENT or no callback is wired, Build is UNCHANGED — the existing `api.build` → build-registry → poll path. Scoped to the Build button only; the Adopt path (mapped stories) is untouched."
status: proposed
proof_mode: integration-test
depends_on: [compose-build-command]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. This is an EDIT-EXISTING (editsExisting) node: the
# source (apps/studio/src/components/BuildSection.tsx) and its test (BuildSection.test.tsx) EXIST and are
# green at HEAD — the Build button always POSTs api.build and polls (usePollableRun). The RED the spine
# observes is authored by adding NEW cases: with `window.desktopTerminal` stubbed present + an
# `onSeedTerminal` spy, clicking Build must call the spy with the composed command and NOT call api.build
# — which FAILS against the always-dispatch component at HEAD, so the edit is a real red→green over
# existing source. The existing Build/Adopt contracts stay green (the desktop seed path is a new branch;
# the bridge-absent path is unchanged). This node IMPORTS `composeBuildCommand` from
# apps/studio/src/lib/buildCommand.ts — the one within-story `depends_on` edge — so in the shared --real
# worktree it builds AFTER compose-build-command committed that file (its import then resolves). FRONTEND-
# BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves BEHAVIOUR ONLY (seed-not-dispatch when the bridge
# is present; dispatch-as-today when absent; adopt untouched) over a mocked bridge + spies — the terminal
# LOOK/feel is the story's operator-attested UAT leg. The proof command is the studio VITEST suite, NOT
# node:test; the `real.proofCommand` runs the ONE test file under vitest (the chat-panel / terminal-dock-
# panel precedent). `install: true` (fresh worktree: tsx + tsc + vitest need the lockfile-only install,
# ADR-0031 §2). editsExisting + a single literal sourceFile === the one sourceGlob (no wildcard), so the
# multi-file refine is satisfied; the explicit vitest proofCommand is required regardless (runner
# mismatch).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/BuildSection.test.tsx"
    sourceFile: "apps/studio/src/components/BuildSection.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/BuildSection.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/BuildSection.tsx"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is vitest (jsdom), not node:test — so the default `node --test` real proof cannot
    # run this `.test.tsx`. Run the ONE test file under vitest (`--filter studio exec` → cwd apps/studio).
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/BuildSection.test.tsx"
---

# On the desktop, the map Build button SEEDS the terminal instead of dispatching in-app

**Outcome —** `BuildSection`'s Build control gains an optional `onSeedTerminal?: (command: string) =>
void` callback and feature-detects `window.desktopTerminal` **exactly as TerminalDock does**
(`typeof window !== 'undefined' && window.desktopTerminal`). When the bridge is **PRESENT** and
`onSeedTerminal` is provided, clicking **Build** calls `onSeedTerminal(composeBuildCommand({ unitId,
scope }))` and does **NOT** POST `api.build` (no in-app dispatch, no poll). When the bridge is **ABSENT**
or no callback is wired, Build is **UNCHANGED** — the existing `api.build` → build-registry → poll path
(`usePollableRun`). Scoped to the **Build** button only; the **Adopt** path (mapped stories) is untouched.

**Depends on —** [`compose-build-command`](compose-build-command.md) (within `map-terminal-build`): this
capability IMPORTS `composeBuildCommand` to build the string it seeds — the one real code edge in the
within-story graph. It does NOT depend on [`terminal-dock-seed`](terminal-dock-seed.md): it calls
`onSeedTerminal(command)`, a prop the story's TreeView glue wires to the dock's `seed` — `BuildSection`
imports no `TerminalDock` and its proof mocks `onSeedTerminal` as a spy, so there is no code edge and no
proof-precondition between them (see the story's within-story graph).

> **Proof status (honest) — EDIT-EXISTING, `proposed`.** `BuildSection` EXISTS and is green at HEAD (the
> ADR-0090 / ADR-0094 build-and-adopt panel): the Build button always POSTs `api.build` and polls. This
> capability re-points it on the DESKTOP — where the embedded terminal exists — so the click SEEDS the
> terminal instead. Whether the seeded build actually runs and reads right in the native shell is the
> story's operator-attested UAT leg; this cap pins the BRANCH (seed vs dispatch) only.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the RE-POINT BRANCH AS A WHOLE — a
behavioural React component that feature-detects the bridge, and on a Build click chooses between two
paths: (desktop) call `onSeedTerminal` with the composed command and suppress the dispatch, or
(non-desktop / no callback) POST `api.build` and poll exactly as today. It spans the feature-detect AND
the compose-and-seed AND the dispatch-suppression AND the unchanged fallback AND the untouched Adopt path
— exercised over a mocked bridge + an `onSeedTerminal` spy + the existing mocked `api`. An integration
test of the button's behaviour across the two hosts, not one isolated assertion.

WHY IT IS A SEPARATE CAPABILITY FROM [`compose-build-command`](compose-build-command.md) AND
[`terminal-dock-seed`](terminal-dock-seed.md) (the splitting-rule, ADR-0010): the composer proves the
STRING (pure, no React); the dock-seed proves the DOCK accepts + pre-fills a seed (jsdom over xterm + the
bridge); THIS proves the BUTTON re-points on the desktop (jsdom over the `api` + bridge + a spy). Three
distinct observables, three isolatable reds, three files (`buildCommand.ts` / `TerminalDock.tsx` /
`BuildSection.tsx`). This one is the capstone: it imports the composer and calls the seed callback, tying
the journey together — hence its one `depends_on` edge (the composer import) and its glue-joined (not
`depends_on`) relationship to the dock.

FEATURE-DETECT THE BRIDGE THE SAME WAY THE DOCK DOES (the one-detect discipline). Read
`window.desktopTerminal` exactly as `TerminalDock.getDesktopTerminal()` does (`typeof window !==
'undefined' ? window.desktopTerminal : undefined`) — the SAME `desktopApply`-presence feature-detect the
studio already uses. The seed path fires only when BOTH the bridge is present AND `onSeedTerminal` is
provided; if EITHER is missing, fall back to the existing dispatch. This keeps a bridgeless surface
(hosted studio, dev studio in a browser) byte-identical and never leaves a Build click as a no-op
(`mbt-without-bridge-dispatches-as-today`).

SUPPRESS THE DISPATCH ON THE SEED PATH — DO NOT DO BOTH (the load-bearing branch). On the desktop seed
path, clicking Build must NOT also POST `api.build`: a double action would run BOTH an in-app SDK build
AND seed a terminal build — two paid builds of the same unit on one click. The seed REPLACES the
dispatch (`mbt-desktop-build-seeds-not-dispatches`). Concretely, the seed branch calls `onSeedTerminal`
and returns WITHOUT invoking the `usePollableRun` trigger; the panel need not enter the building/poll
phase at all (the terminal is now where the build lives).

SCOPE TO THE BUILD BUTTON ONLY — THE ADOPT PATH IS UNTOUCHED (slow growth, the honest wall). `BuildSection`
serves three go-green shapes: a story `goGreen === 'build'` (the Build button, a `--real` whole-story
drive), a capability `scope === 'node'` buildable (the Build button, a node `--real` drive), and a story
`goGreen === 'adopt'` (the `AdoptPanel`, a `mapped` story's reliability-gate adoption). This re-point
touches ONLY the Build button (both the story-build and node-build cases). The Adopt path stays exactly as
today — a `mapped` story's Adopt still POSTs `api.adopt` and polls (`mbt-adopt-path-unaffected`). Whether
Adopt should ALSO seed a terminal `storytree adopt <id> --pg` is a deliberate FOLLOW-ON surfaced in the
story's open modeling calls — NOT scoped here (an adopt is observe-and-sign, a different command shape and
a different owner call). Do NOT re-point Adopt in this capability.

THE PANEL STAYS A THIN CLIENT — NO AGENT, NO DRIVE, NO MODEL PATH (ADR-0004 / ADR-0108 d.1). The re-point
adds a feature-detect (`window.desktopTerminal`, already the studio's pattern) and an import of
`composeBuildCommand` (a pure string helper in `apps/studio/src/lib`, NOT a model path). It imports no
`@storytree/agent`/`@storytree/drive` and holds no model path — `modelPathBoundary.test.ts` stays green.
The app composes a command string and hands it to a callback; it runs no build (the ADR-0174 premise). The
prove-it-gate leaf (`packages/agent/src/sdk-author.ts`) and the spine are entirely untouched — this
changes only WHERE the click sends its intent.

OFFLINE-TESTABLE BY MOCKING THE SEAMS (the existing `BuildSection.test.tsx` discipline). `@vitest-
environment jsdom`, `vi.mock('../api', …)` for `api.build`/`api.adopt`/`api.buildStatus` (already mocked),
a stubbed `window.desktopTerminal` for the feature-detect, and an `onSeedTerminal` spy. Fake timers drive
the existing poll where relevant. No real `fetch`/socket/SDK/DB/Electron. The command is asserted via
`composeBuildCommand` (imported, real) so the seed and the composer agree.

## Integration test

**Goal —** Prove that `BuildSection`, over a mocked `api` + a stubbed `window.desktopTerminal` + an
`onSeedTerminal` spy, seeds the terminal with the composed command (and suppresses the dispatch) when the
bridge is present, dispatches `api.build` unchanged when the bridge is absent or no callback is wired, and
leaves the Adopt path untouched. Entirely in jsdom: the bridge + `api` are mocked, no real
socket/pty/SDK/DB/Electron.

The test exercises this capability against its **real collaborator shape** — the mocked `api` seam
(already scripted in `BuildSection.test.tsx`), a scripted `window.desktopTerminal`, and an `onSeedTerminal`
spy; `composeBuildCommand` is the real imported helper. No stubs within the panel's own composition (the
feature-detect, the branch, the compose-and-seed are all real).

The test would:

1. **Desktop, story scope** — stub `window.desktopTerminal` present; render a `goGreen === 'build'` story
   `<BuildSection scope="story" onSeedTerminal={spy} …/>`; click Build → assert `spy` was called ONCE with
   `composeBuildCommand({ unitId, scope: 'story' })` (= `pnpm storytree story build <id> --real --store pg`) and
   `api.build` was NOT called (no building/poll phase) — the desktop seed-not-dispatch branch.
2. **Desktop, node scope** — stub the bridge present; render a buildable `scope="node"` capability
   `<BuildSection onSeedTerminal={spy} …/>`; click Build → assert `spy` was called with
   `composeBuildCommand({ unitId, scope: 'node' })` (= `pnpm storytree node build <id> --real --store pg`) — the
   scope routing.
3. **Bridge absent** — DELETE `window.desktopTerminal`; render with `onSeedTerminal={spy}`; click Build →
   assert `api.build` WAS called and polled (the existing dispatch), and `spy` was NOT called — the
   unchanged non-desktop path.
4. **No callback** — stub the bridge present but pass NO `onSeedTerminal`; click Build → assert `api.build`
   WAS called (never a no-op) — the fail-safe fallback.
5. **Adopt untouched** — render a `goGreen === 'adopt'` `mapped` story; click Adopt → assert `api.adopt`
   was called exactly as today, regardless of the bridge — the Adopt path is not re-pointed.

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest
jsdom, `apps/studio/src/components/BuildSection.test.tsx`), the `api` + bridge seams mocked/scripted. None
exist yet; each is the assertion a contract test WILL prove against the re-pointed Build button once
authored (provisional path — re-cite at real `file:line` when built). Per ADR-0122, each contract id leads
a distinctly-named test, so `storytree coverage map-build-seeds-terminal` reports 4/4. None is an
APPEARANCE assertion — the terminal feel is the story's operator-attested UAT leg (ADR-0070).

1. **`mbt-desktop-build-seeds-not-dispatches`** — with the bridge present + a callback, Build seeds the terminal and does NOT POST api.build
   - **asserts —** with `window.desktopTerminal` present and `onSeedTerminal` provided, clicking Build
     calls `onSeedTerminal(composeBuildCommand({ unitId, scope }))` exactly once and does NOT call
     `api.build` (no building/poll phase) — the desktop re-point: the seed REPLACES the in-app dispatch,
     never both.
   - **covers —** `apps/studio/src/components/BuildSection.tsx` (the desktop seed branch) *(provisional path)*
2. **`mbt-seeds-scoped-command`** — the seeded command reflects the unit's scope (story vs node)
   - **asserts —** a story-scope Build seeds `pnpm storytree story build <id> --real --store pg`; a node-scope
     Build seeds `pnpm storytree node build <id> --real --store pg` — the composed command matches
     `composeBuildCommand` for the unit's scope, so the seeded build targets the clicked unit correctly.
   - **covers —** `apps/studio/src/components/BuildSection.tsx` (the compose-by-scope call) *(provisional path)*
3. **`mbt-without-bridge-dispatches-as-today`** — an absent bridge (or no callback) keeps the existing api.build dispatch
   - **asserts —** with `window.desktopTerminal` ABSENT, OR present but with no `onSeedTerminal` wired,
     clicking Build POSTs `api.build` and polls exactly as today, and `onSeedTerminal` is not called — the
     unchanged non-desktop path + the fail-safe fallback (a Build click is never a no-op).
   - **covers —** `apps/studio/src/components/BuildSection.tsx` (the feature-detect fallback to dispatch) *(provisional path)*
4. **`mbt-adopt-path-unaffected`** — the Adopt path is untouched by the re-point
   - **asserts —** a `mapped` story's Adopt button still POSTs `api.adopt` and polls exactly as today,
     regardless of `window.desktopTerminal`'s presence — the re-point is scoped to the Build button only;
     Adopt is not seeded (a deliberate follow-on, not this capability).
   - **covers —** `apps/studio/src/components/BuildSection.tsx` (the untouched AdoptPanel path) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

The EDIT-EXISTING rung toward `healthy` (ADR-0057 §3, editsExisting): add the desktop seed cases that fail
against the always-dispatch button at HEAD (the red), then add the feature-detect + seed branch (the
green).

- **The edited test —** `apps/studio/src/components/BuildSection.test.tsx`. Add the four `mbt-…` cases over
  the EXISTING mocked `api` + a stubbed `window.desktopTerminal` + an `onSeedTerminal` spy. Import the real
  `composeBuildCommand` to assert the seeded string. Name each test for its contract id so `storytree
  coverage map-build-seeds-terminal` reports 4/4 (ADR-0122). Keep the existing Build/Adopt contracts green.
- **The RED the spine observes —** the new cases stub the bridge present + a spy and click Build,
  asserting the spy fired with the composed command and `api.build` did NOT — the button at HEAD always
  POSTs `api.build`, so `mbt-desktop-build-seeds-not-dispatches` fails. A real edit-existing red→green.
- **The GREEN —** edit `apps/studio/src/components/BuildSection.tsx`: import `composeBuildCommand` from
  `../lib/buildCommand.js`; add the optional `onSeedTerminal?: (command: string) => void` prop; feature-
  detect `window.desktopTerminal`; in the Build click handler, when the bridge is present AND
  `onSeedTerminal` is provided, call `onSeedTerminal(composeBuildCommand({ unitId, scope }))` and return
  without triggering `usePollableRun` — else the existing dispatch. Leave `AdoptPanel` untouched. Keep the
  thin-client wall (`modelPathBoundary.test.ts`), the existing contracts, and `pnpm --filter studio
  typecheck` green. (In the shared `--real` worktree this builds after `compose-build-command` commits
  `buildCommand.ts`, so the import resolves.) The terminal feel is the story's operator-attested UAT leg —
  no visual assertion here.

Rules:

- **Seed REPLACES dispatch on the desktop, never both** (`mbt-desktop-build-seeds-not-dispatches`) — one
  Build click must not run two paid builds of the same unit.
- **Feature-detect exactly as the dock does** — the seed path needs BOTH `window.desktopTerminal` present
  AND `onSeedTerminal` wired; either missing → the existing dispatch (`mbt-without-bridge-dispatches-as-
  today`), never a no-op.
- **Scope to the Build button only** — the Adopt path is untouched (`mbt-adopt-path-unaffected`); an Adopt
  re-point is a deliberate follow-on, not this cap.
- **Thin client — no agent/drive/model path** (ADR-0004) — a feature-detect + a pure-string import; the
  prove-it-gate leaf and the spine are untouched.
- **Re-point the click, wire nothing else (slow growth)** — this changes WHERE the Build click sends its
  intent. It does NOT compose the string in-line (`compose-build-command`), does NOT hold the `seed`
  state or bump the token (the story's TreeView glue), does NOT pre-fill the terminal (`terminal-dock-
  seed`), and does NOT sign / build / open a PR (the interactive surface, never the gate leaf).
