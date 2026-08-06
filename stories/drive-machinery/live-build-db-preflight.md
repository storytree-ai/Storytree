---
id: "live-build-db-preflight"
tier: capability
story: drive-machinery
title: "The live-build database preflight — probe it, start it, or refuse with the reason"
outcome: "A build that owns the live store begins only against a database it has just watched accept connections."
status: mapped
proof_mode: integration-test
depends_on: []
# A brownfield capability over already-implemented, already-tested code (the arc that authored it:
# capability-layer-coverage-arc, 2026-08-07). The `proof:` block is spec-borne (ADR-0057) so the node is
# single-node `--live`-buildable; there is deliberately NO `real:` arm — the drive machinery is `mapped`,
# so its green path is Adopt (the story's `## Reliability Gates`, ADR-0085), not a fail-closed `--real`
# Build (ADR-0094 removed the ADR-0092 brownfield arm). Both proving test files are drive-resident, so
# the package suite is the whole proof command.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
---

# The live-build database preflight — probe it, start it, or refuse with the reason

**Outcome —** A build that owns the live store begins only against a database it has just watched
accept connections.

*(Two clauses were demoted out of the outcome to avoid a banned conjunction, and each lives where it is
proven. The refusal VOCABULARY — a still-warming instance vs an activation PATCH that did not take vs a
session whose egress structurally cannot carry the connection — is contracts 2 and 5. And WHICH builds
own the store at all is contract 12, `real-driven-build-owns-the-store`.)*

**Depends on —** nothing within this story. The Cloud SQL Admin REST client and the pooled connection
this consumes are the `library` story's, reached through this story's already-declared story-level
`library` edge (`stories/drive-machinery/story.md` `depends_on`) — see **Guidance** for why no
capability-grain edge is added.

> **Proof status (honest) — `mapped` (real passing offline tests, observational; NOT `healthy`).** The
> whole decision flow and the whole probe are covered by REAL, passing, offline tests in TWO colocated
> drive-resident files: `packages/drive/src/db-control.test.ts` (15 tests) and
> `packages/drive/src/db-probe.test.ts` (18 tests). Both are part of the `@storytree/drive` suite, which
> I ran on 2026-08-07 — **484 tests, 484 pass, 0 fail, 0 skipped**. Neither file touches a database, a
> REST endpoint, or a wall clock: `ensureDbUp` and `probeDb` take their effects as INJECTED deps, so the
> cold-start poll, the timeout and the teardown paths are all deterministic. storytree's own
> prove-it-gate did NOT drive these red→green, so this is brownfield `mapped`.
>
> **The `proposed` pockets, named rather than implied.** (a) `ensureLiveDb` (`db-control.ts:327-341`) —
> the real wiring that binds `probeLiveDb` / `startLiveDbViaRest` / `statusLiveDbViaRest` /
> `dataPlaneRefusal` into `ensureDbUp` — has no offline assertion; it is exercised only against the live
> instance. (b) The three REST effects themselves (`db-control.ts:312-324`) are one-line compositions
> over `createAdcCloudSqlAdmin`, and the CLIENT they compose is proven in the `library` story's own
> suite (`packages/library/src/store/cloud-sql-admin.test.ts`), not here. (c)
> `probeLiveDbDetailed` (`:273-295`) and its boolean face `probeLiveDb` (`:303-305`) are likewise the
> real-effects wiring — the pure core `probeDb` is fully covered, the `createPool` / `setTimeout`
> binding around it is not, and contract 12's second half pins the two faces' RESULT SHAPE structurally
> rather than executing either body. This is the same shape [`oq-hygiene-gate`](oq-hygiene-gate.md)
> records for its `loadLive` loader.
>
> **No reliability gate `(covers:)` this capability yet.** The story's gate-3
> (`pnpm --filter @storytree/drive test`) literally RUNS both proving files, but its `(covers:)` list
> was frozen before this node existed, so no signed `adopted` verdict names it. That is a stated gap,
> not a hidden one — adding it to gate-3 changes what an already-signed verdict claims and is a
> deliberate, id-aware edit for the owner.

## Guidance

ADR-0060: a `--real`/`--live` build **owns the database**. `--dry-run` never comes here (it stays
in-memory — a scripted PASS must not persist, ADR-0020), and the offline gate never touches this path.

One module, `packages/drive/src/db-control.ts`, split into a PURE decision half and a thin real-effects
half — the same shape the rest of the drive uses:

- **`ensureDbUp(deps)`** (`db-control.ts:80-142`) is the decision flow, pure over its injected
  `probe` / `start` / `sleep` / `now` / `log` / `status` effects (`EnsureDbDeps`, `:21-61`). Order is
  load-bearing and each step is a contract below: refuse a structurally blocked session FIRST
  (`:84-86`), fast-path a reachable store (`:87`), start ONCE (`:89-94`), then poll to a deadline
  (`:96-111`), and only when the deadline exhausts consult the Admin API to say WHICH failure this is
  (`:112-141`).
- **`probeDb(deps, timeoutMs)`** (`:210-255`) is the canonical reachability probe, also pure over
  injected effects (`ProbeDeps`, `:183-198`). It NEVER throws and never rejects — a thrown error IS the
  answer — and the pool is torn down on every exit, including when the budget already won the race.
- **`ensureLiveDb`** (`:327-341`), `probeLiveDbDetailed` (`:273-295`) and the three REST effects
  (`:312-324`) are the real wiring. ADR-0063: no gcloud subprocess, so this path never feeds the
  Python-cold-start credential-lock cascade; keyless ADC (ADR-0021).

**`probeDb` is ONE implementation with two faces, and that consolidation is the point.** `pnpm db:probe`
runs it through `probeLiveDbDetailed`, and `ensureDbUp`'s readiness poll runs it through the boolean
`probeLiveDb` wrapper (`:303-305`) so `EnsureDbDeps["probe"]`'s `() => Promise<boolean>` contract — and
with it ADR-0060's 75/1 exit vocabulary — is unchanged. Before the consolidation the two disagreed:
`pnpm db:up` reported "did not accept connections within 420s" twice at status RUNNABLE while a direct
`SELECT 1` answered in ~6s. The poll was the blocker, not the database. Contract 11 pins that the two
cannot drift apart again.

**Why no `depends_on` edge to [`cloud-sql-admin-rest`](../studio-cloud/cloud-sql-admin-rest.md).** That
`studio-cloud` contract describes the typed Admin REST client this preflight consumes, but it does so in
prose about a path that has moved: it still declares `packages/store/src/cloud-sql-admin.ts`, and the
`@storytree/store` package dissolved into `@storytree/library` (ADR-0077) — the client now lives at
`packages/library/src/store/cloud-sql-admin.ts`, reached here as `createAdcCloudSqlAdmin` from
`@storytree/library/store` (`db-control.ts:13`). So the real code edge runs to the **`library`** story,
which `stories/drive-machinery/story.md` already declares at story grain. A capability-grain edge would
also be mechanically refused: `topoOrderStoryNodes`
(`packages/orchestrator/src/story-build.ts:161-168`) rejects any `depends_on` naming an id outside the
owning story's capability set. The stale `sourceFile` on that contract is left untouched here.

**Consumed by** [`build-drive-cli`](build-drive-cli.md) — `node-build.ts:1200-1205` and
`story-build.ts:578-583` resolve the effective store and then run the preflight before any spend; the
CLI's gate driver does the same at `packages/cli/src/gate-build-driver.ts:272-275`, and `db-cli.ts:24`
/ `:61-62` are the `db:up` / `db:probe` verbs. The `desktop` story's
[`desktop-launch-preconditions`](../desktop/desktop-launch-preconditions.md) reuses `ensureLiveDb`
verbatim as its injected `ensureDb` (ADR-0176 §1) — a consumer, not a claim on this code.

## Integration test

**Goal —** Run the REAL decision flow against the REAL probe's result shape and prove the consolidation
did not change what an operator is told to do: a poll that exhausts against an `ALWAYS` instance is
`stillWarming` (db-cli exits 75 — re-probe, never re-start), a poll that exhausts against `NEVER` is
not (db-cli exits 1 — waiting will not help), and a `DbProbeResult` folded to `.reachable` still
satisfies the poll's own `probe` seam.

Real collaborators, no stubs between them: `packages/drive/src/db-probe.test.ts:286`, `:301` and `:320`
(passing) drive the real `ensureDbUp` with the real `DbProbeResult` type, wiring the poll's decision
flow to the probe's published shape. Only the effects are faked — which is the design, not a shortcut:
the whole reason `ensureDbUp` and `probeDb` take injected deps is that a cold-start poll and a 45s
timeout are not testable against wall-clock. `:320` is the structural pin that the two faces of the one
probe stay assignable; `:286` / `:301` are the ADR-0060 exit-vocabulary pins.

Underneath, 15 tests in `db-control.test.ts` cover every branch of the decision flow and 18 in
`db-probe.test.ts` cover the probe's happy, reason, timeout and teardown paths. `mapped`
(observational); the prove-it-gate did not drive it.

## Contracts (13)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). Every contract here has a REAL passing test (`proven by`).

1. **`reachable-store-short-circuits`** — a reachable store returns immediately and never starts anything
   - **asserts —** a `probe` answering `true` yields `{ ok: true, started: false }`, and `start` is never called (the owner leaves the DB up, so this is the common case and it must be free).
   - **covers —** `packages/drive/src/db-control.ts:87`
   - **proven by —** `packages/drive/src/db-control.test.ts:37` (REAL, passing)
2. **`a-structurally-blocked-session-refuses-before-the-first-probe`** — ADR-0250: a session whose egress cannot carry a Postgres connection is refused instantly, with the real mechanism named
   - **asserts —** with a `refusal` present, the result is a refusal carrying that message verbatim, `probe` ran ZERO times and `start` ran ZERO times — so a blocked session spends neither the 45s probe budget nor the multi-minute cold-start poll before refusing for the wrong reason; an ABSENT or `null` refusal behaves exactly as the laptop path.
   - **covers —** `packages/drive/src/db-control.ts:84-86`
   - **proven by —** `packages/drive/src/db-control.test.ts:44` and `:67` (REAL, passing)
3. **`an-unreachable-store-is-started-once-then-polled`** — start runs exactly once, and a later poll that connects is a success
   - **asserts —** with the probe scripted false/false/true, the result is `{ ok: true, started: true }`, `start` ran exactly once, and the probe was called three times (fast-path, poll#1, poll#2).
   - **covers —** `packages/drive/src/db-control.ts:89-111`
   - **proven by —** `packages/drive/src/db-control.test.ts:72` (REAL, passing)
4. **`a-failed-start-refuses-without-polling`** — a start that throws is a refusal naming the cause, not a wait
   - **asserts —** a `start` throwing `no ADC token` yields a refusal whose reason is `could not start the database: no ADC token`, and ONLY the fast-path probe ran — no polling after a failed start.
   - **covers —** `packages/drive/src/db-control.ts:90-94`
   - **proven by —** `packages/drive/src/db-control.test.ts:91` (REAL, passing)
5. **`the-poll-budget-outlasts-a-real-cold-start`** — the DEFAULT budget carries headroom over the cold start its own banner advertises
   - **asserts —** with no `timeoutMs`/`pollMs` supplied (so the real defaults run), an instance that accepts connections at ~6m10s succeeds, and so does one that accepts at 8m40s — past both retired ceilings (180s, then 420s), each of which refused starts the code itself called normal.
   - **covers —** `packages/drive/src/db-control.ts:41-51,96`
   - **proven by —** `packages/drive/src/db-control.test.ts:106` and `:122` (REAL, passing)
6. **`still-warming-is-told-apart-from-unreachable`** — after the deadline, the Admin API decides WHICH failure this is
   - **asserts —** state RUNNABLE + activationPolicy ALWAYS ⇒ `stillWarming: true` and a reason naming the warming state, the re-probe remedy, and explicitly NOT another start; activationPolicy NEVER ⇒ NOT `stillWarming`, with the observed policy surfaced; a THROWING or ABSENT `status` ⇒ the generic `did not accept connections` refusal, never a false still-warming.
   - **covers —** `packages/drive/src/db-control.ts:112-141`
   - **proven by —** `packages/drive/src/db-control.test.ts:140`, `:160`, `:177` (REAL, passing)
7. **`the-wait-reads-as-progress`** — a multi-minute wait surfaces repeatedly rather than looking like a hang
   - **asserts —** an instance up at ~95s produces at least two `still waiting` lines, and the first reports elapsed seconds.
   - **covers —** `packages/drive/src/db-control.ts:100-110`
   - **proven by —** `packages/drive/src/db-control.test.ts:197` (REAL, passing)
8. **`the-probe-answers-with-the-exact-reason-never-a-bare-false`** — unreachable and unauthenticated want different next actions
   - **asserts —** a successful `SELECT 1` ⇒ `reachable: true` carrying `elapsedMs`; a throwing `open()` ⇒ the exact message (`STORYTREE_DB_USER is not set`); a throwing `select1` (pool built, query refused) ⇒ its message, not a swallow; a non-Error throw ⇒ a string reason.
   - **covers —** `packages/drive/src/db-control.ts:214-235`
   - **proven by —** `packages/drive/src/db-probe.test.ts:89`, `:104`, `:121`, `:134` (REAL, passing)
9. **`the-probe-never-leaks-its-connector`** — the pool is torn down on every exit
   - **asserts —** closed once on the happy path and once when `SELECT 1` throws; a pool that resolves AFTER the budget won the race is STILL closed; an `open()` that never resolves closes nothing (no handle was ever obtained); and a THROWING `close()` does not turn a reachable DB into a refusal.
   - **covers —** `packages/drive/src/db-control.ts:226-234`
   - **proven by —** `packages/drive/src/db-probe.test.ts:186`, `:192`, `:206`, `:225`, `:237` (REAL, passing)
10. **`the-probe-times-out-naming-its-own-budget`** — a hung pool build is reported as the budget it actually waited
    - **asserts —** with `open()` hanging (what a STOPPED instance really does) and the budget fired, the result names `no answer within 45s` and points at `db:status`; a timed-out probe still reports a measured `elapsedMs`; and the HAPPY path cancels the budget, so a fast probe leaves no live timer holding the event loop open.
    - **covers —** `packages/drive/src/db-control.ts:237-254`
    - **proven by —** `packages/drive/src/db-probe.test.ts:148`, `:173`, `:95` (REAL, passing)
11. **`the-probe-line-carries-the-number-that-settles-it`** — the rendered verb output names the elapsed measurement or the reason
    - **asserts —** a reachable result renders `reachable — SELECT 1 answered in 367 ms` (the number that settles slow-DB-vs-wrong-poll); an unreachable one renders `UNREACHABLE after 45000 ms` carrying the reason VERBATIM, so the render can never soften what the probe learned.
    - **covers —** `packages/drive/src/db-control.ts:261-265`
    - **proven by —** `packages/drive/src/db-probe.test.ts:266`, `:273` (REAL, passing)
12. **`the-probe-is-total-and-its-result-is-what-the-poll-consumes`** — the verb and the poll cannot drift into disagreement
    - **asserts —** `probeDb` NEVER rejects — every failure is a verdict, so a caller cannot crash on it — even when `open()` and `close()` BOTH throw; and a `DbProbeResult` folded to `.reachable` is assignable to `EnsureDbDeps["probe"]` and drives the real `ensureDbUp` to `{ ok: true, started: false }`. The second half is a STRUCTURAL pin on the published result shape, not an execution of `probeLiveDb`'s body — see the `proposed` pocket (c) above.
    - **covers —** `packages/drive/src/db-control.ts:167-169,210-255`
    - **proven by —** `packages/drive/src/db-probe.test.ts:249`, `:320` (REAL, passing)
13. **`real-driven-build-owns-the-store`** — only a genuinely driven proof defaults to persisting
    - **asserts —** a SYNTHETIC walk (a `--dry-run` scripted walk OR a `--live` smoke) passes its `--store` flag through unchanged, so an unset flag stays in-memory (ADR-0099-B, overtaking ADR-0081's "live builds always persist"); a REAL driven proof defaults an unset flag to `pg` (ADR-0060); an explicit `pg` on a synthetic walk passes through here and is refused downstream as a forged healthy.
    - **covers —** `packages/drive/src/db-control.ts:353-356`
    - **proven by —** `packages/drive/src/db-control.test.ts:214`, `:221`, `:227` (REAL, passing)
