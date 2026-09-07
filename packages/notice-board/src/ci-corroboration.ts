/**
 * CI corroboration (ADR-0535 D2, the NARROW half) — the one liveness signal in this system a
 * session cannot produce merely by existing.
 *
 * Its sibling, {@link file://../../drive/src/ambient-presence.ts | the worktree-activity sweep},
 * observes file change inside each claimed worktree. That signal is dense through the building
 * hours and DARK precisely while a session waits on checks touching no files — which is the
 * incident that opened `ledger-liveness-honesty-arc`: an owner was shown an arc with nobody on it
 * while the session holding it was 432 tool calls in, with a PR open and its checks still running.
 * This module fills that hole from the outside: GitHub's own view of the branch.
 *
 * ⚠⚠ ONLY THE NARROW FORM EXISTS HERE, AND THE BROAD FORM IS REFUSED ON MEASUREMENT RATHER THAN ON
 * TASTE. A claim is corroborated when its branch has a check RUNNING RIGHT NOW, or a commit pushed
 * very recently — the two {@link CorroborationKind}s below, and there is deliberately no third.
 * "Has an open pull request, therefore alive" would RESURRECT THE THREE DEADEST CLAIMS ON THE
 * BOARD: every open PR on this repo is a long-abandoned draft (852-863 h when ADR-0535 measured
 * them on 2026-09-05; the SAME seven, still drafts, at ~940 h on 2026-09-08), and three of their
 * branches are exactly the three oldest abandoned claims. Implemented broadly — even by accident —
 * that makes corpse-fencing PERMANENT, in the failure direction that has no tell. The refusal is
 * held in three places so it cannot slip: this type, `inProgressRunsUrl`'s single admitted query,
 * and the workflow's withheld `pull-requests` permission (see `ingest-ci-activity.ts`).
 *
 * PURE and browser-safe: no fetch, no clock, no store. The observing is `ingest-ci-activity.ts`'s.
 */

/**
 * What GitHub told us about a branch. Exactly the two clauses ADR-0535 D2 admits — a union with no
 * `open-pull-request` member, so the refused form has no shape to arrive in.
 */
export type CorroborationKind = "check-running" | "push";

/**
 * The admitted kinds AS DATA — the type-level fence made enforceable at runtime.
 *
 * A union alone is erased at compile time, so it fences the author and nobody else. This set is
 * what {@link planCorroboration} actually checks, so a reading whose kind was never decided on is
 * REFUSED and NAMED in the report rather than silently stamped. That matters more here than it
 * usually would: the widening this exists to stop ("has an open pull request, therefore alive")
 * fails in the direction that has no tell, so the failure has to announce itself.
 */
const ADMITTED_KINDS: ReadonlySet<string> = new Set<CorroborationKind>(["check-running", "push"]);

/** One reading, reduced to what the ledger needs. */
export interface CorroborationObservation {
  /** The ref as GitHub reported it — `refs/heads/<branch>` for a push, a bare branch for a run. */
  readonly ref: string;
  readonly kind: CorroborationKind;
  /**
   * When WE observed it, ISO — the job's own clock, not the commit's.
   *
   * Deliberately not the pushed commit's `timestamp`: a commit authored hours ago and pushed just
   * now would then read as hours old, and the evidence here is the PUSH, not the authoring.
   */
  readonly observedAt: string;
  /** True when the push DELETED the ref — the branch is gone, so nothing is working on it. */
  readonly deleted?: boolean;
}

/** Why a reading was not allowed to vouch for anything. Every refusal is REPORTED, never silent. */
export type CorroborationRefusalReason =
  | "default-branch"
  | "deleted-ref"
  | "not-a-branch"
  | "future"
  | "unadmitted-kind"
  | "unreadable";

export interface CorroborationRefusal {
  readonly ref: string;
  readonly reason: CorroborationRefusalReason;
}

/** A branch the ledger may be told about, with the evidence that earned it. */
export interface BranchCorroboration {
  readonly branch: string;
  readonly observedAt: string;
  readonly kind: CorroborationKind;
}

export interface CorroborationPlan {
  /** At most one per branch, carrying the NEWEST observation that vouched for it. */
  readonly stamps: readonly BranchCorroboration[];
  readonly refused: readonly CorroborationRefusal[];
}

export interface CorroborationContext {
  readonly now: Date;
  /**
   * The repository's default branch — never corroborated, and a PARAMETER rather than a `"main"`
   * literal so the fence is provable rather than assumed.
   */
  readonly defaultBranch: string;
}

const HEADS_PREFIX = "refs/heads/";

/**
 * The branch a ref names, or null when it names no branch.
 *
 * Accepts both spellings because the two observers speak differently: a push event carries
 * `refs/heads/<branch>`, a workflow run carries a bare `head_branch`. A `refs/tags/…` or
 * `refs/pull/…` ref names no branch and is refused — no claim can carry one, so admitting it could
 * only ever stamp by accident.
 */
export function branchFromRef(ref: string): string | null {
  const trimmed = ref.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith(HEADS_PREFIX)) {
    const branch = trimmed.slice(HEADS_PREFIX.length);
    return branch.length === 0 ? null : branch;
  }
  return trimmed.startsWith("refs/") ? null : trimmed;
}

/**
 * PURE: turn observations into the branches the ledger may be told about, and name every refusal.
 *
 * FOUR FENCES, ALL AGAINST FALSE FRESHNESS — the same asymmetry its worktree-activity sibling
 * encodes, for the same reason. `heartbeat_at` is not a display value: it decides `isReclaimable`
 * (so the takeover rule that lets a live session reclaim a dead one's node), `listLiveClaims`, and
 * through `worktree prune --pg`'s live set whether a directory may be DELETED. A stamp that is too
 * OLD costs nothing new — it reproduces today's behaviour, where every claim goes stale on a timer.
 * A stamp that is too FRESH fences a node nobody can reclaim.
 *
 * 1. `unreadable` — the ref is blank. 0 readings vouch for nobody.
 * 2. `not-a-branch` — a tag or another non-branch ref. No claim carries one.
 * 3. `deleted-ref` — the push DELETED the branch. A branch that no longer exists is the one thing
 *    a push can say that is evidence of ABSENCE, so it must never read as evidence of life.
 * 4. `default-branch` — `main`. A push there is a MERGE landing, not a session working, and
 *    `claim-release.yml` releases that branch's claims on the same event. Corroborating it would
 *    have the two CI writers contradict each other over one merge.
 * 5. `future` — a reading ahead of `now`. Refused rather than clamped: a claim whose heartbeat
 *    outlives the staleness window is a fence nobody can ever reclaim, and losing one stamp is the
 *    cheap direction. `stampClaimActivity` clamps for the same asymmetry read the other way.
 * 6. `unadmitted-kind` — a reading of a kind ADR-0535 D2 never decided on. FAIL-CLOSED: an observer
 *    widened without the decision being widened produces a refusal the report NAMES, rather than a
 *    stamp nobody can distinguish from a legitimate one.
 *
 * Deduped to the NEWEST observation per branch. On an exact tie `check-running` wins over `push`:
 * both are the same instant, so the timestamp cannot choose, and a check EXECUTING is the stronger
 * statement — a push is over the moment it lands, where a run in progress is happening now. The
 * choice reaches only the report, since the stamp itself is the timestamp both agreed on.
 */
/**
 * On an EXACT tie, is the incoming reading the stronger thing to say?
 *
 * The tie is the ORDINARY case, not an edge one: a whole run shares a single clock reading, so a
 * branch that both pushed and has a check running produces two observations at the same
 * millisecond. A push is over the instant it lands; a run in progress is still happening. The
 * choice reaches only the REPORT — the stamp itself is the timestamp both agreed on.
 */
function strongerKind(candidate: CorroborationKind, held: CorroborationKind): boolean {
  // Stryker disable next-line ConditionalExpression,LogicalOperator: EQUIVALENT — forcing either
  // conjunct TRUE (or widening `&&` to `||`) can only ever replace a stamp with one carrying the
  // SAME branch, instant and kind, because the only case each admits that this does not is a tie
  // between two readings of the same kind. An identical replacement is unobservable by
  // construction. The blanket costs two killable whole-expression mutants of the same mutator; the
  // property they test is still held, by the EqualityOperator mutants on this line, which stay live
  // and which `planCorroboration: on an exact tie a RUNNING CHECK outranks a push` kills.
  return candidate === "check-running" && held === "push";
}

/** Does `candidate` say something LATER than `held` — or, at the same instant, stronger? */
function beats(candidate: BranchCorroboration, held: BranchCorroboration): boolean {
  const a = Date.parse(candidate.observedAt);
  const b = Date.parse(held.observedAt);
  return a > b || (a === b && strongerKind(candidate.kind, held.kind));
}

export function planCorroboration(
  observations: readonly CorroborationObservation[],
  ctx: CorroborationContext,
): CorroborationPlan {
  const nowMs = ctx.now.getTime();
  const best = new Map<string, BranchCorroboration>();
  const refused: CorroborationRefusal[] = [];

  for (const observation of observations) {
    const branch = branchFromRef(observation.ref);
    if (branch === null) {
      refused.push({
        ref: observation.ref,
        reason: observation.ref.trim().length === 0 ? "unreadable" : "not-a-branch",
      });
      continue;
    }
    if (observation.deleted === true) {
      refused.push({ ref: branch, reason: "deleted-ref" });
      continue;
    }
    if (branch === ctx.defaultBranch) {
      refused.push({ ref: branch, reason: "default-branch" });
      continue;
    }
    if (!ADMITTED_KINDS.has(observation.kind)) {
      refused.push({ ref: branch, reason: "unadmitted-kind" });
      continue;
    }
    const observedMs = Date.parse(observation.observedAt);
    if (!Number.isFinite(observedMs)) {
      refused.push({ ref: branch, reason: "unreadable" });
      continue;
    }
    if (observedMs > nowMs) {
      refused.push({ ref: branch, reason: "future" });
      continue;
    }

    const candidate: BranchCorroboration = {
      branch,
      observedAt: new Date(observedMs).toISOString(),
      kind: observation.kind,
    };
    const held = best.get(branch);
    if (held === undefined || beats(candidate, held)) best.set(branch, candidate);
  }

  const stamps = [...best.values()].sort((a, b) => a.branch.localeCompare(b.branch));
  return { stamps, refused };
}

/**
 * The whole verdict of one corroboration run, as one deterministic block.
 *
 * LOUD ON PURPOSE. The mechanism this replaces wrote silently and could only be audited by querying
 * the database afterwards — which is how it stayed dead for three weeks without anyone noticing
 * (ADR-0535's fault 1: 35 of 40 claims never refreshed once). A writer whose only record is the row
 * it wrote cannot be told from one that stopped running, so every run says what it saw, what it
 * refused and what the ledger actually took.
 *
 * `written` is the ledger's own count of claims MOVED FORWARD, which is normally lower than the
 * stamp count and that is not a fault: a branch holding no claim, and a claim already fresher than
 * the reading, both correctly take nothing.
 */
export function renderCorroboration(plan: CorroborationPlan, written: number): string {
  const lines = [
    `[ci-corroborate] ${plan.stamps.length} branch(es) corroborated, ` +
      `${plan.refused.length} refused, ${written} claim(s) moved forward`,
  ];
  for (const stamp of plan.stamps) {
    lines.push(`  ${stamp.branch} <- ${stamp.kind} at ${stamp.observedAt}`);
  }
  for (const refusal of plan.refused) {
    lines.push(`  refused ${refusal.ref} (${refusal.reason})`);
  }
  return lines.join("\n");
}
