---
id: "binding-staleness"
tier: story
title: "Binding & staleness — make drift real on live units"
outcome: "A proven unit carries the content-hash of the code it proved, the gate records change events as code moves, and `storytree drift <unit>` reads a unit's stored anchor + change log from the store and classifies fresh | stale | drifted-undescribed — so staleness is a real, lazy signal on live units, never an explicit-args toy."
status: mapped
proof_mode: UAT
capabilities: [boundhash-on-verdict, change-event-store, source-drift, gate-emits-change, drift-reads-store]
# Cross-story edge (ADR-0010 §4 / ADR-0058): this story extends and is CONSUMED BY the drive's proof
# path — its first unit adds a field to drive-machinery's signed `Verdict` (packages/core/src/proof.ts)
# and `gate-emits-change` edits drive-machinery's prove-it-gate (packages/orchestrator/src/prove-it-gate.ts).
# The drive's own UAT does not need this story's outcome (binding is purely additive/optional on the
# gate), so the direction is binding-staleness → drive-machinery, acyclic.
depends_on: [drive-machinery]
# Deciding ADR (ADR-0037 §2): the knowledge↔code binding & staleness model (16). gate-emits-change also
# stands on the prove-it-gate honesty walls (20).
decisions: [16]
---

# Binding & staleness — make drift real on live units

**Outcome —** A proven unit carries the content-hash of the code it proved, the gate records change
events as code moves, and `storytree drift <unit>` reads a unit's stored anchor + change log from the
store and classifies **fresh | stale | drifted-undescribed** — so staleness is a real, lazy signal on
live units, never an explicit-args toy.

**Depends on —** [`drive-machinery`](../drive-machinery/story.md)

This is the story home for the offline-provable slices that wire [ADR-0016](../../docs/decisions/0016-knowledge-code-binding-and-staleness.md)'s
**binding/staleness engine** into the proof + store path. The engine itself is LANDED
([`packages/core/src/anchor.ts`](../../packages/core/src/anchor.ts): the re-anchorable `Anchor`, the
`hashSpan` FNV-1a content fingerprint seam, `ChangeEvent`/`isDescribed`, and the pure
`classifyDrift → DriftFlag`; [`packages/cli/src/drift.ts`](../../packages/cli/src/drift.ts): the
`storytree drift` surface). But today `storytree drift` runs on **explicit `--bound`/`--change` args**
because **no live unit carries a stored anchor**. These capabilities close that gap: a verdict learns
WHAT code it proved (`boundHash`), the store gains a typed change-event contract, the gate emits change
events as it (re)proves, and the CLI reads a unit's stored binding instead of demanding explicit args.

## Honest status

**`mapped` (greenfield slices on a brownfield engine), NOT `healthy`.** Each capability is a single,
offline-provable change to an existing file (plus one net-new pure classifier), each driveable through
the **inner loop** — a spec-borne `proof:` block ([ADR-0057](../../docs/decisions/0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md))
makes the node buildable, and the prove-it-gate observes a genuine red→green and signs a verdict. The
story flips toward `healthy` per-unit as each lands a signed verdict. The `proposed` pockets, recorded
below, are the **DB-backed half** deliberately split to a parallel session.

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
| 1 | [`boundhash-on-verdict`](boundhash-on-verdict.md) | The signed `Verdict` records the content-hash of the span it proved, so a verdict knows WHAT code it proved. | edit-existing `core/proof.ts` | — |
| 2 | [`change-event-store`](change-event-store.md) | The store gains a typed append/read contract for `ChangeEvent`s, proven via a reusable parity suite (offline; the pg adapter is a parallel follow-on). | edit-existing `core/store.ts` | — |
| 3 | [`source-drift`](source-drift.md) | A pure classifier mirrors `classifyDrift` over the `derives_from` DAG — an upstream ADR/artifact changed → source-drift. | net-new `core/source-drift.ts` | — |
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

## Story UAT

The integrated acceptance walkthrough proving the organism's outcome end to end: a proven unit's drift
becomes real and lazy.

**Goal —** Prove that a unit can carry a binding, the gate records what code it proved and emits change
events as that code moves, and `storytree drift <unit>` reads the stored binding + change log and
classifies it — refusing to re-UAT on a cosmetic/undescribed change.

1. **A verdict records its code.** A signed `Verdict` carries the `boundHash` of the span it proved.
   **Success —** the field round-trips through the schema; a verdict without it still parses (back-compat).
   *(proven by `boundhash-on-verdict`)*
2. **The store holds change events.** The `ChangeStore` contract appends + reads `ChangeEvent`s, held to
   a reusable parity bar. **Success —** the parity suite is green against `InMemoryStore`.
   *(proven by `change-event-store`)*
3. **The gate emits as it proves.** When a unit is (re)proven with a binding, the gate stamps
   `verdict.boundHash` and emits a `ChangeEvent`; without a binding it signs exactly as before.
   **Success —** the orchestrator test observes both. *(proven by `gate-emits-change`)*
4. **Drift reads the store.** `storytree drift <unit>` reads the unit's stored anchor + change log and
   classifies fresh | stale | drifted-undescribed — no explicit `--bound`/`--change`. **Success —** the
   three states are distinguished from `InMemoryStore` data. *(proven by `drift-reads-store`)*
5. **Source-drift too.** A pure classifier flags an artifact whose upstream `derives_from` source changed.
   **Success —** described change → stale, undescribed → demoted, unchanged → fresh. *(proven by `source-drift`)*

End state — staleness is a real, lazy, described-change-gated signal computed from a unit's stored
binding + change log, never a blanket re-UAT and never an explicit-args toy.

> **HONEST status —** this story's own UAT is a HUMAN-witnessed ceremony (`uat_witness` undeclared →
> human, the fail-closed default, ADR-0040): a `story build --real` builds the five capabilities and
> WITHHOLDS this story node. Each capability earns its signed verdict through the gate; the story flips
> toward `healthy` only when a human witnesses the integrated walkthrough above.

## Proof

The story carries the UAT above (ADR-0010 §2); it is proven when that walkthrough holds against the real
engine with the five capabilities' signed verdicts underneath. Per ADR-0020, `healthy` is only ever
DERIVED from signed verdicts — nothing here is author-set healthy.
