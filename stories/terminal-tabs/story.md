---
id: "terminal-tabs"
tier: story
title: "The embedded terminal is multi-session with a tab strip — a forest-map Build seed opens a FRESH tab, never the user's active Claude Code session"
outcome: "The embedded terminal becomes multi-session with a tab strip: the dock holds N pty sessions, each its own xterm pane, switchable / creatable (a \"+\") / closable (a per-tab \"×\" that disposes+reaps its pty), and every existing single-session behaviour (spawn, input↔pty, data-in, resize, visibility-toggle, refocus, absent-bridge degrade, the empty-session message) holds PER TAB — while the dock chrome (collapse/resize, the toggle, the headerRight slot that hosts the repo-gate gear) stays PER-DOCK, wrapping the tab set; the per-tab \"×\" disposes exactly its session, and dock unmount preserves sessions (app-owned, ADR-0189). A forest-map Build seed no longer writes into the active session: it opens a FRESH tab (a new pty session), switches to it, and pre-fills the composed command there (still pre-fill, never auto-run), so a Build click can never corrupt the user's interactive Claude Code session running in another tab."
status: proposed
proof_mode: UAT
# uat_witness ABSENT → human (ADR-0040 fail-closed signpost): the whole-story UAT — "the terminal has a
# tab strip, holds several real pty sessions, and a Build opens a fresh tab that leaves my Claude Code
# session untouched" — is appearance + native-shell + real-pty + live behaviour, all operator-attested
# (ADR-0070 / ADR-0186). The machine-driven story UAT node stays WITHHELD; the crown derives from the two
# capabilities' signed verdicts plus the operator's attestation of the tab-strip LOOK, the real-pty
# per-tab behaviour, and the "a Build opens a fresh tab, my Claude session untouched" legs.
# Capabilities, roots-first (a capability appears after everything it depends on). TWO machine-provable
# caps, BOTH editsExisting studio vitest jsdom over the SAME source (TerminalDock.tsx / .test.tsx) that
# embedded-terminal + map-terminal-build signed: multi-session-tabs (the tab substrate — the ROOT) and
# seed-opens-new-tab (the seed re-decision — depends_on the tab substrate). This is the first story with
# TWO caps over ONE source file, so their shared-file build ordering + re-sign is called out below.
capabilities: [multi-session-tabs, seed-opens-new-tab]
# Story-level cross-story edges (ADR-0010 §4 / ADR-0074). This story OWNS NO package — it is a VIRTUAL
# story (like embedded-terminal / map-terminal-build / terminal-chat): its net-new code is CO-LOCATED
# inside a component two prior stories own. All three edges are declared `depends_on` AND annotated
# `artifact_edges` (ADR-0166 — deliberate non-import / co-located-source edges, not @storytree/* package
# imports):
#   - embedded-terminal — this story REWRITES the `TerminalDock` component embedded-terminal authored
#               (apps/studio/src/components/TerminalDock.tsx): single-session → multi-session + tabs. It
#               needs that base dock (spawn/data/input/resize/toggle/degrade/refocus/headerRight over the
#               `desktopTerminal` bridge) as the substrate it makes per-tab, and RE-PROVES its
#               `terminal-dock-panel` behaviours per-tab. A follow-on rewriting a prior story's co-located
#               component — NO @storytree/* import → an artifact edge.
#   - map-terminal-build — this story RE-DECIDES map-terminal-build's `terminal-dock-seed` behaviour and
#               builds on the seed-delivery machinery it landed (the `seed?: {command; token}` prop, the
#               `compose-build-command` composer, the `map-build-seeds-terminal` Build button, the TreeView
#               `seed` glue). Those all stay as-is and FEED the seed; this story only re-points what the
#               DOCK does with it (open a fresh tab, not write the active session). Co-located component,
#               NO @storytree/* import → an artifact edge.
#   - studio  — the surface the component lives on. The desktop renders the COMPILED studio dist (ADR-0090
#               d.4), so the multi-session dock is a `studio` frontend change, exactly as terminal-chat /
#               map-terminal-build edit apps/studio/src. Thin client — no @storytree/agent / @storytree/drive
#               / model import (modelPathBoundary.test.ts); xterm.js is a third-party dep, not a cross-story
#               @storytree/* edge → an artifact edge.
# NO edge to `desktop`: this story adds NO apps/desktop code — the backend is ALREADY multi-session
# (PtySessionManager tracks a Map<sessionId, Session> and mints a fresh id per spawn; the desktopTerminal
# bridge already addresses write/resize/dispose/onData/onExit by sessionId). This is a RENDERER story that
# consumes the already-per-session bridge. NO edge to the prove-it-gate / spine (untouched — this changes
# only the interactive terminal, never the proof runtime).
depends_on: [embedded-terminal, map-terminal-build, studio]
artifact_edges: [embedded-terminal, map-terminal-build, studio]
# Deciding ADRs (ADR-0037 §2): 0186 (the WHAT — the terminal becomes multi-session with a tab strip, a
# Build seed opens a FRESH tab never the active session; amends 0174); 0174 (the embedded terminal + its
# map-spawn clause's SECOND option — "opens a seeded terminal tab pre-filled with it" — which this story
# realises; local pty NOW, cloud DEFERRED; the prove-it-gate leaf UNTOUCHED); 0070 (the two-stage
# frontend-builder proof — the tab geometry/behaviour machine-proven, the tab-strip appearance + the
# real-pty per-tab feel operator-attested); 0158 (glue is un-asserted code WITHIN a story — the tab-strip
# CSS/look + any dock-mount prop delta); 0010 (the organism model + the splitting-rule tiering the two caps
# + the real-prerequisites-only within-story edge); 0057 (the spec-borne proof config making each cap
# inner-loop buildable); 0004 (the thin-client boundary — the terminal is the INTERACTIVE surface only; the
# prove-it-gate leaf sdk-author.ts is UNTOUCHED and the renderer imports no @storytree/agent).
decisions: [186, 174, 70, 158, 10, 57, 4]
---

# The embedded terminal is multi-session with a tab strip — a Build seed opens a fresh tab, never the active session

**Outcome —** The embedded terminal becomes **multi-session with a tab strip**: the dock holds **N pty
sessions**, each its own xterm pane, **switchable** / **creatable** (a "+") / **closable** (a per-tab "×"
that disposes+reaps its pty), and every existing single-session behaviour (spawn, input↔pty, data-in,
resize, visibility-toggle, refocus, absent-bridge degrade, the empty-session message) holds **per tab** —
while the dock **chrome** (collapse/resize, the toggle, the `headerRight` slot that hosts the repo-gate
gear) stays **per-dock**, wrapping the tab set; the per-tab "×" **disposes exactly its session**, and dock
unmount **preserves sessions** (app-owned — they re-attach on the next mount; ADR-0189, which redefined
this story's original dispose-on-unmount wall). A forest-map **Build seed** no longer writes into the active session: it **opens a FRESH tab**
(a new pty session), switches to it, and **pre-fills** the composed command there (still pre-fill, **never
auto-run**), so a Build click **can never corrupt the user's interactive Claude Code session** running in
another tab.

This story is the build follow-on of **[ADR-0186](../../docs/decisions/0186-the-embedded-terminal-is-multi-session-with-tabs-a-map-build.md)**
(owner-directed 2026-07-11, born accepted per ADR-0110 — design-time alignment IS the ratification), which
**amends [ADR-0174](../../docs/decisions/0174-interactive-builds-run-in-an-in-app-terminal-not-the-in-app.md)**.
ADR-0174's map-spawn clause offered two delivery options — inject the composed build command into the
embedded terminal, **or open a seeded tab pre-filled with it**. The [`map-terminal-build`](../map-terminal-build/story.md)
build (PR #696) shipped the **first**: a Build click writes `pnpm storytree … build <id> --real --store
pg` into the dock's **single** pty session via `bridge.write(sessionId, command)`. The owner surfaced the
flaw: that single session is normally running the user's **interactive Claude Code** (the whole point of
[`embedded-terminal`](../embedded-terminal/story.md)), so the write injects the command into Claude Code's
own stdin — corrupting the user's input and, on Enter, sending it as a *message to Claude*, not a shell
command. The disruptive case is the main intended case. ADR-0186 chooses the **second** option and makes
the terminal multi-session to support it: the Build seed lands in its **own fresh shell**, the Claude Code
session in another tab untouched.

## The journey (why this is ONE story — the journey-principle)

The consumer is the desktop user; their goal is **to run several terminal sessions in tabs and kick off a
Build in a fresh tab without disturbing the Claude Code session they're already running**. Finishing "the
dock holds N sessions in a tab strip" leaves the user immediately needing "a Build opens a fresh tab
instead of the active one" — these are not separate value deliveries, they are **one continuous journey**
(the journey-principle: if finishing the first unit's journey leads the consumer straight to needing the
next, they are the same journey). The tab substrate is the enabling half; the Build-opens-a-fresh-tab is
the payoff that motivated the whole re-decision (the load-bearing ADR-0186 safety wall). The outcome states
the value in one arc: *the terminal is a tabbed multi-session terminal in which a Build seed opens a fresh
tab, never the user's active session.* So this story's **net-new** is: the multi-session tab substrate + a
seed that opens a fresh tab — one component rewrite, tiered into two provable caps.

**Why a NEW story, not a `terminal-dock-seed` defect-amend (the `defects-amend-the-owning-story` boundary).**
ADR-0186 did surface a *flaw* in map-terminal-build's `terminal-dock-seed` (writing to the active session
corrupts Claude Code). But the fix is not a narrow patch on that one cap's contract — it is a net-new
capability: the terminal gains a whole **multi-session tab machinery** (a tab strip, N sessions, switch /
create / close / reap) that is new journey value in its own right (run Claude Code in one tab, a build in
another, as any tabbed terminal does). The seed re-decide *rides on top of* that new capability. A
defect-amend fits a bug inside an existing contract; this is a new journey the owner directed (ADR-0186,
born accepted). So: a new story, which HONESTLY re-decides `terminal-dock-seed` (superseding it) and
re-proves `terminal-dock-panel` per-tab — recorded in "The re-prove of the two affected signed caps" below,
never silently.

## What this story is NOT (the walls — encode from the ADRs)

- **A RENDERER story — the backend is ALREADY multi-session (ADR-0186 Context).** `PtySessionManager`
  (`apps/desktop/src/backend/pty-session-manager.ts`) already tracks a `Map<sessionId, Session>` and mints
  a fresh id per `spawn`, and the `desktopTerminal` bridge (`apps/desktop/electron/preload.ts`) already
  addresses `write`/`resize`/`dispose`/`onData`/`onExit` **by `sessionId`**. The single-session limit is
  purely in the **renderer** — `TerminalDock` holds one `sessionIdRef` / one xterm. **Do NOT add or change
  `apps/desktop` code** — this story lifts the renderer to many sessions over the already-per-session
  bridge. No `desktop` edge; no `pty-session-manager` change.
- **It changes the INTERACTIVE terminal, NOT the prove-it-gate (ADR-0186 Scope / ADR-0174 CRITICAL note).**
  Signed `--real` verdicts still come **only** from the deterministic spine driving `ClaudeAgentAuthor`
  (`packages/agent/src/sdk-author.ts`) through the `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN →
  GATE` walk (`packages/orchestrator/*`). This story changes only the interactive terminal — how many
  sessions it holds, and which one a seed lands in. The prove-it-gate leaf (`sdk-author.ts`) and the whole
  `packages/orchestrator` spine are **UNTOUCHED** (ADR-0020 / ADR-0030 / ADR-0091 stand). It also does NOT
  license gate-landing as a substitute for the crown (the "gate-land skips `--real` verdicts" trap).
- **A seed NEVER touches an existing/active session — it ALWAYS opens a fresh tab (the load-bearing
  ADR-0186 wall).** This is the whole reason the story exists. The previously-active tab's session — the
  user's interactive Claude Code — receives NO write on a Build
  ([`seed-opens-new-tab`](seed-opens-new-tab.md)'s `son-seed-never-touches-active-session`), the permanent
  regression case for the exact defect ADR-0186 fixes.
- **Pre-fill, NEVER auto-run — carried forward unchanged.** The seeded command is written to the fresh
  tab's pty WITHOUT a trailing newline, so it sits at the prompt un-executed until the user presses Enter.
  A seeded `story build --real --store pg` opens a **billed, outward-facing auto-merging PR** (ADR-0136); a
  `node build --real` spends the subscription and parks a branch. Opening a *fresh* tab changes WHERE the
  command lands, never that a human must fire it deliberately
  ([`seed-opens-new-tab`](seed-opens-new-tab.md)'s `son-prefills-without-trailing-newline`).
- **Never orphan a pty — REDEFINED app-lifetime (ADR-0189).** As built by this story, every session was
  disposed on tab-close AND on dock unmount. ADR-0189 (app-owned sessions) reversed the unmount half:
  the per-tab "×" stays the explicit kill ([`multi-session-tabs`](multi-session-tabs.md)'s
  `mst-close-tab-disposes-its-session`), but dock unmount now disposes renderer resources only — the
  sessions survive and re-attach on the next mount (`mst-unmount-preserves-sessions`; the reap duty
  lives in the Electron main's window-close/app-quit lifecycle, so nothing outlives the APP).
- **The dock chrome stays PER-DOCK, wrapping the tab set (the placement wall).** The tab strip is a NEW
  horizontal strip **between** the dock header and the body. The header's toggle chevron and the optional
  `headerRight` slot — which the `terminal-repo-picker` follow-on (#705) uses to host the repo-gate gear —
  render **once per dock**, siblings of the tab strip, NOT per tab; the collapse/resize geometry wraps the
  whole tab set ([`multi-session-tabs`](multi-session-tabs.md)'s `mst-chrome-stays-per-dock`).
- **Thin client — no model path.** No cap imports `@storytree/agent` / `@storytree/drive` or holds a model
  path (`apps/studio/src/modelPathBoundary.test.ts` stays green). xterm.js is a third-party rendering
  library, not a model path; multiplying xterm instances across tabs adds no new seam. The terminal — the
  real Claude Code — is what runs the build.
- **LOCAL terminal only (ADR-0186 Scope / ADR-0174).** Cloud / web terminals stay DEFERRED. Do NOT scope
  them here.

## Capabilities (2)

Listed roots-first (a capability appears after everything it depends on). Both are `editsExisting` studio
vitest jsdom caps over the SAME `TerminalDock.tsx` / `TerminalDock.test.tsx` — see "The re-prove of the two
affected signed caps" and "Within-story dependency graph" for how the shared source is sequenced honestly.

| # | capability | outcome | proof | depends on |
|---|------------|---------|-------|------------|
| 1 | [`multi-session-tabs`](multi-session-tabs.md) | `TerminalDock` becomes multi-session with a tab strip — N sessions, each its own xterm pane, created ("+") / switched / closed ("×"); the `terminal-dock-panel` behaviours (spawn, input↔pty, data-in, resize, toggle, refocus, degrade, empty-session) hold PER TAB; the "×" disposes exactly its session, unmount preserves sessions (app-owned, ADR-0189); the toggle + `headerRight` slot + collapse/resize stay per-dock. | integration-test (studio vitest jsdom, editsExisting red→green over the mocked xterm + bridge) | — |
| 2 | [`seed-opens-new-tab`](seed-opens-new-tab.md) | A `seed` OPENS A FRESH TAB — spawns a new session, switches to it, and pre-fills the command there (no trailing newline, async-safe, token-re-tabbable) — and NEVER writes into an existing/active session; absent the prop the dock is byte-identical to the multi-session dock. | integration-test (studio vitest jsdom, editsExisting red→green over the mocked xterm + bridge) | `multi-session-tabs` |

## Operator-attested glue (un-asserted connective code WITHIN this story — ADR-0158, NOT capabilities)

- **The tab-strip appearance + the dock-mount prop delta.** The tab bar's LOOK (does it read as terminal
  tabs, the active tab legible, "+"/"×" affordances clear, the strip sitting cleanly between the header and
  the body) is operator-attested (ADR-0070), witnessed under the Story UAT — never a machine visual verdict.
  The `.terminal-dock*` CSS for the strip is glue. If the dock's public props change (they need not — the
  `seed` and `headerRight` prop shapes are unchanged), any `TreeView`/dock-mount delta is un-asserted
  connective code witnessed under the Story UAT, not a capability. The existing TreeView `seed` glue
  (`map-terminal-build` threads `seed`/`onSeedTerminal`) and the `terminal-repo-gate` `headerRight` mount
  are REUSED AS-IS: the story feeds the SAME `seed?: { command; token }` into the now-multi-session dock;
  only the dock's HANDLING of it changes (open a fresh tab). No new glue wire is required.

## Within-story dependency graph

Authored from the intended data-flow + the real imports/calls (re-derive when built, ADR-0010 §3, and
correct if the code disagrees). The graph is acyclic; **`multi-session-tabs` is the sole root**.

- `multi-session-tabs` — the root. It rewrites `TerminalDock` into a tabbed multi-session component over the
  `desktopTerminal` bridge; it consumes no other in-story unit.
- `seed-opens-new-tab` → `multi-session-tabs`. A **real precondition edge** (`cross-story-dependency` run
  within-story, both directions): seed-opens-new-tab's outcome — "the seed opens a FRESH tab, distinct from
  the active one" — is meaningless without the multi-tab substrate `multi-session-tabs` delivers; its UAT
  ("a Build opens a new tab, the active session untouched") needs `multi-session-tabs`'s new-tab + per-tab
  session model as a precondition. It is ALSO a **shared-file sequencing edge**: both caps `editsExisting`
  the SAME `TerminalDock.tsx`, so in the shared `--real` worktree `seed-opens-new-tab` builds AFTER
  `multi-session-tabs` commits the tab machinery, layering the seed re-route on top of the "+"-spawns-a-tab
  path it reuses. The reverse direction is "no" (`multi-session-tabs` needs nothing from the seed cap), so
  the edge is one-way — no cycle.

## The re-prove of the two affected signed caps (the honest crown accounting)

This story **rewrites `TerminalDock.tsx`**, which anchors **two already-signed** capability verdicts. The
gate treats a rewrite of anchored source as source-drift, so both must be accounted for honestly (ADR-0057
§3 re-prove; the `terminal-dock-panel` contract-6/7/8 "anchored bytes re-sign" precedent):

- **[`terminal-dock-panel`](../embedded-terminal/terminal-dock-panel.md) (embedded-terminal, 8 `tdp-*`
  contracts) — RE-PROVEN per-tab, not re-decided.** Its single-session behaviours — spawn-on-open + data-in,
  input-out, resize + dock-clamp, visibility-toggle-keeps-mounted, absent-bridge degrade, refocus, the
  optional `headerRight` slot, the empty-session honest message — become the **per-tab / active-tab /
  per-dock** behaviours of the multi-session dock. `multi-session-tabs`'s `editsExisting` arm re-drives
  `TerminalDock.test.tsx`, which **keeps all eight `tdp-*` tests** — adapted so the per-session ones
  (spawn, input, data, resize, toggle, refocus, empty-session) exercise the first/active tab (the N=1 case
  of the tab model), and the per-dock ones (`headerRight` slot, absent-bridge degrade) exercise the dock
  chrome that wraps the strip — so those contracts stay meaningful and GREEN under the new source.
  terminal-dock-panel's crown **source-drifts** (its anchored `TerminalDock.tsx` bytes are rewritten); its
  behaviour is **re-proven** by `multi-session-tabs`'s signed verdict over the new source. The orchestrator
  must re-tense `terminal-dock-panel.md`'s prose to note the per-tab re-proof (a cross-story spec edit
  outside this story's fence — flagged in "Open modeling calls").
- **`terminal-dock-seed` (map-terminal-build, 5 `tds-*` contracts) — RE-DECIDED (write-to-active →
  open-a-fresh-tab) and RETIRED.** Its behaviour ("on a seed, write the command to the **active** session
  via `bridge.write(sessionId, command)`") is **superseded** by [`seed-opens-new-tab`](seed-opens-new-tab.md)
  ("on a seed, open a **fresh** tab and pre-fill it there, never the active session"). `seed-opens-new-tab`'s
  `editsExisting` arm **replaced** the five `tds-*` "writes to the active session" cases with the `son-*`
  "opens a fresh tab" cases in the SAME test file, so the corpus never holds two contradictory seed
  behaviours. terminal-dock-seed's crown source-drifted AND its contracts were superseded; the
  **librarian-curator pass RETIRED `terminal-dock-seed.md`** (deleted — its write-to-active behaviour is
  gone from the code, 0-coverage) and re-tensed map-terminal-build to a two-cap story (the spec-edit
  disposition, flagged in "Open modeling calls" item 3). The load-bearing safety observable it carried — the
  **no-trailing-newline pre-fill** — is PRESERVED verbatim in `son-prefills-without-trailing-newline`; only
  the *destination* (fresh tab vs active session) changes.

**Within THIS story, the two new caps also share the source file.** `multi-session-tabs` signs
`TerminalDock.tsx` after the tab rewrite (the seed, if present, still writing the current tab — an
intermediate faithful to `terminal-dock-seed`); then `seed-opens-new-tab` edits the same file to re-route
the seed, so `multi-session-tabs`'s anchor drifts. Its tab tests are untouched by the seed re-route, so it
**re-signs cleanly over the final source** — the orchestrator re-drives `multi-session-tabs` after
`seed-opens-new-tab` lands so both crowns rest on the final bytes (the anchored-bytes re-sign pattern).
Flagged in "Open modeling calls".

## Cross-story boundary (ADR-0010 §4 / ADR-0074)

Authored from the intended consumed seams (re-verify against the real imports when built). This story OWNS
no package (a VIRTUAL story — the embedded-terminal / map-terminal-build precedent): its net-new code is
co-located inside a `studio` component two prior stories authored.

- **`embedded-terminal`** — the story whose `TerminalDock` this one rewrites (single-session →
  multi-session) and whose `terminal-dock-panel` behaviours it re-proves per-tab. Co-located component, no
  `@storytree/*` import → an **artifact edge** (ADR-0166), declared and annotated.
- **`map-terminal-build`** — the story whose `terminal-dock-seed` behaviour this one re-decides, building on
  its seed-delivery machinery (the `seed` prop, `compose-build-command`, `map-build-seeds-terminal`, the
  TreeView `seed` glue), which stay as-is and FEED the seed. Co-located component, no `@storytree/*` import
  → an **artifact edge**, declared and annotated.
- **`studio`** — the surface the component lives on; the desktop renders the compiled studio dist (ADR-0090
  d.4). Thin client — no `@storytree/agent` / `@storytree/drive` / model import (`modelPathBoundary.test.ts`);
  xterm.js is a third-party dep, not a cross-story `@storytree/*` edge → an **artifact edge**, declared and
  annotated.

**No edge to `desktop`** (the backend is already multi-session; this story adds no `apps/desktop` code — it
consumes the already-per-session `window.desktopTerminal` bridge, a `window` global, not a package import).
**No edge to the prove-it-gate / spine** (untouched — this changes only the interactive terminal).

## Story UAT

The integrated acceptance walkthrough that proves the whole multi-session terminal meets its outcome
end-to-end. Minimal-first (one coherent journey: open the app → the terminal has a tab strip → run Claude
Code in one tab → click Build → a fresh tab opens pre-filled, the Claude Code tab untouched), defect-driven
thereafter (each real failure earns a permanent regression case, never speculative breadth).

> **Per-leg witness (ADR-0106 / ADR-0070).** The mechanics legs are covered by the two capabilities' signed
> `--real` verdicts (the tab lifecycle + per-tab behaviours over the mocked xterm + bridge; the
> seed-opens-a-fresh-tab branch over the same seams). The experiential legs — the tab-strip **look/feel**, a
> REAL node-pty in each tab running real Claude Code (a native module + the paid subscription), and the
> load-bearing "a Build opens a fresh tab and my active Claude Code session is untouched" in the native
> shell — are `witness: human` (operator-attested, ADR-0070): an automated CI run cannot spawn real native
> ptys, run the paid SDK, or judge the tab feel. The story-level `uat_witness` is absent → human (the
> ADR-0040 fail-closed signpost), so the machine-driven whole-story UAT node stays WITHHELD; the crown
> derives from the per-cap signed verdicts plus the operator's attestations (legs 1, 4, 5).

**Goal —** A desktop user opens the app, finds a terminal with a **tab strip**, runs real Claude Code in
one tab, clicks **Build** on the forest map, and watches a **fresh tab** open pre-filled with the composed
`pnpm storytree … build <id> --real --store pg` command — the Claude Code tab **untouched** — reviews it,
and presses Enter to run the build as their own Claude Code in that new tab.

1. **The terminal has a tab strip and holds several sessions.** _(witness: human)_ The member opens the
   desktop app; the terminal dock shows a **tab strip** between the header and the body — a "+" opens a new
   tab, each tab its own terminal, a "×" closes one; the toggle + the repo-gate gear sit once in the dock
   header, above the strip. **Success —** the tab strip renders and reads as terminal tabs inside the
   native shell (the two-stage LOOK verdict, ADR-0070). *(The tab-strip appearance is operator-attested
   glue, not a CI leg.)*
2. **The multi-session tab lifecycle is honest over create / switch / close / dispose, per-tab behaviours
   intact.** _(witness: machine)_ Over the mocked xterm + `desktopTerminal` bridge, the dock spawns the
   first tab on open, opens an independent session on "+", shows the selected tab's pane on switch (others
   hidden, sessions preserved), disposes exactly the closed tab's session on "×" (others untouched), scopes
   input/data/resize per tab, keeps the toggle + `headerRight` + degrade per-dock, and on unmount disposes
   renderer resources only — sessions preserved, app-owned (ADR-0189; originally dispose-all-on-unmount)
   — with the eight `terminal-dock-panel` behaviours re-proven on the active tab.
   **Success —** [`multi-session-tabs`](multi-session-tabs.md)'s signed verdict (geometry + per-tab wiring,
   xterm mocked).
3. **A seed opens a FRESH tab and never touches the active session.** _(witness: machine)_ Over the mocked
   xterm + bridge, a new seed opens a new tab, spawns its session, switches to it, and pre-fills the command
   there with NO trailing newline; the previously-active tab's session receives NO write; a pre-spawn seed
   writes once its new session resolves; a token bump opens ANOTHER fresh tab; an absent seed leaves the
   dock byte-identical. **Success —** [`seed-opens-new-tab`](seed-opens-new-tab.md)'s signed verdict
   (behaviour over the mocked seams) — the load-bearing ADR-0186 safety wall, machine-proven.
4. **Clicking Build opens a fresh tab pre-filled, my Claude Code session untouched.** _(witness: human)_ In
   the desktop app, with real Claude Code running in tab 1, the member clicks Build on a node/story; a
   **new tab** opens, the composed `pnpm storytree … build --real --store pg` command sits pre-filled at
   its prompt (cursor at the end, **nothing executed**), and **tab 1's Claude Code session is exactly as it
   was** — no injected text, no interrupted input. Pressing Enter in the new tab launches a real build.
   **Success —** the owner's two-stage verdict (ADR-0070): the fresh tab opens, reads right, and leaves the
   active session untouched, witnessed inside the native shell — the exact failure ADR-0186 fixes, confirmed
   end-to-end. *(operator-attested — a real bridge + a real Claude Code session + a paid, PR-opening build;
   an agent must not fire it unattended.)*
5. **The tabs read and behave like real terminal tabs.** _(witness: human)_ Switching, closing, per-tab
   scrollback, colours, resize reflow, and focus all read and behave as ONE coherent tabbed terminal inside
   the native shell. **Success —** the owner's two-stage visual verdict (ADR-0070): the tab feel is
   witnessed, never machine-asserted.

End state — the embedded terminal is a tabbed multi-session terminal: N pty sessions in a tab strip,
per-tab behaviours signed under the studio suite, the chrome per-dock, each session killed only by its
tab's "×" or the app closing (unmount preserves them — app-owned, ADR-0189); a Build seed opens a fresh tab pre-filled (un-run) and never disturbs the user's active Claude
Code session — the tab-strip look, the real-pty per-tab feel, and the "fresh tab, active untouched" legs
operator-attested, the prove-it-gate leaf and the spine untouched.

## Proof

The story is proven when that walkthrough passes — the mechanics legs (2, 3) green under the two
capabilities' signed `--real` verdicts (with each cap's contracts green underneath), and the experiential
legs (1, 4, 5) operator-attested. Per ADR-0020, `healthy` is only ever DERIVED from signed verdicts;
nothing here is authored healthy. Both capabilities are proof-wired (each carries a `proof:` block with an
`editsExisting` `real:` arm — a behaviour-assertion red→green over the existing `TerminalDock.tsx` + its
vitest suite) so the spine can drive their studio vitest suites red→green under its own gate; the story's
machine-driven UAT node is WITHHELD (its `uat_witness` is absent → human, ADR-0040), so driving those
capabilities to signed verdicts is what makes the multi-session terminal buildable, and the crown
additionally awaits the operator's attestations (legs 1, 4, 5).

## Open modeling calls (for the owner / orchestrator)

None is a story-shape fork (ADR-0186 settled the WHAT — the terminal becomes multi-session with tabs, a
Build seed opens a fresh tab; owner-directed, born accepted, no new ADR reserved). Five items are
**surfaced for the orchestrator's build**, not decided here:

1. **The within-story shared-source re-sign (REQUIRED sequencing).** Both caps `editsExisting` the SAME
   `TerminalDock.tsx`, so `seed-opens-new-tab` drifts `multi-session-tabs`'s anchor when it lands. The
   orchestrator drives them in topo order (`multi-session-tabs` → `seed-opens-new-tab`) in the shared
   `--real` worktree, then **re-drives `multi-session-tabs`** so its crown re-signs over the final source
   (its tab tests are untouched by the seed re-route — a clean re-sign, the `terminal-dock-panel`
   anchored-bytes-re-sign pattern). The final `TerminalDock.tsx` satisfies BOTH suites.
2. **Re-tense `terminal-dock-panel.md` (embedded-terminal) — DONE (librarian-curator pass).** Its
   `TerminalDock.tsx` source is rewritten single-session → multi-session; its crown source-drifts and its
   eight `tdp-*` behaviours are re-proven **per-tab / per-dock** by `multi-session-tabs`. The librarian
   re-tensed its Outcome + "Proof status" to note the per-tab / per-dock re-proof under the multi-session
   source (the eight `tdp-*` contracts stay, GREEN — `storytree coverage terminal-dock-panel` reports 8/8 —
   re-proven by `multi-session-tabs`'s signed verdict). The decision-log side is recorded by ADR-0186's
   `amends: [174]` edge (a reciprocal note added on ADR-0174).
3. **Re-tense / re-decide `terminal-dock-seed.md` (map-terminal-build) — DONE (librarian-curator pass).** Its
   seed behaviour (write-to-active) is **superseded** by `seed-opens-new-tab` (open-a-fresh-tab); its five
   `tds-*` "writes to the active session" contracts were replaced by the `son-*` "opens a fresh tab"
   contracts in the shared test file. Disposition chosen: the librarian **RETIRED `terminal-dock-seed.md`**
   (deleted — its write-to-active behaviour is gone from the code, `storytree coverage` reported 0/5) and
   re-tensed map-terminal-build to a two-cap story, so the corpus holds ONE seed behaviour. The companion
   code edit — removing `terminal-dock-seed` from `packages/cli/src/node-build.test.ts`'s REAL-buildable
   snapshot regex + the map-terminal-build discovery comment (outside the `stories/**` fence) — lands with
   this story (see item 5). The load-bearing no-newline safety wall is preserved verbatim in
   `son-prefills-without-trailing-newline`.
4. **The empty / last-tab-closed disposition (a layout call, operator-attested glue).** When the user closes
   the last remaining tab, does the dock show an empty "+"-to-open state, or auto-open a fresh tab? There is
   no isolatable red→green in the empty-state look, so it is witnessed under UAT leg 1 —
   `multi-session-tabs` pins only that closing a tab disposes+reaps its session; the empty-state look is the
   orchestrator's call under the operator-attested glue.
5. **The `node-build.test.ts` REAL-buildable snapshot companion edit (REQUIRED, outside `stories/**`).**
   Authoring these two `real:`-armed caps makes `buildableNodeIds()` discover them (spec-borne, ADR-0057),
   which the `packages/cli/src/node-build.test.ts` REAL-buildable snapshot regex + its per-story discovery
   comment pin exactly (the known "node-build snapshot trap"). The orchestrator must add the two ids
   **alphabetically** to that regex — `multi-session-tabs` between `model-runtime-seam` and
   `multi-turn-transcript`; `seed-opens-new-tab` between `seed-corpus-scripts` and `shared-forest-connection`
   — plus a per-story discovery comment for `terminal-tabs`, or `pnpm -r test` goes red. This is a
   `packages/cli` test edit — outside the story-author's `stories/**` fence — flagged here so it lands with
   the caps.
