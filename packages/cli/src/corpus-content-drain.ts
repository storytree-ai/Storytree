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
// TWO INDEPENDENT AXES, each redding on its own and NEVER summed. Unlike `check:surface-coverage`,
// this gate does not have to be argued into a second axis — ADR-0120 already classifies every drift
// into two kinds with OPPOSITE remedy directions, and neither subsumes the other:
//
//   - VALUE-DRIFT — live is a valid current body that DIFFERS from the seed: a genuine edit. Which
//     side is canonical is not inferable, so it is resolved by direction — export live→seed, or
//     re-edit on the live surface. Editorial divergence; the accumulating list.
//   - DEGRADED-LIVE — live is BELOW THE SCHEMA FLOOR (e.g. an artifact stored in the rendered
//     `{body, category}` shape a `--pg` mishap or a studio asset-edit can leave). Here direction is
//     NOT a judgement: the SEED is canonical by construction, and `computeExportedSeed` REFUSES to
//     export such a body because writing it would corrupt the seed. A data-integrity fault, not an
//     edit.
//
// That they must not be summed is MEASURED, not asserted. Against the live store on 2026-07-28
// (value-drift=14, degraded-live=0), simulating the realistic concurrent case — a sibling drains one
// value-drift by export while one live body degrades — moved the axes to value-drift=13,
// degraded-live=1. The SUM stayed at exactly 14. A summed ceiling of 14 saw nothing on either side of
// that change; the split pair (V=14, D=0) reds. A schema-floor breach would have hidden inside
// editorial headroom, which is the more severe class hiding inside the noisier one.
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
// IT GATES ACCUMULATION ONLY. No number here decides which side of a drift is canonical — that stays
// ADR-0120's per-artifact judgement, exactly as before. A breach is discharged by a drain that is
// already in the operating discipline: export live→seed where live is canonical, or restore seed→live
// where it is not (ADR-0252 D3: a ceiling's remedy is a drain, never a raise).
//
// THE ALL-OR-NOTHING LIMITATION — STATED HERE, THEN RESOLVED, AND THE RESOLUTION WAS NOT THE ONE THIS
// HEADER PREDICTED. The sanctioned value-drift drain is a single act: `storytree library export-corpus
// --pg --write` rewrites every drifted seed body at once, and there is no per-artifact verb in the
// live→seed direction (the seed→live direction has one — `artifact edit <id> --file <seed> --pg`). So
// a session that breached V by one could not discharge only its own item; it had to run the batched
// export over all of them — a librarian judgement across every drifted artifact — or hand-edit one
// seed entry. That is why V shipped baselined at the real count rather than at zero, and this header
// predicted "a future increment may find the honest repair is a per-artifact export verb rather than a
// lower V."
//
// It was not the verb. It was the POPULATION (ADR-0263, 2026-07-29). The export scope was a DENYLIST —
// every structured kind except agent/template/ephemeral — so `friction` (2026-07-06), `arc`
// (2026-07-11) and `uat-criterion` (2026-07-18), all introduced AFTER `export-corpus.ts` (2026-06-27),
// enrolled in the seed export silently, by default. Measured: the batch the drain required was 13
// updates + 236 additions (+6074/-108 lines, `knowledge.json` 584 KB → 2.17 MB), of which 222 were
// transient artifacts the seed has never carried. THAT is what made the batch unrunnable, not the
// verb's granularity. Narrowing the scope to the durable tier took the same drain to 13 updates + 14
// additions (+390/-108) — a diff a librarian can read per-artifact — and it was then run: 11 artifacts
// live-canonical, 2 (`stack-claude-agent-sdk`, `stack-pi-coding-agent`) MIXED and repaired live first,
// because a blanket export would have deleted four corpus-unique, code-verified facts an ADR-0232-era
// rewrite had dropped. The narrowing moved V by exactly ZERO on the way through (13 before, 13 after —
// all 13 drifted were durable-tier), which is what distinguishes it from gaming the measure.
//
// THAT NARROWING IS REAL, BUT IT DOES NOT MAKE THE EXPORT EQUAL TO THIS CHECK'S FINDING — corrected
// 2026-07-30 (librarian pass, ADR-0139 in-place correction). This header previously concluded "a
// per-artifact export verb is therefore NOT needed: at a drained backlog, 'all' IS the one thing this
// session changed." The premise is FALSE, and the two functions disagree by construction:
//
//   - `diffCorpusContent` (export-corpus.ts) iterates the SEED scope and does `const l =
//     liveById.get(s.id); if (!l) continue;` — so an artifact present LIVE and absent from the SEED is
//     invisible to this check on BOTH axes. It is not value-drift and not degraded-live; it is
//     nothing.
//   - `computeExportedSeed` (export-corpus.ts) loops over ALL LIVE docs and APPENDS every live-only
//     export-scope doc to the seed (`created`).
//
// So the export writes a strict SUPERSET of what this check names, and the gap is exactly the
// live-only population. MEASURED 2026-07-30 against the live store: `check:corpus-content` printed
// `OK — every seed body matches live across 177 export-scope artifacts` and exited 0, while
// `export-corpus --pg` (dry run) in the same shell reported `0 update(s) + 1 addition(s)` —
// `oq-diff-view-altitude`, an open-question the owner had RETIRED under ADR-0267 D5 and whose seed row
// `origin/main` had already dropped. A blind `--write` on a GREEN check would have written that
// retirement back out of existence — the fourth resurrection of that id (`events.library_event` seq
// 2694/2696/2702 deleted, 2695/2698/2742 created).
//
// THE OPERATIONAL RULE: a green `check:corpus-content` is NOT a promise that `export-corpus --write`
// is a no-op or that it will carry only your edit. Read the dry run (`export-corpus --pg`, no
// `--write`) before writing, and make the per-artifact direction call on any `added (live-only)` id
// you did not author — a live-only export-scope artifact can be a graduation that never reached the
// seed (export it) or an artifact deliberately retired live (do NOT export it; drop the live row).
// `process:library-edit-ceremony` owns that judgement.
//
// WHAT THIS CORRECTION DOES NOT DECIDE: whether a per-artifact export verb should exist. The old
// conclusion above was reasoning FROM the false premise, so it is withdrawn rather than inverted —
// the question is simply open, and settling it is not this header's to do.
//
// PURE by construction: no `node:` import, no filesystem, no clock, no `pg`. The live read lives in
// the shell `check-corpus-content.ts`, which also sets the exit code.

/** The tunable ceiling constants — one per axis, never summed. */
export interface CorpusContentDrainConfig {
  /** Export-scope artifacts whose live body is a valid CURRENT body differing from seed. Strictly above this reds. */
  valueDriftCeiling: number;
  /** Export-scope artifacts whose live body is BELOW THE SCHEMA FLOOR. Strictly above this reds. */
  degradedLiveCeiling: number;
}

/**
 * THE CEILINGS, both BASELINED on a real sweep rather than picked in advance — the run of 2026-07-29
 * against the live store, AFTER the drain, found `value-drift=0, degraded-live=0` over 174
 * export-scope seed artifacts, all 174 present live. Setting each axis to exactly what a real run
 * found ships the ceiling GREEN on an honest baseline (a breach is strictly `>`), so it can only ever
 * be TIGHTENED. This one has been: `valueDriftCeiling` was 14 from 2026-07-28 to 2026-07-29 and is now
 * ZERO, which is the resting place the previous baseline named and could not yet reach.
 *
 * `valueDriftCeiling: 0` — ZERO HEADROOM, reached by draining and never by a raise (ADR-0252 D3). The
 * previous 14 was not a tolerance for drift; it was the size of a backlog whose only sanctioned remedy
 * was a batch export that would also have written 222 transient artifacts into the seed. ADR-0263
 * removed that coupling (see the header), the backlog was drained to zero, and the ceiling follows the
 * measurement down. What zero buys is what 14 bought, one artifact earlier: the FIRST unreconciled
 * artifact fails the gate. The differential control above shows why that matters — this list has been
 * at 18, and at 122, with nothing failing.
 *
 * **The remedy for a breach is one command**, and that is what makes zero affordable rather than
 * punitive: `storytree library export-corpus --pg --write`. At a drained backlog the UPDATE half of
 * that batch is just the artifact this session edited. If the update half ever costs more than that,
 * the cause is a SIBLING's undrained edit, not this ceiling — drain it, or route it back to that
 * session.
 *
 * **But "one command" is not "only your artifact" — READ THE DRY RUN FIRST.** The export also
 * ADDS every live-only export-scope artifact (`computeExportedSeed`'s append pass), and this check
 * cannot see one: `diffCorpusContent` iterates the SEED scope and skips any id live carries but seed
 * does not, so a live-only artifact is neither value-drift nor degraded-live. The export therefore
 * writes a strict SUPERSET of what a breach here names, and a GREEN verdict is no evidence that
 * `--write` is a no-op (measured 2026-07-30: clean over 177, one pending live-only addition — see the
 * header). Run `export-corpus --pg` without `--write`, and make the per-artifact direction call on
 * any `added (live-only)` id you did not author.
 *
 * **A raise is never the discharge.** The one legitimate upward move is a genuinely enlarged measured
 * POPULATION — the export SCOPE widening to admit kinds it excludes today (ADR-0263's table:
 * `agent`, `template`, `plan`, `friction`, `arc`, `uat-criterion`) — re-baselined on that new
 * population's first real sweep with the reason recorded here. Note that narrowing the scope was
 * measured NOT to move this axis at all (13 before, 13 after), so scope changes are not a lever on
 * this number in either direction. Raising it to accommodate work being landed is the named gaming
 * failure mode on `process:verification-decay-detection`.
 *
 * `degradedLiveCeiling: 0` is the real, honest baseline and not an aspiration: every one of the nine
 * sampled seed revisions in the header's control read `degraded-live=0`, so this axis has been at zero
 * across the check's entire life. It is also the axis that most deserves zero. A degraded live body is
 * not an editorial difference — it is an artifact stored below the schema floor, which the exporter
 * REFUSES to propagate, so it cannot drain in the same direction as its sibling and will sit there
 * indefinitely. Its remedy is per-artifact and already sanctioned
 * (`artifact edit <id> --file <seed> --pg`), and it has happened before — a version-floor regression is
 * exactly this shape. The next one reds the gate on its first appearance. The two axes now hold the
 * same number for DIFFERENT reasons, and they are still evaluated independently and never summed:
 * V is zero because its backlog was drained, D because it never had one.
 *
 * WITH BOTH CEILINGS AT ZERO THERE IS NO BAND LEFT BENEATH THEM, so the `warn` level now reports only
 * the substrate shortfall (`unverified`) — a sweep that compared fewer live rows than the seed scope.
 * That is the intended end state, not a softening: `check:corpus-content`'s formatter is untouched, it
 * still prints every drifted id exactly as before, and what changed is that the same finding now
 * carries a non-zero exit instead of a WARN. Nothing prints more quietly than it did. Softening the
 * check beneath its ceiling is the named gaming failure mode on
 * `process:verification-decay-detection`.
 */
export const DEFAULT_CORPUS_CONTENT_DRAIN_CONFIG: CorpusContentDrainConfig = {
  valueDriftCeiling: 0,
  degradedLiveCeiling: 0,
};

/**
 * The minimal projection of the diff the ceiling needs — deliberately decoupled from
 * `CorpusContentDiff` so this core (and its test) stay free of the store's types. The caller renders
 * each drift to the id a breach names it by.
 */
export interface CorpusContentDrifts {
  /** (a) ids whose live body is a valid current body differing from seed. */
  valueDrift: readonly string[];
  /** (b) ids whose live body is below the schema floor — the seed is canonical. */
  degradedLive: readonly string[];
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
}

/** The computed verdict — `level: "red"` drives a non-zero exit, so landing needs a drain. */
export interface CorpusContentDrainVerdict {
  /** `ok` (clean over a fully compared population) · `warn` (drift within ceilings, or an unverified population) · `red` (a breach). */
  level: "ok" | "warn" | "red";
  valueDriftCount: number;
  degradedLiveCount: number;
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
 * Evaluate the corpus-content drain ceiling over one sweep's classified drift lists. Pure — inject the
 * compared population.
 *
 * The two axes are evaluated INDEPENDENTLY and never summed: `valueDrift > V`, or `degradedLive > D`,
 * ⇒ `red`. A breach is enforced regardless of the compared population, because a deficient live store
 * can only DELETE comparison candidates: the reported counts are a lower bound, so a breach on a
 * partial sweep is still a real breach. The population instead guards the OTHER end — it withholds the
 * `ok` verdict from a sweep that compared less than the whole seed scope.
 */
export function evaluateCorpusContentDrain(
  drifts: CorpusContentDrifts,
  ctx: CorpusContentDrainContext,
  config: CorpusContentDrainConfig = DEFAULT_CORPUS_CONTENT_DRAIN_CONFIG,
): CorpusContentDrainVerdict {
  const valueDriftCount = drifts.valueDrift.length;
  const degradedLiveCount = drifts.degradedLive.length;

  const breaches: string[] = [];

  // Axis A — the editorial backlog. Fail-closed strictly above V.
  if (valueDriftCount > config.valueDriftCeiling) {
    breaches.push(
      `${valueDriftCount} artifact(s) carry a live body differing from seed, past the ceiling ` +
        `(V=${config.valueDriftCeiling}): ${drifts.valueDrift.join(", ")}`,
    );
  }

  // Axis B — the schema-floor faults. INDEPENDENT of axis A, never summed with it: a below-floor live
  // body is not discharged by the editorial backlog being short, or the reverse.
  if (degradedLiveCount > config.degradedLiveCeiling) {
    breaches.push(
      `${degradedLiveCount} artifact(s) carry a live body BELOW THE SCHEMA FLOOR, past the ceiling ` +
        `(D=${config.degradedLiveCeiling}): ${drifts.degradedLive.join(", ")}`,
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

  const level: CorpusContentDrainVerdict["level"] =
    breaches.length > 0
      ? "red"
      : valueDriftCount > 0 || degradedLiveCount > 0 || unverified !== undefined
        ? "warn"
        : "ok";

  return {
    level,
    valueDriftCount,
    degradedLiveCount,
    breaches,
    ...(unverified === undefined ? {} : { unverified }),
    config,
  };
}
