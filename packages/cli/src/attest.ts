/**
 * `storytree attest` command (ADR-0044 `attestation-signals`, d.4 — the human relay path).
 *
 * The owner says "I saw test X work"; the agent scribes a SIGNED attestation for that
 * test id — `signer` = the operator who observed, `relayedBy` = the agent/session that
 * scribed. Honest provenance for "the owner vouched, the agent scribed". A machine path
 * (`--witness machine`) records an automated UAT run's signal.
 *
 * A vouch is NOT a proof: this writes `events.attestation` only, never `events.verdict`,
 * and never greens the story (ADR-0044 d.2/d.3). Returns an `Envelope` — testable
 * without a terminal, a store, or a real signing chain (all injected).
 *
 * DO NOT import from any organism's `/store` subpath — the seam keeps this module offline-testable.
 */

import type { UatTestCriterion } from "@storytree/library";
import type { Attestation, StoredAttestation } from "@storytree/proof-protocol";
import { resolveSignerFromEnv, type SignerResult } from "@storytree/orchestrator";

import type { Envelope } from "./envelope.js";
import type { SessionIdentity } from "@storytree/drive";

// ---------------------------------------------------------------------------
// Seams
// ---------------------------------------------------------------------------

export interface AttestationStoreLike {
  record(att: Attestation): Promise<Attestation>;
  history(testId: string): Promise<StoredAttestation[]>;
  /** All attestation rows for the tree view's per-test marks (attestation-surface). */
  readEvents(): Promise<ReadonlyArray<{ seq: number; doc: unknown }>>;
}

export interface AttestDeps {
  /** The live attestation store when --pg; null offline (writes/reads both need it). */
  store: AttestationStoreLike | null;
  /** Current Markdown-owned criteria for resolving the exact revision at write time. */
  loadUatTestCriteria: (storyId: string) => UatTestCriterion[];
  /** Session identity (the scribing agent) for `relayedBy`; null outside a worktree. */
  identity: SessionIdentity | null;
  /** Injectable signer resolver (flag → STORYTREE_SIGNER → git email); fail-closed. */
  resolveSigner: (flag?: string) => SignerResult;
  now: () => Date;
}

export interface AttestOpts {
  outcome?: string;
  witness?: string;
  signer?: string;
  relayedBy?: string;
  note?: string;
}

export interface AttestInvocation {
  mode: "record" | "list";
  testId: string | undefined;
  /** Required for record because an opaque criterion id does not encode its owning story. */
  storyId?: string | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function needsPg(verb: string): Envelope {
  return {
    ok: false,
    body: `attest ${verb} needs the live store (--pg). Bring the DB up and retry with --pg.`,
    next: ["pnpm db:up", "storytree attest <story-id> <uatc_id> --outcome pass --witness human --pg"],
  };
}

export function attestHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree attest — record a per-UAT-test attestation (ADR-0044): a SIGNED vouch that a",
      "human or a machine saw a specific test work. A vouch is NOT a gate verdict — it lives in",
      "events.attestation, never events.verdict, and never greens the story.",
      "",
      "  storytree attest <story-id> <uatc_id> [flags] --pg   record an exact-revision attestation",
      "  storytree attest list <stored-key> --pg             show current or preserved legacy history",
      "",
      "flags:",
      "  --outcome pass|fail     what was observed            (default pass)",
      "  --witness human|machine who witnessed                (default human)",
      "  --signer <id>           the operator who observed    (else STORYTREE_SIGNER / git email)",
      "  --relayed-by <id>       the agent that scribed        (default: this session)",
      "  --note <text>           free-text note",
      "",
      "current criterion ids come from Markdown: storytree tree <story> --pg.",
      "Legacy <story>#uat-<n> keys are readable history only; new attestations require an opaque id.",
    ].join("\n"),
    next: ["storytree tree <story> --pg"],
  };
}

// ---------------------------------------------------------------------------
// attestCommand
// ---------------------------------------------------------------------------

export async function attestCommand(
  inv: AttestInvocation,
  opts: AttestOpts,
  deps: AttestDeps,
): Promise<Envelope> {
  const { mode, testId, storyId } = inv;

  // -- list --------------------------------------------------------------------
  if (mode === "list") {
    if (deps.store === null) return needsPg("list");
    if (testId === undefined || testId.trim().length === 0) {
      return {
        ok: false,
        body: "attest list needs a stored key: storytree attest list <uatc_id-or-legacy-key> --pg",
        next: ["storytree tree <story> --pg"],
      };
    }
    const history = await deps.store.history(testId);
    if (history.length === 0) {
      return {
        ok: true,
        body: `No attestations recorded for "${testId}" yet.`,
        next: ["storytree witness list <story-id> --pg"],
      };
    }
    const lines = [`Attestations for "${testId}" (${history.length}, oldest first):`];
    for (const a of history) {
      const relay = a.relayedBy !== undefined ? `  relayedBy=${a.relayedBy}` : "";
      const note = a.note !== undefined ? `  — ${a.note}` : "";
      lines.push(`  [${a.witness}] ${a.outcome}  signer=${a.signer}  ${a.at}${relay}${note}`);
    }
    return { ok: true, body: lines.join("\n"), next: ["storytree tree <story-id> --pg"] };
  }

  // -- record ------------------------------------------------------------------
  if (deps.store === null) return needsPg("record");
  if (
    storyId === undefined ||
    storyId.trim().length === 0 ||
    testId === undefined ||
    testId.trim().length === 0
  ) {
    return {
      ok: false,
      body: "attest needs a story id and criterion id: storytree attest <story-id> <uatc_id> --outcome pass --witness human --pg",
      next: ["storytree tree <story> --pg"],
    };
  }
  const story = storyId.trim();
  const criterionId = testId.trim();
  const criterion = deps
    .loadUatTestCriteria(story)
    .find((candidate) => candidate.criterionId === criterionId);
  if (criterion === undefined) {
    return {
      ok: false,
      body: `no current UAT criterion "${criterionId}" in story "${story}"; refusing to bind a new attestation by position or migration history.`,
      next: [`storytree witness list ${story} --pg`],
    };
  }

  const outcome = opts.outcome ?? "pass";
  if (outcome !== "pass" && outcome !== "fail") {
    return { ok: false, body: `--outcome must be pass|fail (got "${outcome}").`, next: [] };
  }
  const witness = opts.witness ?? "human";
  if (witness !== "human" && witness !== "machine") {
    return { ok: false, body: `--witness must be human|machine (got "${witness}").`, next: [] };
  }

  // Fail-closed: a vouch must be attributed. The operator who observed is the signer.
  const resolved = deps.resolveSigner(opts.signer);
  if (!resolved.ok) {
    return {
      ok: false,
      body:
        `${resolved.error}\nName the operator who observed: --signer <email> (or set git user.email / STORYTREE_SIGNER).`,
      next: [`storytree attest ${story} ${criterionId} --outcome ${outcome} --witness ${witness} --signer <email> --pg`],
    };
  }

  // relayedBy = the agent that SCRIBED a relayed HUMAN attestation (ADR-0044 d.4) — explicit flag
  // wins, else this session (honest "owner vouched, agent scribed"). A MACHINE signal's signer IS
  // the runner, so it carries no relay unless one is passed explicitly.
  const relayedBy = witness === "human" ? (opts.relayedBy ?? deps.identity?.sessionId) : opts.relayedBy;

  const doc: Attestation = {
    testId: criterion.criterionId,
    criterionId: criterion.criterionId,
    revisionId: criterion.revisionId,
    outcome,
    witness,
    signer: resolved.signer,
    at: deps.now().toISOString(),
  };
  if (opts.note !== undefined) doc.note = opts.note;
  if (relayedBy !== undefined) doc.relayedBy = relayedBy;

  const saved = await deps.store.record(doc);
  const signerRole = saved.witness === "human" ? "the operator who observed" : "the machine runner";
  const lines = [
    `Recorded a ${saved.witness} attestation for "${saved.testId}".`,
    `  outcome:    ${saved.outcome}`,
    `  witness:    ${saved.witness}`,
    `  signer:     ${saved.signer}   (${signerRole})`,
  ];
  if (saved.relayedBy !== undefined) lines.push(`  relayedBy:  ${saved.relayedBy}   (the agent that scribed)`);
  if (saved.note !== undefined) lines.push(`  note:       ${saved.note}`);
  lines.push(
    "",
    "This is a VOUCH, not a gate verdict — it lives in events.attestation (never events.verdict)",
    "and does not green the story (ADR-0044 d.2/d.3).",
  );
  return {
    ok: true,
    body: lines.join("\n"),
    next: [`storytree attest list ${saved.testId} --pg`, `storytree tree ${story} --pg`],
  };
}
