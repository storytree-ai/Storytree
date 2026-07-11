---
id: "terminal-dock-seed"
tier: capability
story: map-terminal-build
title: "The terminal dock accepts a seed prop — expand, ensure a session, and PRE-FILL a command (no trailing newline, never auto-run)"
outcome: "The existing `TerminalDock` gains an OPTIONAL `seed?: { command: string; token: number }` prop: on a new seed (a token change) it expands the dock, ensures a pty session exists (the existing spawn-on-first-expand path), and writes the command to the pty via `bridge.write(sessionId, command)` as a PRE-FILL — WITHOUT a trailing newline, so the user reviews it and hits Enter themselves (never auto-run). A seed arriving before the async spawn resolves is remembered and written once the session exists; a token bump re-seeds even for an unchanged command. Absent the prop, the dock is byte-identical to today."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. This is an EDIT-EXISTING (editsExisting) node: the
# source (apps/studio/src/components/TerminalDock.tsx) and its test (TerminalDock.test.tsx) EXIST and are
# green at HEAD (embedded-terminal / PR #690) — a PROPLESS dock that spawns on first expand and wires
# user input to `bridge.write`. The RED the spine observes is authored by adding NEW cases that render
# `<TerminalDock seed={{ command, token }}/>` and assert the pre-fill write — which FAILS against the
# propless component at HEAD (it accepts no `seed`, writes nothing on mount), so the edit is a real
# red→green over existing source. The FIVE existing terminal-dock-panel contracts (tdp-*) stay green
# UNCHANGED — the prop is optional; an absent seed leaves the dock byte-identical. FRONTEND-BUILDER
# TWO-STAGE (ADR-0070): this `real:` arm proves GEOMETRY/BEHAVIOUR ONLY (expand-on-seed, write-after-
# spawn, no-trailing-newline, pending-seed-before-spawn, token re-seed) over the SAME mocked xterm +
# mocked `desktopTerminal` bridge the existing suite uses — the terminal's APPEARANCE is the story's
# operator-attested UAT leg, NOT a machine visual verdict here. The proof command is the studio VITEST
# suite, NOT node:test; the `real.proofCommand` runs the ONE test file under vitest (the terminal-dock-
# panel precedent — the node:test default cannot run a jsdom .test.tsx). `install: true` (fresh worktree:
# tsx + tsc + vitest need the lockfile-only install, ADR-0031 §2). editsExisting + a single literal
# sourceFile === the one sourceGlob (no wildcard), so the multi-file refine is satisfied; the explicit
# vitest proofCommand is required regardless (runner mismatch).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/TerminalDock.test.tsx"
    sourceFile: "apps/studio/src/components/TerminalDock.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/TerminalDock.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/TerminalDock.tsx"]
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
        - "src/components/TerminalDock.test.tsx"
---

# The terminal dock accepts a seed prop — expand, ensure a session, and PRE-FILL a command

**Outcome —** The existing `TerminalDock` gains an OPTIONAL `seed?: { command: string; token: number }`
prop. On a NEW seed (a `token` change) it: **expands** the dock (`setExpanded(true)`), **ensures** a pty
session exists (the existing spawn-on-first-expand path), and **writes** the command to the pty via
`bridge.write(sessionId, command)` as a **PRE-FILL — WITHOUT a trailing newline**, so the user reviews it
and hits Enter themselves (never auto-run). A seed that arrives BEFORE the async `spawn` resolves is
remembered and written once the session exists; a `token` bump re-seeds even for an unchanged `command`
string. With no `seed` prop the dock is **byte-identical to today**.

**Depends on —** nothing (within `map-terminal-build`). The dock receives the command as an opaque
`string` in its `seed` prop — it neither composes the command
([`compose-build-command`](compose-build-command.md)'s job) nor knows about the Build button
([`map-build-seeds-terminal`](map-build-seeds-terminal.md)'s job). The command reaches it through the
story's TreeView glue (a `seed` state passed down as `<TerminalDock seed={seed}/>`), so this capability is
an independent ROOT — the [`embedded-terminal`](../embedded-terminal/terminal-dock-panel.md) two-roots-
joined-by-glue shape, one story later.

> **Proof status (honest) — EDIT-EXISTING, `proposed`.** The `TerminalDock` component EXISTS and is green
> at HEAD (embedded-terminal / PR #690) — a propless dock that spawns a pty on first expand and pipes
> user input to `bridge.write(sessionId, data)`. It has no way to be told "pre-fill this command." This
> capability adds the one optional `seed` prop so the map's Build click can drop a runnable command into
> the terminal — pre-filled, never run. The pre-fill's LOOK/feel (does the command sit at the prompt like
> the user typed it) is the story's operator-attested UAT leg; this cap pins the WIRING only.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the SEED LIFECYCLE AS A WHOLE — a
behavioural React component that, on a new `seed` token, expands the dock, ensures a session (reusing the
existing spawn-on-first-expand effect, never a second spawn), handles the ASYNC race (a seed before vs
after `spawn` resolves), writes the command as a NO-NEWLINE pre-fill, and re-fires on a token bump — while
leaving every existing dock behaviour (spawn, input, resize, fold, absent-bridge degrade) untouched. It
spans the expand AND the session-ensure AND the async pending-write AND the newline-safety AND the
re-seed, exercised over the two mocked seams — an integration test of the component's seed behaviour, not
one isolated assertion.

WHY IT IS A SEPARATE CAPABILITY FROM [`map-build-seeds-terminal`](map-build-seeds-terminal.md) (the
splitting-rule, ADR-0010): THIS proves the DOCK SIDE — given a `seed`, does the terminal expand and
pre-fill the command safely (no newline, async-safe, re-seedable)? `map-build-seeds-terminal` proves the
BUTTON SIDE — on the desktop, does a Build click CALL the seed callback (with the composed command)
instead of dispatching in-app? Different observable, different file (`TerminalDock.tsx` vs
`BuildSection.tsx`), different isolatable red. They are joined by the story's TreeView glue (the `seed`
state + the `seedTerminal` setter that bumps the token), NOT a code import — so there is no `depends_on`
edge between them; both consume the glue, the `chat-panel` ↔ `chat-sse-mount` pattern.

THE TOKEN IS A NONCE, NOT A CACHE KEY (the re-seed observable). A user may click Build on the SAME node
twice, or re-seed the same command after clearing the terminal — the command string can be identical. So
the trigger is the `token` (a monotonic nonce the glue bumps on every seed), NOT the `command` value: a
new token RE-WRITES even when `command` is unchanged. Key the seed effect on `seed?.token` (a `useEffect`
dep + a `useRef` of the last-applied token), never on the command string — else a repeat click silently
does nothing (`tds-token-bump-reseeds-same-command`).

HANDLE THE ASYNC SPAWN — REMEMBER A PENDING SEED (the load-bearing race). The existing spawn is async:
`void bridge.spawn().then((res) => { sessionIdRef.current = res.sessionId })`. A seed can arrive while
`sessionIdRef.current` is still null (the dock was never expanded, so the first expand's spawn is
in-flight). The command must NOT be dropped: hold it as a PENDING seed (a ref) and write it in the spawn
`.then` once the session resolves; when a session already exists, write immediately. Either path writes
EXACTLY ONCE per token (`tds-seed-before-session-writes-on-resolve` + `tds-seed-expands-and-prefills-
after-spawn`). Mirror the existing effect's guard (`termRef.current`) so a seed never triggers a second
spawn/mount.

PRE-FILL, NEVER AUTO-RUN — NO TRAILING NEWLINE (the load-bearing SAFETY observable). The command is
written to the pty WITHOUT a trailing `\n`/`\r`, so it lands at the shell prompt as if typed but is NOT
executed — the user reviews it and presses Enter. This is not polish: a seeded `story build --real --store
pg` opens a BILLED, outward-facing auto-merging PR (ADR-0136), and a `node build --real` spends the
subscription and parks a branch — a human MUST fire it deliberately. A trailing newline would auto-run a
paid, PR-opening build on a single map click. Pin the no-newline write (`tds-prefills-without-trailing-
newline`); the leaf writes the bare `command` string, nothing appended.

THE DOCK STAYS A THIN CLIENT — NO AGENT, NO DRIVE, NO MODEL PATH (ADR-0004 / ADR-0108 d.1). The seed is a
STRING written over the SAME `window.desktopTerminal` bridge the dock already uses; it imports no
`@storytree/agent`/`@storytree/drive` and holds no model path (`modelPathBoundary.test.ts` stays green).
The seed prop is DATA in, `bridge.write` out — no new seam, no build engine.

REUSE THE EXISTING SEAMS, DON'T DISTURB THE FIVE GREEN CONTRACTS (ADR-0175 discipline, applied within this
story). Author over the SAME mocked xterm + mocked `desktopTerminal` bridge `TerminalDock.test.tsx`
already installs (the `FakeTerminal` + scripted `window.desktopTerminal`). The prop is OPTIONAL; the five
existing terminal-dock-panel contracts (`tdp-spawns-on-open-and-writes-data`, `tdp-forwards-input-to-
bridge`, `tdp-resizes-with-the-dock`, `tdp-toggles-visibility-keeping-terminal-mounted`,
`tdp-degrades-when-bridge-absent`) must stay green UNCHANGED — an absent seed leaves the dock byte-
identical (`tds-absent-seed-preserves-existing-behaviour`).

DEGRADE HONESTLY — A SEED WITH NO BRIDGE IS A NO-OP, NEVER A CRASH. Where `window.desktopTerminal` is
absent (studio-standalone), the dock already renders the disabled "terminal unavailable here" state and
never spawns. A `seed` in that state must NOT spawn, hang, or crash — it is simply ignored (there is no
pty to pre-fill). The map-side re-point already gates seeding on the bridge's presence
(`map-build-seeds-terminal`), so a seed reaching a bridgeless dock is the belt-and-braces case; keep it
inert.

## Integration test

**Goal —** Prove that `<TerminalDock seed={{ command, token }}/>`, over a mocked xterm + mocked
`desktopTerminal` bridge, expands the dock, ensures ONE session, and writes the command as a
no-trailing-newline pre-fill — writing a pre-spawn seed once the session resolves, re-writing on a token
bump, and leaving every existing behaviour green when no seed is supplied. Entirely in jsdom: xterm + the
bridge are mocked, fake timers drive the async spawn, no real socket/pty/SDK/DB/Electron.

The test exercises this capability against its **real collaborator shape** — the two mocked seams already
in `TerminalDock.test.tsx` (the `FakeTerminal` + a scripted `window.desktopTerminal`), the spawn resolved
under fake timers. No stubs within the component's own composition (the expand, the session-ensure, the
pending-seed bookkeeping, the write are all real).

The test would:

1. Install the scripted `window.desktopTerminal` + `vi.mock` xterm (the existing harness). Render
   `<TerminalDock seed={{ command: 'pnpm storytree story build x --real --store pg', token: 1 }}/>` folded.
2. On the new seed → assert the dock EXPANDED (`aria-expanded` / the body no longer `hidden`), `spawn` was
   called ONCE, and after the spawn resolves (advance fake timers) `bridge.write(sessionId, 'storytree
   story build x --real --store pg')` was called — the expand + session-ensure + pre-fill.
3. Assert the written string carries NO trailing `\n`/`\r` (the exact `command`, nothing appended) — the
   never-auto-run safety wall.
4. **Pre-spawn seed** — render with a seed while the spawn is still in-flight (before advancing timers) →
   assert nothing is written yet; advance timers to resolve `spawn` → assert the command is written EXACTLY
   ONCE (the pending seed flushed on resolve), no second `spawn`.
5. **Token bump, same command** — rerender with the SAME `command` but `token: 2` → assert the command is
   written AGAIN (the nonce re-seed), the session unchanged (no re-spawn).
6. **No seed** — render `<TerminalDock/>` with no seed prop → assert the five existing behaviours hold
   byte-identical (spawn-on-open + data-in, input-out, resize + clamp, fold keeps mounted, absent-bridge
   disabled) — the regression guard.

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest
jsdom, `apps/studio/src/components/TerminalDock.test.tsx`), the xterm + bridge seams mocked/scripted. None
exist yet; each is the assertion a contract test WILL prove against the seeded dock once authored
(provisional path — re-cite at real `file:line` when built). Per ADR-0122, each contract id leads a
distinctly-named test, so `storytree coverage terminal-dock-seed` reports 5/5. None is an APPEARANCE
assertion — the pre-fill's look is the story's operator-attested UAT leg (ADR-0070).

1. **`tds-seed-expands-and-prefills-after-spawn`** — a new seed expands the dock and, once the session exists, writes the command
   - **asserts —** rendering with a new `seed` token expands the dock and ensures ONE session (the
     existing spawn-on-first-expand, guarded — no second spawn); after `spawn` resolves,
     `bridge.write(sessionId, command)` is called with the seed's command — the expand + session-ensure +
     pre-fill.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the seed effect: expand + ensure-session + write) *(provisional path)*
2. **`tds-prefills-without-trailing-newline`** — the seeded command is written WITHOUT a trailing newline (never auto-run)
   - **asserts —** the string handed to `bridge.write` for a seed is EXACTLY the seed's `command` — no
     trailing `\n`/`\r` appended — so the command sits at the prompt un-executed until the user hits
     Enter. The load-bearing safety wall: a `--real` build is billed + PR-opening (ADR-0136); it must not
     auto-run on a click.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the no-newline pre-fill write) *(provisional path)*
3. **`tds-seed-before-session-writes-on-resolve`** — a seed arriving before spawn resolves is written once the session exists
   - **asserts —** a `seed` that arrives while the async `spawn` is still in-flight (no `sessionId` yet) is
     NOT dropped: it is held pending and written EXACTLY ONCE in the spawn `.then`, with no second spawn —
     the async-race handling.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the pending-seed ref + flush on spawn resolve) *(provisional path)*
4. **`tds-token-bump-reseeds-same-command`** — a token bump re-writes even when the command string is unchanged
   - **asserts —** rerendering with the SAME `command` but a new `token` writes the command AGAIN (the
     nonce re-seed — a repeat Build click on the same node re-fires), with the session unchanged (no
     re-spawn). Keyed on `token`, never on the command value.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the token-keyed seed effect) *(provisional path)*
5. **`tds-absent-seed-preserves-existing-behaviour`** — with no seed prop, the dock is byte-identical to today
   - **asserts —** rendered with NO `seed`, the dock never writes a pre-fill and the five existing
     terminal-dock-panel behaviours hold unchanged — spawn-on-open + data-in, input-out, resize + clamp,
     fold keeps the terminal mounted, and the absent-bridge disabled state — the regression guard that the
     optional prop adds no behaviour when unused.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the optional-prop no-op path) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

The EDIT-EXISTING rung toward `healthy` (ADR-0057 §3, editsExisting): add the seed cases that fail against
the propless dock at HEAD (the red), then add the optional prop + seed effect (the green).

- **The edited test —** `apps/studio/src/components/TerminalDock.test.tsx`. Add the five `tds-…` cases
  over the EXISTING mocked xterm + bridge harness (fake timers to resolve `spawn`). Name each test for its
  contract id so `storytree coverage terminal-dock-seed` reports 5/5 (ADR-0122). Keep the five `tdp-…`
  cases green unchanged.
- **The RED the spine observes —** the new cases render `<TerminalDock seed={…}/>` and assert the pre-fill
  write; the component at HEAD accepts no `seed` and writes nothing on mount, so `tds-seed-expands-and-
  prefills-after-spawn` (and the others) fail — a real edit-existing red→green.
- **The GREEN —** edit `apps/studio/src/components/TerminalDock.tsx`: add the optional `seed?: { command:
  string; token: number }` prop; a `useEffect` keyed on `seed?.token` that `setExpanded(true)`, and — once
  `sessionIdRef.current` exists — `bridge.write(sessionId, seed.command)` with NO trailing newline; a
  pending-seed ref flushed in the existing `spawn().then(...)` for the pre-session case; a last-applied-
  token ref so a bump re-fires. Keep the thin-client wall (`modelPathBoundary.test.ts`), the five existing
  contracts, and `pnpm --filter studio typecheck` green. The pre-fill's LOOK is the story's operator-
  attested UAT leg — no visual assertion here.

Rules:

- **Pre-fill, never auto-run** — write the bare `command`, no trailing newline
  (`tds-prefills-without-trailing-newline`); the user presses Enter. A `--real` build is billed +
  PR-opening (ADR-0136) — it must never fire on a click.
- **Key on the token, not the command** — a nonce bump re-seeds even an identical command
  (`tds-token-bump-reseeds-same-command`).
- **Never drop a pre-spawn seed** — hold it pending and flush it when `spawn` resolves, exactly once
  (`tds-seed-before-session-writes-on-resolve`); reuse the existing spawn guard — never a second spawn.
- **Optional prop, zero-cost when absent** — no seed → the dock is byte-identical
  (`tds-absent-seed-preserves-existing-behaviour`); keep the five `tdp-…` contracts green.
- **Thin client, mock the seams, never assert the look** (ADR-0004 / ADR-0070) — prove the wiring over the
  mocked xterm + bridge; the pre-fill's appearance is the story's UAT leg.
- **Seed the dock, wire nothing else (slow growth)** — accept + pre-fill a command. Do NOT compose the
  command (`compose-build-command`), do NOT re-point the Build button (`map-build-seeds-terminal`), do NOT
  hold the `seed` state (the story's TreeView glue), and do NOT sign / build / open a PR (the interactive
  surface, never the prove-it-gate leaf).
