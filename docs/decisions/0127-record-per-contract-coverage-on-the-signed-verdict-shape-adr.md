---
status: accepted
load_bearing: true
decided: 2026-06-27
amends: [122]
---
# ADR-0127: Record per-contract coverage on the signed verdict shape (ADR-0122 Option A)

## Status

accepted (2026-06-27) — decided/directed by the owner in conversation on 2026-06-27 (the minimal
two-list shape · additive/optional · no new signer). Design-time alignment IS the ratification
(ADR-0110); no second end-of-flow ask. BUILT in the same unit.

**Corrected in place 2026-08-06 per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md),
twice on the same day.** This decision stands ENTIRELY — additive/optional, no new signer, the lazy
GATE-time seam, and the owner's minimal choice (no covering test names frozen on the verdict). What was
overtaken is a GUARANTEE that read as complete: decision 2's *FAIL-CLOSED … never a false "fully
covered"* bounds one direction only, and the opposite direction is what went wrong in production —
PR #1172 stamped `coverage 0/6 contracts` onto a signed `--real` verdict whose six tests all existed
and passed. The clause is scoped below and the incident added to the deferred limits. The SECOND pass
then CLOSED that deferred limit: the axis now carries `unreadTitles`, so a signed `uncovered` states
which of the two things it means. A shape detail in decision 1 moves with it — the follow-on this ADR
itself named is what built it, so recording the outcome is truth-maintenance, not a re-decision.
Two `check:coverage` mentions below (the **Amends** paragraph and Context) are left as written: both
sit in past-tense frames describing what ADR-0122 built and the pre-0127 world, and are history rather
than live wiring claims — that rung was retired by
[ADR-0311](0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md) D2 on 2026-08-05, and
`storytree coverage` is the surviving live surface.

**Amends** [ADR-0122](0122-per-contract-coverage-check-map-each-declared-contract-to-an.md) — ADR-0122
built the per-contract coverage check as a LIVE-DERIVABLE tool (`storytree coverage` / `check:coverage`)
and named "no coverage axis on the verdict shape" as a deferred follow-on (its "Option A"); this closes
that follow-on by attesting coverage ON the signed verdict, without overturning anything 0122 decided.

## Context

[ADR-0122](0122-per-contract-coverage-check-map-each-declared-contract-to-an.md) made under-coverage
CATCHABLE: a pure classifier maps each declared `## Contracts` behaviour to an OBSERVED test by the
naming convention, and [ADR-0126](0126-static-ast-hollow-test-detection-a-contract-is-covered-only.md)
strengthened the input so only a test that VOUCHES (runs AND asserts substantively) counts. But that
coverage fact was only ever **live-derivable** — re-computed each run by `storytree coverage <cap>` and
the `check:coverage` gate sweep against whatever source is on disk *now*. The signed
[`Verdict`](../../packages/proof-protocol/src/proof.ts) (the published, cross-organism message format,
ADR-0068 §3) recorded `proofMode` + `boundHash` for the ONE proved span, with **no link** to the
capability's declared contract set.

So a reader of a historical green could not see *which contracts that green covered* without re-running
the classifier — and a later source change could shift the answer out from under the verdict. ADR-0122
itself named the fix ("Option A — the richer mechanism, recording per-contract coverage on the signed
verdict") and deferred it. This is that follow-on.

Because the `Verdict` shape is the PUBLISHED format every organism `.safeParse()`s across the ADR-0010
§4 boundary, changing it is an owner decision (the owner-fork-bar). The owner directed two points in
conversation on 2026-06-27: (a) record the **minimal** shape — just the covered/uncovered declared-id
lists, NOT a richer per-contract record with the covering test name; and (b) make it **additive /
optional** (default-absent), never a required field.

**Scoped 2026-08-06 per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md):
"changing it is an owner decision" is stated here as a universal, and it is not one.** It was the right
call for the change this ADR makes — ADDING a whole axis to the published verdict, whose CONTENT
(minimal vs rich) is a taste call with no engineering answer, which is `owner-fork-bar` test (3). It
does not follow that every later touch of the shape is owner-level: that bar's three tests are
irreversible / outward-facing / value-laden-and-unsettleable-from-the-corpus, and a strictly additive
optional qualifier INSIDE an already-optional axis fails all three (see the last deferred limit, where
one was settled agent-side on exactly that reasoning). The property the owner actually fixed is (b) —
additive/optional, never required — and it is that property, not owner ratification per touch, that
keeps every stored verdict round-tripping. Left as one live caveat rather than removed: an out-of-repo
reader pinned to an OLDER `.strict()` copy of this schema would reject a verdict carrying a field it
does not know, so "additive" is a guarantee about stored verdicts and in-repo readers, not about
arbitrarily-pinned external ones. Nothing about the 2026-06-27 decision changes.

## Decision

Add an **additive, optional** per-contract coverage axis to the signed verdict, populated at sign time
by reusing the existing classifier — no new signer, no new gate posture (it inherits ADR-0122 /
ADR-0126 / ADR-0020).

1. **Shape (the owner's minimal choice).** A new browser-safe zod shape
   [`ContractCoverageAxis`](../../packages/proof-protocol/src/proof.ts) = `{ covered: string[];
   uncovered: string[]; unreadTitles?: number }` (strict), and an OPTIONAL `Verdict.contractCoverage`
   field. The two declared-contract-id lists — the contracts a SUBSTANTIVE test covered vs the ones the
   green over-claimed — plus ONE honesty qualifier on those lists (`unreadTitles`, added 2026-08-06;
   the deferred limit below is what it closes). The covering test name(s) stay live-derivable
   (`storytree coverage`), not frozen on the verdict. Additive/back-compat: default-absent, so every
   prior stored verdict and every non-coverage producer round-trips unchanged (mirrors `boundHash` /
   `approvedBy`). A reader keys off PRESENCE, never absence — a missing axis means "not recorded",
   never "fully covered".

   **`unreadTitles` does not reopen the owner's minimal choice.** That choice ruled out freezing the
   covering test NAMES — verbosity with no honesty payoff. This is the opposite kind of field: without
   it `uncovered` means two different things at once (decision 2), so it is what makes the two lists
   mean anything at all. Read as THREE states, which is why the producer stamps it even when zero:
   **absent** = signed before the field existed (never measured, and unresolvable after the fact);
   **`0`** = measured clean, so `uncovered` is a claim about the TESTS; **`> 0`** = measured with a
   caveat, so `uncovered` is at least partly a claim about the CHECKER. Optional in the schema purely
   for back-compat with verdicts already stored without it — the current producer always populates it.
   It qualifies a claim and is never a gate signal on its own.

2. **Population — a lazy GATE-time seam, reusing the ADR-0126 vouching classifier.** The
   prove-it-gate ([`proveUnit`](../../packages/orchestrator/src/prove-it-gate.ts)) gains an optional
   `ProveSpec.contractCoverage` THUNK it consults only once it reaches GATE (a genuinely-signed green —
   an aborted walk stamps nothing). The real-mode resolver
   ([`resolveReal`](../../packages/orchestrator/src/resolve-prove-spec.ts)) injects it: at GATE it reads
   the LEAF-AUTHORED test file (which does not exist at resolve time, so the compute must be lazy),
   extracts the VOUCHING names (`extractVouchingTestNames`, ADR-0126) and runs `classifyDeclaredCoverage`
   against the unit's `## Contracts`. FAIL-CLOSED: a unit with no declared contracts or an unreadable
   test surface yields `undefined` and the gate OMITS the axis (never a false "fully covered").
   **Scoped 2026-08-06: that fail-closed guarantee is ONE-DIRECTIONAL and was written as if it were
   both.** It bounds a false *fully-covered*; it never bounded a false *uncovered*, and the surface it
   fails closed on is the whole FILE (`readFileSync` throwing, or the parse failing), never an
   individual test whose TITLE the reader could not read — such a test is silently dropped from the
   observed set, and its contract is then stamped `uncovered` on a signed verdict. That is the
   direction that actually went wrong; see the deferred limits below, where the incident and the
   `unreadTitles` qualifier that closes it are both recorded.

3. **Scope — the real red→green path only.** Only a `--real` driven green that resolves a unit's
   contracts carries the axis; dry-run / live-smoke prove a SYNTHETIC pair unrelated to the node's
   contracts (so their proveSpec omits the seam), and the `adopted` / `operator-attested` paths prove a
   whole command / human witness, not named per-contract tests (so they round-trip without it — the
   optionality makes this clean, no migration).

4. **Reader.** [`verdictLine`](../../packages/orchestrator/src/proof/verdict-line.ts) appends a
   coverage clause when the axis is present (`… — coverage <covered>/<total> contracts [(⚠ uncovered:
   …)]`), so the attested fact is visible at a glance; omitted entirely when absent (every pre-ADR-0127
   verdict renders exactly as before).

## Consequences

**Good.**
- The coverage fact is now **attested on the signed green**, not merely re-derivable later against
  possibly-changed source — a genuinely-under-covered verdict CARRIES its gap (`uncovered` non-empty), a
  fully-covered one carries the full set (observability-first: the over-claim is on the record).
- Reuses the ADR-0126 vouching classifier wholesale, so the verdict's axis is hollow-aware for free — a
  contract named only by an `assert(true)` reads uncovered ON the verdict, same as in the live tool.
- Fully additive: no existing reader breaks, no stored verdict needs migration, the adopted /
  operator-attested paths are untouched. The honesty walls (ADR-0020 red→green, ADR-0126 vouching) are
  unmoved — this only RECORDS an existing computed fact onto the verdict.

**Bad / costs / deferred (the named follow-ons).**
- **Minimal shape, by owner choice.** The covering test name(s) are NOT frozen on the verdict; an
  audit wanting "contract X covered by test Y at sign time" must re-derive it live. A richer
  per-contract record is a later ADDITIVE bump if a consumer needs it.
- **Static / vouching, not semantic (inherited).** The axis records what ADR-0122/0126 compute — a
  substantive-but-IRRELEVANT assertion under the right name still reads covered. Judging relevance is
  the deeper follow-on (a semantic reviewer-agent, ADR-0122's R4), explicitly owner-sized and not built
  here.
- The axis rides only the `--real` driven-green path; coverage for adopted/operator-attested green is
  out of scope (those modes have no named per-contract test surface to classify).
- **A wrong `uncovered` went out under a signature — added 2026-08-06, MEASURED not predicted; now
  CLOSED.** PR #1172 stamped `coverage 0/6 contracts` onto capability `offer-set-render-agreement`'s
  signed `--real` verdict while all six tests existed, named their contracts verbatim, asserted
  substantively and passed. The cause was in the shared reader, not here: a title assembled as
  `"…" + "…"` (the ordinary way to split a long title across two lines) was not read, so the whole test
  was dropped before `classifyDeclaredCoverage` ever saw it — the exact seam quoted above, with the
  leaf-authored file inside that PR carrying the shape. The reader was FIXED (ADR-0126, 2026-08-06) and
  that fix reached this path, because `extractVouchingTestNames` became a thin wrapper over
  `readTestSurface`. What did NOT reach it was the CAVEAT: `readTestSurface` also returns
  `unreadTitles`, and `computeContractCoverage` (`resolve-prove-spec.ts`) took only `.vouching` and
  discarded the count — so for the residual shapes the reader still cannot fold (a title with a
  genuinely RUNTIME part, which ADR-0126 deliberately leaves contributing only its literal text) the
  live tool said *I could not read N titles* while the signed verdict said a bare `uncovered`,
  indistinguishable from a real gap and frozen. Since [ADR-0311](0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md)
  D2 retired the `check:coverage` rung, that stamped number is what survives.
- **How it was closed (2026-08-06): CARRY the count, don't drop the axis.** The seam now takes
  `readTestSurface` whole and stamps `unreadTitles` (decision 1). The considered alternative — omit the
  axis entirely whenever a title is unread, which is what decision 2's existing whole-file fail-closed
  rule would suggest — was REJECTED on measurement, not taste. Across all 123 real-build test surfaces
  in the repo exactly ONE produced an unread title, and it was a **phantom**: `it.each(table)(title, fn)`
  is two nested calls that both reach root `it`, and the inner factory's data TABLE was being counted as
  a title the reader "could not read". So the omit rule would have DELETED `render-claim-as-wisp`'s
  correct 2/3 axis on the strength of a miscount — and in every future case it would destroy the
  coverage fact for the readable majority in order to flag a minority caveat. Carrying the count keeps
  both facts and makes the verdict self-describing, which is the property the incident above actually
  wanted. The phantom is fixed in the same change (`matchTestCall` skips the `.each` factory; ADR-0126's
  title-FOLDING rule is untouched — this is about which nodes are test declarations at all), so the
  number the verdict freezes is one the checker can stand behind. Settled agent-side rather than as an
  owner fork, against all three `owner-fork-bar` tests: not irreversible (additive and optional, and
  removable by deleting a field nothing gates on), not outward-facing, and not unsettleable from the
  corpus — ADR-0126 already decided the substance, that *"an UNREAD title may never share a bucket with
  an ABSENT test"*. See the scope note in Context: this ADR's own "changing the shape is an owner
  decision" was about ADDING the axis, not about every later touch of it.

## References

- [ADR-0122](0122-per-contract-coverage-check-map-each-declared-contract-to-an.md) — **amended**: this
  closes its deferred "no coverage axis on the verdict shape" follow-on ("Option A").
- [ADR-0126](0126-static-ast-hollow-test-detection-a-contract-is-covered-only.md) — the vouching
  extractor the GATE-time seam reuses, so the axis is hollow-aware. **Since 2026-08-06 the seam calls
  `readTestSurface` rather than `extractVouchingTestNames`** (the latter is now a thin wrapper over the
  former): same vouching names, plus the `unreadTitles` count this ADR's axis now carries. 0126 also
  supplies the RULE that makes the count non-optional — an UNREAD title may never share a bucket with
  an ABSENT test.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) §4 — the signed-verdict honesty floor
  this records onto, unchanged.
- [ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md) §3 — the published verdict SHAPE
  (`@storytree/proof-protocol`) this additively extends.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — the owner's
  design-time direction is the ratification (born accepted).
- Code: `packages/proof-protocol/src/proof.ts` (`ContractCoverageAxis` + `Verdict.contractCoverage`),
  `packages/orchestrator/src/prove-it-gate.ts` (the GATE-time seam + stamp),
  `packages/orchestrator/src/resolve-prove-spec.ts` (`computeContractCoverage`, the real-mode injection),
  `packages/orchestrator/src/proof/verdict-line.ts` (the reader). Tests: the `*.test.ts` beside each.
