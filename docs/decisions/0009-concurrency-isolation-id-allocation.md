# ADR-0009: Concurrency, isolation & ID allocation on DBOS/Postgres

## Status

proposed

## Date

2026-06-04

## Context

ADR-0001 made two claims it did not substantiate: **parallelism from day one**
(concurrent stories, crash-safe state) and **conflict-free story IDs across
concurrent sessions**. It named the cost honestly — "it is exactly the layer v1
got wrong (store-lock races, in-process story-ID collisions)" — and deferred the
mechanism. This ADR is that mechanism. It also collapses the three v1 ADRs most
relevant to v2's concurrency story and, simultaneously, most tied to dead
substrate: 0013 (branch-per-session isolation), 0022 (the identity/claims/channel
coordination substrate), and 0025 (origin-aware ID allocation).

Those v1 mechanisms were all **workarounds for the absence of a shared store**,
and v1's own text says so: ADR-0022 isolated writers with a git branch+worktree
each, kept a per-worktree embedded store (SurrealKV), and moved records between
stores with a bootstrap-on-merge transport — then noted a "future Phase-1 GCP
shared SurrealDB instance ... would close part of this gap," but "the
laptop-local Phase 0 we are in today has no such shared substrate." v2 **ships
that shared substrate by default**: one Postgres event store behind DBOS. Carrying
the primitives forward literally would re-import a workaround for a problem v2
does not have. What carries is the **principle** underneath each; the substrate is
dead (Rust→TS, SurrealDB→Postgres/DBOS, managed-GCP→local-own-the-loop are settled
— see ADR-0003).

Three durable principles survive the collapse:

- **Isolate concurrent writers; no shared mutable write target during active
  work** (v1 0013). The recursive "every parallelism boundary gets the same
  isolation contract" framing carries; the git-worktree *mechanism* does not.
- **Detect write-conflicts as a hard refusal before work begins, not by post-hoc
  discovery** (v1 0022). Typed enforcement records, separate from free-form
  prose coordination. The chip-spawn git gate is dead; the refuse-on-conflict
  posture is not.
- **ID allocation must be concurrency-safe by construction** (v1 0025). v1
  carried *two* collision classes; v2 must dissolve both, which is what backs
  ADR-0001's "conflict-free story IDs" headline.

## Decision

### 1. Isolation = per-node DBOS workflow execution against one shared event store

A node (a story or capability under construction) is worked by a **pi node
session** running inside a **DBOS workflow** (ADR-0005's spine owns the
control-flow; pi owns the leaf judgment). Isolation is the workflow boundary plus
DBOS's durable-queue concurrency caps, **not** a git branch + worktree per
session. There is **one** Postgres event store (ADR-0006), shared by every
concurrent node — the single source of truth that every session reads and writes.

This inverts v1's 0013 substrate. v1 needed branch-per-session *because* the
embedded store was per-worktree and `main` was the only shared surface; isolation
had to be a git construct. With one shared Postgres store, the per-worktree store,
the session branch, and the bootstrap-on-merge transport all dissolve — they were
the price of not having a shared store. The recursive-isolation principle is
honoured by DBOS workflow isolation; the trunk/approval model that governs how a
proven capability *lands* is ADR-0008's concern, not a merge ceremony here.

The git-branch isolation question is not fully closed: whether storytree still
cuts a working branch per node for the *code edits* pi makes (distinct from the
*coordination* surface, which is now Postgres) stays open — see
`open-questions.md` §3.

### 2. Conflict detection = a claim row checked at node-schedule time

Before the spine schedules a node, it records a **claim** — a typed row in the
shared event store naming the write-ownership the node intends — and checks it
against active claims under a serializable/unique constraint. A conflict is a
**hard refusal**, surfaced as a typed `claim-conflict-refused` event, never a
warning. This carries v1 0022's enforcement-first posture (its claim-conflict
refusal was "a refusal, not a warning") while moving the check from **chip-spawn
time** to **node-schedule time** and the storage from a per-worktree
`session_claims` table to the one shared store.

v1 0022 split coordination into three primitives — identity, claims, channel —
because there was no shared store to hold them; v2 collapses all three into the
event store. **Identity** is the event envelope's actor/subject reference
(ADR-0006), not a per-session JSON state file. **Claims** are rows/events as
above. The prose **channel** (v1's per-story noticeboard, deliberately never
machine-parsed) does **not** carry forward as a filesystem surface; whether a
per-node coordination thread survives as typed chat events in the studio, or is
dropped, is open — see `open-questions.md` §5.

The single **write-ownership vocabulary** (v1 spread it across `declared_scope`
vs per-agent `does_not_touch`) is unified to one term here; `packages/core` and
the glossary pin it (returned as a glossary delta).

The branch-isolation and claim-mechanism specifics (claim granularity, whether
ownership is file-glob or node-scoped, conflict-resolution ceremony) stay an
open-question — see §3 below and `open-questions.md` §3.

### 3. IDs are DB-allocated and recorded as a typed allocation event

Every unit ID (story, capability, contract) is **allocated by the database** — a
Postgres sequence, or a DB-generated UUID under a unique constraint — and recorded
as a typed **id-allocated** event (ADR-0006). No process hand-picks "the next free
integer."

This dissolves **both** of v1 0025's collision classes, which is the substantive
upgrade over v1, not merely a restatement:

| Collision class (v1 0025) | v1's catch surface | v2 |
|---|---|---|
| **two-live-unpushed** — two live sessions allocate the same ID, neither landed yet | a claims gate (v1 0022) | a serializable claim/sequence check at allocation — §2 |
| **landed-but-unseen** — the winner already merged; no live claim exists | a claims gate **structurally cannot** catch this; only reading the shared SSOT *at allocation time* does (v1 0025) | the allocation **is** a write against the shared SSOT — there is no stale local base to read |

v1 needed a `git fetch`-at-allocation hack (`agentic story new` reading
`max(local, origin/main)`) precisely because allocation read a stale local
directory and the winner's claim had released at merge. With one shared Postgres
store there is no stale base: an atomic sequence or unique constraint is, by
construction, a read of the live SSOT at allocation time. This is exactly the gap
ADR-0001 banner-claimed and v1 left open (and that the v1-seed draft 0028 had
declared "out of v2 scope").

### 4. The same allocation discipline covers v2's own ADR-number namespace

v1 0025 observed that "the same discipline covers ADR ids" — ADR collisions are
the same class as story collisions, "one allocation discipline covers both number
spaces." v1 still hand-authored ADRs under concurrent sessions and paid for it:
the corpus has **two ADR-0021s and a phantom 0009 gap** (this file occupies that
gap), born of exactly the hand-picked-next-integer race §3 dissolves for runtime
IDs.

**v2 runs that same risk today** — these very ADRs (0003–0009) are being
hand-authored under concurrent sessions. So the allocation discipline extends to
the decision namespace: storytree adopts a concurrency-safe scheme for its own ADR
numbers (a checked allocator that reads the shared trunk before claiming an
integer, or ULID/timestamp-ordered ADR filenames in place of hand-picked
integers). The exact scheme is a process choice recorded against
`open-questions.md` §3, not a runtime contract; the principle — **no
hand-picked-next-integer for any allocated namespace, runtime or governance** —
is the decision.

## Alternatives considered

- **Carry v1's branch-per-session + per-worktree store forward as-is.** Rejected.
  v1 0022's own text says these primitives exist only because there was no shared
  store; v2 has one. Re-importing them re-creates a Phase-0 laptop workaround on
  a substrate that obviates it, plus the bootstrap-on-merge cross-store sync, for
  no benefit.
- **Keep a `git fetch`-at-allocation guardrail for IDs (v1 0025's mechanism).**
  Rejected as unnecessary: that guardrail patched a *stale local base*, and a
  shared Postgres allocation has no local base to be stale. The principle it
  served (read the live SSOT at allocation) is satisfied structurally.
- **Optimistic ID allocation, reconcile collisions after the fact.** Rejected. It
  re-creates the landed-but-unseen class as routine and contradicts ADR-0001's
  "concurrency-safe from the start" posture. A unique constraint is cheap and
  total.

## Consequences

**Gained.** v2's headline concurrency claim is substantiated end-to-end:
isolation is the DBOS workflow boundary over one shared store; conflict detection
is an enforced claim check at schedule time; ID allocation is atomic against the
live SSOT, dissolving *both* v1 collision classes rather than one. Three v1 ADRs
(0013, 0022, 0025) collapse into one mechanism with far less surface — no
per-worktree stores, no bootstrap-on-merge transport, no `git fetch` allocation
hack, no three-primitive coordination substrate. The same discipline hardens v2's
own ADR namespace against the two-0021/phantom-0009 races that scar v1.

**Paid.** We own the claim-check and allocation logic on top of DBOS/Postgres
primitives (serializable checks, unique constraints, durable queues) — the
deliberate "own the layer v1 got wrong" cost ADR-0001 accepted. A single shared
store is now a correctness-critical dependency (its availability and isolation
level gate concurrent work); that is the same trade ADR-0001 made choosing
Postgres over an embedded per-worktree store.

## What this does NOT decide

- **Whether code edits get a working branch per node.** Coordination is now
  Postgres; whether pi's *file edits* still use a git branch/worktree per node is
  open — `open-questions.md` §3.
- **Claim granularity and the write-ownership scope shape** (node-scoped vs
  file-glob vs surface-pattern), and the conflict-resolution ceremony when a claim
  is refused. `open-questions.md` §3.
- **Whether a per-node coordination thread survives** (typed studio chat events vs
  dropped) — the fate of v1's `channel`/`post`. `open-questions.md` §5.
- **The exact ADR-namespace allocation scheme** (checked allocator vs
  ULID/timestamp filenames). A governance-process choice, recorded against
  `open-questions.md` §3.
- **Sequence vs UUID** for runtime IDs, and the event envelope's exact fields —
  these land with the `packages/core` event schema (ADR-0006).
- **The trunk/landing model** for a proven capability — ADR-0008 (approval-gated
  trunk), not a merge ceremony here.

## References

- ADR-0001 — the unsubstantiated "parallelism from day one" + "conflict-free
  story IDs" claims this ADR backs; the "own the layer v1 got wrong" cost.
- ADR-0003 — the v1→v2 reversal ledger (SurrealDB→Postgres/DBOS,
  managed-GCP→local) these collapses rest on.
- ADR-0005 — the spine (code/DBOS owns control-flow; pi owns leaf judgment); the
  node session this isolation wraps.
- ADR-0006 — the shared event store; the typed `id-allocated`,
  `claim-conflict-refused`, and lifecycle events this ADR emits; identity as the
  event envelope's actor/subject reference.
- ADR-0008 — the approval-gated trunk that governs how a proven capability lands
  (replaces v1's merge ceremony).
- v1 corpus (`C:\code\Agentic`): `docs/decisions/0013-*` (branch-per-session
  isolation — reshaped), `0022-*` (identity/claims/channel substrate — reshaped;
  its own text names the missing shared store v2 ships), `0025-*` (the two
  collision classes — carried; landed-but-unseen vs two-live-unpushed),
  `0014-*` (the lazy-not-malicious threat model and never-bypass gate posture
  behind the enforcement-first stance).
- `docs/open-questions.md` §3 (sessions/isolation/claims), §5 (channel/post).
- `docs/glossary.md` — the canonical definitions these terms resolve to.
