---
status: accepted
decided: 2026-06-20
amends: [20, 48]
---
# ADR-0080: Dry-run wisp smoke: a transient building-only mark verifies the wisp pipeline

## Status

accepted (2026-06-20, owner) — directed live in a session: build a cheap, repeatable way to verify
the whole in-flight-build **wisp** pipeline is wired, without a billed live build and without
persisting any proof. Amends [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) (the
"dry-run never persists" invariant — sharpened, not loosened) and
[ADR-0048](0048-in-flight-build-is-the-primary-wisp.md) (the wisp's source, which this exercises).

## Context

The orbiting **wisp** (ADR-0048) is the studio world's primary live signal: a teal mote orbiting the
story a build is touching. It is sourced from `events.work_event` rows with `type='building'`, keyed
`(unit_id, runId)`, that have **no terminal verdict yet** and are `< 20min` old (`BUILD_IN_FLIGHT_TTL_MS`).
The pipeline is four hops: the CLI appends the `building` mark → `events.work_event` → the studio's
`inFlightBuilds()` query (`apps/studio/server/libraryBackend.ts`) → `/api/activity` (polled every 30s,
`PRESENCE_POLL_MS`) → the world renders the wisp.

That is a lot of wiring to take on faith. Today the only way to light a real wisp is a `--live`/`--real`
build (ADR-0060 made those default `--store pg`), which is **billed** (subscription tokens) and slow.
A `--dry-run` is free but stays in-memory by construction — it never touches the live store, so it can
never light a wisp. There was no cheap, repeatable smoke for "is the wisp pipeline actually wired?".

The hard wall is [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md): a dry-run must **never**
persist a scripted PASS — a verdict in the shared log is a forged `healthy`. ADR-0060 enforces this as
a `--store pg` **refusal** for dry-runs (`effectiveVerdictStore`). Any wisp smoke must not weaken that.

## Decision

Add `--emit-wisp` to `node build <id> --dry-run` and `story build <id> --dry-run` — a **wisp smoke**
that lights a real, self-deleting wisp to exercise the pipeline:

1. **Surface.** Bare `--dry-run` is unchanged (pure in-memory, offline). `--emit-wisp` opts into a
   transient live-pg write and **requires** the DB (it reuses the ADR-0060 `ensureLiveDb` preflight;
   fail-closed with a clear message if pg is unreachable). It is **dry-run-only** — a `--live`/`--real`
   build already lights a real wisp from its own building mark, so `--emit-wisp` is refused there.
2. **Write.** At start, append **one** `building` work-event for the **real** `<id>` (so it anchors to
   that unit's story and renders as a teal wisp) with a smoke runId (`wisp-smoke-<n>`). **Never** a
   verdict.
3. **Dwell.** Hold the mark for `--dwell <sec>` (default **75s**) so it spans the studio's 30s poll;
   print the studio deep-link and a countdown. Without a dwell the write+delete slips between polls and
   is invisible — the dwell is the feature, not incidental.
4. **Cleanup — hard delete.** In a `finally` (success / fail / ctrl-c), physically `DELETE` that exact
   `(unit_id, runId)` row from `events.work_event` via a new, narrow `PgWorkStore.deleteWorkEvent`. The
   20-min TTL is the backstop if the process is killed before the `finally` runs.

**The invariant this amends.** ADR-0020 becomes: a dry-run never persists a **verdict** (proof is
non-authorable); a **transient, self-deleted, building-only** smoke mark is allowed purely for wiring
verification. The smoke appends only a `kind:"work"` building event and never a `kind:"signing"`
verdict — so nothing forgeable ever lands, and the `--store pg` verdict refusal is untouched.

**Why a hard delete, not a `retired` tombstone.** Appending a `retired` event would make
`rollupStatus` project the **real** unit as retired (last event wins) — a healthy unit would flip
status in the tree. Physically removing the transient row leaves the unit's durable event history
**byte-identical** to before the smoke. `deleteWorkEvent` is the deliberate, narrowly-scoped exception
to the otherwise append-only `PgWorkStore` (scoped to `type='building'` AND `doc->>'runId'`, so it can
only remove the exact smoke mark — never a verdict, never another run's history).

## Consequences

- **Good.** The wisp pipeline can be verified end-to-end in ~75s for $0, repeatably, by anyone with the
  live DB — no tokens, no worktree, no proof. The two-stage frontend-builder proof applies: red-green on
  the logic (the smoke appends exactly one building mark then deletes it, never a verdict, and the
  target unit's `rollupStatus` is byte-identical before vs after — proven offline against a fake store
  and a fake clock); operator-attested on the wiring (dogfood: confirm a wisp actually orbits during the
  dwell, then is gone after).
- **Good.** ADR-0020 is *sharpened*, not loosened: the precise line is now "never a verdict", which is
  the property that actually matters (a building mark is ephemeral and self-cleaning; a verdict is a
  durable health claim).
- **Cost / risk.** `PgWorkStore` gains its first delete path. It is smoke-scoped by construction and
  documented as the exception; the append-only contract holds for every other caller. A process killed
  with `SIGKILL` mid-dwell (before the `finally` / SIGINT handler) leaves the row until the 20-min TTL
  clears it — acceptable, and the same self-cleaning property ADR-0048 relies on.
- **Boundary.** The offline gate (`pnpm -r test`) and CI stay DB-free — the `--emit-wisp` path fires
  only with the flag **and** a live pg connection; every test injects fakes.

## References

- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — red-green enforcement; the "dry-run
  never persists" invariant this amends to "never persists a verdict".
- [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md) — the in-flight build is the primary wisp
  (`events.work_event` `building`, keyed `(unit_id, runId)`, TTL-filtered).
- [ADR-0060](0060-live-and-real-builds-own-the-database-default-store-pg-auto.md) — live/real builds own
  the DB and default `--store pg`; the `ensureLiveDb` preflight + the dry-run `--store pg` refusal this
  reuses and preserves.
- Code: `packages/cli/src/wisp-smoke.ts` (the smoke), `packages/orchestrator/src/store/pg-work-store.ts`
  (`deleteWorkEvent`), `apps/studio/server/libraryBackend.ts` (`inFlightBuilds`).
