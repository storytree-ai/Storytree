/**
 * `signMachineCriteria` — the CRITERION-SIGNING PRIMITIVE (ADR-0417 D2/D3).
 *
 * Observing an author-declared MACHINE UAT criterion and signing its verdict answers *"did this
 * declared acceptance check pass?"*. It does not answer *"do we choose to adopt this inherited
 * code?"* — so it is provenance-neutral: valid for greenfield, brownfield and already-proven
 * stories alike, carrying no status transition and no human approver (ADR-0417 D1, ADR-0408).
 *
 * It lived inline inside `runAdopt` until ADR-0417, which is why the only way to prove a machine
 * acceptance criterion was to invoke a command whose name says *adopt*. This module is that loop
 * extracted VERBATIM in behaviour, so both callers — `storytree uat run` (the UAT surface that owns
 * the question) and `storytree adopt` (which composes proof while entering the adoption process) —
 * run the SAME code. ADR-0417's own Cost paragraph names that as the fence: *"both commands must
 * call the same criterion-signing core so their honesty fences cannot drift."* There is deliberately
 * no second implementation to keep in step.
 *
 * EVERY FENCE THE ADOPT LOOP HELD IS HELD HERE, and none of them is new:
 *  - **the exact binding, with no fallback** — a leg resolves ONLY through its own
 *    `(proof-gate:)` via {@link resolveWitness}; there is no sole-observe-gate convenience and no
 *    independently re-derived command (ADR-0106);
 *  - **no partial verdict set** — every real machine leg is resolved BEFORE any is signed, and one
 *    unbound or invalid leg refuses the WHOLE story pass, even for a sibling that would resolve fine
 *    on its own (the `adopt-signs-leg-against-bound-command` contract, ADR-0405 D3);
 *  - **no approver** — the call carries the criterion binding, which is what structurally selects
 *    {@link ObserveMachineLegSpec} inside {@link observeAndSign}; `approverInputs` is typed `never`
 *    there, so this path cannot consult the signer chain even by mistake (ADR-0408 D4);
 *  - **out-of-band observation at a clean committed HEAD, signed by the spine** — all inherited from
 *    {@link observeAndSign}, which also refuses a non-`observe` gate, a gate with no command, a
 *    non-zero exit and a dirty tree;
 *  - **aspirational legs are skipped** — a `wouldBe` leg is not an obligation (ADR-0097), mirroring
 *    the crown roll-up's own `!wouldBe` filter.
 *
 * ONE OBSERVATION PER DISTINCT COMMAND, held HERE rather than by each caller ({@link memoizeObserve}).
 * A story's machine legs routinely all bind the SAME covering observe gate, so an unmemoized runner
 * pays that suite once per LEG: signing `studio` (13 legs, one gate, a ~5.3-minute Playwright suite)
 * cost ~80 minutes of serial browser time instead of ~6. `runAdopt` had wrapped its own runner since
 * the loop lived inline there, but `storytree uat run` — which ADR-0417 D2 made the LIVE route for
 * machine legs — passed its runner through raw, so the surface that inherited the loop did not
 * inherit the fix. Wrapping inside the shared primitive is what makes that class of drift
 * unreachable: neither caller can forget what it does not do. Sound for exactly adopt's reason —
 * every verdict in one pass pins ONE clean committed HEAD, so the command is deterministic across it.
 *
 * Pure-by-injection: the store, the git state, the observation and the clock are all seams, so the
 * whole compute is offline-testable with no subprocess, no repo and no DB.
 */

import type { ReliabilityGate, UatTestCriterion } from "@storytree/library";
import { resolveWitness } from "@storytree/library";

import { observeAndSign, type AdoptedVerdictStore, type ObserveGitState, type ObserveOutcome } from "./observe-and-sign.js";

/**
 * Wrap an `observe` runner so each DISTINCT command runs at most ONCE (the promise is cached, so
 * concurrent callers share the in-flight run rather than racing a second one).
 *
 * {@link signMachineCriteria} applies this to its own runner, so every caller gets it for free.
 * `runAdopt` ALSO wraps at its level, deliberately: adopt observes the story's reliability GATES
 * before the leg pass, and those are the very commands the legs bind to — one shared cache across
 * both loops is what makes a gate and every leg it covers cost a single observation. Wrapping an
 * already-wrapped runner is harmless (the outer cache answers first).
 */
export function memoizeObserve(
  observe: (command: string) => Promise<ObserveOutcome>,
): (command: string) => Promise<ObserveOutcome> {
  const cache = new Map<string, Promise<ObserveOutcome>>();
  return (command) => {
    const hit = cache.get(command);
    if (hit !== undefined) return hit;
    const pending = observe(command);
    cache.set(command, pending);
    return pending;
  };
}

/** What proving ONE leg resolved to, before anything is observed or signed. */
export type MachineLegOutcome =
  | { kind: "human" }
  | { kind: "observe"; observedBy: string; proofCommand: string }
  | { kind: "refused"; reason: string };

/** One leg paired with what it resolved to. */
export interface MachineLegResolution {
  leg: UatTestCriterion;
  outcome: MachineLegOutcome;
}

/**
 * PURE: resolve ONE leg against the story's declared gates.
 *
 * A non-`machine` leg is `human` — it awaits an operator attestation (ADR-0082) and is never signed
 * here. A `machine` leg resolves through {@link resolveWitness} and ONLY through its own
 * `(proof-gate:)` binding; anything else is `refused` with the reason the reader needs, which is the
 * covering gate's own missing command when that is what went wrong rather than a generic miss.
 */
export function resolveMachineLeg(
  leg: UatTestCriterion,
  gates: readonly ReliabilityGate[],
): MachineLegOutcome {
  if (leg.witness !== "machine") return { kind: "human" };
  const r = resolveWitness(leg, gates);
  if (r.witness === "machine" && r.coverage === "observe") {
    return { kind: "observe", observedBy: r.observedBy, proofCommand: r.proofCommand };
  }
  const bound = leg.proofGateId !== undefined ? gates.find((g) => g.id === leg.proofGateId) : undefined;
  const reason =
    bound !== undefined && bound.kind === "observe" && bound.proofCommand === undefined
      ? `covering gate ${leg.proofGateId} declares no command to observe`
      : r.witness === "machine"
        ? r.reason
        : "no proof-gate binding resolved";
  return { kind: "refused", reason };
}

/**
 * PURE: resolve EVERY real (non-`wouldBe`) leg, and report whether any machine leg was refused.
 *
 * The `anyRefused` flag is the no-partial-verdict rule's whole mechanism: it is computed across the
 * story's full leg set BEFORE a single verdict is written, so a refusal anywhere withholds the set.
 */
/** Every real leg's resolution, plus the story-wide refusal flag the no-partial-verdict rule reads. */
export interface MachineLegResolutions {
  readonly resolutions: MachineLegResolution[];
  /** True when ANY real leg was refused — computed across the full set before a verdict is written. */
  readonly anyRefused: boolean;
}

export function resolveMachineLegs(
  legs: readonly UatTestCriterion[],
  gates: readonly ReliabilityGate[],
): MachineLegResolutions {
  const real = legs.filter((t) => !t.wouldBe);
  const resolutions = real.map((leg) => ({ leg, outcome: resolveMachineLeg(leg, gates) }));
  return { resolutions, anyRefused: resolutions.some((r) => r.outcome.kind === "refused") };
}

/** Every seam {@link signMachineCriteria} touches, injected for determinism. */
export interface SignMachineCriteriaDeps {
  /** The live verdict store the signed rows are appended to. */
  store: AdoptedVerdictStore;
  /** The session repo's HEAD + clean-tree state; each verdict pins this commit. */
  gitState: () => Promise<ObserveGitState>;
  /** The spine's out-of-band observation of a declared command (exit code as data). */
  observe: (command: string) => Promise<ObserveOutcome>;
  /** The run id these verdicts are tied to. */
  runId: string;
  /** INJECTED ISO-timestamp source — keeps the compute deterministic. */
  now: () => string;
}

export interface SignMachineCriteriaArgs extends SignMachineCriteriaDeps {
  /** The story's declared UAT test criteria (ADR-0044) — `wouldBe` legs are filtered out here. */
  legs: readonly UatTestCriterion[];
  /** The story's declared reliability gates, the only source a binding may resolve against. */
  gates: readonly ReliabilityGate[];
  /**
   * Prove only these criterion ids, rather than the story's whole eligible set (ADR-0417 D2 — the
   * verb can prove one criterion or all of them). The no-partial-verdict rule is UNAFFECTED and is
   * deliberately still computed over the WHOLE leg set: narrowing WHICH legs are signed must never
   * become the way a story with an unbound leg gets a partial set anyway. A criterion id naming no
   * leg on this story is reported, never silently dropped.
   */
  onlyCriterionIds?: readonly string[];
}

/** What happened to ONE leg once the pass ran. */
export interface MachineLegReport {
  criterionId: string;
  /** The leg's own title, so a caller can render a line a reader recognises. */
  title: string;
  /**
   * `signed` — a verdict was written · `refused` — resolution or signing said no ·
   * `withheld` — this leg resolved fine, but a sibling's refusal withholds the whole set ·
   * `human` — awaits an operator attestation · `skipped` — outside `onlyCriterionIds`.
   */
  state: "signed" | "refused" | "withheld" | "human" | "skipped";
  /** Why, for every state that is not a plain `signed`. */
  reason?: string;
  /** The gate whose command was observed, on a `signed` leg. */
  observedBy?: string;
  /** The command the spine watched, on a `signed` leg. */
  proofCommand?: string;
}

export interface SignMachineCriteriaResult {
  reports: MachineLegReport[];
  /** How many verdicts were written. */
  signed: number;
  /** How many real machine legs the story declares (the denominator a caller should render). */
  machineLegs: number;
  /** How many legs await an operator attestation. */
  humanLegs: number;
  /**
   * True when a real machine leg could not be resolved, so the WHOLE set was withheld. A caller must
   * not report a partial success as a success.
   */
  anyRefused: boolean;
  /** Criterion ids in `onlyCriterionIds` that match no real leg on this story. */
  unknownCriterionIds: string[];
}

/**
 * Observe and sign a story's machine UAT criteria, or the named subset of them.
 *
 * Resolution happens for EVERY real leg first; only then is anything observed. On a refusal anywhere
 * the pass signs NOTHING and every otherwise-fine leg is reported `withheld` with that reason — the
 * caller renders it, the primitive never softens it.
 */
export async function signMachineCriteria(
  args: SignMachineCriteriaArgs,
): Promise<SignMachineCriteriaResult> {
  const { resolutions, anyRefused } = resolveMachineLegs(args.legs, args.gates);
  // One observation per DISTINCT command for the whole pass: N legs sharing a covering gate pay that
  // gate's suite ONCE, not N times. Held here so no caller can pass a runner that lacks it.
  const observe = memoizeObserve(args.observe);
  const wanted = args.onlyCriterionIds;
  const known = new Set(resolutions.map((r) => r.leg.criterionId));
  const unknownCriterionIds = wanted === undefined ? [] : wanted.filter((id) => !known.has(id));
  const isWanted = (id: string): boolean => wanted === undefined || wanted.includes(id);

  const reports: MachineLegReport[] = [];
  let signed = 0;
  let humanLegs = 0;
  let machineLegs = 0;

  for (const { leg, outcome } of resolutions) {
    if (outcome.kind === "human") {
      humanLegs += 1;
      reports.push({
        criterionId: leg.criterionId,
        title: leg.title,
        state: "human",
        reason: 'awaits an operator "I saw it work" verdict (ADR-0082)',
      });
      continue;
    }
    machineLegs += 1;
    if (outcome.kind === "refused") {
      reports.push({ criterionId: leg.criterionId, title: leg.title, state: "refused", reason: outcome.reason });
      continue;
    }
    // The leg resolves — but ANY refused sibling withholds the whole set (no partial verdict). This
    // is checked BEFORE the `onlyCriterionIds` filter on purpose: a narrowed run must not be a way
    // around the rule, so a story with an unbound leg signs nothing however few legs were asked for.
    if (anyRefused) {
      reports.push({
        criterionId: leg.criterionId,
        title: leg.title,
        state: "withheld",
        reason:
          "an invalid/unbound sibling machine leg refuses the whole UAT-signing pass (no partial verdict)",
      });
      continue;
    }
    if (!isWanted(leg.criterionId)) {
      reports.push({
        criterionId: leg.criterionId,
        title: leg.title,
        state: "skipped",
        reason: "not named in this run",
      });
      continue;
    }
    // ADR-0408: a MACHINE UAT LEG signs with NO `approvedBy`. The criterion binding below is what
    // selects that class inside `observeAndSign` — `approverInputs` is not passed (and cannot be:
    // the leg spec types it `never`), so the signer chain is never consulted on this path.
    const res = await observeAndSign({
      gate: {
        id: leg.criterionId,
        criterionId: leg.criterionId,
        revisionId: leg.revisionId,
        kind: "observe",
        proofCommand: outcome.proofCommand,
      },
      gitState: args.gitState,
      observe,
      store: args.store,
      runId: args.runId,
      now: args.now,
    });
    if (res.ok) {
      signed += 1;
      reports.push({
        criterionId: leg.criterionId,
        title: leg.title,
        state: "signed",
        observedBy: outcome.observedBy,
        proofCommand: outcome.proofCommand,
      });
    } else {
      reports.push({ criterionId: leg.criterionId, title: leg.title, state: "refused", reason: res.reason });
    }
  }

  return { reports, signed, machineLegs, humanLegs, anyRefused, unknownCriterionIds };
}
