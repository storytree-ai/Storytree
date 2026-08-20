---
id: "binding-staleness"
tier: story
title: "Binding & staleness — make drift real on live units"
outcome: "A proven unit carries the content-hash of the code it proved, the gate records change events as code moves, and `storytree drift <unit>` reads a unit's stored anchor + change log from the store and classifies fresh | stale | drifted-undescribed — so staleness is a real, lazy signal on live units, never an explicit-args toy."
status: proposed
proof_mode: UAT
capabilities: [boundhash-on-verdict, change-event-store, source-drift, gate-emits-change, drift-reads-store]
# Cross-story edge (ADR-0010 §4 / ADR-0058): this story extends and is CONSUMED BY the drive's proof
# path — its first unit adds a field to the signed `Verdict`, which now lives at
# packages/proof-protocol/src/proof.ts (the slice was authored against packages/core/src/proof.ts;
# @storytree/core was DISSOLVED by ADR-0068, so that path is dead — do not restore it) — and
# `gate-emits-change` edits drive-machinery's prove-it-gate (packages/orchestrator/src/prove-it-gate.ts).
# The drive's own UAT does not need this story's outcome (binding is purely additive/optional on the
# gate), so the direction is binding-staleness → drive-machinery, acyclic.
# proof-protocol: an honesty edge the ADR-0115 drift report surfaced (2026-07-05 map audit) — this
# story's registered unit sources import the change-event/drift DATA shapes (`ChangeEvent`/`DriftFlag`/
# the anchor) from @storytree/proof-protocol directly, not only through the drive.
# cli (ADR-0192 landlord rule): the drift-reads-store cap's proof sources live in the cli hub's
# territory (packages/cli/src/drift.ts — the `storytree drift` surface) — a hosted-seam edge,
# declared consumer-side so it can be annotated below (an unbacked provider-side `consumed_by: [cli]`
# would sit as permanent cli-story drift-WARN wallpaper; consumed_by suits only code-backed hub
# consumption, the notice-board pattern).
# storage-protocol (ADR-0192 landlord rule): the change-event-store cap's proof source lives in
# storage-protocol's territory (packages/storage-protocol/src/store.ts — the `Store`/`ChangeStore`
# seam) — a hosted-seam edge, no code import backs it, declared consumer-side. The unit was
# re-pointed there after ADR-0068 dissolved @storytree/core, whose packages/core/src/store.ts it
# used to name.
depends_on: [drive-machinery, proof-protocol, cli, storage-protocol]
# ADR-0166 artifact edges: the cli and storage-protocol edges are both hosted seams — no code
# import backs either.
artifact_edges: [cli, storage-protocol]
# Deciding ADR (ADR-0037 §2): the knowledge↔code binding & staleness model (16). gate-emits-change also
# stands on the prove-it-gate honesty walls (20).
decisions: [16]
---

# Binding & staleness — make drift real on live units

**Outcome —** A proven unit carries the content-hash of the code it proved, the gate records change
events as code moves, and `storytree drift <unit>` reads a unit's stored anchor + change log from the
store and classifies **fresh | stale | drifted-undescribed** — so staleness is a real, lazy signal on
live units, never an explicit-args toy.

**Depends on —** [`drive-machinery`](../drive-machinery/story.md), [`proof-protocol`](../proof-protocol/story.md), [`cli`](../cli/story.md), [`storage-protocol`](../storage-protocol/story.md)

This is the story home for the offline-provable slices that wire [ADR-0016](../../docs/decisions/0016-knowledge-code-binding-and-staleness.md)'s
**binding/staleness engine** into the proof + store path. The engine itself is LANDED — since
[ADR-0068](../../docs/decisions/0068-make-the-organism-model-physical-real-story-isolation-and-th.md) dissolved `@storytree/core` it
lives in two homes, not the one `packages/core/src/anchor.ts` this story was authored against:
the DATA shapes in [`packages/proof-protocol/src/anchor.ts`](../../packages/proof-protocol/src/anchor.ts)
(the re-anchorable `Anchor`, `ChangeEvent`, `DriftState`/`DriftFlag`) and the COMPUTE in
[`packages/orchestrator/src/proof/anchor-compute.ts`](../../packages/orchestrator/src/proof/anchor-compute.ts)
(the `hashSpan` FNV-1a content fingerprint seam, `isDescribed`, and the pure `classifyDrift → DriftFlag`);
the operator surface is [`packages/cli/src/drift.ts`](../../packages/cli/src/drift.ts). But today
`storytree drift` runs on **explicit `--bound`/`--change` args** because **no live unit carries a stored
anchor**. These capabilities close that gap: a verdict learns WHAT code it proved (`boundHash`), the
store gains a typed change-event contract, the gate emits change events as it (re)proves, and the CLI
gains a store-reading drift path instead of demanding explicit args — though that path is still an
exported function with no command wired to it (see the recorded gap below).

## Honest status

**`proposed` (greenfield without a current signed pass), NOT `healthy`.** Each capability is a single,
offline-provable change to an existing file (plus one net-new pure classifier), each driveable through
the **inner loop** — a spec-borne `proof:` block ([ADR-0057](../../docs/decisions/0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md))
makes the node buildable, and the prove-it-gate observes a genuine red→green and signs a verdict. The
story flips toward `healthy` per-unit as each lands a signed verdict. The `proposed` pockets, recorded
below, are the **DB-backed half** deliberately split to a parallel session.

**Recorded gap (found 2026-07-26) — the `storytree drift <unit>` COMMAND was never wired.** The
store-reading surface itself LANDED and is genuinely proven: `runDriftFromStore` in
[`packages/cli/src/drift.ts`](../../packages/cli/src/drift.ts), covered by
[`packages/cli/src/drift-from-store.test.ts`](../../packages/cli/src/drift-from-store.test.ts). But the
CLI dispatcher still routes the `drift` area to the explicit-args `runDrift` ONLY — a positional
argument is read as the rendered LABEL, not as a unit id
([`packages/cli/src/commands.ts`](../../packages/cli/src/commands.ts), the `drift` area branch) — and
`runDriftFromStore` has NO caller anywhere in `packages/` or `apps/`. So the frontmatter `outcome`
sentence's `storytree drift <unit>` clause is **not yet true at the command surface**, even once all
four machine checks below pass. UAT leg 4 was corrected in this pass to claim only the
surface that is actually proven, so the leg cannot record a false pass; wiring the dispatch — or
amending the story `outcome` instead — is an OWNER call. Whichever way it goes it earns its own leg,
machine-witnessed, because a dispatch assertion has a compiler.

**Stale capability proof configs (found 2026-07-26, NOT repaired here).** Four of this story's
capability specs declare `real:` arms against packages that no longer exist, so those nodes are not
`--real`-buildable as written: [`boundhash-on-verdict`](boundhash-on-verdict.md),
[`change-event-store`](change-event-store.md) and [`source-drift`](source-drift.md) all target
`@storytree/core` / `packages/core/**` (dissolved by ADR-0068), and
[`change-store-pg`](change-store-pg.md) targets `@storytree/store` / `packages/store/**` (dissolved by
ADR-0077 — the `PgChangeStore` it proves now lives at
[`packages/orchestrator/src/store/pg-change-store.ts`](../../packages/orchestrator/src/store/pg-change-store.ts)).
[`drift-reads-store`](drift-reads-store.md) and [`gate-emits-change`](gate-emits-change.md) carry
correct `real:` arms but still name `@storytree/core` in their authoring prose. None of this affects
the provenance correction in this file, but it is a real defect in the capability files, and this
pass's scope was this story file only.

## Out of scope of THIS story's offline slices (the follow-on session handled these — status noted)

These need inner-loop capabilities (a DB-backed proof mode, a new runtime dependency) the offline gate
cannot drive, so they were split to the follow-on session that built ON the contracts this story lands.
Their status is now recorded inline (do not re-do them):

- **`events.change_event` SQL schema + `PgChangeStore`** — the Postgres adapter of
  [`change-event-store`](change-event-store.md)'s `ChangeStore` contract. This story lands the OFFLINE
  contract (the `ChangeStore` interface + `InMemoryStore` + the reusable `changeStoreParitySuite`); the
  pg adapter is the parallel session's follow-on, held to the SAME parity bar. **DELIVERED by
  [`change-store-pg`](change-store-pg.md)** (this follow-on session, ADR-0064 §1 DB-backed proof —
  proven by a real round-trip against an isolated `storytree_test`, never prod).
- **The AST-fingerprint swap** behind `hashSpan()` (ADR-0016 Fork C) — needs the tree-sitter dependency.
  **DEFERRED + designed in [ADR-0071](../../docs/decisions/0071-ast-fingerprint-binding-hash-behind-a-node-only-seam-adr-001.md)**:
  it cannot live in the browser-bundled core (tree-sitter is a native addon), so the design is a
  node-only seam + a versioned hash scheme; not built (no live anchors → no measured false-positive
  rate to justify it yet).
- **The studio "stale" hue** (ADR-0040 §7's distinct visual) — **computed-state LOGIC DELIVERED**
  (the `drift` dimension + the never-green→brown invariant, PR #181); the canvas hue + the data-wiring
  that populates it (anchors-on-units + `/api/tree` drift) are deferred (the visual needs a human
  witness against real drift).
- **Production wiring** of a real `Anchor` onto each live unit + a real `boundHash`/`changeStore` into
  the live build path. This story lands the gate's *capability* (stamp + emit when a binding is present,
  proven offline); threading a real binding through `node-build.ts`/`story-build.ts` against the live DB
  is later work (it depends on the pg change store above).

## Capabilities (5)

Listed roots-first (a capability appears after everything it depends on). Each is a single-source-file
change with its own spec-borne `proof:` block (ADR-0057 A — authoring the block is what makes the node
inner-loop-buildable, no orchestrator-registry edit). Four are **edit-existing** (ADR-0057 §3 expansion
C — a regression test against current behaviour, then the source edit); one is **net-new**.

| # | capability | outcome | kind | depends on |
|---|---|---|---|---|
| 1 | [`boundhash-on-verdict`](boundhash-on-verdict.md) | The signed `Verdict` records the content-hash of the span it proved, so a verdict knows WHAT code it proved. | edit-existing, now `proof-protocol/proof.ts` | — |
| 2 | [`change-event-store`](change-event-store.md) | The store gains a typed append/read contract for `ChangeEvent`s, proven via a reusable parity suite (offline; the pg adapter is a parallel follow-on). | edit-existing, now `storage-protocol/store.ts` | — |
| 3 | [`source-drift`](source-drift.md) | A pure classifier mirrors `classifyDrift` over the `derives_from` DAG — an upstream ADR/artifact changed → source-drift. | net-new, now `orchestrator/proof/source-drift.ts` | — |
| 4 | [`gate-emits-change`](gate-emits-change.md) | When a unit is (re)proven the gate stamps the proved span's hash onto the verdict and emits a `ChangeEvent`. | edit-existing `orchestrator/prove-it-gate.ts` | `boundhash-on-verdict`, `change-event-store` |
| 5 | [`drift-reads-store`](drift-reads-store.md) | `storytree drift <unit>` reads the unit's stored anchor + change log from the store and classifies, instead of requiring explicit `--bound`/`--change`. | edit-existing `cli/drift.ts` | `change-event-store` |

## Dependency graph

Within-story edges, by the data each unit consumes:

- `gate-emits-change` → `boundhash-on-verdict` (stamps `verdict.boundHash`, the field unit 1 adds) +
  `change-event-store` (emits via the `ChangeStore` contract unit 2 lands).
- `drift-reads-store` → `change-event-store` (reads the unit's change log via `readChangeEvents`).
- `boundhash-on-verdict`, `change-event-store`, `source-drift` are the roots (no intra-story deps).

The graph is acyclic. Driven roots-first, a later node builds on the earlier nodes' committed source —
which is exactly why a `story build binding-staleness --real` chain (ONE shared worktree, topo-ordered)
resolves the intra-story deps automatically.

## UAT Test Criteria

**This story declares ZERO UAT criteria (ADR-0294 D2/D4).** It is a thin cross-cutting story — five
additive slices that landed in four different package suites — and there is no integrated journey a
person or an agent walks through it. Its five former criteria were each a *property of a module*, and
each one's own prose already named the capability that proves it; under ADR-0294 D2 a criterion whose
proof exists one rung down is **deleted, not re-pointed**, so they were deleted on 2026-08-03 with the
proving node named per criterion (recorded in `stories/uat-legacy-dispositions.json`, disposition
`superseded`). What the story is proven by is unchanged and is stated in full under **Reliability
Gates** below — a zero-UAT story greens honestly through the ADR-0085 own-proof union
(`packages/drive/src/tree.ts` — `ownObligations = [...hardUatTestCriteria, ...reliabilityGates]`).

The deletions and the node that already proves each, for audit:

| deleted criterion | claim | proven at |
| --- | --- | --- |
| `uatc_eddefa6d5b093d9f920feb29` | a signed `Verdict` carries the `boundHash` of the span it proved, and one without it still parses | [`boundhash-on-verdict`](boundhash-on-verdict.md) (capability) — `packages/proof-protocol/src/shapes.test.ts`, observed by gate-1 |
| `uatc_5c21ca51ab701f2da96ae69f` | the `ChangeStore` contract appends + reads `ChangeEvent`s to a reusable parity bar | [`change-event-store`](change-event-store.md) (capability) — `packages/storage-protocol/src/change-event-store.test.ts`, which runs the shared `changeStoreParitySuite` against `InMemoryStore`; observed by gate-2 |
| `uatc_e86cbe78a9f321c3b12aca91` | the gate stamps `verdict.boundHash` + emits one `ChangeEvent` with a binding, and signs unchanged without one | [`gate-emits-change`](gate-emits-change.md) (capability) — `packages/orchestrator/src/gate-emits-change.test.ts` asserts BOTH branches; observed by gate-3 |
| `uatc_ede9962b4bf236d6cb7f93ea` | `runDriftFromStore` classifies fresh \| stale \| drifted-undescribed from stored anchor + change log, and an absent anchor is guidance not a crash | [`drift-reads-store`](drift-reads-store.md) (capability) — `packages/cli/src/drift-from-store.test.ts`, four tests matching the four success clauses one-to-one; observed by gate-4 |
| `uatc_9efe0576a211f525648cbfb7` | the pure source-drift classifier: described → stale, undescribed → demoted, unchanged → fresh | [`source-drift`](source-drift.md) (capability) — `packages/orchestrator/src/proof/source-drift.test.ts`; observed by gate-3 |

Nothing above stopped running. Every assertion still executes under the same four gate commands, and
each capability still greens on its own suite — the deletion removed a *second signature* over that
evidence at the story rung, not the evidence (ADR-0294 D2: "provably lossless").

> **Superseded note (kept as history).** Before 2026-08-03 this section carried those five legs, all
> tagged `witness: machine` in the 2026-07-26 ADR-0209 §8 adjudication and each bound to one of the four
> observe gates below. That adjudication was correct about the *witness* — every success clause
> compiles — and is exactly why the legs are duplicates rather than journey steps: what a package suite
> can assert is the capability rung, not the story rung (ADR-0294 Context; ADR-0295 §Context makes the
> same point about the pre-filtered population the ADR-0247 sweep ran on). This story had zero
> attestation rows and zero verdict rows against those legs, and under ADR-0253 none of them held proof
> credit, so nothing green was lost.

## Existing machine checks

Binding & staleness is **greenfield** (`status: proposed`): its five slices were designed and built
inside this initiative. They landed in four package suites because each slice extends a type or
contract owned there. Those real, passing OFFLINE checks remain useful evidence, but standing tests,
implementation-before-registration, and the absence of a story-named red→green run do not establish
brownfield provenance or license Adopt
([ADR-0395](../../docs/decisions/0395-brown-records-provenance-missing-proof-stays-on-the-greenfie.md)).

The current executable coverage inventory is:

1. **`boundHash` on the signed `Verdict`** — `pnpm --filter @storytree/proof-protocol test` covers the
   optional `boundHash` and backwards-compatible verdict parse in
   `packages/proof-protocol/src/shapes.test.ts`.
2. **The `ChangeStore` append/read parity** — `pnpm --filter @storytree/storage-protocol test` covers
   ordered append/read and the empty log in `packages/storage-protocol/src/change-event-store.test.ts`.
3. **The drift classifiers + gate-emits-change** — `pnpm --filter @storytree/orchestrator test` covers
   source-drift classification plus `verdict.boundHash` and `ChangeEvent` emission.
4. **The store-reading drift path** — `pnpm --filter @storytree/cli test` covers `runDriftFromStore`.
   It deliberately does NOT claim the `storytree drift <unit>` command; that dispatch is not wired.

These checks do not by themselves sign or adopt this greenfield story. The authored rung remains
`proposed`; green remains derived only from current signed proof (ADR-0020 / ADR-0040 / ADR-0395).

## Proof

The story carries the UAT above (ADR-0010 §2); it is proven when that walkthrough holds against the real
engine with the five capabilities' signed verdicts underneath. Per ADR-0020, `healthy` is only ever
DERIVED from signed verdicts — nothing here is author-set healthy.
