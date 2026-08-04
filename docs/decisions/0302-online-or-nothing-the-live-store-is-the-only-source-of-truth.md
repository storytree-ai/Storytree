---
status: accepted
load_bearing: true
supersedes: [114]
decided: 2026-08-04
arc: session-decoupling-arc
---
# ADR-0302: Online or nothing: the live store is the only source of truth and offline support is dropped

## Status

accepted (2026-08-04) — decided/directed by the owner in conversation on 2026-08-04. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

ADR-0300 recorded ~1:1 re-syncs to landings and named its own falsification condition. Split by day
that ratio is not a steady state: Aug 1 — 20 sessions, 18 PRs, 5 re-syncs (0.28); Aug 2 — 27, 23, 7
(0.30); Aug 3 — 44, 34, 40 (**1.18**). Sessions rose 63% and landings 48% while re-syncs rose 471%.
Interference is superlinear in concurrency, and "1:1" was a quiet day averaged with a thrashing one.

A concurrency cap was proposed and **rejected by the owner**, correctly: the system is divided into
story nodes precisely so work can run in parallel, and burst-approval is not a defect but the only
shape available to an owner with a full-time job. That forced the question of where the coupling
actually is.

Every re-sync merge commit on `main` since 2026-08-01 was diffed for what it forced the branch to
absorb. Excluding `docs/research` (bulk additive dumps nobody collides on), 1,308 file-changes:
`packages/**` 47.6% · `apps/**` 14.1% · `docs/decisions/` 13.9% · root files 8.5% · **`stories/`
5.2%** · repo config 4.2% · `knowledge.json` 3.4% · CLAUDE.md + lockfile 2.7%. The single most
re-absorbed file is `apps/studio/data/knowledge.json` — **1.2 MB, touched by 67 commits in 4 days,
re-absorbed 45 times** — then CLAUDE.md (17), `package.json` (15), `packages/cli/src/commands.ts`
and `friction.ts` (13 each).

So the story-node division is working and the contention moved. The 2026-07-31 audit measured
ADR-0270 capability-grain claims running everywhere with **zero real refusals**. A claim owns a node
in the DAG; a git branch is a snapshot of the whole repo; nothing claims the second object. A session
re-reading `main` is not reading a sibling's work — it is discovering that its own toolchain moved.

The hot surface splits in two with opposite answers. The **data** half is already live-canonical in
Postgres (ADR-0023): the committed seed is an *export of a database that is already the source of
truth*, so it pays repo-contention costs for data with no business in the repo. Worse, an entire tier
of machinery exists only to police that mirror — `check:corpus-content`, `check:corpus-sync`,
`check:agents-sync`, the export ceremonies, ADR-0290's drift-by-authorship attribution, the
`SEED_SCOPE_KINDS` list. The **code** half (`packages/cli`, 264 changes) cannot go in a database to
avoid conflicts and is ADR-0304's problem, not this one's.

What the seed was earning: offline reads (CI is DB-free; every read command works on the in-memory
seed) and reviewable git history for guidance changes. The owner has now directed that offline
support be dropped outright — *"we go all in on on-line and drop the need for offline work, db online
or nothing"* — and has paid for it explicitly in the same conversation (24/7 database, CI
credentials).

## Decision

**D1 — the live store is the only source of truth, and no committed file mirrors it.**
`apps/studio/data/knowledge.json` stops being a per-commit repo surface. Where a materialised corpus
is still wanted it is a *generated artifact* (built on demand or per release), never a file every
session rewrites. The seed↔live export ceremony ends with it.

**D2 — offline is dropped as a supported mode.** The Cloud SQL instance runs **24/7**: ADR-0114's
fixed 01:00–07:00 Australia/Sydney sleep window is retired and both Cloud Scheduler jobs are removed
from `infra/cost-backstop.tf`. Under online-or-nothing that window would otherwise become a nightly
total outage of CI, the gate, every read command, and the owner's own night approval bursts.

**D3 — CI holds a database credential.** CI stops being DB-free; the DB-dependent checks *run* there
instead of skipping. This retires the class of local-only reds that repeatedly blocked every session
on the dev box while CI showed green.

**D4 — the mirror-policing machinery is deleted, not left inert.** Every check that exists only to
reconcile the committed seed against the live store goes when the mirror goes. A check kept but
neutered is the failure mode this decision must not produce.

**D5 — what stays on disk, and why this is not a contradiction.** The harness-native guidance
surfaces — CLAUDE.md, AGENTS.md and `.claude/agents/*` — remain committed files, because the harness
reads them at session start *before any tool can run* and therefore before any database is reachable.
They remain generated projections of the store; their regeneration churn is a smaller, separate
problem and is explicitly **not** solved here.

## Consequences

**Good.** The hottest file in the repo stops existing as a contention surface, and a whole tier of
gate rungs retires with it. CI and local runs finally measure the same thing, so "green in CI, red on
my machine" stops being a standing condition. The corpus gains a single writer path, which removes the
direction-inference problem that made seed↔live drift so expensive to adjudicate.

**Bad, and accepted.** CI now has a hard dependency on the database: when Postgres is down, nothing
lands. A standing GCP credential in GitHub Actions (Workload Identity Federation) is new
outward-facing infrastructure and new attack surface. Running Cloud SQL 24/7 costs roughly a third
more instance-hours than the 18/24 window the cost backstop was built to enforce; the owner accepted
this explicitly.

**The prerequisite this decision creates, and it is load-bearing.** Remote sessions (Claude Code on
the web) **structurally cannot** open a Cloud SQL connector — client-mTLS cannot survive the agent
proxy's TLS re-termination (ADR-0250/0258), and this is not routable around. They work today *only
because reads are offline*. Under D1/D2 a remote session would be able to read nothing at all. So
**ADR-0259's `HttpStore` + wire contract must be deployed and wired before D1 lands**, not after: it
exists in `packages/storage-protocol`, held to the same parity suite as the Postgres store, but is
currently wired to no caller and no server. Sequencing D1 ahead of it would silently kill remote
sessions. This is the one ordering constraint in the arc.

## References

- `session-decoupling-arc` — the owning arc, carrying the full measurement.
- ADR-0023 — the library tier is live-canonical; the seed is an export.
- ADR-0114 — the fixed nightly sleep window this retires.
- ADR-0120 / ADR-0263 / ADR-0290 — the seed↔live export ceremony and its authorship attribution.
- ADR-0250 / ADR-0258 — why a remote session cannot reach Cloud SQL, and why no tunnel exists.
- ADR-0259 — `HttpStore` and the wire contract; a prerequisite, per Consequences.
- ADR-0300 — staleness instrumentation; this ADR attacks the coupling that instrumentation cannot remove.
- ADR-0304 — the code half of the same problem.
- `infra/cost-backstop.tf` — the two Cloud Scheduler jobs D2 removes.
