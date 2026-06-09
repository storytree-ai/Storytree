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

const HONEST_FRAMING_DRY =
  "honest framing: a dry-run proves the GLUE (spec → ProveSpec → gate → verdict → rollup), NOT the\n" +
  "node's actual proofs — the model is scripted and the red→green is synthetic in a temp workspace.\n" +
  "The node's authored status is untouched; the verdict landed in an in-memory store and is gone.";

const HONEST_FRAMING_LIVE =
  "honest framing: a live smoke proves the LIVE LOOP through the gate — a real Claude Agent SDK leaf\n" +
  "(ADR-0030, subscription-funded) genuinely authored the test and impl under hook-enforced write\n" +
  "scope, and the spine observed the genuine red→green those writes caused. The TASK is still the\n" +
  "synthetic add(2,3) pair in a temp workspace — the node's REAL proof command was not run (Phase F).\n" +
  "The node's authored status is untouched; the verdict landed in an in-memory store and is gone.";

/** The repo root, resolved from this file's location (packages/cli/src → four dirs up). */
function repoRoot(): string {
  return path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
}

export interface NodeBuildOpts {
  dryRun: boolean;
  /** `--live` — the ADR-0030 live smoke: a real Claude Agent SDK leaf authors through the gate. */
  live?: boolean;
  /** `--model` — the SDK leaf's model (live only). Default: claude-sonnet-4-6. */
  model?: string;
  /** `--budget` — per-authoring-slice USD ceiling, SDK-enforced (live only). Default: 1. */
  budgetUsd?: number;
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
      body: "node build needs an id: storytree node build <id> --dry-run | --live",
      next: registeredNodeIds().map((id) => `storytree node build ${id} --dry-run`),
    };
  }
  const live = opts.live === true;
  if (opts.dryRun === live) {
    return {
      ok: false,
      body:
        "pick exactly one mode:\n" +
        "  --dry-run   offline scripted walk (zero cost)\n" +
        "  --live      ADR-0030 live smoke: a real Claude Agent SDK leaf authors through the gate\n" +
        "              (subscription-funded; needs Claude Code auth / CLAUDE_CODE_OAUTH_TOKEN)",
      next: [
        `storytree node build ${unitId} --dry-run`,
        `storytree node build ${unitId} --live`,
      ],
    };
  }
  const mode = live ? "live-smoke" : "dry-run";

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

  // Smoke sandbox (both modes): a fresh temp workspace + a fresh InMemoryStore. The library store
  // the CLI was built with is deliberately NOT used — a smoke never touches shared state.
  const runId = `${mode}-${Date.now().toString(36)}`;
  const store = new InMemoryStore();
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-node-build-"));
  try {
    // The lifecycle mark a real build starts with — gives the rollup something real to project.
    await store.appendEvent(
      workEvent({ unitId: spec.id, event: "building", runId }, signer.signer),
    );

    const resolved = resolveProveSpec(
      spec,
      live
        ? {
            mode: "live-smoke",
            workspace,
            store,
            runId,
            signerInputs: { flag: signer.signer },
            ...(opts.model !== undefined ? { model: opts.model } : {}),
            ...(opts.budgetUsd !== undefined ? { maxBudgetUsd: opts.budgetUsd } : {}),
          }
        : { mode: "dry-run", workspace, store, runId, signerInputs: { flag: signer.signer } },
    );
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
      `node build ${spec.id} — ${mode.toUpperCase()}`,
      "",
      `spec:        ${rel(specFile)}`,
      `proof mode:  ${spec.proofMode} → ${resolved.spec.proofMode}`,
      `run:         ${runId}`,
      `signer:      ${signer.signer}`,
      ...(resolved.liveAuthor !== undefined
        ? [
            `leaf:        Claude Agent SDK (${resolved.liveAuthor.runs.map((r) => `${r.phase}: ${r.subtype}, ${r.turns} turns`).join("; ") || "no slices ran"})`,
            `cost:        $${resolved.liveAuthor.totalCostUsd.toFixed(4)} SDK-reported (subscription-billed)`,
            `scope walls: ${resolved.liveAuthor.violations.length === 0 ? "no write refusals" : resolved.liveAuthor.violations.map((v) => `${v.phase}:${v.path}`).join(", ")}`,
          ]
        : []),
      "",
      `phase trail: ${result.phasesVisited.join(" → ")}`,
    ];
    const framing = live ? HONEST_FRAMING_LIVE : HONEST_FRAMING_DRY;
    const modeFlag = live ? "--live" : "--dry-run";

    if (!result.ok) {
      return {
        ok: false,
        body: [
          ...header,
          `verdict:     NONE — failed closed at ${result.failedAt}: ${result.reason}`,
          `rollup:      ${derived ?? "(no derived status)"} (authored status stands: ${spec.status})`,
          "",
          framing,
        ].join("\n"),
        next: [`storytree node build ${spec.id} ${modeFlag}`],
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
        framing,
      ].join("\n"),
      next: [
        `storytree node build <id> ${modeFlag}   (any registered node)`,
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
      "  storytree node build <id> --live [--model <id>] [--budget <usd>] [--actor <email>]",
      "      the ADR-0030 live smoke: a REAL Claude Agent SDK leaf (subscription-funded) authors",
      "      the synthetic red→green pair through the gate under hook-enforced write scope.",
      "      Needs Claude Code auth (CLAUDE_CODE_OAUTH_TOKEN). Default budget: $1/slice.",
      "",
      `buildable (registered) nodes: ${registeredNodeIds().join(", ")}`,
    ].join("\n"),
    next: ["storytree node build library-cli --dry-run"],
  };
}
