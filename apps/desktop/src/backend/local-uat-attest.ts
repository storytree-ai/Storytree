// Local UAT attestation (the "brokered-local-uat-signing" capability,
// stories/desktop/brokered-local-uat-signing.md).
//
// A local human signs a declared UAT leg at a clean git HEAD, and the desktop backend turns that
// observation into a REAL `operator-attested` proof-protocol Verdict — persisted through the
// injected, brokered `ForestWriter` (never a direct DB connection, ADR-0117 d.1/d.5).
//
// ONE CAPABILITY, ONE HONESTY BOUNDARY: validation, verdict construction, and persistence are one
// transaction-shaped journey. Every honesty wall below runs BEFORE the writer is ever called:
//  1. the requested test id + outcome + declared test context must be well-formed and resolvable —
//     a typo or an empty/absent declared context never mints a verdict for an unknown unit;
//  2. the shared `@storytree/orchestrator` `checkUatProof` sign-time trust guard (ADR-0082 d.2 /
//     ADR-0007 no-self-exempt) must accept the offered `{ proofMode: "operator-attested", signer }`
//     against the test's declared witness and the (optional) running agent identity — this refuses a
//     machine-witness leg, a blank/`sandbox:`/agent-equal signer;
//  3. the git HEAD must be present, well-formed, and CLEAN — a human cannot attest uncommitted bytes
//     while pinning a different committed state;
//  4. the built object must itself validate as a real proof-protocol `Verdict` before any effect;
//  5. the broker's result is authoritative — only `persisted: true` is reported as success; any other
//     outcome (401/403, malformed response, timeout, unreachable broker) is a refusal carrying the
//     writer's guidance, never a forged "signed" success for a verdict that never persisted.
//
// LOCAL IDENTITY IS NOT LOCAL ADMIN: the operator `signer` is an explicit, already-resolved trusted
// local input (composed by the caller — e.g. the configured operator / git identity), never a signer
// taken from an untrusted request. This module opens no DB connection, imports no pg store, and never
// calls a hosted server module — it only builds the verdict and hands it to the injected
// `ForestWriter` (production: `createBrokerForestWriter` / `writeToForestBroker`).

import { Verdict } from "@storytree/proof-protocol";
import type { UatTestWitness } from "@storytree/library";
import { checkUatProof } from "@storytree/orchestrator";

import type { ForestWriter } from "./local-backend.js";

/** One declared UAT leg from the story's test context — only the fields the trust guard needs. */
export interface LocalUatDeclaredTest {
  id: string;
  witness: UatTestWitness;
}

/** Everything {@link attestLocalUat} needs, all injected — no global state, no hidden reads. */
export interface AttestLocalUatInput {
  /** The declared UAT test id being attested (e.g. `desktop#uat-1`). */
  testId: string;
  /** What the local human observed. */
  outcome: "pass" | "fail";
  /** Injected ISO sign time — keeps the compute deterministic and derives the verdict's `runId`. */
  at: string;
  /** The story's declared UAT test context (loaded by the caller). */
  tests: readonly LocalUatDeclaredTest[];
  /** The resolved local operator identity signing this attestation — never taken from a request. */
  signer: string;
  /** The running agent/session identity, when present (fed to the no-self-attest trust guard). */
  agentIdentity?: string;
  /** Optional free-text note, recorded as evidence when non-blank. */
  note?: string;
  /** The session repo's git state; the verdict pins this commit. */
  git: { commitSha: string; clean: boolean };
  /** The injected, brokered forest writer the built verdict is persisted through. */
  forestWriter: ForestWriter;
}

/** A signed, persisted `operator-attested` verdict, or a fail-closed refusal with the reason. */
export type AttestLocalUatResult =
  | { ok: true; verdict: Verdict }
  | { ok: false; reason: string };

const COMMIT_SHA_RE = /^[0-9a-f]{40}$/i;

/**
 * Turn a local human's observation of a declared UAT leg into a real, broker-persisted
 * `operator-attested` {@link Verdict}. See the module header for the full honesty-wall ordering.
 */
export async function attestLocalUat(input: AttestLocalUatInput): Promise<AttestLocalUatResult> {
  // 1a. The test id must be a real, well-formed id.
  const testId = input.testId.trim();
  if (testId.length === 0) {
    return {
      ok: false,
      reason: "blank test id — a local UAT attestation needs a real declared test id.",
    };
  }

  // 1b. The outcome must be one of the two real outcomes.
  const outcome = input.outcome;
  if (outcome !== "pass" && outcome !== "fail") {
    return {
      ok: false,
      reason: `invalid outcome "${String(outcome)}" — must be "pass" or "fail".`,
    };
  }

  // 1c. The declared test context must actually contain something to resolve a witness from.
  if (!Array.isArray(input.tests) || input.tests.length === 0) {
    return {
      ok: false,
      reason:
        "no declared UAT test context — an empty/absent context can never resolve a witness for a typo'd or unknown id.",
    };
  }

  // 1d. The test id must resolve against the declared context — a typo never mints a verdict.
  const test = input.tests.find((t) => t.id === testId);
  if (test === undefined) {
    return {
      ok: false,
      reason: `unknown test id "${testId}" — not among the declared UAT tests.`,
    };
  }

  // 2. The sign-time trust guard (ADR-0082 d.2 / ADR-0007 no-self-exempt): a machine-witness leg
  //    cannot be greened by a human click; a blank/`sandbox:`/agent-equal signer can never self-attest
  //    a human-witness (or `either`-resolved-human) leg.
  const signer = input.signer.trim();
  const guard = checkUatProof({
    witness: test.witness,
    verdict: { proofMode: "operator-attested", signer },
    ...(input.agentIdentity !== undefined ? { agentIdentity: input.agentIdentity } : {}),
  });
  if (!guard.ok) {
    return { ok: false, reason: guard.reason };
  }

  // 3. The git HEAD must be present, well-formed, and clean — a human cannot attest uncommitted bytes
  //    while pinning a different committed state.
  const commitSha = input.git.commitSha.trim();
  if (commitSha.length === 0) {
    return {
      ok: false,
      reason: "blank git commit SHA — a local attestation must pin a real commit.",
    };
  }
  if (!COMMIT_SHA_RE.test(commitSha)) {
    return {
      ok: false,
      reason: `malformed commit SHA "${commitSha}" — expected a 40-character hex commit SHA.`,
    };
  }
  if (!input.git.clean) {
    return {
      ok: false,
      reason:
        `the working tree is DIRTY at commit ${commitSha} — a human cannot attest uncommitted bytes ` +
        "while pinning a different committed state. Commit (or stash), then attest the clean commit.",
    };
  }

  // 4. Build the real verdict and validate it as a genuine proof-protocol Verdict before any effect.
  const runId = `local-uat-attest:${input.at}`;
  const note = input.note?.trim();
  const candidate: unknown = {
    unitId: test.id,
    proofMode: "operator-attested",
    outcome,
    commitSha,
    signer,
    runId,
    outputVersion: "v1",
    evidence: [
      {
        kind: "operator-attested",
        ref: signer,
        ...(note !== undefined && note.length > 0 ? { note } : {}),
      },
    ],
    at: input.at,
  };
  const parsed = Verdict.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `built verdict failed proof-protocol validation: ${parsed.error.message}`,
    };
  }
  const verdict = parsed.data;

  // 5. Persist through the injected, brokered writer — the broker's result is authoritative. Only
  //    `persisted: true` is ever reported as a signed success.
  const written = await input.forestWriter.write({ type: "verdict", payload: verdict });
  if (!written.persisted) {
    return { ok: false, reason: written.guidance };
  }

  return { ok: true, verdict };
}
