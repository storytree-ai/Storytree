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

import { runStep } from "@storytree/agent";
import type { Model, ToolExecutor } from "@storytree/agent";
import type {
  EvidenceRef,
  ProofMode,
  Store,
  Verdict,
} from "@storytree/core";
import { resolveSigner } from "@storytree/core";
import type { SignerInputs } from "@storytree/core";

import { advancePhase, nextPhase } from "./phase-machine.js";
import type {
  Phase,
  TestExecutor,
  TestObservation,
  WriteScope,
} from "./phase-machine.js";
import {
  WriteScopedToolExecutor,
  type WriteToolSpec,
} from "./write-scoped-executor.js";

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

/** The full input to {@link proveUnit}. Every seam the gate touches is injected for determinism. */
export interface ProveSpec {
  unitId: string;
  proofMode: ProofMode;
  testId: string;
  model: Model;
  /** The leaf's tool surface; wrapped in a {@link WriteScopedToolExecutor} whose phase the spine flips. */
  tools: ToolExecutor;
  /** The per-phase write-ownership predicate (ADR-0020 §2). */
  scope: WriteScope;
  /** Maps the leaf's WRITE tools to path-extractors so the scope can gate them. */
  writeTools: WriteToolSpec;
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
}

/** The result of {@link proveUnit}: a signed pass, or a fail-closed refusal with the phase it died at. */
export type ProveResult =
  | { ok: true; verdict: Verdict; phasesVisited: Phase[] }
  | { ok: false; failedAt: Phase; reason: string; phasesVisited: Phase[] };

/** The store `kind` for the signed promotion event. */
const SIGNING_KIND = "signing";

/** The model string handed to {@link runStep}; the leaf brief is the request's user message. */
const STEP_MODEL = "spine-leaf";

/**
 * Walk one unit through the ADR-0020 honesty loop and return a signed {@link Verdict} on success or a
 * fail-closed {@link ProveResult} on any refusal. On EVERY abort, NO signing row is written — proof is
 * non-authorable, so an unproven unit leaves no promotion event behind.
 *
 * The spine OWNS every transition: it flips the {@link WriteScopedToolExecutor}'s phase, runs the
 * authoring steps, OBSERVES red/green itself via {@link ProveSpec.testExecutor}, and only signs at the
 * GATE when the tree is clean and a signer resolves.
 */
export async function proveUnit(spec: ProveSpec): Promise<ProveResult> {
  const visited: Phase[] = [];
  const scoped = new WriteScopedToolExecutor({
    inner: spec.tools,
    scope: spec.scope,
    writeTools: spec.writeTools,
    phase: "AUTHOR_TEST",
  });

  // ── Phase 1: AUTHOR_TEST ────────────────────────────────────────────────
  // The leaf may write the TEST only. On a successful authoring step we advance to CONFIRM_RED.
  visited.push("AUTHOR_TEST");
  scoped.setPhase("AUTHOR_TEST");
  const authored = await runStep({
    model: spec.model,
    tools: scoped,
    request: { model: STEP_MODEL, messages: [{ role: "user", content: spec.prompts.authorTest }] },
  });
  if (!authored.ok) {
    return fail("AUTHOR_TEST", `authoring the test failed (${authored.error})`, visited);
  }
  const toRed = advancePhase("AUTHOR_TEST");
  if (!toRed.ok) {
    return fail("AUTHOR_TEST", toRed.reason, visited);
  }

  // ── Phase 2: CONFIRM_RED ────────────────────────────────────────────────
  // The spine OBSERVES the red itself. A forged/early green here is the attack ADR-0020 §3 stops.
  visited.push("CONFIRM_RED");
  scoped.setPhase("CONFIRM_RED");
  const redObs = await spec.testExecutor.run(spec.testId);
  const redGate = nextPhase("CONFIRM_RED", redObs);
  if (!redGate.ok) {
    return fail("CONFIRM_RED", redGate.reason, visited);
  }

  // ── Phase 3: IMPLEMENT ──────────────────────────────────────────────────
  // The leaf may write SOURCE only (never the test it must satisfy). Advance to CONFIRM_GREEN.
  visited.push("IMPLEMENT");
  scoped.setPhase("IMPLEMENT");
  const implemented = await runStep({
    model: spec.model,
    tools: scoped,
    request: { model: STEP_MODEL, messages: [{ role: "user", content: spec.prompts.implement }] },
  });
  if (!implemented.ok) {
    return fail("IMPLEMENT", `implementing against the test failed (${implemented.error})`, visited);
  }
  const toGreen = advancePhase("IMPLEMENT");
  if (!toGreen.ok) {
    return fail("IMPLEMENT", toGreen.reason, visited);
  }

  // ── Phase 4: CONFIRM_GREEN ──────────────────────────────────────────────
  // The spine OBSERVES the green itself. A red here means the implementation is not proven.
  visited.push("CONFIRM_GREEN");
  scoped.setPhase("CONFIRM_GREEN");
  const greenObs = await spec.testExecutor.run(spec.testId);
  const greenGate = nextPhase("CONFIRM_GREEN", greenObs);
  if (!greenGate.ok) {
    return fail("CONFIRM_GREEN", greenGate.reason, visited);
  }

  // ── Phase 5: GATE (ADR-0020 §4 — the forensic floor) ────────────────────
  // Observe-only. Sign the verdict against a clean committed tree + a resolved signer, then append
  // the SIGNED promotion event. Any refusal here writes NO row.
  visited.push("GATE");
  scoped.setPhase("GATE");

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

  const verdict: Verdict = {
    unitId: spec.unitId,
    proofMode: spec.proofMode,
    outcome: "pass",
    commitSha: tree.commitSha,
    signer: signer.signer,
    runId: spec.runId,
    evidence: [toEvidence(redObs), toEvidence(greenObs)],
    at: spec.now(),
  };

  // The signed promotion event: healthy/proven is reachable ONLY through this append (never authored).
  await spec.store.appendEvent({
    id: `${spec.runId}:${spec.unitId}`,
    kind: SIGNING_KIND,
    type: "created",
    doc: verdict,
    actor: signer.signer,
  });

  return { ok: true, verdict, phasesVisited: visited };
}

/** Build a fail-closed {@link ProveResult}. NO signing row is ever written on this path. */
function fail(failedAt: Phase, reason: string, phasesVisited: Phase[]): ProveResult {
  return { ok: false, failedAt, reason, phasesVisited };
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
