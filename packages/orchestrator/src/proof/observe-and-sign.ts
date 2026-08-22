import type { Verdict } from "@storytree/proof-protocol";
import { SIGNING_EVENT_KIND } from "@storytree/proof-protocol";
import type { ReliabilityGate } from "@storytree/library";

import { resolveSigner, type SignerInputs } from "./signer.js";
import { SPINE_PRINCIPAL } from "./spine-principal.js";

/**
 * The OBSERVE-AND-SIGN compute (ADR-0085, resolving ADR-0083 Fork B; ADR-0097; ADR-0408): an
 * author-declared `observe` obligation (`@storytree/library` `reliability-gates.ts`) earns a REAL
 * signed verdict when the spine runs its declared command at a clean committed HEAD and OBSERVES it
 * green — without a prior red.
 *
 * This is the machine counterpart of `uat attest`'s operator path: where `uat attest` signs an
 * `operator-attested` verdict for a HUMAN-witness test, this signs an **`adopted`** verdict
 * (ADR-0085's new {@link ProofMode}) for a machine OBSERVATION. The witness axis is invariant across
 * both classes below (ADR-0097 d.4): the verdict is ALWAYS signed by the {@link SPINE_PRINCIPAL} —
 * the machine that watched the exit code out-of-band, *"did it work?"* — never by a human and never
 * by a model (ADR-0295 D2). Attributing the signature to the clicker would be false witness
 * provenance.
 *
 * TWO CLASSES OF CALL, and only one of them has a human decision in it (ADR-0408). The class is
 * STRUCTURAL — it is read off the criterion binding the call already carries, never a flag a caller
 * can set — so a caller cannot opt a brownfield adoption out of its human:
 *
 *  - **A MACHINE UAT LEG** ({@link ObserveMachineLegSpec} — the gate carries `criterionId`/
 *    `revisionId`, which is exactly what `runAdopt`'s leg loop passes and what no parsed
 *    {@link ReliabilityGate} can ever carry). The story is already in the fold and the test was
 *    already declared and already bound to that exact journey; the machine watched a check the owner
 *    had already asked for, and it passed. There is no human decision left, so the verdict carries
 *    NO `approvedBy` at all and the signer chain is never consulted. The field is
 *    `z.string().optional()` in `@storytree/proof-protocol`, so an absent one is honest rather than
 *    a hole.
 *  - **A BROWNFIELD OBSERVE GATE** ({@link ObserveBrownfieldGateSpec} — no criterion binding; the
 *    `storytree adopt` / `gate run <story>#gate-n` path). Deciding that an existing, unproven suite
 *    is good enough to trust is a real human judgement — nothing is being checked, RISK IS BEING
 *    ACCEPTED on work the system did not produce — so `approvedBy` is REQUIRED and resolution stays
 *    FAIL-CLOSED on a blank approver (ADR-0097 d.4, as narrowed by ADR-0408).
 *
 * Every other honesty wall of the gate holds EXCEPT the prior-red requirement (job 2 — "the test
 * provably failed once"), which for a reviewed existing suite is supplied by author review and
 * recorded by the `adopted` provenance:
 *  - the spine OBSERVES the exit code out-of-band (a process it watched, never a model claim);
 *  - it is pinned to a CLEAN committed tree (a dirty tree refuses — the commit must match what
 *    was observed);
 *  - and it greens nothing unless it PERSISTS (the caller passes the live store).
 *
 * Fail-closed throughout: a non-`observe` gate, a gate with no `proofCommand`, a non-zero exit, a
 * dirty tree — or, on the brownfield class only, a blank approver — all REFUSE and sign nothing.
 * Pure-by-injection — the command runner, the git state and the clock are all injected, so the whole
 * compute is offline-testable with no subprocess, no repo and no DB.
 */

/** The git state an adopted verdict pins itself to: the HEAD it attests, and is it clean? */
export interface ObserveGitState {
  commitSha: string;
  clean: boolean;
}

/** The captured outcome of the observed command: only the exit code the spine watched. */
export interface ObserveOutcome {
  /** The process exit code, or `null` if the process was killed by a signal (treated as a fail). */
  code: number | null;
}

/** The verdict event log slice this writes to (the live PgWorkStore satisfies it). */
export interface AdoptedVerdictStore {
  appendEvent(e: {
    id: string;
    kind: string;
    type: "created";
    doc: unknown;
    actor?: string;
  }): Promise<unknown>;
}

/** The seams {@link observeAndSign} touches regardless of which class the call is. */
interface ObserveAndSignCommon {
  /** The session repo's HEAD + clean-tree state; the verdict pins this commit. */
  gitState: () => Promise<ObserveGitState>;
  /** The spine's out-of-band observation of the declared command (exit code as data). */
  observe: (command: string) => Promise<ObserveOutcome>;
  /** The live verdict store the signed `adopted` row is appended to. */
  store: AdoptedVerdictStore;
  /** The run id this verdict is tied to. */
  runId: string;
  /** INJECTED ISO-timestamp source — keeps the compute deterministic. */
  now: () => string;
}

/**
 * A MACHINE UAT LEG (ADR-0408): an `observe` obligation consumed through a UAT criterion's
 * `(proof-gate:)` binding — the shape `runAdopt`'s leg loop passes, carrying the leg's
 * `criterionId`/`revisionId`. The story is already in the fold and the check was already declared
 * and already bound to this exact journey, so there is no human decision left to record: the verdict
 * carries NO `approvedBy` and the signer chain is never consulted.
 *
 * `approverInputs?: never` is the STRUCTURAL fence, not documentation: the criterion binding is what
 * selects this class, and a caller on this path cannot even supply an approver — so this can never
 * become the boolean by which a brownfield adoption skips its human.
 */
export interface ObserveMachineLegSpec extends ObserveAndSignCommon {
  /** The leg being signed, carrying its criterion binding (only the fields the compute reads). */
  gate: Pick<ReliabilityGate, "id" | "kind" | "proofCommand"> & {
    criterionId: string;
    revisionId: string;
  };
  approverInputs?: never;
}

/**
 * A BROWNFIELD OBSERVE GATE (ADR-0097): an author-declared `observe` reliability gate with no
 * criterion binding — the `storytree adopt` / `gate run <story>#gate-n` path. A parsed
 * {@link ReliabilityGate} never carries `criterionId`, so this is the class every gate call lands in.
 */
export interface ObserveBrownfieldGateSpec extends ObserveAndSignCommon {
  /** The author-declared gate being adopted (only the fields the compute reads). */
  gate: Pick<ReliabilityGate, "id" | "kind" | "proofCommand"> & {
    criterionId?: never;
    revisionId?: never;
  };
  /**
   * The HUMAN APPROVER of the adoption (ADR-0097 d.4 — `approvedBy`), resolved against the V1 signer
   * chain (flag → STORYTREE_SIGNER → git email); fail-closed. The verdict is SIGNED by the
   * {@link SPINE_PRINCIPAL}; this resolves *who decided to bring the unit into the fold*, which is
   * REQUIRED on this class — nothing is being checked here, risk is being accepted on work the system
   * did not produce, and no improvement in model capability retires an ownership decision (ADR-0408).
   */
  approverInputs: SignerInputs;
}

/** Every seam {@link observeAndSign} touches, injected for determinism. */
export type ObserveAndSignSpec = ObserveMachineLegSpec | ObserveBrownfieldGateSpec;

/**
 * PURE: which class is this call? A criterion binding is present exactly when this is a machine UAT
 * leg (ADR-0408) — derived from what the call already carries, never from a caller-supplied flag.
 */
function isMachineUatLeg(spec: ObserveAndSignSpec): spec is ObserveMachineLegSpec {
  return spec.gate.criterionId !== undefined;
}

/** A signed `adopted` verdict, or a fail-closed refusal with the reason. */
export type ObserveAndSignResult =
  | { ok: true; verdict: Verdict }
  | { ok: false; reason: string };

/**
 * Observe a single `observe` reliability gate and, on green at a clean committed HEAD, sign an
 * `adopted` verdict into the store. On ANY refusal NO verdict row is written (proof is
 * non-authorable). The order mirrors the prove-it-gate: observe FIRST, then the clean-tree gate,
 * then sign — so the pinned commit is the clean tree the green was observed against.
 */
export async function observeAndSign(spec: ObserveAndSignSpec): Promise<ObserveAndSignResult> {
  const { gate } = spec;

  // 1. Only an `observe` gate is observe-and-signable. build-tests / integrate are earned by real
  //    work (a red→green build, or the capability they fold under) — never a rubber-stamp.
  if (gate.kind !== "observe") {
    const how =
      gate.kind === "build-tests"
        ? "a genuine red→green build through the gate (real work, real red)"
        : "the capability it is folded under greening";
    return {
      ok: false,
      reason: `gate "${gate.id}" is kind '${gate.kind}', not 'observe' — it is earned by ${how}, not observe-and-sign.`,
    };
  }

  // 2. An observe gate MUST declare a command for the spine to observe (fail-closed).
  const command = gate.proofCommand?.trim();
  if (command === undefined || command.length === 0) {
    return {
      ok: false,
      reason: `observe gate "${gate.id}" declares no proofCommand (the inline backticked command) — nothing for the spine to observe.`,
    };
  }

  // 3. The APPROVER, split by class (ADR-0408 — the class is read off the criterion binding the call
  //    already carries, never a flag). A BROWNFIELD adoption must be attributable to a real human
  //    (ADR-0097 d.4): the verdict is SIGNED by the spine principal, but it greens nothing without a
  //    resolved approver — resolved before any spend, so a blank one refuses without running the
  //    suite. A MACHINE UAT LEG has no human decision left in it, so it takes no approver and the
  //    signer chain is NOT consulted; the verdict simply carries no `approvedBy`.
  let approvedBy: string | undefined;
  if (!isMachineUatLeg(spec)) {
    const approver = resolveSigner(spec.approverInputs);
    if (!approver.ok) {
      return { ok: false, reason: `no approver resolved (who is adopting this?): ${approver.error}` };
    }
    approvedBy = approver.signer;
  }

  // 4. The spine OBSERVES the command out-of-band — an exit code it watched, never a model claim.
  const outcome = await spec.observe(command);
  if (outcome.code !== 0) {
    const exit = outcome.code === null ? "by signal" : `exit ${outcome.code}`;
    return {
      ok: false,
      reason: `observe gate "${gate.id}" did NOT pass: \`${command}\` ${exit} — an adopted green requires the declared command observed GREEN. No verdict signed.`,
    };
  }

  // 5. The clean-tree gate: the verdict pins a commit, so signing against uncommitted edits would
  //    attest a commit that does not match what was observed (fail-closed, the gate's posture).
  const tree = await spec.gitState();
  if (!tree.clean) {
    return {
      ok: false,
      reason: `tree is not clean (commit ${tree.commitSha}); an adopted verdict pins a commit, and signing against uncommitted edits would attest a commit that does not match what was observed.`,
    };
  }

  // 6. Sign the `adopted` machine verdict and append it. The MACHINE signs on BOTH classes (the spine
  //    principal — it witnessed the green out-of-band). On a brownfield adoption the HUMAN's decision
  //    is recorded as `approvedBy` (ADR-0097 d.4); a machine UAT leg carries none, and an ABSENT field
  //    is the honest record — never a blank string or a name nobody supplied (ADR-0408). healthy is
  //    reachable ONLY through this append (never authored); on any earlier refusal nothing was written.
  const verdict: Verdict = {
    unitId: gate.id,
    proofMode: "adopted",
    outcome: "pass",
    commitSha: tree.commitSha,
    signer: SPINE_PRINCIPAL,
    runId: spec.runId,
    outputVersion: "v1",
    evidence: [
      {
        kind: "observation:green",
        ref: gate.id,
        note:
          approvedBy === undefined
            ? `observed green at a clean HEAD: ${command} (machine-witnessed acceptance leg — no human approver required, ADR-0408)`
            : `observed green at a clean HEAD: ${command} (adopted by ${approvedBy})`,
      },
    ],
    at: spec.now(),
  };
  // Both criterion keys or neither — the pair is what `Verdict`'s superRefine holds to.
  if (gate.criterionId !== undefined) {
    verdict.criterionId = gate.criterionId;
    verdict.revisionId = gate.revisionId;
  }
  if (approvedBy !== undefined) verdict.approvedBy = approvedBy;
  await spec.store.appendEvent({
    id: `${spec.runId}:${gate.id}`,
    kind: SIGNING_EVENT_KIND,
    type: "created",
    doc: verdict,
    actor: SPINE_PRINCIPAL,
  });
  return { ok: true, verdict };
}
