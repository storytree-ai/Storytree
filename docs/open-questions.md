# Open questions — deferred vocabulary & decisions

Captured from the v1 → v2 vocabulary import (2026-06-03; see `glossary.md` for the
*decided* vocabulary). These are v1 concepts whose v2 form is **not yet decided**.
This file is a backlog and a seed for future ADRs — it is **not** authoritative
terminology.

## 1. Evidence & attestation model
v1 persisted proof as committed JSONL evidence (`*-red.jsonl` / `*-green.jsonl`)
plus signed `uat_signings` rows, a four-tier `signer` identity chain, and a
"signing & walk-ancestry" gate (accept any signing for a commit reachable from
HEAD). **Open:** how does v2 persist proof in a DBOS-event, model-agnostic world —
events vs files? Is there a `signer` / `attestation` concept, and what identity
backs it with no single human/subscription?
→ Partially addressed by ADR-0003 (routes Agentic ADR-0024's
operator-attested/`manual_signings` principle to ADR-0007 and the never-bypass-gate
principle to ADR-0008) and ADR-0006 (proof/forensic events — red/green, UAT
promotion signing, operator-attested — originate **in the event store**; how they
persist and the identity model deferred here). ADR-0007 introduces the
**operator-attested** signed event but states v1's committed-JSONL +
`uat_signings` shape does **not** carry, leaving the events-vs-files persistence
and the attestation **identity** open here (v2 form lands with the ADR-0006 event
schema). ADR-0008 §3 settles the *promotion* act — UAT promotion is a **human
approval in the studio** recorded as a signed promotion event with operator
identity — narrowing the residual to: **what identity backs the operator
signature** with no single human/subscription, and whether there is an explicit
signer/attestation type. **Still open:** persistence shape + identity backing.
*Terms:* evidence, red-state / red-evidence, green-evidence, attestation, signer,
executor, signing & walk-ancestry, forensic-evidence.

## 2. Brownfield mapping mechanism  (concept ACCEPTED; mechanism TBD)
`mapped` is now a supported v2 status (see `glossary.md`). **Open** is the
*mechanism*: how storytree maps an existing target-repo suite onto
capabilities/contracts under the owned loop, what "observational-green" means operationally,
and how fixtures/models are version-pinned.
→ ADR-0007 reaffirms this stays open while distinguishing **operator-attested**
(earned, reaches `healthy`) from **mapped** (observational, never `healthy`); the
mapping *mechanism* remains undecided here.
*Terms:* brownfield, observational-green, mapped-vs-proven, MappedStatus,
fixture-pin.

## 3. Sessions, isolation & concurrency
v1 coordinated concurrent work with per-session git branches
(`session/<ts>-<purpose>`), per-writer worktrees, a cross-session `claims` table
(refuse on conflict), and a 3-primitive CrossSessionCoordination substrate
(identity / claims / channel). **Open:** v2's concurrency is DBOS-based (validated
in the spike). Which of these survive — is there still an explicit claims /
branch-isolation layer, or do DBOS + per-node owned-loop sessions replace it?
→ Largely resolved by ADR-0009: **claims survive** as typed rows/events in the
**one shared Postgres store** (not a per-worktree `session_claims` table), checked
at node-schedule time as a **hard refusal**; v1's 3-primitive
CrossSessionCoordination substrate collapses into the shared store; **DBOS
workflow isolation replaces branch-per-session for coordination**; DB-allocated
ids dissolve both Agentic ADR-0025 collision classes. Framed by ADR-0004 (an owned-loop
**run** is an execution event, many-per-node; the **orchestrator** is the sole
fan-out point — no agent-spawns-agent) and ADR-0005 (the **spine**, not an owned-loop node,
owns fan-out/fan-in scheduling; explicitly defers isolation/claims/id allocation
here; ADR-0011). ADR-0003 also notes concurrency-safe id allocation must extend to v2's
**own ADR/decision-number namespace** (the ADR-0025 generalisation; motivated by
v1's two-0021 / gap-0009 collisions). **Still open:** (a) whether the owned loop's code
*edits* still use a git branch/worktree per node; (b) claim granularity /
**write-ownership** scope shape; (c) the conflict-resolution ceremony on refusal;
(d) the concurrency-safe scheme for v2's own ADR-number namespace.
→ **(a) reframed by [ADR-0012](decisions/0012-tool-execution-pluggable-sandbox.md)**: tool
execution (the owned loop's `bash`/edits — pi is dropped, ADR-0011) runs behind a pluggable
`ToolExecutor` **sandbox seam** — a *borrowed* backend (virtual / git worktree / container),
distinct from ADR-0009's DBOS coordination isolation; the concrete backend stays deferred to
need.
*Terms:* session branch, branch-per-session isolation, worktree-isolation, claims,
session-claims, CrossSessionCoordination.

## 4. Decomposition workflow
v1 had a pre-implementation loop (investigator → story-writer → review, converging
to a stable DAG before any unit goes red), under ~6 names. **Open:** does v2 have
an analogous decomposition/convergence loop before capabilities are built? If so,
name it once.
→ ADR-0003 routes Agentic ADR-0020's decompose-before-implement principle to
ADR-0007, and ADR-0007 §4 explicitly **splits `convergence`** into two senses
(glossary): the **cold-rebuild** sense (an authoring guideline, not a gate; ADR-0010
§6) vs the **DAG-stabilisation** sense (driving the capability graph to a
fixed point before any contract goes red), assigning the latter to this section's
decomposition/convergence loop + the scheduler. **Still open:** whether v2 has the
loop at all, and its name.

**Node-driving / agent-spec taxonomy.** ADR-0004 records that **no** v1 multi-agent
persona cascade (Curator / Inspector / QA-Engineer / build-rust) survives — a node
is driven by a **single owned-loop prompt template**. **Open:** whether any *neutral
per-node spec file* survives and under what name — it must **never** be called
`contract` (that noun is the leaf tier; see glossary). Captured so it is not
silently re-invented; ADR-0004 points here rather than deciding it.
*Terms:* decompose-before-implement (loop), convergence-loop, decomposition,
agent-spec / per-node spec, persona cascade.

## 5. Communication surface — channel / post  (awaiting decision)
v1: a per-story prose **noticeboard** (`channels/<id>/`) with individual **posts**
(author / timestamp / references), used for async cross-session notes. **Open:**
fold into the studio's **per-node chat** (a node's thread = its channel, each
message a post), or keep as a separate persistent annotation board distinct from
live chat?
→ Consciously **parked, not dropped**: ADR-0003 marks Agentic ADR-0022's channel
and ADR-0011's forum/learning-loop as durable-but-homeless, and folds in the
agent-spec/role taxonomy question (Agentic ADR-0004's dead `manifest`/
`contract.yml`) as deferred here too. ADR-0008 establishes the studio's **per-node
chat** as a first-class, human-initiated driving surface (so it is now an *assumed*
studio surface) but explicitly defers the fold-in, strengthening the
"fold channel/post into per-node chat" option. ADR-0009 explicitly does **not**
carry v1's prose channel forward as a **filesystem noticeboard** (collapsing it out
of the coordination substrate). ADR-0006 would carry per-node-chat as a typed event
type **if** this resolves toward typed events. **Still open:** whether the v1 prose
noticeboard collapses into per-node chat as typed events, or stays a separate
persistent board.
*Terms:* channel, post, story-channel / noticeboard, forum / staging surface,
brief.

## 6. Scheduling & navigation lenses  (recommended to adopt)
v1 dashboard lenses that look genuinely useful for the v2 scheduler / studio:
- **frontier** — not-yet-proven units with no unproven ancestor (the actionable
  work-front).
- **blast_radius** — downstream-impact metric (immediate + transitive descendants)
  for "fix this first".
- **selector grammar** — dbt-style DAG selection (`<id>`, `+<id>`, `<id>+`,
  `+<id>+`).
- **staleness** — proof predates a declared file edit.
- **era** — terminal head of a `superseded_by` chain.

**Open:** adopt which, and where (scheduler logic vs a studio view)?

**Per-round cost budget (pay-as-you-go).** → Partially resolved by ADR-0005: a
**code-enforced per-node budget** exists and a node's spine loop terminates on
**green OR budget-exhausted** (a typed terminal event with per-round cost in the
event store), inverting v1 ADR-0010's "cascade rounds are not a cost". **Still
open:** the concrete budget **unit** (iterations / tokens / wall-cost) and the
default ceiling. (See glossary **per-node budget**.)

## 7. A grouping tier above stories — "epic"?
ADR-0002 left open whether a 4th tier (an "epic" over stories) ever returns. v1 had
epics (`epics/`).

## 8. Misc / infrastructure
- **project** — v1's target codebase under `projects/` that the harness builds
  against but does not own. v2's target-project model is open (today storytree
  builds itself).
- **wire protocol** — the studio↔orchestrator events-out / commands-in protocol is
  undecided (ADR-0001). v1's was a "phone-line shape": NDJSON over stdio.
  → Its **existence/direction** is now pinned: ADR-0004 fixes that the studio
  drives agents by sending **commands to the orchestrator** (which alone turns them
  into owned-loop calls via `packages/agent` — the studio never calls the owned loop directly), and
  ADR-0005's documented-surface guard constrains only the **owned-loop-facing** boundary,
  explicitly leaving this protocol open. ADR-0008 adds that the protocol must carry
  **operator commands** (approvals, steering, per-node chat) — i.e. it is
  **bidirectional**, not emit-only. **Still open:** the concrete shape (v1's
  NDJSON-over-stdio).
- **OTel GenAI conventions** — v1 used them for trace-SaaS interop; v2 owns its
  event store (no trace SaaS), so adoption is open.
  → ADR-0006 records this as the open sub-decision for the **event store's
  vocabulary** (OTel-GenAI-where-practical vs a bespoke owned-loop vocabulary): v1 0006 §5
  chose OTel-GenAI for trace-SaaS interop, but v2 owns its store with **no SaaS**,
  so adoption is no longer forced. ADR-0003 points here when noting the inverted
  observability stack (Agentic ADR-0023) leaves the event vocabulary undecided.
  **Still open:** OTel-GenAI vs bespoke.
- **escalation-screener — deliberately deleted (no v2 successor).** ADR-0008's
  Non-goals consciously remove v1's escalation-screener subsystem: the
  always-watching, agent-driving studio dissolves its ration-the-interrupts
  premise. Recorded here so it is **not re-imported later as an oversight**; the
  v1-successor question can rest here only if the need ever resurfaces. Not an open
  decision — a noted deletion.

## 9. Cross-cutting knowledge / shared-content tier  (awaiting decision)
v1 modelled shared, cross-cutting content as first-class **asset** entities under
`assets/` that stories **referenced** (Agentic ADR-0007, "stories consume assets"),
with reciprocity-checked links so a consuming story and a consumed asset stayed
mutually aware (a DRY surface for content reused across stories). **Open:** does v2
have any equivalent tier for cross-cutting knowledge — referenced,
reciprocity-checked entities shared across capabilities — or does the single shared
event store plus per-node guidance make a dedicated shared-content tier
unnecessary?
→ Consciously **parked, not dropped**: ADR-0003 marks Agentic ADR-0007's
cross-cutting-knowledge principle as durable-but-homeless (it has **no v2 home
yet**). **Term collision:** v1's `asset` (shared DRY content under `assets/`) does
**not** carry — `glossary.md` redefines `asset` as tree/game art for the isometric
renderer, so there is no glossary anchor for the v1 shared-content sense; this
section is its only home. **Still open:** whether the cross-cutting-knowledge tier
returns at all, and under what (non-`asset`) name.
*Terms:* asset (v1 shared DRY content), cross-cutting knowledge, referenced entity,
reciprocity check, consume / consumes.
