---
id: "terminal-tabs"
tier: story
title: "The embedded terminal is multi-session with a VS Code-style session panel — a seed opens a FRESH tab, never the user's active Claude Code session"
outcome: "The embedded terminal becomes multi-session with a VS Code-style session panel: the dock holds N pty sessions, each its own xterm pane, listed as ROWS in a panel beside the terminal pane (down the right of the dock body) — switchable (click a row) / creatable (a \"+\" in the panel) / closable (a per-row \"×\" that disposes+reaps its pty), and every existing single-session behaviour (spawn, input↔pty, data-in, resize, visibility-toggle, refocus, absent-bridge degrade, the empty-session message) holds PER SESSION — while the dock chrome (collapse/resize, the toggle, the headerRight slot that hosts the repo-gate gear) stays PER-DOCK, wrapping the panel + pane; the per-row \"×\" disposes exactly its session, and dock unmount preserves sessions (app-owned, ADR-0189). The numbered tab-button strip is replaced by this panel (ADR-0190 §3); split panes are OUT of scope. A seed no longer writes into the active session: it opens a FRESH session (a new pty session + row), switches to it, and pre-fills the seeded command there (still pre-fill, never auto-run), so a seed can never corrupt the user's interactive Claude Code session running in another row. (The forest-map Build click that originally produced that seed was retired by ADR-0404 — the dock's half of the contract is unchanged and still accepts a seed from any producer.)"
status: proposed
proof_mode: UAT
# THE SEED'S PRODUCER IS GONE; THE DOCK'S HALF IS NOT (corrected in place 2026-08-22, ADR-0139, in the
# arc `retire-ui-build-dispatch-arc`). ADR-0404 retired the forest-map **Build** button, and with it the
# story `map-terminal-build` and its two capabilities — `compose-build-command` (the composer) and
# `map-build-seeds-terminal` (the button re-point). Nothing on the map composes a seed any more.
#
# What that does NOT touch is this story. `TerminalDock` still declares `seed?: { command; token }`,
# `TerminalRepoGate` still forwards it, and `seed-opens-new-tab` (ADR-0186) still opens a FRESH tab for
# one — the behaviour this story owns is the dock's HANDLING of a seed, never its production. So the
# capability stands, its `real:` arm is unchanged, and the prop is live and consumer-ready; it simply has
# no caller today. Prose below that described the map click as the live producer is corrected; prose that
# recounts PR #696 or ADR-0186's reasoning is accurate history and is left as authored.
#
# THAT PARKED CONSEQUENCE IS NOW DISCHARGED (2026-08-23, `retire-ui-build-dispatch-arc-inc-07`): UAT legs
# 4 and 7 are DELETED. This comment read "ONE CONSEQUENCE IS NOT A PROSE FIX AND IS NOT TAKEN HERE … so it
# is parked as an increment on `retire-ui-build-dispatch-arc` for the story-author, not silently rewritten
# here." Both legs OPENED by clicking a Build control ADR-0404 removed from the product, and there is no
# seed PRODUCER left anywhere to re-point them at, so neither states a journey a user can walk. Ordinals 4
# and 7 are BURNED, not renumbered; gates 1 and 3 are RETAINED but unclaimed (gate ids are positional).
# The full basis, including the signed green knowingly retired with leg 4, is recorded in the pass note
# above the numbered list. Corrected in place per ADR-0139.
#
# AND THE FENCE IS WIDER THAN THE NUMBERED LINE — MEASURED, not assumed. A leg's hashed canonical content
# runs to the NEXT leg or section heading, so the trailing "End state —" paragraph is INSIDE THE LAST
# LEG'S span — leg 8's, both before this pass and after it. *(This read "INSIDE leg 7's span", which was
# never true while leg 8 existed below it: leg 8 has been the last numbered item throughout. The MEASURED
# behaviour it records is unaffected — only the leg it named was wrong. Corrected in place per ADR-0139,
# 2026-08-23.)* Deleting one word from that paragraph ("a Build seed" → "a seed") made `loadNodeSpec`
# throw and the whole story load as `(unknown)` with ZERO capabilities. Editing any prose between the last
# numbered leg and `## Reliability Gates` re-hashes THAT leg, so treat the whole stretch as leg text and
# recompute with `storytree uat rerevision terminal-tabs --write`; check with `storytree tree
# terminal-tabs` (which SWALLOWS the throw and simply renders `(unknown)`, so a silent load failure looks
# like a rendering quirk).
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
# THAT PARAGRAPH IS A RECORD OF THE 2026-07-26 PASS and is left as authored history, but two of its
# present-tense clauses no longer hold and are corrected here (ADR-0139): the SEED'S FRESH TAB is no
# longer machine-observable end-to-end — ADR-0404 removed the only producer, so no harness can originate
# a seed (the dock's HANDLING of one is still signed by `seed-opens-new-tab` over a mocked bridge) — and
# the paid-subscription / PR-opening walk it calls the last `human` leg was flipped `machine` by ADR-0357
# and then DELETED outright on 2026-08-23 with leg 7. After that pass the story carries TWO legs, both
# `machine` (6 and 8), and no `human` leg at all.
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
#   - map-terminal-build — this story RE-DECIDES map-terminal-build's `terminal-dock-seed` behaviour. It
#               was authored against the seed-delivery machinery that story landed (the
#               `seed?: {command; token}` prop, the `compose-build-command` composer, the
#               `map-build-seeds-terminal` Build button, the TreeView `seed` glue), and this story only
#               ever re-pointed what the DOCK does with a seed (open a fresh tab, not write the active
#               session) — never how one is produced. ADR-0404 has since retired that story and deleted
#               the composer, the button and the TreeView glue; the `seed` prop ALONE survives, and it is
#               the only half this story depends on. The edge is KEPT because it records the re-decision
#               this story is (a retired target is still the thing that was re-decided), not a live feed.
#               Co-located component, NO @storytree/* import → an artifact edge.
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

# The embedded terminal is multi-session with a VS Code-style session panel — a seed opens a fresh tab, never the active session

**Outcome —** The embedded terminal becomes **multi-session with a VS Code-style session panel**: the dock
holds **N pty sessions**, each its own xterm pane, listed as **rows in a panel beside the terminal pane**
(down the right of the dock body) — **switchable** (click a row) / **creatable** (a "+" in the panel) /
**closable** (a per-row "×" that disposes+reaps its pty), and every existing single-session behaviour
(spawn, input↔pty, data-in, resize, visibility-toggle, refocus, absent-bridge degrade, the empty-session
message) holds **per session** — while the dock **chrome** (collapse/resize, the toggle, the `headerRight`
slot that hosts the repo-gate gear) stays **per-dock**, wrapping the panel + pane; the per-row "×"
**disposes exactly its session**, and dock unmount **preserves sessions** (app-owned — they re-attach on
the next mount; ADR-0189, which redefined this story's original dispose-on-unmount wall). The numbered
tab-button strip is replaced by this panel (ADR-0190 §3; split panes OUT of scope). A **seed** no longer
writes into the active session: it **opens a FRESH session** (a new pty session + row), switches to it,
and **pre-fills** the seeded command there (still pre-fill, **never auto-run**), so a seed **can never
corrupt the user's interactive Claude Code session** running in another row. (The forest-map Build click
that originally produced the seed was retired by ADR-0404; the dock's half — accept a seed, open a fresh
tab — is unchanged and still serves any producer.)

This story is the build follow-on of **ADR-0186**
(owner-directed 2026-07-11, born accepted per ADR-0110 — design-time alignment IS the ratification), which
**amends ADR-0174**.
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

- **The session-panel appearance + the dock-mount prop delta.** The panel's LOOK is operator-attested
  (ADR-0070 / ADR-0190) and never a machine visual verdict. It was witnessed under **UAT leg 1**, and
  the surface's overall FEEL under **UAT leg 5**, until **ADR-0348 D6 (2026-08-11) DELETED both** — a
  user EXPERIENCE property is not a user ACCEPTANCE criterion, and the owner's feedback on it comes from
  USING the terminal, not from a gate. **The two intents stand and are recorded here.** *(a) The session
  panel should read as VS Code-style session tabs* — the **active row legible at a glance**, each row's
  label readable, the **"+"** and per-row **"×"** affordances clear, the panel sitting cleanly beside the
  terminal pane down the right of the dock body without crowding it, and the toggle + repo-gate gear
  reading as dock chrome above the body rather than as another row. This includes the edge the code
  answers silently today: what the dock looks like when the LAST row is closed (see "Open modeling
  calls" item 4). *(b) The tabs should FEEL like ONE coherent tabbed terminal* — switching, closing,
  per-tab scrollback, colours, resize reflow and focus adding up to one surface inside the native shell,
  not N docks bolted together; nothing jarring, nothing reading as borrowed. Only the LOOK is glue: the
  panel's STRUCTURE and wiring are contracted (`mst-chrome-stays-per-dock`, `mst-panel-sits-beside-pane`)
  and re-observed over real ptys at **legs 6 and 8** — glue-ness is a TIERING call and says nothing about
  which witness is right (`human-witness-is-a-judgment-gap-not-cost`).
  **Outside the story fence — FIXED 2026-08-12, in the ADR-0348 flip increment:**
  `apps/studio/src/index.css`'s terminal-dock comment named *"terminal-tabs story UAT leg 1"* as the
  appearance attestation for the dock's terminal palette. That leg no longer exists — ordinal 1 is
  BURNED, not reused, so the reference was dangling rather than silently re-pointed at a different
  claim. It now names this design intent instead.
  The `.terminal-dock*` CSS for the panel is glue. If the dock's public props change (they need not — the
  `seed` and `headerRight` prop shapes are unchanged), any `TreeView`/dock-mount delta is un-asserted
  connective code — machine-observable end-to-end at legs 6 and 8, not a capability. *(This read "at legs
  6–7"; leg 7 was deleted on 2026-08-23, corrected in place per ADR-0139.)* The `terminal-repo-gate`
  `headerRight` mount and its `seed` pass-through are REUSED AS-IS: the SAME `seed?: { command; token }`
  reaches the now-multi-session dock, and only the dock's HANDLING of it changes (open a fresh tab). No
  new glue wire is required. *(This also named the TreeView `seed` glue — `map-terminal-build` threading
  `seed`/`onSeedTerminal` — as a live feed. ADR-0404 deleted that glue with the Build button, so the prop
  chain now runs gate → dock with no producer at its head; corrected in place per ADR-0139.)*

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
- **`map-terminal-build`** — the story whose `terminal-dock-seed` behaviour this one re-decides. It was
  authored against that story's seed-delivery machinery (the `seed` prop, `compose-build-command`,
  `map-build-seeds-terminal`, the TreeView `seed` glue); ADR-0404 has since retired the story and deleted
  everything on that list EXCEPT the `seed` prop, which is the only half this story consumes. The edge
  records the re-decision, not a live feed. Co-located component, no `@storytree/*` import → an
  **artifact edge**, declared and annotated.
- **`studio`** — the surface the component lives on; the desktop renders the compiled studio dist (ADR-0090
  d.4). Thin client — no `@storytree/agent` / `@storytree/drive` / model import (`modelPathBoundary.test.ts`);
  xterm.js is a third-party dep, not a cross-story `@storytree/*` edge → an **artifact edge**, declared and
  annotated.

**No edge to `desktop`** (the backend is already multi-session; this story adds no `apps/desktop` code — it
consumes the already-per-session `window.desktopTerminal` bridge, a `window` global, not a package import).
**No edge to the prove-it-gate / spine** (untouched — this changes only the interactive terminal).

## UAT Test Criteria

The integrated acceptance walkthrough that proves the whole multi-session terminal meets its outcome
end-to-end. Minimal-first (one coherent journey: open the app → the terminal has a session panel → create a
second real session and switch between them → each session's screen, colour, resize and focus stay its
own), defect-driven thereafter (each real failure earns a permanent regression case, never speculative
breadth). *(This read "… → run Claude Code in one tab → click Build → a fresh tab opens pre-filled, the
Claude Code tab untouched". ADR-0404 removed the Build control, so that journey has no first step a user
can take; the two legs that walked it were deleted on 2026-08-23 and the journey is restated here as the
one the product still offers. Corrected in place per ADR-0139.)*

> **Per-leg witness (ADR-0209 §1 / ADR-0106 / ADR-0070).** **RE-ADJUDICATED 2026-07-26** under the
> ADR-0209 §8 corpus-wide migration. Three classified kinds are available: `machine` (deterministic,
> spine-observed proof), `model` (rubric-bound semantic judgment by an eligible read-only judge), `human`
> (irreducible operator judgment). That pass resolved this story to five `machine` legs and three
> `human` legs; no leg is model-judged — nothing here turns on semantic judgment of prose or artifacts,
> so the model rung genuinely does not apply.
>
> **NARROWED 2026-08-11 (ADR-0348 D6): the two EXPERIENCE legs are DELETED, so the story now carries
> five `machine` legs and ONE `human` leg (six).** The deleted pair — *"the session panel READS as VS
> Code-style session tabs"* (old leg 1) and *"the tabs FEEL like ONE coherent tabbed terminal"* (old leg
> 5) — asked whether this surface is any GOOD, not whether the journey achieved its goal. That is
> continuous owner feedback gathered through use, not a discrete pass/fail obligation the story must
> clear to be green. Both design intents are carried under "Operator-attested glue" above. Ordinals are
> BURNED, not renumbered — positions 1 and 5 are simply absent, so every surviving leg keeps the number
> it has always had and no signed verdict or `(proof-gate:)` binding is silently re-pointed; that is
> what makes the `index.css` reference to "leg 1" DANGLING rather than silently wrong.
>
> **RE-TRIAGED 2026-08-13 (ADR-0357): leg 4 FLIPPED to `machine`, so this story now carries SIX
> `machine` legs and NO `human` leg.** The sentence that stood here — *"The one surviving human leg (4)
> is a genuine ACCEPTANCE claim: real paid-subscription spend plus an outward-facing PR-opening build"*
> — is corrected in place per ADR-0139: those are exactly the two bases ADR-0348 D2 and D3 withdrew, and
> ADR-0357 D1's second basis does not reach this leg, because the `_electron` harness that already reads
> real ptys for legs 6, 7 and 8 reads a REAL Claude Code session's screen the same way. Leg 4 is bound
> to the model-driven gate 1 under "Reliability Gates".
>
> **ADR-0294 D2/D4 pass, 2026-08-20 — the two wiring legs are DELETED, and the three survivors are
> declared UNBOUND.** Old legs **2** and **3** restated proof that already exists one rung down and named
> it in their own success clauses. Leg 2's tab lifecycle is proven by the capability
> [`multi-session-tabs`](multi-session-tabs.md) at `apps/studio/src/components/TerminalDock.test.tsx` —
> `mst-new-tab-spawns-independent-session`, `mst-switch-shows-selected-tab-pane`, `mst-scopes-io-per-tab`,
> `mst-close-tab-disposes-its-session`, `mst-chrome-stays-per-dock`, `mst-unmount-preserves-sessions`.
> Leg 3's fresh-tab seed is proven by the capability [`seed-opens-new-tab`](seed-opens-new-tab.md) in the
> same file — `son-seed-opens-a-fresh-tab`, `son-seed-never-touches-active-session`,
> `son-pre-spawn-seed-writes-on-resolve`, `son-token-bump-opens-another-fresh-tab`,
> `son-prefills-without-trailing-newline`, `son-absent-seed-is-a-no-op`. Both were checked against those
> tests' ACTUAL assertions, not their file existence (ADR-0294 D2's honesty wall). Ordinals **2** and **3**
> are BURNED, not renumbered. This story now carries **FOUR** `machine` legs (4, 6, 7, 8) and no `human`
> leg. *(This paragraph read "The wiring legs (2, 3) are covered by the two capabilities' signed `--real`
> verdicts …" — the deletion criterion stated and then not acted on; corrected in place per ADR-0139.)*
>
> **The three survivors are BOUND as of 2026-08-22 (gates 2–4), and all three are RED until driven.**
> Until then they stood unbound, and this paragraph read: *"**No gate is minted for any of them** —
> answering an unbound leg with a freshly minted check is the rubber stamp ADR-0097 §2 forbids and the
> exact reflex ADR-0294's end state point 4 names. What binds them is a real instrument: the `_electron`
> walk persisting a signed verdict, or ADR-0295 D1's model-driven executor, already the shape of gate 1
> below, which is how leg 4 is bound."* It named the two honest instruments and took neither; gates 2–4
> take the second, one per leg. The `_electron` walk still has no spec at HEAD, so nothing here binds a
> leg to a suite. The rubber-stamp objection is SATISFIED rather than overridden, on a decidable test: a
> drive-witness gate cannot exit 0 without a `pass` drive record for that criterion's CURRENT revision, at
> a commit in HEAD's ancestry, inside 90 days. **Why now:** the unbound state was never local to these
> three. `runAdopt` resolves EVERY real machine leg before signing any, with no partial verdict set, so
> three unbound legs refused this story's whole UAT-signing pass and stranded bound leg 4, which has a
> gate and could otherwise be signed. **Binding is not driving** — no drive has been run for legs 6, 7 or
> 8, and ADR-0405 D4 leaves a red check red rather than re-driving to chase a pass.
>
> **Leg 6's `(witness:)` tag was LINE-BROKEN and therefore parsed as `either`, not `machine`** — repaired
> in the same 2026-08-20 change. `_(witness:` ended one line and `machine)(detail: …)_` began the next, so
> `parseUatTestCriteria` fell back to the undecided `either` and the leg was invisible to every
> machine-leg census. Nothing about the leg's authored claim changed; only the tag was rejoined.
>
> Legs 6 and 8 are `machine` through the **existing** Electron `_electron` Playwright harness
> (`apps/desktop/e2e/`, the `session-survival.e2e.mjs` precedent), which already launches the app offline
> with `/api/*` Playwright-routed to fixtures, **satisfies the repo gate by pre-writing
> `userData/repo-selection.json`**, drives a **REAL node-pty**, and reads the main-held screen through
> `desktopTerminal.snapshot` (the dock paints on xterm's WebGL renderer, so DOM `textContent` is not a
> readable observable — the snapshot relay is). Nothing about the panel's create/switch/close or the
> per-tab screen state is an owner judgment; these were tagged `human` because **no e2e
> spec drives them yet**, which is a HARNESS statement, not a judgment gap
> (`human-witness-is-a-judgment-gap-not-cost` — a machine-observable success that is merely unharnessed is
> never labelled `human`). The prior preamble's claim that "an automated CI run cannot spawn real native
> ptys" was already false when written: `session-survival.e2e.mjs` spawns one and types into it.
> *(This read "Legs 6, 7 and 8 are `machine` …" and listed "the seed's fresh tab" among the
> machine-observable behaviours. Leg 7 was deleted on 2026-08-23 and the seed's fresh tab is no longer
> reachable end-to-end at all — ADR-0404 removed the only producer — so both references are corrected in
> place per ADR-0139. The harness capability described here is otherwise unchanged and still carries legs
> 6 and 8.)*
>
> **NO leg is `human`** — legs 6 and 8 are both `machine`. *(This read "Exactly **ONE** leg stays
> `human`: the walk that runs a live paid-subscription Claude Code session and, on Enter, fires an
> outward-facing PR-opening build (leg 4)." That was already overtaken by the 2026-08-13 ADR-0357
> re-triage recorded above, which flipped leg 4 to `machine`, and leg 4 was then deleted outright on
> 2026-08-23. Two OTHER legs stayed `human` after the 2026-07-26 pass — the session panel's **look** (old
> leg 1) and the whole surface's **feel** (old leg 5); neither had a compiler either, but ADR-0348 D6
> deleted them because neither was an ACCEPTANCE claim, which is the question that now comes first.
> Corrected in place per ADR-0139.)* The story-level `uat_witness` is absent → human
> (the ADR-0040 fail-closed signpost), so the machine-driven whole-story UAT node stays WITHHELD.
>
> **Ordering note (leg ids are POSITIONAL, `terminal-tabs#uat-N`).** The three re-adjudicated legs were
> **narrowed in place** and their machine halves **appended as legs 6–8** rather than interleaved, so legs
> 2 and 3 stayed byte-identical where they were for as long as they existed. The same rule governs both
> deletions since: ordinals 1 and 5 (ADR-0348 D6, 2026-08-11), ordinals 2 and 3 (ADR-0294 D2,
> 2026-08-20) and ordinals 4 and 7 (ADR-0404, 2026-08-23) are BURNED, never reassigned, so no surviving
> leg moved and nothing already signed against a position now denotes a different claim. The story's live
> ordinals are therefore **6 and 8**, with the gap left open deliberately —
> `findBurnedOrdinalCollisions` reds if a survivor is ever renumbered onto a spent key.
> `apps/studio/src/index.css`'s terminal-dock comment names "terminal-tabs story UAT leg 1" as the
> appearance attestation — a reference outside the story-author fence that is now DANGLING (the leg is
> gone) rather than wrong (no other leg has taken position 1), and that should be re-pointed at the
> design intent under "Operator-attested glue".
>
> **Nothing here is green.** Per ADR-0209 §6 a substantive criterion change invalidates the old green, so
> every leg below is UNSTAMPED and earns green only under its newly-declared witness. Legs 6 and 8 carry
> seed-canonical `uat-criterion` detail artifacts (ADR-0209 §5) because their one-line titles cannot convey
> the harness precondition, the stub boundary, or what would make a PASSING run a false pass. *(This read
> "Legs 6, 7 and 8 carry … detail artifacts … leg 4 is fully specified by its own prose and its
> model-driven gate, so per the owner's narrower bar it gets no artifact." Legs 4 and 7 were deleted on
> 2026-08-23; leg 7's artifact `terminal-tabs#uat-7` was retired in the live store in the same pass, and
> leg 4 carried no `(detail:` pointer to retire. An earlier version of this paragraph also read "the
> remaining legs are fully specified by their capability contracts…", where the capability-specified legs
> were 2 and 3, deleted by the ADR-0294 D2 pass on 2026-08-20. Corrected in place per ADR-0139.)*
>
> **DELETED 2026-08-23 (ADR-0404, `retire-ui-build-dispatch-arc-inc-07`): legs 4 and 7 are GONE, and the
> story now carries TWO `machine` legs — 6 and 8.** Both deleted legs OPENED by clicking a **Build**
> control on the forest map that ADR-0404 removed from the product (inc-02 deleted `BuildSection.tsx`;
> inc-03 deleted `POST/GET /api/build`). The deleted pair was `uatc_79f9db93ca0e89aaaec2d522` (leg 4, "A
> Build lands in a fresh tab while REAL Claude Code runs in another, and Enter fires the real build") and
> `uatc_abc366dff450e75d3ab91e60` (leg 7, "A Build click opens a FRESH tab pre-filled and leaves the
> running session's screen untouched").
>
> **There is no seed PRODUCER left to re-point them at.** `apps/studio/src/components/TreeView.tsx` states
> it in its own voice: the map's only seed producer was the Build button, and while `TerminalDock` still
> accepts a `seed` prop and opens a fresh tab for one, "it simply has no caller here". `onSeedTerminal` has
> zero occurrences in SOURCE (it survives only in `stories/**` prose). The `window.desktopTerminal` preload
> bridge exposes only `spawn/write/resize/dispose/onData/onExit/list/snapshot/ack/clear/openLink` —
> pty-level methods that bypass the dock's React `seed` prop entirely, so no harness can make a seed ARRIVE
> at the dock. Restoring a producer would mean writing new product code purely to serve a test, which is
> what ADR-0404 removed.
>
> **NARROWING was not a third option.** What remains of leg 7 after dropping the click is exactly what the
> capability [`seed-opens-new-tab`](seed-opens-new-tab.md) already signs at
> `apps/studio/src/components/TerminalDock.test.tsx` (`son-seed-opens-a-fresh-tab`,
> `son-seed-never-touches-active-session`, `son-pre-spawn-seed-writes-on-resolve`,
> `son-token-bump-opens-another-fresh-tab`, `son-prefills-without-trailing-newline`,
> `son-absent-seed-is-a-no-op`) — so narrowing lands on ADR-0294 D2's delete-a-restatement rule anyway. And
> narrowing is not free: any prose change recomputes the `revision-id`, and a drive record binds the
> revision it drove, so narrowing leg 4 would have forfeited its green IMMEDIATELY while leaving a leg
> still framed on a deleted click.
>
> **Nothing real is lost, and this is the load-bearing point.** Leg 7's only value BEYOND the capability's
> mocked-bridge verdict was proving isolation over REAL ptys — a corruption reaching a pty by a route a
> mock cannot see. **Surviving leg 8 already proves exactly that** over two real ptys: each session's
> snapshot contains ONLY its own marker across every switch, never the sibling's, and the ANSI colour bytes
> appear only in the emitting session's snapshot. Leg 7's residue beyond leg 8 was specifically the SEED
> path, which has no producer. Leg 4's residue beyond leg 7 was a REAL Claude Code session in tab 1 plus
> pressing Enter — both reachable only through the deleted click.
>
> **LEG 4 WAS GREEN, AND THAT IS WHY IT HAD TO GO — state this precisely, because the tempting summary is
> the wrong one.** Leg 4 was genuinely DRIVEN end to end on 2026-08-13 at commit `d9a6e59` (driver
> `claude-code`, 8/8 steps `pass`, revision `uatr1:b4c8260d034f13d9`), one of its passing steps being
> literally *"Click Build on a proposed story node"*. ADR-0404 deleted that control **eight days later**,
> and the verdict was nonetheless re-signed at HEAD on 2026-08-23. So the green was a CURRENT claim about a
> journey no user can walk — a live false green, not dormant history — and ADR-0348 rule 1 asks first
> whether a leg is an ACCEPTANCE claim at all: an acceptance claim is about the product AS IT STANDS, and
> this one no longer was. It also could never be re-earned: with no Build control no future drive is
> possible, and `FRESHNESS_DAYS = 90` (`packages/drive/src/uat-drive-witness.check.ts`) would have turned
> gate 1 red around **2026-11-11** with no available remedy — a landmine for whoever found it three months
> on with none of this context. Retiring the leg retires the claim deliberately, now, in writing.
>
> **Nothing at the STORY level is lost.** `storytree uat list terminal-tabs --pg` already reported *"story
> UAT: unproven — not every UAT test has a signed pass yet"* before this pass and still does after it. What
> is deliberately retired is ONE LEG's green, not a story crown.
>
> **The orphaned proof rows are SAFE — recorded here so they are not rediscovered as a fault.**
> `rollupCriterionStatus(criterion, events)` (`packages/cli/src/uat.ts`, `packages/drive/src/tree.ts`)
> takes a criterion FROM THE CORPUS and looks up its events — corpus→verdict, never verdict→corpus. So the
> `events.verdict` rows naming `uatc_79f9db93ca0e89aaaec2d522` and the `events.uat_drive` record simply
> stop being looked up. No rung reds; `contract-binding-drift` is about capability proof bindings, not
> criteria. They are retained history, deliberately orphaned.
>
> **Ordinals 4 and 7 are BURNED, not renumbered.** Legs 6 and 8 keep the numbers they have always had, so
> no surviving leg moved onto a spent key and nothing already signed against a position now denotes a
> different claim. Burned for this story is now 1, 2, 3, 4, 5, 7; live is 6 and 8. **Gates 1 and 3 are
> RETAINED but UNCLAIMED** — see "Reliability Gates", where the reason is stated on each.

**Goal —** A desktop user opens the app with their repo already chosen (since
[`terminal-repo-picker`](../terminal-repo-picker/story.md) the terminal is **gated** behind a valid repo
selection — a bare launch shows the gate, not the dock), finds a terminal with a **session panel**, and
works in **several real shell sessions at once**: creating a second session from the panel's "+", running
something long-lived in one while switching to another, and closing a row when done — each session keeping
its own screen, scrollback, colour and focus, and the dock's chrome staying put throughout. *(This read
"… runs real Claude Code in one tab, clicks **Build** on the forest map, and watches a **fresh tab** open
pre-filled with the composed `pnpm storytree … build <id> --real --store pg` command — the Claude Code tab
**untouched** — reviews it, and presses Enter to run the build …". ADR-0404 removed the Build control, so
no user can start that walk; the two legs asserting it were deleted on 2026-08-23. The dock's own seed
HANDLING is untouched and still signed by [`seed-opens-new-tab`](seed-opens-new-tab.md) — it simply has no
producer to be driven from. Corrected in place per ADR-0139.)*

6. **The session panel creates, switches and closes REAL sessions in the native shell.** _(witness: machine)(detail: terminal-tabs#uat-6)_ _(proof-gate: terminal-tabs#gate-2)_ _(criterion-id: uatc_d79072069efa32c40f89ee29)_ _(revision-id: uatr1:60bacffaf38753df)_ _(previous-revision-id: uatr1:bad0dae27929a76e)_
   In the Electron `_electron` harness with `userData/repo-selection.json` pre-written to a real
   checkout (the `session-survival.e2e.mjs` precedent) and `/api/*` Playwright-routed to fixtures,
   expanding the dock spawns ONE real node-pty and renders one panel row; the panel's `+` spawns a SECOND
   real pty and a second row; clicking row 1 switches the visible pane back; row 2's `×` disposes exactly
   that pty. **Success —** `desktopTerminal.list()` goes 1 → 2 → 1 across the walk, the surviving id is row
   1's (never a re-spawn), and the toggle + `headerRight` render exactly once throughout — the panel
   driving REAL ptys across the real IPC bridge, which the mocked-bridge jsdom verdict of the capability
   [`multi-session-tabs`](multi-session-tabs.md) cannot show. *(That clause read "the mocked-bridge jsdom
   verdict at leg 2"; the ADR-0294 D2 pass deleted leg 2 on 2026-08-20 as a restatement of that same
   capability, so the citation now names the capability directly — corrected in place per ADR-0139. The
   line-broken `_(witness:` / `machine)_` tag on this leg was joined in the same change: split across
   lines it parsed as `either`, so a leg authored `machine` was silently invisible to every machine-leg
   census.)* **BOUND to `terminal-tabs#gate-2` (2026-08-22) — RED until driven.** This read *"**UNBOUND — fails
   closed (ADR-0294 D4, 2026-08-20)** … No gate is minted to host it (ADR-0097 §2)"*, and the `_electron`
   walk it named still has no spec at HEAD. What gate 2 binds is the OTHER real instrument this story
   already uses — ADR-0295 D1's model-driven executor, the shape of gate 1 — which hands a model this
   leg's authored journey VERBATIM against the real packaged app and cannot exit 0 without a recorded
   `pass` drive for the criterion's CURRENT revision. That is the line between it and the minted rubber
   stamp ADR-0097 §2 bans: this gate is honestly RED, not passing. **Binding is not driving** — no drive
   has been run for this leg and ADR-0405 D4 leaves a red check red. Corrected in place (ADR-0139).
8. **Per-tab scrollback, colour, resize and focus survive switching and closing.** _(witness: machine)(detail: terminal-tabs#uat-8)_ _(proof-gate: terminal-tabs#gate-4)_ _(criterion-id: uatc_811ce13a1c65a2644a7f2a2b)_ _(revision-id: uatr1:94ff1a0cdca9ede0)_ _(previous-revision-id: uatr1:4f1302e1fba7ca4f)_
   Over two real ptys in the same harness: write a distinct marker into each, switch rows and read both
   back; emit ANSI colour into one; resize the dock; type after a switch; close one row. **Success —** each
   session's `desktopTerminal.snapshot` retains only its OWN marker across switches, the colour bytes
   appear only in the emitting session, a resize forwards new `cols`/`rows` to the ACTIVE session's pty and
   only it, post-switch keystrokes reach the newly-active pty, and closing a row leaves the surviving
   session's screen intact — the per-tab state the surface's coherence rests on, machine-observed.
   **BOUND to `terminal-tabs#gate-4` (2026-08-22) — RED until driven.** This read *"**UNBOUND — fails
   closed (ADR-0294 D4, 2026-08-20)** … No gate is minted to host it (ADR-0097 §2)"*, and the `_electron`
   walk it named still has no spec at HEAD. What gate 4 binds is the OTHER real instrument this story
   already uses — ADR-0295 D1's model-driven executor, the shape of gate 1 — which hands a model this
   leg's authored journey VERBATIM against the real packaged app and cannot exit 0 without a recorded
   `pass` drive for the criterion's CURRENT revision. That is the line between it and the minted rubber
   stamp ADR-0097 §2 bans: this gate is honestly RED, not passing. **Binding is not driving** — no drive
   has been run for this leg and ADR-0405 D4 leaves a red check red. Corrected in place (ADR-0139).

End state — the embedded terminal is a tabbed multi-session terminal: N pty sessions in a session panel,
per-session behaviours signed under the studio suite, the chrome per-dock, each session killed only by its
row's "×" or the app closing (unmount preserves them — app-owned, ADR-0189); a seed opens a fresh tab
pre-filled (un-run) and never disturbs the user's active session, a contract the capability
`seed-opens-new-tab` still signs over the mocked bridge even though ADR-0404 left it with no producer to
be driven from — with the panel's create/switch/close and the per-tab screen state additionally signed
over REAL ptys under the Electron `_electron` harness, the prove-it-gate leaf and the spine untouched.
*(This clause read "… a Build seed opens a fresh tab … the panel's create/switch/close, the seed's fresh
tab, and the per-tab screen state additionally signed over REAL ptys …, and the live-Claude-Code /
real-build walk model-driven under gate 1 below". The seed's fresh tab is no longer reachable end-to-end
and the live-Claude-Code walk was leg 4, deleted on 2026-08-23 with leg 7; an earlier version read "and
only the live-Claude-Code / real-spend walk operator-attested", corrected when ADR-0348 D2/D3's triage
flipped leg 4 on 2026-08-13. Corrected in place per ADR-0139.)* This story carries NO human leg. The
panel's LOOK and the surface's FEEL are no longer acceptance obligations (ADR-0348 D6); that intent is
recorded under "Operator-attested glue" and answered by the owner using the app.

## Reliability Gates

**Gate 1 is the story's FIRST gate (2026-08-13, ADR-0348 D2/D3 / ADR-0357).** Gate ids are positional
(`asset:edit-story-uat-criteria` step 2), so anything added later APPENDS as gate 2 — never inserted,
never renumbered, or already-signed verdicts and surviving `(proof-gate:)` bindings are silently
re-pointed. It carries no `(covers:)`: it proves a JOURNEY, not a capability, and adding it to a
`(covers:)` list would let an observe-and-sign `adopt` pass green a capability that never went red
(ADR-0085 / ADR-0097).

**The gate neither drives nor spends.** The drive is deliberately out-of-band —
`pnpm --filter @storytree/drive exec node --import tsx src/uat-drive.run.ts terminal-tabs <criterion-id>`
spawns a fresh subscription-funded session that walks the authored journey against the real packaged app
and appends a record to `events.uat_drive`; ADR-0010 §5 keeps that off every gate path. The gate is the
cheap standing WITNESS of that persisted artifact, and the spine still mints the verdict over the exit
code IT watched, so ADR-0295 D2's *no model signs its own verdict* holds with the signing path
unchanged. It goes red — honestly — when no `pass` record exists for the criterion's CURRENT
`revision-id`, when the driven commit is not in HEAD's ancestry, or when the newest record is older than
90 days (the ADR-0016 ageing floor).

1. **UAT leg 4 — "a Build lands in a fresh tab while REAL Claude Code runs in another, and Enter fires the real build" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts terminal-tabs uatc_79f9db93ca0e89aaaec2d522`.
   **UNCLAIMED as of 2026-08-23 — the criterion this gate was minted for was DELETED, and the gate is
   RETAINED anyway.** Gate ids are positional (`asset:edit-story-uat-criteria` step 2), so removing this
   item would renumber gates 2–4 down one and silently re-point every already-signed verdict and every
   surviving `(proof-gate:)` binding — including legs 6 and 8's — onto gates they were never about.
   Nothing would error. So it stays exactly where it is, claimed by nothing, and no leg may ever be bound
   to it again. It originally witnessed that a model held a REAL interactive Claude Code session in tab 1,
   clicked Build, saw a fresh pre-filled tab open with tab 1's screen untouched (no injected text, no
   interrupted input, nothing sent as a message to Claude), and pressed Enter to run a real
   `--real --store pg` build. That drive DID happen — 2026-08-13 at `d9a6e59`, 8/8 steps `pass` — and the
   verdict was re-signed at HEAD as recently as 2026-08-23; the leg was retired because ADR-0404 removed
   the Build control eight days after the drive, so the green had become a current claim about a journey
   no user can walk, and no future drive could ever re-earn it. See the pass note under "UAT Test
   Criteria" for the full basis and for why the orphaned proof rows are safe.

**Gates 2–4 are NEW (2026-08-22, `machine-uat-signing-gap-arc-inc-02`) and were APPENDED — gate 1 kept
its ordinal.** Gate ids are positional (`asset:edit-story-uat-criteria` step 2), so inserting or
renumbering would silently re-point already-signed verdicts and surviving `(proof-gate:)` bindings. None
carries a `(covers:)`: each proves a JOURNEY, not a capability. They are the same neither-drives-nor-spends
witness gate 1 is, on the same honesty terms, and all three are RED until a drive is run — which is the
point. **Why they exist:** legs 6, 7 and 8 were left unbound as the honest state, but that state was never
local to them. `runAdopt` resolves EVERY real machine leg before signing any, with no partial verdict set,
so three unbound legs refused this story's whole UAT-signing pass and stranded bound leg 4 — which HAS a
gate and could otherwise be signed. Binding them exits that trap without weakening anything: a drive
witness cannot pass a leg nobody walked.

**Read that paragraph as the 2026-08-22 record it is. As of 2026-08-23 only gates 2 and 4 CLAIM a leg**
(6 and 8 respectively), and both are still honestly RED — no drive has been run for either. Gates 1 and
3 are retained-but-unclaimed after legs 4 and 7 were deleted; the reason each is kept rather than removed
is stated on the gate itself. All four ordinals are therefore frozen at 1, 2, 3, 4 forever, and a gate
added later APPENDS as gate 5.

2. **UAT leg 6 — "the session panel creates, switches and closes REAL sessions in the native shell" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts terminal-tabs uatc_d79072069efa32c40f89ee29`.
   Witnesses that a model expanded the dock in the REAL packaged app and observed `desktopTerminal.list()`
   go 1 → 2 → 1 across the walk — one real pty and one panel row on expand, a second real pty and row from
   the panel's `+`, the visible pane switching back on clicking row 1, and row 2's `×` disposing exactly
   that pty — with the surviving id row 1's (never a re-spawn) and the toggle + `headerRight` rendering
   exactly once throughout. The mocked-bridge jsdom half is [`multi-session-tabs`](multi-session-tabs.md)'s
   own verdict and is not re-witnessed here.
3. **UAT leg 7 — "a Build click opens a FRESH tab pre-filled and leaves the running session's screen untouched" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts terminal-tabs uatc_abc366dff450e75d3ab91e60`.
   **UNCLAIMED as of 2026-08-23 — the criterion this gate was minted for was DELETED, and the gate is
   RETAINED anyway**, for the same positional reason as gate 1 above: deleting it would renumber gate 4
   to 3 and silently re-point leg 8's `(proof-gate: terminal-tabs#gate-4)` binding onto a different
   claim, with nothing erroring. It stays where it is, claimed by nothing, and no leg may be bound to it
   again. Unlike gate 1 it was never satisfied: no drive record for `uatc_abc366dff450e75d3ab91e60` has
   ever existed, so it was honestly RED throughout its life. It originally witnessed that a model held a
   real pty in tab 1 carrying typed, UN-SUBMITTED input, clicked Build on a `proposed` story, and observed
   the dock SEED instead of POSTing `/api/build`. ADR-0404 removed both halves of that walk — the Build
   control and the `/api/build` route — leaving no way to originate a seed at all, which is why the leg
   was retired rather than narrowed. The mocked-bridge half of the contract survives as
   [`seed-opens-new-tab`](seed-opens-new-tab.md)'s own signed verdict, and the real-pty isolation it
   uniquely added is carried by surviving leg 8 over two real ptys.
4. **UAT leg 8 — "per-tab scrollback, colour, resize and focus survive switching and closing" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts terminal-tabs uatc_811ce13a1c65a2644a7f2a2b`.
   Witnesses that a model, over two real ptys, observed each session's `desktopTerminal.snapshot` retain
   only its OWN marker across switches, ANSI colour bytes appear only in the emitting session, a dock
   resize forward new `cols`/`rows` to the ACTIVE session's pty and only it, post-switch keystrokes reach
   the newly-active pty, and closing a row leave the surviving session's screen intact.

## Proof

The story is proven when that walkthrough passes — the two surviving real-pty legs (6 and 8) green under
the Electron `_electron` harness, on top of the two capabilities' signed `--real` verdicts with each cap's
contracts green underneath. *(This read "the wiring legs (2, 3) green under the two capabilities' signed
`--real` verdicts …, the real-pty legs (6, 7, 8) green …, and leg 4 green under the model-driven gate 1
above", and before that "the three irreducible legs (1, 4, 5) operator-attested". Legs 1 and 5 were
deleted by ADR-0348 D6, legs 2 and 3 by ADR-0294 D2, and legs 4 and 7 by ADR-0404 on 2026-08-23;
corrected in place per ADR-0139.)* Per
ADR-0020, `healthy` is only ever DERIVED from signed verdicts; nothing here is authored healthy. Both
capabilities are proof-wired (each carries a `proof:` block with an `editsExisting` `real:` arm — a
behaviour-assertion red→green over the existing `TerminalDock.tsx` + its vitest suite) so the spine can
drive their studio vitest suites red→green under its own gate; the story's machine-driven UAT node is
WITHHELD (its `uat_witness` is absent → human, ADR-0040), so driving those capabilities to signed verdicts
plus writing the two e2e specs (see "Open modeling calls" item 6) is what makes the multi-session
terminal buildable — this story awaits NO operator attestation since the 2026-08-13 ADR-0357 triage.

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
   re-tensed map-terminal-build to a two-cap story, so the corpus holds ONE seed behaviour. *(This named a
   companion code edit — removing `terminal-dock-seed` from `packages/cli/src/node-build.test.ts`'s
   REAL-buildable snapshot regex — as work still to land with this story. There is no such regex to edit:
   ADR-0341 D4 replaced that hardcoded catalogue with one DERIVED from the specs on disk, and the test now
   states outright that adding or removing a node must never mean editing that file. Retiring the spec IS
   the whole edit. Corrected in place per ADR-0139.)* The load-bearing no-newline safety wall is preserved
   verbatim in
   `son-prefills-without-trailing-newline`.
4. **The empty / last-tab-closed disposition — the CODE has answered it silently; the owner has not.** The
   question was: when the user closes the last remaining tab, does the dock show an empty "+"-to-open state,
   or auto-open a fresh tab? As shipped it **auto-opens a fresh session** — `closeTab` empties `tabIds`, and
   the first-expand spawn effect keys on `tabIds.length` and therefore re-fires. That is **emergent, not
   decided and not tested**: no `mst-*` contract and no e2e closes the last row (the suite only ever closes
   tab 2 of 2). So the behaviour stands, un-pinned. `multi-session-tabs` pins only that closing a tab
   disposes+reaps its session; the resulting look is design intent under "Operator-attested glue"
   (formerly UAT leg 1, deleted by ADR-0348 D6). The orchestrator either
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
6. **The two real-pty legs (6 and 8) have NO spec yet — new files, NOT an edit of `session-survival`.**
   The 2026-07-26 re-adjudication tags them `machine` because the Electron `_electron` harness demonstrably
   CAN drive them (a real node-pty, the repo gate satisfied by a pre-written `repo-selection.json`, screens
   read via `desktopTerminal.snapshot`), not because a spec exists. Nothing in `apps/desktop/e2e/`
   currently clicks `[aria-label="new terminal tab"]`, `[aria-label="tab 2"]`, or
   `[aria-label^="close tab"]`, and `session-survival.e2e.mjs` **asserts exactly ONE live session in both
   directions** — so a second session must NOT be introduced into that walk; legs 6 and 8 need their own
   spec file(s). Per ADR-0209 §6 these legs are UNSTAMPED until those specs sign them; tagging `machine`
   with no spec yet is honest, not green.
   *(This read "The three real-pty legs (6, 7, 8)". Leg 7 was DELETED on 2026-08-23 — it was the one of
   the three that needed a seed to be originated, and ADR-0404 left no producer to originate one, so the
   missing-producer blocker this item used to carry is GONE rather than outstanding. Legs 6 and 8 never
   needed a Build click: both drive the session panel and real ptys directly. An earlier version also
   listed two harness affordances "the author should not re-discover" — that with the bridge present a
   Build click seeds instead of POSTing `/api/build`, and that `harness.mjs`'s `TREE_FIXTURE` carries a
   `proposed` story (`gamma-flow`) whose panel lights a real Build button; neither exists any more.
   Corrected in place per ADR-0139.)*
7. **Stale prose OUTSIDE this fence, flagged for the orchestrator.** Two comments describe
   pre-ADR-0189/0190 behaviour while the code itself is current:
   `apps/studio/src/components/TerminalDock.tsx`'s module docstring still calls the chrome "a tab strip
   between the dock header and the body" (it is the ADR-0190 session panel, its CSS `order: 2` placing it
   right of the pane), and `apps/studio/src/components/TerminalRepoGate.tsx`'s `key={cwd}` comment still
   says the remount "dispos[es] its pty" (ADR-0189 made unmount PRESERVE sessions). Neither is a behaviour
   defect. A THIRD is now stale for a different reason: `apps/studio/src/index.css` names
   **"terminal-tabs story UAT leg 1"** as the appearance attestation for the dock's terminal palette, and
   **that leg no longer exists** — ADR-0348 D6 deleted it on 2026-08-11 and burned the ordinal, so the
   reference dangled rather than pointing at a different claim. **DISCHARGED 2026-08-12** by the
   ADR-0348 flip increment, which is not fenced to `stories/**`: the comment now names the LOOK design
   intent under "Operator-attested glue". The two TerminalDock/TerminalRepoGate docstrings above are
   still stale and still unfixed.
