import * as fs from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  InMemoryStore,
  resolveSignerFromEnv,
  rollupStatus,
  workEvent,
} from "@storytree/core";
import {
  findNodeSpecFile,
  loadNodeSpec,
  proveUnit,
  registeredNodeIds,
  resolveProveSpec,
} from "@storytree/orchestrator";
import type { NodeSpec } from "@storytree/orchestrator";

import type { Envelope } from "./envelope.js";

/**
 * `storytree node build <id> --dry-run` (drive-machinery Phase C): drive a REAL node spec through
 * the prove-it-gate end-to-end, offline. The walk is the prove-it-gate.e2e.test.ts wiring —
 * a scripted phase-aware model + real file writes + a real Node test run in a fresh temp
 * workspace — parameterized by the real spec (real id, real prompts, real proof mode), against an
 * InMemoryStore (NEVER the live library DB; nothing persists past the command).
 *
 * HONEST FRAMING (repeated in the envelope): a dry-run proves the GLUE — spec → ProveSpec → gate →
 * signed verdict → rollup — not the node's actual proofs. The model is scripted and the red→green
 * is synthetic. `--live` is gated on owner decisions (API key, budget — plan Phase 0/D).
 */

const HONEST_FRAMING =
  "honest framing: a dry-run proves the GLUE (spec → ProveSpec → gate → verdict → rollup), NOT the\n" +
  "node's actual proofs — the model is scripted and the red→green is synthetic in a temp workspace.\n" +
  "The node's authored status is untouched; the verdict landed in an in-memory store and is gone.";

/** The repo root, resolved from this file's location (packages/cli/src → four dirs up). */
function repoRoot(): string {
  return path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
}

export interface NodeBuildOpts {
  dryRun: boolean;
  /** `--actor` — the signer chain's flag tier (flag → STORYTREE_SIGNER → git email). */
  actor?: string;
  /** Injectable for tests; defaults to `<repoRoot>/stories`. */
  storiesDir?: string;
}

/** `storytree node build <id> --dry-run` — the full dry-run walk, returned as one envelope. */
export async function nodeBuild(
  unitId: string | undefined,
  opts: NodeBuildOpts,
): Promise<Envelope> {
  if (unitId === undefined) {
    return {
      ok: false,
      body: "node build needs an id: storytree node build <id> --dry-run",
      next: registeredNodeIds().map((id) => `storytree node build ${id} --dry-run`),
    };
  }
  if (!opts.dryRun) {
    return {
      ok: false,
      body:
        "only --dry-run is implemented: a live build spends API budget and is gated on owner\n" +
        "decisions (API-key source + per-node budget ceiling — plan §3 Phase 0/D).",
      next: [`storytree node build ${unitId} --dry-run`],
    };
  }

  // Fail-closed before any work: a verdict must be attributable (flag → env → git email).
  const signer = resolveSignerFromEnv(
    opts.actor !== undefined ? { flag: opts.actor } : {},
  );
  if (!signer.ok) {
    return {
      ok: false,
      body: `no signer resolved — a verdict must be attributable.\n${signer.error}`,
      next: [`storytree node build ${unitId} --dry-run --actor <email>`],
    };
  }

  const storiesDir = opts.storiesDir ?? path.join(repoRoot(), "stories");
  const specFile = findNodeSpecFile(storiesDir, unitId);
  if (specFile === null) {
    return {
      ok: false,
      body: `no node spec "${unitId}" under ${storiesDir} (looked for <story>/${unitId}.md and ${unitId}/story.md).`,
      next: registeredNodeIds().map((id) => `storytree node build ${id} --dry-run`),
    };
  }
  let spec: NodeSpec;
  try {
    spec = loadNodeSpec(specFile);
  } catch (e) {
    return {
      ok: false,
      body: `node spec ${specFile} failed to load:\n${(e as Error).message}`,
      next: ["storytree node build <id> --dry-run"],
    };
  }

  // Dry-run sandbox: a fresh temp workspace + a fresh InMemoryStore. The library store the CLI
  // was built with is deliberately NOT used — a dry-run never touches shared state.
  const runId = `dry-run-${Date.now().toString(36)}`;
  const store = new InMemoryStore();
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-node-build-"));
  try {
    // The lifecycle mark a real build starts with — gives the rollup something real to project.
    await store.appendEvent(
      workEvent({ unitId: spec.id, event: "building", runId }, signer.signer),
    );

    const resolved = resolveProveSpec(spec, {
      mode: "dry-run",
      workspace,
      store,
      runId,
      signerInputs: { flag: signer.signer },
    });
    if (!resolved.ok) {
      return {
        ok: false,
        body: `${resolved.reason}\n(spec loaded fine: ${rel(specFile)})`,
        next: resolved.registered.map((id) => `storytree node build ${id} --dry-run`),
      };
    }

    const result = await proveUnit(resolved.spec);
    const derived = rollupStatus(spec.id, await store.readEvents());
    const header = [
      `node build ${spec.id} — DRY-RUN`,
      "",
      `spec:        ${rel(specFile)}`,
      `proof mode:  ${spec.proofMode} → ${resolved.spec.proofMode}`,
      `run:         ${runId}`,
      `signer:      ${signer.signer}`,
      "",
      `phase trail: ${result.phasesVisited.join(" → ")}`,
    ];

    if (!result.ok) {
      return {
        ok: false,
        body: [
          ...header,
          `verdict:     NONE — failed closed at ${result.failedAt}: ${result.reason}`,
          `rollup:      ${derived ?? "(no derived status)"} (authored status stands: ${spec.status})`,
          "",
          HONEST_FRAMING,
        ].join("\n"),
        next: [`storytree node build ${spec.id} --dry-run`],
      };
    }

    return {
      ok: true,
      body: [
        ...header,
        `verdict:     ${result.verdict.outcome.toUpperCase()} — signed by ${result.verdict.signer} at ${result.verdict.at} (commit ${result.verdict.commitSha})`,
        `evidence:    ${result.verdict.evidence.map((e) => e.kind).join(", ")}`,
        `rollup:      ${derived} (derived from the event log: building → signed pass; authored status in the spec stays ${spec.status})`,
        "",
        HONEST_FRAMING,
      ].join("\n"),
      next: [
        "storytree node build <id> --dry-run   (any registered node)",
        `storytree library artifact ${spec.id}   (if it has a Library artifact)`,
      ],
    };
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

/** Repo-relative display path (forward slashes, stable across platforms). */
function rel(file: string): string {
  return path.relative(repoRoot(), file).replace(/\\/g, "/");
}

export function nodeHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree node — drive a node through the prove-it-gate (ADR-0020).",
      "",
      "  storytree node build <id> --dry-run [--actor <email>]",
      "      walk a real node spec through AUTHOR_TEST → … → GATE with a scripted model in a",
      "      temp workspace: zero API cost, no live DB. Proves the drive-machinery glue, not",
      "      the node's actual proofs.",
      "",
      `buildable (registered) nodes: ${registeredNodeIds().join(", ")}`,
    ].join("\n"),
    next: ["storytree node build library-cli --dry-run"],
  };
}
