/**
 * ADR-0098 (U4) — the BATCH DECISION-SWEEP, the pre-build half of the build-tests inner loop.
 *
 * Before a `build-tests` gate's R2 refactor is DRIVEN (the spend: a worktree + the SDK leaf), a
 * pre-build sweep analyses the pocket + the gate and surfaces the KEY design forks to the human (the
 * owner, via the orchestrator session) UP-FRONT — never mid-build pause/resume (the owner's Q3 call,
 * ADR-0098 d.5). The owner resolves each, the resolutions thread into the leaf's brief, and the loop
 * then runs unattended. An UNRESOLVED key fork HALTS the drive fail-closed: the loop never silently
 * guesses an owner-level decision.
 *
 * **The bar for "key" IS the owner-fork bar** (ADR-0097 `owner-fork-bar` — escalate **ownership, not
 * uncertainty**). A candidate fork is escalated to the owner iff it (a) changes a **public
 * seam/signature** other code depends on, (b) picks between **materially different refactor
 * strategies**, or (c) is **cross-cutting or irreversible**. A routine within-pocket choice (a name, a
 * test's layout) meets NONE of these — the leaf makes it itself, and it must NOT escalate. This is the
 * single deterministic home of that discriminator, so the sweep surface and the studio/agent can never
 * fork on what counts as the owner's call.
 *
 * **Where the forks come from (the Layer boundary).** The CANDIDATE forks — the agent's reading of the
 * pocket, each tagged with the three d.5 signals it observed — are AGENT ANALYSIS (the orchestrator /
 * story-author session's pre-build pocket analysis, ADR-0098 d.5), exactly as the finer
 * observe/R1/R2 pocket classification is agent analysis that fills the extensible slot in
 * {@link classifyAdoption}. This module is the MECHANICAL half: it does not invent forks, it
 * CLASSIFIES the ones surfaced (the bar), PARTITIONS them (escalated vs routine, resolved vs blocked),
 * and decides whether the drive may proceed (the halt gate). The honest split mirrors Layer-2 ↔
 * Layer-3: the agent supplies judgement, the spine supplies the deterministic ruler.
 *
 * Pure-by-injection like {@link classifyAdoption}: it reads only the candidate forks (plain data) and
 * touches no store / git / clock / network, so the whole sweep is offline-testable. The driver
 * ({@link driveBuildTestsGate}) consults it before any spend; the report formatters here render the
 * owner-facing halt and the brief context, kept pure so they are testable without the driver.
 */

/**
 * The three d.5 escalation signals = the owner-fork bar (ADR-0097 `owner-fork-bar`). Each is set by the
 * agent's pocket analysis: does THIS fork cross one of the lines that makes it the owner's call rather
 * than the leaf's? A fork that trips ANY of the three is escalated; one that trips none is routine.
 */
export interface ForkSignals {
  /** (a) Does resolving it change a PUBLIC seam/signature other code depends on? */
  changesPublicSeam: boolean;
  /** (b) Does it pick between MATERIALLY DIFFERENT refactor strategies (not cosmetic variants)? */
  materiallyDifferentStrategies: boolean;
  /** (c) Is it CROSS-CUTTING (touches beyond this pocket) or IRREVERSIBLE? */
  crossCuttingOrIrreversible: boolean;
}

/**
 * One candidate design fork the agent's pre-build pocket analysis surfaced for a `(pocket, gate)`. The
 * `question` is the fork stated plainly for the owner (owner-fork-bar's plain-language-first sibling);
 * the signals are the agent's read against the d.5 bar; `resolution` is the owner's answer threaded
 * back in (absent / blank = unresolved → a key fork then HALTS the drive).
 */
export interface DecisionFork extends ForkSignals {
  /** A stable handle for the fork (e.g. `runseed-seam-shape`) — carried into the report + the brief. */
  id: string;
  /** The fork stated plainly for the owner, e.g. "Should runSeed take a Pool, or the built Store + a loader fn?". */
  question: string;
  /** The owner's resolution, threaded back by the orchestrator session. Absent / blank = unresolved. */
  resolution?: string;
}

/** Whether a fork is the OWNER's call (escalate) or the LEAF's (a routine within-pocket choice). */
export type ForkDisposition = "escalate" | "leaf";

/** A candidate fork after classification: its disposition (the bar) and whether the owner resolved it. */
export interface ClassifiedFork extends DecisionFork {
  /** `escalate` iff it trips the d.5 bar; `leaf` otherwise (a routine choice the leaf makes itself). */
  disposition: ForkDisposition;
  /** True iff a non-blank `resolution` is present (the owner answered). */
  resolved: boolean;
}

/** Everything {@link sweepDecisions} reads — injected for determinism (pure: no store / git / clock). */
export interface DecisionSweepSpec {
  /** The gate the sweep gates (`<story>#gate-<n>`) — carried onto the result + the halt report. */
  gateId: string;
  /** The pocket under the gate (the brownfield node/code being refactored) — for the owner-facing report. */
  pocket?: string;
  /** The candidate forks the agent's pocket analysis surfaced (plain data; never store-derived). */
  forks: readonly DecisionFork[];
}

/**
 * The result of a pre-build decision sweep over a `(pocket, gate)`'s candidate forks. `clear` is the
 * single bit the driver gates on: true → no key fork is unresolved, the drive may proceed (and the
 * resolved forks thread into the leaf brief); false → at least one owner-level fork is unresolved, the
 * drive HALTS fail-closed (ADR-0098 d.5 — never silently guess an owner's call).
 */
export interface DecisionSweep {
  /** The gate this sweep gates. */
  gateId: string;
  /** The pocket under the gate, when supplied. */
  pocket?: string;
  /** Every candidate fork, classified, in the order surfaced (stable — never re-sorted). */
  decisions: ClassifiedFork[];
  /** The forks that trip the d.5 bar (the owner's calls). */
  escalated: ClassifiedFork[];
  /** The forks the leaf makes itself (routine within-pocket choices). */
  routine: ClassifiedFork[];
  /** Escalated AND unresolved — these HALT the drive (the fail-closed set). */
  blocked: ClassifiedFork[];
  /** Escalated AND resolved — the owner's answers, threaded into the leaf brief so the loop runs unattended. */
  resolved: ClassifiedFork[];
  /** `blocked.length === 0` — the drive may proceed iff every owner-level fork is resolved. */
  clear: boolean;
}

/** True iff a fork carries a non-blank resolution (the owner answered it). */
function isResolved(fork: DecisionFork): boolean {
  return (fork.resolution ?? "").trim().length > 0;
}

/**
 * PURE: classify ONE fork against the d.5 owner-fork bar — escalate iff it trips ANY of the three
 * signals (changes a public seam, picks between materially different strategies, or is cross-cutting /
 * irreversible); `leaf` otherwise. The single deterministic home of "is this the owner's call?".
 */
export function classifyFork(fork: ForkSignals): ForkDisposition {
  return fork.changesPublicSeam ||
    fork.materiallyDifferentStrategies ||
    fork.crossCuttingOrIrreversible
    ? "escalate"
    : "leaf";
}

/**
 * PURE: sweep a `(pocket, gate)`'s candidate forks into the pre-build decision (ADR-0098 d.5). Each
 * fork is classified by {@link classifyFork} and marked resolved/unresolved; the result partitions
 * them (escalated vs routine, blocked vs resolved) and sets `clear` = no key fork is unresolved.
 *
 * Order-preserving: `decisions` follows the surfaced order; the projections are stable. The empty case
 * (no forks surfaced — today's default for a drive the orchestrator session has not analysed) is
 * `clear`, so the wiring is backward-compatible: a drive with no declared forks proceeds exactly as
 * before. A routine fork NEVER blocks (the leaf owns it), even unresolved; only an escalated-AND-
 * unresolved fork blocks.
 */
export function sweepDecisions(spec: DecisionSweepSpec): DecisionSweep {
  const decisions: ClassifiedFork[] = spec.forks.map((fork) => ({
    ...fork,
    disposition: classifyFork(fork),
    resolved: isResolved(fork),
  }));
  const escalated = decisions.filter((d) => d.disposition === "escalate");
  const routine = decisions.filter((d) => d.disposition === "leaf");
  const blocked = escalated.filter((d) => !d.resolved);
  const resolved = escalated.filter((d) => d.resolved);
  return {
    gateId: spec.gateId,
    ...(spec.pocket !== undefined ? { pocket: spec.pocket } : {}),
    decisions,
    escalated,
    routine,
    blocked,
    resolved,
    clear: blocked.length === 0,
  };
}

/** The d.5 clauses a fork tripped — the plain "why it's the owner's call" lines for the halt report. */
function escalationReasons(fork: ForkSignals): string[] {
  const reasons: string[] = [];
  if (fork.changesPublicSeam) reasons.push("changes a public seam/signature other code depends on");
  if (fork.materiallyDifferentStrategies) reasons.push("picks between materially different refactor strategies");
  if (fork.crossCuttingOrIrreversible) reasons.push("is cross-cutting or irreversible");
  return reasons;
}

/**
 * PURE: the owner-facing HALT report for a blocked sweep (`!clear`) — the body the driver refuses with.
 * Names each unresolved key fork plainly and why it is the owner's call (the d.5 clauses it tripped),
 * so the owner can resolve it and re-drive. Deterministic; assumes `sweep.blocked` is non-empty (the
 * driver only calls it when halting).
 */
export function blockedHaltReport(sweep: DecisionSweep): string {
  const n = sweep.blocked.length;
  const lines = [
    `decision sweep HALTED ${sweep.gateId}${sweep.pocket !== undefined ? ` (pocket: ${sweep.pocket})` : ""}: ` +
      `${n} key design ${n === 1 ? "fork is" : "forks are"} unresolved — no spend.`,
    "A build-tests drive NEVER silently guesses an owner-level fork (ADR-0098 d.5 — escalate ownership,",
    "not uncertainty). Resolve each with the owner, thread the answer into the fork's `resolution`, then",
    "re-run the gate:",
    "",
  ];
  for (const fork of sweep.blocked) {
    lines.push(`  • ${fork.question}  [${fork.id}]`);
    lines.push(`    why it's the owner's call: ${escalationReasons(fork).join("; ")}`);
  }
  return lines.join("\n");
}

/**
 * PURE: the brief context for the owner-SETTLED key forks — the lines the driver threads into the leaf
 * brief so the loop runs unattended honouring the owner's calls (ADR-0098 d.5). Only RESOLVED ESCALATED
 * forks are threaded: routine forks are the leaf's to decide (we never pre-empt them), and an unresolved
 * key fork would have halted the drive before this is reached. Returns null when there is nothing settled
 * to thread (the common path), so the driver appends nothing.
 */
export function resolvedBriefContext(sweep: DecisionSweep): string | null {
  if (sweep.resolved.length === 0) return null;
  const lines = [
    "Owner-settled design decisions (resolved up-front by the batch decision-sweep, ADR-0098 d.5 —",
    "honour each EXACTLY; do not re-open or re-litigate them):",
  ];
  for (const fork of sweep.resolved) {
    lines.push(`- ${fork.question}`);
    lines.push(`  → ${fork.resolution!.trim()}`);
  }
  return lines.join("\n");
}
