/**
 * The prove-it-gate driver (ADR-0020): compose the full red-green honesty loop into a single thin
 * driver the spine owns. This is the WORKING gate that sits on top of the phase-machine skeleton —
 * it walks `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`, the spine OWNS every
 * transition, the leaf only authors inside a phase, and — the load-bearing property —
 * **THE MODEL NEVER REPORTS THE VERDICT**. red/green is OBSERVED by the spine's {@link TestExecutor}
 * (ADR-0020 §3) and the signed {@link Verdict} is built by the spine (§4), pinned to a clean
 * committed tree and a resolved signer. `healthy`/proven is reachable ONLY through the signing event
 * this gate appends — never authored.
 *
 * Determinism: every timestamp comes from the injected {@link ProveSpec.now}; the working-tree state
 * comes from the injected {@link ProveSpec.treeState} seam. Nothing here reads a wall clock or the
 * real git tree directly, so the whole walk is offline-testable.
 */

import { execFile } from "node:child_process";

import type { AuthorResult, PhaseAuthor } from "@storytree/agent";
import type { ChangeStore, Store } from "@storytree/storage-protocol";
import type {
  ChangeEvent,
  ContractCoverageAxis,
  EvidenceRef,
  ProofMode,
  Verdict,
} from "@storytree/proof-protocol";
import { resolveSigner } from "./proof/signer.js";
import type { SignerInputs } from "./proof/signer.js";

import { advancePhase, nextPhase } from "./phase-machine.js";
import type {
  Phase,
  TestExecutor,
  TestObservation,
} from "./phase-machine.js";

/** The injected working-tree snapshot (ADR-0020 §4): the commit attested + whether the tree is clean. */
export interface TreeState {
  commitSha: string;
  clean: boolean;
}

/** The per-phase leaf briefs (the prompts spliced into each authoring step). */
export interface PhasePrompts {
  authorTest: string;
  implement: string;
}

/**
 * ADR-0016: the binding being proved. When present on a {@link ProveSpec}, the gate stamps
 * `verdict.boundHash` with `boundHash` and — if a {@link ProveSpec.changeStore} is also present —
 * emits a {@link ChangeEvent} recording the proof's content baseline. Absent on every pre-ADR-0016
 * caller, so the gate's existing behaviour is unchanged.
 */
export interface ProvenBinding {
  /** The content-hash (hashSpan) of the proved span at proof time → verdict.boundHash + the event's hashAfter. */
  boundHash: string;
  /** The prior signed boundHash this re-proof advances FROM; absent on a first proof (hashBefore = hashAfter). */
  priorHash?: string;
  /** The described "changed: why" for the emitted ChangeEvent; absent = an undescribed (demoted) change. */
  description?: string;
}

/** The full input to {@link proveUnit}. Every seam the gate touches is injected for determinism. */
export interface ProveSpec {
  unitId: string;
  proofMode: ProofMode;
  testId: string;
  /**
   * The leaf runtime behind the executor seam (ADR-0030 §2): the owned loop (`OwnedLoopAuthor`)
   * or the Claude Agent SDK (`ClaudeAgentAuthor`). It authors inside the two authoring phases
   * under its own write-scope enforcement; it never observes red/green or reports a verdict.
   */
  author: PhaseAuthor;
  /** The spine's red/green observer (ADR-0020 §3) — the model never produces these. */
  testExecutor: TestExecutor;
  /** The event store the signed promotion row is appended to (ADR-0017). */
  store: Store;
  /** Resolved against the V1 signer chain (flag → env → gitEmail). */
  signerInputs: SignerInputs;
  /** INJECTED tree seam (ADR-0020 §4): tests pass a fake; callers pass {@link gitTreeState}. */
  treeState: () => Promise<TreeState>;
  /** INJECTED ISO-timestamp source. Tests pass a fixed value; keeps the gate deterministic. */
  now: () => string;
  /** The per-phase leaf briefs. */
  prompts: PhasePrompts;
  /** The owned-loop run id this verdict is tied to. */
  runId: string;
  /** ADR-0016 (optional): the binding proved — stamps verdict.boundHash + emits a ChangeEvent. Absent = unchanged. */
  binding?: ProvenBinding;
  /** ADR-0016 (optional): the change-log sink the emitted ChangeEvent is appended to. Absent = no emission. */
  changeStore?: ChangeStore;
  /**
   * ADR-0127 (optional): the per-contract coverage axis, computed LAZILY at GATE time and stamped onto
   * the signed verdict. A THUNK — not a value — because in a real build the test file is authored
   * DURING the walk, so coverage is unknowable at resolve time; the gate consults it only once it
   * reaches GATE (a genuinely-signed green), so an aborted walk stamps nothing. It returns `undefined`
   * when the unit declares no contracts or its test surface cannot be read (fail-closed — the axis is
   * OMITTED, never falsely "fully covered"). Absent on every pre-ADR-0127 caller, so existing
   * behaviour is unchanged.
   */
  contractCoverage?: () => ContractCoverageAxis | undefined;
  /**
   * ADR-0048 §3 v2 (optional): a phase OBSERVER the spine invokes as it commits to each phase
   * (`AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`), so the in-flight-build wisp can
   * colour by the LIVE red→green phase. Awaited before the phase proceeds (the real observer appends
   * a `building` work-event — the CLI drive owns that WRITE, never the gate: "No orchestrator
   * impurity", ADR-0048). Fired ONLY after the spine reaches a phase, so the colour signal is as
   * honest as the verdict — a forged early green stops the wisp exactly where it stops the walk.
   * DEFAULT-ABSENT ⇒ zero behaviour change: every pre-ADR-0048 caller omits it and is never called.
   */
  onPhase?: (phase: Phase) => void | Promise<void>;
}

/** The result of {@link proveUnit}: a signed pass, or a fail-closed refusal with the phase it died at. */
export type ProveResult =
  | { ok: true; verdict: Verdict; phasesVisited: Phase[] }
  | { ok: false; failedAt: Phase; reason: string; phasesVisited: Phase[] };

/** The store `kind` for the signed promotion event. */
const SIGNING_KIND = "signing";

/**
 * Walk one unit through the ADR-0020 honesty loop and return a signed {@link Verdict} on success or a
 * fail-closed {@link ProveResult} on any refusal. On EVERY abort, NO signing row is written — proof is
 * non-authorable, so an unproven unit leaves no promotion event behind.
 *
 * The spine OWNS every transition: it hands the leaf {@link PhaseAuthor} exactly two authoring
 * slices, OBSERVES red/green itself via {@link ProveSpec.testExecutor}, and only signs at the
 * GATE when the tree is clean and a signer resolves. The author enforces its own per-phase write
 * scope (OwnedLoopAuthor: the write-scoped decorator; ClaudeAgentAuthor: PreToolUse deny hooks).
 */
export async function proveUnit(spec: ProveSpec): Promise<ProveResult> {
  const visited: Phase[] = [];

  // ── Phase 1: AUTHOR_TEST ────────────────────────────────────────────────
  // The leaf may write the TEST only. On a successful authoring step we advance to CONFIRM_RED.
  visited.push("AUTHOR_TEST");
  await spec.onPhase?.("AUTHOR_TEST");
  const authored = await spec.author.author("AUTHOR_TEST", spec.prompts.authorTest);
  // Turn/budget exhaustion is a COST guard, not a proof signal (ADR-0020): the leaf hit its ceiling,
  // but a usable (red) test may already be on disk. Fall through to CONFIRM_RED — the spine's own
  // observation is the sole arbiter — rather than discard the PAID slice (the turn-ceiling cost-leak).
  // A GENUINE authoring error (no work produced) still fails closed here.
  const authorExhaustion = exhaustionReason(authored);
  if (!authored.ok && authorExhaustion === null) {
    return fail("AUTHOR_TEST", `authoring the test failed (${authored.error})`, visited);
  }
  const toRed = advancePhase("AUTHOR_TEST");
  if (!toRed.ok) {
    return fail("AUTHOR_TEST", toRed.reason, visited);
  }

  // ── Phase 2: CONFIRM_RED ────────────────────────────────────────────────
  // The spine OBSERVES the red itself. A forged/early green here is the attack ADR-0020 §3 stops.
  // No leaf runs in this phase (or any later one except IMPLEMENT) — the author is never invoked.
  visited.push("CONFIRM_RED");
  await spec.onPhase?.("CONFIRM_RED");
  const redObs = await spec.testExecutor.run(spec.testId);
  const redGate = nextPhase("CONFIRM_RED", redObs);
  if (!redGate.ok) {
    // If the slice was exhausted AND no red landed, the actionable signal is "raise the ceiling and
    // retry", not just "not red" — preserve that context the fall-through would otherwise swallow.
    return fail("CONFIRM_RED", redGate.reason + exhaustionNote(authorExhaustion, "a red test"), visited);
  }

  // ── Phase 3: IMPLEMENT ──────────────────────────────────────────────────
  // The leaf may write SOURCE only (never the test it must satisfy). Advance to CONFIRM_GREEN.
  visited.push("IMPLEMENT");
  await spec.onPhase?.("IMPLEMENT");
  const implemented = await spec.author.author("IMPLEMENT", spec.prompts.implement);
  // Same fall-through as AUTHOR_TEST: an exhausted IMPLEMENT slice may have left GREEN code on disk,
  // so let CONFIRM_GREEN observe it rather than discard the paid work (the discarded-green leak). The
  // ceiling never gates the verdict — only the spine's observation does.
  const implementExhaustion = exhaustionReason(implemented);
  if (!implemented.ok && implementExhaustion === null) {
    return fail("IMPLEMENT", `implementing against the test failed (${implemented.error})`, visited);
  }
  const toGreen = advancePhase("IMPLEMENT");
  if (!toGreen.ok) {
    return fail("IMPLEMENT", toGreen.reason, visited);
  }

  // ── Phase 4: CONFIRM_GREEN ──────────────────────────────────────────────
  // The spine OBSERVES the green itself. A red here means the implementation is not proven.
  visited.push("CONFIRM_GREEN");
  await spec.onPhase?.("CONFIRM_GREEN");
  const greenObs = await spec.testExecutor.run(spec.testId);
  const greenGate = nextPhase("CONFIRM_GREEN", greenObs);
  if (!greenGate.ok) {
    return fail("CONFIRM_GREEN", greenGate.reason + exhaustionNote(implementExhaustion, "green"), visited);
  }

  // ── Phase 5: GATE (ADR-0020 §4 — the forensic floor) ────────────────────
  // Observe-only. Sign the verdict against a clean committed tree + a resolved signer, then append
  // the SIGNED promotion event. Any refusal here writes NO row.
  visited.push("GATE");
  await spec.onPhase?.("GATE");

  const tree = await spec.treeState();
  if (!tree.clean) {
    return fail(
      "GATE",
      `tree is not clean (commit ${tree.commitSha}); a Pass without a clean committed tree is forgeable`,
      visited,
    );
  }

  const signer = resolveSigner(spec.signerInputs);
  if (!signer.ok) {
    return fail("GATE", `no signer resolved: ${signer.error}`, visited);
  }

  // ADR-0127: the per-contract coverage axis, computed lazily HERE (the test file is on disk and
  // committed by now). Consulted only on this signed-green path, so an aborted walk stamps nothing
  // (test m). A thunk returning undefined (no contracts / unreadable surface) leaves the key OFF.
  const coverage = spec.contractCoverage?.();

  const verdict: Verdict = {
    unitId: spec.unitId,
    proofMode: spec.proofMode,
    outcome: "pass",
    commitSha: tree.commitSha,
    signer: signer.signer,
    runId: spec.runId,
    // ADR-0068 §3: the verdict-data output-format version. The gate stamps the current `v1`
    // explicitly (the contract's Verdict OUTPUT type requires it; the default applies only on parse).
    outputVersion: "v1",
    evidence: [toEvidence(redObs), toEvidence(greenObs)],
    at: spec.now(),
    ...(spec.binding !== undefined ? { boundHash: spec.binding.boundHash } : {}),
    ...(coverage !== undefined ? { contractCoverage: coverage } : {}),
  };

  // The signed promotion event: healthy/proven is reachable ONLY through this append (never authored).
  await spec.store.appendEvent({
    id: `${spec.runId}:${spec.unitId}`,
    kind: SIGNING_KIND,
    type: "created",
    doc: verdict,
    actor: signer.signer,
  });

  // ADR-0016: record WHAT code this proof attests — a ChangeEvent advancing the unit's bound hash
  // (provenance: the attested commit). Only when a binding AND a change-log sink are present; both are
  // absent for every pre-ADR-0016 caller, so existing behaviour is unchanged.
  if (spec.binding !== undefined && spec.changeStore !== undefined) {
    const change: ChangeEvent = {
      unitId: spec.unitId,
      hashBefore: spec.binding.priorHash ?? spec.binding.boundHash,
      hashAfter: spec.binding.boundHash,
      ...(spec.binding.description !== undefined ? { description: spec.binding.description } : {}),
      author: signer.signer,
      at: spec.now(),
      commitSha: tree.commitSha,
    };
    await spec.changeStore.appendChangeEvent(change);
  }

  return { ok: true, verdict, phasesVisited: visited };
}

/** Build a fail-closed {@link ProveResult}. NO signing row is ever written on this path. */
function fail(failedAt: Phase, reason: string, phasesVisited: Phase[]): ProveResult {
  return { ok: false, failedAt, reason, phasesVisited };
}

/**
 * The leaf's exhaustion reason, or `null` when the slice was a clean success OR a genuine error.
 * An exhausted slice (the leaf hit its turn/budget ceiling — see {@link AuthorResult}'s `exhausted`)
 * is treated as authoring-complete: the gate falls through to its own observation rather than
 * discarding the paid work, and only the spine's red/green decides the verdict.
 */
function exhaustionReason(authored: AuthorResult): string | null {
  return !authored.ok && authored.exhausted === true ? authored.error : null;
}

/**
 * The actionable raise-the-ceiling note appended when an EXHAUSTED slice STILL failed its
 * observation gate. Empty when the slice was not exhausted (a plain not-red/not-green, where the
 * gate's own reason already says everything). `target` is what the leaf ran out of road before reaching.
 */
function exhaustionNote(reason: string | null, target: string): string {
  return reason === null
    ? ""
    : ` — the leaf exhausted its turn/budget ceiling before reaching ${target} ` +
        `(${reason}); raise --max-turns/--budget and retry`;
}

/** Turn a spine observation into an {@link EvidenceRef} backing the verdict (the captured red/green). */
function toEvidence(obs: TestObservation): EvidenceRef {
  const note = obs.kind === undefined
    ? `observed ${obs.result}`
    : `observed ${obs.result} (${obs.kind})`;
  return { kind: `observation:${obs.result}`, ref: obs.testId, note };
}

/**
 * A real {@link TreeState} source using `git rev-parse HEAD` + `git status --porcelain` (ADR-0020 §4).
 * It TYPECHECKS and is usable by callers, but tests INJECT a fake {@link ProveSpec.treeState} — the
 * gate never depends on the working tree being clean during tests.
 *
 * @param cwd optional working directory the git commands run in (defaults to the process cwd).
 */
export function gitTreeState(cwd?: string): () => Promise<TreeState> {
  return async (): Promise<TreeState> => {
    const commitSha = (await runGit(["rev-parse", "HEAD"], cwd)).trim();
    const porcelain = (await runGit(["status", "--porcelain"], cwd)).trim();
    return { commitSha, clean: porcelain.length === 0 };
  };
}

/** Run a git command, resolving its stdout. Rejects on a genuine spawn/exec failure. */
function runGit(args: string[], cwd?: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const options: { cwd?: string; maxBuffer: number } = { maxBuffer: 16 * 1024 * 1024 };
    if (cwd !== undefined) {
      options.cwd = cwd;
    }
    execFile("git", args, options, (error, stdout) => {
      if (error === null) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(`git ${args.join(" ")} failed: ${error.message}`, { cause: error }),
      );
    });
  });
}
