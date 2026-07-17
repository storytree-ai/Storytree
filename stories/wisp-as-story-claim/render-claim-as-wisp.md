---
id: "render-claim-as-wisp"
tier: capability
story: wisp-as-story-claim
title: "Render the graded claim as a wisp — hover / orbit / queue, visibly distinct from proven-green"
outcome: "The wisp source reads `events.node_claim` alongside the `building` rows, so a claimed story renders a wisp shaped by its GRADE (exploring hovers, work orbits, waiting queues) and departure-faded on release; a claimed-but-not-proven activity carries a distinct discriminator so it renders differently from the proven-green bloom (the ADR-0138 §5 honesty wall)."
status: proposed
proof_mode: integration-test
depends_on: [claim-store-work-time]
decisions: [138, 45, 99]
# Node-borne proof config (ADR-0057 keystone A). The §5-load-bearing delta is PURE DATA MATH: the fold that
# turns node_claim rows into map activity, with a distinct discriminator for claimed-vs-proven. NET-NEW,
# builtins-only — mirrors the existing apps/studio/server/inFlightBuilds.test.ts (pure, NO DB, NO install).
# The leaf authors a net-new claimsToActivity fold in apps/studio/server/inFlightActivity.ts; the red is the
# missing module. The LIVE SQL that selects node_claim (B3, mirrored in backend-entry.ts / libraryBackend.ts)
# is glue under this capability, not part of the pure proof. NO `install`/`db` — the fold is pure (rows + now
# in, activity out), so the default node:test single-file proof runs it byte-for-byte like inFlightBuilds.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/server/**/*.test.ts"]
    sourceGlobs: ["apps/studio/server/**/*.ts"]
  real:
    testFile: "apps/studio/server/inFlightActivity.test.ts"
    sourceFile: "apps/studio/server/inFlightActivity.ts"
    scope:
      testGlobs: ["apps/studio/server/inFlightActivity.test.ts"]
      sourceGlobs: ["apps/studio/server/inFlightActivity.ts"]
---

# Render the claim as a wisp

**Outcome —** The wisp source reads `events.node_claim` **alongside** the `building` rows, so a **claimed**
story orbits a wisp; and a claimed-but-not-proven activity carries a **distinct discriminator / colour
state** so it renders **differently** from the proven-green **bloom** — the ADR-0138 §5 honesty wall (a
claim is never a proof).

**Depends on —** [`claim-store-work-time`](claim-store-work-time.md) (the work-time `node_claim` rows this
fold reads).

> **ADR-0200 re-aim (graded render, landed + owner-attested 2026-07-17).** The original cut of this fold
> was **binary** — claimed-but-not-proven vs proven-green. ADR-0200 gave the claim three **grades**, and
> the landed `claimsToActivity` (`apps/studio/server/inFlightActivity.ts`) now carries the **grade as the
> render's GEOMETRY signal** (`exploring` hovers, `work` orbits, `waiting` queues; colour still folds
> from `intent`), with the departure fade for a just-released claim sourced from `foldDepartures`
> (`packages/notice-board/src/claim.ts`). The §5 discriminator is unchanged and reinforced: **no grade
> and no colour is ever a proof** — only a real signed verdict paints the green bloom (ADR-0045/0099).
> The fold reads ONLY `events.node_claim` (the ledger), never a retired presence row. The owner attested
> the graded look on 2026-07-17. The body below is the landed contract; the grade-geometry note above is
> the ADR-0200 generalisation it now carries.

> **Proof status (honest) — `proposed`.** Today `apps/studio/server/inFlightBuilds.ts`
> (`rowsToBuildActivity`, a pure fold) reads ONLY `building` work-event rows and colours by `doc->>'phase'`;
> it never reads `node_claim`. The provable delta — the pure fold from claim rows to map activity, with a
> distinct claimed-vs-proven discriminator — does not exist yet. It is net-new, builtins-only, red→green like
> the existing `inFlightBuilds.test.ts` (no DB).

## Guidance

Mirror the existing pure fold. Read `apps/studio/server/inFlightBuilds.ts` (`rowsToBuildActivity`: rows +
`now` → `BuildActivity[]`, dropping rows past `BUILD_IN_FLIGHT_TTL_MS`, surfacing a recognised gate
`phase`). The new fold is its sibling for CLAIM rows.

**B1 — a pure `claimsToActivity` fold (net-new, `apps/studio/server/inFlightActivity.ts`).** Given the raw
`events.node_claim` rows (the scalar projection: `unit_id`, `session_id`, `branch`, `intent`, `claimed_at`,
`heartbeat_at`) + a `now`, fold them into the map-activity wire shape so a **claimed story** orbits a wisp —
ONE per claimed unit (the rows already have `unit_id` as PK, so one claim per unit is structural; the fold
must not emit two for one unit). Drop a claim whose `heartbeatAt` is past the stale-reclaim window (reuse the
`isReclaimable` math / `CLAIM_STALE_RECLAIM_MS` from `@storytree/notice-board` as a TYPE-ONLY/pure import, or
mirror the threshold) so a dead session's claim does not orbit forever.

**B2 — the claimed-vs-proven discriminator (§5 honesty wall, same file).** The activity the fold emits MUST
carry a discriminator marking it **claimed-but-not-proven**, distinct from the proven-green bloom. The fold
sets an explicit kind/colour-state field (e.g. `kind: "claim"` or a `claimed: true` flag, vs the build
fold's phase-coloured states) so a downstream renderer can paint a claim differently from a real
signed-verdict green (ADR-0045). The test asserts a claim activity NEVER carries a "green"/"bloom"
discriminator — the wall enforced in data, before any pixel.

**B3 — the live SQL mirror (glue under this capability, not the pure proof).** The live read path
(`apps/studio/server/libraryBackend.ts` + `apps/desktop/electron/backend-entry.ts`) must `SELECT` from
`events.node_claim` (the `WITH … SELECT DISTINCT ON (unit_id) …` style the building query uses) and apply
this fold. That SQL/wiring is operator/integration-observed (the `activityApi` integration test + the
deep-link), NOT the isolatable red→green — it is built by the orchestrator's supplement subagent. Mark it
done when the pure fold (B1/B2) is green and wired into the live read.

Do NOT touch files outside your write scope. The pure fold is the only `--real` deliverable; keep it
DB-free so it runs offline exactly like `inFlightBuilds.test.ts`.

## Integration test

**Goal —** Run the real `claimsToActivity` fold (no stubs) over representative `events.node_claim` rows +
a `now`, proving a claimed story yields exactly one wisp-activity for its unit, a stale claim is dropped,
and every emitted claim-activity carries the claimed-but-not-proven discriminator and NEVER a proven-green
one — the §5 honesty wall, in data.

Exercised against its **real collaborator** — the pure fold itself, the same way `inFlightBuilds.test.ts`
exercises `rowsToBuildActivity` (ADR-0010 §5): rows + `now` in, activity out, no DB. The live SQL (B3) is
the glue the orchestrator wires; its honest proof is the studio's `activityApi` integration test + the
operator-attested forest-map deep-link, not this unit test.

## Contracts (3)

The test-proven leaf behaviours — each one isolated automated test (ADR-0002).

1. **`claim-rows-fold-to-one-wisp-per-claimed-story`** — `claimsToActivity` turns `node_claim` rows into
   map activity, one wisp-activity per claimed unit, dropping a stale claim.
   - **asserts —** given two fresh claims on distinct units + one claim whose `heartbeatAt` is past
     `CLAIM_STALE_RECLAIM_MS`, the fold (with `now`) emits exactly two activities (one per fresh unit, keyed
     on its `unitId`), never two for one unit, and omits the stale one.
   - **covers —** `apps/studio/server/inFlightActivity.ts`
   - **proven by —** `apps/studio/server/inFlightActivity.test.ts` (net-new, offline, authored by the leaf).
2. **`claim-activity-is-visibly-distinct-from-proven-green`** — a claim-activity carries a
   claimed-but-not-proven discriminator and never a proven-green/bloom one (the §5 honesty wall).
   - **asserts —** every activity the claim fold emits carries the claim discriminator (e.g. `kind: "claim"`
     / `claimed: true`) and NO "green"/"bloom" marker; a renderer reading the discriminator can therefore
     never paint a claim as a proven-green bloom (ADR-0138 §5 / ADR-0045).
   - **covers —** `apps/studio/server/inFlightActivity.ts`
   - **proven by —** `apps/studio/server/inFlightActivity.test.ts` (net-new, offline).
3. **`live-claim-read-selects-node-claim`** — the live read path selects `events.node_claim` and applies the
   fold (mirrored in studio + desktop backends).
   - **asserts —** `libraryBackend.ts` and `apps/desktop/electron/backend-entry.ts` issue a
     `SELECT … FROM events.node_claim` (the `DISTINCT ON (unit_id)` style) and pass the rows through
     `claimsToActivity` so a claimed story surfaces on the map.
   - **covers —** `apps/studio/server/libraryBackend.ts`; `apps/desktop/electron/backend-entry.ts`
   - **would-be test (glue / supplement) —** the live SQL is operator/integration-observed (the `activityApi`
     integration test + the operator-attested deep-link), NOT an isolatable red→green; built by the
     orchestrator's supplement subagent, not the leaf.
