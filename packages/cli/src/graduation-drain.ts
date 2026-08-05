// ⚠ UNWIRED — part of retired `check:graduation-worklist`, which ADR-0311 D2 removed from the
// gate on 2026-08-05. This module is the worklist core; its entrypoint
// `check-graduation-worklist.ts` is invoked by nothing, and it is reached only from there and
// from its own tests — so those tests stay GREEN while it enforces NOTHING. Kept deliberately
// (ADR-0311 D5), not forgotten; re-wiring needs fresh production-catch evidence AND an ADR, never
// just the wiring.
// Tombstone: `RETIRED_CHECKS` in `gate-order.ts`, pinned by `gate-order.test.ts`.
//
// What follows is retained as written — read it as what this DID, not as current gate policy.
//
// The graduation-drain ceiling — the PURE, IO-free core of `check:graduation-worklist`.
//
// ADR-0168 D4 built a fail-closed drain ceiling for the FRICTION worklist, and the evidence it built
// that decision on was THIS queue: `friction-drain.ts` records, in its own header, that
// `check:graduation-worklist` "grew 31→58 in one session and drained nothing". The ceiling went to the
// sibling; the queue whose rot motivated it kept its WARN-only shape, in which every live count from 1
// to 500 prints the same advisory line and exits 0. This closes that gap in the shape ADR-0168 D4
// established — the first worklist bounded under the `warn-list-hygiene` instrument
// (`verification-integrity-arc`, ADR-0252 D3).
//
// TWO INDEPENDENT AXES, each redding on its own and NEVER summed (the friction shape):
//
//   - COUNT — live candidates (`new` + `changed` + `expired`) past N.
//   - STALENESS — the oldest lease-expired candidate more than M days past its expiry.
//
// Neither subsumes the other. A count-only ceiling cannot see a small-but-stale queue: three
// candidates whose leases expired a year ago sit under N forever. A staleness-only ceiling cannot see
// a flood of fresh ones, because a `new` candidate has no park record and therefore no date at all.
//
// FAIL-CLOSED ON THE QUEUE, FAIL-OPEN ON THE SUBSTRATE — ADR-0168 D4's posture, and here it is
// load-bearing rather than decorative. The park ledger is the ONLY thing that distinguishes a reviewed
// candidate from an un-reviewed one, so an ABSENT or UNREADABLE ledger reclassifies every memory as
// `new`. Measured on the authoring machine: a 4-live queue becomes 104. That is a substrate failure
// wearing a queue breach's clothes, so no ceiling fires without a usable ledger — the breach is
// computed either way and reported as SUPPRESSED, never silently dropped (ADR-0095: no silent caps).
//
// It gates QUEUE HYGIENE ONLY. No count or age here ever decides what GRADUATES — worth stays
// undiluted librarian judgment (ADR-0032 §3/§5, ADR-0095 D7, reaffirmed by ADR-0168 D8). The drain is
// real, available, and already in the operating discipline: the pre-merge librarian pass graduates the
// genuinely durable and PARKS the keepers with a reason (ADR-0202), which is exactly what moves a
// candidate out of `live`. 100 of this machine's 104 candidates are parked, so the remedy is a DRAIN
// that demonstrably works, not an exhortation (ADR-0252 D3: a ceiling's remedy is a drain, never a
// raise — corrected 2026-07-28, this cited ADR-0256, which decides something else entirely: that
// deferral-keyed ESCALATION lines are not built. A reader following the old pointer landed on the
// wrong decision).
//
// LIMITATION 1 IS CLOSED; LIMITATION 2 IS NOT, AND THAT IS THE HONEST HEADLINE (ADR-0301). Both were
// stated here when this ceiling landed; one has since been repaired and the other has NOT, so read the
// pair rather than either half. The repair for the survivor is to close the gap, NEVER to raise N
// (raising a ceiling to accommodate the work in front of you is the named failure mode on
// `process:verification-decay-detection`).
//
//   1. OWN-HOMEWORK EXCLUSION — **CLOSED** (ADR-0301). ADR-0168 D4's friction ceiling excludes the
//      current session's own just-filed items, so "a retro that files its cap-3 can never trip its own
//      ceiling"; this could not, because a `MemoryFile` carried no provenance to key the exclusion on.
//      It does now: memory frontmatter carries `metadata.branch`, and {@link evaluateGraduationDrain}
//      charges only the candidates this session did not write. UNATTRIBUTED STAYS CHARGED — the
//      `friction-drain.ts` `isOwnItem` direction exactly: only a positive match on the current branch
//      excludes, so a memory with no stamp still registers as pressure and the queue cannot drain by
//      going anonymous. The stamp exists only going FORWARD (ADR-0290 D2's posture): agents write these
//      files with a file tool, no CLI verb stamps them, so on the day this landed every memory on the
//      machine was unattributed and the charged count was unchanged.
//   2. THE INPUT IS MACHINE-SHARED, NOT SESSION-LOCAL — **STILL OPEN, AND IT IS THE LOAD-BEARING ONE.**
//      The agent-memory dir is per-MACHINE (`~/.claude/projects/<slug>/memory`, ADR-0202) and resolves
//      through the MAIN checkout, so every concurrent worktree and session on the box reads and writes
//      ONE queue. Observed while this ceiling was being landed: the queue moved 4 → 5 live (parked
//      100 → 99) mid-session, without this session touching a memory file — a sibling's edit broke a
//      parked candidate's content hash and re-entered it as `changed`. Measured far more sharply in
//      PR #1124: a commissioned board-drain session drained the queue properly, VERIFIED `OK — no live
//      agent-memory candidates`, and was RED again at 7 live within ~15 minutes, entirely from sibling
//      sessions writing between 20:56 and 21:11. The drain worked, was verified, and evaporated —
//      through no fault of the drainer and with nothing it could have done differently.
//
// **CLOSING (1) DOES NOT FIX (2), AND MUST NOT BE READ AS FIXING IT.** On the #1124 numbers the
// exclusion would have changed NOTHING: all 7 candidates belonged to SIBLING sessions, which an
// own-homework exclusion does not suppress BY CONSTRUCTION. ADR-0301 shipped (1) deliberately as an
// acknowledged partial — it closes a real asymmetry with the sibling friction ceiling, and it is a
// prerequisite for every candidate fix to (2), because you cannot ask "is that session still in
// flight" without first knowing whose it is. What it buys on its own is the OTHER half of the same
// tax: the check now PRINTS the authorship split on every path, so the #1124 drainer's question — are
// these mine? — is answered in the report instead of by hand. The residual is parked on
// `verification-integrity-arc` as its own unit, not left as a comment.
//
// PURE by construction: no `node:` import, no filesystem, no clock. The caller injects `now` and the
// ledger's usability, so this is deterministic and unit-testable against a synthetic worklist; the
// disk reads and `new Date()` live in the thin `check-graduation-worklist.ts` shell.

/** The four-way park classification (ADR-0202), mirrored here so this core carries no library import. */
export type GraduationCandidateStatus = "new" | "changed" | "expired" | "parked";

/**
 * The minimal projection of a graduation candidate the ceiling needs — deliberately decoupled from
 * `MemoryFile` / `ParkWorklistEntry` so this core (and its test) carry no library dependency. The
 * shell projects the classified worklist down to this shape.
 */
export interface GraduationCandidate {
  /** The memory's `name` — the park ledger's key, and how a breach names the item to drain. */
  name: string;
  status: GraduationCandidateStatus;
  /**
   * ISO `yyyy-mm-dd` on which this candidate's park lease expired. Only an `expired` candidate has
   * one: `new` has no park record at all, and `changed`/`parked` are not overdue for re-review.
   */
  leaseExpiredOn?: string | undefined;
  /**
   * The branch of the session that WROTE this memory (frontmatter `metadata.branch`, ADR-0301), or
   * `undefined` when the memory carries no stamp. `undefined` means UNATTRIBUTED, never "not yours" —
   * see {@link evaluateGraduationDrain} for why that is CHARGED.
   */
  branch?: string | undefined;
}

/** The tunable ceiling constants. */
export interface GraduationDrainConfig {
  /** N — the live-candidate ceiling. Strictly above this reds the gate. */
  liveCeiling: number;
  /** M — how many days past lease expiry a candidate may sit. Strictly above this reds the gate. */
  overdueCeilingDays: number;
}

/**
 * THE CEILING, and the two numbers are arrived at differently — stated plainly rather than presented
 * as one calibrated pair.
 *
 * N=4 is BASELINED, not chosen: the first real sweep of this check found exactly 4 live candidates
 * (2 new, 2 changed, 0 lease-expired) against 100 parked. Setting N to what that run found ships the
 * ceiling GREEN on an honest baseline — a breach is strictly `> N` — so it can only ever be tightened
 * as the queue drains, WITHIN A FIXED MEASUREMENT APERTURE (ADR-0269, which amends ADR-0252 D3), and
 * it was never picked in advance to accommodate a backlog. Widening what the candidate engine SCANS
 * (a memory tier it did not read, a candidate shape it could not parse) is the one legitimate upward
 * move, under ADR-0269's evidence bar; absorbing un-reviewed candidates is not.
 *
 * M=21d is INHERITED from ADR-0168 D4's friction age ceiling, and it is the one constant here not
 * derived from this sweep — there are 0 lease-expired candidates today, so this axis had nothing to
 * baseline on. The inheritance is principled rather than arbitrary: both queues are drained by the
 * SAME pre-merge librarian pass, so an item overdue longer than the sibling queue's own staleness
 * ceiling is stale by a standard this repo already applies at the same cadence.
 *
 * NO WARN BAND IS ADDED. `check:graduation-worklist` already WARNs at one live candidate, and opening
 * a band beneath N would make counts of 1–3 print OK — quieter than today. This layers RED on top of
 * the existing OK/WARN levels and changes neither, so the check is strictly stronger than before and
 * never weaker (the named failure mode on `process:verification-decay-detection` is gaming a ceiling
 * by softening the check under it).
 *
 * **N STAYS 4 UNDER ADR-0301, AND THE DISTINCTION IS THE WHOLE POINT.** Adding the own-homework
 * exclusion changes WHAT COUNTS AS THIS SESSION'S LIVE BACKLOG; it does not change how large a backlog
 * is allowed. ADR-0252 D3 says a ceiling's remedy is a drain and never a raise, and ADR-0269 fences
 * when a ceiling may rise at all — neither is touched here, and this note exists because the change is
 * easy to MISREAD as gaming the ceiling. The tell that separates the two: WHAT is counted changed, not
 * merely HOW MANY are tolerated. The number on this line is the same number it was, and the OK/WARN
 * levels still read the FULL live count, so a session's own memories are visible in the report the
 * moment they exist — they simply do not block that session's own landing.
 */
export const DEFAULT_GRADUATION_DRAIN_CONFIG: GraduationDrainConfig = {
  liveCeiling: 4,
  overdueCeilingDays: 21,
};

/** The context the ceiling is evaluated from: WHO, WHEN, and whether the ledger can be trusted. */
export interface GraduationDrainContext {
  /**
   * The current session's branch (ADR-0301) — its own just-written memories are excluded from the
   * charge, the `friction-drain.ts` `isOwnItem` move. `null` when git cannot say (detached HEAD, no
   * repo): then NOTHING is excluded and the ceiling charges the whole live queue, which is the
   * pre-ADR-0301 behaviour and the fail-closed one.
   */
  currentBranch: string | null;
  /** Today, ISO `yyyy-mm-dd` — the reference point for lease-overdue age. */
  currentDate: string;
  /**
   * Whether the park ledger was both PRESENT and PARSEABLE. False suppresses every breach: an absent
   * or corrupt ledger classifies every memory `new`, so a breach computed over it measures the
   * substrate, not the queue.
   */
  ledgerUsable: boolean;
}

/** The computed verdict — `level` drives the gate: `red` ⇒ non-zero exit ⇒ landing needs a drain. */
export interface GraduationDrainVerdict {
  /** `ok` (nothing live) · `warn` (live, within ceiling) · `red` (a breach against a usable ledger). */
  level: "ok" | "warn" | "red";
  /** Every candidate classified — live and parked. */
  total: number;
  /** `new` + `changed` + `expired` — the count ADR-0202 D4 makes meaningful. */
  liveCount: number;
  newCount: number;
  changedCount: number;
  expiredCount: number;
  /**
   * Live candidates THIS session wrote (ADR-0301) — excluded from {@link chargedCount} so a session
   * whose retro writes memories cannot trip its own ceiling. Reported, never hidden: the WARN/OK line
   * still counts them, so nothing goes quiet.
   */
  ownCount: number;
  /**
   * Live candidates carrying ANOTHER session's stamp. Reported so the #1124 question — are these mine?
   * — is answered by the check rather than by a hand differential. CHARGED: the drain is a librarian
   * pass over the whole queue, which any session may legitimately perform, unlike an export that would
   * commit a stranger's body under your name.
   */
  siblingCount: number;
  /** Live candidates with no stamp at all. CHARGED — unattributed is not "not yours". */
  unattributedCount: number;
  /**
   * `liveCount` minus {@link ownCount} — what the ceiling actually compares against N (ADR-0301).
   * Equals `liveCount` whenever no memory carries a stamp, which is every queue predating ADR-0301.
   */
  chargedCount: number;
  /** Silenced under a holding lease. Reported so the suppression is visible, never silent. */
  parkedCount: number;
  /** Days past expiry of the most overdue lease-expired candidate (`null` when there are none). */
  oldestOverdueDays: number | null;
  oldestOverdueName: string | null;
  /** Ceiling breaches. Non-empty iff `level === "red"` — unless suppressed (see below). */
  breaches: string[];
  /**
   * Why breaches were computed but NOT enforced. Set only when the ledger is unusable, and only when
   * there was a breach to suppress — so an infra failure is reported rather than dropped, and never
   * reds the gate.
   */
  suppressed?: string;
  config: GraduationDrainConfig;
}

/** Whole-day age of `fromIso` relative to `currentIso`; `null` if either is absent/unparseable. */
function daysSince(fromIso: string | undefined, currentIso: string): number | null {
  if (fromIso === undefined) return null;
  const from = Date.parse(fromIso);
  const now = Date.parse(currentIso);
  if (Number.isNaN(from) || Number.isNaN(now)) return null;
  const days = Math.floor((now - from) / 86_400_000);
  return days < 0 ? 0 : days;
}

/**
 * Evaluate the graduation-drain ceiling over a classified worklist. Pure — inject the date and the
 * ledger's usability.
 *
 * The ceiling is on the LIVE backlog (`new` + `changed` + `expired`, ADR-0202 D4): count > N, or the
 * oldest lease-expired candidate more than M days past expiry, ⇒ `red`. Parked candidates never count
 * while their lease holds. A breach computed against an UNUSABLE ledger is reported and suppressed —
 * fail-closed on the queue, fail-open on the substrate.
 */
export function evaluateGraduationDrain(
  candidates: readonly GraduationCandidate[],
  ctx: GraduationDrainContext,
  config: GraduationDrainConfig = DEFAULT_GRADUATION_DRAIN_CONFIG,
): GraduationDrainVerdict {
  let newCount = 0;
  let changedCount = 0;
  let expiredCount = 0;
  let parkedCount = 0;
  let ownCount = 0;
  let siblingCount = 0;
  let unattributedCount = 0;
  let oldest: { name: string; days: number } | null = null;

  for (const candidate of candidates) {
    if (candidate.status === "parked") {
      parkedCount += 1;
      continue;
    }
    // THE OWN-HOMEWORK EXCLUSION (ADR-0301), keyed exactly as `friction-drain.ts`'s `isOwnItem`: a
    // POSITIVE match on the current branch and nothing else. An unstamped memory, and every memory
    // when git cannot name a branch, falls to `unattributed` and is charged — so the exclusion can
    // only ever shrink by losing information, never grow.
    const isOwn =
      ctx.currentBranch !== null && candidate.branch !== undefined && candidate.branch === ctx.currentBranch;
    if (isOwn) ownCount += 1;
    else if (candidate.branch !== undefined) siblingCount += 1;
    else unattributedCount += 1;

    switch (candidate.status) {
      case "new":
        newCount += 1;
        break;
      case "changed":
        changedCount += 1;
        break;
      case "expired": {
        expiredCount += 1;
        // An expired candidate with no recorded expiry date contributes to the COUNT axis only —
        // under-reporting staleness rather than inventing an age for it. Own candidates are skipped
        // for the same reason they are skipped on the count axis: you cannot be overdue to re-review
        // what you wrote this session.
        const days = daysSince(candidate.leaseExpiredOn, ctx.currentDate);
        if (!isOwn && days !== null && (oldest === null || days > oldest.days)) {
          oldest = { name: candidate.name, days };
        }
        break;
      }
    }
  }

  const liveCount = newCount + changedCount + expiredCount;
  const chargedCount = liveCount - ownCount;
  const oldestOverdueDays = oldest === null ? null : oldest.days;
  const oldestOverdueName = oldest === null ? null : oldest.name;

  const breaches: string[] = [];

  // Count axis — fail-closed strictly above N, on the CHARGED backlog (ADR-0301). N IS UNCHANGED AT 4:
  // what moved is WHICH candidates count as this session's obligation, never how many are allowed.
  // That distinction is the tell ADR-0269 4(f) turns on, and it points the other way from gaming a
  // ceiling — a session that writes memories no longer trips its own gate, and every other candidate
  // is charged exactly as before.
  if (chargedCount > config.liveCeiling) {
    breaches.push(
      `live candidate backlog ${chargedCount} exceeds the ceiling (N=${config.liveCeiling})` +
        (ownCount > 0 ? ` (${ownCount} of ${liveCount} live excluded as this session's own)` : ""),
    );
  }

  // Staleness axis — INDEPENDENT of the count, never summed with it. A candidate whose lease expired
  // long ago has been awaiting re-review across many merges.
  if (oldestOverdueDays !== null && oldestOverdueDays > config.overdueCeilingDays) {
    breaches.push(
      `lease-expired candidate ${oldestOverdueName ?? "?"} is ${oldestOverdueDays}d past expiry, ` +
        `past the ceiling (M=${config.overdueCeilingDays}d)`,
    );
  }

  // The substrate guard. Computed first so the breach is REPORTED even when it cannot be enforced.
  const suppressed =
    breaches.length > 0 && !ctx.ledgerUsable
      ? "the park ledger is absent or unreadable, so every candidate classifies `new` — this measures " +
        "the substrate, not the queue"
      : undefined;

  const enforced = breaches.length > 0 && suppressed === undefined;
  const level: GraduationDrainVerdict["level"] = enforced ? "red" : liveCount > 0 ? "warn" : "ok";

  return {
    level,
    total: candidates.length,
    liveCount,
    newCount,
    changedCount,
    expiredCount,
    ownCount,
    siblingCount,
    unattributedCount,
    chargedCount,
    parkedCount,
    oldestOverdueDays,
    oldestOverdueName,
    breaches,
    ...(suppressed === undefined ? {} : { suppressed }),
    config,
  };
}
