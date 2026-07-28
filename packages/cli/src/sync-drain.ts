// The seed↔live sync drain ceilings — the PURE, IO-free core of `check:agents-sync` AND
// `check:corpus-sync`.
//
// These are the LAST TWO worklists the `warn-list-hygiene` instrument located
// (`verification-integrity-arc`, ADR-0252 D3; the first four were `check:graduation-worklist`,
// `check:surface-coverage`, `check:corpus-content` and `check:coverage` — see `graduation-drain.ts`,
// `surface-coverage-drain.ts`, `corpus-content-drain.ts`, `coverage-drain.ts`). They are bounded in ONE
// module, and that is not a shared ceiling: each keeps its own config, its own evaluator and its own
// guard, and they are never summed. They live together because ONE differential control covers both —
// they read the SAME two substrates (the committed seed, the live store) through the same
// `STORYTREE_REPO_ROOT` seam (ADR-0246) — and because the finding that separates them is only visible
// side by side.
//
// WHY THEY NEEDED A CEILING AT ALL, given the instrument's own stated false positive. That false
// positive says a worklist which is a DRIFT between two surfaces "drains to zero with one idempotent
// command and may need no ceiling at all (`check:agents-sync` / `check:corpus-sync` read 0 today)". Both
// halves of that are true and neither settles it: what a list reads TODAY is not what it CAN reach, and
// a cheap drain is not a drain that runs. Nothing schedules either `sync-*` command. Both checks are
// WARN-only and local-only (they SKIP offline, and CI is deliberately DB-free), and — the part that
// decides it — the seed→live gap is OPENED by a different ceremony than the one that closes it: the
// ADR-0095 graduation flow writes into the seed, while the drain is a separate manual invocation nobody
// is obliged to make. So the question is not whether the drain is cheap. It is whether anything makes
// it happen. Measured, nothing does.
//
// THE MEASURED DEFECT, as inputs → wrong outcome — not an argument, a differential control run over the
// REAL `check:agents-sync` and `check:corpus-sync` binaries with only their SEED input varied
// (`STORYTREE_REPO_ROOT` repointed at a scratch root holding one revision's `knowledge.json`,
// ADR-0246), the live store held fixed at what the DB carried on 2026-07-28:
//
//   seed @ 4861d70c (2026-06-14, `check:agents-sync`'s own landing day)  agents-drift=3  corpus-missing=2  exit 0/0
//   seed @ a007f11c (2026-06-25, `check:corpus-sync`'s own landing day)  agents-drift=2  corpus-missing=2  exit 0/0
//   seed @ 83e4da36 (2026-06-27)                                         agents-drift=2  corpus-missing=5  exit 0/0
//   seed @ 23b8bf54 (2026-07-05)                                         agents-drift=1  corpus-missing=6  exit 0/0
//   seed @ 4e41f743 (2026-07-11)                                         agents-drift=0  corpus-missing=5  exit 0/0
//   seed @ 5bceb525 (2026-07-14)                                         agents-drift=0  corpus-missing=5  exit 0/0
//   seed @ 8db18977 (2026-07-18)                                         agents-drift=0  corpus-missing=0  exit 0/0
//   seed @ cd617923 (2026-07-21)                                         agents-drift=0  corpus-missing=0  exit 0/0
//   seed @ bbf92262 (2026-07-26)                                         agents-drift=0  corpus-missing=0  exit 0/0
//   seed @ 138b8382 (2026-07-28, HEAD)                                   agents-drift=0  corpus-missing=0  exit 0/0
//
// Neither list is hypothetical: `check:corpus-sync` printed a SIX-item worklist and exited 0, and
// `check:agents-sync` printed a three-item one and exited 0. The exit code was 0 at every single point
// on both. That is the class `warn-list-hygiene` locates — no size either list reaches fails anything —
// and it is why the false positive does NOT apply to these two. (What the control varies is the SEED,
// which is what git can replay; the live side is one snapshot, so the table measures each check's OUTPUT
// against varied committed input, not a reconstruction of each day's historical drift. The exit code is
// the invariant either way. For `check:corpus-sync` the rows carry one extra reading, because today's
// live store is the ACCUMULATED end state: the five ids standing at 2026-07-11/14 —
// `oq-fix-drive-build-shape`, `rename-tests-to-uat-test-criteria`, `rename-tree-to-forest`,
// `retire-generated-assets-json`, `solar-system-world` — are still absent from live today, so they never
// drained through the command the WARN names. They left the SEED instead.)
//
// ONE AXIS EACH, and the second was NOT earned — stated plainly, because the two siblings that landed
// before this one each carry two. `check:corpus-sync` has one list by construction: `diffCorpus` is
// deliberately ASYMMETRIC and reports only the migration gap (seed ids absent from live), because under
// live-canonical a live-only artifact is an expected creation rather than drift. `check:agents-sync` has
// two lists — `missing` (a sync would CREATE) and `extra` (a sync would DELETE) — and they are summed,
// for two reasons that both had to hold. First, no evidence: across all ten sampled seeds `missing` was
// ZERO at every point, so nothing measured shows the two moving independently (only the injected rename
// below produced one). Second, and decisive: AT A ZERO CEILING A SPLIT IS UNOBSERVABLE. Any non-zero on
// either list breaches a summed ceiling of 0 exactly when it would breach its own, so a split would buy
// nothing a reader could ever see. Both also discharge with the identical single command, unlike
// `check:corpus-content`'s two axes whose remedies point in opposite directions. If either ceiling is
// ever legitimately raised off zero, the split becomes observable and must be re-measured then.
//
// THE SUBSTRATE GUARDS DIFFER BETWEEN TWO NEAR-IDENTICAL SIBLING CHECKS, and that is the finding rather
// than a detail — the friction `worked-example-substrate-guard-transfers-shape-not-direction` says a
// worked example transfers SHAPE and not DIRECTION; here two checks reading THE SAME PAIR of substrates
// still needed different guards. Measured, seed side end-to-end over the real binaries and live side over
// the real comparators (`diffAgents` / `diffCorpus`, which the shells' `diffSeed*` wrappers call — the
// shells hardcode a bare `createPool()` and take no store argument, so the live input has no injection
// seam at the binary; that gap is the open friction
// `a-live-store-shaped-gate-input-has-no-safe-injection-seam-for-a-red-proof`, routed `tool`):
//
//   substrate deficiency          check:agents-sync             check:corpus-sync
//   ---------------------------   ---------------------------   -------------------------------------
//   seed `[]` (parses, no units)  extra=12  INFLATES             missing=0, prints `OK — … (13)`  DEFLATES
//   seed truncated (10 of 173)    extra=12  INFLATES             missing=0, prints `OK — … (23)`  DEFLATES
//   seed FILE absent              SKIP, exit 0                  SKIP, exit 0
//   live EMPTY                    missing=12  INFLATES           missing=173  INFLATES
//   live TRUNCATED (1 in 10)      missing=12  INFLATES           missing=154  INFLATES
//   live missing the AGENT tier   missing=12  INFLATES           missing=0    unaffected
//
// `check:agents-sync` CANNOT DEFLATE from either side: its comparator is symmetric, so a deficient seed
// lands in `extra` and a deficient live store lands in `missing`, and every measured deficiency inflates.
// `check:corpus-sync` deflates from the seed and inflates from the live store — BOTH directions at once,
// like `check:coverage`, but from the opposite pair of substrates. The cause is not the substrate at all:
// it is the DIRECTIONALITY of each check's comparator, which is a design choice recorded in
// `sync-corpus.ts`. A direction copied from either sibling would have been wrong here.
//
// The seed-deflation number is worth reading twice. An EMPTY seed does not make `check:corpus-sync`
// print a zero — it makes it print `OK — the live store holds every seed non-agent artifact (13)`,
// because `libraryTemplates()` contributes 13 code-derived `template` artifacts no seed file can
// remove. A false clean that states a plausible non-zero population is the exact shape a reader cannot
// catch, so the `ok` verdict is WITHHELD whenever the seed FILE contributed no units at all — the
// `corpus-content` / `coverage` withhold, reached from the same direction.
//
// SO THE GUARDS ARE BUILT PER CHECK, FROM THE MEASURED DIRECTION — and one of them follows the REMEDY's
// direction rather than the count's, which is the part neither sibling anticipates:
//
//   - `check:agents-sync` SUPPRESSES its breach (reported, never dropped — ADR-0095: no silent caps)
//     when the seed contributed ZERO agents, an all-or-nothing predicate matching what the control
//     established. The reason is NOT that the count is untrustworthy; it is that the drain the WARN
//     names would be DESTRUCTIVE there. `sync-agents --pg` is seed-canonical and DELETES every live
//     agent absent from the seed, so redding on a seed that holds none would hand the next session a
//     failing gate whose sanctioned remedy wipes the live agent tier. No other measured state has that
//     property, so nothing else is suppressed.
//   - `check:corpus-sync` SUPPRESSES NOTHING, and that is measured rather than lazy. Its drain is
//     migrate-only: `sync-corpus --pg` upserts absent artifacts and never overwrites or deletes, so an
//     inflated count can only ever be REPAIRED by the command the WARN already names — including the
//     `live EMPTY` row, where 173 missing artifacts is a real broken reconciliation and one idempotent
//     command fixes it. Its guard runs at the other end instead: the `ok` verdict is withheld from a
//     sweep whose seed file was empty.
//   - Both keep, unchanged, the fail-open that predates these ceilings: an unreachable store, absent
//     creds, or an unreadable seed file SKIPs and exits 0.
//
// IT GATES ACCUMULATION ONLY. Neither number decides which surface is canonical — that stays ADR-0055's
// answer for agents (the seed) and ADR-0023's for the rest (the live store), exactly as before. A breach
// is discharged by a drain already in the operating discipline and named in the WARN itself:
// `storytree library sync-agents --pg` or `storytree library sync-corpus --pg` (ADR-0252 D3: a
// ceiling's remedy is a drain, never a raise).
//
// ONE LIMITATION, STATED RATHER THAN DISCOVERED LATER. The seed withhold is all-or-nothing, so a
// PARTIALLY truncated seed still certifies clean: the 10-of-173 row above prints `OK — … (23)` and this
// core has no way to know the seed should have held 173. Nothing finer is available — the expected size
// of a committed file is not a fact a static core can measure, and a threshold would be a number nobody
// could defend (the `coverage-drain.ts` precedent for the same predicate). The honest posture is that
// the guard catches the total failure and states that it does not catch the partial one.
//
// PURE by construction: no `node:` import, no filesystem, no clock, no `pg`. The seed load and the live
// read live in the shells `check-agents-sync.ts` / `check-corpus-sync.ts`, which also set the exit code.

// ---------------------------------------------------------------------------
// Shared verdict shape
// ---------------------------------------------------------------------------

/** The computed verdict — `level: "red"` drives a non-zero exit, so landing needs a drain. */
export interface SyncDrainVerdict {
  /** `ok` (clean over a real population) · `warn` (drift within the ceiling, or an unverified population) · `red` (a breach). */
  level: "ok" | "warn" | "red";
  /** The worklist size this ceiling is held against. */
  count: number;
  /** The ceiling `count` was compared to — echoed so the printed line and the constant cannot drift. */
  ceiling: number;
  /** The breach, if any. Non-empty iff the count is past the ceiling — even when suppressed. */
  breaches: string[];
  /**
   * Why a breach was computed but NOT enforced. Set only when it applies — so a suppressed breach is
   * reported, never dropped (ADR-0095: no silent caps).
   */
  suppressed?: string;
  /**
   * Why a clean result was NOT certified as `ok` — the sweep compared against a deficient substrate.
   * Set only when it applies, so a hollow population is reported rather than read as reconciled.
   */
  unverified?: string;
}

/** Fold the three parts into a level. A suppressed breach never reds; it degrades to a warn. */
function levelOf(breaches: readonly string[], suppressed: string | undefined, count: number, unverified: string | undefined): SyncDrainVerdict["level"] {
  if (breaches.length > 0 && suppressed === undefined) return "red";
  if (count > 0 || suppressed !== undefined || unverified !== undefined) return "warn";
  return "ok";
}

// ---------------------------------------------------------------------------
// check:agents-sync
// ---------------------------------------------------------------------------

/** The tunable ceiling for the agent-tier drift worklist. */
export interface AgentsSyncDrainConfig {
  /** Agent ids differing between the seed and the live tier (`missing` + `extra`). Strictly above this reds. */
  driftCeiling: number;
}

/**
 * THE CEILING, BASELINED on a real sweep rather than picked in advance — the run of 2026-07-28 against
 * the live store found the tiers in sync across 12 seed agents, so the drift worklist is EMPTY. Setting
 * the ceiling to exactly what a real run found ships it GREEN on an honest baseline (a breach is
 * strictly `>`).
 *
 * `driftCeiling: 0` is ZERO, and unlike its four predecessors that needed no leniency argument — it is
 * the honest baseline, not an aspiration. The reason zero is affordable here is the drain: ONE
 * idempotent command (`pnpm storytree library sync-agents --pg`) with NO per-item judgement, because
 * ADR-0055 makes the seed canonical for this tier by construction. That is what separates it from
 * `corpus-content-drain.ts`'s `valueDriftCeiling: 14`, whose drain is an all-or-nothing librarian call
 * across every drifted artifact and where zero headroom would price the next session toward weakening
 * the check. Nothing here is a judgement call, so nothing here needs headroom.
 *
 * The ceiling also cannot fire where its drain is unavailable: the check SKIPs (exit 0) with no creds
 * or an unreachable store, which is every environment that could not run the sync anyway.
 *
 * The differential control in the header shows what zero buys: this list stood at 3, then 2, then 1,
 * with nothing ever failing. The NEXT drifted agent id fails the gate. RAISING this is the named gaming
 * failure mode on `process:verification-decay-detection`; the one legitimate upward move is a genuinely
 * enlarged measured POPULATION, re-baselined on that population's first real sweep with the reason
 * recorded here.
 *
 * NO WARN BAND WAS OPENED BENEATH IT — and at a ceiling of zero there is no band to open. The existing
 * WARN prose is untouched: it still names the fix and still lists every drifted id, so nothing that
 * printed before prints more quietly now. The RED block is layered ABOVE it and states outright that the
 * gate now fails, so the advisory line and the exit code cannot be read as contradicting each other.
 */
export const DEFAULT_AGENTS_SYNC_DRAIN_CONFIG: AgentsSyncDrainConfig = {
  driftCeiling: 0,
};

/** The minimal projection of `AgentDiff` the ceiling needs — decoupled from the store's types. */
export interface AgentsSyncDrift {
  /** Seed agent ids absent from live — a sync would CREATE these. */
  missing: readonly string[];
  /** Live agent ids absent from the seed — a sync would DELETE these. */
  extra: readonly string[];
  /**
   * Agent ids the SEED contributed. Zero is the state an empty/unit-less `knowledge.json` reaches
   * (measured: `extra` becomes every live agent), and it is the one state where the named drain would
   * DELETE the live tier rather than repair it.
   */
  seedAgents: number;
}

/**
 * Evaluate the agent-tier drift ceiling. Pure — inject the diff.
 *
 * ONE axis: `missing + extra > C` ⇒ `red`. The two lists are summed deliberately (see the header): at
 * `C = 0` a split is unobservable, and both discharge with the same single command.
 *
 * The single guard is keyed on the REMEDY, not on the count: with a seed holding no agents at all, the
 * breach is computed and reported but not enforced, because `sync-agents --pg` would delete every live
 * agent rather than repair a drift.
 */
export function evaluateAgentsSyncDrain(
  drift: AgentsSyncDrift,
  config: AgentsSyncDrainConfig = DEFAULT_AGENTS_SYNC_DRAIN_CONFIG,
): SyncDrainVerdict {
  const count = drift.missing.length + drift.extra.length;

  const breaches: string[] =
    count > config.driftCeiling
      ? [
          `${count} agent id(s) differ between the seed and the live tier ` +
            `(${drift.missing.length} missing live, ${drift.extra.length} extra live), past the ceiling ` +
            `(C=${config.driftCeiling}) — listed above`,
        ]
      : [];

  // Computed AFTER the breach so it is reported, never dropped.
  const suppressed =
    breaches.length > 0 && drift.seedAgents === 0
      ? "the seed contributed NO agents at all, so this measures the seed rather than the drift — and " +
        "`sync-agents --pg` is seed-canonical, so running the drain here would DELETE the live agent tier"
      : undefined;

  return {
    level: levelOf(breaches, suppressed, count, undefined),
    count,
    ceiling: config.driftCeiling,
    breaches,
    ...(suppressed === undefined ? {} : { suppressed }),
  };
}

// ---------------------------------------------------------------------------
// check:corpus-sync
// ---------------------------------------------------------------------------

/** The tunable ceiling for the seed→live migration-gap worklist. */
export interface CorpusSyncDrainConfig {
  /** Seed non-agent artifacts absent from the live store. Strictly above this reds. */
  missingCeiling: number;
}

/**
 * THE CEILING, BASELINED on a real sweep rather than picked in advance — the run of 2026-07-28 against
 * the live store found every one of the 173 export-scope seed artifacts present live, so the migration
 * gap is EMPTY. Setting the ceiling to exactly what a real run found ships it GREEN on an honest
 * baseline (a breach is strictly `>`).
 *
 * `missingCeiling: 0` is ZERO for the same reason its sibling above is: the drain is ONE idempotent
 * command (`pnpm storytree library sync-corpus --pg`) with NO per-item judgement. It is MIGRATE-ONLY by
 * construction (ADR-0103) — it upserts artifacts absent from live and never overwrites a live edit or
 * deletes a live-only artifact — so unlike `check:corpus-content`'s all-or-nothing export there is
 * nothing here a session must weigh before running it, and therefore nothing to be lenient about. The
 * check already SKIPs wherever that command could not run.
 *
 * The differential control in the header shows what zero buys, and it is the strongest evidence in this
 * module: this list reached SIX while exiting 0, and five of the ids standing on 2026-07-11 are STILL
 * absent from the live store today — they were dropped from the seed rather than migrated, so the WARN
 * ran for weeks and the drain it named never happened. The NEXT seed-only artifact fails the gate.
 * RAISING this is the named gaming failure mode on `process:verification-decay-detection`; the one
 * legitimate upward move is a genuinely enlarged measured POPULATION — the seed scope widening to admit
 * kinds it excludes today (`agent`, the ephemeral kinds) — re-baselined with the reason recorded here.
 *
 * NO WARN BAND WAS OPENED BENEATH IT — at a ceiling of zero there is none to open. The existing WARN
 * prose is untouched: it still names the fix and still lists every missing id. The RED block is layered
 * ABOVE it and states outright that the gate now fails.
 */
export const DEFAULT_CORPUS_SYNC_DRAIN_CONFIG: CorpusSyncDrainConfig = {
  missingCeiling: 0,
};

/** The minimal projection of `CorpusDiff` the ceiling needs — decoupled from the store's types. */
export interface CorpusSyncGap {
  /** Seed non-agent artifact ids absent from the live store — a sync would CREATE these. */
  missing: readonly string[];
  /** Export-scope seed artifacts in the sweep — the denominator the check prints. */
  seedScope: number;
}

/** What the sweep actually managed to READ — the substrate guard's only input. */
export interface CorpusSyncDrainContext {
  /**
   * Units read out of the seed FILE (`knowledge.json`). Zero is the state an empty seed reaches, and it
   * is NOT visible in {@link CorpusSyncGap.seedScope}: `libraryTemplates()` contributes 13 code-derived
   * `template` artifacts no seed file can remove, so an empty seed still certifies `OK — … (13)`.
   */
  seedUnitsRead: number;
}

/**
 * Evaluate the seed→live migration-gap ceiling. Pure — inject the gap and what the seed read.
 *
 * ONE axis, by construction: `diffCorpus` reports only the migration gap. `missing > M` ⇒ `red`,
 * enforced unconditionally — a deficient live store can only INFLATE this list (measured), and every
 * inflated state is repaired by the migrate-only command the WARN names, so there is nothing here a
 * suppression would protect.
 *
 * The guard runs at the other end: the `ok` verdict is WITHHELD when the seed file contributed no units,
 * because that is the exact state measured to print a clean line over a population the seed did not
 * supply.
 */
export function evaluateCorpusSyncDrain(
  gap: CorpusSyncGap,
  ctx: CorpusSyncDrainContext,
  config: CorpusSyncDrainConfig = DEFAULT_CORPUS_SYNC_DRAIN_CONFIG,
): SyncDrainVerdict {
  const count = gap.missing.length;

  const breaches: string[] =
    count > config.missingCeiling
      ? [
          `${count} seed non-agent artifact(s) of ${gap.seedScope} are absent from the live store, past ` +
            `the ceiling (M=${config.missingCeiling}) — listed above`,
        ]
      : [];

  const unverified =
    ctx.seedUnitsRead === 0
      ? "the seed file contributed NO units, so the artifacts compared came from `libraryTemplates()` " +
        "rather than from the seed — an empty or unreadable `knowledge.json` reports as reconciled"
      : undefined;

  return {
    level: levelOf(breaches, undefined, count, unverified),
    count,
    ceiling: config.missingCeiling,
    breaches,
    ...(unverified === undefined ? {} : { unverified }),
  };
}
