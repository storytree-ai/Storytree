import type { Verdict } from "@storytree/proof-protocol";
import { SIGNING_EVENT_KIND } from "@storytree/proof-protocol";
import type { ReliabilityGate } from "@storytree/library";

import { resolveSigner, type SignerInputs } from "./signer.js";

/**
 * The brownfield OBSERVE-AND-SIGN compute (ADR-0085, resolving ADR-0083 Fork B): a story's
 * author-declared `observe` reliability gate (`@storytree/library` `reliability-gates.ts`) earns
 * a REAL signed verdict when the spine runs its declared command at a clean committed HEAD and
 * OBSERVES it green — without a prior red.
 *
 * This is the machine counterpart of `uat attest`'s operator path: where `uat attest` signs an
 * `operator-attested` verdict for a HUMAN-witness test, this signs an **`adopted`** verdict
 * (ADR-0085's new {@link ProofMode}) for a machine OBSERVATION. Every honesty wall of the gate
 * holds EXCEPT the prior-red requirement (job 2 — "the test provably failed once"), which for a
 * reviewed existing suite is supplied by author review and recorded by the `adopted` provenance:
 *  - the spine OBSERVES the exit code out-of-band (a process it watched, never a model claim);
 *  - the verdict is attributed to a resolved signer (fail-closed on a blank chain);
 *  - it is pinned to a CLEAN committed tree (a dirty tree refuses — the commit must match what
 *    was observed);
 *  - and it greens nothing unless it PERSISTS (the caller passes the live store).
 *
 * Fail-closed throughout: a non-`observe` gate, a gate with no `proofCommand`, a non-zero exit,
 * a blank signer, or a dirty tree all REFUSE and sign nothing. Pure-by-injection — the command
 * runner, the git state and the clock are all injected, so the whole compute is offline-testable
 * with no subprocess, no repo and no DB.
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

/** Every seam {@link observeAndSign} touches, injected for determinism. */
export interface ObserveAndSignSpec {
  /** The author-declared gate being adopted (only the fields the compute reads). */
  gate: Pick<ReliabilityGate, "id" | "kind" | "proofCommand">;
  /** The session repo's HEAD + clean-tree state; the verdict pins this commit. */
  gitState: () => Promise<ObserveGitState>;
  /** The spine's out-of-band observation of the declared command (exit code as data). */
  observe: (command: string) => Promise<ObserveOutcome>;
  /** Resolved against the V1 signer chain (flag → STORYTREE_SIGNER → git email); fail-closed. */
  signerInputs: SignerInputs;
  /** The live verdict store the signed `adopted` row is appended to. */
  store: AdoptedVerdictStore;
  /** The run id this verdict is tied to. */
  runId: string;
  /** INJECTED ISO-timestamp source — keeps the compute deterministic. */
  now: () => string;
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

  // 3. The verdict must be attributable to a real signer (resolve before any spend).
  const signer = resolveSigner(spec.signerInputs);
  if (!signer.ok) {
    return { ok: false, reason: `no signer resolved: ${signer.error}` };
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

  // 6. Sign the `adopted` machine verdict and append it. healthy is reachable ONLY through this
  //    append (never authored); on any earlier refusal nothing was written.
  const verdict: Verdict = {
    unitId: gate.id,
    proofMode: "adopted",
    outcome: "pass",
    commitSha: tree.commitSha,
    signer: signer.signer,
    runId: spec.runId,
    outputVersion: "v1",
    evidence: [
      {
        kind: "observation:green",
        ref: gate.id,
        note: `observed green at a clean HEAD: ${command}`,
      },
    ],
    at: spec.now(),
  };
  await spec.store.appendEvent({
    id: `${spec.runId}:${gate.id}`,
    kind: SIGNING_EVENT_KIND,
    type: "created",
    doc: verdict,
    actor: signer.signer,
  });
  return { ok: true, verdict };
}
