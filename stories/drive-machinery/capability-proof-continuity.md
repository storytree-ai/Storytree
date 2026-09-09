---
id: "capability-proof-continuity"
tier: capability
story: drive-machinery
arc: rendering-engine-structure-arc
title: "A capability rename resolves its original proof without refreshing it"
outcome: "A reader resolving a reviewed capability rename receives its unchanged original evidence with an explicit qualification of that evidence against the current obligation."
status: proposed
proof_mode: integration-test
depends_on: [work-verdict-event-log]
decisions: [559, 40, 253, 416]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/orchestrator", "test"]
  scope:
    testGlobs: ["packages/orchestrator/src/proof/capability-continuity.test.ts"]
    sourceGlobs: ["packages/orchestrator/src/proof/capability-continuity.ts"]
  real:
    testFile: "packages/orchestrator/src/proof/capability-continuity.test.ts"
    sourceFile: "packages/orchestrator/src/proof/capability-continuity.ts"
    scope:
      testGlobs: ["packages/orchestrator/src/proof/capability-continuity.test.ts"]
      sourceGlobs: ["packages/orchestrator/src/proof/capability-continuity.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "typecheck"]
---

# A capability rename resolves its original proof without refreshing it

**Outcome —** A reader resolving a reviewed capability rename receives its unchanged original
evidence with an explicit qualification of that evidence against the current obligation.

**Proof status — `proposed`, unproven until the deterministic spine observes the real red→green.**
The source and its test are net-new. The historical renderer signature is input evidence to this
work, never a signature for this capability; an offline fixture resembling it is never live evidence.

## Proof walkthrough (written first)

Given raw capability specifications, a reviewed continuation record and original typed work/signing
events, an independent machine test reads one continuation result:

1. Resolve a one-to-one rename whose only specification differences are the allowed identity and
   display fields, after validating the raw identities, capability tier and shared story. Observe
   admission of the identity continuation.
2. Supply each signing event's own historical raw specification at that event's signed SHA. An
   unchanged historical obligation receives its own qualification; a changed, unavailable or
   identity-mismatched historical obligation remains visible as history with its reason. Observe
   explicit unchecked provenance and unchecked lifecycle. Any current-proof candidate is evidence
   only, conditional on BOTH caller provenance verification and application of the existing
   retirement/reset lifecycle; returning it does not establish current lifecycle status.
3. Put a newer failing or ineligible signing event after an older eligible pass. Observe that the
   newer signing event remains the latest evidence and no older pass is offered as its replacement.
4. Supply real initial and repeated phase work marks at distinct sequences plus their same-ID
   signature. Observe admission and read every original occurrence, ID and binding field back
   unchanged, including absent fields. A stale code binding stays stale and an unbound verdict
   stays unbound.
5. Run the existing exact-ID fold over original events: ordinary building marks after a pass
   preserve proof, pass followed by retirement is `retired`, and pass followed by retirement then
   building is `building` until a fresh signature. Observe that the classifier preserves these
   work records and leaves lifecycle unchecked even when it returns an unchanged-pass candidate.
6. Attempt an ambiguous, chained, split, missing-target or non-capability mapping, duplicate or
   conflicting snapshot bindings (including repeated snapshot `eventId` keys), duplicate SIGNING
   IDs (including malformed/conflicting signing records), and relevant source/target sequence ties.
   Observe an explicit refusal with no conditional current-proof candidate.

The common precondition is the supplied specification/event snapshot set. The observable is the
resolver's discriminated admission result, per-event qualification, latest evidence and conditional
current-proof candidate, with provenance and lifecycle explicitly unchecked. The candidate establishes
no current lifecycle status; this walkthrough proves no CLI glyph, story crown, new signature or
persisted mapping.

## Guidance

ADR-0559 is the agent-derived engineering decision. The implementation is one pure read model in
`packages/orchestrator/src/proof/capability-continuity.ts`. It consumes the existing
[`work-verdict-event-log`](work-verdict-event-log.md) event protocol (`RollupEvent`, with event
identity retained by the input record) and validates signing documents with the real `Verdict`
schema. It returns original evidence plus qualification; it never rewrites a verdict's `unitId` to
make the existing exact-ID fold accept it.

**One metadata spelling: `proof_continuity`.** An optional capability frontmatter record carries
`version: 1`, `fromId`, `reviewedAt`, `reviewedBy`, `rationale`,
`renameAnchor: { commitSha, specPath, specSource }`, and
`evidenceSnapshots: [{ eventId, commitSha, specPath, specSource }]`. The enclosing capability supplies
the target ID and current raw specification. Complete current hierarchy records are supplied to
check duplicate identity use and continuation chains. The record contains raw specification
snapshots, never copied verdicts. Missing or malformed review/provenance fields refuse admission;
the resolver cannot infer a reviewer or ratification from the fact that a rename was requested.

**Two checks, with different subjects.** First compare the source specification at the reviewed
rename anchor to the current target specification: this decides whether the rename itself changes
an obligation. Then compare EACH original signing event's specification snapshot to the current
target obligation. Snapshot `eventId` is a SIGNING-stream key: the second lookup is keyed by that
signing event's exact ID and signed `commitSha`, never a same-ID work mark or the newest convenient
source snapshot. Admission of the rename says nothing about the age or relevance of an earlier proof.

Before stripping or normalizing any identity, validate the rename-anchor raw specification's `id`
against `fromId`, the current raw specification's `id` against the selected target ID, and EACH
historical raw specification's `id` against its original signed `verdict.unitId`. All must have
`tier: capability` and the selected target's story, consistent with the supplied hierarchy. An anchor
or current-target identity/tier/story mismatch refuses admission; a historical mismatch is explicitly
`unresolved`, retains that event as history and cannot supply a candidate. Normalization cannot make
a snapshot for another identity or story qualify.

Refuse duplicate or conflicting snapshot bindings, including repeated `eventId` entries even when
their SHA/path/bytes agree, duplicate SIGNING IDs in the supplied stream, and sequence ties among
relevant source/target events, including work and signing events. Check signing-ID duplication
before schema-validity filtering, so malformed or conflicting signing records cannot evade refusal.
These ambiguities produce an explicit refusal with no candidate or arbitrarily selected latest event.
No `.find`, overwrite, input-order winner or secondary tie-break may resolve an ambiguous binding or
ordering.

Work IDs are correlation IDs, not unique occurrence keys. The real `workEvent` in
`packages/orchestrator/src/proof/rollup.ts` and `phaseActivityWriter` in
`packages/drive/src/phase-activity.ts` give the initial building mark and every phase mark the same
`runId:unitId`; the signature may legitimately carry that ID too. `PgWorkStore.readEvents` in
`packages/orchestrator/src/store/pg-work-store.ts` retains those records and IDs, assigning distinct
sequences in its merged stream rather than relying on the tables' independent sequences. Repeated
work IDs, including repeats within the same kind at distinct supplied sequences and a work/signing
ID match, do not make signing snapshot lookup ambiguous. Preserve every original occurrence and ID;
never deduplicate or relabel work records to satisfy a uniqueness check. The resolver consumes the
supplied sequence order and does not reproduce the store's merge or repair tied sequences.

The version-1 comparison conservatively canonicalizes raw specifications. Only explicit self-ID and
display normalization is allowed: the frontmatter `id`, frontmatter `title`, and the document's
matching display heading may differ; `proof_continuity` itself is metadata, not an obligation.
The sole prose-command exception is the self-ID argument token in the exact inline-code command
`storytree coverage <self-id>`: that token may follow the capability's ID so its live coverage
instruction still addresses the renamed node. Match only that complete command and the enclosing
specification's own ID. Do not normalize another command, additional arguments, an unrelated ID,
or a self-ID appearing in an arbitrary assertion. This exception rewrites no command in `proof:`.
There is no global string substitution, semantic paraphrase matching, or dropping a section because
its current title is unfamiliar. Preserve all remaining frontmatter and body content in the
comparison, including proof mode and witness, the COMPLETE ordinary/real proof config and scopes,
outcome, integration acceptance, contract IDs and full assertions. Unknown fields or sections cannot
silently disappear. An unreadable or unsupported snapshot yields an explicit unresolved result,
never equality with an empty obligation.

Qualification is `unchanged`, `changed`, or `unresolved`, with a concrete reason for the latter two.
The result and its types explicitly expose BOTH provenance and lifecycle as `unchecked`: obligation
equivalence of supplied bytes is not verified current proof or a current lifecycle status. Expose
per-event qualification, latest evidence and a conditional current-proof candidate as distinct
outputs; each history row retains its original event. After rejecting ambiguous signing identities,
snapshot keys and sequence order, determine the newest relevant valid signed event in event sequence
BEFORE qualification filtering. Only that event, when it is a PASS qualified `unchanged`, may be the
candidate. It is evidence only, explicitly conditional on BOTH the caller's provenance verification
and application of the existing retirement/reset lifecycle semantics over the original ordered events.
If that event is a failure or cannot qualify, no candidate is returned; an older unchanged pass
retains its qualification in history without becoming a replacement. Do not filter source failures
out because their snapshot is changed or unavailable. Events under both the old and new identities
retain their own identities and ordering; unrelated identities gain no continuation.

Returning a candidate does not establish current lifecycle status. Ordinary building/phase work marks
do not erase a signed pass, but retirement is an explicit lifecycle removal that clears the durable
proof baseline: pass then retirement is `retired`; pass then retirement then building is `building`
until a fresh signature. The classifier preserves all those work records, exposes lifecycle unchecked
and leaves application of that existing fold to subsequent production integration. It neither
implements a continuation lifecycle fold nor lets a historical candidate override retirement/reset.

The operation preserves the separate binding axis. Ordinary source-code drift, without an obligation
change, does not reject an otherwise equivalent rename or demote proof by itself. Preserve any
supplied binding/drift result and every original `anchors`/`boundHash` field; do not manufacture a
fresh binding or reconstruct an absent one. An absent coverage axis remains absent, and original
covered/uncovered/unread-title information is never remeasured against today's tests.

**Affordance and fence.** This module may parse supplied raw snapshots and classify supplied events.
It performs no Git, filesystem, database, network, signing or mutation operation. Every production
checkout caller that later integrates this result must verify embedded snapshots byte-for-byte
against `git show <sha>:<path>`, AND apply the existing retirement/reset lifecycle semantics over the
original ordered events before granting current credit, including CLI/proving reads before
any gate; a prior passing gate does not verify the current checkout's metadata. Hosted readers may
trust only the validated live mirror for provenance and must still apply that lifecycle. These are
caller obligations: this pure unit's result/types declare provenance and lifecycle unchecked and its
candidate conditional on BOTH checks, never that supplied bytes came from Git, that a field named
`commitSha` verifies them, or that returning evidence establishes current lifecycle status. Production
integration is subsequent work and must enforce both conditions before credit. No story or criterion
identity, story baseline, claim identity or newly split rendering lane is mapped by this unit.

## Integration test

**Goal —** Resolve a reviewed rename over the actual work/signing event vocabulary into immutable
historical evidence plus honest current-obligation qualification.

**Fixture acceptance —** Each admitted fixture models the selected **post-rename current** hierarchy:
it contains the target capability and no live source capability. The old capability belongs only in the
rename anchor and per-signing-event historical snapshots, never as a current hierarchy row admitted
alongside its target. Raw old and target specifications keep the same actual source/test proof paths
and the same declared contract IDs across the display/identity rename; a fixture must not derive either
obligation-bearing path or contract ID from its display ID. The proof is about the explicit
normalization locations, not a synthetic rename that also changes scopes or contracts.

Positive, otherwise-valid pass/fail signing fixtures are accepted only after `Verdict.safeParse`
succeeds on the actual document shape. Deliberately malformed signing fixtures remain required
negative controls: assert their validation failure and zero credit, and assert duplicate-signing
ambiguity where applicable.
Where a fixture supplies anchors, every anchor carries its own required `boundHash`; a top-level
`boundHash` does not make an otherwise invalid anchor valid. Construct the initial and phase activity
marks with real `workEvent`: include one initial `building` mark and multiple same-run phase-stamped
`building` marks at distinct sequences, then a schema-valid same-`runId:unitId` signing event. Each
mandatory negative control is an independently asserted case, rather than a nested label around the
admitted fixture or an incidental consequence of another refusal.

The suite uses real `workEvent` construction, `RollupEvent` ordering and real `Verdict` validation.
Its regression includes an initial building mark and multiple phase-stamped building marks in the
same run, constructed with real `workEvent` as `phaseActivityWriter` does, at distinct supplied
sequences as in `PgWorkStore.readEvents`, followed by a schema-valid signature with the SAME
`runId:unitId` ID. Assert admission, every occurrence and original ID retained, latest signing evidence
and conditional candidate selection; merely avoiding a duplicate-ID exception is insufficient.
It checks existing `rollupStatus` behavior on the original exact-ID streams as the unchanged event
semantics: a work-in-flight mark is not a new signature and does not erase a prior signed pass;
signed failure remains evidence of failure; pass then retirement yields `retired`; pass then
retirement then building yields `building`, retaining that reset through further ordinary work marks
until a fresh signature. A fresh pass can establish `healthy` again. The classifier retains the work
records and exposes both provenance and lifecycle unchecked, including when historical evidence
supplies a candidate while the original exact-ID fold is retired or building after reset.
Raw specifications and signed-shaped documents are literal offline input fixtures. No collaborator
within the event-log/proof protocol is replaced with a stub. Git provenance, persistence, loader
projection and production continuation lifecycle/status integration are not asserted as successes of
this pure resolver; the exact-ID lifecycle controls exercise the existing fold, not a new one.

Run the full orchestrator suite for both red and green, with package typecheck before promotion.
The leaf authors only the exact test/source pair in the frontmatter. Every contract below needs a
substantive test whose name begins with its contract ID.

## Contracts (7)

1. **`continuation-admits-only-reviewed-one-to-one-capability-renames`**
   - **asserts —** a complete version-1 `proof_continuity` record with equivalent rename-anchor
     and current-target obligations admits exactly its source/target capability pair only after
     validating the raw anchor `id` against `fromId` and raw current `id` against the selected
     target, both at capability tier in the same story as the supplied hierarchy. These checks
     precede identity normalization. The selected current hierarchy contains the target and no live
     source row; the source is historical input through the anchor and event snapshots. Mismatches,
     missing review fields, unsupported version,
     self-mapping, duplicate source or target use, source reuse by a live capability, a continuation
     chain/cycle, a split, an absent target and a story or criterion endpoint each produce an
     explicit refusal and no conditional current-proof candidate.
   - **falsifiability —** distinct display names alone cannot admit two targets for one source;
     scanning only the requested row misses a conflicting row elsewhere in the supplied hierarchy.
     A different raw anchor/current ID or story cannot pass merely because normalization erases ID.

2. **`continuation-compares-complete-obligations-with-only-explicit-name-normalization`**
   - **asserts —** the allowed ID/title/display-heading change and the self-ID argument of the exact
     prose inline-code `storytree coverage <self-id>` command pass; changing outcome, witness,
     proof mode, ordinary or real command, any test/source scope, integration acceptance, any
     contract assertion, or an otherwise unknown authored field/section refuses admission.
     The fixture keeps its actual proof paths and declared contract IDs fixed across the allowed
     display/identity change; it does not manufacture those obligations from the fixture ID.
     Replacing the old ID inside an assertion is not normalized merely because it spells the ID.
     A coverage command naming an unrelated ID remains material, as does any command rewrite beyond
     the exact recognized self-ID argument token; the `proof:` command remains fully compared.
     A malformed snapshot is unresolved/refused, never an empty equivalent specification.
   - **falsifiability —** matching contract IDs with changed assertion prose must fail; comparing
     only the real source file or only the ordinary proof command must fail the scope cases.

3. **`continuation-qualifies-each-event-at-its-own-signed-obligation`**
   - **asserts —** under one admitted rename, distinct original signing events are matched by their
     SIGNING-stream event ID and exact signed SHA to their own raw snapshots; same-ID work marks
     are not snapshot lookup targets. Before identity normalization, each
     snapshot's raw `id` must equal its original `verdict.unitId`, its tier must be capability,
     and its story must match the selected target and hierarchy. Changed obligations yield
     `changed`; unavailable/wrong-SHA or identity/tier/story-mismatched snapshots yield `unresolved`
     with reasons, retaining history without candidate eligibility. Duplicate or conflicting
     snapshot bindings refuse the resolution, including exact duplicates or repeated `eventId`
     entries with differing SHA/path/bytes; no `.find` or input-order winner selects one.
     `unchanged` describes supplied-data equivalence with provenance and lifecycle unchecked,
     independently of whether the event is the conditional current-proof candidate; it establishes
     no current lifecycle status. Equality between today's
     old/new specifications does not alter those results.
   - **falsifiability —** one older event with different assertions stays ineligible even when a
     newer event and the rename anchor match today's target exactly.
     A snapshot with another event's unit ID cannot qualify after ID stripping; reversing duplicate
     bindings must still refuse, never choose the convenient matching snapshot. A same-ID work mark
     cannot consume a signing snapshot or make its binding ambiguous.

4. **`continuation-keeps-every-original-evidence-field-immutable`**
   - **asserts —** resolving frozen input events neither mutates nor clones a replacement signed
     document under a new identity. Returned history retains the original event record, event ID,
     sequence, `unitId`, `runId`, SHA, time, signer, outcome, evidence, coverage and anchors exactly.
     Every original work occurrence survives, including repeated work IDs within the same kind at
     distinct sequences and work marks sharing their signature's ID; none is deduplicated or relabeled.
     Retirement/reset work records remain available to the caller. Absent optional fields remain
     absent. Unrelated events acquire no continued credit.
   - **falsifiability —** assert original event identity as well as deep equality, so a copied
     signature, parser-added default or rewritten `unitId` cannot pass as retained history. Assert
     occurrence counts and original references for repeated-ID work records so a map keyed by ID
     or by kind plus ID cannot silently collapse history.

5. **`continuation-never-hides-newer-signing-evidence-behind-an-older-pass`**
   - **asserts —** the latest relevant valid signing event is selected by sequence across both
     identities before qualification filtering, after explicitly refusing duplicate SIGNING IDs in
     the supplied stream and sequence ties among relevant source/target work or signing events.
     Duplicate signing IDs refuse even for exact duplicates, malformed or conflicting documents;
     schema filtering cannot hide a collision. Repeated work IDs at distinct sequences and a work
     mark sharing a signature's ID are legitimate and retained. Input order or a secondary tie-break
     cannot choose a latest event from an ambiguous stream. Latest evidence, each
     event's qualification and the conditional current-proof candidate are distinct results.
     Only the latest valid signing event when it is an unchanged PASS may supply that candidate.
     The candidate remains evidence only, conditional on BOTH caller provenance verification and
     application of retirement/reset lifecycle semantics, with both unchecked in the result/types.
     A newer fail, changed-obligation event or unresolved event remains the latest evidence and
     leaves no candidate, even though an older unchanged pass remains qualified history. Original
     failures remain in history even when their snapshot is absent. Unsorted input produces the
     same result without sorting the caller's array in place.
   - **covers —** `packages/orchestrator/src/proof/capability-continuity.ts` (planned resolver).
   - **falsifiability —** choosing the newest eligible PASS first loses the later fail and must red.
     Reversing relevant sequence ties or duplicate signing IDs must still refuse rather than change
     the winner, including a valid/malformed signing collision. Reordering repeated-ID work marks
     with distinct sequences cannot trigger that refusal or replace the latest signing evidence.

6. **`continuation-preserves-code-binding-and-coverage-uncertainty`**
   - **asserts —** equivalent obligations retain `unchanged` qualification when only their supplied
     code-binding result is stale or drifted-undescribed, with that result and original anchor/hash
     unchanged; this verifies neither provenance nor lifecycle and does not bypass latest-event
     candidate selection or establish current lifecycle status.
     An unbound verdict remains explicitly unbound with no new hash/anchors. Missing coverage
     remains missing; uncovered contracts and unread-title qualifiers survive without reinterpretation.
   - **falsifiability —** neither treating every differing source hash as an obligation change nor
     treating rename admission as a fresh binding may satisfy the contract.

7. **`continuation-consumes-the-existing-work-and-signing-event-protocol`**
   - **asserts —** real `workEvent` output and real schema-valid pass/fail documents participate in
     the same ordered stream. Work marks stay work marks, never current proof; malformed signing
     documents grant no credit. A real initial building mark and multiple phase-stamped building
     marks in one run legitimately repeat the same work ID at distinct sequences and share that ID
     with their signature. This stream admits the rename, retains every original occurrence/ID and
     resolves the signature's own snapshot, latest evidence and conditional candidate correctly.
     The original exact-ID streams still yield the established `rollupStatus` results: pass remains
     `healthy` across ordinary building marks; subsequent signed failure yields `unhealthy`; pass
     then retirement yields `retired`; pass then retirement then building yields `building` through
     further ordinary work marks until a fresh signature, with a fresh pass yielding `healthy`.
     All original retirement/reset work records survive classification.
     No event is appended, no historical signature is re-authored and no story baseline is granted.
     The pure result/types explicitly expose BOTH provenance and lifecycle `unchecked` and any
     current-proof candidate as evidence only, conditional on BOTH caller provenance verification
     and application of the existing retirement/reset lifecycle, alongside separate original history
     qualifications and latest evidence. Returning a candidate establishes no current lifecycle
     status, including for history whose exact-ID fold is retired or building after reset. The module
     performs no IO and implements no continuation lifecycle fold. Every later production checkout
     caller must verify embedded snapshots against Git AND apply that lifecycle before current
     credit. Hosted readers may trust only the validated live mirror for provenance and must also
     apply that lifecycle; this unit exposes both conditions without implementing or claiming the
     subsequent production integrations as proven.
   - **falsifiability —** a hand-made success marker cannot substitute for `Verdict` validation,
     and a later `building` mark cannot be treated as a fresh signing result.
     A verdict-shaped object with an anchor lacking that anchor's `boundHash` must fail schema
     validation even when a top-level field has that name. A live old source row beside the selected
     target, derived proof paths/contract IDs, or phase-less repeated work marks cannot satisfy the
     admitted production-shaped fixture.
     Refusing or deduplicating real repeated-ID work marks plus their same-ID signature must red.
     An unchanged supplied snapshot must still return BOTH provenance and lifecycle unchecked and
     only a conditional candidate, never a verified-proof or current-status result. Controls must
     catch resurrection of the old pass after retirement then building: the existing exact-ID fold
     stays `building` until a fresh signature, even if the classifier still offers that old evidence.
