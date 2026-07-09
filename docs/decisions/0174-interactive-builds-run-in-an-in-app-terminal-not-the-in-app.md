---
status: accepted
decided: 2026-07-09
amends: [137, 163, 164]
load_bearing: true
---
# ADR-0174: Interactive builds run in an in-app terminal, not the in-app orchestrator

## Status

accepted (2026-07-09) — decided/directed by the owner in a design conversation on 2026-07-09.
Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends ADR-0137** — the forest-map "click-a-node-to-build" re-points from "spawn the in-app SDK
author / dispatch a headless build from the chat" to "compose the build command and inject it into the
embedded terminal." **Amends ADR-0163** — its dogfooding arc was maturing the in-app *interactive*
orchestrator toward independence; this ADR **retires that target** instead of reaching it (the
human-owns-the-outer-loop stance of ADR-0108 and the "unblock + chip, never bypass" discipline are
untouched). **Amends ADR-0164** — the *interactive* self-restart signaller (the in-app chat watches
its PR merge, then signals the supervisor) goes moot; Phase 1 (owner-triggered rebuild + relaunch), the
two safety rails, and any headless/autonomous apply are untouched. **Untouched:** ADR-0020 (the
prove-it-gate), ADR-0030 (the PhaseAuthor seam), ADR-0011 (the owned loop), ADR-0091 (the spine is the
sole verdict signer) — see the scoping note in the Decision. (Edges are recorded as `amends` per the
binary edge model, ADR-0139. Librarian pass 2026-07-09 **kept both as `amends`**: ADR-0163 retains
live residue — the "unblock + chip, never bypass" discipline and the recorded rejection of a standing
supervisor tier — and is itself additively re-aimed by ADR-0175, so superseding it would strand that
edge; ADR-0164's two rails and Phase 1 stand, with only the interactive Phase-2 signaller moot. Each
partial overturn is carried as a reciprocal prose note on the target.)

## Context

The storytree desktop app's value is the **observability layer over Claude Code** — the forest map,
the wisps, session presence, signed verdicts — **not** a re-implementation of Claude Code. That layer
already observes *plain* Claude Code sessions through three existing seams, with no in-app runtime
required:

- **the hook seam** — presence hooks declare a session on `SessionStart` (`scripts/presence-hook.sh`),
  populating the studio session dock;
- **the CLI seam** — `storytree noticeboard declare --node <story> --pg` takes the work-time story
  claim and lights the story wisp (ADR-0142);
- **the store seam** — `story build --real --store pg` writes verdicts to
  `events.work_event` / `events.verdict` (ADR-0020 / ADR-0091).

Against that backdrop, the desktop grew a *second*, in-app **interactive** session-orchestrator: a
headless Claude Agent SDK session (`packages/agent/src/headless-orchestrator.ts`, `tools: []` + four
MCP surfaces) fronted by an SSE chat widget (`apps/desktop/src/backend/chat-sse-mount.ts` →
`packages/drive/src/{chat-stream,orchestrate}.ts` → `runHeadlessOrchestrator`) rendered in a resizable
dock (`apps/studio/src/components/{ChatDock,ChatPanel}.tsx`). It was brought to whole-loop parity by a
long arc of ADRs — spawn authority (ADR-0137), the landing surface (ADR-0152), the scoped-glue actuator
(ADR-0160), the dogfood maturation practice (ADR-0163), continuity (ADR-0170), the read-only inspect
surface (ADR-0173).

Every one of those increments was re-implementing, at strictly-worse fidelity, an affordance real
Claude Code already ships. The ADR-0163 dogfood arc was *literally* a draining backlog of "the in-app
orchestrator lacks X that the terminal session-orchestrator has" — per-run turn knobs, fresh-branch
landing, CI-watch, continuity, CI/git inspection. The chat widget is a **redundant second runtime**: it
observes nothing the hook + CLI + store seams don't already observe when a plain Claude Code session
runs, and it carries a permanent maintenance treadmill to chase Claude Code's feature surface (slash
commands, permission modes, plan mode, MCP, skills) that it will always trail.

The owner's framing: stop rebuilding Claude Code inside the app. Give the app a **terminal** and let the
user run the real thing; keep the app pointed at what it is uniquely good at — **watching**.

## Decision

**The desktop app embeds a real terminal — a local pty (e.g. xterm.js in the renderer over node-pty in
the Electron main process) — from which the user launches real Claude Code. The in-app SDK-driven
*interactive* work-orchestrator (the chat widget) is retired as the interactive build surface.** The
observability layer watches the terminal's Claude Code exactly as it watches any Claude Code session —
through the hook, CLI, and store seams above; nothing new is required to observe it. The **same dock +
resize affordance** the chat widget had is kept for the terminal.

**Scope — local pty NOW; cloud terminals DEFERRED.** This decision is the *local* embedded terminal
only. **Cloud / backing-container web terminals** (a Cloud-Shell / Gitpod-Ona / Codespaces-style
per-user compute running Claude Code server-side) are explicitly **deferred as a separate,
separately-costed decision** — they raise their own hard questions (per-user compute + provisioning,
idle-timeout, and "whose Claude Code billing funds a member's session") that this ADR does not settle.
Consequently, **hosted studio members stay watch-and-comment only** until cloud terminals land — this
**redirects ADR-0117's member-build threads here** (they are answered by a future cloud-terminal ADR,
not solved now).

**CRITICAL scoping note — this replaces the interactive orchestrator, NOT the prove-it-gate.** Signed
`--real` verdicts still come **only** from the deterministic spine driving `ClaudeAgentAuthor`
(`packages/agent/src/sdk-author.ts`) through the `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN
→ GATE` walk (`packages/orchestrator/src/{prove-it-gate,phase-machine,write-scoped-executor,resolve-prove-spec}.ts`)
— i.e. `story build --real` / `node build --real`. That leaf is **entirely separate** from the
interactive chat: the chat only ever *type-imported* `SdkQueryFn` from `sdk-author.ts` and drove
`query()` directly via `runHeadlessOrchestrator`; `new ClaudeAgentAuthor(...)` is constructed in exactly
one place — `resolve-prove-spec.ts`, the build leaf — and never on the chat path. Whether a human fires
`story build --real` **from the embedded terminal** or a **headless job** fires it, the proof path is
identical and untouched. What this ADR retires is the *interactive runtime*, not the *proof runtime*.

A corollary the terminal makes newly salient — and the known trap it must not be confused with:
**hand-editing code in the terminal and landing it via `pnpm gate` + a PR does NOT produce a signed
`--real` verdict** (the caps stay `unregistered` — the "gate-land skips `--real` verdicts" trap). A
signed verdict requires the spine's red→green walk (`story build --real --store pg`), or an
operator-attested UAT the owner signs. The terminal makes *both* motions easy to fire; it does not blur
them, and this ADR does not license gate-landing as a substitute for the crown.

**Map-spawn re-points (amends ADR-0137).** The forest-map "click-a-node-to-build" affordance no longer
calls the in-app SDK author or dispatches a headless build from the chat. Instead it **composes the
corresponding command** (`storytree story build <id> --real …` / `storytree node build <id> …`) and
**injects it into the embedded terminal** (or opens a seeded terminal tab pre-filled with it), where the
user's Claude Code — or a bare `storytree` invocation — runs it. The map stays the launch surface; the
runtime behind the click becomes the terminal, not the chat session.

## Consequences

**Good.**
- **Sheds a maintenance treadmill.** The app stops chasing Claude Code's feature surface. The entire
  ADR-0163 dogfood backlog (turn knobs, fresh-branch landing, CI-watch, continuity, inspection) is
  subsumed — the terminal's Claude Code already has all of it — and every future Claude Code feature
  (slash commands, permission modes, plan mode, MCP, skills) arrives for free.
- **The observability layer is unchanged and already sufficient.** Presence hooks, `noticeboard
  declare`, and `--store pg` verdicts observe the terminal's Claude Code exactly as they observe any
  session. The product's actual value (watching) is untouched; only the redundant second runtime is
  removed.
- **One honest interactive runtime.** One place interactive builds happen (real Claude Code), one proof
  path (the spine + `ClaudeAgentAuthor`), no strictly-worse re-implementation to keep in sync or explain.

**Bad / watch.**
- **A local pty is real surface.** node-pty is a native module (Electron rebuild / platform binaries),
  and a terminal in the app is a broad capability whose lifecycle (spawn, resize, dispose, app-quit)
  must be handled. This is the build follow-on, not this ADR.
- **Members lose the (aspirational) in-app build path until cloud terminals land.** Hosted studio
  members stay watch-and-comment only; ADR-0117's member-build threads are redirected to a deferred
  cloud-terminal decision, not answered here. A local pty serves only the local desktop user, whose own
  machine runs their own Claude Code.
- **The gate-land-≠-signed-verdict trap gets a wider on-ramp.** With a terminal one keystroke away,
  hand-edit-then-gate-land is easy to do by reflex; the signed-verdict path (`story build --real`) must
  stay the visible default for work that needs a crown. Guidance/UX, not a code regression.
- **The chat infrastructure is not deleted.** Retiring the interactive orchestrator leaves its
  SSE / dock / continuity / inspect machinery in the tree; **ADR-0175** repurposes it (into the
  `app-guide` help/setup agent) rather than deleting it, so this ADR does not strand dead code.

## References

- ADR-0110 — design-time alignment is ratification (this ADR is born accepted).
- ADR-0137 — chat spawn authority + the forest-map click-to-build (amended: the map-spawn re-points into
  the terminal).
- ADR-0163 — the dogfood maturation arc (amended: its target — a reliable in-app *interactive*
  orchestrator — is retired rather than matured; the human-owns-the-loop stance and unblock+chip
  discipline stand).
- ADR-0164 — desktop self-restart-to-apply (amended: the *interactive* self-restart signaller goes
  moot; Phase 1 owner-triggered apply + the two rails + any headless autonomy stand).
- ADR-0117 — brokered builder writes / member-build threads (redirected here: members stay watch-only
  until a deferred cloud-terminal decision).
- **Untouched — stated so the boundary is unmistakable:** ADR-0020 (the prove-it-gate) · ADR-0030 (the
  PhaseAuthor seam) · ADR-0011 (the owned loop) · ADR-0091 (the spine is the sole verdict signer). The
  proof runtime is not what this ADR changes.
- ADR-0175 — repurpose (don't delete) the retired chat infrastructure into the `app-guide` agent (the
  companion decision).
- ADR-0142 — presence claim + story wisp (the CLI seam that observes any Claude Code session) ·
  ADR-0051 — the one rendered `session-orchestrator` agent the terminal's Claude Code runs.
- Code (the interactive orchestrator — retired as the interactive build surface):
  `packages/agent/src/headless-orchestrator.ts` (the `query()`-driven session, `tools: []`) ·
  `apps/desktop/src/backend/chat-sse-mount.ts` (`POST /api/chat`) ·
  `packages/drive/src/{chat-stream,orchestrate}.ts` ·
  `apps/studio/src/components/{ChatDock,ChatPanel}.tsx` + `apps/studio/src/api.ts` (`chatStream`) ·
  `apps/desktop/electron/backend-entry.ts` (the sidecar composition).
- Code (the proof leaf — UNTOUCHED): `packages/agent/src/sdk-author.ts` (`ClaudeAgentAuthor`) ·
  `packages/orchestrator/src/{prove-it-gate,phase-machine,write-scoped-executor,resolve-prove-spec}.ts` ·
  `packages/drive/src/{node-build,story-build,build-worker}.ts` (`story build --real`).
