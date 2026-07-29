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
// TWO LIMITATIONS, STATED RATHER THAN DISCOVERED LATER — both are real, both were observed, and the
// repair for each is to close the gap, NEVER to raise N (raising a ceiling to accommodate the work in
// front of you is the named failure mode on `process:verification-decay-detection`).
//
//   1. NO OWN-HOMEWORK EXCLUSION. ADR-0168 D4's friction ceiling excludes the current session's own
//      just-filed items, so "a retro that files its cap-3 can never trip its own ceiling". This cannot
//      do that: a `MemoryFile` carries no session or branch provenance to key the exclusion on. A
//      session that writes a memory file can therefore trip the ceiling on its own work. The repair is
//      to give memory files provenance.
//   2. THE INPUT IS MACHINE-SHARED, NOT SESSION-LOCAL. The agent-memory dir is per-MACHINE
//      (`~/.claude/projects/<slug>/memory`, ADR-0202) and resolves through the MAIN checkout, so every
//      concurrent worktree and session on the box reads and writes ONE queue. Observed while this
//      ceiling was being landed: the queue moved 4 → 5 live (parked 100 → 99) mid-session, without
//      this session touching a memory file — a sibling's edit broke a parked candidate's content hash
//      and re-entered it as `changed`. So this ceiling can red on work that is not yours, and the
//      drain that clears it has no claim protecting it. That is the arc's already-open
//      concurrent-drain decision (ADR-0121's ledger keys on unit ids, so nothing refuses a concurrent
//      drain) reaching a check that now BLOCKS rather than warns — surfaced here, not resolved here.
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
 */
export const DEFAULT_GRADUATION_DRAIN_CONFIG: GraduationDrainConfig = {
  liveCeiling: 4,
  overdueCeilingDays: 21,
};

/** The context the ceiling is evaluated from: WHEN, and whether the ledger can be trusted. */
export interface GraduationDrainContext {
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
  let oldest: { name: string; days: number } | null = null;

  for (const candidate of candidates) {
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
        // under-reporting staleness rather than inventing an age for it.
        const days = daysSince(candidate.leaseExpiredOn, ctx.currentDate);
        if (days !== null && (oldest === null || days > oldest.days)) {
          oldest = { name: candidate.name, days };
        }
        break;
      }
      case "parked":
        parkedCount += 1;
        break;
    }
  }

  const liveCount = newCount + changedCount + expiredCount;
  const oldestOverdueDays = oldest === null ? null : oldest.days;
  const oldestOverdueName = oldest === null ? null : oldest.name;

  const breaches: string[] = [];

  // Count axis — fail-closed strictly above N.
  if (liveCount > config.liveCeiling) {
    breaches.push(
      `live candidate backlog ${liveCount} exceeds the ceiling (N=${config.liveCeiling})`,
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
    parkedCount,
    oldestOverdueDays,
    oldestOverdueName,
    breaches,
    ...(suppressed === undefined ? {} : { suppressed }),
    config,
  };
}
