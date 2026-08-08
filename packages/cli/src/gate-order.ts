// The gate's ORDERING invariant — the PURE half (`green-gate`, stories/ci-cd).
//
// This module owns the canonical, ordered {@link GATE_PLAN} walked by `pnpm gate`. The runner runs
// every step and reports every verdict: one red never turns later proof into an invisible skip.
//
// THE PLAN IS DECLARED LITERAL, AND THE RUNNER MAY NARROW IT (ADR-0304 D1). {@link GATE_PLAN} always
// names the full `pnpm -r typecheck` / `pnpm -r test`; `gate-run.ts` rewrites those two commands to
// the affected scope (`pnpm --filter ...<name> …`) just before running them, using CI's own
// classifier. This module therefore recognises BOTH forms ({@link isExpensiveStep}) — the ordering
// invariant below has to be judgeable over the plan that actually runs, not only over the one on the
// page. Scoping changes how much each leg covers; it changes nothing about order or whether a red
// blocks.
//
// TWO AXES, both fail-closed, both about WHEN a verdict arrives rather than about what it says.
//
// AXIS 1 — CHEAP FIRST. The four retained branch-local `check:*` steps precede the two independent
// minutes-cost legs, `pnpm -r typecheck` and `pnpm -r test`.
//
// AXIS 2 — THE SESSION'S OWN WORK BEFORE THE SHARED ENVIRONMENT (parked entry
// `gate-runs-every-step-and-reports-per-step` on `verification-integrity-arc`, from friction
// `gate-aborts-early-hiding-thirteen-later-steps`). The retained projection checks read the live
// Library, and `check:verification-decay` can red on shared proof state, so all three run AFTER both
// expensive legs.
//
// Deliberately NOT a `check:gate-order` gate rung: the invariant is about the shape of the gate plan,
// so a rung inside that plan would be a step checking the list it is a member of. The honest home is
// a test in `pnpm -r test` (`gate-order.test.ts`), which holds the plan to the sets below AND to the
// real root `package.json` — every planned step must name a script that exists, and every retained
// `check:*` script must be in the plan or carry an explicit non-gate reason.
//
// Pure: no I/O. The caller supplies the plan and the root package.json's script names.

/**
 * The chain's minutes-cost legs, in the form {@link GATE_PLAN} DECLARES them. The plan is literal —
 * it always names the full `-r` run — so this is what a reader of the plan sees and what
 * `gate-order.test.ts` holds the plan to.
 */
export const EXPENSIVE_STEPS: readonly string[] = [
  "pnpm -r --no-bail typecheck",
  "pnpm -r --no-bail test",
];

/*
 * WHY `--no-bail` IS PART OF THE DECLARED LEG (ADR-0276 increment 4, the last of its three elements).
 *
 * Without it `pnpm -r` halts at the FIRST failing workspace, so one package's red hides every later
 * package's verdict INSIDE this one step. That is the inner half of the 2026-07-29 evidence recorded
 * in `gate-runner.ts`: an `apps/studio` `waitFor` flake aborted `pnpm -r test`, `packages/cli` never
 * ran, and it held a REAL break the session then pushed. The runner's per-step scoreboard fixed the
 * OUTER half — a red no longer hides later STEPS — and this fixes the same defect one level down,
 * inside the step. Both halves are the same rule: a gate must report what it did not verify.
 *
 * IT CANNOT MAKE THE GATE GREENER. `--no-bail` changes only how far the leg gets before reporting;
 * pnpm still exits non-zero if any workspace failed, so every red that blocked before blocks now. The
 * trade is wall clock — a failing leg runs every workspace instead of stopping at the first — which
 * is the same trade the runner already made at step granularity and the reason `asset:merge-ceremony`
 * step 2 mandates `pnpm gate:bg`.
 */

/**
 * The same two legs in the AFFECTED-SCOPE form (ADR-0304 D1): `pnpm --filter ...<name> typecheck`.
 *
 * Recognising this form is load-bearing, not cosmetic. `gate-run.ts` rewrites the plan's `-r` to the
 * scope actually being tested before running it, and {@link evaluateGateOrder} FAILS CLOSED when it
 * cannot find an expensive leg — so a matcher that only knew the literal form would declare the plan
 * that actually runs unjudgeable. The runner re-evaluates the invariant over the SCOPED plan for
 * exactly that reason; this is what lets it.
 *
 * Anchored (`^`/`$`) so it cannot swallow a neighbour: `pnpm check:unit-test` ends in
 * `check:unit-test`, not `test`, and no `check:*` step begins with `-r`, `--filter` or `--no-bail`.
 *
 * The leading group is an ENUMERATION of the three token forms the gate actually emits — `-r`, one
 * `--filter ...<name>`, and `--no-bail` — rather than a permissive `.+?`. That is deliberate: a
 * wildcard here would classify any `pnpm <anything> test` as an expensive leg, and this predicate
 * decides where the ordering wall sits. Recognising a step the plan never emits is the failure that
 * would be silent.
 */
const SCOPED_EXPENSIVE_LEG =
  /^pnpm(?:\s+(?:-r|--no-bail|--filter\s+\S+))+\s+(?:typecheck|test)$/;

/**
 * Is this step one of the two minutes-cost legs — in either the declared `-r` form or the
 * affected-scoped `--filter` one? The single place the classification lives, so the ordering axes,
 * the plan rewrite and the cost assertion can never disagree about where the wall is.
 */
export function isExpensiveStep(command: string): boolean {
  const trimmed = command.trim();
  if (EXPENSIVE_STEPS.some((leg) => trimmed.includes(leg))) return true;
  return SCOPED_EXPENSIVE_LEG.test(trimmed);
}

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
  /** The step's command text, trimmed (e.g. `pnpm check:boundaries`). */
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
 * and `gate-order.test.ts` refuses a `check:*` script absent here unless it has an explicit
 * non-gate reason.
 */
/*
 * SURVIVAL AUDIT (bounded, authoritative; gate-machinery-audit-arc).
 * Each retained standalone rung has demonstrated a concrete catch and names the escape it blocks:
 * - check:boundaries — FACTORY BOOKKEEPING. Commit 8b588085 caught a real dependency cycle, and
 *   04939391 / PR425 caught undeclared imports; without it invisible cycles and cross-story
 *   coupling ship.
 * - check:mirror-conformance — PROOF INTEGRITY. Commit 3ef84c96 records a historical studio-only
 *   docs change producing 256+4 divergences; without it desktop and studio behavior diverge.
 * - check:guidance — FACTORY BOOKKEEPING. A clean worktree on 2026-08-05 caught stale
 *   definitions.generated.json after the live source moved; without it root operating guidance and
 *   definitions ship stale.
 * - check:agents — FACTORY BOOKKEEPING. Commit 66b70db3 / PR232 caught stale corpus-investigator
 *   and librarian projections; without it harness agents run stale instructions.
 * - check:web-grounding — FACTORY BOOKKEEPING. Commit ae90d950 records escaped stale doctrine after
 *   ADR-0040; without it public copy cites missing or superseded decisions.
 * - check:web-engine — FACTORY BOOKKEEPING. Commit 59b6504d / PR650 caught parent/web gitlink drift;
 *   without it the public site runs a stale forest engine.
 * - pnpm -r typecheck — PROOF INTEGRITY. CI run 27761462602, fix 34f320dc, PR224 caught a moved,
 *   nonexistent export after other gates and build were green; without it a stale loader ships.
 * - pnpm -r test — PROOF INTEGRITY. CI run 30976384824, fix 327151fb, PR1151 caught
 *   credential-dependent suites after typecheck was green; without it behavior regressions ship.
 * - check:verification-decay — PROOF INTEGRITY. PR1119 on 2026-08-03 fired on
 *   unproven-seam-default; without it vacuous filters, skipped tests credited as proof, and
 *   fake-only defaults can ship.
 *
 * TOMBSTONE (bounded). The complete 16 original deletions — three by ADR-0302 and thirteen by this
 * audit — are DECLARED in {@link RETIRED_CHECKS} below rather than recited here, because twelve of
 * them left source behind and prose cannot be held to that source. No surviving rung was weakened
 * and no ceiling was raised.
 */
export const GATE_PLAN: readonly GatePlanStep[] = [
  // ── A. own-work, seconds ───────────────────────────────────────────────────
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
  // ── B. own-work, minutes ───────────────────────────────────────────────────
  {
    command: "pnpm -r --no-bail typecheck",
    check: undefined,
    subject: "own-work",
    cost: "minutes",
    why: "the session's own diff, and the first of the two answers a session actually came for",
  },
  {
    command: "pnpm -r --no-bail test",
    check: undefined,
    subject: "own-work",
    cost: "minutes",
    why: "the session's own diff; independent of typecheck because tests run transpile-only via tsx",
  },

  // ── C. shared environment ──────────────────────────────────────────────────
  {
    command: "pnpm check:guidance",
    check: "check:guidance",
    subject: "shared-environment",
    cost: "seconds",
    why: "the committed views are branch-local, but their live Library source can move under a sibling",
  },
  {
    command: "pnpm check:agents",
    check: "check:agents",
    subject: "shared-environment",
    cost: "seconds",
    why: "the harness projections are branch-local, but their live Library source is shared",
  },
  {
    command: "pnpm check:verification-decay",
    check: "check:verification-decay",
    subject: "shared-environment",
    cost: "seconds",
    why: "reds every session the moment any instrument breaches on main — the measured case behind the parked entry `verification-decay-charges-by-authorship`",
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
 * Gate steps that may legitimately verify NOTHING in some environment, and declare it by exiting
 * `GATE_SKIP_EXIT_CODE` (ADR-0276 increment 4). Keyed to the condition under which they opt out.
 *
 * THE ENTRY IS NOT DOCUMENTATION — `gate-order.test.ts` holds each one's ROOT SCRIPT to an invocation
 * form that actually preserves a child's exit code, and that fence exists because pnpm silently does
 * not. MEASURED 2026-08-08, all four combinations, with a positive control:
 *
 *     pnpm --filter <pkg> exec node -e "process.exit(3)"   → exit 1    ← COLLAPSES
 *     pnpm -C <dir>       exec node -e "process.exit(3)"   → exit 3
 *     pnpm --filter <pkg> run  <script>                    → exit 3, and 75 → 75
 *     pnpm -C <dir>       run  <script>                    → exit 75
 *
 * READ THE TABLE, NOT THE FIRST ROW. It is the RECURSIVE `exec` that collapses —
 * `--filter … exec` reports `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` and normalises any non-zero child
 * code to 1. `--filter … run` does NOT, which is why `pnpm db:up`'s documented exit-75 (`EX_TEMPFAIL`
 * = "started, still warming") protocol is intact and must not be "fixed": it goes through
 * `--filter … run`. A session that generalises this hazard to `--filter` would go looking for a bug
 * that is not there.
 *
 * Every other `check:*` script uses the collapsing form, and for them it is harmless — they only ever
 * mean pass or fail, and 1 is fail. For a skip-capable check it is silently destructive in the worst
 * direction: the declared SKIP would arrive at the runner as 1, i.e. as a FAILURE, redding the gate
 * on every local checkout without the `web/` submodule. The bug would look like a broken check rather
 * than a broken protocol.
 *
 * So a session normalising these scripts back to the house `--filter` form must fail a test rather
 * than discover this in a red gate. Adding a skip-capable check means adding it here.
 */
export const SKIP_CAPABLE_CHECKS: ReadonlyMap<string, string> = new Map([
  [
    "check:web-grounding",
    "the `web/` submodule is absent locally (it is cloned in CI, where an absent web/ is a hard failure instead)",
  ],
]);

/**
 * The token whose presence in a skip-capable check's root script means its exit code will NOT
 * survive — see {@link SKIP_CAPABLE_CHECKS}. Kept beside the set so the test and the reason cannot
 * drift apart.
 *
 * DELIBERATELY BROADER THAN THE MEASURED CAUSE, and only sound because of the domain it is applied
 * to. The collapse needs `--filter` AND `exec` together; `--filter … run` is safe. Matching on
 * `--filter` alone therefore over-matches in general — but every `check:*` script in this repo is an
 * `exec` form, so within {@link SKIP_CAPABLE_CHECKS} the two coincide, and the broader token is the
 * conservative fence. Narrowing it to `exec` would WEAKEN it. Do not lift this constant out of that
 * domain to reason about `run` scripts, where `--filter` is harmless.
 */
export const EXIT_CODE_COLLAPSING_INVOCATION = "--filter";

/** One retired rung: the decision that retired it, and the source it left behind. */
export interface RetiredCheck {
  /** The decision that retired it, e.g. `"ADR-0311 D2"`. */
  readonly retiredBy: string;
  /**
   * Surviving files under `packages/cli/src/`, ENTRYPOINT FIRST — empty when the check was deleted
   * outright. A file may appear under more than one check when they shared it.
   */
  readonly sources: readonly string[];
}

/**
 * THE TOMBSTONE, DECLARED — the 16 rungs the gate no longer runs, and the source each left behind.
 *
 * WHY THIS IS A LITERAL AND NOT A COMMENT. ADR-0311 kept the retired implementations on purpose
 * (D5: re-wiring stays cheap) and named the price in its own Consequences: it "leaves discoverable
 * code whose unwired status must not be mistaken for a forgotten gate rung." That price was left
 * unpaid. Twelve of the sixteen left source behind — 23 files that still compile, still carry
 * confident headers, and whose own unit tests still run GREEN under `pnpm -r test` while enforcing
 * NOTHING. A session grepping for the rule finds a complete, tested, plausible fence and concludes
 * it is enforced. That already happened one layer up: the `test-creation-principles` artifact
 * asserted the wall-clock rule was "enforced rather than merely advised" by `check:test-timing` a
 * full day after it was retired. This is the same defect the gate exists to refuse — believing
 * something is watching when nothing is.
 *
 * So the inventory is DATA, and `gate-order.test.ts` holds the repo to it three ways: no retired
 * name may reappear as a root script unnoticed, every file named here must carry the `UNWIRED`
 * banner, and every check-shaped source file must be either wired or listed here. A new orphan
 * cannot be introduced silently, and a re-wiring cannot leave a stale banner behind.
 *
 * A NAME HERE IS HISTORY, NOT POLICY. Re-adding any of these needs fresh production-catch evidence
 * and an ADR (D5) — never merely the wiring.
 */
export const RETIRED_CHECKS: ReadonlyMap<string, RetiredCheck> = new Map<string, RetiredCheck>([
  // ── retired by ADR-0302 D4: deleted outright, no source survives ────────────
  ["check:agents-sync", { retiredBy: "ADR-0302 D4", sources: [] }],
  ["check:corpus-sync", { retiredBy: "ADR-0302 D4", sources: [] }],
  ["check:corpus-content", { retiredBy: "ADR-0302 D4", sources: [] }],

  // ── retired by ADR-0311 D2 ─────────────────────────────────────────────────
  ["check:manifest", { retiredBy: "ADR-0311 D2", sources: [] }],
  ["check:process-graph", { retiredBy: "ADR-0311 D2", sources: ["check-process-graph.ts"] }],
  [
    "check:test-timing",
    {
      retiredBy: "ADR-0311 D2",
      sources: ["check-test-timing.ts", "test-timing-gate.ts", "test-timing-drain.ts"],
    },
  ],
  ["check:web-experience", { retiredBy: "ADR-0311 D2", sources: ["web-experience-check.ts"] }],
  ["check:declared", { retiredBy: "ADR-0311 D2", sources: ["check-declared.ts"] }],
  [
    "check:friction-drain",
    {
      retiredBy: "ADR-0311 D2",
      sources: ["check-friction-drain.ts", "friction-drain.ts", "db-required.ts"],
    },
  ],
  [
    "check:arc-proposal-drain",
    {
      retiredBy: "ADR-0311 D2",
      sources: ["check-arc-proposal-drain.ts", "arc-proposal-drain.ts", "db-required.ts"],
    },
  ],
  [
    "check:coverage",
    {
      retiredBy: "ADR-0311 D2",
      // NOT `coverage.ts` — that one stays LIVE behind the `storytree` coverage verb (`commands.ts`).
      sources: ["check-coverage.ts", "coverage-gate.ts", "coverage-drain.ts"],
    },
  ],
  [
    "check:surface-coverage",
    {
      retiredBy: "ADR-0311 D2",
      sources: [
        "check-surface-coverage.ts",
        "surface-coverage-gate.ts",
        "surface-coverage-drain.ts",
        "db-required.ts",
      ],
    },
  ],
  [
    "check:graduation-worklist",
    {
      retiredBy: "ADR-0311 D2",
      sources: ["check-graduation-worklist.ts", "graduation-drain.ts"],
    },
  ],
  ["check:node-version", { retiredBy: "ADR-0311 D2", sources: ["check-node-version.ts"] }],
  ["check:dist-drift", { retiredBy: "ADR-0311 D2", sources: ["check-dist-drift.ts"] }],
  [
    "check:deploy-health",
    { retiredBy: "ADR-0311 D2", sources: ["check-deploy-health.ts", "deploy-health.ts"] },
  ],
]);

/**
 * The banner every surviving retired source must carry, and the token the test greps for.
 *
 * Deliberately a bare ASCII word rather than a decorated string: it has to survive reformatting and
 * be greppable by a session that does not know this module exists.
 */
export const UNWIRED_MARKER = "UNWIRED";

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
  "check:boundaries",
  "check:mirror-conformance",
  "check:web-grounding",
  "check:web-engine",
]);

/**
 * The steps that MUST run AFTER {@link EXPENSIVE_STEPS} — axis 2. Each can red on state this session
 * did not author, so none of them may precede the session's own answer.
 */
export const SHARED_ENVIRONMENT_CHECKS: ReadonlySet<string> = new Set([
  "check:guidance",
  "check:agents",
  "check:verification-decay",
]);

/** The index of the plan's FIRST minutes-cost leg, or -1 when it runs none. */
export function firstExpensiveIndex(steps: readonly GateStep[]): number {
  return steps.findIndex((s) => isExpensiveStep(s.command));
}

/** The index of the plan's LAST minutes-cost leg, or -1 when it runs none. */
export function lastExpensiveIndex(steps: readonly GateStep[]): number {
  let at = -1;
  steps.forEach((s, i) => {
    if (isExpensiveStep(s.command)) at = i;
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
