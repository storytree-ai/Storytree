---
id: "phase-activity-write"
tier: capability
story: drive-machinery
title: "The drive-side phase write — the board learns the phase without the gate touching the board"
outcome: "Each phase the spine commits to is recorded as a fresh phase-stamped `building` event by an observer that lives outside the gate."
status: proposed
proof_mode: integration-test
depends_on: [work-verdict-event-log]
# A greenfield capability registered after its implementation and tests (capability-layer-coverage-arc,
# 2026-08-07). Per ADR-0395, retrospective registration does not make it brownfield or Adopt-bound.
# Spec-borne `proof:` (ADR-0057) with NO `real:` arm; adding one would additionally churn the pinned
# REAL-buildable snapshot in
# packages/cli/src/node-build.test.ts. The proving file is drive-resident, so the package suite is the
# whole command. NOTE the deliberate boundary in `## Contracts`: two of the six tests in
# phase-activity.test.ts belong to wisp-as-story-claim's `colour-by-subagent`, not to this node.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
---

# The drive-side phase write — the board learns the phase without the gate touching the board

**Outcome —** Each phase the spine commits to is recorded as a fresh phase-stamped `building` event by
an observer that lives outside the gate.

*(The ADVISORY posture — a store hiccup is swallowed, so a board or DB failure can never fail the build
it observes — was demoted out of the outcome to avoid a banned conjunction; it lives where it is proven,
in contract 3 `the-phase-write-is-advisory`.)*

**Depends on —** [`work-verdict-event-log`](work-verdict-event-log.md). Real edge, real direction:
`phase-activity.ts:16` imports `workEvent` from `@storytree/orchestrator`. The whole "no new lifecycle
word" guarantee below is a statement ABOUT that capability's vocabulary — the event stays `building`
and the phase rides as a field on `WorkEventDoc` — so this writer cannot state its own outcome without
the event log's.

> **Proof status (honest) — `proposed` (real passing offline tests, but no current signed pass).** The
> per-phase append, the optional tier column, the advisory swallow and the no-role back-compat path are
> covered by REAL, passing, offline tests in `packages/drive/src/phase-activity.test.ts`, part of the
> `@storytree/drive` suite, which I ran on 2026-08-07 — **484 tests, 484 pass, 0 fail, 0 skipped**. The
> writer takes its store as an injected seam (`PhaseActivityStore`, `:24-32`), so the proof runs against
> a recording fake: no DB, no worktree, no SDK. The implementation is greenfield Storytree work;
> standing tests and the absence of a gate-driven red→green do not make it brownfield (ADR-0395).
>
> **The boundary with [`colour-by-subagent`](../wisp-as-story-claim/colour-by-subagent.md), stated so it
> cannot be double-claimed.** That `wisp-as-story-claim` capability owns a DIFFERENT file — the pure
> `subagentColourState` mapping in `packages/drive/src/subagent-colour.ts` — and its contract 2
> (`writer-stamps-the-subagent-colour-state`) already claims the STAMPING behaviour inside this writer,
> proven by `phase-activity.test.ts:99` and `:131`. Those two tests are NOT claimed here. What is
> claimed here is the phase write itself: the four tests at `:33`, `:62`, `:77` and `:146`. No
> `depends_on` edge is declared for it either — `topoOrderStoryNodes`
> (`packages/orchestrator/src/story-build.ts:161-168`) refuses any `depends_on` naming an id outside
> the owning story's capability set, and the colour import is an intra-package one that
> `check:boundaries` correctly sees as no cross-story edge at all.
>
> **The `proposed` pockets.** (a) The call sites that wire this into a real build
> (`node-build.ts:627` and `:844`) have no offline assertion. (b) The READER half —
> `inFlightBuilds()`, which takes the LATEST `building` row per unit so the newest phase wins and the
> wisp re-colours — is the studio's, proven at `apps/studio/server/inFlightBuilds.test.ts`; this
> capability owns the WRITE and names the reader without claiming it.
>
> **No reliability gate `(covers:)` this capability yet.** Gate-3 runs the proving suite, but its
> `(covers:)` list was frozen before this node existed, so no current signed verdict names it — a
> stated proof gap, not a reason to route this greenfield capability through Adopt.

## Guidance

ADR-0048 §3 v2, and the whole design is one sentence: **the orchestrator stays PURE.** `proveUnit` only
INVOKES an injected `onPhase` observer as it commits to each phase; the activity WRITE lives here in the
drive — exactly where the initial `building` mark is written (`node-build.ts`) — so the gate never
touches presence or activity. `phaseActivityWriter(store, target)`
(`packages/drive/src/phase-activity.ts:60-88`) builds that observer over an injected store and returns
a callback typed to the gate's `onPhase` signature.

**Three constraints hold this shape, and each is a contract below.**

- **No new lifecycle word.** The event stays `building`; the live phase rides as a FIELD on the doc
  (`WorkEventDoc.phase`, written at `:75`). Nothing downstream has to learn a new status word to learn
  the phase, and the projection that derives a unit's status is untouched.
- **A FRESH append per phase, not a mutation.** Every transition appends its own row carrying the same
  logical id `runId:unitId`. The reader takes the latest (`DISTINCT ON … ORDER BY seq DESC`), so the
  newest phase wins and the wisp re-colours as the spine walks red→green.
- **Advisory by construction** (`:83-86`). The `try` swallows everything: a board or DB failure leaves
  the wisp on its coarse band and the build's result is identical. The same posture
  [`build-usage-accounting`](build-usage-accounting.md) holds for the accounting append, and the reason
  both live in the drive rather than the spine.

**It is also the build's ONLY board footprint besides the write-claim** — a build run never writes
session presence (ADR-0199).

The `subagentRole` field (`:50`) is the ADR-0138 §5 colour axis and is OPTIONAL: absent, the writer
resolves no colour state (`:66-67`) and the doc is byte-identical to the pre-ADR-0138 phase-only mark.
That back-compat property is contract 4 here; the STAMPING behaviour when a role IS present belongs to
[`colour-by-subagent`](../wisp-as-story-claim/colour-by-subagent.md), as its own proof blockquote says —
it treats this writer as pre-existing substrate it wires into.

**Consumed by** [`build-drive-cli`](build-drive-cli.md): `node-build.ts:55` imports it and installs it
as `resolved.spec.onPhase` at `:627` (the live path) and `:844` (the real path).

## Integration test

**Goal —** Drive the WHOLE gate walk — AUTHOR_TEST, CONFIRM_RED, IMPLEMENT, CONFIRM_GREEN, GATE —
through the real writer over a recording store, and assert that what lands is a real, parseable
work-event stream: five rows, one per phase, every one of them still the word `building`, each carrying
its own phase plus the build identity a reader needs to key it to the right unit and run.

Real collaborators, no stubs but the store seam: `packages/drive/src/phase-activity.test.ts:33`
(passing) runs the real `phaseActivityWriter` over the real `workEvent` constructor
(`@storytree/orchestrator`) and re-parses every appended doc through the real `WorkEventDoc`
(`@storytree/proof-protocol`) — so the assertion is on a shape the live `PgWorkStore` would also accept,
not on a hand-held object. The injected `PhaseActivityStore` is the seam the writer is designed around
(`:22-23`: "satisfied by any Store … and by an offline fake, so the writer never reaches for a real
pool"), which is what makes a five-phase walk provable offline in milliseconds.

Underneath, three more tests cover the optional tier column, the advisory swallow and the no-role
back-compat path. `proposed`: the greenfield capability has standing observational evidence but no
current signed pass (ADR-0395).

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). Every contract here has a REAL passing test (`proven by`).

Deliberately FOUR, not six: `phase-activity.test.ts:99` and `:131` prove the subagent colour-state
stamping, which is [`colour-by-subagent`](../wisp-as-story-claim/colour-by-subagent.md)'s contract 2 and
is not re-claimed here.

1. **`one-fresh-phase-stamped-building-event-per-phase`** — the whole gate walk becomes five keyed, parseable rows
   - **asserts —** driving all five phases through the returned observer appends exactly five events; every doc parses as a `WorkEventDoc` and carries its own phase in walk order; EVERY doc's `event` is still `building` (no new lifecycle word, ADR-0048); every doc carries the build identity (`unitId`, `runId`, `tier`) so a reader can key it; every event uses the `runId:unitId` id so a later phase upserts the same logical mark; and every event is kind `work` actored by the resolved signer.
   - **covers —** `packages/drive/src/phase-activity.ts:68-82`
   - **proven by —** `packages/drive/src/phase-activity.test.ts:33` (REAL, passing)
2. **`the-tier-column-is-optional`** — a target with no tier writes no tier
   - **asserts —** with `tier` omitted from the target, the appended doc's `tier` is `undefined` (the column defaults downstream) while the phase and the `building` event word are unchanged — the spread at the write site adds the field only when it exists rather than writing a placeholder.
   - **covers —** `packages/drive/src/phase-activity.ts:77`
   - **proven by —** `packages/drive/src/phase-activity.test.ts:62` (REAL, passing)
3. **`the-phase-write-is-advisory`** — a dead board can never fail the build it is observing
   - **asserts —** with a store whose `appendEvent` throws `DB down mid-build`, invoking the observer does NOT reject — the failure is swallowed inside the writer and never reaches the gate that invoked it.
   - **covers —** `packages/drive/src/phase-activity.ts:83-86`
   - **proven by —** `packages/drive/src/phase-activity.test.ts:77` (REAL, passing)
4. **`no-subagent-role-leaves-the-phase-mark-unchanged`** — the ADR-0138 colour axis is additive, never a rewrite
   - **asserts —** a target carrying NO `subagentRole` resolves no colour state, so the appended doc's `colourState` is `undefined` and the mark is the phase-only doc the pre-ADR-0138 path wrote — the wisp falls back to its coarse phase band rather than acquiring an invented colour.
   - **covers —** `packages/drive/src/phase-activity.ts:66-67,78`
   - **proven by —** `packages/drive/src/phase-activity.test.ts:146` (REAL, passing)
