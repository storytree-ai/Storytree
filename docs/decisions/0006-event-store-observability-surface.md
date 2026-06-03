# ADR-0006: The event store — pi-stream-sourced typed events, an embedded driving UI

## Status

proposed

## Date

2026-06-04

## Context

ADR-0001 set two non-negotiables — **deep observability** and a **UI that
drives the agents** — and named an **event store** as "the single source of
truth for observability (pi events + orchestrator events)", rendered by an
embedded studio with "no external trace product in the loop". This ADR makes
that surface concrete: what the event store *is*, what feeds it, what it
renders, and at what grain. `packages/core`'s event schema (ADR-0001:91,
deferred) then encodes the result.

This is the load-bearing observability decision, and it is the one place where
v1 must be **inverted**, not carried. v1 settled this surface across
ADR-0006/0021/0023 (Agentic), and every structural choice there is now wrong:

- v1's Tree UI was a **read-only sidecar** — a separate browser tab on
  `localhost` that *read* the `runs` table and trace blobs, "**NOT embedded** in
  Claude Code" (v1 0023 §4). storytree's studio is the inverse: an embedded IDE
  that **drives** agents (ADR-0001).
- v1 ingested via **Claude-Code hooks + Claude's OTel export**, parsed by a
  Claude-shaped `ClaudeEvent` NDJSON reader (v1 0023 §1, v1 0006 §3). storytree
  has no Claude harness; its agent is **pi** (ADR-0001).
- v1 §7 rejected **"pi" by name** ("No competing harness — no Pi / Aider /
  OpenHands…"). pi *is* storytree's load-bearing runtime.
- v1's persistence layer was a single `runs` table — named `runs` in v1
  0006/0023 but `test_runs` in v1 0022, and defined at **two incompatible
  grains**: per-*build* (one row per story build, v1 0006 §5) versus per-*event*
  (one row per hook/tool-call, v1 0023). Two names, two cardinalities, one word.

What **survives** is the principle, stated in ADR-0001 as observability-first:
*agent activity flows into a typed event store through defined channels, and a
state change that is not a renderable typed event does not exist.* The decision
body around it is dead.

## Decision

**The event store is the single source of truth for state; the studio renders it
and drives the agents through it.** Four parts.

### 1. Single source of truth, fed only by defined channels

Every state change is a typed **event** (glossary). The event store — a table in
the shared Postgres backing DBOS (ADR-0001), reached through the orchestrator's
own store boundary (carried from v1's Store-trait discipline) — is the *only*
authority for "what is true". No state lives solely in a log file, a pi process,
or studio memory: if it is not an event, it does not exist.

Exactly two ingest channels feed it:

| Channel | Source | Normalized by |
|---|---|---|
| Agent activity | **pi's lifecycle event stream + `edit`-tool diffs** | `packages/pi-adapter` |
| Control-flow | **orchestrator** (DBOS workflow steps: schedule, gate, lifecycle writes) | the orchestrator itself |

There is **no Claude-Code hook channel, no Claude OTel exporter, no MCP server,
and no external trace SaaS** — the three v1 ingest mechanisms are gone with the
Claude harness. `packages/pi-adapter` is the **sole** translation surface from
pi's vocabulary into storytree events (consistent with ADR-0004's rule that pi
is reached only through the adapter); `packages/core` and `apps/studio` never
parse a pi stream directly.

### 2. Split the grain v1 conflated — a per-event log under a per-node rollup

v1's `runs`/`test_runs` mess is resolved by **splitting the two grains it
fused**:

- **the event log** — a typed, append-only record, **one row per state change**.
  This is the SSOT the studio renders and the only thing written. Mint a fresh
  name; do **not** import `runs` or `test_runs`.
- **the node rollup** — current status and latest **verdict** per
  story / capability / contract, **derived as a projection** over the event log,
  never hand-maintained. The lifecycle status on a capability (glossary:
  `proposed` / `building` / `healthy`, with `unhealthy` *computed*) is exactly
  such a projection — it is read off the log, not written beside it.

This is the observability-first discipline made structural: the rollup can always
be rebuilt by replaying the log, so the two can never silently disagree the way
v1's per-build and per-event readings of `runs` did.

### 3. The studio renders the store **and** drives the agents

The studio (glossary) is an **embedded, bidirectional** IDE, not a sidecar: it
projects the event log into the live DAG, per-node history, and diffs (events
*out*), and it issues approvals, steering, and chat (commands *in*) that the
orchestrator turns into pi `steer`/`followUp` calls and new orchestrator events.
The full UI-drives-agents posture — approval-gated trunk, in-loop steering — is
ADR-0008's subject; this ADR fixes only the half that touches the store: **the
rendered surface and the live surface are the same event store**, read one
direction and commanded the other. v1's "render a `runs` table you cannot act on"
is explicitly rejected.

### 4. Typed terminal outcomes, not a single overloaded enum

A pi node run ends in one of a small set of **distinct typed events** —
`succeeded`, `budget-exhausted`, `crashed`, `gate-refused` — rather than v1's
one `outcome` column, which was itself decided two incompatible ways across v1
0006 (`green` / `inner_loop_exhausted` / `crashed`) and its sibling. `budget-exhausted`
is first-class because storytree is **pay-as-you-go** (ADR-0001): under v1's flat
subscription a node could loop without a metered cost, but here every pi round is
billed, so an exhausted per-node budget is a real terminal state the studio must
render. (The budget itself is ADR-0005's concept; this ADR only requires that its
exhaustion is a typed event.)

## The pi-adapter mapping is load-bearing, not a shim

v1's own adjudication (v1 0006 §Alternatives) was that "our story + red-green +
UAT contracts **don't map cleanly** onto" an event-sourced external harness of
pi's family (it named OpenHands). storytree bets `packages/pi-adapter` resolves
exactly that impedance — which makes the mapping a **first-class decision**, not
plumbing. The adapter must define which pi lifecycle events become which storytree
event variants; how a **contract** (one isolated test) and a **capability UAT**
(an integrated walkthrough) are driven as pi prompts/runs and observed back as
proof events; and how **red-green** ordering is *witnessed from pi's stream*
rather than enforced by v1's multi-agent role split. The proof-event side —
red-before-green forensic events, who signs a UAT promotion — is ADR-0007/ADR-0008;
this ADR pins only that those events originate in the store and that the adapter
is the sole producer of pi-derived ones.

## What this does NOT decide

- **The event vocabulary.** Whether the typed events adopt **OpenTelemetry GenAI
  semantic conventions** (v1's deliberate vendor-neutral interop choice, v1 0006
  §5 — *not* Claude-tied) or a bespoke pi-shaped vocabulary is open. storytree
  owns its store with no trace SaaS in the loop, so OTel adoption is no longer
  forced; recorded as a sub-decision in `docs/open-questions.md` §8.
- **The wire protocol** (events out / commands in) and **the exact event-variant
  set and envelope** (event id, timestamp, subject-ref, actor,
  causation/correlation) — deferred by ADR-0001; the envelope lands with the
  `packages/core` event schema, the protocol in `docs/open-questions.md` §8.
- **How proof and attestation persist** as events (red/green forensic events, UAT
  promotion signing, the operator-attested tier) — ADR-0007 / ADR-0008, identity
  model open in `docs/open-questions.md` §1.
- **Whether the prose coordination surface** (v1's per-node channel) becomes a
  typed event type or is dropped — `docs/open-questions.md` §5; concurrency is
  ADR-0009.

## Consequences

**Gained.** One authority for state, fully owned and SaaS-free; a clean
log/rollup split that designs out v1's grain confusion; a studio that is the same
surface for watching and driving; terminal outcomes that distinguish success from
cost-exhaustion from failure, ready for pay-as-you-go.

**Paid.** `packages/pi-adapter` becomes a load-bearing, first-class translation
layer carrying the impedance v1 flagged as unresolved — the headline bet that
storytree examines rather than defers. The rollup-as-projection rule means the
studio reads derived state it must never write, and every layer must route state
changes through events rather than mutating a row directly.

## Alternatives considered

- **Carry v1's read-only sidecar + hooks/OTel ingest forward** (the literal v1
  0021/0023 surface). Rejected — it is built on the dead Claude harness, rejects
  pi by name, and makes the UI unable to drive agents, contradicting ADR-0001's
  two non-negotiables.
- **Keep a single `runs`/`test_runs` table.** Rejected — it is the v1 artifact
  whose two-name, two-grain definition is the defect this ADR exists to fix.
- **Let the studio (or `packages/core`) parse pi's stream directly.** Rejected —
  it scatters the pi-vocabulary dependency across layers; ADR-0004 confines pi to
  `packages/pi-adapter`, which is the only event producer for pi activity.

## References

- ADR-0001 — named the event store and the embedded driving studio; deferred the
  event schema to `packages/core`.
- ADR-0002 / `docs/glossary.md` — `event`, `studio`, `verdict`, lifecycle states,
  `contract` / `capability` / `UAT`, `red-green`, `ndjson` (the terms used here).
- ADR-0003 (reversal ledger), ADR-0004 (pi only via `packages/pi-adapter`),
  ADR-0005 (spine + per-node budget), ADR-0007 / ADR-0008 (proof events,
  UI-drives-agents) — the siblings this store underpins.
- `docs/open-questions.md` §8 (event vocabulary / OTel-GenAI, wire protocol), §1
  (evidence & attestation), §5 (channel/post).
- v1 corpus (`C:\code\Agentic`): inverts ADR-0021 / ADR-0023 (read-only
  cc-extension observability surface) and supersedes the schema clauses of
  ADR-0006 §5 (`runs` table, OTel-GenAI-where-practical) and ADR-0022 (`test_runs`
  naming; the runs-vs-test_runs grain split).
