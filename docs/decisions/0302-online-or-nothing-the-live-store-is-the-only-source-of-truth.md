---
status: accepted
load_bearing: true
supersedes: [114, 263]
amends: [120, 290]
decided: 2026-08-04
arc: session-decoupling-arc
---
# ADR-0302: Online or nothing: the live store is the only source of truth and offline support is dropped

## Status

accepted (2026-08-04) — decided/directed by the owner in conversation on 2026-08-04. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amended by ADR-0311 (2026-08-05):** the three mirror-policing tombstones in D4 remain part of the
complete gate audit. The two live-store drain ceilings later armed under D3 are now retired from
root/CI policy; `check:guidance` and `check:agents` remain the live-store gate consumers and run late.

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
*(As landed 2026-08-05: `infra/cost-backstop.tf` is deleted OUTRIGHT rather than emptied — with both
jobs gone, its `sql-stopper` service account and that account's `roles/cloudsql.editor` binding had
no remaining purpose, and leaving an identity behind that can stop the instance would have been
orphaned privilege. Nothing else in the repo used Cloud Scheduler.)*

**D3 — CI holds a database credential.** CI stops being DB-free; the DB-dependent checks *run* there
instead of skipping. This retires the class of local-only reds that repeatedly blocked every session
on the dev box while CI showed green.

**D4 — the mirror-policing machinery is deleted, not left inert.** Every check that exists only to
reconcile the committed seed against the live store goes when the mirror goes. A check kept but
neutered is the failure mode this decision must not produce.

*(As landed 2026-08-05, D4 in full and D1 in part — read the split precisely, because D1 is NOT
finished. **DELETED:** `check:agents-sync` / `check:corpus-sync` / `check:corpus-content` and their
three gate rungs (the plan is 25 steps → 22), the `library sync-agents` / `sync-corpus` /
`export-corpus` commands, `sync-agents.ts` / `sync-corpus.ts` / `export-corpus.ts` /
`sync-drain.ts` / `corpus-content-drain.ts` / `corpus-content-attribution.ts` / `seed-revisions.ts`
with their suites, and `SEED_SCOPE_KINDS` — ~3,850 lines. The excision was clean exactly as
increment 3 measured: no hidden dependents, and the only outward repairs were a stale remedy line in
`check:surface-coverage` and a deny-list entry in `orientation-tools`. **MOVED:** `build:guidance`
and `build:agents` now read the LIVE store through `packages/cli/src/corpus-store.ts`, which fails
loudly rather than falling back — a generator that silently read a stale corpus would report "in
sync" while reverting a live edit. Both were proved to render the committed projections
byte-identically from live, which is the evidence that the two surfaces genuinely agreed. CI's
`verify` acquires the ADR-0302 D3 credential right after `pnpm install` (setup, not a check) so
those two rungs remain in CI. ADR-0311 later moves them to the late shared-state block. **NOT YET DONE, and this is the honest remainder:**
`apps/studio/data/knowledge.json` is still on disk. Nothing writes it and no production path treats
it as canonical, so the CHURN this decision targeted is gone — but ~23 test files, the CLI's offline
read path, `check:process-graph`, `check-surface-coverage`, the desktop's inline `loadCorpus` clone
and the studio's JSON backend still read it, and it stays as a declared frozen fixture until they are
re-homed. The OTHER seed remainder is now closed: `apps/studio/data/seed-kinds/uat-criterion/` held
70 detail artifacts of which 52 existed in no other place, so it was a MIGRATION rather than a
deletion — the 52 were created in the live store, the 18 already-present ids were left untouched
after their proof-bearing fields verified byte-identical, and the directory was deleted on 2026-08-05
(ADR-0307 D5). The live tier now holds **74**, not 70: the seed and the store had each carried rows
the other did not, so re-measuring rather than trusting the inherited 70/22/52 figures is what kept
the migration from deleting four live-only artifacts. `apps/studio/data/knowledge.json` is the one
remainder still parked on the arc.)*

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

**Bad, and accepted.** CI gains a hard dependency on the database: when Postgres is down, nothing
lands. Running Cloud SQL 24/7 costs roughly a third more instance-hours than the 18/24 window the
cost backstop was built to enforce; the owner accepted this explicitly.

*(Historical implementation note, 2026-08-05 — D2 and D3 landed together in #1146; arming
`check:friction-drain` and `check:arc-proposal-drain` was a separate later step using explicit
`STORYTREE_DB_REQUIRED`. ADR-0311 retires both rungs and their CI arming. The broader D3 decision that
CI may hold the live-store credential remains current because `check:guidance` and `check:agents`
still consume the live Library and fail rather than silently reading a stale source.)*

*Arming was correctly withheld until it was safe. It required the owner to have run BOTH `terraform
apply` (D2's scheduler-job removal) and the widened `infra/apply-ci-presence-grants.ts`: without the
grants the CI service account could not read `events.library_artifact` at all, and #1146's own
`verify` proved exactly that, printing `SKIP — live DB not reachable (permission denied for table
library_artifact)` — armed, that would have redded the PR and every one after it, on an instance no
session could fix. Both owner steps were applied and verified in the cloud on 2026-08-04 (scheduler
jobs destroyed; `SELECT` granted on `events.library_artifact` / `events.library_event`). `ci.yml` was
then armed as a coherent PAIR: `STORYTREE_DB_REQUIRED: '1'` on both live-store steps, AND
`continue-on-error: true` dropped from the `verify` job's GCP auth step — once a skip is no longer
acceptable, an unauthenticated runner must not look like a pass either. So "when Postgres is down,
nothing lands" is now literally true of every PR, with no bypass short of a `hold` label or a draft
PR. `infra/ci-presence.md` carries the mechanics.)* *(Corrected in place
2026-08-04 under ADR-0139: this paragraph also called a standing GCP credential in GitHub Actions
"new outward-facing infrastructure and new attack surface". That is **false for this repo** and was
overstating D3's cost. `infra/ci-presence.tf` already runs a `github-actions` Workload Identity
Federation pool, an OIDC provider, the `storytree-ci-presence` service account with
`roles/cloudsql.client` + `roles/cloudsql.instanceUser`, and the repo-scoped impersonation binding —
and `ci.yml`'s `automerge` job authenticates through it and writes to Cloud SQL on **every merged
PR** today. D3 adds no IAM, no pool and no secret. The genuine remaining costs are narrower and are
recorded here instead: the SQL grants must widen — `ci-presence-grants.sql` is scoped to
`events.node_claim` / `events.claim_event` only, so the SA cannot read `events.library_artifact` —
and that widening needs an owner run as schema owner. And because the WIF binding is scoped by
**repository, not ref**, any PR branch can already impersonate that SA; today that buys delete-rights
on claim rows, but once grants widen it would buy corpus reads. Narrowing to a ref condition or a
second read-only SA is the mitigation, and it is not taken here.)*

**The ordering this decision creates, and it is load-bearing.** *(Corrected in place 2026-08-04 under
ADR-0139. This paragraph previously named remote-session reachability as "the one ordering constraint
in the arc" and required ADR-0259's `HttpStore` to be deployed before D1. The owner then descoped
remote sessions from this arc — "claudecode remote shouldnt be in scope for this, the focus really
should be on moving the hot surfaces to the db", ranking it "not a priority, its only a nice to have"
— so that constraint is **dissolved by decision**, not by the work. The door was built, deployed and
proved anyway in PR #1140, and the remaining credential question moved to `remote-session-access-arc`.
The real ordering, established by measurement the same day, is below, and it is not the one this
paragraph used to state.)*

**D2 → D3 → D1 → D4, and the intuitive order is wrong.** D1 removes the seed, which is what the
guidance generators read; `check:guidance` and `check:agents` run in CI, so those generators must
reach the live store from a CI runner — which is D3. And D3 depends on D2, because the
`storytree-ci-presence` service account holds no wake role: with ADR-0114's 01:00–07:00 window still
in place, every overnight PR would red on an instance CI cannot start. So the piece that looks
safest to start with (D3) has to wait for D2, and D1 goes last but one. Two consumers additionally
cannot follow the generators onto the live store at all — the `UserPromptSubmit` definition hook and
`storytree doctor`'s `seedReadable` probe, both of which run before tooling or credentials exist;
[ADR-0307](0307-the-agent-tier-goes-live-canonical-the-committed-seed-stops.md) D4 draws that line
and settles the one *decision* D1 was blocked on, leaving migration only.

## References

- `session-decoupling-arc` — the owning arc, carrying the full measurement.
- ADR-0023 — the library tier is live-canonical; the seed is an export.
- ADR-0114 — the fixed nightly sleep window this retires.
- ADR-0120 / ADR-0263 / ADR-0290 — the seed↔live export ceremony and its authorship attribution.
- ADR-0250 / ADR-0258 — why a remote session cannot reach Cloud SQL, and why no tunnel exists.
- ADR-0259 — `HttpStore` and the wire contract. Was a prerequisite; no longer, per Consequences —
  built and deployed in PR #1140, with the credential half on `remote-session-access-arc`.
- [ADR-0307](0307-the-agent-tier-goes-live-canonical-the-committed-seed-stops.md) — supersedes
  ADR-0055 so the `agent` tier stops being seed-canonical; the last decision D1 was blocked on.
- `infra/ci-presence.tf` / `infra/ci-presence-grants.sql` — the WIF plumbing D3 reuses, and the
  narrow grants it must widen.
- ADR-0300 — staleness instrumentation; this ADR attacks the coupling that instrumentation cannot remove.
- ADR-0304 — the code half of the same problem.
- `infra/cost-backstop.tf` — the two Cloud Scheduler jobs D2 removes. Deleted 2026-08-05; recover the
  prior content from git history if a scheduled stop is ever re-decided.
- `packages/cli/src/db-required.ts` — the `STORYTREE_DB_REQUIRED` policy D3's implementation needed
  and this ADR did not settle; see the Consequences implementation note.
