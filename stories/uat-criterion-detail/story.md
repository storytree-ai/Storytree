---
id: "uat-criterion-detail"
tier: story
title: "A UAT criterion's detail is a seed-canonical Library artifact — pointed-to, hash-anchored, and authorable with the hierarchy"
outcome: "A UAT criterion's detailed acceptance contract is a seed-canonical Library artifact the story points to, hash-anchors so a substantive change invalidates stale green, and that story-author may author atomically with the hierarchy."
status: proposed
proof_mode: UAT
# Every UAT leg below is deterministic and machine-witnessed. Absence defaults the story node to
# human (ADR-0040), which would make `story build --real` withhold it dishonestly.
uat_witness: machine
# Immutable arc provenance (ADR-0183): the SECOND landable increment of the `model-uat-promotion` arc
# (ADR-0209, owner-directed 2026-07-17). Increment 1 (`model-uat-witness`) landed the tiered-witness
# DATA + eligibility foundation. THIS story is the DETAIL + ANCHOR + AUTHORITY foundation: the
# seed-canonical per-criterion Library artifact kind (ADR-0209 D5), the story criterion's pointer,
# artifact-hash anchoring that invalidates stale green (ADR-0209 D6), and story-author's authority
# to author the hierarchy↔detail pair atomically. The independent model JUDGE run, the Studio row
# concision, and the three-story pilot migration are LATER arc increments (see "Where this sits in
# the arc") — authored just-in-time as the orchestrator consumes each (slow growth, ADR-0183), NOT
# scaffolded here.
arc: model-uat-promotion
# Packages-forward ownership (ADR-0192): this NEW story owns a NEW workspace package/port,
# `@storytree/uat-criterion` (`packages/uat-criterion`). Every proof-bound source below lives in that
# building. It consumes `@storytree/model-uat` (criterion id / witness / tier — already proven) and
# `@storytree/storage-protocol` (Store seam for seed-canonical reconcile). Library KIND_SPECS
# registration, CLI sync command wiring, and agent spawn-fence injection are consumer-side glue
# AFTER these proofs — no proof source squats in foreign buildings (ADR-0192).
depends_on: [model-uat-witness, storage-protocol]
# Deciding ADRs (ADR-0037 §2): 0209 (D5/D6 — this story's charter); 0055 (seed-canonical exception
# widened to a class that now includes this kind); 0192 (packages-forward ownership); 0082 (per-test
# UAT criteria — the story still owns the stable criterion id / one-liner); 0010 (organism model +
# splitting-rule).
decisions: [209, 55, 192, 82, 10]
# Capabilities, roots-first (a capability appears after everything it depends on).
capabilities: [uat-detail-kind, uat-detail-seed-sync, criterion-detail-pointer, criterion-detail-hash-anchor, story-author-detail-authority]
# Node-borne STORY-UAT proof config (ADR-0057 / ADR-0092). NET-NEW package: AUTHOR_TEST writes the
# standing UAT against the public `@storytree/uat-criterion` barrel; IMPLEMENT exports the kind /
# sync / pointer / hash / write-scope API. The package suite is the explicit proof command and
# regression wall. No DB, SDK, API, or live model for the leaf proofs; the seed-canonical reconcile
# is proven offline against InMemoryStore (the live `--pg` CLI check is consumer glue + the
# established WARN-only gate-tail pattern, ADR-0055).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/uat-criterion", "test"]
  scope:
    testGlobs: ["packages/uat-criterion/src/uat-criterion-detail.uat.test.ts"]
    sourceGlobs: ["packages/uat-criterion/src/index.ts"]
  real:
    testFile: "packages/uat-criterion/src/uat-criterion-detail.uat.test.ts"
    sourceFile: "packages/uat-criterion/src/index.ts"
    scope:
      testGlobs: ["packages/uat-criterion/src/uat-criterion-detail.uat.test.ts"]
      sourceGlobs: ["packages/uat-criterion/src/index.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/uat-criterion", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/uat-criterion", "typecheck"]
---

# A UAT criterion's detail is a seed-canonical Library artifact — pointed-to, hash-anchored, and authorable with the hierarchy

**Outcome —** A UAT criterion's detailed acceptance contract is a seed-canonical Library artifact the
story points to, hash-anchors so a substantive change invalidates stale green, and that story-author
may author atomically with the hierarchy.

This is the **DETAIL + ANCHOR + AUTHORITY foundation** of the `model-uat-promotion` arc (ADR-0209
increment 2): it creates one seed-canonical Library artifact kind per detailed UAT criterion
(ADR-0209 D5), keeps the story as the authority for the stable criterion id, canonical one-line
title, witness kind, and minimum model tier while the criterion **points** to the detail body,
anchors model/human UAT verdicts to the artifact's revision/hash so a substantive change invalidates
stale green (ADR-0209 D6), and extends story-author's write authority so the hierarchy↔detail pair
can be authored atomically (ADR-0209 D5).

It stands on increment 1 (`model-uat-witness`): the criterion already owns classified witness +
tier; this story adds the detail pointer and the hash that later judge/human verdicts will record.
It deliberately does **not** run a model judge, render Studio rows, or migrate pilot stories — each
of those is a later arc increment (see "Where this sits in the arc").

## The journey (why this is ONE story — the journey-principle)

The consumer is a UAT author (story-author) and the deterministic proof machinery that must resolve
the same contract offline and in CI: its goal is *"the detailed acceptance contract for this
criterion is addressable, versioned, and authorable with the story."* Finishing "I've declared the
detail kind and the criterion points to it" leads straight to needing "and a hash anchors green so
a rubric edit invalidates stale attestations" and "and story-author can write the pair without
leaving the fenced authoring surface" — one continuous addressable→anchored→authorable journey
(journey-principle). Its proof shares one precondition (a classified criterion plus its detail
artifact) and one observable (detail resolves from seed, pointer binds, hash freshness decides,
author fence admits the pair), so the splitting-rule keeps it whole.

**Studio row concision (ADR-0209 D7) stays OUT.** That is a different consumer (the Studio panel
reader) and a different observable (one-line row + open-detail navigation). The splitting-rule's
first trigger would fire if folded in ("detail is seed-canonical AND the Studio row is concise").
Default: later `uat-detail-studio` increment, as the arc already planned.

## Design floor (from ADR-0209 D5/D6 — do not re-litigate)

- **Story owns the stable surface; detail owns the procedure.** The story remains the authority for
  the stable criterion id, canonical one-line title, witness kind, and minimum model tier. The
  criterion **points** to a detailed UAT artifact whose body carries the action, success conditions,
  evidence expectations, and references to reusable Library principles/processes (ADR-0209 D5).
- **Seed-canonical class, not a one-off.** This kind is seed-canonical and reconciled into the live
  Library, extending ADR-0055's seed-canonical exception beyond agents so offline builds and CI
  resolve the same proof contract (ADR-0209 D5). Live-canonical kinds stay live-canonical.
- **story-author owns the pair.** The `story-author` owns these artifacts together with the hierarchy
  and may author the pair atomically (ADR-0209 D5). The affordance ships with its fence: only the
  detail-kind seed surface (+ `stories/**`) — never arbitrary Library kinds, never `--pg` live writes,
  never implementation packages.
- **Hash-anchor invalidates stale green.** A model or human UAT verdict records the referenced
  artifact revision/hash. Any substantive artifact change invalidates the old green. The story title
  remains display-canonical; the artifact may not silently redefine it (ADR-0209 D6).

## Scope boundary — what this story does NOT do (later arc increments)

Held out deliberately (each is its own journey — splitting-rule trigger 1 — authored just-in-time,
not scaffolded here):

- **`model-judged-uat`** — the independent, fresh, read-only model judge run + spine
  validation/signing + escalation ladder (ADR-0209 D3/D4). Consumes this story's hash anchor; does
  not belong in the detail-authoring journey.
- **`uat-detail-studio`** — Studio one-liner row concision + open-Library-detail (ADR-0209 D7).
- **`model-uat-pilot`** — classifying and detailing the three pilot stories (ADR-0209 D8).
- **Reopening `model-uat-witness`** — witness/tier/registry stay as landed; this story consumes them
  through `@storytree/model-uat`, it does not re-author those proofs.
- **Foreign-building squats** — Library `KIND_SPECS` registration, `storytree library sync-…`
  CLI command, `check:…-sync` gate-tail, and `runSpawnStoryAuthor` predicate injection are
  **consumer-side glue** after this port's proofs land (same posture as increment 1's deferred
  library-parser adapter). Flagged in Ownership below; not proof-bound sourceFiles here.

## Capabilities (5)

Listed roots-first (a capability appears after everything it depends on). Each is a **LEAF** — an
isolatable backend red→green in TypeScript under the story-owned `packages/uat-criterion`, armed for
`node build --real` (the orchestrator drives it through the prove-it gate). Schema / pointer / hash /
write-scope are pure offline; seed-sync is offline against `InMemoryStore` (storage-protocol).

| # | capability | class | outcome | depends on |
|---|---|---|---|---|
| 1 | [`uat-detail-kind`](uat-detail-kind.md) | LEAF | A detailed UAT criterion validates as a structured Library artifact kind whose body carries action, success conditions, evidence expectations, and optional refs to reusable principles/processes — and refuses a malformed or title-redefining body. | — |
| 2 | [`uat-detail-seed-sync`](uat-detail-seed-sync.md) | LEAF | The detail kind is seed-canonical: reconcile upserts every seed detail into a target store and deletes target-only details of that kind, touching no other kind, idempotently. | `uat-detail-kind` |
| 3 | [`criterion-detail-pointer`](criterion-detail-pointer.md) | LEAF | A story criterion points to its detail artifact by id while the story remains display-canonical for the one-line title; the detail cannot silently redefine that title. | `uat-detail-kind` |
| 4 | [`criterion-detail-hash-anchor`](criterion-detail-hash-anchor.md) | LEAF | A verdict records the detail artifact's content hash; a substantive body change yields a different hash that classifies the prior green as stale. | `criterion-detail-pointer` |
| 5 | [`story-author-detail-authority`](story-author-detail-authority.md) | LEAF | story-author's write-scope predicate admits `stories/**` and the detail-kind seed surface together, and fail-closed denies every other Library kind and non-hierarchy path. | `uat-detail-kind` |

## Within-story dependency graph

Authored from the intended data-flow (re-derive from the real imports/calls when built, ADR-0010 §3).
The graph is acyclic; `uat-detail-kind` is the root.

- `uat-detail-seed-sync` → `uat-detail-kind` — reconcile only touches docs whose `kind` is the detail
  kind the root schema defines.
- `criterion-detail-pointer` → `uat-detail-kind` — the pointer target must be a valid detail artifact
  id / shape the kind admits.
- `criterion-detail-hash-anchor` → `criterion-detail-pointer` — hashing and stale classification run
  over a criterion that already points at a detail.
- `story-author-detail-authority` → `uat-detail-kind` — the write fence names the detail-kind seed
  surface; without the kind there is no lawful second path beside `stories/**`.

## Ownership and future consumption (ADR-0192 packages-forward)

This NEW story owns the NEW `@storytree/uat-criterion` port at `packages/uat-criterion`; every
`proof.real.sourceFile` and literal `sourceGlobs` entry is under that one building. Package scaffold
+ `repo-manifest.json` `packageOwnership` registration must land before the leaf chain (same bootstrap
as `model-uat-witness`).

Runtime dependencies (honest `depends_on`):

- **`model-uat-witness`** (`@storytree/model-uat`) — criterion id / classified witness / tier already
  proven; the pointer capability binds detail onto that criterion shape without reopening witness
  proofs.
- **`storage-protocol`** — `Store` / `InMemoryStore` for the seed-canonical reconcile parity (the same
  seam `sync-agents` uses under library/store).

**Deferred consumer glue (NOT this story's proof sources):**

- `@storytree/library` registers the kind in `KIND_SPECS` / `KnowledgeKind` and may re-export or adapt
  the port at the write boundary — owned by a library-side integration once the port is green.
- `@storytree/cli` gains `sync-…` / WARN-only `check:…-sync` for the kind (ADR-0055 posture).
- `@storytree/agent` injects this package's write-scope predicate into `runSpawnStoryAuthor` (replacing
  the hard-coded `stories/**`-only default) and the seed-canonical `story-author` agent artifact is
  updated to name the widened fence — agent-tier seed edit + `sync-agents`, not a squat in
  `packages/agent` proof sources here.

## UAT Test Criteria

The integrated **acceptance walkthrough** proving the foundation end-to-end against the real public
`@storytree/uat-criterion` barrel. Minimal-first (one coherent addressable→anchored→authorable
journey), defect-driven thereafter. Every leg is **`(witness: machine)`** — deterministic, offline,
spine-observable code (no operator judgment gap).

**Goal —** An author points a classified criterion at a seed-canonical detail artifact; offline
resolve + reconcile + hash freshness + the story-author write fence all agree on the same contract,
and every silent title rewrite, cross-kind sync clobber, or out-of-fence Library write is refused.

1. **The detail kind validates through the public port.** _(witness: machine)_ _(proof-gate: uat-criterion-detail#gate-1)_ Import the detail kind schema and constructors from the `@storytree/uat-criterion` ROOT barrel. Author one well-formed detail (action, success, evidence, optional principle/process refs) and one malformed body. **Success —** the well-formed detail round-trips; the malformed body is refused at the schema boundary; the public barrel exports the kind API (an empty barrel fails this leg).
2. **Seed-canonical reconcile is kind-fenced and idempotent.** _(witness: machine)_ _(proof-gate: uat-criterion-detail#gate-1)_ Reconcile a seed store holding two detail artifacts into a target that also holds a stale detail-of-this-kind and an unrelated other-kind doc. **Success —** both seed details are upserted, the stale detail-of-this-kind is deleted, the other-kind doc is untouched; a second reconcile is a no-op (`inSync`); only the detail kind is read or written (ADR-0209 D5 / ADR-0055 class extension).
3. **The criterion points; the story title stays display-canonical.** _(witness: machine)_ _(proof-gate: uat-criterion-detail#gate-1)_ Bind a `model-uat` criterion (stable id + one-line title + witness/tier) to a detail artifact id. **Success —** the pointer resolves; reading display title still returns the story-owned one-liner; a detail body that attempts to override/redefine that title is refused or ignored as non-canonical (ADR-0209 D5/D6).
4. **A substantive detail change invalidates the prior hash.** _(witness: machine)_ _(proof-gate: uat-criterion-detail#gate-1)_ Hash a detail; record that hash as a prior green anchor; change a proof-bearing field (action / success / evidence / refs); re-hash. **Success —** the new hash differs and the prior green is classified stale; an identical body keeps the same hash (fresh). The story title alone does not participate in the hash (display-canonical, not proof body).
5. **story-author's fence admits the pair and denies the rest.** _(witness: machine)_ _(proof-gate: uat-criterion-detail#gate-1)_ Exercise the write-scope predicate. **Success —** paths under `stories/**` and the detail-kind seed surface are permitted; a write to another Library kind's seed path, to `packages/**`, or to an unrelated path is denied fail-closed (ADR-0209 D5 — affordance paired with fence).
6. **Offline seed resolve matches the reconciled contract.** _(witness: machine)_ _(proof-gate: uat-criterion-detail#gate-1)_ Resolve a criterion's detail from the seed store after reconcile. **Success —** the same detail id, body, and content hash are observable without a live DB — the CI/offline reproducibility ADR-0209 D5 requires.

End state — a criterion's detailed acceptance contract is addressable as a seed-canonical artifact,
pointed-to from the story criterion, hash-anchored against stale green, and authorable under
story-author's widened-but-fenced authority; every silent title rewrite, cross-kind clobber, and
out-of-fence write is refused.

## Reliability Gates

The story's six UAT criteria are deterministic package behaviour and bind explicitly to ONE real,
command-bearing observe gate (ADR-0082/0085/0106). The gate does not forge per-test rows: during
Adopt, the spine runs the declared command at a clean committed HEAD, validates every exact
`proof-gate` binding first (no fallback / no partial signing), and then mints one `adopted` verdict per
criterion only when the command is green.

1. **The public uat-criterion port suite is green** _(gate: observe)_ `pnpm --filter @storytree/uat-criterion test`.
   The spine observes the real package suite: detail-kind schema, seed-canonical kind-fenced
   reconcile, criterion pointer + display-canonical title, hash freshness / stale classification,
   story-author write-scope predicate, and offline seed resolve. It then signs
   `uat-criterion-detail#gate-1`; all six machine criteria above bind to this exact command-bearing
   gate.

Run from a clean committed rebuilt HEAD:
`pnpm storytree adopt uat-criterion-detail --signer <email> --pg`. Because the story is `proposed`,
Adopt may be rerun (ADR-0097); it observes the package command once, signs the gate, then signs
`uat-criterion-detail#uat-1` through `#uat-6` against their exact binding. No criterion is switched
human, and no signed row is authored by hand.

## Proof

The story carries the UAT above (ADR-0010 §2). Package scaffold + ownership registration land first;
then the five leaf capabilities chain roots-first through `node build --real`; then the story UAT +
Adopt observe the public barrel. Per ADR-0020, `healthy` is only ever DERIVED from signed verdicts;
the authored status stays `proposed`. The whole-story UAT remains explicitly `uat_witness: machine`.

## Where this sits in the arc — the dependency order for the planner

The `model-uat-promotion` arc (ADR-0209) is a multi-increment epic; this story is increment 2. Honest
build order:

1. **`model-uat-witness`** (landed) — tiered-witness DATA + eligibility foundation.
2. **`uat-criterion-detail`** (THIS story) — seed-canonical detail kind, pointer, hash anchor,
   story-author authority. Offline LEAF proofs in `packages/uat-criterion`; then consumer glue into
   library / cli / agent.
3. **`model-judged-uat`** (later) — independent model judge + spine signing + escalation; depends on
   1 + 2 (verdict anchored to artifact hash).
4. **`uat-detail-studio`** (later) — Studio row concision (ADR-0209 D7); depends on 2.
5. **`model-uat-pilot`** (later) — three-story pilot migration (ADR-0209 D8); depends on 1 + 2 + 3
   (+ 4).
