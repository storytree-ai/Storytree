# ADR-0003: The v1→v2 reversal ledger

## Status

proposed

## Date

2026-06-04

## Context

storytree v2 is a clean-room rebuild of the v1 system (the **Agentic** corpus,
`C:\code\Agentic`, ADRs 0001–0028). ADR-0001 and ADR-0002 settled the new
stack and the work hierarchy; `docs/glossary.md` imported the surviving v1
vocabulary and `docs/open-questions.md` parked the deferred decisions. What is
still missing is a single place that accounts for **every** v1 ADR — so that no
prior decision silently vanishes, and so the reversals already made are recorded
as *closed* rather than re-litigated later as if open.

This ADR is that ledger. It does three jobs and no more:

1. **Names the four settled reversals** v1→v2 as decided, not open conflicts.
2. **Dispositions all 28 v1 ADRs** in one table, each pointing to where (if
   anywhere) its durable principle now lives.
3. **Absorbs the low-value supersessions** — dead secret-handling, SWE-bench,
   and packaging machinery — as one-line principle-notes here, rather than
   spending an ADR on each.

It decides no new mechanism. The principles it carries forward are *operated* by
ADR-0004 through ADR-0009; this ledger only routes them and is the
exhaustiveness backbone the others hang off.

A note on the corpus itself: the v1 ADR namespace is unreliable (a gap at 0009,
two files at 0021, 0021/0023 share a title). That hand-authoring hazard is
exactly the **id**-allocation problem ADR-0009 must also solve for v2's *own*
decision namespace — see `open-questions.md` §3.

## Decision

### The four settled reversals (closed, not open)

These were adjudicated when ADR-0001 chose the stack. They are recorded here as
**supersessions** so no later reader treats them as live debate:

| v1 position | v2 position | Settled by |
|---|---|---|
| Rust workspace (0001) | TypeScript / Node 24 / pnpm | ADR-0001 |
| SurrealDB embedded (0002) | Postgres + DBOS | ADR-0001 |
| Claude subscription via subprocess (0003) | pi + model API keys, pay-as-you-go | ADR-0001, ADR-0004 |
| Managed GCP / SWE-bench plumbing (0015/0017/0018) | local, own-the-loop | ADR-0001 |

Two **non-negotiable v1 principles are explicitly declared dead/inverted**, so
they are never harvested as timeless rules from the old text:

- **subscription-auth** (0003 forbade `--bare` and API-key clients): inverted.
  v2 is API-key-based via pi; the old ban would outlaw v2's own transport.
- **`cascade_rounds_are_not_a_cost`** (0010 retired the per-round budget):
  inverted. Sound only under a flat subscription; under pay-as-you-go every pi
  round is metered, so a per-node cost/iteration budget is *resurrected* in
  ADR-0005.

### Disposition of all 28 v1 ADRs

Disposition codes: **superseded** = settled stack/auth reversal, dead;
**carry-principle** = the decision body is dead but a durable, stack-independent
principle survives and has a v2 home; **inverted** = the principle survives but
v2 takes the *opposite* shape (the decision body is dead-on-arrival);
**obsolete** = dead bench/GCP/packaging machinery, only a minor principle-note
survives. The "v1 'story'" everywhere below is v2's **capability** (per the
glossary's v1→v2 map).

| v1 ADR | Disposition | Durable principle → v2 home |
|---|---|---|
| 0001 Rust rebuild | superseded | compile-enforced boundaries / invalid-states-unrepresentable → `packages/core` (Zod discriminated-union **lifecycle**) + ADR-0006 (only the event store writes a state transition) |
| 0002 SurrealDB embedded | superseded | persistence behind one swappable interface → `packages/orchestrator` store abstraction over Postgres/DBOS (noted in ADR-0006) |
| 0003 Claude-subscription subprocess | superseded | only the orchestrator may spawn an agent; product/UI/core run model-free → ADR-0004. *subscription-auth ban: dead/inverted.* |
| 0004 No bootstrap generator | obsolete | no-generated-glue / single-canonical-spec → ADR-0004 §consequences. The `.claude/agents` bridge and the `manifest.yml`/`contract.yml` agent-spec name are dead; whether any per-node spec survives → `open-questions.md` §4 |
| 0005 Red-green is a contract | carry-principle | TDD enforced **structurally**; red-before-green is **forensic evidence, not a promotion gate** → ADR-0007 (relocated to the **contract** level per 0027; ordering orchestrator-enforced, not agent-role-split) |
| 0006 Sandboxed hardening loop | carry-principle | sandbox ≠ tree (a run is an event, never a node) → ADR-0004; cold-rebuild reproducibility → ADR-0007; human-outer-loop → ADR-0008. Docker/squash-merge/phase-ladder mechanism dead |
| 0007 Stories consume assets | carry-principle (deferred) | cross-cutting knowledge as referenced, reciprocity-checked entities → no v2 home yet; deliberately deferred (`open-questions.md` §9). Note: v1 `asset` ≠ v2 `asset` (sprites) |
| 0008 Mock/UAT seam + own wrapper | carry-principle | mocks fine at contract-test, forbidden at UAT (the **mock-UAT seam**) → ADR-0007; own a thin agent wrapper, no third-party SDK → ADR-0004 (`packages/pi-adapter`) |
| 0010 In-sandbox orchestrator | superseded | orchestrator owns fan-out → ADR-0004; spine sequences, leaf judges → ADR-0005. *`cascade_rounds_are_not_a_cost`: dead/inverted → budget resurrected in ADR-0005* |
| 0011 Forum staging surface | carry-principle (deferred) | **verification-wins over recency-wins** (reject Dreams-style consolidation) → durable stance; learning-loop has no v2 home yet (`open-questions.md` §5). Stop-hook/transcript ingest dead |
| 0012 Host credential bridge | obsolete | verify-fresh / zero-residual / secret-store-reference-not-plaintext → security principle-note (below). DPAPI/OSCrypt bridge dead |
| 0013 Branch-per-session isolation | carry-principle (reshaped) | exclusive isolated working surface per concurrent writer; re-enter trunk only through a gate → ADR-0009 (per-node DBOS workflow + shared Postgres, **not** git worktrees) |
| 0014 Gate signing-walk ancestry | carry-principle | a merge gate is minimum-permissive + load-bearing content invariants + **never-bypass** → ADR-0008. The ancestry-walk built for auto-merge is not a clean import |
| 0015 Orchestrator-in-container (SWE-bench) | obsolete | **benchmark the system, not the model** → deferred docs-note (below). Per-instance Docker / synthetic-story-from-FAIL_TO_PASS dead |
| 0016 Credential daemon = mirror | obsolete | strict-single-use refresh ⇒ pure-mirror pass-through → security principle-note (below). Daemon dead |
| 0017 Deployment-filter | obsolete | VCS-exclusion vs deployment-exclusion are different semantics → packaging docs-note (below). `.dockerignore`/host-only machinery dead; a source of the `deployment` overload to avoid |
| 0018 Cloud Run Jobs substrate | superseded | bursty + bounded-parallel + zero-idle-cost ⇒ per-task isolation beats a long-lived daemon → echoed by DBOS durable queues (ADR-0009). GCP substrate dead |
| 0019 OAuth-token env var | superseded | env-var-over-file credential precedence (minor) → security note. Dead `sk-ant-oat01-` auth |
| 0020 Decompose-before-implement | carry-principle (deferred) | converge the **dependency** DAG to a fixed-point before any unit goes red → ADR-0007 (names the *DAG-stabilisation* sense of convergence, distinct from cold-rebuild) + `open-questions.md` §4 (the loop itself stays open) |
| 0021 Secret Manager (tracked) | superseded | secrets via store-reference, not plaintext in a persisted spec → security note (below). GCP Secret Manager dead |
| 0021 cc-extension (untracked orphan) | inverted | same content as 0023; an ID-collision artifact. → ADR-0006 + ADR-0008 (with 0023) |
| 0022 Cross-session coordination | carry-principle (reshaped) | scope/write-conflict detection as a **hard gate before work**; typed enforcement separate from prose → ADR-0009 (claims as Postgres rows; channel → `open-questions.md` §5). identity/claims/channel were workarounds for the missing shared store v2 has by default |
| 0023 cc-extension observability surface | **inverted** | observability-first: agent activity flows into a typed event store through defined channels → ADR-0006. The *body* is dead-on-arrival: v1's UI is a **read-only sidecar** reading a `runs` table from Claude-Code hooks/OTel and **rejects pi by name** — v2 inverts to an embedded IDE that **drives** agents over pi's stream (ADR-0006, ADR-0008) |
| 0024 UAT-exempt / manual_signings | carry-principle | a third **operator-attested** proof mode for surfaces with no honest UAT and no isolated test → ADR-0007 (manual_signings carried forward as a typed signed event; **overrules** 0028-D16's retirement) |
| 0025 Origin-aware ID allocation | carry-principle | **id** allocation must be concurrency-safe by construction; the *landed-but-unseen* collision class a claims-gate cannot catch → ADR-0009 (DB-allocated, dissolving both classes; closes the gap 0028-D9 left open). Same discipline extends to the ADR namespace |
| 0026 Deterministic orchestration spine | carry-principle | code owns **closed** control-flow, the model is confined to leaf steps; depend only on the agent's documented surface → ADR-0005 (the for-loop/match-vs-model discriminator carried verbatim, restated in pi `prompt`/`steer`/`followUp` terms) |
| 0027 Contract-proof model *(draft)* | superseded | proof-mode-as-boundary, UAT-generated edges, red-green-relocated-to-contract → **ADR-0002** (accepted) + ADR-0007. 0027's *story* = v2 **capability**; 0027's *epic* = v2 **story**; 0027's *contract* = v2 **contract** |
| 0028 V2 fresh-tree seed *(draft)* | superseded (re-adjudicated) | the v1-side seed register → ADR-0002/0007/0009. **Overruled:** D11 (kept "contract" as the sub-unit → v2 uses **capability**), D16 (retire 0024 → v2 keeps operator-attested), D9 (in-process ID race "out of scope" → ADR-0009 makes allocation atomic) |

### Absorbed supersessions (no separate ADR)

Three clusters of dead machinery survive only as principle-notes, recorded here:

- **Secret-handling** (0012/0016/0019/0021-tracked): the durable stance is
  *verify-fresh at launch · secret-store-reference, never plaintext in a
  persisted spec · zero-residual · strict-rotation ⇒ mirror, not refresh*. It
  becomes a security note for v2's own model-API-key handling via pi. **None**
  of the DPAPI/OSCrypt/credential-daemon/GCP-Secret-Manager mechanisms port, and
  the v1 record is internally contradictory about the live auth path — so no
  part of it is carried as *the answer*.
- **SWE-bench / evaluation** (0015): *benchmark the orchestration system, not
  the underlying model — exercise the full path*. A deferred evaluation note for
  when v2 benchmarks itself; the container/synthetic-story plumbing is dead.
- **Packaging** (0017): *version-control exclusion governs history;
  deployment-layer exclusion governs a runtime artifact — host-local-data /
  universal-behaviour content belongs in tracked source, filtered at deploy*.
  A low-priority packaging note; also flags the `deployment` term-overload the
  glossary should keep disambiguated.

## Consequences

**Gained.** A complete, one-glance audit of v1: every ADR is either dead with a
reason, or alive with a named home. The four reversals and two inverted
principles are on the record as *closed*, so they are not silently re-imported.
The two highest-stakes inversions — the read-only-sidecar → driving-IDE flip
(0023→ADR-0006/0008) and the no-budget → metered-budget flip (0010→ADR-0005) —
are called out explicitly rather than buried.

**Paid.** This ledger must stay in sync as ADR-0004–0009 land; if a principle's
destination changes, the corresponding row here changes too. That coupling is
the deliberate cost of having a single exhaustiveness backbone.

**Deferred, not dropped.** Three durable v1 capabilities have *no* v2 home yet
and are consciously parked, not deleted: the cross-cutting knowledge tier
(0007), the verification-wins learning loop (0011), and the prose coordination
surface (0022's channel). Each is tracked in `open-questions.md` so it cannot
resurface unplanned.

## What this does NOT decide

- **Any new mechanism.** Every principle's *operation* is decided by its
  destination ADR (0004–0009) or `packages/core`, not here.
- **The undecided sub-questions** the dead ADRs touched: the event vocabulary
  (OTel-GenAI vs bespoke), who signs a UAT promotion, the agent-spec/role
  taxonomy, and the fate of the channel/forum surface all remain open — see
  `open-questions.md` §1, §4, §5, §8.
- **The v2 decision-namespace allocator.** That v2 ADRs themselves need
  concurrency-safe **id** allocation (the lesson 0025 generalised) is flagged
  here but decided in ADR-0009 / `open-questions.md` §3.

## References

- ADR-0001 (the four settled reversals) and ADR-0002 (work hierarchy; supersedes
  v1 0027, re-adjudicates 0028).
- ADR-0004–ADR-0009 — the destinations every carried principle routes to.
- `docs/glossary.md` — the v1→v2 term map ("story" → **capability**, etc.) and
  the canonical definitions used verbatim above.
- `docs/open-questions.md` — §1 evidence/attestation, §3 sessions/concurrency/id,
  §4 decomposition, §5 channel/post, §8 OTel/wire-protocol, §9 cross-cutting
  knowledge — the deferred sub-decisions this ledger points to rather than inventing.
- v1 corpus (`C:\code\Agentic`), ADRs 0001–0028 (gap at 0009; duplicate 0021).
