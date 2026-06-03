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
*Terms:* evidence, red-state / red-evidence, green-evidence, attestation, signer,
executor, signing & walk-ancestry, forensic-evidence.

## 2. Brownfield mapping mechanism  (concept ACCEPTED; mechanism TBD)
`mapped` is now a supported v2 status (see `glossary.md`). **Open** is the
*mechanism*: how storytree maps an existing target-repo suite onto
capabilities/contracts under pi, what "observational-green" means operationally,
and how fixtures/models are version-pinned.
*Terms:* brownfield, observational-green, mapped-vs-proven, MappedStatus,
fixture-pin.

## 3. Sessions, isolation & concurrency
v1 coordinated concurrent work with per-session git branches
(`session/<ts>-<purpose>`), per-writer worktrees, a cross-session `claims` table
(refuse on conflict), and a 3-primitive CrossSessionCoordination substrate
(identity / claims / channel). **Open:** v2's concurrency is DBOS-based (validated
in the spike). Which of these survive — is there still an explicit claims /
branch-isolation layer, or do DBOS + per-node pi sessions replace it?
*Terms:* session branch, branch-per-session isolation, worktree-isolation, claims,
session-claims, CrossSessionCoordination.

## 4. Decomposition workflow
v1 had a pre-implementation loop (investigator → story-writer → review, converging
to a stable DAG before any unit goes red), under ~6 names. **Open:** does v2 have
an analogous decomposition/convergence loop before capabilities are built? If so,
name it once.
*Terms:* decompose-before-implement (loop), convergence-loop, decomposition.

## 5. Communication surface — channel / post  (awaiting decision)
v1: a per-story prose **noticeboard** (`channels/<id>/`) with individual **posts**
(author / timestamp / references), used for async cross-session notes. **Open:**
fold into the studio's **per-node chat** (a node's thread = its channel, each
message a post), or keep as a separate persistent annotation board distinct from
live chat?
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

## 7. A grouping tier above stories — "epic"?
ADR-0002 left open whether a 4th tier (an "epic" over stories) ever returns. v1 had
epics (`epics/`).

## 8. Misc / infrastructure
- **project** — v1's target codebase under `projects/` that the harness builds
  against but does not own. v2's target-project model is open (today storytree
  builds itself).
- **wire protocol** — the studio↔orchestrator events-out / commands-in protocol is
  undecided (ADR-0001). v1's was a "phone-line shape": NDJSON over stdio.
- **OTel GenAI conventions** — v1 used them for trace-SaaS interop; v2 owns its
  event store (no trace SaaS), so adoption is open.
