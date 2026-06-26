---
id: "headless-orchestrator"
tier: story
title: "The headless orchestrator runtime — the session-orchestrator agent, run server-side, that orients and proposes"
outcome: "A programmatic intent drives a server-side runtime that loads the generated session-orchestrator agent headlessly with read-only orientation tools wired, the agent orients on the real three surfaces (story tree, notice board, library) and emits a proposed unit — read/propose only, one orchestration at a time, holding no signing key."
status: proposed
proof_mode: UAT
# Per-leg witness (ADR-0106): the offline mechanics legs are machine-witnessed by the package suites;
# the live orientation leg (a real subscription query() against the real three surfaces) is human-
# witness (operator-attested — subscription-billed, an agent should not burn the spend unattended).
# The story-level uat_witness is absent → human (the ADR-0040 fail-closed signpost), so the machine-
# driven whole-story UAT node stays withheld; the crown derives from the per-leg roll-up.
capabilities: [orientation-tool-surface, headless-session-runner, orchestrator-composition, chat-session-stream]
# Phase 2 (ADR-0108 — the chat surface over the Phase-1 runtime) is added as `chat-session-stream`: the
# SSE route + chat-message intake that streams an `orchestrate`-driven session. It is CONSUMED by the
# `desktop` story (ADR-0113 — the thick desktop is where the chat surface SHIPS, mounted on the local
# backend; the renderer chat panel is a thin client over it, ADR-0108 d.1). Phase 2 still rides the
# Phase-1 composition (`orchestrate`, @storytree/drive) — it adds streaming + an HTTP intake, not a new
# loop. Phases 3–5 (build/gate drive, landing, hosting) remain out of scope.
# Story-level edges (ADR-0010 §4 — consumed cross-story seams, encoded here as frontmatter
# depends_on; the import-evidence at file:line is in "Cross-story boundary" below):
#   - agent        — the SDK headless-session organism this extends. The new runtime CORE
#                    (the read-only query() driver + the read-tool MCP surface) is a near-sibling of
#                    runSdkCurator (packages/agent/src/sdk-curator.ts) and the SDK read-tool wiring in
#                    ClaudeAgentAuthor (packages/agent/src/sdk-author.ts), and it physically lives in
#                    packages/agent — FORCED by ADR-0004's single-import-site rule (every @anthropic-ai/*
#                    import lives in packages/agent; a new package importing the SDK would break it).
#                    This is the studio-build precedent: own code physically hosted in another story's
#                    package while declaring the depends_on edge.
#   - drive-machinery — the composition's PHYSICAL HOST. The Phase-1 composition + programmatic entry
#                    (orchestrate.ts) physically live in packages/drive (owned by drive-machinery) since
#                    ADR-0112 — the same "own code hosted in another story's package" precedent as the
#                    `agent` edge. The orchestrator-composition capability already cites
#                    packages/drive/src/orchestrate.ts as its sourceFile. NB: `cli` is NOT an upstream —
#                    it is the composition ROOT that DRIVES this runtime (cli → drive → agent) and INJECTS
#                    its own run() read-dispatch through the OrientationRunner seam (IoC): the
#                    `orchestrate` command in packages/cli/src/commands.ts calls run(argv, deps) with
#                    writable:false as the injected runner, so the runtime imports nothing from cli.
#   - library      — the knowledge surface the agent orients on: `library` (dashboard) +
#                    `library artifact <id>` read off the store (the in-memory seed offline,
#                    packages/cli/src/commands.ts), and the seed corpus the agent reads is library's
#                    work-hierarchy + knowledge schema (loadCorpus over @storytree/library). Also the
#                    home of renderAgentPrompt(store, "session-orchestrator")
#                    (packages/library/src/store/render-agent.ts, a @storytree/library/store seam since
#                    ADR-0112 §4), which assembles the SAME session-orchestrator system prompt the
#                    terminal session uses (ADR-0051 — one loop definition).
#   - notice-board — the session-presence surface the agent orients on AND declares on like any session
#                    (ADR-0033): `noticeboard` reads the live presence store
#                    (packages/drive/src/noticeboard.ts). Phase 1's PROOF is orientation+proposal, not
#                    presence — the declaration is the session courtesy, not the deliverable.
depends_on: [agent, drive-machinery, library, notice-board]
# Deciding ADRs (ADR-0037 §2): chat-driven orchestration / the phased server-side runtime — Phase 1
# (108, this); human owns the outer loop, amended in degree by a server-side runtime (30); the agent
# renderer / one loop definition the runtime runs (51); the orchestrator/agent boundary the runtime
# respects (4); session presence the orchestration declares (33); the UI-driven build worker (90)
# + its proof-off-tether sanction (91) whose worker investment + integrity argument this runtime reuses;
# and the drive-package extraction (112) that RESOLVES this story's Phase-2 placement fork — the
# runtime is a shared @storytree/drive core the worker calls (see "Open modeling calls" below).
decisions: [108, 30, 51, 4, 33, 90, 91, 112, 113]
---

# The headless orchestrator runtime — the session-orchestrator agent, run server-side, that orients and proposes

**Outcome —** A programmatic intent drives a server-side runtime that loads the generated
`session-orchestrator` agent headlessly with read-only orientation tools wired, the agent orients on
the real three surfaces (story tree, notice board, library) and emits a proposed unit — read/propose
only, one orchestration at a time, holding no signing key.

## What this is

This is **ADR-0108 Phase 1 — the headless orchestrator runtime (the keystone)**: stand up the
server-side runtime that runs the `session-orchestrator` library agent HEADLESSLY, with the storytree
READ tools wired (story-tree / notice-board / library queries), driven by a **programmatic intent**
(NOT a chat UI — that is Phase 2). It proves the runtime can ORIENT on the real three surfaces and
PROPOSE a unit. One orchestration session at a time.

**Phase 2 (ADR-0108 — the chat surface) is now in scope as one capability:
[`chat-session-stream`](chat-session-stream.md).** It puts a conversational surface in front of the
Phase-1 runtime: an HTTP chat-message intake + a Server-Sent-Events route that STREAMS an
`orchestrate`-driven session's live output to a thin-client chat panel. It REUSES the Phase-1
composition (`orchestrate`, `@storytree/drive`) verbatim — it adds streaming + an HTTP intake, NOT a new
loop and NOT a forked prompt. It stays **read/propose only** (Phases 3–5 — build/gate drive, landing,
hosting — remain out of scope; whole-loop authority + accept-to-land are later increments). **Where it
SHIPS:** the thick desktop (ADR-0113) mounts this SSE route on its local backend and renders the chat
panel as a thin client over it (ADR-0108 d.1 — the renderer never imports the agent); the `desktop`
story CONSUMES this capability (`depends_on: [headless-orchestrator]`). The renderer chat panel's
APPEARANCE is operator-attested where it ships (the desktop story's "feels like one app" UAT leg,
ADR-0070); THIS capability owns the provable SSE/intake BACKEND.

The runtime is a **near-sibling of the existing SDK runtimes**, not a new backend — the pieces it
composes already exist (encoded here, not re-designed):

- **The headless-session core is `runSdkCurator`'s sibling.** `runSdkCurator`
  (`packages/agent/src/sdk-curator.ts`) is the decisive precedent: a single read-only SDK `query()`
  with an INJECTED system prompt + user prompt, an injectable `queryFn` seam (offline-testable with a
  scripted double), returning the final text, never throwing. The orchestrator's headless-session
  driver is `runSdkCurator` PLUS a **read-tool MCP surface** — the curator needs no tools because its
  whole neighbourhood is serialized into the prompt, but the orchestrator must ORIENT by *calling*
  read tools against the live three surfaces.
- **The read-tool surface is `ClaudeAgentAuthor`'s MCP wiring, read-only.** `ClaudeAgentAuthor`
  (`packages/agent/src/sdk-author.ts`) shows the in-process MCP tool pattern
  (`createSdkMcpServer` + `tool`, the "feedback commands" injected as `{name, description, run}`). The
  orientation tools wire the same way but **READ-ONLY**: each tool runs a storytree read command
  (`tree` / `noticeboard` / `library`) and returns its `Envelope` body — there is NO `Write`/`Edit`/
  `Bash` tool, so the agent cannot act, write, build, sign, or land. Writes are structurally impossible
  (the `run()` dispatch refuses every write verb unless `deps.writable === true`, and the runtime
  constructs a `writable: false` deps over the in-memory seed — the exact offline shape `main.ts` already
  builds).
- **The loop definition is the rendered `session-orchestrator` agent — not a fork.** The composition
  calls `renderAgentPrompt(store, "session-orchestrator")` (`packages/library/src/store/render-agent.ts`), which
  assembles the SAME system prompt the terminal session embodies (ADR-0051). The runtime RUNS that
  prompt; it does NOT fork the loop definition (ADR-0108 decision 2 — edit the library artifact,
  regenerate, and both the terminal and the studio runtime move together).
- **The Phase-1 entry is a programmatic intent; the composition lives in `@storytree/drive`, the
  terminal entry in `packages/cli`.** Since ADR-0112 the composition (`orchestrate.ts`) lives in
  `@storytree/drive`; the thin `orchestrate` CLI command in `packages/cli` is the terminal entry that
  calls it, injecting the `run()` read-dispatch (built `writable: false`) as the orientation runner.
  `renderAgentPrompt` is rendered from `@storytree/library/store` (ADR-0112 §4), not cli. The entry is
  a programmatic intent (a thin CLI command), NOT an HTTP/chat endpoint. Phase 2's studio chat worker
  REUSES the same `@storytree/drive` core rather than re-implementing — a shared package, not
  CLI-private glue.

## Honest proof posture — `proposed`, read/propose only

This spec is authored FIRST, before any implementation, to bound the Phase-1 journey and size the
units; the inner loop builds it (this story authors the work hierarchy only). Every contract below
describes the isolated unit test that proves a leaf; the capability describes the integration test
that proves it against real in-story collaborators; the Story UAT below describes the acceptance
walkthrough that proves the whole runtime.

**Phase 1 is read/propose only — no builds, no signing** (those are ADR-0108 Phases 3–4). The agent
holds **NO signing key** and **no verdict is ever handed in** (ADR-0091); its reach is the read-only
orientation tool surface and nothing else. The honest status is `proposed`:

- The **offline-provable mechanics ARE genuinely proof-wired** — each carries a `proof:` block with a
  `real:` arm (a NET-NEW red→green against `packages/agent` / `packages/drive`, driven through an
  injected `queryFn` + scripted read-tool doubles + the in-memory seed store). The runner enforces a
  read-only tool surface (no write tool EXISTS; tools wired + callable; the final proposal surfaced;
  fail-closed on a dead/empty session); the orientation surface returns a real envelope body per
  surface with writes structurally impossible; the composition renders `session-orchestrator` and
  drives a scripted session against the real seed corpus to surface a proposal. These are clean offline
  `node:test`s, designed so the spine's prove-it-gate CAN drive them red→green.
- The **live orientation leg is operator-attested / human-witness** (ADR-0106 / ADR-0070), exactly
  like the `agent` story's live `query()` leg: a REAL subscription `query()` running the
  `session-orchestrator` prompt, orienting on the REAL three surfaces and emitting a real proposal, is
  operator-attested (subscription-billed — an agent should not burn the spend unattended), NOT a
  standing offline test. That leg is `witness: human` (Story UAT leg 4); the offline mechanics legs
  (1–3) are `witness: machine`.

Status stays `proposed` for every unit — `healthy` is earned through the prove-it-gate AND the
operator's live-run attestation; it is never authored (ADR-0020).

## Capabilities (3)

Listed roots-first (a capability appears after everything it depends on). All three are
**proof-wired** (ADR-0057 — each carries a `proof:` block with a `real:` arm describing a genuine
additive net-new red→green against the real package source), so they form a **dependency-closed,
acyclic set in which every member resolves a `real:` arm** — exactly what makes the WHOLE story
story-`real`-buildable (`isStoryBuildable`). The live orientation leg is NOT a fourth capability (it
has no separate code — it is the runner's own mechanics run live); it is the human-witness Story UAT
leg 4, the slow-growth-minimal choice (mirroring `studio-build`, whose live run is the human-witness
UAT action, not a capability).

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`orientation-tool-surface`](orientation-tool-surface.md) | A read-only in-process tool surface exposes the three storytree orientation commands to a model, each returning a real envelope body, with NO write tool and writes structurally impossible. | — |
| 2 | [`headless-session-runner`](headless-session-runner.md) | A single read-only SDK session runs an injected system prompt with the orientation tools wired, surfaces the agent's final proposal text, and fails closed on a dead/empty session — one session at a time. | `orientation-tool-surface` |
| 3 | [`orchestrator-composition`](orchestrator-composition.md) | A programmatic intent renders the session-orchestrator agent, drives a scripted headless session against the real seed corpus, and surfaces an orientation/proposal. | `headless-session-runner` |
| 4 | [`chat-session-stream`](chat-session-stream.md) *(Phase 2, ADR-0108)* | An HTTP chat intake + SSE route streams an `orchestrate`-driven session's live output to a thin-client chat panel — reusing the Phase-1 composition, read/propose only. | `orchestrator-composition` |

## Dependency graph (will be code-derived)

These are **within-story** edges. Until the code exists they are authored from the intended
data-flow; when the units are built they MUST be re-derived from the real imports/calls between
capabilities (static analysis, ADR-0010 §3) and corrected if the code disagrees. The graph is
acyclic; `orientation-tool-surface` is the root (the read-tool leaf, no in-story upstream).

- `headless-session-runner` → `orientation-tool-surface`
  - The runner wires the orientation tools INTO the SDK session (the `createSdkMcpServer` tool list,
    the `runSdkCurator` + read-tools shape). It builds the read-only tool surface the orientation
    capability owns and hands it to the `query()` options — so the runner couples directly to the
    tool surface's constructor.
- `orchestrator-composition` → `headless-session-runner`
  - The composition is the thin programmatic shell over the runner: it renders the
    `session-orchestrator` prompt (`renderAgentPrompt`), assembles the orientation deps (the in-memory
    seed store + the `stories/` corpus), and calls the runner with a scripted/live `queryFn`. The
    composition owns no session state of its own — it is the runner's caller, so it couples to the
    runner's surface and to nothing deeper. The single-session guard lives here.
- `chat-session-stream` → `orchestrator-composition` *(Phase 2)*
  - The chat surface is the streaming HTTP front of the Phase-1 composition: an SSE route + a
    chat-message intake that drives `orchestrate` and forwards its live output to the client. It owns no
    loop logic of its own — it adapts the composition's session into a stream, so it couples to the
    composition's surface (`orchestrate`) and to nothing deeper. The single-session guard the composition
    enforces still holds (one orchestration at a time).

## Cross-story boundary (ADR-0010 §4)

Authored from the intended consumed seams (re-verify against real imports when built). All four are
CONSUMED, not absorbed — this story owns the runtime composition (the read-only driver, the read-tool
surface, the Phase-1 entry, the single-session guard), never the SDK seam, the agent renderer, the
drive surface, the library schema, or the presence store. (`cli` is NOT an upstream — it is the
composition ROOT that drives this runtime and injects the read dispatch through a seam; see the
`drive-machinery` bullet.)

- **`agent`** — the **SDK headless-session organism**. The runtime CORE physically lives in
  `packages/agent` (a new module, sibling to `sdk-curator.ts` / `sdk-author.ts`) — FORCED by
  ADR-0004's single-import-site rule: every `@anthropic-ai/*` import lives in `packages/agent`, so a
  read-only `query()` driver + an in-process MCP tool surface cannot live anywhere else (a new package
  importing the SDK would break the rule; `packages/agent` already hosts the leaf AND the curator, so a
  third SDK-driven role is the established pattern). The core REUSES the package's published seams: the
  injectable `SdkQueryFn` (`packages/agent/src/sdk-author.ts`) and the `runSdkCurator` shape
  (`packages/agent/src/sdk-curator.ts`). This is the **studio-build precedent** — a story owning code
  physically hosted in another story's package while declaring the `depends_on` edge (studio-build owns
  its worker in `apps/studio/server` while `depends_on studio`).
- **`drive-machinery`** — the **composition's physical host**. The Phase-1 composition + programmatic
  entry (`orchestrate.ts`) physically live in `packages/drive` (owned by `drive-machinery`) since
  ADR-0112 — the same precedent as the `agent` edge: a story owning code physically hosted in another
  story's package while declaring the `depends_on` edge. `orchestrate.ts`
  (`packages/drive/src/orchestrate.ts`, this story's `orchestrator-composition` `sourceFile`) imports
  the runner seam from `@storytree/agent` and `renderAgentPrompt` from `@storytree/library/store` — and
  imports NOTHING from `@storytree/cli` (ADR-0112's hard invariant: the dependency runs `cli → drive`,
  never back). **`cli` is the composition ROOT / source-hub that DRIVES this runtime, not an upstream.**
  The terminal `orchestrate` command (`packages/cli/src/commands.ts`) calls the drive composition and
  INJECTS its own `run(argv, deps)` read-dispatch (with `writable: false`) as the `OrientationRunner` —
  the seam the runtime couples to. This is dependency-via-injection where the IMPORTER is `cli` (the
  caller), so the runtime stays cli-free: ADR-0004's single-import-site rule is exactly WHY a runtime
  module cannot import `cli` (cli depends on `agent`, so the reverse would cycle), making the injected
  `OrientationRunner` seam the correct boundary, not a workaround. Writes stay structurally impossible:
  the injected runner is built `writable: false`, so the CLI's `notWritable` guard
  (`packages/cli/src/commands.ts`, fronting `artifact new`/`edit`/`retire`, `sync-agents`/`sync-corpus`,
  `noticeboard declare`, `uat attest`, `adr new`) refuses every write verb by construction.
- **`library`** — the **knowledge surface AND the prompt-render seam**. The agent orients on `library`
  (dashboard) + `library artifact <id>`, which read off the `store` (the in-memory seed offline,
  `loadCorpus` over `@storytree/library`, `packages/cli/src/commands.ts`). The corpus the agent reads —
  the work-hierarchy spec (`Tier`/`Status`/`Unit`) and the knowledge documents — is library's schema.
  The runtime also consumes `renderAgentPrompt(store, "session-orchestrator")`
  (`packages/library/src/store/render-agent.ts`, a `@storytree/library/store` seam since ADR-0112 §4 —
  prompt assembly is a library/store concern, it reads the knowledge corpus), which assembles the SAME
  session-orchestrator system prompt the terminal session uses (ADR-0051 — one loop definition, the
  runtime does not fork it). The runtime REUSES the existing in-memory seed read path; it owns no
  knowledge schema and no prompt assembly.
- **`notice-board`** — the **session-presence surface**. The agent orients on `noticeboard` (the live
  presence store, `packages/drive/src/noticeboard.ts`) AND declares presence like any session (ADR-0033)
  — the orchestration is a session on the board. Phase 1 REUSES the existing board; its PROOF is
  orientation+proposal, not presence (the declaration is the session courtesy, not the deliverable —
  presence reads strictly need the live store, so the OFFLINE proof exercises the tree + library
  surfaces and the live leg exercises the board).

## Story UAT

The integrated **acceptance walkthrough** that proves the whole `headless-orchestrator` runtime — the
Phase-1 read/propose loop — meets its outcome end-to-end. It is minimal-first (one coherent journey:
intent → load the agent + read tools → orient → propose), defect-driven thereafter (each real failure
earns a permanent regression case, never speculative breadth). Mocks are forbidden in the consumed
seams that CAN run offline: the orientation tools wrap the REAL `run()` over the REAL seed corpus; the
rendered prompt is the REAL `session-orchestrator` agent. Only the SDK `query()` is scripted offline
(the paid leaf can't be a free standing test) and is exercised live in leg 4.

> **HONEST status — `proposed`, read/propose only, part-scripted / part-attested.** The offline legs
> (1–3) are automatable by the package suites (`@storytree/agent` + `@storytree/drive`) over an injected
> `queryFn` + scripted read-tool doubles + the in-memory seed. Leg 4 — a REAL subscription `query()`
> running the session-orchestrator prompt, orienting on the real three surfaces — is **operator-
> attested** (subscription-billed; an agent should not burn the spend unattended), NOT a standing test.
> This UAT is therefore part-scripted, part-attested — the `agent`/`studio-build` honesty pattern.
>
> **Per-leg witness (ADR-0106).** Legs 1–3 are `witness: machine` — the package suites demonstrably
> cover them, so the adopt pass observe-and-signs them. Leg 4 is `witness: human` — the live `query()`
> is experiential/operator-attested with no standing offline test, so it (and it alone) awaits the
> operator's "I saw it work" (ADR-0082). No leg rests `either`. The story-level `uat_witness` is absent
> → human (the ADR-0040 fail-closed signpost), so the machine-driven whole-story UAT node stays
> withheld; the crown derives from the per-leg roll-up.

**Goal —** A programmatic intent loads the `session-orchestrator` agent into a server-side runtime
with the read-only orientation tools wired, the agent orients on the real three surfaces, and the
runtime surfaces a proposed unit — having written, built, signed, and landed NOTHING.

1. **The read-only tool surface exposes the three surfaces and refuses every write.**
   _(witness: machine)_ Construct the orientation tool surface over the in-memory seed store
   (`writable: false`) + the real `stories/` corpus and call each tool. **Success —** the `tree` tool
   returns the work-hierarchy envelope body, the `library` tool returns the dashboard / an artifact
   body, and the surface exposes NO `Write`/`Edit`/`Bash` tool; an attempt to reach a write verb
   through the surface is refused (the `notWritable` guard), never executed — the agent is structurally
   read-only.
2. **A headless session runs the injected prompt with the tools wired and surfaces the proposal.**
   _(witness: machine)_ Drive the runner with a `ScriptedModel`-equivalent injected `queryFn` (zero
   live calls) whose scripted session calls an orientation tool, then emits a final proposal in its
   result message. **Success —** the runner wires the orientation tools into the `query()` options,
   the scripted session's tool call dispatches to the real read command and returns its envelope, the
   runner returns `{ ok: true, proposal: <final text> }`, and running past the scripted end is a LOUD
   error, never a silent forged success.
3. **The composition renders the real agent and drives a session against the real seed corpus.**
   _(witness: machine)_ Call the Phase-1 programmatic entry with an injected `queryFn`. **Success —**
   it renders the REAL `session-orchestrator` system prompt via `renderAgentPrompt` (a non-empty prompt
   carrying the orchestrator's role + injected guidance, NOT a stub), assembles the orientation deps
   over the real seed corpus, drives the runner, and surfaces the scripted proposal — proving the loop
   definition is the rendered library agent (ADR-0051), not a fork.
4. **The live runtime orients on the real three surfaces and proposes.** _(witness: human)_ Run the
   programmatic entry LIVE (a real subscription `query()`, no injected `queryFn`) against the real seed
   corpus (and, with the DB up, the live notice board). **Success —** the agent, running the
   session-orchestrator prompt, CALLS the orientation read tools (tree / library, and the board when
   live), orients on the real three surfaces, and emits a coherent PROPOSED unit — and it wrote nothing,
   opened no worktree, triggered no build, signed no verdict, and landed nothing (read/propose only).
   *(operator-attested — a real `query()` is subscription-billed; an agent should not burn the spend
   unattended, exactly the `agent` story leg-5 / `studio-build` live-run pattern.)*
5. **Confirm the Phase-1 scope walls hold.** _(witness: human)_ **Success —** the runtime served a
   SINGLE orchestration (a second concurrent intent is refused, the single-session guard — ADR-0108
   decision 6, mirroring the worker's single-build guard); there is NO chat UI (Phase 2), NO build /
   gate drive (Phase 3), NO landing by the agent (Phase 4), NO hosting (Phase 5); the tool surface was
   READ-ONLY throughout; and the orchestration declared presence on the notice board like any session
   (ADR-0033) without that presence being mistaken for the proof.

End state — a server-side runtime ran the SAME `session-orchestrator` loop definition the terminal
uses, headlessly, oriented on the real three surfaces through a read-only tool surface, and proposed a
unit — every Phase-1 wall (read-only, no builds, no signing, no landing, single-session) held.

## Proof

The story carries the UAT (above); it is proven when that walkthrough passes — the offline legs (1–3)
green under the package suites, the live leg (4) and the scope-wall confirmation (5) operator-attested
— with the capabilities' integration tests and contracts green underneath. The capability/contract
obligations are minimal-to-green (slow growth): the read-tool surface and the runner are isolatable
and machine-provable over an injected `queryFn` + scripted doubles + the in-memory seed; the
composition is an integration test against the real in-story collaborators (the real
`renderAgentPrompt`, the real `run()` over the real seed corpus) with the SDK `query()` scripted
(ADR-0010 §5 — an offline scripted session is acceptable in the integration test to avoid billing a
live SDK run on every gate pass; the live run is the human-witness UAT action above).

**Honest status — `proposed`.** Nothing here is `healthy`: per ADR-0020, `healthy` is only ever
DERIVED from signed verdicts, and this story has none yet. The three capabilities are proof-wired so
the spine can drive their offline suites red→green under its own gate
(`pnpm storytree story build headless-orchestrator --real`); the story's own machine-driven UAT node is
WITHHELD (its `uat_witness` is absent → human, ADR-0040), so driving the three capabilities to a signed
verdict is what makes the WHOLE story buildable, and the crown additionally awaits the operator's
live-run attestation (leg 4) — `healthy` is never authored here.

## Open modeling calls (for the owner)

The two PLACEMENT calls below were decided minimally and are RECORDED here as decided-and-surfaced
(they are forced by existing decisions, reversible, and internal — not re-litigated here per the
owner-fork bar):

1. **The headless-session CORE lives in `packages/agent` (decided).** The SDK-driving read-only
   `query()` driver + the read-tool MCP surface are a new module in `packages/agent`, sibling to
   `sdk-author.ts` / `sdk-curator.ts`. This is FORCED by ADR-0004's single-import-site rule — every
   `@anthropic-ai/*` import lives in `packages/agent`, so a new package importing the SDK would break
   it; `packages/agent` already hosts the leaf + the curator, so a third SDK-driven role is the
   established pattern. Surfaced (not re-opened) so the boundary is visible.
2. **The composition + Phase-1 entry were placed in `packages/cli` (Phase-1 decision) — the
   composition has SINCE MOVED to `@storytree/drive` per ADR-0112 (see below); the terminal entry
   stays in `packages/cli`.** As originally decided, the orchestrator composition and the programmatic
   intent (a thin CLI command, NOT an HTTP/chat endpoint) were authored in `packages/cli`. The core was
   kept reusable at the package level so Phase 2's studio chat worker REUSES it rather than
   re-implementing — which is exactly what ADR-0112 then formalised by carving the composition into the
   shared `@storytree/drive` package. Surfaced (not re-opened).

The future-fork this section flagged — when the chat surface arrives, does the server-side runtime
move to the ADR-0090 studio WORKER process (`apps/studio/server`), or stay a CLI-hosted core the
worker calls? — is **RESOLVED by [ADR-0112](../../docs/decisions/0112-extract-the-build-orchestrate-drivers-into-packages-drive.md)**
in favour of **a shared `@storytree/drive` core the worker calls**. ADR-0112 carved the
build/orchestrate drivers (including this story's `orchestrate.ts` composition) out of `packages/cli`
into `@storytree/drive` — a package owned by `drive-machinery` that BOTH the terminal `cli` and the
studio worker import. So the Phase-2 runtime is neither buried in `cli` nor duplicated in the studio:
it is a re-composition over the shared core, exactly as Phase 1's "keep the core package-level and
CLI-driven" intended (ADR-0108 decision 1 — the runtime runs ON the ADR-0090 worker — still holds; the
worker now calls a shared `drive` core rather than importing the command hub or re-implementing). The
`orchestrate.ts` composition already moved into `@storytree/drive` (ADR-0112) beside the other drivers
— a move, not a rewrite; the terminal `orchestrate` command stays in `packages/cli` (`commands.ts`),
importing the drive composition across the seam. This story's `orchestrator-composition` capability
cites `packages/drive/src/orchestrate.ts` as its `sourceFile`.

This story's `depends_on` is now reconciled to that move: `cli` is dropped (it is the composition root
that DRIVES the runtime and injects the `run()` read-dispatch through the `OrientationRunner` seam — a
caller, not an upstream; `cli -> drive`, never back, per ADR-0112's hard invariant) and
`drive-machinery` is added (the composition's physical home, the same "code hosted in another story's
package -> declare the edge" precedent as the `agent` edge). `headless-orchestrator` stays a pure
source node — nothing depends on it — so the new edge introduces no cycle (ADR-0058).
