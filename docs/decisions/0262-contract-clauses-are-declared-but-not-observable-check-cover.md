---
status: accepted
decided: 2026-08-13
amends: [122]
arc: verification-integrity-arc
---
# ADR-0262: Contract clauses are declared but not observable: check:coverage stays name-granular until a clause carries identity

## Status

accepted (2026-08-13) — ratified by the owner in conversation on 2026-08-13, as it stands. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Proposed 2026-07-28 — the owner directed the INVESTIGATION, not its outcome: a five-day friction
report asked whether `check:coverage` should count a contract's clauses rather than its test name, and
directed that if clause counting needs a schema change, the fork be recorded rather than guessed. It
does. This records the measured answer and the fork; the resolution was left for the owner to ratify.

**What ratification decides, and what it deliberately does not.** Decisions 1–3 and 5 are now settled:
the coverage granularity stays NAME-granular on both the gate and the signed verdict, the obligations
parser stays, and the segmenter stays refused. Decision 4's fork is NOT taken — the three routes to
clause identity remain available and remain uncommissioned. The multi-clause under-count is therefore
ACCEPTED KNOWINGLY rather than fixed, and the Consequences below say so in those words.

**Why ratifying mattered more than the sixteen-day delay suggests.** Left `proposed`, this ADR read as
an open invitation rather than as a recorded refusal, and THREE independent sessions walked into
decision 4's fork and re-derived the same answer — the third on 2026-08-13, after stamping an increment
(`contract-coverage-counts-behaviours`) that asked for exactly what decision 4 had already recorded.
The measurement was filed and correct; nothing pointed at it, because an unsigned refusal does not read
as a refusal. That cost is the reason this status line exists.

**Amends** [ADR-0122](0122-per-contract-coverage-check-map-each-declared-contract-to-an.md) — the
`amends: [122]` edge binds only on acceptance. ADR-0122's decision stands entire: a structural gate
check maps each declared contract to an OBSERVED test by the naming convention, with no new signer.
This adds to it twice and overturns neither — it holds that mapping's GRANULARITY against a
clause-granular escalation (decisions 1 and 3), and it widens `parseContracts`, the unit 0122's
decision enumerates, past the declared contract ids its first slice parsed (decision 2). The same
additive shape as 0122's other two amenders,
[ADR-0126](0126-static-ast-hollow-test-detection-a-contract-is-covered-only.md) (the vouching input)
and [ADR-0127](0127-record-per-contract-coverage-on-the-signed-verdict-shape-adr.md) (the verdict
axis).

## Context

The friction item `check-coverage-counts-a-test-name-not-a-contracts-clauses` states the leak plainly:
`check:coverage` counts a test NAME, so a multi-clause contract ships at N/N with most clauses
unasserted. It sits in a 24-item "proof integrity — a green that proved nothing" cluster, the largest
of the 82 items filed, and the report identified clause counting as the single change that could
collapse several of them at once, because most of the cluster reduces to one shape — **a proof surface
reporting on something it cannot observe**.

A coverage ratio has two halves, and they were measured separately.

**THE DENOMINATOR IS DERIVABLE — and that half is real.** A contract is authored as a numbered item
under `## Contracts` whose lead carries a `**\`id\`**` span, followed by labelled sub-bullets. Over the
live corpus (281 spec files, 947 declared contracts):

    asserts        932        contracts with an `asserts` bullet   932 / 947
    covers         649        contracts with NO sub-bullets at all   3 / 947
    proven by      387
    falsifiability  38
    would-be test   12

`parseContracts` already SPLIT those bullets off each item — `splitItems` preserves them by name
("multi-line continuations (the asserts bullets)") — and then discarded them, by a first-slice scope
decision recorded in its own header. So the declared obligations were on disk, already parsed, and
thrown away. Nothing about recovering them needs a schema change.

**THE NUMERATOR DOES NOT EXIST.** This is the finding, and it is what makes the question's answer "no"
rather than "yes, with work". Two independent measurements:

1. *There is no clause→test channel.* Coverage works today because a contract has IDENTITY — a kebab
   id — and the convention `describe("<id>: …")` puts that id in a test name, so `testNameCoversContract`
   is an exact token match against something the author actually wrote. A clause has no id. Nothing in
   the corpus names one, so a clause-granular denominator of ~1500 would meet a numerator of 0.

2. *The only static proxy has no discriminating power.* The obvious substitute — count substantive
   assertions in the covering test's region and flag `assertions < clauses` — was measured against the
   real sweep (111 real-build capabilities with an existing test file, 375 covered contracts, 154 of
   them declaring ≥2 semicolon-separated clauses):

       assertions < declared clauses      4 of 375     (1.1%)
       covering regions with 10+ asserts  107 of 375

   It fires on four contracts. It cannot work, and the reason is structural rather than a threshold to
   tune: the observable region is a whole `describe` block, so a count cannot distinguish "asserted all
   three clauses" from "asserted clause one three times". Measured under the CONSERVATIVE reading (max
   assertions across matching regions, not sum — summing double-counts nested `it`s inside a matching
   `describe` and inflates the numerator toward the answer being sought); both readings give 4.

**AND THE SEGMENTATION IS UNFAITHFUL TOO**, which matters because it means even the denominator would
be a heuristic if it were split into clauses. Splitting an `asserts` bullet on `;` counts 519 of 932 as
single-clause, but the real corpus writes multi-obligation contracts in comma-and-dash prose:
`child-session-id-is-explicit-and-deterministic` declares that the id is composed from declared build
identity alone, is byte-identical across repeated observation, is never equal to the parent, and
changes if and only if a declared component changes — four obligations, one semicolon-free sentence,
counted as ONE clause. The segmenter under-counts in exactly the place the friction item is about.

Building a clause-granular ratio on top of this would replace a name-granular ratio the check CAN
observe with a clause-granular one whose numerator is inferred and whose denominator is guessed — the
defect class this arc exists to close, re-introduced by the instrument meant to close it. It is the
same shape as ADR-0249's lesson one level up: there, a cross-check against evidence of unknown
provenance was not fail-closed; here, a denominator with no matching observation is not a measurement.

## Decision

**1. `check:coverage` stays NAME-GRANULAR.** It keeps counting "a substantive test names this
contract". Its ceiling axes (`uncoveredCeiling: 119` / `unboundCeiling: 1`, ADR-0252 D3) are unchanged,
and its existing footer already discloses the granularity it has ("COVERED = a SUBSTANTIVE test NAMES
the contract … A substantive-but-irrelevant assertion still reads covered"). No new list, no new warn
band, no re-baseline. The same granularity rides the SIGNED VERDICT — ADR-0127's
`Verdict.contractCoverage` records covered/uncovered declared contract ids at sign time — so this holds
one granularity across both surfaces, not just the gate's.

**2. The declared obligations are PARSED and no longer discarded.** `ContractDecl` gains
`obligations: ObligationDecl[]` — the labelled sub-bullets, label normalised, wrapped continuation
lines rejoined, source-ordered. The label vocabulary is read off the prose rather than fixed, because a
closed set would silently reclassify a newly-coined label as prose. This is the half that is
mechanically derivable, it is the shared prefix of every route below, and it makes this ADR's own
numbers re-derivable from shipped code rather than from a session's scratch script — which the arc's
end state requires of its evidence.

**3. The clause SEGMENTER is refused, not deferred.** The exact structure is parsed; the heuristic one
is not shipped, in either the schema or the report. A `clauses: string[]` field would be read as a
denominator by the next consumer, and its unfaithfulness would not travel with it. Recorded as a
refusal in `contracts.ts` so a later session finds the reason at the code, not only here.

**4. Making clause coverage REAL requires clause IDENTITY, and that is the open fork this ADR does not
take.** A clause becomes observable the same way a contract already is: it carries an id an author can
put in a test name. Note what the fork crosses: ADR-0127 attests these same declared-contract ids on
the PUBLISHED `Verdict` shape (`Verdict.contractCoverage`), and records that changing that shape is an
owner call (the owner-fork-bar). Route (a) therefore moves the verdict shape as well as the check;
route (b) leaves it untouched. The candidate routes, none costed here:

- **(a) Clause ids in the authoring format** — sub-ids under a contract (`<contract-id>/<clause>`),
  named by tests the way contract ids are today. Exact and observable; a schema change plus a
  retrofit across ~2,000 authored obligations, and it makes contracts more expensive to write.
- **(b) Split the contract instead** — if a contract declares four obligations, it is arguably four
  contracts. Needs no new schema at all; it is a story-author discipline question, and it moves the
  `check:coverage` denominator by construction, so its ceiling interaction must be measured first.
- **(c) A semantic reviewer** — the follow-on ADR-0122 R4 named as the escalation from name-presence,
  and that ADR-0126 then aimed at the adjacent gap its vouching input leaves (a
  substantive-but-irrelevant assertion reading covered). Judges relevance rather than counting;
  outside what a static sweep can do, and priced accordingly.

**5. The sibling friction item `contract-without-a-falsifiability-clause-…` is NAMED, not folded in.**
`falsifiability` is present on 38 of 947 contracts, and unlike clause coverage its presence IS exactly
observable. It is left out deliberately: a check on it would open a new advisory list at ~900 entries,
in the same gate whose warn-list hygiene this arc is bounding, and starting a list an order of
magnitude past the ceiling it would need is the failure ADR-0252 D3 exists to prevent. It needs its own
increment and its own baseline.

## Consequences

**Good.** The friction item is answered with measurement rather than intuition, and answered in the
direction that does not add an unobservable claim to the proof layer. The declared obligations become
machine-readable for the first time, so whichever route the fork takes reads the same parse. The two
numbers a later session would otherwise re-derive (932/947 carry an `asserts`; the assertion proxy
fires on 4 of 375) are pinned in an ADR and, for the first, reproducible from the shipped parser.

**Bad, ACCEPTED KNOWINGLY on ratification, and recorded rather than glossed.** The leak the friction
item names is NOT closed — a multi-clause contract still ships at N/N, and this ADR explains why
rather than fixing it. That is a worse outcome than a fix and a better one than a ratio nobody can
trust. On 2026-08-13 the owner ratified this ADR as it stands, which makes that under-count a
DELIBERATE, DISCLOSED LIMIT rather than a pending repair: `check:coverage` and the signed verdict
over-claim exactly as much as they did before, and the disclosure in the check's footer ("COVERED = a
SUBSTANTIVE test NAMES the contract") is the only thing standing between a reader and "N/N means
everything is asserted". Decision 4's three routes stay available and stay UNCOMMISSIONED; taking one
is a fresh decision with its own cost, not the discharge of a debt recorded here.

**The concession is real and should not be softened by later readers.** This arc exists to stop a
proof layer reporting a green it has not earned, and a coverage axis that reads N/N for a contract
whose other clauses are unproven is an instance of exactly that. Ratifying is a judgement that the
available fixes cost more than the mis-reading does — a schema change plus a ~2,000-obligation
retrofit (route a), a story-author discipline change that moves a zero-headroom ceiling by
construction (route b), or a semantic reviewer priced as its own initiative (route c) — NOT a
judgement that the axis is honest. Anyone citing this ADR as evidence that contract coverage is sound
is citing it wrongly.

**A parser lands ahead of its consumer.** `obligations` is parsed and, today, read by nothing but its
own tests — the shape CLAUDE.md flags on ADR-0259 ("adding the backend migrated nobody"). Declared
plainly so it is not mistaken for a wired feature. It is additive and optional, so no existing consumer
of `ContractDecl` changes behaviour.

**One deliberate schema subtlety.** `obligations` is OPTIONAL, and absent ≠ empty: `[]` means parsed
and it declares none (3 of 947); ABSENT means the `ContractDecl` was hand-constructed and nothing was
observed either way. A consumer reading `undefined` as "declares none" would report a fact it never
observed — the ADR-0251 absent-vs-falsy rule applied one tier down.

## References

- Friction: `check-coverage-counts-a-test-name-not-a-contracts-clauses` (the question),
  `contract-without-a-falsifiability-clause-under-authors-the-leafs-test` (decision 5),
  `zero-contract-coverage-lets-an-unimplemented-contract-ship-on-a-signed-pass` (the cluster's cost).
- ADR-0020 §3 — a signed green attests ONE authored test, not every enumerated contract (the gap).
- ADR-0122 — **amended**: its name-granular contract→test mapping is held (decisions 1/3) and the
  `parseContracts` unit its decision enumerates is widened (decision 2); nothing it decided is
  overturned.
- ADR-0126 — the vouching (hollow-test AST) input to that same mapping; the ADR that names the
  substantive-but-irrelevant gap decision 4(c) routes to ADR-0122 R4's semantic reviewer.
- ADR-0127 — the same declared-contract-id granularity attested on the signed `Verdict`
  (`contractCoverage`), which is why decision 4's fork crosses the published verdict shape.
- ADR-0249 — a cross-check against evidence of unknown provenance is not fail-closed (the same shape,
  one tier up).
- ADR-0251 — an ABSENT key is distinguished from a falsy value.
- ADR-0252 D3 — advisory warns with a drain ceiling; why decision 5 is not folded in.
- Code: `packages/library/src/contracts.ts` (the parse + the recorded refusal),
  `packages/orchestrator/src/proof/contract-coverage.ts` (the name-granular classifier),
  `packages/cli/src/coverage-gate.ts` / `coverage-drain.ts` (the sweep and its ceiling).
