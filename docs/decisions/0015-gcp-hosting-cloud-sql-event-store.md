---
status: proposed
decided: 2026-06-06
---

# ADR-0015: GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git

## Status

proposed (2026-06-06) — implements the GCP hosting specifics left open by
[ADR-0006](0006-event-store-observability-surface.md) (event store = SSOT) and
[ADR-0009](0009-concurrency-isolation-id-allocation.md) (typed claims + DB-allocated IDs on
shared Postgres). **Supersedes** the cloud thinking in Agentic ADR-0006 (self-hosted
SurrealDB-on-GCE `e2-small`, Phase 0/0.5/1 ladder), which is already withdrawn there.
**Retires** the Vite dev-middleware JSON stopgap (`apps/studio/server/devApi.ts` →
`apps/studio/data/*.json`).

**Correction (2026-06-07) — the "corpus → git" two-tier map is wrong; see
[ADR-0017](0017-cross-cutting-knowledge-tier.md) §2.** This ADR (title + §Context's two-tier
table + §6) placed the artifact corpus in git, shared via the git remote, with per-worktree
divergence "by design." That cannot give parallel sessions/worktrees a shared live state — the
very thing [ADR-0009](0009-concurrency-isolation-id-allocation.md) collapsed git-as-coordination
to avoid, and [ADR-0006](0006-event-store-observability-surface.md)'s node-rollup projection
already puts unit state in Postgres. **Corrected model:** the artifact corpus lives in the
**shared Postgres event store** (as zod-validated JSONB documents; current state = projection,
history = events); **git holds the code and an optional generated markdown view, not the source of
artifact state.** Everything else in this ADR (Cloud SQL choice, keyless auth, DBOS co-location,
stop/start + backstop, cost envelope) stands.

**DBOS co-location (§2) is deferred per [ADR-0019](0019-library-tier-name-and-defer-dbos.md)** — the `dbos` schema stays reserved and `packages/store` has no DBOS dependency; the store is a plain typed Postgres connection now.

## Date

2026-06-06

## Context

The substrate is decided and **not relitigated here**: ONE shared **Postgres** event store as
single source of truth, with **DBOS** (Transact-TS) as a *library* embedded in the orchestrator
process against that same Postgres (ADR-0001 reaffirmation, ADR-0006, ADR-0009). This ADR pins
only the **GCP hosting specifics**: which managed Postgres, how DBOS's durable-execution tables
co-locate, how local / multi-worktree / remote sessions connect, the cost envelope, and the
migration off repo JSON.

Today the studio's entire "backend" is Vite dev-middleware that writes comments and guidance
assets to repo JSON (`apps/studio/data/comments.json`, `assets.json`). It is per-worktree, has
no auth, and is not shared: a comment made in one worktree is invisible in another. That is the
"fake a shared store" pattern ADR-0009 collapses. Nothing on the hosting side is built yet — no
`infra/`, no Terraform, no DBOS/`pg` dependency.

A framing correction that drives the whole decision: **"shared data" is two tiers, and only one
goes to Postgres.**

- **Corpus / definition data** — stories, capabilities, contracts, **and guidance assets** — is
  structured-source, schema-validated, markdown-as-view (ADR-0013). It lives in **git**
  (`HuaMick/Storytree`) and is shared via the git remote. Per-worktree divergence is *by design*
  — different worktrees edit different versions.
- **Runtime / collaboration data** — the event log, the node rollup projection, claim rows,
  DBOS durable-execution state, and **comments/posts** — is the runtime SSOT (ADR-0006/0009). It
  lives in **one Postgres** and is shared via one connection.

The JSON stopgap conflated these (guidance *and* comments both in `data/*.json`). The migration
splits them.

## Decision

### 1. Managed Postgres: **Cloud SQL for Postgres**, not AlloyDB, not a "hosted DBOS"

- **Cloud SQL for Postgres.** Serializable isolation, unique constraints, and sequences — every
  primitive ADR-0009 requires — are stock Postgres. It is first-party, lives in the operator's
  own GCP project, and is VPC-attachable: the **inside-GCP isolation** property Agentic ADR-0006
  demanded when it rejected managed SurrealDB Cloud. Start at **`db-g1-small`** (shared vCPU,
  1.7 GB). `db-f1-micro` (0.6 GB) is too thin for comfortable serializable transactions
  alongside DBOS.
- **AlloyDB — rejected on cost and fit.** No small tier (min ~2 vCPU / 16 GB, ~$300–650+/mo);
  its columnar/HTAP engine targets analytical scale-out this workload (append-only log + one
  rollup projection + claim rows; a single operator + a handful of sessions) will not approach.
  Adopting it would be the inverse of the SurrealDB-Cloud mistake — 10× the envelope for unused
  muscle. Reserved only if the event log later turns analytical, at which point the move is to
  **federate to BigQuery via Datastream**, not to run AlloyDB.
- **"Cloud-Run-hosted DBOS" — a category error, corrected.** DBOS is a *library inside the
  orchestrator process* (ADR-0001 reaffirmation), not a platform to deploy. There is no DBOS
  service to host; there is (a) where Postgres lives and (b) where the Node process embedding
  DBOS Transact runs. Those are separable and decided separately (§4).

### 2. DBOS durable-execution tables co-locate in the same database

One instance, one database (`storytree`), two schemas:

- **`dbos`** — DBOS Transact's durable-execution tables (`workflow_status`,
  `operation_outputs`, queue/notification tables). DBOS creates these from its connection
  string; on Cloud SQL the `cloudsqlsuperuser` role grants the CREATE SCHEMA rights this needs —
  no real superuser is required or requested.
- **`events`** (or `public`) — the append-only event log, the derived node rollup projection,
  claim rows, and ID sequences (ADR-0006 grain split, ADR-0009 claims + DB-allocated IDs).

**Co-location is load-bearing.** Because workflow state and the event store share one database,
the claim-check + ID-allocation + event-append + workflow-step-commit run in **one atomic
serializable transaction**. A separate durable-execution platform (Temporal — rejected in
ADR-0001) or a separate DBOS Cloud would split this across two stores and forfeit the
transactional claim-gate ADR-0009 is built on. The single-database co-location is *why* the
gate is transactional.

### 3. Connection & auth: IAM, no passwords, one connection string

- **Cloud SQL Auth Proxy** (a local sidecar binary) or the **`@google-cloud/cloud-sql-connector`**
  Node connector: IAM-authenticated, TLS, no cert management, no public-IP allowlist.
- **IAM database authentication — no DB password in the repo.** Local dev authenticates with the
  operator's Application Default Credentials (`gcloud auth application-default login`). A future
  Cloud Run executor (§4) attaches a service account with `roles/cloudsql.client` +
  `roles/cloudsql.instanceUser` — zero secrets.
- The only per-session config is the **non-secret instance connection name** (e.g.
  `storytree:australia-southeast1:storytree-pg`; region `australia-southeast1` for interactive
  latency). Every worktree, laptop, and future Cloud Run instance pointing at it converges on the
  one store — **multi-worktree divergence dissolves** for runtime data (corpus still diverges by
  design via git).
- The **browser never holds DB credentials**: studio → orchestrator API → Postgres. The
  dev-middleware becomes a thin proxy to the orchestrator (or the orchestrator serves the API
  directly). The exact studio↔orchestrator wire protocol stays the ADR-0006 open question.

### 4. Compute: orchestrator runs local first, graduates to Cloud Run only when forced

The orchestrator process (DBOS embedded) runs **on the laptop** initially — $0 compute, matching
the "dev on laptop, cloud for headless runs only" posture. Because *all* durable state is in
Postgres, moving the executor to **Cloud Run** later — for scheduled or always-available headless
agent runs — is a **deployment change, not an architecture change**: a fresh container resumes
in-flight DBOS workflows from the same tables. Cloud Run scales to zero and a handful of
sessions/day likely fits its free tier. Cloud compute is not paid for until it is the thing being
proven (ADR-0006 ladder; ADR-0012 borrow-when-needed).

### 5. Cost envelope — **stop/start is the default posture**

- **Cloud SQL is the one irreducible compute cost** — GCP has no scale-to-zero / free-tier
  Postgres (unlike BigQuery's free tier or Cloud Run's), and there is no GCP-native serverless
  Postgres (AlloyDB has no free tier; Spanner is not real-Postgres for DBOS).
- **Default: stop the instance when idle.** `gcloud sql instances stop` bills storage only
  (~$3–5/mo at 10 GB SSD + backups); cold start is ~1–2 min, scriptable via Cloud Scheduler. For
  a single operator running in bursts this is the standing posture — not a fallback lever (owner
  call, 2026-06-06).
- **Upper bound: ~$25–40/mo** if left always-on at `db-g1-small`. Acceptable but not the default.
- All of this sits inside ADR-0006's "$10s/month" envelope. AlloyDB breaches it ~10×.

#### Wake/sleep lifecycle

Stop/start being the default makes the instance's availability part of the runtime, handled in
three pieces:

- **Wake-on-demand — out-of-band of DBOS.** Before connecting, the orchestrator runs an
  `ensureDbUp()` pre-flight: Cloud SQL Admin API `instances.get`; if not `RUNNABLE`, patch
  `activationPolicy=ALWAYS` and poll until it accepts connections (~1–2 min), *then* initialize
  DBOS + the pool. This **cannot be a DBOS workflow step** — DBOS needs Postgres to record the
  very workflow that would start Postgres. It is a bootstrap pre-flight, fired at session/workflow
  granularity (not per request — the cold start rules out request-transparent waking). Whatever
  identity runs it needs `cloudsql.instances.update` (Owner locally; an attached SA with
  `roles/cloudsql.editor` on Cloud Run).
- **Idle-stop — gated on no in-flight work.** The orchestrator is the single chokepoint
  (studio → orchestrator → PG), so it can measure idleness and, after X min with **no
  active/pending DBOS workflows**, stop the instance. Stopping a merely paused-and-durable
  workflow is safe (it resumes on next wake); stopping mid-step is not — hence the gate. (Seam
  now; the orchestrator-internal auto-timer is still deferred — but an **external** idle-stop
  now exists, see the next bullet.)
- **Idle-aware auto-stop — BUILT (resolves the deferred Cloud Function).** A Gen2 **Cloud
  Function** (`storytree-pg-idle-stop`, `infra/idle-stop.tf` + `infra/functions/idle-stop/`),
  fired by Cloud Scheduler every 15 min, stops the instance **only after `idle_minutes`
  (default 480 = 8 h — lengthened from 60 on 2026-06-13, owner call: sessions kept finding
  the instance stopped between same-day bursts; the daily floor still caps a fallow day)
  with zero DB connections** — read from the Cloud Monitoring
  `database/network/connections` metric. While a session / the Auth Proxy holds a connection
  the timer never fires, so it "counts from the last request" and **does not stop an instance
  in active use** (the failure the blunt hourly cron caused, fixed here). It runs under a
  least-privilege `sql-idle-stopper` SA (`roles/cloudsql.editor` + `roles/monitoring.viewer`,
  no key), invoked privately by a scheduler SA over OIDC. Fail-safe: on any error, or when
  metric data is absent (freshly-started instance), it does **not** stop and logs loudly —
  killing a live session because the checker hiccuped is the failure mode being avoided.
  **Update (2026-06-08):** this supersedes the "idle-aware Cloud Function … deferred" note
  below; the deferral is now resolved.
- **Cron backstop — now the DAILY hard floor behind the idle function.** A **Cloud Scheduler**
  job (`storytree-pg-stop-backstop`) forces the instance to STOPPED via the Admin API under a
  least-privilege `sql-stopper` service account (`roles/cloudsql.editor`, no key). It is
  deliberately blunt (unconditional stop) — and stays that way on purpose: a smarter floor that
  shared the idle function's code could share its bug. With the idle function now doing the
  real day-to-day stopping, this cron was **relaxed from hourly to daily** (04:30
  Australia/Sydney, a quiet hour); its sole remaining job is to cap cost at ≤1 day if the idle
  function is itself broken. Validated to stop a running instance, and a benign no-op (logged
  400) when already stopped — now at most once a day, not hourly. See `infra/cost-backstop.tf`.

### 6. Migration off repo JSON

1. **Comments** (`comments.json`) → **typed events** (ADR-0006). The devApi CRUD becomes
   `comment.created` / `comment.resolved` / `comment.deleted` events; the studio renders the log
   (events out) and issues commands (commands in). A one-shot backfill appends a
   `comment.created` event per existing row, preserving `id` / `createdAt` / anchor.
2. **Guidance assets** (`assets.json`) → **structured corpus files** (ADR-0013), validated by
   `packages/core`, markdown-as-view — **not** Postgres. This is §Context's tier split made
   concrete.
3. **Posts + channel** are the broader form of (1) and remain the ADR-0006 open question ("channel
   as a typed event vs dropped"; posts → typed events).

## Alternatives considered

- **AlloyDB for Postgres.** Rejected — see §1. No small tier; HTAP muscle the single-operator
  envelope never uses; ~10× the cost.
- **Neon / Supabase (Postgres-compatible, on GCP Marketplace).** They *do* scale to zero and are
  Postgres-wire-compatible, so adoption is a connection-string swap, not a rewrite. **Rejected
  for now** on the same first-party / inside-GCP-isolation consistency that killed managed
  SurrealDB Cloud in Agentic ADR-0006. Because switching cost is low, this is a cheap decision to
  *defer*, not to agonize over — revisit if the always-on floor becomes the binding constraint.
- **Self-hosted Postgres/SurrealDB on a GCE `e2-small`** (the Agentic Phase-1 shape). Rejected —
  it trades a small managed bill for operator toil (patching, backups, failover, connection
  security) that Cloud SQL provides natively, with no isolation benefit over Cloud SQL in your
  own project.
- **DBOS Cloud / a separate durable-execution platform (Temporal).** Rejected — splits workflow
  state from the event store across two stores, forfeiting the transactional claim-gate (§2) and
  adding a second platform ADR-0001 already declined.
- **Cloud Storage (GCS) as the primary store.** Rejected (owner raised, 2026-06-06). GCS is an
  object store: single-object atomicity + `if-generation-match` only, **no multi-object
  transaction**, so the claim-check + ID-allocation + event-append cannot be one atomic unit —
  reintroducing v1's store-lock races and ID collisions that ADR-0009 exists to kill. DBOS cannot
  run on it. This is the `data/*.json` stopgap with a `gs://` URL. **Right role:** a blob sidecar
  for large payloads (trace dumps, big diffs, generated markdown) with `gs://` pointers from
  Postgres rows — complementary, not a substitute.
- **BigQuery as the primary store.** Rejected (owner raised, 2026-06-06). BigQuery is OLAP, not
  OLTP: PK/UNIQUE constraints are **unenforced** (optimizer hints), so the claim-gate's
  hard-refusal cannot be enforced; DML is batch-latency (seconds, quota'd), wrong for a
  node-schedule claim-check or a live-rendering studio; DBOS cannot use it. **Right role:** the
  analytics sink for the event log, fed from Postgres via **Datastream CDC** — the forward hook
  in §Consequences. System-of-record (Postgres) vs analytics (BigQuery) is the intended split,
  not an either/or.

## Consequences

- **Implements the ADR-0006 / ADR-0009 hosting layer** without touching the substrate: one Cloud
  SQL Postgres, DBOS co-located, claims transactional.
- **Establishes the two-tier "where shared data lives" map** — corpus/guidance in git;
  events/comments/claims/DBOS in Cloud SQL — which clarifies that ADR-0013's structured corpus
  and ADR-0006's event store are *different physical stores*, not one.
- **Retires the JSON stopgap** in `devApi.ts`; the studio reads/writes the shared store via the
  orchestrator instead of per-worktree repo files.
- **Required follow-up:** `infra/` Terraform for the Cloud SQL instance + IAM; the orchestrator's
  Postgres connection (connector + IAM auth); the comments-backfill script; the guidance →
  structured-corpus migration (shared with ADR-0013's migration follow-up).
- **Forward hooks:** event-log → BigQuery via Datastream needs `cloudsql.logical_decoding` (easy
  to enable later); Cloud Run executor needs a Serverless VPC connector only if private IP is
  later chosen over public-IP-with-IAM.

## What this does NOT decide

- The **studio↔orchestrator wire protocol** (ADR-0006 open question) — only that the browser does
  not hold DB credentials.
- The **event vocabulary / schema** for comments-as-events (ADR-0006 open question §8).
- **Comment anchor stability across corpus versions** — the text-quote+offset anchor in
  `devApi.ts` is version-fragile; a pre-existing concern, not introduced or solved here.
- The exact **Cloud SQL edition/tier** beyond "start at `db-g1-small`" — the stop/start posture
  is decided (§5); the tier can still flex with observed load.

## References

- [ADR-0001](0001-foundational-stack.md) (DBOS-as-library in the event-store Postgres),
  [ADR-0006](0006-event-store-observability-surface.md) (event store = SSOT; comments/posts as
  events), [ADR-0009](0009-concurrency-isolation-id-allocation.md) (claims + DB-allocated IDs),
  [ADR-0012](0012-tool-execution-pluggable-sandbox.md) (borrow-when-needed),
  [ADR-0013](0013-structured-corpus-markdown-as-view.md) (structured corpus stays in git).
- Agentic ADR-0006 (`C:\code\Agentic\docs\decisions\0006-sandboxed-story-hardening-loop.md`) —
  the superseded SurrealDB-on-GCE Phase ladder and its "managed SurrealDB Cloud — rejected"
  reasoning, reused here to reject AlloyDB/Neon by the same first-party/in-GCP-isolation logic.
- `apps/studio/server/devApi.ts` (the JSON stopgap this retires); `docs/open-questions.md`.
- Design conversation, 2026-06-06.
