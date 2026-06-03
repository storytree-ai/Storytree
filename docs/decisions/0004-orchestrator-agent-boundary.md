# ADR-0004: Orchestrator/agent boundary — pi only via pi-adapter, model-free core, studio, and proof path

## Status

proposed

## Date

2026-06-04

## Context

ADR-0001 settled the runtime (**pi** as the per-node agent; a thin custom
orchestrator over DBOS/Postgres; the **studio** as the driving UI) and ADR-0002
settled the work hierarchy (story / capability / contract). Neither said *which
module is allowed to invoke a model*, and that is its own decision: it governs
the blast radius of model-unavailability.

The v1 corpus already paid for getting this wrong and then partly fixed it.
v1 ADR-0003 carved out a single agent-invocation surface and kept the product
and verify libraries "AI-free", on the strength of a legacy post-mortem where a
model call buried in a product module made the whole system fall over whenever
the model was slow, rate-limited, or down. That layering invariant is durable
and **stack-independent** — but its v1 wording is entangled with a dead
substrate: it was phrased around the *Claude-Code subprocess* as the "sole
claude-subprocess surface", and it leaned on a now-irrelevant Claude-Code quirk
(the Task tool being blocked for subagents) to argue that agents must not spawn
agents. ADR-0003(v2), the reversal ledger, records the substrate swap
(claude-subscription-subprocess → pi + API keys) as settled. This ADR restates
the surviving invariant in **pi terms** so it is not silently lost in the
rewrite, and re-derives the no-nested-spawn rule from v2's own architecture
rather than the dead quirk.

The repository scaffold already names the four modules this decision binds:
`packages/core`, `packages/orchestrator`, `packages/pi-adapter`, and
`apps/studio`.

## Decision

**pi is invoked only through `packages/pi-adapter`, and only
`packages/orchestrator` drives `pi-adapter`. `packages/core` and `apps/studio`
contain zero agent invocation. The proof path — the gate, the verdict
computation, and the projection of the event log into the derived rollup — runs
model-free.**

Concretely, four rules:

| # | Rule | Enforced by |
|---|---|---|
| 1 | pi is reached **only** through `packages/pi-adapter` — the sole place a model runtime is imported or a pi session is spawned. | Package graph: nothing else depends on pi. |
| 2 | **Only** `packages/orchestrator` drives `pi-adapter`. | Package graph: `pi-adapter` is an orchestrator-only dependency. |
| 3 | `packages/core` (schema, lifecycle, event types) and `apps/studio` (the UI) contain **no** agent invocation and have **no** path to a model runtime. | Package graph: neither imports `pi-adapter`. |
| 4 | The **gate** and the **event-log → rollup** projection are pure functions of recorded **evidence**; they never call a model to reach a **verdict**. | `core`/`orchestrator` projection code is model-free. |

Why this is load-bearing and not bureaucratic: a model call embedded in a
non-orchestrator module turns model-unavailability — a slow provider, a rate
limit, an outage, an out-of-credit key under **pay-as-you-go** — into a
*system-wide* failure. Rendering the tree, computing a capability's status, or
opening the studio must not be able to fail because a model is unreachable.
Confining every model call behind one orchestrator-driven boundary keeps the
failure local: a node's pi run can fail without taking observability, the
schema, or the UI down with it. This is the v1 ADR-0003 invariant carried
forward — the *goal* (structural isolation of the model surface), not the dead
claude-subprocess mechanism.

`packages/pi-adapter` is the **project-owned thin wrapper + typed event
parser** over pi's stream: it spawns/steers pi (`prompt`/`steer`/`followUp`),
normalizes pi's lifecycle event stream and `edit`-tool diffs into the typed
**events** `packages/core` defines, and exposes nothing model-shaped upward. No
third-party agent framework sits in the runtime path — consistent with ADR-0001
rejecting Mastra/LangGraph/ADK *as the engine*; community wrappers are reference
reading, not dependencies (carried from v1 ADR-0008/ADR-0026). To stay robust,
the adapter depends only on pi's **documented** surface
(`prompt`/`steer`/`followUp` + the lifecycle event stream), never on
undocumented pi internals; the deeper code-vs-judgment split lives in ADR-0005.

**Run is not node.** A story or capability is a *coordination* unit — a node on
the tree. A pi run/attempt against it is an *execution* event, recorded in the
event store, **many-per-node, never a new node** (carried from v1 ADR-0006: the
execution environment is not the coordination structure). The adapter emits run
events against an existing node; it never mints tree nodes. This keeps the tree
small while runs fan out freely against it.

**The orchestrator is the sole fan-out point.** Code (the orchestrator over
DBOS) schedules nodes; a pi node runs leaf work and does **not** schedule child
nodes — there is no agent-spawns-agent path. This is justified by v2's
architecture (control-flow belongs to the spine, per ADR-0005), **not** by the
dead Claude-Code "Task-is-blocked" quirk that v1 ADR-0003 originally cited. The
quirk is gone; the invariant stands on its own footing.

## Alternatives considered

- **Let `apps/studio` call pi directly** for in-IDE chat/steering (the obvious
  shortcut, since the studio *drives* agents per ADR-0001). **Rejected**: it
  reintroduces exactly the failure this ADR exists to prevent — the UI would go
  down when a model is unreachable, and a second model-invocation surface would
  drift from the orchestrator's. The studio drives agents by sending **commands
  to the orchestrator** (the events-out / commands-in wire protocol, deferred in
  ADR-0001); the orchestrator alone turns those into pi calls through the
  adapter. The UI↔agent control loop itself is ADR-0008.
- **Depend on a third-party agent framework's runtime** (Mastra/LangGraph/etc.)
  as the adapter. **Rejected** (consistent with ADR-0001): once pi owns the
  per-node loop, a framework adds maintenance surface and cedes authority over
  the typed-event contract `packages/core` owns, while adding no reliability
  property the in-tree wrapper lacks.
- **A `verify`/gate path that consults a model** to judge whether a unit is
  proven. **Rejected**: proof must rest on recorded **evidence** (red→green
  contract events, a signed UAT), never on a fresh model opinion — otherwise the
  **prove-it-gate** is defeated and unavailability could block promotion. The
  shape of those proof events is ADR-0006/ADR-0007; here we only fix that the
  judgment is model-free.

## Consequences

**Gained.** Model-unavailability is a *local* failure of one node's run, never a
system outage: the schema, the gate, the event projection, and the studio all
run with no model runtime. One audited model surface (the adapter) instead of
scattered call sites that drift. The package graph makes a stray model import in
`core`/`studio` a structural error, not a code-review catch.

**Paid.** Every model-touching capability — including the studio's in-IDE
steering/chat — must route through the orchestrator rather than calling pi
inline; that is one extra hop and a wire-protocol message (ADR-0001) instead of
a direct import. This is the deliberate cost of keeping the boundary clean.

## What this does NOT decide

- **The per-node agent-spec / role taxonomy.** v1 ran a multi-agent persona
  cascade (Curator/Inspector/QA-Engineer/`build-rust`…) with per-agent
  `contract.yml` spec files. v2 collapses a node onto a **single pi session**,
  so a node is driven by a pi prompt template, not a persona set. If any per-node
  spec file survives at all, it is named neutrally (**never `contract`** — that
  word is the leaf-test tier in ADR-0002) and is stack-neutral. The remaining
  question — does any such spec survive, and under what name — is recorded in
  `open-questions.md` (decomposition / node-driving), not invented here.
- **The pi-event → typed-event mapping itself** (which pi lifecycle events
  become which `core` event types, and how a contract test or a capability UAT
  is expressed as pi prompts/runs). That mapping is load-bearing rather than a
  thin shim and is decided in ADR-0006 (event store) and ADR-0007 (proof model).
- **The code-vs-model-judgment discriminator** (what the spine sequences vs what
  a pi session decides): ADR-0005.
- **The wire protocol** between studio and orchestrator (events out / commands
  in) — deferred in ADR-0001, still open.

## References

- ADR-0001 — pi as the per-node agent; thin custom orchestrator; studio as the
  driving UI; no framework as the engine.
- ADR-0002 — story / capability / contract; the `contract` tier name this ADR
  protects.
- ADR-0003 (v2) — the reversal ledger: records claude-subscription-subprocess →
  pi + API keys as settled, and declares v1's "subscription-auth" ban
  dead/inverted (v2 is API-key-based via pi).
- ADR-0005 — the orchestration spine (code owns control-flow; pi owns leaf
  judgment); the documented-surface-only constraint and no-nested-spawn rule.
- ADR-0006 — the event store and the pi-event → typed-event mapping the adapter
  produces.
- ADR-0007 — the proof model the model-free gate enforces.
- ADR-0008 — how the studio drives agents (through the orchestrator).
- `docs/glossary.md` — canonical definitions (event, gate, prove-it-gate,
  verdict, evidence, studio).
- v1 corpus (`C:\code\Agentic`), `docs/decisions/`:
  - ADR-0003(v1) — the original layering invariant (AI-free product libraries;
    single agent-invocation surface) this ADR carries forward in pi terms, and
    whose Claude-Code "Task-blocked → no agents-spawn-agents" *rationale* is
    superseded (the conclusion survives on a new footing).
  - ADR-0006(v1) — the sandbox-is-not-the-tree / run-vs-node separation.
  - ADR-0008(v1), ADR-0026(v1) — own-a-thin-wrapper-over-the-agent-runtime;
    depend only on the documented surface.
