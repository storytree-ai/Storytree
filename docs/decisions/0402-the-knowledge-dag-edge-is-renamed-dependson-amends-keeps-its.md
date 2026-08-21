---
status: accepted
decided: 2026-08-21
arc: adrs-into-the-dag-arc
amends: [223]
---
# ADR-0402: The knowledge DAG edge is renamed dependsOn; amends keeps its name

## Status

accepted (2026-08-21) — decided/directed by the owner in conversation on 2026-08-21. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

ADR-0223 dec 1 created the knowledge DAG's substrate as an authored edge named **`standsOn`**, with
the meaning *"X is built on the more-foundational B and C"*. The name was chosen for its metaphor —
an artifact STANDS ON the things beneath it — and it reads naturally alongside ADR-0223's tier order
and ADR-0078's role-not-position renaming pass.

**The name has since been measured to mislead the one reader who matters most.** Preparing an
owner-facing briefing on 2026-08-21, the edge was glossed in plain English as "rests on" — and the
same gloss was applied, in the same document, to the decision log's `amends` edge, because both
plausibly mean "rests on". The owner read it and directed the rename. That collision is not a
drafting slip that better prose would fix: the two edges genuinely do both mean "rests on" in
English, they live in different tiers, they are parsed by different code, and one of them carries an
additional meaning the other does not. A name that cannot distinguish them is doing less work than
the corpus needs.

Three further facts make the rename cheap and the timing right:

- **The codebase already calls it a dependency.** `knowledge.ts` documents the field as "the authored
  dependency edge" in its own comments, and the Library has carried a `dependency` definition
  artifact — *"A directed edge between units"* — since long before this. The rename aligns the field
  with the word the code and the glossary already use.
- **A field rename is a registered migration here, not a breaking change.**
  `packages/library/src/migrations.ts` is an ordered registry of numbered forward transforms with a
  per-row `schemaVersion` pin and migrate-on-write upcasting. Migration #5 (`arc-increments-fold`,
  ADR-0305 D1) already renamed a *kind* through this exact mechanism. So the rename needs no bulk
  update of ~1,660 rows, and therefore does not race the concurrent sessions that are always writing
  this corpus.
- **The blast radius is bounded and mostly mechanical**: 392 occurrences across 53 files at the time
  of the decision, the large majority of them in code and tests.

**Why `amends` is the interesting half of this decision.** The obvious instinct is to rename both
edges to one word and be consistent. That would be wrong, and the reason is the distinction this
repository has paid for repeatedly. `amends` means *"that decision STILL STANDS, and this one rests
on it"*; `supersedes` means *"this replaced that, and that is now dead"*. The still-in-force half is
the entire content of `amends`, and it is what makes `amends` the edge that measures distance from
the work while `supersedes` measures how often we changed our minds. ADR-0223 and the cycle census on
`adrs-into-the-dag-arc` both turn on never summing them. Giving `amends` a generic dependency name
would erase, at the level of vocabulary, the distinction the never-sum rule exists to protect.

A research pass on 2026-08-21 into how other disciplines maintain a corpus reinforced this from
outside: legal citators encode treatment with a *typed* vocabulary — overruled, distinguished,
criticised, followed — precisely because "this case relates to that case" is not a usable signal.
Collapsing typed edges into an untyped one is the failure mode that vocabulary exists to avoid.

## Decision

**1. The Library's authored dependency edge is renamed `standsOn` → `dependsOn`.** Same meaning, same
direction, same tier order, same participation in the DAG. This amends ADR-0223 dec 1's *name* and
nothing else about it.

**2. `amends` and `supersedes` keep their names.** They are the decision log's own typed edges, they
mean more than "depends on", and the difference between them is load-bearing. This is a deliberate
asymmetry, recorded so a later pass does not "finish the job" for consistency's sake.

**3. The rename ships as registered migration #7**, bumping `CURRENT_SCHEMA_VERSION` to 7. Documents
authored against the old shape forward-migrate on their next read or write. **No bulk rewrite of the
corpus is performed** — which is not merely an optimisation: a mass update would race concurrent
sessions, and the migration registry exists so that it never has to.

**4. The rename covers the FIELD, never the NAME OF ANOTHER OBJECT.** Explicitly NOT renamed, and
each for its own reason:
   - **Capability and story ids** (`library-standson-schema-admission`,
     `library-standson-corpus-bootstrap`) and everything under `stories/**` — disk-canonical work
     hierarchy, referenced by signed UAT criteria whose ids are positional. Renaming them risks
     re-pointing signed verdicts for no reader benefit.
   - **The `standson:bootstrap` script key and the `standson-bootstrap.ts` filenames** — one-time seed
     machinery (ADR-0223 dec 5), wired into `package.json`, `repo-manifest.json` and the ownership
     map. The field references inside them are renamed; the names are not.
   - **ADR filenames**, including ADR-0223's own slug. The number is the identity.
   - `docs/research/**` (dated historical captures) and `stories/uat-legacy-dispositions.json`.

**4b. The exported SYMBOLS built on the field are renamed with it** — `StandsOnRef` → `DependsOnRef`,
`findStandsOnCycles` → `findDependsOnCycles`, and seven more (nine total: `StandsOnSource`,
`standsOnNodes`, `StandsOnCycleReport`, `StandsOnAcyclicityVerdict`, `evaluateStandsOnAcyclicity`,
`StandsOnBootstrapPlan`, `projectStandsOnFromCitations`). They are the field's own type and
function vocabulary, not names of other objects, and leaving them would create a fourth residue class
that reads as exactly the oversight decision 4 exists to make deliberate. Accepted cost: three lines
of story prose that reference the old symbol names go stale
(`library-standson-schema-admission.md` and `library-standson-corpus-bootstrap.md`). Prose only —
nothing binds symbol names mechanically — and correcting them would mean editing `stories/**`, which
decision 4 rules out for stronger reasons.

**5. The ADR bodies that name the field are CORRECTED IN PLACE, and that correction runs AFTER this
lands, not with it.** Under ADR-0139 the decision did not change — the edge exists and means what it
always meant, only its name moved — so **ADR-0223, 0363, 0365, 0373, 0185 and 0188** are corrected
rather than superseded. The ordering is deliberate: correcting them to name `dependsOn` before the
field exists would make each of them false in the interval.

ADR-0310 also names the field and wants the same fix, but is listed separately here because it is
`proposed` rather than `accepted` — ADR-0139's true-in-full mandate binds the accepted set, so 0310
is housekeeping rather than an obligation. Recorded distinctly so a later pass does not infer that
proposed ADRs carry the same duty.

**6. READERS ARE LEGACY-TOLERANT UNTIL THE DATA DRAINS, and this is not optional.** Migrate-on-write
upcasts at the WRITE boundary only; every reader — the acyclicity gate, the depth walk, the studio's
DAG canvas and focus graph, the probes — reads the raw stored document. Renaming the field without
touching the read path therefore makes **all ~778 authored pointers invisible on the day this lands**,
until each row happens to be written again. Measured on the branch before the fix:
`check:library-dag-acyclic PASS — no dependsOn cycle across 1701 artifacts (0 authored edges)`.

So the readers accept EITHER key through one shared helper, with the tolerance marked temporary at
every call site. This is the expand phase of expand/migrate/contract: **expand** (read both) ships
here, **migrate** (the one-shot `batch-migrate` drain of the live store) is its own increment, and
**contract** (delete the tolerance) follows the drain. A bulk rewrite is still not performed as part
of THIS change — decision 3 stands — but the reason has narrowed: it is not needed for
*writability*, and the read-path vacuum is a separate consequence that tolerance rather than a
migration closes.

**7. AN INSTRUMENT THAT CANNOT SEE ITS SUBJECT MUST NOT REPORT SUCCESS.** `check:library-dag-acyclic`
printed `0 authored edges` and passed. **Zero authored edges over a corpus of at least
`VACUOUS_DEPENDS_ON_READ_FLOOR` (100) documents is now UNVERIFIED** — a third outcome, exiting
non-zero, distinct from both PASS and the cycle-found FAIL, because there is no cycle to name and no
repair to prescribe.

The threshold is a THRESHOLD, not a proof, and is documented as such: below it, "this corpus
genuinely has no edges yet" remains a plausible truth; at or above it, that explanation has run out.
100 sits an order of magnitude above the frozen fixture (20 documents, zero edges by design) and an
order below the live corpus (~1,700 documents, ~754 pointers).

Two deliberate placements. The **rule** lives in the pure judge (`knowledge-dag.ts`) as
`isVacuousDependsOnRead`, since the check itself decides nothing; the **refusal** lives in the check.
And vacuity is NOT folded into `verdict.acyclic` — a corpus with no edges genuinely has no cycles,
and flipping that bit would make the judge lie in the other direction. Vacuity is a fact about the
READ; what it costs is the caller's call.

Scoped narrowly on purpose: one predicate, one refusal branch, no new check and no gate-plan entry.
Included here rather than deferred because the defect it catches is the one this very ADR nearly
shipped, and nothing else would have caught it.

## Consequences

**Good.**

- The edge is named for what it does, in the word the code comments and the `dependency` definition
  artifact already used. A reader meeting `dependsOn` needs no metaphor decoded.
- The two edges are no longer confusable in English. The confusion that prompted this was a
  *briefing* failure, but the same collision was available to every reader of the corpus.
- It costs no bulk write, no quiescence window, and no coordination with concurrent sessions —
  which is a direct consequence of the migration registry existing, and is worth noticing as a
  return on that investment.

**Bad, or at least owed.**

- **A deliberate inconsistency now exists and will look like an oversight.** Capability ids, two
  filenames and one npm script still carry `standson`. That is decision 4, not rot, and this
  paragraph is where a future reader is told so. If those names are ever worth changing it is on
  their own merits and their own risk assessment, not for tidiness.
- **Seven accepted ADR bodies briefly name a field that no longer exists**, in the window between
  this landing and the librarian-curator's correct-in-place pass. Accepted deliberately as the lesser
  of two orderings.
- **Old reading knowledge goes stale.** Anyone who learned the corpus before today will search for
  `standsOn` and find only the deliberately-excluded names. The forward migration means old *data*
  keeps working; old *habits* do not, and nothing measures that.
- **Two names for two edges is a vocabulary that must now be taught.** The asymmetry in decision 2 is
  correct and is also one more thing an onboarding reader has to hold.
- **The corpus carries two shapes at once until the drain runs**, and `storytree library --check`'s
  `version-floor` reading will report every un-migrated row below schemaVersion 7 in the meantime. It
  is a dashboard banner rather than a gate rung, so nothing reds — but it is noise until decision 6's
  migrate phase lands, and a reader who does not know why will think something is broken.
- **The tolerance in decision 6 is code that exists to be deleted**, which is the kind of code that
  survives. The contract phase is a parked increment rather than a comment, for that reason.

**The thing this nearly got wrong, recorded because it is the most useful part of this ADR.** The
rename was a clean, well-tested, fully typechecked change that would have silently blinded the
knowledge graph the moment it merged — and the gate would have gone GREEN, because a check that reads
zero edges finds zero cycles. The signal was there in plain text (`0 authored edges`) and passing
made it unreadable. Decision 7 exists so the next instance is caught by machinery rather than by
someone reading a success message carefully. **A green check over an empty read is not evidence; it
is the absence of evidence wearing evidence's clothes.**

**Neutral, and explicitly NOT decided here.** Whether the depth walk continues past an ADR at all —
ADR-0223 D4's sink rule — is untouched. That is a live owner question
(`oq-what-does-backing-adrs-into-the-dag-mean`) on `adrs-into-the-dag-arc`, and this ADR must not be
read as having moved it. Likewise the tier order, the acyclicity gate, and the exclusion of
`definition` from the DAG (ADR-0363 D1) are all unchanged.

## References

- ADR-0223 — created the `standsOn` edge; this ADR amends its name only.
- ADR-0139 — correct-in-place vs supersede-and-replace; governs decision 5's ordering.
- ADR-0110 — owner direction in conversation IS ratification; why this is born accepted.
- ADR-0305 D1 — migration #5, the kind-rename precedent decision 3 follows.
- ADR-0363 D1, ADR-0365, ADR-0373 — later decisions that name the field, corrected in place after.
- `packages/library/src/migrations.ts` — the registry; `knowledge.ts` — the field.
- `adrs-into-the-dag-arc-inc-05` — the increment that carries this work and its full scope line.
