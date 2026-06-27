---
status: accepted
decided: 2026-06-20
supersedes_in_part: [60]
---
# ADR-0081: Remove the --store memory opt-out: live and real builds always persist

## Status

accepted (2026-06-20) — direct owner decision this session ("yes proceed to remove it"), out of the
notice-board wisp diagnostic. **Supersedes in part [ADR-0060](0060-live-and-real-builds-own-the-database-default-store-pg-auto.md)**
— ADR-0060 §1 kept `--store memory` as an explicit opt-out so a `--live`/`--real` build could run
without persisting; this removes that opt-out from the CLI surface. The rest of ADR-0060 stands:
live/real default to `pg`, the preflight auto-starts the Cloud SQL instance, and `--dry-run` stays
in-memory and `--store pg`-refused.

**Superseded-in-part by [ADR-0099](0099-synthetic-smoke-verdicts-must-not-derive-a-green-unit.md)** — this ADR's invariant that **a `--live` build always persists** is overtaken: a synthetic `--live` smoke now runs in-memory and is `--store pg`-refused (exactly as a `--dry-run` already was), so only `--real` persists to `pg`. This ADR's other half — the **no `--store memory` CLI opt-out** (`refuseMemoryStore`) — is preserved.

## Context

[ADR-0048](0048-in-flight-build-is-the-primary-wisp.md) made the in-flight build the primary studio
wisp; ADR-0060 then made live/real builds persist to `pg` **by default** so real work feeds the
studio's wisp/bloom. ADR-0060 §1 kept `--store memory` as the explicit opt-out: a `--live`/`--real`
build that writes nothing to the shared store.

In review that opt-out reads as a footgun, not a feature:

- It is the one path where real, **billed**, real-leaf work produces **no durable record** — no
  verdict, no rollup, no wisp. That cuts against the system's thesis (the event log is the truth about
  what work happened) and against ADR-0060's own spirit ("real work feeds the studio by default").
- It is worse than a dry-run: a dry-run is transparently scripted (you know nothing landed), but
  `--live --store memory` prints a real green envelope while landing nothing — a human can walk away
  believing they proved something durable.
- The use ADR-0060 cited for it — a "genuinely offline live/real run" — is close to a contradiction:
  the live leaf is the Claude Agent SDK (it needs the network), and if the network is up the DB is
  reachable. The DB-hard-down case is better answered by "raise the DB" (the preflight already
  auto-starts it) or by working manually, not by a persist-nothing mode.

There is ONE legitimate consumer of the in-memory store on the live/real path: the offline tests that
exercise the `--live`/`--real` **driver** itself (sequencing, promotion, halt-on-fail) without a DB or
a real leaf — they inject `verdictStore: "memory"` with scripted authors. Removing the in-memory store
outright would break that test seam.

## Decision

Remove `--store memory` from the build **surface**, while keeping the in-memory store as an internal
test-injection seam:

1. **The CLI refuses `--store memory`.** `storytree node build` / `story build` with `--store memory`
   returns a fail-closed envelope (`refuseMemoryStore`, `packages/cli/src/commands.ts`) pointing at
   `pnpm db:status`: a `--live`/`--real` build always persists, a `--dry-run` is already in-memory —
   there is no run-without-persisting mode.
2. **A live/real build always persists.** `effectiveVerdictStore` keeps defaulting an unset `--store`
   to `pg`; the DB preflight (ADR-0060 `ensureDbUp`) still auto-starts the instance and **refuses**
   (fix the DB) if it cannot — but the refusal no longer offers the deleted `--store memory` escape.
3. **The in-memory store survives only as a programmatic test seam.** `resolveVerdictStore` still maps
   `"memory"` to the in-memory store, reachable ONLY via the `verdictStore` option the offline driver
   tests pass directly — never from argv.
4. **`--dry-run` is unchanged** ([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)):
   in-memory by default, `--store pg` refused (a scripted PASS persisted is a forged `healthy`).

## Consequences

- **Good:** every live/real build is recorded — real, billed work always lands a verdict and feeds the
  studio. The footgun (real work that vanishes) is gone, and the invariant simplifies to "live/real
  always persist".
- **Cost / accepted consequence:** a genuinely unraisable DB now BLOCKS the automated leaf entirely —
  there is no ephemeral escape. Judged correct: manual edit → gate → commit still flows, and the
  instance is reliable and auto-starts. If a real outage ever demands it, a narrow env-gated override
  is preferable to restoring a first-class flag — not built pre-emptively (YAGNI).
- **Unchanged invariants:** `--dry-run` stays in-memory + `--store pg`-refused (ADR-0020); the offline
  gate (`pnpm -r test`) and CI stay DB-free (the in-memory test seam needs neither).

## References

- [ADR-0060](0060-live-and-real-builds-own-the-database-default-store-pg-auto.md) — superseded in part
  (§1's `--store memory` opt-out removed; its default-`pg` + preflight stand).
- [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md) — the in-flight build is the primary wisp
  (what persistence feeds).
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — proof is non-authorable (the dry-run /
  forged-healthy guard, unchanged).
- `packages/cli/src/commands.ts` (`refuseMemoryStore`), `db-control.ts` (`effectiveVerdictStore`),
  `node-build.ts` (`resolveVerdictStore`), `story-build.ts`.
