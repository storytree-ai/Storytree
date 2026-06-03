# ADR-0008: UI drives agents — approval-gated trunk, in-loop steering

## Status

proposed

## Date

2026-06-04

## Context

ADR-0001 set two non-negotiables: deep observability, and **a UI that drives the
agents** (an IDE — diffs, approvals, steering, per-node chat) rather than a
read-only dashboard. This ADR records the **human posture** that follows from
that choice — where the human sits in the loop, and the gates it implies — and
states it as a deliberate **inversion** of v1's autonomous-cascade model.

v1 (the Agentic corpus) ran the opposite posture, in three reinforcing pieces:

- Every agent ran with `--dangerously-skip-permissions` — no in-loop approval of
  individual actions; the agent acted, the human read about it afterwards
  (v1 0006, 0010).
- The trunk was **auto-merge-on-green**: a unit's passing result merged itself
  with **no human review gate**, and `main` was allowed to hold broken
  intermediate states under an explicit eventual-consistency posture (v1 0006).
- A dedicated **escalation-screener** subsystem existed only to *ration*
  agent→human pings during long headless cascades — the human was the scarce,
  interrupt-driven resource the system tried not to bother (v1 0013).

v1 also retired its per-iteration budget on the principle that *"cascade rounds
are not a cost"* (v1 0010) — sound only under a flat-rate subscription.

storytree v2 reverses the premise. The studio is **always watching** and the
human **initiates** contact (steering, approvals, per-node chat); the default is
**go slow, own the layers** (ADR-0001). And v2 is **pay-as-you-go** on per-token
API billing (ADR-0001), so every agent round is metered — the subscription
assumption under v1's "rounds are free" stance no longer holds.

The durable v1 *principle* that survives this inversion is the **outer-loop human
gate**: the inner loop (drive one unit red→green) may be automated, but the outer
loop (accept a result into the trunk, accept a decomposition, amend/retry/abandon
a unit) is held by human judgment — with an explicit rejection of **autonomous
self-amendment** on confirmation-bias grounds, until an independent evaluator is
validated at scale (v1 0006, 0020). v2's UI-drives-agents design is the
*realization* of that gate (the human approves rendered diffs), not its removal.

## Decision

**The studio is the human surface, and it drives the agents.** Four positions:

### 1. Per-action approval is first-class (inverts `--dangerously-skip-permissions`)

The `studio` renders pi's activity live — diffs, `steer`-able runs, per-node
chat — and the human can approve, reject, or steer **individual** agent actions
from inside the loop. This is the direct inverse of v1's
`--dangerously-skip-permissions` posture (v1 0006, 0010). Approval and steering
are **typed events** in the event store (actor = operator), so the human's
interventions are part of the same observability record as pi's own activity
(observability-first, ADR-0001; event grain per ADR-0006).

### 2. Human-in-the-loop at the outer loop (north-star may dissolve it, not day one)

| Loop | What it does | Who holds it |
|---|---|---|
| inner | drive one unit red→green | pi node (automatable) |
| outer | accept into trunk; accept a decomposition; amend/retry/abandon | human, in the studio |

Autonomous **self-amendment** of the tree is rejected for now on
confirmation-bias grounds (v1 0006, 0020): an agent evaluating its own work is
not an independent evaluator. **Self-building is the north-star trajectory** that
*may later* dissolve the outer-loop gate once an independent evaluator is proven
at scale — it is **not a day-one removal**. The studio's approvals *are* the
outer-loop gate in human-driving form.

### 3. The trunk is approval-gated, not auto-merge-on-green (inverts v1 0006 §8)

A capability's green result — contracts green, **UAT** passed (`verdict` = Pass)
— does **not** merge itself. It **surfaces in the studio for human diff-review**,
and lands on the trunk only on approval, recorded as a signed promotion event.
This inverts v1's auto-merge-on-green / `main`-may-hold-broken-states posture
(v1 0006).

The content invariants stay load-bearing and **non-bypassable** — the merge tip
must show its contracts green, its UAT signed, and its upstream healthy; there is
no `--no-verify`-equivalent escape (the never-bypass discipline carried from
v1 0014). What changes from v1 is only the *trunk policy*: a green signal is now
a **request for human approval**, not an automatic merge. (The v1 merge ceremony
and ancestry-walk were built *assuming* auto-merge and are not clean imports; the
concurrency-safe isolation/claim mechanics live in ADR-0009.)

Who signs the UAT promotion was decided three ways across v1 (human-only,
autonomous agent, unspecified). v2 resolves it toward **human approval in the
studio** — consistent with UI-drives-agents — recorded as a signed promotion
event with operator identity. The **operator-attested** proof mode (ADR-0007) is
the narrow, explicit, auditable exception for dogfood-only behavioural surfaces
that have neither an honest UAT nor an isolated test; an agent can never
self-exempt into it. (Identity/attestation backing is open — see
`open-questions.md` §1.)

### 4. Cost is a first-class budget surface (inverts "cascade rounds are not a cost")

Because v2 is pay-as-you-go, v1's *"cascade rounds are not a cost / no
per-iteration budget"* stance (v1 0010) is **explicitly inverted**. Per-token
cost and per-round counts are rendered in the studio as a first-class surface the
human steers against, and a pi node loop terminates on green **or** on
budget-exhausted (a typed terminal event). The budget *mechanism* — the orchestrator
loop bound and its terminal event type — lives in ADR-0005 (the spine); this ADR
fixes only the **posture**: under metered billing, spend is something the human
sees and gates on, not a free externality.

## Alternatives considered

- **Keep auto-merge-on-green, add a dashboard.** Rejected: it is v1's posture
  with a nicer view, and contradicts ADR-0001's *driving* UI and *go-slow*
  defaults. A read-only sidecar over an auto-merging trunk is exactly the
  inverted model (the read-only-sidecar inversion itself is recorded in
  ADR-0006).
- **Day-one autonomous self-amendment** (agent approves its own merges).
  Rejected on the v1 confirmation-bias grounds (v1 0006, 0020). Held as the
  north-star, not the start.
- **A v2 escalation-screener** to ration agent→human interrupts. Rejected as a
  non-goal (below): v2's always-watching, human-initiated studio dissolves the
  premise that human attention is a scarce resource to be gated.

## What this does NOT decide

- **The wire protocol** for events-out / commands-in between studio and
  orchestrator (deferred by ADR-0001; `open-questions.md` §8).
- **The event grain and ingest source** (typed per-event log vs derived
  per-node rollup; pi-adapter as the normalizing source) — ADR-0006.
- **The budget/terminal-event mechanism** (the loop bound, the
  `budget-exhausted` terminal event) — ADR-0005.
- **The attestation/identity model** behind a signed promotion (who/what backs
  operator identity with no single subscription) — `open-questions.md` §1.
- **The concurrency-safe trunk mechanics** (claim/conflict detection, isolation,
  ID allocation) — ADR-0009.
- **Whether v1's prose coordination surface** (channel / noticeboard) folds into
  the studio's per-node chat as typed events or is dropped — `open-questions.md`
  §5.

## Non-goals (consciously deleted, not omitted)

- **The escalation-screener subsystem has no v2 successor.** v1's
  screener agent, its consult-before-pausing discipline, and its four screener
  verdicts existed to ration agent→human pings during *autonomous headless
  cascades* (v1 0013). v2 inverts the direction — the human is always watching
  and initiates contact through the studio — so the gated-surfacing premise
  dissolves. Do not port "escalation-screener" as a node type. Its v1-successor
  question, if any ever arises, can rest in `open-questions.md`.

## References

- ADR-0001 — UI-that-drives-agents, observability-first, go-slow, pay-as-you-go.
- ADR-0005 — the spine: where the per-node budget bound and its terminal event live.
- ADR-0006 — the event store: embedded driving UI vs read-only sidecar; event grain.
- ADR-0007 — the proof model: UAT `verdict`, and the **operator-attested** third mode.
- ADR-0009 — concurrency, isolation, claims, ID allocation on DBOS/Postgres.
- `docs/glossary.md` — `studio`, `gate`, `verdict`, `prove-it-gate`, `event`.
- `docs/open-questions.md` — §1 (attestation/identity), §5 (channel/per-node chat), §8 (wire protocol).
- v1 corpus (`C:\code\Agentic`), `docs/decisions/` — 0006 (auto-merge-on-green,
  outer-loop human gate, confirmation-bias caution), 0008 (mock-UAT boundary),
  0010 (`--dangerously-skip-permissions`, "rounds are not a cost"), 0013
  (escalation-screener), 0014 (never-bypass content invariants), 0020
  (decomposition outer loop). v2 inverts their autonomous-cascade posture while
  carrying the outer-loop-human-gate principle forward.
