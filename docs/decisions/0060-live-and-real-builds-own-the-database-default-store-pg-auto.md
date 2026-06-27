---
status: accepted
decided: 2026-06-15
amends: [48]
---
# ADR-0060: Live and real builds own the database (default --store pg, auto-start Cloud SQL)

## Status

accepted (2026-06-15) — direct owner decision in this session ("can we just make building/dev work
require the db to be up, so the beginning of the pipeline checks the db and if its not up it launches
it"). Processes and retires the open-question artifact `oq-store-pg-default-for-real-live-builds`.
**Amends** [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md): ADR-0048 made the in-flight build
the primary orbiting wisp but left its note "to SEE a wisp, run a build with `--store pg`" — i.e. the
signal was opt-in; this ADR makes a live/real build feed it by default.

**Superseded-in-part by [ADR-0081](0081-remove-the-store-memory-opt-out-live-and-real-builds-always.md)** — §1's `--store memory` explicit opt-out (a `--live`/`--real` build that persists nothing) is removed from the CLI surface; the in-memory store survives only as an internal test-injection seam. The rest of this ADR stands: live/real still default to `pg`, the preflight still auto-starts Cloud SQL, and `--dry-run` stays in-memory and `--store pg`-refused.

**Correction (2026-06-22) — the cold-start timing below is wrong; the poll budget has been raised.**
The "~60–90s … ≤180s" figures in this ADR were an estimate. A real GCP cold start measures ~5–6 min
(≤366s end-to-end; confirmed against ~12 Cloud SQL start operations over 12–22 June 2026, all 277–349s
plus connection latency). Two things compounded the gap: [ADR-0063](0063-db-control-over-the-cloud-sql-admin-rest-api-retire-the-gclo.md)
made the start a **non-blocking REST PATCH**, so the connection-poll — not a blocking `gcloud` call —
now owns the *whole* wait; and 180s sat *below* the observed cold start, so the first live/real build
after the daily stop refused spuriously even though the instance came up a minute or two later. The
poll budget in `ensureDbUp` (`packages/cli/src/db-control.ts`) was raised **180s → 420s (7 min)** so the
decision's intent — wait out a cold start, else refuse — actually holds, and the loop now logs progress
every 30s. Resolves `oq-live-build-autostart-cold-start-wait`; read the "≤180s" / "~60–90s" wording
below as ~5–6 min / ≤420s.

## Context

The studio world (`#/tree`) only renders the in-flight build **wisp** (ADR-0048) and the verdict
**bloom** ([ADR-0045](0045-live-activity-layer-is-verdict-blooms.md)) when a build runs with
`--store pg` — the only mode that writes the `building`/`verdict` rows to the shared Cloud SQL store
the studio reads. Until now `--store pg` was opt-in: `resolveVerdictStore` defaulted to an in-memory
store whose events vanish with the process. Verified 2026-06-15 — a real build *with* `--store pg`
drives the wisp→bloom end-to-end, while the identical build without it is invisible to the world. So
the ADR-0048/0045 payoff was almost never seen: real work happened and the trees stayed dark.

The forces: (a) the in-memory default is offline-safe — a live/real build runs without the DB — but
invisible; (b) the live store is a STOPPED-by-default Cloud SQL instance (ADR-0015) that takes ~60–90s
to accept connections after `db:up`; (c) `--dry-run` must NEVER persist (a scripted PASS in the shared
log is a forged `healthy`, [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)); (d) the offline
gate (`pnpm -r test`) and CI must stay DB-free.

## Decision

A `--live`/`--real` build **owns the database**:

1. **Default `--store` to `pg`** for `--live`/`--real` (`node build` and `story build`). An unset
   `--store` persists; `--store memory` is the explicit opt-out (run live/real without persisting — no
   wisp/bloom). `--dry-run` is unchanged: in-memory by default, `--store pg` refused (ADR-0020).
2. **Preflight the DB** at the start of the pipeline, before any store setup, worktree, or spend:
   probe the live store; if it is unreachable, run the `db:up` equivalent
   (`gcloud sql instances patch … --activation-policy ALWAYS`) and poll until it accepts connections
   (≤180s) — otherwise **refuse** the build with a clear reason (pointing at `pnpm db:status` and the
   `--store memory` escape hatch). No silent in-memory fallback: a build that means to persist says so
   when it cannot.

Implemented in `packages/cli/src/db-control.ts` (`ensureDbUp` — the decision flow over injected
effects, unit-tested with a fake clock; `probeLiveDb`/`startLiveDb`/`ensureLiveDb` — the real wiring;
`effectiveVerdictStore` — the default), wired into `nodeBuild` and `storyBuild`. The offline gate and
CI never reach this path (it fires only for live/real with an effective `pg` store).

## Consequences

- **Good:** real work feeds the studio's wisps and blooms by **default** — the ADR-0048/0045 payoff is
  the default, not an opt-in flag people forget. Every live/real verdict persists to the shared store
  (the rollup derives across sessions). Fail-closed: a build that cannot reach/raise the DB refuses
  loudly rather than silently dropping its verdict.
- **Cost:** a cold instance adds a one-time ~60–90s auto-start wait to the first live/real build of a
  session. Live/real builds now depend on `gcloud` + ambient ADC (already required for `db:up`,
  ADR-0021); a genuinely offline live/real run must pass `--store memory`.
- **Unchanged invariants:** `--dry-run` stays in-memory and `--store pg`-refused (ADR-0020); the
  offline gate (`pnpm -r test`) and CI stay DB-free; remote/offline sessions (which cannot run
  live/real anyway) are unaffected.

## References

- [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md) — amended (in-flight build = primary wisp).
- [ADR-0045](0045-live-activity-layer-is-verdict-blooms.md) — verdict blooms (also fed by this default).
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — proof is non-authorable (the dry-run guard).
- [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) — the stopped-by-default Cloud SQL instance + `db:up`.
- [ADR-0063](0063-db-control-over-the-cloud-sql-admin-rest-api-retire-the-gclo.md) — the gcloud→REST swap that made `start()` non-blocking (the 2026-06-22 correction above).
- [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) — keyless ambient ADC (the gcloud/connector auth).
- Retires the open-question `oq-store-pg-default-for-real-live-builds` (live library).
- `packages/cli/src/db-control.ts`, `node-build.ts`, `story-build.ts`.
