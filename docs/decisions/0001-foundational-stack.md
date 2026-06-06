# ADR-0001: Foundational stack — pi + a thin durable orchestrator, no framework

## Status

accepted (2026-06-03) — **partially superseded by [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md)**:
the **pi** per-node runtime and the **model-agnostic, pay-as-you-go** non-negotiable are
reversed (storytree owns the agent loop, built on the Anthropic SDK). Everything else here
stands — DBOS/Postgres, the thin orchestrator, the event store, PixiJS, and the
TS/Node/pnpm stack.

## Reaffirmation (2026-06-06) — TypeScript stands, all-in

With **pi** dropped ([ADR-0011](0011-own-the-agent-loop-and-context-engineering.md)), this
ADR's TypeScript rationale — part of which was pi compatibility — was reconsidered against a
possible **Rust** rewrite (v1/`Agentic` was Rust; Rust's stronger compile-time guardrails fit
storytree's correctness ethos). Verdict: **TypeScript stands, now all-in.** Reasoning:

- The **agent loop stays TS on the official Anthropic SDK** — there is no official Rust SDK,
  and raw HTTP would forfeit the SDK's streaming / tool-runner / structured-output helpers
  (ADR-0011).
- **DBOS is retained over Temporal.** DBOS is a *library* in the **same Postgres as the event
  store** (the single source of truth the studio renders); Temporal would add a separate
  service + state store + UI overlapping what storytree builds itself. Temporal's
  signals/queries and scale-maturity were the draw — not worth a second platform yet.
- The **studio is browser-bound TS** (React + PixiJS) regardless.

With loop, orchestrator, and studio all TS, a Rust `packages/core` would be an **island**
behind a codegen seam serving no other Rust code — net negative. TS guardrails (strict
`tsconfig`, zod at boundaries, branded types, exhaustive discriminated unions) carry the
correctness load instead. Recorded so the Rust question is not re-litigated cold.

## Date

2026-06-03

## Context

storytree v2 is a greenfield agentic software-builder: a DAG of stories grown
by AI coding agents, with two non-negotiable requirements set at the outset —
(1) **deep observability**, the tree's growth and every agent's activity must
be visible live; (2) a **UI that drives the agents** (an IDE — diffs,
approvals, steering, per-node chat), not a read-only dashboard. Two further
constraints: **parallelism from day one** (concurrent stories, crash-safe
state), and **model-agnostic, pay-as-you-go** operation (moving off a Claude
subscription to API billing, free to try non-Anthropic models).

The selection ran as a multi-round deliberation. The decisive insight: each
constraint *shrank the orchestrator's job*, because the per-node coding agent
(**pi**) already owns the model loop, per-session durability, a structured
event stream, diffs, and mid-run steering. What an orchestration framework
would add on top kept narrowing — until the only real gap left was durable,
concurrency-safe **multi-node** scheduling.

## Decision

Build on a **thin custom orchestrator over pi**, backed by a lightweight
durable-execution substrate. No agent framework.

- **Per-node coding agent: pi** (`earendil-works/pi`). Model-agnostic (15+
  providers), highly customizable, exposes `prompt`/`steer`/`followUp`, a
  lifecycle event stream, and `edit`-tool diffs/patches. pi owns everything
  *inside* a node.
- **Durable execution: DBOS (Transact-TS)** over Postgres. Auto-resumes
  crashed workflows, durable queues with concurrency caps — crash-safe
  parallelism as a library, not a cluster. (Restate is the reserved
  alternative if a single self-contained binary is later preferred over a
  Postgres dependency.)
- **Orchestration: a thin custom layer** — the story-DAG, the scheduler, and
  an **event store** that is the single source of truth for observability
  (pi events + orchestrator events). The UI renders the event store; no
  external trace product is in the loop.
- **Tree UI: PixiJS v8 + `@pixi/react`**, 2D isometric, embedded as a panel in
  a React web IDE. Art assets are deferred (curated/AI, chosen later) — the
  engine is settled, the look is a later pass.
- **Language: TypeScript, Node 24, pnpm workspaces.**

## Alternatives considered

- **Mastra** (TS agent framework). Strong: Node/Hono server, client SDK for a
  custom UI, 600+-model router, GA. **Rejected as the engine** because once pi
  owns per-node control, Mastra's value narrows to concurrency durability,
  where its story is younger (checkpoints on-suspend only, no official
  concurrent-write-safety guarantee). Good framework; redundant here.
- **LangGraph.js** (graph orchestration). Strongest concurrency primitives
  (reducer-safe parallel writes, per-superstep checkpoints, replay/fork).
  **Rejected** for weight and ecosystem pull: the OSS engine is free, but the
  rich observability is **LangSmith**, billed per trace (~$2.50/1k) — exactly
  wrong for a watch-everything system whose observability is a custom UI we own
  anyway. DBOS covers the one thing we needed (durable concurrency) without the
  LangChain surface.
- **Claude Agent SDK** (TS). Excellent harness, pay-as-you-go. **Rejected as
  the runtime**: Anthropic-models-only, even via Bedrock/Vertex — fails the
  model-agnostic goal. (It remains fine as a *bootstrap* harness.)
- **Google ADK**. Python is mature and model-agnostic, but the official
  TypeScript port is young and Gemini-first; the community `@iqai/adk` is not
  Google's. **Rejected** for a TS-first, model-agnostic build today.

## Consequences

**Gained.** Minimal surface we fully own and can see into; model-agnosticism
and pay-as-you-go via pi; observability that is first-class and SaaS-free;
crash-safe parallelism from day one via a proven durable-execution library.

**Paid.** We own the story-DAG and shared-state-merge semantics on top of
DBOS's primitives (idempotent retries, fan-in joins, backpressure). This is
the deliberate cost — it is exactly the layer v1 got wrong (store-lock races,
in-process story-ID collisions), so owning it consciously, concurrency-safe
from the start, is the point.

**De-risk first.** Before building outward, a 1-day spike: a 3-node
fan-out/fan-in of pi sessions on DBOS; kill the process mid-run; confirm clean
resume and no duplicate side-effects. If that holds, the foundation holds.

## What this does NOT decide

- The story / capability / contract / event **schema** (lands in `packages/core`, next).
- The wire protocol between studio and orchestrator (events out / commands in).
- Art direction and asset source for the isometric tree (deferred; user-chosen).
- Whether the bootstrap harness moves from Claude Code to the Claude Agent SDK
  when the subscription lapses (separable; does not affect this runtime choice).
