// The gate's cheap-first ordering invariant — the PURE half (`green-gate`, stories/ci-cd).
//
// The root `gate` script is one `&&` chain. Two of its steps are the MINUTES — `pnpm -r typecheck`
// and `pnpm -r test`, together ~8–10 minutes on a dev box — while every `check:*` step is SECONDS
// (measured 2026-07-28: 2–19 s each, the slowest being the ones that open a Cloud SQL connection).
// A seconds-cost check placed AFTER the minutes is only ever read once the whole suite has run, so
// a session pays the full chain to learn something that was knowable at second 40.
//
// That is not hypothetical. `check:declared` — the claim rung (ADR-0200 D3), which refuses a session
// holding no live claim — sat LAST. Concurrency is precisely what makes a claim go absent underneath
// a session, so the rung fires often, and it fired at the merge ceremony where a wasted gate run
// costs the most. Filed four separate times in five days, twice reinforced by a second session
// (`check-declared-fails-last-after-a-full-gate`, `claim-absence-surfaces-only-after-the-gates-
// expensive-legs`, `session-claim-silently-cleared-mid-session-fails-the-gate-late`,
// `gate-runs-check-declared-last`).
//
// `stories/ci-cd/green-gate.md` already declares the intent — "Ordering is cheap-first by intent
// (manifest/sync are seconds; build is last)" — for CI's `verify` job. This module makes the same
// intent CHECKABLE for the local `pnpm gate`, whose chain had drifted from it.
//
// Deliberately NOT a `check:gate-order` gate rung: the invariant is about the shape of the gate
// chain, so a rung inside that chain would be a step checking the list it is a member of. The
// honest home is a test in `pnpm -r test` (`gate-order.test.ts`), which holds the REAL root
// `package.json` to {@link PRE_EXPENSIVE_CHECKS} and costs nothing.
//
// Pure: no I/O. The caller reads the script text; this parses and judges it.

/**
 * The chain's minutes-cost legs — the wall a cheap check must not end up behind. Matched as
 * SUBSTRINGS of a step, so the affected-scope form CI uses (`pnpm ${args} typecheck`) is not
 * relevant here: the local chain is literal.
 */
export const EXPENSIVE_STEPS: readonly string[] = ["pnpm -r typecheck", "pnpm -r test"];

/**
 * The `check:*` steps that MUST run before {@link EXPENSIVE_STEPS}.
 *
 * Membership means both things at once: the check costs SECONDS, and its answer does not depend on
 * the code compiling or the tests passing — so nothing is learned by making it wait. Order WITHIN
 * the cheap block is free; this set only pins that none of them regresses behind the minutes.
 *
 * Adding or removing a name is a deliberate edit, not a formality — dropping one here is how a
 * check silently slides back behind the expensive legs, which is the exact regression this exists
 * to catch. Checks absent from this set are unconstrained: a new rung may land anywhere.
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
  // The claim rung (ADR-0200 D3). Its SKIP/FAIL semantics are unchanged by its position — including
  // the ADR-0245 D5.2 lobby arm that FAILs a dirty primary checkout — it just answers sooner.
  "check:declared",
]);

/** One `&&`-separated step of the chain, in order, with the `check:*` name it runs (if any). */
export interface GateStep {
  /** The step's command text, trimmed (e.g. `pnpm check:declared`). */
  readonly command: string;
  /** Its `check:*` script name, or `undefined` for a step that runs no check (typecheck/test). */
  readonly check: string | undefined;
}

const CHECK_NAME = /\bpnpm\s+(check:[\w-]+)/;

/**
 * Split a `gate` script into its ordered steps. `&&` is the only separator the chain uses, and a
 * step's `check:*` name is extracted so callers never re-parse the command text.
 */
export function parseGateChain(script: string): GateStep[] {
  return script
    .split("&&")
    .map((raw) => raw.trim())
    .filter((command) => command !== "")
    .map((command) => {
      const name = CHECK_NAME.exec(command)?.[1];
      return { command, ...(name !== undefined ? { check: name } : { check: undefined }) };
    });
}

/** The index of the chain's FIRST minutes-cost leg, or -1 when it runs none. */
export function firstExpensiveIndex(steps: readonly GateStep[]): number {
  return steps.findIndex((s) => EXPENSIVE_STEPS.some((leg) => s.command.includes(leg)));
}

export interface GateOrderVerdict {
  readonly verdict: "ok" | "fail";
  readonly message: string;
  /** The {@link PRE_EXPENSIVE_CHECKS} members that run AFTER the first expensive leg. */
  readonly misordered: readonly string[];
  /** The {@link PRE_EXPENSIVE_CHECKS} members the chain does not run at all. */
  readonly missing: readonly string[];
}

/**
 * Judge one gate chain against the cheap-first invariant.
 *
 * FAIL-CLOSED on the two ways this could report a clean sweep over a chain it never understood: a
 * chain with NO expensive leg (the classifier failed to recognise `pnpm -r typecheck` / `pnpm -r
 * test`, so "nothing is behind them" is vacuous) and a declared early check the chain does not run
 * (dropped or renamed — a check that vanished is not a check that passed).
 */
export function evaluateGateOrder(input: {
  steps: readonly GateStep[];
  earlyChecks: ReadonlySet<string>;
}): GateOrderVerdict {
  const { steps, earlyChecks } = input;
  const wall = firstExpensiveIndex(steps);
  if (wall === -1) {
    return {
      verdict: "fail",
      message:
        "the gate chain runs none of " +
        `${EXPENSIVE_STEPS.map((s) => `\`${s}\``).join(" / ")} — the cheap-first invariant cannot ` +
        "be judged against a chain whose expensive legs were not recognised (renamed? re-shaped?).",
      misordered: [],
      missing: [],
    };
  }

  const positions = new Map<string, number>();
  steps.forEach((step, i) => {
    if (step.check !== undefined && !positions.has(step.check)) positions.set(step.check, i);
  });

  const missing = [...earlyChecks].filter((name) => !positions.has(name));
  const misordered = [...earlyChecks].filter((name) => {
    const at = positions.get(name);
    return at !== undefined && at > wall;
  });

  if (missing.length === 0 && misordered.length === 0) {
    return {
      verdict: "ok",
      message: `all ${earlyChecks.size} cheap-first check(s) run before \`${steps[wall]?.command}\`.`,
      misordered: [],
      missing: [],
    };
  }

  const lines: string[] = [];
  if (misordered.length > 0) {
    lines.push(
      `${misordered.length} seconds-cost check(s) run AFTER \`${steps[wall]?.command}\`: ` +
        `${misordered.join(", ")}.`,
      "A session pays the whole ~8–10 minute chain to read a verdict that was available in seconds.",
      "Move them ahead of the expensive legs in the root package.json `gate` script.",
    );
  }
  if (missing.length > 0) {
    lines.push(
      `${missing.length} declared cheap-first check(s) are not in the chain at all: ` +
        `${missing.join(", ")}. Re-add them, or drop them from PRE_EXPENSIVE_CHECKS deliberately.`,
    );
  }
  return { verdict: "fail", message: lines.join("\n"), misordered, missing };
}
