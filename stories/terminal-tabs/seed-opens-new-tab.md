---
id: "seed-opens-new-tab"
tier: capability
story: terminal-tabs
title: "A seed OPENS A FRESH TAB — spawn a new session, switch to it, pre-fill there (no trailing newline) — and NEVER writes into the active session"
outcome: "The multi-session `TerminalDock`'s `seed?: { command: string; token: number }` prop is RE-DECIDED: on a NEW seed (a token change) the dock no longer writes the command to the ACTIVE session — it OPENS A FRESH TAB (spawns a new pty session via the tab machinery), SWITCHES to it, and PRE-FILLS the command in that new tab via `bridge.write(newSessionId, command)` WITHOUT a trailing newline (never auto-run). The previously-active tab's session — the user's interactive Claude Code — receives NO write. A seed arriving before the new tab's spawn resolves is held pending and written once that session exists; a token bump opens ANOTHER fresh tab (a nonce, not a cache key). Absent the prop, the dock is byte-identical to the multi-session dock. This SUPERSEDES map-terminal-build's `terminal-dock-seed` (was write-to-the-active-session)."
status: proposed
proof_mode: integration-test
depends_on: [multi-session-tabs]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (editsExisting) over the SAME source as
# multi-session-tabs (apps/studio/src/components/TerminalDock.tsx / .test.tsx). It `depends_on`
# multi-session-tabs on a DOUBLY-real edge: (a) a proof-precondition — "the seed opens a FRESH tab, the
# active session untouched" is meaningless without the multi-tab substrate; (b) a shared-file sequencing
# edge — it builds AFTER multi-session-tabs commits the tab machinery, re-routing the seed on top of the
# "+"-spawns-a-tab path. At the point this cap builds, the dock is multi-session but the SEED still writes
# the active session (the intermediate faithful to terminal-dock-seed that multi-session-tabs carried
# forward). The RED the spine observes: NEW cases render `<TerminalDock seed={seed}/>` WITH an existing
# active session and assert (1) a FRESH session was spawned + switched-to + pre-filled and (2) the active
# session's `bridge.write` was NOT called with the command — which FAIL against the write-to-active
# behaviour, a real red→green over existing source. This RE-DECIDES map-terminal-build's terminal-dock-seed:
# the five `tds-*` "writes to the active session" cases are REPLACED by the `son-*` "opens a fresh tab"
# cases in the SAME test file (never two contradictory seed behaviours in the corpus). FRONTEND-BUILDER
# TWO-STAGE (ADR-0070): this `real:` arm proves BEHAVIOUR ONLY (fresh-tab spawn/switch/prefill, active
# untouched, no-newline, pending-seed, token re-tab) over the SAME mocked xterm + mocked `desktopTerminal`
# bridge — the pre-fill's APPEARANCE is the story's operator-attested UAT leg, NOT a machine visual verdict.
# The proof command is the studio VITEST suite, NOT node:test; the `real.proofCommand` runs the ONE test
# file under vitest (the terminal-dock-seed / terminal-dock-panel precedent). `install: true` (fresh
# worktree: tsx + tsc + vitest need the lockfile-only install, ADR-0031 §2). editsExisting + a single
# literal sourceFile === the one sourceGlob; the explicit vitest proofCommand is required (runner mismatch).
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

# A seed opens a fresh tab — spawn, switch, pre-fill — and never writes into the active session

**Outcome —** The multi-session `TerminalDock`'s `seed?: { command: string; token: number }` prop is
**RE-DECIDED**: on a NEW seed (a `token` change) the dock no longer writes the command to the **active**
session — it **opens a FRESH tab** (spawns a new pty session via the tab machinery), **switches** to it, and
**pre-fills** the command in that new tab via `bridge.write(newSessionId, command)` **without a trailing
newline** (never auto-run). The previously-active tab's session — the user's interactive Claude Code —
receives **NO write**. A seed arriving before the new tab's spawn resolves is held pending and written once
that session exists; a `token` bump opens **ANOTHER fresh tab** (a nonce, not a cache key). Absent the prop,
the dock is byte-identical to the multi-session dock. This **SUPERSEDES** map-terminal-build's
`terminal-dock-seed` (which wrote the command to the **active** session; retired by the librarian pass once
this cap landed — its write-to-active behaviour is gone from the code).

**Depends on —** [`multi-session-tabs`](multi-session-tabs.md) (within `terminal-tabs`). A **doubly-real**
edge: (a) a proof-precondition — "opens a FRESH tab, the active session untouched" is meaningless without
the multi-tab substrate; (b) a shared-file sequencing edge — both caps `editsExisting` the SAME
`TerminalDock.tsx`, so this builds AFTER `multi-session-tabs` commits the tab machinery, re-routing the seed
onto the "+"-spawns-a-tab path it delivered. The dock still receives the command as an opaque `string` in
its `seed` prop — it neither composes it (`compose-build-command`'s job, map-terminal-build) nor knows about
the Build button (`map-build-seeds-terminal`'s job); those and the TreeView `seed` glue are UNCHANGED and
FEED the seed. Only the dock's HANDLING of a seed changes.

> **Proof status (honest) — EDIT-EXISTING, `proposed`, RE-DECIDES `terminal-dock-seed`.** After
> `multi-session-tabs` lands, `TerminalDock` is multi-session but a `seed` still writes the ACTIVE session
> (the behaviour `terminal-dock-seed` signed, carried forward). That is the exact flaw ADR-0186 fixes: a
> Build seed injected into the active session corrupts a live Claude Code session. This capability re-routes
> the seed to open a FRESH tab and pre-fill THERE, never the active session. It REPLACES the five `tds-*`
> "writes to the active session" contracts with the `son-*` "opens a fresh tab" contracts (the orchestrator
> re-tenses `terminal-dock-seed.md` as superseded — a cross-story edit flagged in the story's Open modeling
> calls). The pre-fill's LOOK/feel is the story's operator-attested UAT leg (ADR-0070); this cap pins the
> WIRING + the safety wall. *(The `son-*` behaviours were subsequently re-proven unchanged under the
> ADR-0189 app-owned-session re-drive of the same source — `terminal-dock-panel`'s
> `tdp-reattaches-live-sessions-on-mount` rewrite; the anchored-bytes re-sign, seed semantics untouched.)*

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the SEED-TO-FRESH-TAB LIFECYCLE AS A WHOLE —
a behavioural React component that, on a new `seed` token, opens a NEW tab (reusing the tab machinery's
new-tab path), switches to it, ensures its session, handles the ASYNC race (a seed before vs after the new
tab's `spawn` resolves), writes the command as a NO-NEWLINE pre-fill in THAT tab, re-fires on a token bump
(another fresh tab), and — the load-bearing wall — leaves every OTHER session (the active Claude Code)
untouched. It spans the new-tab-open AND the switch AND the async pending-write AND the newline-safety AND
the never-touch-active wall AND the re-seed, exercised over the two mocked seams — an integration test of the
seed's fresh-tab behaviour, not one isolated assertion.

WHY IT IS A SEPARATE CAPABILITY FROM [`multi-session-tabs`](multi-session-tabs.md) (the splitting-rule,
ADR-0010): THIS proves the SEED SEMANTICS — given a `seed` prop, does the dock open a FRESH tab and pre-fill
it (never the active session)? `multi-session-tabs` proves the TAB SUBSTRATE — given user actions ("+",
switch, "×"), does the dock create/switch/close/dispose sessions? Different trigger (a `seed` prop vs user
tab actions), different observable (the seed-to-fresh-tab route + the never-touch-active safety wall vs the
tab lifecycle), different isolatable red. This `depends_on` the substrate (a fresh tab has no meaning
without it), a one-way precondition — but they are two distinct proofs, not one.

THE LOAD-BEARING SAFETY WALL — A SEED NEVER TOUCHES THE ACTIVE SESSION (`son-seed-never-touches-active-
session`). This is the whole reason ADR-0186 exists. The failure it fixes: with the user's interactive
Claude Code running in the active tab, a Build seed written via `bridge.write(activeSessionId, command)`
lands in Claude Code's stdin — corrupting the user's input, and on Enter sending it as a *message to Claude*,
not a shell command. So the seed MUST open a fresh tab and write ONLY the new session's id — the assertion
is a NEGATIVE one too: with a pre-existing active session, `bridge.write` is NEVER called with the active
session's id for the seed command. Pin it as its own contract — the permanent regression case for the
motivating defect (a real defect earns a permanent test, `uat-proves-the-goal-not-the-surface`).

OPEN A FRESH TAB VIA THE TAB MACHINERY, DON'T RE-INVENT IT. Reuse `multi-session-tabs`'s new-tab path (the
"+" spawn-a-session flow): a seed calls the same `openTab()` the "+" does — spawn a fresh session, add a
tab, make it active — then pre-fills. Do NOT ensure-or-reuse the current session (that was
`terminal-dock-seed`'s behaviour, now superseded). The seed's tab is a NORMAL tab (closable, switchable) —
it gains no special lifecycle.

HANDLE THE ASYNC SPAWN — REMEMBER A PENDING SEED, PER TAB (the load-bearing race, carried from
terminal-dock-seed). The new tab's `spawn` is async: the seed can arrive and open the tab before that tab's
`sessionId` resolves. The command must NOT be dropped: hold it as the NEW tab's PENDING seed (its record's
`pending` field) and write it in that tab's spawn `.then` once its session resolves; write EXACTLY ONCE
(`son-pre-spawn-seed-writes-on-resolve` + `son-seed-opens-a-fresh-tab`). This is the per-tab generalisation
of the single dock's `pendingSeedRef`.

THE TOKEN IS A NONCE — A BUMP OPENS ANOTHER FRESH TAB (`son-token-bump-opens-another-fresh-tab`). A user may
Build the SAME node twice, or re-seed the same command — the command string can be identical. So the trigger
is the `token` (a monotonic nonce the map's glue bumps), NOT the command value: a new token opens ANOTHER
fresh tab and pre-fills it, even for an unchanged command. Key the seed effect on `seed?.token` (a
`useEffect` dep + a `useRef` of the last-applied token), never on the command string — else a repeat click
silently does nothing. (This CHANGES `terminal-dock-seed`'s `tds-token-bump-reseeds-same-command`: a bump no
longer re-writes the SAME session — it opens a NEW tab.)

PRE-FILL, NEVER AUTO-RUN — NO TRAILING NEWLINE (the safety observable, PRESERVED verbatim). The command is
written to the fresh tab's pty WITHOUT a trailing `\n`/`\r`, so it lands at the shell prompt as if typed but
is NOT executed — the user reviews it and presses Enter. A seeded `story build --real --store pg` opens a
BILLED, outward-facing auto-merging PR (ADR-0136); a human MUST fire it deliberately. Opening a *fresh* tab
changes WHERE the command lands, never that no newline is appended. Pin the bare-command write
(`son-prefills-without-trailing-newline`) — identical to `terminal-dock-seed`'s `tds-prefills-without-
trailing-newline`, now in the fresh tab.

THE DOCK STAYS A THIN CLIENT — NO AGENT, NO DRIVE, NO MODEL PATH (ADR-0004 / ADR-0108 d.1). The seed is a
STRING written over the SAME `window.desktopTerminal` bridge; it imports no `@storytree/agent`/`@storytree/
drive` and holds no model path (`modelPathBoundary.test.ts` stays green). The seed prop is DATA in,
`bridge.write` out — no new seam.

DEGRADE HONESTLY — A SEED WITH NO BRIDGE IS A NO-OP; AN ABSENT SEED IS BYTE-IDENTICAL. Where
`window.desktopTerminal` is absent (studio-standalone), the dock renders the disabled state and never
spawns; a `seed` there must NOT open a tab, spawn, hang, or crash — it is ignored. With NO `seed` prop, the
dock is byte-identical to the multi-session dock (`son-absent-seed-is-a-no-op`) — the optional prop adds no
behaviour when unused; every `multi-session-tabs` + `terminal-dock-panel` behaviour stays green.

## Integration test

**Goal —** Prove that `<TerminalDock seed={{ command, token }}/>`, over a mocked xterm + mocked
`desktopTerminal` bridge, opens a FRESH tab on a new seed, switches to it, and writes the command there as a
no-trailing-newline pre-fill — while the previously-active session receives NO write — writing a pre-spawn
seed once the new tab's session resolves, opening ANOTHER fresh tab on a token bump, and leaving the dock
byte-identical when no seed is supplied. Entirely in jsdom: xterm + the bridge are mocked, the async spawn
resolved under the existing flush, no real socket/pty/SDK/DB/Electron.

The test exercises this capability against its **real collaborator shape** — the two mocked seams already in
`TerminalDock.test.tsx` (the `FakeTerminal` + a scripted `window.desktopTerminal`, its `spawn` resolving a
fresh id per call), the spawn resolved under the existing flush. No stubs within the component's own
composition (the new-tab open, the switch, the pending-seed bookkeeping, the write are all real).

The test would:

1. Install the scripted `window.desktopTerminal` (spawn → a fresh `sess-N` per call) + `vi.mock` xterm (the
   existing harness). Render `<TerminalDock/>`, expand it, and let the FIRST tab's session resolve (the
   active session — stand-in for the user's Claude Code). Hoist the seed to a `const`
   (`const seed = { command, token: 1 }`) to avoid the coverage `.tsx` inline-prop trap.
2. Rerender with `seed` → assert a SECOND `spawn` (a fresh tab), that the new tab is active, and once its
   session resolves `bridge.write(newSessionId, command)` was called — the open-a-fresh-tab + pre-fill
   (`son-seed-opens-a-fresh-tab`).
3. **Never touch active** — assert `bridge.write` was NEVER called with the FIRST (active) session's id for
   the seed command — the load-bearing safety wall (`son-seed-never-touches-active-session`).
4. **No newline** — assert the written string is EXACTLY the `command`, no trailing `\n`/`\r`
   (`son-prefills-without-trailing-newline`).
5. **Pre-spawn seed** — render with a seed while the new tab's spawn is still in-flight → assert nothing is
   written yet; advance the flush → assert the command is written EXACTLY ONCE on resolve
   (`son-pre-spawn-seed-writes-on-resolve`).
6. **Token bump** — rerender with the SAME command but `token: 2` → assert ANOTHER fresh tab opened (a THIRD
   `spawn`) and the command written in it (`son-token-bump-opens-another-fresh-tab`); the same token is a
   no-op.
7. **No seed** — render `<TerminalDock/>` with no seed → assert no extra tab, no pre-fill write; the
   multi-session + `tdp-*` behaviours hold byte-identical (`son-absent-seed-is-a-no-op`).

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/TerminalDock.test.tsx`), the xterm + bridge seams mocked/scripted. These REPLACE
map-terminal-build's five `tds-*` "writes to the active session" cases (superseded). Per ADR-0122, each
contract id leads a distinctly-named test, so `storytree coverage seed-opens-new-tab` reports 6/6. None is an
APPEARANCE assertion — the pre-fill's look is the story's operator-attested UAT leg (ADR-0070).

1. **`son-seed-opens-a-fresh-tab`** — a new seed opens a FRESH tab, switches to it, and pre-fills after its session resolves
   - **asserts —** rendering with a new `seed` token spawns a FRESH session (a new tab — a second/third
     `bridge.spawn`, a new xterm instance), switches to it, and after that session resolves calls
     `bridge.write(newSessionId, command)` with the seed's command — the open-a-fresh-tab + switch +
     pre-fill.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the seed→openTab + write path) *(provisional path)*
2. **`son-seed-never-touches-active-session`** — a seed writes ONLY the fresh tab, never the active session (the ADR-0186 safety wall)
   - **asserts —** with a pre-existing ACTIVE session (a resolved first tab — the stand-in for the user's
     Claude Code), a new seed's `bridge.write` is called with the NEW session's id ONLY; it is NEVER called
     with the active session's id for the seed command — the load-bearing wall that a Build can never
     corrupt a live interactive session. The permanent regression case for the defect ADR-0186 fixes.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the seed routes to the fresh session only) *(provisional path)*
3. **`son-prefills-without-trailing-newline`** — the seeded command is written WITHOUT a trailing newline (never auto-run)
   - **asserts —** the string handed to `bridge.write` for a seed is EXACTLY the seed's `command` — no
     trailing `\n`/`\r` appended — so it sits at the fresh tab's prompt un-executed until the user hits
     Enter. Preserved verbatim from `terminal-dock-seed` (a `--real` build is billed + PR-opening, ADR-0136;
     it must not auto-run on a click).
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the no-newline pre-fill write) *(provisional path)*
4. **`son-token-bump-opens-another-fresh-tab`** — a token bump opens ANOTHER fresh tab, even for an unchanged command
   - **asserts —** rerendering with the SAME `command` but a new `token` opens ANOTHER fresh tab (a further
     `bridge.spawn`) and pre-fills it — the nonce re-seed, keyed on `token` not the command value; a repeat
     Build on the same node re-fires into a new tab. Re-rendering with the SAME token is a no-op. (This
     re-decides `tds-token-bump-reseeds-same-command`: a bump no longer re-writes the same session.)
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the token-keyed seed→new-tab effect) *(provisional path)*
5. **`son-pre-spawn-seed-writes-on-resolve`** — a seed whose new tab's spawn hasn't resolved is held pending and written once, on resolve
   - **asserts —** a `seed` whose fresh tab's async `spawn` is still in-flight (no `sessionId` yet) is NOT
     dropped: it is held as that tab's pending seed and written EXACTLY ONCE in the spawn `.then` when the
     session resolves — the per-tab async-race handling.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the new tab's pending-seed + flush on resolve) *(provisional path)*
6. **`son-absent-seed-is-a-no-op`** — with no seed prop, the dock is byte-identical to the multi-session dock
   - **asserts —** rendered with NO `seed`, the dock opens no extra tab and writes no pre-fill; the
     multi-session tab behaviours and the eight `terminal-dock-panel` behaviours hold unchanged — the
     regression guard that the optional prop adds no behaviour when unused.
   - **covers —** `apps/studio/src/components/TerminalDock.tsx` (the optional-prop no-op path) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

The EDIT-EXISTING rung toward `healthy` (ADR-0057 §3, editsExisting): add the fresh-tab seed cases that fail
against the write-to-active seed (the red), then re-route the seed to open a fresh tab (the green),
REPLACING the five `tds-*` cases.

- **The edited test —** `apps/studio/src/components/TerminalDock.test.tsx`. REPLACE the five `tds-…` cases
  (write-to-active — superseded) with the six `son-…` cases over the EXISTING mocked xterm + bridge harness
  (the `spawn` mock resolving a fresh id per call so the fresh tab's session is distinct from the active
  one). Name each test for its contract id so `storytree coverage seed-opens-new-tab` reports 6/6 (ADR-0122).
  Keep the `multi-session-tabs` `mst-…` cases and the eight `tdp-…` cases green.
  **COVERAGE `.tsx` trap (ADR-0122):** the coverage tool parses the test source as `ScriptKind.TS`, so a
  test whose assertions follow an INLINE JSX object prop (`<TerminalDock seed={{ command, token }}/>`) can
  read as uncovered — hoist the seed to a `const` before the assertions
  (`const seed = { command, token: 1 }; render(<TerminalDock seed={seed}/>)`), the shape the existing suite
  already uses.
- **The RED the spine observes —** the new cases render `<TerminalDock seed={…}/>` WITH a pre-existing
  active session and assert (1) a FRESH session was spawned + switched-to + pre-filled and (2) the active
  session's `bridge.write` was NOT called with the command; against the write-to-active behaviour
  `multi-session-tabs` carried forward, `son-seed-opens-a-fresh-tab` + `son-seed-never-touches-active-
  session` fail — a real edit-existing red→green.
- **The GREEN —** edit `apps/studio/src/components/TerminalDock.tsx`: change the `seed` effect (keyed on
  `seed?.token`) to call the tab machinery's `openTab()` (spawn a fresh session, add a tab, make it active)
  and hold the command as THAT tab's pending seed, flushed with NO trailing newline in its spawn `.then`
  (write immediately if the new session already resolved). Remove the ensure-or-reuse-the-active-session
  path. Keep the thin-client wall (`modelPathBoundary.test.ts`), the `mst-*` + eight `tdp-*` contracts
  green, and `pnpm --filter studio typecheck` green. The pre-fill's LOOK is the story's operator-attested
  UAT leg — no visual assertion here.

Rules:

- **Never touch the active session** — a seed writes ONLY the fresh tab's id
  (`son-seed-never-touches-active-session`); the active Claude Code session gets no write. The load-bearing
  ADR-0186 wall.
- **Open a fresh tab via the tab machinery** — reuse `multi-session-tabs`'s new-tab path
  (`son-seed-opens-a-fresh-tab`); do NOT ensure-or-reuse the active session.
- **Pre-fill, never auto-run** — write the bare `command`, no trailing newline
  (`son-prefills-without-trailing-newline`); the user presses Enter.
- **Key on the token, not the command** — a nonce bump opens ANOTHER fresh tab even for an identical command
  (`son-token-bump-opens-another-fresh-tab`).
- **Never drop a pre-spawn seed** — hold it as the new tab's pending seed, flush once on resolve
  (`son-pre-spawn-seed-writes-on-resolve`).
- **Optional prop, zero-cost when absent** — no seed → byte-identical (`son-absent-seed-is-a-no-op`); keep
  the `mst-*` + `tdp-*` contracts green.
- **Thin client, mock the seams, never assert the look** (ADR-0004 / ADR-0070) — prove the wiring over the
  mocked xterm + bridge; the pre-fill's appearance is the story's UAT leg.
- **Seed-to-fresh-tab only (slow growth)** — re-route the seed. Do NOT compose the command
  (`compose-build-command`), do NOT re-point the Build button (`map-build-seeds-terminal`), do NOT build the
  tab substrate (`multi-session-tabs`), and do NOT sign / build / open a PR (the interactive surface, never
  the prove-it-gate leaf).
