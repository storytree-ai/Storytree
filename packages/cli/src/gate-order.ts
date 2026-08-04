// The gate's ORDERING invariant — the PURE half (`green-gate`, stories/ci-cd).
//
// This module owns the canonical, ordered {@link GATE_PLAN} the gate runs, plus the invariant that
// judges it. Until 2026-08-04 the plan lived as a 25-link `&&` chain in the root `package.json` and
// this module parsed it; the chain is now {@link GATE_PLAN} and `pnpm gate` is a runner over it
// (`gate-run.ts`, executed by the pure `gate-runner.ts`). The reason the chain had to go is in that
// runner's header — in one line: `&&` is fail-fast, so the first red left every later step UNRUN and
// reported it as nothing at all rather than as unverified.
//
// TWO AXES, both fail-closed, both about WHEN a verdict arrives rather than about what it says.
//
// AXIS 1 — CHEAP FIRST. Two steps are the MINUTES — `pnpm -r typecheck` and `pnpm -r test`, together
// ~8-10 minutes on a dev box — while every `check:*` step is SECONDS (measured 2026-07-28: 2-19 s
// each, the slowest being the ones that open a Cloud SQL connection). A seconds-cost check placed
// after the minutes is only ever read once the whole suite has run, so a session waits the full
// chain to learn something that was knowable at second 40.
//
// That is not hypothetical. `check:declared` — the claim rung (ADR-0200 D3), which refuses a session
// holding no live claim — sat LAST. Concurrency is precisely what makes a claim go absent underneath
// a session, so the rung fires often, and it fired at the merge ceremony where a wasted gate run
// costs the most. Filed four separate times in five days
// (`check-declared-fails-last-after-a-full-gate`, `claim-absence-surfaces-only-after-the-gates-
// expensive-legs`, `session-claim-silently-cleared-mid-session-fails-the-gate-late`,
// `gate-runs-check-declared-last`).
//
// AXIS 2 — THE SESSION'S OWN WORK BEFORE THE SHARED ENVIRONMENT (parked entry
// `gate-runs-every-step-and-reports-per-step` on `verification-integrity-arc`, from friction
// `gate-aborts-early-hiding-thirteen-later-steps`). Some steps can only red on something in THIS
// branch's diff; others can red on state this session did not author — another session's dirt in the
// shared primary checkout, a sibling's live-store write, a sibling's memory file, a backlog ceiling
// counted over the whole corpus, the box's Node version, a deployed artifact. The session's own
// answer must not sit behind a condition it is not permitted to remediate (ADR-0245 D5.2 D3 forbids
// automatic remediation of the lobby outright), so every {@link SHARED_ENVIRONMENT_CHECKS} member
// runs AFTER both expensive legs.
//
// THE TWO AXES DISAGREE ABOUT EXACTLY ONE STEP, AND THE DISAGREEMENT IS SETTLED HERE, DELIBERATELY.
// `check:declared` is a seconds-cost check (axis 1 wants it early) that judges the shared checkout
// (axis 2 wants it late), and it is the rung whose late position was filed four times. It moves to
// the LATE block, and the four filings are not being re-opened: every one of them measured the same
// harm — a whole ~10-minute gate run spent to learn ONLY that a claim had lapsed, because `&&`
// aborted there and nothing after it ran. Under the run-every-step runner that harm cannot occur.
// The same run now returns all 25 verdicts, and the remedy for a lapsed claim is a 3-second
// `noticeboard declare` plus a 5-second re-run of that ONE step — the other 24 verdicts still hold,
// nothing about the tree having changed. What is left of the old cost is latency on a signal, and
// what is bought is that a red the session cannot fix never precedes the session's own answer. Both
// directions are now PINNED (`evaluateGateOrder` fails on a shared check that drifts early just as
// it fails on an own-work check that drifts late), so this is more constraint than the single axis
// it replaces, not less.
//
// Deliberately NOT a `check:gate-order` gate rung: the invariant is about the shape of the gate plan,
// so a rung inside that plan would be a step checking the list it is a member of. The honest home is
// a test in `pnpm -r test` (`gate-order.test.ts`), which holds the plan to the sets below AND to the
// real root `package.json` — every planned step must name a script that exists, and every `check:*`
// script that exists must be in the plan. That second assertion is the load-bearing one: without it,
// adding a check to `package.json` and forgetting the plan would make the gate silently never run
// it, which is the very defect class this arc exists to close.
//
// Pure: no I/O. The caller supplies the plan and the root package.json's script names.

/**
 * The chain's minutes-cost legs — the wall a cheap check is ordered against. Matched as SUBSTRINGS
 * of a step, so the affected-scope form CI uses (`pnpm ${args} typecheck`) is not relevant here: the
 * local plan is literal.
 */
export const EXPENSIVE_STEPS: readonly string[] = ["pnpm -r typecheck", "pnpm -r test"];

/**
 * WHO a red is about — the axis-2 classification, and the only judgement in this module that is not
 * mechanical.
 *
 * The criterion is deliberately narrow and testable: a step is `own-work` when a red can ONLY be
 * caused by something in this branch's diff. If a red can be caused by state the session did not
 * author, it is `shared-environment` — even when it can ALSO be caused by the diff. The asymmetry is
 * the point: a step that is sometimes not yours must not gate the arrival of a step that is always
 * yours.
 */
export type GateSubject = "own-work" | "shared-environment";

/** Wall-clock class — the axis-1 classification. `minutes` is exactly the two `-r` legs. */
export type GateCost = "seconds" | "minutes";

/** One step of the gate, in plan order. */
export interface GateStep {
  /** The step's command text, trimmed (e.g. `pnpm check:declared`). */
  readonly command: string;
  /** Its `check:*` script name, or `undefined` for a step that runs no check (typecheck/test). */
  readonly check: string | undefined;
}

/** A {@link GateStep} carrying the two classifications the invariant judges, and why. */
export interface GatePlanStep extends GateStep {
  readonly subject: GateSubject;
  readonly cost: GateCost;
  /** One line: WHY this subject classification, so the call is auditable rather than asserted. */
  readonly why: string;
}

/**
 * THE GATE, in the order it runs. The single source of truth for `pnpm gate` — the root
 * `package.json` `gate` script is now just the runner that walks this list.
 *
 * Three blocks, and the block boundaries are the invariant:
 *   A. own-work / seconds  — fast feedback on this branch's diff
 *   B. own-work / minutes  — the two `-r` legs, still this branch's diff
 *   C. shared-environment  — seconds each, but a red may be a sibling's; never ahead of B
 *
 * Adding a step is a deliberate edit in three places at once (here, its `subject`, and its `why`),
 * and `gate-order.test.ts` refuses a `check:*` script that exists in `package.json` but not here.
 */
export const GATE_PLAN: readonly GatePlanStep[] = [
  // ── A. own-work, seconds ───────────────────────────────────────────────────
  {
    command: "pnpm check:manifest",
    check: "check:manifest",
    subject: "own-work",
    cost: "seconds",
    why: "reds on a root/docs entry this diff added",
  },
  {
    command: "pnpm check:boundaries",
    check: "check:boundaries",
    subject: "own-work",
    cost: "seconds",
    why: "reds on a cross-organism dependency this diff added without a declared story edge",
  },
  {
    command: "pnpm check:mirror-conformance",
    check: "check:mirror-conformance",
    subject: "own-work",
    cost: "seconds",
    why: "reds when this diff moves one mirrored surface and not its twin",
  },
  {
    command: "pnpm check:guidance",
    check: "check:guidance",
    subject: "own-work",
    cost: "seconds",
    why: "reds when this diff edits the agent seed without regenerating the root views",
  },
  {
    command: "pnpm check:agents",
    check: "check:agents",
    subject: "own-work",
    cost: "seconds",
    why: "same generated-view drift, for .claude/.cursor/.codex/.gemini agent files",
  },
  {
    command: "pnpm check:process-graph",
    check: "check:process-graph",
    subject: "own-work",
    cost: "seconds",
    why: "reds on a process/step graph this diff broke; reads the committed seed only",
  },
  {
    command: "pnpm check:test-timing",
    check: "check:test-timing",
    subject: "own-work",
    cost: "seconds",
    why: "ZERO ceiling on a clean baseline (ADR-0276 D3) — a breach is a timing assertion this diff added",
  },
  {
    command: "pnpm check:web-grounding",
    check: "check:web-grounding",
    subject: "own-work",
    cost: "seconds",
    why: "the web submodule PIN and the ADR corpus are both in this diff",
  },
  {
    command: "pnpm check:web-engine",
    check: "check:web-engine",
    subject: "own-work",
    cost: "seconds",
    why: "reds when this diff moves packages/forest-world without re-syncing the vendored copy",
  },
  {
    command: "pnpm check:web-experience",
    check: "check:web-experience",
    subject: "own-work",
    cost: "seconds",
    why: "reds on the pinned site's experience markers, and the pin is in this diff",
  },

  // ── B. own-work, minutes ───────────────────────────────────────────────────
  {
    command: "pnpm -r typecheck",
    check: undefined,
    subject: "own-work",
    cost: "minutes",
    why: "the session's own diff, and the first of the two answers a session actually came for",
  },
  {
    command: "pnpm -r test",
    check: undefined,
    subject: "own-work",
    cost: "minutes",
    why: "the session's own diff; independent of typecheck because tests run transpile-only via tsx",
  },

  // ── C. shared environment ──────────────────────────────────────────────────
  {
    command: "pnpm check:declared",
    check: "check:declared",
    subject: "shared-environment",
    cost: "seconds",
    why: "its lobby arm reds on dirt another session left in the shared primary checkout (ADR-0245 D5.2), which this session is forbidden to clean",
  },
  {
    command: "pnpm check:agents-sync",
    check: "check:agents-sync",
    subject: "shared-environment",
    cost: "seconds",
    why: "compares the seed to the SHARED live store — a sibling's live agent write reds it",
  },
  {
    command: "pnpm check:corpus-sync",
    check: "check:corpus-sync",
    subject: "shared-environment",
    cost: "seconds",
    why: "same seed↔live comparison for non-agent artifacts; a sibling's seed commit reds it",
  },
  {
    command: "pnpm check:corpus-content",
    check: "check:corpus-content",
    subject: "shared-environment",
    cost: "seconds",
    why: "reads the shared live store; ADR-0290 exists precisely because siblings' drift reached it",
  },
  {
    command: "pnpm check:friction-drain",
    check: "check:friction-drain",
    subject: "shared-environment",
    cost: "seconds",
    why: "a ceiling over the SHARED friction backlog, which any session can grow",
  },
  {
    command: "pnpm check:arc-proposal-drain",
    check: "check:arc-proposal-drain",
    subject: "shared-environment",
    cost: "seconds",
    why: "a ceiling over parked work on SHARED arcs, which any session can grow",
  },
  {
    command: "pnpm check:verification-decay",
    check: "check:verification-decay",
    subject: "shared-environment",
    cost: "seconds",
    why: "reds every session the moment any instrument breaches on main — the measured case behind the parked entry `verification-decay-charges-by-authorship`",
  },
  {
    command: "pnpm check:coverage",
    check: "check:coverage",
    subject: "shared-environment",
    cost: "seconds",
    why: "a two-axis ceiling over the whole corpus's unproven contracts; a sibling's landing can breach it",
  },
  {
    command: "pnpm check:surface-coverage",
    check: "check:surface-coverage",
    subject: "shared-environment",
    cost: "seconds",
    why: "a ceiling over the SHARED process↔entrypoint bijection backlog",
  },
  {
    command: "pnpm check:graduation-worklist",
    check: "check:graduation-worklist",
    subject: "shared-environment",
    cost: "seconds",
    why: "counts memory files sibling sessions wrote — the parked entry `graduation-worklist-charges-by-authorship` is exactly this",
  },
  {
    command: "pnpm check:node-version",
    check: "check:node-version",
    subject: "shared-environment",
    cost: "seconds",
    why: "judges the BOX's Node runtime, not the diff (WARN-class, always exit 0)",
  },
  {
    command: "pnpm check:dist-drift",
    check: "check:dist-drift",
    subject: "shared-environment",
    cost: "seconds",
    why: "judges the PUBLISHED installer, an artifact outside this diff",
  },
  {
    command: "pnpm check:deploy-health",
    check: "check:deploy-health",
    subject: "shared-environment",
    cost: "seconds",
    why: "judges the DEPLOYED hosted studio, an artifact outside this diff",
  },
];

/**
 * `check:*` scripts in the root `package.json` that are deliberately NOT gate steps. Keyed to a
 * reason, because `gate-order.test.ts` otherwise refuses any script absent from {@link GATE_PLAN} —
 * that refusal is what stops a new check from being added to `package.json` and silently never run.
 */
export const NON_GATE_CHECK_SCRIPTS: ReadonlyMap<string, string> = new Map([
  ["check:claude", "a back-compat alias for `check:guidance`, which the plan already runs"],
]);

/**
 * The seconds-cost steps that MUST run BEFORE {@link EXPENSIVE_STEPS} — axis 1.
 *
 * Membership means all three things at once: the check costs SECONDS, its answer does not depend on
 * the code compiling or the tests passing, and a red is THIS branch's to fix — so nothing is learned
 * and nobody is helped by making it wait.
 *
 * Adding or removing a name is a deliberate edit, not a formality: dropping one here is how a check
 * silently slides back behind the expensive legs, which is one of the two regressions this exists to
 * catch. Derived-by-hand rather than computed from {@link GATE_PLAN} on purpose — a set computed from
 * the plan would agree with the plan by construction and could never contradict it.
 */
export const PRE_EXPENSIVE_CHECKS: ReadonlySet<string> = new Set([
  "check:manifest",
  "check:boundaries",
  "check:mirror-conformance",
  "check:guidance",
  "check:agents",
  "check:process-graph",
  "check:web-grounding",
  "check:web-engine",
  "check:web-experience",
  // The wall-clock fence (ADR-0276 D3). A static scan of test FILES — it needs neither a compile nor
  // a passing suite, and it belongs ahead of `pnpm -r test` on its own subject matter: a session
  // should learn its new timing assertion is fenced in seconds, not after the ten minutes this very
  // check exists to stop being wasted (3 of 4 overnight gate runs, 9-42 min each, on docs-only diffs).
  "check:test-timing",
]);

/**
 * The steps that MUST run AFTER {@link EXPENSIVE_STEPS} — axis 2. Each can red on state this session
 * did not author, so none of them may precede the session's own answer.
 *
 * `check:declared` is the deliberate move recorded in this module's header: it left
 * {@link PRE_EXPENSIVE_CHECKS} when the runner made an early red stop hiding the rest, and its
 * position is now pinned from BOTH sides rather than one.
 */
export const SHARED_ENVIRONMENT_CHECKS: ReadonlySet<string> = new Set([
  "check:declared",
  "check:agents-sync",
  "check:corpus-sync",
  "check:corpus-content",
  "check:friction-drain",
  "check:arc-proposal-drain",
  "check:verification-decay",
  "check:coverage",
  "check:surface-coverage",
  "check:graduation-worklist",
  "check:node-version",
  "check:dist-drift",
  "check:deploy-health",
]);

/** The index of the plan's FIRST minutes-cost leg, or -1 when it runs none. */
export function firstExpensiveIndex(steps: readonly GateStep[]): number {
  return steps.findIndex((s) => EXPENSIVE_STEPS.some((leg) => s.command.includes(leg)));
}

/** The index of the plan's LAST minutes-cost leg, or -1 when it runs none. */
export function lastExpensiveIndex(steps: readonly GateStep[]): number {
  let at = -1;
  steps.forEach((s, i) => {
    if (EXPENSIVE_STEPS.some((leg) => s.command.includes(leg))) at = i;
  });
  return at;
}

export interface GateOrderVerdict {
  readonly verdict: "ok" | "fail";
  readonly message: string;
  /** {@link PRE_EXPENSIVE_CHECKS} members that run AFTER the first expensive leg. */
  readonly misordered: readonly string[];
  /** {@link SHARED_ENVIRONMENT_CHECKS} members that run BEFORE the last expensive leg. */
  readonly premature: readonly string[];
  /** Declared members (either set) the plan does not run at all. */
  readonly missing: readonly string[];
}

/**
 * Judge one gate plan against both ordering axes.
 *
 * FAIL-CLOSED on the ways this could report a clean sweep over a plan it never understood: a plan
 * with NO expensive leg (the classifier failed to recognise `pnpm -r typecheck` / `pnpm -r test`, so
 * "nothing is on the wrong side of them" is vacuous) and a declared check the plan does not run at
 * all (dropped or renamed — a check that vanished is not a check that passed).
 */
export function evaluateGateOrder(input: {
  steps: readonly GateStep[];
  earlyChecks: ReadonlySet<string>;
  lateChecks?: ReadonlySet<string>;
}): GateOrderVerdict {
  const { steps, earlyChecks } = input;
  const lateChecks = input.lateChecks ?? new Set<string>();
  const firstWall = firstExpensiveIndex(steps);
  const lastWall = lastExpensiveIndex(steps);
  if (firstWall === -1) {
    return {
      verdict: "fail",
      message:
        "the gate plan runs none of " +
        `${EXPENSIVE_STEPS.map((s) => `\`${s}\``).join(" / ")} — the ordering invariant cannot be ` +
        "judged against a plan whose expensive legs were not recognised (renamed? re-shaped?).",
      misordered: [],
      premature: [],
      missing: [],
    };
  }

  const positions = new Map<string, number>();
  steps.forEach((step, i) => {
    if (step.check !== undefined && !positions.has(step.check)) positions.set(step.check, i);
  });

  const declared = [...earlyChecks, ...lateChecks];
  const missing = declared.filter((name) => !positions.has(name));
  const misordered = [...earlyChecks].filter((name) => {
    const at = positions.get(name);
    return at !== undefined && at > firstWall;
  });
  const premature = [...lateChecks].filter((name) => {
    const at = positions.get(name);
    return at !== undefined && at < lastWall;
  });

  if (missing.length === 0 && misordered.length === 0 && premature.length === 0) {
    return {
      verdict: "ok",
      message:
        `${earlyChecks.size} cheap-first check(s) run before \`${steps[firstWall]?.command}\`, and ` +
        `${lateChecks.size} shared-environment check(s) run after \`${steps[lastWall]?.command}\`.`,
      misordered: [],
      premature: [],
      missing: [],
    };
  }

  const lines: string[] = [];
  if (misordered.length > 0) {
    lines.push(
      `${misordered.length} seconds-cost check(s) run AFTER \`${steps[firstWall]?.command}\`: ` +
        `${misordered.join(", ")}.`,
      "A session waits the whole ~8-10 minute run to read a verdict that was available in seconds.",
      "Move them ahead of the expensive legs in GATE_PLAN (packages/cli/src/gate-order.ts).",
    );
  }
  if (premature.length > 0) {
    lines.push(
      `${premature.length} shared-environment check(s) run BEFORE \`${steps[lastWall]?.command}\`: ` +
        `${premature.join(", ")}.`,
      "A red there may be a sibling session's, and it must not precede the session's own answer.",
      "Move them after the expensive legs in GATE_PLAN (packages/cli/src/gate-order.ts).",
    );
  }
  if (missing.length > 0) {
    lines.push(
      `${missing.length} declared check(s) are not in the plan at all: ${missing.join(", ")}. ` +
        "Re-add them, or drop them from PRE_EXPENSIVE_CHECKS / SHARED_ENVIRONMENT_CHECKS deliberately.",
    );
  }
  return { verdict: "fail", message: lines.join("\n"), misordered, premature, missing };
}
