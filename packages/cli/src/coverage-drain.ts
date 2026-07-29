// The contract-coverage drain ceiling — the PURE, IO-free core of `check:coverage`.
//
// ADR-0122 R1 built this sweep and DEFERRED the hard gate, leaving it advisory, WARN-only, on an
// argument that is still right: a build-blocking step would strand legitimately-unbuilt `proposed`
// capabilities, which are honestly uncovered. That reasoning is right about BLOCKING A CAPABILITY and
// wrong about ACCUMULATION — how many contracts sit unproven is not a per-capability judgement, and
// leaving it unbounded meant every size the list reached printed the same WARN and exited 0. This
// closes that gap in the shape ADR-0168 D4 established, the fourth worklist bounded under the
// `warn-list-hygiene` instrument (`verification-integrity-arc`, ADR-0252 D3; the first three were
// `check:graduation-worklist`, `check:surface-coverage` and `check:corpus-content` — see
// `graduation-drain.ts`, `surface-coverage-drain.ts`, `corpus-content-drain.ts`). ADR-0252 names THIS
// list as the live counter-example the instrument was written against: "`check:coverage`'s 121-contract
// WARN backlog".
//
// THE MEASURED DEFECT, as inputs → wrong outcome — not an argument, a differential control run over the
// REAL `check:coverage` binary with only its INPUTS varied. The check code is PINNED at HEAD (its own
// source files copied over each historical tree, and `@storytree/orchestrator` — the classifier it
// reads — resolved to HEAD), so what varies is exactly the check's input: the `stories/**` specs and the
// test files they bind, replayed from git:
//
//   inputs @ 4907ad4a (2026-06-27, the check's own landing day)  caps=16  contracts= 66  exit 0
//   inputs @ 7118e53c (2026-07-05)                              caps=21  contracts= 74  exit 0
//   inputs @ 14643f47 (2026-07-11)                              caps=29  contracts= 98  exit 0
//   inputs @ 9a3d55fa (2026-07-14)                              caps=30  contracts= 96  exit 0
//   inputs @ 199f5de2 (2026-07-17)                              caps=34  contracts=103  exit 0
//   inputs @ d6edc3d3 (2026-07-21)                              caps=38  contracts=112  exit 0
//   inputs @ 176940d9 (2026-07-25)                              caps=41  contracts=121  exit 0
//   inputs @ cffe65c9 (2026-07-27)                              caps=41  contracts=121  exit 0
//   inputs @ acdee89f (2026-07-28, HEAD)                        caps=41  contracts=121  exit 0
//
// The backlog nearly DOUBLED across the check's first month — 66 unproven contracts on the day it
// landed, 121 a month later — and the exit code was 0 at every single point. Unlike its siblings this
// list has never once fallen back toward where it started; it is the only bounded worklist in the arc
// whose measured history is monotone growth. That is the class `warn-list-hygiene` locates: no size this
// list reaches fails anything.
//
// TWO INDEPENDENT AXES, each redding on its own and NEVER summed — and here, unlike ADR-0120's corpus
// diff, the split is NOT handed over by an existing classification. It had to be earned from the
// measurement, so the evidence is given rather than asserted:
//
//   - UNCOVERED — a declared contract that no SUBSTANTIVE test names, on a capability whose registered
//     `real.testFile` EXISTS. The proof surface is there and it does not reach this behaviour. An
//     authoring backlog; the accumulating list. Remedy: author a test naming it, or split/retire the
//     contract.
//   - UNBOUND — a capability whose registered `real.testFile` DOES NOT EXIST on disk. There is no proof
//     surface at all: `loadRealBuildCoverageUnits` fails closed to zero observed names, so every one of
//     its contracts reads uncovered for a reason that has nothing to do with authoring. Remedy: repair
//     the binding, author the file, or withdraw a `proof.real` block that was registered before the unit
//     was built. Counted in CAPABILITIES, because the fault is one broken binding however many contracts
//     hang off it.
//
// The second axis is not a granularity of the first. It falsifies this check's OWN stated safety
// property: `coverage-gate.ts` says "an unbuilt `proposed` capability has no `proof.real` block yet, so
// it is never scanned", and the single instance on this checkout is exactly that — `backend-chat-reset-
// route`, `status: proposed`, an OPTIONAL/STRETCH unit that registered a full `proof.real` block whose
// `chat-reset-route.test.ts` was never authored. The filter that makes the WARN well-behaved leaks, and
// under one summed number the leak is invisible.
//
// THEY MOVE INDEPENDENTLY ON REAL HISTORY, not just in principle — the same nine replayed inputs, split:
//
//   2026-06-27  uncovered= 66  unbound=0        2026-07-17  uncovered=101  unbound=1
//   2026-07-05  uncovered= 72  unbound=1        2026-07-21  uncovered=110  unbound=1
//   2026-07-11  uncovered= 96  unbound=1        2026-07-25  uncovered=119  unbound=1
//   2026-07-14  uncovered= 94  unbound=1        2026-07-28  uncovered=119  unbound=1
//
// `unbound` went 0 → 1 while `uncovered` rose 66 → 72; `uncovered` fell 96 → 94 while `unbound` held.
// Neither tracks the other.
//
// That they must not be SUMMED is likewise measured. Against this checkout (uncovered=119, unbound=1),
// simulating the realistic concurrent case — one session drains two uncovered contracts by authoring
// vouching tests while another MOVES a test file without updating the spec that binds it — gives:
//
//   real       uncovered=119  unbound=1   [summed contracts=121, capabilities=41]
//   simulated  uncovered=117  unbound=2   [summed contracts=121, capabilities=40]
//
// The summed contract total stayed at EXACTLY 121 and the capability count went DOWN, 41 → 40. A ceiling
// on either summed projection saw nothing while a proof surface disappeared; the split pair (U=119,
// B=1) reds. That is the more severe class hiding inside the noisier one — and it also settles which
// projection the accumulating axis is counted in. CONTRACTS, not capabilities: the capability count is
// strictly coarser, and it moved the wrong way through a change that made the corpus worse.
//
// THE SUBSTRATE GUARD POINTS BOTH WAYS AT ONCE, and neither sibling's shape transfers. This check reads
// TWO substrates, and they were measured to fail in OPPOSITE directions (the friction
// `worked-example-substrate-guard-transfers-shape-not-direction` is exactly about not copying a
// direction; here copying either one would have been wrong):
//
//   substrate as-is         specs=281  scanned=112  uncovered=119  unbound=  1   clean=false
//   `stories/` ABSENT       specs=  0  scanned=  0  uncovered=  0  unbound=  0   clean=TRUE
//   `stories/` EMPTY dir    specs=  0  scanned=  0  uncovered=  0  unbound=  0   clean=TRUE
//   test-file tree ABSENT   specs=281  scanned=112  uncovered=  0  unbound=112   clean=false
//
// A missing SPEC corpus DEFLATES to a false clean — `walkSpecFiles` swallows an unreadable directory,
// nothing is scanned, and the check prints `OK — no capability declares contracts against a registered
// real-build test surface (nothing to check)` and exits 0. That is `corpus-content`'s direction. A
// missing TEST-FILE tree INFLATES — every binding resolves to nothing. That is `surface-coverage`'s
// direction. So the guard is built per axis, from the direction each was measured to move:
//
//   - UNCOVERED is enforced UNCONDITIONALLY. Both substrate failures drove it to ZERO, and that is
//     structural rather than lucky: splitting the axes routes every missing-file capability to `unbound`,
//     so nothing a deficient substrate does can add to `uncovered`. Its count is a strict LOWER bound, so
//     a breach on a partial sweep is still a real breach.
//   - UNBOUND is SUPPRESSED when EVERY scanned capability's file is missing (112 of 112 above) — there
//     the count measures the substrate, not the bindings. The breach is still computed and REPORTED,
//     never silently dropped (ADR-0095: no silent caps). The predicate is all-or-nothing deliberately: a
//     percentage threshold would be a number this sweep cannot measure, and 1-of-112 versus 112-of-112 is
//     the discrimination the control actually established.
//   - The `ok` VERDICT IS WITHHELD when nothing was scanned, because that is the exact state in which
//     both deflation scenarios print OK. `corpus-content` reached the same withhold from the same
//     direction, so the shape is shared where the measurement agreed and diverges where it did not.
//
// IT GATES ACCUMULATION ONLY. No number here decides whether a capability should be blocked, which is
// what ADR-0122 deferred and what would strand an honestly-unbuilt `proposed` unit. A breach is
// discharged by a drain already in the operating discipline: author a test NAMING the contract and
// asserting substantively, split or retire the contract, or repair the binding (ADR-0252 D3: a ceiling's
// remedy is a drain, never a raise).
//
// ONE LIMITATION, STATED RATHER THAN DISCOVERED LATER. The `unbound` suppression predicate cannot tell a
// partial substrate failure from real binding rot. If half a checkout's test files were absent, 56 of
// 112 would read as breaching bindings and the ceiling would fire on a substrate fault. The all-or-
// nothing predicate is what the control measured and nothing finer is available from a static sweep, so
// the honest posture is to fire and let a reader see 56 breaches at once — the failure mode is a loud
// false RED on a broken checkout, never a quiet false GREEN.
//
// PURE by construction: no `node:` import, no filesystem, no clock. The disk reads live in
// `coverage-gate.ts`; the shell `check-coverage.ts` sets the exit code.

/** The tunable ceiling constants — one per axis, never summed. */
export interface CoverageDrainConfig {
  /** Declared contracts no substantive test names, on capabilities whose bound test file EXISTS. Strictly above this reds. */
  uncoveredCeiling: number;
  /** Capabilities whose registered `real.testFile` does not exist on disk. Strictly above this reds. */
  unboundCeiling: number;
}

/**
 * THE CEILINGS, both BASELINED on a real sweep rather than picked in advance — the run of 2026-07-28
 * over 281 spec files found `uncovered=119, unbound=1` across the 112 scanned real-build capabilities
 * (121 contracts in the WARN as printed, of which 2 hang off the one unbound capability). Setting each
 * axis to exactly what a real run found ships the ceiling GREEN on an honest baseline (a breach is
 * strictly `>`), so it can only ever be TIGHTENED as the backlog drains — WITHIN A FIXED MEASUREMENT
 * APERTURE (ADR-0269, which amends ADR-0252 D3). The pre-recorded raise below is the one exception,
 * and it is an aperture enlargement rather than a backlog absorption.
 *
 * `uncoveredCeiling: 119` is deliberately NOT zero, and not because 119 unproven contracts are
 * acceptable. Shipping red on a backlog that took a month to accumulate, whose drain is 119 separate
 * authoring judgements spread across two dozen capabilities, would price the next session toward
 * weakening the check instead of draining it. What 119 buys is the property this check has never had:
 * the ONE HUNDRED TWENTIETH unproven contract fails the gate. The differential control above shows why
 * that matters — this list went 66 → 121 without a single run failing, and it is the only worklist in
 * this arc whose measured history never once fell back.
 *
 * IT WILL NEED EXACTLY ONE RAISE, AND THE NUMBER IS RECORDED HERE IN ADVANCE so the session that earns
 * it is not blindsided by a gate it had no way to anticipate. `check:coverage` reads ADR-0126's
 * `analyzeObservedTests`, which parses only the `.skip`/`.todo` MODIFIER and NOT the options form
 * (`test(name, { skip: !DB }, fn)`) — the defect the `vacuous-proof` instrument locates in 7 test files.
 * Teaching it the options form ENLARGES what this sweep can observe, which is the one legitimate upward
 * move (ADR-0269, which amends ADR-0252 D3 — that clause alone grants no upward move at all), and the
 * enlargement was MEASURED rather than feared, which is the differential control ADR-0269 4(b)
 * requires: recomputing the sweep with
 * every options-form-skipped name removed moves `uncovered` 119 → 120 and `unbound` not at all. Exactly
 * ONE contract — `release-claims-by-branch-clears-the-branch` on `claim-store-work-time`, whose sole
 * vouching test is `skip: !DB` in `claim-store-release-by-branch.live.test.ts`. The other six located
 * files bind no capability's `real.testFile` or name no declared contract, so they move nothing (the
 * `vacuous-proof` instrument states this over-report itself). So: the classifier fix re-baselines this
 * axis to 120 IN THE SAME COMMIT, with that reason. It is also the second reason the accumulating axis
 * counts contracts — the capability count is blind to this growth, measured at +0.
 *
 * Any OTHER upward move is the named gaming failure mode on `process:verification-decay-detection`.
 * Raising it to admit work being landed is exactly what this instrument exists to catch.
 *
 * `unboundCeiling: 1` admits the single instance the sweep has carried since 2026-07-05:
 * `backend-chat-reset-route`, a `status: proposed` OPTIONAL/STRETCH capability that registered a full
 * `proof.real` block before its `chat-reset-route.test.ts` was authored. Its drain is either building
 * the unit or a story-author edit withdrawing the premature `real` block — the work hierarchy is
 * story-author's to write, so neither belongs in the increment that bounds the ceiling. This is the axis
 * that most deserves zero and the one with the shortest route to it: it has been 0 (before 2026-07-05)
 * and has been exactly 1 on every sampled day since, so the SECOND unbound capability reds the gate on
 * its first appearance.
 *
 * NO WARN BAND WAS OPENED BENEATH EITHER CEILING. `formatCoverageGate` is untouched: it still WARNs on a
 * single uncovered contract and still names every capability and every contract id, so nothing that
 * printed before prints more quietly now — the RED block is layered ABOVE the existing WARN, never in
 * place of it. Softening the check beneath its ceiling is the named gaming failure mode on
 * `process:verification-decay-detection`.
 */
export const DEFAULT_COVERAGE_DRAIN_CONFIG: CoverageDrainConfig = {
  uncoveredCeiling: 119,
  unboundCeiling: 1,
};

/**
 * The minimal projection of the sweep the ceiling needs — deliberately decoupled from
 * `GateCoverageReport` so this core (and its test) stay free of the gate's types. The caller renders
 * each item to the string a breach names it by.
 */
export interface CoverageGaps {
  /**
   * (a) `<capId>/<contractId>` for every declared contract no substantive test names, on capabilities
   * whose bound `real.testFile` EXISTS.
   */
  uncovered: readonly string[];
  /** (b) capability ids whose registered `real.testFile` does not exist on disk. */
  unbound: readonly string[];
}

/** The context the ceiling is evaluated from: what the sweep actually managed to read. */
export interface CoverageDrainContext {
  /** Spec files walked under `stories/`. Zero means the corpus was not read at all. */
  specFilesWalked: number;
  /**
   * Capabilities scanned — a registered `real.testFile` plus ≥1 declared contract. Zero is the state in
   * which the check prints its "nothing to check" OK, which an absent or empty `stories/` tree also
   * produces (measured), so a clean result there is not evidence of a covered corpus.
   */
  scanned: number;
}

/** The computed verdict — `level: "red"` drives a non-zero exit, so landing needs a drain. */
export interface CoverageDrainVerdict {
  /** `ok` (clean over a real population) · `warn` (gaps within ceilings, or an unverified population) · `red` (a breach). */
  level: "ok" | "warn" | "red";
  uncoveredCount: number;
  unboundCount: number;
  /** Ceiling breaches, one per breached AXIS. Non-empty iff `level === "red"` — unless suppressed. */
  breaches: string[];
  /**
   * Why an `unbound` breach was computed but NOT enforced: every scanned capability's test file was
   * missing, so the count measures the substrate rather than the bindings. Set only when it applies —
   * so a substrate failure is reported, never dropped, and never reds the gate.
   */
  suppressed?: string;
  /**
   * Why a clean result was NOT certified as `ok`: nothing was scanned, so the sweep compared nothing.
   * Set only when it applies — so an unread corpus is reported, never silently read as covered.
   */
  unverified?: string;
  config: CoverageDrainConfig;
}

/**
 * Evaluate the contract-coverage drain ceiling over one sweep's gap lists. Pure — inject what the sweep
 * read.
 *
 * The two axes are evaluated INDEPENDENTLY and never summed: `uncovered > U`, or `unbound > B`, ⇒ `red`.
 * The guards are asymmetric because the two substrates were measured to fail in opposite directions —
 * `uncovered` cannot be inflated by a deficient substrate (every missing file routes to `unbound`), so
 * its breach is enforced unconditionally; `unbound` can be, so its breach is suppressed when EVERY
 * scanned capability's file is missing. A sweep that scanned nothing is never certified `ok`.
 */
export function evaluateCoverageDrain(
  gaps: CoverageGaps,
  ctx: CoverageDrainContext,
  config: CoverageDrainConfig = DEFAULT_COVERAGE_DRAIN_CONFIG,
): CoverageDrainVerdict {
  const uncoveredCount = gaps.uncovered.length;
  const unboundCount = gaps.unbound.length;

  // Axis A — the authoring backlog. Fail-closed strictly above U, and enforced whatever the substrate
  // did: a deficient substrate can only DELETE from this list, so the count is a lower bound.
  const uncoveredBreach =
    uncoveredCount > config.uncoveredCeiling
      ? `${uncoveredCount} declared contract(s) are named by no substantive test, past the ceiling ` +
        `(U=${config.uncoveredCeiling}): ${gaps.uncovered.join(", ")}`
      : undefined;

  // Axis B — the absent proof surfaces. INDEPENDENT of axis A, never summed with it: a capability whose
  // test file does not exist is not discharged by the authoring backlog being short, or the reverse.
  const unboundBreach =
    unboundCount > config.unboundCeiling
      ? `${unboundCount} capability(ies) register a real-build test surface that does not exist, past ` +
        `the ceiling (B=${config.unboundCeiling}): ${gaps.unbound.join(", ")}`
      : undefined;

  // The substrate guard for axis B only — computed AFTER the breach so it is reported, never dropped.
  // Every scanned capability missing its file is a checkout fault, not 112 independent binding faults.
  const suppressed =
    unboundBreach !== undefined && ctx.scanned > 0 && unboundCount === ctx.scanned
      ? `every one of the ${ctx.scanned} scanned capability(ies) is missing its bound test file, so this ` +
        "measures the checkout rather than the bindings"
      : undefined;

  // Both breaches are always REPORTED; axis B is the only one the substrate can manufacture, so
  // suppression drops it from what is ENFORCED without removing it from what a reader sees.
  const breaches = [uncoveredBreach, unboundBreach].filter((b): b is string => b !== undefined);
  const enforcedCount = (uncoveredBreach === undefined ? 0 : 1) + (unboundBreach !== undefined && suppressed === undefined ? 1 : 0);

  // The other end: a sweep that scanned nothing prints OK today, and an absent or empty `stories/` tree
  // reaches exactly that state (measured). Withhold the certification rather than the breach.
  const unverified =
    ctx.scanned === 0
      ? `nothing was scanned (${ctx.specFilesWalked} spec file(s) walked under \`stories/\`), so no ` +
        "contract was compared against any test — an absent or unreadable spec corpus reports as clean"
      : undefined;

  const level: CoverageDrainVerdict["level"] =
    enforcedCount > 0
      ? "red"
      : uncoveredCount > 0 || unboundCount > 0 || unverified !== undefined
        ? "warn"
        : "ok";

  return {
    level,
    uncoveredCount,
    unboundCount,
    breaches,
    ...(suppressed === undefined ? {} : { suppressed }),
    ...(unverified === undefined ? {} : { unverified }),
    config,
  };
}
