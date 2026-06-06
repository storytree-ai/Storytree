# storytree

An agentic software-builder. Work is modeled as a **DAG of stories** — each
story a **bounded context** (an organism) proven by a **UAT** acceptance
walkthrough, composed of **capabilities** proven by **integration tests** (real
in-story collaborators), down to **contracts**, the isolated unit-test leaf — and
a fleet of AI coding agents grows the tree, one proven story at a time. You **watch it
grow**: every state change is a typed event rendered live in a game-like
(city-builder) view, so the system's internals are visible rather than
buried.

This is **v2**, a greenfield rebuild. The first tree (`C:\code\Agentic`, a
Rust + Claude-Code corpus) proved the *idea* — stories, contracts, a
commit-time gate, UAT promotion — but its internals were vibed and are hard
to see. v2's bet: **design observability up front, go slow, own every layer,
stay model-agnostic.**

## North star

Set up the building blocks so **storytree can build itself** — agents author,
test, and UAT-prove stories on the tree, and the tree's own growth is the
product you watch. v2 is currently being *bootstrapped* by hand (Claude Code
over the Agentic repo as the midwife harness); the goal is for that scaffolding
to fall away as the tree becomes self-building.

## Architecture (the layers)

```
┌─────────────────────────────────────────────────────────────┐
│  studio (web IDE)   React shell + PixiJS 2D-isometric tree    │  apps/studio
│  watch + DRIVE: diffs, approvals, steering, per-node chat     │
└───────────────▲───────────────────────────┬─────────────────┘
                │ events out                 │ commands in
┌───────────────┴───────────────────────────▼─────────────────┐
│  orchestrator   DAG scheduler · event store · the story tree  │  packages/orchestrator
│  durable + concurrency-safe via DBOS (Postgres) — parallel    │
│  from day one (no store-lock races, conflict-free story IDs)  │
└───────────────▲───────────────────────────┬─────────────────┘
                │ normalized events          │ run / steer / approve
┌───────────────┴───────────────────────────▼─────────────────┐
│  pi-adapter   wraps a pi coding-agent session per node        │  packages/pi-adapter
│  maps pi's lifecycle event stream + diffs → our event model   │
└──────────────────────────────┬───────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  pi (the coding      │  external runtime
                    │  agent that writes   │  (earendil-works/pi)
                    │  the code per story) │
                    └─────────────────────┘

   packages/core — shared types: story / capability / contract / event schema (the
                   single source of truth every layer speaks)
```

The orchestrator owns only what pi does **not**: multi-node DAG scheduling and
durable, concurrency-safe shared state. Everything an agent does inside a node
— the model loop, steering, diffs, approvals — belongs to **pi**. Observability
is **ours**: pi's event stream + orchestrator events land in our own event
store and render in our own UI. No external trace SaaS.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Language / runtime | TypeScript, Node 24, pnpm workspaces | model-agnostic, owns the loop |
| Per-node coding agent | **pi** (`earendil-works/pi`) | model-agnostic (15+ providers), customizable, emits a clean event stream + diffs |
| Durable execution | **DBOS** (Transact-TS over Postgres) | crash-safe concurrent workflows, auto-resume, durable queues — parallelism without the scars |
| Orchestration | thin custom layer | the story-DAG + event store; small, ours |
| Observability | own event store | pi events + orchestrator events → typed event log → UI. No per-trace SaaS |
| Tree UI | **PixiJS v8** + `@pixi/react`, 2D isometric | fastest 2D, embeds as an IDE panel, batches 1000s of live sprites @60fps |
| Models | any, via pi | pay-as-you-go API keys; not tied to a subscription |

See [docs/decisions/0001-foundational-stack.md](docs/decisions/0001-foundational-stack.md)
for how this was chosen (and what was rejected — Mastra, LangGraph/LangSmith,
Claude Agent SDK, Google ADK).

## Principles

- **Observability-first.** The event model is designed before features. If a
  state change isn't a typed event the UI can render, it doesn't exist.
- **Go slow, own the layers.** No vibing the load-bearing parts.
- **Parallel from day one.** Concurrency-safe state is a foundation, not a
  retrofit — learned the hard way from v1's store-lock races and story-ID
  collisions.
- **Model-agnostic, self-hosted.** API keys, not a subscription; your data and
  traces stay yours.

## Repo layout

```
packages/core          shared types: story / capability / contract / event schema
packages/orchestrator  DAG scheduler, event store, DBOS workflows
packages/pi-adapter     pi session wrapper → normalized events
apps/studio            web IDE: React + PixiJS isometric tree
docs/decisions         ADRs
```

## Development (bootstrap phase)

storytree lives as a **sibling** of the Agentic repo (`C:\code\storytree`
alongside `C:\code\Agentic`) — independent git history, not nested. During
bootstrap it's built via Claude Code working across both repos (`--add-dir`).

```bash
corepack enable pnpm   # Node 24 ships corepack; no global install needed
pnpm install
# Postgres for DBOS runs via Docker (Docker Desktop is present):
#   docker run -d --name storytree-pg -e POSTGRES_PASSWORD=storytree -p 5432:5432 postgres:16
```

Copy `.env.example` → `.env` and fill in model API keys + `DATABASE_URL`.

## Status

**Foundation scaffold.** Structure, design docs, and TS monorepo skeleton are
in place. No runtime code yet — the modules are stubs. Next up: the event
schema (`packages/core`) and a 3-node durable-concurrency spike on DBOS to
prove crash-safe parallel pi sessions before building outward.
