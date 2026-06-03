# ADR-0005: Orchestration spine — code owns control-flow, pi owns leaf judgment

## Status

proposed

## Date

2026-06-04

## Context

ADR-0001 settled the runtime — a thin custom orchestrator over **pi**, with
durable execution on **DBOS/Postgres** — and framed DBOS narrowly, as
"crash-safe parallelism". That undersells what DBOS is *for*. It is also the
**control-flow substrate**: the place where the sequencing of work lives. This
ADR makes the rule for what that code sequences versus what it delegates to a
model.

The v1 corpus (Agentic) learned this lesson the expensive way and wrote it down
in **ADR-0026** (deterministic orchestration spine). v1's default was to hand a
whole multi-step cascade to a single in-session agent that self-drove the
sequence — the control-flow of "run step A, then B, loop until green" lived in
an LLM's head, re-derived on every run. That is the right shape for *open-ended*
work where the next step needs judgment the corpus cannot pre-compute. It is the
wrong shape for the large class of cascades that are **deterministic and
known-in-advance**: there, delegating the *sequencing* to a model pays for
judgment that is not needed, and forfeits three things storytree cannot give up —
**reproducibility** (the same cascade can sequence differently run-to-run),
**observability** (control-flow buried in a transcript instead of recorded as
discrete typed events — and observability-first is non-negotiable here, ADR-0001),
and **cost** (an outer model spends tokens narrating a sequence a `for` loop
expresses — and v2 is pay-as-you-go, so those tokens are now metered, not free).

storytree inherits exactly this split, one stack-generation later. This ADR
carries ADR-0026's discriminator forward verbatim and restates its
"documented-surface-only" guard in pi terms. It does not re-decide the runtime
(ADR-0001), the orchestrator/agent boundary (ADR-0004), or where work runs
(ADR-0009); it decides who owns the *routing*.

## Decision

**The orchestrator (TypeScript code over DBOS workflows) is the spine; a pi
session's own model loop is the leaf.** The spine owns code-sequenced
control-flow — the order steps run in, when a loop iterates again, which branch
is taken. A pi session owns the judgment *inside* a step: what to write, how to
satisfy a contract, when a UAT walkthrough is met. Per ADR-0001, pi already owns
everything inside a node; this ADR draws the matching line on the outside —
**code sequences the nodes, the model does not.**

**The discriminator (carried verbatim from v1 ADR-0026):**

> If a `for` loop or a `match`/`switch` could express the routing, the spine
> (code) owns it. If the routing needs the model to decide what comes next, a pi
> leaf step owns it.

This is a property of the **control-flow**, not of the work. The same node may
have a code-sequenced outer loop (the spine: "re-run the build step until
contracts are green or the budget is spent") wrapping a pi leaf step whose every
keystroke is judgment. The two coexist — the spine does not replace the model's
judgment, it confines it to the leaves and sequences around it.

| Concern | Owner | Mechanism |
|---|---|---|
| Order of steps in a known cascade | spine | DBOS workflow (code) |
| Loop-until-green / loop-until-budget | spine | code loop over a typed terminal event |
| Branch on a validated step result | spine | `match` on a typed value |
| Fan-out / fan-in across the DAG | spine | DBOS durable queues (see ADR-0009) |
| *What* to write to satisfy a step | pi leaf | the pi session's own model loop |
| "What should happen next?" when only a model can say | pi leaf | a pi session, surfaced for steering (ADR-0008) |

**Depend only on pi's documented surface.** The spine drives pi through its
**documented** control surface — `prompt` / `steer` / `followUp` — and observes
it through its **lifecycle event stream** (the same stream `packages/core`'s
event types are sourced from; see ADR-0006). The spine MUST NOT depend on
undocumented pi internals — transport framing, private process wiring, or any
surface pi does not commit to. This restates ADR-0026's documented-surface guard
(v1 anchored it to an undocumented bidirectional stdin schema it refused to
deepen) in pi terms: a brittle dependency on an agent runtime's internals is a
liability the spine pays for on every upstream release. All pi interaction is
mediated by the **pi-adapter** (ADR-0004); the spine talks to the adapter, never
to pi's raw transport.

**A per-node budget is a first-class spine concept.** A code-sequenced node loop
terminates on **one of two** conditions: the node's proof is met (green), **or**
a per-node iteration/cost budget is exhausted. Budget-exhaustion is a typed
terminal event in the event store, not a silent stall, and per-iteration cost is
visible there. This **inverts** v1's posture: ADR-0010 retired the iteration
budget on the principle that "cascade rounds are not a cost" — sound only under a
flat-rate subscription. v2 is **pay-as-you-go** (ADR-0001), every pi round is
metered, and an unbounded loop is now a runaway bill. The budget is resurrected
as a deliberate consequence of that reversal (recorded in the ADR-0003 reversal
ledger). The exact terminal-event vocabulary (alongside *succeeded* / *crashed* /
*gate-refused*) is owned by ADR-0006's event schema; this ADR fixes only that a
budget ceiling exists and is code-enforced by the spine.

**The spine is code, not a second agent.** It is a library primitive the
orchestrator calls — a DBOS workflow sequencing pre-declared steps — not a
persona, prompt, or role. A pi node cannot *be* part of the spine, because the
spine is code; a pi node runs leaf work and does not schedule child nodes.
(ADR-0004 owns that single-fan-out-point rule and justifies it from v2's
architecture; this ADR relies on it.)

## Consequences

**Gained.** Deterministic cascades become **reproducible** (code sequences them
the same way every run), **observable** (each step is a discrete typed event, not
a buried transcript span — feeding the event store ADR-0006 makes the SSOT), and
**cheaper** (no outer model spends metered tokens narrating a fixed sequence).
The documented-surface guard keeps the pi-adapter (ADR-0004) shallow and
upgrade-stable. The budget ceiling makes pay-as-you-go safe by construction.

**Paid.** Every cascade is now a **boundary call**: does this routing need
judgment, or is it a `for` loop? The discriminator above is the rule, but the
cost of a wrong call is real — spine where judgment was needed yields a rigid
cascade that cannot adapt; a model loop where a `match` would do yields an
under-reproducible, more expensive one. This is a live decision the orchestrator
authors make per cascade, and the discriminator is what they apply.

**De-risked already.** ADR-0001's DBOS durable-concurrency spike — crash-safe,
collision-free workflow IDs across a kill-mid-run — is the spine's foundation
working: code-sequenced control-flow that survives a crash is exactly what a
durable workflow buys. The spine is that workflow shape made the default for
known cascades.

## Alternatives considered

- **Keep all cascades model-delegated (v1's status quo).** Rejected. A
  deterministic, known-in-advance sequence does not need a model to *sequence* it
  — only to *execute* its leaves. Code-sequencing is cheaper, reproducible, and
  observable; the model-driven shape stays correct only for the open-ended work
  it was built for, which is why pi leaves still own judgment. This is coexistence,
  not replacement.

- **Adopt a third-party orchestration framework for the control-flow.** Rejected,
  consistent with ADR-0001 (Mastra / LangGraph / ADK rejected as the engine) and
  v1 ADR-0026's own-the-wrapper posture. Such a framework drives the same agent
  runtime underneath and adds no reliability property a thin DBOS workflow lacks
  once the pi-adapter's event parser is typed, while imposing a maintained
  external surface and ceding authority over our control-flow contract. The DBOS
  spine is hand-rolled; external patterns are reference reading, not dependencies.

- **No per-node budget; let a node loop until it converges (v1 ADR-0010).**
  Rejected for v2. "Cascade rounds are not a cost" held under a flat subscription;
  under per-token billing an unbounded loop is an unbounded bill. The budget is
  the pay-as-you-go-correct default.

## What this does NOT decide

- **The terminal-event vocabulary and the event schema.** *That* a node
  terminates as green / budget-exhausted / crashed / gate-refused is fixed here;
  the typed event names, envelope, and the pi-lifecycle → typed-event mapping land
  in ADR-0006 and `packages/core`.
- **The concrete budget unit and default ceiling** (iterations? tokens? wall
  cost? a blend) and how the operator sets or overrides it — an orchestrator
  detail, surfaced through the studio per ADR-0008.
- **Fan-out / fan-in scheduling, isolation, and ID allocation** across concurrent
  nodes — owned by ADR-0009 (DBOS durable queues over the shared Postgres store).
  This ADR fixes only that the spine — not a pi node — is where that scheduling
  lives. The surviving shape of v1's session/claims primitives is tracked in
  `open-questions.md` §3.
- **The studio↔orchestrator wire protocol** (events out / commands in) and whether
  the event vocabulary adopts OTel GenAI conventions — open, per ADR-0001 and
  `open-questions.md` §8. The documented-surface guard above constrains the
  *pi-facing* boundary only.

## References

- **v1 ADR-0026** (`C:\code\Agentic\…\docs\decisions\0026-deterministic-rust-orchestration-spine.md`)
  — the deterministic-spine decision, the discriminator, and the
  documented-surface guard carried forward here (v1 anchored it to an undocumented
  stdin schema; restated in pi terms).
- **v1 ADR-0010** — retired the iteration budget on "cascade rounds are not a
  cost"; **inverted** here for pay-as-you-go.
- **v1 ADR-0020** — code-owned control-flow over agent work lives in a library
  function the orchestrator calls, never in a writer-class agent; the spine is
  that shape one level lower.
- **ADR-0001** — the stack (thin orchestrator over pi, DBOS/Postgres, no
  framework; pay-as-you-go; the durable-concurrency spike).
- **ADR-0003** — the v1→v2 reversal ledger; records the budget inversion.
- **ADR-0004** — pi only via the pi-adapter; orchestrator is the sole fan-out point.
- **ADR-0006** — the event store and the typed terminal-event vocabulary deferred to.
- **ADR-0009** — concurrency, isolation, and ID allocation (the scheduling the spine drives).
- `docs/glossary.md` — `story`/`capability`/`contract`, `event`, `studio`, `gate`
  used as defined there.
