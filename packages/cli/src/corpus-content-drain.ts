// The corpus-content drain ceiling — the PURE, IO-free core of `check:corpus-content`.
//
// ADR-0120 built this check to reconcile the seed against the live store BODY-for-body (the content
// diff `check:corpus-sync`'s id/count comparison never did) and left it advisory, WARN-only, on the
// established pattern: which SIDE is canonical is a per-artifact judgement no gate may make. That
// reasoning is still right about DIRECTION and wrong about ACCUMULATION — how many artifacts sit
// unreconciled is not a judgement, and leaving it unbounded meant every size the list reached printed
// the same WARN and exited 0. This closes that gap in the shape ADR-0168 D4 established, the third
// worklist bounded under the `warn-list-hygiene` instrument (`verification-integrity-arc`, ADR-0252 D3;
// the first two were `check:graduation-worklist` and `check:surface-coverage` — see
// `graduation-drain.ts` and `surface-coverage-drain.ts`).
//
// THE MEASURED DEFECT, as inputs → wrong outcome — not an argument, a differential control run over
// the REAL `check:corpus-content` binary with only its SEED input varied (`STORYTREE_REPO_ROOT`
// repointed at a scratch root holding one revision's `knowledge.json`, ADR-0246), the live store held
// fixed at what the DB carried on 2026-07-28:
//
//   seed @ 5d8977f8 (2026-06-27, the check's own landing commit)  value-drift=122  exit 0
//   seed @ 3f391af6 (2026-07-05)                                  value-drift=18   exit 0
//   seed @ 33f6e690 (2026-07-06)                                  value-drift=18   exit 0
//   seed @ 4e41f743 (2026-07-11)                                  value-drift=18   exit 0
//   seed @ 5bceb525 (2026-07-14)                                  value-drift=14   exit 0
//   seed @ 55a4649d (2026-07-18)                                  value-drift=15   exit 0
//   seed @ cd617923 (2026-07-21)                                  value-drift=16   exit 0
//   seed @ bbf92262 (2026-07-26)                                  value-drift=14   exit 0
//   seed @ 671c8a3e (2026-07-28, HEAD)                            value-drift=14   exit 0
//
// The count wandered across an ORDER OF MAGNITUDE — 122 down to 14, back up to 16, down to 14 — and
// the exit code was 0 at every single point. A 122-item worklist is not a hypothetical size this list
// might one day reach; it is a size this check has demonstrably printed while passing. That is the
// class `warn-list-hygiene` locates: no size this list reaches fails anything. (What the control
// varies is the SEED, which is what git can replay; the live side is one snapshot, so the table is a
// measurement of the check's OUTPUT against varied committed input, not a reconstruction of each
// day's historical drift. The exit code is the invariant either way.)
//
// THE APERTURE WAS WRONG, AND THAT IS WHAT ADR-0290 CORRECTS — read this before reading the ceilings.
// Everything above is still true about ACCUMULATION and is untouched. What it got wrong is WHOSE
// accumulation. This check compares the committed seed against the LIVE store: the seed is one
// branch's working tree, the live store is shared by every concurrent session and by the studio. So a
// per-branch surface was being joined against a machine-shared one and the total charged, at a ZERO
// ceiling, to whoever ran the gate next — which is routinely not the party that caused it.
//
// Measured on branch claude/sleepy-northcutt-4d5383, 2026-08-02, before any of ADR-0290 landed:
// HEAD == origin/main (`git rev-list --left-right --count origin/main...HEAD` → `0 0`), working tree
// clean, zero commits, zero live writes. The check exited 1 with `3 value-drift` naming
// `friction-adjudication`, `merge-ceremony`, `the-same-file-in-another-tree-is-a-different-file`. A
// session that had done nothing, on a branch identical to main, could not land. It cannot be
// staleness (the branch IS main) and cannot be that session's edit (there is no diff), so all three
// were siblings' undrained live edits. Six sessions filed that defect independently rather than as
// reinforcements, which is itself the measurement that the guidance loop had stopped converging.
//
// SO THE AXES ARE NOW SCOPED BY AUTHORSHIP, NOT LOOSENED. The ceilings stay at ZERO. What changed is
// the population each one measures, computed from two EXACT signals — the branch's own seed diff
// against the merge base (git), and the latest live writer per artifact
// (`events.library_event.actor`) — in `corpus-content-attribution.ts`, which owns that reasoning.
// This is the ADR-0269 4(f) aperture decomposition, and it is a NARROWING in one direction and a
// WIDENING in another, which is what distinguishes it from gaming:
//
//   NARROWED — drift no signal attributes to this branch no longer reds it. It is still printed, still
//     named, still counted, and now additionally carries its writer and the reason it is not yours, so
//     nothing prints more quietly than before (ADR-0095: no silent caps).
//   WIDENED — a live-only export-scope artifact THIS BRANCH authored now reds, and the check has been
//     structurally blind to that population its entire life. `diffCorpusContent` iterated the SEED
//     scope and skipped any id live carried but the seed did not, so a durable artifact created live
//     and never exported was neither value-drift nor degraded-live; it was nothing. Measured
//     2026-07-30: a GREEN `OK — every seed body matches live across 177 export-scope artifacts`
//     alongside an `export-corpus --pg` dry run reporting one pending addition in the same shell.
//
// A raise was never available and is not what happened: ADR-0269 forbids one, and the population did
// not enlarge — it was mis-defined. Softening the check beneath a ceiling remains the named gaming
// failure mode on `process:verification-decay-detection`, and the WIDENING axis is the direct evidence
// that this is not that.
//
// THE THREE AXES, each redding on its own and NEVER summed, with genuinely different remedies:
//
//   - AUTHORED VALUE-DRIFT — an artifact this branch is answerable for whose live body is a valid
//     current body differing from seed. Which side is canonical is still not inferable and still
//     ADR-0120's per-artifact judgement — but it is THIS session's judgement to make, because this
//     session made the edit. Discharged per artifact: `export-corpus --id <id> --pg --write`.
//   - DEGRADED-LIVE — live is BELOW THE SCHEMA FLOOR (e.g. an artifact stored in the rendered
//     `{body, category}` shape a `--pg` mishap or a studio asset-edit can leave). Here direction is
//     NOT a judgement: the SEED is canonical by construction, and `computeExportedSeed` REFUSES to
//     export such a body because writing it would corrupt the seed. A data-integrity fault, not an
//     edit.
//   - AUTHORED LIVE-ONLY — an export-scope artifact this branch created live and never carried into
//     the seed. Same remedy as the first axis, opposite blind spot.
//
// That they must not be summed is MEASURED, not asserted. Against the live store on 2026-07-28
// (value-drift=14, degraded-live=0), simulating the realistic concurrent case — a sibling drains one
// value-drift by export while one live body degrades — moved the axes to value-drift=13,
// degraded-live=1. The SUM stayed at exactly 14. A summed ceiling of 14 saw nothing on either side of
// that change; the split pair (V=14, D=0) reds. A schema-floor breach would have hidden inside
// editorial headroom, which is the more severe class hiding inside the noisier one.
//
// DEGRADED-LIVE IS DELIBERATELY *NOT* ATTRIBUTION-SCOPED, and that is a decision rather than an
// oversight — it is the one axis where a foreign red is affordable. Its remedy is per-artifact
// (`artifact edit <id> --file <seed> --pg`), its direction needs no judgement (the seed is canonical
// by construction), and it writes only the LIVE store — so unlike the export, discharging someone
// else's degraded body puts nothing foreign in your commit under your name, which is the hazard the
// rest of ADR-0290 exists to remove. It has also read ZERO at every one of the nine sampled seed
// revisions in the control above, so scoping it would buy nothing and cost the corruption guard. The
// one caveat belongs in the printed remedy, not here: restoring from a STALE branch's seed writes a
// stale body live, so merge `origin/main` before restoring.
//
// THE SUBSTRATE GUARD IS INVERTED RELATIVE TO ITS SIBLINGS, and that is the finding, not a detail. The
// expectation going in was `surface-coverage-drain.ts`'s: that a missing substrate would INFLATE the
// count and threaten a false RED, needing a fail-open suppression. Measured on this checkout, the
// opposite is true. `diffCorpusContent` skips any seed id live carries no row for, so:
//
//   live store as-is        drifted=14  compared=160  comparedLive=160  clean=false
//   live store EMPTY        drifted=0   compared=160  comparedLive=0    clean=TRUE
//   live store TRUNCATED    drifted=0   compared=160  comparedLive=10   clean=TRUE
//
// A deficient live store cannot manufacture a breach — it can only DELETE comparison candidates, so
// the reported count is a strict LOWER BOUND on the true one. A breach therefore stays enforced
// whatever the substrate did: if a lower bound is already past the ceiling, the real count is too.
// What a deficient store manufactures instead is a false CLEAN, and before this the check would print
// `OK — every seed body matches live across 160 export-scope artifacts` against a store holding none
// of them. So the guard here refuses to certify rather than refusing to fire: with the compared-live
// population short of the seed scope, the verdict may not be `ok`. Fail-open on the substrate is
// carried where it always was — the shell SKIPs and exits 0 on an unreachable DB or absent creds, the
// path that predates this ceiling and is unchanged by it.
//
// ATTRIBUTION, BY CONTRAST, FAILS CLOSED. If the git or event-log signals could not be read, the shell
// hands every drifted id in as AUTHORED — the pre-ADR-0290 behaviour — and prints why. The asymmetry
// is deliberate and argued in `corpus-content-attribution.ts`: a wrongly-charged red costs a merge or
// a routed report, while a wrongly-excused red lands a one-sided edit that no later gate will catch,
// because the next session's check would excuse it as foreign too.
//
// IT GATES ACCUMULATION ONLY. No number here decides which side of a drift is canonical — that stays
// ADR-0120's per-artifact judgement, exactly as before. A breach is discharged by a drain that is
// already in the operating discipline: export live→seed where live is canonical, or restore seed→live
// where it is not (ADR-0252 D3: a ceiling's remedy is a drain, never a raise).
//
// THE ALL-OR-NOTHING LIMITATION IS NOW CLOSED, AND IT TOOK BOTH HALVES. This header used to record
// that the value-drift drain was a single act — `export-corpus --pg --write` rewriting every drifted
// seed body at once, with no per-artifact verb in the live→seed direction — so a session that
// breached V by one could not discharge only its own item. ADR-0263 removed the first half by
// narrowing the export scope to the durable tier (the batch went from 13 updates + 236 additions to
// 13 + 14; measured to move V by exactly ZERO on the way through, which is what distinguished it from
// gaming the measure). ADR-0290 removes the second: `export-corpus --id <id> --pg --write` scopes the
// write to named artifacts through `computeExportedSeed`'s single narrowing point, so a session
// discharges exactly what it authored and carries no sibling's body.
//
// WHAT REMAINS TRUE ABOUT THE UNSCOPED EXPORT — a green `check:corpus-content` is still NOT a promise
// that a BARE `export-corpus --write` is a no-op, because the unscoped append pass still adds every
// live-only artifact, including ones this check now reports but does not charge. Read the dry run
// (`export-corpus --pg`, no `--write`) before writing, and make the per-artifact direction call on any
// `added (live-only)` id you did not author — it can be a graduation that never reached the seed
// (export it) or an artifact deliberately retired live (do NOT export it; drop the live row).
// `process:library-edit-ceremony` owns that judgement. The `--id` form is what makes obeying it cheap.
//
// PURE by construction: no `node:` import, no filesystem, no clock, no `pg`. The live read, the git
// reads and the event read live in the shell `check-corpus-content.ts`, which also sets the exit code.

/** The tunable ceilings — one per axis, never summed. */
export interface CorpusContentDrainConfig {
  /**
   * Export-scope artifacts THIS BRANCH is answerable for whose live body is a valid CURRENT body
   * differing from seed. Strictly above this reds.
   */
  authoredDriftCeiling: number;
  /** Export-scope artifacts whose live body is BELOW THE SCHEMA FLOOR, whoever wrote it. Strictly above this reds. */
  degradedLiveCeiling: number;
  /**
   * Export-scope artifacts THIS BRANCH created LIVE and never carried into the seed. Strictly above
   * this reds. A population the check was structurally blind to before ADR-0290.
   */
  authoredLiveOnlyCeiling: number;
}

/**
 * THE CEILINGS, all THREE at ZERO, and each zero earned differently. The first two were baselined on
 * real sweeps rather than picked in advance — the run of 2026-07-29 against the live store, AFTER the
 * ADR-0263 drain, found `value-drift=0, degraded-live=0` over 174 export-scope seed artifacts, all 174
 * present live. Setting an axis to exactly what a real run found ships the ceiling GREEN on an honest
 * baseline (a breach is strictly `>`), so it can only ever be TIGHTENED.
 *
 * `authoredDriftCeiling: 0` — ZERO HEADROOM on a NARROWED APERTURE (ADR-0290; ADR-0269 4(f)). This
 * axis was `valueDriftCeiling`, and its history is worth keeping: 14 from 2026-07-28 to 2026-07-29,
 * then ZERO once the ADR-0263 drain reached it. Neither number was ever a tolerance for drift — 14 was
 * the size of a backlog whose only sanctioned remedy was a batch export that would also have written
 * 222 transient artifacts into the seed. What ADR-0290 changes is not the NUMBER but WHOSE drift the
 * number counts. The measured reason is in this module's header: on 2026-08-02 a branch identical to
 * `origin/main`, with a clean tree and no live writes, was blocked by three artifacts it had not
 * touched. Charging that to the branch is not a zero-tolerance ceiling; it is a ceiling over the wrong
 * population, and no value of the constant fixes it.
 *
 * **The remedy for a breach is now exactly one artifact wide**, which is what makes zero affordable
 * rather than punitive: `pnpm storytree library export-corpus --id <id> --pg --write`. Before
 * ADR-0290 the only sanctioned drain rewrote every drifted body at once, so "discharge your own item"
 * meant "commit every sibling's in-flight edit under your name" — the measured cost of that shape was
 * ~20 minutes of hand-written restore scripting per landing, and in one case a foreign artifact's
 * citation to an ADR that was still on an unpushed branch.
 *
 * **A green verdict is still not a promise that a BARE `--write` is a no-op — READ THE DRY RUN.** The
 * unscoped export ADDS every live-only export-scope artifact, including ones now reported here but not
 * charged to this branch. Measured 2026-07-30: clean over 177 alongside one pending live-only addition
 * (`oq-diff-view-altitude`, an owner-retired open question a blind `--write` would have resurrected
 * into the committed seed). Scope the write, or read the dry run and make the direction call.
 *
 * `degradedLiveCeiling: 0` is the real, honest baseline and not an aspiration: every one of the nine
 * sampled seed revisions in the header's control read `degraded-live=0`, so this axis has been at zero
 * across the check's entire life. It is also the axis that most deserves zero. A degraded live body is
 * not an editorial difference — it is an artifact stored below the schema floor, which the exporter
 * REFUSES to propagate, so it cannot drain in the same direction as its sibling and will sit there
 * indefinitely. Its remedy is per-artifact and already sanctioned
 * (`artifact edit <id> --file <seed> --pg`), and it has happened before — a version-floor regression is
 * exactly this shape. The next one reds the gate on its first appearance. It is also the one axis
 * NOT scoped by authorship; the header states why, and the short form is that discharging a stranger's
 * degraded body writes only the live store and so puts nothing foreign in your commit.
 *
 * `authoredLiveOnlyCeiling: 0` is zero at BIRTH rather than by drain, and that is defensible only
 * because it is scoped to authorship from the start. There is no pre-existing backlog to inherit: the
 * axis asks "did THIS branch create a durable artifact live and leave the seed without it", which for
 * a branch that has created none is trivially zero, and for one that has is a duty
 * `process:library-edit-ceremony` step 4 already imposes. Discharged by the same one-artifact command
 * as the first axis. What it closes is a hole the check has carried since it landed — a live-only
 * artifact was counted on NEITHER axis while `computeExportedSeed` appended it anyway.
 *
 * **A raise is never the discharge.** The one legitimate upward move is a genuinely enlarged measured
 * POPULATION — the export SCOPE widening to admit kinds it excludes today (ADR-0263's table:
 * `agent`, `template`, `plan`, `friction`, `arc`, `uat-criterion`) — re-baselined on that new
 * population's first real sweep with the reason recorded here. Note that narrowing the export scope
 * was measured NOT to move the drift axis at all (13 before, 13 after), so scope changes are not a
 * lever on these numbers in either direction. Raising one to accommodate work being landed is the
 * named gaming failure mode on `process:verification-decay-detection`.
 *
 * WITH EVERY CEILING AT ZERO THERE IS NO BAND LEFT BENEATH THEM, so the `warn` level reports only what
 * is deliberately not charged: the substrate shortfall (`unverified`) and the unattributed drift the
 * shell prints in full. That is the intended end state, not a softening — every id the check named
 * before is still named, with strictly more information attached.
 */
export const DEFAULT_CORPUS_CONTENT_DRAIN_CONFIG: CorpusContentDrainConfig = {
  authoredDriftCeiling: 0,
  degradedLiveCeiling: 0,
  authoredLiveOnlyCeiling: 0,
};

/**
 * The minimal projection of the sweep the ceiling needs — deliberately decoupled from
 * `CorpusContentDiff` and from `DriftAttribution` so this core (and its test) stay free of the store's
 * types and of the git/event IO. The caller renders each drift to the id a breach names it by, and has
 * already charged each one (`corpus-content-attribution.ts`).
 */
export interface CorpusContentDrifts {
  /** (a) ids THIS BRANCH is answerable for whose live body is a valid current body differing from seed. */
  authoredValueDrift: readonly string[];
  /** (b) ids whose live body is below the schema floor — the seed is canonical. NOT authorship-scoped. */
  degradedLive: readonly string[];
  /** (c) ids THIS BRANCH created live that the seed does not carry at all. */
  authoredLiveOnly: readonly string[];
}

/** The context the ceiling is evaluated from: whether the live tier was actually compared against. */
export interface CorpusContentDrainContext {
  /** Export-scope seed artifacts in the sweep — the denominator the check prints. */
  compared: number;
  /**
   * Export-scope seed artifacts that actually had a live counterpart. Short of {@link compared} means
   * some seed artifacts were never compared to anything, so a clean result is not evidence of a
   * reconciled corpus (measured: an empty live store reports `clean: true` over 0 of 160).
   */
  comparedLive: number;
  /**
   * Drift the sweep found but did NOT charge to this branch — stale plus foreign. Carried so the
   * verdict can state what it deliberately deferred; it never affects the level. Zero when attribution
   * is unavailable, because that path charges everything.
   */
  deferred?: number | undefined;
}

/** The computed verdict — `level: "red"` drives a non-zero exit, so landing needs a drain. */
export interface CorpusContentDrainVerdict {
  /** `ok` (clean over a fully compared population) · `warn` (deferred drift, or an unverified population) · `red` (a breach). */
  level: "ok" | "warn" | "red";
  authoredDriftCount: number;
  degradedLiveCount: number;
  authoredLiveOnlyCount: number;
  /** Ceiling breaches, one per breached AXIS. Non-empty iff `level === "red"`. */
  breaches: string[];
  /**
   * Why a zero-drift result was NOT certified as `ok`: the compared-live population fell short of the
   * seed scope, so the sweep skipped artifacts rather than matching them. Set only when it applies —
   * so a substrate shortfall is reported, never silently read as a clean corpus.
   */
  unverified?: string;
  config: CorpusContentDrainConfig;
}

/**
 * Evaluate the corpus-content drain ceilings over one sweep's charged drift lists. Pure — inject the
 * compared population.
 *
 * The three axes are evaluated INDEPENDENTLY and never summed. A breach is enforced regardless of the
 * compared population, because a deficient live store can only DELETE comparison candidates: the
 * reported counts are a lower bound, so a breach on a partial sweep is still a real breach. The
 * population instead guards the OTHER end — it withholds the `ok` verdict from a sweep that compared
 * less than the whole seed scope.
 */
export function evaluateCorpusContentDrain(
  drifts: CorpusContentDrifts,
  ctx: CorpusContentDrainContext,
  config: CorpusContentDrainConfig = DEFAULT_CORPUS_CONTENT_DRAIN_CONFIG,
): CorpusContentDrainVerdict {
  const authoredDriftCount = drifts.authoredValueDrift.length;
  const degradedLiveCount = drifts.degradedLive.length;
  const authoredLiveOnlyCount = drifts.authoredLiveOnly.length;

  const breaches: string[] = [];

  // Axis A — the editorial backlog THIS BRANCH owns. Fail-closed strictly above A.
  if (authoredDriftCount > config.authoredDriftCeiling) {
    breaches.push(
      `${authoredDriftCount} artifact(s) this branch authored carry a live body differing from seed, ` +
        `past the ceiling (A=${config.authoredDriftCeiling}): ${drifts.authoredValueDrift.join(", ")}`,
    );
  }

  // Axis B — the schema-floor faults. INDEPENDENT of axis A, never summed with it: a below-floor live
  // body is not discharged by the editorial backlog being short, or the reverse. Not authorship-scoped
  // — see the module header for why this is the one axis where a foreign red is affordable.
  if (degradedLiveCount > config.degradedLiveCeiling) {
    breaches.push(
      `${degradedLiveCount} artifact(s) carry a live body BELOW THE SCHEMA FLOOR, past the ceiling ` +
        `(D=${config.degradedLiveCeiling}): ${drifts.degradedLive.join(", ")}`,
    );
  }

  // Axis C — the population the check was blind to. A durable artifact created live and never carried
  // into the seed is an unfinished ceremony exactly like axis A, with the opposite shape.
  if (authoredLiveOnlyCount > config.authoredLiveOnlyCeiling) {
    breaches.push(
      `${authoredLiveOnlyCount} artifact(s) this branch created live are ABSENT from the seed, past ` +
        `the ceiling (L=${config.authoredLiveOnlyCeiling}): ${drifts.authoredLiveOnly.join(", ")}`,
    );
  }

  // The substrate guard, and note what it does NOT do: it never suppresses a breach. A short
  // compared-live population deflates the counts, so it cannot manufacture one.
  const unverified =
    ctx.comparedLive < ctx.compared
      ? `only ${ctx.comparedLive} of ${ctx.compared} export-scope seed artifacts had a live ` +
        "counterpart to compare against, so the remainder were skipped rather than matched — an " +
        "absent or truncated live tier reports as clean (`storytree library sync-corpus --pg`)"
      : undefined;

  const anyCharged = authoredDriftCount > 0 || degradedLiveCount > 0 || authoredLiveOnlyCount > 0;
  const level: CorpusContentDrainVerdict["level"] =
    breaches.length > 0
      ? "red"
      : anyCharged || (ctx.deferred ?? 0) > 0 || unverified !== undefined
        ? "warn"
        : "ok";

  return {
    level,
    authoredDriftCount,
    degradedLiveCount,
    authoredLiveOnlyCount,
    breaches,
    ...(unverified === undefined ? {} : { unverified }),
    config,
  };
}
