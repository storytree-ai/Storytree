---
id: "terminal-tabs"
tier: story
title: "The embedded terminal is multi-session with a VS Code-style session panel — a forest-map Build seed opens a FRESH tab, never the user's active Claude Code session"
outcome: "The embedded terminal becomes multi-session with a VS Code-style session panel: the dock holds N pty sessions, each its own xterm pane, listed as ROWS in a panel beside the terminal pane (down the right of the dock body) — switchable (click a row) / creatable (a \"+\" in the panel) / closable (a per-row \"×\" that disposes+reaps its pty), and every existing single-session behaviour (spawn, input↔pty, data-in, resize, visibility-toggle, refocus, absent-bridge degrade, the empty-session message) holds PER SESSION — while the dock chrome (collapse/resize, the toggle, the headerRight slot that hosts the repo-gate gear) stays PER-DOCK, wrapping the panel + pane; the per-row \"×\" disposes exactly its session, and dock unmount preserves sessions (app-owned, ADR-0189). The numbered tab-button strip is replaced by this panel (ADR-0190 §3); split panes are OUT of scope. A forest-map Build seed no longer writes into the active session: it opens a FRESH session (a new pty session + row), switches to it, and pre-fills the composed command there (still pre-fill, never auto-run), so a Build click can never corrupt the user's interactive Claude Code session running in another row."
status: proposed
proof_mode: UAT
# uat_witness ABSENT → human (ADR-0040 fail-closed signpost): the whole-story UAT is not driven as one
# machine node. RE-ADJUDICATED 2026-07-26 under the ADR-0209 §8 corpus-wide migration — the story's eight
# legs resolve to FIVE `machine` and THREE `human`. Real-pty, native-shell behaviour is NOT irreducibly
# operator-attested: the existing Electron `_electron` Playwright harness (`apps/desktop/e2e/`) already
# launches the app offline, satisfies the repo gate, drives a REAL node-pty and reads the main-held screen
# via `desktopTerminal.snapshot`, so the session panel's create/switch/close, the seed's fresh tab, and the
# per-tab screen state are machine-observable (their specs are not written yet — a HARNESS gap, never a
# judgment gap, `human-witness-is-a-judgment-gap-not-cost`). Only the panel's LOOK, the whole surface's
# FEEL, and the one walk that spends the paid subscription and fires an outward-facing PR-opening build
# stay `human` (ADR-0070 / ADR-0209). The machine-driven story UAT node stays WITHHELD; the crown derives
# from the two capabilities' signed verdicts, the three e2e-signed legs, and those three attestations.
# Capabilities, roots-first (a capability appears after everything it depends on). TWO machine-provable
# caps, BOTH editsExisting studio vitest jsdom over the SAME source (TerminalDock.tsx / .test.tsx) that
# embedded-terminal + map-terminal-build signed: multi-session-tabs (the tab substrate — the ROOT) and
# seed-opens-new-tab (the seed re-decision — depends_on the tab substrate). This is the first story with
# TWO caps over ONE source file, so their shared-file build ordering + re-sign is called out below.
capabilities: [multi-session-tabs, seed-opens-new-tab]
# Story-level cross-story edges (ADR-0010 §4 / ADR-0074). This story OWNS NO package — it is a VIRTUAL
# story (like embedded-terminal / map-terminal-build / app-guide): its net-new code is CO-LOCATED
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
#               d.4), so the multi-session dock is a `studio` frontend change, exactly as app-guide /
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
# Deciding ADRs (ADR-0037 §2): 0186 (the WHAT — the terminal becomes multi-session, a Build seed opens a
# FRESH tab never the active session; amends 0174); 0190 (§3 — the session chrome follows VS Code: the
# numbered tab strip is remolded into a session panel beside the pane; §1/§2 are the serialized-screen
# re-attach the embedded-terminal caps carry; amends 0186); 0174 (the embedded terminal + its map-spawn
# clause's SECOND option — "opens a seeded terminal tab pre-filled with it" — which this story realises;
# local pty NOW, cloud DEFERRED; the prove-it-gate leaf UNTOUCHED); 0070 (the two-stage frontend-builder
# proof — the geometry/behaviour machine-proven, the session-panel appearance + the real-pty per-session
# feel operator-attested); 0158 (glue is un-asserted code WITHIN a story — the session-panel CSS/look +
# any dock-mount prop delta); 0010 (the organism model + the splitting-rule tiering the two caps + the
# real-prerequisites-only within-story edge); 0057 (the spec-borne proof config making each cap
# inner-loop buildable); 0004 (the thin-client boundary — the terminal is the INTERACTIVE surface
# only; the prove-it-gate runtime binding is UNTOUCHED and the renderer imports no @storytree/agent).
decisions: [186, 190, 174, 70, 158, 10, 57, 4]
---

# The embedded terminal is multi-session with a VS Code-style session panel — a Build seed opens a fresh tab, never the active session

**Outcome —** The embedded terminal becomes **multi-session with a VS Code-style session panel**: the dock
holds **N pty sessions**, each its own xterm pane, listed as **rows in a panel beside the terminal pane**
(down the right of the dock body) — **switchable** (click a row) / **creatable** (a "+" in the panel) /
**closable** (a per-row "×" that disposes+reaps its pty), and every existing single-session behaviour
(spawn, input↔pty, data-in, resize, visibility-toggle, refocus, absent-bridge degrade, the empty-session
message) holds **per session** — while the dock **chrome** (collapse/resize, the toggle, the `headerRight`
slot that hosts the repo-gate gear) stays **per-dock**, wrapping the panel + pane; the per-row "×"
**disposes exactly its session**, and dock unmount **preserves sessions** (app-owned — they re-attach on
the next mount; ADR-0189, which redefined this story's original dispose-on-unmount wall). The numbered
tab-button strip is replaced by this panel (ADR-0190 §3; split panes OUT of scope). A forest-map **Build
seed** no longer writes into the active session: it **opens a FRESH session** (a new pty session + row),
switches to it, and **pre-fills** the composed command there (still pre-fill, **never auto-run**), so a
Build click **can never corrupt the user's interactive Claude Code session** running in another row.

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
dock holds N sessions in a session panel" leaves the user immediately needing "a Build opens a fresh tab
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
capability: the terminal gains a whole **multi-session machinery** (a session panel, N sessions, switch /
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
  Signed `--real` verdicts still come **only** from the deterministic spine driving the selected
  `PhaseAuthor` — `ClaudeAgentAuthor` is the compatibility default and `--runtime codex` opts into
  `CodexPhaseAuthor` — through the `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`
  walk (`packages/orchestrator/*`). This story changes only the interactive terminal — how many
  sessions it holds, and which one a seed lands in. The prove-it-gate runtime binding and the whole
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
  disposed on tab/row-close AND on dock unmount. ADR-0189 (app-owned sessions) reversed the unmount half:
  the per-row "×" stays the explicit kill ([`multi-session-tabs`](multi-session-tabs.md)'s
  `mst-close-tab-disposes-its-session`), but dock unmount now disposes renderer resources only — the
  sessions survive and re-attach on the next mount (`mst-unmount-preserves-sessions`; the reap duty
  lives in the Electron main's window-close/app-quit lifecycle, so nothing outlives the APP).
- **The dock chrome stays PER-DOCK, wrapping the panel + pane (the placement wall).** The session panel is
  a VS Code-style panel down the **right** of the dock body, beside the terminal pane (ADR-0190 §3,
  replacing the numbered tab-button strip). The header's toggle chevron and the optional `headerRight`
  slot — which the `terminal-repo-picker` follow-on (#705) uses to host the repo-gate gear — render **once
  per dock** (in the header), NOT per row; the collapse/resize geometry wraps the whole body — panel + pane
  — ([`multi-session-tabs`](multi-session-tabs.md)'s `mst-chrome-stays-per-dock`).
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
| 1 | [`multi-session-tabs`](multi-session-tabs.md) | `TerminalDock` becomes multi-session with a VS Code-style session panel — N sessions, each its own xterm pane, created ("+") / switched / closed ("×") via panel rows; the `terminal-dock-panel` behaviours (spawn, input↔pty, data-in, resize, toggle, refocus, degrade, empty-session) hold PER SESSION; the "×" disposes exactly its session, unmount preserves sessions (app-owned, ADR-0189); the toggle + `headerRight` slot + collapse/resize stay per-dock. | integration-test (studio vitest jsdom, editsExisting red→green over the mocked xterm + bridge) | — |
| 2 | [`seed-opens-new-tab`](seed-opens-new-tab.md) | A `seed` OPENS A FRESH TAB — spawns a new session, switches to it, and pre-fills the command there (no trailing newline, async-safe, token-re-tabbable) — and NEVER writes into an existing/active session; absent the prop the dock is byte-identical to the multi-session dock. | integration-test (studio vitest jsdom, editsExisting red→green over the mocked xterm + bridge) | `multi-session-tabs` |

## Operator-attested glue (un-asserted connective code WITHIN this story — ADR-0158, NOT capabilities)

- **The session-panel appearance + the dock-mount prop delta.** The panel's LOOK (does it read as VS
  Code-style session tabs, the active row legible, "+"/"×" affordances clear, the panel sitting cleanly
  beside the terminal pane down the right of the dock body) is operator-attested (ADR-0070 / ADR-0190),
  witnessed under **UAT leg 1** — never a machine visual verdict. Only the LOOK is glue: the panel's
  STRUCTURE and wiring are contracted (`mst-chrome-stays-per-dock`, `mst-panel-sits-beside-pane`) and
  re-observed over real ptys at **legs 6–8** — glue-ness is a TIERING call and says nothing about which
  witness is right (`human-witness-is-a-judgment-gap-not-cost`).
  The `.terminal-dock*` CSS for the panel is glue. If the dock's public props change (they need not — the
  `seed` and `headerRight` prop shapes are unchanged), any `TreeView`/dock-mount delta is un-asserted
  connective code — machine-observable end-to-end at legs 6–7, not a capability. The existing TreeView `seed` glue
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
  chrome that wraps the panel + pane — so those contracts stay meaningful and GREEN under the new source.
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

## UAT Test Criteria

The integrated acceptance walkthrough that proves the whole multi-session terminal meets its outcome
end-to-end. Minimal-first (one coherent journey: open the app → the terminal has a session panel → run Claude
Code in one tab → click Build → a fresh tab opens pre-filled, the Claude Code tab untouched), defect-driven
thereafter (each real failure earns a permanent regression case, never speculative breadth).

> **Per-leg witness (ADR-0209 §1 / ADR-0106 / ADR-0070).** **RE-ADJUDICATED 2026-07-26** under the
> ADR-0209 §8 corpus-wide migration. Three classified kinds are available: `machine` (deterministic,
> spine-observed proof), `model` (rubric-bound semantic judgment by an eligible read-only judge), `human`
> (irreducible operator judgment). This story resolves to **five `machine` legs and three `human` legs; no
> leg is model-judged** — nothing here turns on semantic judgment of prose or artifacts, so the model rung
> genuinely does not apply.
>
> The wiring legs (2, 3) are covered by the two capabilities' signed `--real` verdicts over the mocked
> xterm + `desktopTerminal` bridge in jsdom (the tab lifecycle + per-tab routing; the
> seed-opens-a-fresh-tab branch over the same seams).
>
> Legs 6, 7 and 8 are `machine` through the **existing** Electron `_electron` Playwright harness
> (`apps/desktop/e2e/`, the `session-survival.e2e.mjs` precedent), which already launches the app offline
> with `/api/*` Playwright-routed to fixtures, **satisfies the repo gate by pre-writing
> `userData/repo-selection.json`**, drives a **REAL node-pty**, and reads the main-held screen through
> `desktopTerminal.snapshot` (the dock paints on xterm's WebGL renderer, so DOM `textContent` is not a
> readable observable — the snapshot relay is). Nothing about the panel's create/switch/close, the seed's
> fresh tab, or the per-tab screen state is an owner judgment; these were tagged `human` because **no e2e
> spec drives them yet**, which is a HARNESS statement, not a judgment gap
> (`human-witness-is-a-judgment-gap-not-cost` — a machine-observable success that is merely unharnessed is
> never labelled `human`). The prior preamble's claim that "an automated CI run cannot spawn real native
> ptys" was already false when written: `session-survival.e2e.mjs` spawns one and types into it.
>
> Exactly **three** legs stay `human` because their success condition has no compiler: the session panel's
> **look** (leg 1), the whole surface's **feel** as one coherent tabbed terminal (leg 5), and the one walk
> that runs a **live paid-subscription Claude Code session** and, on Enter, fires an **outward-facing
> PR-opening build** (leg 4). The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed
> signpost), so the machine-driven whole-story UAT node stays WITHHELD.
>
> **Ordering note (leg ids are POSITIONAL, `terminal-tabs#uat-N`).** The three re-adjudicated legs were
> **narrowed in place** and their machine halves **appended as legs 6–8** rather than interleaved: legs 2
> and 3 stay byte-identical where they are because they bind the two capability verdicts, and
> `apps/studio/src/index.css`'s terminal-dock comment names "terminal-tabs story UAT leg 1" as the
> appearance attestation — a reference outside the story-author fence that stays true only while the LOOK
> verdict remains leg 1.
>
> **Nothing here is green.** Per ADR-0209 §6 a substantive criterion change invalidates the old green, so
> every leg below is UNSTAMPED and earns green only under its newly-declared witness. Legs 6, 7 and 8 carry
> seed-canonical `uat-criterion` detail artifacts (ADR-0209 §5) because their one-line titles cannot convey
> the harness precondition, the stub boundary, or what would make a PASSING run a false pass; the remaining
> legs are fully specified by their capability contracts or by short, self-contained attestation prose, so
> per the owner's narrower bar they get no artifact.

**Goal —** A desktop user opens the app with their repo already chosen (since
[`terminal-repo-picker`](../terminal-repo-picker/story.md) the terminal is **gated** behind a valid repo
selection — a bare launch shows the gate, not the dock), finds a terminal with a **session panel**, runs
real Claude Code in one tab, clicks **Build** on the forest map, and watches a **fresh tab** open pre-filled
with the composed `pnpm storytree … build <id> --real --store pg` command — the Claude Code tab
**untouched** — reviews it, and presses Enter to run the build as their own Claude Code in that new tab.

1. **The session panel READS as VS Code-style session tabs.** _(witness: human)_ With a repo already
   chosen, the member expands the terminal and looks at the session panel beside the pane (down the right
   of the dock body): does it read as VS Code-style session tabs — the **active row legible at a glance**,
   each row's label readable, the **"+"** and per-row **"×"** affordances clear, the panel sitting cleanly
   beside the terminal without crowding it, and the toggle + repo-gate gear reading as dock chrome above
   the body rather than as another row? Includes the edge the code answers silently today: what the dock
   looks like when the LAST row is closed (see "Open modeling calls" item 4). **Success —** the owner's
   stage-2 visual verdict (ADR-0070). *(operator-attested and irreducible — look has no compiler and is
   never machine-asserted nor model-judged, ADR-0209. The panel's STRUCTURE — one row per session, the
   active row marked, "+"/"×" present and wired, the chrome per-dock — is machine-proven at legs 2 and 6;
   only its appearance is witnessed here. `apps/studio/src/index.css` names this leg as the attestation
   for the dock's terminal palette, so the LOOK verdict must stay at position 1.)*
2. **The multi-session tab lifecycle is honest over create / switch / close / dispose, per-tab behaviours intact.**
   _(witness: machine)_ Over the mocked xterm + `desktopTerminal` bridge, the dock spawns the
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
4. **A Build lands in a fresh tab while REAL Claude Code runs in another, and Enter fires the real build.**
   _(witness: human)_ With the member's own interactive **Claude Code** session live in tab 1 — a paid
   subscription session, not a plain shell — they click Build on a node/story; a new tab opens pre-filled,
   and **tab 1's Claude Code is exactly as it was**: no injected text, no interrupted input, nothing sent
   as a *message to Claude*. The member then presses Enter in the new tab and a real `--real --store pg`
   build runs. **Success —** the owner's verdict that the exact failure ADR-0186 fixes cannot happen
   against a LIVE Claude Code session, and that the seeded command runs when they choose to fire it.
   *(operator-attested and irreducible — it costs real paid-subscription spend and, on Enter, opens an
   outward-facing auto-merging PR (ADR-0136); an agent must never fire it unattended. The mechanical half —
   a fresh tab opens, is pre-filled and un-run, and the previously-active REAL pty's screen is unchanged —
   is machine-proven at leg 7 over a plain shell; only the live-Claude-Code and real-spend halves are
   irreducible here.)*
5. **The tabs FEEL like ONE coherent tabbed terminal.** _(witness: human)_ Switching, closing, per-tab
   scrollback, colours, resize reflow and focus add up to one coherent tabbed terminal inside the native
   shell — not N docks bolted together; nothing jars, nothing reads as borrowed. **Success —** the owner's
   stage-2 verdict (ADR-0070). *(operator-attested and irreducible — coherence and feel have no compiler
   and are never machine-asserted nor model-judged, ADR-0209. The BEHAVIOURS underneath — per-tab
   scrollback preserved across a switch, colour output landing in its own pane, resize reflowing the active
   pty, keystrokes following the active row, a close reaping exactly one pty — are machine-proven at leg 8;
   only whether they add up to one coherent surface is witnessed here.)*
6. **The session panel creates, switches and closes REAL sessions in the native shell.** _(witness:
   machine)_ In the Electron `_electron` harness with `userData/repo-selection.json` pre-written to a real
   checkout (the `session-survival.e2e.mjs` precedent) and `/api/*` Playwright-routed to fixtures,
   expanding the dock spawns ONE real node-pty and renders one panel row; the panel's `+` spawns a SECOND
   real pty and a second row; clicking row 1 switches the visible pane back; row 2's `×` disposes exactly
   that pty. **Success —** `desktopTerminal.list()` goes 1 → 2 → 1 across the walk, the surviving id is row
   1's (never a re-spawn), and the toggle + `headerRight` render exactly once throughout — the panel
   driving REAL ptys across the real IPC bridge, which the mocked-bridge jsdom verdict at leg 2 cannot
   show. Detail: `terminal-tabs#uat-6`.
7. **A Build click opens a FRESH tab pre-filled and leaves the running session's screen untouched.**
   _(witness: machine)_ In the same harness, with a real pty in tab 1 carrying typed, un-submitted input,
   open the fixture's `proposed` story panel and click Build — with the bridge present the dock **seeds
   instead of POSTing** `/api/build` (the desktop re-point). **Success —** a SECOND session appears, its
   `desktopTerminal.snapshot` shows the composed `storytree … build … --real --store pg` sitting at a
   prompt with **no trailing newline and no execution**, and tab 1's snapshot is **identical** to the one
   taken before the click — the load-bearing ADR-0186 safety wall proven over REAL ptys end-to-end, not
   over the mocked bridge leg 3 signs. Detail: `terminal-tabs#uat-7`.
8. **Per-tab scrollback, colour, resize and focus survive switching and closing.** _(witness: machine)_
   Over two real ptys in the same harness: write a distinct marker into each, switch rows and read both
   back; emit ANSI colour into one; resize the dock; type after a switch; close one row. **Success —** each
   session's `desktopTerminal.snapshot` retains only its OWN marker across switches, the colour bytes
   appear only in the emitting session, a resize forwards new `cols`/`rows` to the ACTIVE session's pty and
   only it, post-switch keystrokes reach the newly-active pty, and closing a row leaves the surviving
   session's screen intact — the per-tab state leg 5's feel verdict rests on, machine-observed.
   Detail: `terminal-tabs#uat-8`.

End state — the embedded terminal is a tabbed multi-session terminal: N pty sessions in a session panel,
per-session behaviours signed under the studio suite, the chrome per-dock, each session killed only by its
row's "×" or the app closing (unmount preserves them — app-owned, ADR-0189); a Build seed opens a fresh tab
pre-filled (un-run) and never disturbs the user's active session — the panel's create/switch/close, the
seed's fresh tab, and the per-tab screen state additionally signed over REAL ptys under the Electron
`_electron` harness, and only the panel's LOOK, the surface's FEEL, and the live-Claude-Code / real-spend
walk operator-attested, the prove-it-gate leaf and the spine untouched.

## Proof

The story is proven when that walkthrough passes — the wiring legs (2, 3) green under the two capabilities'
signed `--real` verdicts (with each cap's contracts green underneath), the real-pty legs (6, 7, 8) green
under the Electron `_electron` harness, and the three irreducible legs (1, 4, 5) operator-attested. Per
ADR-0020, `healthy` is only ever DERIVED from signed verdicts; nothing here is authored healthy. Both
capabilities are proof-wired (each carries a `proof:` block with an `editsExisting` `real:` arm — a
behaviour-assertion red→green over the existing `TerminalDock.tsx` + its vitest suite) so the spine can
drive their studio vitest suites red→green under its own gate; the story's machine-driven UAT node is
WITHHELD (its `uat_witness` is absent → human, ADR-0040), so driving those capabilities to signed verdicts
plus writing the three e2e specs (see "Open modeling calls" item 6) is what makes the multi-session
terminal buildable, and the crown additionally awaits the operator's attestations (legs 1, 4, 5).

## Open modeling calls (for the owner / orchestrator)

None is a story-shape fork (ADR-0186 settled the WHAT — the terminal becomes multi-session with tabs, a
Build seed opens a fresh tab; owner-directed, born accepted, no new ADR reserved). Seven items are
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
4. **The empty / last-tab-closed disposition — the CODE has answered it silently; the owner has not.** The
   question was: when the user closes the last remaining tab, does the dock show an empty "+"-to-open state,
   or auto-open a fresh tab? As shipped it **auto-opens a fresh session** — `closeTab` empties `tabIds`, and
   the first-expand spawn effect keys on `tabIds.length` and therefore re-fires. That is **emergent, not
   decided and not tested**: no `mst-*` contract and no e2e closes the last row (the suite only ever closes
   tab 2 of 2). So the behaviour stands, un-pinned. `multi-session-tabs` pins only that closing a tab
   disposes+reaps its session; the resulting look is witnessed under UAT leg 1. The orchestrator either
   contracts the auto-respawn (it is machine-observable — `list()` goes 1 → 0 → 1) or records the owner's
   preference for an empty state; **do not** author a leg asserting an empty "+"-to-open state, which would
   go red against correct code.
5. **The `node-build.test.ts` REAL-buildable snapshot companion edit (REQUIRED, outside `stories/**`).**
   Authoring these two `real:`-armed caps makes `buildableNodeIds()` discover them (spec-borne, ADR-0057),
   which the `packages/cli/src/node-build.test.ts` REAL-buildable snapshot regex + its per-story discovery
   comment pin exactly (the known "node-build snapshot trap"). The orchestrator must add the two ids
   **alphabetically** to that regex — `multi-session-tabs` between `model-runtime-seam` and
   `multi-turn-transcript`; `seed-opens-new-tab` between `seed-corpus-scripts` and `shared-forest-connection`
   — plus a per-story discovery comment for `terminal-tabs`, or `pnpm -r test` goes red. This is a
   `packages/cli` test edit — outside the story-author's `stories/**` fence — flagged here so it lands with
   the caps.
6. **The three real-pty legs (6, 7, 8) have NO spec yet — new files, NOT an edit of `session-survival`.**
   The 2026-07-26 re-adjudication tags them `machine` because the Electron `_electron` harness demonstrably
   CAN drive them (a real node-pty, the repo gate satisfied by a pre-written `repo-selection.json`, screens
   read via `desktopTerminal.snapshot`), not because a spec exists. Nothing in `apps/desktop/e2e/`
   currently clicks `[aria-label="new terminal tab"]`, `[aria-label="tab 2"]`, or
   `[aria-label^="close tab"]`, and `session-survival.e2e.mjs` **asserts exactly ONE live session in both
   directions** — so a second session must NOT be introduced into that walk; legs 6–8 need their own spec
   file(s). Two harness affordances the author should not re-discover: with the bridge present the Build
   click **seeds instead of POSTing** `/api/build` (so no build-endpoint stub is needed), and
   `harness.mjs`'s `TREE_FIXTURE` already carries a `proposed` story (`gamma-flow`) whose panel lights a
   real Build button. Per ADR-0209 §6 these legs are UNSTAMPED until those specs sign them; tagging
   `machine` with no spec yet is honest, not green.
7. **Stale prose OUTSIDE this fence, flagged for the orchestrator.** Two comments describe
   pre-ADR-0189/0190 behaviour while the code itself is current:
   `apps/studio/src/components/TerminalDock.tsx`'s module docstring still calls the chrome "a tab strip
   between the dock header and the body" (it is the ADR-0190 session panel, its CSS `order: 2` placing it
   right of the pane), and `apps/studio/src/components/TerminalRepoGate.tsx`'s `key={cwd}` comment still
   says the remount "dispos[es] its pty" (ADR-0189 made unmount PRESERVE sessions). Neither is a behaviour
   defect. Also load-bearing for future edits: `apps/studio/src/index.css` names **"terminal-tabs story UAT
   leg 1"** as the appearance attestation for the dock's terminal palette, so the LOOK verdict must stay at
   leg 1 or that reference must move with it.
