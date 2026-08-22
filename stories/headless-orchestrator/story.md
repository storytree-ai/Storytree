---
id: "headless-orchestrator"
tier: story
title: "The headless orchestrator runtime — the session-orchestrator agent, run server-side, that orients and proposes"
outcome: "A programmatic intent drives a server-side runtime that loads the generated session-orchestrator agent headlessly with read-only orientation tools wired, the agent orients on the real three surfaces (story tree, notice board, library) and emits a proposed unit — read/propose only, one orchestration at a time, holding no signing key."
# RETIRED by ADR-0175 (companion reconcile, owner-directed 2026-07-17 — explorer-onboarding-arc inc 1).
# ADR-0174 retired the in-app INTERACTIVE orchestrator chat in favour of an embedded terminal running
# real Claude Code; ADR-0175 repurposed the freed-up chat infrastructure into the `app-guide` concierge
# ("repurpose, don't delete"). This node's dormant chat substrate — the SDK session engine + the
# read-only orientation tools (packages/agent/src/headless-orchestrator.ts, orientation-tools.ts) and the
# orchestrate/chat-stream composition (packages/drive/src/{orchestrate,chat-stream}.ts), mounted via
# desktop's chat-sse-mount — is now OWNED by `app-guide` (see ../app-guide/story.md). This story is
# retired in place (like chat-drive-bridge / scoped-glue-actuator): the body is kept as history, the
# capability files flip to `status: retired`. NOT retired here: the code itself — the engine, the
# orientation tools and the orchestrate/chat-stream composition are all still mounted and their suites
# still green (verified at file level 2026-08-08). Corrected in place the same day: this read "no
# unmount — a separate thin PR, ADR-0175", which pointed at work that is no longer owed. ADR-0175's
# execution-status block records the code half COMPLETE — the LANDING and SPAWN surfaces were deleted
# on 2026-07-30/07-31, and this substrate is not among them because ADR-0175 KEEPS it under
# `app-guide`. It is a repurpose, not a deferred deletion, so no unmount PR is pending for it.
# COMPANION CLEANUP: LANDED — this comment previously described it as still owed. The four caps' `real:`
# arms ARE dropped (none survives in this directory); packages/cli/src/node-build.test.ts's REAL-buildable
# snapshot now carries only a comment recording their removal; and repo-manifest.json's
# hostedStories.register no longer lists this story. Verified 2026-08-08 while closing
# `explorer-onboarding-plan-1` — `check:boundaries` passes, which it could not if the register prune were
# incomplete (ADR-0192 rule 6). Readers: this substrate now lives under `app-guide`.
status: retired
proof_mode: UAT
# Per-leg witness (ADR-0106): the offline mechanics legs are machine-witnessed by the package suites;
# the live orientation leg (a real subscription query() against the real three surfaces) is human-
# witness (operator-attested — subscription-billed, an agent should not burn the spend unattended).
# The story-level uat_witness is absent → human (the ADR-0040 fail-closed signpost), so the machine-
# driven whole-story UAT node stays withheld; the crown derives from the per-leg roll-up.
# RE-ADJUDICATED 2026-07-26 (ADR-0209 D8): the legs at ordinals 1-3 AND 5 were `witness: machine`; only
# the leg at ordinal 4 stayed `human`, on the NO-COMPILER basis (is the proposed unit COHERENT — an owner
# verdict with no oracle) with real subscription spend as a second, dissolvable basis that ADR-0348 D2
# later withdrew. The leg at 5 ("confirm the Phase-1 scope walls hold") named NO judgment at all — a
# refused second session, an empty tool list, an absent dep, a non-existent hosted entry — and three of
# its conditions were already authored as contracts. Its blanket "NO build/gate drive, NO landing by the
# agent" walls were also FALSIFIED by ADR-0137/0152/0173 on the desktop path, so the leg was re-scoped to
# this story's terminal entry rather than re-tagged and left standing. Per ADR-0209 §6 a re-adjudicated
# leg is UNSTAMPED until a spec judges it; nothing here went green and the owner signed nothing.
# UAT CRITERIA: NONE since 2026-08-21 (ADR-0396 — a retired story's criteria are an obligation against a
# withdrawn journey, so they are deleted and their ordinals burned; the body keeps the history).
# Ordinals 1-5 are all burned. None held proof credit (all read `proven=–`), so ADR-0396 D8's
# keep-the-proven fence did not bite; each key is `superseded` in stories/uat-legacy-dispositions.json
# and the detail artifacts headless-orchestrator#uat-4/5 are retired in the live store. ⚠ THIS STORY'S
# CODE IS STILL LIVE (retirement moved OWNERSHIP to app-guide, it removed nothing): the deletion removes
# an obligation, never a wall — the Phase-1 walls stay asserted by ots-write-verb-refused-at-surface,
# ots-exposes-exactly-the-read-surfaces, hsr-refuses-concurrent-session and oc-single-session-guard.
# Everything above this line about the legs is DATED HISTORY, not anything current.
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
#                    work-hierarchy + knowledge schema (loadFixtureCorpus over @storytree/library/fixture). Also the
#                    home of renderAgentPrompt(store, "session-orchestrator")
#                    (packages/library/src/store/render-agent.ts, a @storytree/library/store seam since
#                    ADR-0112 §4), which assembles the SAME session-orchestrator system prompt the
#                    terminal session uses (ADR-0051 — one loop definition).
#   - notice-board — the session-presence surface the agent orients on AND declares on like any session
#                    (ADR-0033): `noticeboard` reads the live presence store
#                    (packages/drive/src/noticeboard.ts). Phase 1's PROOF is orientation+proposal, not
#                    presence — the declaration is the session courtesy, not the deliverable.
depends_on: [agent, drive-machinery, library, notice-board]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [drive-machinery, notice-board]
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

> **RETIRED — ADR-0175 (companion reconcile, owner-directed 2026-07-17, explorer-onboarding-arc inc 1).**
> ADR-0174 retired the in-app *interactive* orchestrator chat for an embedded terminal running real
> Claude Code; **ADR-0175** repurposed the freed-up chat infrastructure into the **`app-guide`**
> concierge rather than deleting it. The dormant chat substrate this story owned — the SDK session
> engine + read-only orientation tools (`packages/agent/src/headless-orchestrator.ts`,
> `orientation-tools.ts`) and the `orchestrate` / `chat-stream` composition
> (`packages/drive/src/{orchestrate,chat-stream}.ts`), mounted through desktop's `chat-sse-mount` — is
> now **owned by [`app-guide`](../app-guide/story.md)**. This story is retired IN PLACE (the
> `chat-drive-bridge` / `scoped-glue-actuator` precedent): the body below is kept as history. The code
> is not unmounted — and no unmount is owed: **ADR-0175** KEEPS this substrate under `app-guide`
> ("repurpose, don't delete"), and its execution-status block records the code half COMPLETE, the
> deletions there being the LANDING and SPAWN surfaces rather than this one. *(Corrected in place
> 2026-08-08; this read "is NOT unmounted here (a separate thin PR, ADR-0175)".)*
> **See [`app-guide`](../app-guide/story.md).**

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
  standing offline test. That leg was `witness: human` (the Story UAT leg at ordinal 4); the offline
  mechanics legs at ordinals 1–3 were `witness: machine`. *(Re-adjudicated 2026-07-26, ADR-0209 D8: the
  scope-wall leg at ordinal 5 joined the machine set, and the live leg's load-bearing basis was restated
  as NO-COMPILER — whether the proposed unit is coherent — with the spend as a second, dissolvable basis
  rather than the whole reason. All five were then deleted by ADR-0396 on 2026-08-21; the UAT section
  holds the record.)*

Status stays `proposed` for every unit — `healthy` is earned through the prove-it-gate AND the
operator's live-run attestation; it is never authored (ADR-0020).

## Capabilities (4)

*(Count corrected 2026-07-26 from "(3)": the frontmatter and the table below have listed FOUR since
Phase 2's `chat-session-stream` was added; the narrative below is kept as the Phase-1 history it was
written as, and "all three" in it means the three Phase-1 capabilities.)*

Listed roots-first (a capability appears after everything it depends on). All three are
**proof-wired** (ADR-0057 — each carries a `proof:` block with a `real:` arm describing a genuine
additive net-new red→green against the real package source), so they form a **dependency-closed,
acyclic set in which every member resolves a `real:` arm** — exactly what makes the WHOLE story
story-`real`-buildable (`isStoryBuildable`). The live orientation leg is NOT a fourth capability (it
has no separate code — it is the runner's own mechanics run live); it was carried by the human-witness
Story UAT leg at ordinal 4, the slow-growth-minimal choice (mirroring `studio-build`, whose live run is
the human-witness UAT action, not a capability). *(Carried by no leg since ADR-0396, 2026-08-21.)*

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`orientation-tool-surface`](orientation-tool-surface.md) | A read-only in-process tool surface exposes the storytree read surfaces (tree, library, noticeboard, agents) to a model with parameterized drill-down args, each returning a real envelope body, with NO write tool, write verbs refused at the surface, and writes structurally impossible. | — |
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
  `loadFixtureCorpus` over `@storytree/library/fixture`, `packages/cli/src/commands.ts`). The corpus the agent reads —
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

## UAT Test Criteria

> **DELETED — all five criteria, 2026-08-21, under
> ADR-0396.**
> A UAT criterion is a standing acceptance OBLIGATION against a story's outcome, not a record of one.
> This story is `status: retired` — retirement moved OWNERSHIP of its substrate to
> [`app-guide`](../app-guide/story.md) (ADR-0174 / ADR-0175) — so its outcome is withdrawn and every
> criterion under it was an obligation against a journey nobody will run on THIS story's behalf. The
> five legs that stood here — ordinals 1 through 5 — are deleted, and **every one of those ordinals is
> BURNED, never reused** (ADR-0396 D2): no `headless-orchestrator#uat-<n>` key can ever denote a second
> criterion.
>
> **⚠ THIS IS THE ONE OF THE FIVE RETIRED STORIES WHOSE CODE IS STILL LIVE — read the deletion
> precisely.** `storytree orchestrate "<intent>"` remains a reachable terminal command
> (`packages/cli/src/commands.ts`), every source file this story cites exists, and the suites over them
> are green. **Deleting these legs removes a retired story's OBLIGATION; it removes no wall.** The
> Phase-1 walls the leg at ordinal 5 asserted are still asserted one rung down, by contracts this
> story's own capabilities own: `ots-write-verb-refused-at-surface` and
> `ots-exposes-exactly-the-read-surfaces` (`packages/agent/src/orientation-tools.test.ts`),
> `hsr-refuses-concurrent-session` (`packages/agent/src/headless-orchestrator.test.ts`) and
> `oc-single-session-guard` (`packages/drive/src/orchestrate-single-session.test.ts`). **What is NOT
> decided here, and is deliberately left open:** whether those walls deserve a standing STORY-tier
> acceptance claim on whichever LIVE story owns the substrate today. If they do, that claim belongs to
> `app-guide` and authoring it there is a separate story-author unit — recorded in ADR-0396's
> Consequences so the silence is not mistaken for a finding that no claim is owed.
>
> **Nothing signed was destroyed.** All five read `proven=–` at deletion — no `events.verdict` row and
> no `events.attestation` row named any of their `criterionId`s (`events.attestation` held 8 rows
> corpus-wide when last probed and not one was a `headless-orchestrator#uat-*` id). ADR-0396 D8 keeps a
> proof-bearing criterion in place when its story retires; none here was one.
>
> **Where the history is.** Each of the five positional keys is recorded `superseded` in
> `stories/uat-legacy-dispositions.json` with its rationale (the ledger still totals 282 keys), the legs
> themselves are in `git log -p` verbatim, and the two detail artifacts they pointed at —
> `headless-orchestrator#uat-4` and `#uat-5` — are retired in the live store with the same rationale.

**Goal (kept — what the journey was FOR) —** A programmatic intent loads the `session-orchestrator`
agent into a server-side runtime with the read-only orientation tools wired, the agent orients on the
real three surfaces, and the runtime surfaces a proposed unit — having written, built, signed, and
landed NOTHING. Intent → load the agent + read tools → orient → propose.

### What the deleted legs established, carried up so it is not lost with them

These are the facts the per-leg scope notes had recorded and that the rest of this body does not
otherwise carry (ADR-0396 D3). They describe LIVE code, so they are the most load-bearing carry-up of
the five retired stories — each was written against the code on the date given and any of them could
have gone RED as originally worded:

- **The write refusal happens at the SURFACE, not at the CLI's `notWritable` guard** (2026-07-26). It
  is the surface's own `WRITE_VERBS` set that refuses, before the runner is ever called
  (`packages/agent/src/orientation-tools.ts:91-97`, `:176-183`, contract
  `ots-write-verb-refused-at-surface`). The CLI's `notWritable` guard is the downstream BACKSTOP,
  reached only if a write verb slipped the surface — a test asserting the refusal came from
  `notWritable` would find the runner was never invoked.
- **`buildOrientationTools` returns FOUR tools, not three** — `tree`, `library`, `noticeboard`,
  `agents`. "Three surfaces" is the ADR-0108 orientation triad; `agents` (the self-onboarding read) was
  added later. `ots-exposes-exactly-the-read-surfaces` pins the exact four.
- **The orientation tools are wired only when a RUNNER is also injected** (2026-07-26). Since the
  ADR-0108 §7 scale-down, `packages/agent/src/headless-orchestrator.ts:252-253` builds them ONLY when
  `args.runner !== undefined`; with no runner NO orientation tools are advertised and `allowedTools` is
  empty. A walk that injects a `queryFn` alone and then asserts the runner wired the tools into the
  `query()` options goes red against correct code — both seams must be injected, exactly as
  `headless-orchestrator.test.ts` does in its "injected runner is usable by orientation tools" case.
- **The loud error is a RETURNED result, not a throw.** A session ending with no result message yields
  `{ ok: false, error: "SDK session ended without a result message" }` (`headless-orchestrator.ts`
  `:402-407`); the runner never throws, so an assertion shaped as `assert.throws` also goes red.
- **The composition does NOT assemble seed-backed orientation deps, and never has on this path**
  (2026-07-26). `orchestrate()` passes the seed `store` to `renderAgentPrompt` ONLY
  (`packages/drive/src/orchestrate.ts:191`), and `runHeadlessOrchestrator` builds the orientation tools
  with `{ store: null }` (`headless-orchestrator.ts:253`) — the tool surface reaches the corpus through
  the INJECTED runner. What IS true, and what `orchestrate.test.ts` pins, is that the system prompt
  handed to the runner is the REAL rendered `session-orchestrator` off the seed store.
- **THE WALLS MOVED, and the scoping is the load-bearing part.** The Phase-1 read/propose-only walls
  hold on THIS story's terminal entry, which wires no spawn / landing / inspect deps. They do NOT hold
  on the DESKTOP path built over this story's own Phase-2 capability: `chat-stream.ts:280-282` forwards
  spawn (ADR-0137), landing (ADR-0152) and inspect (ADR-0173) deps into `orchestrate`, so a desktop
  chat session really can spawn a builder, run the gate and open a landing PR. Those doors were opened
  by later ACCEPTED decisions, not by drift. Anyone re-authoring a walls claim anywhere must carry this
  scoping or the claim goes RED against correct code.
- **Three original wall conditions were REMOVED as factually false rather than restated** (2026-07-26),
  and must not be revived: *"There is NO chat UI (Phase 2)"* — `chat-session-stream` is capability 4 of
  this very story and shipped green in PR #398 / #399; *"NO build/gate drive (Phase 3), NO landing by
  the agent (Phase 4)"* — ADR-0137 / ADR-0152 / ADR-0173 deliberately opened those doors on the desktop
  path; and *"the orchestration declared presence on the notice board"* — `orchestrate()` declares
  nothing anywhere on its path, and ADR-0200 retired advisory presence rows outright in favour of the
  claim ledger.
- **The coherence judgment had no oracle, and no `model` witness kind is reachable** — whether the
  runtime emitted a COHERENT unit proposal (one that follows from what it actually READ, rather than
  plausible prose it could have produced from the system prompt alone) is decided by nobody but the
  owner. That basis dissolved under nothing; the metered-spend half that once rode with it was
  withdrawn by ADR-0348 D2.

### The per-leg witness record, as it stood at deletion — history, describing a list that no longer exists

Read every sentence below as dated: it describes how the five legs stood on 2026-08-13, not how
anything stands now.

As authored, the legs at ordinals 1–3 were automatable by the package suites (`@storytree/agent` +
`@storytree/drive`) over an injected `queryFn` + scripted read-tool doubles + the in-memory seed, and
the leg at ordinal 4 — a REAL subscription `query()` running the session-orchestrator prompt, orienting
on the real three surfaces — was operator-attested rather than a standing test. The 2026-07-26
re-adjudication (ADR-0209 D8) left ordinals 1–3 AND 5 `witness: machine`, with only ordinal 4 staying
`witness: human`; no leg rested `either`.

**The coverage claim was CHECKED, not trusted, and it held.** `orientation-tools.test.ts` carries all
seven `ots-*` contracts, `headless-orchestrator.test.ts` all five `hsr-*`, and
`packages/drive/src/{orchestrate,orchestrate-single-session}.test.ts` the five `oc-*`. Both suites ran
green on 2026-07-26 (`@storytree/agent` 189 pass / 0 fail; `@storytree/drive` 318 pass / 0 fail). Every
cited source file exists — nothing on this story was ever a dead binding.

**What the re-adjudication changed.** The leg at ordinal 5 (*"confirm the Phase-1 scope walls hold"*)
was `human` while naming NO judgment whatsoever: a refused second session, an empty tool list, an
absent dep, a non-existent hosted entry. Refusals, absences, shapes and counts all compile —
`human-witness-is-a-judgment-gap-not-cost` — and three of its conditions were ALREADY authored as
contracts (`oc-single-session-guard`, `hsr-refuses-concurrent-session`,
`ots-write-verb-refused-at-surface`), which is the clearest sign it was never irreducible. This is the
subject-matter trap in its plainest form: a story about an autonomous orchestrator had tagged its own
mechanics as judgment. `studio-build`'s own "confirm the no-land walls hold" leg is the settled
precedent — that shape is machine.

**The leg at ordinal 4 stayed `human`, on the NO-COMPILER basis FIRST and the SPEND basis second.**
Whether the unit it proposed was COHERENT has no oracle; that basis dissolved under nothing. The
subscription spend was real and also disqualified an unattended agent, but that basis WOULD have
dissolved if the spend went away — and ADR-0348 D2 duly withdrew it — so it was never the load-bearing
one. The leg's mechanical halves were REMOVED rather than split off: the legs at ordinals 2 and 3
already compiled the tool dispatch and the proposal extraction, and the re-adjudicated leg at 5
compiled the no-write / no-build / no-land walls. Restating a compiled fact as something the owner
signs launders it into an unrepeatable signature.

**NEITHER leg was gate-bound, and that was deliberate.** This story declares no `## Reliability Gates`
section, so there was no gate id to name: `resolveWitness` reported every machine leg here `refused` —
a pre-existing OPEN BINDING GAP that the re-adjudicated leg joined, never a regression that pass
introduced. Minting an observe gate to make it look bound would be the rubber-stamp ADR-0097 §2 bans,
especially on a story whose capabilities' `real:` arms were dropped at retirement. The honest state was:
machine and unbound.

**IRREDUCIBLE and CURRENTLY UNWALKABLE are different facts, and this story is the corpus's clearest
demonstration.** Unlike the retired-and-dormant surfaces elsewhere in this migration, all five legs
here were WALKABLE to the end — retirement moved ownership of the substrate, it did not remove the
code. The leg at ordinal 4 was human because it was irreducible, and it happened also to be walkable.

The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the
machine-driven whole-story UAT node stayed withheld; the crown derived from the per-leg roll-up, and
now derives from the ADR-0085 own-proof union over a story that declares no criteria (ADR-0294 D5).

**End state, as authored —** a server-side runtime ran the SAME `session-orchestrator` loop definition
the terminal uses, headlessly, oriented on the real three surfaces through a read-only tool surface,
and proposed a unit — every Phase-1 wall (read-only, no builds, no signing, no landing, single-session)
held ON THIS ENTRY. *(Scoped 2026-07-26: the walls are still true of the terminal `orchestrate` entry
this story owns; they were deliberately opened on the desktop chat path by ADR-0137 / ADR-0152 /
ADR-0173, so the unqualified reading is not accurate — see "THE WALLS MOVED" above, which is where that
scoping now lives.)*

## Proof

The story carries the UAT (above); it is proven when that walkthrough passes — the offline legs (1–3)
green under the package suites, the scope-wall confirmation (5) machine-observed *(re-adjudicated
2026-07-26, ADR-0209 D8 — it was operator-attested; it names no judgment, so it is not)*, and the live
leg (4) operator-attested — with the capabilities' integration tests and contracts green underneath. The capability/contract
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
live-run attestation on the live leg — `healthy` is never authored here. Since ADR-0396 (2026-08-21)
the crown awaits nothing here: the story declares no criteria. *(Corrected 2026-08-08: the
paragraph above is AUTHORING-TIME history and its present tense no longer describes anything live —
the story and all FOUR capabilities are `retired`, not `proposed` (it says "three"; the
`capabilities:` list above has four), and their `real:` arms are dropped, so the `story build --real`
command quoted just above cannot run. Kept as history. Unlike its two sibling retirements the CODE
here was kept, not unmounted — see the frontmatter note. This is the same correction
`spawn-visibility` has carried since 2026-07-26; its absence here was the asymmetry.)*

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
3. **The READ-DISPATCH fork ("Fork B") is DEFERRED with a concrete trigger — no extraction now
   (decided 2026-06-27, story-author call, owner-delegated).** ADR-0112 carved the build/orchestrate
   DRIVERS out of `packages/cli` into `@storytree/drive` so non-cli consumers stop depending on the
   command hub. A sibling investigation flagged a deferred future-fork: the same logic may recur for the
   **read dispatch** — the verb→`Envelope` `OrientationRunner` the runtime's orientation tools call,
   which TODAY only `@storytree/cli` constructs (`packages/cli/src/commands.ts` ~line 1450:
   `runner: (toolArgv) => run([...toolArgv], { ...deps, writable: false })`, the ADR-0023 agent-facing
   read surface). The framing was: "when a second non-cli consumer needs the programmatic read dispatch
   but can't import cli, extract `run` + `Envelope` + the read verbs into a non-cli package." **The
   evidence on current main says do NOT extract `run()`, and defer:**
   - **The two specced non-cli consumers do not want cli's `run()` — they RE-COMPOSE reads from the
     organism drivers they already import.** `apps/studio`'s server (`apps/studio/server/apiRouter.ts`)
     builds its OWN `/api/*` route table over an injected `BuildRunner` + the lazy `@storytree/orchestrator`
     discovery (`readTree` calls `loadNodeSpec` directly) + `@storytree/library` — it never wraps `run()`.
     `apps/desktop`'s `local-backend-boot` capability (`stories/desktop/local-backend-boot.md`) states it
     explicitly: "the factory takes the drivers (the build runner, the discovery, **the read dispatch**)
     as injected callbacks," re-composing reads from `@storytree/library/store` + `@storytree/orchestrator`
     + `@storytree/drive` — and is forbidden from importing `apps/studio/server` OR `cli` (the boundary
     call, ADR-0100 / ADR-0113 §1). Neither consumer's `depends_on` includes `cli` (ADR-0112 §3 / ADR-0113
     §8). So the "second non-cli consumer that wraps `run()`" the original fork assumed never materialised.
   - **The `OrientationRunner` seam ALREADY exists in `@storytree/agent`** — `OrientationRunner =
     (argv, deps) => Promise<OrientationEnvelope>` (`packages/agent/src/orientation-tools.ts`), with the
     envelope shape DUPLICATED there (not imported) precisely to avoid the `cli → agent → cli` cycle, plus
     a no-op `defaultRunner`. `orchestrate({ runner })` (`packages/drive/src/orchestrate.ts`) takes that
     seam and passes it THROUGH; `chat-session-stream` (Phase 2) and the desktop backend both mount the
     SAME drive core and pass `runner`/`queryFn` through. The boundary that would let a non-cli backend
     supply a read dispatch is therefore ALREADY cut — nothing is buried in `cli` that a consumer must
     reach through `cli`.
   - **No GREEN forces the extraction.** Every offline proof scripts the `queryFn`, so the orientation
     `runner` is never exercised in the gate; the live orientation leg is operator-attested
     (subscription-billed; it stood as the leg at ordinal 4 until ADR-0396 deleted this retired story's
     criteria on 2026-08-21) and NO non-cli backend wires a live runner in built code today (only
     `packages/cli` constructs the real `run()`-backed runner). Extracting a shared read-dispatch package
     now would build a package-level abstraction before any consumer forces it — the slow-growth /
     minimum-to-green violation the rule names.
   - **The concrete trigger that WOULD force it:** the FIRST non-cli backend that needs to wire a **LIVE
     orientation runner** (a real verb→`Envelope` read dispatch the SDK session calls live) and cannot get
     it by re-composing the organism reads it already imports. **When that trigger fires, the resolution is
     option (c), not an extraction of cli's `run()`:** host a `buildOrientationRunner` — composed from the
     organism reads (`@storytree/library/store` + `@storytree/orchestrator` discovery + `@storytree/notice-board`)
     — in `@storytree/drive`, beside `orchestrate.ts`, so the cli `orchestrate` command, the studio worker,
     AND the desktop backend all consume one shared source. `drive` already imports those organisms and
     already hosts `orchestrate`; it CANNOT import `cli` (ADR-0112's hard invariant), so it would compose
     reads directly — which is exactly why extracting cli's `run()` is the wrong shape. cli's `run()` stays
     the TERMINAL/agent read surface (ADR-0023), unextracted, and the `OrientationRunner` seam stays the
     boundary. This is RECORDED, not built (forced by existing decisions, reversible, internal — not
     re-litigated per the owner-fork bar; no new package boundary is created by deferring, so no ADR is
     warranted now — the resolution shape (c) lands inside the already-accepted ADR-0112 + ADR-0113 frame
     when a live runner first needs it).

The future-fork this section flagged — when the chat surface arrives, does the server-side runtime
move to the ADR-0090 studio WORKER process (`apps/studio/server`), or stay a CLI-hosted core the
worker calls? — is **RESOLVED by ADR-0112**
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
