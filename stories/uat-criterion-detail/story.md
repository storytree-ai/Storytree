---
id: "uat-criterion-detail"
tier: story
title: "A UAT criterion's detail is a live-canonical Library artifact — pointed-to, hash-anchored, and authorable with the hierarchy"
outcome: "A UAT criterion's detailed acceptance contract is a live-canonical Library artifact the story points to, hash-anchors so a substantive change invalidates stale green, and that story-author may author atomically with the hierarchy."
status: proposed
proof_mode: UAT
# Every UAT leg below is deterministic and machine-witnessed. Absence defaults the story node to
# human (ADR-0040), which would make `story build --real` withhold it dishonestly.
uat_witness: machine
# Immutable arc provenance (ADR-0183): the SECOND landable increment of the `model-uat-promotion` arc
# (ADR-0209, owner-directed 2026-07-17). Increment 1 (`model-uat-witness`) landed the tiered-witness
# DATA + eligibility foundation. THIS story is the DETAIL + ANCHOR + AUTHORITY foundation: the
# per-criterion Library artifact kind (ADR-0209 D5), the story criterion's pointer,
# artifact-hash anchoring that invalidates stale green (ADR-0209 D6), and story-author's authority
# to author the hierarchy↔detail pair atomically. The independent model JUDGE run, the Studio row
# concision, and the three-story pilot migration are LATER arc increments (see "Where this sits in
# the arc") — authored just-in-time as the orchestrator consumes each (slow growth, ADR-0183), NOT
# scaffolded here.
arc: model-uat-promotion
# Packages-forward ownership (ADR-0192): this NEW story owns a NEW workspace package/port,
# `@storytree/uat-criterion` (`packages/uat-criterion`). Every proof-bound source below lives in that
# building. It consumes `@storytree/model-uat` (criterion id / witness / tier — already proven).
# Library KIND_SPECS registration and agent spawn-fence injection are consumer-side glue
# AFTER these proofs — no proof source squats in foreign buildings (ADR-0192).
depends_on: [model-uat-witness]
# Deciding ADRs (ADR-0037 §2): 0209 (D5/D6 — this story's charter); 0307 (D5 — withdrew the
# seed-canonical posture 0209 D5 rested on, so the detail is a LIVE-canonical artifact; supersedes
# the ADR-0055 this story used to cite); 0192 (packages-forward ownership); 0082 (per-test
# UAT criteria — the story still owns the stable criterion id / one-liner); 0010 (organism model +
# splitting-rule).
decisions: [209, 307, 192, 82, 10]
# Capabilities, roots-first (a capability appears after everything it depends on).
capabilities: [uat-detail-kind, criterion-detail-pointer, criterion-detail-hash-anchor, story-author-detail-authority]
# Node-borne STORY-UAT proof config (ADR-0057 / ADR-0092). NET-NEW package: AUTHOR_TEST writes the
# standing UAT against the public `@storytree/uat-criterion` barrel; IMPLEMENT exports the kind /
# pointer / hash / write-scope API. The package suite is the explicit proof command and
# regression wall. No DB, SDK, API, or live model for the leaf proofs — every surviving leg is a
# pure in-process schema / pointer / hash / predicate assertion. Authoring a detail BODY is a live
# `--pg` Library write (ADR-0307 D5) and is deliberately out of this package's proof scope.
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

# A UAT criterion's detail is a live-canonical Library artifact — pointed-to, hash-anchored, and authorable with the hierarchy

**Outcome —** A UAT criterion's detailed acceptance contract is a live-canonical Library artifact the
story points to, hash-anchors so a substantive change invalidates stale green, and that story-author
may author atomically with the hierarchy.

This is the **DETAIL + ANCHOR + AUTHORITY foundation** of the `model-uat-promotion` arc (ADR-0209
increment 2): it creates one Library artifact kind per detailed UAT criterion
(ADR-0209 D5), keeps the story as the authority for the stable criterion id, canonical one-line
title, witness kind, and minimum model tier while the criterion **points** to the detail body,
anchors model/human UAT verdicts to the artifact's revision/hash so a substantive change invalidates
stale green (ADR-0209 D6), and keeps story-author authoring the hierarchy↔detail pair atomically
(ADR-0209 D5).

**Re-pointed by ADR-0307 D5 (2026-08-05).** This story was authored when the detail kind was
**seed-canonical** — authored as a committed file under `apps/studio/data/seed-kinds/uat-criterion/`
and reconciled into the live store. ADR-0307 D5 withdrew that posture wherever ADR-0055 had been
extended, so the detail is now a **live-canonical** Library artifact like every other kind
(ADR-0023 / ADR-0302 D1): a detail body is authored with
`storytree library artifact new|edit <id> --pg`, never as a committed file. Two things are unchanged
and must not be over-read from that: the detail is still ONE artifact per detailed criterion, and
story-author still owns the hierarchy↔detail PAIR and authors it atomically. Only the second half's
MEDIUM moved — from a file write to a live-store write.

It stands on increment 1 (`model-uat-witness`): the criterion already owns classified witness +
tier; this story adds the detail pointer and the hash that later judge/human verdicts will record.
It deliberately does **not** run a model judge, render Studio rows, or migrate pilot stories — each
of those is a later arc increment (see "Where this sits in the arc").

## The journey (why this is ONE story — the journey-principle)

The consumer is a UAT author (story-author) and the deterministic proof machinery that must resolve
the same contract: its goal is *"the detailed acceptance contract for this
criterion is addressable, versioned, and authorable with the story."* Finishing "I've declared the
detail kind and the criterion points to it" leads straight to needing "and a hash anchors green so
a rubric edit invalidates stale attestations" and "and story-author can write the pair without
leaving the fenced authoring surface" — one continuous addressable→anchored→authorable journey
(journey-principle). Its proof shares one precondition (a classified criterion plus its detail
artifact) and one observable (the detail validates, the pointer binds, hash freshness decides,
the author fence holds), so the splitting-rule keeps it whole.

**Studio row concision (ADR-0209 D7) stays OUT.** That is a different consumer (the Studio panel
reader) and a different observable (one-line row + open-detail navigation). The splitting-rule's
first trigger would fire if folded in ("the detail is addressable AND the Studio row is concise").
Default: later `uat-detail-studio` increment, as the arc already planned.

## Design floor (from ADR-0209 D5/D6 — do not re-litigate)

- **Story owns the stable surface; detail owns the procedure.** The story remains the authority for
  the stable criterion id, canonical one-line title, witness kind, and minimum model tier. The
  criterion **points** to a detailed UAT artifact whose body carries the action, success conditions,
  evidence expectations, and references to reusable Library principles/processes (ADR-0209 D5).
- **Live-canonical, like every other kind (ADR-0307 D5).** The detail is a first-class Library
  artifact in the shared store, edited through `storytree library artifact edit <id> --pg`
  (ADR-0023 / ADR-0302 D1). It was authored here as a *seed-canonical* class extending ADR-0055
  beyond agents, on the stated ground that a committed seed let offline builds and CI resolve the
  same proof contract; ADR-0302 D2/D3 retired offline as a supported mode, so that ground
  evaporated and ADR-0307 D5 withdrew the posture. **There is no seed-authored exception left in
  the Library** — a future "author this one in the seed" is a re-decision against ADR-0302 D1, not
  a precedent available from 0055 or 0209.
- **story-author owns the pair.** The `story-author` owns these artifacts together with the hierarchy
  and authors the pair atomically (ADR-0209 D5) — that is unchanged; only the medium of the second
  half moved. The affordance ships with its fence, and the fence is now NARROWER, not wider: the
  file-tool surface admits `stories/**` and nothing else, because the detail half is no longer a
  file at all. It is a live-store write, made through the Library write ceremony rather than
  through the spawn fence.
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
- **Foreign-building squats** — Library `KIND_SPECS` registration and `runSpawnStoryAuthor`
  predicate injection are **consumer-side glue** after this port's proofs land (same posture as
  increment 1's deferred library-parser adapter). Flagged in Ownership below; not proof-bound
  sourceFiles here.

## Capabilities (4)

Listed roots-first (a capability appears after everything it depends on). Each is a **LEAF** — an
isolatable backend red→green in TypeScript under the story-owned `packages/uat-criterion`, armed for
`node build --real` (the orchestrator drives it through the prove-it gate). Schema / pointer / hash /
write-scope are all pure and in-process — no store, no DB, no I/O.

| # | capability | class | outcome | depends on |
|---|---|---|---|---|
| 1 | [`uat-detail-kind`](uat-detail-kind.md) | LEAF | A detailed UAT criterion validates as a structured Library artifact kind whose body carries action, success conditions, evidence expectations, and optional refs to reusable principles/processes — and refuses a malformed or title-redefining body. | — |
| 2 | [`criterion-detail-pointer`](criterion-detail-pointer.md) | LEAF | A story criterion points to its detail artifact by id while the story remains display-canonical for the one-line title; the detail cannot silently redefine that title. | `uat-detail-kind` |
| 3 | [`criterion-detail-hash-anchor`](criterion-detail-hash-anchor.md) | LEAF | A verdict records the detail artifact's content hash; a substantive body change yields a different hash that classifies the prior green as stale. | `criterion-detail-pointer` |
| 4 | [`story-author-detail-authority`](story-author-detail-authority.md) | LEAF | story-author's write-scope predicate admits `stories/**` and fail-closed denies every other path, the retired detail seed surface included. | `uat-detail-kind` |

**Retired: `uat-detail-seed-sync` (ADR-0307 D5, 2026-08-05).** A fifth capability once sat at
position 2 — "the detail kind is seed-canonical: reconcile upserts every seed detail into a target
store and deletes target-only details of that kind". Its outcome is withdrawn by decision, not
merely unbuilt: with no committed seed there is no source store to reconcile FROM, so the
capability has no subject. It never reached `building` and carried no signed verdict, so nothing
proven was destroyed. `packages/uat-criterion/src/detail-seed-sync.ts` was deleted with it under
ADR-0302 D4's "deleted, not left inert" rule.

## Within-story dependency graph

Authored from the intended data-flow (re-derive from the real imports/calls when built, ADR-0010 §3).
The graph is acyclic; `uat-detail-kind` is the root.

- `criterion-detail-pointer` → `uat-detail-kind` — the pointer target must be a valid detail artifact
  id / shape the kind admits.
- `criterion-detail-hash-anchor` → `criterion-detail-pointer` — hashing and stale classification run
  over a criterion that already points at a detail.
- `story-author-detail-authority` → `uat-detail-kind` — the fence's denials are stated in terms of
  this kind's retired seed surface, so the kind constant is still what the predicate is written
  against.

## Ownership and future consumption (ADR-0192 packages-forward)

This NEW story owns the NEW `@storytree/uat-criterion` port at `packages/uat-criterion`; every
`proof.real.sourceFile` and literal `sourceGlobs` entry is under that one building. Package scaffold
+ `repo-manifest.json` `packageOwnership` registration must land before the leaf chain (same bootstrap
as `model-uat-witness`).

Runtime dependencies (honest `depends_on`):

- **`model-uat-witness`** (`@storytree/model-uat`) — criterion id / classified witness / tier already
  proven; the pointer capability binds detail onto that criterion shape without reopening witness
  proofs.

*(`storage-protocol` was a declared dependency for the retired seed-sync reconcile parity. With that
capability withdrawn no source in `packages/uat-criterion` imports the `Store` seam any more, so the
edge is dropped rather than left standing — a `depends_on` edge is a real precondition of this
story's UAT or it is not an edge.)*

**Deferred consumer glue (NOT this story's proof sources):**

- `@storytree/library` registers the kind in `KIND_SPECS` / `KnowledgeKind` and may re-export or adapt
  the port at the write boundary — owned by a library-side integration once the port is green.
- `@storytree/agent` injects this package's write-scope predicate into `runSpawnStoryAuthor` as the
  default `isWriteAllowed`. Since ADR-0307 D5 that predicate is `stories/**`-only, so the injection
  no longer WIDENS anything — it makes the fence the port's single owned definition instead of a
  literal hard-coded in the agent package.
- The `story-author` agent artifact names the fence in its own prose. It is a **live** Library
  artifact now (ADR-0307 D1): edit it with `library artifact edit story-author --pg`, then
  regenerate the committed projections with `pnpm build:guidance && pnpm build:agents`. There is no
  seed edit and no `sync-agents` — both were deleted by ADR-0307 D3.

## UAT Test Criteria

The integrated **acceptance walkthrough** proving the foundation end-to-end against the real public
`@storytree/uat-criterion` barrel. Minimal-first (one coherent addressable→anchored→authorable
journey), defect-driven thereafter. Every leg is **`(witness: machine)`** — deterministic, offline,
spine-observable code (no operator judgment gap).

**Goal —** An author points a classified criterion at a live-canonical detail artifact; the kind
schema, the pointer, hash freshness, and the story-author write fence all agree on the same
contract, and every silent title rewrite and out-of-fence write is refused.

**End state —** a criterion's detailed acceptance contract is addressable as a live-canonical
Library artifact, pointed-to from the story criterion, hash-anchored against stale green, and
authored by story-author as one hierarchy↔detail pair — the hierarchy half inside the `stories/**`
file fence, the detail half as a live `--pg` Library write; every silent title rewrite and
out-of-fence write is refused.

**Two legs are RETIRED IN PLACE (ADR-0307 D5, 2026-08-05).** `uat-2` ("Seed-canonical reconcile is
kind-fenced and idempotent") and `uat-6` ("Offline seed resolve matches the reconciled contract")
are deleted: both proved the seed-canonical posture ADR-0307 D5 withdrew, and neither has a subject
left — there is no committed seed to reconcile from, no reconciler, and ADR-0302 D2 retired offline
as a supported mode. **The surviving numbers are deliberately NOT closed up.** A leg number is
POSITIONAL — `uat-criterion-detail#uat-n` is how a signed verdict names its leg — so renumbering
`3,4,5` down to `2,3,4` would silently re-point every already-signed verdict onto a different leg,
reporting nothing (`asset:edit-story-uat-criteria`). `2` and `6` are burned: never reused, never
backfilled. The single reliability gate below is likewise NOT renumbered. The matching legs in
`packages/uat-criterion/src/uat-criterion-detail.uat.test.ts` are retired the same way, with the
same reasoning recorded at each dead number.

1. **The detail kind validates through the public port.** _(witness: machine)_ _(proof-gate: uat-criterion-detail#gate-1)_ Import the detail kind schema and constructors from the `@storytree/uat-criterion` ROOT barrel. Author one well-formed detail (action, success, evidence, optional principle/process refs) and one malformed body. **Success —** the well-formed detail round-trips; the malformed body is refused at the schema boundary; the public barrel exports the kind API (an empty barrel fails this leg). _(criterion-id: uatc_d268988b76cc97f4062a1a89)_ _(revision-id: uatr1:f2b794579202afb9)_
3. **The criterion points; the story title stays display-canonical.** _(witness: machine)_ _(proof-gate: uat-criterion-detail#gate-1)_ Bind a `model-uat` criterion (stable id + one-line title + witness/tier) to a detail artifact id. **Success —** the pointer resolves; reading display title still returns the story-owned one-liner; a detail body that attempts to override/redefine that title is refused or ignored as non-canonical (ADR-0209 D5/D6). _(criterion-id: uatc_bf69e4808c36de985a653b5f)_ _(revision-id: uatr1:10f071b49430716a)_
4. **A substantive detail change invalidates the prior hash.** _(witness: machine)_ _(proof-gate: uat-criterion-detail#gate-1)_ Hash a detail; record that hash as a prior green anchor; change a proof-bearing field (action / success / evidence / refs); re-hash. **Success —** the new hash differs and the prior green is classified stale; an identical body keeps the same hash (fresh). The story title alone does not participate in the hash (display-canonical, not proof body). _(criterion-id: uatc_80f74d7a8665e86ac9b7e456)_ _(revision-id: uatr1:52bf945c061caeb5)_
5. **story-author's fence admits the hierarchy and denies every other path.** _(witness: machine)_ _(proof-gate: uat-criterion-detail#gate-1)_ Exercise the write-scope predicate. **Success —** paths under `stories/**` are permitted; a write to this kind's retired detail seed path, to another Library kind's seed path, to `packages/**`, or to `docs/decisions/**` is denied fail-closed. Since ADR-0307 D5 the predicate admits exactly ONE root: the pair is still authored atomically, but the detail half is a live `--pg` Library write rather than a file, so no corpus path is admitted at all (affordance paired with fence). _(criterion-id: uatc_0363c1663a4f1b1ee4ced499)_ _(previous-revision-id: uatr1:811298e08a5c1418)_ _(revision-id: uatr1:3b13130af04cd85c)_

## Reliability Gates

The story's four UAT criteria are deterministic package behaviour and bind explicitly to ONE real,
command-bearing observe gate (ADR-0082/0085/0106). The gate does not forge per-test rows: during
Adopt, the spine runs the declared command at a clean committed HEAD, validates every exact
`proof-gate` binding first (no fallback / no partial signing), and then mints one `adopted` verdict per
criterion only when the command is green.

1. **The public uat-criterion port suite is green** _(gate: observe)_ `pnpm --filter @storytree/uat-criterion test`.
   The spine observes the real package suite: detail-kind schema, criterion pointer +
   display-canonical title, hash freshness / stale classification, and the story-author write-scope
   predicate. It then signs
   `uat-criterion-detail#gate-1`; all four machine criteria above bind to this exact command-bearing
   gate.

Run from a clean committed rebuilt HEAD:
`pnpm storytree adopt uat-criterion-detail --signer <email> --pg`. Because the story is `proposed`,
Adopt may be rerun (ADR-0097); it observes the package command once, signs the gate, then signs
`uat-criterion-detail#uat-1`, `#uat-3`, `#uat-4` and `#uat-5` against their exact binding — the
retired `#uat-2` and `#uat-6` are named nowhere and are not backfilled. No criterion is switched
human, and no signed row is authored by hand.

## Proof

The story carries the UAT above (ADR-0010 §2). Package scaffold + ownership registration land first;
then the four leaf capabilities chain roots-first through `node build --real`; then the story UAT +
Adopt observe the public barrel. Per ADR-0020, `healthy` is only ever DERIVED from signed verdicts;
the authored status stays `proposed`. The whole-story UAT remains explicitly `uat_witness: machine`.

## Where this sits in the arc — the dependency order for the planner

The `model-uat-promotion` arc (ADR-0209) is a multi-increment epic; this story is increment 2. Honest
build order:

1. **`model-uat-witness`** (landed) — tiered-witness DATA + eligibility foundation.
2. **`uat-criterion-detail`** (THIS story) — the detail kind, pointer, hash anchor, and
   story-author authority. Pure LEAF proofs in `packages/uat-criterion`; then consumer glue into
   library / agent.
3. **`model-judged-uat`** (later) — independent model judge + spine signing + escalation; depends on
   1 + 2 (verdict anchored to artifact hash).
4. **`uat-detail-studio`** (later) — Studio row concision (ADR-0209 D7); depends on 2.
5. **`model-uat-pilot`** (later) — three-story pilot migration (ADR-0209 D8); depends on 1 + 2 + 3
   (+ 4).
