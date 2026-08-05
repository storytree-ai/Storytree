/**
 * The ADR-0020 red-green phase machine: the spine-owned honesty floor.
 *
 * ADR-0011 collapses the per-node runtime to ONE owned loop, which removes V1's process-isolation
 * walls (separate crates authored the test, the code, and signed the verdict). This module
 * re-establishes that honesty property in the deterministic spine (ADR-0005): a unit advances
 * through ordered phases the spine OWNS, the model never decides it is done, write access is
 * scoped per phase, and red/green is OBSERVED by the spine (never claimed by the model).
 *
 * SKELETON: the transition logic, the write-scope predicate, and the types are fully implemented
 * and tested here. The LIVE test-executor / tool-write enforcement (wiring a real test runner and
 * gating the owned loop's write tool per phase) is left as a documented interface seam — see
 * {@link TestExecutor} and {@link WriteScope}, and the 'deferred' note in the build status.
 */

/**
 * The ordered phases (ADR-0020 §1). The spine advances a unit
 * `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE` and owns every transition.
 */
export type Phase =
  | "AUTHOR_TEST"
  | "CONFIRM_RED"
  | "IMPLEMENT"
  | "CONFIRM_GREEN"
  | "GATE";

/**
 * A test observation the spine made via its {@link TestExecutor} (ADR-0020 §3). The model never
 * produces this — the spine OBSERVES red/green itself. `kind` distinguishes a compile-red
 * (missing symbol) from a runtime-red (assertion/panic) for "right-kind red" checks.
 */
export type TestObservation = {
  result: "red" | "green";
  kind?: "compile" | "runtime";
  testId: string;
  /**
   * ADR-0211 (optional): a forensic reason attached when the observation was DOWNGRADED — an exit-0
   * green the spine refused because the assert-oracle accounting showed the proof did not actually
   * exercise the oracle (neutralised or truncated). Carried through so the gate's fail-closed reason
   * says WHY the green was refused, not just "not green".
   */
  note?: string;
  /**
   * HOW `kind` was determined (`gate-the-right-kind-red`), so a refusal can say what it stands on and
   * — load-bearing — so {@link nextPhase} can decline to refuse on a guess:
   *  - `"oracle-count"` — MEASURED. The assert-oracle report says how many assertions really ran, so
   *    0 means the run never reached an assertion (structural) and >=1 means one ran and failed
   *    (assertion). Available only for oracle-accounted proof commands (the default node:test one).
   *  - `"output-text"` — INFERRED from stdout/stderr by {@link defaultClassifyKind}'s heuristic.
   *
   * A gate that refused a wrong-kind red on a text guess would false-refuse real work whenever the
   * heuristic misfired, so the kind gate is armed only for `"oracle-count"`. Absent = the classifier
   * offered no kind at all.
   */
  kindBasis?: RedKindBasis;
};

/** The result of {@link nextPhase}: an allowed transition, or a fail-closed refusal with a reason. */
export type PhaseTransition =
  | { ok: true; next: Phase }
  | { ok: false; reason: string };

/**
 * What a node DECLARES its CONFIRM_RED red should BE
 * (`parallel-red-green-arc` / `gate-the-right-kind-red`).
 *
 * ADR-0020 §3 called for a "right-kind red" check and the machinery for one existed —
 * {@link TestObservation.kind} was computed on every red — but {@link nextPhase} gated on
 * `obs.result === "red"` and nothing else, and the kind was read in exactly ONE place in the whole
 * spine: the evidence note the verdict carries. Derived, published, and never allowed to refuse
 * anything. So ANY red advanced the phase: a syntax error in the freshly authored test, an unrelated
 * pre-existing failure inside the same command's scope, a timeout SIGKILL. The gate never
 * established that the red it saw was the red the new assertion was supposed to produce — the
 * difference between "a command exited non-zero" and "the test I just wrote fails for the reason I
 * wrote it", and only the second is evidence of TDD.
 *
 * The expectation is DECLARED per node rather than guessed, because the two shapes want opposite
 * reds and a single rule would false-refuse one of them:
 *  - `"structural"` — the red is a missing symbol / unresolved module. The NET-NEW default (the test
 *    imports something that does not exist yet), and also ADR-0098's R2 `refactorForTests`, which
 *    REQUIRES a structural red because the seam under test has not been introduced yet.
 *  - `"assertion"` — the red is a real assertion failing against current behaviour. ADR-0057 C's
 *    `editsExisting`, whose brief explicitly demands "a runtime assertion, not a missing symbol".
 */
export type ExpectedRed = "structural" | "assertion";

/** How a {@link TestObservation}'s `kind` was arrived at — see {@link RedKindBasis}. */
export type RedKindBasis = "oracle-count" | "output-text";

/**
 * The spine-owned OBSERVATION gates (ADR-0020 §1, §3), FAIL-CLOSED.
 *
 * This is a total function over the legal *observation* gates only — the transitions that depend
 * on an OBSERVED red/green. The two authoring-complete advances (`AUTHOR_TEST → CONFIRM_RED` and
 * `IMPLEMENT → CONFIRM_GREEN`) are NOT observation gates: they are driven by a separate
 * authoring-complete signal, so `nextPhase` does not govern them and rejects them here as not an
 * observation gate. Use {@link advancePhase} for those.
 *
 * Governed gates:
 *  - `CONFIRM_RED → IMPLEMENT` requires `obs.result === 'red'` (the RIGHT red — a real failing
 *    test, never a forged green) AND, when the node declares an {@link ExpectedRed} and the observed
 *    kind was MEASURED, that the red is of the declared kind.
 *  - `CONFIRM_GREEN → GATE` requires `obs.result === 'green'`.
 *
 * Any other transition — illegal, out-of-order, or forged (claiming a result the gate forbids) —
 * returns `{ ok:false }`. The verdict is never authorable; an agent cannot drive an illegal gate.
 *
 * @param expectedRed OPTIONAL declared kind for the CONFIRM_RED gate. Absent ⇒ the pre-existing
 *   behaviour (any red advances) — which is what every walk with nothing to declare still rides:
 *   the dry-run and live-smoke arms prove a SYNTHETIC pair, so they have no node-declared shape to
 *   check against and must not be judged against a guess.
 */
export function nextPhase(
  current: Phase,
  obs: TestObservation,
  expectedRed?: ExpectedRed,
): PhaseTransition {
  switch (current) {
    case "CONFIRM_RED": {
      // The red must be a REAL red for the new test. A green here is a forged/early pass.
      if (obs.result !== "red") {
        return {
          ok: false,
          reason: `CONFIRM_RED requires an observed red (got '${obs.result}' for test ${obs.testId}); the red must be observed before any implementation`,
        };
      }
      // ...and it must be the red the node DECLARED. Armed only on a MEASURED kind: refusing real
      // work on a text-heuristic guess would trade a silent wrong advance for a loud wrong refusal,
      // which is not an improvement. An unmeasured kind advances exactly as before.
      const wrongKind = wrongKindRefusal(obs, expectedRed);
      return wrongKind ?? { ok: true, next: "IMPLEMENT" };
    }

    case "CONFIRM_GREEN":
      if (obs.result === "green") {
        return { ok: true, next: "GATE" };
      }
      return {
        ok: false,
        reason: `CONFIRM_GREEN requires an observed green (got '${obs.result}' for test ${obs.testId})`,
      };

    case "AUTHOR_TEST":
      return {
        ok: false,
        reason: "AUTHOR_TEST advances on an authoring-complete signal, not an observation gate; use advancePhase",
      };

    case "IMPLEMENT":
      return {
        ok: false,
        reason: "IMPLEMENT advances on an authoring-complete signal, not an observation gate; use advancePhase",
      };

    case "GATE":
      return {
        ok: false,
        reason: "GATE is terminal; there is no further observation gate",
      };

    default: {
      // Exhaustiveness: every Phase is handled above.
      const _exhaustive: never = current;
      return { ok: false, reason: `unknown phase: ${String(_exhaustive)}` };
    }
  }
}

/** The observed kind a declared {@link ExpectedRed} demands. */
const KIND_FOR_EXPECTED: Record<ExpectedRed, "compile" | "runtime"> = {
  structural: "compile",
  assertion: "runtime",
};

/**
 * The CONFIRM_RED kind check: a fail-closed refusal when the MEASURED red contradicts what the node
 * declared, or `null` when there is nothing to refuse on.
 *
 * Returns `null` — i.e. advances — in three cases, each deliberate:
 *  - the node declared no expectation (dry-run / live-smoke, and every pre-existing caller);
 *  - the classifier offered no kind at all;
 *  - the kind was inferred from OUTPUT TEXT rather than measured. The heuristic is not good enough to
 *    refuse real work on: `defaultClassifyKind` silently mis-read Node's own `Cannot find module`
 *    for as long as nothing consumed its answer, so arming the gate on it would convert a quiet
 *    wrong advance into a loud wrong refusal.
 */
function wrongKindRefusal(
  obs: TestObservation,
  expectedRed: ExpectedRed | undefined,
): { ok: false; reason: string } | null {
  if (expectedRed === undefined) return null;
  if (obs.kind === undefined) return null;
  if (obs.kindBasis !== "oracle-count") return null;
  const wanted = KIND_FOR_EXPECTED[expectedRed];
  if (obs.kind === wanted) return null;
  return {
    ok: false,
    reason:
      `CONFIRM_RED observed a ${obs.kind} red for test ${obs.testId}, but this node declares a ` +
      `${expectedRed} red (${wanted}) — the red is real, and it is the WRONG red, so it is not ` +
      `evidence that the test just authored fails for the reason it was written. ` +
      (expectedRed === "assertion"
        ? "This node edits source that already exists (ADR-0057 C), so its new test must FAIL AN " +
          "ASSERTION against current behaviour; a structural red means the test could not even " +
          "resolve what it imports, which a passing implementation would silence without ever " +
          "proving the behaviour changed."
        : "This node authors a net-new seam (or refactors for testability, ADR-0098 R2), so its red " +
          "must be the MISSING symbol; an assertion red means something else in scope is already " +
          "failing, and implementing against it would prove nothing about the new seam.") +
      ` (kind measured from the assert-oracle count, not inferred from output text.)`,
  };
}

/**
 * The two non-observation (authoring-complete) advances (ADR-0020 §1): `AUTHOR_TEST → CONFIRM_RED`
 * and `IMPLEMENT → CONFIRM_GREEN`. The spine fires these when the leaf signals it has finished
 * authoring in the current phase — they carry no obs-gate. Every other source phase is rejected
 * fail-closed (those are observation gates governed by {@link nextPhase}, or terminal).
 */
export function advancePhase(current: Phase): PhaseTransition {
  switch (current) {
    case "AUTHOR_TEST":
      return { ok: true, next: "CONFIRM_RED" };
    case "IMPLEMENT":
      return { ok: true, next: "CONFIRM_GREEN" };
    default:
      return {
        ok: false,
        reason: `${current} does not advance on an authoring-complete signal; it is an observation gate (use nextPhase) or terminal`,
      };
  }
}

/**
 * Per-phase write-ownership (ADR-0020 §2, ADR-0009). The spine asks `isWriteAllowed` before
 * letting the owned loop's write tool touch a path. This re-creates V1's process-isolation walls
 * as ONE agent's time-sliced write-ownership: the author of the test is not, at that moment, the
 * author of the code.
 *
 * The live wiring of this predicate into the owned loop's write tool is the deferred enforcement
 * seam (see the build status 'deferred').
 */
export interface WriteScope {
  isWriteAllowed(phase: Phase, path: string): boolean;
}

/** The glob sets for {@link PathWriteScope}. */
export interface PathWriteScopeConfig {
  testGlobs: string[];
  sourceGlobs: string[];
}

/**
 * The default {@link WriteScope} (ADR-0020 §2): writes to TEST paths are allowed ONLY in
 * `AUTHOR_TEST`; writes to SOURCE paths are allowed ONLY in `IMPLEMENT`; every other combination
 * is denied (fail-closed). `CONFIRM_RED`, `CONFIRM_GREEN`, and `GATE` are read/observe-only — no
 * writes at all.
 *
 * Matching is a tiny suffix/segment match (no glob dependency): a `*` is a wildcard within a path
 * SEGMENT, and a leading `**` matches any number of leading segments. A path that matches BOTH a
 * test and a source glob is treated as a test path (the stricter, author-test-only owner).
 */
export class PathWriteScope implements WriteScope {
  private readonly testGlobs: string[];
  private readonly sourceGlobs: string[];

  constructor(config: PathWriteScopeConfig) {
    this.testGlobs = config.testGlobs;
    this.sourceGlobs = config.sourceGlobs;
  }

  isWriteAllowed(phase: Phase, path: string): boolean {
    const isTest = this.testGlobs.some((g) => globMatch(g, path));
    const isSource = this.sourceGlobs.some((g) => globMatch(g, path));

    if (phase === "AUTHOR_TEST") {
      // Test paths only. A test path that is also "source"-shaped stays test-owned here.
      return isTest;
    }
    if (phase === "IMPLEMENT") {
      // Source paths only, and NEVER a test path (the test author is not the code author).
      return isSource && !isTest;
    }
    // CONFIRM_RED / CONFIRM_GREEN / GATE: observe-only, no writes.
    return false;
  }
}

/**
 * A tiny glob matcher (no dependency, ADR-0020 §2 "tiny glob match"). Supports:
 *  - `**` matching any number of path segments (including zero),
 *  - `*` matching any run of non-`/` characters within a single segment,
 *  - literal characters otherwise.
 *
 * Paths are normalised to forward slashes before matching so Windows `\` separators match too.
 */
export function globMatch(glob: string, path: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  const regex = globToRegExp(glob.replace(/\\/g, "/"));
  return regex.test(normalizedPath);
}

/** Compile a tiny glob into an anchored RegExp. */
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**` (optionally followed by `/`): match any number of leading/middle segments.
        i += 1;
        if (glob[i + 1] === "/") {
          i += 1;
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        // Single `*`: any run of non-separator characters within a segment.
        re += "[^/]*";
      }
    } else if (c !== undefined && /[.+?^${}()|[\]\\]/.test(c)) {
      re += `\\${c}`;
    } else if (c !== undefined) {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * The seam the spine uses to OBSERVE red/green itself (ADR-0020 §3): the model never reports the
 * verdict. The live implementation runs a real test runner and classifies the right-kind red; that
 * wiring is deferred. {@link RecordingTestExecutor} is the offline test double.
 */
export interface TestExecutor {
  run(testId: string): Promise<TestObservation>;
}

/**
 * A test double for {@link TestExecutor}: replays a scripted queue of {@link TestObservation}s and
 * records every `testId` it was asked to run (so a test can assert the spine observed the red/green
 * itself rather than trusting a model claim). Mirrors the V1 `RecordingExecutor` reference in
 * ADR-0020's "What this does NOT decide".
 */
export class RecordingTestExecutor implements TestExecutor {
  private readonly script: TestObservation[];
  private cursor = 0;
  readonly observed: string[] = [];

  /**
   * @param script the observations to hand back, in order. When exhausted, {@link run} rejects —
   *   an over-run is a programming error in the spine driving it, not a silent green.
   */
  constructor(script: TestObservation[]) {
    this.script = script;
  }

  async run(testId: string): Promise<TestObservation> {
    this.observed.push(testId);
    const obs = this.script[this.cursor];
    this.cursor += 1;
    if (obs === undefined) {
      throw new Error(
        `RecordingTestExecutor exhausted: no scripted observation for run #${this.cursor} (testId=${testId})`,
      );
    }
    return obs;
  }
}
