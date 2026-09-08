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
   explicit unchecked provenance and a current-proof candidate conditional on provenance verification.
3. Put a newer failing or ineligible signing event after an older eligible pass. Observe that the
   newer signing event remains the latest evidence and no older pass is offered as its replacement.
4. Read every original event and binding field back unchanged, including absent fields. A stale
   code binding stays stale and an unbound verdict stays unbound.
5. Attempt an ambiguous, chained, split, missing-target or non-capability mapping, duplicate or
   conflicting snapshot bindings, duplicate event IDs, and relevant sequence ties. Observe an
   explicit refusal with no conditional current-proof candidate.

The common precondition is the supplied specification/event snapshot set. The observable is the
resolver's discriminated admission result, per-event qualification, latest evidence and conditional
current-proof candidate, with provenance explicitly unchecked; not a CLI glyph, story crown, new
signature or persisted mapping.

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
target obligation. The second lookup is keyed by that event's exact ID and signed `commitSha`, never
the newest convenient source snapshot. Admission of the rename says nothing about the age or
relevance of an earlier proof.

Before stripping or normalizing any identity, validate the rename-anchor raw specification's `id`
against `fromId`, the current raw specification's `id` against the selected target ID, and EACH
historical raw specification's `id` against its original signed `verdict.unitId`. All must have
`tier: capability` and the selected target's story, consistent with the supplied hierarchy. An anchor
or current-target identity/tier/story mismatch refuses admission; a historical mismatch is explicitly
`unresolved`, retains that event as history and cannot supply a candidate. Normalization cannot make
a snapshot for another identity or story qualify.

Refuse duplicate or conflicting snapshot bindings, including repeated `eventId` entries even when
their SHA/path/bytes agree, duplicate event IDs in the supplied stream, and sequence ties among
relevant events under the source/target identities. These ambiguities produce an explicit refusal
with no candidate or arbitrarily selected latest event. No `.find`, overwrite, input-order winner
or secondary tie-break may resolve an ambiguous binding or ordering.

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
The result and its types explicitly expose provenance as `unchecked`: obligation equivalence of
supplied bytes is not verified current proof. Expose per-event qualification, latest evidence and a
conditional current-proof candidate as distinct outputs; each history row retains its original
event. After rejecting ambiguous identities/order, determine the newest relevant valid signed event
in event sequence BEFORE qualification filtering. Only that event, when it is a PASS qualified
`unchanged`, may be the candidate, explicitly conditional on the caller's provenance verification.
If that event is a failure or cannot qualify, no candidate is returned; an older unchanged pass
retains its qualification in history without becoming a replacement. Do not filter source failures
out because their snapshot is changed or unavailable. Events under both the old and new identities
retain their own identities and ordering; unrelated identities gain no continuation.

The operation preserves the separate binding axis. Ordinary source-code drift, without an obligation
change, does not reject an otherwise equivalent rename or demote proof by itself. Preserve any
supplied binding/drift result and every original `anchors`/`boundHash` field; do not manufacture a
fresh binding or reconstruct an absent one. An absent coverage axis remains absent, and original
covered/uncovered/unread-title information is never remeasured against today's tests.

**Affordance and fence.** This module may parse supplied raw snapshots and classify supplied events.
It performs no Git, filesystem, database, network, signing or mutation operation. Every production
checkout caller that later integrates this result must verify embedded snapshots byte-for-byte
against `git show <sha>:<path>` before granting current credit, including CLI/proving reads before
any gate; a prior passing gate does not verify the current checkout's metadata. Hosted readers may
trust only the validated live mirror. These are caller obligations: this pure unit's result/types
declare provenance unchecked and its candidate conditional, never that supplied bytes came from Git
or that a field named `commitSha` verifies them. The current production tree remains unaffected until
its consumers deliberately integrate the result. No story or criterion identity, story baseline,
claim identity or newly split rendering lane is mapped by this unit.

## Integration test

**Goal —** Resolve a reviewed rename over the actual work/signing event vocabulary into immutable
historical evidence plus honest current-obligation qualification.

The suite uses real `workEvent` construction, `RollupEvent` ordering and real `Verdict` validation.
It checks existing `rollupStatus` behavior on the original exact-ID streams as the unchanged event
semantics: a work-in-flight mark is not a new signature and does not erase a prior signed pass;
signed failure remains evidence of failure. Raw specifications and signed-shaped documents are
literal offline input fixtures. No collaborator within the event-log/proof protocol is replaced
with a stub. Git provenance, persistence, loader projection and consumer folding are not asserted
as successes of this pure resolver.

Run the full orchestrator suite for both red and green, with package typecheck before promotion.
The leaf authors only the exact test/source pair in the frontmatter. Every contract below needs a
substantive test whose name begins with its contract ID.

## Contracts (7)

1. **`continuation-admits-only-reviewed-one-to-one-capability-renames`**
   - **asserts —** a complete version-1 `proof_continuity` record with equivalent rename-anchor
     and current-target obligations admits exactly its source/target capability pair only after
     validating the raw anchor `id` against `fromId` and raw current `id` against the selected
     target, both at capability tier in the same story as the supplied hierarchy. These checks
     precede identity normalization. Mismatches, missing review fields, unsupported version,
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
     Replacing the old ID inside an assertion is not normalized merely because it spells the ID.
     A coverage command naming an unrelated ID remains material, as does any command rewrite beyond
     the exact recognized self-ID argument token; the `proof:` command remains fully compared.
     A malformed snapshot is unresolved/refused, never an empty equivalent specification.
   - **falsifiability —** matching contract IDs with changed assertion prose must fail; comparing
     only the real source file or only the ordinary proof command must fail the scope cases.

3. **`continuation-qualifies-each-event-at-its-own-signed-obligation`**
   - **asserts —** under one admitted rename, distinct original events are matched by event ID
     and their exact signed SHA to their own raw snapshots. Before identity normalization, each
     snapshot's raw `id` must equal its original `verdict.unitId`, its tier must be capability,
     and its story must match the selected target and hierarchy. Changed obligations yield
     `changed`; unavailable/wrong-SHA or identity/tier/story-mismatched snapshots yield `unresolved`
     with reasons, retaining history without candidate eligibility. Duplicate or conflicting
     snapshot bindings refuse the resolution, including exact duplicates or repeated `eventId`
     entries with differing SHA/path/bytes; no `.find` or input-order winner selects one.
     `unchanged` describes supplied-data equivalence with unchecked provenance, independently of
     whether the event is the conditional current-proof candidate. Equality between today's
     old/new specifications does not alter those results.
   - **falsifiability —** one older event with different assertions stays ineligible even when a
     newer event and the rename anchor match today's target exactly.
     A snapshot with another event's unit ID cannot qualify after ID stripping; reversing duplicate
     bindings must still refuse, never choose the convenient matching snapshot.

4. **`continuation-keeps-every-original-evidence-field-immutable`**
   - **asserts —** resolving frozen input events neither mutates nor clones a replacement signed
     document under a new identity. Returned history retains the original event record, event ID,
     sequence, `unitId`, `runId`, SHA, time, signer, outcome, evidence, coverage and anchors exactly.
     Absent optional fields remain absent. Unrelated events acquire no continued credit.
   - **falsifiability —** assert original event identity as well as deep equality, so a copied
     signature, parser-added default or rewritten `unitId` cannot pass as retained history.

5. **`continuation-never-hides-newer-signing-evidence-behind-an-older-pass`**
   - **asserts —** the latest relevant valid signing event is selected by sequence across both
     identities before qualification filtering, after explicitly refusing duplicate event IDs in
     the supplied stream and sequence ties among relevant events. Even exact duplicates refuse;
     input order or a secondary tie-break cannot choose a latest event. Latest evidence, each
     event's qualification and the conditional current-proof candidate are distinct results.
     Only the latest valid signing event when it is an unchanged PASS may supply that candidate.
     A newer fail, changed-obligation event or unresolved event remains the latest evidence and
     leaves no candidate, even though an older unchanged pass remains qualified history. Original
     failures remain in history even when their snapshot is absent. Unsorted input produces the
     same result without sorting the caller's array in place.
   - **falsifiability —** choosing the newest eligible PASS first loses the later fail and must red.
     Reversing tied or duplicate events must still refuse rather than change the winner.

6. **`continuation-preserves-code-binding-and-coverage-uncertainty`**
   - **asserts —** equivalent obligations retain `unchanged` qualification when only their supplied
     code-binding result is stale or drifted-undescribed, with that result and original anchor/hash
     unchanged; this neither verifies provenance nor bypasses latest-event candidate selection.
     An unbound verdict remains explicitly unbound with no new hash/anchors. Missing coverage
     remains missing; uncovered contracts and unread-title qualifiers survive without reinterpretation.
   - **falsifiability —** neither treating every differing source hash as an obligation change nor
     treating rename admission as a fresh binding may satisfy the contract.

7. **`continuation-consumes-the-existing-work-and-signing-event-protocol`**
   - **asserts —** real `workEvent` output and real schema-valid pass/fail documents participate in
     the same ordered stream. Work marks stay work marks, never current proof; malformed signing
     documents grant no credit. The original exact-ID streams still yield the established
     `rollupStatus` results, including pass durability across building marks and subsequent failure.
     No event is appended, no historical signature is re-authored and no story baseline is granted.
     The pure result/types explicitly expose provenance `unchecked` and any current-proof candidate
     as conditional on caller verification, alongside separate original history qualifications and
     latest evidence; supplied-data equivalence never claims verified current proof. The module
     performs no IO. Every later production checkout caller must verify embedded snapshots against
     Git before current credit, and hosted readers may trust only the validated live mirror; this
     unit exposes that boundary without implementing or claiming those integrations as proven.
   - **falsifiability —** a hand-made success marker cannot substitute for `Verdict` validation,
     and a later `building` mark cannot be treated as a fresh signing result.
     An unchanged supplied snapshot must still return unchecked provenance and only a conditional
     candidate, never a verified-proof result.
